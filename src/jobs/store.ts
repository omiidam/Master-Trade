/**
 * The job store port — where a job lives between enqueue and completion.
 *
 * The queue engine (retry, timeout, cancellation, progress, events) talks to this
 * interface and never to a database or a Map. Two implementations exist:
 *
 *   - `InMemoryJobStore` — the default when no database handle is open. Jobs are
 *     lost on restart, and the readiness report says so rather than implying
 *     durability it does not have.
 *   - `SqliteJobStore` (see `sqliteStore.ts`) — the durable store over the
 *     `jobs` table, with atomic claim, leases and the idempotency key enforced by
 *     a UNIQUE constraint.
 *
 * The port is small on purpose: everything the engine needs to make a guarantee,
 * and nothing that would force an implementation detail (SQL, a connection, a
 * scheduler) on the in-memory case. A Redis/BullMQ adapter later implements the
 * same port — that is the adapter boundary ADR-0018 asks for.
 */

import type { JobStatus } from './vocabulary.js';

export interface JobRecord {
  id: string;
  kind: string;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  priority: number;
  idempotencyKey: string;
  correlationId: string | null;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  /** Epoch ms; the job is not claimable before this time. */
  availableAt: number;
  /** Epoch ms; `null` unless the job is running. A crashed lease is reclaimable. */
  leaseUntil: number | null;
  error: string | null;
  /** Last reported progress, kept out of the persistent job row's meaning. */
  progress: JobProgress | null;
  createdAt: number;
  updatedAt: number;
}

export interface JobProgress {
  current: number;
  total: number;
  label?: string;
  at: number;
}

export interface EnqueueStoreInput {
  id: string;
  kind: string;
  idempotencyKey: string;
  correlationId: string | null;
  payload: Record<string, unknown>;
  maxAttempts: number;
  priority: number;
  availableAt: number;
}

export interface ClaimOptions {
  kinds?: readonly string[];
  leaseMs: number;
}

export interface JobStore {
  /** Human-readable identity, reported by the health check. */
  readonly kind: string;
  /** Whether jobs survive a process restart. */
  readonly durable: boolean;
  /**
   * Enqueue unless the idempotency key already exists, in which case return the
   * existing record with `created: false`. This is the duplicate-prevention
   * guarantee, and it must hold under concurrent callers.
   */
  enqueue(input: EnqueueStoreInput): Promise<{ job: JobRecord; created: boolean }>;
  /** Atomically take one runnable job. Returns null when there is nothing to do. */
  claim(options: ClaimOptions): Promise<JobRecord | null>;
  get(id: string): Promise<JobRecord | null>;
  list(filter?: { kind?: string; status?: JobStatus; limit?: number }): Promise<JobRecord[]>;
  /** Terminal success. */
  complete(id: string, result?: Record<string, unknown>): Promise<JobRecord>;
  /** Record a failure; the store decides retry vs dead-letter from the budget. */
  fail(id: string, input: { error: string; backoffMs: number }): Promise<JobRecord>;
  /**
   * Move a job straight to `dead-letter`, skipping the retry budget. Used for a
   * failure that cannot be fixed by trying again — no handler is registered for
   * the kind, so a retry would only burn the budget and hide the misconfiguration.
   */
  deadLetter(id: string, error: string): Promise<JobRecord>;
  /** Cooperative cancellation request; the engine observes it at the next checkpoint. */
  cancel(id: string): Promise<JobRecord>;
  /** Is this job cancelled? Checked inside a running handler. */
  isCancelled(id: string): Promise<boolean>;
  /** Progress for a running job. Never changes the job's status. */
  reportProgress(
    id: string,
    progress: { current: number; total: number; label?: string },
  ): Promise<void>;
  progressFor(id: string): Promise<JobProgress | null>;
  /** Extend a lease so a long job is not reclaimed while it is working. */
  renewLease(id: string, leaseMs: number): Promise<void>;
  /** Return jobs whose worker died to the queue. */
  reclaimExpired(limit?: number): Promise<JobRecord[]>;
  /** Counts per status, for the UI and the health check. */
  summary(): Promise<Record<JobStatus, number>>;
}

/** Default lease: a job whose worker vanishes is reclaimable after this. */
export const DEFAULT_LEASE_MS = 60_000;

/**
 * In-memory store. Single-process by construction, so the atomicity a database
 * gets from a conditional row update comes free from the event loop.
 */
export class InMemoryJobStore implements JobStore {
  readonly kind = 'in-memory';
  readonly durable = false;

  private readonly jobs = new Map<string, JobRecord>();
  private readonly byKey = new Map<string, string>();

  constructor(private readonly now: () => number = Date.now) {}

  async enqueue(input: EnqueueStoreInput): Promise<{ job: JobRecord; created: boolean }> {
    const existingId = this.byKey.get(input.idempotencyKey);
    if (existingId !== undefined) {
      const existing = this.jobs.get(existingId);
      if (existing) return { job: existing, created: false };
    }
    const timestamp = this.now();
    const job: JobRecord = {
      id: input.id,
      kind: input.kind,
      status: 'queued',
      attempts: 0,
      maxAttempts: input.maxAttempts,
      priority: input.priority,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      payload: input.payload,
      result: null,
      availableAt: input.availableAt,
      leaseUntil: null,
      error: null,
      progress: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.jobs.set(job.id, job);
    this.byKey.set(input.idempotencyKey, job.id);
    return { job, created: true };
  }

  async claim(options: ClaimOptions): Promise<JobRecord | null> {
    const at = this.now();
    const runnable = [...this.jobs.values()]
      .filter(
        (job) =>
          job.status === 'queued' &&
          job.availableAt <= at &&
          (options.kinds === undefined ||
            options.kinds.length === 0 ||
            options.kinds.includes(job.kind)),
      )
      .sort((a, b) => a.priority - b.priority || a.availableAt - b.availableAt);
    const next = runnable[0];
    if (!next) return null;
    return this.update(next.id, {
      status: 'running',
      attempts: next.attempts + 1,
      leaseUntil: at + options.leaseMs,
    });
  }

  async get(id: string): Promise<JobRecord | null> {
    return this.jobs.get(id) ?? null;
  }

  async list(
    filter: { kind?: string; status?: JobStatus; limit?: number } = {},
  ): Promise<JobRecord[]> {
    const rows = [...this.jobs.values()]
      .filter((job) => filter.kind === undefined || job.kind === filter.kind)
      .filter((job) => filter.status === undefined || job.status === filter.status)
      .sort((a, b) => a.createdAt - b.createdAt);
    return filter.limit === undefined ? rows : rows.slice(0, filter.limit);
  }

  async complete(id: string, result: Record<string, unknown> = {}): Promise<JobRecord> {
    return this.update(id, { status: 'succeeded', result, leaseUntil: null, error: null });
  }

  async fail(id: string, input: { error: string; backoffMs: number }): Promise<JobRecord> {
    const job = this.require(id);
    const exhausted = job.attempts >= job.maxAttempts;
    return this.update(id, {
      status: exhausted ? 'dead-letter' : 'queued',
      error: input.error.slice(0, 2_000),
      leaseUntil: null,
      availableAt: this.now() + input.backoffMs,
    });
  }

  async deadLetter(id: string, error: string): Promise<JobRecord> {
    return this.update(id, {
      status: 'dead-letter',
      error: error.slice(0, 2_000),
      leaseUntil: null,
    });
  }

  async cancel(id: string): Promise<JobRecord> {
    const job = this.require(id);
    if (job.status === 'succeeded' || job.status === 'dead-letter') return job;
    // Cancellation is recorded in the row itself, which is why it works across
    // processes: a queued job never runs, and a running job's worker sees the new
    // status at its next checkpoint and stops. The status is `cancelled` from the
    // user's point of view immediately, and the engine refuses to overwrite it
    // with a late success.
    return this.update(id, { status: 'cancelled', leaseUntil: null });
  }

  async isCancelled(id: string): Promise<boolean> {
    return this.jobs.get(id)?.status === 'cancelled';
  }

  async reportProgress(
    id: string,
    progress: { current: number; total: number; label?: string },
  ): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;
    this.jobs.set(id, { ...job, progress: { ...progress, at: this.now() } });
  }

  async progressFor(id: string): Promise<JobProgress | null> {
    return this.jobs.get(id)?.progress ?? null;
  }

  async renewLease(id: string, leaseMs: number): Promise<void> {
    const job = this.jobs.get(id);
    if (!job || job.status !== 'running') return;
    this.jobs.set(id, { ...job, leaseUntil: this.now() + leaseMs });
  }

  async reclaimExpired(limit = 50): Promise<JobRecord[]> {
    const at = this.now();
    const stale = [...this.jobs.values()]
      .filter((job) => job.status === 'running' && job.leaseUntil !== null && job.leaseUntil <= at)
      .slice(0, limit);
    const reclaimed: JobRecord[] = [];
    for (const job of stale) {
      reclaimed.push(
        this.update(job.id, {
          status: 'queued',
          leaseUntil: null,
          error: 'lease expired: the worker did not finish in time',
        }),
      );
    }
    return reclaimed;
  }

  async summary(): Promise<Record<JobStatus, number>> {
    const summary: Record<JobStatus, number> = {
      queued: 0,
      running: 0,
      succeeded: 0,
      failed: 0,
      'dead-letter': 0,
      cancelled: 0,
    };
    for (const job of this.jobs.values()) summary[job.status] += 1;
    return summary;
  }

  private require(id: string): JobRecord {
    const job = this.jobs.get(id);
    if (!job) throw new Error(`job ${id} is not in this store`);
    return job;
  }

  private update(id: string, patch: Partial<JobRecord>): JobRecord {
    const current = this.require(id);
    const next: JobRecord = { ...current, ...patch, updatedAt: this.now() };
    this.jobs.set(id, next);
    return next;
  }
}
