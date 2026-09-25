/**
 * Profile state (Zustand).
 *
 * The domain state for the Profile surface: the user's declared context, the
 * assessment derived from it, and the state of the last read or write.
 *
 * **One session, two consumers.** This store does not resolve a session of its own; it
 * reads the resolution the realtime store already made. Two independent resolutions
 * would be two answers to "what credential am I using", and the day they disagreed the
 * page would report a failure that no server log explains. The profile store asks the
 * realtime store to initialise if nobody has yet, then reuses exactly what it produced.
 *
 * **Nothing is invented.** When there is no session the store reports `unavailable`
 * with the reason the session resolver gave, and the page says so. It does not fall
 * back to a local fixture that would look like a saved profile — that is the specific
 * dishonesty the preview rules forbid.
 */

import { create } from 'zustand';
import type { ProfileData, ProfileWriteData } from '@shared/api/contracts';
import type { TradingContext } from '@shared/profile/model';
import { ApiClient, ApiError } from '../api/client.js';
import { useRealtimeStore } from '../realtime/store.js';
import { msg } from '../i18n/index.js';

/** What the caller sends: the document, without the fields the server owns. */
export type ProfileContextInput = Omit<TradingContext, 'version' | 'createdAt'>;

export type ProfileStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';

export interface ProfileErrorView {
  code: string;
  message: string;
  /** Field-level problems from a rejected write, when the server named any. */
  fields: { field: string; problem: string }[];
  /** True when retrying the same request could plausibly succeed. */
  retryable: boolean;
}

export interface ProfileStoreState {
  status: ProfileStatus;
  profile: ProfileData | null;
  /** Why the profile is unavailable, when it is. Rendered verbatim. */
  unavailableReason: string | null;
  error: ProfileErrorView | null;

  saving: boolean;
  saveError: ProfileErrorView | null;
  /** The result of the last successful write, so the page can confirm it. */
  lastSaved: ProfileWriteData | null;

  load: () => Promise<void>;
  save: (context: ProfileContextInput) => Promise<ProfileWriteData | null>;
  clearSaveResult: () => void;
  reset: () => void;
}

/**
 * Build a client from the session the realtime store resolved, or report why not.
 *
 * Exported because every authenticated store must reuse *this* resolution. A second
 * one would be a second answer to "what credential am I using", and the day the two
 * disagreed the surface would show a failure no server log explains.
 */
export async function clientForProfile(): Promise<ApiClient | { reason: string }> {
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
    shellToken: resolution.shellToken,
  });
}

/** Turn a failure into something the page can render without leaking a stack. */
export function describeProfileError(error: unknown): ProfileErrorView {
  if (error instanceof ApiError) {
    const details = error.details ?? {};
    const raw = details.problems ?? details.fields;
    const fields: { field: string; problem: string }[] = Array.isArray(raw)
      ? raw
          .filter(
            (entry): entry is Record<string, unknown> =>
              typeof entry === 'object' && entry !== null,
          )
          .map((entry) => ({
            field: String(entry.field ?? entry.path ?? 'unknown'),
            problem: String(entry.problem ?? entry.message ?? 'was rejected'),
          }))
      : [];
    return {
      code: error.code,
      message: error.describe(),
      fields,
      retryable: error.retryable || error.code === 'UNAUTHENTICATED',
    };
  }
  return {
    code: 'INTERNAL',
    message: error instanceof Error ? error.message : 'The request failed without a reason.',
    fields: [],
    retryable: false,
  };
}

export const useProfileStore = create<ProfileStoreState>((set, get) => ({
  status: 'idle',
  profile: null,
  unavailableReason: null,
  error: null,
  saving: false,
  saveError: null,
  lastSaved: null,

  load: async () => {
    set({ status: 'loading', error: null, unavailableReason: null });
    const client = await clientForProfile();
    if ('reason' in client) {
      set({ status: 'unavailable', unavailableReason: client.reason, profile: null });
      return;
    }
    try {
      const profile = await client.getProfile();
      set({ status: 'ready', profile, error: null, unavailableReason: null });
    } catch (error) {
      const view = describeProfileError(error);
      // A refused credential is not an error to retry silently: it is the honest
      // reason there is no profile, and it is reported as such.
      if (view.code === 'UNAUTHENTICATED' || view.code === 'FORBIDDEN') {
        set({ status: 'unavailable', unavailableReason: view.message, profile: null });
        return;
      }
      set({ status: 'error', error: view });
    }
  },

  save: async (context) => {
    set({ saving: true, saveError: null });
    const client = await clientForProfile();
    if ('reason' in client) {
      set({
        saving: false,
        saveError: {
          code: 'PROVIDER_UNAVAILABLE',
          message: client.reason,
          fields: [],
          retryable: true,
        },
      });
      return null;
    }
    try {
      const result = await client.saveProfileContext(context);
      set({ saving: false, lastSaved: result, saveError: null });
      // Re-read rather than patching the cache: the server computes the assessment and
      // assigns the version, and a locally patched copy would disagree with both.
      await get().load();
      return result;
    } catch (error) {
      set({ saving: false, saveError: describeProfileError(error) });
      return null;
    }
  },

  clearSaveResult: () => set({ lastSaved: null, saveError: null }),
  reset: () =>
    set({
      status: 'idle',
      profile: null,
      unavailableReason: null,
      error: null,
      saving: false,
      saveError: null,
      lastSaved: null,
    }),
}));
