import { Tooltip } from '../Tooltip';
import { cn } from '../../lib/cn';

export interface MetricBarProps {
  label: string;
  /** Right-hand readout, e.g. a count. */
  value: string;
  /** Bar fill, 0..1. */
  share: number;
  tone?: 'primary' | 'warning' | 'danger' | 'info' | 'ai';
  hint?: string;
  className?: string;
}

const FILL: Record<NonNullable<MetricBarProps['tone']>, string> = {
  primary: 'bg-primary',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  ai: 'bg-ai',
};

/**
 * A labelled share bar.
 *
 * Used where a count needs its proportion shown without implying a target: the bar
 * is scannable but always paired with the raw count, so a large share of a small
 * number cannot pass as a large number.
 */
export function MetricBar({
  label,
  value,
  share,
  tone = 'primary',
  hint,
  className,
}: MetricBarProps) {
  const clamped = Math.min(Math.max(share, 0), 1);
  return (
    <Tooltip content={hint ?? label}>
      <div className={cn('space-y-1', className)}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-caption text-text-muted">{label}</span>
          <span className="num shrink-0 text-caption text-text">{value}</span>
        </div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-[var(--radius-pill)] bg-surface-sunken"
          role="presentation"
        >
          <span
            className={cn('block h-full rounded-[var(--radius-pill)]', FILL[tone])}
            style={{ width: `${(clamped * 100).toFixed(1)}%` }}
          />
        </div>
      </div>
    </Tooltip>
  );
}
