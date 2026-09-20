/**
 * Platform repository — owner: `platform`.
 *
 * Settings, file metadata, and the job queue. The queue is the interesting part:
 * it is a *database* queue (ADR-0018), so the guarantees have to hold in SQL
 * rather than in a process's memory.
 *
 *   - **Idempotency.** `enqueue` is keyed by `idempotency_key`; a repeated
 *     enqueue returns the existing job instead of creating a second one, so a
 *     retried request cannot double-run an embedding job.
 *   - **Atomic claim.** `claim` is a single conditional UPDATE: two workers
 *     cannot both take the same job, and the loser sees nothing to do.
 *   - **Lease expiry.** A crashed worker leaves `lease_until` in the past, and
 *     `reclaimExpired` returns those jobs to `queued` — a dead process must not
 *     wedge work permanently.
 *   - **Backoff and dead-letter.** `fail` increments attempts, schedules
 *     `available_at` in the future, and moves the job to `dead-letter` when the
 *     attempt budget is spent.
 */

import { AppError } from '../../core/errors.js';
import { ids } from '../../core/ids.js';
import type { SqlExecutor } from '../executor.js';
import { Table } from '../table.js';
import type { Owner } from '../ownership.js';
import type { TableName } from '../schema.js';

export const OWNER: Owner = 'platform';
export const OWNED_TABLES: readonly TableName[] = [
  'settings',
  'files',
  'jobs',
  'job_scratch',
  'market_data_bars',
];

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'dead-letter' | 'cancelled';
export type FileCategory = 'document' | 'dataset' | 'chart-image' | 'report-export' | 'attachment';

export interface SettingRow {
  id: string;
  user_id: string | null;
  key: string;
  value: unknown;
  updated_at: string;
}

export interface FileRow {
  id: string;
  owner_id: string;
  category: FileCategory;
  filename: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  sensitivity: 'normal' | 'sensitive';
  provenance_ref: string | null;
  created_at: string;
}

export interface JobRow {
  id: string;
  kind: string;
  status: JobStatus;
  idempotency_key: string;
  payload: unknown;
  result: unknown;
  attempts: number;
  max_attempts: number;
  priority: number;
  available_at: string;
  lease_until: string | null;
  correlation_id: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobScratchRow {
  id: string;
  job_id: string;
  payload: unknown;
  expires_at: string;
}

export interface PlatformRepositoryOptions {
  now?: () => number;
  newId?: (kind: string) => string;
  /** Lease applied to a claimed job; a crashed worker is reclaimed after this. */
  defaultLeaseMs?: number;
}

const DEFAULT_LEASE_MS = 60_000;

export class PlatformRepository {
  private readonly db: SqlExecutor;
  private readonly settings: Table<SettingRow>;
  private readonly files: Table<FileRow>;
  private readonly jobs: Table<JobRow>;
  private readonly scratch: Table<JobScratchRow>;
  private readonly now: () => number;
  private readonly newId: (kind: string) => string;
  private readonly leaseMs: number;

  constructor(db: SqlExecutor, options: PlatformRepositoryOptions = {}) {
    this.db = db;
    this.settings = new Table<SettingRow>(db, 'settings');
    this.files = new Table<FileRow>(db, 'files');
    this.jobs = new Table<JobRow>(db, 'jobs');
    this.scratch = new Table<JobScratchRow>(db, 'job_scratch');
    this.now = options.now ?? Date.now;
    this.newId = options.newId ?? ((kind) => ids.id(kind));
    this.leaseMs = options.defaultLeaseMs ?? DEFAULT_LEASE_MS;
  }

  private iso(at: number = this.now()): string {
    return new Date(at).toISOString();
  }

  /* ------------------------------------------------------------- settings */

  /** Scoped preference (`userId = null` means application-wide). */
  async putSetting(input: {
    userId?: string | null;
    key: string;
    value: unknown;
  }): Promise<SettingRow> {
    if (/(secret|password|token|api[_-]?key)/i.test(input.key)) {
      throw new AppError(
        'VALIDATION_FAILED',
        'Settings hold preferences, not secrets. Use the OS keychain through a SecretRef.',
        { details: { key: input.key } },
      );
    }
    const userId = input.userId ?? null;
    const existing = await this.settings.findOne({ user_id: userId, key: input.key });
    if (existing) {
      const updated = await this.settings.update(existing.id, {
        value: input.value,
        updated_at: this.iso(),
      });
      if (!updated) throw new AppError('INTERNAL', 'Setting update did not persist');
      return updated;
    }
    return this.settings.insert({
      id: this.newId('set'),
      user_id: userId,
      key: input.key,
      value: input.value,
      updated_at: this.iso(),
    });
  }

  async getSetting(key: string, userId?: string | null): Promise<unknown | null> {
    const scoped = await this.settings.findOne({ user_id: userId ?? null, key });
    if (scoped) return scoped.value;
    if (userId !== undefined && userId !== null) {
      const global = await this.settings.findOne({ user_id: null, key });
      return global?.value ?? null;
    }
    return null;
  }

  settingsFor(userId?: string | null): Promise<SettingRow[]> {
    return this.settings.findMany(userId === undefined ? {} : { user_id: userId ?? null }, {
      orderBy: 'updated_at',
      direction: 'desc',
      limit: 500,
    });
  }

  /* ---------------------------------------------------------------- files */

  async recordFile(input: {
    ownerId: string;
    category: FileCategory;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    sha256: string;
    sensitivity?: 'normal' | 'sensitive';
    provenanceRef?: string;
  }): Promise<FileRow> {
    if (input.sizeBytes <= 0) {
      throw new AppError('VALIDATION_FAILED', 'An empty file cannot be recorded');
    }
    if (!/^[0-9a-f]{64}$/.test(input.sha256)) {
      throw new AppError('VALIDATION_FAILED', 'File metadata requires a sha256 content hash');
    }
    return this.files.insert({
      id: this.newId('file'),
      owner_id: input.ownerId,
      category: input.category,
      filename: input.filename,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      sha256: input.sha256,
      sensitivity: input.sensitivity ?? 'normal',
      provenance_ref: input.provenanceRef ?? null,
      created_at: this.iso(),
    });
  }

  fileById(id: string): Promise<FileRow | null> {
    return this.files.findById(id);
  }

  filesForOwner(ownerId: string): Promise<FileRow[]> {
    return this.files.findMany({ owner_id: ownerId }, { orderBy: 'created_at', direction: 'desc' });
  }

  /** Total bytes held for an owner, for quota enforcement before a write. */
  async bytesForOwner(ownerId: string): Promise<number> {
    const rows = await this.files.findMany({ owner_id: ownerId }, { limit: 10_000 });
    return rows.reduce((total, row) => total + row.size_bytes, 0);
  }

  deleteFile(id: string): Promise<boolean> {
    return this.files.deleteById(id);
  }

  /* ----------------------------------------------------------------- jobs */

  /**
   * Enqueue, or return the existing job with the same idempotency key. A retried
   * request therefore cannot cause a second run of the same work.
   */
  async enqueueJob(input: {
    kind: string;
    payload?: Record<string, unknown>;
    idempotencyKey?: string;
    priority?: number;
    maxAttempts?: number;
    correlationId?: string;
    delayMs?: number;
  }): Promise<{ job: JobRow; created: boolean }> {
    const key = input.idempotencyKey ?? `${input.kind}:${this.newId('key')}`;
    const existing = await this.jobs.findOne({ idempotency_key: key });
    if (existing) return { job: existing, created: false };

    const at = this.now();
    const job = await this.jobs.insert({
      id: this.newId('job'),
      kind: input.kind,
      status: 'queued',
      idempotency_key: key,
      payload: input.payload ?? {},
      result: null,
      attempts: 0,
      max_attempts: input.maxAttempts ?? 3,
      priority: input.priority ?? 5,
      available_at: this.iso(at + (input.delayMs ?? 0)),
      lease_until: null,
      correlation_id: input.correlationId ?? null,
      error: null,
      created_at: this.iso(at),
      updated_at: this.iso(at),
    });
    return { job, created: true };
  }

  /**
   * Claim one job atomically: the UPDATE only matches a queued, available job and
   * sets the lease in the same statement, so two workers cannot win the same row.
   * Returns null when there is nothing to do.
   */
  async claimJob(
    input: { kinds?: readonly string[]; leaseMs?: number } = {},
  ): Promise<JobRow | null> {
    const at = this.now();
    const leaseUntil = this.iso(at + (input.leaseMs ?? this.leaseMs));
    const dialect = this.db.dialect;
    const kindFilter =
      input.kinds === undefined || input.kinds.length === 0
        ? ''
        : ` AND ${dialect.quote('kind')} IN (${input.kinds.map(() => '?').join(', ')})`;

    const candidate = await this.db.queryOne(
      `SELECT ${dialect.quote('id')} AS id FROM ${dialect.quote('jobs')}
        WHERE ${dialect.quote('status')} = 'queued' AND ${dialect.quote('available_at')} <= ?${kindFilter}
        ORDER BY ${dialect.quote('priority')} ASC, ${dialect.quote('available_at')} ASC
        ${dialect.limitClause(1, 0)}`,
      [this.iso(at), ...(input.kinds ?? [])],
    );
    if (!candidate) return null;

    // The `status = 'queued'` predicate is what makes this atomic: if another
    // worker claimed the row in the meantime, zero rows change and this call
    // reports "nothing to do" instead of double-running the job.
    const claimed = await this.db.execute(
      `UPDATE ${dialect.quote('jobs')}
          SET ${dialect.quote('status')} = 'running',
              ${dialect.quote('lease_until')} = ?,
              ${dialect.quote('attempts')} = ${dialect.quote('attempts')} + 1,
              ${dialect.quote('updated_at')} = ?
        WHERE ${dialect.quote('id')} = ? AND ${dialect.quote('status')} = 'queued'`,
      [leaseUntil, this.iso(at), String(candidate.id)],
    );
    if (claimed.changes === 0) return null;
    return this.jobs.findById(String(candidate.id));
  }

  /** Terminal success. The result is stored, never merged into the payload. */
  async completeJob(id: string, result?: Record<string, unknown>): Promise<JobRow> {
    const updated = await this.jobs.update(id, {
      status: 'succeeded',
      result: result ?? {},
      lease_until: null,
      error: null,
      updated_at: this.iso(),
    });
    if (!updated) throw new AppError('NOT_FOUND', `Job ${id} was not found`);
    return updated;
  }

  /**
   * Record a failure. Retries get exponential backoff; when the attempt budget is
   * spent the job is dead-lettered instead of retried forever.
   */
  async failJob(id: string, input: { error: string; backoffMs?: number }): Promise<JobRow> {
    const job = await this.jobs.findById(id);
    if (!job) throw new AppError('NOT_FOUND', `Job ${id} was not found`);
    const exhausted = job.attempts >= job.max_attempts;
    const backoff = input.backoffMs ?? Math.min(60_000, 2 ** Math.max(0, job.attempts - 1) * 1_000);
    const updated = await this.jobs.update(id, {
      status: exhausted ? 'dead-letter' : 'queued',
      error: input.error.slice(0, 2_000),
      lease_until: null,
      available_at: this.iso(this.now() + backoff),
      updated_at: this.iso(),
    });
    if (!updated) throw new AppError('INTERNAL', 'Job failure did not persist');
    return updated;
  }

  /**
   * Dead-letter a job without retrying it. For failures a retry cannot fix — a
   * kind with no registered handler — retrying would spend the attempt budget to
   * reach the same result and delay the visible misconfiguration.
   */
  async deadLetterJob(id: string, error: string): Promise<JobRow> {
    const updated = await this.jobs.update(id, {
      status: 'dead-letter',
      error: error.slice(0, 2_000),
      lease_until: null,
      updated_at: this.iso(),
    });
    if (!updated) throw new AppError('NOT_FOUND', `Job ${id} was not found`);
    return updated;
  }

  /** Return jobs whose worker died to the queue. */
  async reclaimExpired(limit = 50): Promise<JobRow[]> {
    const at = this.iso();
    const stale = (await this.jobs.findMany({ status: 'running' }, { limit })).filter(
      (job) => job.lease_until !== null && job.lease_until <= at,
    );
    const reclaimed: JobRow[] = [];
    for (const job of stale) {
      const updated = await this.jobs.update(job.id, {
        status: 'queued',
        lease_until: null,
        error: 'lease expired: the worker did not finish in time',
        updated_at: at,
      });
      if (updated) reclaimed.push(updated);
    }
    return reclaimed;
  }

  jobById(id: string): Promise<JobRow | null> {
    return this.jobs.findById(id);
  }

  jobsByStatus(status: JobStatus, limit = 200): Promise<JobRow[]> {
    return this.jobs.findMany({ status }, { orderBy: 'created_at', direction: 'asc', limit });
  }

  /** Job list for the queue view: newest first, optionally filtered. */
  listJobs(filter: { kind?: string; status?: JobStatus; limit?: number } = {}): Promise<JobRow[]> {
    return this.jobs.findMany(
      {
        ...(filter.kind === undefined ? {} : { kind: filter.kind }),
        ...(filter.status === undefined ? {} : { status: filter.status }),
      },
      { orderBy: 'created_at', direction: 'desc', limit: filter.limit ?? 200 },
    );
  }

  /**
   * Push a running job's lease forward. A worker that renews is never reclaimed by
   * its own queue, so `reclaimExpired` only ever means "the worker is gone".
   */
  async renewJobLease(id: string, leaseMs: number): Promise<JobRow> {
    const job = await this.jobs.findById(id);
    if (!job) throw new AppError('NOT_FOUND', `Job ${id} was not found`);
    // Renewing a job that is no longer running must not resurrect it: a cancelled
    // or finished job keeps its terminal state.
    if (job.status !== 'running') return job;
    const updated = await this.jobs.update(id, {
      lease_until: this.iso(this.now() + leaseMs),
      updated_at: this.iso(),
    });
    if (!updated) throw new AppError('INTERNAL', 'Lease renewal did not persist');
    return updated;
  }

  async cancelJob(id: string): Promise<JobRow> {
    const job = await this.jobs.findById(id);
    if (!job) throw new AppError('NOT_FOUND', `Job ${id} was not found`);
    if (job.status === 'succeeded' || job.status === 'dead-letter') {
      throw new AppError('CONFLICT', `A ${job.status} job cannot be cancelled`, {
        details: { id, status: job.status },
      });
    }
    const updated = await this.jobs.update(id, {
      status: 'cancelled',
      lease_until: null,
      updated_at: this.iso(),
    });
    if (!updated) throw new AppError('INTERNAL', 'Job cancellation did not persist');
    return updated;
  }

  async queueSummary(): Promise<Record<JobStatus, number>> {
    const rows = await this.jobs.findMany({}, { limit: 5_000 });
    const summary: Record<JobStatus, number> = {
      queued: 0,
      running: 0,
      succeeded: 0,
      failed: 0,
      'dead-letter': 0,
      cancelled: 0,
    };
    for (const row of rows) summary[row.status] += 1;
    return summary;
  }

  /* --------------------------------------------------------------- scratch */

  /** Intermediate job state with a TTL; losing it costs a recomputation. */
  async putScratch(input: {
    jobId: string;
    payload: Record<string, unknown>;
    ttlMs?: number;
  }): Promise<JobScratchRow> {
    return this.scratch.insert({
      id: this.newId('scr'),
      job_id: input.jobId,
      payload: input.payload,
      expires_at: this.iso(this.now() + (input.ttlMs ?? 48 * 60 * 60 * 1_000)),
    });
  }

  scratchFor(jobId: string): Promise<JobScratchRow[]> {
    return this.scratch.findMany({ job_id: jobId }, { orderBy: 'expires_at', direction: 'asc' });
  }

  async purgeScratch(): Promise<number> {
    const before = await this.scratch.count();
    await this.db.execute(
      `DELETE FROM ${this.db.dialect.quote('job_scratch')} WHERE ${this.db.dialect.quote('expires_at')} <= ?`,
      [this.iso()],
    );
    return before - (await this.scratch.count());
  }
}

export function createPlatformRepository(
  db: SqlExecutor,
  options: PlatformRepositoryOptions = {},
): PlatformRepository {
  return new PlatformRepository(db, options);
}
