import { BarChart3, Gauge, Percent, TrendingDown, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import type { DataProvenance } from '@shared/marketdata/provider';
import { cn } from '../../lib/cn';
import { formatPercent } from '../../lib/format';
import { Badge } from '../Badge';
import { Card, CardContent, CardDescription, CardHeader, CardTile, CardTitle } from '../Card';
import { EmptyState } from '../EmptyState';
import { ProvenanceBanner } from '../ProvenanceBanner';
import { Tooltip } from '../Tooltip';

export interface ResearchMetrics {
  sampleSize: number;
  winRatePct: number;
  averageR: number;
  maxDrawdownR: number;
  confidencePct: number;
}

export interface MetricsPanelProps {
  metrics: ResearchMetrics | null;
  /** Provenance of the numbers. Absent when they are not a measured result. */
  provenance?: DataProvenance;
  sourceRef?: string;
  updatedAt?: string;
  /** Caveat text shown under the tiles; defaults to the shared confidence caveat. */
  caveat?: string;
  className?: string;
  columns?: 2 | 3;
}

/**
 * Evaluation metrics.
 *
 * Every tile names its own meaning and its own limit, because these five numbers
 * are the easiest thing in the product to over-read: a 58% win rate with negative
 * average R is a losing strategy, and a sample of 38 trades is not a result. When
 * there are no metrics the panel says so rather than showing zeroes, which would
 * read as "measured and flat".
 */
export function MetricsPanel({
  metrics,
  provenance,
  sourceRef,
  updatedAt,
  caveat,
  className,
  columns = 3,
}: MetricsPanelProps) {
  if (!metrics) {
    return (
      <Card surface="metric" className={className}>
        <CardHeader divider>
          <div>
            <CardTitle className="text-body">Performance metrics</CardTitle>
            <CardDescription>Nothing measured yet</CardDescription>
          </div>
          <Badge tone="outline">no evaluation</Badge>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={<BarChart3 size={22} aria-hidden />}
            title="No evaluation attached"
            description="Metrics appear once a deterministic evaluation has run over a fixed data set. This experiment has not been evaluated, so there are no numbers to show."
            hint="Zeroes are never shown in place of a missing measurement."
          />
        </CardContent>
      </Card>
    );
  }

  const tiles: readonly { id: string; label: string; value: string; hint: ReactNode }[] = [
    {
      id: 'sample',
      label: 'Sample size',
      value: String(metrics.sampleSize),
      hint: (
        <span className="inline-flex items-center gap-1.5">
          <Users size={12} aria-hidden />
          trades in the evaluation set
        </span>
      ),
    },
    {
      id: 'win-rate',
      label: 'Win rate',
      value: formatPercent(metrics.winRatePct, 1),
      hint: (
        <span className="inline-flex items-center gap-1.5">
          <Percent size={12} aria-hidden />
          <Tooltip content="A high win rate with negative average R still loses money. Expectancy is the number that matters.">
            <span>misleading on its own</span>
          </Tooltip>
        </span>
      ),
    },
    {
      id: 'average-r',
      label: 'Average R',
      value: `${metrics.averageR > 0 ? '+' : ''}${metrics.averageR.toFixed(2)}`,
      hint: (
        <span className="inline-flex items-center gap-1.5">
          <Gauge size={12} aria-hidden />
          mean outcome in risk units
        </span>
      ),
    },
    {
      id: 'drawdown',
      label: 'Max drawdown',
      value: `${metrics.maxDrawdownR.toFixed(1)}R`,
      hint: (
        <span className="inline-flex items-center gap-1.5">
          <TrendingDown size={12} aria-hidden />
          worst peak-to-trough excursion
        </span>
      ),
    },
    {
      id: 'confidence',
      label: 'Confidence',
      value: formatPercent(metrics.confidencePct, 0),
      hint: (
        <span className="inline-flex items-center gap-1.5">
          <BarChart3 size={12} aria-hidden />
          about this sample, not the future
        </span>
      ),
    },
  ];

  return (
    <Card surface="metric" className={className}>
      <CardHeader divider>
        <div>
          <CardTitle className="text-body">Performance metrics</CardTitle>
          <CardDescription>
            Deterministic output over a fixed data set — never a model estimate
          </CardDescription>
        </div>
        <Tooltip content="Confidence describes the sample. It is not a probability about the next trade.">
          <Badge tone={metrics.confidencePct >= 70 ? 'primary' : 'warning'}>
            {metrics.confidencePct >= 70 ? 'above bar' : 'below bar'}
          </Badge>
        </Tooltip>
      </CardHeader>

      <CardContent className="space-y-3">
        {provenance && sourceRef && updatedAt ? (
          <ProvenanceBanner provenance={provenance} source={sourceRef} updatedAt={updatedAt} />
        ) : null}

        <dl
          className={cn('grid gap-2', columns === 2 ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-3')}
        >
          {tiles.map((tile) => (
            <CardTile key={tile.id}>
              <dt className="text-caption text-text-faint">{tile.label}</dt>
              <dd className="num mt-1 text-figure text-text">{tile.value}</dd>
              <dd className="mt-1.5 text-caption text-text-faint">{tile.hint}</dd>
            </CardTile>
          ))}
        </dl>

        <p className="text-caption text-text-muted">
          {caveat ??
            'Confidence is a statement about the sample, not about the future. A result below the minimum sample size is a reason to keep testing, not a reason to trade it.'}
        </p>
      </CardContent>
    </Card>
  );
}
