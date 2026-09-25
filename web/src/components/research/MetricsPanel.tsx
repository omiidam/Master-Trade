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
import { msg } from '../../i18n/index.js';

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
            <CardTitle className="text-body">{msg('research.performanceMetrics')}</CardTitle>
            <CardDescription>{msg('research.nothingMeasuredYet')}</CardDescription>
          </div>
          <Badge tone="outline">{msg('research.noEvaluation')}</Badge>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={<BarChart3 size={22} aria-hidden />}
            title={msg('research.noEvaluationAttached')}
            description={msg('metricsPanel.metricsAppearOnceADeterministicEvaluationHasRun')}
            hint={msg('metricsPanel.zeroesAreNeverShownInPlaceOfA')}
          />
        </CardContent>
      </Card>
    );
  }

  const tiles: readonly { id: string; label: string; value: string; hint: ReactNode }[] = [
    {
      id: 'sample',
      label: msg('metricsPanel.sampleSize'),
      value: String(metrics.sampleSize),
      hint: (
        <span className="inline-flex items-center gap-1.5">
          <Users size={12} aria-hidden />
          {msg('research.tradesInTheEvaluationSet')}
        </span>
      ),
    },
    {
      id: 'win-rate',
      label: msg('journal.winRate'),
      value: formatPercent(metrics.winRatePct, 1),
      hint: (
        <span className="inline-flex items-center gap-1.5">
          <Percent size={12} aria-hidden />
          <Tooltip content={msg('metricsPanel.aHighWinRateWithNegativeAverageR')}>
            <span>{msg('research.misleadingOnItsOwn')}</span>
          </Tooltip>
        </span>
      ),
    },
    {
      id: 'average-r',
      label: msg('journal.averageR'),
      value: `${metrics.averageR > 0 ? '+' : ''}${metrics.averageR.toFixed(2)}`,
      hint: (
        <span className="inline-flex items-center gap-1.5">
          <Gauge size={12} aria-hidden />
          {msg('research.meanOutcomeInRiskUnits')}
        </span>
      ),
    },
    {
      id: 'drawdown',
      label: msg('metricsPanel.maxDrawdown'),
      value: `${metrics.maxDrawdownR.toFixed(1)}R`,
      hint: (
        <span className="inline-flex items-center gap-1.5">
          <TrendingDown size={12} aria-hidden />
          {msg('research.worstPeakToTroughExcursion')}
        </span>
      ),
    },
    {
      id: 'confidence',
      label: msg('quality.dimension.confidence'),
      value: formatPercent(metrics.confidencePct, 0),
      hint: (
        <span className="inline-flex items-center gap-1.5">
          <BarChart3 size={12} aria-hidden />
          {msg('research.aboutThisSampleNotTheFuture')}
        </span>
      ),
    },
  ];

  return (
    <Card surface="metric" className={className}>
      <CardHeader divider>
        <div>
          <CardTitle className="text-body">{msg('research.performanceMetrics')}</CardTitle>
          <CardDescription>{msg('research.deterministicOutputOverAFixedData')}</CardDescription>
        </div>
        <Tooltip content={msg('metricsPanel.confidenceDescribesTheSampleItIsNotA')}>
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
