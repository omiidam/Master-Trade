/**
 * Worker pool — the part that turns the queue engine into a background service.
 *
 * One pool per process, with per-kind concurrency from the definitions. The loop
 * is deliberately small and observable:
 *
 *   tick(): reclaim expired leases → claim while under the per-kind limit → run
 *
 * Three properties matter more than throughput:
 *
 *   - **A kind never exceeds its concurrency.** `backtest.run` is 1 on purpose: a
 *     heavy deterministic run must not saturate the machine while the user is
 *     studying, and the limit is data (in the definition), not a comment.
 *   - **Leases are renewed while a job runs**, so "reclaim" only ever means "the
 *     worker really died" rather than "the job was slow".
 *   - **Shutdown drains rather than aborts.** `stop()` stops claiming, waits for
 *     in-flight handlers up to a deadline, and *returns* how many were still
 *     running so the number is reportable instead of swallowed.
 *
 * Decisions are synchronous and deterministic (`tick()` is awaitable and takes no
 * real time); only scheduling is asynchronous. Tests call `tick()`; the process
 * calls `start()`.
 */

import type { Logger } from '../core/logging.js';
import { JOB_DEFINITIONS, type JobQueue, type JobKind } from './queue.js';
import type { JobRecord } from './store.js';

export interface WorkerPoolOptions {
  queue: JobQueue;
  /** Milliseconds between ticks. */
  intervalMs?: number;
  /** Lease renewal cadence. Kept below the lease the queue grants. */
  renewEveryMs?: number;
  /** How long `stop()` waits for in-flight handlers. */
  drainTimeoutMs?: number;
  logger?: Logger;
  setInterval?: (handler: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
  /** Injected so a test never sleeps for real. */
  sleep?: (ms: number) => Promise<void>;
}

export interface WorkerPoolSnapshot {
  started: boolean;
  stopped: boolean;
  running: boolean;
  ticks: number;
  claimed: number;
  inFlight: number;
  reclaimed: number;
  concurrency: Record<string, number>;
  lastTickAt: string | null;
  lastError: string | null;
}

export class JobWorkerPool {
  private readonly queue: JobQueue;
  private readonly intervalMs: number;
  private readonly renewEveryMs: number;
  private readonly drainTimeoutMs: number;
  private readonly logger: Logger | undefined;
  private readonly setIntervalImpl: (handler: () => void, ms: number) => unknown;
  private readonly clearIntervalImpl: (handle: unknown) => void;
  private readonly sleep: (ms: number) => Promise<void>;

  private handle: unknown = null;
  private startedAt: number | null = null;
  private stopped = false;
  private ticking = false;
  private ticks = 0;
  private claimed = 0;
  private reclaimed = 0;
  private lastTickAt: string | null = null;
  private lastError: string | null = null;
  private readonly inFlight = new Map<string, Promise<JobRecord>>();
  private readonly inFlightPerKind = new Map<JobKind, number>();

  constructor(options: WorkerPoolOptions) {
    this.queue = options.queue;
    this.intervalMs = options.intervalMs ?? 1_000;
    this.renewEveryMs = options.renewEveryMs ?? Math.max(1_000, options.queue.leaseMsValue() / 4);
    this.drainTimeoutMs = options.drainTimeoutMs ?? 10_000;
    this.logger = options.logger;
    this.setIntervalImpl =
      options.setInterval ?? ((handler, ms) => setInterval(handler, ms) as unknown);
    this.clearIntervalImpl = options.clearInterval ?? ((handle) => clearInterval(handle as never));
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  start(): void {
    // A stopped pool must refuse rather than look idempotent: silently returning
    // would leave a caller believing work is being pulled when nothing is.
    if (this.stopped) {
      throw new Error('a stopped worker pool cannot be restarted; construct a new one');
    }
    if (this.startedAt !== null) return;
    this.startedAt = Date.now();
    this.handle = this.setIntervalImpl(() => {
      void this.tick().catch((error: unknown) => {
        this.lastError = error instanceof Error ? error.message : String(error);
        this.logger?.error(
          'worker tick failed',
          { message: this.lastError },
          'jobs.worker.tick.failed',
        );
      });
    }, this.intervalMs);
    this.logger?.info(
      'job worker pool started',
      { intervalMs: this.intervalMs, kinds: this.queue.registeredKinds().length },
      'jobs.worker.started',
    );
  }

  isRunning(): boolean {
    return this.startedAt !== null && !this.stopped;
  }

  /**
   * One pass: reclaim, then claim and run while each kind has a free slot.
   * Returns how many jobs were started.
   */
  async tick(): Promise<number> {
    if (this.stopped) return 0;
    if (this.ticking) return 0;
    this.ticking = true;
    this.ticks += 1;
    this.lastTickAt = new Date().toISOString();
    let started = 0;
    try {
      const reclaimed = await this.queue.reclaimExpired(50);
      if (reclaimed.length > 0) {
        this.reclaimed += reclaimed.length;
        this.logger?.warn(
          'reclaimed jobs from expired leases',
          { count: reclaimed.length, jobs: reclaimed.map((job) => job.id) },
          'jobs.worker.reclaimed',
        );
      }

      for (const kind of this.queue.registeredKinds()) {
        const definition = JOB_DEFINITIONS[kind];
        let slots = definition.concurrency - (this.inFlightPerKind.get(kind) ?? 0);
        while (slots > 0 && !this.stopped) {
          const job = await this.claimAndRun(kind);
          if (!job) break;
          started += 1;
          slots -= 1;
        }
      }
      return started;
    } finally {
      this.ticking = false;
    }
  }

  private async claimAndRun(kind: JobKind): Promise<JobRecord | null> {
    const claimed = await this.queue.claim([kind]);
    if (!claimed) return null;
    this.claimed += 1;
    this.inFlightPerKind.set(kind, (this.inFlightPerKind.get(kind) ?? 0) + 1);

    // The handler runs in the background; the pool tracks it so shutdown can drain
    // and so the per-kind slot is released exactly once, whatever happens.
    const promise = this.queue
      .run(claimed)
      .catch((error: unknown) => {
        // `run` handles handler failures itself; reaching here means the store or
        // the engine failed, which must be visible.
        this.lastError = error instanceof Error ? error.message : String(error);
        this.logger?.error(
          'job execution failed outside the handler',
          { jobId: claimed.id, message: this.lastError },
          'jobs.worker.execute.failed',
        );
        return claimed;
      })
      .finally(() => {
        this.inFlight.delete(claimed.id);
        const next = (this.inFlightPerKind.get(kind) ?? 1) - 1;
        if (next <= 0) this.inFlightPerKind.delete(kind);
        else this.inFlightPerKind.set(kind, next);
      });
    this.inFlight.set(claimed.id, promise);
    this.renewLeaseLoop(claimed.id);
    return claimed;
  }

  /** Keep a long-running job's lease alive until it leaves the in-flight set. */
  private renewLeaseLoop(jobId: string): void {
    const schedule = (ms: number): void => {
      const timer = setTimeout(() => {
        if (!this.inFlight.has(jobId)) return;
        void this.queue
          .renewLease(jobId)
          .catch(() => undefined)
          .then(() => {
            if (this.inFlight.has(jobId)) schedule(this.renewEveryMs);
          });
      }, ms);
      // Renewing a lease must not keep the process alive on its own.
      (timer as { unref?: () => void }).unref?.();
    };
    schedule(this.renewEveryMs);
  }

  inFlightCount(): number {
    return this.inFlight.size;
  }

  /**
   * Wait for the handlers already in flight to finish, without stopping the pool.
   *
   * `stop()` is the shutdown path: it refuses new work and waits with a deadline.
   * This is the observation path — a caller (a test, or the desktop shell before it
   * closes the database) wants to see jobs *finish* rather than *start*, and must
   * not stop the worker to get that.
   */
  async settle(): Promise<number> {
    let settled = 0;
    // Re-read the set on every round: a handler that finishes can release a slot,
    // and a tick running concurrently may have added work while we waited.
    while (this.inFlight.size > 0) {
      const pending = [...this.inFlight.values()];
      await Promise.allSettled(pending);
      settled += pending.length;
    }
    return settled;
  }

  snapshot(): WorkerPoolSnapshot {
    const concurrency: Record<string, number> = {};
    for (const kind of this.queue.registeredKinds()) {
      concurrency[kind] = JOB_DEFINITIONS[kind].concurrency;
    }
    return {
      started: this.startedAt !== null,
      stopped: this.stopped,
      running: this.isRunning(),
      ticks: this.ticks,
      claimed: this.claimed,
      inFlight: this.inFlight.size,
      reclaimed: this.reclaimed,
      concurrency,
      lastTickAt: this.lastTickAt,
      lastError: this.lastError,
    };
  }

  /**
   * Stop claiming and wait for in-flight handlers, up to `drainTimeoutMs`.
   * Returns how many were still running at the deadline (0 when it drained).
   */
  async stop(): Promise<number> {
    this.stopped = true;
    if (this.handle !== null) {
      this.clearIntervalImpl(this.handle);
      this.handle = null;
    }
    const pending = [...this.inFlight.values()];
    if (pending.length === 0) {
      this.logger?.info('job worker pool stopped', { drained: 0 }, 'jobs.worker.stopped');
      return 0;
    }

    let timedOut = false;
    await Promise.race([
      Promise.allSettled(pending),
      this.sleep(this.drainTimeoutMs).then(() => {
        timedOut = true;
      }),
    ]);
    const stillRunning = timedOut ? this.inFlight.size : 0;
    this.logger?.info(
      'job worker pool stopped',
      { drained: pending.length - stillRunning, stillRunning, timedOut },
      'jobs.worker.stopped',
    );
    return stillRunning;
  }
}
