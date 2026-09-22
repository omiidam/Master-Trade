/**
 * Decision evaluation state (Zustand).
 *
 * The store holds the caller's own records plus, for the selected one, the composed readiness
 * verdict and the evaluation the server computed from the prices on the record. Five rules, all
 * inherited from the phase:
 *
 *   1. **The client measures nothing.** No return, no R multiple, no drawdown, no difference
 *      against an expectation. Every figure arrives formatted by the engine and labelled with what
 *      it is, and a number derived in the browser would be a second opinion about money.
 *   2. **A refused evaluation is a state, not an error.** `report: null` arrives beside the
 *      readiness verdict and its reasons, and it is stored as the reading. Rendering it as a
 *      failure would push a person to retry something that cannot succeed until they answer the
 *      questions it names.
 *   3. **No stand-in.** With no session the store reports `unavailable` with the resolver's own
 *      reason, and nothing is drawn in its place. A fixture decision would be a fabricated record
 *      of somebody's trading, which is the one thing this surface must never invent.
 *   4. **An evaluation re-reads.** Evaluating returns the new reading, which is adopted whole —
 *      merging a fresh evaluation into stale state is how a surface shows a verdict from one
 *      version beside figures from another.
 *   5. **The history is attempts, not verdicts.** Each row names the rule that produced it and the
 *      version it read, so a number that changed is explained by two rows rather than by one row
 *      that overwrote what it used to say.
 */

import { create } from 'zustand';
import type { DecisionListData, DecisionViewData } from '@shared/api/contracts';
import { ApiClient, ApiError } from '../api/client.js';
import { clientForProfile } from './profile.js';

export type DecisionsStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';
export type EvaluateStatus = 'idle' | 'evaluating' | 'done' | 'refused' | 'failed';

export interface DecisionsErrorView {
  code: string;
  message: string;
  retryable: boolean;
}

export interface DecisionsStoreState {
  status: DecisionsStatus;
  list: DecisionListData | null;
  /** The selected decision's full reading, always the server's own. */
  view: DecisionViewData | null;
  unavailableReason: string | null;
  error: DecisionsErrorView | null;

  /** Separate from `status`: a refused evaluation leaves the reading on screen untouched. */
  evaluateStatus: EvaluateStatus;
  evaluateMessage: string | null;
  detailStatus: DecisionsStatus;
  detailError: DecisionsErrorView | null;

  load: () => Promise<void>;
  select: (decisionId: string) => Promise<void>;
  evaluate: (decisionId: string) => Promise<void>;
  refresh: () => Promise<void>;
  clearSelection: () => void;
  reset: () => void;
}

/** Turn a failure into something renderable, without leaking a stack or a payload. */
export function describeDecisionError(error: unknown): DecisionsErrorView {
  if (error instanceof ApiError) {
    return { code: error.code, message: error.describe(), retryable: error.retryable };
  }
  return {
    code: 'INTERNAL',
    message: error instanceof Error ? error.message : 'The request failed without a reason.',
    retryable: false,
  };
}

/** A recorded credential that was refused is the honest reason there is nothing to read. */
function isUnavailable(described: DecisionsErrorView): boolean {
  return (
    described.code === 'UNAUTHENTICATED' ||
    described.code === 'FORBIDDEN' ||
    described.code === 'PROVIDER_UNAVAILABLE'
  );
}

export const useDecisionsStore = create<DecisionsStoreState>((set, get) => ({
  status: 'idle',
  list: null,
  view: null,
  unavailableReason: null,
  error: null,
  evaluateStatus: 'idle',
  evaluateMessage: null,
  detailStatus: 'idle',
  detailError: null,

  load: async () => {
    set({ status: 'loading', error: null, unavailableReason: null });

    const client = await clientForProfile();
    if ('reason' in client) {
      set({ status: 'unavailable', unavailableReason: client.reason, list: null });
      return;
    }

    try {
      const list = await (client as ApiClient).listDecisions({ limit: 50 });
      set({ status: 'ready', list, error: null, unavailableReason: null });
    } catch (error) {
      const described = describeDecisionError(error);
      if (isUnavailable(described)) {
        set({ status: 'unavailable', unavailableReason: described.message, list: null });
        return;
      }
      set({ status: 'error', error: described });
    }
  },

  select: async (decisionId) => {
    set({ detailStatus: 'loading', detailError: null, view: null });

    const client = await clientForProfile();
    if ('reason' in client) {
      set({
        detailStatus: 'unavailable',
        detailError: { code: 'UNAUTHENTICATED', message: client.reason, retryable: false },
      });
      return;
    }

    try {
      const view = await (client as ApiClient).getDecision(decisionId);
      set({ detailStatus: 'ready', view, detailError: null });
    } catch (error) {
      const described = describeDecisionError(error);
      set({
        detailStatus: isUnavailable(described) ? 'unavailable' : 'error',
        detailError: described,
      });
    }
  },

  evaluate: async (decisionId) => {
    set({ evaluateStatus: 'evaluating', evaluateMessage: null });

    const client = await clientForProfile();
    if ('reason' in client) {
      set({
        evaluateStatus: 'failed',
        evaluateMessage: client.reason,
      });
      return;
    }

    try {
      const view = await (client as ApiClient).evaluateDecision(decisionId, 'requested');
      // Adopted whole, and the list is re-read so the row's latest attempt matches the detail.
      set({
        view,
        detailStatus: 'ready',
        detailError: null,
        evaluateStatus: view.report === null ? 'refused' : 'done',
        evaluateMessage:
          view.report === null
            ? view.readiness.limitations.join(' ') ||
              'The record does not support an evaluation yet.'
            : 'Evaluation recorded. It is append-only, so the previous attempts are still listed.',
      });
      const list = get().list;
      if (list !== null) {
        try {
          const refreshed = await (client as ApiClient).listDecisions({ limit: 50 });
          set({ list: refreshed });
        } catch {
          // A failed list refresh must not discard the evaluation that just succeeded.
        }
      }
    } catch (error) {
      const described = describeDecisionError(error);
      set({ evaluateStatus: 'failed', evaluateMessage: described.message });
    }
  },

  refresh: async () => {
    await get().load();
    const view = get().view;
    if (view !== null) await get().select(view.decision.id);
  },

  clearSelection: () =>
    set({
      view: null,
      detailStatus: 'idle',
      detailError: null,
      evaluateStatus: 'idle',
      evaluateMessage: null,
    }),

  reset: () =>
    set({
      status: 'idle',
      list: null,
      view: null,
      unavailableReason: null,
      error: null,
      evaluateStatus: 'idle',
      evaluateMessage: null,
      detailStatus: 'idle',
      detailError: null,
    }),
}));
