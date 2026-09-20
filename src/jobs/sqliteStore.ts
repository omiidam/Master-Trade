/**
 * Durable job store — the `jobs` table is the queue.
 *
 * This adapter makes "jobs survive a restart" true rather than aspirational, and
 * it is deliberately thin: the guarantees it needs already exist in
 * `PlatformRepository` (an atomic claim behind a single conditional row update,
 * leases, a UNIQUE idempotency key), which was written with this consumer in mind.
 * Re-implementing that statement here would create a second place for it to be
 * wrong — which is also why this file contains no SQL at all and no driver import.
 *
 * What this adapter adds:
 *
 *   - **Progress, without a schema change.** The `jobs` row is deliberately not
 *     given a progress column: progress is *intermediate state*, and the schema
 *     already has a table for exactly that (`job_scratch` — transient, TTL'd, never
 *     backed up, safe to drop). If scratch is purged, the job record survives and
 *     the UI shows "no progress reported", which is truthful, instead of a bar
 *     frozen at whatever number happened to be persisted.
 *   - **Cancellation that works across processes.** Cancellation is the row's
 *     status, so a worker in this process or another one sees it at its next
 *     checkpoint.
 *   - **One status vocabulary.** The repository's `dead-letter` spelling wins; the
 *     in-memory store was aligned to it rather than the other way round.
 */

import type { JobRow, PlatformRepository } from '../db/repositories/platform.js';
import type { JobProgress, JobRecord, JobStore } from '../../packages/shared/src/jobs/store.js';
import type { JobStatus } from '../../packages/shared/src/jobs/vocabulary.js';

/** Long enough to observe, short enough to be pruned without regret. */
const PROGRESS_TTL_MS = 24 * 60 * 60 * 1_000;

export class SqliteJobStore implements JobStore {
  readonly kind = 'sqlite';
  readonly durable = true;

  constructor(
    private readonly repository: PlatformRepository,
    private readonly now: () => number = Date.now,
  ) {}

  async enqueue(
    input: Parameters<JobStore['enqueue']>[0],
  ): Promise<{ job: JobRecord; created: boolean }> {
    const { job, created } = await this.repository.enqueueJob({
      kind: input.kind,
      payload: input.payload,
      idempotencyKey: input.idempotencyKey,
      maxAttempts: input.maxAttempts,
      priority: input.priority,
      correlationId: input.correlationId ?? undefined,
      delayMs: Math.max(0, input.availableAt - this.now()),
    });
    return { job: this.toRecord(job), created };
  }

  async claim(options: Parameters<JobStore['claim']>[0]): Promise<JobRecord | null> {
    const row = await this.repository.claimJob({
      ...(options.kinds === undefined ? {} : { kinds: options.kinds }),
      leaseMs: options.leaseMs,
    });
    if (!row) return null;
    const record = this.toRecord(row);
    return { ...record, progress: await this.progressFor(record.id) };
  }

  async get(id: string): Promise<JobRecord | null> {
    const row = await this.repository.jobById(id);
    if (!row) return null;
    return { ...this.toRecord(row), progress: await this.progressFor(id) };
  }

  async list(filter: Parameters<JobStore['list']>[0] = {}): Promise<JobRecord[]> {
    const rows = await this.repository.listJobs({
      ...(filter.kind === undefined ? {} : { kind: filter.kind }),
      ...(filter.status === undefined ? {} : { status: filter.status }),
      ...(filter.limit === undefined ? {} : { limit: filter.limit }),
    });
    return rows.map((row) => this.toRecord(row));
  }

  async complete(id: string, result: Record<string, unknown> = {}): Promise<JobRecord> {
    return this.toRecord(await this.repository.completeJob(id, result));
  }

  async fail(id: string, input: { error: string; backoffMs: number }): Promise<JobRecord> {
    return this.toRecord(
      await this.repository.failJob(id, { error: input.error, backoffMs: input.backoffMs }),
    );
  }

  async deadLetter(id: string, error: string): Promise<JobRecord> {
    return this.toRecord(await this.repository.deadLetterJob(id, error));
  }

  async cancel(id: string): Promise<JobRecord> {
    return this.toRecord(await this.repository.cancelJob(id));
  }

  /** Cancellation is the row's status: it survives a restart and crosses processes. */
  async isCancelled(id: string): Promise<boolean> {
    const row = await this.repository.jobById(id);
    return row?.status === 'cancelled';
  }

  /**
   * Progress goes to `job_scratch`. Each report is a new TTL'd row, so the newest
   * one is what `progressFor` returns; expired rows are pruned by the cleanup job
   * and by `purgeScratch`.
   */
  async reportProgress(
    id: string,
    progress: { current: number; total: number; label?: string },
  ): Promise<void> {
    await this.repository.putScratch({
      jobId: id,
      ttlMs: PROGRESS_TTL_MS,
      payload: {
        progress: {
          current: progress.current,
          total: progress.total,
          ...(progress.label === undefined ? {} : { label: progress.label }),
          at: this.now(),
        },
      },
    });
  }

  /** The newest reported progress for a job, or null when none was reported. */
  async progressFor(id: string): Promise<JobProgress | null> {
    const rows = await this.repository.scratchFor(id);
    let newest: JobProgress | null = null;
    for (const row of rows) {
      const payload = row.payload as { progress?: Partial<JobProgress> } | null;
      const progress = payload?.progress;
      if (
        progress === undefined ||
        typeof progress.current !== 'number' ||
        typeof progress.total !== 'number'
      ) {
        continue;
      }
      const at = typeof progress.at === 'number' ? progress.at : 0;
      if (newest === null || at >= newest.at) {
        newest = {
          current: progress.current,
          total: progress.total,
          ...(typeof progress.label === 'string' ? { label: progress.label } : {}),
          at,
        };
      }
    }
    return newest;
  }

  async renewLease(id: string, leaseMs: number): Promise<void> {
    await this.repository.renewJobLease(id, leaseMs);
  }

  async reclaimExpired(limit = 50): Promise<JobRecord[]> {
    const rows = await this.repository.reclaimExpired(limit);
    return rows.map((row) => this.toRecord(row));
  }

  async summary(): Promise<Record<JobStatus, number>> {
    return this.repository.queueSummary();
  }

  /** Purge scratch rows whose TTL has passed; safe to call at any time. */
  async purgeScratch(): Promise<number> {
    return this.repository.purgeScratch();
  }

  private toRecord(row: JobRow): JobRecord {
    return {
      id: row.id,
      kind: row.kind,
      status: row.status as JobStatus,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      priority: row.priority,
      idempotencyKey: row.idempotency_key,
      correlationId: row.correlation_id,
      payload: (row.payload ?? {}) as Record<string, unknown>,
      result: (row.result ?? null) as Record<string, unknown> | null,
      availableAt: Date.parse(row.available_at),
      leaseUntil: row.lease_until === null ? null : Date.parse(row.lease_until),
      error: row.error,
      progress: null,
      createdAt: Date.parse(row.created_at),
      updatedAt: Date.parse(row.updated_at),
    };
  }
}
