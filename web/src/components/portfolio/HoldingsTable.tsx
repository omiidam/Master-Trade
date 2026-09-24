import { Badge } from '../Badge';
import {
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableRowHeaderCell,
} from '../Table';
import { Trend } from '../Trend';
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

  return (
    <TableRow className="align-top">
      <TableRowHeaderCell>
        <div className="flex flex-col gap-1">
          <span className="num text-body text-text">{position.symbol}</span>
          <span className="flex flex-wrap items-center gap-1">
            <Badge tone="neutral">{assetClassLabel(position.assetClass)}</Badge>
            <Badge tone="outline">{position.currency}</Badge>
          </span>
        </div>
      </TableRowHeaderCell>

      <TableCell numeric tone={position.marketValue === null ? 'faint' : 'default'}>
        {formatMoney(position.marketValue, priceCurrency)}
      </TableCell>
      <TableCell numeric tone="muted">
        {formatMoney(position.costBasis, priceCurrency)}
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          {/* The figure and its tone come from `Trend`, so a row's loss is stated the same way
              here as everywhere else in the product — with a glyph as well as a colour. */}
          <Trend
            value={position.unrealisedPnl}
            format={(value) => formatMoney(value, priceCurrency)}
            unavailable="not priced"
            size="body"
          />
          {position.unrealisedReturnPercent === null ? null : (
            <span className="num text-caption text-text-faint">
              {formatSignedPercent(position.unrealisedReturnPercent)}
            </span>
          )}
        </div>
      </TableCell>

      <TableCell>
        <div className="flex flex-col">
          <span className="num text-text-muted">
            {formatPercent(position.declaredWeightPercent)}
          </span>
          <span className="num text-caption text-text-faint">
            {position.computedWeightPercent === null
              ? 'no computed share'
              : `${formatPercent(position.computedWeightPercent)} computed`}
          </span>
        </div>
      </TableCell>

      <TableCell>
        <div className="flex flex-col gap-0.5">
          <span className="num text-text-muted">
            {position.quantity === null ? '—' : String(position.quantity)}
          </span>
          <span className="text-caption text-text-faint">
            {position.basis === null ? 'no valuation basis' : position.basis}
          </span>
        </div>
      </TableCell>

      <TableCell>
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
      </TableCell>
    </TableRow>
  );
}

export function HoldingsTable({ metrics, className }: HoldingsTableProps) {
  return (
    // `spacious` rather than the default: a position is a paragraph of figures and its cells carry
    // two lines each, so the compact row height would set the two lines against each other. The
    // table keeps its head when it has no rows, so a reader can still see what a holding would say.
    <Table
      density="spacious"
      minWidth={896}
      label="Declared positions with the figures computed from each one"
      className={cn('text-body', className)}
    >
      <TableHead>
        <TableHeaderCell>Position</TableHeaderCell>
        <TableHeaderCell numeric>Market value</TableHeaderCell>
        <TableHeaderCell numeric>Cost basis</TableHeaderCell>
        <TableHeaderCell>Unrealised P/L</TableHeaderCell>
        <TableHeaderCell>Weight</TableHeaderCell>
        <TableHeaderCell>Quantity</TableHeaderCell>
        <TableHeaderCell>Findings</TableHeaderCell>
      </TableHead>
      <TableBody>
        {metrics.positions.length === 0 ? (
          <TableEmptyRow
            colSpan={7}
            title="No positions to show"
            description="Nothing has been declared for this account yet. Nothing is displayed in place of a holding: an illustrative row would be a factual claim about somebody's money."
          />
        ) : (
          metrics.positions.map((position) => <Row key={position.id} position={position} />)
        )}
      </TableBody>
    </Table>
  );
}
