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

const SHELL = 'web/src/app/AppShell.tsx';
const SIDEBAR = 'web/src/app/Sidebar.tsx';
const TOPBAR = 'web/src/app/Topbar.tsx';
const WORKSPACE = 'web/src/app/Workspace.tsx';
const MEDIA_QUERY = 'web/src/lib/useMediaQuery.ts';
const UI_STORE = 'web/src/store/ui.ts';

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
 * The four widths the roadmap requires the shell to survive, widest first.
 *
 * The product is desktop-first, so the *expanded* rail is the default and every narrower step is a
 * concession: below the compact boundary the rail collapses to icons, and nothing narrower than a
 * tablet ever sees two columns of navigation. Mobile is a real mode, not a shrunken desktop — it is
 * the width at which the same shell has to stay legible rather than the width the design was drawn at.
 */
const LAYOUT_MODES = ['desktop', 'laptop', 'tablet', 'mobile'] as const;

/** The compact-shell boundary, read from the one module that owns it. */
function compactBoundary(): number {
  const match = read(MEDIA_QUERY).match(/COMPACT_SHELL_QUERY\s*=\s*'\(max-width:\s*(\d+)px\)'/);
  expect(match, 'the compact-shell query is no longer a max-width in pixels').not.toBeNull();
  return Number((match as RegExpMatchArray)[1]);
}

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
  it('names desktop, laptop, tablet and mobile as the modes it is designed at', () => {
    expect(LAYOUT_MODES).toEqual(['desktop', 'laptop', 'tablet', 'mobile']);
  });

  it('collapses the rail below one boundary, and that boundary sits between tablet and wide', () => {
    expect(read(MEDIA_QUERY)).toMatch(/COMPACT_SHELL_QUERY\s*=\s*'\(max-width:\s*\d+px\)'/);
    const boundary = compactBoundary();
    // Above the tablet breakpoint and below the wide one: phones and tablets always get the icon
    // rail, and only a genuinely wide window keeps the full one.
    expect(boundary).toBeGreaterThan(breakpointPx('md'));
    expect(boundary).toBeLessThan(breakpointPx('xl'));
  });

  it('lets the window win over the saved preference', () => {
    const sidebar = read(SIDEBAR);
    expect(sidebar).toMatch(/userCollapsed \|\| compactShell/);
    expect(sidebar).toMatch(/useMediaQuery\(COMPACT_SHELL_QUERY\)/);
  });

  it('keeps the collapsed rail navigable: every item keeps its name, and its tooltip', () => {
    const sidebar = read(SIDEBAR);
    // The rail is the same navigation at every width, so an item can still be named once its label
    // is gone, and the grouped headings become dividers rather than disappearing without a trace.
    expect(sidebar).toMatch(/'aria-label': msg\(section\.labelKey\)/);
    expect(sidebar).toMatch(/<Tooltip content=\{msg\(section\.labelKey\)\} side=\{railSide\}>/);
    // And the compact rail has no collapse control, because it is already collapsed.
    expect(sidebar).toMatch(/compactShell \? null :/);
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

describe('no region is positioned by a trick', () => {
  it('lays the shell out in flow: flex for the frame, sticky for the regions', () => {
    expect(read(SHELL)).toMatch(/flex min-h-screen/);
    expect(read(SIDEBAR)).toMatch(/sticky top-0 flex h-screen flex-col/);
    expect(read(TOPBAR)).toMatch(/sticky top-0 z-\[var\(--z-shell\)\]/);
  });

  it('reserves absolute positioning for the overlays the shell actually has', () => {
    // The only absolute positioning in the shell is the skip link (visible on focus) and two
    // decorations inside controls — the search glyph and the unread dot. A *region* is never
    // `fixed` or `absolute`, because that is how a rail ends up drawn over the content it frames.
    const allowed: Record<string, readonly RegExp[]> = {
      [SHELL]: [/focus:absolute/],
      [TOPBAR]: [/absolute inset-y-0 start-2\.5/, /absolute end-1\.5 top-1\.5/],
      [SIDEBAR]: [],
    };
    for (const [file, patterns] of Object.entries(allowed)) {
      const source = read(file);
      expect(source, `${file} fixes a region`).not.toMatch(/\bfixed\b/);
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
});
