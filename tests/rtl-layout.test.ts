/**
 * Phase 7.5.3.4.4 — the interface laid out right-to-left.
 *
 * The Persian *copy* landed in 7.5.3.3 and the writing direction was left to its own control. That control
 * could only be one of two things, so a person choosing Persian got Persian words in a left-to-right page
 * until they found a second switch — which is a translation that renders as a broken layout. This phase gives
 * direction the shape the language has (**a default that follows the language, and a pin that overrides it**)
 * and makes the layout actually survive the mirror.
 *
 * The mirror is almost entirely the cascade's job, which is why so much of this suite is a list of things the
 * tree may *not* contain. A physical utility (`pl-5`, `text-right`, `border-l`) is invisible in English and a
 * defect in Persian, and the only way to keep forty components honest is to read them:
 *
 *   1. **Direction is derived, and derived in one place.** `directionOf(preference, locale)`, applied to
 *      `<html>` by the hook the shell calls — plus once before the first paint, so a Persian reader never
 *      sees an unmirrored frame.
 *   2. **Flow, not geometry.** Inline start and end, list markers, chevrons that mean "next" — those move. A
 *      figure's sign, a chart's axis, a market arrow and a corner of light do not, and each of those is
 *      named here rather than left to a convention nobody wrote down.
 *   3. **A glyph with a direction-shaped meaning is chosen in JavaScript**, because the cascade cannot know
 *      which chevron means "previous".
 *   4. **Free text carries its own direction.** A turn's body, a composer, a notification: each is written in
 *      whichever language its author chose, and `dir="auto"` is what keeps an English sentence readable inside
 *      a Persian page.
 *
 * Read from the source, so it runs offline and needs no browser; the browser suite measures what only a layout
 * engine can answer (overflow, clipping and metric parity under a real mirror).
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DIRECTION_PREFERENCE,
  DIRECTION_PREFERENCES,
  LOCALE_HTML_TAGS,
  TEXT_DIRECTIONS,
  directionOf,
  isRtlLocale,
  translate,
  uiLocaleOf,
  useTextDirection,
} from '../web/src/i18n/index.js';

/* -------------------------------------------------------------------------- */
/* Reading the tree                                                            */
/* -------------------------------------------------------------------------- */

function strip(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function code(path: string): string {
  return strip(readFileSync(path, 'utf8'));
}

/**
 * Every module under the UI, `.ts` as well as `.tsx`.
 *
 * The `.ts` half matters more than it looks: a class list can live in a labels map or a data module, and a
 * scan that only read components would call a page clean while its cell styling sat one import away.
 */
function uiSources(): string[] {
  const walk = (directory: string): string[] => {
    const found: string[] = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) found.push(...walk(path));
      else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) found.push(path);
    }
    return found;
  };
  return walk(join('web', 'src')).map((path) => path.split(sep).join('/'));
}

/**
 * The utilities that mean "the left" rather than "the start".
 *
 * Each fragment is written so it cannot match a neighbour by accident: `\bborder-[lr]\b` needs a word
 * boundary after the letter, which is what keeps `border-radius` out, and the leading lookbehind stops
 * `x-pl-`-style prefixes from reading as a padding utility.
 */
const PHYSICAL_UTILITY = new RegExp(
  [
    // The value is letters, digits and unit syntax — deliberately **not** a hyphen, so that prose like
    // `left-to-right` inside a string does not read as a class list. Every real utility's value is one
    // token: `5`, `1/2`, `full`, `[var(--x)]`.
    String.raw`(?<![\w-])-?(?:ml|mr|pl|pr)-[A-Za-z0-9/.%\[\]()]+(?![\w-])`,
    String.raw`(?<![\w-])-?(?:left|right)-[A-Za-z0-9/.%\[\]()]+(?![\w-])`,
    String.raw`(?<![\w-])-?translate-x-[A-Za-z0-9/.%\[\]()]+(?![\w-])`,
    String.raw`(?<![\w-])space-x-[A-Za-z0-9/.%\[\]()]+(?![\w-])`,
    String.raw`\btext-(?:left|right)\b`,
    String.raw`\bborder-[lr]\b(?:-[A-Za-z0-9/.%\[\]()]+)?`,
    String.raw`\brounded-[lr]\b(?:-[A-Za-z0-9/.%\[\]()]+)?`,
    String.raw`\bfloat-(?:left|right)\b`,
    String.raw`\b(?:space|divide)-x-reverse\b`,
    String.raw`\bflex-row-reverse\b`,
    String.raw`\bscale-x-\[-1\]\b`,
    String.raw`\bscaleX\(-1\)`,
  ].join('|'),
  'g',
);

/**
 * The physical things the tree is allowed to contain, each with the reason it is not a mirror defect.
 *
 * An allow-list rather than a rule with holes in it: a reviewer reading this can disagree with one entry,
 * and a new physical utility anywhere else fails the suite instead of blending in.
 */
const ALLOWED: readonly { file: string; pattern: RegExp; why: string }[] = [
  {
    file: 'web/src/components/Modal.tsx',
    pattern: /left-1\/2|-translate-x-1\/2/,
    why: 'a centred overlay is centred in both directions: the offset and the transform are opposite and equal, so neither direction moves it',
  },
  {
    file: 'web/src/components/journal/PerformanceChart.tsx',
    pattern: /-translate-x-1\/2|\{ left: /,
    why: "the tooltip's anchor is computed from a datum's x position inside a frame pinned to `direction: ltr` (a time series)",
  },
];

/** Every physical utility in the tree, with the file it appears in. */
function physicalUtilities(): { file: string; match: string }[] {
  const findings: { file: string; match: string }[] = [];
  for (const file of uiSources()) {
    if (file.startsWith('web/src/i18n/messages.')) continue;
    const text = strip(readFileSync(file, 'utf8'));
    for (const match of text.matchAll(PHYSICAL_UTILITY)) {
      findings.push({ file, match: match[0] });
    }
  }
  return findings;
}

/** The physical properties a stylesheet is allowed to contain, for the same reason as `ALLOWED`. */
const ALLOWED_CSS: readonly { selector: string; pattern: RegExp; why: string }[] = [
  {
    selector: '.composer-frame::after',
    pattern: /left: -10px/,
    why: 'light does not mirror: every gradient in the product is lit from above and this gleam is one corner of one frame, not a position in the flow',
  },
  {
    selector: '.agent-ring-active::before',
    pattern: /left: 50%/,
    why: 'the sweep is centred by an offset and an equal transform, so it lands in the same place in either direction',
  },
];

describe('the writing direction is derived from the language (Task 1)', () => {
  it('is right-to-left exactly when the interface language is', () => {
    expect(isRtlLocale('fa')).toBe(true);
    expect(isRtlLocale('en')).toBe(false);

    // The automatic answer comes from the *locale*, so the Settings switch mirrors the interface by
    // itself — which is the phase's requirement, and the reason `auto` is the default.
    expect(uiLocaleOf('fa')).toBe('fa');
    expect(directionOf('auto', uiLocaleOf('fa'))).toBe('rtl');
    expect(directionOf('auto', uiLocaleOf('en'))).toBe('ltr');
    expect(directionOf('auto', uiLocaleOf('auto'))).toBe('ltr');

    // Persian is also the language the agent is answered in, and both go through the same setting.
    expect(LOCALE_HTML_TAGS.fa).toMatch(/^fa/);
  });

  it('lets a pin win over the language, and the default be the default', () => {
    expect(DIRECTION_PREFERENCES).toEqual(['auto', 'ltr', 'rtl']);
    expect(DEFAULT_DIRECTION_PREFERENCE).toBe('auto');
    expect(TEXT_DIRECTIONS).toEqual(['ltr', 'rtl']);
    for (const locale of ['fa', 'en'] as const) {
      expect(directionOf('ltr', locale)).toBe('ltr');
      expect(directionOf('rtl', locale)).toBe('rtl');
    }
  });

  it('is written to the document by one owner, before the first paint as well as after it', () => {
    // Before paint: `main.tsx` applies the stored setting, so a Persian reader never sees a
    // left-to-right frame and then a mirror of it.
    const main = code('web/src/main.tsx');
    expect(main).toMatch(/applyDocumentLocale\(/);
    expect(main).toMatch(/useUiStore\.getState\(\)/);

    // After paint: the hook the shell calls owns both attributes, because they are one decision.
    const hooks = code('web/src/i18n/useTranslation.ts');
    expect(hooks).toMatch(/documentElement\.lang = LOCALE_HTML_TAGS\[locale\]/);
    expect(hooks).toMatch(/documentElement\.dir = direction/);
    expect(hooks).toMatch(/export function applyDocumentLocale/);
    const shell = code('web/src/app/AppShell.tsx');
    expect(shell).toMatch(/useDocumentLanguage\(\)/);

    // And nowhere else: a second writer is how `lang` and `dir` end up describing different settings.
    const writers = uiSources().filter((file) =>
      /documentElement\.(dir|lang)\s*=/.test(strip(readFileSync(file, 'utf8'))),
    );
    expect(writers).toEqual(['web/src/i18n/useTranslation.ts']);
  });

  it('offers the three choices in the interface, in both languages', () => {
    // A control that pins the direction is the only way "Persian, laid out like the English interface"
    // can be expressed; the automatic option is what makes the language switch mirror the page.
    const settings = code('web/src/pages/SettingsPage.tsx');
    expect(settings).toMatch(/DIRECTION_PREFERENCES\.map\(/);
    for (const key of [
      'settings.directionAutomatic',
      'settings.directionFollowsTheLanguage',
      'settings.leftToRight',
      'settings.rightToLeft',
      'settings.chartsAndNumericReadoutsStayLTR',
    ] as const) {
      expect(translate('en', key).length).toBeGreaterThan(0);
      expect(translate('fa', key), `${key} is not translated`).not.toBe(translate('en', key));
    }
    // The topbar's quick toggle names the direction it is about to switch *to*, in the interface's own
    // language — which the phase's own subject makes load-bearing.
    const topbar = code('web/src/app/Topbar.tsx');
    expect(topbar).toMatch(/msg\('topbar\.switchToRightToLeftLayout'\)/);
    expect(topbar).toMatch(/msg\('topbar\.switchToLeftToRightLayout'\)/);
    expect(topbar).not.toMatch(/'Switch to (?:right|left)-to-(?:left|right) layout'/);
  });
});

describe('flow moves and geometry does not (Task 2)', () => {
  it('contains no physical direction utility outside the named exceptions', () => {
    const findings = physicalUtilities();
    const unexplained = findings.filter(
      (finding) =>
        !ALLOWED.some(
          (allowed) => allowed.file === finding.file && allowed.pattern.test(finding.match),
        ),
    );
    expect(
      unexplained.map((finding) => `${finding.file}: ${finding.match}`),
      'a physical direction utility does not mirror',
    ).toEqual([]);

    // The allow-list is not a place to hide: everything on it is still there, and only there.
    for (const allowed of ALLOWED) {
      expect(
        findings.some(
          (finding) => finding.file === allowed.file && allowed.pattern.test(finding.match),
        ),
        `${allowed.file} no longer contains the exception it was listed for`,
      ).toBe(true);
    }
    expect(findings.length).toBeGreaterThan(0);
  });

  it('never reverses an element to mirror it', () => {
    // A mirrored chevron means "back" in one direction and "next" in the other; a reversed *row* is the
    // same mistake one level up, and a flipped axis reverses a chart's data. Both are refused by the
    // scan above, and this states the rule in the one place that would be tempting.
    const findings = physicalUtilities().filter((finding) =>
      /flex-row-reverse|scale-x-\[-1\]|scaleX\(-1\)|divide-x-reverse|space-x-reverse/.test(
        finding.match,
      ),
    );
    expect(findings).toEqual([]);
  });

  it('keeps the physical properties a mirror must not touch where they are, and says why', () => {
    const css = readFileSync(join('web', 'src', 'styles', 'global.css'), 'utf8');
    for (const allowed of ALLOWED_CSS) {
      expect(css, `${allowed.selector} is no longer a physical exception`).toContain(
        allowed.selector,
      );
      expect(css, `${allowed.selector} no longer contains ${allowed.pattern}`).toMatch(
        allowed.pattern,
      );
    }
    // The lit edges are the ones that *did* have to move: a hairline inset from the corners has to be
    // inset from the corners the layout actually has.
    expect(css).toMatch(/\.edge-highlight::before[\s\S]*?inset-inline: 0\.5rem/);
    expect(css).toMatch(/\.edge-under::after[\s\S]*?inset-inline: 0\.5rem/);
  });

  it('anchors a popover to the direction rather than to a side', () => {
    // The rail's tooltips open away from the rail and toward the workspace, and which *side* that is depends
    // on the direction. A literal `side="right"` is the same defect as `pl-5` one layer out: correct in
    // English, pointing off the edge of the screen in Persian — and harder to see, because a popper's
    // collision avoidance usually rescues it before anyone notices.
    const anchored: string[] = [];
    for (const file of uiSources()) {
      for (const match of strip(readFileSync(file, 'utf8')).matchAll(
        /side=["'](?:left|right)["']/g,
      )) {
        anchored.push(`${file}: ${match[0]}`);
      }
    }
    expect(anchored).toEqual([]);

    // ...and the rail states which side it is, from the resolved direction.
    const sidebar = code('web/src/app/Sidebar.tsx');
    expect(sidebar).toMatch(/direction === 'rtl' \? 'left' : 'right'/);
  });

  it('leaves a figure, a chart and a market arrow alone', () => {
    const css = readFileSync(join('web', 'src', 'styles', 'global.css'), 'utf8');
    // A figure is a technical string: its sign is neutral in the bidi algorithm, so `−1.00R` mirrored is
    // `1.00R−`, which is a different number. The isolation rule predates this phase and must survive it.
    expect(css).toMatch(/\.num \{[\s\S]*?direction: ltr;[\s\S]*?unicode-bidi: isolate;/);
    // No direction rule may reach inside it.
    expect(css).not.toMatch(/\[dir=['"]rtl['"]\][\s\S]{0,200}\.num/);

    // A time series is read left to right in every language this product speaks.
    const frame = readFileSync(
      join('web', 'src', 'components', 'charts', 'ChartFrame.tsx'),
      'utf8',
    );
    expect(frame).toMatch(/direction: 'ltr'/);
    // And it says so, next to the rule, because "the chart did not mirror" is the kind of thing a later
    // phase would otherwise fix.
    expect(frame).toMatch(/direction: ltr` is deliberate/);

    // A market arrow is a fact about the market, not a position in the flow: `long` must not become
    // `short` because the interface was mirrored. Neither of these goes through the flow glyphs.
    const badge = code(join('web', 'src', 'components', 'journal', 'DirectionBadge.tsx'));
    expect(badge).toMatch(/ArrowUpRight/);
    expect(badge).toMatch(/ArrowDownRight/);
    expect(badge).not.toMatch(/Directional/);
    const trend = code(join('web', 'src', 'components', 'Trend.tsx'));
    expect(trend).not.toMatch(/Directional/);
    const table = code(join('web', 'src', 'components', 'Table.tsx'));
    expect(table).toMatch(/ArrowUp|ArrowDown/);
    expect(table).not.toMatch(/Directional/);
  });
});

describe('a glyph that means a position in the flow (Task 3)', () => {
  it('chooses the glyph from the resolved direction, not from a transform', () => {
    const directional = code(join('web', 'src', 'components', 'Directional.tsx'));
    expect(directional).toMatch(/export function BackIcon/);
    expect(directional).toMatch(/export function ForwardIcon/);
    expect(directional).toMatch(/export function PanelStartIcon/);
    // Each one reads the resolved direction, so a control that moved the direction repaints the glyphs.
    expect([...directional.matchAll(/useTextDirection\(\)/g)]).toHaveLength(3);
    expect(directional).toMatch(/direction === 'rtl' \? ChevronRight : ChevronLeft/);
    expect(directional).toMatch(/direction === 'rtl' \? ChevronLeft : ChevronRight/);
    expect(directional).toMatch(/direction === 'rtl' \? PanelRight : PanelLeft/);
    // ...and it is a component, not a hook, so the suite can require it in the tree.
    expect(useTextDirection).toBeTypeOf('function');
  });

  it('is the only way a page asks for a previous or next glyph', () => {
    const CALL_SITES = [
      'web/src/components/journal/ScreenshotGallery.tsx',
      'web/src/components/journal/TradeTable.tsx',
      'web/src/components/journal/JournalCalendar.tsx',
      'web/src/app/Sidebar.tsx',
    ];
    for (const file of CALL_SITES) {
      const text = code(file);
      expect(text, `${file} still picks its own directional glyph`).not.toMatch(
        /Chevron(?:Left|Right)|Panel(?:Left|Right)/,
      );
      expect(text, `${file} does not use the flow glyphs`).toMatch(
        /BackIcon|ForwardIcon|PanelStartIcon/,
      );
    }
  });

  it('does not leave a physical chevron anywhere that means a direction', () => {
    // A vertical chevron (a disclosure) and a rotational glyph are not positional, so they stay where they
    // are; the scan is what keeps the two groups from drifting into each other.
    const positional = uiSources()
      .filter((file) => !file.endsWith('components/Directional.tsx'))
      .filter((file) =>
        /Chevron(?:Left|Right)|Panel(?:Left|Right)/.test(strip(readFileSync(file, 'utf8'))),
      );
    expect(positional).toEqual([]);
  });
});

describe('free text carries its own direction (Task 4)', () => {
  it('marks the surfaces whose content somebody else wrote', () => {
    // The document's direction is the *interface's*; each of these holds text whose language is decided by
    // whoever typed it, so the paragraph follows its own first strong character instead.
    const surfaces = [
      ['web/src/pages/AgentWorkspacePage.tsx', 'a turn’s body'],
      ['web/src/components/agent/MessageComposer.tsx', 'the field a person types into'],
      ['web/src/components/Alert.tsx', 'a notification or a toast'],
    ] as const;
    for (const [file, what] of surfaces) {
      expect(code(file), `${what} does not set its own direction`).toMatch(/dir="auto"/);
    }
  });

  it('never pins a direction on a component', () => {
    // `dir="rtl"` on an element is a second opinion about the document, and one nothing else can see. The
    // only value a component may set is `auto`, which *asks* rather than declares.
    const pinned: string[] = [];
    for (const file of uiSources()) {
      for (const match of strip(readFileSync(file, 'utf8')).matchAll(/dir=["'](ltr|rtl)["']/g)) {
        pinned.push(`${file}: ${match[0]}`);
      }
    }
    expect(pinned).toEqual([]);
  });

  it('keeps the Persian catalogue’s own figures as figures, in an RTL page', () => {
    // The mixed case the phase names: a Persian sentence with a price in it. The figure is Latin and
    // isolated (`.num`), the sentence around it is Persian and right-to-left, and neither corrupts the
    // other — which is what the two rules together buy.
    const css = readFileSync(join('web', 'src', 'styles', 'global.css'), 'utf8');
    expect(css).toMatch(/:lang\(fa\) \{\s*font-family: var\(--font-fa\)/);
    expect(css).toMatch(/\.num \{/);
    // The Persian face is keyed to the language and not to the direction, so an English sentence inside a
    // Persian page keeps the Latin stack.
    expect(css).not.toMatch(/\[dir=['"]rtl['"]\][\s\S]{0,120}font-family: var\(--font-fa\)/);
  });
});
