import { cn } from '../../lib/cn';
import { Tooltip } from '../Tooltip';

export interface RMultipleIndicatorProps {
  /** Realised multiple of the risked amount. `null` means "not scored". */
  value: number | null;
  /** Planned multiple, shown alongside when the surface compares plan to outcome. */
  planned?: number | null;
  className?: string;
}

/**
 * R is the journal's unit of account: one R is the amount risked, so a result is
 * comparable across symbols and sizes. A trade that has not been scored renders
 * as an explicit gap rather than as `0.00R` — zero is a measured flat result and
 * must not be confused with a missing one.
 */
export function RMultipleIndicator({ value, planned, className }: RMultipleIndicatorProps) {
  if (value === null) {
    return (
      <Tooltip content="Not scored: the trade has no recorded exit yet.">
        <span className={cn('num text-text-faint', className)}>not scored</span>
      </Tooltip>
    );
  }

  const tone = value > 0.15 ? 'text-success' : value < -0.15 ? 'text-danger' : 'text-text-muted';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  const plannedValue = planned ?? null;

  return (
    <Tooltip
      content={
        plannedValue === null
          ? 'Realised multiple of the risked amount.'
          : `Realised ${value.toFixed(2)}R against a ${plannedValue.toFixed(1)}R plan.`
      }
    >
      <span className={cn('num font-medium', tone, className)}>
        {sign}
        {Math.abs(value).toFixed(2)}R
      </span>
    </Tooltip>
  );
}
