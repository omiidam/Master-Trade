import { CalendarPlus, ClipboardCheck, Hourglass, ShieldCheck, XCircle, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { formatRelative, formatTimestamp } from '../../lib/format';
import { Badge, type BadgeTone } from '../Badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../Card';
import { EmptyState } from '../EmptyState';

export type ExperimentEventKind =
  'created' | 'evaluation-attached' | 'status-change' | 'approval-requested' | 'abandoned';

export interface ExperimentTimelineEntryInput {
  id: string;
  experimentId: string;
  kind: ExperimentEventKind;
  at: string;
  actor: string;
  detail: string;
  sampleSize: number | null;
}

const KIND_META: Record<ExperimentEventKind, { label: string; tone: BadgeTone; icon: ReactNode }> =
  {
    created: { label: 'Created', tone: 'neutral', icon: <CalendarPlus size={13} aria-hidden /> },
    'evaluation-attached': {
      label: 'Evaluation attached',
      tone: 'info',
      icon: <ClipboardCheck size={13} aria-hidden />,
    },
    'status-change': {
      label: 'Status change',
      tone: 'neutral',
      icon: <Zap size={13} aria-hidden />,
    },
    'approval-requested': {
      label: 'Approval requested',
      tone: 'warning',
      icon: <ShieldCheck size={13} aria-hidden />,
    },
    abandoned: { label: 'Abandoned', tone: 'outline', icon: <XCircle size={13} aria-hidden /> },
  };

export interface ExperimentTimelineProps {
  entries: readonly ExperimentTimelineEntryInput[];
  experimentTitles?: Readonly<Record<string, string>>;
  order?: 'newest' | 'oldest';
  title?: string;
  description?: string;
  className?: string;
}

/**
 * Research history.
 *
 * Evaluation entries carry the sample size they were recorded at, which is the
 * single most useful fact on this timeline: a verdict reached at 38 trades and
 * one reached at 240 are different claims even when the wording is identical.
 */
export function ExperimentTimeline({
  entries,
  experimentTitles = {},
  order = 'newest',
  title = 'Research timeline',
  description = 'Hypotheses, evaluations and approval requests, in order',
  className,
}: ExperimentTimelineProps) {
  const sorted = [...entries].sort((a, b) =>
    order === 'newest' ? b.at.localeCompare(a.at) : a.at.localeCompare(b.at),
  );

  return (
    <Card className={className}>
      <CardHeader>
        <div>
          <CardTitle className="text-body">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Badge tone="neutral">{entries.length} events</Badge>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <EmptyState
            icon={<Hourglass size={22} aria-hidden />}
            title="Nothing recorded yet"
            description="An experiment has no history until a hypothesis is written, so this list starts empty by design."
          />
        ) : (
          <ol className="space-y-0">
            {sorted.map((entry, index) => {
              const meta = KIND_META[entry.kind];
              const isJob = entry.actor.startsWith('job.');
              return (
                <li key={entry.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      aria-hidden
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border bg-surface-raised text-text-muted"
                    >
                      {meta.icon}
                    </span>
                    {index === sorted.length - 1 ? null : (
                      <span aria-hidden className="w-px flex-1 bg-border" />
                    )}
                  </div>
                  <div className={cn('min-w-0 flex-1 pb-4', index === sorted.length - 1 && 'pb-0')}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      {entry.sampleSize === null ? null : (
                        <span className="num text-caption text-text-muted">
                          n = {entry.sampleSize}
                        </span>
                      )}
                      <span className="text-caption text-text-faint">
                        {formatRelative(entry.at)} · {formatTimestamp(entry.at)}
                      </span>
                    </div>
                    <p className="mt-1 text-caption text-text-muted">{entry.detail}</p>
                    <p className="mt-0.5 text-caption text-text-faint">
                      {experimentTitles[entry.experimentId] ? (
                        <span className="text-text-muted">
                          {experimentTitles[entry.experimentId]}
                        </span>
                      ) : (
                        <span className="num">{entry.experimentId}</span>
                      )}
                      <span aria-hidden> · </span>
                      <span className={cn('num', isJob && 'text-info')}>{entry.actor}</span>
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
