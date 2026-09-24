import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from 'lucide-react';
import { cn } from '../lib/cn';
import { TREND_INK, TREND_WORD, trendDirection, type TrendDirection } from '../design/trend';

/**
 * The polarity of a figure, as a mark rather than as a colour.
 *
 * The rules — which direction a number is, what it is called and what ink it is written in — live in
 * `design/trend.ts`, because the tables, the calendar and the decisions engine all classify a figure
 * the same way and none of them should draw it. This file draws them, and a direction carries three
 * cues, any one of which stands on its own:
 *
 *   1. **a mark** — an arrow up, an arrow down, a dash for flat — drawn *before* the figure;
 *   2. **a word** — `up`, `down`, `flat` — in the accessibility tree, never drawn, so the cue exists
 *      for a screen reader as well as for an eye;
 *   3. **an ink** — the semantic state from `design/tokens.ts`, last rather than first.
 *
 * The magnitude is printed by the caller's own formatter, and this deliberately does **not** add a
 * sign: a currency formatter already prints `−$420`, and a second minus is a bug no type can catch.
 * What lives here is the *reading* of a number, which is why `flatWithin` is a parameter — for an R
 * multiple ±0.15R is a flat trade, and for money flat is exactly zero.
 *
 * The three tables below are the whole vocabulary, and `EvaluationPanels` reads its ink out of
 * `TREND_INK` rather than keeping a second copy of which colour a gain is.
 */

export type { TrendDirection };

/**
 * `unavailable` has no mark at all rather than a neutral one: a mark is a direction, and a figure
 * that was never produced has none. Drawing a dash for it would state a flat result.
 */
const TREND_GLYPH: Record<TrendDirection, LucideIcon | null> = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  flat: Minus,
  unavailable: null,
};

/** How big the mark is. Three steps, because a figure is a table cell, a line or a headline. */
export type TrendSize = 'caption' | 'body' | 'metric';

const SIZE: Record<TrendSize, { text: string; glyph: number }> = {
  caption: { text: 'text-caption', glyph: 11 },
  body: { text: 'text-body', glyph: 13 },
  metric: { text: 'num text-metric font-medium', glyph: 14 },
};

export { TREND_INK, TREND_WORD, trendDirection };

/**
 * The mark on its own: the glyph, and the word a screen reader reads in its place.
 *
 * For the surfaces whose figure arrives formatted, where there is no number to hand `Trend` but the
 * direction is still known.
 */
export function TrendMark({
  direction,
  size = 'caption',
  className,
}: {
  direction: TrendDirection;
  size?: TrendSize;
  className?: string;
}) {
  const Glyph = TREND_GLYPH[direction];
  const scale = SIZE[size];
  if (Glyph === null) return null;
  return (
    <span
      className={cn('inline-flex shrink-0 items-center', TREND_INK[direction], className)}
      // `self-center` rather than a baseline: an arrow has no baseline, so aligning it by one puts
      // it wherever the font's descender happens to fall.
    >
      <Glyph size={scale.glyph} aria-hidden />
      <span className="sr-only">{TREND_WORD[direction]}</span>
    </span>
  );
}

export interface TrendProps {
  /** The number. `null` is an absence, and is rendered as one. */
  value: number | null | undefined;
  /**
   * Renders the number. Receives the signed value, so a caller's own formatter — currency, R
   * multiple, percent — owns the digits and the sign.
   */
  format?: (value: number) => string;
  /** What to say when there is no value. A sentence, never a bare dash. */
  unavailable?: string;
  /** Magnitude at or below which the figure reads as flat. Defaults to zero. */
  flatWithin?: number;
  size?: TrendSize;
  /**
   * Whether the arrow is *drawn*. The word is announced either way — the direction is a fact about
   * the figure and not a decoration, so turning the mark off removes the glyph and not the meaning.
   */
  mark?: boolean;
  /** A sentence for the mark, for the surfaces that have no tooltip of their own. */
  title?: string;
  className?: string;
}

export function Trend({
  value,
  format,
  unavailable = 'no figure',
  flatWithin = 0,
  size = 'caption',
  mark = true,
  title,
  className,
}: TrendProps) {
  const direction = trendDirection(value, flatWithin);
  return (
    <span
      className={cn(
        'inline-flex items-baseline gap-1',
        SIZE[size].text,
        TREND_INK[direction],
        className,
      )}
      {...(title === undefined ? {} : { title })}
    >
      {mark ? (
        <TrendMark direction={direction} size={size} className="self-center" />
      ) : (
        <span className="sr-only">{TREND_WORD[direction]}</span>
      )}
      <span className="num">
        {direction === 'unavailable' ? unavailable : (format?.(value as number) ?? String(value))}
      </span>
    </span>
  );
}
