import { useEffect, useState } from 'react';
import { inDesktopShell, shellStatus } from './bridge';
import type { ShellStatus } from '@shared/desktop/ipc';

export interface ShellStatusState {
  /** True while the first status call is in flight. */
  loading: boolean;
  /** True when the page is rendered by the Tauri shell. */
  inShell: boolean;
  status: ShellStatus | null;
  /** The bridge refused to answer; the string is safe to show. */
  error: string | null;
}

/**
 * Report where this page is running and what the host can do.
 *
 * The shell answers asynchronously and may not answer at all (a browser, or a
 * shell whose status command failed), so this hook distinguishes three states
 * rather than defaulting to "fine": loading, inside a shell, and everything else —
 * which the UI must render as "no keychain, no cache, no local API".
 */
export function useShellStatus(): ShellStatusState {
  const [state, setState] = useState<ShellStatusState>(() => ({
    loading: true,
    inShell: inDesktopShell(),
    status: null,
    error: null,
  }));

  useEffect(() => {
    let cancelled = false;
    void shellStatus()
      .then((status) => {
        if (cancelled) return;
        setState({ loading: false, inShell: inDesktopShell(), status, error: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          loading: false,
          inShell: inDesktopShell(),
          status: null,
          error: error instanceof Error ? error.message : 'the shell did not answer',
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
