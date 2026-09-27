import { useMemo, useSyncExternalStore } from 'react';
import type { ShellStatus } from '@shared/desktop/ipc';
import {
  initialSupervisorStatus,
  runtimeStateOf,
  type DesktopRuntimeState,
  type ProcessState,
} from '@shared/desktop/process';
import { currentRuntime, type DesktopRuntime } from '@shared/desktop/runtime';
import {
  desktopStartupState,
  type DesktopStartupState,
  type DesktopStartupView,
} from '@shared/desktop/startup';
import {
  SHELL_POLL_PENDING_MS,
  SHELL_POLL_SETTLED_MS,
  shellStatusReport,
  subscribeToShellStatus,
  type ShellReport,
} from './shellReport.js';

/**
 * The shell's status, as one screen needs to read it — Phase 8.1.3.
 *
 * The *fetching* is not here any more. It used to be: every mount opened its own poll, so the topbar
 * and Settings could each hold a different snapshot of the same process and describe it two ways for
 * up to a poll interval. `shellReport.ts` owns the report and the single poll now, and this file is
 * the reading half — a subscription plus a pure derivation, which is the shape `shellLayout.ts` /
 * `useShellLayout.ts` already uses for the widths.
 *
 * The split is also what keeps `stopping` honest. The report is shared and has no opinion about a
 * shutdown; `desktopStartupState` takes `stopping` as an argument, so the screens that share the report
 * still derive their own view from the *same* facts. Two consumers cannot disagree about which API
 * state the shell reported; they can only differ about whether a quit has been asked for, and each of
 * them knows that.
 */

/** Re-exported so the cadences are stated where a reader of the hook will find them. */
export { SHELL_POLL_PENDING_MS, SHELL_POLL_SETTLED_MS };

export interface ShellStatusState {
  /** True while the first status call is in flight. */
  loading: boolean;
  /** True when the page is rendered by the Tauri shell. */
  inShell: boolean;
  status: ShellStatus | null;
  /** The bridge refused to answer; the string is safe to show. */
  error: string | null;
  /** Where this page is running, decided by `@shared/desktop/runtime`. */
  runtime: DesktopRuntime;
  /**
   * The API process state, as the shell last reported it.
   *
   * The raw state, for a screen that wants to name it. Most screens should use `runtimeState`
   * or `startup` instead: `runtimeStateOf` collapses it to the words a person reads, and
   * `startup` additionally accounts for the host capabilities the app cannot ship without.
   */
  processState: ProcessState;
  /** `starting | ready | unavailable | recovering | error` — what a status chip shows. */
  runtimeState: DesktopRuntimeState;
  /**
   * The startup state a screen branches on.
   *
   * Derived, never stored: `desktopStartupState` is a pure function of the runtime, the
   * shell's report and whether a quit has been requested, so the UI cannot drift out of
   * agreement with the shell's own account of itself.
   */
  startup: DesktopStartupView;
}

/**
 * Report where this page is running, what the host can do, and how far the app has got.
 *
 * The shell answers asynchronously and may not answer at all (a browser, or a shell whose
 * status command failed), so this distinguishes three states rather than defaulting to
 * "fine": loading, inside a shell, and everything else — which the UI must render as "no
 * keychain, no cache, no local API".
 *
 * One rule is worth stating because it is easy to get wrong: a *failed* status call is
 * `ERROR`, not `STARTING`. Leaving a spinner up because the answer never arrived is the
 * silent failure Phase 6.1 §12 forbids, so the error branch overrides the derived state
 * instead of falling back to the shell's silence.
 */
export function useShellStatus(options: { stopping?: boolean } = {}): ShellStatusState {
  const stopping = options.stopping ?? false;
  const report = useSyncExternalStore(subscribeToShellStatus, shellStatusReport);
  return useMemo(() => shellStatusState(report, stopping), [report, stopping]);
}

/**
 * The report, as one screen renders it. Pure, so a test can drive every state directly.
 *
 * The `stopping` argument is the only thing two readers of the same report may differ about, and it
 * only reaches the view of the *startup* — a quit being asked for changes what the app should say
 * about itself, not what the shell said.
 */
export function shellStatusState(report: ShellReport, stopping: boolean): ShellStatusState {
  if (report.error !== null) {
    return {
      ...initialStatusState(stopping, report.inShell),
      loading: false,
      error: report.error,
      // Not `STARTING`: the answer will not arrive, and saying otherwise keeps a
      // progress indicator up for a shell that has already given up.
      startup: {
        state: 'ERROR' satisfies DesktopStartupState,
        reason: report.error,
        apiBaseUrl: null,
        missingCapabilities: [],
      },
    };
  }

  if (report.status === null) return initialStatusState(stopping, report.inShell);

  const status = report.status;
  const processReport = status.runtime ?? initialSupervisorStatus();
  return {
    loading: false,
    inShell: report.inShell,
    status,
    error: null,
    runtime: report.runtime,
    processState: processReport.state,
    runtimeState: runtimeStateOf(processReport.state),
    startup: desktopStartupState({ runtime: report.runtime, status, stopping }),
  };
}

/**
 * The state before the shell has said anything.
 *
 * `inShell` is passed in rather than probed here: where this page is running is one fact about one
 * page, and the shared report already carries it. A second probe would be a second answer.
 */
function initialStatusState(stopping: boolean, inShell: boolean): ShellStatusState {
  const runtime = currentRuntime();
  const processState: ProcessState = 'idle';
  return {
    loading: true,
    inShell,
    status: null,
    error: null,
    runtime,
    processState,
    runtimeState: runtimeStateOf(processState),
    startup: desktopStartupState({ runtime, status: null, stopping }),
  };
}
