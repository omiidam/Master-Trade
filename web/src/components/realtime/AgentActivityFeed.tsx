import type { ReactNode } from 'react';
import { Activity, Radio } from 'lucide-react';
import { Badge } from '../Badge';
import { Button } from '../Button';
import { EmptyState } from '../EmptyState';
import { cn } from '../../lib/cn';
import { formatRelative } from '../../lib/format';

/** The shape the feed renders. Both the live store and the fixtures satisfy it. */
export interface ActivityEntryInput {
  id: string;
  /** Contract type, e.g. `agent.status` — shown, because provenance is evidence. */
  type: string;
  source: string;
  at: string;
  text: string;
  detail?: string;
  correlationId?: string | null;
  provenance?: string;
  seq?: number;
}

export interface AgentActivityFeedProps {
  entries: readonly ActivityEntryInput[];
  /** False while the stream is not connected, so the feed never implies more. */
  live?: boolean;
  loading?: boolean;
  /** Scroll container height; the page keeps the feed to one column of panels. */
  maxHeightClass?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  onClear?: () => void;
  className?: string;
}

const SOURCE_TONE: Record<string, 'ai' | 'info' | 'warning' | 'neutral'> = {
  agent: 'ai',
  tool: 'info',
  job: 'info',
  system: 'neutral',
  'market-data': 'warning',
  user: 'neutral',
};

/**
 * What happened, in order, with provenance.
 *
 * Two properties make this trustworthy rather than decorative: each row names the
 * contract type it came from (so a claim can be traced back to an interface, not a
 * sentence), and the header says whether the stream is live. A feed rendered from
 * fixtures while the socket is down is still useful — but only if it says so.
 */
export function AgentActivityFeed({
  entries,
  live = false,
  loading = false,
  maxHeightClass = 'max-h-[28rem]',
  emptyTitle = 'Nothing has arrived yet',
  emptyDescription = 'Entries appear here as the agent, the tools, the jobs and the system report them. An empty feed says nothing about whether work is happening.',
  onClear,
  className,
}: AgentActivityFeedProps): ReactNode {
  return (
    <section
      aria-label="Agent activity"
      className={cn(
        'rounded-[var(--radius-panel)] border border-border bg-surface shadow-panel',
        className,
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-text-faint">
            <Activity size={14} />
          </span>
          <h3 className="text-body font-semibold text-text">Activity</h3>
          <Badge tone={live ? 'success' : 'neutral'} icon={<Radio size={11} aria-hidden />}>
            {live ? 'live' : 'not live'}
          </Badge>
          <span className="text-caption text-text-faint">{entries.length} entries</span>
        </div>
        {onClear && entries.length > 0 ? (
          <Button size="sm" variant="ghost" onClick={onClear}>
            Clear this list
          </Button>
        ) : null}
      </header>

      <div className={cn('overflow-y-auto px-4 py-3', maxHeightClass)}>
        {loading && entries.length === 0 ? (
          <ul aria-hidden className="space-y-3">
            {[0, 1, 2].map((row) => (
              <li key={row} className="space-y-2">
                <span className="block h-3 w-1/3 rounded-[var(--radius-control)] bg-surface-raised" />
                <span className="block h-3 w-4/5 rounded-[var(--radius-control)] bg-surface-raised" />
              </li>
            ))}
          </ul>
        ) : entries.length === 0 ? (
          <EmptyState title={emptyTitle} description={emptyDescription} />
        ) : (
          <ol className="space-y-3" aria-live={live ? 'polite' : 'off'}>
            {entries.map((entry) => (
              <li key={entry.id} className="flex gap-3">
                <span
                  aria-hidden
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-border-strong"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={SOURCE_TONE[entry.source] ?? 'neutral'}>{entry.type}</Badge>
                    <span className="text-caption text-text-faint">from {entry.source}</span>
                    {entry.provenance ? (
                      <span className="text-caption text-warning">
                        provenance: {entry.provenance}
                      </span>
                    ) : null}
                    {entry.seq !== undefined ? (
                      <span className="num text-caption text-text-faint">#{entry.seq}</span>
                    ) : null}
                    <span className="text-caption text-text-faint">{formatRelative(entry.at)}</span>
                  </div>
                  <p className="mt-1 text-body text-text">{entry.text}</p>
                  {entry.detail ? (
                    <p className="mt-0.5 text-caption text-text-muted">{entry.detail}</p>
                  ) : null}
                  {entry.correlationId ? (
                    <p className="num mt-0.5 text-caption text-text-faint">
                      correlation {entry.correlationId}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
