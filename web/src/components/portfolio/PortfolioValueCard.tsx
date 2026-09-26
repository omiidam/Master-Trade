import { Coins, TriangleAlert } from 'lucide-react';
import type { PortfolioMetrics } from '@shared/portfolio/model';
import { Badge } from '../Badge';
import { Card, CardContent, CardHeader, CardTile, CardTitle } from '../Card';
import { formatMoney, formatSignedPercent } from './labels';
import { msg } from '../../i18n/index.js';

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
      <CardHeader divider>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Coins size={16} aria-hidden className="text-text-muted" />
          <CardTitle>{msg('portfolio.portfolioValue')}</CardTitle>
          <Badge tone={metrics.valuationComplete ? 'success' : 'warning'}>
            {metrics.valuationComplete ? 'every position valued' : 'incomplete valuation'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {priced === 0 ? (
          <CardTile space="roomy">
            <p className="text-body text-text">{msg('portfolio.noPositionHasBothAQuantity')}</p>
            <p className="text-caption text-text-muted">
              {msg('portfolio.thisIsNotAPortfolioWorth')}
            </p>
          </CardTile>
        ) : (
          <div className="space-y-1">
            <p className="text-caption text-text-muted">
              {msg('portfolio.marketValue')}
              {totals.marketValue === null ? ' by currency' : ''}
            </p>
            {totals.marketValue === null ? null : (
              <p className="text-h1 font-semibold num text-text">
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
            <p className="inline-flex items-start gap-1.5 text-body text-warning">
              <TriangleAlert size={14} aria-hidden className="mt-0.5 shrink-0" />
              <span>{msg('portfolio.thePricedPositionsAreNotAll')}</span>
            </p>
            <ul className="grid gap-2 sm:grid-cols-2" role="list">
              {totals.byCurrency.map((group) => (
                <CardTile key={group.currency}>
                  <p className="text-caption text-text-muted">
                    {group.currency} · {group.positions} {msg('portfolio.position')}
                    {group.positions === 1 ? '' : 's'}
                  </p>
                  <p className="text-h3 font-semibold num text-text">
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
                msg('portfolio.costBasis'),
                formatMoney(totals.costBasis, metrics.baseCurrency),
                `${totals.costedPositions} position(s) with an entry price`,
              ],
              [
                msg('portfolio.unrealisedPL'),
                formatMoney(totals.unrealisedPnl, metrics.baseCurrency),
                `${totals.pnlPositions} position(s) where both sides exist`,
              ],
              [
                msg('portfolioValueCard.unrealisedReturn'),
                totals.unrealisedReturnPercent === null
                  ? '—'
                  : formatSignedPercent(totals.unrealisedReturnPercent),
                metrics.unrealisedComplete
                  ? 'Every priced position also has a cost basis'
                  : 'Some priced positions have no entry price, so this is partial',
              ],
              [
                msg('portfolioValueCard.pricedShare'),
                metrics.coverage.pricedShareOfDeclaredWeightPercent === null
                  ? '—'
                  : `${metrics.coverage.pricedShareOfDeclaredWeightPercent.toFixed(1)}%`,
                msg('portfolioValueCard.ofTheDeclaredWeightsHowMuchThePriced'),
              ],
            ] as const
          ).map(([label, value, hint]) => (
            <CardTile key={label}>
              <dt className="text-caption text-text-muted">{label}</dt>
              <dd className="text-body font-semibold num text-text">{value}</dd>
              <p className="text-caption text-text-faint">{hint}</p>
            </CardTile>
          ))}
        </dl>

        {metrics.assumptions.length > 0 ? (
          <div className="space-y-1">
            <h4 className="text-body font-medium text-text">
              {msg('portfolio.whatTheseFiguresRestOn')}
            </h4>
            <ul className="list-disc space-y-1 ps-5 text-body text-text-muted" role="list">
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
