import { Database, Lock } from 'lucide-react';
import type { DataProvenance } from '@shared/marketdata/provider';
import { provenanceLabel } from '@shared/frontend/viewModels';
import { formatTimestamp } from '../lib/format';
import { cn } from '../lib/cn';
import { ProvenanceBadge } from './Badge';
import { msg } from '../i18n/index.js';

export interface ProvenanceBannerProps {
  provenance: DataProvenance;
  source: string;
  updatedAt: string;
  className?: string;
}

/**
 * Mandatory data-provenance strip.
 *
 * The label text comes from the backend contract
 * (`provenanceLabel()` in src/frontend/viewModels.ts) rather than a local
 * string, so "synthetic" can never be reworded into something that reads as
 * real market data. Read-only is stated for the same reason.
 */
export function ProvenanceBanner({
  provenance,
  source,
  updatedAt,
  className,
}: ProvenanceBannerProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)]',
        'border border-border bg-surface-sunken px-3 py-2',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <ProvenanceBadge provenance={provenance} />
        <span className="text-caption text-text-muted">{provenanceLabel(provenance)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-caption text-text-faint">
        <span className="inline-flex items-center gap-1">
          <Database size={12} aria-hidden />
          {source}
        </span>
        <span className="num">{formatTimestamp(updatedAt)}</span>
        <span className="inline-flex items-center gap-1">
          <Lock size={12} aria-hidden />
          {msg('ui.readOnly')}
        </span>
      </div>
    </div>
  );
}
