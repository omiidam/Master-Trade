import { describe, expect, it } from 'vitest';
import { InMemoryJobStore } from '../packages/shared/src/jobs/store.js';
import { JOB_DEFINITIONS, JobQueue } from '../packages/shared/src/jobs/queue.js';
import {
  EventBus,
  assertOrdered,
  missingSequences,
  type RealtimeEvent,
} from '../packages/shared/src/realtime/events.js';
import { AppError, PolicyViolationError } from '../packages/shared/src/core/errors.js';
import { backoffDelay, withRetry } from '../packages/shared/src/core/retry.js';
import {
  SlidingWindowRateLimiter,
  rateLimitPolicyFrom,
} from '../packages/shared/src/core/rateLimit.js';
import type { Principal } from '../packages/shared/src/auth/model.js';

export const principal = (roles: Principal['roles'], id = 'u1'): Principal => ({
  id,
  roles,
  session: {
    id: 's1',
    issuedAt: new Date(0).toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  },
});

describe('retry primitives', () => {
  it('computes exponential backoff with a cap', () => {
    const policy = { attempts: 5, baseDelayMs: 100, maxDelayMs: 1_000, jitter: false };
    expect(backoffDelay(policy, 1)).toBe(100);
    expect(backoffDelay(policy, 2)).toBe(200);
    expect(backoffDelay(policy, 9)).toBe(1_000);
  });

  it('retries retryable errors and stops at the attempt limit', async () => {
    const delays: number[] = [];
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw new AppError('TIMEOUT', 'slow');
        },
        { attempts: 3, baseDelayMs: 1, maxDelayMs: 10, jitter: false },
        { sleep: async (ms) => void delays.push(ms) },
      ),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(calls).toBe(3);
    expect(delays).toEqual([1, 2]);
  });

  it('does not retry non-retryable errors', async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw new PolicyViolationError('never');
        },
        { attempts: 5, baseDelayMs: 1, maxDelayMs: 1, jitter: false },
        { sleep: async () => undefined },
      ),
    ).rejects.toMatchObject({ code: 'POLICY_VIOLATION' });
    expect(calls).toBe(1);
  });
});

describe('rate limiting', () => {
  it('enforces the window and reports the retry delay', () => {
    let now = 0;
    const limiter = new SlidingWindowRateLimiter(rateLimitPolicyFrom(2), () => now);
    expect(limiter.tryAcquire().allowed).toBe(true);
    expect(limiter.tryAcquire().allowed).toBe(true);
    const blocked = limiter.tryAcquire();
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) expect(blocked.retryAfterMs).toBeGreaterThan(0);
    now = 61_000;
    expect(limiter.tryAcquire().allowed).toBe(true);
  });
});

describe('background jobs (engine contract)', () => {
  const queue = (): JobQueue => new JobQueue({ store: new InMemoryJobStore() });

  it('deduplicates by idempotency key, under the kind prefix', async () => {
    const jobs = queue();
    const first = await jobs.enqueue({
      kind: 'training.gradeSession',
      idempotencyKey: 'session-1',
      correlationId: 'c1',
      principal: principal(['owner']),
    });
    const second = await jobs.enqueue({
      kind: 'training.gradeSession',
      idempotencyKey: 'session-1',
      correlationId: 'c2',
      principal: principal(['owner']),
    });
    expect(second.created).toBe(false);
    expect(second.job.id).toBe(first.job.id);
    expect(first.job.idempotencyKey).toBe('grade:session-1');
    expect(await jobs.list()).toHaveLength(1);
  });

  it('refuses an anonymous enqueue and an unprivileged one', async () => {
    const jobs = queue();
    await expect(
      jobs.enqueue({
        kind: 'training.gradeSession',
        idempotencyKey: 'x',
        correlationId: 'c1',
        principal: null,
      }),
    ).rejects.toMatchObject({ code: 'POLICY_VIOLATION' });

    // An observer may read jobs but not run evaluation.
    await expect(
      jobs.enqueue({
        kind: 'training.gradeSession',
        idempotencyKey: 'y',
        correlationId: 'c1',
        principal: principal(['observer']),
      }),
    ).rejects.toMatchObject({ code: 'POLICY_VIOLATION' });
  });

  it('requires approval for gated job kinds', async () => {
    const jobs = queue();
    await expect(
      jobs.enqueue({
        kind: 'backtest.run',
        idempotencyKey: 'x',
        correlationId: 'c1',
        principal: principal(['owner']),
      }),
    ).rejects.toThrow(PolicyViolationError);
    expect(JOB_DEFINITIONS['backtest.run'].requiresApproval).toBe(true);

    // With a recorded approval it is accepted.
    const approved = await jobs.enqueue({
      kind: 'backtest.run',
      idempotencyKey: 'x',
      correlationId: 'c1',
      principal: principal(['owner']),
      approvalId: 'apr_1',
    });
    expect(approved.created).toBe(true);
  });

  it('retries with backoff, then dead-letters', async () => {
    let now = 1_000_000;
    const jobs = new JobQueue({ store: new InMemoryJobStore(() => now), now: () => now });
    let attempts = 0;
    jobs.register('training.gradeSession', async () => {
      attempts += 1;
      throw new AppError('PROVIDER_UNAVAILABLE', 'grader unavailable');
    });
    const { job } = await jobs.enqueue({
      kind: 'training.gradeSession',
      idempotencyKey: 'session-2',
      correlationId: 'c1',
      principal: principal(['owner']),
    });

    await jobs.runOnce();
    expect((await jobs.get(job.id))?.status).toBe('queued');
    expect((await jobs.get(job.id))?.attempts).toBe(1);

    now += 60_000;
    await jobs.runOnce();
    now += 60_000;
    await jobs.runOnce();

    const dead = await jobs.get(job.id);
    expect(dead?.status).toBe('dead-letter');
    expect(dead?.attempts).toBe(JOB_DEFINITIONS['training.gradeSession'].maxAttempts);
    expect(attempts).toBe(3);
  });

  it('completes successfully and can be cancelled', async () => {
    const jobs = queue();
    jobs.register('embedding.generate', async () => undefined);
    const { job } = await jobs.enqueue({
      kind: 'embedding.generate',
      idempotencyKey: 'mem-1',
      correlationId: 'c1',
      principal: principal(['owner']),
    });
    await jobs.runOnce();
    expect((await jobs.get(job.id))?.status).toBe('succeeded');

    const queued = await jobs.enqueue({
      kind: 'embedding.generate',
      idempotencyKey: 'mem-2',
      correlationId: 'c1',
      principal: principal(['owner']),
    });
    const cancelled = await jobs.cancel(queued.job.id, principal(['owner']));
    expect(cancelled.status).toBe('cancelled');
  });

  it('dead-letters a job with no registered handler', async () => {
    const jobs = queue();
    const { job } = await jobs.enqueue({
      kind: 'maintenance.cleanup',
      idempotencyKey: 'cleanup-1',
      correlationId: 'c1',
      principal: principal(['owner']),
    });
    await jobs.runOnce();
    const record = await jobs.get(job.id);
    expect(record?.status).toBe('dead-letter');
    expect(record?.error).toMatch(/no handler registered/);
  });
});

describe('realtime events (bus contract)', () => {
  const bus = (): EventBus =>
    new EventBus({
      idFactory: (() => {
        let i = 0;
        return () => `evt_${++i}`;
      })(),
    });

  const agentPayload = (n: number) => ({
    conversationId: 'conv_1',
    state: 'RESPONDING',
    statements: [{ kind: 'analysis', text: `answer ${n}`, sources: ['tool:risk'] }],
    uncertainty: [],
  });

  it('delivers only events the principal may see', () => {
    const events = bus();
    const received: RealtimeEvent[] = [];
    events.subscribe(principal(['student']), (event) => received.push(event));

    events.publish({
      type: 'agent.message',
      payload: agentPayload(1),
      source: { kind: 'agent', id: 'scripted' },
    });
    events.publish({
      type: 'audit.record',
      payload: { event: 'job.enqueued', severity: 'info', subject: 'job_1' },
      source: { kind: 'system' },
    });
    events.publish({
      type: 'system.status',
      payload: { component: 'database', status: 'ok', detail: 'sqlite' },
      source: { kind: 'system' },
    });

    expect(received.map((event) => event.type)).toEqual(['agent.message']);
  });

  it('never delivers internal events, and refuses to widen one', () => {
    const events = bus();
    const received: RealtimeEvent[] = [];
    events.subscribe(principal(['owner']), (event) => received.push(event));
    // `agent.tool` is internal: it has no audience and cannot be given one.
    expect(() =>
      events.publish({
        type: 'agent.tool',
        payload: { tool: 'risk.positionSize', outcome: 'ok', durationMs: 1, toolCallId: 'tc_1' },
        source: { kind: 'tool', id: 'risk.positionSize' },
        audienceRoles: ['owner'],
      }),
    ).toThrow(/internal event/);
    expect(received).toHaveLength(0);
  });

  it('orders events and replays from a sequence number on reconnect', () => {
    const events = bus();
    const payload = (n: number) => agentPayload(n);
    const source = { kind: 'agent' as const, id: 'scripted' };
    events.publish({ type: 'agent.message', payload: payload(1), source });
    const second = events.publish({ type: 'agent.message', payload: payload(2), source });
    events.publish({ type: 'agent.message', payload: payload(3), source });

    const replayed: RealtimeEvent[] = [];
    const unsubscribe = events.subscribe(principal(['student']), (event) => replayed.push(event), {
      fromSeq: second.event.seq,
    });
    expect(replayed.map((event) => event.seq)).toEqual([second.event.seq + 1]);
    expect(() => assertOrdered(replayed)).not.toThrow();
    expect(missingSequences(replayed)).toEqual([]);
    unsubscribe();
    expect(events.subscriberCount()).toBe(0);
  });

  it('refuses to deliver to an expired session', () => {
    const events = bus();
    const expired: Principal = {
      ...principal(['owner']),
      session: {
        id: 's',
        issuedAt: new Date(0).toISOString(),
        expiresAt: new Date(Date.now() - 5_000).toISOString(),
      },
    };
    const received: RealtimeEvent[] = [];
    events.subscribe(expired, (event) => received.push(event));
    events.publish({
      type: 'system.status',
      payload: { component: 'database', status: 'ok', detail: 'sqlite' },
      source: { kind: 'system' },
    });
    expect(received).toHaveLength(0);
  });
});
