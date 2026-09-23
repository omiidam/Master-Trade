/**
 * Frontend side of the desktop shell bridge.
 *
 * The same pages run in two places: inside the Tauri shell (where the OS keychain,
 * the offline cache and the local API exist) and in a plain browser (the dev
 * preview, where none of them do). This module is where that difference is decided
 * **once**, and it is decided honestly: outside the shell the bridge reports the
 * missing capabilities instead of pretending a credential was stored.
 *
 * Two details worth noting:
 *
 *   - the command names and argument validation come from `src/desktop/ipc.ts`,
 *     the same module the verifier checks against the Rust command list, so the
 *     frontend cannot call a command the shell does not implement;
 *   - `invoke` is resolved lazily. The Tauri API package is an optional peer of
 *     the shell, so the import is attempted at call time and falls back to the
 *     injected internals — either way a browser build keeps working.
 *
 * Detection is not done here. `@shared/desktop/runtime` owns the single predicate, and this
 * module asks it: this file used to test `__TAURI_INTERNALS__` by hand while the IPC contract
 * accepted the legacy `__TAURI__` global as well, so a WebView exposing only the legacy one
 * was the shell to one module and a browser to the other.
 */

import {
  browserShellBridge,
  createShellBridge,
  type InvokeFn,
  type ShellBridge,
  type ShellStatus,
} from '@shared/desktop/ipc';
import { isDesktopRuntime, type RuntimeTarget } from '@shared/desktop/runtime';

interface TauriInternals {
  invoke?: InvokeFn;
}

/**
 * The ambient global scope, typed.
 *
 * `window` is deliberately not named anywhere in this file. This module is compiled by two
 * programs: the frontend's tsconfig, which has the DOM lib, and the root one, which does not —
 * `tests/desktop-foundation.test.ts` imports this file, and a module the backend program
 * cannot typecheck would make the boundary one-way. In a page `window` *is* `globalThis`, so
 * the Tauri globals are found either way. `document` is the marker for "this is a page",
 * which is also what `@shared/desktop/runtime` uses.
 */
type AmbientScope = RuntimeTarget & {
  /** Present in a page, absent in Node — this package compiles for both. */
  document?: unknown;
  __TAURI_INTERNALS__?: TauriInternals;
  __TAURI__?: TauriInternals;
};

function ambientScope(): AmbientScope {
  return globalThis as unknown as AmbientScope;
}

function resolveInvoke(): InvokeFn | null {
  const scope = ambientScope();
  if (scope.document === undefined) return null;
  const internals = scope.__TAURI_INTERNALS__;
  if (typeof internals?.invoke === 'function') return internals.invoke.bind(internals);
  const legacy = scope.__TAURI__;
  if (typeof legacy?.invoke === 'function') return legacy.invoke.bind(legacy);
  return null;
}

/** True when the page is rendered by the desktop shell rather than a browser. */
export function inDesktopShell(): boolean {
  const scope = ambientScope();
  if (scope.document === undefined) return false;
  return isDesktopRuntime(scope);
}

let bridge: ShellBridge | null = null;

/** The bridge for wherever this page is running. */
export function shellBridge(): ShellBridge {
  if (bridge) return bridge;
  const invoke = resolveInvoke();
  bridge = invoke ? createShellBridge(invoke) : browserShellBridge();
  return bridge;
}

/**
 * What the shell can currently do. In a browser this resolves to a status that
 * names every missing capability, which is what the Settings screen renders — the
 * preview never claims to have a keychain.
 */
export async function shellStatus(): Promise<ShellStatus> {
  return shellBridge().status();
}

/**
 * The API base URL and per-launch token, when there is one. Returns null in a
 * browser rather than throwing, so callers can render "not connected" instead of
 * handling an exception on every load.
 */
export async function apiHandshake(): Promise<{ apiBaseUrl: string; token: string } | null> {
  if (!inDesktopShell()) return null;
  try {
    const handshake = await shellBridge().handshake();
    return { apiBaseUrl: handshake.apiBaseUrl, token: handshake.token };
  } catch {
    // The sidecar may still be starting; the caller retries or reports offline.
    return null;
  }
}

/** Credential state for the settings screen: configured or not, never the value. */
export async function credentialConfigured(key: string): Promise<boolean> {
  if (!inDesktopShell()) return false;
  try {
    return (await shellBridge().secureStore.get(key)) !== null;
  } catch {
    return false;
  }
}
