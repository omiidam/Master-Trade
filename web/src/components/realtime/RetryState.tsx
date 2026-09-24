import { RefreshCw, ShieldAlert, WifiOff } from 'lucide-react';
import { Badge } from '../Badge';
import { Button } from '../Button';
import { cn } from '../../lib/cn';

export type RetryKind = 'retrying' | 'exhausted' | 'permission-denied' | 'offline';

export interface RetryStateProps {
  kind: RetryKind;
  /** Why, in the server's or client's own words. */
  message: string;
  attempts?: number;
  maxAttempts?: number;
  /** Seconds until the next attempt, when one is scheduled. */
  nextAttemptInMs?: number;
  onRetry: () => void;
  /** Disable the control when a retry is already in flight. */
  pending?: boolean;
  className?: string;
}

const PRESENTATION: Record<RetryKind, { label: string; tone: 'warning' | 'danger' | 'neutral' }> = {
  retrying: { label: 'Retrying', tone: 'warning' },
  exhausted: { label: 'Gave up', tone: 'danger' },
  'permission-denied': { label: 'Not permitted', tone: 'danger' },
  offline: { label: 'Offline', tone: 'neutral' },
};

/**
 * A retry surface that tells the truth about *which* situation this is.
 *
 * Retrying a refused request forever is a bug that looks like persistence: when the
 * failure is a permission denial, the control says so and the button is not offered
 * as if it could succeed. Every state names the attempt count it has spent.
 */
export function RetryState({
  kind,
  message,
  attempts,
  maxAttempts,
  nextAttemptInMs,
  onRetry,
  pending = false,
  className,
}: RetryStateProps) {
  const presentation = PRESENTATION[kind];
  // A refusal cannot be retried into a success: no button, just the reason.
  const canRetry = kind !== 'permission-denied';

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-panel)] border px-4 py-3',
        kind === 'permission-denied' || kind === 'exhausted'
          ? 'border-danger-border bg-danger-soft text-danger'
          : 'border-border bg-surface-raised text-text-muted',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        <span className="mt-0.5 shrink-0" aria-hidden>
          {canRetry ? <WifiOff size={14} /> : <ShieldAlert size={14} />}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-body font-medium">{presentation.label}</p>
            <Badge tone={presentation.tone}>
              {attempts === undefined || maxAttempts === undefined
                ? 'no attempt budget'
                : `attempt ${attempts} of ${maxAttempts}`}
            </Badge>
          </div>
          <p className="mt-0.5 text-caption opacity-90">{message}</p>
          {nextAttemptInMs !== undefined && kind === 'retrying' ? (
            <p className="mt-0.5 text-caption text-text-faint">
              Next attempt in about {Math.max(0, Math.round(nextAttemptInMs / 100) / 10)}s.
            </p>
          ) : null}
        </div>
      </div>
      {canRetry ? (
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={
            <RefreshCw size={12} aria-hidden className={cn(pending && 'animate-spin')} />
          }
          onClick={onRetry}
          disabled={pending}
        >
          {pending ? 'Trying…' : 'Try again'}
        </Button>
      ) : null}
    </div>
  );
}
