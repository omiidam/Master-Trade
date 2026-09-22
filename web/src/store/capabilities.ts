/**
 * Capability catalogue state (Zustand).
 *
 * The store holds one reading of the server's capability surface: the catalogue with a resolved
 * `state` per capability, the modules each one composes, and the declared pipeline. Four rules,
 * and the first is the one that matters most here:
 *
 *   1. **The browser decides nothing.** No capability is resolved, no permission is checked and no
 *      entitlement is looked up in this file. `state` and `stateReason` are the server's own words,
 *      carried through unchanged, so the surface cannot become the thing that authorizes — which is
 *      exactly the failure the phase brief names: a frontend restriction must never replace a
 *      backend authorization.
 *   2. **Availability and readiness are two facts and both are displayed.** A capability that is
 *      declared and unbuilt is reported as unavailable whatever the inputs say, and the store keeps
 *      the server's split rather than collapsing it into one badge.
 *   3. **No stand-in.** With no session the store reports `unavailable` with the resolver's own
 *      reason. A hard-coded catalogue would be a claim about what this deployment can do, made by
 *      the client.
 *   4. **The pipeline shown is the pipeline applied.** It arrives from the same declaration the
 *      server uses to plan a run, so the diagram and the behaviour cannot drift apart.
 */

import { create } from 'zustand';
import type { CapabilitiesViewData } from '@shared/api/contracts';
import { ApiClient, ApiError } from '../api/client.js';
import { clientForProfile } from './profile.js';

export type CapabilitiesStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';

export interface CapabilitiesErrorView {
  code: string;
  message: string;
  retryable: boolean;
}

export interface CapabilitiesStoreState {
  status: CapabilitiesStatus;
  view: CapabilitiesViewData | null;
  unavailableReason: string | null;
  error: CapabilitiesErrorView | null;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  reset: () => void;
}

export function describeCapabilitiesError(error: unknown): CapabilitiesErrorView {
  if (error instanceof ApiError) {
    return { code: error.code, message: error.describe(), retryable: error.retryable };
  }
  return {
    code: 'INTERNAL',
    message: error instanceof Error ? error.message : 'The request failed without a reason.',
    retryable: false,
  };
}

export const useCapabilitiesStore = create<CapabilitiesStoreState>((set, get) => ({
  status: 'idle',
  view: null,
  unavailableReason: null,
  error: null,

  load: async () => {
    set({ status: 'loading', error: null, unavailableReason: null });

    const client = await clientForProfile();
    if ('reason' in client) {
      set({ status: 'unavailable', unavailableReason: client.reason, view: null });
      return;
    }

    try {
      const view = await (client as ApiClient).getCapabilities();
      set({ status: 'ready', view, error: null, unavailableReason: null });
    } catch (error) {
      const described = describeCapabilitiesError(error);
      if (
        described.code === 'UNAUTHENTICATED' ||
        described.code === 'FORBIDDEN' ||
        described.code === 'PROVIDER_UNAVAILABLE'
      ) {
        set({ status: 'unavailable', unavailableReason: described.message, view: null });
        return;
      }
      set({ status: 'error', error: described });
    }
  },

  refresh: async () => {
    await get().load();
  },

  reset: () => set({ status: 'idle', view: null, unavailableReason: null, error: null }),
}));
