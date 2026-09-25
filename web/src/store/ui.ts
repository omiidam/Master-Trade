/**
 * UI state (Zustand).
 *
 * Local interface state only: which page is open, writing direction, density, the language
 * preference and which dialog is showing. No domain data lives here — conversations, progress
 * and market data will come from the backend through the typed API layer, and
 * the frontend never calls a provider, the database or the LLM directly
 * (docs/technology-decisions.md § 1.2).
 *
 * The language preference is the one entry here that outlives the process, and it is deliberately a
 * *mirror* rather than an owner. `language/preference.ts` owns the setting — the key, the validation
 * and the storage access all live there — and this store holds the current value so the interface can
 * render its selected state and so a language stage can read the choice without touching storage on
 * every message. Reading it again in `setLanguagePreference`'s write path means the state here says
 * exactly what storage says, including after a write that failed.
 */

import { create } from 'zustand';
import type { AppPageId } from '../config/navigation.js';
import {
  readLanguagePreference,
  writeLanguagePreference,
  type LanguagePreference,
} from '../language/preference.js';

export type Direction = 'ltr' | 'rtl';
export type Density = 'comfortable' | 'compact';

export interface UiState {
  page: AppPageId;
  direction: Direction;
  density: Density;
  sidebarCollapsed: boolean;
  safetyDialogOpen: boolean;
  aboutDialogOpen: boolean;
  /** What this person chose to be answered in. `auto` when they have chosen nothing. */
  languagePreference: LanguagePreference;
  /** False when the choice could not be written down, so the interface can say so. */
  languageStorable: boolean;
  setPage: (page: AppPageId) => void;
  setDirection: (direction: Direction) => void;
  toggleDirection: () => void;
  setDensity: (density: Density) => void;
  setLanguagePreference: (preference: LanguagePreference) => void;
  toggleSidebar: () => void;
  setSafetyDialogOpen: (open: boolean) => void;
  setAboutDialogOpen: (open: boolean) => void;
}

/**
 * The stored choice, read once when the store is created.
 *
 * Reading at creation rather than on mount is what makes the first paint correct: a control that
 * renders `auto` and then flips to `fa` a frame later has told the person their choice was lost before
 * telling them it was remembered. The read cannot throw — `readLanguagePreference` swallows a missing
 * or hostile store — so there is no error path to handle here.
 */
const storedLanguage = readLanguagePreference();

export const useUiStore = create<UiState>((set) => ({
  page: 'dashboard',
  direction: 'ltr',
  density: 'comfortable',
  sidebarCollapsed: false,
  safetyDialogOpen: false,
  aboutDialogOpen: false,
  languagePreference: storedLanguage.preference,
  languageStorable: storedLanguage.storable,
  setPage: (page) => set({ page }),
  setDirection: (direction) => set({ direction }),
  toggleDirection: () => set((state) => ({ direction: state.direction === 'ltr' ? 'rtl' : 'ltr' })),
  setDensity: (density) => set({ density }),
  // The write happens first and its verdict is the new `languageStorable`: the control shows a
  // remembered choice only when it really was remembered.
  setLanguagePreference: (languagePreference) =>
    set({ languagePreference, languageStorable: writeLanguagePreference(languagePreference) }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSafetyDialogOpen: (safetyDialogOpen) => set({ safetyDialogOpen }),
  setAboutDialogOpen: (aboutDialogOpen) => set({ aboutDialogOpen }),
}));
