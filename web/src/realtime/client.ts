/**
 * Realtime client — the browser half of the WebSocket layer.
 *
 * Framework-free on purpose. React renders this client's state; it does not
 * implement it, so every guarantee below is testable in plain node with an
 * injected socket and injected timers (`tests/realtime-client.test.ts`).
 *
 * The rules it enforces, and why each one exists:
 *
 *   1. **Authenticate in the first frame, subscribe in the same frame.** The
 *      protocol puts the token in the body, not in a query string or a cookie,
 *      because a browser cannot set an `Authorization` header on a WebSocket and
 *      because a token in a URL ends up in logs. Carrying the subscription with
 *      the token is what makes a reconnect atomic: the server replays from
 *      `fromSeq` at authentication time, so a client that subscribed afterwards
 *      would miss the replay it just asked for.
 *   2. **Validate every inbound frame, and deliver nothing invalid.** A frame that
 *      does not match the protocol, or an event whose payload fails its contract,
 *      is counted and dropped — never rendered. A stale frame (a duplicate or an
 *      event older than what has been delivered) is dropped by sequence number, so
 *      a reconnect cannot make the feed go backwards.
 *   3. **Reconnect with backoff and jitter, but only when retrying can help.**
 *      `shouldReconnect` (the protocol's own function) decides: a rejected token,
 *      a protocol violation or a refused subscription is terminal, and this client
 *      goes to `denied` instead of hammering a server that already said no.
 *   4. **Notice a dead connection.** A socket can stay "open" while nothing flows,
 *      so the client pings and treats a missed reply as a failure — the state
 *      machine moves to `reconnecting` rather than showing `online` forever.
 *   5. **Say when the gap was real.** If the server's replay buffer no longer holds
 *      the sequence the client resumes from, the client records the gap. An event
 *      feed with a silent hole is worse than one that admits it.
 *
 * What the client cannot do is as important: it holds no secret beyond the token
 * it was constructed with, it never evaluates anything the server sends, it has no
 * code path that places, cancels or modifies anything except its own subscriptions
 * and its own connection, and job cancellation goes through the HTTP API
 * (`web/src/api/client.ts`) where the server can authorize it.
 */

import {
  CLOSE_CODES,
  REALTIME_PROTOCOL_VERSION,
  REALTIME_SUBPROTOCOL,
  TERMINAL_CLOSE_CODES,
  type ClientFrame,
  type ServerFrame,
} from '@shared/realtime/protocol';
import {
  contractFor,
  isRealtimeEventType,
  validateEventPayload,
  type RealtimeEventType,
} from '@shared/realtime/contracts';
import type { RealtimeEvent } from '@shared/realtime/events';

/** Connection lifecycle, as the UI shows it. */
export type ConnectionState =
  'idle' | 'connecting' | 'authenticating' | 'online' | 'reconnecting' | 'offline' | 'denied';

export type ConnectionEventName =
  'state' | 'event' | 'notice' | 'error' | 'frame-rejected' | 'stale-event';

export interface RealtimeNotice {
  level: 'info' | 'warning';
  message: string;
  at: string;
}

/** Minimal socket surface this client needs; avoids depending on the DOM. */
export interface SocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: (() => void) | null;
  onmessage: ((data: string) => void) | null;
  onclose: ((code: number, reason: string) => void) | null;
  onerror: ((message: string) => void) | null;
}

export interface SocketFactory {
  /** `protocols` is the negotiated subprotocol list; the client sends `mt.rt.v1`. */
  create(url: string, protocols: string[]): SocketLike;
}

export interface RealtimeClientOptions {
  url: string;
  /** Session token. Never logged, never placed in the URL. */
  token: string;
  socketFactory: SocketFactory;
  /** Event types to subscribe to. Defaults to everything the role may receive. */
  types?: readonly RealtimeEventType[];
  /** Backoff base; the first retry waits roughly this long. */
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Fraction of the delay applied randomly, so many clients do not sync up. */
  jitter?: number;
  /** Retries before the client gives up and reports `offline`. */
  maxAttempts?: number;
  /** Liveness window, used until the server's `welcome` names its own. */
  heartbeatFallbackMs?: number;
  now?: () => number;
  random?: () => number;
  setTimer?: (handler: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  onEvent?: (event: RealtimeEvent) => void;
  onStateChange?: (state: ConnectionState, detail: RealtimeClientSnapshot) => void;
  onNotice?: (notice: RealtimeNotice) => void;
  onProtocolError?: (error: { code: string; message: string; correlationId?: string }) => void;
}

export interface RealtimeClientSnapshot {
  state: ConnectionState;
  /** Why the connection is in this state, in words, for the UI to render. */
  detail: string;
  url: string;
  sessionId: string | null;
  principalId: string | null;
  roles: readonly string[];
  /** Types the server says this principal may subscribe to. */
  availableTypes: readonly string[];
  subscribed: readonly string[];
  connectedAt: string | null;
  lastEventAt: string | null;
  /** Highest sequence delivered. The resume point after a reconnect. */
  lastSeq: number;
  attempts: number;
  reconnects: number;
  delivered: number;
  staleDropped: number;
  invalidDropped: number;
  /** True when the server's buffer no longer covered the resume point. */
  gapDetected: boolean;
  lastError: string | null;
  terminal: boolean;
}

const DEFAULTS = {
  baseDelayMs: 500,
  maxDelayMs: 30_000,
  jitter: 0.25,
  maxAttempts: 6,
  heartbeatFallbackMs: 15_000,
};

/** One pending timer, so a scheduled reconnect can be cancelled without leaks. */
interface TimerLike {
  handle: unknown;
}

/**
 * Does a close code mean "try again"?
 *
 * The protocol module exports `shouldReconnect` as well, and this client does not
 * use it — deliberately. That function answers the *server's* question ("should this
 * peer's session be honoured again?") and treats `1001 going away` as final, which
 * is exactly backwards here: a server restarting is the one case where a client
 * should reconnect. The terminal set is what both sides agree on — a rejected
 * credential, a protocol mismatch, a refused subscription — because retrying any of
 * those replays a decision that has already been made.
 */
export function shouldRetryClose(code: number): boolean {
  return !TERMINAL_CLOSE_CODES.includes(code);
}

export class RealtimeClient {
  private readonly options: RealtimeClientOptions;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly setTimer: (handler: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly jitter: number;
  private readonly maxAttempts: number;

  private socket: SocketLike | null = null;
  private state: ConnectionState = 'idle';
  private detail = 'Not connected.';
  private sessionId: string | null = null;
  private principalId: string | null = null;
  private roles: readonly string[] = [];
  private availableTypes: readonly string[] = [];
  private lastSeq = 0;
  private attempts = 0;
  private reconnects = 0;
  private delivered = 0;
  private staleDropped = 0;
  private invalidDropped = 0;
  private gapDetected = false;
  private lastError: string | null = null;
  private lastEventAt: string | null = null;
  private connectedAt: string | null = null;
  private terminal = false;
  private stopped = false;

  private heartbeatMs: number;
  private heartbeatTimer: TimerLike | null = null;
  private reconnectTimer: TimerLike | null = null;
  private awaitingPong = false;
  private desiredTypes: RealtimeEventType[] = [];

  constructor(options: RealtimeClientOptions) {
    this.options = options;
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.setTimer =
      options.setTimer ?? ((handler, ms) => setTimeout(handler, ms) as unknown as TimerLike);
    this.clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as never));
    this.baseDelayMs = options.baseDelayMs ?? DEFAULTS.baseDelayMs;
    this.maxDelayMs = options.maxDelayMs ?? DEFAULTS.maxDelayMs;
    this.jitter = options.jitter ?? DEFAULTS.jitter;
    this.maxAttempts = options.maxAttempts ?? DEFAULTS.maxAttempts;
    this.heartbeatMs = options.heartbeatFallbackMs ?? DEFAULTS.heartbeatFallbackMs;
    this.desiredTypes = [...(options.types ?? [])];
  }

  /* ------------------------------------------------------------- lifecycle */

  /** Ask to connect. Idempotent: a second call while connected does nothing. */
  start(): void {
    if (this.stopped) return;
    if (this.state === 'connecting' || this.state === 'authenticating' || this.state === 'online') {
      return;
    }
    if (this.terminal) return;
    this.attempts = 0;
    this.open('Connecting…');
  }

  /** Intentional disconnect: no reconnect follows, and reconnecting needs `start()`. */
  stop(): void {
    this.stopped = true;
    this.clearTimers();
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      // A deliberate close is a normal close, so the server does not count it as a
      // failed client, and the client's own handler must not schedule a retry.
      try {
        socket.close(CLOSE_CODES.NORMAL, 'client stopped');
      } catch {
        // A socket that is already gone needs no closing.
      }
    }
    this.setState('offline', 'Disconnected. Reconnect to resume the event stream.');
  }

  /**
   * Retry now, clearing the backoff state. This is what the `RetryState` control
   * calls, and it is deliberately separate from `start()`: a user pressing retry
   * after a failure has decided the cause is gone.
   */
  retryNow(): void {
    this.stopped = false;
    this.terminal = false;
    this.lastError = null;
    this.attempts = 0;
    this.clearTimers();
    this.open('Retrying…');
  }

  /** Replace the subscription. Sent immediately when online; otherwise remembered. */
  setSubscription(types: readonly RealtimeEventType[]): void {
    const next = [...new Set(types)];
    const added = next.filter((type) => !this.desiredTypes.includes(type));
    const removed = this.desiredTypes.filter((type) => !next.includes(type));
    this.desiredTypes = next;
    if (this.state !== 'online') {
      this.emitState();
      return;
    }
    if (added.length > 0) this.send({ t: 'subscribe', types: added });
    if (removed.length > 0) this.send({ t: 'unsubscribe', types: removed });
    this.emitState();
  }

  subscribedTypes(): readonly string[] {
    return [...this.desiredTypes];
  }

  stateName(): ConnectionState {
    return this.state;
  }

  snapshot(): RealtimeClientSnapshot {
    return {
      state: this.state,
      detail: this.detail,
      url: this.options.url,
      sessionId: this.sessionId,
      principalId: this.principalId,
      roles: this.roles,
      availableTypes: this.availableTypes,
      subscribed: this.subscribedTypes(),
      connectedAt: this.connectedAt,
      lastEventAt: this.lastEventAt,
      lastSeq: this.lastSeq,
      attempts: this.attempts,
      reconnects: this.reconnects,
      delivered: this.delivered,
      staleDropped: this.staleDropped,
      invalidDropped: this.invalidDropped,
      gapDetected: this.gapDetected,
      lastError: this.lastError,
      terminal: this.terminal,
    };
  }

  /* ------------------------------------------------------------ connection */

  private open(detail: string): void {
    this.clearTimers();
    if (this.socket) {
      const previous = this.socket;
      this.socket = null;
      try {
        previous.close(CLOSE_CODES.GOING_AWAY, 'superseded');
      } catch {
        // Nothing to do; the new socket is what matters.
      }
    }
    this.setState(this.attempts > 0 ? 'reconnecting' : 'connecting', detail);

    let socket: SocketLike;
    try {
      socket = this.options.socketFactory.create(this.options.url, [REALTIME_SUBPROTOCOL]);
    } catch (error) {
      // A construction failure is a connection failure: report it and back off
      // through the same path, so there is one retry policy rather than two.
      this.failConnection(
        error instanceof Error ? error.message : 'could not open a socket',
        CLOSE_CODES.TRY_AGAIN_LATER,
      );
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.setState('authenticating', 'Authenticating…');
      // The subscription rides with the token so the server can replay from
      // `fromSeq` straight into the right subscription set.
      const frame: ClientFrame = {
        t: 'auth',
        token: this.options.token,
        protocolVersion: REALTIME_PROTOCOL_VERSION,
        ...(this.lastSeq > 0 ? { fromSeq: this.lastSeq } : {}),
        ...(this.desiredTypes.length > 0 ? { types: this.desiredTypes } : {}),
      };
      this.send(frame);
    };

    socket.onmessage = (data) => {
      if (this.socket !== socket) return;
      this.handleServerFrame(data);
    };

    socket.onerror = (message) => {
      if (this.socket !== socket) return;
      // `onclose` follows an error on every implementation worth using; the error
      // is recorded so the reason survives even when close carries nothing useful.
      this.lastError = message || 'socket error';
    };

    socket.onclose = (code, reason) => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.failConnection(reason || describeClose(code), code);
    };
  }

  private failConnection(reason: string, code: number): void {
    this.clearTimers();
    this.lastError = reason;
    this.sessionId = null;
    this.connectedAt = null;

    if (this.stopped) {
      this.setState('offline', 'Disconnected.');
      return;
    }
    if (!shouldRetryClose(code)) {
      // The server said no in a way that retrying cannot fix: an invalid token, a
      // protocol violation or a refused subscription.
      this.terminal = true;
      this.setState('denied', `${reason} Retrying will not help until this changes.`);
      return;
    }
    if (this.attempts >= this.maxAttempts) {
      this.terminal = false;
      this.setState(
        'offline',
        `${reason} Gave up after ${this.attempts} attempt(s); retry when the service is back.`,
      );
      return;
    }

    this.attempts += 1;
    const delay = this.backoffDelay(this.attempts);
    this.setState(
      'reconnecting',
      `${reason} Retrying in ${Math.round(delay / 100) / 10}s (attempt ${this.attempts}).`,
    );
    this.reconnectTimer = {
      handle: this.setTimer(() => {
        this.reconnectTimer = null;
        if (this.stopped) return;
        this.reconnects += 1;
        this.open('Reconnecting…');
      }, delay),
    };
  }

  /** Exponential backoff with jitter, bounded by `maxDelayMs`. */
  private backoffDelay(attempt: number): number {
    const raw = Math.min(this.maxDelayMs, this.baseDelayMs * 2 ** (attempt - 1));
    const spread = this.jitter * raw;
    return Math.round(raw - spread + 2 * spread * this.random());
  }

  private clearTimers(): void {
    if (this.heartbeatTimer !== null) {
      this.clearTimer(this.heartbeatTimer.handle);
      this.heartbeatTimer = null;
    }
    if (this.reconnectTimer !== null) {
      this.clearTimer(this.reconnectTimer.handle);
      this.reconnectTimer = null;
    }
    this.awaitingPong = false;
  }

  /**
   * Send one client frame.
   *
   * The serialization is deliberately local: the backend's `serializeFrame` takes a
   * `ServerFrame`, and typing a client frame into it would be the compiler being
   * talked out of a real distinction between the two directions.
   */
  private send(frame: ClientFrame): void {
    const socket = this.socket;
    if (!socket) return;
    try {
      socket.send(JSON.stringify(frame));
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'could not send a frame';
    }
  }

  /* --------------------------------------------------------------- inbound */

  /**
   * Parse and act on one server frame. Every branch either delivers something
   * validated or records why it did not; nothing is rendered unvalidated.
   */
  private handleServerFrame(raw: string): void {
    const parsed = parseServerFrame(raw);
    if (!parsed.ok) {
      this.invalidDropped += 1;
      this.options.onNotice?.({
        level: 'warning',
        message: `Dropped an unreadable frame: ${parsed.reason}`,
        at: new Date(this.now()).toISOString(),
      });
      return;
    }

    const frame = parsed.frame;
    switch (frame.t) {
      case 'welcome': {
        this.sessionId = frame.sessionId;
        this.principalId = frame.principalId;
        this.roles = frame.roles;
        this.availableTypes = frame.availableTypes;
        this.connectedAt = new Date(this.now()).toISOString();
        this.heartbeatMs = frame.heartbeatMs > 0 ? frame.heartbeatMs : this.heartbeatMs;
        if (frame.protocolVersion !== REALTIME_PROTOCOL_VERSION) {
          // Speaking a different version is exactly the case the version field
          // exists for: stop rather than misread the frames that follow.
          this.lastError = `server speaks protocol v${frame.protocolVersion}, this client speaks v${REALTIME_PROTOCOL_VERSION}`;
          this.terminal = true;
          const socket = this.socket;
          this.socket = null;
          try {
            socket?.close(CLOSE_CODES.PROTOCOL_VIOLATION, 'protocol version mismatch');
          } catch {
            // Already gone.
          }
          this.setState('denied', this.lastError);
          return;
        }
        // Replay coverage: the server names the highest sequence it holds. If that
        // is behind what was already delivered, the gap is real and is reported
        // rather than papered over by continuing from a mutated counter.
        if (this.lastSeq > 0 && frame.lastSeq < this.lastSeq) {
          this.gapDetected = true;
          this.options.onNotice?.({
            level: 'warning',
            message: `The server no longer holds events up to #${this.lastSeq}; #${frame.lastSeq + 1} onward is what it can replay.`,
            at: new Date(this.now()).toISOString(),
          });
        }
        this.setState('online', `Connected as ${frame.principalId}.`);
        // A fresh session starts with no ping outstanding.
        this.awaitingPong = false;
        this.scheduleHeartbeat();
        return;
      }
      case 'event': {
        this.handleEvent(frame.event);
        return;
      }
      case 'pong': {
        this.awaitingPong = false;
        return;
      }
      case 'subscribed':
      case 'unsubscribed': {
        // The server confirms what it accepted; the client's desired set is what
        // the UI shows, and a refusal arrives as an `error` frame instead.
        return;
      }
      case 'notice': {
        this.options.onNotice?.({
          level: frame.level,
          message: frame.message,
          at: new Date(this.now()).toISOString(),
        });
        return;
      }
      case 'error': {
        this.lastError = frame.message;
        this.options.onProtocolError?.({
          code: frame.code,
          message: frame.message,
          ...(frame.correlationId === undefined ? {} : { correlationId: frame.correlationId }),
        });
        return;
      }
      default: {
        // Exhaustiveness: a new frame type must be handled, not ignored.
        const unhandled: never = frame;
        void unhandled;
        this.invalidDropped += 1;
      }
    }
  }

  private handleEvent(raw: unknown): void {
    if (typeof raw !== 'object' || raw === null) {
      this.invalidDropped += 1;
      return;
    }
    const event = raw as Partial<RealtimeEvent>;
    if (
      typeof event.id !== 'string' ||
      typeof event.type !== 'string' ||
      typeof event.seq !== 'number' ||
      typeof event.schemaVersion !== 'number' ||
      typeof event.at !== 'string'
    ) {
      this.invalidDropped += 1;
      return;
    }
    if (!isRealtimeEventType(event.type)) {
      // An unknown type is a server that is ahead of this client. Dropping it is
      // the honest option: the alternative is rendering a payload we cannot read.
      this.invalidDropped += 1;
      this.options.onNotice?.({
        level: 'warning',
        message: `Ignored an unknown event type: ${event.type}`,
        at: new Date(this.now()).toISOString(),
      });
      return;
    }
    if (contractFor(event.type).internal) {
      // The bus refuses to give an internal event an audience, so this should be
      // unreachable. The check stays because "should be unreachable" is exactly the
      // assumption that leaks internal detail — tool execution data, audit rows — into
      // whatever surface happens to be rendering events.
      this.invalidDropped += 1;
      this.options.onNotice?.({
        level: 'warning',
        message: `Refused an internal event (${event.type}): internal events are never client-visible.`,
        at: new Date(this.now()).toISOString(),
      });
      return;
    }
    if (event.seq <= this.lastSeq) {
      // Stale: a duplicate, or a replay of something already delivered. Sequence
      // numbers are the ordering contract, so the feed never goes backwards.
      this.staleDropped += 1;
      this.options.onNotice?.({
        level: 'info',
        message: `Ignored stale event #${event.seq} (${event.type}).`,
        at: new Date(this.now()).toISOString(),
      });
      return;
    }
    const validation = validateEventPayload(event.type, event.payload);
    if (!validation.ok) {
      this.invalidDropped += 1;
      this.options.onNotice?.({
        level: 'warning',
        message: `Refused a ${event.type} event that does not match its contract: ${validation.issues.join('; ')}`,
        at: new Date(this.now()).toISOString(),
      });
      return;
    }

    this.lastSeq = event.seq;
    this.lastEventAt = new Date(this.now()).toISOString();
    this.delivered += 1;
    this.options.onEvent?.(event as RealtimeEvent);
    this.emitState();
  }

  /* -------------------------------------------------------------- heartbeat */

  /**
   * Ping on the server's cadence. A missed reply moves the connection to
   * `reconnecting`: a socket that is open but silent is not a working stream, and
   * showing `online` for one is the failure mode this loop exists to prevent.
   */
  private scheduleHeartbeat(): void {
    if (this.heartbeatTimer !== null) this.clearTimer(this.heartbeatTimer.handle);
    // `awaitingPong` is deliberately NOT reset here: this is called from the timer
    // callback right after a ping goes out, and clearing the flag there would erase
    // the very thing the next tick checks — the connection would then look healthy
    // forever. It is cleared on `welcome` and whenever the connection is torn down.
    this.heartbeatTimer = {
      handle: this.setTimer(() => {
        this.heartbeatTimer = null;
        if (this.state !== 'online') return;
        if (this.awaitingPong) {
          const socket = this.socket;
          this.socket = null;
          try {
            socket?.close(CLOSE_CODES.TRY_AGAIN_LATER, 'heartbeat timed out');
          } catch {
            // Already gone.
          }
          this.failConnection('No heartbeat reply.', CLOSE_CODES.TRY_AGAIN_LATER);
          return;
        }
        this.awaitingPong = true;
        this.send({ t: 'ping' });
        this.scheduleHeartbeat();
      }, this.heartbeatMs),
    };
  }

  private setState(state: ConnectionState, detail: string): void {
    this.state = state;
    this.detail = detail;
    this.emitState();
  }

  private emitState(): void {
    this.options.onStateChange?.(this.state, this.snapshot());
  }
}

/** Human wording for a close code, used when the server sends no reason. */
export function describeClose(code: number): string {
  switch (code) {
    case CLOSE_CODES.NORMAL:
      return 'The connection closed normally.';
    case CLOSE_CODES.GOING_AWAY:
      return 'The server is shutting down.';
    case CLOSE_CODES.TRY_AGAIN_LATER:
      return 'The server asked this client to try again later.';
    case CLOSE_CODES.UNAUTHORIZED:
      return 'The session token was rejected.';
    case CLOSE_CODES.PROTOCOL_VIOLATION:
      return 'The server refused the protocol version.';
    case CLOSE_CODES.INVALID_FRAME:
      return 'The server could not read a frame this client sent.';
    case CLOSE_CODES.SUBSCRIPTION_REFUSED:
      return 'A subscription was refused for this role.';
    case CLOSE_CODES.AUTH_TIMEOUT:
      return 'Authentication did not complete in time.';
    case CLOSE_CODES.RATE_LIMITED:
      return 'The client sent frames too quickly.';
    case CLOSE_CODES.BACKPRESSURE:
      return 'The client was not keeping up with the event stream.';
    case CLOSE_CODES.TOO_MANY_CONNECTIONS:
      return 'Too many connections are open for this session.';
    default:
      return `The connection closed (code ${code}).`;
  }
}

/* ------------------------------------------------------- server frames ---- */

export interface FrameOk {
  ok: true;
  frame: ServerFrame;
}
export interface FrameBad {
  ok: false;
  reason: string;
}

/**
 * Validate an inbound server frame.
 *
 * The backend publishes `ServerFrame` as a type and validates only what it
 * receives, so the client validates what *it* receives — the payload inside an
 * event is checked against the backend's own contract (`validateEventPayload`),
 * which is the shared half, and the envelope is checked here. The raw text is
 * bounded first: a peer must not be able to make the client parse an unbounded
 * string.
 */
export function parseServerFrame(raw: string, maxBytes = 256 * 1024): FrameOk | FrameBad {
  if (typeof raw !== 'string') return { ok: false, reason: 'frame was not text' };
  if (raw.length > maxBytes) return { ok: false, reason: `frame exceeds ${maxBytes} characters` };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'frame is not valid JSON' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: 'frame is not an object' };
  }
  const frame = parsed as Record<string, unknown>;
  switch (frame.t) {
    case 'welcome': {
      if (
        typeof frame.protocolVersion !== 'number' ||
        typeof frame.sessionId !== 'string' ||
        typeof frame.principalId !== 'string' ||
        !Array.isArray(frame.roles) ||
        !Array.isArray(frame.availableTypes) ||
        typeof frame.lastSeq !== 'number' ||
        typeof frame.serverTime !== 'string'
      ) {
        return { ok: false, reason: 'welcome frame is missing required fields' };
      }
      // `heartbeatMs` is defaulted rather than required: a server that omits it is
      // still welcome, and the client falls back to its own liveness window.
      return {
        ok: true,
        frame: {
          t: 'welcome',
          protocolVersion: frame.protocolVersion,
          sessionId: frame.sessionId,
          principalId: frame.principalId,
          roles: frame.roles as readonly string[],
          availableTypes: frame.availableTypes as readonly string[],
          heartbeatMs: typeof frame.heartbeatMs === 'number' ? frame.heartbeatMs : 15_000,
          serverTime: frame.serverTime,
          lastSeq: frame.lastSeq,
        },
      };
    }
    case 'event': {
      if (!('event' in frame)) return { ok: false, reason: 'event frame carries no event' };
      return { ok: true, frame: frame as unknown as ServerFrame };
    }
    case 'pong': {
      if (typeof frame.serverTime !== 'string') {
        return { ok: false, reason: 'pong frame has no server time' };
      }
      return { ok: true, frame: frame as unknown as ServerFrame };
    }
    case 'subscribed':
    case 'unsubscribed': {
      if (!Array.isArray(frame.types)) {
        return { ok: false, reason: `${frame.t} frame has no types` };
      }
      return { ok: true, frame: frame as unknown as ServerFrame };
    }
    case 'notice': {
      if (
        (frame.level !== 'info' && frame.level !== 'warning') ||
        typeof frame.message !== 'string'
      ) {
        return { ok: false, reason: 'notice frame is malformed' };
      }
      return { ok: true, frame: frame as unknown as ServerFrame };
    }
    case 'error': {
      if (typeof frame.code !== 'string' || typeof frame.message !== 'string') {
        return { ok: false, reason: 'error frame is malformed' };
      }
      return { ok: true, frame: frame as unknown as ServerFrame };
    }
    default:
      return { ok: false, reason: `unknown frame type: ${String(frame.t)}` };
  }
}

/** WebSocket URL for an HTTP API base, so callers do not each re-derive it. */
export function websocketUrlFor(apiBaseUrl: string, path = '/ws'): string {
  const trimmed = apiBaseUrl.replace(/\/+$/, '');
  const wsBase = trimmed.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  return `${wsBase}${path}`;
}
