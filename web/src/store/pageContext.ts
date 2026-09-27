/**
 * The view a reader was on — Phase 8.1.3.
 *
 * The workspace renders **one page at a time** and unmounts the rest (`App.renderPage`), which is a
 * deliberate shape: a page swap is a real swap rather than a stack of hidden panes, and the browser
 * suite can say which screen is on screen by reading the heading it painted. The consequence is that
 * every value a page held in `useState` was thrown away the moment its reader looked at something
 * else — open the journal's analytics tab, walk to the portfolio, walk back, and the journal is on
 * overview again, with the filters cleared. Nothing was wrong with any one page; the state simply
 * lived somewhere that does not survive the page.
 *
 * So the *context* of a page lives here, above it: which view of the page was open, and the working
 * state that belongs to that view. Two things this is deliberately **not**:
 *
 *   - **not a router.** Nothing is put in the URL, nothing is pushed onto history, and the shell's
 *     own vocabulary (`page` in `store/ui.ts`) still owns *which page*. This module only remembers
 *     what a page looked like while it was open.
 *   - **not a cache.** Only choices live here. A page still reads its data on mount — re-fetching is
 *     not what "restore the context" means, and a stale copy of a server's answer kept here would be
 *     exactly the second source of truth the shell's other stores exist to avoid.
 *
 * It is also not persisted. This is session context: it should survive a walk around the product, and
 * a new session should start where its defaults say it does. The preferences that *are* persisted —
 * the interface language and the rail's collapsed state — are the reader's standing choices rather
 * than where they happened to be standing.
 */

import { useCallback, useRef } from 'react';
import { create } from 'zustand';
import type { AppPageId } from '../config/navigation.js';

/**
 * What a value kept here is *for*.
 *
 * A closed set rather than a free string: a slot that can be misspelled is a second, empty copy of
 * the reader's state waiting to happen — `filters` on the way out and `filter` on the way back looks
 * like the store is broken rather than like a typo.
 */
export const VIEW_SLOTS = [
  /** Which tab of the page was open. */
  'tab',
  /** The journal's trade filters, as one value. */
  'filters',
  /** The journal's analytics range preset. */
  'range',
  /** The journal's hand-picked analytics start date. */
  'from',
  /** The journal's hand-picked analytics end date. */
  'to',
  /** Whether the journal's calendar was showing a month or a week. */
  'calendar',
  /** The memory page's search text. */
  'query',
  /** The memory page's status filter. */
  'statusFilter',
  /** The memory page's source filter. */
  'sourceFilter',
  /** Which item of a list the reader had selected (research). */
  'selection',
  /** Text typed into a page's own composer and not yet sent (the agent workspace). */
  'draft',
] as const;

export type ViewSlot = (typeof VIEW_SLOTS)[number];

export interface PageContextState {
  /** Every kept value, keyed by {@link viewKey}. */
  views: Record<string, unknown>;
  setView: (page: AppPageId, slot: ViewSlot, value: unknown) => void;
}

/**
 * The key a value is filed under.
 *
 * Dotted and namespaced by page, so a storage inspector — and a failing test — says which page the
 * value belongs to rather than only which slot it filled.
 */
export function viewKey(page: AppPageId, slot: ViewSlot): string {
  return `${page}.${slot}`;
}

export const usePageContextStore = create<PageContextState>((set) => ({
  views: {},
  setView: (page, slot, value) =>
    set((state) => ({ views: { ...state.views, [viewKey(page, slot)]: value } })),
}));

/**
 * One value of one page's context, with the setter `useState` would have given it.
 *
 * It is a drop-in for `useState` — the same tuple, and a setter that still accepts an updater — so a
 * page states *what* it is keeping and *where* it belongs, and nothing else about its code has to
 * change. `initial` is what the page opens with the first time in a session, and it is read from the
 * store at the moment of the write rather than captured, so two writes in one tick cannot overwrite
 * each other with a stale previous value.
 */
export function usePageView<T>(
  page: AppPageId,
  slot: ViewSlot,
  initial: T,
): [T, (value: T | ((previous: T) => T)) => void] {
  const value = usePageContextStore((state) => state.views[viewKey(page, slot)]) as T | undefined;
  const current = value === undefined ? initial : value;

  // Held in a ref rather than closed over, so the setter's identity is a function of *which* value is
  // being set and not of what it starts as: a page that passes a fresh `[]` or a fresh object literal
  // as its opening state would otherwise hand a new function to every child on every render.
  const initialRef = useRef(initial);
  initialRef.current = initial;

  const set = useCallback(
    (next: T | ((previous: T) => T)) => {
      const state = usePageContextStore.getState();
      const stored = state.views[viewKey(page, slot)] as T | undefined;
      const previous = stored === undefined ? initialRef.current : stored;
      state.setView(
        page,
        slot,
        typeof next === 'function' ? (next as (p: T) => T)(previous) : next,
      );
    },
    [page, slot],
  );

  return [current, set];
}
