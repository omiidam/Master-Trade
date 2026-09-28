/**
 * UI state (Zustand).
 *
 * Local interface state only: which page is open, writing direction, density, the language
 * preference and which dialog is showing. No domain data lives here — conversations, progress
 * and market data will come from the backend through the typed API layer, and
 * the frontend never calls a provider, the database or the LLM directly
 * (docs/technology-decisions.md § 1.2).
 *
 * Three entries here outlive the process — the language preference, the rail's collapsed state and the
 * workspace's density — and each is deliberately a *mirror* rather than an owner. `language/preference.ts`
 * and `app/shellPreference.ts` own their settings: the key, the validation and the storage access all live
 * there, and this store holds the current value so the interface can render it without touching storage
 * on every render. Reading the language again in `setLanguagePreference`'s write path means the state
 * here says exactly what storage says, including after a write that failed.
 *
 * Everything else is memory on purpose. Which page is open, which dialog is showing and whether the
 * off-canvas drawer is open are positions rather than choices, and a product that reopened on the last
 * dialog somebody closed would be remembering the wrong thing. The *page* is the one position the
 * browser also keeps a record of, and even that is not stored here: `app/pageHistory.ts` subscribes to
 * this store, records each move in the session history, and applies what Back and Forward walk to — the
 * same mirror arrangement as the two settings above, one layer out (`docs/application-shell.md` § 11.2).
 * A reload still starts at the dashboard: the session history is the browser's, not a place this product
 * keeps a position in.
 */

import { create } from 'zustand';
import {
  readDensity,
  readSidebarCollapsed,
  writeDensity,
  writeSidebarCollapsed,
  type ShellDensity,
} from '../app/shellPreference.js';
import type { AppPageId } from '../config/navigation.js';
import {
  DEFAULT_DIRECTION_PREFERENCE,
  directionOf,
  type DirectionPreference,
} from '../i18n/direction.js';
import { uiLocaleOf } from '../i18n/locales.js';
import {
  readLanguagePreference,
  writeLanguagePreference,
  type LanguagePreference,
} from '../language/preference.js';

/**
 * The workspace's density, re-exported under the name this store has used since Phase 3.
 *
 * The vocabulary itself is the shell preference module's (`web/src/app/shellPreference.ts`), because
 * density is a written-down choice rather than a rendering detail: the file that validates what storage
 * may hold is the file that names the values it accepts.
 */
export type Density = ShellDensity;

/**
 * The writing-direction preference, re-exported under the name this store has used since Phase 3.
 *
 * The vocabulary itself is the interface layer's (`web/src/i18n/direction.ts`), because the direction is a
 * property of the locale rather than of the chrome: `auto` means "whatever the language I am reading in is
 * written in", which is a fact about the text and not about the sidebar.
 */
export type Direction = DirectionPreference;

export interface UiState {
  page: AppPageId;
  direction: Direction;
  density: Density;
  /** The reader's saved choice for the rail: collapsed or expanded, where the width allows it. */
  sidebarCollapsed: boolean;
  /** True while the off-canvas navigation is open. Only mobile renders it, so it is inert elsewhere. */
  sidebarOpen: boolean;
  /** True while the quick-navigation palette is showing. Like the drawer, it is a modal surface. */
  quickNavOpen: boolean;
  safetyDialogOpen: boolean;
  aboutDialogOpen: boolean;
  /** What this person chose to be answered in. `auto` when they have chosen nothing. */
  languagePreference: LanguagePreference;
  /** False when the choice could not be written down, so the interface can say so. */
  languageStorable: boolean;
  setPage: (page: AppPageId) => void;
  setDirection: (direction: Direction) => void;
  /**
   * Flip what is on screen, from wherever it is now.
   *
   * The shell's quick toggle pins the opposite of the direction being *read* rather than of the stored
   * preference, because the stored value may be `auto`: pressing "mirror this" in an automatic Persian
   * interface has to pin left-to-right, not silently stay right-to-left because `auto` is not `'rtl'`.
   */
  toggleDirection: () => void;
  setDensity: (density: Density) => void;
  setLanguagePreference: (preference: LanguagePreference) => void;
  toggleSidebar: () => void;
  /** Open or close the off-canvas navigation drawer (mobile). */
  setSidebarOpen: (open: boolean) => void;
  toggleSidebarOpen: () => void;
  /** Open or close the quick-navigation palette (the search over the fourteen destinations). */
  setQuickNavOpen: (open: boolean) => void;
  toggleQuickNav: () => void;
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

/**
 * The rail's standing choice, read once when the store is created.
 *
 * Same reason as the language above, and it is the one piece of shell state that is a *preference*
 * rather than a position: the reader collapses the rail because they want it collapsed, so it has to
 * still be collapsed at the next launch. Which of the four widths may honour it is `railModeFor`'s
 * decision, not this store's.
 */
const storedSidebarCollapsed = readSidebarCollapsed();

/**
 * The workspace's standing choice, read once when the store is created — Phase 8.3.3.
 *
 * The third of the store's three surviving entries and the one that was missing until this phase: the
 * rail's state and the language preference both came back after a reload while this one did not, so the
 * reader's own spacing choice was the only setting in the product that quietly undid itself. Same reason
 * as the two above for reading it here rather than on mount — the first paint is then already the right
 * one, and a workspace that renders airy and tightens a frame later has told the reader their choice was
 * lost before telling them it was remembered.
 */
const storedDensity = readDensity();

export const useUiStore = create<UiState>((set) => ({
  page: 'dashboard',
  // `auto`, so that choosing Persian in Settings mirrors the interface without a second control: the
  // direction follows the language until somebody says otherwise.
  direction: DEFAULT_DIRECTION_PREFERENCE,
  density: storedDensity,
  sidebarCollapsed: storedSidebarCollapsed,
  sidebarOpen: false,
  quickNavOpen: false,
  safetyDialogOpen: false,
  aboutDialogOpen: false,
  languagePreference: storedLanguage.preference,
  languageStorable: storedLanguage.storable,
  // Choosing a destination closes the drawer it was chosen from: on mobile the navigation covers the
  // page, and a drawer that stayed open after a tap would hide the page it just navigated to.
  setPage: (page) => set({ page, sidebarOpen: false }),
  setDirection: (direction) => set({ direction }),
  toggleDirection: () =>
    set((state) => ({
      direction:
        directionOf(state.direction, uiLocaleOf(state.languagePreference)) === 'rtl'
          ? 'ltr'
          : 'rtl',
    })),
  // Written as it is chosen, like the rail's flip below: there is no commit step for the reader to
  // skip, and no second place that has to remember to save it.
  setDensity: (density) => {
    writeDensity(density);
    set({ density });
  },
  // The write happens first and its verdict is the new `languageStorable`: the control shows a
  // remembered choice only when it really was remembered.
  setLanguagePreference: (languagePreference) =>
    set({ languagePreference, languageStorable: writeLanguagePreference(languagePreference) }),
  // Written as it is flipped, so the preference and the pixel change together: there is no commit step
  // for the reader to skip and no second place that has to remember to save it.
  toggleSidebar: () =>
    set((state) => {
      const collapsed = !state.sidebarCollapsed;
      writeSidebarCollapsed(collapsed);
      return { sidebarCollapsed: collapsed };
    }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  toggleSidebarOpen: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  // Opening the palette closes the off-canvas drawer it may have been opened from: both are modal
  // surfaces, and a dialog drawn over another dialog is two answers to "who has the keyboard". The
  // reverse is not true — closing the palette touches nothing else, because a reader who dismisses
  // the search is back exactly where they were, not a drawer further on.
  setQuickNavOpen: (quickNavOpen) =>
    set(quickNavOpen ? { quickNavOpen, sidebarOpen: false } : { quickNavOpen }),
  toggleQuickNav: () =>
    set((state) =>
      state.quickNavOpen ? { quickNavOpen: false } : { quickNavOpen: true, sidebarOpen: false },
    ),
  setSafetyDialogOpen: (safetyDialogOpen) => set({ safetyDialogOpen }),
  setAboutDialogOpen: (aboutDialogOpen) => set({ aboutDialogOpen }),
}));
