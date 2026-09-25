import { msg } from '../i18n/index.js'; /**
 * The polarity of a figure, as a vocabulary rather than as a colour.
 *
 * Direction was the most-copied decision in the product and the least consistent one. `text-success`
 * against `text-danger` was re-derived at each call site — a `> 0.15` test in one component, a
 * three-way ternary in the next, a helper in a third — and in every one of them **the colour was the
 * only cue**. That is a defect rather than a preference: `+0.69R` and `−0.69R` are the *same string*
 * to a reader who cannot separate the two inks, and a reader scanning a table at speed reads the
 * colour before the digits. Two figures that differ only in hue cannot be told apart.
 *
 * The rules live here, in a module with no JSX, because they are read by more than the one component
 * that draws them: the tables, the journal's calendar and the decisions engine all classify a figure
 * the same way, and a second copy of "a gain is success" is how two screens end up disagreeing about
 * one number. `Trend.tsx` draws them; nothing else re-derives them.
 */

export type TrendDirection = 'up' | 'down' | 'flat' | 'unavailable';

/** The word each direction is announced with. A cue that survives a monochrome screen. */
export const TREND_WORD: Record<TrendDirection, string> = {
  up: 'up',
  down: 'down',
  flat: 'flat',
  get unavailable(): string {
    return msg('trend.notAvailable');
  },
};

/**
 * The ink each direction is written in.
 *
 * Exported because the product has figures that arrive *already formatted* — the decisions engine
 * returns `+1.24%` as contract text — and those surfaces still have to colour them like every other
 * figure. Reading the colour from here is what stops a gain being `success` on one screen and
 * `primary` on the next. The ink is the *last* of the three cues, not the first.
 */
export const TREND_INK: Record<TrendDirection, string> = {
  up: 'text-success',
  down: 'text-danger',
  flat: 'text-text-muted',
  unavailable: 'text-text-faint',
};

/**
 * Which direction a figure states.
 *
 * `flatWithin` is a parameter rather than a constant because the window belongs to the *figure*: for
 * an R multiple ±0.15R is a flat trade, and for money flat is exactly zero. An absent value is its
 * own direction — `unavailable` — and never a zero, because a figure that was never produced is a
 * different fact from a measured flat result.
 */
export function trendDirection(value: number | null | undefined, flatWithin = 0): TrendDirection {
  if (value === null || value === undefined) return 'unavailable';
  if (value > flatWithin) return 'up';
  if (value < -flatWithin) return 'down';
  return 'flat';
}
