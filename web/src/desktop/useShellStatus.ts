import { useEffect, useRef, useState } from 'react';
import { inDesktopShell, shellStatus } from './bridge';
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
  isStartupSettled,
  type DesktopStartupState,
  type DesktopStartupView,
} from '@shared/desktop/startup';

/**
 * How often the shell is asked how the local API is doing.
 *
 * Two cadences, because the answer stops being interesting once it stops changing — but never
 * becomes *uninteresting*, which is the point. A supervisor can crash the API an hour after a
 * clean start, so a single request at mount would leave the interface claiming "connected" for
 * the rest of the session. Polling at 1s while something is happening and 5s once it has settled
 * keeps a crash visible without asking a local process 86,400 questions a day.
 */
export const SHELL_POLL_PENDING_MS = 1_000;
export const SHELL_POLL_SETTLED_MS = 5_000;

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
 * status command failed), so this hook distinguishes three states rather than defaulting to
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

  const [state, setState] = useState<ShellStatusState>(() => initialStatusState(stopping));
  // Read inside the polling loop, so a reschedule decision does not restart the effect and
  // reset the cadence on every report.
  const stoppingRef = useRef(stopping);
  stoppingRef.current = stopping;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async (): Promise<void> => {
      try {
        const status = await shellStatus();
        if (cancelled) return;
        const runtime = currentRuntime();
        const next = statusState(status, runtime, stoppingRef.current);
        setState(next);
        schedule(next.startup.state);
      } catch (error: unknown) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'the shell did not answer';
        setState({
          ...initialStatusState(stoppingRef.current),
          loading: false,
          error: message,
          // Not `STARTING`: the answer will not arrive, and saying otherwise keeps a
          // progress indicator up for a shell that has already given up.
          startup: {
            state: 'ERROR' satisfies DesktopStartupState,
            reason: message,
            apiBaseUrl: null,
            missingCapabilities: [],
          },
        });
        // A refused status command is not retried: it is a contract mismatch, and asking
        // twice a second would turn a clear failure into a busy loop.
      }
    };

    const schedule = (startupState: DesktopStartupState): void => {
      if (cancelled) return;
      const delay = isStartupSettled(startupState) ? SHELL_POLL_SETTLED_MS : SHELL_POLL_PENDING_MS;
      timer = setTimeout(() => void poll(), delay);
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // `stopping` is read through a ref, so the first effect run still sees the initial value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A late `stopping` flag is reflected immediately rather than at the next poll.
  useEffect(() => {
    setState((previous) => {
      if (!previous.status) {
        return {
          ...previous,
          startup: desktopStartupState({ runtime: previous.runtime, status: null, stopping }),
        };
      }
      const next = statusState(previous.status, previous.runtime, stopping);
      return { ...next, loading: previous.loading, error: previous.error };
    });
  }, [stopping]);

  return state;
}

/** The state before the shell has said anything. */
function initialStatusState(stopping: boolean): ShellStatusState {
  const runtime = currentRuntime();
  const processState: ProcessState = 'idle';
  return {
    loading: true,
    inShell: inDesktopShell(),
    status: null,
    error: null,
    runtime,
    processState,
    runtimeState: runtimeStateOf(processState),
    startup: desktopStartupState({ runtime, status: null, stopping }),
  };
}

/** Build the state from a shell report. Pure, so a test can drive it directly. */
function statusState(
  status: ShellStatus,
  runtime: DesktopRuntime,
  stopping: boolean,
): ShellStatusState {
  const report = status.runtime ?? initialSupervisorStatus();
  return {
    loading: false,
    inShell: inDesktopShell(),
    status,
    error: null,
    runtime,
    processState: report.state,
    runtimeState: runtimeStateOf(report.state),
    startup: desktopStartupState({ runtime, status, stopping }),
  };
}
