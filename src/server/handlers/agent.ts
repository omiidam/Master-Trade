/**
 * Agent chat handler.
 *
 * Thin by design: validate (the pipeline already did), call the agent service,
 * shape the response. The reply carries its epistemic label and the model that
 * produced it, so the client can never present model text as a tool result.
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

export interface AgentChatResponseData {
  reply: string;
  epistemicKind: string;
  correlationId: string;
  status: 'completed' | 'blocked';
  agentState: string;
  model: string;
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

const NO_CHARGE_NOTE =
  'This turn cost nothing: a refused or blocked turn is never charged, and the credit held for it was returned in full.';

export function agentChatHandler(
  service: AgentService,
  bus?: EventBus,
  decide?:
    | ((userId: string, analysisType: string) => Promise<AnalysisReadinessDecision | null>)
    | undefined,
  metering?: AgentMetering | undefined,
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
     * Run the turn. Everything about what a turn *is* lives in here, so the metered and
     * unmetered paths cannot diverge: both call this, and the difference between them is
     * only whether the result was charged.
     */
    const runTurn = async (): Promise<AgentTurn> => {
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
          };
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
        return turn;
      }

      if (body.analysisType !== undefined) {
        const principal = context.principal;
        const readiness =
          decide === undefined || principal === null
            ? null
            : await decide(principal.id, body.analysisType);
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
        return turn;
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
      return turn;
    };

    const respond = (
      turn: AgentTurn,
      usage: AgentChatResponseData['usage'],
    ): { data: AgentChatResponseData } => ({
      data: {
        reply: turn.reply,
        epistemicKind: turn.epistemicKind,
        correlationId: context.correlationId,
        status: turn.status,
        agentState: turn.agentState,
        model: turn.model,
        toolResultCount: turn.toolResultCount,
        statements: turn.statements,
        note: OFFLINE_NOTE,
        ...(body.responseLanguage === undefined ? {} : { responseLanguage: body.responseLanguage }),
        ...(body.responseStyle === undefined ? {} : { responseStyle: body.responseStyle }),
        ...(turn.readiness === undefined ? {} : { readiness: turn.readiness }),
        ...(turn.capability === undefined ? {} : { capability: turn.capability }),
        ...(usage === undefined ? {} : { usage }),
      },
    });

    if (metering === undefined) return respond(await runTurn(), undefined);

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
        const turn = await runTurn();
        // A turn that produced a refusal, or that the gate blocked, did not deliver what
        // the credit pays for — so it is not charged.
        return { charge: turn.status === 'completed', value: turn };
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
      return respond(refused, null);
    }

    context.logger.info(
      'metered agent turn completed',
      {
        userId: principal.id,
        featureId: metering.featureId,
        status: outcome.value.status,
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
