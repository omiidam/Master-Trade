/**
 * Agent chat handler.
 *
 * Thin by design: validate (the pipeline already did), call the agent service,
 * shape the response. The reply carries its epistemic label and the model that
 * produced it, so the client can never present model text as a tool result.
 *
 * **Every response leaves through the centralized Response Pipeline** (Phase
 * 2.11, `src/agent/responsePipeline.ts`): between the turn's execution and the
 * payload this handler shapes, the pipeline normalizes the result, validates
 * it, policy-checks it for leaked internals, handles uncertainty and formats
 * the final text. The handler renders whatever the pipeline decided — the
 * reply, the epistemic label and the statements come from its result, and its
 * kind and validation status ride along as metadata — so a blocked, failed or
 * incomplete turn can never be shaped here into a successful-looking answer.
 *
 * **The turn is metered, and the order of the two gates is the whole design.** A turn is
 * refused before it runs when the account may not afford it (a plan without the feature, a
 * spent allowance, a per-period cap), and that refusal *is* the reply: no model is
 * consulted, so there is nothing to argue with. When the turn does run, the credit is held
 * for the duration and kept only if the turn completed — a blocked turn costs nothing, and
 * this handler does not have to remember that, because `meter()` releases on any outcome
 * that is not chargeable, including a thrown error.
 *
 * The idempotency key is the caller's, echoed back. A retry that sends the same key
 * resolves to the first attempt and is charged once; a request without one is its own
 * attempt, which is stated in the response note rather than left to be discovered.
 */

import type { AgentChatBody } from '../../../packages/shared/src/api/schemas.js';
import type { ResponseLanguage } from '../../../packages/shared/src/types.js';
import type { ResponseStyle } from '../../../packages/shared/src/language/guidance.js';
import type { AgentAsyncTurn, AgentService, AgentTurn } from '../../agent/service.js';
import type { AgentRunManager } from '../../agent/runManager.js';
import {
  responsePipelineInputFromLoop,
  responsePipelineInputFromTurn,
  runResponsePipeline,
  type ResponseKind,
  type ResponsePipelineResult,
} from '../../agent/responsePipeline.js';
import { validateChatMessage, type ChatPolicyDecision } from '../../agent/chatPolicy.js';
import type { AgentLoopResult, AgentLoopStopReason } from '../../agent/agentLoop.js';
import type { AnalysisReadinessDecision } from '../../../packages/shared/src/quality/readiness.js';
import {
  planCapabilityRun,
  resultFromPlan,
  type CapabilityRunPlan,
} from '../../../packages/shared/src/capabilities/orchestration.js';
import { resolveCapability } from '../../../packages/shared/src/capabilities/registry.js';
import type { CapabilityResult } from '../../../packages/shared/src/capabilities/model.js';
import { authorize, type Principal } from '../../../packages/shared/src/auth/model.js';
import { defaultToolRegistry } from '../../../packages/trading-engine/src/index.js';
import type { EntitlementDecision } from '../../../packages/shared/src/usage/entitlements.js';
import type { EventBus } from '../../../packages/shared/src/realtime/events.js';
import type { Logger } from '../../../packages/shared/src/core/logging.js';
import { AppError } from '../../../packages/shared/src/core/errors.js';
import type { UsageService } from '../../usage/service.js';
import type { RouteHandler } from '../context.js';

/**
 * Which path a chat turn actually took, reported to the surface (Phase 2.13-B):
 * `LLM_GATEWAY` when the turn ran through the Agent Loop's harness adapter into
 * the LLM Gateway, `LOCAL_RESPONSE` when it was answered on this machine
 * without consulting a hosted model. The names mirror Needle 3's decision-router
 * taxonomy (DEC-AI-23) because they mean the same things — but this value is
 * written by this handler about a turn that already ran; the router stays
 * unwired to the runtime.
 */
export type AgentChatRoute = 'LLM_GATEWAY' | 'LOCAL_RESPONSE';

export interface AgentChatResponseData {
  reply: string;
  epistemicKind: string;
  correlationId: string;
  status: 'completed' | 'blocked';
  agentState: string;
  model: string;
  /** The execution path this turn took — see `AgentChatRoute`. */
  route: AgentChatRoute;
  toolResultCount: number;
  statements: AgentTurn['statements'];
  note: string;
  /**
   * The quality gate's verdict, present only when the request named an analysis type.
   *
   * Sent even when the turn succeeded: a `READY_WITH_LIMITATIONS` decision carries
   * limitations the answer must be read against.
   */
  readiness?: AgentAsyncTurn['readiness'];
  /**
   * The structured capability result, present only when the request named a capability.
   *
   * Rendered as data, never parsed out of the reply: the state, the calculations, the
   * limitations and the next actions are all fields, so a client shows what the server decided
   * rather than reading prose to guess at it.
   */
  capability?: CapabilityResult | null;
  /**
   * The language the answer was asked to be written in, echoed back.
   *
   * Present only when the caller resolved and supplied one. It is echoed rather than derived because the
   * server did not decide it and cannot: the signals behind it are the caller's, and a client that shows
   * "answered in Persian" has to be showing what it asked for.
   */
  responseLanguage?: ResponseLanguage;
  /**
   * The style the answer was asked to be worded in, echoed back (Phase 7.5.3.4.2).
   *
   * Echoed for the same reason the language is: the server did not resolve it, and a client that shows
   * "answered concisely" has to be showing what it asked for rather than what it hoped.
   */
  responseStyle?: ResponseStyle;
  /** What the turn cost, and why. Absent only when the server does not meter turns. */
  usage?: {
    operationKey: string;
    credits: number;
    charged: boolean;
    balance: number;
    replay: boolean;
    note: string;
  } | null;
  /**
   * What the centralized Response Pipeline decided, with the metadata it
   * preserved (Phase 2.11): the outcome kind (completed / clarification /
   * blocked / failed / unavailable-data), the run this response answers,
   * the stop-reason *code* and the validation status with its stage-tagged
   * violation codes.
   *
   * The stop reason's free-text message and every other internal detail stay
   * server-side — only structured, safe-to-show forms travel here.
   */
  responsePipeline?: {
    kind: ResponseKind;
    runId: string;
    stopReason: string | null;
    validation: { status: 'passed' | 'failed' | 'skipped'; violations: readonly string[] };
  };
  /**
   * The tracked run this response answers, as the Run Manager recorded it
   * (Phase 2.13): run id, lifecycle status, start time and completion.
   *
   * The states are the Run Manager's own vocabulary — `idle → running →
   * responding → completed` (or `blocked` / `failed` / `cancelled`) — which is
   * exactly what the Workplace renders; the surface may label `running` as
   * REASONING, but the server reports what the record says rather than a label.
   * Present whenever the turn was tracked (an authenticated request always is).
   */
  run?: {
    runId: string;
    state: string;
    startedAt: string;
    endedAt: string | null;
    durationMs: number | null;
  };
}

export interface AgentMetering {
  service: UsageService;
  /** The declared feature a conversation turn consumes. */
  featureId: string;
  /** The declared cost per turn, so the response reports the number it was charged. */
  credits: number;
}

const OFFLINE_NOTE =
  'Answered by the offline deterministic adapter. No hosted model provider is configured in this phase.';

/**
 * How this turn was answered, in the server's words. The route decides it: a
 * gateway turn names the path its answer travelled; a local turn states that no
 * hosted model was consulted — and only the offline adapter claims *that* when
 * one is genuinely unconfigured. A live deployment's policy refusal or
 * deterministic answer is "local", not "offline", and the note must not say
 * otherwise.
 */
function chatNoteFor(route: AgentChatRoute, model: string, liveGateway: boolean): string {
  if (route === 'LLM_GATEWAY') {
    return `Answered through the Agent Loop and the LLM Gateway by ${model}.`;
  }
  return liveGateway
    ? 'Answered locally — no hosted model was consulted for this turn.'
    : OFFLINE_NOTE;
}

const NO_CHARGE_NOTE =
  'This turn cost nothing: a refused or blocked turn is never charged, and the credit held for it was returned in full.';

export function agentChatHandler(
  service: AgentService,
  bus?: EventBus,
  decide?:
    | ((userId: string, analysisType: string) => Promise<AnalysisReadinessDecision | null>)
    | undefined,
  metering?: AgentMetering | undefined,
  /**
   * The run manager, when the server tracks conversation turns as agent
   * runs. Each turn becomes a run whose state the AI Workplace follows in
   * real time; without it the turn runs exactly as before.
   */
  runs?: AgentRunManager | undefined,
): RouteHandler<AgentChatBody, AgentChatResponseData> {
  /*
   * The deterministic engines this process actually holds, asked of the registry rather than
   * assumed. A capability whose engine is not registered here is refused at the plan's
   * validation stage, which is the honest answer: the arithmetic it declares is not available in
   * this deployment, and producing the answer without it would be producing it from prose.
   */
  const registeredEngines = [
    ...new Set(
      defaultToolRegistry()
        .list()
        .flatMap((tool) => tool.descriptor.capabilities as readonly string[]),
    ),
  ];

  /**
   * Resolve one capability's entitlement, or `null` when there is no metering to resolve against.
   *
   * `status()` computes every declared feature's decision from the stored plan, the subscription
   * status and the role table's own answers, so this reads the server's answer rather than
   * forming a second one. A capability with no declared feature needs none: it is not metered, and
   * asking about a feature that does not exist would be a refusal manufactured out of nothing.
   */
  const entitlementOf = async (
    featureId: string | null,
    principal: Principal | null,
  ): Promise<EntitlementDecision | null> => {
    if (featureId === null) return null;
    if (metering === undefined || principal === null) return null;
    try {
      const status = await metering.service.status(principal);
      return status.features.find((entry) => entry.feature.id === featureId)?.decision ?? null;
    } catch {
      // A store that cannot be read yields no entitlement, which the plan treats as a refusal.
      // Falling back to "allowed" would be the one way a capability could run unmetered.
      return null;
    }
  };

  return async ({ context, body }) => {
    /*
     * Phase 2.13 — the alpha chat path, decided once per request.
     *
     * `loop` is non-null exactly when the full pipeline must run: a live gateway
     * was configured (so the Run Manager holds the harness adapter and the
     * service holds the async model), the caller is authenticated (a run belongs
     * to someone), and the request is a plain chat turn. In that mode the turn
     * executes through Run Manager → Agent Loop → Harness → adapter → gateway,
     * and the run the loop creates *is* this request's tracked run. Everything
     * else — capability plans, gated analyses, offline deployments — executes
     * exactly as it did before this phase.
     */
    const loop =
      runs !== undefined &&
      context.principal !== null &&
      runs.hasHarness() &&
      service.hasAsyncReasoning() &&
      body.capabilityId === undefined &&
      body.analysisType === undefined
        ? { manager: runs, userId: context.principal.id }
        : null;

    /*
     * The pre-LLM policy hook (Phase 2.13): the smallest possible answer to
     * "should this message reach the model at all?" — closed patterns, no
     * engine, and it runs immediately before the model would be consulted in
     * each branch below. A refusal is shaped into the same blocked turn every
     * other gate produces, so tracking, metering and the bus treat it alike.
     */
    const policyTurn = (decision: Extract<ChatPolicyDecision, { allowed: false }>): AgentTurn => ({
      status: 'blocked',
      reply: decision.reply,
      epistemicKind: 'uncertainty',
      statements: [],
      toolResultCount: 0,
      agentState: service.state(),
      model: service.modelLabel(),
      reason: decision.reply,
      ...(body.responseLanguage === undefined ? {} : { responseLanguage: body.responseLanguage }),
      ...(body.responseStyle === undefined ? {} : { responseStyle: body.responseStyle }),
    });

    /*
     * Run the turn. Everything about what a turn *is* lives in here, so the metered and
     * unmetered paths cannot diverge: both call this, and the difference between them is
     * only whether the result was charged.
     *
     * The returned `runId` is set only when the execution created its own tracked
     * run (the loop path); an `undefined` runId means the caller tracks the turn.
     * The loop path also carries the pipeline's own decision on its result, so
     * the response ships the very decision that shaped the turn rather than a
     * second pass over the turn's reduced view (which would lose the loop's
     * stop reason and re-decide from less input). Every path also names the
     * route it took (`AgentChatRoute`), decided here where the path is chosen
     * rather than inferred afterwards from the turn's shape.
     */
    const runTurn = async (): Promise<{
      turn: AgentTurn;
      runId?: string;
      response?: ResponsePipelineResult;
      route: AgentChatRoute;
    }> => {
      /*
       * A request that names an analysis is gated before anything answers it.
       *
       * The gate needs the stored context, which is a read the agent layer cannot do, so
       * the decision is made here — and the *service* refuses on a refusal, so the
       * ordering guarantee does not depend on this handler remembering to check.
       *
       * A gate that cannot be evaluated yields `null`, which the service refuses too. A
       * server with no store must not answer an analysis request as though it had gated
       * it; that would make "the model never sees what the gate refused" false on exactly
       * the deployments least able to afford it.
       */
      /*
       * A request that names a **capability** goes through the registry first (Phase 5.7).
       *
       * The declared order is applied here and nowhere else: resolution (deny-by-default, plus
       * whether a model may ask for it at all), validation (does this deployment hold the engine
       * it binds), the gate for the analysis type it declares, the role table's answer for **its
       * own** operation, and its entitlement. Only then is a model consulted — and on a refusal it
       * is not consulted at all, because there is no inference to argue with.
       *
       * The engine stage is not a second call: the deterministic tool runs *inside* the turn, on
       * the orchestrator's permission-checked tool path, which is the only route allowed to
       * compute a figure. This plan's job is to prove that route exists before the model is asked
       * to use it.
       */
      if (body.capabilityId !== undefined) {
        const principal = context.principal;
        const declared = resolveCapability(body.capabilityId);
        const analysisType = declared?.analysisType ?? null;
        const gatedReadiness =
          analysisType === null || decide === undefined || principal === null
            ? null
            : await decide(principal.id, analysisType);
        const entitlement = await entitlementOf(declared?.feature ?? null, principal);
        // The **request's own clock**, not `Date.now()`: the pipeline judged this request against
        // `context.startedAt`, and a session that was active for the pipeline must not be expired
        // a millisecond later by a second reading of the clock. One request, one instant.
        const permissionGranted =
          declared?.operation === null || declared?.operation === undefined
            ? true
            : principal !== null &&
              authorize(principal, declared.operation, context.startedAt).allowed;

        const plan: CapabilityRunPlan = planCapabilityRun({
          capabilityId: body.capabilityId,
          requester: 'user',
          readiness: gatedReadiness,
          permissionGranted,
          entitlement,
          registeredEngineCapabilities: registeredEngines,
        });
        const capability = resultFromPlan(plan);

        context.logger.info(
          'capability resolved for an agent turn',
          {
            capabilityId: plan.requestedId,
            resolved: plan.capability !== null,
            state: plan.state,
            outcome: plan.outcome,
            stoppedAt: plan.stoppedAt,
            code: plan.refusals[0]?.code ?? null,
            analysisType,
            readiness: gatedReadiness?.readiness ?? null,
            decidedBy: plan.decidedBy,
            engineConsulted: plan.outcome === 'run',
          },
          'capability.resolve',
        );

        if (plan.outcome === 'refuse') {
          // The refusal *is* the reply, in the shape the service already speaks for a blocked
          // turn, with the structured result attached so the surface can render the stage, the
          // reasons and the next actions without parsing the sentence.
          return {
            turn: {
              status: 'blocked',
              reply: plan.refusals[0]?.reason ?? 'The capability was refused.',
              epistemicKind: 'uncertainty',
              reason: plan.refusals[0]?.reason ?? 'The capability was refused.',
              statements: [],
              toolResultCount: 0,
              agentState: service.state(),
              model: 'none',
              readiness: gatedReadiness,
              capability,
              // A refusal is a complete result, so it echoes the language too: no model was consulted, and
              // the answer the caller asked for is the answer they did not get.
              ...(body.responseLanguage === undefined
                ? {}
                : { responseLanguage: body.responseLanguage }),
              ...(body.responseStyle === undefined ? {} : { responseStyle: body.responseStyle }),
            },
            route: 'LOCAL_RESPONSE',
          };
        }

        // The plan permits the turn; the policy hook still speaks before the model does.
        const capabilityPolicy = validateChatMessage(body.message);
        if (!capabilityPolicy.allowed) {
          return { turn: policyTurn(capabilityPolicy), route: 'LOCAL_RESPONSE' };
        }

        const turn = service.run(body.message, {
          readiness: gatedReadiness,
          capability,
          ...(body.responseLanguage === undefined
            ? {}
            : { responseLanguage: body.responseLanguage }),
          ...(body.responseStyle === undefined ? {} : { responseStyle: body.responseStyle }),
        });
        context.logger.info(
          'capability turn completed',
          {
            status: turn.status,
            capabilityId: plan.requestedId,
            state: plan.state,
            readiness: turn.readiness?.readiness ?? null,
            toolResultCount: turn.toolResultCount,
          },
          'agent.turn.capability',
        );
        // The capability plan runs the deterministic engine inside the turn;
        // no hosted model is consulted on this path.
        return { turn, route: 'LOCAL_RESPONSE' };
      }

      if (body.analysisType !== undefined) {
        const principal = context.principal;
        const readiness =
          decide === undefined || principal === null
            ? null
            : await decide(principal.id, body.analysisType);
        const analysisPolicy = validateChatMessage(body.message);
        if (!analysisPolicy.allowed) {
          return { turn: policyTurn(analysisPolicy), route: 'LOCAL_RESPONSE' };
        }
        const turn = service.run(body.message, {
          readiness,
          ...(body.responseLanguage === undefined
            ? {}
            : { responseLanguage: body.responseLanguage }),
          ...(body.responseStyle === undefined ? {} : { responseStyle: body.responseStyle }),
        });
        context.logger.info(
          'gated agent turn completed',
          {
            status: turn.status,
            analysisType: body.analysisType,
            readiness: turn.readiness?.readiness ?? null,
            classification: turn.readiness?.classification ?? null,
            decidedBy: turn.readiness?.decidedBy ?? null,
            engineConsulted: turn.status === 'completed',
          },
          'agent.turn.gated',
        );
        return { turn, route: 'LOCAL_RESPONSE' };
      }

      // Plain chat — the alpha path. Policy first, then the full pipeline when it
      // is wired, then the offline single step exactly as before.
      const plainPolicy = validateChatMessage(body.message);
      if (!plainPolicy.allowed) {
        context.logger.info(
          'chat policy refused a turn before the LLM',
          { rule: plainPolicy.rule, kind: plainPolicy.kind },
          'agent.turn.policy',
        );
        const turn = policyTurn(plainPolicy);
        if (bus !== undefined) {
          publishTurn(bus, turn, context.correlationId, context.logger);
        }
        return { turn, route: 'LOCAL_RESPONSE' };
      }

      if (loop !== null) {
        // User → agent.chat → Agent Loop → Harness → adapter → gateway → response.
        // runLoop creates, tracks and settles the run itself, so nothing wraps it
        // in a second record; the response pipeline turns its settled result into
        // the user-facing answer and its five honest outcome kinds.
        const loopResult = await loop.manager.runLoop({
          correlationId: context.correlationId,
          userId: loop.userId,
          userInput: body.message,
          instructions: service.renderedInstructions(),
          ...(body.responseLanguage === undefined
            ? {}
            : { responseLanguage: body.responseLanguage }),
          ...(body.responseStyle === undefined ? {} : { responseStyle: body.responseStyle }),
        });
        const mapped = loopTurnFrom(loopResult);
        context.logger.info(
          'agent loop turn completed',
          {
            status: mapped.turn.status,
            runId: mapped.runId,
            stopReason: loopResult.stopReason.reason,
            iterations: loopResult.iterations,
          },
          'agent.turn.loop',
        );
        if (bus !== undefined) {
          publishTurn(bus, mapped.turn, context.correlationId, context.logger);
        }
        // The loop ran against the live gateway — even when the provider
        // refused it, the answer (or the honest failure) travelled this path.
        return {
          turn: mapped.turn,
          runId: mapped.runId,
          response: mapped.response,
          route: 'LLM_GATEWAY',
        };
      }

      const turn = service.run(body.message, {
        ...(body.responseLanguage === undefined ? {} : { responseLanguage: body.responseLanguage }),
        ...(body.responseStyle === undefined ? {} : { responseStyle: body.responseStyle }),
      });
      context.logger.info(
        'agent turn completed',
        {
          status: turn.status,
          epistemicKind: turn.epistemicKind,
          toolResultCount: turn.toolResultCount,
          agentState: turn.agentState,
        },
        'agent.turn.completed',
      );
      // The turn is announced on the bus so other views of the workstation see the
      // same answer, with the same epistemic labels the HTTP response carries.
      if (bus !== undefined) {
        publishTurn(bus, turn, context.correlationId, context.logger);
      }
      return { turn, route: 'LOCAL_RESPONSE' };
    };

    /*
     * Map a settled loop result onto the turn shape this handler speaks, through
     * the Response Pipeline (Phase 2.11's loop seam): the reply, the epistemic
     * label and the honesty rule come from the pipeline's decision — only a
     * completed run gets statements and `status: 'completed'` — while the run's
     * own record supplies the state. The stop reason travels as its machine
     * code; the free-text message stays in pipeline metadata, never in the
     * user-facing `reason`.
     */
    const loopTurnFrom = (
      loopResult: AgentLoopResult & { runId: string },
    ): { turn: AgentTurn; runId: string; response: ResponsePipelineResult } => {
      const response = runResponsePipeline(responsePipelineInputFromLoop(loopResult));
      const completed = response.kind === 'completed';
      let state = completed ? 'completed' : 'blocked';
      if (loop !== null) {
        try {
          state = loop.manager.getRun(loopResult.runId, loop.userId).state;
        } catch {
          state = completed ? 'completed' : 'blocked';
        }
      }
      const turn: AgentTurn = {
        status: completed ? 'completed' : 'blocked',
        reply: response.reply,
        epistemicKind: response.epistemicKind,
        statements: [...response.statements],
        toolResultCount: loopResult.toolRuns.length,
        agentState: state,
        model: service.modelLabel(),
        ...(completed ? {} : { reason: loopStopCode(loopResult.stopReason) }),
      };
      return { turn, runId: loopResult.runId, response };
    };

    /*
     * The loop's stop reason as the turn's machine code: the discriminator
     * only (`iteration-limit`, `tool-failure`, …). The free-text `message`
     * fields stay in pipeline metadata — an error string can carry anything,
     * and `reason` travels to the surface.
     */
    const loopStopCode = (stopReason: AgentLoopStopReason): string => stopReason.reason;

    const respond = (
      outcome: {
        turn: AgentTurn;
        runId: string;
        response?: ResponsePipelineResult;
        route: AgentChatRoute;
      },
      usage: AgentChatResponseData['usage'],
    ): { data: AgentChatResponseData } => {
      const { turn } = outcome;
      // The one place a response is finalized: five stages, five kinds,
      // metadata preserved. Everything this handler ships about the answer
      // itself (reply, label, statements, status) is the pipeline's
      // decision, not a re-derivation — which is what makes a withheld or
      // incomplete turn impossible to shape into a success here. The loop
      // path passes that decision through (it was made on the full loop
      // result); every other path finalizes the turn here, once.
      const response =
        outcome.response ?? runResponsePipeline(responsePipelineInputFromTurn(outcome.runId, turn));
      // The run this answer belongs to, read back from the Run Manager so the
      // surface renders the record rather than a reconstruction of it. An
      // untracked turn (no principal, no manager, a borrowed correlation id)
      // has no record and simply omits the field.
      const principal = context.principal;
      const record =
        runs === undefined || principal === null
          ? null
          : (() => {
              try {
                return runs.getRun(outcome.runId, principal.id);
              } catch {
                return null;
              }
            })();
      return {
        data: {
          reply: response.reply,
          epistemicKind: response.epistemicKind,
          correlationId: context.correlationId,
          status: response.kind === 'completed' ? 'completed' : 'blocked',
          agentState: turn.agentState,
          model: turn.model,
          toolResultCount: turn.toolResultCount,
          statements: [...response.statements],
          route: outcome.route,
          note: chatNoteFor(outcome.route, turn.model, service.hasAsyncReasoning()),
          responsePipeline: {
            kind: response.kind,
            runId: response.metadata.runId,
            stopReason: response.metadata.stopReason?.reason ?? null,
            validation: {
              status: response.metadata.validation.status,
              violations: [...response.metadata.validation.violations],
            },
          },
          ...(body.responseLanguage === undefined
            ? {}
            : { responseLanguage: body.responseLanguage }),
          ...(body.responseStyle === undefined ? {} : { responseStyle: body.responseStyle }),
          ...(turn.readiness === undefined ? {} : { readiness: turn.readiness }),
          ...(turn.capability === undefined ? {} : { capability: turn.capability }),
          ...(usage === undefined ? {} : { usage }),
          ...(record === null
            ? {}
            : {
                run: {
                  runId: record.runId,
                  state: record.state,
                  startedAt: record.startedAt,
                  endedAt: record.endedAt,
                  durationMs: record.durationMs,
                },
              }),
        },
      };
    };

    /*
     * One conversation turn, one agent run. The run exists from before the
     * turn starts to its terminal state, so the Workplace can watch it in
     * real time; a blocked turn is a terminal `blocked` run, a refusal is
     * not a missing run. Unattributed requests (no principal) are not
     * tracked, because a run belongs to someone.
     */
    const runTrackedTurn = async (): Promise<{
      turn: AgentTurn;
      runId: string;
      response?: ResponsePipelineResult;
      route: AgentChatRoute;
    }> => {
      const principal = context.principal;
      // An untracked turn has no run id of its own; the correlation id is
      // the identity it answers under, so the pipeline's metadata is never
      // empty and never borrowed from another run.
      if (runs === undefined || principal === null) {
        const outcome = await runTurn();
        return { ...outcome, runId: outcome.runId ?? context.correlationId };
      }

      // When the loop runs the turn, `runLoop` created the run before the turn
      // started and settled it after — that record *is* this request's tracked
      // run, and wrapping it in a second one would double-track a single turn.
      if (loop !== null) {
        const outcome = await runTurn();
        if (outcome.runId !== undefined) {
          return { ...outcome, runId: outcome.runId };
        }
        // The loop never ran (the policy hook refused first): the refusal is
        // still a tracked run, minted and settled here as a blocked one.
        const run = runs.createRun({
          userId: loop.userId,
          correlationId: context.correlationId,
          model: service.modelLabel(),
        });
        runs.start(run.runId, loop.userId);
        runs.block(
          run.runId,
          loop.userId,
          outcome.turn.reason ?? 'the turn was blocked before the loop ran',
        );
        return {
          turn: outcome.turn,
          runId: run.runId,
          route: outcome.route,
          ...(outcome.response === undefined ? {} : { response: outcome.response }),
        };
      }

      const run = runs.createRun({
        userId: principal.id,
        correlationId: context.correlationId,
        model: service.modelLabel(),
      });
      runs.start(run.runId, principal.id);
      try {
        const outcome = await runTurn();
        const { turn } = outcome;
        if (turn.status === 'completed') {
          runs.transition(run.runId, principal.id, 'responding');
          runs.complete(run.runId, principal.id);
        } else {
          runs.block(run.runId, principal.id, turn.reason ?? 'the turn was blocked');
        }
        return {
          turn,
          runId: run.runId,
          route: outcome.route,
          ...(outcome.response === undefined ? {} : { response: outcome.response }),
        };
      } catch (error) {
        runs.fail(run.runId, principal.id, error instanceof Error ? error.message : String(error));
        throw error;
      }
    };

    if (metering === undefined) return respond(await runTrackedTurn(), undefined);

    const principal = context.principal;
    if (principal === null) {
      throw new AppError('UNAUTHENTICATED', 'A conversation turn belongs to an account.');
    }

    const outcome = await metering.service.meter(
      {
        userId: principal.id,
        featureId: metering.featureId,
        // The caller's key when it has one, so a retry is recognised. Without one, this
        // request's own correlation id is the attempt's identity: it is unique per
        // request, so nothing is charged twice, and a *retry* is a new request with a new
        // id — which is exactly why the response asks a retrying client to send a key.
        operationKey: body.idempotencyKey ?? `turn:${context.correlationId}`,
        // The pipeline reached this handler only because the principal holds
        // `agent.chat`. Passing that through rather than re-deriving it is what keeps
        // this layer from being a second, weaker permission system.
        permissionGranted: true,
        correlationId: context.correlationId,
        actor: principal.id,
      },
      async () => {
        const tracked = await runTrackedTurn();
        // A turn that produced a refusal, or that the gate blocked, did not deliver what
        // the credit pays for — so it is not charged.
        return { charge: tracked.turn.status === 'completed', value: tracked };
      },
    );

    if (!outcome.allowed) {
      // The refusal is the reply. `model: 'none'` is not decoration: it is the fact that
      // no engine was consulted, and the client renders it as such.
      context.logger.info(
        'refused a metered turn',
        {
          userId: principal.id,
          featureId: metering.featureId,
          denial: outcome.decision.denial,
          plan: outcome.decision.plan?.id ?? null,
          balance: 0,
          charged: false,
        },
        'usage.turn.refused',
      );
      // A refusal is a blocked turn in the shape the rest of the system already speaks:
      // the same epistemic label a gate-blocked turn carries, no statements, and no model
      // named. It is deliberately *not* a new status — a client that renders a blocked
      // turn correctly renders this one correctly too.
      const refused: AgentTurn = {
        status: 'blocked',
        reply: outcome.decision.reason,
        epistemicKind: 'uncertainty',
        reason: outcome.decision.reason,
        statements: [],
        toolResultCount: 0,
        agentState: 'idle',
        model: 'none',
      };
      if (bus !== undefined) {
        publishTurn(bus, refused, context.correlationId, context.logger);
      }
      // Nothing was consulted — not the engine, not the model — so the turn is
      // reported as the local answer it is, whatever the deployment is configured with.
      return respond(
        { turn: refused, runId: context.correlationId, route: 'LOCAL_RESPONSE' },
        null,
      );
    }

    context.logger.info(
      'metered agent turn completed',
      {
        userId: principal.id,
        featureId: metering.featureId,
        status: outcome.value.turn.status,
        charged: outcome.settled,
        replay: outcome.reservation.replay,
      },
      'usage.turn.metered',
    );

    return respond(outcome.value, {
      operationKey: outcome.reservation.operationKey,
      credits: outcome.settled ? outcome.reservation.credits : 0,
      charged: outcome.settled,
      balance: outcome.reservation.balanceAfter,
      replay: outcome.reservation.replay,
      note: outcome.settled
        ? 'One credit was held for this turn before it ran and kept because it completed.'
        : NO_CHARGE_NOTE,
    });
  };
}

/**
 * Publish an agent answer as an event.
 *
 * The source is `agent` (never `tool`, even when tools ran): the statement is the
 * model's, and the tool results it cites are named in `sources`. Chain-of-thought
 * has no field here — the event carries the same structured statements the API
 * returns, which is what the output contract already guarantees.
 */
function publishTurn(bus: EventBus, turn: AgentTurn, correlationId: string, logger: Logger): void {
  try {
    bus.publish({
      type: 'agent.message',
      source: { kind: 'agent', id: turn.model },
      correlationId,
      payload: {
        conversationId: `conv_${correlationId.slice(-24)}`,
        state: turn.agentState,
        statements: turn.statements.map((statement) => ({
          kind: statement.kind,
          text: statement.text.slice(0, 2_000),
          sources: [...statement.sources].slice(0, 20),
        })),
        uncertainty:
          turn.status === 'blocked' && turn.reason !== undefined
            ? [turn.reason.slice(0, 2_000)]
            : [],
      },
    });
  } catch (error) {
    // The answer is already on its way to the caller; a refused event is a
    // contract drift that must be loud, not a failed request.
    logger.error(
      'refused to publish an agent message event',
      { message: (error as Error).message },
      'realtime.publish.refused',
    );
  }
}
