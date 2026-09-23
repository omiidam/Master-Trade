import { useEffect, useState } from 'react';
import { inDesktopShell, shellStatus } from './bridge';
import type { ShellStatus } from '@shared/desktop/ipc';
import { currentRuntime, type DesktopRuntime } from '@shared/desktop/runtime';
import {
  desktopStartupState,
  type DesktopStartupState,
  type DesktopStartupView,
} from '@shared/desktop/startup';

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
   * The startup state a screen branches on.
   *
   * Derived, never stored: `desktopStartupState` is a pure function of the runtime, the
   * shell's report and whether a quit has been requested, so the UI cannot drift out of
   * agreement with the shell's own account of itself. Phase 6.2's process supervisor has a
   * place to report into without any of this changing shape.
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

  const [state, setState] = useState<ShellStatusState>(() => {
    const runtime = currentRuntime();
    return {
      loading: true,
      inShell: inDesktopShell(),
      status: null,
      error: null,
      runtime,
      startup: desktopStartupState({ runtime, status: null, stopping }),
    };
  });

  useEffect(() => {
    let cancelled = false;
    void shellStatus()
      .then((status) => {
        if (cancelled) return;
        const runtime = currentRuntime();
        setState({
          loading: false,
          inShell: inDesktopShell(),
          status,
          error: null,
          runtime,
          startup: desktopStartupState({ runtime, status, stopping }),
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const runtime = currentRuntime();
        const message = error instanceof Error ? error.message : 'the shell did not answer';
        setState({
          loading: false,
          inShell: inDesktopShell(),
          status: null,
          error: message,
          runtime,
          // Not `STARTING`: the answer will not arrive, and saying otherwise keeps a
          // progress indicator up for a shell that has already given up.
          startup: {
            state: 'ERROR' satisfies DesktopStartupState,
            reason: message,
            apiBaseUrl: null,
            missingCapabilities: [],
          },
        });
      });
    return () => {
      cancelled = true;
    };
  }, [stopping]);

  return state;
}
