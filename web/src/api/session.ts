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

import { ApiClient, ApiError } from './client.js';
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

/** The configured API base URL: the environment's, or the documented loopback default. */
export function apiBaseUrl(): string {
  const configured = import.meta.env.VITE_MT_API_URL as string | undefined;
  return configured !== undefined && configured !== '' ? configured : DEFAULT_API_BASE_URL;
}

function environmentToken(): string | null {
  const token = import.meta.env.VITE_MT_SESSION_TOKEN as string | undefined;
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
        apiBaseUrl: import.meta.env.VITE_MT_API_URL,
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

/** Build the client a read surface uses, or report why there is none. */
export async function clientForApiSession(): Promise<ApiClient | { reason: string }> {
  const resolution = await resolveApiSession();
  if (resolution.status === 'unavailable') return { reason: resolution.reason };
  return new ApiClient({
    baseUrl: resolution.session.baseUrl,
    token: resolution.session.token,
    shellToken: resolution.session.shellToken,
  });
}

export { SESSION_TOKEN_KEY };
