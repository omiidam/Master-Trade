import { Card, type CardEmphasis } from '../Card';
import { cn } from '../../lib/cn';
import type { ConnectionState } from '../../realtime/client.js';
import { msg } from '../../i18n/index.js';

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
    get label(): string {
      return msg('connectionStatus.preparing');
    },
    dotClass: 'bg-text-faint',
    willRetry: false,
  },
  idle: {
    tone: 'neutral',
    get label(): string {
      return msg('connectionStatus.notConnected');
    },
    dotClass: 'bg-text-faint',
    willRetry: false,
  },
  connecting: {
    tone: 'info',
    get label(): string {
      return msg('connectionStatus.connecting');
    },
    dotClass: 'bg-info animate-pulse',
    willRetry: true,
  },
  authenticating: {
    tone: 'info',
    get label(): string {
      return msg('connectionStatus.authenticating');
    },
    dotClass: 'bg-info animate-pulse',
    willRetry: true,
  },
  online: {
    tone: 'success',
    get label(): string {
      return msg('connectionStatus.live');
    },
    dotClass: 'bg-success animate-pulse',
    willRetry: false,
  },
  reconnecting: {
    tone: 'warning',
    get label(): string {
      return msg('connectionStatus.reconnecting');
    },
    dotClass: 'bg-warning animate-pulse',
    willRetry: true,
  },
  offline: {
    tone: 'neutral',
    get label(): string {
      return msg('connectionStatus.offline');
    },
    dotClass: 'bg-text-faint',
    willRetry: false,
  },
  denied: {
    tone: 'danger',
    get label(): string {
      return msg('connectionStatus.notPermitted');
    },
    dotClass: 'bg-danger',
    willRetry: false,
  },
};

/** The compact pill's own classes. A pill is a control-sized mark, not a card, so it keeps them. */
const TONE_CLASSES: Record<ConnectionTone, string> = {
  neutral: 'border-border bg-surface-raised text-text-muted',
  info: 'border-info-border bg-info-soft text-info',
  success: 'border-success-border bg-success-soft text-success',
  warning: 'border-warning-border bg-warning-soft text-warning',
  danger: 'border-danger-border bg-danger-soft text-danger',
};

/**
 * The full panel is a state *card*, so its tone is stated in the card's own vocabulary.
 *
 * The two tables are deliberately separate now: the pill and the panel both wanted the tone, but
 * only the pill is a control. `success` used to fill this panel with `primary-soft` — the brand's
 * wash — which is the exact confusion Phase 7.2.2 set out to end: an "ok" surface and a brand
 * surface were the same plate. It is `success-soft` now, and `neutral` is a raised plate rather
 * than a tinted one.
 */
const TONE_EMPHASIS: Record<ConnectionTone, CardEmphasis> = {
  neutral: 'none',
  info: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
};

const TONE_INK: Record<ConnectionTone, string> = {
  neutral: 'text-text-muted',
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
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
        // `leading-5` is declared rather than inherited, for the same reason `Badge` declares it:
        // an inherited line-height is a multiple of whatever font the host happened to fall back
        // to, which makes this pill's height a property of the machine. At 1.55 it came out at
        // 23.05px — under the 24px minimum target — and only cleared the floor because the
        // `<button>` wrapping it contributed a fraction of a pixel of its own baseline space,
        // which a different font does not. A declared 20px line box makes it 26px anywhere, and
        // matches the sibling pills it sits beside in the shell.
        className={cn(
          'inline-flex items-center gap-2 rounded-[var(--radius-pill)] border px-2 py-0.5 text-caption leading-5',
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
    <Card
      role="status"
      aria-live="polite"
      tone={presentation.tone === 'neutral' ? 'raised' : 'default'}
      emphasis={TONE_EMPHASIS[presentation.tone]}
      wash={presentation.tone !== 'neutral'}
      className={cn('px-4 py-3', TONE_INK[presentation.tone], className)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span aria-hidden className={cn('h-2 w-2 rounded-full', presentation.dotClass)} />
        <p className="text-body font-medium">{presentation.label}</p>
        {attempts !== undefined && attempts > 0 ? (
          <span className="text-caption opacity-80">
            {msg('realtime.attempt')} {attempts}
            {maxAttempts === undefined ? '' : ` of ${maxAttempts}`}
          </span>
        ) : null}
        {reconnects !== undefined && reconnects > 0 ? (
          <span className="text-caption opacity-80">
            {reconnects} {msg('realtime.reconnectS')}
          </span>
        ) : null}
        {!presentation.willRetry && state === 'denied' ? (
          <span className="text-caption opacity-80">
            {msg('realtime.retryingWillNotHelpUntilThis')}
          </span>
        ) : null}
      </div>
      {detail ? <p className="mt-1 text-caption opacity-90">{detail}</p> : null}
      {/* Mobile-first: the counters stack on a phone so a two-word label is never forced to
          wrap mid-phrase, and become a row where there is width for three. */}
      {delivered !== undefined || invalidDropped !== undefined || staleDropped !== undefined ? (
        <dl className="mt-3 grid grid-cols-1 gap-2 text-caption opacity-90 sm:grid-cols-3">
          <div>
            <dt className="text-text-faint">{msg('realtime.eventsDelivered')}</dt>
            <dd className="num">{delivered ?? 0}</dd>
          </div>
          <div>
            <dt className="text-text-faint">{msg('realtime.staleDropped')}</dt>
            <dd className="num">{staleDropped ?? 0}</dd>
          </div>
          <div>
            <dt className="text-text-faint">{msg('realtime.unreadableDropped')}</dt>
            <dd className="num">{invalidDropped ?? 0}</dd>
          </div>
        </dl>
      ) : null}
    </Card>
  );
}
