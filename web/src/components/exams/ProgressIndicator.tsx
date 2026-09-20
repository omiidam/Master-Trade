import { cn } from '../../lib/cn';

export type ProgressTone = 'primary' | 'info' | 'warning' | 'danger';

const TONES: Record<ProgressTone, string> = {
  primary: 'bg-primary',
  info: 'bg-info',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

export interface ProgressIndicatorProps {
  value: number;
  max: number;
  /** Accessible name: an exam progress bar must be readable without the visuals. */
  label: string;
  hint?: string;
  tone?: ProgressTone;
  /** Renders the ratio and percentage next to the bar. */
  showValue?: boolean;
  /** Marks the pass threshold on the track (assessment-only affordance). */
  threshold?: number;
  className?: string;
}

/**
 * Assessment progress.
 *
 * A real `role="progressbar"` with min/max/now, so a screen reader announces the
 * same thing the bar shows. `threshold` draws the pass line, which matters here
 * because "60% answered" and "60% scored" are different statements.
 */
export function ProgressIndicator({
  value,
  max,
  label,
  hint,
  tone = 'primary',
  showValue = true,
  threshold,
  className,
}: ProgressIndicatorProps) {
  const safeMax = max <= 0 ? 1 : max;
  const ratio = Math.min(Math.max(value / safeMax, 0), 1);
  const percent = Math.round(ratio * 100);
  const thresholdRatio =
    threshold === undefined ? null : Math.min(Math.max(threshold / safeMax, 0), 1);

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-caption font-medium text-text-muted">{label}</span>
        {showValue ? (
          <span className="num text-caption text-text">
            {value} / {max} · {percent}%
          </span>
        ) : null}
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={Math.min(Math.max(value, 0), safeMax)}
        className="relative h-1.5 w-full overflow-hidden rounded-[var(--radius-pill)] bg-surface-sunken"
      >
        <div
          className={cn('h-full rounded-[var(--radius-pill)]', TONES[tone])}
          style={{ width: `${percent}%` }}
        />
        {thresholdRatio === null ? null : (
          <span
            aria-hidden
            className="absolute inset-y-0 w-px bg-border-strong"
            style={{ insetInlineStart: `${thresholdRatio * 100}%` }}
          />
        )}
      </div>
      {hint ? <p className="text-caption text-text-faint">{hint}</p> : null}
    </div>
  );
}
