/**
 * The application shell's responsive model — Phase 8.1.2.
 *
 * Before this module the shell's width behaviour was one media query read in one component
 * (`COMPACT_SHELL_QUERY` in `Sidebar.tsx`), and every other width decision was written where it was
 * needed. That is fine while there is one decision and stops being fine the moment there are four:
 * a laptop and a desktop differ, a tablet and a phone differ more, and each difference has to be
 * *stated* somewhere a test can read rather than inferred from a class list in a component.
 *
 * So the width behaviour is a value here and only a value here. Two functions and one fact:
 *
 *   - {@link shellModeFor} turns a viewport width into one of the four modes the roadmap designs at;
 *   - {@link railModeFor} turns a mode plus the reader's own preference into how the navigation is
 *     presented — expanded, an icon rail, or an off-canvas drawer;
 *   - {@link SHELL_WIDTHS} is the single statement of where the boundaries are, and the media
 *     queries in {@link MOBILE_SHELL_QUERY} / {@link COMPACT_SHELL_QUERY} / {@link WIDE_SHELL_QUERY}
 *     are *derived* from it, so the function and the queries cannot disagree about a boundary.
 *
 * This file has no React and no imports, so the model can be tested by calling it. The hook that
 * subscribes a component to it is `useShellLayout`.
 */

/** The four widths the shell is designed at, widest first. */
export type ShellMode = 'desktop' | 'laptop' | 'tablet' | 'mobile';

/**
 * How the navigation is presented in a mode.
 *
 * `collapsed` and `expanded` are the same rail at two widths; `offcanvas` is not a width at all —
 * the navigation is out of the flow entirely and the content owns the whole window.
 */
export type RailMode = 'expanded' | 'collapsed' | 'offcanvas';

/**
 * Where the modes begin, in CSS pixels.
 *
 * `mobile` is Tailwind's `md` (tablet) edge, `tablet` is the boundary the shell has used since
 * Phase 3.2 — deliberately between `md` and `xl`, recorded in `docs/frontend-foundation.md` § 10 —
 * and `desktop` is Tailwind's `xl`. The ladder itself stays declared in the theme
 * (`--breakpoint-*`); these are the three points the *shell* turns on.
 */
export const SHELL_WIDTHS = {
  mobile: 768,
  tablet: 1100,
  desktop: 1280,
} as const;

/** Below this the navigation is an off-canvas drawer. */
export const MOBILE_SHELL_QUERY = `(max-width: ${SHELL_WIDTHS.mobile - 1}px)`;

/** Below this the rail is an icon rail, whatever the reader chose. */
export const COMPACT_SHELL_QUERY = `(max-width: ${SHELL_WIDTHS.tablet - 1}px)`;

/** At or above this the workstation is at its widest designed width. */
export const WIDE_SHELL_QUERY = `(min-width: ${SHELL_WIDTHS.desktop}px)`;

/** The four modes, in order, for tests and documentation. */
export const SHELL_MODES: readonly ShellMode[] = ['desktop', 'laptop', 'tablet', 'mobile'];

/**
 * The mode a viewport width is.
 *
 * The boundaries are half-open on the low side (`== mobile` is already tablet), so a window resized
 * to exactly 768px is a tablet and the media query `(max-width: 767px)` agrees with it exactly.
 */
export function shellModeFor(width: number): ShellMode {
  if (width < SHELL_WIDTHS.mobile) return 'mobile';
  if (width < SHELL_WIDTHS.tablet) return 'tablet';
  if (width < SHELL_WIDTHS.desktop) return 'laptop';
  return 'desktop';
}

/**
 * How the navigation is presented in a mode.
 *
 * The reader's saved preference is the *default* at the two widest modes and is **overridden** at
 * the two narrowest, which is the rule the shell has always had: a phone or a tablet does not have
 * the room for a 264px rail, so the window wins there, and only a laptop or desktop can honour
 * "keep it collapsed". Mobile is not the collapsed rail — it is the off-canvas drawer, because a
 * 76px rail still costs a third of a 375px screen.
 */
export function railModeFor(mode: ShellMode, userCollapsed: boolean): RailMode {
  if (mode === 'mobile') return 'offcanvas';
  if (mode === 'tablet') return 'collapsed';
  return userCollapsed ? 'collapsed' : 'expanded';
}

/** Whether the rail can be collapsed by the reader in this mode. */
export function canCollapseRail(mode: ShellMode): boolean {
  return mode === 'laptop' || mode === 'desktop';
}
