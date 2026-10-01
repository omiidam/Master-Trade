/**
 * Dashboard state (Zustand).
 *
 * The domain state for the Dashboard surface: the caller's own learning metrics as
 * the server derived them, and the state of the read.
 *
 * **One session, two consumers** — the same rule the profile store states: this store
 * does not resolve a session of its own. It asks the realtime store to initialise if
 * nobody has yet, then reuses exactly the client that resolution produced. A second
 * resolution would be a second answer to "what credential am I using".
 *
 * **Nothing is invented.** When there is no session the store reports `unavailable`
 * with the reason the session resolver gave, and the page says so. A fixture here
 * would look like learning progress — the specific dishonesty the preview rules
 * forbid, and worse on this surface than on any other, because the dashboard is the
 * page a learner reads first.
 */

import { create } from 'zustand';
import type { DashboardReadData } from '@shared/frontend/viewModels';
import { ApiClient, ApiError } from '../api/client.js';
import { useRealtimeStore } from '../realtime/store.js';
import { msg } from '../i18n/index.js';

export type DashboardStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';

export interface DashboardErrorView {
  code: string;
  message: string;
  /** True when retrying the same request could plausibly succeed. */
  retryable: boolean;
}

export interface DashboardStoreState {
  status: DashboardStatus;
  dashboard: DashboardReadData | null;
  /** Why the dashboard is unavailable, when it is. Rendered verbatim. */
  unavailableReason: string | null;
  error: DashboardErrorView | null;

  load: () => Promise<void>;
  reset: () => void;
}

/**
 * Build a client from the session the realtime store resolved, or report why not.
 *
 * Exported for tests. It is the same resolution every authenticated store reuses —
 * `clientForProfile` is the canonical builder and this is a re-export of its logic
 * through the profile module's own export, so there is still exactly one answer.
 */
export async function clientForDashboard(): Promise<ApiClient | { reason: string }> {
  const realtime = useRealtimeStore.getState();
  if (realtime.resolution === null) {
    await realtime.initialize();
  }
  const resolution = useRealtimeStore.getState().resolution;

  if (resolution === null) {
    return { reason: msg('profile.theSessionHasNotBeenResolvedYet') };
  }
  if (resolution.status === 'unavailable') {
    return { reason: `${resolution.detail} ${resolution.action}` };
  }
  return new ApiClient({
    baseUrl: resolution.apiBaseUrl,
    token: resolution.token,
    ...(resolution.shellToken ? { shellToken: resolution.shellToken } : {}),
  });
}

/** Turn a failure into something the page can render without leaking a stack. */
export function describeDashboardError(error: unknown): DashboardErrorView {
  if (error instanceof ApiError) {
    return {
      code: error.code,
      message: error.describe(),
      retryable: error.retryable || error.code === 'UNAUTHENTICATED',
    };
  }
  return {
    code: 'INTERNAL',
    message: error instanceof Error ? error.message : 'The request failed without a reason.',
    retryable: false,
  };
}

export const useDashboardStore = create<DashboardStoreState>((set) => ({
  status: 'idle',
  dashboard: null,
  unavailableReason: null,
  error: null,

  load: async () => {
    set({ status: 'loading', error: null, unavailableReason: null });
    const client = await clientForDashboard();
    if ('reason' in client) {
      set({ status: 'unavailable', unavailableReason: client.reason, dashboard: null });
      return;
    }
    try {
      const dashboard = await client.getDashboard();
      set({ status: 'ready', dashboard, error: null, unavailableReason: null });
    } catch (error) {
      const view = describeDashboardError(error);
      // A refused credential is not an error to retry silently: it is the honest
      // reason there is no dashboard, and it is reported as such.
      if (view.code === 'UNAUTHENTICATED' || view.code === 'FORBIDDEN') {
        set({ status: 'unavailable', unavailableReason: view.message, dashboard: null });
        return;
      }
      set({ status: 'error', error: view });
    }
  },

  reset: () =>
    set({
      status: 'idle',
      dashboard: null,
      unavailableReason: null,
      error: null,
    }),
}));
