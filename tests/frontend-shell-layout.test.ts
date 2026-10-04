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

import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BREAKPOINTS } from '../web/src/design/tokens.js';
import {
  NAV_SECTIONS,
  extendNavTrail,
  navTrail,
  type NavCrumb,
} from '../web/src/config/navigation.js';
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
    //
    // The rail's collapse control is the one thing a region still has to express as a width, and
    // it is not a concession — it is a *consequence* of the fix that control must exist at the
    // moment the window allows it, rather than a moment after a media query gets around to telling
    // React. So the width is checked against the model rather than waved through: a region may name
    // a boundary, and only a boundary the model declares. Written as `min-[…]`/`max-[…]` as well as
    // `max-width:` because the same rule in a different notation is the same rule, and a guard a
    // region can walk around by changing how it spells its class is not a guard.
    const declared = new Set([SHELL_WIDTHS.tablet - 1, SHELL_WIDTHS.desktop]);
    for (const file of [SHELL, SIDEBAR, TOPBAR]) {
      const source = read(file);
      expect(source, `${file} declares its own breakpoint`).not.toMatch(/max-width:\s*\d+px/);
      for (const match of source.matchAll(/(?:min|max)-\[(\d+)px\]/g)) {
        expect(
          declared.has(Number(match[1])),
          `${file} names ${match[1]}px, which is not a boundary the model declares`,
        ).toBe(true);
      }
    }
  });

  it('keeps the collapsed rail navigable: every item keeps its name, and its tooltip', () => {
    const sidebar = read(SIDEBAR);
    // The rail is the same navigation at every width, so an item can still be named once its label
    // is gone, and the grouped headings become dividers rather than disappearing without a trace.
    expect(sidebar).toMatch(/'aria-label': msg\(section\.labelKey\)/);
    // The tooltip stands in for the label *and* says what the destination holds. Until Phase 8.2.2
    // it repeated the label alone, which told a reader hovering an icon nothing they could not
    // already guess from it.
    expect(sidebar).toMatch(/<Tooltip content=\{entryTooltip\(section\)\} side=\{railSide\}>/);
    expect(sidebar).toMatch(/msg\(section\.descriptionKey\)/);
    // The collapse control is never *offered* where the rail cannot be collapsed — not on a tablet,
    // where it is already an icon rail, and not on a phone, where there is no rail.
    //
    // It used to be asserted as `canCollapse ? … : null`, and that mechanism was the defect: mounting
    // the control conditionally made its existence wait on a media query React is told about
    // whenever the browser gets round to it — measured at ~410ms here — so a window wide enough to
    // honour the reader's rail choice could be showing no way to change it at all. What the case is
    // really about is the guarantee, not the way it was kept, so the guarantee is now stated three
    // ways instead of one, and each is stronger than a `?` that was in the source:
    //
    //   1. it is *withheld* below the model's own boundary, by the same query CSS evaluates;
    //   2. a press is *refused* below that boundary, so nothing can spend the standing preference;
    //   3. and the boundary both of those use is the model's, never a number written beside it.
    expect(sidebar).toMatch(/max-\[\d+px\]:hidden/);
    expect(sidebar).toMatch(/if \(!window\.matchMedia\(COMPACT_SHELL_QUERY\)\.matches\)/);
    expect(sidebar).toMatch(/COMPACT_SHELL_QUERY/);
    expect(read(SHELL_HOOK)).toMatch(/canCollapse: canCollapseRail\(mode\)/);
    // And what that control *says* comes from the catalogue like everything beside it. It was the
    // last accessible name in the chrome written as an English literal, so in a Persian interface the
    // one control that changes the shape of the shell was the one control a reader could not read.
    expect(sidebar).toMatch(
      /label=\{msg\(collapsed \? 'sidebar\.expandSidebar' : 'sidebar\.collapseSidebar'\)\}/,
    );
    expect(sidebar, 'an English name written at the call site').not.toMatch(
      /(?:label|aria-label)=\{[^}]*'[A-Za-z][A-Za-z ]+'/,
    );
  });

  it('keeps the workspace its own width at every one of them', () => {
    // The content column may shrink (`min-w-0`) and the frame caps itself (`max-w-`), so a wide
    // table scrolls inside its own box instead of widening the shell.
    expect(read(SHELL)).toMatch(/min-w-0/);
    // The column's width is the shell model's value rather than a literal in the component, and it
    // caps itself with a `max-w-` so a wide table scrolls inside its own box instead of widening the
    // shell. It is *anchored* to the gutter, not centred in it — see the alignment suite below.
    expect(read(WORKSPACE)).toMatch(/SHELL_COLUMN/);
    expect(read(SHELL_LAYOUT)).toMatch(/SHELL_COLUMN = 'w-full max-w-\[\d+px\]'/);
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
    // Tab cycles inside a modal surface rather than wandering onto the page behind it — and the wrap
    // is asked of the *focus* rather than of the two ends of the panel's own list. It was asked of the
    // ends until Phase 8.3.4, which is a hole rather than a bug in a corner: the panel takes the focus
    // when the drawer opens, and `Shift+Tab` from a container is a move to the previous tabbable thing
    // in the document. Two presses walked the keyboard onto the scrim and then onto the skip link
    // behind a dialog that declares `aria-modal`. The browser case drives it with real keys; this one
    // is what stops the panel-local handler coming back.
    expect(sidebar).toMatch(/event\.key !== 'Tab'/);
    expect(sidebar).toMatch(/panel\.contains\(current\)/);
    expect(sidebar).toMatch(/\(event\.shiftKey \? last : first\)\.focus\(\)/);
    expect(sidebar).not.toMatch(/onKeyDown=\{trapFocus\}/);
  });

  it('gives the scrim a name, and keeps it out of a tab order it cannot show', () => {
    const sidebar = read(SIDEBAR);
    // A control rather than a div with a handler: it is announced, and a pointer has a target that
    // says what it does.
    expect(sidebar).toMatch(
      /<motion\.button[\s\S]*?aria-label=\{msg\('sidebar\.closeNavigation'\)\}/,
    );
    // And it is not a *tab stop*, which is the honest box for a surface that is the whole viewport:
    // measured at 390×844, the ring a keyboard user found on it was drawn 4px outside the window, so
    // the one stop it offered showed nothing at all. The drawer's own ways out are inside the dialog.
    expect(sidebar).toMatch(/<motion\.button[\s\S]*?tabIndex=\{-1\}/);
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
    // already being read. Phase 8.3.1 made the inset the window's (`SHELL_GUTTER`) and left the
    // vertical rhythm as the only thing `density` decides, which is the same claim with one more
    // term in it.
    const shell = read(SHELL);
    const main = shell.slice(shell.indexOf('<main'), shell.indexOf('</main>'));
    // Phase 8.5.2.1 made the rhythm asymmetric — one spacing step tighter above the page's
    // context row (the top bar already carries the section's name), the old step kept below so
    // the run to the footer is unchanged. `pt`/`pb` are how it is stated; the bottom padding is
    // the old `py` value, so the content region's footprint below the page is what it was.
    expect(main).toMatch(
      /cn\('flex-1', SHELL_GUTTER, density === 'compact' \? 'pt-3 pb-4' : 'pt-4 pb-5'\)/,
    );
    // …and no part of the content region answers to the drawer or to the rail's mode.
    expect(main).not.toMatch(/sidebarOpen|layout\.mode|layout\.isDrawer/);
  });
});

/**
 * Phase 8.3.1 — the alignment the three regions share.
 *
 * The phase found the shell with *three* horizontal insets (a width-dependent one in the top bar, a
 * density-dependent one in the workspace, a fixed one in the footer) and a content column that was
 * centred inside its region — so at 1920px the page title sat 197px from the content it named, and
 * collapsing the rail slid that content 94px sideways. Both were measured in a browser before they
 * were changed. These cases hold the two resulting decisions in place, because either of them could
 * be undone by one plausible-looking class.
 */
describe('the shell has one alignment system', () => {
  const GUTTERS = /\bpx-(?:4|5|6|8)\b/;

  it('states the inset once, and starts all three regions from it', () => {
    const model = read(SHELL_LAYOUT);
    expect(model).toMatch(/SHELL_GUTTER = 'px-5'/);
    // Each region names the value rather than repeating it, so the inset cannot drift in one of them.
    expect(read(TOPBAR)).toMatch(/SHELL_GUTTER/);
    expect(read(SHELL)).toMatch(/SHELL_GUTTER/);
    expect(read(WORKSPACE)).toMatch(/SHELL_COLUMN/);
    // And no region writes a gutter of its own: a bare `px-4` beside the constant is how the three
    // values came back the first time.
    for (const file of [SHELL, TOPBAR, WORKSPACE]) {
      expect(read(file), `${file} hardcodes a horizontal gutter`).not.toMatch(GUTTERS);
    }
  });

  it('anchors the column to that inset instead of centring it', () => {
    // Centred, the column re-centres whenever its region widens — which is what moving the rail is —
    // and it only lines up with the title above it while the region is narrower than the column.
    expect(read(WORKSPACE)).not.toMatch(/mx-auto/);
    expect(read(SHELL_LAYOUT)).toMatch(/SHELL_COLUMN/);
  });

  it('leaves the scrollbar to the engine, and hides nothing in its place', () => {
    const css = read('web/src/styles/global.css');
    // The window keeps the width the engine gives it. Reserving a scrollbar column is what would
    // hold the chrome perfectly still, and this phase measured that trade and did not take it: the
    // only declaration that reserves anything here is `overflow-y: scroll`, which takes 10px out of
    // *every* page at laptop widths to stop the chrome moving on the two that do not scroll. The
    // stylesheet's own comment carries the numbers; these are the two ways it could come back.
    // A declaration, not a mention: the comment above the rule names both properties too.
    expect(css).not.toMatch(/^\s*scrollbar-gutter\s*:/m);
    expect(css).not.toMatch(/^\s*overflow-y\s*:\s*scroll/m);
    // The scrollbar is styled once, at the width the shell's measurements are taken against.
    expect(css).toMatch(/::-webkit-scrollbar\s*\{\s*width:\s*10px;/);
    // And no region of the shell hides what it cannot fit, which would be the other way to make a
    // width stop moving: `overflow: hidden` would hide the content that made the page tall.
    for (const file of [SHELL, TOPBAR, SIDEBAR]) {
      expect(read(file), `${file} hides what it cannot fit`).not.toMatch(/overflow-hidden/);
    }
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

/**
 * Phase 8.3.3 — the column's width is the shell's decision, not a section's.
 *
 * The phase asked whether the fourteen sections need different content widths, and the answer is that
 * they do not need different *frames*. Every one of them is a card grid — one to nine `Grid` regions —
 * and a grid's own column count already changes by breakpoint (`1 → 2 → 3/4`), so the density a section
 * needs is expressed **inside** the one frame rather than by narrowing or widening it. What is left to
 * hold is the half that keeps 8.3.1's alignment true for every section: a section may not opt out of
 * the frame, and it may not solve a width it dislikes with a literal.
 *
 * A *named* cap on a paragraph inside a card is a different thing and stays allowed — `max-w-3xl` on
 * the description under a page title is a text measure, not a frame. The rule below is about literals
 * and viewport widths, which is the shape an arbitrary width actually takes.
 */
describe('the width is the shell’s decision', () => {
  /** A width written as a number: the way a page would take the frame's own decision away from it. */
  const WIDTH_LITERAL = /\b(?:max-w-\[|min-w-\[|max-w-screen|w-\[\d)/;

  const pages = (): string[] =>
    readdirSync('web/src/pages')
      .filter((name) => name.endsWith('.tsx'))
      .map((name) => `web/src/pages/${name}`);

  it('gives no section a width of its own', () => {
    const files = pages();
    expect(files.length, 'no sections were inspected').toBeGreaterThan(0);
    for (const file of files) {
      expect(read(file), `${file} writes a width of its own`).not.toMatch(WIDTH_LITERAL);
    }
  });

  it('expresses a section’s density inside that frame, in the grids it renders', () => {
    for (const file of pages()) {
      expect(
        read(file),
        `${file} renders no grid, so its density is not the frame's business`,
      ).toMatch(/<Grid/);
    }
  });
});

/**
 * Phase 8.5.1 — the contextual page header, one implementation for the fourteen sections.
 *
 * Every page already began with the same row — a title, sometimes a description, sometimes
 * actions — drawn inline by the shared `Workspace` frame. This phase names that row: `PageHeader`,
 * one component the frame renders and a page can compose directly. The contract below holds the
 * *one* implementation to the properties the phase demands; the header sits inside the workspace
 * column, so nothing here redraws the shell or touches its geometry.
 */
describe('the contextual page header', () => {
  const PAGE_HEADER = 'web/src/app/PageHeader.tsx';

  const pages = (): string[] =>
    readdirSync('web/src/pages')
      .filter((name) => name.endsWith('.tsx'))
      .map((name) => `web/src/pages/${name}`);

  it('is one implementation, drawn by the frame rather than duplicated by pages', () => {
    const workspace = strip(read(WORKSPACE));
    // The frame names the component rather than inlining the row again — the duplicate-implementation
    // rule is about markup, so the assertion is about markup too.
    expect(workspace).toMatch(/<PageHeader\b/);
    expect(workspace).not.toMatch(/<h2/);
    // And no page draws a page-level header of its own: identity flows through the shared one.
    for (const file of pages()) {
      expect(strip(read(file)), `${file} draws its own page header`).not.toMatch(/<h2/);
    }
  });

  it('keeps every field optional, and draws only what it is given', () => {
    const header = read(PAGE_HEADER);
    // The props the phase names, on the one component that owns them. Every field is optional
    // since the de-duplication pass (8.5.2.1): the shell already states the section's identity,
    // so a header is drawn for the context a page actually has — never a title it invents.
    for (const field of ['title', 'description', 'breadcrumb', 'actions']) {
      expect(header, `PageHeader has no ${field}`).toMatch(new RegExp(`\\b${field}\\??:`));
    }
    // Optional means absent until a page hands the field something: a header with no title draws
    // no heading, no description draws no paragraph, and no actions draws no action row. (The
    // breadcrumb slot renders what it is given — the list's name belongs to the breadcrumb.)
    // Whitespace-tolerant: prettier puts the conditional's `<h2>` on its own line.
    expect(header).toMatch(/title \? \(\s*<h2/);
    expect(header).toMatch(/description \? \(/);
    expect(header).toMatch(/actions \? /);
    expect(header).toMatch(/\{breadcrumb\}/);
  });

  it('stays inside the workspace column, without becoming a second shell or a second scroll', () => {
    const header = strip(read(PAGE_HEADER));
    // A `<header>` landmark is page-level identity, not chrome: no sticky, no fixed, no z-index of
    // its own — those are the shell's regions, and the header is not one.
    expect(header).not.toMatch(/sticky|fixed|\bz-\[/);
    // And it never decides its own width: the column it lives in is the shell's decision (8.3.3),
    // so the header neither writes a width literal nor names the column constant.
    expect(header).not.toMatch(/\b(?:max-w-\[|min-w-\[|max-w-screen|w-\[\d)/);
    expect(header).not.toMatch(/SHELL_COLUMN/);
  });

  it('keeps one identity heading per page, under the top bar’s document heading', () => {
    const header = strip(read(PAGE_HEADER));
    const topbar = strip(read(TOPBAR));
    // The document's `<h1>` is the top bar's; the page's identity is an `<h2>` under it. A second
    // `<h1>` on a page would be two documents claiming the same reader.
    expect(topbar).toMatch(/<h1/);
    expect(header).toMatch(/<h2/);
    expect(header).not.toMatch(/<h1/);
  });

  it('writes the direction with logical properties, and the description as a text measure', () => {
    const header = read(PAGE_HEADER);
    // Wrapping, not hiding: `flex-wrap` is how a long Persian title survives, and no fixed height
    // is declared that the wrap could break against.
    expect(header).toMatch(/flex flex-wrap/);
    expect(header).not.toMatch(/\bh-\[|min-h-\[/);
    expect(strip(header)).not.toMatch(PHYSICAL_UTILITY);
    // The description's cap is the named text measure the width suite already sanctions.
    expect(header).toMatch(/max-w-3xl/);
  });

  it('renders the breadcrumb slot as it is given, without claiming navigation of its own', () => {
    const header = strip(read(PAGE_HEADER));
    // The slot renders the node it is handed and nothing else: the list's name belongs to the
    // breadcrumb component, and the header adds no landmark around it.
    expect(header).toMatch(/\{breadcrumb\}/);
    expect(header).not.toMatch(/<nav/);
    // And the trail's own name lives in both catalogues, on the component that owns the list.
    const breadcrumb = read('web/src/app/Breadcrumb.tsx');
    expect(breadcrumb).toMatch(/aria-label=\{label \?\? msg\('shell\.breadcrumbNav'\)\}/);
    expect(read('web/src/i18n/messages.en.ts')).toMatch(/'shell\.breadcrumbNav'/);
    expect(read('web/src/i18n/messages.fa.ts')).toMatch(/'shell\.breadcrumbNav'/);
  });
});

/**
 * Phase 8.5.2 — the contextual trail, drawn from the model the sidebar is drawn from.
 *
 * The shell is path-less by decision, so a breadcrumb here is *context*, not a route history: the
 * one real hierarchy the product has is the navigation's own group → section, and the trail is
 * derived from that declaration rather than from a second mapping a page could get wrong. The
 * contract below holds the derivation to the model, the component to the semantics, and the frame
 * to the subordination rule (trail above title, title unchanged).
 */
describe('the contextual breadcrumb trail', () => {
  const BREADCRUMB = 'web/src/app/Breadcrumb.tsx';

  const pages = (): string[] =>
    readdirSync('web/src/pages')
      .filter((name) => name.endsWith('.tsx'))
      .map((name) => `web/src/pages/${name}`);

  it('derives every section’s trail from the navigation model, not from a second mapping', () => {
    // The derivation is a function of the declaration the sidebar already renders, so the two
    // cannot disagree: one group crumb ahead of the section's own, for each of the fourteen.
    for (const section of NAV_SECTIONS) {
      const trail = navTrail(section.id);
      expect(trail, `${section.id} drew the wrong trail length`).toHaveLength(2);
      expect(trail[0]?.id, `${section.id} is not preceded by its own group`).toBe(section.group);
      expect(trail[1]?.id, `${section.id} is not the trail's last word`).toBe(section.id);
    }
    // Portfolio and Evaluation are separate architectures: each is the last word of its own trail,
    // and neither appears in the other's.
    const portfolio = navTrail('portfolio').map((crumb) => crumb.id);
    const evaluation = navTrail('evaluation').map((crumb) => crumb.id);
    expect(portfolio).toContain('portfolio');
    expect(portfolio).not.toContain('evaluation');
    expect(evaluation).toContain('evaluation');
    expect(evaluation).not.toContain('portfolio');
  });

  it('makes no crumb navigable while the shell has no parent route', () => {
    // The trail is honest about what exists: a group heading is a place the rail draws, not a
    // destination, and the section crumb is where the reader already is. The day a detail page has
    // a real parent, its own crumb arrives with `navigable: true` — not this one.
    for (const section of NAV_SECTIONS) {
      for (const crumb of navTrail(section.id)) {
        expect(crumb.navigable, `${crumb.id} claims a destination it does not have`).toBe(false);
      }
    }
  });

  it('extends a trail without consuming it, keeping the section ahead of the deeper context', () => {
    // The shape a detail page will hand over: a real parent and a real destination behind it.
    const deeper: readonly NavCrumb[] = [
      { id: 'detail', labelKey: 'shell.group.workspace', navigable: true },
    ];
    const extended = extendNavTrail('portfolio', deeper);
    expect(extended.map((crumb) => crumb.id)).toEqual(['workspace', 'portfolio', 'detail']);
    // And the original trail is untouched: extension composes, it does not mutate.
    expect(navTrail('portfolio')).toHaveLength(2);
  });

  it('is one component, semantic, subordinate, and direction-honest', () => {
    const breadcrumb = strip(read(BREADCRUMB));
    // A labelled ordered list — semantic and readable, but *not* a navigation landmark and not a
    // currency claim: the shell's rail is the one landmark that offers destinations and the one
    // announcer of where the reader is, and a second of either is redundancy the suite refuses.
    expect(breadcrumb).toMatch(/<ol\s+aria-label=/);
    expect(breadcrumb).not.toMatch(/<nav/);
    expect(breadcrumb).not.toMatch(/aria-current/);
    // Navigable is the crumb's property, rendered as a button only when a destination exists.
    expect(breadcrumb).toMatch(/item\.navigable && onNavigate/);
    // The separator is the named next-chevron, which points at the end of the line in either
    // direction — never a transform, never a physical utility.
    expect(breadcrumb).toMatch(/<ForwardIcon/);
    expect(breadcrumb).not.toMatch(PHYSICAL_UTILITY);
    // Subordinate to the title: caption-sized, faint, and it declares no height of its own.
    expect(breadcrumb).toMatch(/text-caption/);
    expect(breadcrumb).not.toMatch(/\bh-\[|min-h-\[/);
    // It wraps rather than hides: no `overflow-hidden` and no breakpoint that removes it.
    expect(breadcrumb).toMatch(/flex-wrap/);
    expect(breadcrumb).not.toMatch(/overflow-hidden/);
    expect(breadcrumb).not.toMatch(/\b(?:sm|md|lg|xl):hidden\b/);
  });

  it('is drawn by the frame inside the header, from the page the store says the reader is on', () => {
    const workspace = strip(read(WORKSPACE));
    // The frame feeds the header's slot: one landmark, inside the header row, not a second row
    // beside it and not a wrapper landmark around it.
    expect(workspace).toMatch(/breadcrumb=\{breadcrumb \?\? <WorkspaceBreadcrumb/);
    expect(workspace).toMatch(/navTrail\(page\)/);
    expect(workspace).toMatch(/useUiStore/);
    // And no page renders the breadcrumb component directly, which is how a second hierarchy
    // would start: the trail is the frame's, inherited.
    for (const file of pages()) {
      expect(strip(read(file)), `${file} draws its own breadcrumb`).not.toMatch(/<Breadcrumb/);
    }
  });

  it('names the landmark in both catalogues, and no page duplicates the trail', () => {
    const english = read('web/src/i18n/messages.en.ts');
    const persian = read('web/src/i18n/messages.fa.ts');
    expect(english).toMatch(/'shell\.breadcrumbNav': 'Breadcrumb'/);
    expect(persian).toMatch(/'shell\.breadcrumbNav': 'مسیر صفحه'/);
  });
});

/**
 * Phase 8.5.3 — the page's contextual actions, laid out in one shared row.
 *
 * The header's `actions` slot has existed since 8.5.1, and nine of the fourteen sections already put
 * something in it — status chips, and on four of them a real page-level operation. This phase does
 * not invent a second system for them: it names the row (`PageActions`), states its behaviour once
 * (wrapping, no geometry of its own, no control of its own), and holds the pages to handing it
 * children rather than re-deciding how a row of controls sits. What the slot *contains* stays the
 * pages' audit, which the browser suite verifies against the rendered result.
 */
describe('the page’s contextual actions', () => {
  const PAGE_ACTIONS = 'web/src/app/PageActions.tsx';
  const PAGE_HEADER = 'web/src/app/PageHeader.tsx';

  const pages = (): string[] =>
    readdirSync('web/src/pages')
      .filter((name) => name.endsWith('.tsx'))
      .map((name) => `web/src/pages/${name}`);

  it('is one row, drawn by the header, and no page lays out its own', () => {
    const header = strip(read(PAGE_HEADER));
    // The header renders the row rather than inlining one, which is what keeps a page's controls
    // and the row that holds them from drifting apart.
    expect(header).toMatch(/<PageActions>/);
    expect(header).not.toMatch(/flex flex-wrap items-center gap-2/);
    // And no page re-implements it: the pages hand children to the slot, they do not decide how a
    // row of actions sits.
    for (const file of pages()) {
      const source = strip(read(file));
      expect(source, `${file} draws its own action row`).not.toMatch(/<PageActions/);
      expect(source, `${file} repeats the action row’s own class list`).not.toMatch(
        /flex min-w-0 flex-wrap items-center gap-2/,
      );
    }
  });

  it('wraps instead of overflowing, and declares no geometry or control of its own', () => {
    const actions = strip(read(PAGE_ACTIONS));
    // The hook the browser suite finds the row by, rather than a div guessed from its class list.
    expect(actions).toMatch(/data-page-actions/);
    // Wrapping with a zero minimum is the mobile behaviour: it stacks rather than overflowing, and
    // there is no breakpoint at which the row is hidden.
    expect(actions).toMatch(/flex min-w-0 flex-wrap items-center gap-2/);
    expect(actions).not.toMatch(/\b(?:sm|md|lg|xl):hidden\b/);
    // No geometry of its own to break against text it did not expect: no fixed or arbitrary size,
    // no absolute positioning, no clipping, and no negative margin.
    expect(actions).not.toMatch(/\b(?:h|w|min-w|max-w|min-h)-\[/);
    // `min-w-0` is the one width-ish utility the row is allowed (it is what lets it shrink), so the
    // numeric-width check is made against the row with that single class set aside.
    expect(actions.replace(/min-w-0/g, '')).not.toMatch(/\bw-\d/);
    expect(actions).not.toMatch(/overflow-hidden|-m[tblrxy]-/);
    expect(actions).not.toMatch(/\b(?:absolute|sticky|fixed)\b/);
    expect(actions).not.toMatch(PHYSICAL_UTILITY);
    // And it introduces no control of its own: the buttons and chips come from the design system,
    // so a page's hierarchy is the page's choice and only the arrangement is shared.
    expect(actions).not.toMatch(/<Button|<button|<Badge/);
  });

  it('leaves no icon-only control in a page unnamed', () => {
    // The design system already requires a name for an icon-only button (`IconButton`'s `label`);
    // this holds the pages to it, in the vocabulary they use for their contextual actions.
    for (const file of pages()) {
      const source = read(file);
      const tagPattern = /<IconButton\b([^>]*)>/g;
      let tag: RegExpExecArray | null;
      while ((tag = tagPattern.exec(source)) !== null) {
        expect(tag[1], `${file} has an icon-only control with no accessible name`).toMatch(
          /\blabel=/,
        );
      }
    }
  });

  it('pins the context to the row’s top, so a tall row of actions cannot drag it down', () => {
    // The header row aligns the actions to its end (they sat on the context block's baseline when a
    // page drew a title). The context block itself is `self-start`: the row is only as tall as its
    // tallest item, so without this a section with actions pushes the trail further from the top bar
    // than a section without — which is exactly what the browser case caught, 19px of it on the
    // dashboard.
    const header = strip(read(PAGE_HEADER));
    expect(header).toMatch(/min-w-0 self-start/);
    expect(header).toMatch(/flex flex-wrap items-end justify-between/);
  });

  it('composes the page’s own controls, not a second button vocabulary', () => {
    // The pages' contextual rows are built from the same `Button`/`Badge`/`Tooltip` the rest of the
    // product uses — nothing in the app layer introduces a control, and `PageActions` names none.
    const actions = strip(read(PAGE_ACTIONS));
    expect(actions).not.toMatch(/variant=|size=|IconButton|Button\b/);
    expect(read(PAGE_HEADER)).toMatch(/import \{ PageActions \} from '\.\/PageActions'/);
  });
});
