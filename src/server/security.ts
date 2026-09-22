/**
 * Transport security for the local API.
 *
 * Three boundaries that live *in front of* the route pipeline, applied to every
 * request and every response — including failures, because a security header that
 * is missing exactly when something went wrong is not a security header:
 *
 *   1. **Headers.** `nosniff`, no framing, no referrer, `no-store` on API answers.
 *      This is a local API, but it is rendered *inside* a WebView and reachable from
 *      a browser: a response that can be embedded in a frame or sniffed as a different
 *      type is a response an attacker can turn into a document.
 *   2. **CORS.** An allow-list of loopback origins, echoed back exactly — never `*`,
 *      never with credentials on a wildcard. A request that *states* a foreign origin
 *      is refused outright rather than merely being denied CORS headers: the browser
 *      would block the read, but the write would still have happened.
 *   3. **Rate limiting.** A sliding window per client, keyed on the peer address.
 *      `trustProxy` is false, so the peer address is the socket, not a header a
 *      caller can choose.
 *
 * There are no dependencies here. Each of the three is small enough to read in one
 * sitting, which matters more than the convenience of a package: this is the code
 * that decides whether a request reaches authentication at all.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../../packages/shared/src/core/errors.js';
import { CORRELATION_ID_HEADER } from '../../packages/shared/src/api/contracts.js';
import { SHELL_TOKEN_HEADER } from '../../packages/shared/src/core/headers.js';
import { SlidingWindowRateLimiter } from '../../packages/shared/src/core/rateLimit.js';
import type { Logger } from '../../packages/shared/src/core/logging.js';
import { isLoopbackOrigin, type AppConfig } from '../core/config.js';

/**
 * Response headers applied to every API answer.
 *
 * `Cache-Control: no-store` is deliberate even for cached-looking reads: this
 * process holds a user's portfolio declarations, decisions and session material,
 * and a shared WebView cache is not a place for any of it.
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'cross-origin-resource-policy': 'same-origin',
  'cross-origin-opener-policy': 'same-origin',
  'cache-control': 'no-store',
  'permissions-policy': 'geolocation=(), camera=(), microphone=(), payment=(), usb=()',
};

/** Origins a browser page may call this API from. Loopback only, by construction. */
export { isLoopbackOrigin };

/**
 * Headers a cross-origin caller is allowed to send: names, not values.
 *
 * The two product headers come from `core/headers.ts` rather than being spelled here, so
 * the allow-list cannot drift from the names the desktop shell actually sends — the test
 * that found this list disagreeing with `SHELL_TOKEN_HEADER` is why it is written this way.
 */
const ALLOWED_REQUEST_HEADERS = [
  'authorization',
  'content-type',
  SHELL_TOKEN_HEADER,
  CORRELATION_ID_HEADER,
].join(', ');

/** Headers a cross-origin caller may read back. */
const ALLOWED_RESPONSE_HEADERS = [
  CORRELATION_ID_HEADER,
  'retry-after',
  'x-ratelimit-remaining',
].join(', ');

export interface CorsDecision {
  origin: string | null;
  /** Present only when the origin is allowed and echoed. */
  headers: Record<string, string>;
}

/**
 * Resolve one request's `Origin` against the allow-list.
 *
 * A request with no `Origin` is not a browser cross-origin request (the desktop
 * shell, the tests, `curl`), so it is passed through untouched — the shell token and
 * the session token are what authorize those, not CORS.
 */
export function resolveCors(origin: string | undefined, allowed: readonly string[]): CorsDecision {
  if (origin === undefined || origin === '') return { origin: null, headers: {} };
  const normalized = origin.trim().toLowerCase();
  const permitted = allowed.some((entry) => entry.toLowerCase() === normalized);
  if (!permitted) return { origin: null, headers: {} };
  return {
    origin,
    headers: {
      'access-control-allow-origin': origin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'access-control-allow-headers': ALLOWED_REQUEST_HEADERS,
      'access-control-expose-headers': ALLOWED_RESPONSE_HEADERS,
      'access-control-max-age': '600',
      vary: 'Origin',
    },
  };
}

export interface HttpRateLimitOptions {
  enabled: boolean;
  requestsPerMinute: number;
  now?: () => number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Per-client sliding window, with the bucket table bounded.
 *
 * An unbounded map keyed by client is itself a denial-of-service vector: a caller
 * that rotates its source address would otherwise grow it without limit. Buckets are
 * dropped when the whole table exceeds `maxKeys`, oldest first.
 */
export class HttpRateLimiter {
  private readonly buckets = new Map<string, { limiter: SlidingWindowRateLimiter; seen: number }>();
  private readonly now: () => number;

  constructor(
    private readonly options: HttpRateLimitOptions,
    private readonly maxKeys = 4_096,
  ) {
    this.now = options.now ?? Date.now;
  }

  check(key: string): RateLimitResult {
    if (!this.options.enabled) return { allowed: true, remaining: -1, retryAfterSeconds: 0 };
    const current = this.now();
    let bucket = this.buckets.get(key);
    if (bucket === undefined) {
      bucket = {
        limiter: new SlidingWindowRateLimiter(
          { limit: this.options.requestsPerMinute, windowMs: 60_000 },
          this.now,
        ),
        seen: current,
      };
      this.buckets.set(key, bucket);
      if (this.buckets.size > this.maxKeys) this.evictOldest();
    }
    bucket.seen = current;
    const decision = bucket.limiter.tryAcquire();
    if (decision.allowed) {
      return { allowed: true, remaining: decision.remaining, retryAfterSeconds: 0 };
    }
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil(decision.retryAfterMs / 1_000)),
    };
  }

  /** Number of tracked clients; exposed so a test can prove eviction works. */
  get size(): number {
    return this.buckets.size;
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestSeen = Number.POSITIVE_INFINITY;
    for (const [key, bucket] of this.buckets) {
      if (bucket.seen < oldestSeen) {
        oldestSeen = bucket.seen;
        oldestKey = key;
      }
    }
    if (oldestKey !== null) this.buckets.delete(oldestKey);
  }
}

export interface SecurityOptions {
  config: AppConfig;
  logger: Logger;
  now?: () => number;
  /** Overridden by a test to drive the limiter without waiting. */
  rateLimiter?: HttpRateLimiter;
}

export interface InstalledSecurity {
  rateLimiter: HttpRateLimiter;
}

/**
 * Mount the three boundaries on a Fastify instance.
 *
 * Registered before any route so that an unauthenticated flood is refused before it
 * can reach a handler, and so every reply — including the error envelope — carries the
 * headers.
 */
export function installSecurity(app: FastifyInstance, options: SecurityOptions): InstalledSecurity {
  const { config, logger } = options;
  const rateLimiter =
    options.rateLimiter ??
    new HttpRateLimiter({
      enabled: config.api.rateLimit.enabled,
      requestsPerMinute: config.api.rateLimit.requestsPerMinute,
      ...(options.now === undefined ? {} : { now: options.now }),
    });
  const allowed = config.api.corsAllowedOrigins;

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const origin = request.headers.origin;

    // ── CORS ────────────────────────────────────────────────────────────────
    if (origin !== undefined && origin !== '') {
      const decision = resolveCors(origin, allowed);
      if (decision.origin === null) {
        logger.warn(
          'refused a cross-origin request',
          { origin, route: request.mtRouteId ?? 'unmatched' },
          'security.cors.refused',
        );
        throw new AppError('FORBIDDEN', 'This API does not accept requests from that origin.');
      }
      for (const [name, value] of Object.entries(decision.headers)) reply.header(name, value);
      if (request.method === 'OPTIONS') {
        reply.code(204).send();
        return;
      }
    } else if (request.method === 'OPTIONS') {
      // A preflight with no Origin is not a browser request; answer it as "no".
      reply.code(204).send();
      return;
    }

    // ── rate limit ──────────────────────────────────────────────────────────
    const result = rateLimiter.check(request.ip);
    if (!result.allowed) {
      reply.header('retry-after', String(result.retryAfterSeconds));
      reply.header('x-ratelimit-remaining', '0');
      logger.warn(
        'rate limited a client',
        { route: request.mtRouteId ?? 'unmatched', retryAfterSeconds: result.retryAfterSeconds },
        'security.ratelimit.refused',
      );
      throw new AppError('RATE_LIMITED', 'Too many requests. Try again shortly.', {
        details: { retryAfterSeconds: result.retryAfterSeconds },
      });
    }
    if (result.remaining >= 0) reply.header('x-ratelimit-remaining', String(result.remaining));
  });

  app.addHook('onSend', async (_request: FastifyRequest, reply: FastifyReply) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      // A route that already chose a header wins: the health endpoint sets its own
      // cache policy, and a preflight reply must keep the CORS value it computed.
      if (!reply.hasHeader(name)) reply.header(name, value);
    }
  });

  return { rateLimiter };
}
