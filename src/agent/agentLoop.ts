/**
 * The Agent Loop Engine — a controlled multi-step loop around the existing
 * per-run harness.
 *
 * The run harness (ADR-0060) owns *one* bounded reasoning step: assembly,
 * one call through the real `AsyncModelAdapter` over the existing LLM
 * Gateway, and an ephemeral working memory. The loop sits one level above it
 * and owns the thing a single step cannot: deciding whether the agent's work
 * is finished, and if not, running the next step — under hard limits, with
 * identical-step protection, and with an explicit machine-checked lifecycle:
 *
 *   idle → reasoning → context-update → deciding ─┬→ reasoning (next step)
 *                                                 ├→ completed
 *                    any active state ────────────┼→ blocked   (a limit
 *                                                 │            exhausted, or
 *                                                 │            a repeated step)
 *                                                 ├→ failed    (the step failed)
 *                                                 └→ cancelled (cooperative
 *                                                              cancel observed)
 *
 * Each iteration is exactly the four phases the AI Workplace needs:
 *
 *   1. **LLM reasoning step** — one `AgentRunHarness.run()`. The harness
 *      stays the single entry point for one bounded run (DEC-AI-9); the
 *      loop composes it per iteration the way the Run Manager does, and the
 *      gateway is reached only through the existing adapter (DEC-AI-2).
 *   2. **Context update** — the digests of every context section the step
 *      delivered are recorded, so later steps (and a future retrieval or
 *      tool step) can pass `alreadyDeliveredDigests` to the Context Builder
 *      (ADR-0064) and never pay for the same block twice.
 *   3. **Next-step decision** — the structured summary is the decision
 *      surface: the loop reads the summary, never model prose. An injected
 *      decider answers "is the work complete?"; the default completes when
 *      the summary requested no tool work.
 *   4. **Completion** — the loop ends in exactly one terminal state, with
 *      everything it accumulated: statements, the last summary, recorded
 *      (never executed) tool requests, token usage, the per-step harness
 *      results and the timeline.
 *
 * Limits, all configurable, all enforced between phases so a stop is
 * immediate at the loop's own granularity:
 *
 *   - `maxIterations` — the hard ceiling on reasoning steps;
 *   - `maxExecutionTimeMs` — wall-clock ceiling, checked before each step;
 *   - `maxOutputTokens` — accumulated completion tokens across steps.
 *
 * Two guards make an infinite or futile loop impossible, not merely
 * unlikely: the iteration budget is structural, and the digest of what the
 * model would see is compared against every prior iteration — an identical
 * step is refused (`repeated-step`) instead of re-asked.
 *
 * What this module deliberately does **not** do, per this phase:
 *
 *   - no tool calling — tool requests are recorded and surfaced, never
 *     executed; the decider seam plus the context-update phase are where a
 *     tool step continues the loop with fresh material;
 *   - no RAG / retrieval — runtime context is supplied by the caller, as
 *     for the harness; the loop only records what was delivered;
 *   - no persistent memory, evaluation or learning;
 *   - no mock responses — the loop fabricates nothing: it composes the real
 *     harness over the real adapter, and its only outputs are what those
 *     produced.
 */

import { AgentRunHarness, type AgentRunInput, type AgentRunResult } from './harness.js';
import { AgentContextBuilder, contentDigest } from './contextBuilder.js';
import type { AsyncModelAdapter, ToolRequest } from './asyncModel.js';
import type { StructuredSummary } from '../llm/summary.js';
import type { ModelStatement } from '../../packages/shared/src/types.js';
import { AppError } from '../../packages/shared/src/core/errors.js';

// ── Loop lifecycle states ──────────────────────────────────────────────────

/**
 * The loop's lifecycle, at the granularity of the four phases. Terminal
 * states are `completed`, `blocked`, `failed` and `cancelled` — the same
 * vocabulary the Run Manager publishes to the Workplace, so a loop-driven
 * run maps onto run status without translation.
 */
export type AgentLoopState =
  | 'idle'
  | 'reasoning'
  | 'context-update'
  | 'deciding'
  | 'completed'
  | 'blocked'
  | 'failed'
  | 'cancelled';

const LOOP_TRANSITIONS: Record<AgentLoopState, readonly AgentLoopState[]> = {
  idle: ['reasoning', 'blocked', 'failed', 'cancelled'],
  reasoning: ['context-update', 'blocked', 'failed', 'cancelled'],
  'context-update': ['deciding', 'blocked', 'failed', 'cancelled'],
  deciding: ['reasoning', 'completed', 'blocked', 'failed', 'cancelled'],
  completed: [],
  blocked: [],
  failed: [],
  cancelled: [],
};

/** Machine-checked lifecycle: an illegal transition is a bug, thrown loudly. */
export class AgentLoopLifecycle {
  private state: AgentLoopState = 'idle';
  private readonly history: { state: AgentLoopState; at: string }[] = [
    { state: 'idle', at: new Date().toISOString() },
  ];

  current(): AgentLoopState {
    return this.state;
  }

  transitions(): readonly { state: AgentLoopState; at: string }[] {
    return [...this.history];
  }

  isTerminal(): boolean {
    return LOOP_TRANSITIONS[this.state].length === 0;
  }

  transitionTo(next: AgentLoopState): void {
    const allowed = LOOP_TRANSITIONS[this.state];
    if (!allowed.includes(next)) {
      throw new Error(`Illegal agent loop lifecycle transition: ${this.state} -> ${next}`);
    }
    this.state = next;
    this.history.push({ state: next, at: new Date().toISOString() });
  }
}

// ── Limits ─────────────────────────────────────────────────────────────────

/** Configurable ceilings for one loop. Every field is enforced. */
export interface AgentLoopLimits {
  /** Hard ceiling on reasoning steps (harness runs). Default 5. */
  maxIterations: number;
  /** Wall-clock ceiling for the whole loop, in milliseconds. Default 120s. */
  maxExecutionTimeMs: number;
  /** Accumulated completion tokens across all steps. Default 4,000. */
  maxOutputTokens: number;
}

export const DEFAULT_AGENT_LOOP_LIMITS: AgentLoopLimits = {
  maxIterations: 5,
  maxExecutionTimeMs: 120_000,
  maxOutputTokens: 4_000,
};

// ── Stop reasons ───────────────────────────────────────────────────────────

/** Why the loop ended. Every terminal outcome names its cause precisely, so
 * the surface can tell a well-formed completion from a runaway loop. */
export type AgentLoopStopReason =
  | { reason: 'completed' }
  | { reason: 'failed'; message: string }
  | { reason: 'cancelled' }
  | { reason: 'iteration-limit'; iterationsRun: number; maxIterations: number }
  | { reason: 'time-limit'; elapsedMs: number; maxExecutionTimeMs: number }
  | { reason: 'output-token-limit'; completionTokens: number; maxOutputTokens: number }
  | { reason: 'repeated-step'; iteration: number };

// ── The decision seam ──────────────────────────────────────────────────────

/** What the loop shows the decider: the summary contract plus the loop's
 * accumulation so far. Model prose never appears here. */
export interface AgentLoopDecisionInput {
  /** The latest step's structured summary (the decision surface). */
  summary: StructuredSummary;
  /** All statements accumulated across steps, oldest first. */
  statements: readonly ModelStatement[];
  /** All tool *requests* recorded across steps; nothing has executed. */
  toolRequests: readonly ToolRequest[];
  /** The iteration that just decided (1-based). */
  iteration: number;
}

/** The decider's verdict. `complete: true` ends the loop; `false` runs the
 * next reasoning step — which a future tool-calling or retrieval phase uses
 * to continue the loop once it can supply fresh context material. */
export interface AgentLoopStepDecision {
  complete: boolean;
  /** Why, recorded on the outcome for the trace a UI may show. */
  rationale: string;
}

export type AgentLoopDecider = (input: AgentLoopDecisionInput) => AgentLoopStepDecision;

/**
 * The default next-step decision: the work is complete when the summary
 * requested no tool work — there is nothing the agent is waiting on. A
 * summary that requests tools keeps the loop open, and this phase then
 * relies on the `repeated-step` guard to refuse re-asking the identical
 * question until a tool phase supplies fresh material.
 */
export const defaultLoopDecider: AgentLoopDecider = ({ toolRequests }) =>
  toolRequests.length === 0
    ? { complete: true, rationale: 'the summary requested no further work' }
    : { complete: false, rationale: 'the summary requested tool work; no tool phase is installed' };

// ── Options and outcome ────────────────────────────────────────────────────

export interface AgentLoopOptions {
  /** The real reasoning path: an AsyncModelAdapter over the LLM Gateway. */
  adapter: AsyncModelAdapter;
  /**
   * The centralized Context Builder. Defaults to the shared stateless
   * instance, exactly as the harness does.
   */
  contextBuilder?: AgentContextBuilder;
  /** Ceilings; unset fields take `DEFAULT_AGENT_LOOP_LIMITS`. */
  limits?: Partial<AgentLoopLimits>;
  /** Next-step decision; defaults to `defaultLoopDecider`. */
  decide?: AgentLoopDecider;
  /**
   * Cooperative cancellation, polled before each step and wired into every
   * harness run's `shouldCancel` hook. A cancellation observed between
   * phases ends the loop `cancelled` immediately.
   */
  shouldCancel?: () => boolean;
  /** Milliseconds clock for the time ceiling and duration. */
  now?: () => number;
}

/** Token accounting accumulated across every step of the loop. */
export interface AgentLoopUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
}

/** The settled result of one loop. Never dangling: the loop always ends in
 * exactly one terminal state, and every field reflects what actually ran. */
export interface AgentLoopResult {
  status: 'completed' | 'blocked' | 'failed' | 'cancelled';
  stopReason: AgentLoopStopReason;
  /** Reasoning steps that ran (harness runs), including a failed one. */
  iterations: number;
  /** Statements accumulated across steps, oldest first. */
  statements: readonly ModelStatement[];
  /** The last step's structured summary, when a step completed. */
  summary: StructuredSummary | null;
  /** Tool requests recorded across steps. Recorded, never executed here. */
  toolRequests: readonly ToolRequest[];
  /** Token usage accumulated across steps. */
  usage: AgentLoopUsage;
  /** The last decision the loop reached, when one was made. */
  decision: AgentLoopStepDecision | null;
  /** Every state the loop passed through, with times. */
  timeline: readonly { state: AgentLoopState; at: string }[];
  /** Wall-clock duration of the whole loop, in milliseconds. */
  durationMs: number;
  /** The per-step harness results, in order. Observability, not state. */
  runs: readonly AgentRunResult[];
  /** Digests of every context section the loop delivered, in delivery
   * order — the feedstock for the Context Builder's
   * `alreadyDeliveredDigests` seam in later steps. */
  deliveredDigests: readonly string[];
}

// ── The engine ─────────────────────────────────────────────────────────────

/**
 * The loop engine. Construction validates the limits; `run()` executes the
 * bounded multi-step loop and always settles in exactly one terminal state.
 */
export class AgentLoopEngine {
  private readonly adapter: AsyncModelAdapter;
  private readonly contextBuilder: AgentContextBuilder | undefined;
  private readonly limits: AgentLoopLimits;
  private readonly decide: AgentLoopDecider;
  private readonly shouldCancel: (() => boolean) | undefined;
  private readonly now: () => number;

  constructor(options: AgentLoopOptions) {
    this.adapter = options.adapter;
    this.contextBuilder = options.contextBuilder;
    this.decide = options.decide ?? defaultLoopDecider;
    this.shouldCancel = options.shouldCancel;
    this.now = options.now ?? Date.now;
    const limits: AgentLoopLimits = { ...DEFAULT_AGENT_LOOP_LIMITS, ...(options.limits ?? {}) };
    if (!Number.isInteger(limits.maxIterations) || limits.maxIterations < 1) {
      throw new AppError(
        'VALIDATION_FAILED',
        'agent loop limits: maxIterations must be a positive integer',
        { details: { maxIterations: limits.maxIterations } },
      );
    }
    if (!Number.isFinite(limits.maxExecutionTimeMs) || limits.maxExecutionTimeMs <= 0) {
      throw new AppError(
        'VALIDATION_FAILED',
        'agent loop limits: maxExecutionTimeMs must be a positive number of milliseconds',
        { details: { maxExecutionTimeMs: limits.maxExecutionTimeMs } },
      );
    }
    if (!Number.isFinite(limits.maxOutputTokens) || limits.maxOutputTokens <= 0) {
      throw new AppError(
        'VALIDATION_FAILED',
        'agent loop limits: maxOutputTokens must be a positive number of tokens',
        { details: { maxOutputTokens: limits.maxOutputTokens } },
      );
    }
    this.limits = limits;
  }

  /**
   * Run the bounded multi-step loop.
   *
   * Contract shape: the harness owns each reasoning step (assembly, the
   * model call, ephemeral memory); the loop owns the control — limits,
   * cancellation, identical-step protection and the decision — and always
   * terminates in exactly one terminal state. A limit stop is terminal
   * `blocked` with the precise reason; a step failure is `failed`; a
   * cooperative cancel is `cancelled`.
   */
  async run(input: AgentRunInput): Promise<AgentLoopResult> {
    const lifecycle = new AgentLoopLifecycle();
    const startedAt = this.now();
    const seenIterationDigests = new Set<string>();
    const deliveredDigests: string[] = [];
    const runs: AgentRunResult[] = [];
    const statements: ModelStatement[] = [];
    const toolRequests: ToolRequest[] = [];
    const usage: AgentLoopUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costUsd: 0,
    };
    let summary: StructuredSummary | null = null;
    let decision: AgentLoopStepDecision | null = null;

    const finish = (
      status: AgentLoopResult['status'],
      stopReason: AgentLoopStopReason,
    ): AgentLoopResult => ({
      status,
      stopReason,
      iterations: runs.length,
      statements: [...statements],
      summary,
      toolRequests: [...toolRequests],
      usage: { ...usage },
      decision,
      timeline: lifecycle.transitions(),
      durationMs: Math.max(0, this.now() - startedAt),
      runs: [...runs],
      deliveredDigests: [...deliveredDigests],
    });

    try {
      for (let iteration = 1; iteration <= this.limits.maxIterations; iteration += 1) {
        // Cancellation and the time ceiling are checked before another paid
        // step starts, so a stop is immediate at the loop's granularity.
        if (this.shouldCancel?.() === true) {
          lifecycle.transitionTo('cancelled');
          return finish('cancelled', { reason: 'cancelled' });
        }
        const elapsedMs = this.now() - startedAt;
        if (elapsedMs > this.limits.maxExecutionTimeMs) {
          lifecycle.transitionTo('blocked');
          return finish('blocked', {
            reason: 'time-limit',
            elapsedMs,
            maxExecutionTimeMs: this.limits.maxExecutionTimeMs,
          });
        }

        // Identical-step protection, before anything is paid for: if this
        // iteration would show the model exactly what a previous iteration
        // already showed, re-asking cannot produce new work — refuse the
        // step instead of running it.
        const pendingDigest = contentDigest(
          JSON.stringify([
            input.instructions,
            input.userInput,
            input.history ?? [],
            (input.runtimeContext ?? []).map((item) => [item.id, item.content]),
          ]),
        );
        if (seenIterationDigests.has(pendingDigest)) {
          lifecycle.transitionTo('blocked');
          return finish('blocked', { reason: 'repeated-step', iteration: runs.length + 1 });
        }
        seenIterationDigests.add(pendingDigest);

        // 1. Reasoning step — one bounded harness run; the only place the
        //    real gateway is reached. The first iteration enters from
        //    `idle`; later ones arrive from the deciding phase, which is
        //    where the loop back-edge lives: a reasoning phase starts
        //    exactly when a step will actually run.
        const phase = lifecycle.current();
        if (phase === 'idle' || phase === 'deciding') lifecycle.transitionTo('reasoning');
        const harness = new AgentRunHarness({
          adapter: this.adapter,
          ...(this.contextBuilder === undefined ? {} : { contextBuilder: this.contextBuilder }),
          hooks: { shouldCancel: () => this.shouldCancel?.() ?? false },
        });
        const result = await harness.run(input);
        runs.push(result);
        if (result.status === 'cancelled') {
          lifecycle.transitionTo('cancelled');
          return finish('cancelled', { reason: 'cancelled' });
        }
        if (result.status === 'failed' || result.turn === undefined) {
          lifecycle.transitionTo('failed');
          return finish('failed', {
            reason: 'failed',
            message: result.failure?.message ?? 'the reasoning step ended without a model turn',
          });
        }
        const turn = result.turn;
        usage.promptTokens += turn.usage.promptTokens;
        usage.completionTokens += turn.usage.completionTokens;
        usage.totalTokens += turn.usage.totalTokens;
        usage.costUsd += turn.usage.costUsd;
        statements.push(...turn.statements);
        toolRequests.push(...turn.toolRequests);
        summary = turn.summary;

        // 2. Context update — record what this step delivered, so later
        //    steps can pass `alreadyDeliveredDigests` to the Context
        //    Builder and never pay for the same block twice.
        lifecycle.transitionTo('context-update');
        const assembly = result.assembly;
        if (assembly !== undefined) {
          for (const section of assembly.contextSections) {
            deliveredDigests.push(contentDigest(section.content));
          }
        }

        // 3. Next-step decision — the output-token ceiling first, then the
        //    decider over the summary contract.
        lifecycle.transitionTo('deciding');
        if (usage.completionTokens >= this.limits.maxOutputTokens) {
          lifecycle.transitionTo('blocked');
          return finish('blocked', {
            reason: 'output-token-limit',
            completionTokens: usage.completionTokens,
            maxOutputTokens: this.limits.maxOutputTokens,
          });
        }
        decision = this.decide({
          summary,
          statements: [...statements],
          toolRequests: [...toolRequests],
          iteration,
        });
        if (decision.complete) {
          lifecycle.transitionTo('completed');
          return finish('completed', { reason: 'completed' });
        }
        // Not complete: the next iteration takes the deciding → reasoning
        // back-edge at its top, so no phase is ever announced without the
        // step it names actually running.
      }

      // 4. The iteration budget is spent: stop, honestly, at the ceiling.
      lifecycle.transitionTo('blocked');
      return finish('blocked', {
        reason: 'iteration-limit',
        iterationsRun: this.limits.maxIterations,
        maxIterations: this.limits.maxIterations,
      });
    } catch (error) {
      lifecycle.transitionTo('failed');
      return finish('failed', {
        reason: 'failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
