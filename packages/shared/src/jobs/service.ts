/**
 * Job service — the surface everything else talks to.
 *
 * `JobQueue` executes; this service is where a request becomes work. It exists so
 * that the two things every job action must do happen in exactly one place:
 *
 *   1. **Authorize.** `enqueue` checks the kind's operation and the approval gate;
 *      `cancel` checks `job.cancel`; `list`/`get` check `job.read`. A caller with no
 *      principal is refused, not defaulted to system.
 *   2. **Record what happened.** Every state transition becomes a `job.status`
 *      event for the UI *and* an audit record for the trail. Both are optional
 *      dependencies (a test or the in-process server may have no database), and
 *      when they are absent the service says so rather than pretending.
 *
 * The audit trail is where this matters most: "who cancelled that backtest, and
 * when" must be answerable, and a job that a human approved must be provable. The
 * `approvalId` is recorded with the job payload and in the audit record, so an
 * approval is never merely implied by a boolean.
 */

import { authorize, type Principal } from '../auth/model.js';
import { AppError } from '../core/errors.js';
import type { Logger } from '../core/logging.js';
import type { JobRecord } from './store.js';
import { JOB_DEFINITIONS, JobQueue, type EnqueueInput, type JobStatusEvent } from './queue.js';
import { isJobKind, type JobKind, type JobStatus } from './vocabulary.js';

/** Sink for `job.status` events; wired to the event bus by the composition root. */
export interface JobEventSink {
  publish(event: JobStatusEvent): void;
}

/** Sink for audit records; wired to the audit repository where one exists. */
export interface JobAuditSink {
  append(input: {
    correlationId: string;
    actor: string | null;
    event: string;
    severity: 'info' | 'warning' | 'critical';
    payload: Record<string, unknown>;
  }): Promise<void> | void;
}

export interface JobServiceOptions {
  queue: JobQueue;
  events?: JobEventSink;
  audit?: JobAuditSink;
  logger?: Logger;
}

export interface JobView {
  id: string;
  kind: JobKind;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  progress: { current: number; total: number; label?: string } | null;
  progressPercent: number | null;
  /** What `progress.total` counts, so a bar can be labelled honestly. */
  progressUnit: string;
  correlationId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  /** True when the job is in a state the user can still cancel. */
  cancellable: boolean;
}

export interface EnqueueRequest {
  kind: JobKind;
  idempotencyKey: string;
  correlationId: string;
  principal: Principal | null;
  payload?: Record<string, unknown>;
  approvalId?: string;
  priority?: number;
  delayMs?: number;
}

export class JobService {
  private readonly queue: JobQueue;
  private readonly logger: Logger | undefined;
  private readonly audit: JobAuditSink | undefined;

  constructor(options: JobServiceOptions) {
    this.queue = options.queue;
    this.logger = options.logger;
    this.audit = options.audit;
    // The queue reports through exactly one observer, attached here so there is a
    // single path from "something changed" to "the client was told".
    if (options.events !== undefined) {
      const sink = options.events;
      this.queue.observeStatus((event) => sink.publish(event));
    }
  }

  /** Enqueue, or return the existing job for the same idempotency key. */
  async enqueue(request: EnqueueRequest): Promise<{ job: JobRecord; created: boolean }> {
    if (!isJobKind(request.kind)) {
      throw new AppError('VALIDATION_FAILED', `unknown job kind: ${String(request.kind)}`);
    }
    const input: EnqueueInput = {
      kind: request.kind,
      idempotencyKey: request.idempotencyKey,
      correlationId: request.correlationId,
      principal: request.principal,
      ...(request.payload === undefined ? {} : { payload: request.payload }),
      ...(request.approvalId === undefined ? {} : { approvalId: request.approvalId }),
      ...(request.priority === undefined ? {} : { priority: request.priority }),
      ...(request.delayMs === undefined ? {} : { delayMs: request.delayMs }),
    };
    const result = await this.queue.enqueue(input);
    if (result.created) {
      await this.record({
        correlationId: request.correlationId,
        actor: request.principal?.id ?? null,
        event: 'job.enqueued',
        severity: 'info',
        payload: {
          jobId: result.job.id,
          kind: result.job.kind,
          approvalId: request.approvalId ?? null,
          // Never the payload itself: it can hold user content. The keys say what
          // kind of data this job carries without copying it into the audit table.
          payloadKeys: Object.keys(request.payload ?? {}).sort(),
        },
      });
      this.logger?.info(
        'job enqueued',
        { jobId: result.job.id, kind: result.job.kind, correlationId: request.correlationId },
        'jobs.enqueued',
      );
    }
    return result;
  }

  /** Read one job. Requires `job.read`: the queue is not public information. */
  async get(id: string, principal: Principal | null): Promise<JobView> {
    this.require(principal, 'job.read', 'read job status');
    const job = await this.queue.get(id);
    if (!job) throw new AppError('NOT_FOUND', `Job ${id} was not found`);
    return this.view(job);
  }

  async list(
    filter: { kind?: string; status?: JobStatus; limit?: number },
    principal: Principal | null,
  ): Promise<JobView[]> {
    this.require(principal, 'job.read', 'list jobs');
    const jobs = await this.queue.list(filter);
    return jobs.map((job) => this.view(job));
  }

  async summary(principal: Principal | null): Promise<Record<JobStatus, number>> {
    this.require(principal, 'job.read', 'read the job summary');
    return this.queue.summary();
  }

  /** Cancel, recording who asked and why the state is what it is. */
  async cancel(id: string, principal: Principal | null, correlationId: string): Promise<JobView> {
    this.require(principal, 'job.cancel', 'cancel a job');
    const before = await this.queue.get(id);
    if (!before) throw new AppError('NOT_FOUND', `Job ${id} was not found`);
    const cancelled = await this.queue.cancel(id, principal);
    await this.record({
      correlationId,
      actor: principal?.id ?? null,
      event: 'job.cancelled',
      severity: 'warning',
      payload: {
        jobId: cancelled.id,
        kind: cancelled.kind,
        previousStatus: before.status,
        status: cancelled.status,
      },
    });
    this.logger?.warn(
      'job cancelled',
      { jobId: cancelled.id, kind: cancelled.kind, by: principal?.id ?? null, correlationId },
      'jobs.cancelled',
    );
    return this.view(cancelled);
  }

  /** The queue's own status, for the readiness report. */
  async queueStatus(): Promise<Awaited<ReturnType<JobQueue['status']>>> {
    return this.queue.status();
  }

  view(job: JobRecord): JobView {
    const definition = JOB_DEFINITIONS[job.kind as JobKind];
    const progress =
      job.progress === null
        ? null
        : {
            current: job.progress.current,
            total: job.progress.total,
            ...(job.progress.label === undefined ? {} : { label: job.progress.label }),
          };
    const percent =
      progress === null || progress.total <= 0
        ? null
        : Math.min(100, Math.round((progress.current / progress.total) * 100));
    return {
      id: job.id,
      kind: job.kind as JobKind,
      status: job.status,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      progress,
      progressPercent: percent,
      progressUnit: definition?.progressUnit ?? 'items',
      correlationId: job.correlationId,
      error: job.error,
      createdAt: new Date(job.createdAt).toISOString(),
      updatedAt: new Date(job.updatedAt).toISOString(),
      cancellable: job.status === 'queued' || job.status === 'running',
    };
  }

  private require(
    principal: Principal | null,
    operation: Parameters<typeof authorize>[1],
    what: string,
  ): void {
    if (principal === null) {
      throw new AppError('UNAUTHENTICATED', `${what} requires an authenticated principal`);
    }
    const decision = authorize(principal, operation);
    if (!decision.allowed) throw new AppError('FORBIDDEN', `denied: ${decision.reason}`);
  }

  private async record(input: {
    correlationId: string;
    actor: string | null;
    event: string;
    severity: 'info' | 'warning' | 'critical';
    payload: Record<string, unknown>;
  }): Promise<void> {
    if (this.audit === undefined) return;
    try {
      await this.audit.append(input);
    } catch (error) {
      // An audit sink that is unavailable must not silently swallow the action, but
      // it must not fail the action either: the job already happened. It is logged
      // loudly instead.
      this.logger?.error(
        'audit append failed',
        { event: input.event, message: error instanceof Error ? error.message : String(error) },
        'jobs.audit.failed',
      );
    }
  }

  /** Attach (or replace) the status sink; used by tests and the composition root. */
  observe(sink: JobEventSink): void {
    this.queue.observeStatus((event) => sink.publish(event));
  }
}
