import { Badge } from '../Badge';
import { cn } from '../../lib/cn';
import {
  assetClassLabel,
  describePriceAge,
  formatMoney,
  formatPercent,
  formatSignedPercent,
  issueMeaning,
  issueTone,
} from './labels';
import type { PortfolioMetrics, PositionMetrics } from '@shared/portfolio/model';
import { CardTile } from '../Card';

/**
 * Every position, with what could be computed about it and what could not.
 *
 * The column order is the order the engine works in — what was declared, what it was worth,
 * what it cost, what the difference is, and which share of the whole it took — so a reader
 * following left to right sees each figure after the inputs it rested on.
 *
 * Three states are visible per row rather than hidden behind a rollup:
 *
 *   - **an em dash** means the figure does not exist, and the row's findings say why (absent,
 *     malformed or untrustworthy are three different codes);
 *   - **`computedWeightPercent`** is present only when every priced position shares one
 *     currency, because a share of a total that could not be formed is not a share;
 *   - **`declaredWeightPercent`** is the user's own number and is shown beside it, never
 *     merged into it. A concentration figure over a mixture of the two would be a number
 *     nobody could check.
 */
export interface HoldingsTableProps {
  metrics: PortfolioMetrics;
  className?: string;
}

function Row({ position }: { position: PositionMetrics }) {
  const priceCurrency = position.currency;
  const tone =
    position.marketValue === null ? 'text-text-faint' : 'text-text tabular-nums font-medium';

  return (
    <tr className="border-b border-border last:border-0 align-top">
      <th scope="row" className="py-3 pr-3 text-left">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-body-sm text-text">{position.symbol}</span>
          <span className="flex flex-wrap items-center gap-1">
            <Badge tone="neutral">{assetClassLabel(position.assetClass)}</Badge>
            <Badge tone="outline">{position.currency}</Badge>
          </span>
        </div>
      </th>

      <td className={cn('py-3 pr-3', tone)}>{formatMoney(position.marketValue, priceCurrency)}</td>
      <td className="py-3 pr-3 tabular-nums text-text-muted">
        {formatMoney(position.costBasis, priceCurrency)}
      </td>
      <td className="py-3 pr-3">
        <div className="flex flex-col">
          <span
            className={cn(
              'tabular-nums',
              position.unrealisedPnl === null
                ? 'text-text-faint'
                : position.unrealisedPnl > 0
                  ? 'text-success'
                  : position.unrealisedPnl < 0
                    ? 'text-danger'
                    : 'text-text-muted',
            )}
          >
            {formatMoney(position.unrealisedPnl, priceCurrency)}
          </span>
          {position.unrealisedReturnPercent === null ? null : (
            <span className="text-caption text-text-faint tabular-nums">
              {formatSignedPercent(position.unrealisedReturnPercent)}
            </span>
          )}
        </div>
      </td>

      <td className="py-3 pr-3">
        <div className="flex flex-col">
          <span className="tabular-nums text-text-muted">
            {formatPercent(position.declaredWeightPercent)}
          </span>
          <span className="text-caption text-text-faint tabular-nums">
            {position.computedWeightPercent === null
              ? 'no computed share'
              : `${formatPercent(position.computedWeightPercent)} computed`}
          </span>
        </div>
      </td>

      <td className="py-3 pr-3">
        <div className="flex flex-col gap-0.5">
          <span className="tabular-nums text-text-muted">
            {position.quantity === null ? '—' : String(position.quantity)}
          </span>
          <span className="text-caption text-text-faint">
            {position.basis === null ? 'no valuation basis' : position.basis}
          </span>
        </div>
      </td>

      <td className="py-3">
        <div className="flex flex-col gap-1">
          {position.findings.length === 0 ? (
            <Badge tone="success">complete</Badge>
          ) : (
            position.findings.map((code) => (
              <Badge key={code} tone={issueTone(code)}>
                {issueMeaning(code)}
              </Badge>
            ))
          )}
          {position.priceAgeHours === null ? null : (
            <span className="text-caption text-text-faint">
              price {describePriceAge(position.priceAgeHours)}
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

export function HoldingsTable({ metrics, className }: HoldingsTableProps) {
  if (metrics.positions.length === 0) {
    return (
      <CardTile space="roomy" className={cn('', className)}>
        <p className="text-body-sm text-text">No positions to show.</p>
        <p className="text-caption text-text-muted">
          Nothing has been declared for this account yet. Nothing is displayed in place of a
          holding: an illustrative row would be a factual claim about somebody's money.
        </p>
      </CardTile>
    );
  }

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full min-w-[56rem] border-collapse text-body-sm">
        <caption className="sr-only">
          Declared positions with the figures computed from each one
        </caption>
        <thead>
          <tr className="border-b border-border text-left">
            {[
              'Position',
              'Market value',
              'Cost basis',
              'Unrealised P/L',
              'Weight',
              'Quantity',
              'Findings',
            ].map((heading) => (
              <th
                key={heading}
                scope="col"
                className="py-2 pr-3 text-caption font-medium text-text-muted"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metrics.positions.map((position) => (
            <Row key={position.id} position={position} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
