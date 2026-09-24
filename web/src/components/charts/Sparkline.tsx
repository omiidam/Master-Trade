import { useMemo } from 'react';

export interface SparklineProps {
  values: readonly number[];
  tone?: 'primary' | 'info' | 'ai';
  width?: number;
  height?: number;
  className?: string;
  'aria-hidden'?: boolean;
  label?: string;
}

const STROKES = {
  primary: 'var(--color-primary)',
  info: 'var(--color-info)',
  ai: 'var(--color-ai)',
} as const;

const STROKE = 1.6;

/**
 * Tiny trend line for KPI cards. Pure geometry from the supplied series — no
 * scaling from live data and no axis semantics — so it can never be mistaken for
 * a real market chart (the dashboard chart uses ChartAdapter for that).
 */
export function Sparkline({
  values,
  tone = 'primary',
  width = 120,
  height = 32,
  className,
  label,
  ...rest
}: SparklineProps) {
  const path = useMemo(() => {
    if (values.length === 0) return '';
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    // The plot is inset by half the stroke on every side, so the painted line stays inside the box.
    //
    // The line used to run from y = 0 to y = height, with `overflow-visible` on the element and a
    // 1.6-wide stroke centred on it: half of every stroke, plus the whole of each round cap, was
    // painted *outside* the sparkline's own rectangle. On a raised card that is a hairline of light
    // on the surface behind it, and where the sparkline sits at a card's edge it is a mark on the
    // card's border. Paint that leaves its element is the same defect as a component that widens
    // its parent, one layer down — so the geometry moved inside the box instead of the box being
    // allowed to spill.
    const inset = STROKE / 2;
    const plotWidth = width - STROKE;
    const plotHeight = height - STROKE;
    const step = plotWidth / Math.max(values.length - 1, 1);
    return values
      .map((value, index) => {
        const x = inset + step * index;
        const y = inset + (1 - (value - min) / span) * plotHeight;
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }, [values, width, height]);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      // No `overflow` of its own: the outermost `<svg>` clips to its viewport by default, and with
      // the geometry inset above there is nothing left to clip.
      className={className}
      style={{ direction: 'ltr' }}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      {...rest}
    >
      <path
        d={path}
        fill="none"
        stroke={STROKES[tone]}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
    </svg>
  );
}
