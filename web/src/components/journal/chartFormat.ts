/**
 * What a chart's tick says — one figure per unit, printed as far as a reader reads it.
 *
 * **Why this is a module of its own.** It is pure, it has no React in it, and it is where the plot's
 * numbers become the strings a person reads, which is the one part of a chart a test can check in node
 * rather than through a browser. The journal keeps its other pure logic the same way (`tradeFormModel`),
 * so a suite imports the rule instead of reading the component's source for it.
 *
 * **The defect it repairs, and why nothing had caught it.** Every branch but one printed a figure to two
 * decimals. The `trades` branch interpolated the tick straight into the label — and a tick is arithmetic,
 * so the distribution chart's axis read `2.2600000000000002 trades` and `5.739999999999999 trades`. The
 * string in the DOM was whole, nothing overflowed, and no check in the repository reads what a label
 * *says*; a reader who sees fourteen digits after the point stops trusting the chart they are looking at.
 *
 * **The rule, now in one place: a figure is a whole number or two decimals.** `.num` states the same
 * thing for the interface generally, and `formatFigure` below is the single expression of it, so the next
 * unit cannot reintroduce a branch that prints a float in full.
 */

/** A plain figure: a whole number as itself, anything else to two decimals. */
function figure(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(2);
}

/**
 * A tick's text for a series unit.
 *
 * Units are the product's own vocabulary (`R` for R-multiples, `%`, `currency`, `trades`), and an
 * unrecognised one is a plain figure rather than a guess.
 *
 * The two branches that name a quantity are the only ones that spell it, and they only spell it as a
 * word: the value itself is always `figure`, at most two decimals, whatever produced it.
 */
export function formatChartValue(value: number, unit?: string): string {
  switch (unit) {
    case 'R':
      // The product's sign convention: a positive figure is marked, a negative one takes U+2212 rather
      // than the hyphen-minus an ASCII `-` would draw.
      return `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(2)}R`;
    case '%':
      return `${value.toFixed(1)}%`;
    case 'currency':
      return `$${Math.round(value).toLocaleString('en-US')}`;
    case 'trades':
      return `${figure(value)} ${Math.abs(value) === 1 ? 'trade' : 'trades'}`;
    default:
      return figure(value);
  }
}
