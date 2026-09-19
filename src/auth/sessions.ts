/**
 * Session service — the authentication boundary.
 *
 * Local-first design (docs/api-auth.md): a session is issued after the local
 * account is unlocked, holds the principal's roles, and expires on a TTL. The
 * raw token is returned to the caller exactly once; the store keeps only a
 * SHA-256 hash, so a dump of the session table cannot be replayed.
 *
 * Not implemented here on purpose: password verification. That belongs to the
 * persistence slice (credentials table + argon2/scrypt). This service assumes
 * the caller has already authenticated the account and only manages sessions.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { AppError } from '../core/errors.js';
import { isSessionActive, type Principal, type Role, type Session } from './model.js';

export const SESSION_TOKEN_PREFIX = 'mt_s_';

export interface SessionRecord extends Session {
  userId: string;
  roles: readonly Role[];
  tokenHash: string;
  revokedAt?: string;
}

export interface IssuedSession {
  /** Returned once, never stored, never logged. */
  token: string;
  principal: Principal;
}

export interface SessionServiceOptions {
  now?: () => number;
  ttlMinutes?: number;
  /** Injectable entropy for deterministic tests. */
  tokenFactory?: () => string;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Constant-time comparison, used for tokens and shell secrets. */
export function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(hashToken(a), 'hex');
  const right = Buffer.from(hashToken(b), 'hex');
  return timingSafeEqual(left, right);
}

/**
 * Extract a bearer token from an Authorization header value.
 * Returns null when the header is absent or not a bearer credential; the caller
 * decides whether that means "anonymous" or "rejected".
 */
export function bearerToken(headerValue: string | string[] | undefined | null): string | null {
  const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (!raw) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(raw.trim());
  return match?.[1] ?? null;
}

export class SessionService {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly now: () => number;
  private readonly ttlMinutes: number;
  private readonly tokenFactory: () => string;
  private counter = 0;

  constructor(options: SessionServiceOptions = {}) {
    this.now = options.now ?? Date.now;
    this.ttlMinutes = options.ttlMinutes ?? 480;
    this.tokenFactory =
      options.tokenFactory ??
      (() => `${SESSION_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`);
  }

  /** Issue a session for an already-authenticated account. */
  issue(input: { userId: string; roles: readonly Role[]; ttlMinutes?: number }): IssuedSession {
    if (input.userId.trim().length === 0) {
      throw new AppError('VALIDATION_FAILED', 'a session requires a user id');
    }
    if (input.roles.length === 0) {
      // Deny-by-default: a principal with no roles can do nothing, so issuing a
      // session without one is a bug, not a convenience.
      throw new AppError('VALIDATION_FAILED', 'a session requires at least one role');
    }
    const token = this.tokenFactory();
    if (!token.startsWith(SESSION_TOKEN_PREFIX)) {
      throw new AppError('INTERNAL', 'session token factory produced an unexpected format');
    }
    const now = this.now();
    const ttlMinutes = input.ttlMinutes ?? this.ttlMinutes;
    const session: Session = {
      id: `sess_${++this.counter}_${hashToken(token).slice(0, 12)}`,
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttlMinutes * 60_000).toISOString(),
    };
    this.sessions.set(hashToken(token), {
      ...session,
      userId: input.userId,
      roles: [...input.roles],
      tokenHash: hashToken(token),
    });
    return { token, principal: { id: input.userId, roles: [...input.roles], session } };
  }

  /** Resolve a token to a principal, or null when unknown/expired/revoked. */
  redeem(token: string): Principal | null {
    const record = this.sessions.get(hashToken(token));
    if (!record) return null;
    if (record.revokedAt !== undefined) return null;
    if (!isSessionActive(record, this.now())) return null;
    return {
      id: record.userId,
      roles: [...record.roles],
      session: { id: record.id, issuedAt: record.issuedAt, expiresAt: record.expiresAt },
    };
  }

  /** Redeem or fail: used by the middleware so an invalid token is a 401. */
  require(token: string): Principal {
    const principal = this.redeem(token);
    if (!principal) {
      throw new AppError('UNAUTHENTICATED', 'Session is invalid, expired or revoked.');
    }
    return principal;
  }

  revoke(token: string): boolean {
    const record = this.sessions.get(hashToken(token));
    if (!record) return false;
    record.revokedAt = new Date(this.now()).toISOString();
    return true;
  }

  revokeAllForUser(userId: string): number {
    const revokedAt = new Date(this.now()).toISOString();
    let count = 0;
    for (const record of this.sessions.values()) {
      if (record.userId === userId && record.revokedAt === undefined) {
        record.revokedAt = revokedAt;
        count += 1;
      }
    }
    return count;
  }

  activeCount(): number {
    let count = 0;
    for (const record of this.sessions.values()) {
      if (record.revokedAt === undefined && isSessionActive(record, this.now())) count += 1;
    }
    return count;
  }

  purgeExpired(): number {
    const now = this.now();
    let removed = 0;
    for (const [hash, record] of this.sessions) {
      if (!isSessionActive(record, now)) {
        this.sessions.delete(hash);
        removed += 1;
      }
    }
    return removed;
  }

  /** Diagnostics only: hashes and metadata, never tokens. */
  list(): readonly SessionRecord[] {
    return [...this.sessions.values()].map((record) => ({
      ...record,
      // The stored hash is not a credential by itself, but it is still not
      // something to hand out through a diagnostics surface.
      tokenHash: `${record.tokenHash.slice(0, 8)}…`,
    }));
  }
}
