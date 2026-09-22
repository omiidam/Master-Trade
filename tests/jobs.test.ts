import { describe, expect, it } from 'vitest';
import { AppError } from '../packages/shared/src/core/errors.js';
import type { Principal } from '../packages/shared/src/auth/model.js';
import {
  JOB_DEFINITIONS,
  JobQueue,
  assertJobDefinitions,
  type JobStatusEvent,
} from '../packages/shared/src/jobs/queue.js';
import { InMemoryJobStore } from '../packages/shared/src/jobs/store.js';
import { JobWorkerPool } from '../src/jobs/worker.js';
import { JOB_KINDS, isJobKind } from '../packages/shared/src/jobs/vocabulary.js';

const principal = (roles: Principal['roles'], id = 'u1'): Principal => ({
  id,
  roles,
  session: {
    id: 's1',
    issuedAt: new Date(0).toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  },
});

const owner = principal(['owner']);

interface Harness {
  queue: JobQueue;
  store: InMemoryJobStore;
  events: JobStatusEvent[];
  advance: (ms: number) => void;
}

function harness(now = Date.parse('2026-09-20T09:00:00.000Z')): Harness {
  let clock = now;
  const store = new InMemoryJobStore(() => clock);
  const events: JobStatusEvent[] = [];
  const queue = new JobQueue({
    store,
    now: () => clock,
    cancelPollMs: 1,
    leaseMs: 1_000,
    observers: { onStatus: (event) => events.push(event) },
  });
  return {
    queue,
    store,
    events,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

const enqueue = (h: Harness, kind: Parameters<JobQueue['enqueue']>[0]['kind'], key = 'k1') =>
  h.queue.enqueue({ kind, idempotencyKey: key, correlationId: 'cor_1', principal: owner });

describe('job definitions', () => {
  it('covers the product job kinds, each with an operation and a budget', () => {
    expect(() => assertJobDefinitions()).not.toThrow();
    for (const kind of [
      'backtest.run',
      'marketData.ingest',
      'dataset.process',
      'embedding.generate',
      'memory.index',
      'report.generate',
      'training.progress',
    ]) {
      expect(isJobKind(kind), `missing job kind ${kind}`).toBe(true);
    }
    expect(Object.keys(JOB_DEFINITIONS).sort()).toEqual([...JOB_KINDS].sort());
    for (const definition of Object.values(JOB_DEFINITIONS)) {
      expect(definition.timeoutMs).toBeGreaterThanOrEqual(1_000);
      expect(definition.maxAttempts).toBeGreaterThanOrEqual(1);
      expect(definition.progressUnit.length).toBeGreaterThan(1);
      expect(definition.operation).toMatch(/\./);
    }
  });

  it('refuses a definition that looks like trade execution or lacks a budget', () => {
    expect(() =>
      assertJobDefinitions({
        ...JOB_DEFINITIONS,
        'broker.executeOrder': {
          ...JOB_DEFINITIONS['maintenance.cleanup'],
          kind: 'broker.executeOrder' as never,
        },
      }),
    ).toThrow(/must not exist/);

    expect(() =>
      assertJobDefinitions({
        ...JOB_DEFINITIONS,
        'report.generate': { ...JOB_DEFINITIONS['report.generate'], timeoutMs: 0 },
      }),
    ).toThrow(/timeout/);

    expect(() =>
      assertJobDefinitions({
        ...JOB_DEFINITIONS,
        'report.generate': { ...JOB_DEFINITIONS['report.generate'], idempotencyKeyPrefix: ' ' },
      }),
    ).toThrow(/idempotency prefix/);

    expect(() =>
      assertJobDefinitions({
        ...JOB_DEFINITIONS,
        'report.generate': {
          ...JOB_DEFINITIONS['report.generate'],
          maxAttempts: 0,
        },
      }),
    ).toThrow(/attempt budget/);
  });
});

describe('job lifecycle', () => {
  it('runs queued → running → succeeded and reports the transition once each', async () => {
    const h = harness();
    const order: string[] = [];
    h.queue.register('report.generate', async () => {
      order.push('handler');
      return { fileId: 'file_1' };
    });
    const { job } = await enqueue(h, 'report.generate');
    expect(job.status).toBe('queued');

    const touched = await h.queue.runOnce();
    expect(touched).toHaveLength(1);
    const finished = await h.queue.get(job.id);
    expect(finished?.status).toBe('succeeded');
    expect(finished?.result).toEqual({ fileId: 'file_1' });
    expect(order).toEqual(['handler']);

    const statuses = h.events.map((event) => event.status);
    expect(statuses).toEqual(['queued', 'running', 'succeeded']);
    expect(h.events.at(-1)?.kind).toBe('report.generate');
  });

  it('wraps a scalar handler result instead of dropping it', async () => {
    const h = harness();
    h.queue.register('training.progress', async () => 42);
    const { job } = await enqueue(h, 'training.progress');
    await h.queue.runOnce();
    expect((await h.queue.get(job.id))?.result).toEqual({ value: 42 });
  });

  it('retries a retryable failure with backoff, then dead-letters', async () => {
    const h = harness();
    let attempts = 0;
    h.queue.register('marketData.ingest', async () => {
      attempts += 1;
      throw new AppError('PROVIDER_UNAVAILABLE', 'provider down');
    });
    const { job } = await enqueue(h, 'marketData.ingest');

    await h.queue.runOnce();
    const afterFirst = await h.queue.get(job.id);
    expect(afterFirst?.status).toBe('queued');
    expect(afterFirst?.attempts).toBe(1);
    expect(afterFirst?.error).toMatch(/provider down/);
    expect(afterFirst?.availableAt).toBeGreaterThan(afterFirst?.updatedAt ?? 0);

    for (let i = 0; i < 3; i++) {
      h.advance(120_000);
      await h.queue.runOnce();
    }
    const dead = await h.queue.get(job.id);
    expect(dead?.status).toBe('dead-letter');
    expect(dead?.attempts).toBe(JOB_DEFINITIONS['marketData.ingest'].maxAttempts);
    expect(attempts).toBe(JOB_DEFINITIONS['marketData.ingest'].maxAttempts);
    // The observer saw the failures, not just the final state.
    expect(h.events.filter((event) => event.status === 'failed').length).toBeGreaterThan(1);
  });

  it('does not retry a non-retryable failure', async () => {
    const h = harness();
    let attempts = 0;
    h.queue.register('report.generate', async () => {
      attempts += 1;
      throw new AppError('VALIDATION_FAILED', 'bad template');
    });
    const { job } = await enqueue(h, 'report.generate');
    await h.queue.runOnce();
    const record = await h.queue.get(job.id);
    // Not retryable, so it dead-letters on the first attempt however large the
    // budget is.
    expect(record?.status).toBe('dead-letter');
    expect(attempts).toBe(1);
  });

  it('times a handler out instead of holding a worker forever', async () => {
    const h = harness();
    h.queue.register('report.generate', async (_job, context) => {
      // Never resolves: the deadline is what ends this.
      return new Promise((_resolve, reject) => {
        context.signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    });
    // A one-attempt budget keeps this fast and makes the assertion about the
    // timeout rather than about the retry policy.
    const definitions = JOB_DEFINITIONS as Record<
      string,
      { timeoutMs: number; maxAttempts: number }
    >;
    const definition = definitions['report.generate'] as { timeoutMs: number; maxAttempts: number };
    const original = { ...definition };
    // 1s is the enforced floor for a real job, so the test uses it and a single
    // attempt: the assertion is about the timeout, not the retry policy.
    definitions['report.generate'] = { ...definition, timeoutMs: 1_000, maxAttempts: 1 };
    try {
      const { job } = await enqueue(h, 'report.generate');
      await h.queue.runOnce();
      const record = await h.queue.get(job.id);
      expect(record?.status).toBe('dead-letter');
      expect(record?.error).toMatch(/timed out after 1000ms/);
    } finally {
      definitions['report.generate'] = original;
    }
  });

  it('cancels a queued job and never runs it', async () => {
    const h = harness();
    let ran = false;
    h.queue.register('report.generate', async () => {
      ran = true;
    });
    const { job } = await enqueue(h, 'report.generate');
    const cancelled = await h.queue.cancel(job.id, owner);
    expect(cancelled.status).toBe('cancelled');

    await h.queue.runOnce();
    expect(ran).toBe(false);
    expect(h.events.at(-1)?.status).toBe('cancelled');
  });

  it('stops a running job cooperatively and does not overwrite the cancellation', async () => {
    const h = harness();
    let observed = false;
    /**
     * Resolved by the handler the moment it starts.
     *
     * The cancellation below has to land *while* the handler is running, and the way to know
     * that is for the handler to say so — not to sleep for a few milliseconds and hope the
     * handler got there first. A settle delay is a bet on how fast the machine is; this is not.
     */
    let started: () => void = () => undefined;
    const begun = new Promise<void>((resolve) => {
      started = resolve;
    });
    h.queue.register('dataset.process', async (_job, context) => {
      started();
      // A long job that polls the checkpoint the way a real handler must.
      for (let i = 0; i < 200; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1));
        if (await context.isCancelled()) {
          observed = true;
          return {};
        }
      }
      return {};
    });

    const { job } = await enqueue(h, 'dataset.process');
    const running = h.queue.runOnce();
    // Cancel while it is running, having waited for the handler to actually be running.
    await begun;
    await h.queue.cancel(job.id, owner);
    await running;

    expect(observed).toBe(true);
    const record = await h.queue.get(job.id);
    expect(record?.status).toBe('cancelled');
    expect(record?.result).toBeNull();
  });

  it('refuses to cancel a job that already succeeded', async () => {
    const h = harness();
    h.queue.register('report.generate', async () => undefined);
    const { job } = await enqueue(h, 'report.generate');
    await h.queue.runOnce();
    await expect(h.queue.cancel(job.id, owner)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('cancelling requires the job.cancel grant and a principal', async () => {
    const h = harness();
    const { job } = await enqueue(h, 'report.generate');
    await expect(h.queue.cancel(job.id, null)).rejects.toMatchObject({ code: 'POLICY_VIOLATION' });
    // A student may read progress, not cancel infrastructure work.
    await expect(h.queue.cancel(job.id, principal(['student']))).rejects.toMatchObject({
      code: 'POLICY_VIOLATION',
    });
    expect((await h.queue.get(job.id))?.status).toBe('queued');
  });

  it('reports progress without changing the status', async () => {
    const h = harness();
    h.queue.register('embedding.generate', async (_job, context) => {
      await context.reportProgress({ current: 5, total: 10, label: 'records' });
      expect((await h.queue.get(_job.id))?.status).toBe('running');
      return {};
    });
    const { job } = await enqueue(h, 'embedding.generate');
    await h.queue.runOnce();
    const progress = await h.queue.progressFor(job.id);
    expect(progress?.current).toBe(5);
    const progressEvent = h.events.find((event) => event.progress !== undefined);
    expect(progressEvent?.progress).toEqual({ current: 5, total: 10, label: 'records' });
    expect(progressEvent?.status).toBe('running');
  });

  it('prevents a duplicate job across the idempotency key, including after completion', async () => {
    const h = harness();
    h.queue.register('report.generate', async () => undefined);
    const first = await enqueue(h, 'report.generate', 'session_1');
    await h.queue.runOnce();
    const second = await enqueue(h, 'report.generate', 'session_1');
    expect(second.created).toBe(false);
    expect(second.job.id).toBe(first.job.id);
    expect(await h.queue.list()).toHaveLength(1);
  });

  it('refuses an unprivileged or anonymous enqueue, and gate the approval kinds', async () => {
    const h = harness();
    await expect(
      h.queue.enqueue({
        kind: 'embedding.generate',
        idempotencyKey: 'x',
        correlationId: 'c',
        principal: principal(['observer']),
      }),
    ).rejects.toMatchObject({ code: 'POLICY_VIOLATION' });

    await expect(
      h.queue.enqueue({
        kind: 'backtest.run',
        idempotencyKey: 'bt_1',
        correlationId: 'c',
        principal: owner,
      }),
    ).rejects.toThrow(/approval/);

    const approved = await h.queue.enqueue({
      kind: 'backtest.run',
      idempotencyKey: 'bt_1',
      correlationId: 'c',
      principal: owner,
      approvalId: 'apr_1',
    });
    expect(approved.created).toBe(true);
  });

  it('reclaims a job whose worker died', async () => {
    const h = harness();
    const { job } = await enqueue(h, 'report.generate');
    const claimed = await h.queue.claim();
    expect(claimed?.id).toBe(job.id);
    expect(claimed?.status).toBe('running');

    // Nothing reclaims it yet: the lease (1s) is still in the future.
    expect(await h.queue.reclaimExpired()).toHaveLength(0);
    h.advance(2_000);
    const reclaimed = await h.queue.reclaimExpired();
    expect(reclaimed).toHaveLength(1);
    expect(reclaimed[0]?.status).toBe('queued');
    expect(reclaimed[0]?.error).toMatch(/lease expired/);
  });

  it('summarizes the queue and reports store identity', async () => {
    const h = harness();
    h.queue.register('report.generate', async () => {
      throw new AppError('VALIDATION_FAILED', 'nope');
    });
    await enqueue(h, 'report.generate', 'a');
    await enqueue(h, 'embedding.generate', 'b');
    await h.queue.runOnce(1);

    const status = await h.queue.status();
    expect(status.storeKind).toBe('in-memory');
    expect(status.durable).toBe(false);
    expect(status.missingHandlers).toContain('memory.index');
    expect(status.summary['dead-letter']).toBe(1);
    expect(status.summary.queued).toBe(1);
  });
});

describe('job worker pool', () => {
  it('respects per-kind concurrency and drains on stop', async () => {
    const h = harness();
    let inFlight = 0;
    let peak = 0;
    h.queue.register('report.generate', async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10));
      inFlight -= 1;
      return {};
    });

    for (let i = 0; i < 3; i++) await enqueue(h, 'report.generate', `r${i}`);
    const pool = new JobWorkerPool({
      queue: h.queue,
      intervalMs: 5,
      drainTimeoutMs: 500,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    });

    const started = await pool.tick();
    expect(started).toBe(JOB_DEFINITIONS['report.generate'].concurrency);
    // A second overlapping tick must not exceed the limit.
    await pool.tick();
    expect(inFlight).toBeLessThanOrEqual(JOB_DEFINITIONS['report.generate'].concurrency);

    const stillRunning = await pool.stop();
    expect(stillRunning).toBe(0);
    expect(peak).toBeLessThanOrEqual(JOB_DEFINITIONS['report.generate'].concurrency);
    expect(pool.isRunning()).toBe(false);
    const snapshot = pool.snapshot();
    expect(snapshot.stopped).toBe(true);
    expect(snapshot.claimed).toBeGreaterThan(0);
  });

  it('starts on an interval, counts ticks and refuses to restart once stopped', async () => {
    const h = harness();
    h.queue.register('report.generate', async () => undefined);
    let tickHandler: (() => void) | null = null;
    const pool = new JobWorkerPool({
      queue: h.queue,
      intervalMs: 100,
      sleep: async () => undefined,
      setInterval: (handler) => {
        tickHandler = handler;
        return 1;
      },
      clearInterval: () => {
        tickHandler = null;
      },
    });
    pool.start();
    expect(pool.isRunning()).toBe(true);
    expect(tickHandler).not.toBeNull();
    await pool.stop();
    expect(tickHandler).toBeNull();
    expect(() => pool.start()).toThrow(/cannot be restarted/);
  });

  it('reclaims expired leases on a tick and reports it', async () => {
    const h = harness();
    const { job } = await enqueue(h, 'report.generate');
    await h.queue.claim();
    h.advance(5_000);
    const pool = new JobWorkerPool({ queue: h.queue, sleep: async () => undefined });
    await pool.tick();
    expect(pool.snapshot().reclaimed).toBe(1);
    expect((await h.queue.get(job.id))?.status).not.toBe('running');
  });

  it('reports a handler that is still running at the drain deadline', async () => {
    const h = harness();
    /**
     * The handler blocks until this test releases it.
     *
     * "Still running at the deadline" then holds by construction rather than by being slower
     * than a constant: the handler cannot finish until the assertion has been made, so a loaded
     * runner cannot turn this into a passing test that no longer tests anything.
     */
    let release: () => void = () => undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    h.queue.register('report.generate', async (_job, context) => {
      await blocked;
      return { aborted: context.signal.aborted };
    });
    await enqueue(h, 'report.generate');
    const pool = new JobWorkerPool({
      queue: h.queue,
      drainTimeoutMs: 1,
      // Injected, so the drain deadline is the only clock this test reads.
      sleep: async () => undefined,
    });
    const ticked = await pool.tick();
    expect(ticked).toBe(1);
    // The drain deadline passes while the handler is still working.
    expect(await pool.stop()).toBe(1);
    release();
  });
});
