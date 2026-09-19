import { useMemo } from 'react';
import { cn } from '../../lib/cn';

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
    const step = width / Math.max(values.length - 1, 1);
    return values
      .map((value, index) => {
        const x = step * index;
        const y = height - ((value - min) / span) * height;
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }, [values, width, height]);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn('overflow-visible', className)}
      style={{ direction: 'ltr' }}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      {...rest}
    >
      <path d={path} fill="none" stroke={STROKES[tone]} strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  );
}
