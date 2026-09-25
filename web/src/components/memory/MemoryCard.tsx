import { History, Tag } from 'lucide-react';
import { cn } from '../../lib/cn';
import { formatPercent, formatRelative, formatTimestamp } from '../../lib/format';
import { Badge } from '../Badge';
import { Button } from '../Button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../Card';
import { EpistemicBadge } from '../Badge';
import { Tooltip } from '../Tooltip';
import { SourceIndicator } from './SourceIndicator';
import { TrustBadge } from './TrustBadge';
import {
  memoryContextKind,
  memoryStatus,
  type KnowledgeRecord,
  type MemoryCategoryId,
} from '../../mock/memory';
import { msg } from '../../i18n/index.js';

export interface MemoryCardProps {
  record: KnowledgeRecord;
  /** Category label, resolved by the page so this component stays data-agnostic. */
  categoryLabel?: string;
  /** `compact` for the dashboard and lists, `full` for the knowledge board. */
  variant?: 'compact' | 'full';
  onOpen?: (recordId: string) => void;
  className?: string;
}

/**
 * One knowledge record.
 *
 * Four facts are always on the card: what it says, how much it may be trusted,
 * what backs it, and how confident the record is. The epistemic label is derived
 * from the trust level by the backend's own rule (`contextKindForTrust`), so the
 * UI cannot label an unverified record as anything but uncertainty.
 */
export function MemoryCard({
  record,
  categoryLabel,
  variant = 'full',
  onOpen,
  className,
}: MemoryCardProps) {
  const status = memoryStatus(record);
  const epistemic = memoryContextKind(record);
  const archived = status === 'archived';

  return (
    <Card
      interactive={onOpen !== undefined}
      className={cn(archived && 'opacity-75', className)}
      aria-label={record.title}
    >
      <CardHeader divider>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <TrustBadge status={status} />
            <EpistemicBadge kind={epistemic} />
            <span className="text-caption text-text-faint">
              {msg('decisions.v')}
              {record.version}
            </span>
          </div>
          <CardTitle className="mt-2 text-body">{record.title}</CardTitle>
          <CardDescription>
            {categoryLabel ? `${categoryLabel} · ` : ''}
            {msg('memory.updated')} {formatRelative(record.updatedAt)}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <p className={cn('text-caption text-text-muted', variant === 'compact' && 'line-clamp-2')}>
          {record.summary}
        </p>

        {variant === 'full' ? (
          <>
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-caption text-text-muted">
                  {msg('memory.recordConfidence')}
                </span>
                <span className="num text-caption text-text">
                  {formatPercent(record.confidence * 100, 0)}
                </span>
              </div>
              <div
                role="img"
                aria-label={`Record confidence ${formatPercent(record.confidence * 100, 0)}`}
                className="h-1.5 w-full overflow-hidden rounded-[var(--radius-pill)] bg-surface-sunken"
              >
                <div
                  className={cn(
                    'h-full rounded-[var(--radius-pill)]',
                    record.confidence >= 0.8
                      ? 'bg-primary'
                      : record.confidence >= 0.5
                        ? 'bg-info'
                        : 'bg-warning',
                  )}
                  style={{ width: `${Math.round(record.confidence * 100)}%` }}
                />
              </div>
              <p className="text-caption text-text-faint">
                {msg('memory.confidenceIsAPropertyOfThe')}
              </p>
            </div>

            <SourceIndicator
              sources={record.sources}
              variant="full"
              recordedAt={record.provenance.recordedAt}
              {...(record.provenance.note === undefined ? {} : { note: record.provenance.note })}
            />
          </>
        ) : (
          <SourceIndicator sources={record.sources} />
        )}

        {record.tags.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Tag size={12} aria-hidden className="text-text-faint" />
            {record.tags.map((tag) => (
              <Badge key={tag} tone="outline">
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}
      </CardContent>

      <CardFooter className="text-caption text-text-faint">
        <span className="inline-flex items-center gap-1.5">
          <History size={12} aria-hidden />
          {msg('memory.created')} {formatTimestamp(record.createdAt)}
        </span>
        {onOpen === undefined ? (
          <Tooltip content={msg('memoryCard.noMemoryServiceIsConnectedInThisPhase')}>
            <span>
              <Button size="sm" variant="ghost" disabled>
                {msg('memory.openRecord')}
              </Button>
            </span>
          </Tooltip>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => onOpen(record.id)}>
            {msg('memory.openRecord')}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

export type { MemoryCategoryId };
