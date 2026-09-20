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
import { defaultToolRegistry } from '../tools/index.js';
import type { ToolRegistry } from '../tools/framework.js';
import {
  DEFAULT_SAFETY_PROFILE,
  type EpistemicKind,
  type ModelStatement,
  type SafetyProfile,
} from '../types.js';
import {
  Orchestrator,
  scriptedModelAdapter,
  type ModelAdapter,
  type ToolExecution,
} from './orchestrator.js';
import type { AsyncModelAdapter } from './asyncModel.js';
import type { ContextSection } from './context.js';
import type { StructuredSummary } from '../llm/summary.js';

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
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd: number;
  } | null;
  latencyMs: number | null;
  reason?: string;
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
    options: { correlationId?: string; context?: readonly ContextSection[] } = {},
  ): Promise<AgentAsyncTurn> {
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
    };
  }

  /** Run one turn. Never throws for a refused request: that is a `blocked` turn. */
  run(message: string): AgentTurn {
    const outcome = this.orchestrator.run(message);
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
