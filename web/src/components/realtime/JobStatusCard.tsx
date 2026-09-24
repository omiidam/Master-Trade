import { AlertTriangle, CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge, type BadgeTone } from '../Badge';
import { Card, CardContent, CardFooter, CardHeader, CardTile, CardTitle } from '../Card';
import { JobProgressIndicator } from './JobProgressIndicator';
import { CancelTaskControl } from './CancelTaskControl';
import { cn } from '../../lib/cn';
import { formatRelative, formatTimestamp } from '../../lib/format';
import type { JobView } from '@shared/jobs/service';

export interface JobStatusCardProps {
  job: JobView;
  /** Human wording for the kind; falls back to the kind itself. */
  kindLabel?: string;
  onCancel?: (jobId: string, reason?: string) => void | Promise<void>;
  cancelling?: boolean;
  /** Server refusal for this job, rendered instead of a silent no-op. */
  cancelDeniedReason?: string | null;
  className?: string;
}

const STATUS_TONE: Record<string, BadgeTone> = {
  queued: 'neutral',
  running: 'info',
  succeeded: 'success',
  failed: 'danger',
  'dead-letter': 'danger',
  cancelled: 'warning',
};

const STATUS_LABEL: Record<string, string> = {
  queued: 'Queued',
  running: 'Running',
  succeeded: 'Completed',
  failed: 'Failed — will retry',
  'dead-letter': 'Stopped after exhausting retries',
  cancelled: 'Cancelled',
};

function statusIcon(status: string): ReactNode {
  switch (status) {
    case 'running':
      return <Loader2 size={14} aria-hidden className="animate-spin" />;
    case 'succeeded':
      return <CheckCircle2 size={14} aria-hidden />;
    case 'cancelled':
      return <XCircle size={14} aria-hidden />;
    case 'failed':
    case 'dead-letter':
      return <AlertTriangle size={14} aria-hidden />;
    default:
      return <Clock size={14} aria-hidden />;
  }
}

/**
 * One background job.
 *
 * The card states the attempt budget next to the status, because "failed" means
 * different things at attempt 1 of 3 and attempt 3 of 3 — one will retry, the other
 * has stopped. The last error is shown verbatim: it is a typed message, not a stack
 * trace, and hiding it would leave a user unable to tell a bug from a backoff.
 */
export function JobStatusCard({
  job,
  kindLabel,
  onCancel,
  cancelling = false,
  cancelDeniedReason = null,
  className,
}: JobStatusCardProps) {
  const label = STATUS_LABEL[job.status] ?? job.status;
  const attention = job.status === 'failed' || job.status === 'dead-letter';

  return (
    <Card
      tone={attention ? 'raised' : 'default'}
      className={cn(attention && 'border-danger-border', className)}
    >
      <CardHeader divider>
        <div className="min-w-0">
          <CardTitle className="text-body">{kindLabel ?? job.kind}</CardTitle>
          <p className="mt-0.5 num truncate text-caption text-text-faint">{job.id}</p>
        </div>
        <Badge tone={STATUS_TONE[job.status] ?? 'neutral'} icon={statusIcon(job.status)}>
          {label}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-3">
        <JobProgressIndicator progress={job.progress} unit={job.progressUnit} status={job.status} />

        <dl className="grid grid-cols-2 gap-2 text-caption">
          <div>
            <dt className="text-text-faint">Attempts</dt>
            <dd className="num text-text">
              {job.attempts} of {job.maxAttempts}
            </dd>
          </div>
          <div>
            <dt className="text-text-faint">Correlation</dt>
            <dd className="num truncate text-text" title={job.correlationId ?? 'none'}>
              {job.correlationId ?? 'none recorded'}
            </dd>
          </div>
        </dl>

        {job.error ? (
          <CardTile className="text-caption text-text-muted">{job.error}</CardTile>
        ) : null}
      </CardContent>

      <CardFooter className="text-caption text-text-faint">
        <span title={job.updatedAt}>updated {formatRelative(job.updatedAt)}</span>
        <span className="num" title={job.createdAt}>
          {formatTimestamp(job.createdAt)}
        </span>
      </CardFooter>

      {onCancel ? (
        <div className="border-t border-border px-4 py-3">
          <CancelTaskControl
            jobId={job.id}
            cancellable={job.cancellable}
            onCancel={onCancel}
            pending={cancelling}
            deniedReason={cancelDeniedReason}
          />
        </div>
      ) : null}
    </Card>
  );
}
