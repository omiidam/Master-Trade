/**
 * Phase 7.1.1 — the application shell, held to its own layout contract.
 *
 * The shell shipped in Phase 3.2 and every phase since has extended it, so the three regions it
 * is made of — **Top Bar, Sidebar, Main Content** — are not new work. What this phase adds is the
 * *statement* of the layout: which element is which landmark, the widths it has to survive, and
 * the two properties a trading workstation cannot lose — the workspace keeps its own width, and
 * the Persian mirror does not break it. **No region was restructured to write this.**
 *
 * It is deliberately a *focused* suite. The broad matrix (`frontend-responsive.test.ts`) asks the
 * same questions of every page; `rtl-layout.test.ts` asks them of the whole tree. This file asks
 * them of the shell itself, reads the source rather than a render, and runs offline. The half of
 * the answer only a layout engine can give — real overflow, clipping and metric parity under a
 * mirror — is measured at four widths in `tests/browser/e2e.test.ts`.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BREAKPOINTS } from '../web/src/design/tokens.js';
import {
  COMPACT_SHELL_QUERY,
  MOBILE_SHELL_QUERY,
  SHELL_MODES,
  SHELL_WIDTHS,
  WIDE_SHELL_QUERY,
  railModeFor,
  shellModeFor,
} from '../web/src/app/shellLayout.js';

const SHELL = 'web/src/app/AppShell.tsx';
const SIDEBAR = 'web/src/app/Sidebar.tsx';
const TOPBAR = 'web/src/app/Topbar.tsx';
const WORKSPACE = 'web/src/app/Workspace.tsx';
const UI_STORE = 'web/src/store/ui.ts';
const SHELL_LAYOUT = 'web/src/app/shellLayout.ts';
const SHELL_HOOK = 'web/src/app/useShellLayout.ts';

const read = (path: string): string => readFileSync(path, 'utf8');

/**
 * The source with its comments removed.
 *
 * A file that documents its own mirroring says "left" and "right" in prose — `left-to-right`, `the
 * rail's left edge` — and a scan of the raw text would read that prose as a class list. Stripping
 * first is what keeps the rule about the *code*, the way `rtl-layout.test.ts` reads the tree.
 */
function strip(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * The four widths, widest first — the *model's* vocabulary now (`shellLayout.ts`), not this file's.
 *
 * The product is desktop-first, so the *expanded* rail is the default and every narrower step is a
 * concession: below the tablet boundary the rail is an icon rail, and a phone takes the navigation
 * out of the flow entirely. Mobile is a real mode, not a shrunken desktop — it is the width at which
 * the same shell has to stay legible rather than the width the design was drawn at.
 */

/** A declared breakpoint's width in pixels, from the token inventory. */
function breakpointPx(token: string): number {
  const found = BREAKPOINTS.find((breakpoint) => breakpoint.token === token);
  expect(found, `the ${token} breakpoint is not declared`).toBeDefined();
  return (found as { px: number }).px;
}

/**
 * A utility that means "the left" rather than "the start", for the three shell files only.
 *
 * The full tree is already scanned by `rtl-layout.test.ts`; this is the same rule stated where the
 * shell is read, so a region added here cannot borrow a physical utility from a neighbour and pass
 * because some *other* file's allow-list happened to cover the path.
 */
const PHYSICAL_UTILITY = new RegExp(
  [
    String.raw`(?<![\w-])-?(?:ml|mr|pl|pr)-[A-Za-z0-9/.%\[\]()]+(?![A-Za-z0-9/.%\[\]()])`,
    String.raw`(?<![\w-])-?(?:left|right)-[A-Za-z0-9/.%\[\]()]+(?![A-Za-z0-9/.%\[\]()])`,
    String.raw`(?<![\w-])-?translate-x-[A-Za-z0-9/.%\[\]()]+(?![A-Za-z0-9/.%\[\]()])`,
    String.raw`\btext-(?:left|right)\b`,
    String.raw`\bborder-[lr]\b(?:-[A-Za-z0-9/.%\[\]()]+)?`,
    String.raw`\brounded-[lr]\b(?:-[A-Za-z0-9/.%\[\]()]+)?`,
    String.raw`\bfloat-(?:left|right)\b`,
    String.raw`\bflex-row-reverse\b`,
  ].join('|'),
  'g',
);

describe('the three regions, and the order they are laid out in', () => {
  const shell = read(SHELL);

  it('is a top bar, a sidebar and a main content region — and nothing else', () => {
    expect(shell).toMatch(/<Sidebar\s*\/>/);
    expect(shell).toMatch(/<Topbar\s*\/>/);
    expect(shell).toMatch(/<main\b/);
  });

  it('gives each region the landmark element its job names', () => {
    expect(read(SIDEBAR), 'the sidebar is not a complementary landmark').toMatch(/<aside\b/);
    expect(read(TOPBAR), 'the top bar is not a banner landmark').toMatch(/<header\b/);
    expect(shell, 'the content region is not a main landmark').toMatch(/<main\b/);
    expect(shell, 'the shell has no contentinfo landmark').toMatch(/<footer\b/);
  });

  it('lays the top bar above the content, beside the rail', () => {
    // The arrangement the roadmap names — Top Bar → Sidebar + Main Content: the rail is the first
    // region child, and the top bar and the main region share the content column beside it.
    const sidebar = shell.indexOf('<Sidebar');
    const topbar = shell.indexOf('<Topbar');
    const main = shell.indexOf('<main');
    expect(sidebar).toBeGreaterThan(-1);
    expect(topbar).toBeGreaterThan(sidebar);
    expect(main).toBeGreaterThan(topbar);
    // One horizontal flow, with the content column the flexible one.
    expect(shell).toMatch(/flex min-h-screen/);
    expect(shell).toMatch(/flex min-w-0 flex-1 flex-col/);
  });

  it('is the skip link’s target, and the one slot a page renders into', () => {
    expect(shell).toMatch(/href="#workspace-main"/);
    expect(shell).toMatch(/id="workspace-main"/);
    expect(shell, 'the main region is not focusable').toMatch(/tabIndex=\{-1\}/);
    // Every page reaches the frame through the same slot, so the region cannot drift per screen.
    expect(shell).toMatch(/<main[\s\S]*?\{children\}[\s\S]*?<\/main>/);
  });
});

describe('the four widths the shell must survive', () => {
  it('maps the four modes at their declared boundaries', () => {
    expect(SHELL_MODES).toEqual(['desktop', 'laptop', 'tablet', 'mobile']);
    // The widths the roadmap names land where they should: phones are mobile, a 768 or 1024 tablet
    // is a tablet, and only a genuinely wide window is a desktop.
    expect(shellModeFor(375)).toBe('mobile');
    expect(shellModeFor(SHELL_WIDTHS.mobile - 1)).toBe('mobile');
    expect(shellModeFor(SHELL_WIDTHS.mobile)).toBe('tablet');
    expect(shellModeFor(768)).toBe('tablet');
    expect(shellModeFor(1024)).toBe('tablet');
    expect(shellModeFor(SHELL_WIDTHS.tablet)).toBe('laptop');
    expect(shellModeFor(1280)).toBe('desktop');
    expect(shellModeFor(1440)).toBe('desktop');
  });

  it('derives every media query from the same widths, so the hook and the model cannot disagree', () => {
    expect(MOBILE_SHELL_QUERY).toBe(`(max-width: ${SHELL_WIDTHS.mobile - 1}px)`);
    expect(COMPACT_SHELL_QUERY).toBe(`(max-width: ${SHELL_WIDTHS.tablet - 1}px)`);
    expect(WIDE_SHELL_QUERY).toBe(`(min-width: ${SHELL_WIDTHS.desktop}px)`);
    // The tablet boundary is a deliberate step between the ladder's own `md` and `xl`.
    expect(SHELL_WIDTHS.tablet).toBeGreaterThan(breakpointPx('md'));
    expect(SHELL_WIDTHS.tablet).toBeLessThan(breakpointPx('xl'));
    // One reader of those queries — the hook — rather than one per component.
    const hook = read(SHELL_HOOK);
    for (const query of ['MOBILE_SHELL_QUERY', 'COMPACT_SHELL_QUERY', 'WIDE_SHELL_QUERY']) {
      expect(hook).toMatch(new RegExp(`useMediaQuery\\(${query}\\)`));
    }
  });

  it('chooses the rail per mode, and lets a narrow window win over the saved preference', () => {
    // A laptop and a desktop honour the reader's choice...
    expect(railModeFor('desktop', false)).toBe('expanded');
    expect(railModeFor('desktop', true)).toBe('collapsed');
    expect(railModeFor('laptop', false)).toBe('expanded');
    expect(railModeFor('laptop', true)).toBe('collapsed');
    // ...a tablet overrides it, because a 264px rail does not fit...
    expect(railModeFor('tablet', false)).toBe('collapsed');
    expect(railModeFor('tablet', true)).toBe('collapsed');
    // ...and a phone takes the navigation out of the flow entirely.
    expect(railModeFor('mobile', false)).toBe('offcanvas');
    expect(railModeFor('mobile', true)).toBe('offcanvas');
    expect(read(SHELL_HOOK)).toMatch(/railModeFor\(mode, userCollapsed\)/);
  });

  it('states the boundary once, in the model', () => {
    expect(read(SHELL_LAYOUT)).toMatch(/SHELL_WIDTHS = \{/);
    // No region declares its own breakpoint any more: the three files read the mode, they do not
    // compute it.
    for (const file of [SHELL, SIDEBAR, TOPBAR]) {
      expect(read(file), `${file} declares its own breakpoint`).not.toMatch(/max-width:\s*\d+px/);
    }
  });

  it('keeps the collapsed rail navigable: every item keeps its name, and its tooltip', () => {
    const sidebar = read(SIDEBAR);
    // The rail is the same navigation at every width, so an item can still be named once its label
    // is gone, and the grouped headings become dividers rather than disappearing without a trace.
    expect(sidebar).toMatch(/'aria-label': msg\(section\.labelKey\)/);
    expect(sidebar).toMatch(/<Tooltip content=\{msg\(section\.labelKey\)\} side=\{railSide\}>/);
    // The collapse control is rendered only where the rail can be collapsed — never on a tablet,
    // where it is already an icon rail, and never on a phone, where there is no rail.
    expect(sidebar).toMatch(/canCollapse \?/);
    expect(read(SHELL_HOOK)).toMatch(/canCollapse: canCollapseRail\(mode\)/);
  });

  it('keeps the workspace its own width at every one of them', () => {
    // The content column may shrink (`min-w-0`) and the frame caps itself (`max-w-`), so a wide
    // table scrolls inside its own box instead of widening the shell.
    expect(read(SHELL)).toMatch(/min-w-0/);
    expect(read(WORKSPACE)).toMatch(/mx-auto flex w-full max-w-\[\d+px\]/);
    // The rail's two widths are the only fixed widths the shell is allowed, and its motion is a
    // token rather than a number written at the call site.
    const sidebar = read(SIDEBAR);
    expect(sidebar).toMatch(/w-\[76px\]/);
    expect(sidebar).toMatch(/w-\[264px\]/);
    expect(sidebar).toMatch(/duration-\[var\(--duration-base\)\]/);
    expect(sidebar).toMatch(/ease-\[var\(--ease-standard\)\]/);
  });

  it('keeps the density knob a workstation needs', () => {
    // The second layout control after width: the whole shell tightens up for a reader who wants
    // more rows on screen, and the frame is where that decision is spent.
    expect(read(UI_STORE)).toMatch(/density/);
    expect(read(SHELL)).toMatch(/density === 'compact'/);
  });
});

describe('the layout mirrors for Persian', () => {
  const shell = read(SHELL);
  const sidebar = read(SIDEBAR);

  it('puts the rail on the inline-start edge, and divides on the inline-end one', () => {
    // The rail is the shell's first region child, so it follows the flow: left in an English
    // interface, right in a Persian one. The divider is a logical edge, not a physical one.
    expect(shell).toMatch(/\{msg\('shell\.skipToWorkspaceContent'\)\}\s*<\/a>\s*<Sidebar\s*\/>/);
    expect(sidebar).toMatch(/border-e border-border/);
    expect(sidebar).not.toMatch(/\bborder-[lr]\b/);
  });

  it('writes the direction once, and derives the rail’s own geometry from it', () => {
    expect(shell).toMatch(/useDocumentLanguage\(\)/);
    // The tooltip opens away from the rail, whichever side the rail is on.
    expect(sidebar).toMatch(/direction === 'rtl' \? 'left' : 'right'/);
    // The collapse glyph is chosen from the resolved direction, never mirrored with a transform.
    expect(sidebar).toMatch(/<PanelStartIcon/);
  });

  it('introduces no physical direction utility of its own', () => {
    for (const file of [SHELL, SIDEBAR, TOPBAR]) {
      const found = strip(read(file)).match(PHYSICAL_UTILITY) ?? [];
      expect(found, `${file} uses a physical direction utility: ${found.join(', ')}`).toEqual([]);
    }
  });

  it('keeps the rail’s figures isolated inside a mirrored page', () => {
    // The safety readouts are technical values, so they carry `.num`, which pins them left-to-right
    // inside whatever direction the page has.
    expect(sidebar).toMatch(/className="num text-text-muted"/);
  });
});

describe('the navigation is positioned honestly', () => {
  it('lays the rail out in flow: flex for the frame, sticky for the rail and the top bar', () => {
    expect(read(SHELL)).toMatch(/flex min-h-screen/);
    expect(read(SIDEBAR)).toMatch(/sticky top-0 flex h-screen flex-col/);
    expect(read(TOPBAR)).toMatch(/sticky top-0 z-\[var\(--z-shell\)\]/);
  });

  it('takes the navigation out of the flow only to make it off-canvas, on the start edge', () => {
    const sidebar = read(SIDEBAR);
    // The drawer is the one `fixed` surface in the shell, and being off-canvas is its whole point: a
    // rail cannot be out of the flow and in the flow at once. It is drawn from the *logical* start
    // edge, so it arrives from the correct side in either language.
    expect(sidebar).toMatch(/fixed inset-y-0 start-0/);
    expect(sidebar).not.toMatch(/\b(?:left|right)-0\b/);
    // It is a modal surface with the behaviour that word requires, not a panel that happens to be
    // off screen: a dialog, announced as modal, named, and built to hold focus.
    expect(sidebar).toMatch(/role="dialog"/);
    expect(sidebar).toMatch(/aria-modal="true"/);
    expect(sidebar).toMatch(/aria-label=\{msg\('sidebar\.navigationMenu'\)\}/);
    expect(sidebar).toMatch(/tabIndex=\{-1\}/);
  });

  it('opens and closes from the keyboard: Escape closes, and focus is moved and returned', () => {
    const sidebar = read(SIDEBAR);
    // Escape, wherever the focus is inside.
    expect(sidebar).toMatch(/event\.key === 'Escape'/);
    expect(sidebar).toMatch(/document\.addEventListener\('keydown'/);
    // Focus enters the panel on open and returns to what opened it on close.
    expect(sidebar).toMatch(/panelRef\.current\?\.focus\(\)/);
    expect(sidebar).toMatch(/returnFocusRef\.current\?\.focus\(\)/);
    // Tab cycles inside a modal surface rather than wandering onto the page behind it.
    expect(sidebar).toMatch(/event\.key !== 'Tab'/);
  });

  it('gives the scrim a name, so it is not a div no keyboard could reach', () => {
    const sidebar = read(SIDEBAR);
    expect(sidebar).toMatch(
      /<motion\.button[\s\S]*?aria-label=\{msg\('sidebar\.closeNavigation'\)\}/,
    );
    // ...and the shell never hides a layout defect behind a blanket overflow.
    expect(read(SHELL)).not.toMatch(/overflow-(?:x-)?hidden/);
    expect(sidebar).not.toMatch(/overflow-hidden/);
  });

  it('reserves absolute positioning for the two decorations the shell accounts for', () => {
    // Absolute is still only the skip link (visible on focus) and two control decorations — the
    // search glyph and the unread dot. The off-canvas navigation is `fixed`, never `absolute`, so a
    // region is never positioned by a trick.
    const allowed: Record<string, readonly RegExp[]> = {
      [SHELL]: [/focus:absolute/],
      [TOPBAR]: [/absolute inset-y-0 start-2\.5/, /absolute end-1\.5 top-1\.5/],
      [SIDEBAR]: [],
    };
    for (const [file, patterns] of Object.entries(allowed)) {
      const source = read(file);
      const occurrences = source.match(/\babsolute\b/g) ?? [];
      const explained = patterns.reduce(
        (total, pattern) => total + (source.match(pattern) ? 1 : 0),
        0,
      );
      expect(
        occurrences.length,
        `${file} positions something absolutely that the shell did not account for`,
      ).toBe(explained);
    }
  });

  it('keeps the workspace where it is when the navigation opens', () => {
    // The drawer overlays the page rather than pushing it, and the content region's own spacing is
    // a function of `density` alone — so opening the navigation on a phone cannot reflow what is
    // already being read.
    expect(read(SHELL)).toMatch(/density === 'compact' \? 'flex-1 px-4 py-4' : 'flex-1 px-5 py-5'/);
  });
});

describe('the off-canvas navigation is reachable and closes deliberately', () => {
  it('is opened from a top-bar control only the drawer mode renders', () => {
    const topbar = read(TOPBAR);
    expect(topbar).toMatch(/layout\.isDrawer \?/);
    // A disclosure: it names the navigation it controls, and whether that is open.
    expect(topbar).toMatch(/aria-controls="shell-navigation"/);
    expect(topbar).toMatch(/aria-expanded=\{sidebarOpen\}/);
    expect(topbar).toMatch(/msg\('topbar\.openNavigation'\)/);
    // ...and the drawer's navigation carries the id the trigger points at.
    expect(read(SIDEBAR)).toMatch(/id="shell-navigation"/);
  });

  it('closes when a destination is chosen, not only when dismissed', () => {
    // Choosing a page is the most common way out of the drawer, so the store closes it there
    // rather than leaving the navigation covering the page it just opened.
    const store = read(UI_STORE);
    expect(store).toMatch(/setPage: \(page\) => set\(\{ page, sidebarOpen: false \}\)/);
    expect(store).toMatch(/setSidebarOpen: \(sidebarOpen\) => set\(\{ sidebarOpen \}\)/);
    expect(store).toMatch(/toggleSidebarOpen:/);
  });

  it('closes itself when the window leaves the drawer mode', () => {
    // A drawer left open while the window grows would be a state the rail has no way to show.
    expect(read(SHELL)).toMatch(/layout\.mode !== 'mobile' && sidebarOpen/);
    expect(read(SHELL)).toMatch(/setSidebarOpen\(false\)/);
  });
});
