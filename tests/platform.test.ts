import { describe, expect, it } from 'vitest';
import { JobQueue, JOB_DEFINITIONS } from '../src/jobs/queue.js';
import {
  EventBus,
  assertOrdered,
  missingSequences,
  type RealtimeEvent,
} from '../src/realtime/events.js';
import { AppError, PolicyViolationError } from '../src/core/errors.js';
import { backoffDelay, withRetry } from '../src/core/retry.js';
import { SlidingWindowRateLimiter, rateLimitPolicyFrom } from '../src/core/rateLimit.js';
import type { Principal } from '../src/auth/model.js';

const principal = (roles: Principal['roles'], id = 'u1'): Principal => ({
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

describe('background jobs', () => {
  it('deduplicates by idempotency key', () => {
    const queue = new JobQueue();
    const first = queue.enqueue({
      kind: 'training.gradeSession',
      idempotencyKey: 'session-1',
      correlationId: 'c1',
    });
    const second = queue.enqueue({
      kind: 'training.gradeSession',
      idempotencyKey: 'session-1',
      correlationId: 'c2',
    });
    expect(second.id).toBe(first.id);
    expect(queue.list()).toHaveLength(1);
  });

  it('requires approval for gated job kinds', () => {
    const queue = new JobQueue();
    expect(() =>
      queue.enqueue({ kind: 'backtest.run', idempotencyKey: 'x', correlationId: 'c1' }),
    ).toThrow(PolicyViolationError);
    expect(JOB_DEFINITIONS['backtest.run'].requiresApproval).toBe(true);
  });

  it('retries with backoff, then dead-letters', async () => {
    let now = 1_000_000;
    const queue = new JobQueue({ now: () => now });
    let attempts = 0;
    queue.register('training.gradeSession', async () => {
      attempts += 1;
      throw new AppError('PROVIDER_UNAVAILABLE', 'grader unavailable');
    });
    const job = queue.enqueue({
      kind: 'training.gradeSession',
      idempotencyKey: 'session-2',
      correlationId: 'c1',
    });

    await queue.runOnce();
    expect(queue.get(job.id)?.status).toBe('queued');
    expect(queue.get(job.id)?.attempts).toBe(1);

    now += 60_000;
    await queue.runOnce();
    now += 60_000;
    await queue.runOnce();

    const dead = queue.get(job.id);
    expect(dead?.status).toBe('dead');
    expect(dead?.attempts).toBe(JOB_DEFINITIONS['training.gradeSession'].maxAttempts);
    expect(attempts).toBe(3);
  });

  it('completes successfully and can be cancelled', async () => {
    const queue = new JobQueue();
    queue.register('embedding.generate', async () => undefined);
    const job = queue.enqueue({
      kind: 'embedding.generate',
      idempotencyKey: 'mem-1',
      correlationId: 'c1',
    });
    await queue.runOnce();
    expect(queue.get(job.id)?.status).toBe('succeeded');

    const queued = queue.enqueue({
      kind: 'embedding.generate',
      idempotencyKey: 'mem-2',
      correlationId: 'c1',
    });
    expect(queue.cancel(queued.id)?.status).toBe('cancelled');
  });

  it('dead-letters a job with no registered handler', async () => {
    const queue = new JobQueue();
    const job = queue.enqueue({
      kind: 'maintenance.cleanup',
      idempotencyKey: 'cleanup-1',
      correlationId: 'c1',
    });
    await queue.runOnce();
    const record = queue.get(job.id);
    expect(record?.status).toBe('dead');
    expect(record?.error).toMatch(/No handler/);
  });
});

describe('realtime events', () => {
  const bus = (): EventBus =>
    new EventBus({
      idFactory: (() => {
        let i = 0;
        return () => `evt_${++i}`;
      })(),
    });

  it('delivers only events the principal may see', () => {
    const events = bus();
    const received: RealtimeEvent[] = [];
    events.subscribe(principal(['student']), (event) => received.push(event));

    events.publish({ type: 'agent.message', payload: { text: 'hi' } });
    events.publish({ type: 'audit.record', payload: { internal: true } });
    events.publish({ type: 'system.status', payload: { state: 'READY' } });

    expect(received.map((event) => event.type)).toEqual(['agent.message']);
  });

  it('never delivers internal events and denies empty audiences', () => {
    const events = bus();
    const received: RealtimeEvent[] = [];
    events.subscribe(principal(['owner']), (event) => received.push(event));
    events.publish({ type: 'agent.tool', payload: {}, audienceRoles: [] });
    expect(received).toHaveLength(0);
  });

  it('orders events and replays from a sequence number on reconnect', () => {
    const events = bus();
    events.publish({ type: 'agent.message', payload: { n: 1 } });
    const second = events.publish({ type: 'agent.message', payload: { n: 2 } });
    events.publish({ type: 'agent.message', payload: { n: 3 } });

    const replayed: RealtimeEvent[] = [];
    const unsubscribe = events.subscribe(principal(['student']), (event) => replayed.push(event), {
      fromSeq: second.seq,
    });
    // Replay buffer contained the event published after `second`.
    expect(replayed.map((event) => event.seq)).toEqual([second.seq + 1]);
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
    events.publish({ type: 'system.status', payload: {} });
    expect(received).toHaveLength(0);
  });
});
