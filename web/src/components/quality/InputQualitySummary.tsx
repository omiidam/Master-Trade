import { Info } from 'lucide-react';
import type { DimensionAssessment, QualityReport } from '@shared/quality/model';
import { Badge } from '../Badge';
import { DataQualityBadge } from './DataQualityBadge';
import { dimensionLabel } from './labels';
import { CardTile } from '../Card';

/**
 * How good the declared inputs are, with no particular analysis in mind.
 *
 * This is the answer to "what have I given the system, and how much of it can be used?"
 * — a different question from the gate's "may this analysis run?", and the reason the
 * two are separate components. A report with gaps can still permit a narrow analysis; a
 * report with every field present can still block one that needs a bar series.
 *
 * The summary is deliberately **not** a score. The model produces no number, and inventing
 * one here would put a threshold in the UI that no requirement declares. What it shows
 * instead is named counts and eight dimension verdicts, each carrying the question it
 * answers — so the reader can see *which* question failed rather than a single bad grade.
 */

const COUNT_ROWS: readonly { key: keyof QualityReport['counts']; label: string }[] = [
  { key: 'fields', label: 'Inputs assessed' },
  { key: 'usable', label: 'Required and usable' },
  { key: 'missing', label: 'Missing' },
  { key: 'assumed', label: 'Assumed' },
  { key: 'stale', label: 'Out of date' },
  { key: 'invalid', label: 'Invalid' },
  { key: 'conflicting', label: 'Conflicting' },
];

/** The eight dimensions, as a grid of verdicts. Shared with the readiness panel. */
export function DimensionGrid({
  dimensions,
  className,
}: {
  dimensions: readonly DimensionAssessment[];
  className?: string;
}) {
  return (
    <div className={className ?? 'space-y-2'}>
      <h4 className="text-body font-medium text-text">Dimensions</h4>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" role="list">
        {dimensions.map((dimension) => (
          <CardTile key={dimension.dimension} className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-body font-medium text-text">
                {dimensionLabel(dimension.dimension)}
              </span>
              <DataQualityBadge
                kind="verdict"
                value={dimension.verdict}
                detail={dimension.codes.length > 0 ? `Codes: ${dimension.codes.join(', ')}.` : ''}
              />
            </div>
            <p className="text-caption text-text-faint">{dimension.question}</p>
          </CardTile>
        ))}
      </ul>
    </div>
  );
}

export interface InputQualitySummaryProps {
  report: QualityReport;
  /** The context version the report was computed from, so it is reproducible. */
  contextVersion: number | null;
  /** False when the user has declared nothing at all. */
  contextSet: boolean;
  /** When the assessment was produced, as the server stamped it. */
  asOf?: string;
  className?: string;
}

export function InputQualitySummary({
  report,
  contextVersion,
  contextSet,
  asOf,
  className,
}: InputQualitySummaryProps) {
  return (
    <section className={className ?? 'space-y-4'} aria-label="Input quality summary">
      <header className="flex flex-wrap items-center gap-1.5">
        <Info size={16} aria-hidden className="text-text-muted" />
        <h3 className="text-body font-medium text-text">How good are the declared inputs?</h3>
        <Badge tone={contextSet ? 'neutral' : 'outline'}>
          {contextSet ? `Context version ${contextVersion ?? '—'}` : 'Nothing declared yet'}
        </Badge>
        {asOf === undefined ? null : (
          <span className="text-caption text-text-faint">
            assessed {new Date(asOf).toLocaleString()}
          </span>
        )}
        <Badge tone="outline">No score — verdicts and named counts only</Badge>
      </header>

      {contextSet ? null : (
        <p className="text-body text-text-muted">
          You have not declared a trading context yet, so every input below is legitimately absent.
          This report describes that empty context rather than a shortlist of things you did wrong.
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {COUNT_ROWS.map((row) => (
          <CardTile key={row.key}>
            <p className="text-caption text-text-muted">{row.label}</p>
            <p className="text-h3 font-semibold tabular-nums text-text">{report.counts[row.key]}</p>
          </CardTile>
        ))}
      </div>

      <DimensionGrid dimensions={report.dimensions} />

      <p className="text-caption text-text-faint">{report.note}</p>
    </section>
  );
}
