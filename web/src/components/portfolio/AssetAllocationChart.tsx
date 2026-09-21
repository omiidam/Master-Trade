import type { AllocationBucket, WeightSet } from '@shared/portfolio/model';
import { Badge } from '../Badge';
import { Card, CardContent } from '../Card';
import { cn } from '../../lib/cn';
import { formatPercent } from './labels';

/**
 * One population of shares, drawn.
 *
 * The whole component exists because there are **two** populations and neither is a hybrid.
 * `basis` says what the shares are shares *of* — declared weights, or market values — and it
 * is printed above the bars rather than in a tooltip, because a concentration figure over a
 * mixture of the two would be a number nobody could check. A surface that merged them would
 * look tidier and mean less.
 *
 * `totalPercent` is shown beside the coverage for the same reason: declared weights that do
 * not add up to a whole portfolio are a fact a reader needs *before* trusting the shares, not
 * a footnote afterwards.
 *
 * No colour encodes "good" or "bad". A large allocation is not a mistake, so the bars are one
 * tone and the reading is left to the numbers and the concentration card.
 */
export interface AssetAllocationChartProps {
  weights: WeightSet | null;
  /** What the shares are of, in the product's own words. */
  title: string;
  /** The dimension being broken down: asset class or currency. */
  dimension: 'assetClass' | 'currency';
  className?: string;
}

function bars(set: WeightSet, dimension: 'assetClass' | 'currency'): readonly AllocationBucket[] {
  return dimension === 'assetClass' ? set.byAssetClass : set.byCurrency;
}

export function AssetAllocationChart({
  weights,
  title,
  dimension,
  className,
}: AssetAllocationChartProps) {
  if (weights === null) {
    return (
      <Card className={className}>
        <CardContent className="space-y-2 pt-4">
          <h3 className="text-body font-medium text-text">{title}</h3>
          <p className="text-body-sm text-text-muted">
            No shares of this kind could be formed, so nothing is drawn here. That is the honest
            answer rather than a chart of zeroes: every bar would imply a measurement that does not
            exist.
          </p>
        </CardContent>
      </Card>
    );
  }

  const buckets = bars(weights, dimension);

  return (
    <Card className={className}>
      <CardContent className="space-y-4 pt-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <h3 className="text-body font-medium text-text">{title}</h3>
          <Badge tone="outline">
            {weights.basis === 'market-value'
              ? 'share of market value'
              : 'share of declared weight'}
          </Badge>
          <Badge tone={weights.positions === 0 ? 'warning' : 'neutral'}>
            {weights.positions} position{weights.positions === 1 ? '' : 's'}
          </Badge>
          <Badge tone={Math.abs(weights.totalPercent - 100) <= 0.5 ? 'neutral' : 'warning'}>
            total {formatPercent(weights.totalPercent)}
          </Badge>
        </div>

        <p className="text-caption text-text-faint">
          Coverage: {formatPercent(weights.coveragePercent)} of the declared document. A share here
          is a share of this population only — never of a mixture of declared weights and market
          values.
        </p>

        {buckets.length === 0 ? (
          <p className="text-body-sm text-text-muted">
            Nothing in this population could be grouped, so there is no breakdown to show.
          </p>
        ) : (
          <ul className="space-y-2" role="list">
            {buckets.map((bucket) => (
              <li key={bucket.key} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-body-sm text-text">{bucket.label}</span>
                  <span className="text-caption tabular-nums text-text-muted">
                    {formatPercent(bucket.weightPercent)} · {bucket.positions} position
                    {bucket.positions === 1 ? '' : 's'}
                  </span>
                </div>
                <div
                  className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
                  role="img"
                  aria-label={`${bucket.label}: ${formatPercent(bucket.weightPercent)} of the ${weights.basis === 'market-value' ? 'market value' : 'declared weight'}`}
                >
                  <div
                    className="h-full rounded-full bg-primary/70"
                    style={{ width: `${Math.max(0, Math.min(100, bucket.weightPercent))}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}

        {weights.largest.length > 0 ? (
          <div className="space-y-2">
            <h4 className="text-body-sm font-medium text-text">Largest shares</h4>
            <ul className="flex flex-wrap gap-1.5" role="list">
              {weights.largest.map((share) => (
                <li key={share.id}>
                  <Badge tone="neutral">
                    <span className="font-mono">{share.symbol}</span>
                    <span className="tabular-nums">{formatPercent(share.weightPercent)}</span>
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * The two populations side by side.
 *
 * Rendered as two charts rather than one, because the interesting fact is usually that they
 * disagree: declared weights are what the user intended, market values are what the account
 * turned into. Showing one where the other exists would answer a question nobody asked.
 */
export interface AllocationPairProps {
  byMarketValue: WeightSet | null;
  byDeclaredWeight: WeightSet | null;
  dimension: 'assetClass' | 'currency';
  className?: string;
}

export function AllocationPair({
  byMarketValue,
  byDeclaredWeight,
  dimension,
  className,
}: AllocationPairProps) {
  const both = byMarketValue !== null && byDeclaredWeight !== null;

  return (
    <div className={cn('space-y-3', className)}>
      {both ? (
        <p className="text-caption text-text-faint">
          Two populations are shown because both can be formed. Where they disagree, the difference
          is between what you declared and what the prices say — not an error in either.
        </p>
      ) : null}
      <div className={cn('grid gap-3', both ? 'lg:grid-cols-2' : '')}>
        <AssetAllocationChart
          weights={byMarketValue}
          title="By market value"
          dimension={dimension}
        />
        <AssetAllocationChart
          weights={byDeclaredWeight}
          title="By declared weight"
          dimension={dimension}
        />
      </div>
    </div>
  );
}
