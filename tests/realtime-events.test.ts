import { describe, expect, it } from 'vitest';
import {
  EVENT_CONTRACTS,
  EVENT_SCHEMA_VERSION,
  MAX_EVENT_PAYLOAD_BYTES,
  assertEventContracts,
  assertNoSecretsInPayload,
  assertValidEventPayload,
  contractFor,
  eventTypes,
  internalEventTypes,
  isRealtimeEventType,
  mayPublish,
  validateEventPayload,
  type RealtimeEventType,
} from '../packages/shared/src/realtime/contracts.js';
import {
  EventBus,
  assertReplayContinuity,
  isVisibleTo,
  resolveAudience,
  type PublishReceipt,
  type RealtimeEvent,
} from '../packages/shared/src/realtime/events.js';
import { PolicyViolationError } from '../packages/shared/src/core/errors.js';
import type { Principal } from '../packages/shared/src/auth/model.js';

const principal = (roles: Principal['roles'], id = 'u1'): Principal => ({
  id,
  roles,
  session: {
    id: 's1',
    issuedAt: new Date(0).toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  },
});

const system = { kind: 'system' as const };

const validPayloads: Record<RealtimeEventType, unknown> = {
  'agent.message': {
    conversationId: 'conv_1',
    state: 'RESPONDING',
    statements: [{ kind: 'fact', text: 'risk is 0.5%', sources: ['tool:risk'] }],
    uncertainty: [],
  },
  'agent.status': { state: 'READY', previous: 'IDLE' },
  'agent.tool': { tool: 'risk.positionSize', outcome: 'ok', durationMs: 4, toolCallId: 'tc_1' },
  'training.progress': { lessonId: 'les_1', completed: 3, total: 10 },
  'exam.progress': {
    attemptId: 'att_1',
    questionIndex: 1,
    questionCount: 10,
    status: 'in-progress',
  },
  'backtest.progress': {
    experimentId: 'exp_1',
    progress: { current: 10, total: 100 },
    status: 'running',
  },
  'research.update': {
    experimentId: 'exp_1',
    status: 'running',
    metricsSource: 'synthetic',
    adoption: 'none',
  },
  'marketdata.tick': {
    symbol: 'EURUSD',
    timeframe: '1h',
    provenance: 'synthetic',
    time: '2026-09-20T00:00:00.000Z',
    close: 1.0842,
  },
  'job.status': {
    jobId: 'job_1',
    kind: 'embedding.generate',
    status: 'running',
    attempts: 1,
    maxAttempts: 3,
  },
  notification: { level: 'info', title: 'Saved', body: 'Your session was recorded.' },
  'system.status': { component: 'database', status: 'ok', detail: 'sqlite' },
  'system.error': { code: 'TIMEOUT', routeId: 'agent.chat', message: 'upstream slow' },
  'audit.record': { event: 'job.enqueued', severity: 'info', subject: 'job_1' },
};

describe('event contracts', () => {
  it('declares exactly one contract per event type, and no others', () => {
    expect(() => assertEventContracts()).not.toThrow();
    expect(eventTypes().sort()).toEqual(Object.keys(validPayloads).sort());
    for (const type of eventTypes()) {
      expect(contractFor(type).type).toBe(type);
      expect(contractFor(type).schemaVersion).toBe(EVENT_SCHEMA_VERSION);
      expect(contractFor(type).description.length).toBeGreaterThan(20);
    }
  });

  it('marks internal types as system-published with no audience', () => {
    const internal = internalEventTypes();
    expect(internal).toContain('agent.tool');
    expect(internal).toContain('audit.record');
    for (const type of internal) {
      expect(contractFor(type).defaultAudience).toEqual([]);
      expect(contractFor(type).publishers).toEqual(['system']);
    }
  });

  it('refuses an incomplete or contradictory registry', () => {
    expect(() =>
      assertEventContracts({
        'agent.message': { ...contractFor('agent.message'), defaultAudience: [] },
      }),
    ).toThrow(/must declare an audience/);
    expect(() =>
      assertEventContracts({
        'audit.record': { ...contractFor('audit.record'), publishers: ['owner', 'system'] },
      }),
    ).toThrow(/system-published only/);
    expect(() =>
      assertEventContracts({
        'agent.message': { ...contractFor('agent.message'), publishers: [] },
      }),
    ).toThrow(/no publisher/);
    expect(() =>
      assertEventContracts({
        'agent.message': { ...contractFor('agent.message'), schemaVersion: 0 },
      }),
    ).toThrow(/invalid schema version/);
    expect(() =>
      assertEventContracts({
        'agent.message': { ...contractFor('agent.message'), type: 'agent.status' as never },
      }),
    ).toThrow(/key mismatch/);
  });

  it('validates every valid payload and reports issues for invalid ones', () => {
    for (const type of eventTypes()) {
      const result = validateEventPayload(type, validPayloads[type]);
      expect(result.issues, `${type}: ${result.issues.join('; ')}`).toEqual([]);
      expect(result.ok).toBe(true);
    }

    const wrongShape = validateEventPayload('job.status', { jobId: 'job_1', status: 'running' });
    expect(wrongShape.ok).toBe(false);
    expect(wrongShape.issues.join(' ')).toMatch(/kind/);

    // An unknown status is refused rather than stored.
    const badStatus = validateEventPayload('job.status', {
      ...(validPayloads['job.status'] as Record<string, unknown>),
      status: 'finished',
    });
    expect(badStatus.ok).toBe(false);

    // A market-data event without provenance is refused: synthetic must never be
    // able to masquerade as historical.
    const noProvenance = validateEventPayload('marketdata.tick', {
      symbol: 'EURUSD',
      timeframe: '1h',
      time: '2026-09-20T00:00:00.000Z',
      close: 1.08,
    });
    expect(noProvenance.ok).toBe(false);
  });

  it('refuses credential-shaped keys at any depth, and oversized payloads', () => {
    expect(() => assertNoSecretsInPayload({ token: 'x' })).toThrow(/must not carry credentials/);
    expect(() => assertNoSecretsInPayload({ nested: [{ apiKey: 'sk-1' }] })).toThrow(/credentials/);
    expect(() => assertNoSecretsInPayload({ window: { width: 900 } })).not.toThrow();

    const withSecret = validateEventPayload('notification', {
      level: 'info',
      title: 'ok',
      body: 'ok',
      openaiKey: 'sk-1',
    });
    expect(withSecret.ok).toBe(false);
    expect(withSecret.issues.join(' ')).toMatch(/credentials/);

    const huge = validateEventPayload('notification', {
      level: 'info',
      title: 'big',
      body: 'x'.repeat(MAX_EVENT_PAYLOAD_BYTES),
    });
    expect(huge.ok).toBe(false);
    expect(huge.issues.join(' ')).toMatch(/exceeds/);
  });

  it('refuses to publish an unknown or malformed event by name', () => {
    expect(isRealtimeEventType('agent.message')).toBe(true);
    expect(isRealtimeEventType('agent.secret')).toBe(false);
    expect(() => assertValidEventPayload('agent.message', { text: 'hi' })).toThrow(
      PolicyViolationError,
    );
  });

  it('answers who may publish each type, deny-by-default', () => {
    expect(mayPublish('agent.message', 'owner')).toBe(true);
    expect(mayPublish('agent.message', 'observer')).toBe(false);
    expect(mayPublish('job.status', 'owner')).toBe(false);
    expect(mayPublish('job.status', 'system')).toBe(true);
    expect(mayPublish('audit.record', 'owner')).toBe(false);
  });
});

describe('event publishing rules', () => {
  const bus = (): EventBus => new EventBus({ bufferSize: 3 });

  it('records provenance, schema version and sequence on every event', () => {
    const events = bus();
    const receipt = events.publish({
      type: 'job.status',
      payload: validPayloads['job.status'],
      source: { kind: 'job', id: 'job_1' },
      correlationId: 'cor_1',
    });
    expect(receipt.event.schemaVersion).toBe(EVENT_SCHEMA_VERSION);
    expect(receipt.event.seq).toBe(1);
    expect(receipt.event.source).toEqual({ kind: 'job', id: 'job_1' });
    expect(receipt.event.correlationId).toBe('cor_1');
    expect(receipt.delivered).toBe(0);
    expect(Date.parse(receipt.event.at)).not.toBeNaN();
  });

  it('refuses a publisher that is not on the contract allow-list', () => {
    const events = bus();
    expect(() =>
      events.publish({
        type: 'job.status',
        payload: validPayloads['job.status'],
        source: system,
        publisher: 'owner',
      }),
    ).toThrow(/deny-by-default publisher list/);
    // And a forged source does not help: the publisher is what is checked.
    expect(() =>
      events.publish({
        type: 'audit.record',
        payload: validPayloads['audit.record'],
        source: { kind: 'tool', id: 'sneaky' },
        publisher: 'coach',
      }),
    ).toThrow(/may not publish/);
  });

  it('refuses an unknown type and an invalid payload before anything is stored', () => {
    const events = bus();
    expect(() =>
      events.publish({
        type: 'agent.secret' as RealtimeEventType,
        payload: {},
        source: system,
      }),
    ).toThrow(/unknown realtime event type/);
    expect(() =>
      events.publish({
        type: 'marketdata.tick',
        payload: { symbol: 'EURUSD' },
        source: system,
      }),
    ).toThrow(/refusing to publish marketdata\.tick/);
    expect(events.historySnapshot()).toHaveLength(0);
    expect(events.lastSeq()).toBe(0);
  });

  it('lets a publisher narrow an audience but never widen it', () => {
    expect(resolveAudience('agent.message', undefined)).toEqual(['owner', 'coach', 'student']);
    expect(resolveAudience('agent.message', ['owner'])).toEqual(['owner']);
    expect(() => resolveAudience('agent.message', ['observer'])).toThrow(/widen/);
    expect(() => resolveAudience('audit.record', ['owner'])).toThrow(/internal event/);
    expect(resolveAudience('audit.record', undefined)).toEqual([]);
  });

  it('reports delivery per subscriber and drops a broken consumer only', () => {
    const events = bus();
    const good: RealtimeEvent[] = [];
    // The hub names its subscribers with the connection id, which is what makes a
    // delivery report actionable; the same path is used here.
    events.subscribe(principal(['student'], 'student_1'), (event) => good.push(event), {
      subscriberId: 'conn_1',
    });
    events.subscribe(principal(['coach'], 'broken_1'), () => {
      throw new Error('consumer exploded');
    });

    const receipt: PublishReceipt = events.publish({
      type: 'training.progress',
      payload: validPayloads['training.progress'],
      source: system,
    });
    expect(receipt.delivered).toBe(1);
    expect(receipt.dropped).toBe(1);
    expect(receipt.dropReasons[0]).toMatch(/consumer exploded/);
    expect(good).toHaveLength(1);
    expect(events.droppedCount()).toBe(1);
    // The stored event stays pure: delivery is per subscriber.
    expect(events.historySnapshot()[0]?.delivery).toBeUndefined();
    expect(good[0]?.delivery?.subscriberId).toBe('conn_1');
    expect(good[0]?.delivery?.status).toBe('delivered');
  });

  it('refuses a subscription to a type the principal cannot see', () => {
    const events = bus();
    expect(() =>
      events.subscribe(principal(['student']), () => undefined, { types: ['job.status'] }),
    ).toThrow(/may not subscribe/);
    expect(() =>
      events.subscribe(principal(['student']), () => undefined, {
        types: ['agent.secret' as RealtimeEventType],
      }),
    ).toThrow(/unknown subscription type/);
    // A permitted narrowing succeeds and only delivers what was asked for.
    const received: string[] = [];
    events.subscribe(principal(['owner']), (event) => received.push(event.type), {
      types: ['notification'],
    });
    events.publish({
      type: 'notification',
      payload: validPayloads.notification,
      source: system,
    });
    events.publish({
      type: 'system.status',
      payload: validPayloads['system.status'],
      source: system,
    });
    expect(received).toEqual(['notification']);
  });

  it('bounds the replay buffer without breaking continuity', () => {
    const events = bus();
    const earlier: RealtimeEvent[] = [];
    events.subscribe(principal(['owner']), (event) => earlier.push(event));
    for (let i = 0; i < 5; i++) {
      events.publish({
        type: 'notification',
        payload: { level: 'info', title: `n${i}`, body: 'body' },
        source: system,
      });
    }
    // Buffer is 3, so only the last three are replayable.
    const replayed: RealtimeEvent[] = [];
    events.subscribe(principal(['owner']), (event) => replayed.push(event), { fromSeq: 2 });
    expect(replayed.map((event) => event.seq)).toEqual([3, 4, 5]);
    // Resuming from 2 must deliver 3 next, in order, with no gap.
    expect(() => assertReplayContinuity(2, replayed)).not.toThrow();
    expect(() => assertReplayContinuity(1, replayed)).toThrow(/expected 2/);
    expect(earlier.map((event) => event.seq)).toEqual([1, 2, 3, 4, 5]);
  });

  it('denies delivery to a null or expired principal', () => {
    const events = bus();
    const event = events.publish({
      type: 'notification',
      payload: validPayloads.notification,
      source: system,
    }).event;
    expect(isVisibleTo(event, null)).toBe(false);
    const expired: Principal = {
      ...principal(['owner']),
      session: {
        id: 's',
        issuedAt: new Date(0).toISOString(),
        expiresAt: new Date(Date.now() - 1).toISOString(),
      },
    };
    expect(isVisibleTo(event, expired)).toBe(false);
    expect(isVisibleTo(event, principal(['owner']))).toBe(true);
  });
});

describe('event type coverage', () => {
  it('covers the event families the product needs', () => {
    const types = new Set(eventTypes());
    for (const required of [
      'agent.message',
      'agent.status',
      'agent.tool',
      'training.progress',
      'exam.progress',
      'backtest.progress',
      'research.update',
      'job.status',
      'notification',
      'system.error',
      'system.status',
    ] as RealtimeEventType[]) {
      expect(types.has(required), `missing event type ${required}`).toBe(true);
    }
    expect(Object.keys(EVENT_CONTRACTS)).toHaveLength(types.size);
  });
});
