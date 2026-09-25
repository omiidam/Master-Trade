import { Coins } from 'lucide-react';
import { cn } from '../../lib/cn';
import { msg } from '../../i18n/index.js';

/**
 * What is left, and what that means.
 *
 * Two components, and the split is the honesty: `CreditBalance` reports a number the
 * server computed, and `UsageProgressBar` reports how much of an allowance a *specific*
 * capability has used. A balance of 12 says nothing about whether a backtest is
 * affordable, and a progress bar for one capability says nothing about the balance — so
 * neither is derived from the other, and neither guesses.
 *
 * The bar is deliberately not a score. It has no colour for "good" or "bad": a used
 * allowance is not a failure, so the tone changes only where the *state* does — near the
 * end of an allowance, and at the end of it.
 */

export interface CreditBalanceProps {
  /** Credits remaining, exactly as the server reported them. */
  balance: number;
  /** The plan's allowance, so the number can be read as a fraction of something. */
  allowance: number;
  /** Lifetime consumption, when the surface has it. */
  lifetimeConsumed?: number;
  className?: string;
  /** Compact form for a header or a card corner. */
  compact?: boolean;
}

export function CreditBalance({
  balance,
  allowance,
  lifetimeConsumed,
  className,
  compact = false,
}: CreditBalanceProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Coins
        size={compact ? 14 : 16}
        aria-hidden
        className={balance > 0 ? 'text-primary' : 'text-text-faint'}
      />
      <span className={cn('font-semibold num text-text', compact ? 'text-body' : 'text-h3')}>
        {balance}
      </span>
      <span className={cn('text-text-muted', compact ? 'text-caption' : 'text-body')}>
        {msg('exams.of')} {allowance} {msg('usage.thisPeriod')}
      </span>
      {lifetimeConsumed === undefined ? null : (
        <span className="text-caption text-text-faint">
          {lifetimeConsumed} {msg('usage.usedSinceTheAccountWasCreated')}
        </span>
      )}
    </div>
  );
}

export type UsageBarState = 'active' | 'near-limit' | 'limit-reached' | 'unavailable';

/**
 * How much of one capability's allowance is used.
 *
 * `limit === null` means the plan does not cap this capability separately, and that is
 * rendered as a count with no bar rather than a bar at zero — a bar that cannot move
 * would imply a limit that does not exist.
 */
export interface UsageProgressBarProps {
  label: string;
  used: number;
  limit: number | null;
  /** In words: what the number counts. Required, so a bar is never unlabelled. */
  unit: string;
  className?: string;
}

export function usageBarState(used: number, limit: number | null): UsageBarState {
  if (limit === null) return 'unavailable';
  if (used >= limit) return 'limit-reached';
  // Four fifths is the point where a warning is still actionable rather than noise.
  if (used / Math.max(1, limit) >= 0.8) return 'near-limit';
  return 'active';
}

const BAR_FILL: Readonly<Record<UsageBarState, string>> = {
  active: 'bg-primary',
  'near-limit': 'bg-warning',
  'limit-reached': 'bg-danger',
  unavailable: 'bg-border-strong',
};

const BAR_TEXT: Readonly<Record<UsageBarState, string>> = {
  active: 'text-text-muted',
  'near-limit': 'text-warning',
  'limit-reached': 'text-danger',
  unavailable: 'text-text-faint',
};

export function UsageProgressBar({ label, used, limit, unit, className }: UsageProgressBarProps) {
  const state = usageBarState(used, limit);
  const percent = limit === null ? 0 : Math.min(100, Math.round((used / Math.max(1, limit)) * 100));

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-body text-text">{label}</span>
        <span className={cn('text-caption num', BAR_TEXT[state])}>
          {used}
          {limit === null ? '' : ` / ${limit}`} {unit}
        </span>
      </div>
      {limit === null ? (
        <p className="text-caption text-text-faint">
          {msg('usage.notLimitedSeparatelyByThisPlan')}
        </p>
      ) : (
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-valuenow={Math.min(used, limit)}
          aria-label={`${label}: ${used} of ${limit} ${unit}`}
        >
          <div
            className={cn('h-full rounded-full transition-[width]', BAR_FILL[state])}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  );
}
