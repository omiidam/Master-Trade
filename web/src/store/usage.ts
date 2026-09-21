/**
 * Usage, credits and subscription state (Zustand).
 *
 * Three questions, three fields, and they are deliberately not merged:
 *
 *   - **what am I on?** — `status.plan`, the stored subscription and the allowance;
 *   - **what is left?** — `status.balance` and the per-capability counters;
 *   - **what has happened?** — `history`, the movements and the attempts, refusals
 *     included.
 *
 * Two properties inherited from the phase rather than invented here:
 *
 *   1. **The server owns every number.** Nothing in this file adds, subtracts or
 *      estimates a credit. A balance computed in the browser would be a second opinion
 *      about a quantity that decides whether work runs, and the ledger's whole purpose is
 *      that there is exactly one.
 *   2. **No stand-in.** With no session the store reports `unavailable` with the
 *      resolver's own reason and renders nothing in place of an allowance. A fixture that
 *      looked like a real balance would be a factual claim about the user's account,
 *      which is the one thing this surface must never fabricate.
 *
 * `load()` always re-requests rather than caching across a period change: a displayed
 * balance that is a minute old is a balance that may already have been spent.
 */

import { create } from 'zustand';
import type { UsageHistoryData, UsageStatusData } from '@shared/api/contracts';
import { ApiClient, ApiError } from '../api/client.js';
import { clientForProfile } from './profile.js';

export type UsageStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';

export interface UsageErrorView {
  code: string;
  message: string;
  retryable: boolean;
}

export interface UsageStoreState {
  status: UsageStatus;
  usage: UsageStatusData | null;
  history: UsageHistoryData | null;
  /** Separate from `status`: the history can fail while the balance is on screen. */
  historyStatus: UsageStatus;
  historyError: UsageErrorView | null;
  unavailableReason: string | null;
  error: UsageErrorView | null;

  load: () => Promise<void>;
  loadHistory: (filter?: { feature?: string; limit?: number }) => Promise<void>;
  refresh: () => Promise<void>;
  reset: () => void;
}

/** Turn a failure into something renderable, without leaking a stack or a payload. */
export function describeUsageError(error: unknown): UsageErrorView {
  if (error instanceof ApiError) {
    return { code: error.code, message: error.describe(), retryable: error.retryable };
  }
  return {
    code: 'INTERNAL',
    message: error instanceof Error ? error.message : 'The request failed without a reason.',
    retryable: false,
  };
}

export const useUsageStore = create<UsageStoreState>((set) => ({
  status: 'idle',
  usage: null,
  history: null,
  historyStatus: 'idle',
  historyError: null,
  unavailableReason: null,
  error: null,

  load: async () => {
    set({ status: 'loading', error: null, unavailableReason: null });

    const client = await clientForProfile();
    if ('reason' in client) {
      set({ status: 'unavailable', unavailableReason: client.reason, usage: null });
      return;
    }

    try {
      const usage = await (client as ApiClient).getUsage();
      set({ status: 'ready', usage, error: null, unavailableReason: null });
    } catch (error) {
      const view = describeUsageError(error);
      // A refused credential is the honest reason there is no balance, not a transient
      // failure to retry in a loop.
      if (view.code === 'UNAUTHENTICATED' || view.code === 'FORBIDDEN') {
        set({ status: 'unavailable', unavailableReason: view.message, usage: null });
        return;
      }
      // `PROVIDER_UNAVAILABLE` means this deployment has no usage store, which is a
      // different truth from "the request failed": it is reported as unavailable, with
      // the server's own explanation, rather than as an error the user should retry.
      if (view.code === 'PROVIDER_UNAVAILABLE') {
        set({ status: 'unavailable', unavailableReason: view.message, usage: null });
        return;
      }
      set({ status: 'error', error: view });
    }
  },

  loadHistory: async (filter = {}) => {
    set({ historyStatus: 'loading', historyError: null });

    const client = await clientForProfile();
    if ('reason' in client) {
      set({ historyStatus: 'unavailable', history: null });
      return;
    }

    try {
      const history = await (client as ApiClient).getUsageHistory(filter);
      set({ historyStatus: 'ready', history, historyError: null });
    } catch (error) {
      const view = describeUsageError(error);
      if (view.code === 'UNAUTHENTICATED' || view.code === 'FORBIDDEN') {
        set({ historyStatus: 'unavailable', history: null });
        return;
      }
      set({ historyStatus: 'error', historyError: view });
    }
  },

  refresh: async () => {
    const { load, loadHistory } = useUsageStore.getState();
    await Promise.all([load(), loadHistory()]);
  },

  reset: () =>
    set({
      status: 'idle',
      usage: null,
      history: null,
      historyStatus: 'idle',
      historyError: null,
      unavailableReason: null,
      error: null,
    }),
}));
