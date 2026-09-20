import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Principal } from '../src/auth/model.js';
import type { Repositories } from '../src/db/repositories/index.js';
import { SqliteJobStore } from '../src/jobs/sqliteStore.js';

import { openDatabase, sqliteDriverInfo, type DatabaseHandle } from '../src/db/index.js';
import { resolveConfig } from '../src/core/config.js';
import { JobQueue, type JobStatusEvent } from '../src/jobs/queue.js';
import { JobService } from '../src/jobs/service.js';
import { JobWorkerPool } from '../src/jobs/worker.js';

const FIXED_NOW = Date.parse('2026-09-20T09:00:00.000Z');

// Every test here opens a real on-disk database, so they require the `node:sqlite`
// driver (Node ≥ 22.5, unflagged from 22.13). On a runtime without it the suite
// skips with a recorded reason rather than failing — the same guard
// `database.test.ts` and `repositories.test.ts` use, so an unsupported Node build
// does not turn a portability limit into a red CI lane. Where the driver exists
// these run exactly as before.
const driver = sqliteDriverInfo();
const withDatabase = driver.available ? it : it.skip;

const owner: Principal = {
  id: 'u_owner',
  roles: ['owner'],
  session: {
    id: 's1',
    issuedAt: new Date(0).toISOString(),
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
  },
};

const directories: string[] = [];
const handles: DatabaseHandle[] = [];

afterEach(async () => {
  // Close first, then unlink. Windows refuses to delete a database still held
  // open, and a test that fails mid-assertion never reaches its own `close()` —
  // so cleanup closes whatever is left instead of turning a real failure into an
  // `EBUSY` that hides the assertion behind it. Closing twice is a no-op.
  for (const handle of handles.splice(0)) {
    await handle.close().catch(() => undefined);
  }
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
});

interface OpenStack {
  handle: DatabaseHandle;
  repositories: Repositories;
  store: SqliteJobStore;
  queue: JobQueue;
  file: string;
}

/** A real on-disk database, so a "restart" is a genuine reopen. */
async function openStack(
  file: string,
  options: {
    observers?: { onStatus: (event: JobStatusEvent) => void };
    /** Clock for the repositories, so a TTL can be aged without waiting. */
    repositoryNow?: () => number;
  } = {},
): Promise<OpenStack> {
  const config = resolveConfig({ database: { ...resolveConfig({}).database, file } });
  const handle = await openDatabase({
    config,
    ...(options.repositoryNow === undefined ? {} : { now: options.repositoryNow }),
  });
  handles.push(handle);
  // `openDatabase` already builds the repositories over its own executor; the
  // handle is the composition point, so nothing here re-implements it.
  const repositories = handle.repositories;
  const store = new SqliteJobStore(repositories.platform, () => FIXED_NOW);
  const queue = new JobQueue({ store, now: () => FIXED_NOW, leaseMs: 1_000, ...options });
  return { handle, repositories, store, queue, file };
}

async function newFile(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'mt-jobs-'));
  directories.push(directory);
  return join(directory, 'jobs.db');
}

describe('durable job store', () => {
  withDatabase('reports itself as durable and keeps the queue across a restart', async () => {
    const file = await newFile();
    const first = await openStack(file);
    expect(first.store.durable).toBe(true);
    expect(first.store.kind).toBe('sqlite');

    const { job, created } = await first.queue.enqueue({
      kind: 'embedding.generate',
      idempotencyKey: 'mem_1',
      correlationId: 'cor_1',
      principal: owner,
      payload: { batch: 1 },
    });
    expect(created).toBe(true);
    await first.handle.close();

    // A new process would do exactly this: open the same file and read the queue.
    const second = await openStack(file);
    const recovered = await second.queue.get(job.id);
    expect(recovered?.status).toBe('queued');
    expect(recovered?.payload).toEqual({ batch: 1 });
    expect(recovered?.idempotencyKey).toBe('embed:mem_1');
    expect(recovered?.correlationId).toBe('cor_1');

    // And it can be worked by the new process, which is the point.
    second.queue.register('embedding.generate', async () => ({ embedded: 3 }));
    await second.queue.runOnce();
    expect((await second.queue.get(job.id))?.status).toBe('succeeded');
    await second.handle.close();
  });

  withDatabase('prevents a duplicate job through the unique idempotency key', async () => {
    const file = await newFile();
    const stack = await openStack(file);
    const input = {
      kind: 'report.generate' as const,
      idempotencyKey: 'session_42',
      correlationId: 'cor_1',
      principal: owner,
    };
    const first = await stack.queue.enqueue(input);
    const second = await stack.queue.enqueue(input);
    expect(second.created).toBe(false);
    expect(second.job.id).toBe(first.job.id);

    // Even after a restart the key still holds.
    await stack.handle.close();
    const reopened = await openStack(file);
    const third = await reopened.queue.enqueue(input);
    expect(third.created).toBe(false);
    expect(third.job.id).toBe(first.job.id);
    expect(await reopened.queue.list()).toHaveLength(1);
    await reopened.handle.close();
  });

  withDatabase('claims atomically: two claims never take the same job', async () => {
    const stack = await openStack(await newFile());
    await stack.queue.enqueue({
      kind: 'report.generate',
      idempotencyKey: 'a',
      correlationId: 'cor_1',
      principal: owner,
    });
    const [first, second] = await Promise.all([
      stack.queue.claim(['report.generate']),
      stack.queue.claim(['report.generate']),
    ]);
    const claimed = [first, second].filter((job) => job !== null);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.status).toBe('running');
    expect(claimed[0]?.leaseUntil).toBeGreaterThan(FIXED_NOW);
    await stack.handle.close();
  });

  withDatabase('reclaims a job whose worker died, using the lease', async () => {
    // Expiry is decided against the database's clock — the same one every process
    // shares — so the clock is what the test ages, not the store.
    const clock = { at: FIXED_NOW };
    const stack = await openStack(await newFile(), { repositoryNow: () => clock.at });
    const { job } = await stack.queue.enqueue({
      kind: 'dataset.process',
      idempotencyKey: 'ds_1',
      correlationId: 'cor_1',
      principal: owner,
    });
    await stack.queue.claim(['dataset.process']);
    expect((await stack.queue.get(job.id))?.status).toBe('running');

    // While the lease holds, a live worker's job is left alone: reclaiming it here
    // would run the same job twice.
    expect(await stack.queue.reclaimExpired()).toHaveLength(0);

    // Past the lease deadline the job goes back to `queued` for the next worker,
    // which is what makes a crashed process survivable.
    clock.at = FIXED_NOW + 60_000;
    const reclaimed = await stack.queue.reclaimExpired();
    expect(reclaimed.map((entry) => entry.id)).toContain(job.id);
    expect((await stack.queue.get(job.id))?.status).toBe('queued');
    await stack.handle.close();
  });

  withDatabase('records progress in transient scratch, and survives losing it', async () => {
    // The repository clock is the one that decides when scratch has expired, so
    // ageing it is how a 24h TTL is tested in microseconds.
    const clock = { at: FIXED_NOW };
    const stack = await openStack(await newFile(), { repositoryNow: () => clock.at });
    const { job } = await stack.queue.enqueue({
      kind: 'memory.index',
      idempotencyKey: 'idx_1',
      correlationId: 'cor_1',
      principal: owner,
    });
    await stack.store.reportProgress(job.id, { current: 3, total: 9, label: 'records' });
    const progress = await stack.store.progressFor(job.id);
    expect(progress).toMatchObject({ current: 3, total: 9, label: 'records' });

    // Nothing is purged while the row is within its TTL: progress is expected to
    // outlive individual reads, it is only the *expiry* that removes it.
    expect(await stack.store.purgeScratch()).toBe(0);
    expect(await stack.store.progressFor(job.id)).not.toBeNull();

    // Past the TTL the maintenance purge drops it, and that loses the progress and
    // nothing else: the job record itself is untouched, which is why progress lives
    // in scratch and not in the job row.
    clock.at = FIXED_NOW + 48 * 60 * 60 * 1_000;
    expect(await stack.store.purgeScratch()).toBeGreaterThan(0);
    expect(await stack.store.progressFor(job.id)).toBeNull();
    expect((await stack.queue.get(job.id))?.status).toBe('queued');
    await stack.handle.close();
  });

  withDatabase(
    'cancels across processes: the recorded status is what stops the worker',
    async () => {
      const file = await newFile();
      const workerStack = await openStack(file);
      const { job } = await workerStack.queue.enqueue({
        kind: 'dataset.process',
        idempotencyKey: 'ds_2',
        correlationId: 'cor_1',
        principal: owner,
      });

      // A second connection to the same database stands in for another process.
      const controller = await openStack(file);
      await controller.queue.cancel(job.id, owner);

      // The worker's own queue sees the cancellation without being told.
      expect(await workerStack.queue.get(job.id)).toMatchObject({ status: 'cancelled' });
      workerStack.queue.register('dataset.process', async () => ({}));
      await workerStack.queue.runOnce();
      expect((await workerStack.queue.get(job.id))?.status).toBe('cancelled');
      await workerStack.handle.close();
      await controller.handle.close();
    },
  );

  withDatabase('renews a lease so a slow job is not reclaimed by its own queue', async () => {
    const stack = await openStack(await newFile());
    const { job } = await stack.queue.enqueue({
      kind: 'backtest.run',
      idempotencyKey: 'bt_1',
      correlationId: 'cor_1',
      principal: owner,
      approvalId: 'apr_1',
    });
    await stack.queue.claim(['backtest.run']);
    await stack.queue.renewLease(job.id);
    const renewed = await stack.queue.get(job.id);
    // The lease is now further out than the fixed clock plus the original lease.
    expect((renewed?.leaseUntil ?? 0) - FIXED_NOW).toBeGreaterThan(1_000);
    await stack.handle.close();
  });

  withDatabase('summarizes the queue from the database', async () => {
    const stack = await openStack(await newFile());
    stack.queue.register('report.generate', async () => {
      throw new Error('boom');
    });
    await stack.queue.enqueue({
      kind: 'report.generate',
      idempotencyKey: 'fail_1',
      correlationId: 'cor_1',
      principal: owner,
    });
    await stack.queue.enqueue({
      kind: 'memory.index',
      idempotencyKey: 'wait_1',
      correlationId: 'cor_1',
      principal: owner,
    });
    await stack.queue.runOnce(1);
    const summary = await stack.queue.summary();
    expect(summary['dead-letter']).toBe(1);
    expect(summary.queued).toBe(1);
    await stack.handle.close();
  });

  withDatabase('runs a durable queue through the worker pool end to end', async () => {
    const stack = await openStack(await newFile());
    const done: string[] = [];
    stack.queue.register('memory.index', async (job) => {
      done.push(job.id);
      return { indexed: 1 };
    });
    const { job } = await stack.queue.enqueue({
      kind: 'memory.index',
      idempotencyKey: 'pool_1',
      correlationId: 'cor_1',
      principal: owner,
    });
    const pool = new JobWorkerPool({ queue: stack.queue, sleep: async () => undefined });
    await pool.tick();
    // `tick()` starts work; the pool runs handlers off the tick so a slow job does
    // not stall the loop. `settle()` is how a caller observes completion.
    await pool.settle();
    expect(done).toEqual([job.id]);
    expect((await stack.queue.get(job.id))?.status).toBe('succeeded');
    expect(pool.inFlightCount()).toBe(0);
    await stack.handle.close();
  });
});

describe('job service over the durable store', () => {
  withDatabase('audits enqueue and cancel, and publishes status events', async () => {
    const stack = await openStack(await newFile());
    const published: JobStatusEvent[] = [];
    const service = new JobService({
      queue: stack.queue,
      events: { publish: (event) => published.push(event) },
      audit: {
        append: async (record) => {
          await stack.repositories.audit.append({
            correlationId: record.correlationId,
            actor: record.actor,
            event: record.event,
            severity: record.severity,
            payload: record.payload,
          });
        },
      },
    });

    const { job } = await service.enqueue({
      kind: 'report.generate',
      idempotencyKey: 'report_1',
      correlationId: 'cor_1',
      principal: owner,
      payload: { section: 'summary' },
    });
    expect(published.map((event) => event.status)).toContain('queued');

    const view = await service.get(job.id, owner);
    expect(view.status).toBe('queued');
    expect(view.cancellable).toBe(true);
    expect(view.progressPercent).toBeNull();
    expect(view.progressUnit).toBe('sections');

    await service.cancel(job.id, owner, 'cor_2');
    expect(published.map((event) => event.status)).toContain('cancelled');

    // The audit trail has both actions, with the correlation id of each request.
    const enqueued = await stack.repositories.audit.byEvent('job.enqueued');
    const cancelled = await stack.repositories.audit.byEvent('job.cancelled');
    expect(enqueued).toHaveLength(1);
    expect(cancelled).toHaveLength(1);
    expect(enqueued[0]?.correlation_id).toBe('cor_1');
    expect(cancelled[0]?.correlation_id).toBe('cor_2');
    expect(cancelled[0]?.actor_id).toBe('u_owner');
    // The job payload's *keys* are recorded; the values never enter the trail.
    expect(enqueued[0]?.payload).toMatchObject({ jobId: job.id, payloadKeys: ['section'] });
    await stack.handle.close();
  });

  withDatabase(
    'denies reads and cancels without the operation, and reports permission denied',
    async () => {
      const stack = await openStack(await newFile());
      const service = new JobService({ queue: stack.queue });
      const student: Principal = { ...owner, id: 'u_student', roles: ['student'] };
      const { job } = await service.enqueue({
        kind: 'report.generate',
        idempotencyKey: 'report_2',
        correlationId: 'cor_1',
        principal: owner,
      });

      // A student may read progress but not cancel infrastructure work.
      await expect(service.get(job.id, student)).resolves.toMatchObject({ id: job.id });
      await expect(service.cancel(job.id, student, 'cor_3')).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      await expect(service.list({}, null)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
      expect((await stack.queue.get(job.id))?.status).toBe('queued');
      await stack.handle.close();
    },
  );

  withDatabase('surfaces progress and attempts in the view the API returns', async () => {
    const stack = await openStack(await newFile());
    const service = new JobService({ queue: stack.queue });
    const { job } = await service.enqueue({
      kind: 'memory.index',
      idempotencyKey: 'idx_2',
      correlationId: 'cor_1',
      principal: owner,
    });
    await stack.store.reportProgress(job.id, { current: 4, total: 8, label: 'records' });
    const view = await service.get(job.id, owner);
    expect(view.progress).toEqual({ current: 4, total: 8, label: 'records' });
    expect(view.progressPercent).toBe(50);
    expect(view.attempts).toBe(0);
    expect(view.maxAttempts).toBe(3);
    expect(view.correlationId).toBe('cor_1');
    await stack.handle.close();
  });
});
