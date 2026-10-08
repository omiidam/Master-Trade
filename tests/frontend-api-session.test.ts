/**
 * A refused credential is renewed, not just re-reported.
 *
 * The defect this pins is the one the browser preview showed *after* the API was restarted
 * underneath an open page. Sessions are minted in the server's memory, so a restart invalidates
 * every token it ever issued — and the page held its token in a module-level cache with nothing
 * to clear it. The next read answered `401 UNAUTHENTICATED`, the Dashboard rendered its
 * "no dashboard to show yet" state, and every retry after that did the same thing, because the
 * dead token was still the one being sent. Only a full window reload recovered, which is not a
 * thing a Refresh button may require.
 *
 * What is defended here:
 *
 *   1. **The read is replayed once.** A `401` makes the client ask the session layer for a new
 *      credential and retry the same request exactly one time.
 *   2. **The renewed credential is kept.** Later reads reuse it rather than signing in again.
 *   3. **Nothing loops.** When the only credential available is a pinned one the server refuses,
 *      the request is failed with the server's own typed error after a single attempt.
 *
 * It runs offline: `fetch` is stubbed, and the two credentials are the test's own fiction.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError } from '../web/src/api/client.js';
import { clientForApiSession, resetApiSession } from '../web/src/api/session.js';

/**
 * The base URL the stub answers for.
 *
 * It is the client's own loopback default rather than a `VITE_MT_API_URL` override: this suite
 * runs in node, where the frontend environment object does not exist, so an override is not a
 * thing this test could set — and pretending otherwise would make the suite pass for a reason
 * it never checked.
 */
const API = 'http://127.0.0.1:4317';

interface Recorded {
  url: string;
  method: string;
  authorization: string | null;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function sessionPayload(token: string): unknown {
  return {
    ok: true,
    data: {
      token,
      principal: { id: 'local-owner', roles: ['owner'] },
      issuedAt: '2026-10-04T00:00:00.000Z',
      expiresAt: '2026-10-04T08:00:00.000Z',
      note: 'The token is returned once.',
    },
    correlationId: 'mt_test',
  };
}

function dashboardPayload(): unknown {
  return {
    ok: true,
    data: { capability: 'read-only', metrics: {}, note: 'Derived on the server.' },
    correlationId: 'mt_test',
  };
}

function refusal(): unknown {
  return {
    ok: false,
    error: { code: 'UNAUTHENTICATED', message: 'That session is not one this deployment knows.' },
    correlationId: 'mt_test',
  };
}

/**
 * A stand-in for the local API's two relevant routes.
 *
 * It issues `tokens` in order on each sign-in, and accepts only the authorization header
 * named by `accept` — so a read made with a stale token is refused exactly as the real
 * server refuses one it never minted.
 */
function installApi(input: { tokens: readonly string[]; accept: string }): Recorded[] {
  const calls: Recorded[] = [];
  let issued = 0;
  // Typed off `fetch` itself rather than the DOM's `RequestInfo`, which this suite's lib set
  // (node, no DOM) does not declare.
  const stub: typeof fetch = async (request, init) => {
    const url = String(request);
    const method = init?.method ?? 'GET';
    const authorization = new Headers(init?.headers).get('authorization');
    calls.push({ url, method, authorization });

    if (url.endsWith('/v1/session/local')) {
      const token = input.tokens[Math.min(issued, input.tokens.length - 1)] ?? 'mt_s_none';
      issued += 1;
      return json(200, sessionPayload(token));
    }
    if (url.endsWith('/v1/dashboard')) {
      return authorization === `Bearer ${input.accept}`
        ? json(200, dashboardPayload())
        : json(401, refusal());
    }
    return json(404, {
      ok: false,
      error: { code: 'NOT_FOUND', message: 'No such route.' },
      correlationId: 'mt_test',
    });
  };
  vi.stubGlobal('fetch', stub);
  return calls;
}

const readsOf = (calls: Recorded[]): Recorded[] =>
  calls.filter((call) => call.url.endsWith('/v1/dashboard'));
const signInsOf = (calls: Recorded[]): Recorded[] =>
  calls.filter((call) => call.url.endsWith('/v1/session/local'));

beforeEach(() => {
  resetApiSession();
});

afterEach(() => {
  resetApiSession();
  vi.unstubAllGlobals();
});

describe('a refused API session', () => {
  it('is renewed once, and the read that was refused is replayed', async () => {
    const calls = installApi({ tokens: ['mt_s_stale', 'mt_s_fresh'], accept: 'mt_s_fresh' });

    const client = await clientForApiSession();
    if ('reason' in client) throw new Error(client.reason);
    const view = await client.getDashboard();

    expect(view.capability).toBe('read-only');
    // The first read went out with the token the page already had, was refused, and was
    // sent again with the one the renewal produced.
    const reads = readsOf(calls);
    expect(reads.map((read) => read.authorization)).toEqual([
      'Bearer mt_s_stale',
      'Bearer mt_s_fresh',
    ]);
    expect(signInsOf(calls)).toHaveLength(2);
  });

  it('leaves the renewed credential in place for every read after it', async () => {
    const calls = installApi({ tokens: ['mt_s_stale', 'mt_s_fresh'], accept: 'mt_s_fresh' });

    const client = await clientForApiSession();
    if ('reason' in client) throw new Error(client.reason);
    await client.getDashboard();
    await client.getDashboard();

    // One sign-in to start, one to replace the refused credential — never one per read.
    expect(signInsOf(calls)).toHaveLength(2);
    const reads = readsOf(calls);
    expect(reads).toHaveLength(3);
    expect(reads.at(-1)?.authorization).toBe('Bearer mt_s_fresh');
  });

  it('is not replayed when the renewal produces the same credential', async () => {
    // A deployment whose sign-in hands back the token it just refused is not a second chance,
    // and a pinned credential is the same shape: re-resolving returns the string the operator
    // declared. The client fails with the server's own typed error after a single attempt
    // rather than repeating a refusal it cannot change.
    const calls = installApi({ tokens: ['mt_s_same', 'mt_s_same'], accept: 'mt_s_never' });

    const client = await clientForApiSession();
    if ('reason' in client) throw new Error(client.reason);

    await expect(client.getDashboard()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(readsOf(calls)).toHaveLength(1);
    // It did ask once — that is what tells a stale session from a refused deployment — but
    // the identical answer is where the retrying stops.
    expect(signInsOf(calls)).toHaveLength(2);
  });
});

/**
 * A chat turn that never answers (Phase 2.13-B).
 *
 * The composer locks while a turn is in flight, so the request's ceiling is the only
 * thing that guarantees the lock ever releases. Two facts must stay apart: a deadline
 * that fired is `TIMEOUT` (the API was reached and was slow), and a socket that never
 * connected is `PROVIDER_UNAVAILABLE` (the API is not there) — merging them reports a
 * working-but-slow turn as a dead one, or a dead API as a slow one.
 */
describe('a chat turn with a deadline', () => {
  it('sends a cancellation signal and reports a fired deadline as TIMEOUT', async () => {
    let seenSignal: AbortSignal | null | undefined;
    const stub: typeof fetch = async (_request, init) => {
      seenSignal = init?.signal;
      throw new DOMException('The operation timed out.', 'TimeoutError');
    };
    vi.stubGlobal('fetch', stub);

    const client = new ApiClient({ baseUrl: API, token: 'mt_s_chat' });
    const failure = await client.agentChat({ message: 'What is liquidity in trading?' }).then(
      () => null,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).code).toBe('TIMEOUT');
    expect((failure as ApiError).status).toBe(504);
    expect((failure as ApiError).describe()).toMatch(/took too long/i);
    // The ceiling was declared on the request itself rather than left to the browser's
    // own multi-minute default — the signal exists because the client asked for one.
    expect(seenSignal).not.toBeNull();
    expect(seenSignal).toBeDefined();
  });

  it('still reports an unreachable API as PROVIDER_UNAVAILABLE, not a timeout', async () => {
    const stub: typeof fetch = async () => {
      throw new TypeError('fetch failed');
    };
    vi.stubGlobal('fetch', stub);

    const client = new ApiClient({ baseUrl: API, token: 'mt_s_chat' });
    await expect(client.agentChat({ message: 'Hello' })).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
  });
});
