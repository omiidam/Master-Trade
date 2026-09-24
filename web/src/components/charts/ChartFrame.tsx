import type { MouseEventHandler, ReactNode } from 'react';
import type { DataProvenance } from '@shared/marketdata/provider';
import { EmptyState } from '../EmptyState';
import { ErrorState } from '../ErrorState';
import { cn } from '../../lib/cn';
import { LoadingState } from '../LoadingState';

/**
 * The parts every chart in the product is made of.
 *
 * There are two charts — `PerformanceChart`, which draws the journal's series, and `ChartAdapter`,
 * which draws the practice candles — and both had independently arrived at the same four things: a
 * recessed well to draw in, a dashed grid, an axis, and a set of three states for when there is
 * nothing to draw. Four copies of four things, in two files, which is how a chart's error state ends
 * up looking like a chart's error state in one place and like a bare paragraph in the other.
 *
 * What is shared here is the *stage*. What stays with each chart is its geometry — the view box, the
 * scales, the marks, the annotation — because those are the chart, and a shared line-drawing routine
 * that could draw both would be a charting engine rather than a frame.
 *
 * ## The bounds rule
 *
 * Every one of these is drawn *inside* the element that owns it, and that is a requirement rather
 * than a nicety:
 *
 *   - the well is the only element with `overflow`, and it clips;
 *   - the plot is an `<svg>` scaled to its container by `viewBox`, so it cannot be wider than the
 *     box it is in — a chart never acquires a minimum width from its own content;
 *   - the height is a style on the plot, never a class on an ancestor, so a chart cannot resize the
 *     layout it was placed in;
 *   - the grid and the axis are shapes inside the view box, so they are clipped by the same
 *     rectangle as the data.
 *
 * A chart that paints outside its box is the Phase 7.2.1 defect in a different costume: the paint
 * does not change the layout, but it does land on the card beside it.
 */

/**
 * The plot well.
 *
 * `tone="sunken"` because a plot is a recess: a chart sits *inside* the card that titles it, and a
 * second raised surface behind the data would make the data read as a third layer. The well is also
 * the clipping boundary, which is why the caller never gets to pass `overflow` of its own.
 *
 * `direction: ltr` is deliberate and is not a locale bug: a financial time series reads left to
 * right in every language, and mirroring one would reverse the axis while leaving the labels
 * upright.
 */
export interface ChartFrameProps {
  /** The view box, e.g. `0 0 1000 320`. The plot scales to its container from this. */
  viewBox: string;
  /** The plot's height in pixels. A style rather than a class so it cannot become a layout size. */
  height: number;
  /** The plot's accessible name. It has no visible title of its own — the card supplies that. */
  label: string;
  /**
   * Pointer tracking, for a chart whose tooltip follows the cursor.
   *
   * The frame owns the `<svg>`, so a chart that needs to know where the pointer is receives it from
   * here rather than growing a plot element of its own. Deliberately `MouseEvent` and not
   * `PointerEvent`: a touch would otherwise open a tooltip the reader cannot dismiss, and the
   * journal's tooltip is designed around a cursor.
   */
  onMouseMove?: MouseEventHandler<SVGSVGElement>;
  onMouseLeave?: MouseEventHandler<SVGSVGElement>;
  className?: string;
  children: ReactNode;
}

export function ChartFrame({
  viewBox,
  height,
  label,
  onMouseMove,
  onMouseLeave,
  className,
  children,
}: ChartFrameProps) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-[var(--radius-inset)] border border-border bg-surface-sunken shadow-control-inset',
        className,
      )}
      style={{ direction: 'ltr' }}
    >
      <svg
        viewBox={viewBox}
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
        style={{ height, width: '100%', display: 'block' }}
        {...(onMouseMove === undefined ? {} : { onMouseMove })}
        {...(onMouseLeave === undefined ? {} : { onMouseLeave })}
      >
        {children}
      </svg>
    </div>
  );
}

/**
 * The grid, and the axis that labels it.
 *
 * One component for both because they are one reading: a line with no value against it is a
 * decoration, and a value with no line against it is a number in a corner. `format` is optional
 * rather than required for the charts that draw a grid without values — the practice candles are
 * read by shape, and labelling every gridline would put four numbers on a chart whose whole point is
 * that no price is claimed.
 */
export interface PlotGridProps {
  /** The values to draw, in view-box units. */
  ticks: readonly number[];
  /** Maps a value to its y. Owned by the chart, because the scale is the chart's. */
  y: (value: number) => number;
  /** The grid's left and right edge in view-box units. */
  x1: number;
  x2: number;
  /** Formats a tick for the axis. Omitted for a grid with no axis labels. */
  format?: (value: number) => string;
  /** Where the axis labels sit. Defaults to just inside `x1`. */
  labelX?: number;
  strokeWidth?: number;
}

export function PlotGrid({ ticks, y, x1, x2, format, labelX, strokeWidth = 0.5 }: PlotGridProps) {
  return (
    <>
      {ticks.map((tick, index) => (
        // Indexed rather than valued: two ticks can legitimately print the same label at this size
        // (a range of 0.01R prints the same two decimals four times), and a React key collision
        // would drop a gridline.
        <g key={`grid-${index}`}>
          <line
            x1={x1}
            x2={x2}
            y1={y(tick)}
            y2={y(tick)}
            stroke="var(--color-border)"
            strokeWidth={strokeWidth}
            strokeDasharray="4 6"
          />
          {format === undefined ? null : (
            <text
              x={labelX ?? x1 - 6}
              y={y(tick) + 3}
              textAnchor="end"
              fill="var(--color-text-faint)"
              fontSize={10}
            >
              {format(tick)}
            </text>
          )}
        </g>
      ))}
    </>
  );
}

/**
 * The zero line.
 *
 * Stronger than the grid because it is not a gridline: it is the division between a gain and a loss,
 * and on a chart of R multiples it is the only line whose position means something on its own.
 */
export function PlotZeroLine({ y, x1, x2 }: { y: number; x1: number; x2: number }) {
  return (
    <line x1={x1} x2={x2} y1={y} y2={y} stroke="var(--color-border-strong)" strokeWidth={0.8} />
  );
}

/**
 * One horizontal reference line.
 *
 * Used for the marks that are *not* data: where the price last closed, where a level was set. They
 * carry a tone and a dash so they cannot be mistaken for a drawn series — the same distinction the
 * journal's charts make between a planned level and a realised value.
 */
export function PlotReferenceLine({
  y,
  x1,
  x2,
  color,
  label,
  labelAnchor = 'end',
  strokeWidth = 0.9,
  dash = '6 5',
  opacity = 0.8,
}: {
  y: number;
  x1: number;
  x2: number;
  color: string;
  label?: string;
  labelAnchor?: 'start' | 'middle' | 'end';
  strokeWidth?: number;
  dash?: string;
  opacity?: number;
}) {
  return (
    <g>
      <line
        x1={x1}
        x2={x2}
        y1={y}
        y2={y}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={dash}
        opacity={opacity}
      />
      {label === undefined ? null : (
        <text
          x={labelAnchor === 'start' ? x1 : x2}
          y={y - 4}
          textAnchor={labelAnchor}
          fill={color}
          fontSize={10}
        >
          {label}
        </text>
      )}
    </g>
  );
}

/**
 * What a chart shows when it has nothing to show, or could not read what it has.
 *
 * One function rather than one per chart, so a journal chart that failed and a practice chart that
 * failed say so the same way, with the same components the rest of the product uses. The three
 * states are the product's own `LoadingState`, `EmptyState` and `ErrorState` — there is no
 * chart-specific state surface, because a chart's empty state is not a different kind of emptiness
 * from a table's.
 */
export type ChartState =
  | { kind: 'loading'; label: string; description?: string }
  | { kind: 'empty'; title: string; description?: string; hint?: string }
  | { kind: 'error'; title: string; description: string; code?: string };

export interface ChartStatePanelProps {
  state: ChartState;
  provenance?: DataProvenance;
  className?: string;
}

export function ChartStatePanel({ state, className }: ChartStatePanelProps) {
  if (state.kind === 'loading') {
    return (
      <LoadingState
        label={state.label}
        {...(state.description === undefined ? {} : { description: state.description })}
        shape="chart"
        className={className}
      />
    );
  }
  if (state.kind === 'error') {
    return (
      <ErrorState
        title={state.title}
        description={state.description}
        code={state.code ?? 'CHART_UNAVAILABLE'}
        className={className}
      />
    );
  }
  return (
    <EmptyState
      title={state.title}
      {...(state.description === undefined ? {} : { description: state.description })}
      {...(state.hint === undefined ? {} : { hint: state.hint })}
      className={className}
    />
  );
}
