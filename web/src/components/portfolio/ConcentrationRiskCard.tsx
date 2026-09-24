import { AlertTriangle, Gauge } from 'lucide-react';
import type { PortfolioInsight, WeightSet } from '@shared/portfolio/model';
import { Badge } from '../Badge';
import { Card, CardContent, CardTile } from '../Card';
import { cn } from '../../lib/cn';
import { formatPercent, insightSeverityLabel, insightSeverityTone } from './labels';

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
        <span className="text-body-sm font-medium text-text">{title}</span>
        <Badge tone="outline">
          {set.basis === 'market-value' ? 'share of market value' : 'share of declared weight'}
        </Badge>
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {(
          [
            ['Largest single', formatPercent(set.top1Percent), 'Top position'],
            ['Top three', formatPercent(set.top3Percent), 'Three largest combined'],
            ['Top five', formatPercent(set.top5Percent), 'Five largest combined'],
            ['Effective positions', set.effectivePositions.toFixed(2), '1 / HHI'],
            ['HHI', set.hhi.toFixed(3), 'Herfindahl–Hirschman index, 0–1'],
            [
              'Positions in set',
              String(set.positions),
              `Covering ${formatPercent(set.coveragePercent)}`,
            ],
          ] as const
        ).map(([label, value, hint]) => (
          <div key={label} className="rounded-[var(--radius-control)] bg-surface px-2 py-1.5">
            <dt className="text-caption text-text-muted">{label}</dt>
            <dd className="text-body-sm font-semibold tabular-nums text-text">{value}</dd>
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
      <CardContent className="space-y-4 pt-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Gauge size={16} aria-hidden className="text-text-muted" />
          <h3 className="text-body font-medium text-text">Concentration</h3>
          {insight === null ? (
            <Badge tone="outline">no concentration observation was made</Badge>
          ) : (
            <Badge tone={insightSeverityTone(insight.severity)}>
              engine verdict: {insightSeverityLabel(insight.severity)}
            </Badge>
          )}
        </div>

        {sets.length === 0 ? (
          <p className="text-body-sm text-text-muted">
            No population of shares could be formed, so no concentration figure exists. The gaps
            panel says what is missing, rather than this card showing a concentration of zero.
          </p>
        ) : (
          <div className={cn('grid gap-3', sets.length > 1 ? 'lg:grid-cols-2' : '')}>
            {sets.map((set) => (
              <Panel key={set.basis} set={set} title="Concentration" />
            ))}
          </div>
        )}

        {insight === null ? null : (
          <div className="space-y-1">
            <p className="text-body-sm text-text-muted">{insight.explanation}</p>
            <div className="flex flex-wrap gap-1.5">
              {insight.metrics.map((metric) => (
                <Badge key={metric.label} tone="neutral">
                  {metric.label}
                  <span className="tabular-nums">{metric.value}</span>
                </Badge>
              ))}
            </div>
          </div>
        )}

        <p className="inline-flex items-start gap-1.5 text-caption text-text-muted">
          <AlertTriangle size={13} aria-hidden className="mt-0.5 shrink-0 text-warning" />
          <span>
            A concentration figure states how much of the composition sits in one place. It is an
            observation about what you declared, not a recommendation to change it, and it says
            nothing about whether that position is a good one.
          </span>
        </p>
      </CardContent>
    </Card>
  );
}
