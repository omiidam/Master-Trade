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
 *   - the suite asserts what a browser measured, and nothing about what the CSS suggests.
 *
 * Where a state genuinely cannot be reached in this build — the pages render labelled
 * fixtures, so "empty" and "error" are not reachable through the UI — this file does not
 * invent a way to reach them. `docs/product-foundation-handoff.md` records that as a
 * known limitation instead.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NAV_SECTIONS } from '../../web/src/config/navigation.js';
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

      // Rendered order is by group, not declaration order — `NAV_SECTIONS` lists the
      // product's page order so the two stay independent, and the assertion has to
      // respect that rather than quietly requiring the file to be sorted for display.
      const grouped = (['workspace', 'learning', 'system'] as const).flatMap((group) =>
        NAV_SECTIONS.filter((section) => section.group === group).map((section) =>
          translate('en', section.labelKey),
        ),
      );
      expect(entries).toEqual(grouped);
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
  /* D. Accessibility in the rendered document                               */
  /* ---------------------------------------------------------------------- */

  describe('accessibility', () => {
    it('names every control and every image the browser paints', async () => {
      const problems: string[] = [];
      for (const width of [1440, 390]) {
        await session.setViewport(width, 900);
        await session.goto(`${server.origin}/`);
        for (const section of NAV_SECTIONS) {
          await visit(section.id);
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

    /** How many tabs the page that is open renders, and whether one of them is the selected one. */
    const tabCount = (): Promise<number> =>
      session.evaluate<number>(`document.querySelectorAll('main [role="tab"]').length`);

    const tabSelected = (index: number): Promise<boolean> =>
      session.evaluate<boolean>(
        `document.querySelectorAll('main [role="tab"]')[${index}]?.getAttribute('aria-selected') === 'true'`,
      );

    /**
     * Select a tab by position, with a real `mousedown`.
     *
     * Radix activates a tab on `mousedown`, so a synthetic `.click()` is silently ignored — a trap this suite
     * sprang on its first run, and the reason the loop below waits for `aria-selected` rather than assuming the
     * click landed.
     */
    const selectTab = async (index: number, where: string): Promise<void> => {
      await session.evaluate(`
        (() => {
          const tab = document.querySelectorAll('main [role="tab"]')[${index}];
          if (!tab) return false;
          tab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
          return true;
        })()
      `);
      await session.waitFor(
        `document.querySelectorAll('main [role="tab"]')[${index}]?.getAttribute('aria-selected') === 'true'`,
        `tab ${index} of ${where} to be selected`,
      );
    };

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
          const tabs = await tabCount();
          for (let index = 0; index < tabs; index += 1) {
            if (await tabSelected(index)) continue;
            await selectTab(index, section.id);
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
        const tabs = await tabCount();
        for (let index = 0; index < tabs; index += 1) {
          if (await tabSelected(index)) continue;
          await selectTab(index, section.id);
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
});
