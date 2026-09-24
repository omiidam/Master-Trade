import { Archive, Bot, FilePlus2, GitBranch, ShieldCheck, UserCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { formatRelative, formatTimestamp } from '../../lib/format';
import { Badge, type BadgeTone } from '../Badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../Card';
import { EmptyState } from '../EmptyState';

export type MemoryEventKind =
  'created' | 'revision' | 'verification-requested' | 'trust-promoted' | 'tombstoned';

export interface MemoryTimelineEntryInput {
  id: string;
  recordId: string;
  kind: MemoryEventKind;
  at: string;
  actor: string;
  detail: string;
  version: number;
}

const KIND_META: Record<MemoryEventKind, { label: string; tone: BadgeTone; icon: ReactNode }> = {
  created: { label: 'Created', tone: 'neutral', icon: <FilePlus2 size={13} aria-hidden /> },
  revision: { label: 'Revised', tone: 'info', icon: <GitBranch size={13} aria-hidden /> },
  'verification-requested': {
    label: 'Verification requested',
    tone: 'warning',
    icon: <UserCheck size={13} aria-hidden />,
  },
  'trust-promoted': {
    label: 'Trust raised',
    tone: 'primary',
    icon: <ShieldCheck size={13} aria-hidden />,
  },
  tombstoned: { label: 'Tombstoned', tone: 'outline', icon: <Archive size={13} aria-hidden /> },
};

export interface MemoryTimelineProps {
  entries: readonly MemoryTimelineEntryInput[];
  /** Resolves a record id to its title; the page owns the lookup. */
  recordTitles?: Readonly<Record<string, string>>;
  /** Newest first by default, because the latest change is what a reader checks. */
  order?: 'newest' | 'oldest';
  title?: string;
  description?: string;
  className?: string;
}

/**
 * History of a knowledge record.
 *
 * History is append-only in the backend, so this list can only grow — which is
 * exactly why it is worth showing: a trust promotion, a verification request and
 * a tombstone are all evidence, and a record whose history was rewritten would be
 * indistinguishable from one that was never wrong.
 */
export function MemoryTimeline({
  entries,
  recordTitles = {},
  order = 'newest',
  title = 'Memory timeline',
  description = 'Revisions, verification requests and tombstones, in the order they happened',
  className,
}: MemoryTimelineProps) {
  const sorted = [...entries].sort((a, b) =>
    order === 'newest' ? b.at.localeCompare(a.at) : a.at.localeCompare(b.at),
  );

  return (
    <Card surface="data" className={className}>
      <CardHeader divider>
        <div>
          <CardTitle className="text-body">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Badge tone="neutral">{entries.length} events</Badge>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <EmptyState
            title="No history recorded"
            description="A record with no timeline has never been revised, verified or tombstoned."
          />
        ) : (
          <ol className="space-y-0">
            {sorted.map((entry, index) => {
              const meta = KIND_META[entry.kind];
              const actorIsModel = entry.actor.startsWith('agent.');
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
                      <span className="num text-caption text-text-faint">v{entry.version}</span>
                      <span className="text-caption text-text-faint">
                        {formatRelative(entry.at)} · {formatTimestamp(entry.at)}
                      </span>
                    </div>
                    <p className="mt-1 text-caption text-text-muted">{entry.detail}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-caption text-text-faint">
                      {recordTitles[entry.recordId] ? (
                        <span className="text-text-muted">{recordTitles[entry.recordId]}</span>
                      ) : (
                        <span className="num">{entry.recordId}</span>
                      )}
                      <span aria-hidden>·</span>
                      <span className="inline-flex items-center gap-1">
                        {actorIsModel ? <Bot size={11} aria-hidden /> : null}
                        <span className="num">{entry.actor}</span>
                      </span>
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
