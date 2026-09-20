import { describe, expect, it } from 'vitest';
import { SessionService } from '../src/auth/sessions.js';
import { EventBus } from '../src/realtime/events.js';
import {
  DEFAULT_REALTIME_LIMITS,
  RealtimeHub,
  type ConnectionSnapshot,
  type RealtimeLimits,
  type RealtimeTransport,
} from '../src/realtime/hub.js';
import {
  CLOSE_CODES,
  REALTIME_PROTOCOL_VERSION,
  serializeFrame,
} from '../src/realtime/protocol.js';
import type { Role } from '../src/auth/model.js';

/** A transport that records what it was sent, with no socket involved. */
class FakeTransport implements RealtimeTransport {
  readonly sent: Record<string, unknown>[] = [];
  readonly closes: { code: number; reason: string }[] = [];
  private open = true;

  send(text: string): void {
    this.sent.push(JSON.parse(text) as Record<string, unknown>);
  }

  close(code: number, reason: string): void {
    this.closes.push({ code, reason });
    this.open = false;
  }

  isOpen(): boolean {
    return this.open;
  }

  framesOfType(t: string): Record<string, unknown>[] {
    return this.sent.filter((frame) => frame.t === t);
  }
}

interface Harness {
  hub: RealtimeHub;
  bus: EventBus;
  sessions: SessionService;
  now: () => number;
  advance: (ms: number) => void;
  timers: { runAll: () => void; pending: () => number };
}

/** Timers are captured rather than scheduled, so a test never waits. */
function harness(
  options: { limits?: Partial<RealtimeLimits>; roles?: Role[]; entitleRealtime?: boolean } = {},
): Harness {
  // A realistic base: session expiry is computed from this clock, so a toy epoch
  // would make every session look expired.
  let now = Date.parse('2026-09-20T12:00:00.000Z');
  const bus = new EventBus({ now: () => new Date(now).toISOString() });
  const sessions = new SessionService({ now: () => now });
  const pending = new Map<number, () => void>();
  let handle = 0;
  const timers = {
    runAll: () => {
      const handlers = [...pending.values()];
      pending.clear();
      for (const handler of handlers) handler();
    },
    pending: () => pending.size,
  };

  const hub = new RealtimeHub({
    bus,
    sessions,
    now: () => now,
    idFactory: (() => {
      let i = 0;
      return () => `conn_${++i}`;
    })(),
    setInterval: (handler) => {
      handle += 1;
      pending.set(handle, handler);
      return handle;
    },
    clearInterval: (h) => {
      pending.delete(h as number);
    },
    limits: { idleTimeoutMs: 60_000, ...(options.limits ?? {}) },
  });

  return {
    hub,
    bus,
    sessions,
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
    timers,
  };
}

function sessionFor(h: Harness, roles: Role[] = ['student']): string {
  return h.sessions.issue({ userId: 'u1', roles }).token;
}

describe('realtime hub authentication', () => {
  it('sends nothing to an unauthenticated socket and closes on the deadline', () => {
    const h = harness({ limits: { authTimeoutMs: 5_000 } });
    const transport = new FakeTransport();
    const connection = h.hub.accept(transport);

    expect(connection.state()).toBe('connecting');
    // Publishing while the socket is unauthenticated: it must receive nothing.
    h.bus.publish({
      type: 'notification',
      payload: { level: 'info', title: 't', body: 'b' },
      source: { kind: 'system' },
    });
    expect(transport.sent).toHaveLength(0);
    expect(h.bus.subscriberCount()).toBe(0);

    h.timers.runAll();
    expect(connection.state()).toBe('closed');
    expect(transport.closes[0]?.code).toBe(CLOSE_CODES.AUTH_TIMEOUT);
  });

  it('refuses an invalid token and a principal without realtime.connect', () => {
    const h = harness();
    const badToken = new FakeTransport();
    const refused = h.hub.accept(badToken);
    refused.handle(JSON.stringify({ t: 'auth', token: 'mt_s_not_a_session' }));
    expect(refused.state()).toBe('closed');
    expect(badToken.closes[0]?.code).toBe(CLOSE_CODES.UNAUTHORIZED);

    // A role with no realtime grant is refused here, not merely filtered later.
    const token = sessionFor(h, ['system']);
    const unprivileged = new FakeTransport();
    const connection = h.hub.accept(unprivileged);
    connection.handle(JSON.stringify({ t: 'auth', token }));
    expect(connection.state()).toBe('closed');
    expect(unprivileged.closes[0]?.reason).toMatch(/realtime\.connect/);
  });

  it('accepts a bearer token from the transport and opens the session', () => {
    const h = harness();
    const token = sessionFor(h, ['owner']);
    const transport = new FakeTransport();
    const connection = h.hub.accept(transport, { token });

    expect(connection.state()).toBe('open');
    const welcome = transport.framesOfType('welcome')[0] as Record<string, unknown>;
    expect(welcome.protocolVersion).toBe(REALTIME_PROTOCOL_VERSION);
    expect(welcome.principalId).toBe('u1');
    expect(welcome.roles).toEqual(['owner']);
    // The client is told what it may subscribe to instead of guessing.
    expect(welcome.availableTypes).toContain('job.status');
    expect(welcome.availableTypes).not.toContain('audit.record');
  });

  it('refuses an unknown protocol version on the wire', () => {
    const h = harness();
    const token = sessionFor(h);
    const transport = new FakeTransport();
    const connection = h.hub.accept(transport);
    connection.handle(JSON.stringify({ t: 'auth', token, protocolVersion: 99 }));
    expect(transport.closes[0]?.code).toBe(CLOSE_CODES.PROTOCOL_VIOLATION);
  });

  it('closes on a malformed frame instead of ignoring it', () => {
    const h = harness();
    const token = sessionFor(h);
    const transport = new FakeTransport();
    const connection = h.hub.accept(transport, { token });

    connection.handle('{ not json');
    expect(connection.state()).toBe('closed');
    expect(transport.closes[0]?.code).toBe(CLOSE_CODES.INVALID_FRAME);
    expect(transport.closes[0]?.reason).toMatch(/not valid JSON/);

    const other = new FakeTransport();
    const second = h.hub.accept(other, { token });
    second.handle(JSON.stringify({ t: 'subscribe', types: 'job.status' }));
    expect(other.closes[0]?.code).toBe(CLOSE_CODES.INVALID_FRAME);
  });

  it('rejects an oversized frame before parsing it', () => {
    const h = harness();
    const token = sessionFor(h);
    const transport = new FakeTransport();
    const connection = h.hub.accept(transport, { token });
    connection.handle(JSON.stringify({ t: 'ping', id: 'x'.repeat(9_000) }));
    expect(transport.closes[0]?.code).toBe(CLOSE_CODES.INVALID_FRAME);
  });
});

describe('realtime hub subscriptions', () => {
  const open = (h: Harness, roles: Role[] = ['owner']) => {
    const transport = new FakeTransport();
    const connection = h.hub.accept(transport, { token: sessionFor(h, roles) });
    return { transport, connection };
  };

  it('delivers only subscribed types, in sequence order', () => {
    const h = harness();
    const { transport, connection } = open(h);
    connection.handle(JSON.stringify({ t: 'subscribe', types: ['job.status'] }));
    expect(transport.framesOfType('subscribed')[0]).toMatchObject({ types: ['job.status'] });

    h.bus.publish({
      type: 'job.status',
      payload: {
        jobId: 'job_1',
        kind: 'embedding.generate',
        status: 'queued',
        attempts: 0,
        maxAttempts: 3,
      },
      source: { kind: 'job', id: 'job_1' },
    });
    h.bus.publish({
      type: 'notification',
      payload: { level: 'info', title: 't', body: 'b' },
      source: { kind: 'system' },
    });

    const events = transport.framesOfType('event');
    expect(events).toHaveLength(1);
    expect((events[0]?.event as { type: string }).type).toBe('job.status');

    // Unsubscribing stops delivery without closing the connection.
    connection.handle(JSON.stringify({ t: 'unsubscribe', types: ['job.status'] }));
    h.bus.publish({
      type: 'job.status',
      payload: {
        jobId: 'job_1',
        kind: 'embedding.generate',
        status: 'running',
        attempts: 1,
        maxAttempts: 3,
      },
      source: { kind: 'job', id: 'job_1' },
    });
    expect(transport.framesOfType('event')).toHaveLength(1);
    expect(connection.state()).toBe('open');
  });

  it('refuses an internal type and a type outside the role, keeping the connection', () => {
    const h = harness();
    const { transport, connection } = open(h, ['student']);

    connection.handle(JSON.stringify({ t: 'subscribe', types: ['audit.record'] }));
    const internal = transport.framesOfType('error')[0] as { message: string };
    expect(internal.message).toMatch(/internal/);

    connection.handle(JSON.stringify({ t: 'subscribe', types: ['job.status'] }));
    const denied = transport.framesOfType('error')[1] as { message: string };
    expect(denied.message).toMatch(/not visible to role/);
    // A refusal is not a disconnection: the client can subscribe to something else.
    expect(connection.state()).toBe('open');
    expect(connection.snapshot().types).toEqual([]);
  });

  it('answers ping and enforces the subscription limit', () => {
    const h = harness({ limits: { maxSubscriptions: 2 } });
    const { transport, connection } = open(h);
    connection.handle(JSON.stringify({ t: 'ping', id: 'p1' }));
    expect(transport.framesOfType('pong').length).toBeGreaterThan(0);

    connection.handle(JSON.stringify({ t: 'subscribe', types: ['job.status', 'agent.message'] }));
    connection.handle(JSON.stringify({ t: 'subscribe', types: ['notification'] }));
    const limit = transport
      .framesOfType('error')
      .find((frame) => /subscription limit/.test(String(frame.message)));
    expect(limit).toBeDefined();
  });

  it('refuses a second auth frame on an authenticated connection', () => {
    const h = harness();
    const transport = new FakeTransport();
    const connection = h.hub.accept(transport, { token: sessionFor(h, ['owner']) });
    connection.handle(JSON.stringify({ t: 'auth', token: sessionFor(h, ['owner']) }));
    expect(transport.framesOfType('error')[0]?.message).toMatch(/already authenticated/);
  });

  it('replays from a sequence number atomically with authentication', () => {
    const h = harness();
    for (let i = 0; i < 3; i++) {
      h.bus.publish({
        type: 'notification',
        payload: { level: 'info', title: `n${i}`, body: 'b' },
        source: { kind: 'system' },
      });
    }
    const transport = new FakeTransport();
    const connection = h.hub.accept(transport);
    connection.handle(
      JSON.stringify({
        t: 'auth',
        token: sessionFor(h, ['owner']),
        fromSeq: 1,
        // Subscribing in the same frame is what makes the reconnect atomic: the
        // replayed events must not be filtered out by an empty subscription set.
        types: ['notification'],
      }),
    );
    const replayed = transport.framesOfType('event');
    expect(replayed.map((frame) => (frame.event as { seq: number }).seq)).toEqual([2, 3]);
    expect(connection.snapshot().types).toEqual(['notification']);
  });

  it('delivers nothing to an authenticated connection that subscribed to nothing', () => {
    const h = harness();
    const transport = new FakeTransport();
    h.hub.accept(transport, { token: sessionFor(h, ['owner']) });
    h.bus.publish({
      type: 'notification',
      payload: { level: 'info', title: 't', body: 'b' },
      source: { kind: 'system' },
    });
    expect(transport.framesOfType('event')).toHaveLength(0);
  });
});

describe('realtime hub limits and shutdown', () => {
  it('rate limits inbound frames', () => {
    const h = harness({ limits: { maxInboundMessagesPerMinute: 3 } });
    const transport = new FakeTransport();
    const connection = h.hub.accept(transport, { token: sessionFor(h) });
    for (let i = 0; i < 5; i++) connection.handle(JSON.stringify({ t: 'ping' }));
    expect(transport.closes[0]?.code).toBe(CLOSE_CODES.RATE_LIMITED);
  });

  it('drops events for a slow client, notices once, then closes on backpressure', () => {
    const h = harness({
      limits: { maxOutboundEventsPerSecond: 1, maxDroppedEvents: 3 },
    });
    const transport = new FakeTransport();
    const connection = h.hub.accept(transport, { token: sessionFor(h) });
    // Backpressure applies to subscribed events, so subscribe first.
    connection.handle(JSON.stringify({ t: 'subscribe', types: ['notification'] }));
    for (let i = 0; i < 6; i++) {
      h.bus.publish({
        type: 'notification',
        payload: { level: 'info', title: `n${i}`, body: 'b' },
        source: { kind: 'system' },
      });
    }
    expect(transport.framesOfType('notice')).toHaveLength(1);
    expect(transport.closes.at(-1)?.code).toBe(CLOSE_CODES.BACKPRESSURE);
    const snapshot = h.hub.snapshots();
    expect(snapshot).toHaveLength(0); // closed connections are forgotten
    expect(connection.state()).toBe('closed');
  });

  it('closes an idle socket on the heartbeat check', () => {
    const h = harness({ limits: { idleTimeoutMs: 1_000 } });
    const transport = new FakeTransport();
    const connection = h.hub.accept(transport, { token: sessionFor(h) });
    h.advance(5_000);
    h.timers.runAll();
    expect(connection.state()).toBe('closed');
    expect(transport.closes.at(-1)?.reason).toMatch(/idle/);
  });

  it('refuses beyond the connection limit and reports snapshots', () => {
    const h = harness({ limits: { maxConnections: 1 } });
    const first = h.hub.accept(new FakeTransport(), { token: sessionFor(h) });
    expect(first.state()).toBe('open');
    const transport = new FakeTransport();
    const refused = h.hub.accept(transport, { token: sessionFor(h) });
    expect(refused.state()).toBe('closed');
    expect(transport.closes[0]?.code).toBe(CLOSE_CODES.TOO_MANY_CONNECTIONS);
    expect(h.hub.connectionCount()).toBe(1);

    const snapshots: ConnectionSnapshot[] = h.hub.snapshots();
    expect(snapshots[0]?.principalId).toBe('u1');
    expect(snapshots[0]?.state).toBe('open');
  });

  it('tells every client the server is going away on shutdown', () => {
    const h = harness({ limits: { maxConnections: 4 } });
    const transports = [new FakeTransport(), new FakeTransport()];
    for (const transport of transports) h.hub.accept(transport, { token: sessionFor(h) });
    expect(h.hub.connectionCount()).toBe(2);

    h.hub.closeAll('the server is shutting down');
    expect(h.hub.connectionCount()).toBe(0);
    for (const transport of transports) {
      expect(transport.closes.at(-1)?.code).toBe(CLOSE_CODES.GOING_AWAY);
    }
    expect(h.bus.subscriberCount()).toBe(0);
  });

  it('serializes server frames as JSON the client can parse', () => {
    const frame = serializeFrame({ t: 'pong', serverTime: '2026-09-20T00:00:00.000Z' });
    expect(JSON.parse(frame)).toEqual({
      t: 'pong',
      serverTime: '2026-09-20T00:00:00.000Z',
    });
    expect(DEFAULT_REALTIME_LIMITS.maxConnections).toBeGreaterThan(0);
  });
});
