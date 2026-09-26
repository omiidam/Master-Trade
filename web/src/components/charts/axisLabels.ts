/**
 * How much room the value axis needs — and why that is not a constant.
 *
 * A chart's left inset is not the same as its other three. The other three are *padding*: a fixed
 * fraction of the frame, there to keep the series off the edge, and they are the same on every chart.
 * The left one holds the tick labels, so its width is decided by the text printed in it — and that is
 * the difference this module exists to state.
 *
 * **The defect it repairs, because it was invisible to every check in the repository.** The journal's
 * chart used one constant, `PAD = 26`, for all four insets and drew each tick label with
 * `text-anchor: end` six units inside the grid's left edge. A label therefore extended *leftwards*
 * from `x = 20`, and every character past `x = 0` was painted outside the view box — which an `<svg>`
 * clips to, silently, by the same rule that makes it a viewport. Measured on the built bundle, the
 * equity curve's own labels are 32–38 units wide, so each of them began between eight and seventeen
 * units outside the frame: the axis read `1.50R`, `.36R`, `.22R`, `.07R`, `.07R` — five values, none
 * of them complete, with the leading sign and digit gone. The `+10.50R` tick is the clearest of them,
 * because it lost three characters.
 *
 * Nothing caught it. A source-level rule can see a class name and not a glyph's advance; the browser
 * suite's clipping probe measures HTML overflow (`scrollWidth > clientWidth`) and SVG text has no such
 * pair; and the label's own DOM was correct — the string in it was never truncated. It is *painted*
 * overflow, in a coordinate system nobody was measuring.
 *
 * **The rule.** The band is derived from the labels rather than guessed for them, which is the part
 * that keeps the next unit from reopening this. A tick label is a *figure*, and the product's rule for
 * a figure is `.num`, so the text the axis draws is monospaced — and in a monospace face one character
 * advances by the same amount whatever it is. That is what makes `length × advance` a **bound** rather
 * than an estimate: the value below is the widest advance any monospace face uses, and it holds for a
 * unit nobody has written yet, in either interface language, on a machine with any of the fallback
 * faces. The alternative was to measure the rendered text with `getBBox()` after mount — exact too, and
 * rejected for a reason worth recording: it costs a ref, a layout effect and a second render pass in a
 * component that is otherwise pure, and it would make the rule untestable outside a browser.
 *
 * What holds the bound honest is not this comment but a measurement: the browser suite reads every
 * axis label on every page that has a chart, in both languages, and fails if one is drawn outside the
 * frame it was drawn in.
 */

/**
 * The size the tick labels are drawn at, in view-box units.
 *
 * Here rather than in `PlotGrid`, because the band and the text have to agree about it: a band sized
 * for one font size and text drawn at another is the same defect moved somewhere new.
 */
export const PLOT_LABEL_SIZE = 10;

/**
 * An upper bound on one character's advance in a monospace face, as a fraction of the font size.
 *
 * The faces `--font-mono` can resolve to, and what each one advances by: JetBrains Mono, SF Mono,
 * Cascadia Mono, Fira Mono, Roboto Mono and the `monospace` generic all 0.600em; Menlo, Monaco and
 * DejaVu Sans Mono 0.602em; Consolas 0.550em. 0.63 is the widest of those rounded up, with enough room
 * left over that the `-0.01em` letter-spacing `.num` also sets can be ignored rather than netted off.
 */
const MONOSPACE_ADVANCE = 0.63;

/** Space between a label's right edge and the grid's left edge. */
export const PLOT_LABEL_GAP = 6;

/** Space between a label's left edge and the frame's edge, so the text does not touch the border. */
export const PLOT_LABEL_INSET = 4;

/**
 * How wide one label is drawn, in view-box units.
 *
 * The bound rather than a measurement, for the reason above: in a monospace face a character advances by
 * the same amount whatever it is, so the width of a label is its length and one number. Exported because
 * the rule it feeds is checked in node — a suite asserts that the widest label of a real axis lands
 * inside the frame — and a rule that cannot be imported cannot be tested without a browser.
 */
export function labelWidth(label: string): number {
  return label.length * MONOSPACE_ADVANCE * PLOT_LABEL_SIZE;
}

export interface AxisLabels {
  /** The plot's left inset: wide enough to hold the widest label and the gaps on either side of it. */
  readonly inset: number;
  /** Where a label's right edge is anchored, so the text lands inside the frame instead of past it. */
  readonly anchor: number;
}

/**
 * The plot's left inset and the anchor its labels hang from.
 *
 * `minimumInset` is the chart's own padding on the other three sides, so a chart whose labels are short
 * keeps the frame it had rather than a band narrower than its own margins — and so the clamp can only
 * ever *widen* the band, which is why the labels cannot be pushed back out by it.
 *
 * An empty list is a chart with no axis at all: the band collapses to the minimum and no anchor is
 * used.
 */
export function axisLabels(labels: readonly string[], minimumInset: number): AxisLabels {
  const widest = labels.reduce((longest, label) => Math.max(longest, labelWidth(label)), 0);
  const inset = Math.max(minimumInset, PLOT_LABEL_INSET + PLOT_LABEL_GAP + widest);
  return { inset, anchor: inset - PLOT_LABEL_GAP };
}
