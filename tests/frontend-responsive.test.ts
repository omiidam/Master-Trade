/**
 * Every product screen, at every width — the Phase 5.9 responsive and interface-state matrix.
 *
 * Two existing suites assert responsivity for the surfaces they own
 * (`frontend-evaluation.test.ts`, `brand.test.ts`). This one asserts it for the *product*: all
 * fourteen pages and the shell, against the same rules, so a screen added later cannot quietly
 * ship without them. The properties are structural, which is what makes them checkable from the
 * source rather than from a browser:
 *
 *   1. **One frame.** Every page renders inside the shared `Workspace`, and the frame caps its own
 *      width with `max-w-` rather than a fixed width. A page that built its own container would
 *      be the one that scrolled sideways on a phone.
 *   2. **Mobile-first grids.** Every grid starts at one column and widens at a breakpoint, and no
 *      screen starts at three columns. Two chips fit at 320px; three do not.
 *   3. **Nothing widens the page.** Every table with a minimum width sits inside a container that
 *      scrolls *itself*, and the only fixed pixel widths left in the tree are the acknowledged
 *      ones below — each with the reason it cannot push the page.
 *   4. **The shell earns the narrow screen.** The rail collapses below the tablet breakpoint
 *      regardless of the saved preference, and the content column carries `min-w-0` so a wide
 *      child scrolls rather than stretching the flex parent.
 *   5. **Every screen owes its states.** A screen that reads a domain store renders a loading, an
 *      empty and an error state; every other screen reaches at least one shared state component,
 *      because a silent blank pane is the failure this phase exists to prevent.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_PAGE_IDS, NAV_SECTIONS } from '../web/src/config/navigation.js';

const read = (path: string): string => readFileSync(path, 'utf8');

/** Every `.tsx` under `web/src`, so a new file is covered the day it is added. */
function walk(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...walk(path));
    else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) found.push(path);
  }
  return found;
}

const WEB_SOURCE = walk('web/src').map((path) => path.split('\\').join('/'));
const PAGES = WEB_SOURCE.filter((path) => path.startsWith('web/src/pages/')).sort();
const PAGE_NAMES = PAGES.map((path) => path.split('/').pop() ?? '');

/**
 * The tables that must scroll inside their own container.
 *
 * Each one is a tabular surface with a minimum width: the alternative on a phone is a column of
 * unreadable cells or a page that scrolls sideways. `overflow-x-auto` on the ancestor is the
 * third option, and it is the one the product takes.
 */
const SCROLLING_TABLES: Readonly<Record<string, string>> = {
  'web/src/components/decisions/EvaluationPanels.tsx': 'the expected-versus-actual table',
  'web/src/components/journal/TradeTable.tsx': 'the trade log table',
  'web/src/components/portfolio/HoldingsTable.tsx': 'the holdings table',
  'web/src/components/usage/SubscriptionPlanCard.tsx': 'the plan comparison table',
};

/**
 * The fixed pixel widths that remain, and why none of them can make the page scroll.
 *
 * This map is an allow-list rather than a pattern on purpose: a *new* fixed width anywhere in the
 * tree fails the suite, so the cost of adding one is deciding whether it is legitimate. A
 * `max-w-` is not in here because it is a cap, not a width, and is checked separately.
 */
const DECORATIVE_FIXED_WIDTHS: Readonly<Record<string, string>> = {
  'web/src/app/Sidebar.tsx':
    'the rail; it collapses to the icon width below the compact-shell query, whatever the saved preference',
  'web/src/components/journal/PerformanceChart.tsx': 'a positioned tooltip, not laid-out content',
  'web/src/components/journal/ScreenshotGallery.tsx':
    'a fixed-size thumbnail inside a wrapping row',
  'web/src/components/journal/TradeFilters.tsx':
    'a minimum for a field that carries flex-1 and wraps with its siblings',
  'web/src/components/journal/TradeRow.tsx': 'a 2px accent bar',
  'web/src/components/journal/TradeTimeline.tsx': 'a 27px marker dot',
  'web/src/components/quality/ProvenanceIndicator.tsx':
    'a popover; 18rem fits the narrowest supported viewport',
};

/** A fixed width: `w-[12rem]` or `min-w-[12rem]`, but never a `max-w-` cap. */
const FIXED_WIDTH = /(?<!max-)w-\[[0-9]+(?:px|rem)\]/g;

/**
 * Placeholder surfaces, whose grids lay out shapes rather than content.
 *
 * A row of four skeleton bars has no text to become unreadable at 320px and no minimum width to
 * overflow, so the mobile-first grid rule does not apply to it. The exemption is by file *and* by
 * child — the assertion below requires such a grid to contain nothing but bars — so a real
 * content grid cannot hide behind this allowance.
 */
const PLACEHOLDER_SURFACES: Readonly<Record<string, string>> = {
  'web/src/components/LoadingState.tsx':
    'a skeleton; its four-bar row mirrors the stat row it stands in for',
};

/**
 * The state vocabulary the product renders.
 *
 * Domain states count: `UsageEmptyState` and `InsufficientCreditsState` are empty states with a
 * subject, and `InterfaceStatesPanel` renders all three real states. Excluding them would fail a
 * screen for being specific about its own emptiness.
 */
const STATE_COMPONENT =
  /<(Skeleton|SkeletonCard|SkeletonText|LoadingState|EmptyState|UsageEmptyState|InsufficientCreditsState|ErrorState|RetryState|NotFoundState|UnavailableState|InterfaceStatesPanel|Missing[A-Za-z]*|NotDeclared[A-Za-z]*)/;

/** A page that reads a stored domain, and therefore owes all three states. */
const DOMAIN_STORE = /use(Portfolio|Profile|Usage|Decisions|Capabilities|Quality)Store/;

describe('the shared responsive frame', () => {
  it('renders every page inside one frame', () => {
    for (const path of PAGES) {
      const source = read(path);
      // One frame for all of them, so the page-level breakpoints cannot drift apart.
      expect(source, path).toMatch(/<Workspace\b/);
    }
  });

  it('caps the frame width instead of fixing it, and lets the header wrap', () => {
    const workspace = read('web/src/app/Workspace.tsx');
    // `max-w-` is a cap: below it the frame is fluid. A fixed `w-` would be a container that
    // overflows the moment the viewport is narrower than the number.
    expect(workspace).toMatch(/max-w-\[[0-9]+px\]/);
    expect(workspace).toMatch(/mx-auto flex w-full/);
    expect(workspace).toMatch(/flex-wrap/);
    // And the frame itself declares no fixed pixel width outside a cap.
    const fixed = workspace.match(FIXED_WIDTH) ?? [];
    expect(
      fixed.filter((match) => !workspace.includes(`max-${match}`)),
      'the frame fixes its own width',
    ).toEqual([]);
  });

  it('starts every grid at one column and widens it at a breakpoint', () => {
    const workspace = read('web/src/app/Workspace.tsx');
    // The shared grid is where the mobile-first rule lives, so every page inherits it.
    for (const columns of ['2', '3', '4']) {
      const declaration = new RegExp(`columns === ${columns} && '([^']+)'`);
      const match = workspace.match(declaration);
      expect(match, `Grid has no layout for ${columns} columns`).not.toBeNull();
      const classes = match?.[1] ?? '';
      expect(classes, `${columns} columns`).toMatch(/grid-cols-1\b/);
      expect(classes, `${columns} columns never widens`).toMatch(/(sm|md|lg|xl):grid-cols-/);
    }
  });

  it('keeps a page from stretching its own column', () => {
    const shell = read('web/src/app/AppShell.tsx');
    // Without `min-w-0` a flex child refuses to shrink below its content, which is how a wide
    // table ends up pushing the whole application sideways.
    expect(shell).toMatch(/min-w-0/);
    // And the shell never fixes the viewport width itself.
    expect(shell.match(FIXED_WIDTH) ?? []).toEqual([]);
  });
});

describe('navigation on the narrowest screen', () => {
  it('collapses the rail below the tablet breakpoint, whatever the saved preference', () => {
    const sidebar = read('web/src/app/Sidebar.tsx');
    const mediaQuery = read('web/src/lib/useMediaQuery.ts');

    // The rail's width is driven by `userCollapsed || compactShell`, so a narrow viewport wins.
    expect(sidebar).toMatch(/userCollapsed \|\| compactShell/);
    expect(sidebar).toMatch(/useMediaQuery\(COMPACT_SHELL_QUERY\)/);
    // The compact query is a max-width, so it describes the screens that need it.
    expect(mediaQuery).toMatch(/COMPACT_SHELL_QUERY\s*=\s*'\(max-width:\s*\d+px\)'/);
  });

  it('hides the collapse control where there is nothing to collapse to', () => {
    const sidebar = read('web/src/app/Sidebar.tsx');
    // In compact mode the rail is already an icon rail and the toggle is not rendered, so a
    // pointer-sized control never becomes the only way to read the navigation.
    expect(sidebar).toMatch(/compactShell \? null :/);
    expect(sidebar).toContain('aria-label');
  });

  it('marks the collapsed brand correctly for a screen reader', () => {
    const brand = read('web/src/components/brand/BrandMark.tsx');
    // Decorative by default — the wordmark beside it already names the product — and labelled
    // exactly when the mark is the only thing identifying it, which is the collapsed rail.
    expect(brand).toMatch(/alt: ''/);
    expect(brand).toMatch(/'aria-hidden': true/);
    expect(brand).toMatch(/alt: label/);
    // And the lockup supplies the name at the one size where the wordmark is gone.
    expect(brand).toMatch(/markOnly \? \{ label: msg\('brand\.masterTrade'\) \}/);
  });
});

describe('no surface can make the page scroll sideways', () => {
  it('scrolls every wide table inside its own container', () => {
    // The container is the shared table's now rather than each table's own, which is the point of
    // Section 7.3: one place decides that a dense table scrolls sideways inside its own box. So the
    // assertion follows the indirection — every wide table is rendered through `Table` with a
    // minimum width, and `Table` is the thing that supplies the container and applies it.
    const shared = read('web/src/components/Table.tsx');
    expect(shared, 'the shared table supplies no scroll container').toContain('overflow-x-auto');
    expect(shared, 'the shared table applies no minimum width').toMatch(
      /minWidth: `\$\{minWidth\}px`/,
    );
    // And the container is the table's own wrapper, so the minimum width cannot reach the page.
    const containerAt = shared.indexOf('overflow-x-auto');
    const minWidthAt = shared.indexOf('minWidth: `');
    expect(containerAt).toBeLessThan(minWidthAt);

    for (const [path, what] of Object.entries(SCROLLING_TABLES)) {
      const source = read(path);
      expect(source, `${path} (${what}) does not use the shared table`).toMatch(/<Table\b/);
      expect(source, `${path} (${what}) declares no minimum width to contain`).toMatch(
        /minWidth=\{\d+\}/,
      );
    }
  });

  it('leaves no fixed pixel width anywhere it has not been acknowledged', () => {
    const acknowledged = new Set([
      ...Object.keys(SCROLLING_TABLES),
      ...Object.keys(DECORATIVE_FIXED_WIDTHS),
    ]);

    for (const path of WEB_SOURCE) {
      const source = read(path);
      FIXED_WIDTH.lastIndex = 0;
      const matches = source.match(FIXED_WIDTH) ?? [];
      if (matches.length === 0) continue;
      expect(acknowledged.has(path), `${path} fixes a width: ${matches.join(', ')}`).toBe(true);
    }
  });

  it('never starts a content grid at more than two columns on the narrowest screen', () => {
    for (const path of WEB_SOURCE) {
      const source = read(path);
      // An unqualified three-column grid of *content* is the classic phone-width overflow.
      const unconditional = source.match(/(?<!:)grid-cols-(3|4|5|6)\b/g) ?? [];
      if (unconditional.length === 0) continue;
      expect(
        PLACEHOLDER_SURFACES[path],
        `${path} starts at ${unconditional.join(', ')}`,
      ).toBeDefined();
    }
  });

  it('keeps a placeholder grid to shapes, so nothing behind it can read as data', () => {
    const entries = Object.keys(PLACEHOLDER_SURFACES);
    expect(entries.length).toBeGreaterThan(0);

    for (const path of entries) {
      const source = read(path);
      const grids = [...source.matchAll(/grid-cols-(3|4|5|6)/g)];
      expect(grids.length, `${path} has no wide grid to justify its exemption`).toBeGreaterThan(0);

      for (const grid of grids) {
        const block = source.slice(grid.index ?? 0, (grid.index ?? 0) + 400);
        // The row holds bars, so it can narrow without becoming unreadable.
        expect(block, path).toContain('<Skeleton');
        // And no prose is rendered inside it, so the exemption cannot hide a content grid.
        expect(block, `${path} renders text inside a placeholder grid`).not.toMatch(
          />\s*[A-Z][a-z]+[^<]*</,
        );
      }
    }
  });

  it('widens every page-level two-column grid at a breakpoint', () => {
    // Scoped to pages: two columns is a perfectly good mobile layout for a pair of small facts
    // in a card, but a *page* that is two columns at every width is a page with no tablet layout.
    for (const path of PAGES) {
      const source = read(path);
      if (!/(?<!:)grid-cols-2\b/.test(source)) continue;
      expect(source, `${path} keeps two columns at every width`).toMatch(
        /(sm|md|lg|xl):grid-cols-/,
      );
    }
  });

  it('never hangs a click handler on a bare div', () => {
    for (const path of WEB_SOURCE) {
      const source = read(path);
      // A div with a handler is unreachable by keyboard and announces as nothing. Buttons and
      // links carry their own role, focus and key handling.
      expect(source, path).not.toMatch(/<div[^>]*\sonClick/);
    }
  });
});

describe('every product screen owes its states', () => {
  it('puts a state component on every page', () => {
    for (const path of PAGES) {
      const source = read(path);
      expect(source, `${path} renders no interface state`).toMatch(STATE_COMPONENT);
    }
  });

  it('gives every page that reads a domain store all three states', () => {
    const obligations = PAGES.filter((path) => DOMAIN_STORE.test(read(path)));
    // The claim only means something if there is at least one such page.
    expect(obligations.length).toBeGreaterThan(0);

    for (const path of obligations) {
      const source = read(path);
      // Loading: a skeleton, so the layout does not jump when data arrives.
      expect(source, `${path} has no loading state`).toMatch(
        /<(Skeleton|SkeletonCard|LoadingState)/,
      );
      // Empty: a successful read that found nothing must not look like a failed one.
      expect(source, `${path} has no empty state`).toMatch(/<(EmptyState|[A-Za-z]*EmptyState)/);
      // Error: the failure is reported with its typed code, not swallowed.
      expect(source, `${path} has no error state`).toMatch(/<ErrorState/);
      // And the states are chosen from the store's status rather than guessed at a length.
      expect(source, `${path} never consults a status`).toMatch(/[Ss]tatus === '/);
    }
  });

  it('reports a failure with its typed code, and interrupts only when it should', () => {
    // The `role` this asserted used to live in ErrorState.tsx. Phase 7.2 moved the failure panel
    // onto the one feedback primitive (`Alert`), so the invariant is asserted where the role is
    // actually decided — a component that delegates its semantics cannot be the place that proves
    // them. The claim is also stronger than it was: it is no longer "an error panel is an alert"
    // but "information is announced politely and only a warning or a failure interrupts", which is
    // what keeps an interruption meaningful.
    const alert = read('web/src/components/Alert.tsx');
    expect(alert).toMatch(/role=\{alertRole\(tone\)\}/);
    // The rule itself is a table in the component manifest, so "information does not interrupt"
    // is a value a test can read rather than a condition buried in markup.
    expect(alert).toMatch(/ALERT_TONE_ROLE\[tone\]/);

    // The failure surface still reports its typed backend code as evidence rather than restating
    // it in prose, and neither surface injects markup.
    const error = read('web/src/components/ErrorState.tsx');
    expect(error).toMatch(/<Alert/);
    expect(error).toContain('code');
    for (const file of ['web/src/components/ErrorState.tsx', 'web/src/components/Alert.tsx']) {
      expect(read(file), file).not.toMatch(/dangerouslySetInnerHTML/);
    }
  });

  it('says why an empty pane is empty', () => {
    const empty = read('web/src/components/EmptyState.tsx');
    // "not loaded" and "nothing exists" must not look the same, so the state takes a reason.
    expect(empty).toMatch(/description\?:/);
    expect(empty).toContain('className');
  });

  it('never puts a real-looking figure behind a placeholder state', () => {
    // A skeleton is a shape, never a value: it renders no text at all, and the state surfaces
    // carry no currency figure they could have been given from a fixture.
    const skeleton = read('web/src/components/Skeleton.tsx');
    expect(skeleton).toMatch(/aria-hidden/);
    // Nothing is rendered between the tags, so there is no text node to be mistaken for data.
    expect(skeleton).toMatch(/\/>\s*\)\s*;\s*\}/);

    for (const component of ['Skeleton', 'EmptyState', 'ErrorState']) {
      expect(read(`web/src/components/${component}.tsx`), component).not.toMatch(/\$\s*\d/);
    }
  });
});

describe('the screens this suite inspects are the screens the product routes', () => {
  it('routes every declared page id', () => {
    // `renderPage` in App.tsx is what a navigation selection resolves to, so a declared id with
    // no branch is a nav entry that renders nothing — the failure a page-on-disk check misses.
    const app = read('web/src/App.tsx');
    expect(APP_PAGE_IDS.length).toBeGreaterThan(0);
    for (const id of APP_PAGE_IDS) {
      expect(app, `no route branch for nav id ${id}`).toContain(`case '${id}':`);
    }
  });

  it('ships one page component for each declared id', () => {
    // So the matrix cannot pass by inspecting fewer screens than the product ships, and a page
    // file that no navigation can reach is caught too.
    expect(PAGES).toHaveLength(APP_PAGE_IDS.length);
    expect(PAGE_NAMES.every((name) => name.endsWith('Page.tsx'))).toBe(true);
  });

  it('keeps every declared page reachable from the navigation', () => {
    const navIds = new Set(NAV_SECTIONS.map((section) => section.id));
    for (const id of APP_PAGE_IDS) {
      if (id === 'settings') continue; // surfaced from the topbar, not the rail
      expect(navIds.has(id), `nav id ${id} is routed but unreachable`).toBe(true);
    }
  });
});
