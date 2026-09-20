import type { ReactNode } from 'react';
import { AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { Badge } from '../Badge';
import { IconButton } from '../Button';
import { cn } from '../../lib/cn';
import { formatRelative } from '../../lib/format';

export type NotificationLevel = 'info' | 'warning' | 'danger';

export interface NotificationInput {
  id: string;
  level: NotificationLevel;
  title: string;
  body: string;
  at: string;
  /** `client` marks a notice this frontend raised about the stream itself. */
  origin?: 'server' | 'client';
}

export interface RealtimeNotificationProps {
  notification: NotificationInput;
  onDismiss?: (id: string) => void;
  /** Compact rows for a stacked list. */
  compact?: boolean;
  className?: string;
}

const ICONS: Record<NotificationLevel, ReactNode> = {
  info: <Info size={15} aria-hidden />,
  warning: <AlertTriangle size={15} aria-hidden />,
  danger: <AlertCircle size={15} aria-hidden />,
};

const TONES: Record<NotificationLevel, string> = {
  info: 'border-[#1b2c49] bg-info-soft text-info',
  warning: 'border-[#3d2c12] bg-warning-soft text-warning',
  danger: 'border-[#3d1c20] bg-danger-soft text-danger',
};

/**
 * One notification, with its origin stated.
 *
 * A notice the *frontend* produced (a dropped frame, a replay gap, a refused
 * cancellation) is labelled `client`, because attributing the client's own defensive
 * message to the server would misrepresent where the claim came from — which is the
 * same provenance rule the backend applies to events.
 */
export function RealtimeNotification({
  notification,
  onDismiss,
  compact = false,
  className,
}: RealtimeNotificationProps): ReactNode {
  return (
    <div
      role={notification.level === 'info' ? 'status' : 'alert'}
      className={cn(
        'flex items-start gap-3 rounded-[var(--radius-panel)] border px-4 py-3',
        TONES[notification.level],
        className,
      )}
    >
      <span className="mt-0.5 shrink-0">{ICONS[notification.level]}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-body font-medium">{notification.title}</p>
          {notification.origin === 'client' ? (
            <Badge tone="outline">raised by this client</Badge>
          ) : null}
        </div>
        {notification.body ? (
          <p className={cn('mt-0.5 text-caption opacity-90', compact && 'line-clamp-2')}>
            {notification.body}
          </p>
        ) : null}
        <p className="mt-1 text-caption opacity-70">{formatRelative(notification.at)}</p>
      </div>
      {onDismiss ? (
        <IconButton
          size="sm"
          variant="ghost"
          label="Dismiss this notification"
          onClick={() => onDismiss(notification.id)}
        >
          <X size={13} aria-hidden />
        </IconButton>
      ) : null}
    </div>
  );
}
