import type { ContextField, FieldKey, Holding } from '@shared/profile/model';
import { FIELD_LABELS } from '@shared/profile/model';
import { cn } from '../../lib/cn';
import { ContextStatusBadge, FactSourceBadge } from './ContextStatusBadge';

/**
 * One declared field, rendered with everything needed to judge it.
 *
 * The row answers four questions in the same place, which is the point of the module:
 * what is the value, did the user state it or is it an assumption, is it still current,
 * and how old is it. A value shown without its source is the failure mode this whole
 * phase exists to prevent.
 */

const ARRAY_LABELS: Record<string, string> = {
  equity: 'Equities',
  fx: 'Foreign exchange',
  crypto: 'Crypto',
  commodity: 'Commodities',
  index: 'Indices',
  'risk-management': 'Risk management',
  'chart-reading': 'Chart reading',
  'strategy-development': 'Strategy development',
  'psychology-discipline': 'Psychology and discipline',
  'journaling-review': 'Journaling and review',
  'market-structure': 'Market structure',
  scalping: 'Scalping',
  'day-trading': 'Day trading',
  swing: 'Swing trading',
  position: 'Position trading',
  'capital-preservation': 'Capital preservation',
  balanced: 'Balanced',
  'growth-oriented': 'Growth oriented',
  unspecified: 'Prefer not to say',
  'prefer-not-to-say': 'Prefer not to say',
  'under-1k': 'Under 1,000',
  '1k-10k': '1,000 – 10,000',
  '10k-50k': '10,000 – 50,000',
  '50k-250k': '50,000 – 250,000',
  'over-250k': 'Over 250,000',
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

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
          <span className="text-body-sm font-medium text-text">{FIELD_LABELS[fieldKey]}</span>
          {!required ? <span className="text-caption text-text-faint">optional</span> : null}
        </div>
        <p
          className={cn(
            'text-body-sm break-words',
            missing ? 'text-text-faint italic' : 'text-text-muted',
          )}
        >
          {formatFieldValue(field.value)}
        </p>
        {field.note ? <p className="text-caption text-text-faint">Note: {field.note}</p> : null}
        {ageDays !== null && !missing ? (
          <p className="text-caption text-text-faint">
            Observed {ageDays === 0 ? 'today' : `${ageDays} day(s) ago`}
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
