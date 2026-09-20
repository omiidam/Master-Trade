import { cn } from '../../lib/cn';
import type { JobStatus } from '../../api/client.js';

export interface JobProgress {
  current: number;
  total: number;
  label?: string;
}

export interface JobProgressIndicatorProps {
  progress: JobProgress | null;
  /** What `total` counts (`records`, `bars`, `sections`) — shown, never guessed. */
  unit?: string;
  status: JobStatus;
  className?: string;
}

const BAR_TONE: Record<JobStatus, string> = {
  queued: 'bg-border-strong',
  running: 'bg-primary',
  succeeded: 'bg-success',
  failed: 'bg-danger',
  'dead-letter': 'bg-danger',
  cancelled: 'bg-text-faint',
};

export function progressPercent(progress: JobProgress | null): number | null {
  if (!progress || progress.total <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((progress.current / progress.total) * 100)));
}

/**
 * Progress for a background job.
 *
 * Three distinct cases, never conflated: a determinate bar when the job reported
 * numbers, an indeterminate stripe when it is running but has reported none, and an
 * explicit "no progress reported" when it is not running at all. A bar frozen at 0%
 * for a queued job would read as "started and stuck".
 */
export function JobProgressIndicator({
  progress,
  unit,
  status,
  className,
}: JobProgressIndicatorProps) {
  const percent = progressPercent(progress);
  const indeterminate = status === 'running' && percent === null;

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2 text-caption">
        <span className="text-text-muted">
          {percent !== null
            ? `${percent}%`
            : indeterminate
              ? 'Working — progress not reported yet'
              : status === 'queued'
                ? 'Waiting for a worker'
                : 'No progress reported'}
        </span>
        {progress ? (
          <span className="num text-text-faint">
            {progress.current.toLocaleString('en-US')} / {progress.total.toLocaleString('en-US')}{' '}
            {unit ?? progress.label ?? 'items'}
          </span>
        ) : null}
      </div>
      <div
        role="progressbar"
        aria-label={`Job ${status}`}
        aria-valuemin={0}
        aria-valuemax={100}
        {...(percent === null ? {} : { 'aria-valuenow': percent })}
        className="h-1.5 w-full overflow-hidden rounded-[var(--radius-pill)] bg-surface-sunken"
      >
        <div
          className={cn(
            'h-full rounded-[var(--radius-pill)] transition-[width] duration-[var(--duration-base)]',
            BAR_TONE[status],
            indeterminate && 'animate-pulse',
          )}
          style={
            percent === null ? { width: indeterminate ? '35%' : '0%' } : { width: `${percent}%` }
          }
        />
      </div>
      {progress?.label && unit && progress.label !== unit ? (
        <p className="text-caption text-text-faint">Reported unit: {progress.label}</p>
      ) : null}
    </div>
  );
}
