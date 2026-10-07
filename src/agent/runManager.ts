/**
 * Agent Run Manager — the durable lifecycle and registry for agent runs.
 *
 * The run harness (`src/agent/harness.ts`) owns *one* bounded execution:
 * assembly, the model call, the ephemeral working memory. The Run Manager
 * sits one level above it and owns the things a single execution cannot:
 *
 *   - a **registry of runs**, each with a unique id, that outlives the
 *     execution itself so the AI Workplace can ask "what is running,
 *     what finished, what did it cost";
 *   - an **explicit, machine-checked state machine** at the granularity
 *     the Workplace UI speaks — idle → running → waiting-tool →
 *     validating → responding → completed, with blocked, failed and
 *     cancelled as the other terminal states;
 *   - **run/user isolation**: every record carries the opaque user id of
 *     the principal that started it, and a cross-user read throws rather
 *     than filtering quietly (the same discipline as memory scoping);
 *   - **cancellation and safe failure**: a cancel is a cooperative
 *     request the executing driver polls between phases; every run ends
 *     in exactly one terminal state, and a failure is recorded with the
 *     phase it surfaced in — never a dangling run;
 *   - **status exposure**: every transition is announced to an injected
 *     notifier, which the server wires to the existing EventBus so the
 *     Workplace sees run progress in real time over the same WebSocket
 *     contracts every other surface uses.
 *
 * What this module deliberately does **not** do, in this phase:
 *
 *   - no tool calling (`waiting-tool` is a defined, machine-checked state
 *     a later phase drives; nothing executes a tool here);
 *   - no persistent memory, evaluation or learning;
 *   - no second LLM Gateway — model work is reached only through the
 *     caller-supplied `AsyncModelAdapter` over the existing gateway;
 *   - no streaming or tracing *implementation*, but the shape is ready
 *     for them: transitions are timestamped, ordered and announced, so a
 *     stream or a trace is a consumer of the same event, not a new path.
 *
 * Three invariants:
 *
 *   1. **Unique identity.** Every run gets one id at creation, minted by
 *      the injected id factory; no two runs share one.
 *   2. **Isolation.** A run's record, its cancellation and its status
 *      are readable only by the user that owns it. A wrong user is a
 *      policy violation, not an empty result.
 *   3. **Terminal honesty.** Every run reaches exactly one terminal
 *      state — completed, blocked, failed or cancelled — and the
 *      timestamps, usage and error of how it got there are recorded.
 */

import type { AsyncModelAdapter } from './asyncModel.js';
import { AgentContextBuilder } from './contextBuilder.js';
import { AgentRunHarness, type AgentRunInput, type AgentRunResult } from './harness.js';
import { AgentLoopEngine, type AgentLoopLimits, type AgentLoopResult } from './agentLoop.js';
import type { AgentToolRunOutcome, ToolRunStatus, AgentToolRegistry } from './tools/registry.js';
import { AppError, PolicyViolationError } from '../../packages/shared/src/core/errors.js';
import type { Logger } from '../../packages/shared/src/core/logging.js';
import type { EventBus } from '../../packages/shared/src/realtime/events.js';

// ── States ─────────────────────────────────────────────────────────────────

/**
 * The run states the AI Workplace renders. Finer than the harness's own
 * lifecycle (`pending → assembling → calling-model → …`): this is the
 * vocabulary of the *surface*, not of the executor, and it names the two
 * phases a tool-calling phase will need — `waiting-tool` while a requested
 * tool executes, `validating` while the assembled context or the produced
 * answer is checked — without this phase implementing either.
 */
export type AgentRunManagerState =
  | 'idle'
  | 'running'
  | 'waiting-tool'
  | 'validating'
  | 'responding'
  | 'completed'
  | 'blocked'
  | 'failed'
  | 'cancelled';

/** Bound on the tool entries one run keeps; the oldest is evicted. */
const MAX_TOOL_RUNS_PER_RUN = 1_000;

const TERMINAL_STATES: readonly AgentRunManagerState[] = [
  'completed',
  'blocked',
  'failed',
  'cancelled',
];

/**
 * Machine-checked transitions. An illegal transition is a bug in the caller
 * (or in a later phase's driver) and is thrown loudly, never coerced.
 *
 *   idle ──► running ──► waiting-tool ──► running (tool returned)
 *              │              │
 *              ├──► validating ──► responding ──► completed
 *              │         │
 *              │         └──► blocked (validation refused the run)
 *              └──► blocked (a gate refused before anything ran)
 *
 *   any non-terminal ──► failed | cancelled
 */
const RUN_MANAGER_TRANSITIONS: Record<AgentRunManagerState, readonly AgentRunManagerState[]> = {
  idle: ['running', 'blocked', 'failed', 'cancelled'],
  running: ['waiting-tool', 'validating', 'responding', 'blocked', 'failed', 'cancelled'],
  'waiting-tool': ['running', 'blocked', 'failed', 'cancelled'],
  validating: ['running', 'responding', 'blocked', 'failed', 'cancelled'],
  responding: ['completed', 'blocked', 'failed', 'cancelled'],
  completed: [],
  blocked: [],
  failed: [],
  cancelled: [],
};

export function isTerminalRunState(state: AgentRunManagerState): boolean {
  return TERMINAL_STATES.includes(state);
}

// ── Records ────────────────────────────────────────────────────────────────

/** Token accounting for one run, accumulated from the turn's usage. */
export interface AgentRunUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
}

/** One entry in the run's state timeline. */
export interface AgentRunTimelineEntry {
  state: AgentRunManagerState;
  at: string;
}

/**
 * The durable record of one run. Returned as a defensive copy on every
 * read: a caller holding a snapshot cannot mutate the manager's state.
 */
export interface AgentRunRecord {
  /** Unique id, minted at creation (`run_<stamp>`). */
  runId: string;
  /**
   * The opaque authenticated-user id the run belongs to. Attribution and
   * isolation only — never a Principal, never a credential.
   */
  userId: string;
  correlationId: string;
  /** The model the run was (or is being) answered by. */
  model: string;
  state: AgentRunManagerState;
  /** When the run was created (`idle`). */
  startedAt: string;
  /** When the run reached a terminal state, if it has. */
  endedAt: string | null;
  /** Wall-clock duration in milliseconds, set once terminal. */
  durationMs: number | null;
  usage: AgentRunUsage | null;
  /** The failure, when the run ended `failed`: what and where. */
  error: { phase: AgentRunManagerState; message: string } | null;
  /** Why the run ended `blocked`, when it did. */
  blockedReason: string | null;
  /** A cancellation has been requested (cooperative; the driver polls). */
  cancelRequested: boolean;
  /** Every state the run passed through, in order, with times. */
  timeline: readonly AgentRunTimelineEntry[];
  /**
   * Tool executions recorded against this run, in order: name, status,
   * duration and error detail. In-memory and bounded per run — status
   * recording for the Workplace, not a persistent tool history.
   */
  toolRuns: readonly AgentRunToolRecord[];
}

/** One tool execution as the run records it: name, status, duration, error. */
export interface AgentRunToolRecord {
  executionId: string;
  toolName: string;
  toolVersion: string;
  status: ToolRunStatus;
  durationMs: number;
  /** Failure or refusal detail, when there is one. */
  error?: string;
  at: string;
}

/** One transition announcement, delivered to the notifier and subscribers. */
export interface AgentRunStatusUpdate {
  runId: string;
  userId: string;
  correlationId: string;
  previous: AgentRunManagerState;
  state: AgentRunManagerState;
  /** Present on blocked and failed transitions. */
  reason?: string;
  at: string;
}

// ── Options ────────────────────────────────────────────────────────────────

export interface AgentRunManagerOptions {
  /** Milliseconds clock for durations and terminal timestamps. */
  now?: () => number;
  /** Unique run ids. Defaults to the shared `ids` factory (`run_<stamp>`). */
  idFactory?: () => string;
  /**
   * Notified on every transition. The server injects a notifier that
   * publishes `agent.status` events on the existing EventBus; a UI embed
   * could inject a direct listener instead. Errors from the notifier are
   * the notifier's to handle — the run itself must not fail because a
   * status announcement was refused.
   */
  onStatus?: (update: AgentRunStatusUpdate) => void;
  /**
   * Model/adapter composition for `run()`: the same `AsyncModelAdapter`
   * over the existing LLM Gateway the harness uses, and (optionally) a
   * shared stateless Context Builder. Absent, `run()` is unavailable and
   * the manager remains a pure registry — which is how a caller that only
   * wants tracking uses it.
   */
  harness?: { adapter: AsyncModelAdapter; contextBuilder?: AgentContextBuilder };
  /**
   * The centralized Tool Registry for `runLoop()`: the only path through
   * which a loop-driven run executes tools. Absent, the loop records tool
   * requests and executes nothing.
   */
  tools?: AgentToolRegistry;
  /**
   * Retention bound per user. When exceeded, the oldest *terminal* run is
   * evicted; an active run is never evicted, so the bound can be exceeded
   * briefly rather than a live run losing its record.
   */
  maxRunsPerUser?: number;
}

// ── The manager ────────────────────────────────────────────────────────────

export class AgentRunManager {
  private readonly now: () => number;
  private readonly idFactory: () => string;
  private readonly onStatus: ((update: AgentRunStatusUpdate) => void) | undefined;
  private readonly harnessConfig: AgentRunManagerOptions['harness'];
  private readonly toolRegistry: AgentToolRegistry | undefined;
  private readonly maxRunsPerUser: number;
  private readonly runs = new Map<string, AgentRunRecord>();
  private readonly subscribers = new Map<string, (update: AgentRunStatusUpdate) => void>();

  constructor(options: AgentRunManagerOptions = {}) {
    this.now = options.now ?? Date.now;
    this.idFactory = options.idFactory ?? (() => `run_${crypto.randomUUID()}`);
    this.onStatus = options.onStatus;
    this.harnessConfig = options.harness;
    this.toolRegistry = options.tools;
    this.maxRunsPerUser = options.maxRunsPerUser ?? 200;
  }

  // ── Creation and lifecycle ──

  /**
   * Register a new run in `idle`. The record exists from this moment, so
   * a run that never starts (its caller crashed before `start`) is still
   * visible, cancellable and accounted for.
   */
  createRun(input: { userId: string; correlationId: string; model: string }): AgentRunRecord {
    const record: AgentRunRecord = {
      runId: this.idFactory(),
      userId: input.userId,
      correlationId: input.correlationId,
      model: input.model,
      state: 'idle',
      startedAt: new Date(this.now()).toISOString(),
      endedAt: null,
      durationMs: null,
      usage: null,
      error: null,
      blockedReason: null,
      cancelRequested: false,
      timeline: [{ state: 'idle', at: new Date(this.now()).toISOString() }],
      toolRuns: [],
    };
    this.runs.set(record.runId, record);
    this.evictIfNeeded(input.userId);
    return this.snapshot(record);
  }

  /** Begin execution: `idle → running`. */
  start(runId: string, userId: string): AgentRunRecord {
    return this.transition(runId, userId, 'running');
  }

  /**
   * Move the run to an explicit state. Machine-checked: an illegal
   * transition throws. Terminal states accept nothing.
   */
  transition(
    runId: string,
    userId: string,
    next: AgentRunManagerState,
    reason?: string,
  ): AgentRunRecord {
    const record = this.owned(runId, userId);
    const allowed = RUN_MANAGER_TRANSITIONS[record.state];
    if (!allowed.includes(next)) {
      throw new AppError(
        'CONFLICT',
        `Illegal agent run transition: ${record.state} -> ${next} (run ${runId})`,
      );
    }
    const previous = record.state;
    record.state = next;
    const at = new Date(this.now()).toISOString();
    record.timeline = [...record.timeline, { state: next, at }];
    if (isTerminalRunState(next)) {
      record.endedAt = at;
      record.durationMs = Math.max(0, this.now() - Date.parse(record.startedAt));
      if (next === 'blocked' && reason !== undefined) record.blockedReason = reason;
    }
    this.announce(record, previous, next, reason);
    return this.snapshot(record);
  }

  /** Mark the run answered and terminal: `responding → completed`. */
  complete(runId: string, userId: string): AgentRunRecord {
    return this.transition(runId, userId, 'completed');
  }

  /** Mark the run refused by a gate or validation: terminal `blocked`. */
  block(runId: string, userId: string, reason: string): AgentRunRecord {
    return this.transition(runId, userId, 'blocked', reason);
  }

  /**
   * Mark the run failed, recording the phase the failure surfaced in.
   * Safe failure handling: a failure is a recorded terminal state, never
   * a dangling run, and the error message is bounded — it is status
   * data, not a log line.
   */
  fail(runId: string, userId: string, message: string): AgentRunRecord {
    const record = this.owned(runId, userId);
    record.error = { phase: record.state, message: message.slice(0, 2_000) };
    return this.transition(runId, userId, 'failed', message.slice(0, 500));
  }

  /** Record token usage for the run, accumulated across turns. */
  recordUsage(
    runId: string,
    userId: string,
    usage: { promptTokens: number; completionTokens: number; totalTokens: number; costUsd: number },
  ): AgentRunRecord {
    const record = this.owned(runId, userId);
    const current = record.usage ?? {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costUsd: 0,
    };
    record.usage = {
      promptTokens: current.promptTokens + usage.promptTokens,
      completionTokens: current.completionTokens + usage.completionTokens,
      totalTokens: current.totalTokens + usage.totalTokens,
      costUsd: current.costUsd + usage.costUsd,
    };
    return this.snapshot(record);
  }

  /**
   * Request cancellation. Cooperative: the flag is what an executing
   * driver polls (`shouldCancel`) between phases; the run itself moves
   * to `cancelled` when the driver observes the request and ends the
   * work, so a run is never marked cancelled while it is still writing.
   *
   * An `idle` run is not executing anything, so it is cancelled
   * immediately. Cancelling a terminal run is a no-op that reports
   * `false` — the request arrived too late, and that is the answer.
   */
  cancel(runId: string, userId: string): boolean {
    const record = this.owned(runId, userId);
    if (isTerminalRunState(record.state)) return false;
    record.cancelRequested = true;
    if (record.state === 'idle') {
      this.transition(runId, userId, 'cancelled', 'cancelled before it started');
    }
    return true;
  }

  /** The cooperative cancellation check a driver polls between phases. */
  shouldCancel(runId: string, userId: string): boolean {
    return this.owned(runId, userId).cancelRequested;
  }

  // ── Reading: isolation is enforced here, by throwing ──

  /**
   * One run's snapshot. A run is readable only by its owner: an unknown
   * id is `NOT_FOUND`, a known id under the wrong user is a policy
   * violation — a cross-user read throws rather than filtering quietly.
   */
  getRun(runId: string, userId: string): AgentRunRecord {
    return this.snapshot(this.owned(runId, userId));
  }

  /** The user's runs, newest first. Only their own runs are visible. */
  listRuns(userId: string): readonly AgentRunRecord[] {
    const own = [...this.runs.values()].filter((record) => record.userId === userId);
    return own.reverse().map((record) => this.snapshot(record));
  }

  /** The user's runs that have not reached a terminal state. */
  activeRuns(userId: string): readonly AgentRunRecord[] {
    return this.listRuns(userId).filter((record) => !isTerminalRunState(record.state));
  }

  // ── Real-time subscription (in-process; the bus is the wire) ──

  /**
   * Subscribe to one user's run-status updates. The listener receives
   * only updates for runs owned by `userId` — isolation holds on the
   * subscription path exactly as on the read path. Returns the
   * unsubscribe function.
   */
  subscribe(userId: string, listener: (update: AgentRunStatusUpdate) => void): () => void {
    const id = `sub_${crypto.randomUUID()}`;
    const wrapped = (update: AgentRunStatusUpdate): void => {
      if (update.userId !== userId) return;
      listener(update);
    };
    this.subscribers.set(id, wrapped);
    return () => {
      this.subscribers.delete(id);
    };
  }

  // ── Driving one harness run end to end ──

  /**
   * Run one bounded harness execution as a managed run, from `idle`
   * through the terminal state, with cancellation wired cooperatively
   * (`shouldCancel` hook) and usage recorded from the turn.
   *
   * The manager builds a per-run harness around the shared adapter and
   * Context Builder, so the run gets its own hooks without the shared
   * configuration growing per-run state. The gateway is reached only
   * through the adapter — never directly, never a second one.
   *
   * Sub-states the harness cannot express yet (`waiting-tool`,
   * `validating`) are simply not entered on this path; the state machine
   * already checks them for the phase that drives tools.
   */
  async run(input: AgentRunInput & { userId: string }): Promise<AgentRunResult> {
    if (this.harnessConfig === undefined) {
      throw new AppError(
        'NOT_IMPLEMENTED',
        'AgentRunManager.run requires a harness configuration (adapter over the LLM Gateway)',
      );
    }
    const snapshot = this.createRun({
      userId: input.userId,
      correlationId: input.correlationId,
      model: this.harnessConfig.adapter.label,
    });
    const runId = snapshot.runId;
    this.start(runId, input.userId);

    const harness = new AgentRunHarness({
      adapter: this.harnessConfig.adapter,
      ...(this.harnessConfig.contextBuilder === undefined
        ? {}
        : { contextBuilder: this.harnessConfig.contextBuilder }),
      hooks: {
        shouldCancel: () => this.shouldCancel(runId, input.userId),
        afterTurn: async (turn) => {
          if (turn.usage !== null && turn.usage !== undefined) {
            this.recordUsage(runId, input.userId, {
              promptTokens: turn.usage.promptTokens,
              completionTokens: turn.usage.completionTokens,
              totalTokens: turn.usage.totalTokens,
              costUsd: turn.usage.costUsd,
            });
          }
          this.transition(runId, input.userId, 'responding');
        },
      },
    });

    const result = await harness.run(input);
    if (result.status === 'completed') {
      this.complete(runId, input.userId);
    } else if (result.status === 'cancelled') {
      this.transition(runId, input.userId, 'cancelled', 'cancelled by request');
    } else {
      this.fail(runId, input.userId, result.failure?.message ?? 'the run failed');
    }
    // The managed run's id is the run's identity everywhere: the caller
    // gets one id — the durable one — rather than the harness's internal
    // per-process counter, so status lookups and the returned result
    // cannot disagree about which run happened.
    return { ...result, runId };
  }

  /**
   * Record one settled tool outcome against the run: name, status,
   * duration and error. Called by the loop's observation seam as each
   * invocation settles, so the Workplace sees tool work on the run while
   * it happens. Isolation lives here too: the entry is refused unless the
   * caller owns the run.
   */
  recordToolRun(runId: string, userId: string, outcome: AgentToolRunOutcome): AgentRunRecord {
    const record = this.owned(runId, userId);
    const entry: AgentRunToolRecord = {
      executionId: outcome.executionId,
      toolName: outcome.toolName,
      toolVersion: outcome.toolVersion,
      status: outcome.status,
      durationMs: outcome.durationMs,
      ...(outcome.detail === undefined ? {} : { error: outcome.detail }),
      at: new Date(this.now()).toISOString(),
    };
    const toolRuns = [...record.toolRuns, entry];
    while (toolRuns.length > MAX_TOOL_RUNS_PER_RUN) toolRuns.shift();
    record.toolRuns = toolRuns;
    return this.snapshot(record);
  }

  /**
   * Drive one run through the Agent Loop Engine instead of a single
   * harness step: the multi-step, tool-executing entry point. `run()` above
   * is unchanged, so existing callers (and the agent.chat integration)
   * keep their behavior exactly; this driver adds the loop's limits and
   * tool phase over the same adapter and gateway, and records what the
   * loop did on the same durable run record: token usage accumulated
   * across every step, one tool entry per tool outcome as it settles, and
   * the loop's terminal outcome mapped onto the run's own vocabulary
   * (completed / blocked with the precise stop reason / failed / cancelled).
   */
  async runLoop(
    input: AgentRunInput & { userId: string; limits?: Partial<AgentLoopLimits> },
  ): Promise<AgentLoopResult & { runId: string }> {
    if (this.harnessConfig === undefined) {
      throw new AppError(
        'NOT_IMPLEMENTED',
        'AgentRunManager.runLoop requires a harness configuration (adapter over the LLM Gateway)',
      );
    }
    const { limits, ...runInput } = input;
    const snapshot = this.createRun({
      userId: input.userId,
      correlationId: input.correlationId,
      model: this.harnessConfig.adapter.label,
    });
    const runId = snapshot.runId;
    this.start(runId, input.userId);

    const engine = new AgentLoopEngine({
      adapter: this.harnessConfig.adapter,
      ...(this.harnessConfig.contextBuilder === undefined
        ? {}
        : { contextBuilder: this.harnessConfig.contextBuilder }),
      ...(this.toolRegistry === undefined ? {} : { toolRegistry: this.toolRegistry }),
      ...(limits === undefined ? {} : { limits }),
      shouldCancel: () => this.shouldCancel(runId, input.userId),
      onToolRun: (outcome) => {
        this.recordToolRun(runId, input.userId, outcome);
      },
    });

    try {
      const result = await engine.run(runInput);
      this.recordUsage(runId, input.userId, {
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
        costUsd: result.usage.costUsd,
      });
      if (result.status === 'completed') {
        this.transition(runId, input.userId, 'responding');
        this.complete(runId, input.userId);
      } else if (result.status === 'blocked') {
        this.block(runId, input.userId, JSON.stringify(result.stopReason));
      } else if (result.status === 'cancelled') {
        this.transition(runId, input.userId, 'cancelled', 'cancelled by request');
      } else {
        const reason = result.stopReason;
        this.fail(
          runId,
          input.userId,
          reason.reason === 'failed' || reason.reason === 'tool-failure'
            ? reason.message
            : 'the loop failed',
        );
      }
      return { ...result, runId };
    } catch (error) {
      this.fail(runId, input.userId, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  // ── Internals ──

  /** Resolve a run the user owns, or throw. Isolation lives here. */
  private owned(runId: string, userId: string): AgentRunRecord {
    const record = this.runs.get(runId);
    if (record === undefined) {
      throw new AppError('NOT_FOUND', `Unknown agent run: ${runId}`);
    }
    if (record.userId !== userId) {
      throw new PolicyViolationError(
        `Run ${runId} belongs to another user; cross-user run access is refused`,
        { runId },
      );
    }
    return record;
  }

  private announce(
    record: AgentRunRecord,
    previous: AgentRunManagerState,
    next: AgentRunManagerState,
    reason?: string,
  ): void {
    const update: AgentRunStatusUpdate = {
      runId: record.runId,
      userId: record.userId,
      correlationId: record.correlationId,
      previous,
      state: next,
      at: new Date(this.now()).toISOString(),
      ...(reason === undefined ? {} : { reason: reason.slice(0, 500) }),
    };
    // Subscribers are independent of the notifier: an in-process listener
    // must not stop working because no wire notifier was configured.
    for (const subscriber of [...this.subscribers.values()]) {
      subscriber(update);
    }
    this.onStatus?.(update);
  }

  private snapshot(record: AgentRunRecord): AgentRunRecord {
    return {
      ...record,
      usage: record.usage === null ? null : { ...record.usage },
      error: record.error === null ? null : { ...record.error },
      timeline: [...record.timeline],
      toolRuns: [...record.toolRuns],
    };
  }

  /** Retention: evict the oldest terminal run of this user when over the cap. */
  private evictIfNeeded(userId: string): void {
    const own = [...this.runs.values()].filter((record) => record.userId === userId);
    if (own.length <= this.maxRunsPerUser) return;
    const evictable = own
      .filter((record) => isTerminalRunState(record.state))
      .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
    const oldest = evictable[0];
    if (oldest !== undefined) this.runs.delete(oldest.runId);
  }
}

// ── The wire to the AI Workplace ───────────────────────────────────────────

/**
 * Build the notifier the server injects into the manager: every run
 * transition becomes an `agent.status` event on the existing EventBus,
 * so the AI Workplace sees run progress over the same WebSocket
 * contracts, audiences and replay it already speaks. The run id travels
 * in the event's `source.id`, the correlation id alongside it.
 *
 * No second channel is invented, and a refused publish is logged, not
 * propagated: the run itself is already on its way.
 */
export function runStatusEventNotifier(
  bus: EventBus,
  logger?: Logger,
): (update: AgentRunStatusUpdate) => void {
  return (update) => {
    try {
      bus.publish({
        type: 'agent.status',
        source: { kind: 'agent', id: update.runId },
        correlationId: update.correlationId,
        payload: {
          state: update.state,
          previous: update.previous,
          ...(update.reason === undefined ? {} : { reason: update.reason }),
        },
      });
    } catch (error) {
      logger?.error(
        'refused to publish an agent run status event',
        {
          runId: update.runId,
          state: update.state,
          message: error instanceof Error ? error.message : String(error),
        },
        'realtime.publish.refused',
      );
    }
  };
}
