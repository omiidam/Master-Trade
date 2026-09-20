import { cn } from '../../lib/cn';
import type { ConnectionState } from '../../realtime/client.js';

export type ConnectionTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface ConnectionStatusProps {
  state: ConnectionState | 'initialising';
  /** One line saying why the connection is in this state. */
  detail?: string;
  attempts?: number;
  maxAttempts?: number;
  reconnects?: number;
  delivered?: number;
  invalidDropped?: number;
  staleDropped?: number;
  /** Icon-only presentation, for the topbar. */
  compact?: boolean;
  className?: string;
}

interface Presentation {
  tone: ConnectionTone;
  label: string;
  dotClass: string;
  /** False when the state cannot improve on its own, so the UI stops implying it will. */
  willRetry: boolean;
}

/**
 * Every state gets its own words. "Connecting…" and "Denied" must never look the
 * same, because one resolves and the other needs the user to do something.
 */
export const CONNECTION_PRESENTATION: Record<ConnectionState | 'initialising', Presentation> = {
  initialising: {
    tone: 'neutral',
    label: 'Preparing',
    dotClass: 'bg-text-faint',
    willRetry: false,
  },
  idle: { tone: 'neutral', label: 'Not connected', dotClass: 'bg-text-faint', willRetry: false },
  connecting: {
    tone: 'info',
    label: 'Connecting',
    dotClass: 'bg-info animate-pulse',
    willRetry: true,
  },
  authenticating: {
    tone: 'info',
    label: 'Authenticating',
    dotClass: 'bg-info animate-pulse',
    willRetry: true,
  },
  online: {
    tone: 'success',
    label: 'Live',
    dotClass: 'bg-success animate-pulse',
    willRetry: false,
  },
  reconnecting: {
    tone: 'warning',
    label: 'Reconnecting',
    dotClass: 'bg-warning animate-pulse',
    willRetry: true,
  },
  offline: { tone: 'neutral', label: 'Offline', dotClass: 'bg-text-faint', willRetry: false },
  denied: { tone: 'danger', label: 'Not permitted', dotClass: 'bg-danger', willRetry: false },
};

const TONE_CLASSES: Record<ConnectionTone, string> = {
  neutral: 'border-border bg-surface-raised text-text-muted',
  info: 'border-[#1b2c49] bg-info-soft text-info',
  success: 'border-[#14453a] bg-primary-soft text-success',
  warning: 'border-[#3d2c12] bg-warning-soft text-warning',
  danger: 'border-[#3d1c20] bg-danger-soft text-danger',
};

/**
 * Connection state, with its reason. A stream that is not live must never be shown
 * as if it were, so the component states the state and the counts it can prove —
 * how many events arrived, how many were dropped as stale or unreadable.
 */
export function ConnectionStatus({
  state,
  detail,
  attempts,
  maxAttempts,
  reconnects,
  delivered,
  invalidDropped,
  staleDropped,
  compact = false,
  className,
}: ConnectionStatusProps) {
  const presentation = CONNECTION_PRESENTATION[state] ?? CONNECTION_PRESENTATION.offline;

  if (compact) {
    return (
      <span
        role="status"
        aria-label={`Event stream: ${presentation.label}`}
        title={detail ?? presentation.label}
        className={cn(
          'inline-flex items-center gap-2 rounded-[var(--radius-pill)] border px-2 py-0.5 text-caption',
          TONE_CLASSES[presentation.tone],
          className,
        )}
      >
        <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', presentation.dotClass)} />
        {presentation.label}
      </span>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'rounded-[var(--radius-panel)] border px-4 py-3',
        TONE_CLASSES[presentation.tone],
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span aria-hidden className={cn('h-2 w-2 rounded-full', presentation.dotClass)} />
        <p className="text-body font-medium">{presentation.label}</p>
        {attempts !== undefined && attempts > 0 ? (
          <span className="text-caption opacity-80">
            attempt {attempts}
            {maxAttempts === undefined ? '' : ` of ${maxAttempts}`}
          </span>
        ) : null}
        {reconnects !== undefined && reconnects > 0 ? (
          <span className="text-caption opacity-80">{reconnects} reconnect(s)</span>
        ) : null}
        {!presentation.willRetry && state === 'denied' ? (
          <span className="text-caption opacity-80">
            Retrying will not help until this changes.
          </span>
        ) : null}
      </div>
      {detail ? <p className="mt-1 text-caption opacity-90">{detail}</p> : null}
      {delivered !== undefined || invalidDropped !== undefined || staleDropped !== undefined ? (
        <dl className="mt-3 grid grid-cols-3 gap-2 text-caption opacity-90">
          <div>
            <dt className="text-text-faint">Events delivered</dt>
            <dd className="num">{delivered ?? 0}</dd>
          </div>
          <div>
            <dt className="text-text-faint">Stale, dropped</dt>
            <dd className="num">{staleDropped ?? 0}</dd>
          </div>
          <div>
            <dt className="text-text-faint">Unreadable, dropped</dt>
            <dd className="num">{invalidDropped ?? 0}</dd>
          </div>
        </dl>
      ) : null}
    </div>
  );
}
