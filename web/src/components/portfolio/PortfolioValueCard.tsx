import { Coins, TriangleAlert } from 'lucide-react';
import type { PortfolioMetrics } from '@shared/portfolio/model';
import { Badge } from '../Badge';
import { Card, CardContent, CardTile } from '../Card';
import { formatMoney, formatSignedPercent } from './labels';

/**
 * What the composition is worth — and only when it can be said.
 *
 * A single total exists **only** when every priced position sits in the base currency:
 * `marketValue` is `null` otherwise, because no rate source is wired and a converted figure
 * would be a number with no meaning the system could defend. This card therefore renders
 * three mutually exclusive states rather than one number with a caveat:
 *
 *   1. a total, with the count of positions behind it;
 *   2. no total, with the per-currency groups that *can* be summed;
 *   3. nothing priced at all, with the reason — which is a data-quality answer, not an
 *      error, so it is stated plainly instead of being shown as zero.
 *
 * `null` is never rendered as `0`. The two mean opposite things: one says the figure does
 * not exist, the other says it is nothing.
 */
export interface PortfolioValueCardProps {
  metrics: PortfolioMetrics;
  className?: string;
}

export function PortfolioValueCard({ metrics, className }: PortfolioValueCardProps) {
  const { totals } = metrics;
  const priced = totals.pricedPositions;
  const unsummable = totals.marketValue === null && totals.byCurrency.length > 0;

  return (
    <Card className={className}>
      <CardContent className="space-y-4 pt-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Coins size={16} aria-hidden className="text-text-muted" />
          <h3 className="text-body font-medium text-text">Portfolio value</h3>
          <Badge tone={metrics.valuationComplete ? 'success' : 'warning'}>
            {metrics.valuationComplete ? 'every position valued' : 'incomplete valuation'}
          </Badge>
        </div>

        {priced === 0 ? (
          <CardTile space="roomy">
            <p className="text-body-sm text-text">
              No position has both a quantity and a current price, so there is no value to report.
            </p>
            <p className="text-caption text-text-muted">
              This is not a portfolio worth nothing — it is a composition the product cannot value
              yet. A zero here would have been a factual claim, which is why none is shown.
            </p>
          </CardTile>
        ) : (
          <div className="space-y-1">
            <p className="text-caption text-text-muted">
              Market value{totals.marketValue === null ? ' by currency' : ''}
            </p>
            {totals.marketValue === null ? null : (
              <p className="text-h1 font-semibold tabular-nums text-text">
                {formatMoney(totals.marketValue, metrics.baseCurrency)}
              </p>
            )}
            <p className="text-caption text-text-faint">
              {`quantity × price, summed over ${priced} position${priced === 1 ? '' : 's'} in ${metrics.baseCurrency}`}
            </p>
          </div>
        )}

        {unsummable ? (
          <div className="space-y-2">
            <p className="inline-flex items-start gap-1.5 text-body-sm text-warning">
              <TriangleAlert size={14} aria-hidden className="mt-0.5 shrink-0" />
              <span>
                The priced positions are not all in one currency, so a single total is not produced.
                Each currency is reported on its own: converting them would need a rate, and no rate
                source is wired.
              </span>
            </p>
            <ul className="grid gap-2 sm:grid-cols-2" role="list">
              {totals.byCurrency.map((group) => (
                <CardTile key={group.currency}>
                  <p className="text-caption text-text-muted">
                    {group.currency} · {group.positions} position
                    {group.positions === 1 ? '' : 's'}
                  </p>
                  <p className="text-h3 font-semibold tabular-nums text-text">
                    {formatMoney(group.marketValue, group.currency)}
                  </p>
                </CardTile>
              ))}
            </ul>
          </div>
        ) : null}

        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              [
                'Cost basis',
                formatMoney(totals.costBasis, metrics.baseCurrency),
                `${totals.costedPositions} position(s) with an entry price`,
              ],
              [
                'Unrealised P/L',
                formatMoney(totals.unrealisedPnl, metrics.baseCurrency),
                `${totals.pnlPositions} position(s) where both sides exist`,
              ],
              [
                'Unrealised return',
                totals.unrealisedReturnPercent === null
                  ? '—'
                  : formatSignedPercent(totals.unrealisedReturnPercent),
                metrics.unrealisedComplete
                  ? 'Every priced position also has a cost basis'
                  : 'Some priced positions have no entry price, so this is partial',
              ],
              [
                'Priced share',
                metrics.coverage.pricedShareOfDeclaredWeightPercent === null
                  ? '—'
                  : `${metrics.coverage.pricedShareOfDeclaredWeightPercent.toFixed(1)}%`,
                'Of the declared weights, how much the priced positions account for',
              ],
            ] as const
          ).map(([label, value, hint]) => (
            <CardTile key={label}>
              <dt className="text-caption text-text-muted">{label}</dt>
              <dd className="text-body font-semibold tabular-nums text-text">{value}</dd>
              <p className="text-caption text-text-faint">{hint}</p>
            </CardTile>
          ))}
        </dl>

        {metrics.assumptions.length > 0 ? (
          <div className="space-y-1">
            <h4 className="text-body-sm font-medium text-text">What these figures rest on</h4>
            <ul className="list-disc space-y-1 pl-5 text-body-sm text-text-muted" role="list">
              {metrics.assumptions.map((assumption) => (
                <li key={assumption.id}>
                  {assumption.statement}
                  <span className="text-caption text-text-faint"> ({assumption.origin})</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="text-caption text-text-faint">{metrics.note}</p>
      </CardContent>
    </Card>
  );
}
