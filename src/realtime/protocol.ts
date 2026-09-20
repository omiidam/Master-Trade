/**
 * Realtime wire protocol.
 *
 * One frame shape, versioned, validated on both sides. Frames are boring on
 * purpose: `t` names the frame and the rest is validated by a Zod schema before
 * anything is done with it. A malformed frame closes the connection with a typed
 * code instead of being ignored — an ignored frame is a client that believes it
 * subscribed.
 *
 * Authentication happens **in the first frame**, not in a query string and not in
 * a cookie:
 *
 *   - a query string ends up in URLs, logs and terminal history (ADR-0022 rejects
 *     credentials anywhere but a header or the body);
 *   - a cookie brings CSRF reasoning that a desktop sidecar does not need;
 *   - the `WebSocket` constructor cannot set an `Authorization` header, so a
 *     browser-based client has no header to use.
 *
 * A native client may still present `Authorization`; both paths are accepted, and
 * a socket that has not authenticated receives **nothing** and is closed on a
 * deadline (`authTimeoutMs`).
 */

import { z } from 'zod';
import { eventTypes } from './contracts.js';

export const REALTIME_PROTOCOL_VERSION = 1 as const;
export const REALTIME_SUBPROTOCOL = 'mt.rt.v1';

/**
 * Close codes in the application range (4000–4999 are reserved for applications).
 * A client can distinguish "retry with a fresh token" from "do not retry".
 */
export const CLOSE_CODES = {
  NORMAL: 1000,
  GOING_AWAY: 1001,
  TRY_AGAIN_LATER: 1013,
  UNAUTHORIZED: 4001,
  PROTOCOL_VIOLATION: 4002,
  INVALID_FRAME: 4003,
  SUBSCRIPTION_REFUSED: 4004,
  AUTH_TIMEOUT: 4008,
  RATE_LIMITED: 4009,
  BACKPRESSURE: 4010,
  TOO_MANY_CONNECTIONS: 4011,
} as const;

export type CloseCode = (typeof CLOSE_CODES)[keyof typeof CLOSE_CODES];

/** Close codes after which retrying is pointless until something changes. */
export const TERMINAL_CLOSE_CODES: readonly number[] = [
  CLOSE_CODES.UNAUTHORIZED,
  CLOSE_CODES.PROTOCOL_VIOLATION,
  CLOSE_CODES.SUBSCRIPTION_REFUSED,
];

export function shouldReconnect(code: number): boolean {
  if (code === CLOSE_CODES.NORMAL || code === CLOSE_CODES.GOING_AWAY) return false;
  return !TERMINAL_CLOSE_CODES.includes(code);
}

const eventTypeSchema = z.enum(eventTypes() as [string, ...string[]]);

/** Client → server. */
export const clientFrameSchema = z.discriminatedUnion('t', [
  z.strictObject({
    t: z.literal('auth'),
    token: z.string().trim().min(16).max(512),
    protocolVersion: z.number().int().optional(),
    /** Resume from a sequence number; the server replays what it still holds. */
    fromSeq: z.number().int().min(0).optional(),
    /**
     * Subscribe in the same frame as authentication. Carrying the subscription
     * here is what makes a reconnect atomic: a client that authenticated first and
     * subscribed second would miss the replay it just asked for, because replay
     * happens at authentication time.
     */
    types: z.array(eventTypeSchema).min(1).max(32).optional(),
  }),
  z.strictObject({
    t: z.literal('subscribe'),
    types: z.array(eventTypeSchema).min(1).max(32),
  }),
  z.strictObject({
    t: z.literal('unsubscribe'),
    types: z.array(eventTypeSchema).min(1).max(32),
  }),
  z.strictObject({
    t: z.literal('ping'),
    id: z.string().trim().max(64).optional(),
  }),
]);

export type ClientFrame = z.infer<typeof clientFrameSchema>;
export type ClientFrameType = ClientFrame['t'];

/** Server → client. */
export type ServerFrame =
  | {
      t: 'welcome';
      protocolVersion: number;
      sessionId: string;
      principalId: string;
      roles: readonly string[];
      heartbeatMs: number;
      serverTime: string;
      /** Highest sequence the server holds; the client resumes above it. */
      lastSeq: number;
      /** Types this principal may subscribe to, so a client need not guess. */
      availableTypes: readonly string[];
    }
  | { t: 'event'; event: unknown }
  | { t: 'pong'; id?: string; serverTime: string }
  | { t: 'subscribed'; types: readonly string[] }
  | { t: 'unsubscribed'; types: readonly string[] }
  | { t: 'notice'; level: 'info' | 'warning'; message: string }
  | { t: 'error'; code: string; message: string; correlationId?: string };

export interface FrameValidation<T> {
  ok: true;
  frame: T;
}
export interface FrameInvalid {
  ok: false;
  reason: string;
}

/**
 * Validate an inbound frame. The raw text is bounded first: a client must not be
 * able to make the server parse an unbounded string.
 */
export function parseClientFrame(
  raw: string,
  maxBytes = 8 * 1024,
): FrameValidation<ClientFrame> | FrameInvalid {
  if (Buffer.byteLength(raw, 'utf8') > maxBytes) {
    return { ok: false, reason: `frame exceeds ${maxBytes} bytes` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'frame is not valid JSON' };
  }
  const result = clientFrameSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    return {
      ok: false,
      reason: `${issue?.path.join('.') || '(root)'}: ${issue?.message ?? 'invalid frame'}`,
    };
  }
  return { ok: true, frame: result.data };
}

export function serializeFrame(frame: ServerFrame): string {
  return JSON.stringify(frame);
}

/**
 * Which close code a refusal should use. Kept here so the transport and the hub
 * cannot disagree about what a failure means to a reconnecting client.
 */
export function closeCodeFor(reason: string): CloseCode {
  if (/not authenticated|token|credential/i.test(reason)) return CLOSE_CODES.UNAUTHORIZED;
  if (/version|protocol/i.test(reason)) return CLOSE_CODES.PROTOCOL_VIOLATION;
  if (/rate/i.test(reason)) return CLOSE_CODES.RATE_LIMITED;
  if (/may not subscribe|audience|denied/i.test(reason)) return CLOSE_CODES.SUBSCRIPTION_REFUSED;
  return CLOSE_CODES.INVALID_FRAME;
}
