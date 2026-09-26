/**
 * Section 7.3 — tables, charts and indicators, as one contract.
 *
 * The product presents structured information in three shapes: a table of records, a chart of a
 * series, and a mark saying which way a figure went. Each had grown its own way of doing it, and
 * the three ways disagreed:
 *
 *   - **Six tables, four cell paddings, three header treatments and two rules under the head.** The
 *     same right-aligned figure was written `text-end` here, `tabular-nums` there and `num`
 *     somewhere else, so a column of prices was straight on one screen and ragged on the next.
 *   - **Two charts, two plot wells, two grids and two answers to "is it loading?".** The journal's
 *     chart had all three states; the market chart drew an empty grid for no data, which reads as a
 *     market that did not move rather than as data that did not arrive.
 *   - **One direction, decided in five places.** A sign was classified by a threshold in one
 *     component, a three-way ternary in the next and a string helper in a third — and in all of
 *     them the *colour was the only cue*, so `+0.69R` and `−0.69R` were one string in two inks.
 *
 * The rules below are what keep those three from drifting apart again. They are read from the
 * source, so the suite is offline and needs no browser.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TREND_INK, TREND_WORD, trendDirection } from '../web/src/design/trend.js';
import {
  PLOT_LABEL_GAP,
  PLOT_LABEL_INSET,
  axisLabels,
  labelWidth,
} from '../web/src/components/charts/axisLabels.js';
import { formatChartValue } from '../web/src/components/journal/chartFormat.js';

const COMPONENTS = join('web', 'src', 'components');

/**
 * A source file with its comments removed, so prose about a rule is not a declaration of one.
 *
 * Both kinds of comment, and the line comments matter here: several of the rules below are about a
 * string that was *removed* — `overflow-visible`, Tailwind's `tabular-nums` — and the comment
 * explaining why it went names it, so a block-comment-only strip would fail every one of them.
 * `(^|[^:])` keeps a URL's `//` intact, which block comments elsewhere in the tree contain.
 */
function strip(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

function code(path: string): string {
  return strip(read(path));
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

const TABLE = code(join(COMPONENTS, 'Table.tsx'));
const TREND = code(join(COMPONENTS, 'Trend.tsx'));
const TREND_RULES = code(join('web', 'src', 'design', 'trend.ts'));
const FRAME = code(join(COMPONENTS, 'charts', 'ChartFrame.tsx'));
const SPARKLINE = code(join(COMPONENTS, 'charts', 'Sparkline.tsx'));

describe('Task 1 — one table, and no second way to write one', () => {
  it('keeps every table element inside the one component that owns them', () => {
    // The rule that makes this a *system* rather than a convention: a table can only be built out of
    // the shared parts if nothing else is allowed to emit the raw elements. This is the check that
    // would fail the moment a seventh table is hand-rolled.
    const offenders: string[] = [];
    for (const file of uiSources()) {
      if (file === 'web/src/components/Table.tsx') continue;
      const source = code(file);
      for (const tag of ['<table', '<thead', '<tbody', '<tr ', '<tr>', '<td ', '<td>', '<th ']) {
        if (source.includes(tag)) offenders.push(`${file} renders ${tag.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('gives every table an accessible name, as a caption', () => {
    // A table needs a name, and a caption is reachable as text where an `aria-label` is not.
    expect(TABLE).toMatch(/label: string/);
    expect(TABLE).toMatch(/<caption className="sr-only">\{label\}<\/caption>/);

    const missing: string[] = [];
    for (const file of uiSources()) {
      const source = code(file);
      for (const match of source.matchAll(/<Table\b[\s\S]{0,400}?>/g)) {
        if (!match[0].includes('label=')) missing.push(file);
      }
    }
    expect(missing).toEqual([]);
  });

  it('aligns a number by the same token that monospaces it', () => {
    // `numeric` is one decision, not two: a figure that is monospaced but left-aligned is the
    // half-finished state this replaces, and two utilities for one job is how it happened.
    expect(TABLE).toMatch(/numeric \? 'end' : 'start'/);
    expect(TABLE).toMatch(/numeric && 'num'/);
    // Tailwind's own `tabular-nums` sets the figure variant and leaves the font, so a column of
    // prices came out in two different faces depending on which one the author reached for.
    const offenders = uiSources().filter((file) => code(file).includes('tabular-nums'));
    expect(offenders).toEqual([]);
  });

  it('names the sort state on the header, for the reader who cannot see the arrow', () => {
    expect(TABLE).toMatch(/'aria-sort'/);
    expect(TABLE).toMatch(/sorted === 'asc' \? 'ascending'/);
    expect(TABLE).toMatch(/sorted === 'desc' \? 'descending'/);
    // A sortable column that is not the active one is `none` rather than absent, so the header is
    // announced as sortable at all.
    expect(TABLE).toMatch(/aria-sort[^;]*: 'none'/);
    // The arrow keeps its space when it is not drawn, so toggling the sort cannot resize a column.
    expect(TABLE).toMatch(/sorted === null && 'opacity-0'/);
  });

  it('states the head as a rule rather than as a second surface', () => {
    // A table sits on a card that already has a fill; a shaded head would be a panel inside a panel.
    expect(TABLE).toMatch(/border-b border-border-strong/);
    expect(TABLE).not.toMatch(/bg-surface-sunken.*px-3[\s\S]*HEAD/);
    // And the head is stronger than the rows, which is the whole hierarchy: `border` under a row,
    // `border-strong` under the head.
    expect(TABLE).toMatch(/const HEAD_VARIANT/);
    expect(TABLE).toMatch(/uppercase/);
  });

  it('offers two densities, both ascending', () => {
    const scale = TABLE.slice(
      TABLE.indexOf('const DENSITY'),
      TABLE.indexOf('const TableDensityContext'),
    );
    const compact = scale.match(/compact: \{ head: '([^']+)', cell: '([^']+)' \}/);
    const spacious = scale.match(/spacious: \{ head: '([^']+)', cell: '([^']+)' \}/);
    expect(compact, 'compact density is not declared').not.toBeNull();
    expect(spacious, 'spacious density is not declared').not.toBeNull();
    const steps = (value: string): number[] =>
      [...value.matchAll(/-?(\d+(?:\.\d+)?)/g)].map((match) => Number(match[1]));
    const padding = (value: string): number =>
      steps(value).reduce((total, step) => total + step, 0);
    expect(padding(compact![1]!)).toBeGreaterThan(0);
    expect(padding(compact![1]!)).toBeLessThan(padding(spacious![1]!));
    expect(padding(compact![2]!)).toBeLessThan(padding(spacious![2]!));
  });

  it('renders a table that has no rows as a row, using the product’s one empty state', () => {
    // Keeping the head means a reader can still see what would have been there, which a
    // replaced-by-a-panel table loses. And the panel is `EmptyState`, not a second one.
    expect(TABLE).toMatch(/export function TableEmptyRow/);
    expect(TABLE).toMatch(/<td colSpan=\{colSpan\}/);
    expect(TABLE).toMatch(/<EmptyState/);
  });

  it('keeps a table’s minimum width on the table, not on the page', () => {
    // The scroll container is the table's own wrapper, so a dense table scrolls sideways inside its
    // own box rather than widening the document.
    expect(TABLE).toMatch(/<div className="relative overflow-x-auto">/);
    expect(TABLE).toMatch(/minWidth: `\$\{minWidth\}px`/);
  });
});

describe('The page never gains a sideways scroll', () => {
  it('positions every scroll container, so `sr-only` cannot escape its clip', () => {
    // The defect this replaces, found by panning the built page rather than by reading it: the
    // journal's trade history panned 329px sideways into empty space, while *nothing* on the page
    // measured outside the viewport. `sr-only` is `position: absolute`, so a reader-only span at the
    // far right of a 1080px row took the `Card` behind the table — positioned for its own shine — as
    // its containing block, escaped the scroller's clip and widened the document. A scroll container
    // that is positioned contains those descendants, and its own clip applies again.
    //
    // This is asserted per line rather than per file because every one of these class lists is a
    // single line, and a file-level check would pass while one of four scrollers was unpositioned.
    const unpositioned: string[] = [];
    let scrollers = 0;
    for (const file of uiSources()) {
      for (const [index, line] of code(file).split('\n').entries()) {
        if (!/overflow-(x-)?(auto|scroll)/.test(line)) continue;
        scrollers += 1;
        if (!/\brelative\b/.test(line)) unpositioned.push(`${file}:${index + 1}`);
      }
    }
    expect(scrollers, 'no scroll container found — the rule would pass vacuously').toBeGreaterThan(
      2,
    );
    expect(unpositioned).toEqual([]);
  });

  it('lets a card be narrower than its own content asks for', () => {
    // The other half of that defect, and the one a table alone cannot explain: a card is routinely a
    // grid or flex item, and an item's automatic minimum size is its *min-content* width. A card
    // holding a table in a scroll container reported the table's minimum as its own, so a card in a
    // `grid-cols-2` track pushed the grid wider than the viewport — 110px of page scroll from a
    // table that was scrolling correctly inside its own box the whole time.
    const card = code(join(COMPONENTS, 'Card.tsx'));
    expect(card).toMatch(/'relative min-w-0 rounded-\[var\(--radius-panel\)\] border'/);
  });

  it('lets the actions wrap and shrink, without squeezing a control', () => {
    // The third form the same defect took: wrapping the header row was necessary and not sufficient,
    // because a group of badges is wider than a 390px card on its own line. The group shrinks and
    // wraps now; a control inside it still cannot be squeezed past its label, because a flex item's
    // automatic minimum size is its min-content width.
    const card = code(join(COMPONENTS, 'Card.tsx'));
    expect(card).toMatch(/className="flex min-w-0 flex-wrap items-center gap-1\.5"/);
    expect(card).not.toMatch(/className="flex shrink-0 items-center gap-1\.5"/);
  });

  it('does not hide an overflow it should have prevented', () => {
    // The cheap wrong answer: `overflow-hidden` on the card would also stop the page growing, and
    // would also silently amputate a table, a tooltip or a chart that legitimately needed the box.
    const card = code(join(COMPONENTS, 'Card.tsx'));
    expect(card).not.toMatch(/overflow-hidden/);
    const table = code(join(COMPONENTS, 'Table.tsx'));
    expect(table).toMatch(/relative overflow-x-auto/);
    expect(table).not.toMatch(/overflow-x-hidden/);
  });
});

describe('Task 2 — one plot, one grid, one set of states', () => {
  it('draws every chart in the shared frame', () => {
    expect(FRAME).toMatch(/export function ChartFrame/);
    for (const file of [
      'web/src/components/journal/PerformanceChart.tsx',
      'web/src/components/charts/ChartAdapter.tsx',
    ]) {
      expect(code(file), `${file} does not use the shared frame`).toMatch(/<ChartFrame/);
    }
  });

  it('clips the plot to the frame, and never lets a chart set its own overflow', () => {
    // A chart that paints outside its box is the Phase 7.2.1 defect in another costume: the paint
    // does not change the layout, it lands on the card beside it.
    expect(FRAME).toMatch(/overflow-hidden/);
    for (const file of uiSources().filter(
      (path) => path.includes('/charts/') || path.includes('Chart'),
    )) {
      expect(code(file), `${file} sets its own overflow`).not.toMatch(
        /overflow-visible|overflow-x-visible|overflow-y-visible/,
      );
    }
  });

  it('keeps the plot’s height a style, so it cannot become a layout size', () => {
    expect(FRAME).toMatch(/style=\{\{ height, width: '100%', display: 'block' \}\}/);
    expect(FRAME).toMatch(/viewBox=\{viewBox\}/);
    expect(FRAME).toMatch(/preserveAspectRatio="none"/);
  });

  it('keeps a time series left-to-right', () => {
    // Not a locale bug: mirroring a series reverses the axis while leaving the labels upright.
    expect(FRAME).toMatch(/direction: 'ltr'/);
  });

  it('draws the grid and the axis as one thing', () => {
    expect(FRAME).toMatch(/export function PlotGrid/);
    // One component for both, because a line with no value against it is a decoration and a value
    // with no line is a number in a corner. Labelling stays optional for the charts read by shape.
    //
    // The labels arrive as strings rather than as a `format(value)` callback, and that is the point
    // rather than a preference: the chart has to know how wide its labels are *before* it can choose the
    // inset they hang in, so a grid that formatted its own would be formatting a second, unmeasured set
    // of strings and could print one the band was never sized for. The two cases below measure it.
    expect(FRAME).toMatch(/labels\?: readonly string\[\]/);
    expect(FRAME).not.toMatch(/format\?:/);
    expect(FRAME).toMatch(/x=\{labelX \?\? x1 - PLOT_LABEL_GAP\}/);
    // A tick label is a figure, so it carries the product's class for one — which is also what makes the
    // band a bound rather than an estimate, because a monospaced face advances by one amount per
    // character.
    expect(FRAME).toMatch(/className="num"/);
    expect(FRAME).toMatch(/strokeDasharray="4 6"/);
    // Keys are indexed rather than valued: two ticks can print the same label at this size, and a
    // React key collision would silently drop a gridline.
    expect(FRAME).toMatch(/key=\{`grid-\$\{index\}`\}/);
  });

  it('sizes the value axis from the labels it will draw, rather than from a constant', () => {
    // The defect this is about: the journal's chart used one `PAD = 26` for all four of its insets and
    // anchored each tick label six units inside the grid's left edge, so a 32–38-unit label began eight
    // to seventeen units *before* `x = 0` — and an `<svg>` clips to its view box by the same rule that
    // makes it a viewport. The equity curve's axis therefore read `1.50R`, `.36R`, `.22R`, `.07R`,
    // `.07R`: five values, every one of them missing its sign and leading digit, painted that way
    // silently. No source rule can see a glyph's advance and `CLIPPING_PROBE` measures HTML overflow,
    // which SVG text has no pair for — so the band is derived from the labels, and this is the check.
    const labels = ['+10.50R', '+3.50R', '−3.50R', '0.00R'];
    const { inset, anchor } = axisLabels(labels, 26);
    const widest = Math.max(...labels.map((label) => labelWidth(label)));
    // A label's *end* is anchored, so its start is `anchor - widest` — and that has to be inside the
    // frame's own inset for every glyph to be painted inside the view box.
    expect(anchor - widest).toBeGreaterThanOrEqual(PLOT_LABEL_INSET);
    expect(anchor).toBe(inset - PLOT_LABEL_GAP);
    // The clamp can only widen the band: a chart whose labels are short keeps the padding it had.
    expect(axisLabels(['1R', '2R'], 26).inset).toBe(26);
    // And a longer label widens it, because the width is derived rather than assumed.
    expect(axisLabels(['+123.45R'], 26).inset).toBeGreaterThan(inset);
    // A chart read by shape has no axis at all, and hangs no label off one.
    expect(axisLabels([], 26).inset).toBe(26);
  });

  it('prints a figure as far as a reader reads it, in every unit', () => {
    // `.num` states the product's rule for a figure — a whole number or two decimals — and every branch
    // of the tick formatter but one followed it. The `trades` branch interpolated the tick itself, and a
    // tick is arithmetic: the distribution chart's axis read `2.2600000000000002 trades` and
    // `5.739999999999999 trades`. Nothing caught it, because the string in the DOM was whole and no
    // check in the repository reads what a label *says*.
    const noise = [2.2600000000000002, 5.739999999999999, 0.5200000000000001, -0.30000000000000004];
    for (const value of noise) {
      for (const unit of ['trades', 'R', '%', 'currency', 'price', undefined]) {
        const label = formatChartValue(value, unit);
        expect(label, `${label} prints more of ${value} than a reader can use`).not.toMatch(
          /\.\d{3,}|[eE][+-]?\d/,
        );
      }
    }
    // The units that carry a word still carry it, and a whole number stays whole.
    expect(formatChartValue(4, 'trades')).toBe('4 trades');
    expect(formatChartValue(1, 'trades')).toBe('1 trade');
    expect(formatChartValue(2.5, 'trades')).toBe('2.50 trades');
    expect(formatChartValue(-0.30000000000000004, 'trades')).toBe('-0.30 trades');
    // Including the signs: a gain is marked and a loss takes U+2212 rather than a hyphen-minus.
    expect(formatChartValue(1.5, 'R')).toBe('+1.50R');
    expect(formatChartValue(-1.5, 'R')).toBe('−1.50R');
    expect(formatChartValue(0, 'R')).toBe('0.00R');
    expect(formatChartValue(2.26)).toBe('2.26');
  });

  it('has exactly one answer to what a chart shows when it has nothing to show', () => {
    expect(FRAME).toMatch(/export function ChartStatePanel/);
    expect(FRAME).toMatch(/<LoadingState/);
    expect(FRAME).toMatch(/<ErrorState/);
    expect(FRAME).toMatch(/<EmptyState/);
    // Both charts route their states through it rather than rendering a state component directly.
    for (const file of [
      'web/src/components/journal/PerformanceChart.tsx',
      'web/src/components/charts/ChartAdapter.tsx',
    ]) {
      expect(code(file), `${file} renders a state of its own`).toMatch(/<ChartStatePanel/);
    }
    // The market chart draws no grid for data that did not arrive.
    const adapter = code('web/src/components/charts/ChartAdapter.tsx');
    expect(adapter).toMatch(/bars\.length === 0/);
    expect(adapter).toMatch(/kind: 'empty'/);
  });

  it('insets the sparkline’s geometry instead of letting it paint outside', () => {
    // The line ran from y = 0 to y = height with `overflow-visible` and a 1.6-wide stroke centred on
    // it, so half of every stroke and the whole of each cap was painted outside the element — a
    // hairline of light on the surface behind it.
    expect(SPARKLINE).toMatch(/const inset = STROKE \/ 2/);
    expect(SPARKLINE).toMatch(/const plotWidth = width - STROKE/);
    expect(SPARKLINE).toMatch(/const plotHeight = height - STROKE/);
    expect(SPARKLINE).not.toMatch(/overflow-visible/);
  });
});

describe('Task 3 — a direction with three cues, and only one home', () => {
  it('names the three directions and the absence of one', () => {
    expect(Object.keys(TREND_INK).sort()).toEqual(['down', 'flat', 'unavailable', 'up']);
    expect(Object.keys(TREND_WORD).sort()).toEqual(['down', 'flat', 'unavailable', 'up']);
    expect(TREND_WORD.unavailable).toBe('not available');
  });

  it('keeps the vocabulary in a module that draws nothing', () => {
    // The tables, the calendar and the decisions engine all read these three tables without
    // rendering a `Trend`, so they live in a module with no JSX and the component exports them
    // rather than declaring them. A `Trend.tsx` that owns them would drag a React component into
    // every reader that only wanted to know what colour a gain is.
    expect(TREND_RULES).toMatch(/export const TREND_WORD/);
    expect(TREND_RULES).toMatch(/export const TREND_INK/);
    expect(TREND_RULES).toMatch(/export function trendDirection/);
    expect(TREND_RULES).not.toMatch(/\.tsx|=> \(\s*</);
    expect(TREND).not.toMatch(/export const TREND_INK/);
    expect(TREND).not.toMatch(/export const TREND_WORD/);
    expect(TREND).toMatch(/from '\.\.\/design\/trend'/);
  });

  it('never encodes a direction in colour alone', () => {
    // The defect this replaces: `+0.69R` and `−0.69R` are the same string in two inks. Every
    // direction now also carries a mark and a word.
    expect(TREND).toMatch(/<span className="sr-only">\{TREND_WORD\[direction\]\}<\/span>/);
    expect(TREND).toMatch(/<Glyph size=\{scale\.glyph\} aria-hidden \/>/);
    // Turning the mark off removes the glyph and not the meaning.
    expect(TREND).toMatch(/<span className="sr-only">\{TREND_WORD\[direction\]\}<\/span>\s*\)\}/);
  });

  it('leaves `unavailable` without a mark, because it has no direction', () => {
    expect(TREND).toMatch(/unavailable: null/);
  });

  it('reads a figure as flat inside a window rather than at exactly zero', () => {
    // For an R multiple ±0.15R is a flat trade; for money flat is exactly zero. The window is a
    // property of the figure, which is why it is a parameter.
    expect(trendDirection(0.4)).toBe('up');
    expect(trendDirection(-0.4)).toBe('down');
    expect(trendDirection(0.1, 0.15)).toBe('flat');
    expect(trendDirection(-0.1, 0.15)).toBe('flat');
    expect(trendDirection(0)).toBe('flat');
    expect(trendDirection(null)).toBe('unavailable');
    expect(trendDirection(undefined)).toBe('unavailable');
  });

  it('keeps the direction table in one home', () => {
    // A second copy of "a gain is success" is how the journal's figures and the decision engine's
    // figures end up different colours for the same fact. The decisions module reads its ink from
    // here rather than declaring one.
    const decisions = code(join(COMPONENTS, 'decisions', 'labels.ts'));
    expect(decisions).toMatch(/TREND_INK\.up/);
    expect(decisions).toMatch(/TREND_INK\.down/);
    expect(decisions).not.toMatch(/text-success/);

    const calendar = code(join(COMPONENTS, 'journal', 'JournalCalendar.tsx'));
    expect(calendar).toMatch(/TREND_INK\[trendDirection\(/);

    const indicator = code(join(COMPONENTS, 'journal', 'RMultipleIndicator.tsx'));
    expect(indicator).toMatch(/<Trend/);
    expect(indicator).toMatch(/flatWithin=\{0\.15\}/);
    // The threshold and the tone tables it used to own are gone.
    expect(indicator).not.toMatch(/value > 0\.15 \? 'text-success'/);
    expect(indicator).not.toMatch(/const tone =/);
  });

  it('renders a missing figure as an absence rather than as a zero', () => {
    // Zero is a measured flat result; a figure that was never produced is a different fact, and the
    // two must not be confusable.
    const indicator = code(join(COMPONENTS, 'journal', 'RMultipleIndicator.tsx'));
    expect(indicator).toMatch(/unavailable=\{msg\('journal\.notScored'\)\}/);
    expect(TREND).toMatch(/unavailable = 'no figure'/);
    expect(TREND).toMatch(/direction === 'unavailable' \? unavailable/);
  });

  it('does not add a second sign to a figure that prints its own', () => {
    // A currency formatter already prints `−$420`; the renderer cannot tell, so it never prepends
    // one — the sign belongs to whoever formats the number.
    expect(TREND).not.toMatch(/direction === 'up' \? '\+'/);
    expect(TREND).toMatch(/format\?\.\(value as number\)/);
  });
});
