/**
 * Where this interface is running — decided in exactly one place.
 *
 * The same React application renders in two very different places: inside the Tauri
 * desktop shell, where an OS keychain, an offline cache and a local API exist, and in a
 * plain browser, where none of them do. Every feature that differs between the two has to
 * answer one question first, so that question is answered here and nowhere else.
 *
 * Why it is its own module rather than a check inside each component
 * ----------------------------------------------------------------
 * Detection is trivial, which is exactly why it spreads. A `window.__TAURI__` test copied
 * into a store, a hook and a component is three places to get it wrong, and it had already
 * gone wrong once: the shell contract (`./ipc.js`) treats the legacy `__TAURI__` global as
 * a genuine shell, while the frontend bridge tested only `__TAURI_INTERNALS__`. A WebView
 * exposing only the legacy global was therefore "the shell" to one half of the codebase and
 * "a browser" to the other — which is the kind of disagreement that shows up as a feature
 * that silently does nothing on one machine.
 *
 * So there is one predicate (`isDesktopShell`, in the IPC contract) and this module is the
 * only thing that dresses it up. Detection is **not** scattered, and
 * `tests/desktop-foundation.test.ts` asserts the two agree on every shape of target.
 *
 * What detection is *not* used for
 * --------------------------------
 * Being inside the shell never selects a different code path through business logic. The
 * domain layer, the readiness gates, the capability pipeline and the portfolio engine are
 * identical in both runtimes; only *host* concerns — the keychain, the file dialog, the
 * offline cache, the local API — differ, and those go through `ShellBridge`, which reports
 * what is missing rather than pretending. A browser build must never be forced to import a
 * Tauri API to work, and it is not: `resolveInvoke` in `web/src/desktop/bridge.ts` resolves
 * the shell's `invoke` lazily and falls back to the honest browser bridge.
 */

import { isDesktopShell } from './ipc.js';

/** The two places this application runs. */
export type DesktopRuntime = 'web' | 'desktop-tauri';

/**
 * The globals a Tauri WebView injects.
 *
 * `__TAURI_INTERNALS__` is Tauri 2; `__TAURI__` is the legacy global that older or
 * `withGlobalTauri` builds expose. Both are accepted, because a WebView that offers either
 * one is genuinely the shell and refusing it would degrade a working app to "browser" mode.
 */
export interface RuntimeTarget {
  __TAURI_INTERNALS__?: unknown;
  __TAURI__?: unknown;
}

/** Which runtime a target object represents. Defaults to `web` for anything unrecognised. */
export function detectRuntime(target: RuntimeTarget | null | undefined): DesktopRuntime {
  if (!target) return 'web';
  return isDesktopShell(target) ? 'desktop-tauri' : 'web';
}

/** Convenience predicate for a boolean test, so callers do not string-compare. */
export function isDesktopRuntime(target: RuntimeTarget | null | undefined): boolean {
  return detectRuntime(target) === 'desktop-tauri';
}

/**
 * What the runtime means for capability reporting, in one sentence a UI may render.
 *
 * Kept next to detection rather than in a component because it is the honest half of the
 * answer: saying which runtime you are in is only useful if you also say what that runtime
 * can do.
 */
export const RUNTIME_DESCRIPTION: Readonly<Record<DesktopRuntime, string>> = {
  web: 'Running in a browser: there is no OS keychain, no offline cache and no local API.',
  'desktop-tauri': 'Running in the Master Trade desktop shell.',
};

/**
 * The runtime of the current page.
 *
 * Resolved from `window` when there is one. A server-side or test render has no `window` and
 * is therefore `web`, which is the safe answer: the shell-only paths are the ones that need
 * a real host, so defaulting to `web` fails closed rather than offering a keychain that does
 * not exist.
 */
export function currentRuntime(): DesktopRuntime {
  // `window` is deliberately not named: this package compiles with `lib: ES2022` and Node
  // types, so the DOM global does not exist in its type space — and it must not, because
  // the same module is bundled for the server side of the boundary. In a page `window` *is*
  // `globalThis`, so the Tauri globals are found either way, and a process with no
  // `document` is honestly `web` rather than a shell with a missing keychain.
  const scope = globalThis as unknown as RuntimeTarget & { document?: unknown };
  if (scope.document === undefined) return 'web';
  return detectRuntime(scope);
}
