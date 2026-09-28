/**
 * Phase 8.3.2 — the workspace's content surface, held to its own contract.
 *
 * 8.3.1 made the three regions agree on one inset. This phase asks the question underneath that one:
 * **which box scrolls**, because every spacing rule in the shell is measured against it. The answer
 * is the window. The shell around it is chrome — a sticky top bar and a sticky, viewport-tall rail —
 * and the content region between them is a landmark a page renders into rather than a container with
 * a height of its own, so a section is never a second surface with a scrollbar of its own.
 *
 * Three things follow from that, and each has a case here:
 *
 *   - **One surface, and named exceptions.** A nested scroll box takes the reader's place in the page
 *     away from them: the wheel stops moving the page, and the bar they were aiming at is not the one
 *     that moves. The six that exist are surfaces that genuinely *are* their own place — the rail's
 *     entries, the palette's results, a dialog's body, and so on — and they are listed by name so a
 *     seventh has to be argued for rather than added.
 *   - **A section begins at its own origin.** The reader used to be left wherever the previous
 *     section's offset landed in the new one, so the shortest section in the product opened at its own
 *     foot with its title off screen.
 *   - **A state is not a layout.** Loading, empty and failure are the design system's own plates
 *     inside the same column, and the loading placeholder is shaped like what is coming, so a section
 *     changing state cannot resize the surface.
 *
 * Read from the source, so it runs offline. The half only a layout engine can answer — where the
 * reader actually ends up, and whether the surface ever overflows or takes a wrong width *while* the
 * rail or the section is moving — is measured in `tests/browser/e2e.test.ts`.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SHELL = 'web/src/app/AppShell.tsx';
const SURFACE = 'web/src/app/contentSurface.tsx';
const TOPBAR = 'web/src/app/Topbar.tsx';
const SIDEBAR = 'web/src/app/Sidebar.tsx';
const CSS = 'web/src/styles/global.css';
const LOADING = 'web/src/components/LoadingState.tsx';
const EMPTY = 'web/src/components/EmptyState.tsx';
const ERROR = 'web/src/components/ErrorState.tsx';
const CHART_FRAME = 'web/src/components/charts/ChartFrame.tsx';
const TRADE_TABLE = 'web/src/components/journal/TradeTable.tsx';

const read = (path: string): string => readFileSync(path, 'utf8');

/** Every TypeScript source under a directory, so a rule can be checked against the whole tree. */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** A class that makes its element a scroll box: the surface may not have one. */
const SCROLL_BOX = /\boverflow-(?:[xy]-)?(?:auto|scroll|hidden)\b/;

/** A class that makes its element a *scrolling* box, in either axis. */
const NESTED_SCROLL = /\boverflow-(?:[xy]-)?(?:auto|scroll)\b/;

/**
 * Where a nested scroll box is allowed, and why each one is its own place.
 *
 * The shell's own regions are absent on purpose: the window scrolls, and nothing between the top bar
 * and the footer may take that away. Every entry is named rather than pattern-matched, so this map is
 * also the list a new nested scroller has to justify itself against.
 */
const NESTED_SCROLLS: ReadonlyMap<string, string> = new Map([
  ['web/src/app/Sidebar.tsx', 'the rail’s fourteen entries, inside a viewport-tall rail'],
  ['web/src/app/QuickNav.tsx', 'the palette’s results, inside a dialog'],
  ['web/src/components/Modal.tsx', 'a dialog’s body, bounded by its own `max-h`'],
  [
    'web/src/components/journal/FullscreenChartViewer.tsx',
    'the full-screen viewer’s whole surface',
  ],
  ['web/src/components/journal/TradeTable.tsx', 'one trade’s detail, bounded by its own `max-h`'],
  ['web/src/components/realtime/AgentActivityFeed.tsx', 'a bounded activity feed'],
  ['web/src/components/Table.tsx', 'a dense table’s own horizontal box'],
  ['web/src/components/Tabs.tsx', 'a tab strip that may be wider than its column'],
]);

describe('the window is the one content surface', () => {
  it('gives no region of the shell a scroll box of its own', () => {
    const shell = read(SHELL);
    const main = shell.slice(shell.indexOf('<main'), shell.indexOf('</main>'));
    expect(main, 'the content region could not be found').not.toBe('');

    // No overflow and no height of its own: the region grows with its section and the document
    // scrolls, which is what makes the rail's `sticky top-0` and the top bar's sticky rule mean
    // anything at all.
    expect(main, 'the content region is a scroll box').not.toMatch(SCROLL_BOX);
    expect(main, 'the content region has a height of its own').not.toMatch(
      /\b(?:h-screen|max-h-|h-\[|min-h-\[)/,
    );

    // Nor does the chrome around it, which is a bar rather than a pane.
    expect(read(TOPBAR), 'the top bar is a scroll box').not.toMatch(SCROLL_BOX);
    const footer = shell.slice(shell.indexOf('<footer'), shell.indexOf('</footer>'));
    expect(footer, 'the footer is a scroll box').not.toMatch(SCROLL_BOX);
  });

  it('keeps the surface at least as tall as the window, so a short section fills it', () => {
    const shell = read(SHELL);

    // `min-h-screen` on the root and `flex-1` on the content region are the pair that decides this:
    // a section with less content than a screen still draws a full-height surface, so the footer sits
    // at the window's bottom edge instead of halfway up it and no section has to grow a scrollbar of
    // its own to fill the difference.
    expect(shell).toMatch(/className="flex min-h-screen"/);
    expect(shell).toMatch(/flex min-w-0 flex-1 flex-col/);

    // The rail is the one region that is deliberately a viewport tall — and *sticky* rather than
    // fixed, so the document keeps owning the scroll.
    expect(read(SIDEBAR)).toMatch(/'sticky top-0 flex h-screen flex-col/);

    // And no section may bring a surface of its own: a page that fixed its own height would be a
    // second scroll box wearing the first one's clothes.
    for (const page of sources('web/src/pages')) {
      expect(read(page), `${page} sets a height on the surface`).not.toMatch(
        /\b(?:min-h-screen|h-screen|min-h-\[|h-\[calc)/,
      );
    }
  });
});

describe('a section begins at its own origin', () => {
  it('states the rule once, in the module that owns the surface', () => {
    const surface = read(SURFACE);

    expect(surface).toMatch(/scrollTo\(0, 0\)/);
    // Instant, never smooth: a section change is a new page rather than a scroll, and an animation
    // across a whole section's height is the unnecessary animation this phase may not add.
    expect(surface).not.toMatch(/behavior:\s*['"]smooth['"]/);
    expect(read(CSS), 'the stylesheet re-enables smooth scrolling').not.toMatch(/scroll-behavior/);
  });

  it('mounts the reset inside the keyed section, so it lands with the arriving one', () => {
    const shell = read(SHELL);
    const surface = shell.indexOf('<motion.div');
    const origin = shell.indexOf('<SectionOrigin />');
    const children = shell.indexOf('{children}');

    expect(surface, 'the shell has no keyed surface').toBeGreaterThan(-1);
    expect(origin, 'the origin reset is not inside the shell’s surface').toBeGreaterThan(surface);
    expect(origin, 'the origin reset runs after the page’s own children').toBeLessThan(children);

    // The shell itself never moves the surface. Keyed on `page` it would run while the outgoing
    // section was still on screen — scrolling the reader to the top of the page they are leaving —
    // which is why the reset belongs to the section that is arriving.
    expect(shell, 'the shell moves the surface itself').not.toMatch(
      /scrollTo|scrollIntoView|resetContentOrigin\(/,
    );

    // Once per section, on mount, rather than once per render.
    expect(read(SURFACE)).toMatch(
      /useLayoutEffect\(\(\) => \{\s*resetContentOrigin\(window\);\s*\}, \[\]\)/,
    );
  });

  it('keeps the interface’s only window scroll in that one module', () => {
    const scrolling = sources('web/src').filter((file) =>
      /\.scrollTo\(|\.scrollIntoView\(|\.scrollTop\b/.test(read(file)),
    );

    // One home for it, the way the History API has one: a second call site is how a product ends up
    // with a scroll that two components each believe they own.
    expect(scrolling).toEqual([SURFACE]);
  });
});

describe('one scroll box inside a surface, and the exceptions are named', () => {
  it('allows a nested scroller only where the product says it is its own place', () => {
    const found = new Set(sources('web/src').filter((file) => NESTED_SCROLL.test(read(file))));

    expect(
      [...found].filter((file) => !NESTED_SCROLLS.has(file)),
      'a scroll box the shell does not name',
    ).toEqual([]);

    // And a permission that no longer stands for a scroll box behind it is a permission to argue for
    // again, so the list cannot quietly grow stale.
    expect(
      [...NESTED_SCROLLS.keys()].filter((file) => !found.has(file)),
      'a named exception that no longer scrolls',
    ).toEqual([]);
  });
});

describe('a state change is not a layout change', () => {
  it('draws every state on a plate the design system already owns', () => {
    expect(read(LOADING), 'the loading state is not a card').toMatch(/<Card/);
    expect(read(EMPTY), 'the empty state is not a card').toMatch(/<Card/);
    expect(read(ERROR), 'the failure state is not the feedback primitive').toMatch(/<Alert/);
  });

  it('gives no state a width of its own, so a state cannot resize the surface', () => {
    for (const [name, path] of [
      ['LoadingState', LOADING],
      ['EmptyState', EMPTY],
      ['ErrorState', ERROR],
    ] as const) {
      const source = read(path);
      // A state that measured itself would drag the column with it: the surface's width belongs to
      // the shell's frame, and a state only fills it.
      expect(source, `${name} sets its own width`).not.toMatch(/\b(?:w|min-w|max-w)-\[/);
      expect(source, `${name} sizes itself to the viewport`).not.toMatch(/\bw-screen\b/);
    }
  });

  it('shapes the loading placeholder like what is coming', () => {
    const loading = read(LOADING);

    // A list, a table and a chart panel each get a placeholder of their own shape, which is what
    // bounds how far the surface can move when the data lands — the alternative is a spinner, where
    // the page jumps by whatever the content turns out to be.
    expect(loading).toMatch(/shape\?: 'list' \| 'chart' \| 'table'/);
    expect(loading).toMatch(/shape === 'chart'[\s\S]{0,160}<Skeleton shape="block"/);
    expect(loading).toMatch(/shape === 'table'[\s\S]{0,240}Array\.from/);

    // The three states a reading surface has are used by the chart panel and the trade table too,
    // rather than each surface growing a vocabulary of its own.
    expect(read(CHART_FRAME)).toMatch(/<LoadingState/);
    expect(read(TRADE_TABLE)).toMatch(/<LoadingState/);
  });
});
