import { describe, expect, it } from 'vitest';
import {
  CLOSE_CODES,
  REALTIME_PROTOCOL_VERSION,
} from '../packages/shared/src/realtime/protocol.js';
import {
  RealtimeClient,
  describeClose,
  parseServerFrame,
  websocketUrlFor,
  type RealtimeClientSnapshot,
  type SocketLike,
} from '../web/src/realtime/client.js';

const NOW = Date.parse('2026-09-20T09:00:00.000Z');
const iso = (offsetMs = 0): string => new Date(NOW + offsetMs).toISOString();

/** A socket whose lifecycle the test drives, so nothing depends on real timing. */
class FakeSocket implements SocketLike {
  readonly sent: string[] = [];
  closed: { code?: number; reason?: string } | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((data: string) => void) | null = null;
  onclose: ((code: number, reason: string) => void) | null = null;
  onerror: ((message: string) => void) | null = null;

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closed = {
      ...(code === undefined ? {} : { code }),
      ...(reason === undefined ? {} : { reason }),
    };
  }

  /* Test-side driving ------------------------------------------------- */

  open(): void {
    this.onopen?.();
  }

  frame(value: unknown): void {
    this.onmessage?.(JSON.stringify(value));
  }

  raw(text: string): void {
    this.onmessage?.(text);
  }

  serverClose(code: number, reason = ''): void {
    this.onclose?.(code, reason);
  }

  frames(): Record<string, unknown>[] {
    return this.sent.map((text) => JSON.parse(text) as Record<string, unknown>);
  }
}

function scheduler() {
  const timers = new Map<number, () => void>();
  let next = 1;
  return {
    setTimer: (handler: () => void, _ms: number): unknown => {
      const id = next++;
      timers.set(id, handler);
      return id;
    },
    clearTimer: (handle: unknown): void => {
      timers.delete(Number(handle));
    },
    /** Run the single pending timer (a reconnect or a heartbeat). */
    fire(): void {
      const entry = [...timers.entries()][0];
      if (!entry) return;
      timers.delete(entry[0]);
      entry[1]();
    },
    pending(): number {
      return timers.size;
    },
  };
}

function harness(options: { types?: string[]; maxAttempts?: number } = {}) {
  const sockets: FakeSocket[] = [];
  const clock = scheduler();
  const states: string[] = [];
  const notices: string[] = [];
  const errors: string[] = [];
  const events: string[] = [];
  let snapshots: RealtimeClientSnapshot[] = [];

  const client = new RealtimeClient({
    url: 'ws://127.0.0.1:4317/ws',
    token: 'session-token-that-is-long-enough',
    socketFactory: {
      create: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
    },
    ...(options.types === undefined ? {} : { types: options.types as never }),
    ...(options.maxAttempts === undefined ? {} : { maxAttempts: options.maxAttempts }),
    now: () => NOW,
    // Deterministic jitter: `random() === 0` always yields the smallest delay.
    random: () => 0,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    onStateChange: (state, snapshot) => {
      states.push(state);
      snapshots.push(snapshot);
    },
    onNotice: (notice) => notices.push(notice.message),
    onProtocolError: (error) => errors.push(error.message),
    onEvent: (event) => events.push(event.type),
  });

  const welcome = (over: Record<string, unknown> = {}) => ({
    t: 'welcome',
    protocolVersion: REALTIME_PROTOCOL_VERSION,
    sessionId: 'sess_1',
    principalId: 'u_owner',
    roles: ['owner'],
    heartbeatMs: 1_000,
    serverTime: iso(),
    lastSeq: 0,
    availableTypes: ['notification', 'job.status'],
    ...over,
  });

  const eventFrame = (over: Record<string, unknown> = {}) => ({
    t: 'event',
    event: {
      id: 'evt_1',
      type: 'notification',
      schemaVersion: 1,
      seq: 1,
      at: iso(),
      source: { kind: 'system' },
      audienceRoles: ['owner'],
      payload: { level: 'info', title: 'Queued', body: 'A job was queued.' },
      ...over,
    },
  });

  const latest = () => sockets[sockets.length - 1];

  return {
    client,
    sockets,
    clock,
    states,
    notices,
    errors,
    events,
    welcome,
    eventFrame,
    latest,
    snapshot: () => client.snapshot(),
    lastSnapshot: () => snapshots[snapshots.length - 1],
  };
}

describe('realtime client', () => {
  it('authenticates in the first frame, with the subscription, and never in the URL', () => {
    const h = harness({ types: ['notification'] });
    h.client.start();
    expect(h.client.stateName()).toBe('connecting');
    expect(h.sockets).toHaveLength(1);

    h.latest()?.open();
    const frames = h.latest()?.frames() ?? [];
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({
      t: 'auth',
      token: 'session-token-that-is-long-enough',
      protocolVersion: REALTIME_PROTOCOL_VERSION,
      types: ['notification'],
    });
    // No `fromSeq` on a first connection: there is nothing to resume from.
    expect(frames[0]).not.toHaveProperty('fromSeq');
    // The credential is not in the URL, where logs would find it.
    expect(h.client.snapshot().url).not.toContain('session-token');
  });

  it('becomes live on welcome and reports what the role may subscribe to', () => {
    const h = harness();
    h.client.start();
    h.latest()?.open();
    h.latest()?.frame(h.welcome());

    expect(h.client.stateName()).toBe('online');
    const snapshot = h.client.snapshot();
    expect(snapshot.principalId).toBe('u_owner');
    expect(snapshot.roles).toEqual(['owner']);
    expect(snapshot.availableTypes).toEqual(['notification', 'job.status']);
    expect(snapshot.connectedAt).toBe(iso());
    expect(h.states).toContain('online');
  });

  it('delivers validated events and keeps the sequence for a later resume', () => {
    const h = harness();
    h.client.start();
    h.latest()?.open();
    h.latest()?.frame(h.welcome());
    h.latest()?.frame(h.eventFrame());

    expect(h.events).toEqual(['notification']);
    expect(h.client.snapshot()).toMatchObject({ delivered: 1, lastSeq: 1, lastEventAt: iso() });

    // A reconnect resumes above what was delivered, never from zero.
    h.latest()?.serverClose(CLOSE_CODES.GOING_AWAY, 'restarting');
    h.clock.fire();
    h.latest()?.open();
    expect(h.latest()?.frames()[0]).toMatchObject({ t: 'auth', fromSeq: 1 });
  });

  it('drops a stale event instead of letting the feed run backwards', () => {
    const h = harness();
    h.client.start();
    h.latest()?.open();
    h.latest()?.frame(h.welcome());
    h.latest()?.frame(h.eventFrame({ id: 'evt_2', seq: 2 }));
    h.latest()?.frame(h.eventFrame({ id: 'evt_1', seq: 1 }));

    expect(h.events).toEqual(['notification']);
    expect(h.client.snapshot()).toMatchObject({ delivered: 1, staleDropped: 1, lastSeq: 2 });
    expect(h.notices.join(' ')).toMatch(/stale event #1/i);
  });

  it('refuses frames it cannot read: bad JSON, unknown type, invalid payload', () => {
    const h = harness();
    h.client.start();
    h.latest()?.open();
    h.latest()?.frame(h.welcome());

    // 1. not JSON at all
    h.latest()?.raw('not json at all');
    // 2. a frame type that does not exist
    h.latest()?.frame({ t: 'nonsense' });
    // 3. an event type this build does not know
    h.latest()?.frame(h.eventFrame({ id: 'evt_x', seq: 5, type: 'foo.bar' }));
    // 4. an internal event, which no client should ever receive
    h.latest()?.frame(
      h.eventFrame({
        id: 'evt_audit',
        seq: 6,
        type: 'audit.record',
        payload: { event: 'job.enqueued', severity: 'info', subject: 'job_1' },
      }),
    );
    // 5. a payload that violates its own contract: `level` is not a level
    h.latest()?.frame(
      h.eventFrame({
        id: 'evt_bad',
        seq: 7,
        payload: { level: 'shouting', title: 'x', body: 'y' },
      }),
    );

    expect(h.events).toEqual([]);
    expect(h.client.snapshot()).toMatchObject({ delivered: 0, invalidDropped: 5, lastSeq: 0 });
    // Nothing is rendered and everything is reported.
    expect(h.notices.join(' ')).toMatch(/unknown event type/i);
    expect(h.notices.join(' ')).toMatch(/internal event/i);
    expect(h.notices.join(' ')).toMatch(/does not match its contract/i);
  });

  it('backed off after an abnormal close and reconnected', () => {
    const h = harness();
    h.client.start();
    h.latest()?.open();
    h.latest()?.frame(h.welcome());

    h.latest()?.serverClose(CLOSE_CODES.TRY_AGAIN_LATER, 'busy');
    expect(h.client.stateName()).toBe('reconnecting');
    expect(h.snapshot().attempts).toBe(1);
    // 500ms base, 25% jitter, random()=0 -> the smallest delay in the window.
    expect(h.lastSnapshot()?.detail).toMatch(/0\.4s|0\.3s|0\.5s/);

    h.clock.fire();
    expect(h.sockets).toHaveLength(2);
    expect(h.client.snapshot().reconnects).toBe(1);
  });

  it('treats a rejected token as terminal and stops retrying', () => {
    const h = harness();
    h.client.start();
    h.latest()?.serverClose(CLOSE_CODES.UNAUTHORIZED, 'token rejected');

    expect(h.client.stateName()).toBe('denied');
    expect(h.client.snapshot().terminal).toBe(true);
    expect(h.clock.pending()).toBe(0);
    // A retry is refused while the cause stands, so no extra socket is opened.
    h.client.start();
    expect(h.sockets).toHaveLength(1);
    // An explicit retry is a decision that the cause is gone, and it is honoured.
    h.client.retryNow();
    expect(h.sockets).toHaveLength(2);
  });

  it('gives up after the attempt budget and says so', () => {
    const h = harness({ maxAttempts: 2 });
    h.client.start();
    h.latest()?.open();
    h.latest()?.serverClose(CLOSE_CODES.GOING_AWAY, 'restart');
    h.clock.fire();
    h.latest()?.serverClose(CLOSE_CODES.GOING_AWAY, 'restart');
    h.clock.fire();
    h.latest()?.serverClose(CLOSE_CODES.GOING_AWAY, 'restart');

    expect(h.client.stateName()).toBe('offline');
    expect(h.client.snapshot().detail).toMatch(/Gave up after 2 attempt/i);
  });

  it('pings on the server cadence, and treats a missed reply as a dead connection', () => {
    const h = harness();
    h.client.start();
    h.latest()?.open();
    h.latest()?.frame(h.welcome({ heartbeatMs: 1_000 }));

    // First heartbeat: a ping goes out.
    h.clock.fire();
    expect(
      h
        .latest()
        ?.frames()
        .some((frame) => frame.t === 'ping'),
    ).toBe(true);

    // Second heartbeat with no pong: the socket is closed and a retry is scheduled.
    h.clock.fire();
    expect(h.latest()?.closed?.code).toBe(CLOSE_CODES.TRY_AGAIN_LATER);
    expect(h.client.stateName()).toBe('reconnecting');

    // A pong keeps the connection: no close, still online.
    const h2 = harness();
    h2.client.start();
    h2.latest()?.open();
    h2.latest()?.frame(h2.welcome());
    h2.clock.fire();
    h2.latest()?.frame({ t: 'pong', serverTime: iso() });
    h2.clock.fire();
    expect(
      h2
        .latest()
        ?.frames()
        .filter((frame) => frame.t === 'ping'),
    ).toHaveLength(2);
    expect(h2.client.stateName()).toBe('online');
  });

  it('reports a replay gap when the server can no longer cover the resume point', () => {
    const h = harness();
    h.client.start();
    h.latest()?.open();
    h.latest()?.frame(h.welcome());
    h.latest()?.frame(h.eventFrame({ id: 'evt_9', seq: 9 }));

    h.latest()?.serverClose(CLOSE_CODES.GOING_AWAY, 'restart');
    h.clock.fire();
    h.latest()?.open();
    // The server's buffer now starts after what was already delivered.
    h.latest()?.frame(h.welcome({ lastSeq: 3 }));

    expect(h.client.snapshot().gapDetected).toBe(true);
    expect(h.notices.join(' ')).toMatch(/no longer holds events up to #9/i);
  });

  it('subscription changes are sent when live and remembered when not', () => {
    const h = harness({ types: ['notification'] });
    h.client.start();
    h.latest()?.open();
    h.latest()?.frame(h.welcome());

    h.client.setSubscription(['notification', 'job.status']);
    expect(h.latest()?.frames().at(-1)).toMatchObject({ t: 'subscribe', types: ['job.status'] });
    h.client.setSubscription(['job.status']);
    expect(h.latest()?.frames().at(-1)).toMatchObject({
      t: 'unsubscribe',
      types: ['notification'],
    });

    // Offline, the change is recorded and carried by the next auth frame.
    h.client.stop();
    h.client.setSubscription(['system.error']);
    h.client.retryNow();
    h.latest()?.open();
    expect(h.latest()?.frames()[0]).toMatchObject({ t: 'auth', types: ['system.error'] });
  });

  it('stops on request and does not reconnect afterwards', () => {
    const h = harness();
    h.client.start();
    h.latest()?.open();
    h.latest()?.frame(h.welcome());

    h.client.stop();
    expect(h.latest()?.closed?.code).toBe(CLOSE_CODES.NORMAL);
    // Even an abnormal close after `stop()` schedules nothing: the user decided.
    h.latest()?.serverClose(CLOSE_CODES.GOING_AWAY, 'restart');
    expect(h.clock.pending()).toBe(0);
    expect(h.client.stateName()).toBe('offline');
  });

  it('surfaces a protocol version mismatch as terminal instead of misreading frames', () => {
    const h = harness();
    h.client.start();
    h.latest()?.open();
    h.latest()?.frame(h.welcome({ protocolVersion: REALTIME_PROTOCOL_VERSION + 1 }));

    expect(h.client.stateName()).toBe('denied');
    expect(h.client.snapshot().terminal).toBe(true);
    expect(h.latest()?.closed?.code).toBe(CLOSE_CODES.PROTOCOL_VIOLATION);
  });

  it('reports a server error frame without rendering it as an event', () => {
    const h = harness();
    h.client.start();
    h.latest()?.open();
    h.latest()?.frame(h.welcome());
    h.latest()?.frame({ t: 'error', code: 'FORBIDDEN', message: 'not allowed to subscribe' });

    expect(h.errors).toEqual(['not allowed to subscribe']);
    expect(h.events).toEqual([]);
    expect(h.client.stateName()).toBe('online');
  });
});

describe('server frame validation', () => {
  it('rejects malformed envelopes with a reason, and accepts the real ones', () => {
    expect(parseServerFrame('{')).toMatchObject({ ok: false, reason: 'frame is not valid JSON' });
    expect(parseServerFrame('[]')).toMatchObject({ ok: false });
    expect(parseServerFrame('{"t":"welcome"}')).toMatchObject({ ok: false });
    expect(parseServerFrame('{"t":"pong"}')).toMatchObject({ ok: false });
    expect(parseServerFrame('{"t":"error","code":"X"}')).toMatchObject({ ok: false });
    expect(parseServerFrame(`{"t":"notice","level":"shout","message":"x"}`)).toMatchObject({
      ok: false,
    });
    expect(parseServerFrame('{"t":"unknown"}')).toMatchObject({ ok: false });
    // A bounded frame: a peer must not be able to make the client parse forever.
    expect(
      parseServerFrame(`{"t":"notice","level":"info","message":"${'x'.repeat(300)}"}`, 100),
    ).toMatchObject({ ok: false });

    const welcome = parseServerFrame(
      JSON.stringify({
        t: 'welcome',
        protocolVersion: 1,
        sessionId: 's',
        principalId: 'u',
        roles: ['owner'],
        availableTypes: [],
        lastSeq: 0,
        serverTime: iso(),
      }),
    );
    expect(welcome).toMatchObject({ ok: true });
    // A server that omits `heartbeatMs` is still welcome; the client defaults it.
    expect(welcome.ok && welcome.frame.t === 'welcome' && welcome.frame.heartbeatMs).toBe(15_000);
  });

  it('describes every close code it can receive', () => {
    for (const code of Object.values(CLOSE_CODES)) {
      expect(describeClose(code)).not.toMatch(/undefined|NaN/);
    }
    expect(describeClose(4999)).toMatch(/4999/);
  });

  it('derives a socket URL from the API base without leaking a credential', () => {
    expect(websocketUrlFor('http://127.0.0.1:4317')).toBe('ws://127.0.0.1:4317/ws');
    expect(websocketUrlFor('https://example.test/', '/v1/ws')).toBe('wss://example.test/v1/ws');
  });
});
