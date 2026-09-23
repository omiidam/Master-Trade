/**
 * The startup state a desktop UI can render — the foundation, not the supervisor.
 *
 * Phase 6.1 must not build API process management; that is Phase 6.2. What it *must* do is
 * give the interface an honest, typed answer to "is this app ready, and if not, why?" — so
 * that the later supervisor has somewhere to report to instead of being retrofitted into
 * components.
 *
 * Why this reuses the shell's lifecycle rather than defining another one
 * ---------------------------------------------------------------------
 * `src/desktop/lifecycle.ts` already owns a nine-state machine
 * (`idle → instance-checked → sidecar-starting → sidecar-ready → window-shown → ready`,
 * plus `failed`, `shutting-down`, `stopped`) that sequences window visibility against API
 * liveness. That machine is about the *shell process*, and it is right for the shell.
 *
 * A UI cannot use it, for two reasons: it lives in `src/`, which the frontend may not
 * import, and its states describe the shell's internals rather than what a user needs to
 * know. So this module narrows the shell's own report — `ShellStatus`, which crosses the
 * boundary already — into the five states a screen can act on:
 *
 *   `STARTING` → `READY` → `STOPPING` → `STOPPED`, and `ERROR` from anywhere.
 *
 * There is exactly one source: the shell reports, this maps. Nothing here starts, stops or
 * supervises anything, and nothing here duplicates the shell's ordering.
 *
 * The rule that matters most
 * --------------------------
 * **It never reports `READY` when a required initialisation step failed.** The shell's
 * `sidecarState` can be `ready` while a capability the app cannot ship without is missing
 * (no keychain, no offline cache, no file dialog, no single-instance lock). Reporting
 * `READY` there would be the exact failure Phase 6.1 §12 forbids: an application claiming
 * readiness on top of a broken step. A missing *required* capability is `ERROR`, named.
 *
 * Optional capabilities stay optional. `auto-update` and `notifications` are absent on a
 * development build and that is not a failure, so they are reported and not escalated.
 */

import { REQUIRED_DESKTOP_CAPABILITIES, type DesktopCapability } from './host.js';
import type { ShellStatus } from './ipc.js';
import type { DesktopRuntime } from './runtime.js';

/**
 * The five states a desktop screen branches on.
 *
 * Deliberately separate from `src/desktop/lifecycle.ts`'s `DesktopState`: those are the
 * shell's sequencing steps, these are what the user is owed.
 */
export type DesktopStartupState = 'STARTING' | 'READY' | 'STOPPING' | 'STOPPED' | 'ERROR';

export interface DesktopStartupView {
  state: DesktopStartupState;
  /** A sentence safe to render verbatim. Null when there is nothing to explain. */
  reason: string | null;
  /** The loopback API base URL, once the shell reports one. */
  apiBaseUrl: string | null;
  /** Required capabilities the shell reported as unavailable. Always names the reason. */
  missingCapabilities: DesktopCapability[];
}

export interface StartupInput {
  /** Where the page is running; `web` can never reach `READY`. */
  runtime: DesktopRuntime;
  /**
   * The shell's own report, or null while the first call is still in flight.
   *
   * Null is `STARTING` and not `STOPPED`, because "we have not asked yet" and "there is
   * nothing there" are different facts and a UI that conflates them flashes an error on
   * every launch.
   */
  status: ShellStatus | null;
  /** Set once the user has asked the application to quit. */
  stopping?: boolean;
}

/**
 * Narrow the shell's report into a state a screen can act on.
 *
 * The order of the branches is the design, and each position is load-bearing:
 *
 *   1. a browser has no shell to start, so it is `STOPPED` — never `STARTING`, which would
 *      leave a spinner running forever on the preview build;
 *   2. an unanswered status is `STARTING`;
 *   3. a failure outranks a shutdown: a quit does not hide a broken start, because the user
 *      needs to know the app failed *before* the window closes;
 *   4. `ready` with a missing required capability is `ERROR`, not `READY`;
 *   5. only then does a requested quit become `STOPPING`.
 */
export function desktopStartupState(input: StartupInput): DesktopStartupView {
  const { runtime, status, stopping = false } = input;

  if (runtime === 'web') {
    return {
      state: 'STOPPED',
      reason: 'Not running in the desktop shell: there is no shell process to start.',
      apiBaseUrl: null,
      missingCapabilities: [],
    };
  }

  if (status === null) {
    return {
      state: 'STARTING',
      reason: 'Waiting for the desktop shell to report.',
      apiBaseUrl: null,
      missingCapabilities: [],
    };
  }

  const unavailable = status.unavailable ?? [];
  const missingCapabilities = REQUIRED_DESKTOP_CAPABILITIES.filter((capability) =>
    unavailable.some((entry) => entry.capability === capability),
  );

  if (status.sidecarState === 'failed') {
    // The shell's own reason if it gave one, so the user sees the cause rather than a code.
    const detail = unavailable[0]?.reason;
    return {
      state: 'ERROR',
      reason: detail
        ? `The local API failed to start: ${detail}`
        : 'The local API failed to start.',
      apiBaseUrl: null,
      missingCapabilities,
    };
  }

  if (status.sidecarState === 'ready' && missingCapabilities.length > 0) {
    return {
      state: 'ERROR',
      reason: `The shell cannot provide ${missingCapabilities.join(', ')}.`,
      apiBaseUrl: status.apiBaseUrl,
      missingCapabilities,
    };
  }

  if (stopping) {
    return {
      state: 'STOPPING',
      reason: 'Shutting down.',
      apiBaseUrl: status.apiBaseUrl,
      missingCapabilities,
    };
  }

  if (status.sidecarState === 'ready') {
    return {
      state: 'READY',
      reason: null,
      apiBaseUrl: status.apiBaseUrl,
      missingCapabilities,
    };
  }

  if (status.sidecarState === 'starting') {
    return {
      state: 'STARTING',
      reason: 'Starting the local API.',
      apiBaseUrl: null,
      missingCapabilities,
    };
  }

  return {
    state: 'STOPPED',
    reason: status.apiBaseUrl === null ? 'The local API is not running.' : null,
    apiBaseUrl: status.apiBaseUrl,
    missingCapabilities,
  };
}

/** True when no further transition is expected without user action. */
export function isStartupSettled(state: DesktopStartupState): boolean {
  return state === 'READY' || state === 'STOPPED' || state === 'ERROR';
}

/** True while the UI should show progress rather than content or an error. */
export function isStartupPending(state: DesktopStartupState): boolean {
  return state === 'STARTING' || state === 'STOPPING';
}
