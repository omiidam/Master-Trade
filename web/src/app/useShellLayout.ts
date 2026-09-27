/**
 * The shell's responsive state, as one subscription — Phase 8.1.2.
 *
 * `shellLayout.ts` is the *model* (a width is a mode; a mode and a preference choose a rail);
 * this is the only place that reads a media query. Every component that needs to know what the
 * shell is currently doing asks here, so there are no scattered `max-width` checks and no two
 * components deciding the same boundary for themselves.
 *
 * The three queries come from the model's own {@link SHELL_WIDTHS}, so "which mode is this?" is
 * answered by the same numbers in the browser as in a unit test.
 */

import { useMediaQuery } from '../lib/useMediaQuery';
import { useUiStore } from '../store/ui';
import {
  COMPACT_SHELL_QUERY,
  MOBILE_SHELL_QUERY,
  WIDE_SHELL_QUERY,
  canCollapseRail,
  railModeFor,
  type RailMode,
  type ShellMode,
} from './shellLayout';

export interface ShellLayout {
  /** Which of the four designed widths is on screen. */
  mode: ShellMode;
  /** How the navigation is presented in that mode. */
  rail: RailMode;
  /** True when the navigation is an off-canvas drawer (mobile). */
  isDrawer: boolean;
  /** True when the reader may collapse the rail in this mode. */
  canCollapse: boolean;
}

export function useShellLayout(): ShellLayout {
  // Narrowest first: a phone is also "compact" and also "not wide", so the order of these tests is
  // the mode, not an implementation detail.
  const isMobile = useMediaQuery(MOBILE_SHELL_QUERY);
  const isCompact = useMediaQuery(COMPACT_SHELL_QUERY);
  const isWide = useMediaQuery(WIDE_SHELL_QUERY);
  const userCollapsed = useUiStore((state) => state.sidebarCollapsed);

  const mode: ShellMode = isMobile
    ? 'mobile'
    : isCompact
      ? 'tablet'
      : isWide
        ? 'desktop'
        : 'laptop';
  const rail = railModeFor(mode, userCollapsed);

  return {
    mode,
    rail,
    isDrawer: rail === 'offcanvas',
    canCollapse: canCollapseRail(mode),
  };
}
