import type { ContextField, FieldKey, Holding } from '@shared/profile/model';
import { FIELD_LABELS } from '@shared/profile/model';
import { cn } from '../../lib/cn';
import { ContextStatusBadge, FactSourceBadge } from './ContextStatusBadge';
import { msg, liveLabels } from '../../i18n/index.js';

/**
 * One declared field, rendered with everything needed to judge it.
 *
 * The row answers four questions in the same place, which is the point of the module:
 * what is the value, did the user state it or is it an assumption, is it still current,
 * and how old is it. A value shown without its source is the failure mode this whole
 * phase exists to prevent.
 */

const ARRAY_LABELS: Record<string, string> = liveLabels({
  equity: 'profile.array.equity',
  fx: 'profile.array.fx',
  crypto: 'profile.array.crypto',
  commodity: 'profile.array.commodity',
  index: 'profile.array.index',
  'risk-management': 'profile.array.risk-management',
  'chart-reading': 'profile.array.chart-reading',
  'strategy-development': 'profile.array.strategy-development',
  'psychology-discipline': 'profile.array.psychology-discipline',
  'journaling-review': 'profile.array.journaling-review',
  'market-structure': 'profile.array.market-structure',
  scalping: 'profile.array.scalping',
  'day-trading': 'profile.array.day-trading',
  swing: 'profile.array.swing',
  position: 'profile.array.position',
  'capital-preservation': 'profile.array.capital-preservation',
  balanced: 'profile.array.balanced',
  'growth-oriented': 'profile.array.growth-oriented',
  unspecified: 'profile.array.unspecified',
  'prefer-not-to-say': 'profile.array.prefer-not-to-say',
  'under-1k': 'profile.array.under-1k',
  '1k-10k': 'profile.array.1k-10k',
  '10k-50k': 'profile.array.10k-50k',
  '50k-250k': 'profile.array.50k-250k',
  'over-250k': 'profile.array.over-250k',
  beginner: 'profile.array.beginner',
  intermediate: 'profile.array.intermediate',
  advanced: 'profile.array.advanced',
});

/** A readable value. Unknown vocabulary falls back to the raw token, never to a guess. */
export function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return 'Not provided';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'None listed';
    const items = value as unknown[];
    if (items.every((item) => typeof item === 'string')) {
      return items.map((item) => ARRAY_LABELS[String(item)] ?? String(item)).join(', ');
    }
    if (items.every((item) => typeof item === 'object' && item !== null && 'symbol' in item)) {
      return (items as Holding[])
        .map((holding) => `${holding.symbol} ${holding.weightPercent}%`)
        .join(', ');
    }
    if (items.every((item) => typeof item === 'object' && item !== null && 'statement' in item)) {
      return (items as { statement: string }[]).map((item) => item.statement).join(' · ');
    }
    return `${items.length} item(s)`;
  }
  return ARRAY_LABELS[String(value)] ?? String(value);
}

export interface FactRowProps {
  fieldKey: FieldKey;
  field: ContextField<unknown>;
  status: 'confirmed' | 'derived' | 'assumed' | 'stale' | 'missing';
  ageDays: number | null;
  required: boolean;
}

export function FactRow({ fieldKey, field, status, ageDays, required }: FactRowProps) {
  const missing = status === 'missing';
  return (
    <div className="flex flex-col gap-2 border-b border-border/60 py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-body font-medium text-text">{FIELD_LABELS[fieldKey]}</span>
          {!required ? (
            <span className="text-caption text-text-faint">{msg('profile.optional')}</span>
          ) : null}
        </div>
        <p
          className={cn(
            'text-body break-words',
            missing ? 'text-text-faint italic' : 'text-text-muted',
          )}
        >
          {formatFieldValue(field.value)}
        </p>
        {field.note ? (
          <p className="text-caption text-text-faint">
            {msg('profile.note')} {field.note}
          </p>
        ) : null}
        {ageDays !== null && !missing ? (
          <p className="text-caption text-text-faint">
            {msg('profile.observed')} {ageDays === 0 ? 'today' : `${ageDays} day(s) ago`}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {!missing ? <FactSourceBadge source={field.source} /> : null}
        <ContextStatusBadge status={status} />
      </div>
    </div>
  );
}
