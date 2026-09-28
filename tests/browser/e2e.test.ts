/**
 * The Product Foundation, rendered by a real browser.
 *
 * What this suite is for
 * ----------------------
 * Phase 5.9 verified the interface thoroughly — 921 tests — and was explicit about the
 * one thing it could not verify: every responsive and interface-state rule was asserted
 * against the shipped `.tsx` **as text**. That is a real limitation, and it is not
 * fixable by writing more source-text assertions, because the questions that matter are
 * questions about a layout engine:
 *
 *   - does the page scroll sideways on a 390 px phone? (a resolved layout, not a class)
 *   - is that control big enough to hit with a thumb? (a rendered box, not a `px-2`)
 *   - did the logo actually load? (`naturalWidth`, not a `src` attribute)
 *   - does this screen render at all, or is it a blank rectangle behind a thrown error?
 *
 * So this file drives a real Chromium-family browser over the DevTools Protocol, using
 * `./driver.ts` — which needs no dependency because Node ships the socket and the host
 * already has the browser. The state assertions from Phase 5.9 stay where they are; this
 * adds the one layer they could not reach.
 *
 * The honesty rules that apply to the product apply here too
 * ---------------------------------------------------------
 * These tests run against the **built** application served over real HTTP, using the
 * application's own signals for synchronisation:
 *
 *   - a page switch is awaited on `aria-current="page"`, which is the app saying it
 *     switched, rather than on a pause that guesses how long it takes;
 *   - nothing waits a fixed interval (see `tests/test-hygiene.test.ts`);
 *   - the suite asserts what a browser measured, and nothing about what the CSS suggests;
 *   - the *motion state* it measures in is stated by the driver
 *     (`Emulation.setEmulatedMedia`) rather than inherited from whatever the machine running it has
 *     set, so a layout measurement cannot mean two things on two machines;
 *   - a box that is still animating is waited on, never sampled. A threshold a transition crosses
 *     mid-flight is a frame of an animation, not a layout: the rail narrows 264px → 76px over
 *     `--duration-base`, and "narrower than 100px" is reached at 96px or 84px on the way, which is
 *     how `expected 84 to be 76` gets reported by a case that is really about a reload.
 *
 * Where a state genuinely cannot be reached in this build — the pages render labelled
 * fixtures, so "empty" and "error" are not reachable through the UI — this file does not
 * invent a way to reach them. `docs/product-foundation-handoff.md` records that as a
 * known limitation instead.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NAV_MODEL, NAV_SECTIONS } from '../../web/src/config/navigation.js';
import { translate, type MessageKey, type UiLocale } from '../../web/src/i18n/index.js';
import { LANGUAGE_PREFERENCE_KEY, normalizePersianContent } from '../../web/src/language/index.js';
import {
  ACCESSIBILITY_PROBE,
  CLIPPING_PROBE,
  OVERFLOW_PROBE,
  SIGNED_FIGURE_PROBE,
  TARGET_PROBE,
  findBrowser,
  openSession,
  startStaticServer,
  type OverflowFinding,
  type PageSession,
  type StaticServer,
} from './driver.js';

const BROWSER = findBrowser();
const DIST = join(process.cwd(), 'web', 'dist');

/**
 * The one legitimate skip in this repository: a property of the machine, not of the code.
 *
 * The browser suite requires a Chromium-family browser to be *installed*. That is not
 * something the repository can guarantee — and it is not a defect when it is missing, so
 * the honest outcome is a named skip rather than a failure that blames the product. CI
 * that should run this suite sets `MASTER_TRADE_E2E_BROWSER` (or installs Chrome), and
 * `npm run validate` reports the skip explicitly.
 */
const suite = BROWSER === null ? describe.skip : describe;

/**
 * The viewport widths the Product Foundation commits to.
 *
 * Two desktops, two tablets (both orientations, because a 768-wide *portrait* tablet and
 * a 1024-wide *landscape* one exercise different breakpoint edges), and three phones
 * including 375 — the narrowest width the design must survive.
 */
const WIDTHS: readonly (readonly [number, number])[] = [
  [1920, 1080],
  [1440, 900],
  [1024, 768],
  [768, 1024],
  [430, 932],
  [390, 844],
  [375, 812],
];

/**
 * The heading each navigation entry must produce, read from the running application.
 *
 * This is a contract, not a snapshot: the sidebar says "Memory" and the page must be
 * titled "Knowledge memory". Asserting the pair means a page whose header drifts away
 * from the entry that opens it fails here, and the expected values were taken from the
 * rendered app rather than guessed from the source.
 */
const EXPECTED_HEADINGS: Record<string, string> = {
  dashboard: 'Training dashboard',
  agent: 'AI workspace',
  memory: 'Knowledge memory',
  research: 'Research',
  journal: 'Trading Journal',
  portfolio: 'Portfolio',
  evaluation: 'Evaluation',
  academy: 'Academy',
  exams: 'Examinations',
  lab: 'Trading lab',
  activity: 'Activity',
  usage: 'Usage',
  profile: 'Profile',
  settings: 'Settings',
};

/**
 * The *key* each page is titled from, so the same contract can be checked in either language.
 *
 * `EXPECTED_HEADINGS` above is a snapshot of the English copy and stays one — it is what fails if a page's
 * wording drifts. This map is the other half of the same contract: it says *where* that word comes from, so
 * the suite can also ask the Persian interface whether the page it opens is headed by the word the entry
 * that opened it shows. Which is a different question, and the one that caught three pages declaring
 * `const TITLE = 'Evaluation'` while the sidebar beside them said «ارزیابی».
 */
const HEADING_KEYS = {
  dashboard: 'dashboard.trainingDashboard',
  agent: 'agent.aIWorkspace',
  memory: 'memory.knowledgeMemory',
  research: 'research.research',
  journal: 'journal.tradingJournal',
  portfolio: 'shell.nav.portfolio.label',
  evaluation: 'shell.nav.evaluation.label',
  academy: 'academy.academy',
  exams: 'exams.examinations',
  lab: 'lab.tradingLab',
  activity: 'realtime.activity',
  usage: 'shell.nav.usage.label',
  profile: 'profile.profile',
  settings: 'settings.settings',
} as const satisfies Record<string, MessageKey>;

/** The heading a page must carry, in the language the interface is being read in. */
function headingFor(locale: UiLocale, id: string): string {
  const key = (HEADING_KEYS as Record<string, MessageKey>)[id];
  if (!key) throw new Error(`no heading key recorded for ${id}`);
  return translate(locale, key);
}

/**
 * Every navigation entry, named in the language the interface is being read in, in display order.
 *
 * Read from `NAV_MODEL` — the same value the rail draws — rather than from `NAV_SECTIONS` plus a
 * group tuple written here. Declaring order and display order legitimately differ (Phase 8.2.1), and
 * a second derivation of "which order that is" is a second answer: it would agree with the config
 * while the config was right and quietly disagree with it after.
 */
function expectedEntries(locale: UiLocale = 'en'): string[] {
  return NAV_MODEL.flatMap((group) => group.items.map((item) => translate(locale, item.labelKey)));
}

/** The navigation entry that shows this name, so a case can turn a label back into a page id. */
function entryIdFor(label: string, locale: UiLocale = 'en'): string {
  const item = NAV_SECTIONS.find((section) => translate(locale, section.labelKey) === label);
  if (!item) throw new Error(`no navigation entry is named ${label}`);
  return item.id;
}

/** The assets the browser identities in `index.html` depend on. */
const BRAND_ASSETS = [
  'favicon.ico',
  'favicon-16.png',
  'favicon-32.png',
  'favicon-48.png',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'og-image.png',
  'site.webmanifest',
] as const;

/** The magic bytes that say a file is the format its extension claims. */
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const ICO_MAGIC = [0x00, 0x00, 0x01, 0x00];

interface OverflowReport {
  limit: number;
  documentScrollWidth: number;
  total: number;
  findings: OverflowFinding[];
}

interface TargetReport {
  considered: number;
  total: number;
  small: { tag: string; label: string; width: number; height: number }[];
}

interface AccessibilityReport {
  total: number;
  issues: { kind: string; detail: string }[];
  landmarks: { main: number; nav: number; headings: number };
}

interface ClippingReport {
  total: number;
  sample: { tag: string; text: string; overBy: number; truncate: boolean }[];
}

interface SignedFigureReport {
  total: number;
  findings: {
    figure: string;
    tag: string;
    detail: string;
    signLeft: number;
    digitLeft: number;
    isolated: boolean;
  }[];
}

/**
 * Where the reader is on the content surface, and how the surface is drawn around them.
 *
 * `regionScroll` is the difference between the content region's own scroll height and its height:
 * it has to be zero on every section, because a region that answers anything else is a second
 * scroll box inside the first one — which is the whole subject of the surface cases.
 */
interface SurfaceState {
  y: number;
  innerH: number;
  docH: number;
  regionScroll: number;
  columnLeft: number;
  columnWidth: number;
  barHeight: number;
  titleTop: number;
}

/** One frame of a surface that is being watched while something else moves. */
interface SurfaceFrame {
  y: number;
  innerH: number;
  docH: number;
  regionHeight: number;
  regionClientWidth: number;
  regionScrollWidth: number;
  columnWidth: number;
  railWidth: number;
}

suite('the Product Foundation in a real browser', () => {
  let session: PageSession;
  let server: StaticServer;

  beforeAll(async () => {
    if (!existsSync(join(DIST, 'index.html'))) {
      throw new Error(
        'web/dist/index.html is missing — the browser suite renders the built application. ' +
          'Run `npm run build:web` first; `npm run validate` does this in the right order.',
      );
    }
    server = await startStaticServer(DIST);
    session = await openSession(BROWSER as string);
    await session.setViewport(1440, 900);
    await session.goto(`${server.origin}/`);
  }, 60_000);

  afterAll(async () => {
    await session?.close();
    await server?.close();
  });

  /**
   * Open a page the way a user does, and wait until that page is actually on screen.
   *
   * Waiting on `aria-current` alone is not enough, and the difference found a real bug.
   * The sidebar flips `aria-current` the instant the store changes, but the workspace
   * swaps its children inside `AnimatePresence mode="wait"` — so for the length of the
   * exit animation the *previous* page is still the thing in the DOM. A measurement taken
   * on `aria-current` therefore describes the page before the one that was asked for,
   * which is precisely how five overflowing screens passed an earlier version of this
   * file. Waiting for the header text means the assertions below describe the page that
   * was requested.
   */
  async function visitIn(locale: UiLocale, id: string): Promise<void> {
    const section = NAV_SECTIONS.find((item) => item.id === id);
    if (!section) throw new Error(`no navigation entry with id ${id}`);
    const expected = headingFor(locale, id);

    await session.clickNav(translate(locale, section.labelKey));
    await session.waitFor(
      `(document.querySelector('main h2')?.textContent?.trim() ?? '') === ${JSON.stringify(expected)}`,
      `the ${translate(locale, section.labelKey)} page (heading "${expected}") to be rendered`,
    );
  }

  /** The same page, in the language most of this file reads the interface in. */
  async function visit(id: string): Promise<void> {
    await visitIn('en', id);
  }

  /**
   * Start a case from a known stored language choice, so it reads the chrome it means to read.
   *
   * The app is loaded first, because `localStorage` belongs to the page's origin and a document that has not
   * loaded the app yet has none — writing the choice into an opaque document is a `SecurityError`, not a
   * preference. The second load is what reads it back.
   *
   * This was a helper of the language-switch block until the direction block needed it too, which is telling:
   * both blocks are about the same setting. `null` clears it, so a case can hand the suite back an interface
   * whose language it did not choose.
   */
  async function startIn(preference: string | null): Promise<void> {
    await session.goto(`${server.origin}/`);
    await session.evaluate(
      preference === null
        ? `localStorage.removeItem(${JSON.stringify(LANGUAGE_PREFERENCE_KEY)})`
        : `localStorage.setItem(${JSON.stringify(LANGUAGE_PREFERENCE_KEY)}, ${JSON.stringify(preference)})`,
    );
    await session.goto(`${server.origin}/`);
  }

  const heading = (): Promise<string> =>
    session.evaluate<string>(`document.querySelector('main h2')?.textContent?.trim() ?? ''`);

  /** A navigation entry's label, in the language this suite reads the interface in. */
  function labelOf(id: string): string {
    const section = NAV_SECTIONS.find((item) => item.id === id);
    if (!section) throw new Error(`no navigation entry with id ${id}`);
    return translate('en', section.labelKey);
  }

  /** The rail's rendered width, in CSS pixels. */
  const railWidth = (): Promise<number> =>
    session.evaluate<number>(
      `Math.round(document.querySelector('aside').getBoundingClientRect().width)`,
    );

  /** Whether the rail is currently the icon rail. */
  const railIsCollapsed = (): Promise<boolean> =>
    session.evaluate<boolean>(
      `document.querySelector('aside').getBoundingClientRect().width < 100`,
    );

  /** Press a control inside the rail by its accessible name. */
  const pressInRail = (label: string): Promise<boolean> =>
    session.evaluate<boolean>(`
      (() => {
        const button = [...document.querySelectorAll('aside button')].find(
          (item) => item.getAttribute('aria-label') === ${JSON.stringify(label)},
        );
        if (!button) return false;
        button.click();
        return true;
      })()
    `);

  /**
   * Wait for the rail's width to *settle* before measuring it, not merely to pass a threshold.
   *
   * The rail animates its width — `w-[76px]` ⇄ `w-[264px]` over `--duration-base` — and a threshold
   * like "narrower than an icon rail" is crossed inside the slow tail of that curve. Sampled every
   * poll, the box sits at 96px, or 84px, for a frame or two on its way to 76px, so a case that measured
   * on the threshold would compare what it caught mid-flight with the width a reload renders instantly
   * and fail on a number the design never declared: `expected 84 to be 76`.
   *
   * So the condition is "past the threshold *and* no width animation still running on the rail", which
   * is the same thing the drawer cases wait for when they wait for the panel to stop sliding — the
   * difference being that this one is asked of the rail in one place instead of in each case. With
   * motion reduced the animation never runs and the condition is satisfied by the settled box
   * immediately, so it is correct in either motion preference rather than tuned for one.
   */
  const waitForRail = (condition: string, description: string): Promise<void> =>
    session.waitFor(
      `(() => {
         const rail = document.querySelector('aside');
         if (!rail) return false;
         if (!(rail.getBoundingClientRect().width ${condition})) return false;
         return !document
           .getAnimations()
           .some(
             (animation) => animation.effect?.target === rail && animation.playState === 'running',
           );
       })()`,
      description,
    );

  /**
   * Leave the rail expanded, before a case that means to measure it.
   *
   * The collapsed rail is a *standing* preference, so it outlives the case that set it. A case that
   * collapses the rail and then fails on something else never reaches its own cleanup, and every case
   * after it reads a rail that draws no labels — which is how one failure is reported as three: the
   * current entry reads as `['']`, because an entry with no label has its name only in `aria-label`,
   * and the next case cannot find 'Collapse sidebar' because the rail is collapsed already. A case that
   * states the starting point it is about to measure, instead of assuming the case before it restored
   * it, keeps one failure from being read as three.
   */
  const expandRail = async (): Promise<void> => {
    if (!(await railIsCollapsed())) return;
    expect(await pressInRail('Expand sidebar'), 'the rail’s expand control').toBe(true);
    await waitForRail('> 200', 'the rail to expand again');
  };

  /**
   * Press the shell's own writing-direction control, by the name it gives itself in `locale`.
   *
   * Found by its accessible name rather than by position, so it stays findable at every width (the topbar
   * wraps rather than hiding it) and in either language — and a miss names the control rather than a selector.
   */
  async function toggleWritingDirection(locale: UiLocale): Promise<boolean> {
    return session.evaluate<boolean>(`
      (() => {
        const button = [...document.querySelectorAll('button')].find(
          (item) => item.getAttribute('aria-label') === ${JSON.stringify(
            translate(locale, 'topbar.toggleWritingDirection'),
          )},
        );
        if (!button) return false;
        button.click();
        return true;
      })()
    `);
  }

  /* ---------------------------------------------------------------------- */
  /* A. Application boot                                                     */
  /* ---------------------------------------------------------------------- */

  describe('application boot', () => {
    it('serves a document a browser can identify the product from', async () => {
      const meta = await session.evaluateJson<{
        title: string;
        lang: string;
        theme: string | null;
        viewport: string | null;
        colorScheme: string | null;
        icons: (string | null)[];
        manifest: string | null;
        apple: string | null;
        ogImage: string | null;
        applicationName: string | null;
      }>(`JSON.stringify({
        title: document.title,
        lang: document.documentElement.lang,
        theme: document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? null,
        viewport: document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? null,
        colorScheme: document.querySelector('meta[name="color-scheme"]')?.getAttribute('content') ?? null,
        icons: [...document.querySelectorAll('link[rel*="icon"]')].map((l) => l.getAttribute('href')),
        manifest: document.querySelector('link[rel="manifest"]')?.getAttribute('href') ?? null,
        apple: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href') ?? null,
        ogImage: document.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? null,
        applicationName: document.querySelector('meta[name="application-name"]')?.getAttribute('content') ?? null,
      })`);

      expect(meta.title).toBe('Master Trade — Workstation Preview');
      expect(meta.applicationName).toBe('Master Trade');
      expect(meta.lang).toBe('en');
      expect(meta.theme).toBe('#05070b');
      expect(meta.colorScheme).toBe('dark');
      // Without this the phone layouts are never browser-tested at all: the page would
      // lay out at a 980 px virtual width and every narrow-screen rule would be inert.
      expect(meta.viewport).toBe('width=device-width, initial-scale=1.0');
      expect(meta.icons).toEqual([
        '/favicon.ico',
        '/favicon-32.png',
        '/favicon-16.png',
        '/apple-touch-icon.png',
      ]);
      expect(meta.manifest).toBe('/site.webmanifest');
      expect(meta.apple).toBe('/apple-touch-icon.png');
      expect(meta.ogImage).toBe('/og-image.png');
    });

    it('replaces the boot splash with the application, so the loading state is real', async () => {
      const html = readFileSync(join(DIST, 'index.html'), 'utf8');
      // The splash ships in the static markup, which is the only way a first paint can
      // carry branding without a script the content security policy forbids.
      expect(html).toContain('id="brand-boot"');
      expect(html).toContain('Starting the workstation');

      // ...and the document the browser is holding has already moved past it.
      const mounted = await session.evaluateJson<{ splash: boolean; children: number }>(
        `JSON.stringify({
           splash: !!document.getElementById('brand-boot'),
           children: document.getElementById('root')?.childElementCount ?? 0,
         })`,
      );
      expect(mounted.splash).toBe(false);
      expect(mounted.children).toBeGreaterThan(0);
    });

    it('renders the shell landmarks a keyboard user navigates by', async () => {
      const shell = await session.evaluateJson<{
        main: number;
        nav: number;
        navLabel: string | null;
        skipHref: string | null;
        skipTargetExists: boolean;
      }>(`JSON.stringify({
        main: document.querySelectorAll('main').length,
        nav: document.querySelectorAll('nav').length,
        navLabel: document.querySelector('nav')?.getAttribute('aria-label') ?? null,
        skipHref: document.querySelector('a[href^="#"]')?.getAttribute('href') ?? null,
        skipTargetExists: !!document.getElementById(
          (document.querySelector('a[href^="#"]')?.getAttribute('href') ?? '#x').slice(1)
        ),
      })`);

      expect(shell.main).toBe(1);
      expect(shell.nav).toBe(1);
      // Named in the interface's language, which is English until the switch in Settings is used.
      expect(shell.navLabel).toBe(translate('en', 'shell.navPrimary'));
      // A skip link that points nowhere is worse than none: it reads as a way past the
      // navigation and then silently does nothing.
      expect(shell.skipHref).toBe('#workspace-main');
      expect(shell.skipTargetExists).toBe(true);
    });

    it('logs no runtime error while the whole product is exercised', async () => {
      session.clearDiagnostics();
      for (const section of NAV_SECTIONS) {
        await visit(section.id);
      }
      // A thrown render error and a failed request both surface as console errors, so an
      // empty list is the browser's own statement that every page rendered cleanly.
      expect(session.diagnostics).toEqual([]);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* B. Page rendering                                                       */
  /* ---------------------------------------------------------------------- */

  describe('every declared page', () => {
    it('renders, and is titled by the entry that opens it', async () => {
      const observed: Record<string, string> = {};
      for (const section of NAV_SECTIONS) {
        await visit(section.id);
        observed[section.id] = await heading();
      }
      expect(observed).toEqual(EXPECTED_HEADINGS);
    });

    it('reads every page title from the catalogue, in both languages', async () => {
      // The other half of the contract above: the English snapshot says what the words *are*, this says where
      // they *come from* — and that the Persian interface has a word of its own for every one of them. Three
      // pages used to declare `const TITLE = 'Evaluation'`, which is a heading the language switch cannot
      // reach, so the sidebar said «ارزیابی» and the page it opened was headed "Evaluation".
      for (const section of NAV_SECTIONS) {
        expect(headingFor('en', section.id), section.id).toBe(EXPECTED_HEADINGS[section.id]);
        expect(headingFor('fa', section.id), `${section.id} is not translated`).not.toBe(
          headingFor('en', section.id),
        );
      }
    });

    it('has a sidebar entry for every page and a page for every entry', async () => {
      const entries = await session.evaluateJson<string[]>(
        `JSON.stringify([...document.querySelectorAll('nav')[0].querySelectorAll('button')].map(
           (button) => (button.getAttribute('aria-label') ?? button.textContent ?? '').trim()
         ))`,
      );

      // Rendered order is the *display* order, not the declaration order — `NAV_SECTIONS` lists the
      // product's page order so the two stay independent, and the assertion has to respect that
      // rather than quietly requiring the file to be sorted for display. Both the rail and this
      // expectation read `NAV_MODEL` (Phase 8.2.1), so there is one statement of that order rather
      // than a second derivation here that could agree with the config by accident.
      expect(entries).toEqual(expectedEntries());
    });

    it('groups the navigation as the product intends', async () => {
      const groups = await session.evaluateJson<string[]>(
        `JSON.stringify([...document.querySelectorAll('nav')[0].querySelectorAll('p')].map(
           (node) => (node.textContent ?? '').trim()
         ))`,
      );
      expect(groups).toEqual(
        (['workspace', 'learning', 'system'] as const).map((group) =>
          translate('en', `shell.group.${group}` as MessageKey),
        ),
      );
    });
  });

  /* ---------------------------------------------------------------------- */
  /* C. Responsive matrix                                                    */
  /* ---------------------------------------------------------------------- */

  describe('responsive layout', () => {
    for (const [width, height] of WIDTHS) {
      it(`never scrolls sideways at ${width}x${height}`, async () => {
        await session.setViewport(width, height);
        await session.goto(`${server.origin}/`);

        const offenders: string[] = [];
        for (const section of NAV_SECTIONS) {
          await visit(section.id);
          const report = await session.evaluateJson<OverflowReport>(OVERFLOW_PROBE);

          // The document is not allowed to be wider than the viewport it was given...
          if (report.documentScrollWidth > report.limit) {
            offenders.push(
              `${section.id}: document is ${report.documentScrollWidth}px wide in a ${report.limit}px viewport`,
            );
          }
          // ...and neither is any element inside it. Naming the element is the point:
          // "the page overflows" is unfixable, "<div> at +212px" is a bug report.
          for (const finding of report.findings) {
            offenders.push(
              `${section.id}: <${finding.tag}> "${finding.detail}" reaches ${finding.right}px past the edge`,
            );
          }
        }
        expect(offenders).toEqual([]);
      });
    }

    it('keeps every control big enough to touch at phone widths', async () => {
      const tooSmall: string[] = [];
      for (const width of [430, 390, 375]) {
        await session.setViewport(width, 844);
        await session.goto(`${server.origin}/`);

        for (const section of NAV_SECTIONS) {
          await visit(section.id);
          const report = await session.evaluateJson<TargetReport>(TARGET_PROBE);
          for (const control of report.small) {
            tooSmall.push(
              `${section.id} @${width}: <${control.tag}> "${control.label}" is ${control.width}x${control.height}`,
            );
          }
        }
      }
      // WCAG 2.2 Target Size (Minimum) is 24x24 CSS px. Visually hidden elements (the
      // skip link) are excluded by the probe: they are not targets.
      expect(tooSmall).toEqual([]);
    });

    it('survives the right-to-left layout the direction control turns on', async () => {
      // Direction is a document-level property in this product, so the whole layout mirrors from logical
      // spacing properties. A mirror is where fixed left/right spacing shows up as overflow, which is why it
      // is measured rather than assumed.
      //
      // This case used to write `document.documentElement.dir = 'rtl'` by hand, which measured a state the
      // product cannot be in — and would have kept passing if the direction control had stopped working
      // entirely. It now asks the shell for the mirror: the topbar's toggle pins right-to-left, and it is not
      // persisted, so a later case's page load is the reset.
      const mirrored = ['dashboard', 'portfolio', 'evaluation', 'journal', 'agent'];
      await session.setViewport(390, 844);
      await session.goto(`${server.origin}/`);

      /** Name the offender, not just the count: a mirror defect is only diagnosable. */
      const offendersIn = (report: OverflowReport): string[] =>
        report.findings.map(
          (finding) => `<${finding.tag}> "${finding.detail}" +${finding.right}px`,
        );

      const toggle = (): Promise<boolean> => toggleWritingDirection('en');

      expect(await session.evaluate<string>('document.documentElement.dir')).toBe('ltr');
      expect(await toggle()).toBe(true);
      await session.waitFor(
        `document.documentElement.dir === 'rtl'`,
        'the shell to mirror the document',
      );

      for (const id of mirrored) {
        await visit(id);
        const report = await session.evaluateJson<OverflowReport>(OVERFLOW_PROBE);
        expect(offendersIn(report), `${id} overflows when mirrored to RTL`).toEqual([]);
        expect(report.documentScrollWidth).toBeLessThanOrEqual(report.limit);
      }

      // And the control is a toggle rather than a one-way door: the same press un-mirrors the shell.
      expect(await toggle()).toBe(true);
      await session.waitFor(
        `document.documentElement.dir === 'ltr'`,
        'the shell to un-mirror the document',
      );
    });

    it('does not clip rendered text at phone widths', async () => {
      await session.setViewport(390, 844);
      await session.goto(`${server.origin}/`);
      const clipped: string[] = [];
      for (const section of NAV_SECTIONS) {
        await visit(section.id);
        const report = await session.evaluateJson<ClippingReport>(CLIPPING_PROBE);
        for (const item of report.sample) {
          // A deliberate `truncate` is a design decision; text that spills past its own
          // box with no ellipsis is a layout defect.
          if (!item.truncate) {
            clipped.push(
              `${section.id}: <${item.tag}> "${item.text}" overflows by ${item.overBy}px`,
            );
          }
        }
      }
      expect(clipped).toEqual([]);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* C2. The off-canvas navigation, at the width where it leaves the flow     */
  /* ---------------------------------------------------------------------- */

  /**
   * The navigation at the width where it cannot afford its own column.
   *
   * Below the tablet breakpoint the shell takes the navigation out of the document and gives it a
   * trigger: it is *closed* until asked for. These cases drive that the way a person does — a real
   * click on the trigger, a real Escape key — and assert what the browser resolved, not what a class
   * name suggests.
   */
  describe('the off-canvas navigation', () => {
    const DRAWER = '[role="dialog"]';
    const TRIGGER = '[aria-controls="shell-navigation"]';

    /** Press the top-bar trigger, and wait for the drawer to open and stop sliding. */
    const openDrawer = async (): Promise<boolean> => {
      const pressed = await session.evaluate<boolean>(`
        (() => {
          const trigger = document.querySelector(${JSON.stringify(TRIGGER)});
          if (!trigger) return false;
          // Focused first, the way a real press leaves it: a button receives focus on mousedown, and
          // that is what the drawer hands focus back to when it closes.
          trigger.focus();
          trigger.click();
          return true;
        })()
      `);
      if (!pressed) return false;
      await session.waitFor(`!!document.querySelector(${JSON.stringify(DRAWER)})`, 'the drawer');
      // Waited on the *settled* edge rather than on the element existing: the drawer slides, and a box
      // measured mid-animation is not the box the layout came to rest on.
      await session.waitFor(
        `(() => {
           const drawer = document.querySelector(${JSON.stringify(DRAWER)});
           if (!drawer) return false;
           const left = Math.round(drawer.getBoundingClientRect().left);
           if (window.__mtDrawerLeft === left) return true;
           window.__mtDrawerLeft = left;
           return false;
         })()`,
        'the drawer to stop sliding',
      );
      return true;
    };

    /** Press a button by its accessible name, inside the dialog or anywhere in the document. */
    const pressByLabel = (label: string, inside: boolean): Promise<boolean> =>
      session.evaluate<boolean>(`
        (() => {
          const root = ${inside ? `document.querySelector(${JSON.stringify(DRAWER)})` : 'document'};
          if (!root) return false;
          const button = [...root.querySelectorAll('button')].find(
            (item) => item.getAttribute('aria-label') === ${JSON.stringify(label)},
          );
          if (!button) return false;
          button.click();
          return true;
        })()
      `);

    it('is closed until asked for, and the trigger names what it controls', async () => {
      await session.setViewport(390, 844);
      await session.goto(`${server.origin}/`);

      // The rail is not in the document at all, so the trigger is the only way to the navigation.
      expect(await session.evaluate<number>(`document.querySelectorAll('aside').length`)).toBe(0);
      expect(
        await session.evaluate<boolean>(`!!document.querySelector(${JSON.stringify(TRIGGER)})`),
      ).toBe(true);
      expect(
        await session.evaluate<boolean>(`!!document.querySelector(${JSON.stringify(DRAWER)})`),
      ).toBe(false);

      expect(await openDrawer()).toBe(true);

      // It is a modal surface, it holds focus, and the trigger says it is expanded.
      expect(
        await session.evaluate<boolean>(
          `document.querySelector(${JSON.stringify(DRAWER)}).getAttribute('aria-modal') === 'true'`,
        ),
      ).toBe(true);
      expect(
        await session.evaluate<boolean>(
          `document.querySelector(${JSON.stringify(DRAWER)}).contains(document.activeElement)`,
        ),
      ).toBe(true);
      expect(
        await session.evaluate<boolean>(
          `document.querySelector(${JSON.stringify(TRIGGER)}).getAttribute('aria-expanded') === 'true'`,
        ),
      ).toBe(true);

      // Escape closes it, and focus goes back to the control that opened it.
      await session.pressKey('Escape');
      await session.waitFor(
        `!document.querySelector(${JSON.stringify(DRAWER)})`,
        'the drawer to close on Escape',
      );
      expect(
        await session.evaluate<boolean>(
          `document.activeElement === document.querySelector(${JSON.stringify(TRIGGER)})`,
        ),
      ).toBe(true);
    });

    it('closes from its scrim and from its own close control', async () => {
      await session.setViewport(390, 844);
      await session.goto(`${server.origin}/`);
      const closeName = translate('en', 'sidebar.closeNavigation');

      expect(await openDrawer()).toBe(true);
      // The scrim is the button named "close" that is *not* inside the dialog — a real control, not a
      // bare div, so it can be reached rather than merely clicked with a pointer.
      const scrimClicked = await session.evaluate<boolean>(`
        (() => {
          const dialog = document.querySelector(${JSON.stringify(DRAWER)});
          const scrim = [...document.querySelectorAll('button')].find(
            (item) =>
              item.getAttribute('aria-label') === ${JSON.stringify(closeName)} && !dialog.contains(item),
          );
          if (!scrim) return false;
          scrim.click();
          return true;
        })()
      `);
      expect(scrimClicked).toBe(true);
      await session.waitFor(
        `!document.querySelector(${JSON.stringify(DRAWER)})`,
        'the scrim to close the drawer',
      );

      // ...and the close control *inside* the drawer does the same.
      expect(await openDrawer()).toBe(true);
      expect(await pressByLabel(closeName, true)).toBe(true);
      await session.waitFor(
        `!document.querySelector(${JSON.stringify(DRAWER)})`,
        'the close control to close the drawer',
      );
    });

    it('opens from the inline-start edge, so it mirrors with the language', async () => {
      await session.setViewport(390, 844);

      const edges = async (
        lang: UiLocale,
      ): Promise<{ left: number; right: number; viewport: number }> => {
        await startIn(lang);
        expect(await openDrawer()).toBe(true);
        return session.evaluateJson<{ left: number; right: number; viewport: number }>(`
          (() => {
            const drawer = document.querySelector(${JSON.stringify(DRAWER)});
            const rect = drawer.getBoundingClientRect();
            return JSON.stringify({
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              viewport: window.innerWidth,
            });
          })()
        `);
      };

      // Left-to-right: the drawer is flush with the left edge.
      const english = await edges('en');
      expect(english.left).toBeLessThanOrEqual(2);
      expect(english.right).toBeLessThan(english.viewport);

      // Right-to-left: the same drawer is flush with the *right* edge — the inline start moved.
      const persian = await edges('fa');
      expect(persian.right).toBeGreaterThanOrEqual(persian.viewport - 2);
      expect(persian.left).toBeGreaterThan(0);

      await startIn(null);
    });

    it('is not rendered at all where the rail fits', async () => {
      await session.setViewport(1440, 900);
      await session.goto(`${server.origin}/`);

      // A desktop keeps the rail, so there is no trigger and nothing to open.
      expect(await session.evaluate<number>(`document.querySelectorAll('aside').length`)).toBe(1);
      expect(
        await session.evaluate<boolean>(`!!document.querySelector(${JSON.stringify(TRIGGER)})`),
      ).toBe(false);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* D. The charts, as the browser paints them                               */
  /* ---------------------------------------------------------------------- */

  /**
   * Every string a chart draws, in the chart's own coordinates.
   *
   * `getBBox()` is the space an `<svg>` lays its content out in, and it is the space a view box clips;
   * `getBoundingClientRect()` is where the glyphs landed after that box was mapped to the container. So
   * the clip happens in the first of the two, and comparing a label's box against the view box is the
   * measurement that says whether a reader can see all of it.
   */
  interface ChartReport {
    charts: {
      label: string;
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
      text: { value: string; left: number; top: number; right: number; bottom: number }[];
    }[];
  }

  const CHART_BOUNDS_PROBE = `
(() => {
  const charts = [];
  for (const svg of document.querySelectorAll('main svg[role="img"]')) {
    const numbers = (svg.getAttribute('viewBox') || '').trim().split(/[\\s,]+/).map(Number);
    if (numbers.length !== 4 || numbers.some((value) => !Number.isFinite(value))) continue;
    const [minX, minY, width, height] = numbers;
    const text = [];
    for (const node of svg.querySelectorAll('text')) {
      const box = node.getBBox();
      text.push({
        value: (node.textContent || '').trim(),
        left: box.x,
        top: box.y,
        right: box.x + box.width,
        bottom: box.y + box.height,
      });
    }
    // A chart with no text is a shape rather than a labelled plot, and there is nothing in it to clip.
    if (text.length === 0) continue;
    charts.push({
      label: svg.getAttribute('aria-label') || '',
      minX,
      minY,
      maxX: minX + width,
      maxY: minY + height,
      text,
    });
  }
  return JSON.stringify({ charts });
})()`;

  describe('the charts, in a browser', () => {
    /**
     * A chart draws its labels inside its own frame — every page, every tab, both languages.
     *
     * The defect this is about is worth stating here, because nothing else in the suite could see it. The
     * journal's value axis put each tick label in a band the chart assumed was 26 units wide, `text-anchor:
     * end` six units inside the grid; the labels are 32–38 units wide, so every one of them began *before*
     * `x = 0` and the first characters were painted outside the view box. An `<svg>` clips to its view box by
     * the same rule that makes it a viewport, so the axis read `1.50R`, `.36R`, `.22R`, `.07R`, `.07R` — five
     * values, all of them missing their sign and leading digit.
     *
     * No source rule and no HTML probe could have caught it. The class names were right; the string in the DOM
     * was whole; `CLIPPING_PROBE` measures `scrollWidth > clientWidth`, and SVG text has no such pair. The
     * overflow was *painted*, in a coordinate system, which is why this case reads `getBBox()` in that
     * coordinate system rather than reading the rendered boxes.
     */
    it('draws every label inside the frame that draws it, at a precision a reader can use', async () => {
      const offenders: string[] = [];
      /** Labels that are placed correctly and still say something a reader cannot use. */
      const unreadable: string[] = [];
      let charts = 0;
      let labels = 0;

      /**
       * A figure printed past two decimals, or one that is not a number at all.
       *
       * Both are what interpolating a raw float into a label produces, and the `trades` axis did exactly
       * that: a tick arithmetic had left at `2.2600000000000002` was printed in full, so the distribution
       * chart read `2.2600000000000002 trades` and `5.739999999999999 trades`. The rule being measured here
       * is the product's own — a figure is `toFixed(2)` at most, which is what `.num` and the formatter's
       * `default` branch both do — and it is measured rather than read from the source because a source
       * rule can see the format string and not the number that flows through it.
       */
      const UNREADABLE_FIGURE = /\.\d{3,}|[eE][+-]?\d|NaN|Infinity|undefined/;

      /**
       * Half a unit of tolerance. A run of text is measured from the advances of its glyphs, and a label
       * sitting flush with a boundary can land a hundredth of a unit outside it. A clipped character is whole
       * units — the digits that were disappearing were ten units wide — so this cannot hide one.
       */
      const TOLERANCE = 0.5;

      const inspect = async (where: string): Promise<void> => {
        const report = await session.evaluateJson<ChartReport>(CHART_BOUNDS_PROBE);
        for (const chart of report.charts) {
          charts += 1;
          for (const run of chart.text) {
            labels += 1;
            const outside: string[] = [];
            if (run.left < chart.minX - TOLERANCE) {
              outside.push(`${Math.round((chart.minX - run.left) * 10) / 10} past its left edge`);
            }
            if (run.right > chart.maxX + TOLERANCE) {
              outside.push(`${Math.round((run.right - chart.maxX) * 10) / 10} past its right edge`);
            }
            if (run.top < chart.minY - TOLERANCE) {
              outside.push(`${Math.round((chart.minY - run.top) * 10) / 10} above its top edge`);
            }
            if (run.bottom > chart.maxY + TOLERANCE) {
              outside.push(
                `${Math.round((run.bottom - chart.maxY) * 10) / 10} below its bottom edge`,
              );
            }
            if (outside.length > 0) {
              offenders.push(
                `${where}: "${run.value}" on "${chart.label}" is drawn ${outside.join(' and ')}`,
              );
            }
            if (UNREADABLE_FIGURE.test(run.value)) {
              unreadable.push(`${where}: "${run.value}" on "${chart.label}"`);
            }
          }
        }
      };

      // Both languages, because the axis labels are formatted from the same values either way and the font
      // they are drawn in is not: Persian swaps the type stack for the face the language is read in, which is
      // exactly the kind of change that moves a glyph's advance.
      for (const locale of ['en', 'fa'] as const) {
        await startIn(locale);
        for (const section of NAV_SECTIONS) {
          await visitIn(locale, section.id);
          await inspect(`${locale} ${section.id}`);

          // Every tab as well: the journal keeps three charts on its overview and eight behind its analytics
          // tab, and a walk of the default tab of every page would have measured the three.
          const tabs = await session.tabCount();
          for (let index = 0; index < tabs; index += 1) {
            if (await session.tabSelected(index)) continue;
            await session.selectTab(index, `${locale} ${section.id}`);
            await inspect(`${locale} ${section.id} · tab ${index}`);
          }
        }
      }

      // The walk measured charts, and measured labels inside them, so an empty offender list is a clean
      // result rather than a walk that never found a chart.
      expect(charts, 'no labelled chart was measured').toBeGreaterThan(10);
      expect(labels, 'no chart label was measured').toBeGreaterThan(40);
      expect(offenders, 'a chart label is painted outside its own frame').toEqual([]);
      expect(unreadable, 'a chart prints a figure no reader can use').toEqual([]);

      await startIn(null);
    }, 300_000);
  });

  /* ---------------------------------------------------------------------- */
  /* E. Accessibility in the rendered document                               */
  /* ---------------------------------------------------------------------- */

  describe('accessibility', () => {
    /**
     * Open the shell's off-canvas navigation, where the width makes it a drawer.
     *
     * At a phone width the navigation is not a landmark until it is opened, so the probe below asks the
     * shell for it the way a person does rather than measuring a drawer that is closed by design.
     */
    const openNavigation = async (): Promise<void> => {
      const pressed = await session.evaluate<boolean>(`
        (() => {
          const trigger = document.querySelector('[aria-controls="shell-navigation"]');
          if (!trigger) return false;
          trigger.focus();
          trigger.click();
          return true;
        })()
      `);
      if (!pressed) return;
      await session.waitFor(
        `!!document.querySelector('[role="dialog"] nav')`,
        'the off-canvas navigation to open',
      );
    };

    it('names every control and every image the browser paints', async () => {
      const problems: string[] = [];
      for (const width of [1440, 390]) {
        await session.setViewport(width, 900);
        await session.goto(`${server.origin}/`);
        for (const section of NAV_SECTIONS) {
          await visit(section.id);
          // The navigation is a landmark in every mode: at a phone width it is the open drawer.
          if (width < 768) await openNavigation();
          const report = await session.evaluateJson<AccessibilityReport>(ACCESSIBILITY_PROBE);

          expect(report.landmarks.main, `${section.id} has no single main landmark`).toBe(1);
          expect(report.landmarks.nav).toBeGreaterThanOrEqual(1);
          for (const issue of report.issues) {
            problems.push(`${section.id} @${width}: ${issue.kind} (${issue.detail})`);
          }
        }
      }
      expect(problems).toEqual([]);
    });

    it('moves focus into the page with a real key press, and shows it', async () => {
      await session.setViewport(1440, 900);
      await session.goto(`${server.origin}/`);

      // A real key event, so `:focus-visible` matches — a programmatic `.focus()` would
      // verify a focus ring the keyboard user never sees.
      await session.pressKey('Tab');
      const active = await session.evaluateJson<{
        tag: string;
        text: string;
        visible: boolean;
      }>(`JSON.stringify((() => {
         const element = document.activeElement;
         if (!element) return { tag: '', text: '', visible: false };
         const style = getComputedStyle(element);
         return {
           tag: element.tagName.toLowerCase(),
           text: (element.getAttribute('aria-label') ?? element.textContent ?? '').trim(),
           // Visually hidden until focused; becoming visible on focus is what makes it
           // usable rather than merely present in the accessibility tree.
           visible: style.clipPath === 'none' && element.getBoundingClientRect().width > 1,
         };
       })())`);

      expect(active.text.toLowerCase()).toContain('skip');
      expect(active.visible).toBe(true);
    });

    it('gives the brand mark an alternative and paints real artwork', async () => {
      await session.setViewport(1440, 900);
      await session.goto(`${server.origin}/`);

      const marks = await session.evaluateJson<{ total: number; unnamed: number; broken: number }>(
        `JSON.stringify((() => {
           const images = [...document.querySelectorAll('img[src="/icon-192.png"]')];
           return {
             total: images.length,
             unnamed: images.filter((image) => !image.hasAttribute('alt')).length,
             broken: images.filter((image) => !image.complete || image.naturalWidth === 0).length,
           };
         })())`,
      );
      expect(marks.total).toBeGreaterThan(0);
      // Every instance carries an `alt`: a label where the mark is the only identifier
      // (the collapsed rail) and an empty one where the wordmark sits beside it.
      expect(marks.unnamed).toBe(0);
      // And the browser actually decoded the artwork.
      expect(marks.broken).toBe(0);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* E. Production asset delivery                                            */
  /* ---------------------------------------------------------------------- */

  describe('the built application a browser is served', () => {
    it('delivers every brand asset, and each is the format it claims', async () => {
      for (const asset of BRAND_ASSETS) {
        const response = await fetch(`${server.origin}/${asset}`);
        expect(response.status, `${asset} did not resolve`).toBe(200);
        const bytes = Buffer.from(await response.arrayBuffer());
        expect(bytes.length, `${asset} is empty`).toBeGreaterThan(0);

        // A broken image is often a 200 carrying an HTML error page, which the browser
        // shows as a blank box. The magic bytes are what catch that.
        if (asset.endsWith('.png')) {
          expect([...bytes.subarray(0, 8)], `${asset} is not a PNG`).toEqual(PNG_MAGIC);
        }
        if (asset.endsWith('.ico')) {
          expect([...bytes.subarray(0, 4)], `${asset} is not an ICO`).toEqual(ICO_MAGIC);
        }
      }
    });

    it('publishes a manifest a browser can install from', async () => {
      const response = await fetch(`${server.origin}/site.webmanifest`);
      expect(response.status).toBe(200);
      const manifest = (await response.json()) as {
        name?: string;
        short_name?: string;
        start_url?: string;
        scope?: string;
        display?: string;
        theme_color?: string;
        background_color?: string;
        icons?: { src: string; sizes: string; purpose?: string }[];
      };

      expect(manifest.short_name).toBe('Master Trade');
      expect(manifest.name).toContain('Master Trade');
      expect(manifest.start_url).toBe('/');
      expect(manifest.scope).toBe('/');
      expect(manifest.display).toBe('standalone');
      // The theme colour is what tints the mobile browser chrome; it has to agree with
      // the document metadata or the app flashes white on launch.
      expect(manifest.theme_color).toBe('#05070b');
      expect(manifest.background_color).toBe('#05070b');

      const icons = manifest.icons ?? [];
      const sizes = icons.map((icon) => icon.sizes);
      expect(sizes).toContain('192x192');
      expect(sizes).toContain('512x512');
      // A maskable icon is what stops Android cropping the mark into a circle and
      // cutting its edges off.
      expect(icons.some((icon) => (icon.purpose ?? '').includes('maskable'))).toBe(true);

      // Every icon the manifest names must actually be served.
      for (const icon of icons) {
        const iconResponse = await fetch(new URL(icon.src, `${server.origin}/`));
        expect(iconResponse.status, `manifest icon ${icon.src} did not resolve`).toBe(200);
      }
    });

    it('serves the hashed bundle the document actually asks for', async () => {
      const html = readFileSync(join(DIST, 'index.html'), 'utf8');
      const referenced = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(
        (match) => match[1] as string,
      );

      // The build is not allowed to produce a document that points at nothing: this is
      // the failure that only shows up after a deploy, as a blank page.
      expect(referenced.length).toBeGreaterThan(0);
      for (const asset of referenced) {
        const response = await fetch(`${server.origin}${asset}`);
        expect(response.status, `${asset} is referenced but not served`).toBe(200);
      }
      // Source maps ship in `web/dist` by configuration; the document must not request
      // them, so a browser never downloads a file that describes the source.
      expect(html).not.toMatch(/sourceMappingURL/);
    });

    it('renders something substantial rather than a blank page', async () => {
      await session.setViewport(1440, 900);
      await session.goto(`${server.origin}/`);
      const shot = await session.screenshot();
      expect(shot.length, 'the browser produced no screenshot').toBeGreaterThan(0);

      const png = Buffer.from(shot, 'base64');
      // Sized from the IHDR chunk: a screenshot that is not the requested viewport means
      // the emulation did not take effect and the layout assertions describe nothing.
      expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
      expect(png.readUInt32BE(16)).toBe(1440);
      expect(png.readUInt32BE(20)).toBe(900);

      const elements = await session.evaluate<number>(`document.querySelectorAll('body *').length`);
      expect(elements).toBeGreaterThan(80);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* F. Product posture, as the user sees it                                 */
  /* ---------------------------------------------------------------------- */

  describe('the posture the interface states', () => {
    it('states that trading and broker execution are disabled, in the shell itself', async () => {
      await session.setViewport(1440, 900);
      await session.goto(`${server.origin}/`);

      const shell = await session.evaluateJson<{
        sidebar: string;
        footer: string;
      }>(`JSON.stringify({
         sidebar: document.querySelector('aside')?.textContent ?? '',
         footer: document.querySelector('footer')?.textContent ?? '',
       })`);

      // Asserted in the rendered interface, not only in configuration: the guarantee is
      // only worth what the user can see of it.
      expect(shell.sidebar).toMatch(/Live trading/i);
      expect(shell.sidebar).toMatch(/disabled/i);
      expect(shell.sidebar).toMatch(/Broker execution/i);
      expect(shell.footer).toMatch(/no order capability exists/i);
    });

    it('labels the interface as a preview so mock data cannot be mistaken for real', async () => {
      // Risk R18 in `docs/risks-and-deferred.md`: a prototype read as a working product.
      // The marker has to be on screen, in the built bundle, not only in the source.
      const topbar = await session.evaluate<string>(
        `document.querySelector('header')?.textContent ?? ''`,
      );
      expect(topbar).toContain('Preview · mock data');
    });

    it('opens the safety detail from the shell and answers with the same posture', async () => {
      await session.setViewport(1440, 900);
      await session.goto(`${server.origin}/`);

      const opened = await session.evaluate<boolean>(`
        (() => {
          const trigger = [...document.querySelectorAll('button')].find(
            (button) => (button.textContent ?? '').trim() === 'Safety details',
          );
          if (!trigger) return false;
          trigger.click();
          return true;
        })()
      `);
      expect(opened).toBe(true);

      await session.waitFor(`!!document.querySelector('[role="dialog"]')`, 'the safety dialog');
      const dialog = await session.evaluate<string>(
        `document.querySelector('[role="dialog"]')?.textContent ?? ''`,
      );
      // A dialog is the one place the posture is stated in full sentences, so it is the
      // place most likely to drift from the configuration it describes. The claims are
      // asserted individually, because "mentions trading" would pass on a dialog that
      // had quietly dropped the guarantee it exists to make.
      expect(dialog).toMatch(/no live trading/i);
      expect(dialog).toMatch(/no broker execution/i);
      expect(dialog).toMatch(/literal false/i);

      await session.pressKey('Escape');
      await session.waitFor(
        `!document.querySelector('[role="dialog"]')`,
        'the safety dialog to close on Escape',
      );
    });
  });

  /* ---------------------------------------------------------------------- */
  /* G. The Persian language foundation (Phase 7.5.1)                        */
  /* ---------------------------------------------------------------------- */

  describe('the Persian language foundation, in a browser', () => {
    it('declares a Persian face, and spends nothing on it until Persian is on the page', async () => {
      await session.setViewport(1440, 900);
      await session.goto(`${server.origin}/`);

      interface FaceReport {
        loaded: boolean;
        requests: number;
        family: string;
        lang: string;
      }
      const before = await session.evaluateJson<FaceReport>(`JSON.stringify({
         loaded: document.fonts.check('16px Vazirmatn'),
         requests: performance.getEntriesByType('resource')
           .filter((entry) => entry.name.includes('Vazirmatn')).length,
         family: getComputedStyle(document.body).fontFamily,
         lang: document.documentElement.lang,
       })`);

      // English is English: the document declares it, the body keeps the interface stack, and the
      // Persian face has cost the running product nothing at all.
      expect(before.lang).toBe('en');
      expect(before.family).not.toContain('Vazirmatn');
      expect(before.loaded).toBe(false);
      expect(before.requests).toBe(0);

      const after = await session.evaluateJson<{
        family: string;
        loaded: boolean;
        coversText: boolean;
        requests: number;
      }>(`
        (async () => {
          const sample = '\u0642\u06CC\u0645\u062A \u0648\u0631\u0648\u062F \u06F3\u06F3\u06F4\u06F5';
          const paragraph = document.createElement('p');
          paragraph.lang = 'fa';
          paragraph.textContent = sample;
          document.body.append(paragraph);
          await document.fonts.load('16px Vazirmatn', sample);
          await document.fonts.ready;
          const report = {
            family: getComputedStyle(paragraph).fontFamily,
            loaded: document.fonts.check('16px Vazirmatn'),
            // The second argument makes this a *coverage* question rather than a load question: the
            // answer is true only if the face actually has glyphs for Persian letters and Persian
            // digits. A font that loaded but could not draw the text would fail here.
            coversText: document.fonts.check('16px Vazirmatn', sample),
            requests: performance.getEntriesByType('resource')
              .filter((entry) => entry.name.includes('Vazirmatn')).length,
          };
          paragraph.remove();
          return JSON.stringify(report);
        })()
      `);

      // A Persian element resolves the language rule, the face really loads from the served file and
      // covers the sample, and it was the *first* use that fetched it — which is what `:lang(fa)` is
      // for.
      expect(after.family.split(',')[0]?.trim().replace(/["']/g, '')).toBe('Vazirmatn');
      expect(after.loaded).toBe(true);
      expect(after.coversText).toBe(true);
      expect(after.requests).toBeGreaterThan(0);
    });

    it('paints a corrected Persian paragraph without overflowing a phone', async () => {
      // The correction pipeline runs here, in Node, and the browser paints exactly what it produced.
      // Two claims in one measurement: the corrections (a Persian comma, a collapsed run, a figure
      // left as a technical token) did not break the layout at phone width, and nothing in the
      // paragraph escaped its own line to pan the page.
      const corrected = normalizePersianContent(
        'XAUUSD  \u062F\u0631 \u062A\u0627\u06CC\u0645 \u0641\u0631\u06CC\u0645 \u06F1 \u0633\u0627\u0639\u062A\u0647 , 3345.20 \u0631\u0627 \u0634\u06A9\u0633\u062A ?',
      ).text;
      const figure = '3345.20';
      expect(corrected).toContain('\u060C');
      expect(corrected).toContain(figure);

      await session.setViewport(390, 844);
      await session.goto(`${server.origin}/`);
      const measured = await session.evaluateJson<{
        overflow: number;
        text: string;
        figureWidth: number;
        paragraphWidth: number;
      }>(`
        (() => {
          const wrapper = document.createElement('div');
          wrapper.dir = 'rtl';
          wrapper.lang = 'fa';
          const paragraph = document.createElement('p');
          const corrected = ${JSON.stringify(corrected)};
          const [before, after] = corrected.split(${JSON.stringify(figure)});
          paragraph.append(document.createTextNode(before));
          const span = document.createElement('span');
          span.className = 'num';
          span.textContent = ${JSON.stringify(figure)};
          paragraph.append(span, document.createTextNode(after));
          wrapper.append(paragraph);
          document.body.append(wrapper);
          const report = {
            overflow: document.documentElement.scrollWidth - window.innerWidth,
            text: paragraph.textContent,
            figureWidth: span.getBoundingClientRect().width,
            paragraphWidth: paragraph.getBoundingClientRect().width,
          };
          wrapper.remove();
          return JSON.stringify(report);
        })()
      `);

      // The page really painted what the pipeline produced, the figure rendered as a real run, and
      // the corrected paragraph fits the phone it was rendered on.
      expect(measured.text).toBe(corrected);
      expect(measured.figureWidth, 'the figure painted nothing').toBeGreaterThan(0);
      expect(measured.paragraphWidth).toBeLessThanOrEqual(390);
      expect(measured.overflow, 'the corrected paragraph panned the page').toBeLessThanOrEqual(0);
    });

    it('keeps a signed figure left-to-right inside a paragraph that is right-to-left', async () => {
      interface FigureReport {
        rtl: boolean;
        signLeft: number;
        tailLeft: number;
        text: string;
      }
      // The rule from Phase 7.4, measured here for the first time with Persian actually on the page:
      // a minus is a *neutral* in the bidi algorithm, so `-1.00R` beside right-to-left text resolves
      // to `1.00R-` — a different number wearing the same digits. `.num` gives the figure its own
      // left-to-right context, and the measurement below is where the sign ends up drawn.
      const measured = await session.evaluateJson<FigureReport>(`
        (() => {
          const previous = document.documentElement.dir;
          document.documentElement.dir = 'rtl';
          const paragraph = document.createElement('p');
          paragraph.lang = 'fa';
          paragraph.style.cssText = 'position:absolute;top:0;left:0;white-space:nowrap';
          paragraph.textContent = '\u0642\u06CC\u0645\u062A \u0648\u0631\u0648\u062F ';
          const figure = document.createElement('span');
          figure.className = 'num';
          figure.textContent = '\u22121.00R';
          paragraph.append(figure);
          document.body.append(paragraph);

          const text = figure.firstChild;
          const length = figure.textContent.length;
          const sign = document.createRange();
          sign.setStart(text, 0);
          sign.setEnd(text, 1);
          const tail = document.createRange();
          tail.setStart(text, length - 1);
          tail.setEnd(text, length);
          const report = {
            rtl: getComputedStyle(paragraph).direction === 'rtl',
            signLeft: sign.getBoundingClientRect().left,
            tailLeft: tail.getBoundingClientRect().left,
            text: figure.textContent,
          };
          paragraph.remove();
          document.documentElement.dir = previous;
          return JSON.stringify(report);
        })()
      `);

      // The paragraph really was mirrored, so the measurement is about something.
      expect(measured.rtl).toBe(true);
      expect(measured.text).toBe('\u22121.00R');
      // The sign is painted to the *left* of the last character: the figure reads sign-first, which is
      // the order a reader of a trading terminal expects regardless of the sentence around it.
      expect(measured.signLeft).toBeLessThan(measured.tailLeft);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* H. The language switch (Phase 7.5.3.1)                                  */
  /* ---------------------------------------------------------------------- */

  describe('the language switch, in a browser', () => {
    /** The three controls, as the browser holds them: their label and whether each is pressed. */
    interface SwitchState {
      labels: string[];
      pressed: string[];
      caption: string;
    }

    /**
     * The switch's own labels, read from the catalogue the interface reads them from.
     *
     * This is the one control whose wording has to survive its own effect: once Persian is chosen the three
     * buttons are Persian too, so a case has to ask for the labels of the language it expects to be looking at.
     */
    const OPTION_KEYS = {
      auto: 'settings.languageAutomatic',
      fa: 'settings.languagePersian',
      en: 'settings.languageEnglish',
    } as const satisfies Record<string, MessageKey>;
    const inLanguage = (locale: UiLocale): readonly string[] => [
      translate(locale, OPTION_KEYS.auto),
      translate(locale, OPTION_KEYS.fa),
      translate(locale, OPTION_KEYS.en),
    ];
    const english = inLanguage('en');
    const persian = inLanguage('fa');

    const readSwitch = (labels: readonly string[]): Promise<SwitchState> =>
      session.evaluateJson<SwitchState>(`
        (() => {
          const main = document.querySelector('main');
          const known = ${JSON.stringify(labels)};
          const buttons = [...(main?.querySelectorAll('button[aria-pressed]') ?? [])].filter(
            (button) => known.includes((button.textContent ?? '').trim()),
          );
          // The nearest container that also holds prose is the switch's own card, which is where the
          // caption lives — found structurally rather than by matching the copy it happens to have.
          let card = buttons[0]?.parentElement ?? null;
          while (card && !card.querySelector('p')) card = card.parentElement;
          return JSON.stringify({
            labels: buttons.map((button) => (button.textContent ?? '').trim()),
            pressed: buttons
              .filter((button) => button.getAttribute('aria-pressed') === 'true')
              .map((button) => (button.textContent ?? '').trim()),
            caption: (card?.querySelector('p')?.textContent ?? '').trim(),
          });
        })()
      `);

    const clickSwitch = (label: string): Promise<boolean> =>
      session.evaluate<boolean>(`
        (() => {
          const button = [...document.querySelectorAll('main button')].find(
            (item) => (item.textContent ?? '').trim() === ${JSON.stringify(label)},
          );
          if (!button) return false;
          button.click();
          return true;
        })()
      `);

    const openSettings = async (locale: UiLocale): Promise<void> => {
      await session.clickNav(translate(locale, 'shell.nav.settings.label'));
      await session.waitFor(
        `(document.querySelector('main h2')?.textContent?.trim() ?? '') === ${JSON.stringify(translate(locale, 'shell.nav.settings.label'))}`,
        'the Settings page',
      );
      await session.waitFor(
        `[...document.querySelectorAll('main button')].some(
           (item) => ${JSON.stringify(inLanguage(locale))}.includes((item.textContent ?? '').trim()))`,
        'the language switch to be rendered',
      );
    };

    it('offers one choice with a visible selected state, and remembers it across a reload', async () => {
      await session.setViewport(1440, 900);
      // The suite runs in a throwaway profile, so this is belt-and-braces: the switch is about the
      // choice being made *now*, not about whatever a previous spec left behind.
      await startIn(null);
      await openSettings('en');

      const initial = await readSwitch(english);
      expect(initial.labels).toEqual([...english]);
      // Exactly one option is selected, so "unselected" is a state a person can see.
      expect(initial.pressed).toEqual([english[0]]);

      expect(await clickSwitch(english[1] ?? '')).toBe(true);
      // Choosing Persian is choosing the *interface* language: the same three controls come back in
      // Persian, the selected state moved, and the page around them changed with it.
      const chosen = await readSwitch(persian);
      expect(chosen.pressed).toEqual([persian[1]]);
      expect(chosen.caption).not.toBe(initial.caption);
      expect(chosen.caption).toContain(persian[1] ?? '');

      // The choice reached storage under its own namespaced key, which is what "exposed to the language
      // system" means in a build with no settings API.
      expect(
        await session.evaluate<string>(
          `localStorage.getItem(${JSON.stringify(LANGUAGE_PREFERENCE_KEY)}) ?? ''`,
        ),
      ).toBe('fa');

      // The document language and the visible chrome followed, across the shell rather than in one card.
      expect(await session.evaluate<string>('document.documentElement.lang')).toBe('fa-IR');
      expect(await session.evaluate<string>("document.body.textContent ?? ''")).toContain(
        translate('fa', 'shell.nav.settings.label'),
      );
      // Including the navigation landmark's own name, which is what a screen reader announces before the
      // entries it holds — the shell's structure is as translatable as its words.
      expect(
        await session.evaluate<string>(
          "document.querySelector('nav')?.getAttribute('aria-label') ?? ''",
        ),
      ).toBe(translate('fa', 'shell.navPrimary'));

      // And it survives a restart of the application, because it is read when the store is created
      // rather than reset by it.
      await session.goto(`${server.origin}/`);
      await openSettings('fa');
      expect((await readSwitch(persian)).pressed).toEqual([persian[1]]);
      expect(await session.evaluate<string>('document.documentElement.lang')).toBe('fa-IR');

      // The switch is a choice, not a one-way door: going back to automatic returns the whole interface
      // to English in the same session, without a reload.
      expect(await clickSwitch(persian[0] ?? '')).toBe(true);
      expect((await readSwitch(english)).pressed).toEqual([english[0]]);
      expect(await session.evaluate<string>('document.documentElement.lang')).toBe('en');
    });

    it('is reachable and does not overflow at phone width, in either language', async () => {
      await session.setViewport(375, 812);

      const measure = async (
        labels: readonly string[],
      ): Promise<{ overflow: number; visible: number; width: number }> =>
        session.evaluateJson<{
          overflow: number;
          visible: number;
          width: number;
        }>(`
          (() => {
            const known = ${JSON.stringify(labels)};
            const buttons = [...document.querySelectorAll('main button')].filter(
              (item) => known.includes((item.textContent ?? '').trim()),
            );
            const visible = buttons.filter((button) => {
              const box = button.getBoundingClientRect();
              return box.width > 0 && box.height > 0 && box.right <= window.innerWidth + 0.5;
            });
            return JSON.stringify({
              overflow: document.documentElement.scrollWidth - window.innerWidth,
              visible: visible.length,
              width: Math.max(0, ...buttons.map((button) => button.getBoundingClientRect().width)),
            });
          })()
        `);

      await startIn('en');
      await openSettings('en');
      const englishLayout = await measure(english);

      // The same three controls in Persian, because a translation that fits only in the language it was
      // written in is not a translated interface.
      await startIn('fa');
      await openSettings('fa');
      const persianLayout = await measure(persian);

      // All three options fit the smallest width the design commits to, in both languages, and neither
      // pushes the page sideways.
      expect(englishLayout.visible).toBe(3);
      expect(persianLayout.visible).toBe(3);
      expect(englishLayout.width).toBeGreaterThan(0);
      expect(persianLayout.width).toBeGreaterThan(0);
      expect(
        englishLayout.overflow,
        'the language switch panned the phone layout',
      ).toBeLessThanOrEqual(0);
      expect(
        persianLayout.overflow,
        'the Persian switch panned the phone layout',
      ).toBeLessThanOrEqual(0);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* I. The writing direction (Phase 7.5.3.4.4)                             */
  /* ---------------------------------------------------------------------- */

  /**
   * Phase 7.5.3.3 translated the interface. This phase is what makes the translation *readable*, by giving the
   * writing direction the shape the language already has: a default that follows the language, and two pins for
   * somebody who wants the words without the mirror.
   *
   * Every claim below is measured off a rendered box rather than asserted against the stylesheet, because a
   * mirror is a statement about a layout engine. Four questions, none of which a source scan can answer:
   *
   *   - did the rail actually move to the other side of the window, and does a Persian heading hug the other
   *     edge — or is it a Latin sentence left-aligned inside a Persian page?
   *   - does the interface hold together once mirrored, at 1440, 768 and 390?
   *   - did any component's *box* change size while the interface turned around? That is the whole difference
   *     between logical spacing and physical spacing: a mirror moves things and resizes nothing.
   *   - does a Latin sentence inside the Persian page stay left-to-right, in the same transcript?
   */
  describe('the writing direction, in a browser', () => {
    /** The three choices, named the way the interface names them in whichever language is on screen. */
    const DIRECTION_OPTION_KEYS = {
      auto: 'settings.directionAutomatic',
      ltr: 'settings.leftToRight',
      rtl: 'settings.rightToLeft',
    } as const satisfies Record<string, MessageKey>;

    const option = (locale: UiLocale, choice: keyof typeof DIRECTION_OPTION_KEYS): string =>
      translate(locale, DIRECTION_OPTION_KEYS[choice]);

    const directionLabels = (locale: UiLocale): readonly string[] => [
      option(locale, 'auto'),
      option(locale, 'ltr'),
      option(locale, 'rtl'),
    ];

    /** Open Settings in this language, and wait for the direction switch to be on screen. */
    const openDirectionSwitch = async (locale: UiLocale): Promise<void> => {
      await session.clickNav(translate(locale, 'shell.nav.settings.label'));
      await session.waitFor(
        `[...document.querySelectorAll('main button')].some(
           (item) => ${JSON.stringify(directionLabels(locale))}.includes((item.textContent ?? '').trim()))`,
        'the direction switch to be rendered',
      );
    };

    /**
     * Press one of the three direction options, by the word it shows.
     *
     * Refuses to press the option that is already selected: a click on the current choice changes nothing, and
     * a case that measured "the pin worked" after such a click would be measuring the state it started in.
     */
    const chooseDirection = (label: string): Promise<boolean> =>
      session.evaluate<boolean>(`
        (() => {
          const button = [...document.querySelectorAll('main button')].find(
            (item) => (item.textContent ?? '').trim() === ${JSON.stringify(label)},
          );
          if (!button || button.getAttribute('aria-pressed') === 'true') return false;
          button.click();
          return true;
        })()
      `);

    /** What the document says about itself, and which side of the window the shell's rail is on. */
    interface ShellReport {
      dir: string;
      lang: string;
      computed: string;
      railLeft: number;
      railRight: number;
      viewport: number;
    }

    const shell = (): Promise<ShellReport> =>
      session.evaluateJson<ShellReport>(`
        (() => {
          const rail = document.querySelector('aside');
          const box = rail ? rail.getBoundingClientRect() : null;
          return JSON.stringify({
            dir: document.documentElement.dir,
            lang: document.documentElement.lang,
            computed: getComputedStyle(document.documentElement).direction,
            railLeft: box ? Math.round(box.left) : -1,
            railRight: box ? Math.round(box.right) : -1,
            viewport: window.innerWidth,
          });
        })()
      `);

    /**
     * Where the first thing in the selected navigation entry — its icon — sits inside that entry.
     *
     * A row that follows the flow puts its icon at the inline start, which is one edge in English and the other
     * in Persian. Measured from both edges at once, so it says which side it hugged rather than only that it
     * moved: the entry is a full-width button, so there is always room between the two numbers.
     */
    interface RowReport {
      label: string;
      fromLeft: number;
      fromRight: number;
    }

    const activeRow = (): Promise<RowReport | null> =>
      session.evaluateJson<RowReport | null>(`
        (() => {
          const button = document.querySelector('nav button[aria-current="page"]');
          const icon = button?.firstElementChild;
          if (!button || !icon) return JSON.stringify(null);
          const box = button.getBoundingClientRect();
          const iconBox = icon.getBoundingClientRect();
          return JSON.stringify({
            label: (button.textContent ?? '').trim(),
            fromLeft: Math.round(iconBox.left - box.left),
            fromRight: Math.round(box.right - iconBox.right),
          });
        })()
      `);

    /**
     * The page heading's *painted* extent, against the box that holds it.
     *
     * `text-align: start` is the rule; the measurement is where the glyphs actually went. A box wider than its
     * own text has slack on one side, and which side it is on is the difference between a mirrored page and a
     * translated string left-aligned inside an English one. A `Range` over the heading's contents reports the
     * advance box of the text rather than the block it sits in, which is what makes the comparison meaningful.
     */
    interface HeadingReport {
      text: string;
      direction: string;
      textAlign: string;
      slackLeft: number;
      slackRight: number;
    }

    const pageHeading = (): Promise<HeadingReport | null> =>
      session.evaluateJson<HeadingReport | null>(`
        (() => {
          const heading = document.querySelector('main h2');
          if (!heading) return JSON.stringify(null);
          const range = document.createRange();
          range.selectNodeContents(heading);
          const painted = range.getBoundingClientRect();
          const box = heading.getBoundingClientRect();
          const style = getComputedStyle(heading);
          return JSON.stringify({
            text: (heading.textContent ?? '').trim(),
            direction: style.direction,
            textAlign: style.textAlign,
            slackLeft: Math.round(painted.left - box.left),
            slackRight: Math.round(box.right - painted.right),
          });
        })()
      `);

    /**
     * Every box in the workspace, as the layout engine currently has it.
     *
     * Size and not position: moving is what mirroring is for, and resizing is the thing it must never do. DOM
     * order is stable under `dir`, so the two readings line up element by element with no keys to match.
     */
    interface Box {
      tag: string;
      cls: string;
      width: number;
      height: number;
    }

    const BOXES = `JSON.stringify([...document.querySelectorAll('main *')].map((element) => {
      const box = element.getBoundingClientRect();
      return {
        tag: element.tagName.toLowerCase(),
        cls: String(element.className ?? '').split(' ').slice(0, 2).join('.'),
        width: Math.round(box.width * 10) / 10,
        height: Math.round(box.height * 10) / 10,
      };
    }))`;

    /**
     * Read a probe twice, until two consecutive readings agree.
     *
     * Condition-based rather than a pause: the pages animate in and a tab swap re-renders its panel, so a
     * measurement taken mid-flight would report whatever frame it happened to catch. That is the kind of flake
     * that makes a parity case worse than no case at all.
     */
    const settled = async <T>(probe: string, description: string): Promise<T> => {
      await session.waitFor(
        `(() => { const now = ${probe}; if (window.__mtProbe === now) return true; window.__mtProbe = now; return false; })()`,
        description,
      );
      return session.evaluateJson<T>(probe);
    }; /** The boxes of everything in the workspace, once the layout has stopped moving. */
    const boxes = (): Promise<Box[]> =>
      settled<Box[]>(BOXES, 'the workspace layout to stop moving');

    /** How many tab panels the walk below actually opened, so a vacuous one cannot pass as coverage. */
    let panelsOpened = 0;

    it('mirrors the shell and the page from the interface language alone', async () => {
      await session.setViewport(1440, 900);
      await startIn('en');
      await visitIn('en', 'dashboard');
      const english = await shell();
      const englishRow = await activeRow();
      const englishHeading = await pageHeading();

      // English is left-to-right: the document says so, the rail is against the left edge, and the selected
      // entry's icon starts there too.
      expect(english.dir).toBe('ltr');
      expect(english.computed).toBe('ltr');
      expect(english.lang).toBe('en');
      expect(english.railLeft).toBeLessThan(english.viewport / 2);
      expect(englishRow?.label).toBe(translate('en', 'shell.nav.dashboard.label'));
      expect(englishRow?.fromLeft).toBeLessThan(englishRow?.fromRight ?? -1);
      // The heading is aligned to the *start* of the line, which in English is the left edge...
      expect(englishHeading?.direction).toBe('ltr');
      expect(englishHeading?.textAlign).toBe('start');
      expect(englishHeading?.slackLeft).toBeLessThanOrEqual(1);
      // ...and there really is slack on the other side, so the next measurement is about something.
      expect(englishHeading?.slackRight).toBeGreaterThan(20);

      // Choosing Persian mirrors the whole interface. There is no second control and no reload involved: the
      // direction is derived from the language, which is the phase's central decision.
      await startIn('fa');
      await visitIn('fa', 'dashboard');
      const persian = await shell();
      const persianRow = await activeRow();
      const persianHeading = await pageHeading();

      expect(persian.dir).toBe('rtl');
      expect(persian.computed).toBe('rtl');
      expect(persian.lang).toBe('fa-IR');
      // The rail is the shell's first element and every spacing rule around it is a logical property, so it is
      // at the *inline start* edge — which in a right-to-left interface is the other side of the window.
      expect(persian.railLeft).toBeGreaterThan(persian.viewport / 2);
      // The entry's own name, not the page heading: the sidebar says «داشبورد» and titles the page «داشبورد
      // آموزش», which is the pair the page-rendering cases above hold every entry to.
      expect(persianRow?.label).toBe(translate('fa', 'shell.nav.dashboard.label'));
      expect(persianRow?.fromRight).toBeLessThan(persianRow?.fromLeft ?? -1);
      // And the heading is still aligned to the start of its line, which is now the right edge.
      expect(persianHeading?.text).toBe(headingFor('fa', 'dashboard'));
      expect(persianHeading?.direction).toBe('rtl');
      expect(persianHeading?.textAlign).toBe('start');
      expect(persianHeading?.slackRight).toBeLessThanOrEqual(1);
      expect(persianHeading?.slackLeft).toBeGreaterThan(20);

      // The slack numbers are deliberately not compared between the two languages: the heading's box is sized
      // by its own copy, so a shorter Persian sentence legitimately leaves more room. What the pair above
      // states is the direction-shaped half of it — the words sit against the start edge, and the start edge is
      // the other side. That the box itself does not move when *only* the direction does is the next case.

      // Hand the suite back an interface whose language it did not choose.
      await startIn(null);
    });

    it('offers the direction as its own choice, and lets a pin outrank the language', async () => {
      await session.setViewport(1440, 900);
      await startIn('fa');
      await openDirectionSwitch('fa');
      expect(await session.evaluate<string>('document.documentElement.dir')).toBe('rtl');

      // A pin is a second opinion about the flow and about nothing else: the words do not change, and the page
      // keeps the heading the language gave it.
      expect(await chooseDirection(option('fa', 'ltr'))).toBe(true);
      await session.waitFor(`document.documentElement.dir === 'ltr'`, 'the left-to-right pin');
      expect(await session.evaluate<string>('document.documentElement.lang')).toBe('fa-IR');
      expect(await heading()).toBe(headingFor('fa', 'settings'));

      expect(await chooseDirection(option('fa', 'rtl'))).toBe(true);
      await session.waitFor(`document.documentElement.dir === 'rtl'`, 'the right-to-left pin');

      // Automatic is the language's own answer, which is the state the case started in.
      expect(await chooseDirection(option('fa', 'auto'))).toBe(true);
      await session.waitFor(
        `document.documentElement.dir === 'rtl'`,
        'the automatic answer for Persian',
      );

      // And the other way round, so the pin is proved to be a pin rather than a second language switch:
      // English, laid out right-to-left.
      await startIn('en');
      await openDirectionSwitch('en');
      expect(await session.evaluate<string>('document.documentElement.dir')).toBe('ltr');
      expect(await chooseDirection(option('en', 'rtl'))).toBe(true);
      await session.waitFor(
        `document.documentElement.dir === 'rtl'`,
        'the pin over an English interface',
      );
      expect(await session.evaluate<string>('document.documentElement.lang')).toBe('en');

      expect(await chooseDirection(option('en', 'auto'))).toBe(true);
      await session.waitFor(
        `document.documentElement.dir === 'ltr'`,
        'the automatic answer for English',
      );

      // The shell's own control is the same decision, one press away from any page, and it says which way it
      // will turn the interface the next time it is pressed.
      const pressed = (): Promise<boolean> =>
        session.evaluate<boolean>(`
          [...document.querySelectorAll('button')].some(
            (item) => item.getAttribute('aria-label') === ${JSON.stringify(
              translate('en', 'topbar.toggleWritingDirection'),
            )} && item.getAttribute('aria-pressed') === 'true')
        `);
      expect(await pressed()).toBe(false);
      expect(await toggleWritingDirection('en')).toBe(true);
      await session.waitFor(
        `document.documentElement.dir === 'rtl'`,
        'the topbar toggle to mirror',
      );
      expect(await pressed()).toBe(true);
      expect(await toggleWritingDirection('en')).toBe(true);
      await session.waitFor(
        `document.documentElement.dir === 'ltr'`,
        'the topbar toggle to un-mirror',
      );
      expect(await pressed()).toBe(false);

      await startIn(null);
    });

    /**
     * The three sizes the phase asks for: a desktop, a portrait tablet, and the narrowest phone the design
     * still commits to. The phases before this one checked the English layout at all seven; this checks the
     * *mirrored* one, which is where a physical utility would finally show up as a defect.
     */
    const MIRRORED_SIZES: readonly (readonly [number, number])[] = [
      [1440, 900],
      [768, 1024],
      [390, 844],
    ];

    /**
     * Everything on the page that is wider than the window or wider than its own box, named rather than counted.
     *
     * "The page overflows" is unfixable; "<div> at +212px" is a bug report. The two probes are the ones the
     * English layout is already held to at every width — this asks the same question of the mirrored one, where
     * a physical utility finally shows up.
     */
    const layoutDefects = async (where: string): Promise<string[]> => {
      const offenders: string[] = [];

      const overflow = await session.evaluateJson<OverflowReport>(OVERFLOW_PROBE);
      if (overflow.documentScrollWidth > overflow.limit) {
        offenders.push(
          `${where}: the document is ${overflow.documentScrollWidth}px wide in a ${overflow.limit}px viewport`,
        );
      }
      for (const finding of overflow.findings) {
        offenders.push(
          `${where}: <${finding.tag}> "${finding.detail}" reaches ${finding.right}px past the edge`,
        );
      }

      // ...and Persian text fits the box it was given. A translated sentence is usually longer than the English
      // one it replaced, so a mirror is where a label that only ever fitted in English is caught.
      const clipping = await session.evaluateJson<ClippingReport>(CLIPPING_PROBE);
      for (const item of clipping.sample) {
        if (!item.truncate) {
          offenders.push(
            `${where}: <${item.tag}> "${item.text}" overflows its box by ${item.overBy}px`,
          );
        }
      }
      return offenders;
    };

    it('lays every page out right-to-left at desktop, tablet and phone sizes', async () => {
      const offenders: string[] = [];

      for (const [width, height] of MIRRORED_SIZES) {
        await session.setViewport(width, height);
        await startIn('fa');
        expect(
          await session.evaluate<string>('document.documentElement.dir'),
          `the interface is not mirrored at ${width}px`,
        ).toBe('rtl');

        for (const section of NAV_SECTIONS) {
          await visitIn('fa', section.id);
          offenders.push(...(await layoutDefects(`${section.id} @${width}`)));

          // Every tab as well, at the narrowest width: a panel is where a physical utility would hide, and a
          // phone is where it would show. The other two sizes sweep the page each one opens on.
          if (width !== 390) continue;
          const tabs = await session.tabCount();
          for (let index = 0; index < tabs; index += 1) {
            if (await session.tabSelected(index)) continue;
            await session.selectTab(index, section.id);
            panelsOpened += 1;
            offenders.push(...(await layoutDefects(`${section.id} tab ${index} @${width}`)));
          }
        }
      }

      // The walk opened panels rather than describing them: a loop that silently found no tabs would look like
      // a clean result and would be worth nothing.
      expect(panelsOpened).toBeGreaterThan(20);
      expect(offenders).toEqual([]);

      await startIn(null);
    }, 300_000);

    /**
     * One group a person reads as a *line*: where its items were painted, and which way its box resolved.
     *
     * The left edges are the measurement rather than the markup, because a class name cannot state the order:
     * `flex` says nothing about which edge the first child lands on, and `dir` is an attribute. A row that
     * reads right-to-left has descending edges, one that reads left-to-right has ascending ones.
     */
    interface FlowRow {
      label: string;
      direction: string;
      lefts: number[];
      /** The index that says it is selected, in source order; `-1` when none does. */
      selected: number;
      /** Whether the selected item is drawn inside the row rather than outside it. */
      activeInside: boolean;
    }

    interface FlowReport {
      direction: string;
      panels: string[];
      strips: FlowRow[];
      rows: FlowRow[];
      navigation: FlowEntry[];
    }

    /**
     * One navigation entry, measured from both edges at once.
     *
     * The rail is the shell's navigation group and it is a *column*, so it has no reading order to check —
     * what direction decides there is which side each row's icon sits on. A row that follows the flow puts
     * its icon at the inline start, which is the other side in Persian, so both distances are read and the
     * pair says which edge it hugged rather than only that something moved.
     */
    interface FlowEntry {
      label: string;
      direction: string;
      fromStart: number;
      fromEnd: number;
    }

    /**
     * The laid-out shape of every group a person reads as a line.
     *
     * A "row" is a container whose children hold a control *and* share one top edge — which is what a flex
     * row and a grid track both are, and is why this finds the segmented controls, the filter rails and the
     * two-column pairs without naming any of them. The innermost row wins: a container that holds another row
     * is that row's ancestor, not a second reading of it.
     */
    const FLOW_PROBE = `
(() => {
  const main = document.querySelector('main');
  if (!main) return JSON.stringify(null);

  const direction = getComputedStyle(document.documentElement).direction;
  const lefts = (elements) => elements.map((el) => Math.round(el.getBoundingClientRect().left));
  const label = (elements) =>
    (elements[0].textContent || elements[0].getAttribute('aria-label') || elements[0].tagName)
      .trim()
      .slice(0, 26);
  const row = (container, items) => {
    const selected = items.findIndex((item) => item.getAttribute('aria-selected') === 'true');
    const painted = lefts(items);
    return {
      label: label(items),
      direction: getComputedStyle(container).direction,
      lefts: painted,
      selected,
      activeInside:
        selected >= 0 &&
        items[selected].getBoundingClientRect().width > 0 &&
        (painted[selected] ?? 0) >= Math.min(...painted) &&
        (painted[selected] ?? 0) <= Math.max(...painted),
    };
  };

  const list = main.querySelector('[role="tablist"]');
  const tabs = list ? [...list.querySelectorAll('[role="tab"]')] : [];
  const strips = tabs.length === 0 ? [] : [row(list, tabs)];

  const candidates = [];
  for (const container of main.querySelectorAll('div, ul, nav, fieldset')) {
    const items = [...container.children].filter(
      (child) => child.matches('button, a, input, select') ||
        child.querySelector('button, a, input, select') !== null,
    );
    if (items.length < 2) continue;
    // One row means one top edge: a column of groups is not a line, and neither is a stack of cards.
    if (new Set(items.map((item) => Math.round(item.getBoundingClientRect().top))).size !== 1) continue;
    candidates.push({ container, items });
  }

  const rows = candidates
    .filter((candidate) =>
      !candidates.some((other) => other !== candidate && candidate.container.contains(other.container)),
    )
    .map((candidate) => row(candidate.container, candidate.items));

  const navigation = [...document.querySelectorAll('aside nav button')].map((entry) => {
    const box = entry.getBoundingClientRect();
    const own = getComputedStyle(entry).direction;
    const first = entry.firstElementChild;
    const icon = first === null ? null : first.getBoundingClientRect();
    return {
      label: (entry.getAttribute('aria-label') || entry.textContent || '').trim().slice(0, 22),
      direction: own,
      fromStart: icon === null ? -1 : Math.round(own === 'rtl' ? box.right - icon.right : icon.left - box.left),
      fromEnd: icon === null ? -1 : Math.round(own === 'rtl' ? icon.left - box.left : box.right - icon.right),
    };
  });

  return JSON.stringify({
    direction,
    panels: [...main.querySelectorAll('[role="tabpanel"]')].map(
      (panel) => getComputedStyle(panel).direction,
    ),
    strips,
    rows,
    navigation,
  });
})()`;

    /**
     * Every group of controls, read from the edge the page it sits on is written from.
     *
     * Three controls share one claim: a tab strip, a segmented control and a navigation rail all put the
     * source's first item at the start of the line, and the start of the line is the other side in Persian.
     * Two of the three arrive on their own — a plain flex row follows the flow — but a **Radix** group does
     * not. Radix resolves a tab group's direction from its own `dir` prop, from a `DirectionProvider` above
     * it, or, with neither, from the literal `'ltr'`, which it stamps on the element it renders. This product
     * passed neither of the first two, so a Persian interface had a left-to-right tab strip *and*
     * left-to-right panels inside a right-to-left document: the strip read from the wrong edge, and every
     * heading, paragraph and card inside every panel was aligned to the left of its box.
     *
     * So this walks the shell the way the other cases do — every page, and every tab of every page — and asks
     * each group two questions: which way did its box resolve, and which way were its items painted. The
     * panel's direction is read from `getComputedStyle` rather than from its attributes, so an *inherited*
     * answer is caught as well as a declared one, which is the whole of the original defect.
     *
     * The active item is measured too: exactly one tab is selected, and it is painted inside the strip that
     * claims it. A marker that has slid off the end of its own row is the shape this bug had when the strip
     * scrolled the other way.
     */
    it('reads every group of controls from the edge its page is written from', async () => {
      await session.setViewport(1440, 900);
      await startIn('fa');

      const offenders: string[] = [];
      let strips = 0;
      let rows = 0;
      let panels = 0;
      let navigation = 0;

      /**
       * The order a row was painted in, against the order it is written in.
       *
       * `<=` and `>=` rather than a strict comparison: two items whose boxes begin at the same pixel are
       * stacked rather than sequenced, and reporting that would be reporting a layout nobody can see. The
       * edges are whole pixels, so the comparison is between positions a person could point at.
       */
      const misordered = (group: FlowRow, where: string): string[] => {
        const descending = group.direction === 'rtl';
        const found: string[] = [];
        for (let index = 1; index < group.lefts.length; index += 1) {
          const previous = group.lefts[index - 1] ?? 0;
          const current = group.lefts[index] ?? 0;
          if (descending ? current > previous : current < previous) {
            found.push(
              `${where}: "${group.label}" paints item ${index} at ${current}px after item ${index - 1} at ` +
                `${previous}px in a ${group.direction} group`,
            );
          }
        }
        return found;
      };

      const inspect = async (where: string): Promise<void> => {
        const report = await settled<FlowReport | null>(FLOW_PROBE, `${where} to settle`);
        expect(report, `${where} has no workspace to measure`).not.toBeNull();
        if (report === null) return;

        for (const panel of report.panels) {
          panels += 1;
          if (panel !== report.direction) {
            offenders.push(
              `${where}: a tab panel is laid out ${panel} inside a ${report.direction} page`,
            );
          }
        }
        for (const strip of report.strips) {
          strips += 1;
          if (strip.direction !== report.direction) {
            offenders.push(
              `${where}: the tab strip is laid out ${strip.direction} inside a ${report.direction} page`,
            );
          }
          if (strip.selected < 0) offenders.push(`${where}: the tab strip has no selected tab`);
          if (strip.selected >= 0 && !strip.activeInside) {
            offenders.push(
              `${where}: the selected tab is painted outside the strip that claims it`,
            );
          }
          offenders.push(...misordered(strip, where));
        }
        for (const group of report.rows) {
          rows += 1;
          if (group.direction !== report.direction) {
            offenders.push(
              `${where}: a group of controls is laid out ${group.direction} inside a ${report.direction} page`,
            );
          }
          offenders.push(...misordered(group, where));
        }
        for (const entry of report.navigation) {
          navigation += 1;
          if (entry.direction !== report.direction) {
            offenders.push(
              `${where}: the navigation entry "${entry.label}" is laid out ${entry.direction} inside a ${report.direction} page`,
            );
          }
          // The icon hugs the start edge of its row: nearer that edge than the other one, and no further in
          // than the row's own padding — which is what a nav row that follows the flow looks like in either
          // direction. The bound is loose on purpose: the exact offset is a spacing token's business.
          if (entry.fromStart < 0 || entry.fromStart > 24 || entry.fromStart > entry.fromEnd) {
            offenders.push(
              `${where}: the navigation entry "${entry.label}" puts its icon ${entry.fromStart}px from the ` +
                `start edge and ${entry.fromEnd}px from the other`,
            );
          }
        }
      };

      for (const section of NAV_SECTIONS) {
        await visitIn('fa', section.id);
        await inspect(section.id);

        const tabs = await session.tabCount();
        for (let index = 0; index < tabs; index += 1) {
          if (await session.tabSelected(index)) continue;
          await session.selectTab(index, section.id);
          await inspect(`${section.id} · tab ${index}`);
        }
      }

      // The walk measured something, rather than finding no groups and reporting a clean result.
      expect(strips, 'no tab strip was measured').toBeGreaterThan(8);
      expect(rows, 'no group of controls was measured').toBeGreaterThan(20);
      expect(panels, 'no tab panel was measured').toBeGreaterThan(20);
      expect(navigation, 'no navigation entry was measured').toBeGreaterThan(100);
      expect(offenders, 'a group of controls does not follow the page it sits on').toEqual([]);

      // And the same groups in English, where the answer is the other way round: the source's first item is
      // the leftmost one. Measured rather than assumed, because a rule that always *descends* would satisfy
      // the Persian half on its own and say nothing about the language this interface was written in first.
      await startIn('en');
      const ascending: string[] = [];
      let englishStrips = 0;
      for (const id of ['dashboard', 'journal', 'exams', 'lab', 'settings'] as const) {
        await visitIn('en', id);
        const report = await settled<FlowReport | null>(FLOW_PROBE, `the ${id} page to settle`);
        expect(report?.direction, `the ${id} page is not left-to-right in English`).toBe('ltr');
        for (const strip of report?.strips ?? []) {
          englishStrips += 1;
          ascending.push(...misordered(strip, `en ${id}`));
        }
        for (const group of report?.rows ?? []) ascending.push(...misordered(group, `en ${id}`));
        for (const entry of report?.navigation ?? []) {
          if (entry.fromStart < 0 || entry.fromStart > 24 || entry.fromStart > entry.fromEnd) {
            ascending.push(
              `en ${id}: the navigation entry "${entry.label}" puts its icon ${entry.fromStart}px from the ` +
                `start edge and ${entry.fromEnd}px from the other`,
            );
          }
        }
      }
      expect(englishStrips, 'no English tab strip was measured').toBeGreaterThan(3);
      expect(ascending, 'a group of controls does not follow an English page').toEqual([]);

      await startIn(null);
    }, 300_000);

    it('turns the interface around without changing a single box', async () => {
      await session.setViewport(1440, 900);
      await startIn('fa');
      const pages = ['dashboard', 'portfolio', 'evaluation', 'journal', 'settings'] as const;

      const mirrored: Record<string, Box[]> = {};
      for (const id of pages) {
        await visitIn('fa', id);
        mirrored[id] = await boxes();
      }

      // The same language and the same words, laid out the other way.
      await openDirectionSwitch('fa');
      expect(await chooseDirection(option('fa', 'ltr'))).toBe(true);
      await session.waitFor(
        `document.documentElement.dir === 'ltr'`,
        'the pinned left-to-right layout',
      );

      for (const id of pages) {
        await visitIn('fa', id);
        const pinned = await boxes(); // A half-pixel of tolerance, and not more: an inline box that shrinks to its own text is measured from
        // the advance widths of its runs, and bidi reordering can land the same run on a different sub-pixel
        // fraction in the other direction. Anything a person could see is a whole pixel and is still caught.
        const sameSize = (left: number, right: number | undefined): boolean =>
          right !== undefined && Math.abs(left - right) <= 0.5;
        const differing = (mirrored[id] ?? [])
          .map((box, index) => ({ box, other: pinned[index] }))
          .filter(
            ({ box, other }) =>
              !other || !sameSize(box.width, other.width) || !sameSize(box.height, other.height),
          )
          .map(
            ({ box, other }) =>
              `<${box.tag} class="${box.cls}"> ${box.width}x${box.height} → ${other?.width}x${other?.height}`,
          );
        // The count first, because "the same number of elements, differently sized" and "a different tree"
        // are different bugs and the diff below would be unreadable for the second one.
        expect({ id, count: pinned.length, differing }).toEqual({
          id,
          count: (mirrored[id] ?? []).length,
          differing: [],
        });
      }

      await startIn(null);
    }, 240_000);

    it('keeps every page title in the language it is being read in', async () => {
      await session.setViewport(1440, 900);
      await startIn('fa');

      // The page-by-page half of the title contract, read from the Persian interface itself: `visitIn` waits
      // for the heading to equal the word the entry that opens the page shows, so a page whose title was never
      // translated cannot pass. Three pages used to declare an English `TITLE` beside a translated description.
      const seen: Record<string, string> = {};
      for (const section of NAV_SECTIONS) {
        await visitIn('fa', section.id);
        seen[section.id] = await heading();
      }
      expect(seen).toEqual(
        Object.fromEntries(
          NAV_SECTIONS.map((section) => [section.id, headingFor('fa', section.id)]),
        ),
      );

      await startIn(null);
    }, 120_000);

    it('keeps every signed figure sign-first, on every page', async () => {
      await session.setViewport(1440, 900);
      await startIn('fa');

      // The corruption this catches is a *painting* defect: `+3` is a correct string in a right-to-left
      // paragraph, and it draws as `3+` because a leading sign is a neutral to the bidi algorithm. `.num`
      // isolates a figure from the sentence it sits in, and the probe reads where the glyphs went.
      const broken: string[] = [];
      const inspect = async (where: string): Promise<void> => {
        const report = await settled<SignedFigureReport>(SIGNED_FIGURE_PROBE, `${where} to settle`);
        for (const finding of report.findings) {
          broken.push(
            `${where}: "${finding.figure}" drew its sign at ${finding.signLeft}px and its first digit at ` +
              `${finding.digitLeft}px (<${finding.tag} class="${finding.detail}">${finding.isolated ? ', inside .num' : ''})`,
          );
        }
      };

      for (const section of NAV_SECTIONS) {
        await visitIn('fa', section.id);
        await inspect(section.id);

        // Every tab as well as the page it opens on. This is where the figures actually are: the journal's
        // analytics and calendar, the exam scores, the portfolio's holdings — a scan of the default tab of
        // every page would have looked thorough and missed the row of R-multiples it was written for.
        const tabs = await session.tabCount();
        for (let index = 0; index < tabs; index += 1) {
          if (await session.tabSelected(index)) continue;
          await session.selectTab(index, section.id);
          panelsOpened += 1;
          await inspect(`${section.id} · tab ${index}`);
        }
      }

      expect(panelsOpened, 'no tab panel was inspected').toBeGreaterThan(20);
      expect(broken, 'a signed figure was reversed by the right-to-left layout').toEqual([]);

      await startIn(null);
    }, 180_000);

    it('lets each turn carry its own direction inside a mirrored transcript', async () => {
      await session.setViewport(1440, 900);
      await startIn('fa');
      await visitIn('fa', 'agent');

      expect(await session.evaluate<string>('document.documentElement.dir')).toBe('rtl');

      /**
       * The turns, read from the `article` each one is rather than from every paragraph on the page.
       *
       * The page also renders a failure notice above the transcript, whose title is a `dir="auto"` paragraph too
       * — scoping to the turns keeps "the conversation" and "a notification" as two separate claims instead of
       * one blurred count.
       */
      interface TurnReport {
        declared: string;
        computed: string;
        text: string;
        top: number;
      }
      const turns = await session.evaluateJson<TurnReport[]>(`
        JSON.stringify(
          [...document.querySelectorAll('main article')]
            .map((article) => {
              const body = article.querySelector('p[dir="auto"]');
              if (!body) return null;
              return {
                declared: body.getAttribute('dir') ?? '',
                computed: getComputedStyle(body).direction,
                text: (body.textContent ?? '').slice(0, 32),
                top: Math.round(article.getBoundingClientRect().top),
              };
            })
            .filter(Boolean),
        )
      `);

      // The transcript is the mixed case the phase names: the fixture's first turn is a person's own English
      // sentence, and the agent's answers are Persian. Each paragraph resolves from its own first strong
      // character rather than from the interface around it, which is what keeps one readable inside the other —
      // so a Persian page holds both directions in one column.
      expect(turns.length).toBeGreaterThan(1);
      for (const turn of turns) expect(turn.declared).toBe('auto');
      expect(turns.some((turn) => turn.computed === 'ltr')).toBe(true);
      expect(turns.some((turn) => turn.computed === 'rtl')).toBe(true);

      // A turn's own direction does not move it in the flow: the transcript is still the order the conversation
      // happened in, top to bottom, in either language.
      const tops = turns.map((turn) => turn.top);
      expect([...tops].sort((left, right) => left - right)).toEqual(tops);

      // And the notice above the conversation is direction-automatic in its own right — the phase's
      // notifications-and-dialogs surface, rendered as the other kind of free text on this page.
      const notice = await session.evaluateJson<
        { tag: string; declared: string; computed: string }[]
      >(
        `JSON.stringify(
           [...document.querySelectorAll('main [dir="auto"]')]
             .filter((node) => !node.closest('article'))
             .map((node) => ({
               tag: node.tagName.toLowerCase(),
               declared: node.getAttribute('dir') ?? '',
               computed: getComputedStyle(node).direction,
             })),
         )`,
      );
      expect(notice.length).toBeGreaterThan(0);
      for (const node of notice) expect(node.declared).toBe('auto');
      // In a Persian interface that notice is Persian, so it resolves right-to-left while the English turns in
      // the transcript beside it do not.
      expect(notice.some((node) => node.computed === 'rtl')).toBe(true);

      await startIn(null);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* The journal's trade history, measured as the reader reads it             */
  /* ---------------------------------------------------------------------- */

  describe('the trade history, in a browser', () => {
    /** The tab the row table lives on, in the language the interface is being read in. */
    const openHistory = async (locale: UiLocale): Promise<void> => {
      // The navigation is a client-rendered application behind a static document, so it is only there
      // once it has mounted — and this case reaches the page immediately after a language change. The
      // wait is on the shell itself rather than on a navigation button, because at a phone width the
      // navigation is an off-canvas drawer that is not in the document until something opens it (which
      // is what `clickNav` does).
      await session.waitFor(
        `!!document.getElementById('workspace-main')`,
        `the ${locale} interface to be rendered`,
      );
      await visitIn(locale, 'journal');
      const label = translate(locale, 'journal.tradeHistory');
      // Radix activates a tab on `mousedown`, and silently ignores a synthetic `.click()`.
      expect(
        await session.evaluate<boolean>(`
          (() => {
            const tab = [...document.querySelectorAll('main [role="tab"]')].find(
              (item) => (item.textContent ?? '').trim() === ${JSON.stringify(label)},
            );
            if (!tab) return false;
            tab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
            return true;
          })()
        `),
        `the "${label}" tab was not on the journal page`,
      ).toBe(true);
      await session.waitFor(
        `document.querySelectorAll('main [role="tabpanel"] table tbody tr').length > 1`,
        `the trade history table to render its rows`,
      );
    };

    /** What each row states on its start edge, and where that edge is. */
    interface RowReport {
      ref: string;
      accent: string;
      accentWidth: string;
      height: number;
      headStart: number;
      headEnd: number;
      cellStart: number;
      cellEnd: number;
    }

    const rows = (): Promise<RowReport[]> =>
      session.evaluateJson<RowReport[]>(`
        (() => {
          const table = document.querySelector('main [role="tabpanel"] table');
          const headBox = table?.querySelector('thead tr th')?.getBoundingClientRect();
          return JSON.stringify(
            [...(table?.querySelectorAll('tbody tr') ?? [])].map((row) => {
              const cell = row.firstElementChild;
              const box = cell.getBoundingClientRect();
              const drawn = getComputedStyle(cell, '::before');
              return {
                ref: (cell.textContent ?? '').trim(),
                accent: drawn.backgroundColor,
                accentWidth: drawn.width,
                height: Math.round(row.getBoundingClientRect().height),
                headStart: Math.round(headBox ? headBox.left : -1),
                headEnd: Math.round(headBox ? headBox.right : -1),
                cellStart: Math.round(box.left),
                cellEnd: Math.round(box.right),
              };
            }),
          );
        })()
      `);

    /**
     * A row's own menu button, in the last cell of the row — found by position rather than by the
     * accessible name it carries, because that name is still English on a Persian screen.
     *
     * `row` is an index, and a negative one counts back from the end, so "the bottom row" is the same
     * expression in a table the reader has sorted.
     */
    const menuButton = (row: number): string => `
      [...document.querySelectorAll('main [role="tabpanel"] table tbody tr')]
        .at(${row})?.lastElementChild?.querySelector('button')
    `;

    /**
     * Bring that button into the window, and let the scroll it starts settle before it is pressed.
     *
     * Two calls rather than one, because the menu dismisses itself on a scroll — it is anchored to a
     * row, and a row that has moved leaves it pointing at nothing. So the scroll is finished with
     * before the press, which is also the order a person does it in.
     */
    const reveal = (row: number): Promise<boolean> =>
      session.evaluate<boolean>(`
        (() => {
          const button = ${menuButton(row)};
          if (!button) return false;
          button.scrollIntoView({ block: 'center', inline: 'nearest' });
          return true;
        })()
      `);

    const press = (row: number): Promise<boolean> =>
      session.evaluate<boolean>(`
        (() => {
          const button = ${menuButton(row)};
          if (!button) return false;
          button.click();
          return true;
        })()
      `);

    /** Press a row's menu button once it is on screen, and hand back what opened. */
    const openMenu = async (row: number): Promise<MenuReport | null> => {
      expect(await reveal(row), 'the row has no menu button').toBe(true);
      await session.waitFor(
        `(() => {
           const box = ${menuButton(row)}?.getBoundingClientRect();
           if (!box) return false;
           return (
             box.top >= 0 &&
             box.bottom <= document.documentElement.clientHeight &&
             box.left >= 0 &&
             box.right <= document.documentElement.clientWidth
           );
         })()`,
        `row ${row} to be scrolled into the window`,
      );
      expect(await press(row), 'the row menu button could not be pressed').toBe(true);
      await session.waitFor(
        `document.querySelectorAll('[role="menu"]').length > 0`,
        `the menu for row ${row} to open`,
      );
      return lastRowMenu();
    };

    /**
     * Scroll the table's own container to the end of its rows, where the menu button lives.
     *
     * A mirrored scroll container starts at its *right* edge, so the actions column of a right-to-left
     * table is reached with the opposite number — which is the whole point of measuring it here.
     */
    const scrollTableToEnd = (): Promise<boolean> =>
      session.evaluate<boolean>(`
        (() => {
          const wrapper = document.querySelector('main [role="tabpanel"] table')?.parentElement;
          if (!wrapper) return false;
          wrapper.scrollLeft =
            getComputedStyle(document.documentElement).direction === 'rtl'
              ? -wrapper.scrollWidth
              : wrapper.scrollWidth;
          return true;
        })()
      `);

    interface MenuReport {
      panels: number;
      parent: string;
      position: string;
      visibility: string;
      left: number;
      top: number;
      right: number;
      bottom: number;
      triggerStart: number;
      triggerEnd: number;
      triggerTop: number;
      triggerBottom: number;
      triggerDirection: string;
      containerGainedScroll: boolean;
      viewportWidth: number;
      viewportHeight: number;
    }

    /** What the open menu of the *last* row is, and where it sits against that row's button. */
    const lastRowMenu = (): Promise<MenuReport | null> =>
      session.evaluateJson<MenuReport | null>(`
        (() => {
          const panels = [...document.querySelectorAll('[role="menu"]')];
          const panel = panels[panels.length - 1];
          const wrapper = document.querySelector('main [role="tabpanel"] table')?.parentElement;
          const rows = [...document.querySelectorAll('main [role="tabpanel"] table tbody tr')];
          const button = rows[rows.length - 1]?.lastElementChild?.querySelector('button');
          if (!panel || !wrapper || !button) return JSON.stringify(null);
          const box = panel.getBoundingClientRect();
          const trigger = button.getBoundingClientRect();
          const style = getComputedStyle(panel);
          return JSON.stringify({
            panels: panels.length,
            parent: panel.parentElement?.tagName ?? '',
            position: style.position,
            visibility: style.visibility,
            left: Math.round(box.left),
            top: Math.round(box.top),
            right: Math.round(box.right),
            bottom: Math.round(box.bottom),
            triggerStart: Math.round(trigger.left),
            triggerEnd: Math.round(trigger.right),
            triggerTop: Math.round(trigger.top),
            triggerBottom: Math.round(trigger.bottom),
            triggerDirection: getComputedStyle(button).direction,
            containerGainedScroll: wrapper.scrollHeight > wrapper.clientHeight,
            viewportWidth: document.documentElement.clientWidth,
            viewportHeight: document.documentElement.clientHeight,
          });
        })()
      `);

    /**
     * The menu is open, drawn, and inside the window — the four facts that make it usable.
     *
     * The edge it hangs from is read from the trigger's *own* resolved direction rather than from the
     * document's, because that is the direction the control was actually laid out in — and the two can
     * differ, as they do today on a tab panel.
     */
    const expectUsableMenu = async (report: MenuReport | null): Promise<MenuReport> => {
      expect(report, 'the row menu did not open').not.toBeNull();
      const open = report as MenuReport;
      expect(open.panels, 'more than one menu is open at once').toBe(1);
      // It is not inside the row it covers: portalled to the body, which is what takes the table's
      // own scroll container — `overflow-x: auto`, and therefore `overflow-y: auto` — out of the
      // panel's ancestry and so out of its clip.
      expect(open.parent).toBe('BODY');
      expect(open.position).toBe('fixed');
      expect(open.visibility).toBe('visible');
      expect(open.left).toBeGreaterThanOrEqual(0);
      expect(open.top).toBeGreaterThanOrEqual(0);
      expect(open.right).toBeLessThanOrEqual(open.viewportWidth);
      expect(open.bottom).toBeLessThanOrEqual(open.viewportHeight);
      // And the table did not grow a scrollbar to reach the part of the menu the container used to
      // cut off: it has no vertical content, so a vertical scroll on it is a defect in itself.
      expect(open.containerGainedScroll).toBe(false);
      // Hung from the control's end edge — the right one where the control is left-to-right, the left
      // where it is not — and clear of that control rather than covering it. The panel is wider than
      // the button, so the separation is vertical: above the button or below it.
      if (open.triggerDirection === 'rtl') {
        expect(open.triggerStart, 'the menu is not hung from the trigger’s start edge').toBe(
          open.left,
        );
      } else {
        expect(open.triggerEnd, 'the menu is not hung from the trigger’s end edge').toBe(
          open.right,
        );
      }
      expect(
        open.bottom <= open.triggerTop || open.top >= open.triggerBottom,
        'the menu covers the button that opened it',
      ).toBe(true);
      return open;
    };

    it('marks every trade on its start edge, and keeps the row menu inside the window', async () => {
      await session.setViewport(1440, 900);
      await startIn('en');
      await openHistory('en');

      const english = await rows();
      expect(english.length, 'the table rendered too few rows to be a table').toBeGreaterThan(5);
      for (const row of english) {
        // The claim, in the terms the reader made it: no row is missing its rule. A flat trade is a
        // *result*, so it wears the accent's quietest step rather than none at all — an absent mark
        // is indistinguishable from a row that failed to render.
        expect(row.accent, `${row.ref} draws no rule on its edge`).not.toBe('rgba(0, 0, 0, 0)');
        expect(row.accent, `${row.ref} draws no rule on its edge`).not.toBe('transparent');
        expect(row.accentWidth, `${row.ref} draws a rule that is not 2px`).toBe('2px');
        expect(row.cellStart, `${row.ref} does not line up with the head`).toBe(row.headStart);
        expect(row.cellEnd, `${row.ref} is a different width from the head`).toBe(row.headEnd);
      }
      // One column grid: every row is the same height, whatever vocabulary its chips happen to hold.
      expect(new Set(english.map((row) => row.height)).size).toBe(1);
      // More than one colour, so "every row is marked" is not "every row is marked the same".
      expect(new Set(english.map((row) => row.accent)).size).toBeGreaterThan(1);

      // The last row of the page, which is where a menu that hangs downwards runs out of table.
      const last = await expectUsableMenu(await openMenu(-1));
      expect(last.triggerDirection).toBe('ltr');

      // And it holds on to that row while the page moves under it. A scroll event that belongs to
      // the interaction *before* the press arrives just after the panel opens, so a menu that closed
      // on the first scroll was one a reader could watch flash and vanish; this is the other half of
      // "it opens cleanly", and the reason the panel is re-placed rather than dismissed. Scrolling
      // *up* here because the last row of the table is at the end of the document already.
      await session.evaluate(`window.scrollBy(0, -40)`);
      // Waited on the *relationship* rather than on the panel existing: the panel was there before the
      // scroll too, and a query for it would race the scroll event that re-places it.
      await session.waitFor(
        `(() => {
           const button = ${menuButton(-1)};
           const panel = document.querySelector('[role="menu"]');
           if (!button || !panel) return false;
           const box = button.getBoundingClientRect();
           const panelBox = panel.getBoundingClientRect();
           return panelBox.bottom <= box.top || panelBox.top >= box.bottom;
         })()`,
        'the menu to come back to the row it belongs to as the page scrolls under it',
      );
      const followed = await expectUsableMenu(await lastRowMenu());
      expect(
        followed.triggerTop,
        'the page did not actually scroll, so the check below would pass vacuously',
      ).toBeGreaterThan(last.triggerTop);
      // The panel kept its distance from the row it belongs to, rather than staying where it was.
      expect(
        Math.abs(followed.top - followed.triggerTop - (last.top - last.triggerTop)),
      ).toBeLessThanOrEqual(1);

      await session.pressKey('Escape');
      await session.waitFor(
        `document.querySelectorAll('[role="menu"]').length === 0`,
        'the row menu to close',
      );

      await startIn(null);
    }, 120_000);

    /**
     * The same two claims in the interface's other language, and at a phone width.
     *
     * What this case deliberately does *not* assert is which edge the panel hangs from: it reads the
     * trigger's own resolved direction and holds the menu to that (see `expectUsableMenu`), so it stays
     * a statement about the menu rather than about the direction a tab panel happens to be laid out in.
     */
    it('keeps the mark and the menu on the row in Persian, at desktop and phone widths', async () => {
      await session.setViewport(1440, 900);
      await startIn('fa');
      await openHistory('fa');

      expect(await session.evaluate<string>('document.documentElement.dir')).toBe('rtl');
      const persian = await rows();
      expect(persian.length).toBeGreaterThan(5);
      // One column grid in the other language too: every row's first cell is the head's first cell,
      // on both edges, so "the row's rule is against the same edge as the header" holds without this
      // case having to say which edge that is.
      for (const row of persian) {
        expect(row.cellStart, `${row.ref} does not line up with the head`).toBe(row.headStart);
        expect(row.cellEnd, `${row.ref} is a different width from the head`).toBe(row.headEnd);
        expect(row.accent, `${row.ref} draws no rule on its edge`).not.toBe('rgba(0, 0, 0, 0)');
      }
      expect(new Set(persian.map((row) => row.height)).size).toBe(1);

      await expectUsableMenu(await openMenu(-1));

      await session.pressKey('Escape');
      await session.waitFor(
        `document.querySelectorAll('[role="menu"]').length === 0`,
        'the row menu to close',
      );

      // A phone, where the table scrolls sideways inside its own box and the actions column is only
      // reachable at the end of that scroll. The menu is the widest thing this row opens, and it is
      // opened here with 390px of window to fit into.
      // A phone width is a different emulation mode, and the driver blanks the document to change it —
      // so the interface is opened again here rather than measured in the blank document it left.
      await session.setViewport(390, 844);
      await startIn('fa');
      await openHistory('fa');
      expect(await scrollTableToEnd()).toBe(true);
      const phone = await expectUsableMenu(await openMenu(-1));
      expect(phone.viewportWidth).toBe(390);
      // Every command is reachable, rather than a panel that was cut down to its first line.
      expect(phone.bottom - phone.top).toBeGreaterThan(100);

      await startIn(null);
    }, 120_000);
  });

  /* ---------------------------------------------------------------------- */
  /* D. What the shell remembers — Phase 8.1.3                               */
  /* ---------------------------------------------------------------------- */

  /**
   * The state that has to outlive the thing that held it.
   *
   * The workspace renders one page at a time and unmounts the rest, which is deliberate and is what
   * every measurement above relies on — a page swap is a real swap, so "the page on screen" is the page
   * whose heading was painted. The cost of that shape is that anything a page kept in `useState` is
   * thrown away the moment the reader looks elsewhere, and this block is where that is measured: walking
   * away and back is a thing a person does, and losing what they chose is a defect rather than a shape.
   */
  describe('the shell’s state and context', () => {
    it('keeps the tab a reader was on when they walk away and come back', async () => {
      await session.setViewport(1440, 900);
      await startIn(null);
      await visit('journal');

      // A tab that is *not* the page's opening one, so "it stayed" cannot be satisfied by the default.
      const tabs = await session.tabCount();
      expect(tabs, 'the journal has no tab strip to test').toBeGreaterThan(3);
      const chosen = tabs - 1;
      expect(await session.tabSelected(chosen)).toBe(false);
      await session.selectTab(chosen, 'journal');
      expect(await session.tabSelected(chosen)).toBe(true);

      // Leaving the page is what unmounts it — the whole reason the tab was ever lost.
      await visit('portfolio');
      await visit('journal');

      expect(
        await session.tabSelected(chosen),
        'the journal opened on its first tab again instead of the one the reader chose',
      ).toBe(true);
    }, 60_000);

    it('remembers the rail’s collapsed state across a reload', async () => {
      await session.setViewport(1440, 900);
      await startIn(null);
      // The rail's state is a *standing* preference, so this case states the one it is about to change
      // rather than inheriting whichever one the case before it happened to leave behind.
      await expandRail();

      const expanded = await railWidth();
      expect(expanded, 'the rail is not the expanded width to begin with').toBeGreaterThan(200);

      expect(await pressInRail('Collapse sidebar'), 'the rail’s collapse control').toBe(true);
      // Settled, not merely narrow: this width is compared with the width a reload renders, and a
      // sample taken while the rail is still moving is a frame of an animation rather than a layout.
      await waitForRail('< 100', 'the rail to collapse');
      const collapsed = await railWidth();
      expect(collapsed).toBeLessThan(expanded);

      // A reload is the moment a *standing* choice either was remembered or was not. The rail is the
      // shell's own preference — not where the reader happened to be standing — so it survives one.
      await session.goto(`${server.origin}/`);
      await waitForRail('< 100', 'the restored rail to settle');
      expect(
        await railWidth(),
        'the rail forgot the reader’s choice the moment the page reloaded',
      ).toBe(collapsed);

      // The other direction is remembered too, and the shell is handed back the way it was found: the
      // cases after this one measure the expanded rail.
      expect(await pressInRail('Expand sidebar'), 'the rail’s expand control').toBe(true);
      await waitForRail('> 200', 'the rail to expand again');
      await session.goto(`${server.origin}/`);
      await waitForRail('> 200', 'the expanded rail to settle');
      expect(await railWidth()).toBe(expanded);
    }, 60_000);

    it('marks the page being read as the active navigation entry, and only that one', async () => {
      await session.setViewport(1440, 900);
      await startIn(null);
      // What is read below are the labels the rail *draws*, so the case states that it is measuring the
      // labelled rail. An icon rail keeps the same entry names in `aria-label` and draws no text at
      // all — which is why a collapse leaked from the case above would read here as a current entry
      // named `''` rather than as a missing one.
      await expandRail();
      expect(await railWidth(), 'the rail is not drawing its labels').toBeGreaterThan(200);

      /** The accessible names of the entries the rail calls current, in the order they are drawn. */
      const current = (): Promise<string[]> =>
        session.evaluateJson<string[]>(`
          JSON.stringify(
            [...document.querySelectorAll('aside nav button[aria-current="page"]')].map(
              (item) => (item.textContent ?? '').trim(),
            ),
          )
        `);

      await visit('portfolio');
      expect(await current()).toEqual([labelOf('portfolio')]);

      // The entry that was current does not merely go dim: it stops being the current one, so a reader
      // who arrives at a page is told where they are and nothing else.
      await visit('journal');
      expect(await current()).toEqual([labelOf('journal')]);
      expect(await current()).not.toContain(labelOf('portfolio'));
    }, 60_000);

    it('describes where it is running the same way in the shell and in Settings', async () => {
      await session.setViewport(1440, 900);
      await startIn(null);

      // One report, read by both: the topbar's badge and the Settings card are the same answer to the
      // same question, and the failure this guards against is the two of them disagreeing about it.
      const topbar = await session.evaluate<string>(
        `(document.querySelector('header')?.innerText ?? '').replace(/\\s+/g, ' ')`,
      );
      expect(topbar).toContain('Browser preview');
      expect(topbar).not.toContain('Desktop shell');

      // The host card is on the settings page's own tab, so the page is read the way a person reads it:
      // find the tab by the name it shows and open it.
      await visit('settings');
      const hostTab = await session.evaluate<number>(`
        [...document.querySelectorAll('main [role="tab"]')].findIndex(
          (item) => (item.textContent ?? '').trim() === ${JSON.stringify(translate('en', 'settings.aiProviders'))},
        )
      `);
      expect(hostTab, 'the settings page has no tab that reports the host').toBeGreaterThanOrEqual(
        0,
      );
      await session.selectTab(hostTab, 'settings host');

      const settings = await session.evaluate<string>(
        `document.body.innerText.replace(/\\s+/g, ' ')`,
      );
      expect(settings).toContain('Running in a browser');
      expect(settings).not.toContain('Running in the desktop shell');
    }, 60_000);

    it('states the stream’s own condition instead of implying it is live', async () => {
      await session.setViewport(1440, 900);
      await startIn(null);

      // The four states the shell has to be able to show, in the words the interface gives them. Which
      // one a browser with no session settles on is its own business; that it *says* one, and never
      // claims to be live, is the claim.
      const words = ['Preparing', 'Not connected', 'Connecting', 'Authenticating', 'Offline'];
      const chip = await session.evaluate<string>(`
        (() => {
          const status = document.querySelector('[role="status"][aria-label^="Event stream:"]');
          return status?.getAttribute('aria-label') ?? '';
        })()
      `);
      expect(words).toContain(chip.replace('Event stream: ', ''));
      expect(chip).not.toBe('Event stream: Live');
    }, 60_000);
  });

  /* ---------------------------------------------------------------------- */
  /* F. The navigation foundation — Phase 8.2.1                              */
  /* ---------------------------------------------------------------------- */

  /**
   * The same navigation, at every width, in both directions, reachable by keyboard.
   *
   * Phase 8.2.1 adds no entry and no page: it moves *where* the navigation is stated — one derived
   * model (`NAV_MODEL`) drawn by one entry component — and what is measured here is the property that
   * move was for. The rail, the icon rail and the phone drawer are one list rather than three that
   * happen to look alike; a keyboard user reaches an entry, sees where the focus is, and switches page
   * with the entry's own activation; and a collapsed rail stays a navigation rather than becoming a
   * row of unlabelled squares.
   */
  describe('the navigation foundation', () => {
    const RAIL_ENTRIES = 'aside nav button';
    const DRAWER_ENTRIES = '[role="dialog"] nav button';

    /** The names a navigation surface draws, in the order it draws them. */
    const entriesIn = (scope: string): Promise<string[]> =>
      session.evaluateJson<string[]>(
        `JSON.stringify(
           [...document.querySelectorAll(${JSON.stringify(scope)})].map(
             (item) => (item.getAttribute('aria-label') ?? item.textContent ?? '').trim(),
           ),
         )`,
      );

    /** Where the navigation's own box sits, so a page switch can be shown not to move it. */
    const navBox = (): Promise<{ left: number; width: number }> =>
      session.evaluateJson<{ left: number; width: number }>(
        `JSON.stringify(
           (() => {
             const box = document.querySelector('aside nav').getBoundingClientRect();
             return { left: Math.round(box.left), width: Math.round(box.width) };
           })(),
         )`,
      );

    it('draws the declared entries, in the declared order, on the rail and in the phone drawer', async () => {
      const expected = expectedEntries();

      // A desktop, where the rail is the reader's to expand.
      await session.setViewport(1440, 900);
      await startIn(null);
      expect(await entriesIn(RAIL_ENTRIES)).toEqual(expected);

      // A tablet, where the same rail is icons only: every entry keeps the name it was given, which
      // is the whole point of naming it once the label goes.
      await session.setViewport(1024, 768);
      await startIn(null);
      expect(await entriesIn(RAIL_ENTRIES)).toEqual(expected);

      // A phone, where the navigation is out of the flow until it is asked for.
      await session.setViewport(390, 844);
      await startIn(null);
      expect(
        await session.evaluate<boolean>(
          `(() => {
             const trigger = document.querySelector('[aria-controls="shell-navigation"]');
             if (!trigger) return false;
             trigger.click();
             return true;
           })()`,
        ),
      ).toBe(true);
      await session.waitFor(
        `!!document.querySelector('[role="dialog"] nav')`,
        'the off-canvas navigation to open',
      );
      expect(await entriesIn(DRAWER_ENTRIES)).toEqual(expected);

      await startIn(null);
    }, 60_000);

    it('names the same entries, in the same order, in a right-to-left interface', async () => {
      await session.setViewport(1440, 900);
      await startIn('fa');
      expect(await session.evaluate<string>('document.documentElement.dir')).toBe('rtl');

      // The mirror moves the rail to the other edge and mirrors the glyphs inside it. It does not
      // reorder the navigation: that is a list of destinations, not a direction of travel.
      expect(await entriesIn(RAIL_ENTRIES)).toEqual(expectedEntries('fa'));

      // ...and the rail is still the *inline-start* one, which is the side the mirror moved it to.
      expect(
        await session.evaluate<boolean>(
          `(() => {
             const rail = document.querySelector('aside');
             const main = document.querySelector('main');
             return (
               !!rail &&
               !!main &&
               rail.getBoundingClientRect().left > main.getBoundingClientRect().left
             );
           })()`,
        ),
      ).toBe(true);

      await startIn(null);
    }, 60_000);

    it('is reached and activated with the keyboard, and shows where the focus is', async () => {
      await session.setViewport(1440, 900);
      await startIn(null);
      // A page that is not the first entry, so activating the first entry is a *change*.
      await visit('portfolio');

      // Walk in with real key presses, which is what makes `:focus-visible` match — a programmatic
      // `.focus()` would verify a ring the keyboard user never gets.
      let entry: { label: string; outline: string; width: string } | null = null;
      for (let presses = 0; presses < 24 && entry === null; presses += 1) {
        await session.pressKey('Tab');
        entry = await session.evaluateJson<{
          label: string;
          outline: string;
          width: string;
        } | null>(
          `JSON.stringify(
             (() => {
               const element = document.activeElement;
               if (!element || !element.closest('aside nav')) return null;
               const style = getComputedStyle(element);
               return {
                 label: (element.getAttribute('aria-label') ?? element.textContent ?? '').trim(),
                 outline: style.outlineStyle,
                 width: style.outlineWidth,
               };
             })(),
           )`,
        );
      }

      expect(entry, 'pressing Tab never reached a navigation entry').not.toBeNull();
      // The ring is painted on the entry, so the keyboard user can see where they are.
      expect(entry?.outline).not.toBe('none');
      expect(Number.parseFloat(entry?.width ?? '0')).toBeGreaterThan(0);

      const chosen = entryIdFor(entry?.label ?? '');
      expect(chosen, 'the keyboard landed on the entry the page was already on').not.toBe(
        'portfolio',
      );

      await session.pressKey('Enter');
      await session.waitFor(
        `(document.querySelector('main h2')?.textContent?.trim() ?? '') === ${JSON.stringify(headingFor('en', chosen))}`,
        `the ${chosen} page to be rendered from the keyboard`,
      );
      // The entry says it is current, and it is the entry that was activated.
      expect(
        await session.evaluate<string>(
          `(document.querySelector('aside nav button[aria-current="page"]')?.getAttribute('aria-label') ??
             document.querySelector('aside nav button[aria-current="page"]')?.textContent ??
             '').trim()`,
        ),
      ).toBe(entry?.label);
    }, 60_000);

    it('stays a navigation while it is collapsed, and does not move when a page changes', async () => {
      await session.setViewport(1440, 900);
      await startIn(null);
      // This case is about the collapsed rail, so it states that it starts from the expanded one:
      // 'Collapse sidebar' is a control that exists only while there is something to collapse.
      await expandRail();
      await visit('portfolio');

      const expanded = await railWidth();
      expect(await pressInRail('Collapse sidebar'), 'the rail’s collapse control').toBe(true);
      // Settled before the box is recorded: the box is compared with the same rail after a page
      // change, and a sample taken mid-transition would differ from a settled one for reasons that
      // have nothing to do with navigating.
      await waitForRail('< 100', 'the rail to collapse');

      const before = await navBox();
      // Icons only, so the entry is found by the name it kept rather than by a label it no longer
      // draws — which is the failure a collapsed rail is prone to.
      await visit('profile');
      const profile = translate('en', 'shell.nav.profile.label' as MessageKey);
      expect(
        await session.evaluate<string>(
          `document.querySelector('aside nav button[aria-current="page"]')?.getAttribute('aria-label') ?? ''`,
        ),
      ).toBe(profile);
      // Nothing moved: the rail is the same box in the same place, so switching page inside it is not
      // a layout shift.
      expect(await navBox()).toEqual(before);

      // ...and expanding it again brings the labels back, with the current entry still the current one.
      expect(await pressInRail('Expand sidebar'), 'the rail’s expand control').toBe(true);
      await waitForRail('> 200', 'the rail to expand again');
      expect(await railWidth()).toBe(expanded);
      expect(
        await session.evaluate<string>(
          `document.querySelector('aside nav button[aria-current="page"]')?.textContent?.trim() ?? ''`,
        ),
      ).toBe(profile);
    }, 60_000);

    /** The entries, in display order, as the markup states them. */
    const IDS = NAV_MODEL.flatMap((group) => group.items.map((item) => item.id));
    const NAMES = NAV_MODEL.flatMap((group) =>
      group.items.map((item) => translate('en', item.labelKey)),
    );

    /**
     * What each entry *is*, read from the document rather than from the configuration.
     *
     * `data-nav-id` is the entry's semantic identifier (Phase 8.2.2): the section id, which the
     * interface language never changes. Reading the rail through it means a case can say which
     * destination it means without depending on the English word, the Persian word, or the position
     * an entry happens to hold.
     */
    const entries = (): Promise<{ id: string | null; label: string; name: string }[]> =>
      session.evaluateJson(
        `JSON.stringify(
           [...document.querySelectorAll('aside nav button')].map((button) => ({
             id: button.getAttribute('data-nav-id'),
             label: (button.textContent ?? '').trim(),
             name: (button.getAttribute('aria-label') ?? '').trim(),
           })),
         )`,
      );

    /** The groups the rail draws, and the name each one gives assistive technology. */
    const groups = (): Promise<{ id: string | null; name: string | null }[]> =>
      session.evaluateJson(
        `JSON.stringify(
           [...document.querySelectorAll('aside nav [data-nav-group]')].map((node) => ({
             id: node.getAttribute('data-nav-group'),
             name: node.getAttribute('aria-label'),
           })),
         )`,
      );

    it('identifies every entry by its section, and names it in whichever presentation draws it', async () => {
      await session.setViewport(1440, 900);
      await startIn(null);
      await expandRail();

      const drawn = await entries();
      expect(drawn.map((entry) => entry.id)).toEqual(IDS);
      // With the label drawn, the *label* is the entry's accessible name, and there is no second one
      // to disagree with it.
      expect(drawn.map((entry) => entry.label)).toEqual(NAMES);
      for (const entry of drawn) {
        expect(entry.label, `${entry.id} draws no label`).not.toBe('');
        expect(entry.name, `${entry.id} is named twice while its label is drawn`).toBe('');
      }

      // Collapsed, the label is gone and the name moves to `aria-label`: an icon-only entry is still
      // one a screen reader can name, and still the same entry (`id` is unchanged).
      expect(await pressInRail('Collapse sidebar'), 'the rail’s collapse control').toBe(true);
      await waitForRail('< 100', 'the rail to collapse');
      const squeezed = await entries();
      expect(squeezed.map((entry) => entry.id)).toEqual(IDS);
      expect(squeezed.map((entry) => entry.name)).toEqual(NAMES);
      for (const entry of squeezed) {
        expect(entry.label, `${entry.id} still draws a label in the icon rail`).toBe('');
      }

      await expandRail();
    }, 60_000);

    it('keeps the three groups named in both presentations', async () => {
      await session.setViewport(1440, 900);
      await startIn(null);
      await expandRail();

      const expected = NAV_MODEL.map((group) => ({
        id: group.id,
        name: translate('en', group.labelKey),
      }));
      expect(await groups()).toEqual(expected);

      // The collapsed rail draws a rule where the heading was, so the name has to come from the
      // catalogue rather than from the drawn text — otherwise the hierarchy would survive only while
      // there was room to print it.
      expect(await pressInRail('Collapse sidebar'), 'the rail’s collapse control').toBe(true);
      await waitForRail('< 100', 'the rail to collapse');
      expect(await groups()).toEqual(expected);

      await expandRail();
    }, 60_000);

    it('marks exactly one entry current on every one of the fourteen routes', async () => {
      await session.setViewport(1440, 900);
      await startIn(null);
      await expandRail();

      /** The entries the rail calls current, by identifier. */
      const current = (): Promise<(string | null)[]> =>
        session.evaluateJson(
          `JSON.stringify(
             [...document.querySelectorAll('aside nav button[aria-current="page"]')].map(
               (button) => button.getAttribute('data-nav-id'),
             ),
           )`,
        );

      // Every destination, opened the way a reader opens it, and the rail asked who is current. One
      // entry, the right one, unprompted and unspecial-cased — Portfolio and Evaluation included.
      for (const id of IDS) {
        await visit(id);
        expect(await current(), `the rail disagrees with the ${id} page`).toEqual([id]);
      }

      expect(IDS).toContain('portfolio');
      expect(IDS).toContain('evaluation');
      expect(IDS).not.toContain('performance');
    }, 120_000);

    it('explains an entry whose label is gone, and stays quiet while the label is drawn', async () => {
      await session.setViewport(1440, 900);
      await startIn(null);
      await expandRail();

      const PORTFOLIO = '[data-nav-id="portfolio"]';
      // A labelled entry is not a tooltip trigger at all: Radix marks its triggers with `data-state`,
      // and this button has none — the tooltip is absent while there is a label to read, rather than
      // present and unopened.
      expect(
        await session.evaluate<string | null>(
          `document.querySelector(${JSON.stringify(PORTFOLIO)}).getAttribute('data-state')`,
        ),
      ).toBeNull();

      expect(await pressInRail('Collapse sidebar'), 'the rail’s collapse control').toBe(true);
      await waitForRail('< 100', 'the rail to collapse');

      // A pointer on the entry is how a reader asks an icon what it is — the case moves a real one,
      // because focus would only prove the fallback path. What comes back is the name they can no
      // longer read and the sentence that says what is behind it.
      expect(await session.hover(PORTFOLIO)).toBe(true);
      const description = translate('en', 'shell.nav.portfolio.description' as MessageKey);
      await session.waitFor(
        `[...document.querySelectorAll('[role="tooltip"]')]
           .map((tip) => tip.textContent ?? '')
           .join(' ')
           .includes(${JSON.stringify(description)})`,
        'the Portfolio tooltip to open with what the entry opens',
      );
      const tooltip = await session.evaluate<string>(
        `[...document.querySelectorAll('[role="tooltip"]')]
           .map((tip) => (tip.textContent ?? '').trim())
           .join(' | ')`,
      );
      expect(tooltip).toContain(labelOf('portfolio'));
      expect(tooltip).toContain(description);

      // And it goes away when the pointer does.
      expect(await session.hover('main h2')).toBe(true);
      await session.waitFor(
        `document.querySelectorAll('[role="tooltip"]').length === 0`,
        'the tooltip to close when the pointer leaves the entry',
      );

      await expandRail();
    }, 60_000);

    it('keeps one row geometry in both presentations', async () => {
      await session.setViewport(1440, 900);
      await startIn(null);
      await expandRail();

      /** Each entry's box: its height, its padding, and the icon slot inside it. */
      const geometry = (): Promise<
        { height: number; padding: string; slot: string; slotOffset: number }[]
      > =>
        session.evaluateJson(
          `JSON.stringify(
             [...document.querySelectorAll('aside nav button')].map((button) => {
               const row = button.getBoundingClientRect();
               const style = getComputedStyle(button);
               const slot = button.querySelector('span').getBoundingClientRect();
               return {
                 height: Math.round(row.height),
                 padding: style.paddingLeft + '/' + style.paddingRight,
                 slot: Math.round(slot.width) + 'x' + Math.round(slot.height),
                 slotOffset: Math.round(slot.left - row.left),
               };
             }),
           )`,
        );

      const drawn = await geometry();
      expect(drawn).toHaveLength(IDS.length);
      // One height, one padding, one icon column at one offset: the structure is the same on every
      // row, which is what makes the rail read as a list rather than as fourteen decisions.
      expect(new Set(drawn.map((row) => row.height)).size, 'the rows are not one height').toBe(1);
      expect(new Set(drawn.map((row) => row.padding)).size, 'the rows are not padded alike').toBe(
        1,
      );
      expect(new Set(drawn.map((row) => row.slot)).size, 'the icons are not one column').toBe(1);
      expect(new Set(drawn.map((row) => row.slotOffset)).size, 'the icons do not line up').toBe(1);

      expect(await pressInRail('Collapse sidebar'), 'the rail’s collapse control').toBe(true);
      await waitForRail('< 100', 'the rail to collapse');
      const squeezed = await geometry();
      expect(new Set(squeezed.map((row) => row.height)).size).toBe(1);
      // The property this phase adds: the icon rail is the *same* rows with the labels taken away,
      // so collapsing the navigation narrows it without re-flowing it vertically.
      expect(squeezed[0]?.slot).toBe(drawn[0]?.slot);
      expect(squeezed[0]?.height, 'the icon rail is a different row height').toBe(drawn[0]?.height);

      await expandRail();
    }, 60_000);
  });

  /* ---------------------------------------------------------------------- */
  /* Quick navigation (Phase 8.2.3)                                          */
  /* ---------------------------------------------------------------------- */

  /**
   * The palette, measured where it is used.
   *
   * The suite above holds the rail to what it draws; this one holds the *second way in* to the same
   * fourteen destinations. Every case here is a question only a browser can answer: does the shortcut
   * really open it, does the field really hold the keyboard when it does, do the arrow keys really
   * walk the list (and wrap at both ends), does Enter really open the page and leave exactly one entry
   * current, and does all of that survive the icon rail, a phone and a mirrored interface.
   *
   * The cases state their own starting width, language and rail, like the ones above: the collapse is a
   * *standing* preference, so a case that failed before its cleanup must not decide the next one.
   */
  describe('quick navigation, in a browser', () => {
    const PALETTE = '[role="dialog"]';
    const FIELD = '[role="dialog"] [role="combobox"]';
    const OPTIONS = '[role="dialog"] [role="option"]';
    /** The shell's own control for opening the palette, in either presentation. */
    const TRIGGER = '[aria-haspopup="dialog"]';

    /** The fourteen destinations, in display order, and their names in a language. */
    const IDS = NAV_MODEL.flatMap((group) => group.items.map((item) => item.id));
    const namesIn = (locale: UiLocale): string[] =>
      NAV_MODEL.flatMap((group) => group.items.map((item) => translate(locale, item.labelKey)));

    /** The destinations the palette is offering right now, in the order it draws them. */
    const offered = (): Promise<(string | null)[]> =>
      session.evaluateJson(
        `JSON.stringify(
           [...document.querySelectorAll(${JSON.stringify(OPTIONS)})].map(
             (option) => option.getAttribute('data-quick-nav-id'),
           ),
         )`,
      );

    /**
     * The row the palette is pointing at, read through the attribute assistive technology uses.
     *
     * `aria-activedescendant` names it *and* the option says it is the selected one, which is the pair
     * that makes "the highlight" a thing a screen reader can follow rather than a colour.
     */
    const highlighted = (): Promise<string | null> =>
      session.evaluate<string | null>(
        `document.querySelector('[role="dialog"] [role="option"][aria-selected="true"]')
           ?.getAttribute('data-quick-nav-id') ?? null`,
      );

    /** Whether the palette is in the document. */
    const palettePresent = (): Promise<boolean> =>
      session.evaluate<boolean>(`!!document.querySelector(${JSON.stringify(FIELD)})`);

    /** Open the palette from the shell's own shortcut, and wait until it holds the keyboard. */
    const openPalette = async (): Promise<void> => {
      await session.pressKey('Control+k');
      await session.waitFor(
        `!!document.querySelector(${JSON.stringify(FIELD)})`,
        'the quick-navigation palette',
      );
      // The field, not the panel: a palette that opened without the keyboard would be a dialog with a
      // search box in it rather than a command surface.
      await session.waitFor(
        `document.activeElement === document.querySelector(${JSON.stringify(FIELD)})`,
        'the palette to take the keyboard',
      );
    };

    const closePalette = async (): Promise<void> => {
      await session.pressKey('Escape');
      await session.waitFor(
        `!document.querySelector(${JSON.stringify(FIELD)})`,
        'the palette to close',
      );
    };

    /**
     * Ask the palette a question, from closed, and hand back what it offered.
     *
     * The wait is on the *answer* rather than on the keystrokes having landed. The field's value and
     * the list it filters are two renders, so a case that read the list as soon as the text arrived
     * would sometimes be reading the previous answer — the same mistake the rail's width cases avoid by
     * waiting for the animation to settle rather than for a threshold. Two consecutive polls that agree
     * are what "settled" means here, and the answer is keyed to the query so a stale one cannot pass.
     */
    const ask = async (query: string): Promise<(string | null)[]> => {
      // Every question starts from a closed palette: the query and the highlight are state a fresh open
      // resets, and a case that inherited them from the case before would be measuring the wrong thing.
      if (await palettePresent()) await closePalette();
      await openPalette();
      if (query !== '') await session.typeText(query);
      await session.waitFor(
        `(() => {
           const ids = [...document.querySelectorAll(${JSON.stringify(OPTIONS)})].map(
             (option) => option.getAttribute('data-quick-nav-id'),
           );
           const stamp = JSON.stringify([${JSON.stringify(query)}, ids]);
           if (window.__mtQuickNav === stamp) return true;
           window.__mtQuickNav = stamp;
           return false;
         })()`,
        `the palette to settle on an answer to ${JSON.stringify(query)}`,
      );
      return offered();
    };

    it('offers every destination, in rail order, and takes the keyboard when it opens', async () => {
      await session.setViewport(1440, 900);
      await startIn(null);
      await expandRail();

      // Opened from the keyboard, with the whole directory in it: the list *is* the discovery — a
      // query is one way to use it and reading it is the other.
      expect(await ask('')).toEqual(IDS);

      // The shortcut is printed where it is used, and published to assistive technology too.
      expect(
        await session.evaluate<string>(
          `(document.querySelector('[role="dialog"] kbd')?.textContent ?? '').trim()`,
        ),
      ).toMatch(/K$/);
      expect(
        await session.evaluate<string | null>(
          `document.querySelector(${JSON.stringify(FIELD)}).getAttribute('aria-keyshortcuts')`,
        ),
      ).toBe('Control+K Meta+K');

      await closePalette();
    }, 60_000);

    it('finds a destination by its name, by its identifier and by what it holds', async () => {
      await session.setViewport(1440, 900);
      await startIn(null);

      // The printed word…
      expect(await ask('portfolio')).toEqual(['portfolio']);
      // …and the identifier: nothing on screen says "agent" about the AI Workspace, so this is the
      // query that only the semantic route metadata can answer. Its neighbour mentions an agent in its
      // description, and comes second — the identifier beats the prose.
      expect(await ask('agent')).toEqual(['agent', 'memory']);
      // …the sentence that says what a destination holds…
      expect(await ask('cost basis')).toEqual(['portfolio']);
      // …and the group it lives under, which is in no entry's own words.
      expect(await ask('learning')).toEqual(['academy', 'exams']);

      // And it finds nothing that is not there: there is no Performance section to reach, so a query
      // for one is empty and says so rather than offering the nearest thing.
      expect(await ask('performance')).toEqual([]);
      expect(
        await session.evaluate<boolean>(
          `(document.querySelector(${JSON.stringify(PALETTE)})?.textContent ?? '').includes(
             ${JSON.stringify(translate('en', 'shell.quickNavNoMatches'))},
           )`,
        ),
      ).toBe(true);

      await closePalette();
    }, 60_000);

    it('opens the destination the reader picked, and leaves exactly that entry current', async () => {
      await session.setViewport(1440, 900);
      await startIn(null);
      await expandRail();

      /** The entries the rail calls current, by identifier. */
      const current = (): Promise<(string | null)[]> =>
        session.evaluateJson(
          `JSON.stringify(
             [...document.querySelectorAll('aside nav button[aria-current="page"]')].map(
               (button) => button.getAttribute('data-nav-id'),
             ),
           )`,
        );

      // Chosen from the field: the highlight starts on the best answer, so Enter takes it.
      expect(await ask('evaluation')).toEqual(['evaluation']);
      await session.pressKey('Enter');
      await session.waitFor(
        `(document.querySelector('main h2')?.textContent?.trim() ?? '') === ${JSON.stringify(headingFor('en', 'evaluation'))}`,
        'the Evaluation page to be rendered from the palette',
      );
      // The palette leaves with the choice rather than sitting over the page it opened, and the rail —
      // not the palette — is what says where the reader is.
      await session.waitFor(
        `!document.querySelector(${JSON.stringify(FIELD)})`,
        'the palette to leave with the choice',
      );
      expect(await current()).toEqual(['evaluation']);

      // Walked to with the arrow keys, from the top of the directory.
      await ask('');
      expect(await highlighted()).toBe(IDS[0]);
      await session.pressKey('ArrowDown');
      await session.pressKey('ArrowDown');
      await session.pressKey('ArrowDown');
      expect(await highlighted()).toBe(IDS[3]);
      // …and the list wraps, so the row above the first is the last one rather than nothing at all.
      await session.pressKey('ArrowUp');
      await session.pressKey('ArrowUp');
      await session.pressKey('ArrowUp');
      expect(await highlighted()).toBe(IDS[0]);
      await session.pressKey('ArrowUp');
      expect(await highlighted()).toBe(IDS[IDS.length - 1]);

      const last = IDS[IDS.length - 1] ?? '';
      expect(last).not.toBe('');
      await session.pressKey('Enter');
      await session.waitFor(
        `(document.querySelector('main h2')?.textContent?.trim() ?? '') === ${JSON.stringify(headingFor('en', last))}`,
        `the ${last} page to be rendered from the keyboard`,
      );
      await session.waitFor(
        `!document.querySelector(${JSON.stringify(FIELD)})`,
        'the palette to leave with the keyboard’s choice',
      );
      // One entry, the right one, and no second claim on the page anywhere in the document.
      expect(await current()).toEqual([last]);
      expect(
        await session.evaluate<number>(`document.querySelectorAll('[aria-current="page"]').length`),
      ).toBe(1);
    }, 90_000);

    it('is reached from the rail’s own control in either presentation, and hands the keyboard back', async () => {
      await session.setViewport(1440, 900);
      await startIn(null);
      await expandRail();

      /** Press the shell's own control for the palette, focused the way a real press leaves it. */
      const pressTrigger = (): Promise<boolean> =>
        session.evaluate<boolean>(`
          (() => {
            const trigger = document.querySelector(${JSON.stringify(TRIGGER)});
            if (!trigger) return false;
            trigger.focus();
            trigger.click();
            return true;
          })()
        `);

      expect(await pressTrigger()).toBe(true);
      await session.waitFor(
        `document.activeElement === document.querySelector(${JSON.stringify(FIELD)})`,
        'the palette opened from the rail to take the keyboard',
      );
      expect(await offered()).toEqual(IDS);

      // Escape closes it, and the keyboard goes back to the control that opened it — which is what makes
      // a dialog opened from the rail a detour rather than a trap.
      await closePalette();
      // Awaited rather than sampled: Radix hands the keyboard back from a zero-delay timer once the
      // panel is gone, so a case that read `activeElement` the instant the field disappeared would be
      // reading the moment before the handover.
      await session.waitFor(
        `document.activeElement === document.querySelector(${JSON.stringify(TRIGGER)})`,
        'the keyboard to go back to the control that opened the palette',
      );

      // Collapsed, the same control keeps a name and the same route in: an icon is not a name, and this
      // is the one way into the palette that survives the rail losing its labels.
      expect(await pressInRail('Collapse sidebar'), 'the rail’s collapse control').toBe(true);
      await waitForRail('< 100', 'the rail to collapse');
      const quickNav = translate('en', 'shell.quickNav' as MessageKey);
      expect(
        await session.evaluate<string | null>(
          `document.querySelector(${JSON.stringify(TRIGGER)}).getAttribute('aria-label')`,
        ),
      ).toBe(quickNav);
      expect(await pressTrigger()).toBe(true);
      await session.waitFor(
        `document.activeElement === document.querySelector(${JSON.stringify(FIELD)})`,
        'the palette opened from the icon rail to take the keyboard',
      );
      await closePalette();

      await expandRail();
    }, 60_000);

    it('is the same directory mirrored: the same list, in the same order, in a right-to-left interface', async () => {
      await session.setViewport(1440, 900);
      await startIn('fa');
      expect(await session.evaluate<string>('document.documentElement.dir')).toBe('rtl');

      // The same fourteen, in the same sequence: the rail's order is a fact about the product, not
      // about the words, so the mirror does not reorder the destinations.
      expect(await ask('')).toEqual(IDS);
      // Each row is named by the entry the rail draws for it, in the language being read.
      expect(
        await session.evaluateJson<string[]>(
          `JSON.stringify(
             [...document.querySelectorAll(${JSON.stringify(OPTIONS)})].map(
               (option) => (option.querySelector('span.block')?.textContent ?? '').trim(),
             ),
           )`,
        ),
      ).toEqual(namesIn('fa'));

      // A query in the interface's own script finds the entry by the name it is drawn with.
      const portfolio = translate('fa', 'shell.nav.portfolio.label' as MessageKey);
      expect(await ask(portfolio)).toEqual(['portfolio']);

      // Nothing reaches past the edge of the viewport, in either direction, and the panel is inside it.
      const overflow = await session.evaluateJson<OverflowReport>(OVERFLOW_PROBE);
      expect(overflow.total, JSON.stringify(overflow.findings)).toBe(0);
      expect(overflow.documentScrollWidth).toBeLessThanOrEqual(overflow.limit);
      expect(
        await session.evaluate<boolean>(
          `(() => {
             const box = document.querySelector(${JSON.stringify(PALETTE)}).getBoundingClientRect();
             return box.left >= 0 && box.right <= window.innerWidth + 0.5;
           })()`,
        ),
      ).toBe(true);

      await closePalette();
      await startIn(null);
    }, 60_000);

    it('never widens the page at any width, and does not move what is being read', async () => {
      for (const [width, height] of [
        [1440, 900],
        [1024, 768],
        [390, 844],
      ] as const) {
        await session.setViewport(width, height);
        await startIn(null);

        /** Where the page being read starts, so a page switch can be shown not to move it. */
        const readingBox = (): Promise<{ left: number; width: number }> =>
          session.evaluateJson(
            `JSON.stringify(
               (() => {
                 const box = document.querySelector('main h2').getBoundingClientRect();
                 return { left: Math.round(box.left), width: Math.round(box.width) };
               })(),
             )`,
          );

        const before = await readingBox();
        expect(await ask('')).toEqual(IDS);

        const overflow = await session.evaluateJson<OverflowReport>(OVERFLOW_PROBE);
        expect(overflow.total, `${width}px: ${JSON.stringify(overflow.findings)}`).toBe(0);
        expect(overflow.documentScrollWidth).toBeLessThanOrEqual(overflow.limit);
        // A truncated row is a design decision (`truncate` + the full sentence on the same row); text
        // that spills past its own box is not.
        const clipped = await session.evaluateJson<ClippingReport>(CLIPPING_PROBE);
        expect(
          clipped.sample.filter((item) => !item.truncate),
          `${width}px: ${JSON.stringify(clipped.sample)}`,
        ).toEqual([]);
        expect(
          await session.evaluate<boolean>(
            `(() => {
               const box = document.querySelector(${JSON.stringify(PALETTE)}).getBoundingClientRect();
               return box.left >= 0 && box.right <= window.innerWidth + 0.5 && box.top >= 0;
             })()`,
          ),
          `the palette is not inside the viewport at ${width}px`,
        ).toBe(true);

        // It is *over* the page rather than in it: opening the palette is not a layout shift for
        // whatever was being read underneath it.
        expect(await readingBox(), `opening the palette moved the page at ${width}px`).toEqual(
          before,
        );

        await closePalette();
      }
    }, 120_000);

    it('opens over the phone’s drawer rather than behind it', async () => {
      await session.setViewport(390, 844);
      await startIn(null);

      // On a phone the navigation is off-canvas, so the shell's control for the palette is inside the
      // drawer — the reader asks for it from the same place they ask for a page.
      expect(
        await session.evaluate<boolean>(`
          (() => {
            const trigger = document.querySelector('[aria-controls="shell-navigation"]');
            if (!trigger) return false;
            trigger.click();
            return true;
          })()
        `),
      ).toBe(true);
      await session.waitFor(
        `!!document.querySelector('[role="dialog"] nav')`,
        'the off-canvas navigation to open',
      );

      expect(
        await session.evaluate<boolean>(`
          (() => {
            const trigger = document.querySelector(${JSON.stringify(TRIGGER)});
            if (!trigger) return false;
            trigger.focus();
            trigger.click();
            return true;
          })()
        `),
      ).toBe(true);

      // One modal surface at a time: the drawer leaves as the palette arrives, rather than sitting
      // behind it holding a second copy of the same keyboard trap.
      await session.waitFor(
        `document.querySelectorAll('[role="dialog"]').length === 1 &&
         !document.querySelector('[role="dialog"] nav')`,
        'the drawer to leave and only the palette to remain',
      );
      expect(await session.evaluate<number>(`document.querySelectorAll('aside').length`)).toBe(0);
      expect(
        await session.evaluate<boolean>(
          `document.activeElement === document.querySelector(${JSON.stringify(FIELD)})`,
        ),
      ).toBe(true);

      const overflow = await session.evaluateJson<OverflowReport>(OVERFLOW_PROBE);
      expect(overflow.total, JSON.stringify(overflow.findings)).toBe(0);

      // And a destination can be opened from it with the keyboard alone.
      await session.typeText('settings');
      await session.waitFor(
        `document.querySelector(${JSON.stringify(FIELD)}).value === 'settings'`,
        'the phone palette to hold the query',
      );
      await session.pressKey('Enter');
      await session.waitFor(
        `(document.querySelector('main h2')?.textContent?.trim() ?? '') === ${JSON.stringify(headingFor('en', 'settings'))}`,
        'the Settings page to be rendered from the phone palette',
      );
      // Both surfaces are gone and the page is what is on screen.
      await session.waitFor(
        `document.querySelectorAll('[role="dialog"]').length === 0`,
        'the palette to leave with the choice',
      );
    }, 60_000);
  });

  /**
   * The session history, walked by the browser rather than by a control — Phase 8.2.4.
   *
   * The application has no router and never changes its address: a move between the fourteen sections
   * pushes a *same-URL* history entry carrying the section it was made from. So the reader's Back
   * button undoes a move, and the static-hosting property that made a router unnecessary — that a host
   * is never asked to resolve a path — is untouched.
   *
   * Every case here walks with `history.back()`/`history.forward()`, which is the same traversal the
   * buttons perform, and waits on the *page heading* rather than on `aria-current`: the store changes
   * the instant the traversal lands, and the workspace swaps its children inside `AnimatePresence`
   * afterwards, so a rail read taken too early would describe the page the reader just left.
   */
  describe('the session history, in a browser', () => {
    const RAIL_CURRENT = 'aside nav button[aria-current="page"]';
    const DRAWER_CURRENT = '[role="dialog"] nav button[aria-current="page"]';
    const DRAWER_TRIGGER = '[aria-controls="shell-navigation"]';
    const FIELD = '[role="dialog"] [role="combobox"]';

    /** The entries a navigation surface calls current, by identifier — the shell's own answer. */
    const currentIn = (scope: string): Promise<(string | null)[]> =>
      session.evaluateJson(
        `JSON.stringify(
           [...document.querySelectorAll(${JSON.stringify(scope)})].map(
             (button) => button.getAttribute('data-nav-id'),
           ),
         )`,
      );

    /** Where the document actually is. Never asserted to *change*: that is the property under test. */
    const address = (): Promise<string> => session.evaluate<string>('location.href');

    // `history.length` is deliberately *not* the measurement here, and it is also not the *starting
    // point*: see `startClean` below. The walk is the measurement: a move that was not recorded is a move
    // Back cannot undo, and every case below presses Back and asserts which page it lands on.

    /**
     * Load the application in a tab whose session history holds nothing but this document.
     *
     * A session history is per-tab and cannot be cleared from the page, this suite shares one tab for its
     * whole run, and Chrome caps a tab's history at fifty entries and prunes the oldest as new ones
     * arrive. So by the time these cases run, the entries a walk depends on are being pruned out from
     * under it: `back 2` of a four-move walk stepped past the document into whatever the suite had
     * loaded before it. That is a measurement of the browser's ceiling, not of the application.
     *
     * A reader presses Back in a tab they have just opened, so that is the tab measured here — asked of
     * the protocol rather than by opening a second browser, because the tab is the only thing that has to
     * be new. The language is cleared with it, so the case reads the chrome it means to read.
     */
    const startClean = async (preference: string | null = null): Promise<void> => {
      await session.resetNavigationHistory();
      await startIn(preference);
    };

    /** Wait until the page behind `id` is the one on screen, in the language in use. */
    const landsOn = (id: string, locale: UiLocale = 'en'): Promise<void> =>
      session.waitFor(
        `(document.querySelector('main h2')?.textContent?.trim() ?? '') === ${JSON.stringify(
          headingFor(locale, id),
        )}`,
        `the ${id} page to be the one on screen after the walk`,
      );

    /** One step backwards, and the page and the rail both agree about where the walk arrived. */
    const backTo = async (id: string): Promise<void> => {
      await session.traverseHistory('back');
      await landsOn(id);
      // Exactly one entry current, and it is the page the walk arrived at — never two, and never the
      // one that was left behind.
      expect(await currentIn(RAIL_CURRENT), `the rail after walking back to ${id}`).toEqual([id]);
    };

    /** Wait for the off-canvas navigation to be gone, exit animation and all. */
    const drawerGone = (): Promise<void> =>
      session.waitFor(
        `document.querySelectorAll('[role="dialog"]').length === 0`,
        'the off-canvas navigation to be gone',
      );

    /** Open the off-canvas navigation on a phone, and wait for it to be there. */
    const openDrawer = async (): Promise<void> => {
      expect(
        await session.evaluate<boolean>(`
          (() => {
            const trigger = document.querySelector(${JSON.stringify(DRAWER_TRIGGER)});
            if (!trigger) return false;
            trigger.click();
            return true;
          })()
        `),
        'the shell’s own control for the off-canvas navigation',
      ).toBe(true);
      await session.waitFor(
        `!!document.querySelector(${JSON.stringify(DRAWER_CURRENT)})`,
        'the off-canvas navigation to open',
      );
    };

    it('walks back and forward through the sections a reader visited, without moving the address', async () => {
      await session.setViewport(1440, 900);
      await startClean();
      await expandRail();

      const start = await address();

      // The entry the document loaded on is *named*, not merely rested on: the shell seeds it on mount,
      // so the first Back has a page to return to rather than an entry this build never wrote.
      expect(await session.evaluate<string>('JSON.stringify(history.state)')).toBe(
        '{"masterTrade.page":"dashboard"}',
      );

      // Four moves, made the way a reader makes them.
      await visit('journal');
      await visit('portfolio');
      await visit('evaluation');
      await visit('academy');
      expect(await currentIn(RAIL_CURRENT)).toEqual(['academy']);

      // Not one of the moves moved the document: this is the whole trade the phase makes — a browser
      // that can walk the sections, and a host that still has one path to serve.
      expect(await address()).toBe(start);

      await backTo('evaluation');
      await backTo('portfolio');
      await backTo('journal');
      expect(await address()).toBe(start);

      // …and forward walks the same steps in the other direction, back to where the walk began.
      await session.traverseHistory('forward');
      await landsOn('portfolio');
      expect(await currentIn(RAIL_CURRENT)).toEqual(['portfolio']);

      await session.traverseHistory('forward');
      await landsOn('evaluation');
      expect(await currentIn(RAIL_CURRENT)).toEqual(['evaluation']);

      await session.traverseHistory('forward');
      await landsOn('academy');
      expect(await currentIn(RAIL_CURRENT)).toEqual(['academy']);
      expect(await address()).toBe(start);
    }, 90_000);

    it('undoes a move made from the palette exactly as it undoes one made from the rail', async () => {
      await session.setViewport(1440, 900);
      await startClean();
      await expandRail();

      await visit('journal');

      // A destination opened from the palette is the rail's own action — the same store call — so it is
      // the same step in the history, and that is worth measuring rather than assuming: the palette is
      // the one way into a page that does not press a navigation button.
      await session.pressKey('Control+k');
      await session.waitFor(
        `document.activeElement === document.querySelector(${JSON.stringify(FIELD)})`,
        'the palette to take the keyboard',
      );
      await session.typeText('portfolio');
      await session.pressKey('Enter');
      await landsOn('portfolio');
      expect(await currentIn(RAIL_CURRENT)).toEqual(['portfolio']);

      // Back undoes it, and the palette does not come back with it: a traversal moves the page, and a
      // modal the reader already dismissed is not part of where they were.
      await backTo('journal');
      await session.waitFor(
        `document.querySelectorAll('[role="dialog"]').length === 0`,
        'the palette to stay closed across the walk back',
      );
    }, 60_000);

    it('leaves the keyboard where it was when the walk moves the page', async () => {
      await session.setViewport(1440, 900);
      await startClean();
      await expandRail();

      // Start somewhere that is not the entry the keyboard will land on, so opening it is a move.
      await visit('journal');

      // Walk in with real key presses: a programmatic `.focus()` would prove the shell moves the
      // keyboard, which is not the question — the question is whether a traversal takes it away.
      let focused: string | null = null;
      for (let presses = 0; presses < 24 && focused === null; presses += 1) {
        await session.pressKey('Tab');
        focused = await session.evaluate<string | null>(
          `(() => {
             const element = document.activeElement;
             if (!element || !element.closest('aside nav')) return null;
             return element.getAttribute('data-nav-id');
           })()`,
        );
      }
      expect(focused, 'pressing Tab never reached a navigation entry').not.toBeNull();
      expect(focused).not.toBe('journal');

      await session.pressKey('Enter');
      await landsOn(focused as string);
      expect(await currentIn(RAIL_CURRENT)).toEqual([focused]);

      // And the step back leaves the keyboard exactly where it was: the rail is one element the page
      // swaps its children inside, so the control a reader was on is still the control they are on —
      // rather than the focus landing on the document, which is where a keyboard user loses their place.
      await backTo('journal');
      expect(
        await session.evaluate<string | null>(
          `(() => {
             const element = document.activeElement;
             if (!element || !element.closest('aside nav')) return null;
             return element.getAttribute('data-nav-id');
           })()`,
        ),
        'the navigation entry a reader was on after walking back',
      ).toBe(focused);
    }, 60_000);

    it('does not spend a step on a move that goes nowhere', async () => {
      await session.setViewport(1440, 900);
      await startClean();
      await expandRail();

      await visit('journal');
      await visit('portfolio');

      // The rail's current entry is a button like every other, so this press really happens. Recorded,
      // it would be a step that appears to do nothing when it is walked — and the reader would have to
      // press Back twice to undo one move.
      await session.clickNav(labelOf('portfolio'));
      expect(await currentIn(RAIL_CURRENT)).toEqual(['portfolio']);

      // One Back, one move undone: this is what makes "the press spent nothing" a measurement rather
      // than a claim — had it recorded, this Back would have landed on the page it was pressed from.
      await backTo('journal');
    }, 60_000);

    it('keeps the page, the rail and the drawer in step when the walk happens mirrored, on a phone', async () => {
      await session.setViewport(390, 844);
      await startClean('fa');
      expect(await session.evaluate<string>('document.documentElement.dir')).toBe('rtl');
      const start = await address();

      // On a phone every move is made through the off-canvas navigation, which closes behind the choice.
      await visitIn('fa', 'usage');
      await visitIn('fa', 'profile');
      await drawerGone();

      // The walk arrives at the previous section, mirrored, with the drawer shut and exactly one entry
      // claiming the page — in the drawer, because that is the navigation this width has.
      await session.traverseHistory('back');
      await landsOn('usage', 'fa');
      await drawerGone();
      await openDrawer();
      expect(await currentIn(DRAWER_CURRENT)).toEqual(['usage']);

      // And the mirrored layout the walk arrived in is still a layout no wider than the phone.
      const overflow = await session.evaluateJson<OverflowReport>(OVERFLOW_PROBE);
      expect(overflow.total, JSON.stringify(overflow.findings)).toBe(0);
      expect(await address()).toBe(start);

      // A destination chosen from the opened drawer is a move again, and Back undoes it from there.
      await visitIn('fa', 'profile');
      await session.traverseHistory('back');
      await landsOn('usage', 'fa');

      await startClean();
    }, 90_000);
  });

  describe('the content surface, in a browser', () => {
    /**
     * Where the reader is, and how the surface under them is drawn, in one round trip.
     *
     * The column is read by shape rather than by class: it is the frame every section renders
     * inside, and `div[class*="max-w-"]` is how the other cases in this file have always found it.
     */
    const surface = (): Promise<SurfaceState> =>
      session.evaluateJson<SurfaceState>(
        `JSON.stringify(
           (() => {
             const region = document.querySelector('main');
             const column = region.querySelector('div[class*="max-w-"]').getBoundingClientRect();
             return {
               y: Math.round(window.scrollY),
               innerH: window.innerHeight,
               docH: Math.round(document.documentElement.scrollHeight),
               regionScroll: region.scrollHeight - region.clientHeight,
               columnLeft: Math.round(column.left),
               columnWidth: Math.round(column.width),
               barHeight: Math.round(document.querySelector('header').getBoundingClientRect().height),
               titleTop: Math.round(region.querySelector('h2').getBoundingClientRect().top),
             };
           })(),
         )`,
      );

    /**
     * The rail, and only the rail.
     *
     * `aside` on its own is not the navigation: the AI workspace renders a column of its own beside
     * the transcript, so "there is no aside" is not the same sentence as "there is no rail" at a
     * phone width where the navigation is a drawer. The shell's rail is the aside inside the shell's
     * own root — and never the drawer, which is a dialog.
     */
    const SHELL_RAIL = 'div.flex.min-h-screen > aside:not([role="dialog"])';

    /**
     * Watch the surface while the thing being measured moves.
     *
     * The suite's rule is that a box still animating is *waited on* rather than sampled, and these
     * cases keep it: no value is asserted mid-flight. What is asserted is an invariant that has to
     * hold at every moment in between — whether the reader is ever dropped at an offset nobody chose,
     * and whether the content is ever measured at a width it cannot have — and a settled measurement
     * cannot answer either question. The waiting is still done by `waitFor` on the application's own
     * signal; this only records what happened while it happened.
     *
     * Two instruments, because they answer different halves. `requestAnimationFrame` gives the width
     * every *painted* frame was drawn at. The scroll listener and the mutation observer give the
     * offsets the reader was put at even where no frame was painted for it — and a scroll the engine
     * makes on its own, which is what clamping a reader's position to a shorter document is, is
     * exactly the move that must not happen silently.
     */
    const watchSurface = (): Promise<null> =>
      session.evaluate<null>(
        `(() => {
           window.__surfaceFrames = [];
           window.__surfaceWatched = [];
           window.__surfaceWatching = true;
           const record = () => {
             const region = document.querySelector('main');
             window.__surfaceWatched.push([
               Math.round(window.scrollY),
               Math.round(document.documentElement.scrollHeight),
               region ? Math.round(region.getBoundingClientRect().height) : 0,
               window.innerHeight,
             ]);
           };
           window.addEventListener('scroll', record, { passive: true });
           new MutationObserver(record).observe(document.querySelector('main'), {
             childList: true,
             subtree: true,
           });
           record();
           const tick = () => {
             const region = document.querySelector('main');
             const column = region ? region.querySelector('div[class*="max-w-"]') : null;
             const rail = document.querySelector(${JSON.stringify(SHELL_RAIL)});
             window.__surfaceFrames.push({
               y: Math.round(window.scrollY),
               innerH: window.innerHeight,
               docH: Math.round(document.documentElement.scrollHeight),
               regionHeight: region ? Math.round(region.getBoundingClientRect().height) : 0,
               regionClientWidth: region ? region.clientWidth : 0,
               regionScrollWidth: region ? region.scrollWidth : 0,
               columnWidth: column ? Math.round(column.getBoundingClientRect().width) : 0,
               railWidth: rail ? Math.round(rail.getBoundingClientRect().width) : 0,
             });
             if (window.__surfaceWatching) requestAnimationFrame(tick);
           };
           requestAnimationFrame(tick);
           return null;
         })()`,
      );

    const watched = async (): Promise<{
      frames: SurfaceFrame[];
      moments: number[][];
    }> => {
      const result = await session.evaluateJson<{ frames: SurfaceFrame[]; moments: number[][] }>(
        `((window.__surfaceWatching = false), JSON.stringify({
           frames: window.__surfaceFrames,
           moments: window.__surfaceWatched,
         }))`,
      );
      expect(result.moments.length, 'the surface was never recorded').toBeGreaterThan(0);
      return result;
    };

    /**
     * Wait for the shell to be the shell this width has.
     *
     * Called *after* the application has been loaded at the new width, never in place of it: crossing
     * the phone boundary deliberately leaves the tab on a blank document (`setViewport` explains why),
     * so the shell is started at a width rather than asked to follow one — which is also what a reader
     * does when they open the app on that screen. This only says how to tell that it has arrived: the
     * rail belongs to the three wider modes, and the drawer's trigger to the phone.
     */
    const settleShell = (width: number): Promise<void> =>
      session.waitFor(
        width < 768
          ? `!document.querySelector(${JSON.stringify(SHELL_RAIL)}) && Boolean(document.querySelector('[aria-controls="shell-navigation"]'))`
          : `Boolean(document.querySelector(${JSON.stringify(SHELL_RAIL)})?.querySelector('nav button'))`,
        width < 768
          ? `the phone’s navigation trigger, and no rail beside it, at ${width}px`
          : `the rail’s own navigation at ${width}px`,
      );

    it('starts every section at its own origin, from wherever the last one was left', async () => {
      for (const locale of ['en', 'fa'] as const) {
        for (const [width, height] of [
          [1440, 900],
          [390, 844],
        ] as const) {
          const where = `${locale} at ${width}px`;
          await session.setViewport(width, height);
          await startIn(locale);
          await settleShell(width);
          if (width >= 768) await expandRail();
          expect(await session.evaluate<string>('document.documentElement.dir')).toBe(
            locale === 'fa' ? 'rtl' : 'ltr',
          );

          // The journal read from its bottom: a section taller than the window, with the reader deep
          // inside it.
          await visitIn(locale, 'journal');
          await session.evaluate<null>(
            '((window.scrollTo(0, document.documentElement.scrollHeight)), null)',
          );
          const deep = await surface();
          expect(deep.y, `the journal did not scroll for ${where}`).toBeGreaterThan(0);

          // Then a different section — too tall to fit, so the offset it inherits is one it *can*
          // keep. That is the measurement: this used to leave the reader at whatever the engine
          // clamped the old offset to, which is the end of a section they had not started reading.
          await visitIn(locale, 'lab');
          const arrived = await surface();
          expect(arrived.y, `the change to the lab for ${where} left the reader mid-section`).toBe(
            0,
          );

          // …and it arrives without moving the shell: the section's own frame and the bar above it
          // are where they already were. Mirrored, that is the same claim about the same two edges —
          // the section reads from its own start, whichever side that is.
          expect(
            { left: arrived.columnLeft, width: arrived.columnWidth },
            `the change for ${where} moved the page sideways`,
          ).toEqual({ left: deep.columnLeft, width: deep.columnWidth });
          expect(arrived.barHeight, `the change for ${where} resized the top bar`).toBe(
            deep.barHeight,
          );

          // The section it arrived at is presented from its beginning rather than from its foot: its
          // own title is on screen.
          expect(
            arrived.titleTop,
            `the lab’s title is off screen for ${where}`,
          ).toBeGreaterThanOrEqual(0);
          expect(arrived.titleTop).toBeLessThan(arrived.innerH);
        }
      }
    }, 120_000);

    it('fills the window on every section, and never becomes a second scroll surface', async () => {
      for (const [width, height] of [
        [1440, 900],
        [390, 844],
      ] as const) {
        await session.setViewport(width, height);
        await startIn(null);
        await settleShell(width);

        for (const section of NAV_SECTIONS) {
          await visit(section.id);
          const state = await surface();

          // The region a section renders into never scrolls on its own: if it did, the reader would
          // have two scroll positions and the wheel would only ever move one of them.
          expect(
            state.regionScroll,
            `${section.id} makes the content region a scroll box at ${width}px`,
          ).toBe(0);

          // And the surface is never shorter than the window, so a section with less content than a
          // screen still fills it rather than leaving the footer floating above a gap.
          expect(
            state.docH,
            `${section.id} leaves the surface shorter than the window at ${width}px`,
          ).toBeGreaterThanOrEqual(state.innerH);
        }
      }
    }, 120_000);

    it('never measures the content at a width it cannot have while the rail moves', async () => {
      await session.setViewport(1440, 900);
      await startIn(null);
      await expandRail();
      await visit('journal');

      await watchSurface();
      expect(await pressInRail('Collapse sidebar'), 'the rail’s collapse control').toBe(true);
      await waitForRail('< 100', 'the rail to collapse');
      const { frames } = await watched();
      expect(frames.length, 'the rail’s transition was never painted').toBeGreaterThan(1);

      for (const frame of frames) {
        // The rail animates 264px → 76px, so the content beside it is a different width on every
        // frame. Nothing may spill in the meantime: a row that is one pixel too wide is a scrollbar
        // appearing under the reader's pointer and then leaving again.
        expect(
          frame.regionScrollWidth - frame.regionClientWidth,
          `the content region overflowed at rail width ${frame.railWidth}px`,
        ).toBeLessThanOrEqual(1);

        // …and the frame a section renders into is always its region's own width, capped at the
        // model's column. A frame that were briefly the *old* width would be the column flashing at
        // a size the shell can no longer give it.
        expect(
          Math.abs(frame.columnWidth - Math.min(frame.regionClientWidth - 40, 1400)),
          `the column was ${frame.columnWidth}px in a ${frame.regionClientWidth}px region`,
        ).toBeLessThanOrEqual(1);

        expect(frame.railWidth).toBeGreaterThanOrEqual(76);
        expect(frame.railWidth).toBeLessThanOrEqual(264);
      }

      expect((await surface()).regionScroll, 'the content region became a scroll box').toBe(0);
      await expandRail();
    }, 120_000);

    it('never drops the reader somewhere they did not ask for while a section changes', async () => {
      await session.setViewport(1440, 900);
      await startIn(null);
      await expandRail();

      await visit('journal');
      await session.evaluate<null>(
        '((window.scrollTo(0, document.documentElement.scrollHeight)), null)',
      );
      const deep = (await surface()).y;
      expect(deep).toBeGreaterThan(0);

      // Watch the whole change: the outgoing section, the swap, and the arriving one.
      await watchSurface();
      await visit('lab');
      const { frames, moments } = await watched();

      // Every moment — a painted frame, a scroll the engine made, or a change inside the region — is
      // either where the reader was reading or the new section's own beginning. A third offset is a
      // position nobody chose, and the one that used to exist was the engine's: the old offset,
      // clamped to however short the section that had not finished arriving was.
      const offsets = [...new Set(moments.map((moment) => moment[0] ?? 0))].sort((a, b) => a - b);
      expect(
        offsets.filter((offset) => offset !== 0 && offset !== deep),
        `offsets the reader was put at on the way: ${JSON.stringify(offsets)}`,
      ).toEqual([]);

      // The surface is never empty while one section replaces another. An empty region is a document
      // whose height collapses for as long as it lasts, and a collapsed document is what invites the
      // engine to move a reader.
      for (const [y, docH, regionHeight, innerH] of moments) {
        expect(regionHeight, `the content region emptied at offset ${y}`).toBeGreaterThan(0);
        expect(docH, `the surface fell below the window at offset ${y}`).toBeGreaterThanOrEqual(
          innerH ?? 0,
        );
      }

      // …and it stayed there: no painted frame may describe a surface that contradicts the record.
      for (const frame of frames) {
        expect(frame.regionHeight, 'a painted frame had no content in it').toBeGreaterThan(0);
        expect(frame.docH, 'a painted frame was shorter than the window').toBeGreaterThanOrEqual(
          frame.innerH,
        );
      }

      expect((await surface()).y, 'the new section did not start at its origin').toBe(0);
    }, 120_000);
  });
});
