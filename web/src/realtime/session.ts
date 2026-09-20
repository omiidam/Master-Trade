/**
 * Where the realtime stream's endpoint and credentials come from.
 *
 * The honest answer in this phase is "the desktop shell, or nowhere":
 *
 *   - **Inside the shell**, the local sidecar exists, and the shell is the only
 *     thing that can read a credential. The API base URL comes from
 *     `shell_handshake`, and the session token comes from the shell's secure store
 *     — the page never invents, caches or derives one.
 *   - **In a browser** there is no sidecar and no keychain, so there is nothing to
 *     connect to. That is reported as a reason with an action, not as a spinner
 *     that never resolves, and it is never simulated with a fake connection.
 *   - **A development override** (`VITE_MT_API_URL` + `VITE_MT_SESSION_TOKEN`,
 *     honoured only in a dev build) lets a developer point the UI at an API they
 *     started themselves. It is compiled into the bundle, so it is for local work
 *     only and is labelled as such in the UI.
 *
 * Everything here is dependency-injected, which is why `tests/realtime-session.test.ts`
 * can prove the "no credentials" path reports unavailability rather than connecting
 * anonymously.
 */

import { websocketUrlFor } from './client.js';

export type SessionSource = 'shell' | 'dev-override';

export interface RealtimeSession {
  status: 'ready';
  source: SessionSource;
  /** `http://127.0.0.1:4317` */
  apiBaseUrl: string;
  /** `ws://127.0.0.1:4317/ws` */
  websocketUrl: string;
  token: string;
  /** The per-launch shell token, when the sidecar is gated by one. */
  shellToken: string | null;
}

export interface RealtimeUnavailable {
  status: 'unavailable';
  /** Stable reason code, so the UI can pick the right explanation. */
  reason: 'not-in-shell' | 'no-session' | 'no-endpoint' | 'shell-error';
  detail: string;
  /** What the user can do about it, in one line. */
  action: string;
}

export type SessionResolution = RealtimeSession | RealtimeUnavailable;

/** The environment this resolution needs, supplied by the caller. */
export interface SessionEnv {
  /** True when the page runs inside the desktop shell. */
  inShell: boolean;
  /** The shell handshake: the sidecar's base URL and per-launch token. */
  handshake(): Promise<{ apiBaseUrl: string; token: string } | null>;
  /** Read a credential from the shell's secure store; never a plaintext value here. */
  readSecret(key: string): Promise<string | null>;
  /** Local development only: an explicitly configured API and token. */
  devOverride?: { apiBaseUrl?: string | undefined; token?: string | undefined } | undefined;
}

/** The key the auth slice stores the local session under. Read-only for the page. */
export const SESSION_TOKEN_KEY = 'session-token';

function fromDevOverride(env: SessionEnv): SessionResolution | null {
  const override = env.devOverride;
  if (!override?.apiBaseUrl) return null;
  if (!override.token) {
    // A base URL with no token is a half-configured override. Say so instead of
    // opening an unauthenticated socket that the server will close anyway.
    return {
      status: 'unavailable',
      reason: 'no-session',
      detail: 'VITE_MT_API_URL is set but VITE_MT_SESSION_TOKEN is not.',
      action: 'Set both, or unset the URL.',
    };
  }
  return {
    status: 'ready',
    source: 'dev-override',
    apiBaseUrl: override.apiBaseUrl,
    websocketUrl: websocketUrlFor(override.apiBaseUrl, '/ws'),
    token: override.token,
    shellToken: null,
  };
}

export async function resolveRealtimeSession(env: SessionEnv): Promise<SessionResolution> {
  const override = fromDevOverride(env);
  if (override) return override;

  if (!env.inShell) {
    return {
      status: 'unavailable',
      reason: 'not-in-shell',
      detail:
        'This page is running in a browser, so there is no local sidecar to stream from and no keychain to hold a session.',
      action: 'Open the desktop shell to stream live events.',
    };
  }

  let handshake: { apiBaseUrl: string; token: string } | null = null;
  try {
    handshake = await env.handshake();
  } catch {
    handshake = null;
  }
  if (!handshake?.apiBaseUrl) {
    return {
      status: 'unavailable',
      reason: 'shell-error',
      detail:
        'The desktop shell did not answer with an API endpoint. The local service may still be starting.',
      action: 'Wait for the local service, then retry.',
    };
  }

  const token = await env.readSecret(SESSION_TOKEN_KEY);
  if (!token) {
    return {
      status: 'unavailable',
      reason: 'no-session',
      detail: `The shell is running, but no "${SESSION_TOKEN_KEY}" credential is stored, so an authenticated stream cannot be opened.`,
      action:
        'Sign in once the authentication slice ships; job status and the event stream both need a session.',
    };
  }

  return {
    status: 'ready',
    source: 'shell',
    apiBaseUrl: handshake.apiBaseUrl,
    websocketUrl: websocketUrlFor(handshake.apiBaseUrl, '/ws'),
    token,
    shellToken: handshake.token,
  };
}

/** One line for the UI: why there is no stream, and what to do. */
export function describeUnavailability(resolution: RealtimeUnavailable): string {
  return `${resolution.detail} ${resolution.action}`;
}
