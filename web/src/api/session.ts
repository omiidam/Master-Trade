/**
 * The API session a surface reads through.
 *
 * Why this exists next to `realtime/session.ts`: the two answer different questions. The
 * realtime resolver answers "what credential opens the event *stream*", and its answer is
 * necessarily about the desktop shell — the stream is served by a sidecar that only the
 * shell can reach, and its credential lives in the OS keychain. That is the right answer for
 * the stream, and the wrong one for a page that only needs to *read*: routing the dashboard
 * through it meant a browser preview could not read a single figure, and reported the
 * stream's reason ("no sidecar, no keychain") for a surface that has nothing to do with
 * either.
 *
 * So this resolver answers "what credential reads the API", in the order a client can
 * actually satisfy:
 *
 *   1. **An explicit environment override** (`VITE_MT_API_URL` + `VITE_MT_SESSION_TOKEN`) —
 *      the documented development escape hatch, and the same pair the stream honours, so a
 *      scripted run or CI pins one session for everything.
 *   2. **The desktop shell**, when the page is running inside it: the shell's own handshake
 *      and the credential from its secure store, which is how the desktop app reads.
 *   3. **A local sign-in** (`POST /v1/session/local`), for a browser preview with no shell:
 *      the API issues an ordinary session when the deployment allows it, and the page uses
 *      that token exactly as it would use any other.
 *
 * Every branch ends in the same `ApiConnection`; nothing downstream can tell which one it
 * came from, and none of them is the live stream.
 */

import { ApiClient, ApiError, type ApiConnection } from './client.js';
import { SESSION_TOKEN_KEY, resolveRealtimeSession } from '../realtime/session.js';
import { apiHandshake, inDesktopShell, shellBridge } from '../desktop/bridge.js';
import { msg } from '../i18n/index.js';

/** Where the local API listens unless the environment says otherwise. Loopback only. */
export const DEFAULT_API_BASE_URL = 'http://127.0.0.1:4317';

/** How the session was obtained. Reported so a surface can say which door it came through. */
export type ApiSessionSource = 'environment' | 'shell' | 'local-sign-in';

export interface ApiSession {
  baseUrl: string;
  token: string;
  shellToken: string | null;
  source: ApiSessionSource;
}

export type ApiSessionResolution =
  { status: 'ready'; session: ApiSession } | { status: 'unavailable'; reason: string };

/**
 * The frontend environment, as Vite defines it at build time.
 *
 * Declared here rather than relied on through `import.meta.env` directly: the repository-root
 * tsconfig has no `vite/client` types, and this module is imported by the node suite
 * (`tests/frontend-api-session.test.ts` drives it with a stubbed `fetch`), so an undeclared
 * `import.meta.env` compiles in the app and then fails `npm run typecheck`. One typed
 * accessor keeps both honest.
 */
interface FrontendEnvironment {
  VITE_MT_API_URL?: string;
  VITE_MT_SESSION_TOKEN?: string;
}

function frontendEnvironment(): FrontendEnvironment {
  return (import.meta as { env?: FrontendEnvironment }).env ?? {};
}

/** The configured API base URL: the environment's, or the documented loopback default. */
export function apiBaseUrl(): string {
  const configured = frontendEnvironment().VITE_MT_API_URL;
  return configured !== undefined && configured !== '' ? configured : DEFAULT_API_BASE_URL;
}

function environmentToken(): string | null {
  const token = frontendEnvironment().VITE_MT_SESSION_TOKEN;
  return token !== undefined && token !== '' ? token : null;
}

/**
 * The session already resolved in this page, if any.
 *
 * One sign-in per page rather than one per read: the token is the same credential for the
 * whole tab, and asking the API to mint a second one on every refresh would grow the
 * session table for no gain. A reload re-resolves, which is also how a revoked or expired
 * session is noticed.
 */
let cached: ApiSession | null = null;

/** Forget the cached session. Used by tests, and by a caller that just saw a 401. */
export function resetApiSession(): void {
  cached = null;
}

/**
 * Resolve a session for reading the API.
 *
 * Never throws: every failure becomes an `unavailable` state with the reason to render, in
 * the same shape the surfaces already use.
 */
export async function resolveApiSession(): Promise<ApiSessionResolution> {
  if (cached !== null) return { status: 'ready', session: cached };

  const baseUrl = apiBaseUrl();
  const override = environmentToken();
  if (override !== null) {
    cached = { baseUrl, token: override, shellToken: null, source: 'environment' };
    return { status: 'ready', session: cached };
  }

  // Inside the shell the stream's own resolution is the credential to read with too — the
  // shell is what hands out sessions there, and it is not a fallback for the browser.
  if (inDesktopShell()) {
    const resolution = await resolveRealtimeSession({
      inShell: true,
      handshake: apiHandshake,
      readSecret: async (key) => {
        try {
          return (await shellBridge().secureStore.get(key)) ?? null;
        } catch {
          return null;
        }
      },
      devOverride: {
        apiBaseUrl: frontendEnvironment().VITE_MT_API_URL,
        token: environmentToken() ?? undefined,
      },
    });
    if (resolution.status === 'ready') {
      cached = {
        baseUrl: resolution.apiBaseUrl,
        token: resolution.token,
        shellToken: resolution.shellToken,
        source: 'shell',
      };
      return { status: 'ready', session: cached };
    }
  }

  // No shell, no pinned token: sign in locally. This is the browser preview's door, and it
  // is the API that decides whether the door exists.
  const signingIn = new ApiClient({ baseUrl, token: null });
  try {
    const local = await signingIn.startLocalSession();
    cached = { baseUrl, token: local.token, shellToken: null, source: 'local-sign-in' };
    return { status: 'ready', session: cached };
  } catch (error) {
    return { status: 'unavailable', reason: describeSessionFailure(error, baseUrl) };
  }
}

/** Turn a failed sign-in into one line: what happened, and what would fix it. */
function describeSessionFailure(error: unknown, baseUrl: string): string {
  if (error instanceof ApiError && error.code === 'PROVIDER_UNAVAILABLE') {
    return `${msg('session.theLocalApiIsNotAnswering')} (${baseUrl}) ${msg('session.startItWithNpmRunApi')}`;
  }
  if (error instanceof ApiError) {
    // The deployment refused, and it named the reason — "not enabled here" is a decision,
    // not a fault, so the server's own words are the ones to render.
    return error.message;
  }
  return error instanceof Error ? error.message : msg('session.theLocalApiIsNotAnswering');
}

/**
 * Build the client a read surface uses, or report why there is none.
 *
 * The client is handed the way to replace a credential the server refuses, because it is the
 * only thing that can: a session goes stale for reasons the reader cannot see — the API was
 * restarted while the page stayed open, the token reached its TTL, the session was revoked —
 * and the cached one is then refused on every read. Without this the page went to
 * `unavailable` and *stayed* there through every retry, because nothing ever dropped the dead
 * token: `resetApiSession` existed for exactly this caller and had none.
 */
export async function clientForApiSession(): Promise<ApiClient | { reason: string }> {
  const resolution = await resolveApiSession();
  if (resolution.status === 'unavailable') return { reason: resolution.reason };
  const session = resolution.session;
  return new ApiClient(
    {
      baseUrl: session.baseUrl,
      token: session.token,
      shellToken: session.shellToken,
    },
    { reauthorize: () => renewRefusedSession(session) },
  );
}

/**
 * Obtain a credential to retry a refused read with.
 *
 * The cached session is dropped first, unconditionally: it is the one the server just
 * refused, and re-resolving against it would only hand back the same token. What comes back
 * depends on which door this page came through — a fresh local sign-in in a browser preview,
 * the shell's current secret inside the shell, or the pinned environment token.
 *
 * `null` means there is nothing new to try, and the caller reports the refusal instead of
 * repeating it: the pinned token *is* the operator's declared credential, so a deployment
 * that refuses it has answered, and a shell that returns the same secret it just had is not
 * a second chance. A retry is only worth making with a different credential.
 */
async function renewRefusedSession(refused: ApiSession): Promise<ApiConnection | null> {
  resetApiSession();
  const resolution = await resolveApiSession();
  if (resolution.status === 'unavailable') return null;
  const renewed = resolution.session;
  if (renewed.token === refused.token) return null;
  return { baseUrl: renewed.baseUrl, token: renewed.token, shellToken: renewed.shellToken };
}

export { SESSION_TOKEN_KEY };
