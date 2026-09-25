import type { ReactNode } from 'react';
import { Badge } from '../Badge';
import { Alert, type AlertTone } from '../Alert';
import { cn } from '../../lib/cn';
import { formatRelative } from '../../lib/format';
import { msg } from '../../i18n/index.js';

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

/**
 * The stream's own word for a level, mapped onto the feedback system's tone.
 *
 * `danger` is the *event* vocabulary (a dropped frame, a refused cancellation); `error` is the
 * feedback vocabulary (something failed). They are the same red and deliberately different names,
 * so that renaming a tone cannot silently rename a stream level.
 */
const LEVEL_TONE: Record<NotificationLevel, AlertTone> = {
  info: 'info',
  warning: 'warning',
  danger: 'error',
};

/**
 * One notification, with its origin stated.
 *
 * A notice the *frontend* produced (a dropped frame, a replay gap, a refused
 * cancellation) is labelled `client`, because attributing the client's own defensive
 * message to the server would misrepresent where the claim came from — which is the
 * same provenance rule the backend applies to events.
 *
 * Since Phase 7.2 this renders the shared `Alert` rather than its own panel, so an inline notice,
 * a failure state and a toast are one component in three places. What stays here is the part that
 * is about a *realtime* notice: its level vocabulary, its origin label and its timestamp.
 */
export function RealtimeNotification({
  notification,
  onDismiss,
  compact = false,
  className,
}: RealtimeNotificationProps): ReactNode {
  return (
    <Alert
      tone={LEVEL_TONE[notification.level]}
      title={notification.title}
      meta={
        notification.origin === 'client' ? (
          <Badge shape="tag" tone="outline">
            raised by this client
          </Badge>
        ) : null
      }
      description={
        <>
          {notification.body ? (
            <p className={cn(compact && 'line-clamp-2')}>{notification.body}</p>
          ) : null}
          <p className="mt-1 opacity-70">{formatRelative(notification.at)}</p>
        </>
      }
      {...(onDismiss === undefined ? {} : { onDismiss: () => onDismiss(notification.id) })}
      dismissLabel={msg('toast.dismissThisNotification')}
      {...(className === undefined ? {} : { className })}
    />
  );
}
