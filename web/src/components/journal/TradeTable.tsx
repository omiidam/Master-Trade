import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  Inbox,
  RotateCcw,
} from 'lucide-react';
import { Badge } from '../Badge';
import { Button } from '../Button';
import { EmptyState } from '../EmptyState';
import { ErrorState } from '../ErrorState';
import { Tooltip } from '../Tooltip';
import { LoadingState } from './LoadingState';
import { DEFAULT_VISIBLE_COLUMNS, TRADE_COLUMNS, TradeRow, type TradeColumnId } from './TradeRow';
import { cn } from '../../lib/cn';
import { sortTrades } from '../../mock/journal';
import type { JournalTrade, SortDirection, TradeSortKey } from '../../mock/journal';

export interface TradeTableProps {
  trades: readonly JournalTrade[];
  /** Rows before filtering; used to distinguish "no records" from "no matches". */
  totalRecords: number;
  loading?: boolean;
  error?: string | null;
  onResetFilters: () => void;
  onView: (trade: JournalTrade) => void;
  onEdit: (trade: JournalTrade) => void;
  onDuplicate: (trade: JournalTrade) => void;
  onArchive: (trade: JournalTrade) => void;
  onDelete: (trade: JournalTrade) => void;
  onAddReview: (trade: JournalTrade) => void;
  onViewScreenshots: (trade: JournalTrade) => void;
  /** Label for the export action; the export itself is not connected in this phase. */
  onExport?: () => void;
  className?: string;
}

const PAGE_SIZES = [10, 25, 50] as const;

/**
 * The record table.
 *
 * A journal is only useful if a subset of it can be isolated, so sorting, column
 * visibility and paging are here together. Two states are treated as different
 * facts: an empty journal ("no records at all") and a filtered-out journal ("no
 * records match") — the second offers to clear the filters, the first does not
 * pretend the filters are at fault.
 */
export function TradeTable({
  trades,
  totalRecords,
  loading = false,
  error = null,
  onResetFilters,
  onView,
  onEdit,
  onDuplicate,
  onArchive,
  onDelete,
  onAddReview,
  onViewScreenshots,
  onExport,
  className,
}: TradeTableProps) {
  const [sortKey, setSortKey] = useState<TradeSortKey>('openedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [visible, setVisible] = useState<readonly TradeColumnId[]>(DEFAULT_VISIBLE_COLUMNS);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pageSize, setPageSize] = useState<number>(10);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [trades, pageSize]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPickerOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pickerOpen]);

  // Sorting is shared with the rest of the module so the table and any other view
  // cannot disagree about what "sorted by realised R" means.
  const ordered = useMemo(
    () => sortTrades(trades, sortKey, sortDirection),
    [trades, sortKey, sortDirection],
  );

  const pageCount = Math.max(Math.ceil(ordered.length / pageSize), 1);
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * pageSize;
  const rows = ordered.slice(start, start + pageSize);

  const toggleSort = (key: TradeSortKey) => {
    if (key === sortKey) {
      setSortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDirection(key === 'openedAt' ? 'desc' : 'asc');
  };

  const toggleColumn = (id: TradeColumnId) => {
    setVisible((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const orderedColumns = TRADE_COLUMNS.filter((column) => visible.includes(column.id)).map(
    (column) => column.id,
  );

  const toolbar = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">
          {ordered.length} {ordered.length === 1 ? 'record' : 'records'}
        </Badge>
        <Badge tone="outline">
          sorted by {TRADE_COLUMNS.find((column) => column.sortable === sortKey)?.label ?? sortKey}{' '}
          · {sortDirection === 'asc' ? 'ascending' : 'descending'}
        </Badge>
      </div>

      <div className="relative flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-caption text-text-faint">
          Rows
          <select
            aria-label="Rows per page"
            className="h-8 rounded-[var(--radius-control)] border border-border bg-surface-sunken px-2 text-caption text-text"
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => setPickerOpen((value) => !value)}
          aria-expanded={pickerOpen}
          label={pickerOpen ? 'Hide column options' : 'Show column options'}
          leadingIcon={<Columns3 size={14} aria-hidden />}
        >
          Columns
        </Button>

        {onExport ? (
          <Tooltip content="Export is not connected in this phase: no file is written.">
            <Button
              variant="secondary"
              size="sm"
              onClick={onExport}
              label="Export the current view"
              leadingIcon={<Download size={14} aria-hidden />}
            >
              Export
            </Button>
          </Tooltip>
        ) : null}

        {pickerOpen ? (
          <>
            <button
              type="button"
              aria-label="Close column options"
              className="fixed inset-0 z-[var(--z-overlay)] cursor-default"
              onClick={() => setPickerOpen(false)}
            />
            <fieldset
              className={cn(
                'absolute end-0 top-10 z-[var(--z-modal)] w-60 rounded-[var(--radius-control)]',
                'border border-border-strong bg-bg-elevated p-2 shadow-popover',
              )}
            >
              <legend className="px-1 pb-1 text-caption font-semibold text-text-muted">
                Visible columns
              </legend>
              <div className="max-h-64 space-y-0.5 overflow-y-auto">
                {TRADE_COLUMNS.map((column) => (
                  <label
                    key={column.id}
                    className="flex items-center gap-2 rounded-[var(--radius-control)] px-1.5 py-1 text-caption text-text-muted hover:bg-surface-raised"
                  >
                    <input
                      type="checkbox"
                      className="accent-[var(--color-primary)]"
                      checked={visible.includes(column.id)}
                      onChange={() => toggleColumn(column.id)}
                    />
                    <span className="flex-1">{column.label}</span>
                    {column.required ? (
                      <span className="text-caption text-text-faint">core</span>
                    ) : null}
                  </label>
                ))}
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 border-t border-border pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setVisible(DEFAULT_VISIBLE_COLUMNS)}
                  label="Restore default columns"
                >
                  Defaults
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setVisible(TRADE_COLUMNS.map((column) => column.id))}
                  label="Show every column"
                >
                  Show all
                </Button>
              </div>
            </fieldset>
          </>
        ) : null}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className={className}>
        <LoadingState
          label="Reading trades"
          description="Journal records are being read for this view."
          shape="table"
          rows={5}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className={className}>
        <ErrorState
          title="The trade list could not be read"
          description={error}
          code="JOURNAL_READ_FAILED"
          action={
            <Button variant="secondary" size="sm" onClick={onResetFilters} label="Clear filters">
              Clear filters
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <section
      aria-label="Trade history"
      className={cn(
        'space-y-3 rounded-[var(--radius-panel)] border border-border bg-surface p-4 shadow-panel',
        className,
      )}
    >
      {toolbar}

      {ordered.length === 0 ? (
        <EmptyState
          icon={<Inbox size={22} aria-hidden />}
          title={
            totalRecords === 0 ? 'The journal has no records yet' : 'No records match these filters'
          }
          description={
            totalRecords === 0
              ? 'A journal starts empty. Nothing is invented to fill it — the first trade you record will appear here.'
              : 'The filters selected a subset of the journal and that subset is empty. The records are still there.'
          }
          action={
            totalRecords === 0 ? undefined : (
              <Button
                variant="secondary"
                size="sm"
                onClick={onResetFilters}
                label="Clear all trade filters"
                leadingIcon={<RotateCcw size={14} aria-hidden />}
              >
                Clear filters
              </Button>
            )
          }
          hint={
            totalRecords === 0
              ? 'In this phase the store is not connected, so the preview rows come from the mock module.'
              : `${totalRecords} records exist in total.`
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse text-start">
              <caption className="sr-only">
                Trade history with date, symbol, direction, setup, risk, realised R, result, rule
                compliance and status. Each row has a menu of record actions.
              </caption>
              <thead>
                <tr className="border-b border-border-strong">
                  {TRADE_COLUMNS.filter((column) => orderedColumns.includes(column.id)).map(
                    (column) => {
                      const active = column.sortable !== undefined && column.sortable === sortKey;
                      return (
                        <th
                          key={column.id}
                          scope="col"
                          className={cn(
                            'px-3 py-2 text-caption font-semibold tracking-wide text-text-faint uppercase',
                            column.align === 'end' && 'text-end',
                            column.id === 'ref' && 'ps-4',
                          )}
                        >
                          {column.sortable ? (
                            <button
                              type="button"
                              onClick={() => toggleSort(column.sortable as TradeSortKey)}
                              aria-label={`Sort by ${column.label}`}
                              className={cn(
                                'inline-flex items-center gap-1 transition-colors duration-[var(--duration-fast)]',
                                active ? 'text-text' : 'hover:text-text-muted',
                              )}
                            >
                              {column.label}
                              <span aria-hidden className={cn(!active && 'opacity-0')}>
                                {sortDirection === 'asc' ? (
                                  <ArrowUp size={11} />
                                ) : (
                                  <ArrowDown size={11} />
                                )}
                              </span>
                            </button>
                          ) : (
                            column.label
                          )}
                        </th>
                      );
                    },
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((trade) => (
                  <TradeRow
                    key={trade.id}
                    trade={trade}
                    columns={orderedColumns}
                    onView={onView}
                    onEdit={onEdit}
                    onDuplicate={onDuplicate}
                    onArchive={onArchive}
                    onDelete={onDelete}
                    onAddReview={onAddReview}
                    onViewScreenshots={onViewScreenshots}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-caption text-text-faint">
              {start + 1}–{Math.min(start + rows.length, ordered.length)} of {ordered.length}{' '}
              records
              {ordered.length === totalRecords ? '' : ` (filtered from ${totalRecords})`}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
                label="Previous page of trades"
                leadingIcon={<ChevronLeft size={14} aria-hidden />}
              >
                Previous
              </Button>
              <span className="num text-caption text-text-muted">
                {currentPage} / {pageCount}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={currentPage >= pageCount}
                onClick={() => setPage(currentPage + 1)}
                label="Next page of trades"
                trailingIcon={<ChevronRight size={14} aria-hidden />}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
