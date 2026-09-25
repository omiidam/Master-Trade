/**
 * Agent service — the backend entry point for one agent turn.
 *
 * It composes the Phase 1 pieces (orchestrator, lifecycle, tools, instructions,
 * memory) and nothing else: no HTTP types, no provider SDK, no risk math. The API
 * layer calls `run()` and maps the result to a response.
 *
 * The default model is the deterministic **scripted** adapter, so the service is
 * fully exercisable offline with no key and no network. A hosted provider is
 * registered with the LLM gateway later (ADR-0019) and would enter here as a
 * different `ModelAdapter` — the permission and provenance behaviour does not
 * change, because tool execution remains the orchestrator's job.
 */

import {
  loadInstructions,
  renderInstructions,
  type InstructionSet,
} from '../instructions/loader.js';
import { InMemoryStore, type MemoryStore } from '../memory/store.js';
import { defaultToolRegistry } from '../../packages/trading-engine/src/index.js';
import type { ToolRegistry } from '../../packages/trading-engine/src/framework.js';
import {
  DEFAULT_SAFETY_PROFILE,
  type EpistemicKind,
  type ModelStatement,
  type ResponseLanguage,
  type SafetyProfile,
} from '../../packages/shared/src/types.js';
import {
  Orchestrator,
  scriptedModelAdapter,
  type ModelAdapter,
  type ToolExecution,
} from './orchestrator.js';
import type { AsyncModelAdapter } from './asyncModel.js';
import type { ContextSection } from './context.js';
import type { StructuredSummary } from '../llm/summary.js';
import type { AnalysisReadinessDecision } from '../../packages/shared/src/quality/readiness.js';
import type { CapabilityResult } from '../../packages/shared/src/capabilities/model.js';

export interface AgentStatementView {
  kind: EpistemicKind;
  text: string;
  sources: readonly string[];
}

export interface AgentTurn {
  status: 'completed' | 'blocked';
  reply: string;
  epistemicKind: EpistemicKind;
  statements: AgentStatementView[];
  toolResultCount: number;
  agentState: string;
  model: string;
  reason?: string;
  /** The gate's verdict, when the request named an analysis. */
  readiness?: AnalysisReadinessDecision | null;
  /**
   * The structured capability result, when the request named a capability (Phase 5.7).
   *
   * Attached on both outcomes because a refusal is a complete result: it carries the state, the
   * stage that stopped it and what would change the answer, in the same shape a completed one
   * carries. A client needs no error path of its own.
   */
  capability?: CapabilityResult | null;
}

/**
 * Why a turn may not run, or `null` when it may.
 *
 * One function so both paths refuse for exactly the same reason, with the same words,
 * and so a change to the rule cannot be applied to one of them.
 *
 * Three conditions refuse: the inputs are unsuitable (`BLOCKED`), the capability is
 * declared but not implemented, or there is no decision at all — the last because a
 * server that cannot evaluate the gate must not answer an analysis request as if it
 * had.
 */
export function refusalFor(readiness: AnalysisReadinessDecision | null): string | null {
  if (readiness === null) {
    return 'This request names an analysis, and no readiness decision was supplied for it. An analysis request is not answered without the deterministic gate having run.';
  }
  if (readiness.capability === 'planned') {
    return `"${readiness.analysisType}" is a declared capability that is not implemented yet. The inputs were assessed; no analysis is produced.`;
  }
  if (readiness.readiness === 'BLOCKED') {
    const reasons =
      readiness.limitations.length > 0
        ? readiness.limitations.join(' ')
        : 'The declared inputs do not support this analysis.';
    return `The analysis was not produced. ${reasons}`;
  }
  if (readiness.readiness === 'REQUIRES_CLARIFICATION') {
    const questions = readiness.clarifications.map((question) => question.question);
    return `The analysis was not produced, because it would rest on inputs that are not there. ${questions.join(' ')}`;
  }
  return null;
}

export interface AgentServiceOptions {
  model?: ModelAdapter;
  /**
   * Reasoning component for the async path: an LLM behind the gateway
   * (`createLlmModelAdapter`) or the deterministic offline stand-in. When it is
   * absent, `runAsync()` reports a blocked turn instead of inventing an answer.
   */
  asyncModel?: AsyncModelAdapter;
  modelLabel?: string;
  tools?: ToolRegistry;
  instructions?: InstructionSet;
  memory?: MemoryStore;
  safety?: SafetyProfile;
}

/** One agent turn produced with an LLM, as the API layer and UI consume it. */
export interface AgentAsyncTurn {
  status: 'completed' | 'blocked';
  reply: string;
  epistemicKind: EpistemicKind;
  statements: AgentStatementView[];
  summary: StructuredSummary | null;
  toolExecutions: ToolExecution[];
  provider: string | null;
  model: string;
  agentState: string;
  /**
   * The gate's verdict, when the request named an analysis type.
   *
   * Attached even when the turn was permitted: a `READY_WITH_LIMITATIONS` decision has
   * limitations the answer must carry, and dropping them because the turn succeeded
   * would be the same dishonesty as not gating at all.
   */
  readiness?: AnalysisReadinessDecision | null;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd: number;
  } | null;
  latencyMs: number | null;
  reason?: string;
  /** The structured capability result, when the request named a capability (Phase 5.7). */
  capability?: CapabilityResult | null;
}

/**
 * One label for a set of statements: a single statement keeps its own label;
 * a mixed answer is labelled `analysis`, never upgraded to `fact`.
 */
function dominantKind(statements: readonly ModelStatement[]): EpistemicKind {
  const first = statements[0];
  if (!first) return 'uncertainty';
  const kinds = new Set(statements.map((statement) => statement.kind));
  return kinds.size === 1 ? first.kind : 'analysis';
}

export class AgentService {
  private readonly orchestrator: Orchestrator;
  private readonly instructions: InstructionSet;
  private readonly model: string;
  private readonly toolCount: number;
  private readonly asyncModel: AsyncModelAdapter | undefined;

  constructor(options: AgentServiceOptions = {}) {
    this.instructions = options.instructions ?? loadInstructions();
    this.asyncModel = options.asyncModel;
    this.model =
      options.modelLabel ?? options.asyncModel?.label ?? 'scripted-v1 (offline, deterministic)';
    const tools = options.tools ?? defaultToolRegistry();
    this.toolCount = tools.list().length;
    this.orchestrator = new Orchestrator({
      tools,
      instructions: this.instructions,
      memory: options.memory ?? new InMemoryStore(),
      safety: options.safety ?? DEFAULT_SAFETY_PROFILE,
      model: options.model ?? scriptedModelAdapter,
      ...(options.asyncModel ? { asyncModel: options.asyncModel } : {}),
    });
  }

  /**
   * One turn with a real provider. Never throws for a refused or failed turn:
   * a blocked turn carries the reason the orchestrator recorded.
   */
  async runAsync(
    message: string,
    options: {
      correlationId?: string;
      context?: readonly ContextSection[];
      /**
       * The gate's verdict, when the request named an analysis.
       *
       * `undefined` means no analysis was requested, so there is nothing to gate and
       * behaviour is exactly what it was before this gate existed. `null` means an
       * analysis *was* requested and no decision could be produced, which is a refusal.
       */
      readiness?: AnalysisReadinessDecision | null;
      /** The structured capability result, echoed back on both outcomes. */
      capability?: CapabilityResult | null;
      /**
       * The language the answer is owed in, resolved by the caller that holds the signals.
       *
       * A wording instruction and nothing more: it reaches the prompt and stops there, so a refusal, a
       * gated turn and a tool execution are all exactly what they were without it.
       */
      responseLanguage?: ResponseLanguage;
    } = {},
  ): Promise<AgentAsyncTurn> {
    const refusal = options.readiness === undefined ? null : refusalFor(options.readiness);
    if (refusal !== null) {
      // The model is not consulted, so there is nothing for it to override. That is the
      // whole rule: "the LLM cannot override deterministic validation" holds because on a
      // refusal there is no inference to argue with.
      return {
        status: 'blocked',
        reply: refusal,
        epistemicKind: 'uncertainty',
        statements: [],
        summary: null,
        toolExecutions: [],
        provider: null,
        model: this.model,
        agentState: this.orchestrator.state(),
        usage: null,
        latencyMs: null,
        reason: refusal,
        readiness: options.readiness ?? null,
        capability: options.capability ?? null,
      };
    }

    const readiness = options.readiness ?? null;
    const outcome = await this.orchestrator.runAsync(message, options);
    if (outcome.status === 'blocked') {
      return {
        status: 'blocked',
        reply: outcome.reason,
        epistemicKind: 'uncertainty',
        statements: [],
        summary: null,
        toolExecutions: [],
        provider: null,
        model: this.model,
        agentState: this.orchestrator.state(),
        usage: null,
        latencyMs: null,
        reason: outcome.reason,
        readiness,
        capability: options.capability ?? null,
      };
    }
    const statements: AgentStatementView[] = outcome.statements.map((statement) => ({
      kind: statement.kind,
      text: statement.text,
      sources: statement.sources,
    }));
    return {
      status: 'completed',
      reply: statements.map((statement) => statement.text).join(' '),
      epistemicKind: dominantKind(outcome.statements),
      statements,
      summary: outcome.summary,
      toolExecutions: outcome.toolExecutions,
      provider: outcome.provider,
      model: outcome.model,
      agentState: this.orchestrator.state(),
      usage: outcome.usage,
      latencyMs: outcome.latencyMs,
      readiness,
      capability: options.capability ?? null,
    };
  }

  /** Run one turn. Never throws for a refused request: that is a `blocked` turn. */
  run(
    message: string,
    options: {
      readiness?: AnalysisReadinessDecision | null;
      /** The structured capability result, echoed back on both outcomes. */
      capability?: CapabilityResult | null;
      /** The language the answer is owed in, resolved by the caller that holds the signals. */
      responseLanguage?: ResponseLanguage;
    } = {},
  ): AgentTurn {
    const refusal = options.readiness === undefined ? null : refusalFor(options.readiness);
    if (refusal !== null) {
      return {
        status: 'blocked',
        reply: refusal,
        epistemicKind: 'uncertainty',
        statements: [],
        toolResultCount: 0,
        agentState: this.orchestrator.state(),
        model: this.model,
        reason: refusal,
        readiness: options.readiness ?? null,
        capability: options.capability ?? null,
      };
    }

    const readiness = options.readiness ?? null;
    const outcome = this.orchestrator.run(message, {
      ...(options.responseLanguage === undefined
        ? {}
        : { responseLanguage: options.responseLanguage }),
    });
    if (outcome.status === 'blocked') {
      return {
        status: 'blocked',
        reply: outcome.reason,
        epistemicKind: 'uncertainty',
        statements: [],
        toolResultCount: 0,
        agentState: this.orchestrator.state(),
        model: this.model,
        reason: outcome.reason,
        readiness,
        capability: options.capability ?? null,
      };
    }
    const statements: AgentStatementView[] = outcome.statements.map((statement) => ({
      kind: statement.kind,
      text: statement.text,
      sources: statement.sources,
    }));
    return {
      status: 'completed',
      reply: statements.map((statement) => statement.text).join(' '),
      epistemicKind: dominantKind(outcome.statements),
      statements,
      toolResultCount: outcome.toolResults.length,
      agentState: this.orchestrator.state(),
      model: this.model,
      // Attached on the permitted path too. A `READY_WITH_LIMITATIONS` verdict carries
      // limitations the answer has to be read against, and dropping them because the turn
      // succeeded is the same dishonesty as not gating at all — which is exactly what the
      // sync path did before this line existed.
      readiness,
      capability: options.capability ?? null,
    };
  }

  state(): string {
    return this.orchestrator.state();
  }

  modelLabel(): string {
    return this.model;
  }

  /** Version-stamped instructions, for audit and diagnostics. */
  instructionsSummary(): string {
    return renderInstructions(this.instructions).slice(0, 400);
  }

  describe(): { model: string; tools: number; instructions: { id: string; version: string }[] } {
    return {
      model: this.model,
      tools: this.toolCount,
      instructions: this.instructions.modules.map((module) => ({
        id: module.id,
        version: module.version,
      })),
    };
  }
}
