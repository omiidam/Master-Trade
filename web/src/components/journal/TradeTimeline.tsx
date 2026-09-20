import {
  CheckCircle2,
  FileEdit,
  Flag,
  LogIn,
  LogOut,
  MessageSquare,
  Settings2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { EmptyState } from '../EmptyState';
import { cn } from '../../lib/cn';
import { formatTimestamp } from '../../lib/format';
import { TRADE_EVENT_LABEL } from '../../mock/journal';
import type { TradeEvent, TradeEventKind } from '../../mock/journal';

const ICONS: Record<TradeEventKind, ReactNode> = {
  recorded: <Flag size={13} aria-hidden />,
  entry: <LogIn size={13} aria-hidden />,
  management: <Settings2 size={13} aria-hidden />,
  exit: <LogOut size={13} aria-hidden />,
  review: <MessageSquare size={13} aria-hidden />,
  edit: <FileEdit size={13} aria-hidden />,
  assessment: <CheckCircle2 size={13} aria-hidden />,
};

const TONE: Record<TradeEventKind, string> = {
  recorded: 'text-text-muted',
  entry: 'text-info',
  management: 'text-warning',
  exit: 'text-primary',
  review: 'text-ai',
  edit: 'text-text-muted',
  assessment: 'text-success',
};

export interface TradeTimelineProps {
  events: readonly TradeEvent[];
  /** Shown when the record has no event history yet. */
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

/**
 * The record's history, oldest first.
 *
 * Events are appended, never rewritten: an edit adds a line that says an edit
 * happened instead of replacing the line it changed. A journal whose history can be
 * silently rewritten cannot be used to review a decision.
 */
export function TradeTimeline({
  events,
  emptyTitle = 'No history recorded yet',
  emptyDescription = 'A record with no events has not been through anything — it is not a record with an empty past.',
  className,
}: TradeTimelineProps) {
  if (events.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} className={className} />;
  }

  const ordered = [...events].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

  return (
    <section
      aria-label="Trade history"
      className={cn(
        'rounded-[var(--radius-panel)] border border-border bg-surface p-4 shadow-panel',
        className,
      )}
    >
      <h3 className="text-title font-semibold text-text">Record history</h3>
      <p className="mt-0.5 text-caption text-text-muted">
        Appended in order. Nothing here is overwritten, so an earlier reading stays available.
      </p>
      <ol className="mt-3 space-y-0">
        {ordered.map((event, index) => (
          <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
            {index < ordered.length - 1 ? (
              <span aria-hidden className="absolute start-[13px] top-6 bottom-0 w-px bg-border" />
            ) : null}
            <span
              aria-hidden
              className={cn(
                'relative z-10 grid h-[27px] w-[27px] shrink-0 place-items-center rounded-full',
                'border border-border bg-surface-sunken',
                TONE[event.kind],
              )}
            >
              {ICONS[event.kind]}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-body text-text">{TRADE_EVENT_LABEL[event.kind]}</p>
                <p className="num text-caption text-text-faint">{formatTimestamp(event.at)}</p>
              </div>
              <p className="mt-0.5 text-caption text-text-muted">{event.detail}</p>
              <p className="mt-0.5 text-caption text-text-faint">source: {event.actor}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
