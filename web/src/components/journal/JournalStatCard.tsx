import { Info, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { Sparkline } from '../charts/Sparkline';
import { Tooltip } from '../Tooltip';
import { cn } from '../../lib/cn';
import type { StatTone } from '../../mock/journal';

export interface JournalStatCardProps {
  label: string;
  value: string;
  unit?: string;
  /** What the figure is read against. Never omitted — a bare number invites a wrong reading. */
  comparison: string;
  /** Sample or scope the figure was taken over. */
  basis?: string;
  tone?: StatTone;
  hint?: string;
  /** Optional trend shape. Presentation only: it is drawn from the supplied series. */
  sparkline?: readonly number[];
  className?: string;
}

const TONE_TEXT: Record<StatTone, string> = {
  positive: 'text-success',
  negative: 'text-danger',
  neutral: 'text-text',
  warning: 'text-warning',
};

const TONE_RING: Record<StatTone, string> = {
  positive: 'border-success-border',
  negative: 'border-danger-border',
  neutral: 'border-border',
  warning: 'border-warning-border',
};

const TONE_ICON = {
  positive: TrendingUp,
  negative: TrendingDown,
  neutral: Minus,
  warning: TrendingUp,
} as const;

/**
 * One journal statistic.
 *
 * The card never shows a headline number alone: a comparison, the basis it was
 * taken over and an optional caveat travel with it, because a rate without its
 * denominator is the single easiest way to misread a journal.
 */
export function JournalStatCard({
  label,
  value,
  unit,
  comparison,
  basis,
  tone = 'neutral',
  hint,
  sparkline,
  className,
}: JournalStatCardProps) {
  const Icon = TONE_ICON[tone];
  const strokeTone = tone === 'negative' ? 'info' : 'primary';
  return (
    <div
      className={cn(
        'relative flex h-full flex-col justify-between gap-3 rounded-[var(--radius-panel)]',
        'border bg-surface p-4 shadow-panel panel-gradient',
        TONE_RING[tone],
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-caption font-medium tracking-wide text-text-muted uppercase">{label}</p>
        {hint ? (
          <Tooltip content={hint}>
            <span className="text-text-faint" tabIndex={0} aria-label={`About ${label}`}>
              <Info size={13} aria-hidden />
            </span>
          </Tooltip>
        ) : (
          <span className={cn('shrink-0', TONE_TEXT[tone])} aria-hidden>
            <Icon size={14} />
          </span>
        )}
      </div>

      <div>
        <div className="flex items-baseline gap-1.5">
          <span className={cn('num text-metric', TONE_TEXT[tone])}>{value}</span>
          {unit ? <span className="text-caption text-text-faint">{unit}</span> : null}
        </div>
        <p className="mt-1.5 flex items-center gap-1.5 text-caption text-text-muted">
          <span className={cn('shrink-0', TONE_TEXT[tone])} aria-hidden>
            <Icon size={12} />
          </span>
          {comparison}
        </p>
      </div>

      <div className="flex items-end justify-between gap-3">
        {basis ? <p className="text-caption text-text-faint">{basis}</p> : <span />}
        {sparkline && sparkline.length > 1 ? (
          <Sparkline values={sparkline} tone={strokeTone} width={72} height={24} />
        ) : null}
      </div>
    </div>
  );
}
