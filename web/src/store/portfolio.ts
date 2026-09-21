/**
 * Portfolio state (Zustand).
 *
 * The store holds one reading of one declaration: the composition the account declared,
 * the metrics computed from it, the insights the engine derived, the readiness verdict and
 * the version history. All of it arrives from the server in one response, because the parts
 * are only meaningful together — a metric without the assessment that produced it is a
 * number with no caveats, and a verdict without its findings is a refusal nobody can act on.
 *
 * Four rules, all inherited from the phase:
 *
 *   1. **The client computes nothing.** Not a total, not a percentage, not a share. Every
 *      figure here was produced by deterministic code on the server, and a number derived
 *      in the browser would be a second opinion about money.
 *   2. **`declared: false` is a state, not an empty portfolio.** \"This account has not told
 *      us what it holds\" and \"it told us it holds nothing\" are different facts, and the
 *      store keeps the server's flag rather than inferring one from an empty list.
 *   3. **No stand-in.** With no session the store reports `unavailable` with the resolver's
 *      own reason, and nothing is rendered in its place. Fixture holdings would be a factual
 *      claim about somebody's finances, which is the one thing this surface must never
 *      fabricate.
 *   4. **A save re-reads.** Declaring a composition returns the new reading, which is
 *      adopted whole. Merging a response into stale state is how a surface ends up showing
 *      a total from one version beside positions from another.
 *
 * The save is deliberately not optimistic: the server mints the ids, assigns the version and
 * computes the figures, so there is nothing truthful to show until it answers.
 */

import { create } from 'zustand';
import type { PortfolioViewData } from '@shared/api/contracts';
import type { PortfolioDocumentBody } from '@shared/portfolio/model';
import { ApiClient, ApiError } from '../api/client.js';
import { clientForProfile } from './profile.js';

export type PortfolioStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';
export type PortfolioSaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

export interface PortfolioErrorView {
  code: string;
  message: string;
  retryable: boolean;
}

export interface PortfolioStoreState {
  status: PortfolioStatus;
  /** The last reading, always the server's own. */
  view: PortfolioViewData | null;
  unavailableReason: string | null;
  error: PortfolioErrorView | null;

  /** Separate from `status`: a failed save leaves the reading on screen untouched. */
  saveStatus: PortfolioSaveStatus;
  saveError: PortfolioErrorView | null;
  /** Field-level issues from a rejected declaration, as `field: reason`. */
  validationIssues: readonly string[];

  load: () => Promise<void>;
  save: (document: PortfolioDocumentBody) => Promise<boolean>;
  refresh: () => Promise<void>;
  /** Clear the save banner without discarding the reading. */
  clearSave: () => void;
  reset: () => void;
}

/** Turn a failure into something renderable, without leaking a stack or a payload. */
export function describePortfolioError(error: unknown): PortfolioErrorView {
  if (error instanceof ApiError) {
    return { code: error.code, message: error.describe(), retryable: error.retryable };
  }
  return {
    code: 'INTERNAL',
    message: error instanceof Error ? error.message : 'The request failed without a reason.',
    retryable: false,
  };
}

/**
 * Read the field issues out of a validation failure.
 *
 * The server already shapes them as `path: reason`, and they are returned as they arrived:
 * re-wording a schema's complaint in the browser is how the message a user acts on drifts
 * from the rule that actually rejected the request.
 */
export function validationIssuesOf(error: unknown): string[] {
  if (!(error instanceof ApiError)) return [];
  const details = error.details;
  if (details === undefined || details === null) return [];
  const fields = (details as { fields?: unknown }).fields;
  if (!Array.isArray(fields)) return [];
  return fields
    .map((entry) => {
      const record = entry as { path?: unknown; message?: unknown };
      const path = typeof record.path === 'string' ? record.path : 'body';
      const message = typeof record.message === 'string' ? record.message : 'is not valid';
      return `${path}: ${message}`;
    })
    .slice(0, 20);
}

export const usePortfolioStore = create<PortfolioStoreState>((set, get) => ({
  status: 'idle',
  view: null,
  unavailableReason: null,
  error: null,
  saveStatus: 'idle',
  saveError: null,
  validationIssues: [],

  load: async () => {
    set({ status: 'loading', error: null, unavailableReason: null });

    const client = await clientForProfile();
    if ('reason' in client) {
      set({ status: 'unavailable', unavailableReason: client.reason, view: null });
      return;
    }

    try {
      const view = await (client as ApiClient).getPortfolio();
      set({ status: 'ready', view, error: null, unavailableReason: null });
    } catch (error) {
      const described = describePortfolioError(error);
      // A refused credential is the honest reason there is nothing to read, not a
      // transient failure to retry in a loop.
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

  save: async (document) => {
    set({ saveStatus: 'saving', saveError: null, validationIssues: [] });

    const client = await clientForProfile();
    if ('reason' in client) {
      set({
        saveStatus: 'failed',
        saveError: { code: 'UNAUTHENTICATED', message: client.reason, retryable: false },
      });
      return false;
    }

    try {
      const view = await (client as ApiClient).savePortfolio(document);
      // Adopted whole: the response is the reading of the version that was just written,
      // so nothing here is merged with what the previous version looked like.
      set({ status: 'ready', view, saveStatus: 'saved', saveError: null, validationIssues: [] });
      return true;
    } catch (error) {
      const described = describePortfolioError(error);
      set({
        saveStatus: 'failed',
        saveError: described,
        validationIssues: described.code === 'VALIDATION_FAILED' ? validationIssuesOf(error) : [],
      });
      return false;
    }
  },

  refresh: async () => {
    await get().load();
  },

  clearSave: () => set({ saveStatus: 'idle', saveError: null, validationIssues: [] }),

  reset: () =>
    set({
      status: 'idle',
      view: null,
      unavailableReason: null,
      error: null,
      saveStatus: 'idle',
      saveError: null,
      validationIssues: [],
    }),
}));
