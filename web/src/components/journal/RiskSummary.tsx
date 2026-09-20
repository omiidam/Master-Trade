import { Badge } from '../Badge';
import { cn } from '../../lib/cn';
import { RMultipleIndicator } from './RMultipleIndicator';
import type { JournalTrade } from '../../mock/journal';

function price(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value >= 10 ? value.toFixed(2) : value.toFixed(4);
}

interface Row {
  label: string;
  planned: string;
  actual: string;
  /** A planned/actual pair that differs is highlighted, not silently reconciled. */
  differs: boolean;
}

/**
 * Planned versus actual, side by side.
 *
 * This is the panel the journal exists for. A result on its own says what happened;
 * the pair says whether what happened was what was intended. Every divergence is
 * marked, including the ones that came out better than the plan — a lucky fill is
 * still an unplanned fill, and colouring it green would teach the wrong lesson.
 */
export function RiskSummary({ trade, className }: { trade: JournalTrade; className?: string }) {
  const actual = trade.actual;
  const rows: Row[] = [
    {
      label: 'Entry',
      planned: price(trade.plan.entry),
      actual: price(actual?.entry),
      differs: actual?.entry != null && actual.entry !== trade.plan.entry,
    },
    {
      label: 'Exit',
      planned: price(trade.plan.takeProfit),
      actual: price(actual?.exit),
      differs: actual?.exit != null && actual.exit !== trade.plan.takeProfit,
    },
    {
      label: 'Invalidation',
      planned: price(trade.plan.stopLoss),
      actual: price(actual?.stopLoss),
      differs: actual?.stopLoss != null && actual.stopLoss !== trade.plan.stopLoss,
    },
    {
      label: 'Risk amount',
      planned: trade.plan.riskAmount.toLocaleString('en-US'),
      actual: actual?.riskAmount == null ? '—' : actual.riskAmount.toLocaleString('en-US'),
      differs: actual?.riskAmount != null && actual.riskAmount !== trade.plan.riskAmount,
    },
    {
      label: 'Position size',
      planned: `${trade.plan.positionSize}`,
      actual: '—',
      differs: false,
    },
    {
      label: 'Reward-to-risk',
      planned: `${trade.plan.plannedRr.toFixed(1)} : 1`,
      actual: actual?.actualR == null ? '—' : `${actual.actualR.toFixed(2)}R realised`,
      differs: actual?.actualR != null && Math.abs(actual.actualR - trade.plan.plannedRr) > 0.05,
    },
    {
      label: 'Fees',
      planned: '—',
      actual: actual == null ? '—' : actual.fees.toFixed(2),
      differs: false,
    },
  ];

  const divergences = rows.filter((row) => row.differs).length;

  return (
    <section
      aria-label="Planned versus actual"
      className={cn(
        'rounded-[var(--radius-panel)] border border-border bg-surface p-4 shadow-panel',
        className,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-title font-semibold text-text">Planned versus actual</h3>
          <p className="mt-0.5 text-caption text-text-muted">
            The plan is what was written before entry; the actual column is what the record shows.
          </p>
        </div>
        <Badge tone={divergences === 0 ? 'success' : 'warning'}>
          {divergences === 0
            ? 'executed as planned'
            : `${divergences} ${divergences === 1 ? 'divergence' : 'divergences'}`}
        </Badge>
      </header>

      <table className="mt-3 w-full border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th
              scope="col"
              className="py-1.5 text-start text-caption font-semibold text-text-faint uppercase"
            >
              Measure
            </th>
            <th
              scope="col"
              className="py-1.5 text-end text-caption font-semibold text-text-faint uppercase"
            >
              Planned
            </th>
            <th
              scope="col"
              className="py-1.5 text-end text-caption font-semibold text-text-faint uppercase"
            >
              Actual
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-border last:border-b-0">
              <th scope="row" className="py-2 text-start text-caption font-normal text-text-muted">
                {row.label}
              </th>
              <td className="num py-2 text-end text-caption text-text-muted">{row.planned}</td>
              <td
                className={cn(
                  'num py-2 text-end text-caption',
                  row.differs ? 'text-warning' : 'text-text',
                )}
              >
                {row.actual}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
        <span className="text-caption text-text-muted">Realised result</span>
        <RMultipleIndicator value={actual?.actualR ?? null} planned={trade.plan.plannedRr} />
        {actual?.actualR == null ? (
          <span className="text-caption text-text-faint">
            Unscored: the record has no exit, so there is no realised multiple to show.
          </span>
        ) : null}
      </div>
    </section>
  );
}
