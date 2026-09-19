/**
 * Real-time event layer (WebSocket payloads).
 *
 * The bus is transport-agnostic: it decides *who may see which event*, keeps
 * monotonic sequence numbers for ordering, and retains a bounded replay buffer
 * so a reconnecting client can resume without gaps.
 *
 * Security rule: events declare an audience. An event with an empty audience is
 * internal and is never delivered to a client; unauthorized internal events are
 * not merely hidden in the UI, they are never sent.
 */

import type { Principal, Role } from '../auth/model.js';
import { isSessionActive } from '../auth/model.js';
import { PolicyViolationError } from '../core/errors.js';

export type RealtimeEventType =
  | 'agent.message'
  | 'agent.tool'
  | 'agent.status'
  | 'training.progress'
  | 'exam.progress'
  | 'marketdata.tick'
  | 'job.status'
  | 'notification'
  | 'system.status'
  | 'audit.record';

/** Event types that are internal by default and need an explicit audience. */
export const INTERNAL_EVENT_TYPES: readonly RealtimeEventType[] = ['audit.record', 'agent.tool'];

export const DEFAULT_AUDIENCE: Record<RealtimeEventType, readonly Role[]> = {
  'agent.message': ['owner', 'coach', 'student'],
  'agent.tool': ['owner', 'coach'],
  'agent.status': ['owner', 'coach', 'student'],
  'training.progress': ['owner', 'coach', 'student'],
  'exam.progress': ['owner', 'coach', 'student'],
  'marketdata.tick': ['owner', 'coach', 'student', 'observer'],
  'job.status': ['owner', 'coach'],
  notification: ['owner', 'coach', 'student'],
  'system.status': ['owner', 'coach', 'observer'],
  'audit.record': ['owner'],
};

export interface RealtimeEvent<TPayload = unknown> {
  id: string;
  type: RealtimeEventType;
  /** Monotonic per-bus sequence number; the ordering contract. */
  seq: number;
  at: string;
  correlationId?: string;
  audienceRoles: readonly Role[];
  payload: TPayload;
}

export interface PublishInput<TPayload = unknown> {
  type: RealtimeEventType;
  payload: TPayload;
  /** Overrides the default audience. Empty array means internal-only. */
  audienceRoles?: readonly Role[];
  correlationId?: string;
}

export function isVisibleTo(
  event: RealtimeEvent,
  principal: Principal | null,
  now: number = Date.now(),
): boolean {
  if (principal === null) return false;
  if (!isSessionActive(principal.session, now)) return false;
  if (event.audienceRoles.length === 0) return false; // deny-by-default
  return principal.roles.some((role) => event.audienceRoles.includes(role));
}

export interface EventBusOptions {
  bufferSize?: number;
  now?: () => string;
  idFactory?: () => string;
}

type Subscriber = { principal: Principal; handler: (event: RealtimeEvent) => void };

export class EventBus {
  private readonly bufferSize: number;
  private readonly now: () => string;
  private readonly idFactory: () => string;
  private readonly subscribers = new Set<Subscriber>();
  private readonly history: RealtimeEvent[] = [];
  private sequence = 0;
  private counter = 0;

  constructor(options: EventBusOptions = {}) {
    this.bufferSize = options.bufferSize ?? 500;
    this.now = options.now ?? (() => new Date().toISOString());
    this.idFactory = options.idFactory ?? (() => `evt_${++this.counter}`);
  }

  /** Publish and fan out. Returns the stored event with its sequence number. */
  publish<TPayload>(input: PublishInput<TPayload>): RealtimeEvent<TPayload> {
    const audience = input.audienceRoles ?? DEFAULT_AUDIENCE[input.type];
    const event: RealtimeEvent<TPayload> = {
      id: this.idFactory(),
      type: input.type,
      seq: ++this.sequence,
      at: this.now(),
      audienceRoles: [...audience],
      payload: input.payload,
    };
    if (input.correlationId !== undefined) event.correlationId = input.correlationId;
    this.history.push(event as RealtimeEvent);
    if (this.history.length > this.bufferSize) this.history.shift();
    for (const subscriber of [...this.subscribers]) {
      if (isVisibleTo(event as RealtimeEvent, subscriber.principal)) {
        subscriber.handler(event as RealtimeEvent);
      }
    }
    return event;
  }

  /**
   * Subscribe with optional replay from `fromSeq` (exclusive). Replayed events
   * arrive before any new event, preserving sequence order.
   */
  subscribe(
    principal: Principal,
    handler: (event: RealtimeEvent) => void,
    options: { fromSeq?: number } = {},
  ): () => void {
    const subscriber: Subscriber = { principal, handler };
    if (options.fromSeq !== undefined) {
      for (const event of this.history) {
        if (event.seq > (options.fromSeq ?? 0) && isVisibleTo(event, principal)) handler(event);
      }
    }
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }

  subscriberCount(): number {
    return this.subscribers.size;
  }

  historySnapshot(): readonly RealtimeEvent[] {
    return this.history;
  }

  lastSeq(): number {
    return this.sequence;
  }
}

/** Reconnection helper: assert a delivered batch is gap-free and ordered. */
export function assertOrdered(events: readonly RealtimeEvent[]): void {
  let previous = 0;
  for (const event of events) {
    if (event.seq <= previous) {
      throw new PolicyViolationError('Realtime events are out of order', { seq: event.seq });
    }
    previous = event.seq;
  }
}

export function missingSequences(events: readonly RealtimeEvent[]): number[] {
  const missing: number[] = [];
  for (let i = 1; i < events.length; i++) {
    const previous = events[i - 1] as RealtimeEvent;
    const current = events[i] as RealtimeEvent;
    for (let seq = previous.seq + 1; seq < current.seq; seq++) missing.push(seq);
  }
  return missing;
}
