import { useState } from 'react';
import type { ReactNode } from 'react';
import { Ban, ShieldAlert } from 'lucide-react';
import { Button } from '../Button';
import { cn } from '../../lib/cn';
import { msg } from '../../i18n/index.js';

export interface CancelTaskControlProps {
  jobId: string;
  /** The job's own answer to "can this still be stopped?". */
  cancellable: boolean;
  onCancel: (jobId: string, reason?: string) => void | Promise<void>;
  /** True while the request is in flight, so the control cannot be double-fired. */
  pending?: boolean;
  /**
   * Set when the server refused: a refused cancellation is a *result*, and the
   * control says so instead of looking like nothing happened.
   */
  deniedReason?: string | null;
  /** Optional reason, recorded by the server in the audit trail. */
  collectReason?: boolean;
  className?: string;
}

/**
 * Cancelling a background task.
 *
 * Two confirmations, and neither of them optimistic: the request must be confirmed
 * before it is sent, and the UI reports what the server answered rather than
 * assuming success. Cancelling work is a consequential, audited action — the server
 * records who asked — so the control never fires on a stray click.
 */
export function CancelTaskControl({
  jobId,
  cancellable,
  onCancel,
  pending = false,
  deniedReason = null,
  collectReason = false,
  className,
}: CancelTaskControlProps): ReactNode {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');

  if (!cancellable) {
    return (
      <span
        className={cn('inline-flex items-center gap-1.5 text-caption text-text-faint', className)}
      >
        <Ban size={12} aria-hidden />
        {msg('realtime.thisTaskCanNoLongerBe')}
      </span>
    );
  }

  if (deniedReason) {
    return (
      <span
        role="status"
        className={cn('inline-flex items-center gap-1.5 text-caption text-danger', className)}
      >
        <ShieldAlert size={12} aria-hidden />
        {deniedReason}
      </span>
    );
  }

  if (!confirming) {
    return (
      <Button
        size="sm"
        variant="danger"
        leadingIcon={<Ban size={12} aria-hidden />}
        onClick={() => setConfirming(true)}
        className={className}
      >
        {msg('realtime.stopThisTask')}
      </Button>
    );
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {collectReason ? (
        <label className="flex items-center gap-2 text-caption text-text-muted">
          <span>{msg('realtime.reasonOptional')}</span>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={200}
            className="h-8 w-48 rounded-[var(--radius-control)] border border-border bg-surface-sunken px-2 text-caption text-text outline-none focus-visible:border-focus"
          />
        </label>
      ) : null}
      <Button
        size="sm"
        variant="danger"
        disabled={pending}
        onClick={() => {
          void (async () => {
            await onCancel(jobId, reason.trim() === '' ? undefined : reason.trim());
            setConfirming(false);
            setReason('');
          })();
        }}
      >
        {pending ? 'Stopping…' : 'Confirm stop'}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
        {msg('realtime.keepItRunning')}
      </Button>
    </div>
  );
}
