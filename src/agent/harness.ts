/**
 * Agent Run Harness — the lifecycle owner for one agent run.
 *
 * A run is a bounded, isolated execution: the harness assembles what
 * the model sees (system instructions, chat history, user prompt,
 * relevant runtime context) into an **ephemeral Working Memory**,
 * drives the turn through the existing `AsyncModelAdapter` — the same
 * real LLM Gateway path the product already uses — and returns a
 * typed outcome. When the run ends, however it ends, the working
 * memory is discarded.
 *
 * What this module deliberately does **not** do, per Task 1.3:
 *
 *   - no persistent memory (nothing survives `dispose()` except what
 *     the caller explicitly takes from the run result);
 *   - no RAG / vector retrieval (runtime context is supplied by the
 *     caller, or a pluggable `RuntimeContextSource`);
 *   - no tool calling (the adapter may return `toolRequests`; the
 *     harness records them in the outcome and nothing more);
 *   - no evaluation, no learning loop, no mock LLM behavior.
 *
 * The seams for those systems are named and left empty:
 * `HarnessRuntimeHooks` lets the later Memory, Reasoning, Evaluation
 * and Learning phases observe every state transition and every
 * assembled artifact without this module growing their behavior.
 *
 * Three invariants, matching the discipline of ADR-0058/0059:
 *
 *   1. **Runs are isolated.** Two runs share nothing: separate
 *      working memory, separate history copy, separate correlation
 *      id. Nothing a run writes is readable by another run.
 *   2. **The gateway stays real.** The harness composes the existing
 *      `AsyncModelAdapter` over the existing `LlmGateway`; it never
 *      speaks to a provider itself and never fabricates an answer.
 *   3. **Every run terminates in a terminal state.** `completed`,
 *      `failed` or `cancelled` — a run cannot be left hanging, and
 *      failure paths dispose the working memory exactly like success.
 */

import type { ContextSection } from './context.js';
import { estimateTokens, type ContextBudget } from './context.js';
import { AgentContextBuilder, type ContextAssembly } from './contextBuilder.js';
import type { AsyncModelAdapter, ModelTurn, ToolRequest } from './asyncModel.js';
import type { ResponseStyle } from '../../packages/shared/src/language/guidance.js';
import type { ResponseLanguage } from '../../packages/shared/src/types.js';

// ── Working memory — ephemeral, per-run ────────────────────────────────────

/** One entry in the run's ephemeral chat history. */
export interface WorkingMemoryEntry {
  role: 'user' | 'assistant';
  content: string;
  at: string;
  /** Approximate token cost, so the memory can be budgeted. */
  tokens: number;
}

/**
 * Context RAM for one run. Ephemeral by construction: it exists only
 * inside the run, holds only this run's history and runtime context,
 * and is discarded when the run terminates. It has no persistence, no
 * cross-run visibility and no eviction policy beyond the token cap —
 * a longer conversation belongs to persistent memory, a future phase.
 */
export class WorkingMemory {
  /** Hard ceiling; assembly refuses to exceed it. */
  readonly maxTokens: number;
  private readonly entries: WorkingMemoryEntry[] = [];
  private disposed = false;

  constructor(maxTokens = 6_000) {
    this.maxTokens = maxTokens;
  }

  get history(): readonly WorkingMemoryEntry[] {
    this.assertLive();
    return [...this.entries];
  }

  get usedTokens(): number {
    this.assertLive();
    return this.entries.reduce((sum, entry) => sum + entry.tokens, 0);
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  /** Record the user's prompt for this turn. */
  recordUser(content: string, at = new Date().toISOString()): void {
    this.assertLive();
    this.entries.push({ role: 'user', content, at, tokens: estimateTokens(content) });
  }

  /** Record the model's answer for this turn. */
  recordAssistant(content: string, at = new Date().toISOString()): void {
    this.assertLive();
    this.entries.push({ role: 'assistant', content, at, tokens: estimateTokens(content) });
  }

  /** Terminate the memory. Idempotent; every later read or write throws. */
  dispose(): void {
    this.entries.length = 0;
    this.disposed = true;
  }

  private assertLive(): void {
    if (this.disposed) {
      throw new Error('WorkingMemory was disposed; it is ephemeral and cannot be reused');
    }
  }
}

// ── Run lifecycle states ───────────────────────────────────────────────────

/**
 * The run lifecycle, finer-grained than the product's `AgentState`
 * because a run owns assembly and disposal as explicit phases:
 *
 *   PENDING → ASSEMBLING → CALLING_MODEL → RESPONDING → COMPLETED
 *                  \            \              \→ FAILED
 *                   \            \→ FAILED
 *                    \→ FAILED
 *   Any state → CANCELLED (cooperative cancel before a terminal state)
 */
export type AgentRunState =
  'pending' | 'assembling' | 'calling-model' | 'responding' | 'completed' | 'failed' | 'cancelled';

const RUN_TRANSITIONS: Record<AgentRunState, readonly AgentRunState[]> = {
  pending: ['assembling', 'cancelled'],
  assembling: ['calling-model', 'failed', 'cancelled'],
  'calling-model': ['responding', 'failed', 'cancelled'],
  responding: ['completed', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
};

/** Machine-checked lifecycle: an illegal transition is a bug, thrown loudly. */
export class AgentRunLifecycle {
  private state: AgentRunState = 'pending';
  private readonly history: { state: AgentRunState; at: string }[] = [
    { state: 'pending', at: new Date().toISOString() },
  ];

  current(): AgentRunState {
    return this.state;
  }

  transitions(): readonly { state: AgentRunState; at: string }[] {
    return [...this.history];
  }

  isTerminal(): boolean {
    return RUN_TRANSITIONS[this.state].length === 0;
  }

  transitionTo(next: AgentRunState): void {
    const allowed = RUN_TRANSITIONS[this.state];
    if (!allowed.includes(next)) {
      throw new Error(`Illegal run lifecycle transition: ${this.state} -> ${next}`);
    }
    this.state = next;
    this.history.push({ state: next, at: new Date().toISOString() });
  }
}

// ── Input contracts ────────────────────────────────────────────────────────

/** Chat history the caller brings into the run. Copied on admission. */
export interface HarnessHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentRunInput {
  /** Correlation id for the whole run; threaded to the gateway for audit. */
  correlationId: string;
  /**
   * Opaque authenticated-user identifier, set by the caller that
   * already checked the principal. Attribution only — never a
   * `Principal`, never a credential (ADR-0058 discipline).
   */
  userId?: string;
  userInput: string;
  /** Prior conversation turns; copied, never referenced in place. */
  history?: readonly HarnessHistoryTurn[];
  /** System instructions; assembled first and never dropped. */
  instructions: string;
  /**
   * Relevant runtime context for this run (market data, portfolio
   * state, tools output). Supplied by the caller — the harness does
   * no retrieval of its own (no RAG in this phase).
   */
  runtimeContext?: readonly ContextSection[];
  responseLanguage?: ResponseLanguage;
  responseStyle?: ResponseStyle;
  /**
   * Token budget for assembled context (default: the context module's).
   * The builder's optional layer caps ride along, so a run can bound the
   * conversation and runtime layers independently of the total.
   */
  budget?: ContextBudget & {
    maxRuntimeTokens?: number;
    maxConversationTokens?: number;
  };
  /** Hard cap on the ephemeral working memory, in tokens. */
  maxMemoryTokens?: number;
}

// ── Output contracts ───────────────────────────────────────────────────────

/** The assembled prompt artifacts a run produced. Observability, not state. */
export interface HarnessAssembly {
  systemInstructions: string;
  /** Chat history as the model sees it, oldest first. */
  history: readonly WorkingMemoryEntry[];
  userPrompt: string;
  /** Runtime context kept under the budget, instructions always first. */
  contextSections: readonly ContextSection[];
  /** Context dropped to fit the budget, with the reason. */
  dropped: readonly string[];
  estimatedTokens: number;
}

/** Why the run ended the way it did. */
export interface AgentRunFailure {
  /** Lifecycle phase the failure surfaced in. */
  phase: Exclude<AgentRunState, 'pending' | 'completed' | 'failed' | 'cancelled'>;
  message: string;
}

export interface AgentRunResult {
  runId: string;
  correlationId: string;
  status: 'completed' | 'failed' | 'cancelled';
  /** The turn the real adapter/gateway produced. Present when completed. */
  turn?: ModelTurn;
  /** Tool calls the model *requested*. Recorded, never executed here. */
  toolRequests: readonly ToolRequest[];
  /** Present when failed. */
  failure?: AgentRunFailure;
  /** What the model saw. Present when the run reached assembly. */
  assembly?: HarnessAssembly;
  /** Lifecycle trace: every state the run passed through, with times. */
  timeline: readonly { state: AgentRunState; at: string }[];
  /** Wall-clock duration of the run, in milliseconds. */
  durationMs: number;
}

// ── Extension surface for later phases ─────────────────────────────────────

/**
 * Hooks the later Memory, Reasoning, Evaluation and Learning systems
 * will implement. All optional, all observational: a hook can read
 * what the harness produced and it can *cancel*, but it cannot
 * rewrite the assembly or answer in place — the gateway stays real
 * and the contracts stay between the same three parties.
 */
export interface HarnessRuntimeHooks {
  /** Called after assembly, before the model call. Throw to fail the run. */
  beforeModelCall?(input: AgentRunInput, assembly: HarnessAssembly): Promise<void>;
  /** Called after a completed turn, before the run terminates. */
  afterTurn?(turn: ModelTurn, memory: WorkingMemory): Promise<void>;
  /** Called on failure, with the phase that failed. */
  onRunFailure?(failure: AgentRunFailure, memory: WorkingMemory | undefined): Promise<void>;
  /**
   * Cooperative cancellation check, polled between phases. Return
   * true to cancel; a cancelled run terminates in `cancelled` and
   * disposes its memory like any other terminal state.
   */
  shouldCancel?(): boolean;
}

// ── The harness ────────────────────────────────────────────────────────────

export interface AgentHarnessOptions {
  /** The real reasoning path: an AsyncModelAdapter over the LLM Gateway. */
  adapter: AsyncModelAdapter;
  /**
   * The centralized Context Builder. Defaults to the shared stateless
   * instance: assembly is pure, so one instance serves every run, and no
   * run's assembly can leak into another's.
   */
  contextBuilder?: AgentContextBuilder;
  /** Observational hooks for later phases. */
  hooks?: HarnessRuntimeHooks;
}

let harnessRunCounter = 0;

export class AgentRunHarness {
  private readonly adapter: AsyncModelAdapter;
  private readonly contextBuilder: AgentContextBuilder;
  private readonly hooks: HarnessRuntimeHooks | undefined;

  constructor(options: AgentHarnessOptions) {
    this.adapter = options.adapter;
    this.contextBuilder = options.contextBuilder ?? new AgentContextBuilder();
    this.hooks = options.hooks;
  }

  /**
   * Run one bounded, isolated agent run.
   *
   * Contract shape: the harness owns the lifecycle and the ephemeral
   * memory; the centralized Context Builder owns assembly (layers,
   * budgets, dedup, pre-request size validation); the LLM Gateway is
   * reached only through the caller-supplied `AsyncModelAdapter`.
   * Whatever happens, the run ends in exactly one terminal state and the
   * working memory is disposed.
   */
  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const startedAt = Date.now();
    const runId = `run-${++harnessRunCounter}`;
    const lifecycle = new AgentRunLifecycle();
    let memory: WorkingMemory | undefined;
    let assembly: HarnessAssembly | undefined;
    let turn: ModelTurn | undefined;
    let failure: AgentRunFailure | undefined;

    const finish = (status: AgentRunResult['status']): AgentRunResult => ({
      runId,
      correlationId: input.correlationId,
      status,
      ...(turn !== undefined ? { turn } : {}),
      toolRequests: turn?.toolRequests ?? [],
      ...(failure !== undefined ? { failure } : {}),
      ...(assembly !== undefined ? { assembly } : {}),
      timeline: lifecycle.transitions(),
      durationMs: Date.now() - startedAt,
    });

    try {
      // 1. Assemble — build the ephemeral working memory and the prompt.
      lifecycle.transitionTo('assembling');
      memory = new WorkingMemory(input.maxMemoryTokens ?? 6_000);
      // History first, the current prompt last: memory reads oldest-first.
      for (const turnEntry of input.history ?? []) {
        if (turnEntry.role === 'user') memory.recordUser(turnEntry.content);
        else memory.recordAssistant(turnEntry.content);
      }
      memory.recordUser(input.userInput);
      const assembled = this.assemble(input, memory);
      assembly = {
        systemInstructions: input.instructions,
        history: memory.history,
        userPrompt: assembled.userInput,
        contextSections: assembled.sections,
        dropped: assembled.dropped.map((entry) => entry.id),
        estimatedTokens: assembled.totalTokens,
      };
      if (this.hooks?.shouldCancel?.()) {
        lifecycle.transitionTo('cancelled');
        return finish('cancelled');
      }

      // 2. Call the model — the real gateway path, through the adapter.
      lifecycle.transitionTo('calling-model');
      await this.hooks?.beforeModelCall?.(input, assembly);
      if (this.hooks?.shouldCancel?.()) {
        lifecycle.transitionTo('cancelled');
        return finish('cancelled');
      }

      turn = await this.adapter.completeTurn({
        correlationId: input.correlationId,
        ...(input.userId === undefined ? {} : { userId: input.userId }),
        userInput: input.userInput,
        instructions: assembly.systemInstructions,
        context: assembly.contextSections,
        ...(input.responseLanguage === undefined
          ? {}
          : { responseLanguage: input.responseLanguage }),
        ...(input.responseStyle === undefined ? {} : { responseStyle: input.responseStyle }),
      });

      // 3. Respond — record the answer into this run's memory only.
      lifecycle.transitionTo('responding');
      memory.recordAssistant(turn.summary.statements.map((statement) => statement.text).join('\n'));
      await this.hooks?.afterTurn?.(turn, memory);
      if (this.hooks?.shouldCancel?.()) {
        lifecycle.transitionTo('cancelled');
        return finish('cancelled');
      }

      lifecycle.transitionTo('completed');
      return finish('completed');
    } catch (error) {
      const phase = failurePhaseFor(lifecycle.current());
      failure = { phase, message: error instanceof Error ? error.message : String(error) };
      try {
        lifecycle.transitionTo('failed');
      } catch {
        // `pending` cannot transition to `failed`; that state only exists
        // before `run()` body starts, so this is unreachable here.
      }
      await this.hooks?.onRunFailure?.(failure, memory);
      return finish('failed');
    } finally {
      // Ephemeral by construction: every terminal path disposes.
      memory?.dispose();
    }
  }

  /**
   * Assembly is delegated to the centralized Context Builder: five
   * separated layers (system instructions, agent policies, runtime,
   * conversation, user input), configurable budgets, duplication removed
   * and the total validated against the budget before the model is
   * called. The conversation section carries the *prior* turns only — the
   * current question travels once, in the user-input layer, instead of
   * being repeated inside the chat history it also sits at the end of.
   */
  private assemble(input: AgentRunInput, memory: WorkingMemory): ContextAssembly {
    return this.contextBuilder.assemble({
      correlationId: input.correlationId,
      ...(input.userId === undefined ? {} : { userId: input.userId }),
      instructions: input.instructions,
      userInput: input.userInput,
      conversationHistory: input.history ?? [],
      runtimeContext: input.runtimeContext ?? [],
      ...(input.budget === undefined
        ? {}
        : {
            budget: {
              maxContextTokens: input.budget.maxTokens,
              reserveForResponse: input.budget.reserveForResponse,
              ...(input.budget.maxRuntimeTokens === undefined
                ? {}
                : { maxRuntimeTokens: input.budget.maxRuntimeTokens }),
              ...(input.budget.maxConversationTokens === undefined
                ? {}
                : { maxConversationTokens: input.budget.maxConversationTokens }),
            },
          }),
    });
  }
}

function failurePhaseFor(state: AgentRunState): AgentRunFailure['phase'] {
  if (state === 'assembling' || state === 'calling-model' || state === 'responding') {
    return state;
  }
  return 'calling-model';
}
