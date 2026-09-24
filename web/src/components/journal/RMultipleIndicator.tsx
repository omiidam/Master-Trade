import { cn } from '../../lib/cn';
import { Tooltip } from '../Tooltip';
import { Trend } from '../Trend';

export interface RMultipleIndicatorProps {
  /** Realised multiple of the risked amount. `null` means "not scored". */
  value: number | null;
  /** Planned multiple, shown alongside when the surface compares plan to outcome. */
  planned?: number | null;
  className?: string;
}

/**
 * R is the journal's unit of account: one R is the amount risked, so a result is
 * comparable across symbols and sizes.
 *
 * The polarity is `Trend`'s, which is the reason this file is now nine lines rather than a
 * component with its own threshold and its own tone table: it drew the direction as an ink and
 * nothing else, so a gain and a loss were the same string in two colours. It carries the mark, the
 * word and the ink now, and the threshold that makes ±0.15R read as flat lives with it.
 *
 * A trade that has not been scored still renders as an explicit absence rather than as `0.00R` —
 * zero is a measured flat result, and the two must not be confusable.
 */
export function RMultipleIndicator({ value, planned, className }: RMultipleIndicatorProps) {
  const plannedValue = planned ?? null;
  const hint =
    value === null
      ? 'Not scored: the trade has no recorded exit yet.'
      : plannedValue === null
        ? 'Realised multiple of the risked amount.'
        : `Realised ${value.toFixed(2)}R against a ${plannedValue.toFixed(1)}R plan.`;

  return (
    <Tooltip content={hint}>
      <Trend
        value={value}
        // Below a fifth of the risked amount the realised result is flat rather than directional:
        // calling ±0.11R a gain is a claim the record does not support.
        flatWithin={0.15}
        unavailable="not scored"
        // The sign is printed here rather than by `Trend`, because a currency formatter would
        // already have printed its own and two signs on one figure is a bug nothing would catch.
        format={(number) =>
          `${number > 0 ? '+' : number < 0 ? '−' : ''}${Math.abs(number).toFixed(2)}R`
        }
        className={cn('font-medium', className)}
      />
    </Tooltip>
  );
}
