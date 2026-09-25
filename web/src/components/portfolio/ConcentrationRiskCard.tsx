import { AlertTriangle, Gauge } from 'lucide-react';
import type { PortfolioInsight, WeightSet } from '@shared/portfolio/model';
import { Badge } from '../Badge';
import { Card, CardContent, CardHeader, CardTile, CardTitle } from '../Card';
import { cn } from '../../lib/cn';
import { formatPercent, insightSeverityLabel, insightSeverityTone } from './labels';
import { msg } from '../../i18n/index.js';

/**
 * How concentrated the composition is, in the engine's own units and at the engine's own
 * verdict.
 *
 * Every figure here is the server's — the top shares, the Herfindahl–Hirschman index and the
 * effective position count all arrive computed.
 *
 * **The card does not re-derive a band.** An earlier version of it compared the top share
 * against a threshold copied into the browser, which would have been a second implementation of
 * the engine's rule: the two could disagree, and the disagreement would show as a user reading
 * \"no concentration flagged\" beside an insight that said the opposite. Instead the severity
 * shown here is the one the engine put on its concentration observation, passed in as data. The
 * thresholds themselves live where the rule lives, and the engine writes them into the
 * observation's own metrics.
 *
 * The card states its limits as plainly as its findings:
 *
 *   - **a concentration figure is not a recommendation.** It says how much of one thing there
 *     is, never to sell any of it;
 *   - **the basis is named**, because a figure over declared weights and one over market values
 *     answer different questions;
 *   - **`effectivePositions` is not rounded**, so a figure of 1.4 reads as \"behaves like one and
 *     a half equal positions\" — arithmetic, not a promise about diversification.
 */
export interface ConcentrationRiskCardProps {
  byMarketValue: WeightSet | null;
  byDeclaredWeight: WeightSet | null;
  /** The engine's concentration observation, or `null` when it made none. */
  insight: PortfolioInsight | null;
  className?: string;
}

function Panel({ set, title }: { set: WeightSet; title: string }) {
  return (
    <CardTile space="roomy" className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-body font-medium text-text">{title}</span>
        <Badge tone="outline">
          {set.basis === 'market-value' ? 'share of market value' : 'share of declared weight'}
        </Badge>
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {(
          [
            [
              msg('concentrationRiskCard.largestSingle'),
              formatPercent(set.top1Percent),
              msg('concentrationRiskCard.topPosition'),
            ],
            [
              msg('concentrationRiskCard.topThree'),
              formatPercent(set.top3Percent),
              msg('concentrationRiskCard.threeLargestCombined'),
            ],
            [
              msg('concentrationRiskCard.topFive'),
              formatPercent(set.top5Percent),
              msg('concentrationRiskCard.fiveLargestCombined'),
            ],
            [
              msg('concentrationRiskCard.effectivePositions'),
              set.effectivePositions.toFixed(2),
              '1 / HHI',
            ],
            ['HHI', set.hhi.toFixed(3), msg('concentrationRiskCard.herfindahlHirschmanIndex01')],
            [
              msg('concentrationRiskCard.positionsInSet'),
              String(set.positions),
              `Covering ${formatPercent(set.coveragePercent)}`,
            ],
          ] as const
        ).map(([label, value, hint]) => (
          <div key={label} className="rounded-[var(--radius-control)] bg-surface px-2 py-1.5">
            <dt className="text-caption text-text-muted">{label}</dt>
            <dd className="text-body font-semibold num text-text">{value}</dd>
            <p className="text-caption text-text-faint">{hint}</p>
          </div>
        ))}
      </dl>

      <p className="text-caption text-text-faint">
        {set.basis === 'market-value'
          ? 'Measured from market values, so it moves with prices.'
          : 'Measured from the shares you declared, so it reflects intent rather than prices.'}
      </p>
    </CardTile>
  );
}

export function ConcentrationRiskCard({
  byMarketValue,
  byDeclaredWeight,
  insight,
  className,
}: ConcentrationRiskCardProps) {
  const sets = [byMarketValue, byDeclaredWeight].filter((set): set is WeightSet => set !== null);

  return (
    <Card className={className}>
      <CardHeader divider>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Gauge size={16} aria-hidden className="text-text-muted" />
          <CardTitle>{msg('portfolio.concentration')}</CardTitle>
          {insight === null ? (
            <Badge tone="outline">{msg('portfolio.noConcentrationObservationWasMade')}</Badge>
          ) : (
            <Badge tone={insightSeverityTone(insight.severity)}>
              {msg('portfolio.engineVerdict')} {insightSeverityLabel(insight.severity)}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {sets.length === 0 ? (
          <p className="text-body text-text-muted">
            {msg('portfolio.noPopulationOfSharesCouldBe')}
          </p>
        ) : (
          <div className={cn('grid gap-3', sets.length > 1 ? 'lg:grid-cols-2' : '')}>
            {sets.map((set) => (
              <Panel key={set.basis} set={set} title={msg('portfolio.concentration')} />
            ))}
          </div>
        )}

        {insight === null ? null : (
          <div className="space-y-1">
            <p className="text-body text-text-muted">{insight.explanation}</p>
            <div className="flex flex-wrap gap-1.5">
              {insight.metrics.map((metric) => (
                <Badge key={metric.label} tone="neutral">
                  {metric.label}
                  <span className="num">{metric.value}</span>
                </Badge>
              ))}
            </div>
          </div>
        )}

        <p className="inline-flex items-start gap-1.5 text-caption text-text-muted">
          <AlertTriangle size={13} aria-hidden className="mt-0.5 shrink-0 text-warning" />
          <span>{msg('portfolio.aConcentrationFigureStatesHowMuch')}</span>
        </p>
      </CardContent>
    </Card>
  );
}
