/**
 * Real-time event layer (WebSocket payloads).
 *
 * The bus is transport-agnostic. It decides *who may see which event*, keeps
 * monotonic sequence numbers for ordering, retains a bounded replay buffer so a
 * reconnecting client can resume without gaps, and — new in Phase 3.7 — refuses
 * to carry anything that is not a declared, validated, versioned contract.
 *
 * Four rules, each enforced here rather than trusted to callers:
 *
 *   1. **Deny-by-default delivery.** An event declares an audience. An empty
 *      audience is internal, and an internal event is never serialized to a
 *      client. An unauthorized event is not hidden in the UI; it is never sent.
 *   2. **Publishing is privileged.** Every published event names a `source`
 *      (provenance) and a `publisher`; the contract says who may publish that
 *      type. A module cannot emit `audit.record` or forge a `job.status`.
 *   3. **Audiences may only narrow.** A publisher can restrict an event further,
 *      never widen it beyond the contract's default, and never give an internal
 *      event an audience.
 *   4. **Delivery is reported.** Every publish returns counts of what was
 *      delivered and what was dropped, with reasons. A subscriber whose handler
 *      throws is dropped from the count, not from the process.
 */

import type { Principal, Role } from '../auth/model.js';
import { isSessionActive } from '../auth/model.js';
import { PolicyViolationError } from '../core/errors.js';
import {
  assertValidEventPayload,
  contractFor,
  EVENT_SCHEMA_VERSION,
  isRealtimeEventType,
  mayPublish,
  type EventPublisher,
  type EventSource,
  type RealtimeEventType,
} from './contracts.js';

export type { RealtimeEventType, EventSource, EventPublisher } from './contracts.js';

/** Delivery status of one event to one subscriber. */
export interface EventDelivery {
  subscriberId: string;
  deliveredAt: string;
  status: 'delivered' | 'dropped';
  /** Present when `status` is `dropped`. Safe to show: never a stack trace. */
  reason?: string;
}

export interface RealtimeEvent<TPayload = unknown> {
  id: string;
  type: RealtimeEventType;
  /** Contract version of `payload`. A consumer refuses a version it cannot read. */
  schemaVersion: number;
  /** Monotonic per-bus sequence number; the ordering contract. */
  seq: number;
  at: string;
  /** Provenance: what produced this event and how. */
  source: EventSource;
  correlationId?: string;
  audienceRoles: readonly Role[];
  payload: TPayload;
  /** Set only on the per-subscriber copy; absent on the stored event. */
  delivery?: EventDelivery;
}

export interface PublishInput<TPayload = unknown> {
  type: RealtimeEventType;
  payload: TPayload;
  source: EventSource;
  /** Defaults to `system`. A role publisher must be on the contract allow-list. */
  publisher?: EventPublisher;
  /** May narrow the audience; may never widen it. */
  audienceRoles?: readonly Role[];
  correlationId?: string;
}

export interface PublishReceipt<TPayload = unknown> {
  event: RealtimeEvent<TPayload>;
  delivered: number;
  dropped: number;
  dropReasons: readonly string[];
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

/**
 * The audience a publish is allowed to use.
 *
 * Narrowing is allowed (publish a `training.progress` event to the owner only);
 * widening is not, and an internal type can never acquire an audience.
 */
export function resolveAudience(
  type: RealtimeEventType,
  requested: readonly Role[] | undefined,
): readonly Role[] {
  const contract = contractFor(type);
  if (requested === undefined) return contract.defaultAudience;
  // Publishing an internal event with no audience is the normal case; *giving* it
  // one is the thing that must never happen.
  if (contract.internal) {
    throw new PolicyViolationError(
      `refusing to give internal event ${type} an audience: it is never sent to a client`,
      { type },
    );
  }
  const widened = requested.filter((role) => !contract.defaultAudience.includes(role));
  if (widened.length > 0) {
    throw new PolicyViolationError(
      `refusing to widen the audience of ${type} to ${widened.join(', ')}: a publisher may narrow, never widen`,
      { type, widened },
    );
  }
  return [...requested];
}

export interface EventBusOptions {
  bufferSize?: number;
  now?: () => string;
  idFactory?: () => string;
  /** Observe delivery outcomes; used by tests and telemetry. */
  onDrop?: (event: RealtimeEvent, subscriberId: string, reason: string) => void;
}

type Subscriber = {
  id: string;
  principal: Principal;
  handler: (event: RealtimeEvent) => void;
  /** Event types this subscriber asked for; empty means all visible types. */
  types?: ReadonlySet<RealtimeEventType>;
};

export class EventBus {
  private readonly bufferSize: number;
  private readonly now: () => string;
  private readonly idFactory: () => string;
  private readonly onDrop: EventBusOptions['onDrop'];
  private readonly subscribers = new Map<string, Subscriber>();
  private readonly history: RealtimeEvent[] = [];
  private sequence = 0;
  private counter = 0;
  private subscriberCounter = 0;
  private droppedTotal = 0;

  constructor(options: EventBusOptions = {}) {
    this.bufferSize = options.bufferSize ?? 500;
    this.now = options.now ?? (() => new Date().toISOString());
    this.idFactory = options.idFactory ?? (() => `evt_${++this.counter}`);
    this.onDrop = options.onDrop;
  }

  /**
   * Publish and fan out. Validates the payload against its contract, authorizes
   * the publisher, then delivers to every subscriber entitled to see it.
   */
  publish<TPayload>(input: PublishInput<TPayload>): PublishReceipt<TPayload> {
    if (!isRealtimeEventType(input.type)) {
      throw new PolicyViolationError(`unknown realtime event type: ${String(input.type)}`, {
        type: String(input.type),
      });
    }
    const publisher = input.publisher ?? 'system';
    if (!mayPublish(input.type, publisher)) {
      throw new PolicyViolationError(
        `${String(publisher)} may not publish ${input.type} (deny-by-default publisher list)`,
        { type: input.type, publisher },
      );
    }
    assertValidEventPayload(input.type, input.payload);
    const audience = resolveAudience(input.type, input.audienceRoles);

    const event: RealtimeEvent<TPayload> = {
      id: this.idFactory(),
      type: input.type,
      schemaVersion: contractFor(input.type).schemaVersion ?? EVENT_SCHEMA_VERSION,
      seq: ++this.sequence,
      at: this.now(),
      source: input.source,
      audienceRoles: [...audience],
      payload: input.payload,
    };
    if (input.correlationId !== undefined) event.correlationId = input.correlationId;

    this.history.push(event as RealtimeEvent);
    if (this.history.length > this.bufferSize) this.history.shift();

    let delivered = 0;
    let dropped = 0;
    const dropReasons: string[] = [];

    for (const subscriber of [...this.subscribers.values()]) {
      if (!isVisibleTo(event as RealtimeEvent, subscriber.principal, Date.parse(event.at)))
        continue;
      if (subscriber.types !== undefined && !subscriber.types.has(input.type)) continue;

      const delivery: EventDelivery = {
        subscriberId: subscriber.id,
        deliveredAt: this.now(),
        status: 'delivered',
      };
      try {
        subscriber.handler({ ...(event as RealtimeEvent), delivery });
        delivered += 1;
      } catch (error) {
        // A broken consumer is a dropped delivery, never a failed publish: one
        // connection's bug must not stop the other subscribers or the producer.
        dropped += 1;
        const reason = `subscriber handler failed: ${
          error instanceof Error ? error.message : String(error)
        }`;
        delivery.status = 'dropped';
        delivery.reason = reason;
        dropReasons.push(reason);
        this.droppedTotal += 1;
        this.onDrop?.(event as RealtimeEvent, subscriber.id, reason);
      }
    }

    return { event: event as RealtimeEvent<TPayload>, delivered, dropped, dropReasons };
  }

  /**
   * Subscribe with optional replay from `fromSeq` (exclusive). Replayed events
   * arrive before any new event, preserving sequence order.
   *
   * `types` narrows the subscription; naming a type the principal cannot see is
   * refused rather than silently ignored, because a subscription that looks
   * successful but delivers nothing is worse than an error.
   */
  subscribe(
    principal: Principal,
    handler: (event: RealtimeEvent) => void,
    options: { fromSeq?: number; types?: readonly RealtimeEventType[]; subscriberId?: string } = {},
  ): () => void {
    if (options.types !== undefined) {
      for (const type of options.types) {
        if (!isRealtimeEventType(type)) {
          throw new PolicyViolationError(`unknown subscription type: ${type}`, { type });
        }
        const probe: RealtimeEvent = {
          id: 'probe',
          type,
          schemaVersion: contractFor(type).schemaVersion,
          seq: 0,
          at: this.now(),
          source: { kind: 'system' },
          audienceRoles: contractFor(type).defaultAudience,
          payload: {},
        };
        if (!isVisibleTo(probe, principal, Date.parse(probe.at))) {
          throw new PolicyViolationError(
            `${principal.id} may not subscribe to ${type}: no role in its audience`,
            { type, principalId: principal.id },
          );
        }
      }
    }

    // Subscriber ids are their own sequence. Reusing the event id factory here
    // would make a delivery report claim an event id as the connection it went to.
    const id = options.subscriberId ?? `sub_${++this.subscriberCounter}`;
    const subscriber: Subscriber = {
      id,
      principal,
      handler,
      ...(options.types === undefined ? {} : { types: new Set(options.types) }),
    };
    if (options.fromSeq !== undefined) {
      for (const event of this.history) {
        if (
          event.seq > (options.fromSeq ?? 0) &&
          isVisibleTo(event, principal, Date.parse(event.at))
        ) {
          if (options.types !== undefined && !options.types.includes(event.type)) continue;
          handler({
            ...event,
            delivery: { subscriberId: id, deliveredAt: this.now(), status: 'delivered' },
          });
        }
      }
    }
    this.subscribers.set(id, subscriber);
    return () => {
      this.subscribers.delete(id);
    };
  }

  subscriberCount(): number {
    return this.subscribers.size;
  }

  droppedCount(): number {
    return this.droppedTotal;
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

/**
 * A client that resumes from sequence `resumeFrom` must receive `resumeFrom + 1`
 * first, in order, with no gaps. This is the reconnect contract, and it is worth a
 * helper because "nearly continuous" is the failure mode that loses events
 * silently.
 */
export function assertReplayContinuity(
  resumeFrom: number,
  replayed: readonly RealtimeEvent[],
): void {
  assertOrdered(replayed);
  const gaps = missingSequences(replayed);
  if (gaps.length > 0) {
    throw new PolicyViolationError('Replay left a gap in the sequence', { missing: gaps });
  }
  const first = replayed[0];
  if (first !== undefined && first.seq !== resumeFrom + 1) {
    throw new PolicyViolationError(
      `replay resumed at sequence ${first.seq}, expected ${resumeFrom + 1}`,
      { expected: resumeFrom + 1, actual: first.seq },
    );
  }
}
