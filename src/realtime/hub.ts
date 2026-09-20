/**
 * Realtime hub — connection lifecycle, subscriptions and backpressure.
 *
 * The hub is **transport-agnostic**: it talks to a `RealtimeTransport`, which the
 * WebSocket layer implements and which tests implement with a pair of closures.
 * That is what makes the interesting behaviour — authentication deadlines,
 * subscription authorization, heartbeats, rate limits, replay, backpressure —
 * testable without a socket, and it keeps the protocol decisions in one place
 * instead of inside a Fastify plugin.
 *
 * Lifecycle:
 *
 *   connecting → (auth frame) → open → (close) → closed
 *               ↘ (no auth before deadline) → closed 4008
 *
 * Rules worth stating because each one is a real failure mode:
 *
 *   - **Unauthenticated sockets receive nothing.** No events, no notices beyond an
 *     error frame, and they are closed on a deadline. An open socket that has not
 *     authenticated is a resource, not a subscriber.
 *   - **Subscribing is authorized by role.** `EventBus.subscribe` refuses a type
 *     whose audience does not include one of the principal's roles; the hub turns
 *     that into a typed error frame and keeps the connection so the client can
 *     subscribe to something else.
 *   - **Both directions are rate limited.** Inbound frames and outbound events
 *     each get a budget. Exceeding the outbound budget drops events (with a
 *     notice) and closes the connection after too many drops, because a client
 *     that cannot keep up must not make the server buffer without bound.
 *   - **Heartbeats are the server's job.** The server pings; a client that stops
 *     answering is closed on an idle deadline, so a half-open socket is not a
 *     permanently "connected" subscriber.
 *   - **Shutdown is graceful.** `closeAll` tells every client the server is going
 *     away with code 1001, so clients reconnect rather than treat it as a crash.
 */

import type { Principal, Role } from '../auth/model.js';
import { requireOperation } from '../auth/model.js';
import type { SessionService } from '../auth/sessions.js';
import { AppError, PolicyViolationError } from '../core/errors.js';
import type { Logger } from '../core/logging.js';
import { SlidingWindowRateLimiter } from '../core/rateLimit.js';
import { ids } from '../core/ids.js';
import {
  contractFor,
  eventTypes as allEventTypes,
  isRealtimeEventType,
  type RealtimeEventType,
} from './contracts.js';
import { EventBus } from './events.js';
import {
  CLOSE_CODES,
  parseClientFrame,
  REALTIME_PROTOCOL_VERSION,
  serializeFrame,
  type ClientFrame,
  type ServerFrame,
} from './protocol.js';

export interface RealtimeTransport {
  /** Send one serialized frame. Must not throw when the socket is already gone. */
  send(text: string): void;
  close(code: number, reason: string): void;
  isOpen(): boolean;
}

export interface RealtimeLimits {
  /** Deadline for the first (auth) frame after connecting. */
  authTimeoutMs: number;
  /** Server ping interval. */
  heartbeatMs: number;
  /** Close a socket that has sent nothing for this long. */
  idleTimeoutMs: number;
  maxSubscriptions: number;
  maxInboundMessagesPerMinute: number;
  maxOutboundEventsPerSecond: number;
  /** Consecutive dropped events before the connection is closed. */
  maxDroppedEvents: number;
  maxConnections: number;
}

export const DEFAULT_REALTIME_LIMITS: RealtimeLimits = {
  authTimeoutMs: 5_000,
  heartbeatMs: 15_000,
  idleTimeoutMs: 60_000,
  maxSubscriptions: 32,
  maxInboundMessagesPerMinute: 120,
  maxOutboundEventsPerSecond: 50,
  maxDroppedEvents: 100,
  maxConnections: 8,
};

export type ConnectionState = 'connecting' | 'open' | 'closed';

export interface ConnectionSnapshot {
  id: string;
  state: ConnectionState;
  principalId: string | null;
  roles: readonly Role[];
  types: readonly string[];
  openedAt: string;
  lastSeenAt: string;
  eventsDelivered: number;
  eventsDropped: number;
  messagesReceived: number;
  closeCode: number | null;
  closeReason: string | null;
}

export interface RealtimeHubOptions {
  bus: EventBus;
  sessions: SessionService;
  limits?: Partial<RealtimeLimits>;
  logger?: Logger;
  now?: () => number;
  idFactory?: () => string;
  /** Injected so tests need no real timers. */
  setInterval?: (handler: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
  randomBytes?: (size: number) => Buffer;
}

export class RealtimeConnection {
  readonly id: string;
  private connectionState: ConnectionState = 'connecting';
  private principal: Principal | null = null;
  private readonly types = new Set<RealtimeEventType>();
  private unsubscribe: (() => void) | null = null;
  private heartbeatHandle: unknown = null;
  private authTimer: unknown = null;
  private closedCode: number | null = null;
  private closedReason: string | null = null;
  private lastSeen: number;
  private openedAt: number;
  private delivered = 0;
  private dropped = 0;
  private consecutiveDrops = 0;
  private received = 0;
  private readonly inbound: SlidingWindowRateLimiter;
  private readonly outbound: SlidingWindowRateLimiter;

  constructor(
    private readonly hub: RealtimeHub,
    private readonly transport: RealtimeTransport,
    private readonly options: RealtimeHubOptions,
    private readonly limitsConfig: RealtimeLimits,
  ) {
    this.id = (options.idFactory ?? (() => `conn_${ids.id('c')}`))();
    this.lastSeen = this.now();
    this.openedAt = this.now();
    this.inbound = new SlidingWindowRateLimiter(
      { limit: limitsConfig.maxInboundMessagesPerMinute, windowMs: 60_000 },
      () => this.now(),
    );
    this.outbound = new SlidingWindowRateLimiter(
      { limit: limitsConfig.maxOutboundEventsPerSecond, windowMs: 1_000 },
      () => this.now(),
    );
  }

  private now(): number {
    return (this.options.now ?? Date.now)();
  }

  private iso(at: number = this.now()): string {
    return new Date(at).toISOString();
  }

  state(): ConnectionState {
    return this.connectionState;
  }

  principalOrNull(): Principal | null {
    return this.principal;
  }

  snapshot(): ConnectionSnapshot {
    return {
      id: this.id,
      state: this.connectionState,
      principalId: this.principal?.id ?? null,
      roles: this.principal?.roles ?? [],
      types: [...this.types],
      openedAt: this.iso(this.openedAt),
      lastSeenAt: this.iso(this.lastSeen),
      eventsDelivered: this.delivered,
      eventsDropped: this.dropped,
      messagesReceived: this.received,
      closeCode: this.closedCode,
      closeReason: this.closedReason,
    };
  }

  /**
   * Arm the authentication deadline and, when a token is already available from a
   * header, authenticate immediately.
   */
  begin(token: string | null): void {
    if (token !== null) {
      this.authenticate(token);
      if (this.connectionState === 'closed') return;
    }
    if (this.connectionState !== 'open') {
      const setTimer = this.options.setInterval ?? ((handler, ms) => setTimeout(handler, ms));
      this.authTimer = setTimer(() => {
        if (this.connectionState === 'connecting') {
          this.fail(CLOSE_CODES.AUTH_TIMEOUT, 'no authentication frame before the deadline');
        }
      }, this.limitsConfig.authTimeoutMs);
    }
  }

  /** Handle one raw inbound frame. Never throws: a bad frame closes the socket. */
  handle(raw: string): void {
    if (this.connectionState === 'closed') return;
    this.lastSeen = this.now();
    this.received += 1;

    const decision = this.inbound.tryAcquire();
    if (!decision.allowed) {
      this.fail(
        CLOSE_CODES.RATE_LIMITED,
        'too many frames; the client is sending faster than allowed',
      );
      return;
    }

    const parsed = parseClientFrame(raw);
    if (!parsed.ok) {
      // A malformed frame is a protocol error, not a no-op.
      this.fail(CLOSE_CODES.INVALID_FRAME, parsed.reason);
      return;
    }
    this.dispatch(parsed.frame);
  }

  private dispatch(frame: ClientFrame): void {
    switch (frame.t) {
      case 'auth':
        if (this.connectionState === 'open') {
          this.send({ t: 'error', code: 'CONFLICT', message: 'already authenticated' });
          return;
        }
        if (
          frame.protocolVersion !== undefined &&
          frame.protocolVersion !== REALTIME_PROTOCOL_VERSION
        ) {
          this.fail(
            CLOSE_CODES.PROTOCOL_VIOLATION,
            `unsupported protocol version ${frame.protocolVersion}`,
          );
          return;
        }
        this.authenticate(frame.token, frame.fromSeq, frame.types);
        return;
      case 'ping':
        this.send({
          t: 'pong',
          ...(frame.id === undefined ? {} : { id: frame.id }),
          serverTime: this.iso(),
        });
        return;
      case 'subscribe':
        this.subscribe(frame.types);
        return;
      case 'unsubscribe':
        this.unsubscribeTypes(frame.types);
        return;
    }
  }

  private authenticate(token: string, fromSeq?: number, types?: readonly string[]): void {
    let principal: Principal;
    try {
      principal = this.options.sessions.require(token);
      // The same operation gate the HTTP surface uses: realtime access is a
      // permission, not a side channel. A principal with a valid session but no
      // `realtime.connect` grant is refused here, not merely filtered later.
      const decision = requireOperation(principal, 'realtime.connect');
      if (!decision.allowed) {
        throw new PolicyViolationError(decision.reason, { operation: 'realtime.connect' });
      }
    } catch (error) {
      this.fail(
        CLOSE_CODES.UNAUTHORIZED,
        error instanceof AppError ? error.message : 'authentication failed',
      );
      return;
    }

    this.principal = principal;
    if (this.authTimer !== null) {
      this.clearTimer(this.authTimer);
      this.authTimer = null;
    }
    this.connectionState = 'open';

    // Types are declared *after* the principal exists (authorization needs the
    // roles) and *before* the subscription is created, so a reconnect that asks
    // for a replay receives the events it asked for instead of having them
    // filtered out by an empty subscription set.
    if (types !== undefined) this.declareTypes(types);

    // One bus subscription for the connection; per-type filtering happens here so
    // that unsubscribing does not need to tear the bus subscription down.
    this.unsubscribe = this.options.bus.subscribe(principal, (event) => this.onEvent(event), {
      subscriberId: this.id,
      ...(fromSeq === undefined ? {} : { fromSeq }),
    });

    this.heartbeatHandle = (
      this.options.setInterval ?? ((handler, ms) => setInterval(handler, ms))
    )(() => this.heartbeat(), this.limitsConfig.heartbeatMs);

    this.send({
      t: 'welcome',
      protocolVersion: REALTIME_PROTOCOL_VERSION,
      sessionId: this.id,
      principalId: principal.id,
      roles: principal.roles,
      heartbeatMs: this.limitsConfig.heartbeatMs,
      serverTime: this.iso(),
      lastSeq: this.options.bus.lastSeq(),
      availableTypes: this.subscribableTypes(principal),
    });
  }

  /**
   * Authorize and record a set of types without sending a frame. Shared by the
   * `subscribe` frame and the `auth` frame so the two cannot disagree about what a
   * principal may see.
   */
  private declareTypes(types: readonly string[]): boolean {
    let refused = false;
    for (const type of types) {
      if (!isRealtimeEventType(type)) {
        this.send({
          t: 'error',
          code: 'VALIDATION_FAILED',
          message: `unknown event type: ${type}`,
        });
        refused = true;
        continue;
      }
      const contract = contractFor(type);
      if (contract.internal) {
        this.send({
          t: 'error',
          code: 'FORBIDDEN',
          message: `${type} is internal and is not delivered to any client`,
        });
        refused = true;
        continue;
      }
      if (this.types.size >= this.limitsConfig.maxSubscriptions && !this.types.has(type)) {
        this.send({
          t: 'error',
          code: 'RATE_LIMITED',
          message: `subscription limit (${this.limitsConfig.maxSubscriptions}) reached`,
        });
        refused = true;
        continue;
      }
      const roles = this.principal?.roles ?? [];
      if (!roles.some((role) => contract.defaultAudience.includes(role))) {
        this.send({
          t: 'error',
          code: 'FORBIDDEN',
          message: `${type} is not visible to role(s) ${roles.join(',') || 'none'}`,
        });
        refused = true;
        continue;
      }
      this.types.add(type);
    }
    return refused;
  }

  private subscribableTypes(principal: Principal): string[] {
    return allEventTypes().filter((type) => {
      const contract = contractFor(type);
      if (contract.internal) return false;
      return principal.roles.some((role) => contract.defaultAudience.includes(role));
    });
  }

  private subscribe(types: readonly string[]): void {
    if (this.connectionState !== 'open') {
      this.fail(CLOSE_CODES.UNAUTHORIZED, 'not authenticated');
      return;
    }
    const before = new Set(this.types);
    this.declareTypes(types);
    const accepted = [...this.types].filter((type) => !before.has(type));
    // A repeat subscription is acknowledged, not an error: a client reconnecting
    // should not have to guess whether its previous subscription survived.
    const repeated = types.filter((type) => before.has(type as RealtimeEventType));
    const acknowledged = [...accepted, ...repeated];
    if (acknowledged.length > 0) this.send({ t: 'subscribed', types: acknowledged });
  }

  private unsubscribeTypes(types: readonly string[]): void {
    if (this.connectionState !== 'open') {
      this.fail(CLOSE_CODES.UNAUTHORIZED, 'not authenticated');
      return;
    }
    const removed: string[] = [];
    for (const type of types) {
      if (isRealtimeEventType(type) && this.types.delete(type)) removed.push(type);
    }
    this.send({ t: 'unsubscribed', types: removed });
  }

  private onEvent(event: import('./events.js').RealtimeEvent): void {
    if (this.connectionState !== 'open') return;
    // Deny-by-default applies to delivery as well as to audience: a connection
    // receives only what it explicitly asked for, and a connection that asked for
    // nothing receives nothing.
    if (!this.types.has(event.type)) return;
    const decision = this.outbound.tryAcquire();
    if (!decision.allowed) {
      this.dropped += 1;
      this.consecutiveDrops += 1;
      this.options.logger?.warn(
        'realtime event dropped: the client is not keeping up',
        { connectionId: this.id, eventType: event.type, retryAfterMs: decision.retryAfterMs },
        'realtime.backpressure.drop',
      );
      if (this.consecutiveDrops >= this.limitsConfig.maxDroppedEvents) {
        this.fail(
          CLOSE_CODES.BACKPRESSURE,
          `dropped ${this.consecutiveDrops} events; ask for a replay on reconnect`,
        );
        return;
      }
      if (this.consecutiveDrops === 1) {
        this.send({
          t: 'notice',
          level: 'warning',
          message: 'events are being dropped: the client is slower than the stream',
        });
      }
      return;
    }
    this.consecutiveDrops = 0;
    this.delivered += 1;
    this.send({ t: 'event', event });
  }

  private heartbeat(): void {
    if (this.connectionState !== 'open') return;
    if (this.now() - this.lastSeen > this.limitsConfig.idleTimeoutMs) {
      this.fail(CLOSE_CODES.TRY_AGAIN_LATER, 'idle: no frame received within the idle timeout');
      return;
    }
    this.send({ t: 'pong', serverTime: this.iso() });
  }

  private send(frame: ServerFrame): void {
    if (!this.transport.isOpen()) return;
    try {
      this.transport.send(serializeFrame(frame));
    } catch (error) {
      this.options.logger?.warn(
        'realtime send failed',
        { connectionId: this.id, message: error instanceof Error ? error.message : String(error) },
        'realtime.send.failed',
      );
      this.fail(CLOSE_CODES.GOING_AWAY, 'transport failed');
    }
  }

  /** Close with a typed code and stop every timer and subscription. */
  fail(code: number, reason: string): void {
    if (this.connectionState === 'closed') return;
    this.connectionState = 'closed';
    this.closedCode = code;
    this.closedReason = reason;
    if (this.authTimer !== null) this.clearTimer(this.authTimer);
    if (this.heartbeatHandle !== null) this.clearTimer(this.heartbeatHandle);
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.hub.forget(this);
    try {
      this.transport.close(code, reason);
    } catch {
      // A transport that cannot even close is not worth propagating.
    }
    this.options.logger?.info(
      'realtime connection closed',
      { connectionId: this.id, code, reason, delivered: this.delivered, dropped: this.dropped },
      'realtime.closed',
    );
  }

  /** Normal client-side close: no error code, no retry storm. */
  close(reason = 'client closed the connection'): void {
    if (this.connectionState === 'closed') return;
    this.connectionState = 'closed';
    this.closedCode = CLOSE_CODES.NORMAL;
    this.closedReason = reason;
    if (this.authTimer !== null) this.clearTimer(this.authTimer);
    if (this.heartbeatHandle !== null) this.clearTimer(this.heartbeatHandle);
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.hub.forget(this);
  }

  private clearTimer(handle: unknown): void {
    const clear = this.options.clearInterval ?? ((h) => clearTimeout(h as NodeJS.Timeout));
    clear(handle);
  }
}

export class RealtimeHub {
  private readonly connections = new Map<string, RealtimeConnection>();
  private readonly limitValues: RealtimeLimits;

  constructor(private readonly options: RealtimeHubOptions) {
    this.limitValues = { ...DEFAULT_REALTIME_LIMITS, ...options.limits };
  }

  /** Accept a socket. Returns the connection so the transport can drive it. */
  accept(
    transport: RealtimeTransport,
    options: { token?: string | null } = {},
  ): RealtimeConnection {
    if (this.connections.size >= this.limitValues.maxConnections) {
      transport.close(
        CLOSE_CODES.TOO_MANY_CONNECTIONS,
        `at most ${this.limitValues.maxConnections} concurrent connections are allowed`,
      );
      // Still return a closed connection so callers need no second code path.
      const refused = new RealtimeConnection(this, transport, this.options, this.limitValues);
      refused.fail(CLOSE_CODES.TOO_MANY_CONNECTIONS, 'connection limit reached');
      return refused;
    }
    const connection = new RealtimeConnection(this, transport, this.options, this.limitValues);
    this.connections.set(connection.id, connection);
    connection.begin(options.token ?? null);
    return connection;
  }

  /** @internal called by a connection when it closes. */
  forget(connection: RealtimeConnection): void {
    this.connections.delete(connection.id);
  }

  connectionCount(): number {
    return this.connections.size;
  }

  snapshots(): ConnectionSnapshot[] {
    return [...this.connections.values()].map((connection) => connection.snapshot());
  }

  /** Graceful shutdown: clients learn the server is going away and reconnect. */
  closeAll(reason = 'the server is shutting down'): void {
    for (const connection of [...this.connections.values()]) {
      connection.fail(CLOSE_CODES.GOING_AWAY, reason);
    }
    this.connections.clear();
  }

  limits(): RealtimeLimits {
    return this.limitValues;
  }
}
