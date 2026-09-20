/**
 * Background jobs — definitions and the execution engine.
 *
 * The engine is the part that makes promises, and every promise is tied to a
 * store operation rather than to process memory:
 *
 *   - **Idempotency.** `enqueue` derives a key from the kind's prefix and the
 *     caller's suffix and delegates to the store, which returns the existing job
 *     on a repeat. A retried request cannot double-run an embedding job.
 *   - **Authorization.** Every kind names the operation it needs, and `enqueue`
 *     refuses without that grant — the same deny-by-default catalogue the HTTP
 *     surface uses. Kinds that need human approval refuse without a recorded one.
 *   - **Timeout.** A handler runs under a deadline; overrunning aborts it and the
 *     failure goes through the normal retry path. A hung job cannot hold a worker
 *     forever.
 *   - **Cancellation.** Cancellation is recorded in the job row, so it works
 *     across processes. The engine polls for it while a handler runs, aborts the
 *     handler's signal, and refuses to overwrite a cancelled job with a late
 *     success.
 *   - **Retry with backoff.** A retryable failure returns the job to `queued`
 *     with a backoff delay; a non-retryable failure or an exhausted budget
 *     dead-letters it. Failure policy lives in `core/retry.ts`, once.
 *   - **Progress.** Coarse progress (`current`/`total`/`label`) is reportable and
 *     never changes status; it is emitted with the job's events.
 *
 * The engine never runs a handler on the promise queue's microtask alone: it
 * awaits the handler, so `runOnce()` in a test is deterministic.
 */

import { authorize, type OperationId, type Principal } from '../auth/model.js';
import { AppError, PolicyViolationError, isRetryable } from '../core/errors.js';
import { ids } from '../core/ids.js';
import { backoffDelay, DEFAULT_RETRY_POLICY, type RetryPolicy } from '../core/retry.js';
import type { JobProgress, JobRecord, JobStore } from './store.js';
import { HARDLINE_JOB_PATTERN, isJobKind, type JobKind, type JobStatus } from './vocabulary.js';

export type { JobKind, JobStatus } from './vocabulary.js';
export type { JobRecord, JobProgress } from './store.js';

export interface JobDefinition {
  kind: JobKind;
  description: string;
  /** The permission required to enqueue this kind. */
  operation: OperationId;
  maxAttempts: number;
  timeoutMs: number;
  retry: RetryPolicy;
  /** Idempotency keys are `<prefix>:<caller suffix>`. */
  idempotencyKeyPrefix: string;
  requiresApproval: boolean;
  /** How many of this kind may run at once. */
  concurrency: number;
  /** What `progress.total` counts, so the UI can label the bar honestly. */
  progressUnit: string;
}

export const JOB_DEFINITIONS: Record<JobKind, JobDefinition> = {
  'training.gradeSession': {
    kind: 'training.gradeSession',
    description: 'Grade a completed training/exam session deterministically.',
    operation: 'evaluation.run',
    maxAttempts: 3,
    timeoutMs: 30_000,
    retry: DEFAULT_RETRY_POLICY,
    idempotencyKeyPrefix: 'grade',
    requiresApproval: false,
    concurrency: 2,
    progressUnit: 'questions',
  },
  'training.progress': {
    kind: 'training.progress',
    description: 'Recompute curriculum progress roll-ups for the learner.',
    operation: 'progress.read',
    maxAttempts: 3,
    timeoutMs: 60_000,
    retry: DEFAULT_RETRY_POLICY,
    idempotencyKeyPrefix: 'progress',
    requiresApproval: false,
    concurrency: 1,
    progressUnit: 'lessons',
  },
  'dataset.process': {
    kind: 'dataset.process',
    description: 'Validate, normalize and index an uploaded dataset.',
    operation: 'file.upload',
    maxAttempts: 2,
    timeoutMs: 300_000,
    retry: { ...DEFAULT_RETRY_POLICY, attempts: 2, baseDelayMs: 2_000 },
    idempotencyKeyPrefix: 'dataset',
    requiresApproval: false,
    concurrency: 1,
    progressUnit: 'rows',
  },
  'embedding.generate': {
    kind: 'embedding.generate',
    description: 'Generate embeddings for memory records that lack them.',
    operation: 'embedding.generate',
    maxAttempts: 3,
    timeoutMs: 60_000,
    retry: DEFAULT_RETRY_POLICY,
    idempotencyKeyPrefix: 'embed',
    requiresApproval: false,
    concurrency: 1,
    progressUnit: 'records',
  },
  'memory.index': {
    kind: 'memory.index',
    description: 'Index memory records for retrieval and detect duplicates.',
    operation: 'memory.write',
    maxAttempts: 3,
    timeoutMs: 120_000,
    retry: DEFAULT_RETRY_POLICY,
    idempotencyKeyPrefix: 'index',
    requiresApproval: false,
    concurrency: 1,
    progressUnit: 'records',
  },
  'marketData.ingest': {
    kind: 'marketData.ingest',
    description: 'Fetch, validate and store normalized bars from a provider.',
    operation: 'marketData.ingest',
    maxAttempts: 4,
    timeoutMs: 120_000,
    retry: { ...DEFAULT_RETRY_POLICY, attempts: 4, baseDelayMs: 500 },
    idempotencyKeyPrefix: 'ingest',
    requiresApproval: false,
    concurrency: 2,
    progressUnit: 'symbols',
  },
  'backtest.run': {
    kind: 'backtest.run',
    description: 'Run a deterministic backtest for a proposed rule (deferred capability).',
    operation: 'backtest.run',
    maxAttempts: 1,
    timeoutMs: 600_000,
    retry: { ...DEFAULT_RETRY_POLICY, attempts: 1 },
    idempotencyKeyPrefix: 'backtest',
    requiresApproval: true,
    concurrency: 1,
    progressUnit: 'bars',
  },
  'report.generate': {
    kind: 'report.generate',
    description: 'Render a session or research report into managed storage.',
    operation: 'file.download',
    maxAttempts: 2,
    timeoutMs: 90_000,
    retry: DEFAULT_RETRY_POLICY,
    idempotencyKeyPrefix: 'report',
    requiresApproval: false,
    concurrency: 1,
    progressUnit: 'sections',
  },
  'evaluation.scheduled': {
    kind: 'evaluation.scheduled',
    description: 'Run the invariant evaluation harness on a schedule.',
    operation: 'evaluation.run',
    maxAttempts: 2,
    timeoutMs: 120_000,
    retry: DEFAULT_RETRY_POLICY,
    idempotencyKeyPrefix: 'eval',
    requiresApproval: false,
    concurrency: 1,
    progressUnit: 'checks',
  },
  'maintenance.cleanup': {
    kind: 'maintenance.cleanup',
    description: 'Purge expired sessions, transient job scratch and stale buffers.',
    operation: 'settings.write',
    maxAttempts: 2,
    timeoutMs: 30_000,
    retry: DEFAULT_RETRY_POLICY,
    idempotencyKeyPrefix: 'cleanup',
    requiresApproval: false,
    concurrency: 1,
    progressUnit: 'steps',
  },
};

/**
 * Structural invariants of the job catalogue, asserted at start-up and in tests.
 * A kind without an operation would be an unauthorized job; a kind with a broker
 * in its name would be a live-trading capability.
 */
export function assertJobDefinitions(
  definitions: Record<string, JobDefinition> = JOB_DEFINITIONS as Record<string, JobDefinition>,
): void {
  for (const [kind, definition] of Object.entries(definitions)) {
    // The hardline check runs first, and on purpose: it must fire even for a kind
    // that someone added to the vocabulary in a hurry, so the refusal names the
    // real problem instead of "unknown kind".
    if (HARDLINE_JOB_PATTERN.test(kind)) {
      throw new PolicyViolationError(
        `job kind ${kind} looks like trade execution; such a capability must not exist`,
        { kind },
      );
    }
    if (!isJobKind(kind)) {
      throw new PolicyViolationError(`job kind ${kind} is not in the vocabulary`, { kind });
    }
    if (definition.kind !== kind) {
      throw new PolicyViolationError(`job definition key mismatch: ${kind}`, { kind });
    }
    if (!Number.isInteger(definition.maxAttempts) || definition.maxAttempts < 1) {
      throw new PolicyViolationError(`job ${kind} has an invalid attempt budget`, { kind });
    }
    if (!Number.isInteger(definition.timeoutMs) || definition.timeoutMs < 1_000) {
      throw new PolicyViolationError(`job ${kind} needs a timeout of at least 1s`, { kind });
    }
    if (definition.retry.attempts < 1 || definition.retry.baseDelayMs < 1) {
      throw new PolicyViolationError(`job ${kind} has an invalid retry policy`, { kind });
    }
    if (definition.idempotencyKeyPrefix.trim().length === 0) {
      throw new PolicyViolationError(`job ${kind} has no idempotency prefix`, { kind });
    }
    if (!Number.isInteger(definition.concurrency) || definition.concurrency < 1) {
      throw new PolicyViolationError(`job ${kind} has an invalid concurrency`, { kind });
    }
  }
  const missing = Object.keys(JOB_DEFINITIONS).filter((kind) => !(kind in definitions));
  if (missing.length > 0) {
    throw new PolicyViolationError(`job definitions are incomplete: ${missing.join(', ')}`, {
      missing,
    });
  }
}

export interface JobHandlerContext {
  /** Aborted on timeout or cancellation. Long jobs must check it. */
  signal: AbortSignal;
  /** Poll for cancellation; a handler that ignores the signal can still stop. */
  isCancelled: () => Promise<boolean>;
  /** Report coarse progress. Never changes the job's status. */
  reportProgress: (progress: { current: number; total: number; label?: string }) => Promise<void>;
  correlationId: string | null;
  /** Total attempts allowed, so a handler can decide to give up early. */
  attempt: number;
  maxAttempts: number;
  /** True when the signal was aborted because of a cancellation, not a timeout. */
  cancelled: () => boolean;
}

export type JobHandler = (job: JobRecord, context: JobHandlerContext) => Promise<unknown>;

export interface JobStatusEvent {
  jobId: string;
  kind: JobKind;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  progress?: { current: number; total: number; label?: string };
  error?: string;
  correlationId: string | null;
}

/**
 * Where the engine reports what happened. Narrow by design: the queue does not
 * know about the event bus or the audit trail, it knows it must tell someone.
 */
export interface JobObservers {
  onStatus?: (event: JobStatusEvent) => void;
}

export interface EnqueueInput {
  kind: JobKind;
  /** Caller-supplied unique suffix, e.g. the id of the entity being processed. */
  idempotencyKey: string;
  correlationId: string;
  payload?: Record<string, unknown>;
  /** The principal asking for the job; enqueue is denied without one. */
  principal: Principal | null;
  /** Present only when a recorded human approval exists. */
  approvalId?: string;
  /** Higher runs first; 0 is urgent, 9 is background. */
  priority?: number;
  delayMs?: number;
}

export interface JobQueueOptions {
  store: JobStore;
  now?: () => number;
  idFactory?: (kind: JobKind) => string;
  observers?: JobObservers;
  /** Lease granted on claim; renewed by a long-running worker. */
  leaseMs?: number;
  /** How often a running handler is checked for cancellation. */
  cancelPollMs?: number;
}

export interface JobQueueStatus {
  storeKind: string;
  durable: boolean;
  registered: JobKind[];
  missingHandlers: JobKind[];
  summary: Record<JobStatus, number>;
}

export class JobQueue {
  private readonly store: JobStore;
  private readonly now: () => number;
  private readonly idFactory: (kind: JobKind) => string;
  private readonly observers: JobObservers;
  private readonly leaseMs: number;
  private readonly cancelPollMs: number;
  private readonly handlers = new Map<JobKind, JobHandler>();
  private counter = 0;
  private running = 0;

  constructor(options: JobQueueOptions) {
    this.store = options.store;
    this.now = options.now ?? Date.now;
    this.idFactory =
      options.idFactory ??
      ((kind) => `${kind.replace(/\./g, '_')}_${++this.counter}_${ids.id('j').slice(-6)}`);
    this.observers = options.observers ?? {};
    this.leaseMs = options.leaseMs ?? 60_000;
    this.cancelPollMs = options.cancelPollMs ?? 500;
  }

  register(kind: JobKind, handler: JobHandler): void {
    this.handlers.set(kind, handler);
  }

  /**
   * Attach (or replace) the status observer. One observer, set in one place: the
   * composition root decides how a status change reaches the event bus, and a
   * second subscriber cannot be quietly forgotten.
   */
  observeStatus(observer: JobObservers['onStatus']): void {
    this.observers.onStatus = observer;
  }

  registeredKinds(): JobKind[] {
    return [...this.handlers.keys()];
  }

  missingHandlers(): JobKind[] {
    return (Object.keys(JOB_DEFINITIONS) as JobKind[]).filter((kind) => !this.handlers.has(kind));
  }

  runningCount(): number {
    return this.running;
  }

  definition(kind: JobKind): JobDefinition {
    return JOB_DEFINITIONS[kind];
  }

  /**
   * Enqueue, or return the existing job for the same idempotency key.
   *
   * Deny-by-default: an anonymous caller, a caller without the kind's operation,
   * and an approval-gated kind without a recorded approval are all refused before
   * the store is touched.
   */
  async enqueue(input: EnqueueInput): Promise<{ job: JobRecord; created: boolean }> {
    const definition = JOB_DEFINITIONS[input.kind];
    assertJobDefinitions();
    if (input.principal === null) {
      throw new PolicyViolationError(
        `enqueueing ${input.kind} requires an authenticated principal`,
        {
          kind: input.kind,
        },
      );
    }
    // The queue's own clock, so the session is judged against the same instant the
    // queue stamps the job with (see `isSessionActive`).
    const decision = authorize(input.principal, definition.operation, this.now());
    if (!decision.allowed) {
      throw new PolicyViolationError(
        `denied: ${input.principal.id} may not enqueue ${input.kind} (${decision.reason})`,
        { kind: input.kind, operation: definition.operation, reason: decision.reason },
      );
    }
    if (definition.requiresApproval && input.approvalId === undefined) {
      throw new PolicyViolationError(
        `Job ${input.kind} requires an explicit human approval before it may run.`,
        { kind: input.kind },
      );
    }

    const result = await this.store.enqueue({
      id: this.idFactory(input.kind),
      kind: input.kind,
      idempotencyKey: `${definition.idempotencyKeyPrefix}:${input.idempotencyKey}`,
      correlationId: input.correlationId,
      payload: input.payload ?? {},
      maxAttempts: definition.maxAttempts,
      priority: input.priority ?? 5,
      availableAt: this.now() + (input.delayMs ?? 0),
    });
    if (result.created) this.emit(result.job);
    return result;
  }

  async get(id: string): Promise<JobRecord | null> {
    return this.store.get(id);
  }

  async list(
    filter: { kind?: string; status?: JobStatus; limit?: number } = {},
  ): Promise<JobRecord[]> {
    return this.store.list(filter);
  }

  async summary(): Promise<Record<JobStatus, number>> {
    return this.store.summary();
  }

  async status(): Promise<JobQueueStatus> {
    return {
      storeKind: this.store.kind,
      durable: this.store.durable,
      registered: this.registeredKinds(),
      missingHandlers: this.missingHandlers(),
      summary: await this.store.summary(),
    };
  }

  async progressFor(id: string): Promise<JobProgress | null> {
    return this.store.progressFor(id);
  }

  /**
   * Cancel. Terminal jobs are refused rather than silently ignored: telling a user
   * "cancelled" about a job that already succeeded is worse than an error.
   */
  async cancel(id: string, principal: Principal | null): Promise<JobRecord> {
    if (principal === null) {
      throw new PolicyViolationError('cancelling a job requires an authenticated principal', {
        id,
      });
    }
    const decision = authorize(principal, 'job.cancel', this.now());
    if (!decision.allowed) {
      throw new PolicyViolationError(`denied: ${decision.reason}`, { id, operation: 'job.cancel' });
    }
    const job = await this.store.get(id);
    if (!job) throw new AppError('NOT_FOUND', `Job ${id} was not found`);
    if (job.status === 'succeeded' || job.status === 'dead-letter') {
      throw new AppError('CONFLICT', `A ${job.status} job cannot be cancelled`, {
        details: { id, status: job.status },
      });
    }
    const cancelled = await this.store.cancel(id);
    this.emit(cancelled);
    if (cancelled.status === 'cancelled') {
      this.observers.onStatus?.({
        jobId: cancelled.id,
        kind: cancelled.kind as JobKind,
        status: 'cancelled',
        attempts: cancelled.attempts,
        maxAttempts: cancelled.maxAttempts,
        correlationId: cancelled.correlationId,
      });
    }
    return cancelled;
  }

  /**
   * Claim and run at most `max` jobs. Returns the jobs touched, so a test can
   * assert the lifecycle without polling.
   */
  async runOnce(max = 1, kinds?: readonly JobKind[]): Promise<JobRecord[]> {
    const touched: JobRecord[] = [];
    for (let i = 0; i < max; i++) {
      const claimed = await this.claim(kinds);
      if (!claimed) break;
      touched.push(await this.run(claimed));
    }
    return touched;
  }

  /**
   * Claim one runnable job, optionally restricted to some kinds. Split from `run`
   * so a worker pool can claim against its own concurrency budget and then run the
   * exact job it took.
   */
  async claim(kinds?: readonly JobKind[]): Promise<JobRecord | null> {
    return this.store.claim({
      leaseMs: this.leaseMs,
      ...(kinds === undefined ? {} : { kinds }),
    });
  }

  /** Run an already-claimed job through the full retry/timeout/cancel policy. */
  async run(job: JobRecord): Promise<JobRecord> {
    return this.execute(job);
  }

  /** Extend a running job's lease so it is not reclaimed while it is working. */
  async renewLease(id: string): Promise<void> {
    await this.store.renewLease(id, this.leaseMs);
  }

  /** Return jobs whose worker died to the queue. */
  async reclaimExpired(limit = 50): Promise<JobRecord[]> {
    return this.store.reclaimExpired(limit);
  }

  /** The lease granted on claim, exposed for the worker pool's renewal cadence. */
  leaseMsValue(): number {
    return this.leaseMs;
  }

  private async execute(job: JobRecord): Promise<JobRecord> {
    const definition = JOB_DEFINITIONS[job.kind as JobKind];
    const handler = this.handlers.get(job.kind as JobKind);
    if (!handler) {
      // No handler is a configuration error, not a transient failure: retrying it
      // would burn the budget on something that cannot succeed until a deploy.
      const dead = await this.store.deadLetter(job.id, `no handler registered for ${job.kind}`);
      this.emit(dead);
      return dead;
    }

    this.running += 1;
    this.emit(job, 'running');
    const controller = new AbortController();
    let cancelledObserved = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let poller: ReturnType<typeof setInterval> | undefined;

    const timeoutMs = definition.timeoutMs;
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(
          new AppError('TIMEOUT', `job:${job.kind} timed out after ${timeoutMs}ms`, {
            details: { jobId: job.id, timeoutMs },
          }),
        );
      }, timeoutMs);
    });

    // Cancellation is cooperative but not optional: the poller aborts the signal
    // even if the handler never polls, and the status check after the handler
    // stops a late success from overwriting a cancellation.
    poller = setInterval(() => {
      void this.store
        .isCancelled(job.id)
        .then((cancelled) => {
          if (cancelled) {
            cancelledObserved = true;
            controller.abort();
          }
        })
        .catch(() => undefined);
    }, this.cancelPollMs);

    const context: JobHandlerContext = {
      signal: controller.signal,
      isCancelled: () => this.store.isCancelled(job.id),
      reportProgress: (progress) => this.reportProgress(job, progress),
      correlationId: job.correlationId,
      attempt: job.attempts,
      maxAttempts: job.maxAttempts,
      cancelled: () => cancelledObserved || controller.signal.aborted,
    };

    try {
      const result = await Promise.race([handler(job, context), timedOut]);
      const current = await this.store.get(job.id);
      if (current?.status === 'cancelled') {
        // The work stopped because it was cancelled. Do not resurrect it.
        return current;
      }
      const completed = await this.store.complete(job.id, this.resultPayload(result));
      this.emit(completed);
      return completed;
    } catch (error) {
      const afterFailure = await this.store.get(job.id);
      if (afterFailure?.status === 'cancelled' || cancelledObserved) {
        return afterFailure as JobRecord;
      }
      const message = error instanceof Error ? error.message : String(error);
      const retryable = isRetryable(error);
      const exhausted = job.attempts >= job.maxAttempts;

      // A non-retryable failure dead-letters on the spot. Routing it through
      // `fail` would re-queue it with zero backoff, which is a retry storm for an
      // error that cannot succeed — the opposite of what `isRetryable` decided.
      const failed =
        retryable && !exhausted
          ? await this.store.fail(job.id, {
              error: message,
              backoffMs: backoffDelay(definition.retry, job.attempts),
            })
          : await this.store.deadLetter(job.id, message);
      // The observer sees `failed` for a failure that will be retried, and the
      // terminal status otherwise.
      this.emit(failed, failed.status === 'queued' ? 'failed' : undefined);
      return failed;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      if (poller !== undefined) clearInterval(poller);
      this.running -= 1;
    }
  }

  private async reportProgress(
    job: JobRecord,
    progress: { current: number; total: number; label?: string },
  ): Promise<void> {
    await this.store.reportProgress(job.id, progress);
    this.observers.onStatus?.({
      jobId: job.id,
      kind: job.kind as JobKind,
      status: (await this.store.get(job.id))?.status ?? 'running',
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      progress: { ...progress },
      correlationId: job.correlationId,
    });
  }

  private resultPayload(result: unknown): Record<string, unknown> {
    if (result === undefined || result === null) return {};
    if (typeof result === 'object' && !Array.isArray(result)) {
      return result as Record<string, unknown>;
    }
    // A handler returning a scalar is wrapped, never dropped: a result that
    // silently disappears is a result the UI reports as empty.
    return { value: result };
  }

  private emit(job: JobRecord, statusOverride?: JobStatus): void {
    this.observers.onStatus?.({
      jobId: job.id,
      kind: job.kind as JobKind,
      status: statusOverride ?? job.status,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      ...(job.progress === null
        ? {}
        : {
            progress: {
              current: job.progress.current,
              total: job.progress.total,
              ...(job.progress.label === undefined ? {} : { label: job.progress.label }),
            },
          }),
      ...(job.error === null ? {} : { error: job.error }),
      correlationId: job.correlationId,
    });
  }
}
