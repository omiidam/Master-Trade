/**
 * Section 7.4 — the design system, as the application actually uses it.
 *
 * Sections 7.1–7.3 built the system: tokens, cards, tables, charts, indicators. This suite is about
 * the *gaps between them*, which is where a design system fails in practice — a second
 * implementation of a control that drifts from the first, a focus ring suppressed without a
 * replacement, a target too small to hit, a figure that reorders itself in a right-to-left line.
 *
 * Every rule here is stated as what the product must *not* contain, because that is what a reviewer
 * or a later phase can break without noticing:
 *
 *   - **Two tab strips.** The journal carried its own rail, trigger and panel. It drifted, and the
 *     way it drifted was that it suppressed the focus ring while the shared trigger kept it — so a
 *     keyboard user tabbing the journal's sections saw nothing.
 *   - **A focusable thing with no focus.** `outline-none` is a legitimate part of a control's style
 *     only when the same class list draws a different cue.
 *   - **A target smaller than a thumb.** The journal's figure hint was a 13px glyph.
 *   - **A figure that is not a figure.** A sign is a neutral character in the bidi algorithm, so
 *     `−1.00R` beside right-to-left text resolves to `1.00R−`.
 *
 * Read from the source, so it runs offline and needs no browser.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const COMPONENTS = join('web', 'src', 'components');

/** A source file with its comments removed, so prose about a rule is not a declaration of one. */
function strip(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function code(path: string): string {
  return strip(readFileSync(path, 'utf8'));
}

/** Every `.ts`/`.tsx` file under the UI, with forward-slash paths. */
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

function pages(): string[] {
  return uiSources().filter((file) => file.startsWith('web/src/pages/'));
}

describe('one control, one implementation', () => {
  it('has exactly one tab strip in the tree', () => {
    // Two tab strips is not variety; it is two places for the focus ring, the keyboard behaviour and
    // the responsive story to disagree. The journal's own rail is gone and the shared one serves it.
    const owners = uiSources().filter((file) => code(file).includes('@radix-ui/react-tabs'));
    expect(owners).toEqual(['web/src/components/Tabs.tsx']);
    expect(code('web/src/components/Tabs.tsx')).toMatch(/export function Tabs/);
    expect(code('web/src/components/Tabs.tsx')).toMatch(/export function TabPanel/);
  });

  it('keeps every page on the shared card, table and control components', () => {
    // A page that hand-rolls a `<table>` or a tab strip is the beginning of a page-specific design
    // system. The pages build their screens out of the shared parts and nothing else.
    const offenders: string[] = [];
    for (const file of pages()) {
      const source = code(file);
      if (source.includes('<table')) offenders.push(`${file} renders a raw table`);
      if (source.includes('role="tablist"')) offenders.push(`${file} renders a raw tablist`);
      if (source.includes('@radix-ui/react-'))
        offenders.push(`${file} reaches for a Radix primitive`);
    }
    expect(offenders).toEqual([]);
  });

  it('no longer exports the journal\u2019s second tab component', () => {
    // The removal is asserted, not assumed: a barrel that still offers it is how a deleted control
    // comes back.
    for (const barrel of ['web/src/components/index.ts', 'web/src/components/journal/index.ts']) {
      expect(code(barrel), `${barrel} still offers JournalTabs`).not.toMatch(/JournalTabs/);
      expect(code(barrel), `${barrel} still offers JournalTabItem`).not.toMatch(/JournalTabItem/);
    }
    const journalPage = code('web/src/pages/JournalPage.tsx');
    expect(journalPage).toMatch(/from '\.\.\/components\/Tabs'/);
    expect(journalPage).toMatch(/<Tabs/);
    expect(journalPage).toMatch(/<TabPanel value=/);
  });
});

describe('nothing focusable is invisible', () => {
  it('states the focus ring once, for the whole product', () => {
    const css = readFileSync(join('web', 'src', 'styles', 'global.css'), 'utf8');
    expect(css).toMatch(/:focus-visible \{\n\s+outline: 2px solid var\(--color-focus\);/);
    // Drawn outside the box, so a ring can never move the control that has it.
    expect(css).toMatch(/outline-offset: 2px/);
  });

  it('never suppresses the ring without drawing a different cue', () => {
    // The rule, and the reason it is per-line: `outline-none` is only acceptable beside a cue the
    // same element draws — a ring, a shadow, a border colour, or an underline. Two places qualify,
    // and both are named here so a third cannot appear quietly.
    const allowed: Record<string, string> = {
      'web/src/components/decisions/EvaluationPanels.tsx': 'focus ring drawn beside it',
      'web/src/components/realtime/CancelTaskControl.tsx':
        'the field draws a border colour instead',
      'web/src/components/journal/TradeForm.tsx': 'the field draws a border colour instead',
      // A dialog *surface*, not a control: Radix focuses it on open and traps focus on the controls
      // inside it, so a ring drawn round the whole panel would point at nothing a user can press.
      'web/src/components/Modal.tsx': 'a dialog surface, not a control',
      'web/src/components/journal/FullscreenChartViewer.tsx': 'a dialog surface, not a control',
    };
    const offenders: string[] = [];
    for (const file of uiSources()) {
      for (const [index, line] of code(file).split('\n').entries()) {
        if (!/outline-(none|hidden)/.test(line)) continue;
        const cue = /ring-|shadow-|border-(primary|focus|strong)|underline/.test(line);
        if (!cue && !(file in allowed)) offenders.push(`${file}:${index + 1}`);
      }
    }
    expect(offenders).toEqual([]);

    // And every named exception is still a real line, so the list cannot rot into permission.
    for (const file of Object.keys(allowed)) {
      const named = code(file)
        .split('\n')
        .some((line) => /outline-(none|hidden)/.test(line));
      expect(named, `${file} no longer suppresses a focus ring — drop it from the list`).toBe(true);
    }
  });

  it('lets a keyboard user see where they land inside a panel', () => {
    // The tab content is focusable on purpose, and it used to suppress the ring while drawing
    // nothing in its place — the one control reached *after* the strip was the one with no sign it
    // was there.
    const tabs = code(join(COMPONENTS, 'Tabs.tsx'));
    expect(tabs).toMatch(
      /<RadixTabs\.Content value=\{value\} className=\{className\} tabIndex=\{0\}>/,
    );
    expect(tabs).not.toMatch(/focus-visible:outline-none/);
  });
});

describe('every control is big enough to hit', () => {
  it('keeps the product’s smallest control at the touch minimum', () => {
    // WCAG 2.2 AA asks for 24×24; a trading terminal on a phone wants more, and the smallest button
    // the product offers is 32. The floor is asserted here so a future `xs` size cannot be added
    // without a decision being made out loud.
    const button = code(join(COMPONENTS, 'Button.tsx'));
    const sizes = button.slice(
      button.indexOf('const SIZES'),
      button.indexOf('};', button.indexOf('const SIZES')),
    );
    const heights = [...sizes.matchAll(/h-(\d+(?:\.\d+)?)/g)].map((match) => Number(match[1]) * 4);
    expect(heights.length).toBeGreaterThan(2);
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(32);
    // The icon-only size is square, so it is a target in both directions.
    expect(sizes).toMatch(/icon: 'h-9 w-9 px-0'/);
  });

  it('gives the journal’s figure hint a real target without moving the card', () => {
    // A 13px glyph was the only way to read what a figure is measured against. It is a 28px box now,
    // pulled back into place by equal negative margins — the margin box is what the flex line
    // measures, so the header did not grow.
    const hint = code(join(COMPONENTS, 'journal', 'JournalStatCard.tsx'));
    expect(hint).toMatch(/-my-1\.5 -me-1\.5 inline-flex h-7 w-7/);
    expect(hint).toMatch(/aria-label=\{`About \$\{label\}`\}/);
    // Logical margins, not `ml-`/`mr-`: the hint sits at the end of the head in both directions.
    expect(hint).not.toMatch(/[^-]m[lr]-/);
  });
});

describe('a figure stays a figure in every direction', () => {
  it('isolates numeric readouts from the text beside them', () => {
    // A sign is a neutral in the bidi algorithm, so without this a figure next to right-to-left text
    // resolves with its sign on the far side — a different number wearing the same digits. Measured
    // on the built bundle, the app's own figures already resolve left-to-right because it ships no
    // Persian copy; this is the rule that keeps that true when it does.
    const css = readFileSync(join('web', 'src', 'styles', 'global.css'), 'utf8');
    const num = css.slice(css.indexOf('  .num {'), css.indexOf('  .panel-gradient'));
    expect(num).toMatch(/direction: ltr;/);
    expect(num).toMatch(/unicode-bidi: isolate;/);
    expect(num).toMatch(/font-variant-numeric: tabular-nums;/);
  });

  it('keeps a time series left-to-right even in a right-to-left document', () => {
    // Not a locale bug: mirroring a series reverses the axis while leaving the labels upright, which
    // is a chart that lies about the order the data arrived in.
    const frame = code(join(COMPONENTS, 'charts', 'ChartFrame.tsx'));
    expect(frame).toMatch(/direction: 'ltr'/);
  });

  it('drives the document direction from the product’s own control', () => {
    // The toggle is the reason the two rules above matter; if it ever stops setting the root
    // attribute, the RTL contract becomes untestable rather than satisfied.
    const app = code('web/src/App.tsx');
    expect(app).toMatch(/document\.documentElement\.dir = direction/);
    const topbar = code('web/src/app/Topbar.tsx');
    expect(topbar).toMatch(/label="Toggle writing direction"/);
    expect(topbar).toMatch(/aria-pressed=\{direction === 'rtl'\}/);
  });
});
