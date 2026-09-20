import { Bot, Database, FileText, Sparkles, User } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ProvenanceSource } from '../../../../src/core/provenance.js';
import { cn } from '../../lib/cn';
import { formatTimestamp } from '../../lib/format';

const ICON: Record<ProvenanceSource, ReactNode> = {
  tool: <Sparkles size={12} aria-hidden />,
  human: <User size={12} aria-hidden />,
  model: <Bot size={12} aria-hidden />,
  'market-data': <Database size={12} aria-hidden />,
  document: <FileText size={12} aria-hidden />,
  synthetic: <Database size={12} aria-hidden />,
};

/**
 * How a source is named. The wording is deliberately flat: `model` is described
 * as model-authored rather than "AI-generated insight", because the second
 * phrasing invites trust the source has not earned.
 */
const KIND_LABEL: Record<ProvenanceSource, string> = {
  tool: 'Deterministic tool',
  human: 'Human',
  model: 'Model-authored',
  'market-data': 'Market data',
  document: 'Document',
  synthetic: 'Synthetic',
};

export interface SourceIndicatorEntry {
  ref: string;
  kind: ProvenanceSource;
  label: string;
}

export interface SourceIndicatorProps {
  sources: readonly SourceIndicatorEntry[];
  /** Provenance timestamp, shown in the full variant. */
  recordedAt?: string;
  /** Free-text note from the provenance record. */
  note?: string;
  variant?: 'inline' | 'full';
  className?: string;
}

/**
 * The provenance display: what backs a claim.
 *
 * `full` prints the reference id as well as the human label, so any statement in
 * the knowledge base can be traced back to the tool, note or document it came
 * from without leaving the screen.
 */
export function SourceIndicator({
  sources,
  recordedAt,
  note,
  variant = 'inline',
  className,
}: SourceIndicatorProps) {
  if (sources.length === 0) {
    return (
      <p className={cn('text-caption text-text-faint', className)}>
        No source recorded — an unsourced claim may be retrieved but never presented as fact.
      </p>
    );
  }

  if (variant === 'inline') {
    return (
      <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
        {sources.map((source) => (
          <span
            key={`${source.kind}:${source.ref}`}
            className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] border border-border bg-surface-sunken px-2 py-0.5 text-caption text-text-muted"
          >
            {ICON[source.kind]}
            {source.label}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      <ul className="space-y-1.5">
        {sources.map((source) => (
          <li
            key={`${source.kind}:${source.ref}`}
            className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border border-border bg-surface-sunken px-2.5 py-1.5"
          >
            <span className="inline-flex items-center gap-1.5 text-caption text-text-muted">
              {ICON[source.kind]}
              {source.label}
            </span>
            <span className="num text-caption text-text-faint">{source.ref}</span>
          </li>
        ))}
      </ul>
      {note ? <p className="text-caption text-text-muted">{note}</p> : null}
      {recordedAt ? (
        <p className="text-caption text-text-faint">
          Provenance recorded {formatTimestamp(recordedAt)}
        </p>
      ) : null}
    </div>
  );
}

export { KIND_LABEL as SOURCE_KIND_LABEL };
