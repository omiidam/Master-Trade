/**
 * Background jobs.
 *
 * A single in-process queue with typed job definitions. Job kinds that touch
 * evaluation of trading rules or backtests are gated behind human approval;
 * every kind has an explicit timeout, retry policy and idempotency key prefix.
 *
 * The worker loop is intentionally trivial (`runOnce`) — Phase 2 validates the
 * contract, not a durable scheduler. Swapping in a durable queue later means
 * implementing `JobStore` behind the same interface.
 */

import { PolicyViolationError } from '../core/errors.js';
import {
  backoffDelay,
  withTimeout,
  DEFAULT_RETRY_POLICY,
  type RetryPolicy,
} from '../core/retry.js';

export type JobKind =
  | 'training.gradeSession'
  | 'embedding.generate'
  | 'marketData.ingest'
  | 'backtest.run'
  | 'evaluation.scheduled'
  | 'maintenance.cleanup';

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'dead' | 'cancelled';

export interface JobDefinition {
  kind: JobKind;
  description: string;
  maxAttempts: number;
  timeoutMs: number;
  retry: RetryPolicy;
  /** Idempotency keys are derived from this prefix + caller-supplied suffix. */
  idempotencyKeyPrefix: string;
  requiresApproval: boolean;
  concurrency: number;
}

export const JOB_DEFINITIONS: Record<JobKind, JobDefinition> = {
  'training.gradeSession': {
    kind: 'training.gradeSession',
    description: 'Grade a completed training/exam session deterministically.',
    maxAttempts: 3,
    timeoutMs: 30_000,
    retry: DEFAULT_RETRY_POLICY,
    idempotencyKeyPrefix: 'grade',
    requiresApproval: false,
    concurrency: 2,
  },
  'embedding.generate': {
    kind: 'embedding.generate',
    description: 'Generate embeddings for memory records that lack them.',
    maxAttempts: 3,
    timeoutMs: 60_000,
    retry: DEFAULT_RETRY_POLICY,
    idempotencyKeyPrefix: 'embed',
    requiresApproval: false,
    concurrency: 1,
  },
  'marketData.ingest': {
    kind: 'marketData.ingest',
    description: 'Fetch, validate and store normalized bars from a provider.',
    maxAttempts: 4,
    timeoutMs: 120_000,
    retry: { ...DEFAULT_RETRY_POLICY, attempts: 4, baseDelayMs: 500 },
    idempotencyKeyPrefix: 'ingest',
    requiresApproval: false,
    concurrency: 2,
  },
  'backtest.run': {
    kind: 'backtest.run',
    description: 'Run a deterministic backtest for a proposed rule (deferred capability).',
    maxAttempts: 1,
    timeoutMs: 600_000,
    retry: { ...DEFAULT_RETRY_POLICY, attempts: 1 },
    idempotencyKeyPrefix: 'backtest',
    requiresApproval: true,
    concurrency: 1,
  },
  'evaluation.scheduled': {
    kind: 'evaluation.scheduled',
    description: 'Run the invariant evaluation harness on a schedule.',
    maxAttempts: 2,
    timeoutMs: 120_000,
    retry: DEFAULT_RETRY_POLICY,
    idempotencyKeyPrefix: 'eval',
    requiresApproval: false,
    concurrency: 1,
  },
  'maintenance.cleanup': {
    kind: 'maintenance.cleanup',
    description: 'Purge expired sessions, transient job scratch and stale buffers.',
    maxAttempts: 2,
    timeoutMs: 30_000,
    retry: DEFAULT_RETRY_POLICY,
    idempotencyKeyPrefix: 'cleanup',
    requiresApproval: false,
    concurrency: 1,
  },
};

export interface JobRecord {
  id: string;
  kind: JobKind;
  status: JobStatus;
  attempts: number;
  idempotencyKey: string;
  correlationId: string;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  /** Epoch ms; the job is not runnable before this time. */
  availableAt: number;
  error?: string;
}

export type JobHandler = (job: JobRecord, context: { signal: AbortSignal }) => Promise<void>;

export interface EnqueueInput {
  kind: JobKind;
  /** Caller-supplied unique suffix, e.g. the id of the entity being processed. */
  idempotencyKey: string;
  correlationId: string;
  payload?: Record<string, unknown>;
  /** Present only when a recorded human approval exists. */
  approved?: boolean;
}

export interface JobQueueOptions {
  now?: () => number;
  idFactory?: (kind: JobKind) => string;
}

export class JobQueue {
  private readonly jobs = new Map<string, JobRecord>();
  private readonly byIdempotencyKey = new Map<string, string>();
  private readonly handlers = new Map<JobKind, JobHandler>();
  private readonly now: () => number;
  private readonly idFactory: (kind: JobKind) => string;
  private counter = 0;

  constructor(options: JobQueueOptions = {}) {
    this.now = options.now ?? Date.now;
    this.idFactory =
      options.idFactory ?? ((kind) => `${kind.replace(/\./g, '_')}_${++this.counter}`);
  }

  register(kind: JobKind, handler: JobHandler): void {
    this.handlers.set(kind, handler);
  }

  definition(kind: JobKind): JobDefinition {
    return JOB_DEFINITIONS[kind];
  }

  /** Enqueue. Returns the existing job when the idempotency key repeats. */
  enqueue(input: EnqueueInput): JobRecord {
    const definition = JOB_DEFINITIONS[input.kind];
    if (definition.requiresApproval && input.approved !== true) {
      throw new PolicyViolationError(
        `Job ${input.kind} requires an explicit human approval before it may run.`,
        { kind: input.kind },
      );
    }
    const idempotencyKey = `${definition.idempotencyKeyPrefix}:${input.idempotencyKey}`;
    const existingId = this.byIdempotencyKey.get(idempotencyKey);
    if (existingId) {
      const existing = this.jobs.get(existingId);
      if (existing) return existing;
    }

    const timestamp = new Date(this.now()).toISOString();
    const job: JobRecord = {
      id: this.idFactory(input.kind),
      kind: input.kind,
      status: 'queued',
      attempts: 0,
      idempotencyKey,
      correlationId: input.correlationId,
      payload: input.payload ?? {},
      createdAt: timestamp,
      updatedAt: timestamp,
      availableAt: this.now(),
    };
    this.jobs.set(job.id, job);
    this.byIdempotencyKey.set(idempotencyKey, job.id);
    return job;
  }

  get(id: string): JobRecord | undefined {
    return this.jobs.get(id);
  }

  list(filter: { kind?: JobKind; status?: JobStatus } = {}): JobRecord[] {
    return [...this.jobs.values()].filter(
      (job) =>
        (filter.kind === undefined || job.kind === filter.kind) &&
        (filter.status === undefined || job.status === filter.status),
    );
  }

  cancel(id: string): JobRecord | undefined {
    const job = this.jobs.get(id);
    if (!job || job.status === 'succeeded') return undefined;
    const cancelled: JobRecord = {
      ...job,
      status: 'cancelled',
      updatedAt: new Date(this.now()).toISOString(),
    };
    this.jobs.set(id, cancelled);
    return cancelled;
  }

  /** Process every runnable job once. Returns the jobs touched. */
  async runOnce(): Promise<JobRecord[]> {
    const touched: JobRecord[] = [];
    for (const job of [...this.jobs.values()]) {
      if (job.status !== 'queued' || job.availableAt > this.now()) continue;
      touched.push(await this.execute(job));
    }
    return touched;
  }

  private async execute(job: JobRecord): Promise<JobRecord> {
    const definition = JOB_DEFINITIONS[job.kind];
    const handler = this.handlers.get(job.kind);
    if (!handler) {
      return this.finish(job, 'dead', `No handler registered for ${job.kind}`);
    }

    this.jobs.set(job.id, {
      ...job,
      status: 'running',
      updatedAt: new Date(this.now()).toISOString(),
    });
    try {
      await withTimeout((signal) => handler(job, { signal }), definition.timeoutMs, {
        what: `job:${job.kind}`,
        correlationId: job.correlationId,
      });
      return this.finish(job, 'succeeded');
    } catch (error) {
      const attempts = job.attempts + 1;
      const message = error instanceof Error ? error.message : String(error);
      if (attempts >= definition.maxAttempts) {
        return this.finish({ ...job, attempts }, 'dead', message);
      }
      const delay = backoffDelay(definition.retry, attempts);
      const retried: JobRecord = {
        ...job,
        attempts,
        status: 'queued',
        updatedAt: new Date(this.now()).toISOString(),
        availableAt: this.now() + delay,
        error: message,
      };
      this.jobs.set(job.id, retried);
      return retried;
    }
  }

  private finish(job: JobRecord, status: JobStatus, error?: string): JobRecord {
    const finished: JobRecord = {
      ...job,
      status,
      updatedAt: new Date(this.now()).toISOString(),
    };
    if (error !== undefined) finished.error = error;
    else if (job.error !== undefined) finished.error = job.error;
    this.jobs.set(job.id, finished);
    return finished;
  }
}
