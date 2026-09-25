import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ListChecks, RefreshCw } from 'lucide-react';
import { Badge } from '../Badge';
import { Button } from '../Button';
import { EmptyState } from '../EmptyState';
import { ErrorState } from '../ErrorState';
import { SkeletonCard } from '../Skeleton';
import { JobStatusCard } from './JobStatusCard';
import { cn } from '../../lib/cn';
import type { JobView } from '@shared/jobs/service';
import { msg } from '../../i18n/index.js';

export interface BackgroundTaskPanelProps {
  jobs: readonly JobView[];
  /** Counts from the queue itself, when it reported them. */
  summary?: Record<string, number> | null;
  loading?: boolean;
  /** A message describing the failure, already safe to render. */
  error?: string | null;
  /** The typed code behind `error`, shown as evidence. */
  errorCode?: string | null;
  onRefresh?: () => void | Promise<void>;
  onCancel?: (jobId: string, reason?: string) => void | Promise<void>;
  cancelling?: Record<string, boolean>;
  /** Human wording per job kind. */
  kindLabels?: Record<string, string>;
  /** Set when the records below are static preview fixtures, not queue records. */
  previewNotice?: string | null;
  /** True while the queue cannot be read at all (no session), with the reason. */
  unavailableReason?: string | null;
  className?: string;
}

type FilterId = 'all' | 'active' | 'attention' | 'finished';

type Filter = { id: FilterId; label: string; matches: (job: JobView) => boolean };

/** Declared once so the fallback below cannot be an undefined array entry. */
const ALL_FILTER: Filter = {
  id: 'all',
  get label(): string {
    return msg('backgroundTaskPanel.all');
  },
  matches: () => true,
};

const FILTERS: readonly Filter[] = [
  ALL_FILTER,
  {
    id: 'active',
    get label(): string {
      return msg('backgroundTaskPanel.active');
    },
    matches: (job) => job.status === 'running' || job.status === 'queued',
  },
  {
    id: 'attention',
    get label(): string {
      return msg('backgroundTaskPanel.needsAttention');
    },
    matches: (job) => job.status === 'failed' || job.status === 'dead-letter',
  },
  {
    id: 'finished',
    get label(): string {
      return msg('backgroundTaskPanel.finished');
    },
    matches: (job) => job.status === 'succeeded' || job.status === 'cancelled',
  },
];

/**
 * The background-task surface.
 *
 * It reads the queue's own counts (`summary`) rather than deriving totals from the
 * visible page — a summary computed from a filtered list would be a wrong number
 * presented as a fact. Loading, empty, error, unavailable and preview are five
 * distinct states, because "no jobs" and "cannot read the queue" must never look
 * alike.
 */
export function BackgroundTaskPanel({
  jobs,
  summary,
  loading = false,
  error = null,
  errorCode = null,
  onRefresh,
  onCancel,
  cancelling = {},
  kindLabels,
  previewNotice = null,
  unavailableReason = null,
  className,
}: BackgroundTaskPanelProps): ReactNode {
  const [filter, setFilter] = useState<FilterId>('all');
  const active = FILTERS.find((entry) => entry.id === filter) ?? ALL_FILTER;
  const visible = useMemo(() => jobs.filter((job) => active.matches(job)), [jobs, active]);

  return (
    <section aria-label={msg('realtime.backgroundTasks')} className={cn('space-y-4', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((entry) => (
            <Button
              key={entry.id}
              size="sm"
              variant={entry.id === filter ? 'subtle' : 'ghost'}
              onClick={() => setFilter(entry.id)}
              aria-pressed={entry.id === filter}
            >
              {entry.label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {summary ? (
            <span className="text-caption text-text-faint">
              {summary.queued ?? 0} {msg('realtime.queued')} {summary.running ?? 0}{' '}
              {msg('realtime.running')} {summary.succeeded ?? 0} {msg('realtime.completed')}{' '}
              {(summary['dead-letter'] ?? 0) + (summary.failed ?? 0)} {msg('realtime.stopped')}
            </span>
          ) : null}
          {onRefresh ? (
            <Button
              size="sm"
              variant="secondary"
              leadingIcon={
                <RefreshCw size={12} aria-hidden className={cn(loading && 'animate-spin')} />
              }
              onClick={() => void onRefresh()}
              disabled={loading}
            >
              {loading ? 'Reading…' : 'Refresh'}
            </Button>
          ) : null}
        </div>
      </div>

      {previewNotice ? (
        <ErrorState
          severity="info"
          title={msg('realtime.theseArePreviewRecords')}
          description={previewNotice}
          code="PREVIEW_FIXTURE"
        />
      ) : null}

      {unavailableReason ? (
        <ErrorState
          severity="warning"
          title={msg('realtime.theQueueCannotBeRead')}
          description={unavailableReason}
          code="UNAUTHENTICATED"
        />
      ) : null}

      {error && !unavailableReason ? (
        <ErrorState
          severity="error"
          title={msg('realtime.theJobListCouldNotBe')}
          description={error}
          {...(errorCode === null ? {} : { code: errorCode })}
        />
      ) : null}

      {loading && jobs.length === 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <SkeletonCard rows={3} />
          <SkeletonCard rows={3} />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<ListChecks size={22} aria-hidden />}
          title={jobs.length === 0 ? 'No background tasks in the queue' : 'Nothing in this filter'}
          description={
            jobs.length === 0
              ? 'Grading, indexing, dataset processing and report generation are all queued work. An empty queue means none of it is pending — it does not mean the queue is broken.'
              : 'The queue reported records, but none of them match this filter. Switch back to “All” to see the rest.'
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visible.map((job) => (
            <JobStatusCard
              key={job.id}
              job={job}
              {...(kindLabels?.[job.kind] === undefined ? {} : { kindLabel: kindLabels[job.kind] })}
              {...(onCancel === undefined ? {} : { onCancel })}
              cancelling={cancelling[job.id] === true}
            />
          ))}
        </div>
      )}

      {jobs.length > 0 ? (
        <p className="text-caption text-text-faint">
          <Badge tone="outline">{summary ? 'queue counts above' : 'counts unavailable'}</Badge>{' '}
          {msg('realtime.cancellingRecordsWhoAskedInThe')}
        </p>
      ) : null}
    </section>
  );
}
