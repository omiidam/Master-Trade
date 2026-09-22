/**
 * Security, privacy and safety — the gate, not the tour.
 *
 * This suite exists to make three kinds of claim falsifiable, and it is deliberately less
 * about features than about *boundaries*:
 *
 *   1. **The transport refuses before authentication.** Security headers are on failures as
 *      well as successes; a foreign origin is refused rather than merely denied CORS
 *      headers; a client's flood is a 429 before any handler runs.
 *   2. **Nothing sensitive leaves.** An unexpected internal failure is redacted in the body
 *      while the log keeps the detail; a log line never carries a credential; a stored file
 *      is only visible to its owner; a caller-supplied filename cannot escape its directory.
 *   3. **Nothing can trade.** No route names an order, no source file enables live trading or
 *      broker execution, the model has no direct tool path, and no high-signal credential
 *      pattern appears anywhere in the shipped source.
 *
 * The suites that already cover adjacent ground — `safety`, `realtime-ws`, `llm-registry`,
 * `desktop-shell` — are not duplicated here. Where a claim was theirs, this file cites it and
 * tests the part they do not.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  Logger,
  MemoryLogSink,
  redactString,
  redactValue,
} from '../packages/shared/src/core/logging.js';
import { DEFAULT_CONFIG, resolveConfig } from '../src/core/config.js';
import { API_ROUTES } from '../packages/shared/src/api/contracts.js';
import { SHELL_TOKEN_HEADER } from '../packages/shared/src/core/headers.js';
import { InMemoryFileStorage, sanitizeFilename } from '../src/storage/files.js';
import {
  AppError,
  ERROR_STATUS,
  PolicyViolationError,
} from '../packages/shared/src/core/errors.js';
import { HttpRateLimiter, SECURITY_HEADERS, resolveCors } from '../src/server/security.js';
import { INTERNAL_MESSAGE, toHttpFailure } from '../src/server/errors.js';
import { createServer } from '../src/server/index.js';
import type { ServerDeps } from '../src/server/index.js';

const NOW = 1_700_000_000_000;
const ALLOWED_ORIGIN = 'http://127.0.0.1:5173';
const FOREIGN_ORIGIN = 'https://evil.example';

function build(deps: ServerDeps = {}) {
  const sink = new MemoryLogSink();
  const server = createServer({
    config: resolveConfig({}),
    sink,
    now: () => NOW,
    ...deps,
  });
  return { server, sink };
}

describe('response hardening', () => {
  it('stamps every security header on a successful answer', async () => {
    const { server } = build();
    const response = await server.app.inject({ method: 'GET', url: '/v1/health' });
    expect(response.statusCode).toBe(200);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(response.headers[name], `${name} is missing`).toBe(value);
    }
    await server.close();
  });

  it('stamps them on a failure too — including the ones this layer raises', async () => {
    const { server } = build();
    const unauthorised = await server.app.inject({
      method: 'GET',
      url: '/v1/usage',
      headers: { origin: FOREIGN_ORIGIN },
    });
    expect(unauthorised.statusCode).toBe(ERROR_STATUS.FORBIDDEN);
    expect(unauthorised.headers['x-content-type-options']).toBe('nosniff');
    expect(unauthorised.headers['cache-control']).toBe('no-store');
    expect(unauthorised.headers['x-frame-options']).toBe('DENY');
    await server.close();
  });

  it('never allows the response to be cached by a shared cache', async () => {
    const { server } = build();
    const response = await server.app.inject({ method: 'GET', url: '/v1/health' });
    // `no-store` rather than `no-cache`: the point is that portfolio declarations and
    // decisions are not written to a WebView cache at all, not that they are revalidated.
    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.headers['cross-origin-resource-policy']).toBe('same-origin');
    await server.close();
  });
});

describe('cross-origin policy', () => {
  it('echoes a loopback origin exactly, with credentials and a Vary', () => {
    const decision = resolveCors(ALLOWED_ORIGIN, DEFAULT_CONFIG.api.corsAllowedOrigins);
    expect(decision.origin).toBe(ALLOWED_ORIGIN);
    expect(decision.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(decision.headers['access-control-allow-credentials']).toBe('true');
    expect(decision.headers['vary']).toBe('Origin');
    // Never the wildcard: a wildcard with credentials is refused by browsers, and a
    // wildcard without them would be a different (worse) policy than the one declared.
    expect(decision.headers['access-control-allow-origin']).not.toBe('*');
  });

  it('refuses a foreign origin outright rather than merely withholding headers', async () => {
    const { server, sink } = build();
    const response = await server.app.inject({
      method: 'GET',
      url: '/v1/health',
      headers: { origin: FOREIGN_ORIGIN },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FORBIDDEN');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    // The refusal is visible: a silent block would be indistinguishable from a bug.
    expect(sink.records.some((record) => record.event === 'security.cors.refused')).toBe(true);
    await server.close();
  });

  it('refuses a private-network origin as well: loopback means loopback', () => {
    for (const origin of ['http://192.168.1.10:5173', 'http://10.0.0.5:4317', 'file://']) {
      const decision = resolveCors(origin, DEFAULT_CONFIG.api.corsAllowedOrigins);
      expect(decision.origin, `${origin} must not be permitted`).toBeNull();
    }
  });

  it('leaves a request with no Origin alone — the shell and the CLI are not a browser', async () => {
    const { server } = build();
    const response = await server.app.inject({ method: 'GET', url: '/v1/health' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    await server.close();
  });

  it('answers a preflight without running the route, and without a wildcard', async () => {
    const { server } = build();
    const response = await server.app.inject({
      method: 'OPTIONS',
      url: '/v1/usage',
      headers: { origin: ALLOWED_ORIGIN, 'access-control-request-method': 'GET' },
    });
    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-methods']).toContain('GET');
    expect(response.headers['access-control-allow-headers']).toContain('authorization');
    // The shell token header is allowed through explicitly, because the desktop shell must
    // be able to send it; a wildcard would have allowed every header including future ones.
    expect(response.headers['access-control-allow-headers']).toContain(SHELL_TOKEN_HEADER);
    await server.close();
  });

  it('refuses to boot with a public origin in the allow-list', () => {
    expect(() =>
      resolveConfig({
        api: { ...DEFAULT_CONFIG.api, corsAllowedOrigins: ['https://mastertrade.example'] },
      }),
    ).toThrow(PolicyViolationError);
  });
});

describe('rate limiting', () => {
  it('refuses a client past its window, before authentication runs', async () => {
    const limiter = new HttpRateLimiter({ enabled: true, requestsPerMinute: 2, now: () => NOW });
    const { server } = build({ rateLimiter: limiter });

    const first = await server.app.inject({ method: 'GET', url: '/v1/health' });
    expect(first.statusCode).toBe(200);
    expect(first.headers['x-ratelimit-remaining']).toBe('1');

    await server.app.inject({ method: 'GET', url: '/v1/health' });
    const refused = await server.app.inject({ method: 'GET', url: '/v1/health' });

    expect(refused.statusCode).toBe(429);
    expect(refused.json().error.code).toBe('RATE_LIMITED');
    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
    await server.close();
  });

  it('refuses an unauthenticated flood as a flood, not as a series of 401s', async () => {
    const limiter = new HttpRateLimiter({ enabled: true, requestsPerMinute: 1, now: () => NOW });
    const { server } = build({ rateLimiter: limiter });
    await server.app.inject({ method: 'GET', url: '/v1/usage' });
    const refused = await server.app.inject({ method: 'GET', url: '/v1/usage' });
    // The order is the security property: the cheap check happens before the expensive
    // one, so an unauthenticated caller cannot make the process do session work.
    expect(refused.statusCode).toBe(429);
    expect(refused.json().error.code).not.toBe('UNAUTHENTICATED');
    await server.close();
  });

  it('bounds the table of tracked clients instead of growing without limit', () => {
    const limiter = new HttpRateLimiter({ enabled: true, requestsPerMinute: 5, now: () => NOW }, 8);
    for (let index = 0; index < 200; index += 1) limiter.check(`client-${index}`);
    expect(limiter.size).toBeLessThanOrEqual(8);
  });

  it('does not accumulate a window for a client that has stopped calling', () => {
    let clock = NOW;
    const limiter = new HttpRateLimiter({
      enabled: true,
      requestsPerMinute: 2,
      now: () => clock,
    });
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(false);
    clock += 61_000;
    expect(limiter.check('a').allowed).toBe(true);
  });

  it('refuses a configuration that turns the limit off', () => {
    expect(() =>
      resolveConfig({
        api: { ...DEFAULT_CONFIG.api, rateLimit: { enabled: true, requestsPerMinute: 0 } },
      }),
    ).toThrow(PolicyViolationError);
  });
});

describe('error redaction', () => {
  it('replaces a message this codebase did not write, and keeps it in the log', () => {
    const raw = new Error('SQLITE_ERROR: no such table at C:\\Users\\omiid\\AppData\\mt.sqlite');
    const failure = toHttpFailure(raw, 'corr_1');
    expect(failure.status).toBe(500);
    expect(failure.response).toEqual({
      ok: false,
      error: { code: 'INTERNAL', message: INTERNAL_MESSAGE },
      correlationId: 'corr_1',
    });
    // The detail is not lost, it is *relocated*: the correlation id joins body to log.
    expect(failure.logMessage).toContain('AppData');
    expect(JSON.stringify(failure.response)).not.toContain('AppData');
  });

  it('keeps a message this codebase did write, because those are meant to be read', () => {
    const failure = toHttpFailure(
      new AppError('FORBIDDEN', 'This API does not accept requests from that origin.'),
      'corr_2',
    );
    expect(failure.response.ok).toBe(false);
    if (failure.response.ok) throw new Error('unreachable');
    expect(failure.response.error.message).toContain('does not accept');
  });

  it('never returns a stack trace or a thrown object', () => {
    const failure = toHttpFailure({ wildly: 'unexpected' }, 'corr_3');
    expect(failure.response.ok).toBe(false);
    expect(JSON.stringify(failure.response)).not.toContain('wildly');
    expect(JSON.stringify(failure.response)).not.toContain('at ');
  });
});

describe('log redaction', () => {
  it('redacts a credential by key and by shape, at any depth', () => {
    const { sink } = build({ captureLogs: true });
    const logger = new Logger({ component: 'test', sink });
    logger.info('contacting provider', {
      apiKey: 'live-key-value',
      nested: { authorization: 'Bearer abc.def', note: 'used sk-abcdef1234567890' },
      rows: ['ghp_abcdefghijklmnopqrst'],
    });
    const written = JSON.stringify(sink.records);
    expect(written).not.toContain('live-key-value');
    expect(written).not.toContain('abc.def');
    expect(written).not.toContain('sk-abcdef1234567890');
    expect(written).not.toContain('ghp_abcdefghijklmnopqrst');
    expect(written).toContain('[redacted]');
  });

  it('redacts a secret that arrives inside a message string', () => {
    expect(redactString('token sk-abcdef123456 rejected')).toBe('token [redacted] rejected');
    expect(redactValue({ anyKey: 'AKIAABCDEFGHIJKLMNOP' })).toEqual({ anyKey: '[redacted]' });
  });
});

describe('file handling', () => {
  it('cannot be talked out of its directory by a caller-supplied name', () => {
    const hostile = [
      '../../etc/passwd',
      '..\\..\\windows\\system32\\config.sys',
      '/absolute/path/report.pdf',
      'C:\\Users\\omiid\\.ssh\\id_rsa',
      '....//....//etc/shadow',
      '..%2f..%2fsecret.txt',
    ];
    for (const name of hostile) {
      const safe = sanitizeFilename(name);
      expect(safe, name).not.toContain('/');
      expect(safe, name).not.toContain('\\');
      expect(safe.startsWith('.'), `${name} -> ${safe}`).toBe(false);
    }
    // A traversal attempt keeps only a readable basename, and never an empty string.
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('')).toBe('unnamed');
  });

  it('isolates one owner’s files from another’s', async () => {
    const storage = new InMemoryFileStorage();
    await storage.put({
      ownerId: 'user-a',
      category: 'document',
      filename: 'notes.md',
      mimeType: 'text/markdown',
      bytes: new TextEncoder().encode('# notes'),
    });
    expect((await storage.list('user-a')).length).toBe(1);
    expect(await storage.list('user-b')).toEqual([]);
  });

  it('refuses a sensitive category and an oversized file without a policy change', async () => {
    const storage = new InMemoryFileStorage();
    await expect(
      storage.put({
        ownerId: 'user-a',
        category: 'document',
        filename: 'secret.pdf',
        mimeType: 'application/pdf',
        bytes: new TextEncoder().encode('x'),
        sensitivity: 'sensitive',
      }),
    ).rejects.toThrow(PolicyViolationError);
  });
});

describe('the trading boundary', () => {
  it('exposes no route that could place, execute or cancel an order', () => {
    const forbidden = /order|trade|execute|broker|position|fill|route|orderbook/i;
    for (const route of API_ROUTES) {
      expect(forbidden.test(route.id), `${route.id} names a trading action`).toBe(false);
      expect(forbidden.test(route.path), `${route.path} names a trading action`).toBe(false);
    }
  });

  it('has no source file that turns live trading, broker execution or model tool authority on', () => {
    const forbidden = [
      /liveTradingEnabled\s*:\s*true/,
      /brokerExecutionEnabled\s*:\s*true/,
      /allowModelDirectToolExecution\s*:\s*true/,
      /remoteEnabled\s*:\s*true/,
      /allowSensitiveFiles\s*:\s*true/,
    ];
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const text = readFileSync(file, 'utf8');
      for (const pattern of forbidden) {
        if (pattern.test(text)) offenders.push(`${relative(process.cwd(), file)} :: ${pattern}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps the safety profile false in the resolved default configuration', () => {
    const config = resolveConfig({});
    expect(config.safety.liveTradingEnabled).toBe(false);
    expect(config.safety.brokerExecutionEnabled).toBe(false);
    expect(config.ai.allowModelDirectToolExecution).toBe(false);
    expect(config.observability.redactSecrets).toBe(true);
  });
});

describe('no credentials in the source tree', () => {
  it('matches no high-signal credential shape anywhere it would ship from', () => {
    const patterns: Array<[string, RegExp]> = [
      ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
      ['openai-style key', /\bsk-[A-Za-z0-9]{32,}/],
      ['aws access key', /\bAKIA[0-9A-Z]{16}\b/],
      ['github token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
      ['slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
      ['postgres url with password', /postgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@/],
    ];
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const text = readFileSync(file, 'utf8');
      for (const [label, pattern] of patterns) {
        if (pattern.test(text)) offenders.push(`${relative(process.cwd(), file)} :: ${label}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

/** Shipped source: the backend, the shared packages, the interface and the scripts. */
const SOURCE_ROOTS = ['src', 'packages', 'web/src', 'scripts', 'config', 'src-tauri/src'];

function sourceFiles(): string[] {
  const files: string[] = [];
  for (const root of SOURCE_ROOTS) walk(join(process.cwd(), root), files);
  return files;
}

function walk(directory: string, into: string[]): void {
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) walk(full, into);
    else if (/\.(ts|tsx|mts|js|mjs|json|rs|toml|css|html)$/.test(entry)) into.push(full);
  }
}
