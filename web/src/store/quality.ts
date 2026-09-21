/**
 * Input-quality state (Zustand).
 *
 * Holds the answer to two questions the phase exists to separate:
 *
 *   - **how good is what I have told the system?** — the context-level report;
 *   - **may this particular analysis run?** — the gate's decisions.
 *
 * They are not the same question, and the store keeps them in separate fields so a
 * surface cannot accidentally present one as the other. A report with every required
 * field present can still yield a `BLOCKED` decision for an analysis that needs a bar
 * series; a report with gaps can still yield `READY_WITH_LIMITATIONS` for a capability
 * that does not need them.
 *
 * Three properties, all inherited from the phase rather than invented here:
 *
 *   1. **The gate is the server's.** Nothing in this file computes a readiness, a
 *      classification or a confidence. It sends a request and renders the verdict,
 *      because a client that could derive readiness could disagree with the agent.
 *   2. **One session.** The client comes from the profile store's resolution, which
 *      comes from the realtime store's — one answer, three consumers.
 *   3. **No stand-in.** With no session the store reports `unavailable` with the
 *      resolver's own reason and renders nothing in place of an assessment. A fixture
 *      that looked like real quality data would be the exact dishonesty the product
 *      rules forbid, and on this surface it would be a factual claim about the user.
 *
 * The store never caches across a context change: `load()` always re-requests, because
 * a stored assessment is a claim about a specific context version and would silently
 * go stale the moment the user edits anything.
 */

import { create } from 'zustand';
import type { QualityAssessData } from '@shared/api/contracts';
import type { AnalysisType } from '@shared/quality/readiness';
import type { FieldKey } from '@shared/profile/model';
import { ApiClient, ApiError } from '../api/client.js';
import { clientForProfile } from './profile.js';

export type QualityStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';

export interface QualityErrorView {
  code: string;
  message: string;
  retryable: boolean;
}

/** What a caller may ask for. Both fields are declarations, never free text. */
export interface QualityRequest {
  analysisType?: AnalysisType;
  premises?: readonly FieldKey[];
}

export interface QualityStoreState {
  status: QualityStatus;
  /** The last assessment, always for `assessment.contextVersion`. */
  assessment: QualityAssessData | null;
  /**
   * The request the current assessment answers.
   *
   * Kept so the surface can say *which* question the verdict belongs to. A readiness
   * panel that has lost track of the analysis it is describing is worse than no panel.
   */
  request: QualityRequest;
  unavailableReason: string | null;
  error: QualityErrorView | null;

  load: (request?: QualityRequest) => Promise<void>;
  refresh: () => Promise<void>;
  reset: () => void;
}

/** Turn a failure into something renderable, without leaking a stack or a payload. */
export function describeQualityError(error: unknown): QualityErrorView {
  if (error instanceof ApiError) {
    return {
      code: error.code,
      message: error.describe(),
      retryable: error.retryable,
    };
  }
  return {
    code: 'INTERNAL',
    message: error instanceof Error ? error.message : 'The request failed without a reason.',
    retryable: false,
  };
}

export const useQualityStore = create<QualityStoreState>((set, get) => ({
  status: 'idle',
  assessment: null,
  request: {},
  unavailableReason: null,
  error: null,

  load: async (request) => {
    // The category is the category on screen; a caller that names none keeps the one
    // already shown rather than silently reassessing every declared type.
    const asked: QualityRequest = request ?? get().request;
    set({ status: 'loading', error: null, unavailableReason: null, request: asked });

    const client = await clientForProfile();
    if ('reason' in client) {
      set({ status: 'unavailable', unavailableReason: client.reason, assessment: null });
      return;
    }

    try {
      const assessment = await (client as ApiClient).assessQuality(asked);
      set({ status: 'ready', assessment, error: null, unavailableReason: null });
    } catch (error) {
      const view = describeQualityError(error);
      // A refused credential is the honest reason there is no assessment, not a
      // transient failure to retry in a loop.
      if (view.code === 'UNAUTHENTICATED' || view.code === 'FORBIDDEN') {
        set({ status: 'unavailable', unavailableReason: view.message, assessment: null });
        return;
      }
      set({ status: 'error', error: view });
    }
  },

  refresh: async () => {
    await get().load();
  },

  reset: () =>
    set({
      status: 'idle',
      assessment: null,
      request: {},
      unavailableReason: null,
      error: null,
    }),
}));
