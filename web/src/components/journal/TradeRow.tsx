import { useEffect, useState, type ReactNode } from 'react';
import {
  Archive,
  Copy,
  Eye,
  Image as ImageIcon,
  MessageSquarePlus,
  MoreVertical,
  Pencil,
  Trash2,
} from 'lucide-react';
import { AnchoredMenu, MenuItem } from '../AnchoredMenu';
import { Badge } from '../Badge';
import { Button } from '../Button';
import { TableCell, TableRow, type TableRowAccent } from '../Table';
import { SetupBadge } from './SetupBadge';
import { DirectionBadge } from './DirectionBadge';
import { RMultipleIndicator } from './RMultipleIndicator';
import { RuleComplianceBadge } from './RuleComplianceBadge';
import { cn } from '../../lib/cn';
import { formatTimestamp } from '../../lib/format';
import { MARKET_LABEL, RESULT_LABEL, SESSION_LABEL, STATUS_LABEL } from '../../mock/journal';
import type { JournalTrade, TradeResult, TradeSortKey, TradeStatus } from '../../mock/journal';
import { msg } from '../../i18n/index.js';

export type TradeColumnId =
  | 'ref'
  | 'datetime'
  | 'symbol'
  | 'market'
  | 'direction'
  | 'setup'
  | 'session'
  | 'entry'
  | 'exit'
  | 'stop'
  | 'target'
  | 'risk'
  | 'plannedRr'
  | 'actualR'
  | 'result'
  | 'compliance'
  | 'status'
  | 'actions';

export interface TradeColumn {
  id: TradeColumnId;
  label: string;
  /** Column is a sort key when sortable is set. */
  sortable?: TradeSortKey;
  align?: 'start' | 'end';
  /** Always shown: identity, the outcome, and the row's own actions. */
  required?: boolean;
  /** Hidden by default but available in the column picker. */
  optional?: boolean;
}

export const TRADE_COLUMNS: readonly TradeColumn[] = [
  {
    id: 'ref',
    get label(): string {
      return msg('tradeRow.trade');
    },
    sortable: 'openedAt',
    required: true,
  },
  {
    id: 'datetime',
    get label(): string {
      return msg('tradeRow.dateTime');
    },
    sortable: 'openedAt',
  },
  {
    id: 'symbol',
    get label(): string {
      return msg('tradeForm.symbol');
    },
    sortable: 'symbol',
    required: true,
  },
  {
    id: 'market',
    get label(): string {
      return msg('tradeFilters.market');
    },
    optional: true,
  },
  {
    id: 'direction',
    get label(): string {
      return msg('tradeFilters.direction');
    },
    required: true,
  },
  {
    id: 'setup',
    get label(): string {
      return msg('tradeFilters.setup');
    },
    sortable: 'setupId',
  },
  {
    id: 'session',
    get label(): string {
      return msg('activity.session');
    },
    sortable: 'session',
    optional: true,
  },
  {
    id: 'entry',
    get label(): string {
      return msg('evaluationPanels.entry');
    },
    align: 'end',
  },
  {
    id: 'exit',
    get label(): string {
      return msg('evaluationPanels.exit');
    },
    align: 'end',
    optional: true,
  },
  {
    id: 'stop',
    get label(): string {
      return msg('tradeRow.stop');
    },
    align: 'end',
    optional: true,
  },
  {
    id: 'target',
    get label(): string {
      return msg('tradeRow.target');
    },
    align: 'end',
    optional: true,
  },
  {
    id: 'risk',
    get label(): string {
      return msg('tradeRow.risk');
    },
    align: 'end',
  },
  {
    id: 'plannedRr',
    get label(): string {
      return msg('tradeRow.planRR');
    },
    sortable: 'plannedRr',
    align: 'end',
    optional: true,
  },
  {
    id: 'actualR',
    get label(): string {
      return msg('tradeRow.actualR');
    },
    sortable: 'actualR',
    align: 'end',
    required: true,
  },
  {
    id: 'result',
    get label(): string {
      return msg('tradeFilters.result');
    },
    sortable: 'result',
    required: true,
  },
  {
    id: 'compliance',
    get label(): string {
      return msg('journal.ruleCompliance');
    },
    sortable: 'compliance',
    required: true,
  },
  {
    id: 'status',
    get label(): string {
      return msg('tradeFilters.status');
    },
  },
  {
    id: 'actions',
    get label(): string {
      return msg('tradeRow.actions');
    },
    align: 'end',
    required: true,
  },
];

export const DEFAULT_VISIBLE_COLUMNS: readonly TradeColumnId[] = [
  'ref',
  'datetime',
  'symbol',
  'direction',
  'setup',
  'session',
  'risk',
  'actualR',
  'result',
  'compliance',
  'status',
  'actions',
];

const RESULT_TONE: Record<TradeResult, 'success' | 'danger' | 'neutral' | 'outline'> = {
  win: 'success',
  loss: 'danger',
  breakeven: 'neutral',
  pending: 'outline',
};

const STATUS_TONE: Record<TradeStatus, 'primary' | 'info' | 'warning' | 'outline'> = {
  closed: 'primary',
  open: 'info',
  incomplete: 'warning',
  archived: 'outline',
};

/**
 * Row emphasis by state.
 *
 * The row's start edge is the fastest read in a sixteen-row table: a win, a loss and a break-even
 * must be distinguishable before any number is read. The accent itself is the table system's
 * (`TableRow accent`), stated here as the mapping from a trade's result to one.
 *
 * **Every result has an accent, and the type is what makes that true rather than the map.** The
 * value type is `Exclude<TableRowAccent, 'none'>`, so `none` is not a value this map may hold, and
 * the `Record` is over `TradeResult`, so a result added to the domain cannot quietly fall out of the
 * row's edge. Both halves are load-bearing. The product's history table had asked for the opposite
 * — a break-even drew no rule at all, on the argument that a rule for "nothing happened" draws
 * attention to the rows with nothing in them — and the reader's report of the result was that some
 * rows were *missing* their border. That is the whole failure mode of an absent mark: a reader
 * cannot tell an outcome of "flat" from a row that failed to render, and the two are only
 * distinguishable by reading the badge in the next-to-last column. A break-even states itself in
 * the accent's quietest step instead (`neutral`), which is a designed value rather than no value:
 * one accent per outcome the record can carry, and every row's edge says which.
 *
 * An archived row is dimmed rather than hidden, because a record that was archived can still be the
 * reason a later decision was made. An `incomplete` row keeps the warning wash, which is the one row
 * state that is *told* rather than annotated — the row is still being filled in, and that is a fact
 * about the record rather than about its outcome.
 */
const ROW_ACCENT: Record<TradeResult, Exclude<TableRowAccent, 'none'>> = {
  win: 'success',
  loss: 'danger',
  breakeven: 'neutral',
  pending: 'info',
};

const ROW_TINT: Record<TradeStatus, string> = {
  closed: '',
  open: '',
  incomplete: 'bg-warning-soft/20',
  archived: '',
};

function price(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value >= 1000 ? value.toFixed(2) : value.toFixed(value >= 10 ? 2 : 4);
}

export interface TradeRowProps {
  trade: JournalTrade;
  columns: readonly TradeColumnId[];
  onView: (trade: JournalTrade) => void;
  onEdit: (trade: JournalTrade) => void;
  onDuplicate: (trade: JournalTrade) => void;
  onArchive: (trade: JournalTrade) => void;
  onDelete: (trade: JournalTrade) => void;
  onAddReview: (trade: JournalTrade) => void;
  onViewScreenshots: (trade: JournalTrade) => void;
  className?: string;
}

/**
 * One journal record.
 *
 * The action menu offers *record* operations only — view, edit, duplicate, archive,
 * delete, review, screenshots. There is no affordance that places, changes or
 * closes a position, because the application has no such capability, and the menu
 * is the place a reader is most likely to assume one exists.
 */
export function TradeRow({
  trade,
  columns,
  onView,
  onEdit,
  onDuplicate,
  onArchive,
  onDelete,
  onAddReview,
  onViewScreenshots,
  className,
}: TradeRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  // The control the menu hangs from, learned from the press itself. A wrapper element holding a
  // ref would have to be the button's exact box to place the panel against the button, and the
  // cell is much wider than the button is.
  const [menuAnchor, setMenuAnchor] = useState<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const cells: Record<TradeColumnId, ReactNode> = {
    ref: (
      <button
        type="button"
        onClick={() => onView(trade)}
        aria-label={`Open ${trade.ref}`}
        className="num text-caption font-medium text-text hover:text-primary"
      >
        {trade.ref}
      </button>
    ),
    // A timestamp, a session and a market are *values*, not prose, so none of them wraps: the date
    // and the time are one fact each, and a session name is a term from a closed vocabulary. Left
    // to wrap, `2026-09-19` broke after `2026-09-` — a date that reads as a different date — and
    // `London / New York overlap` took four lines, which made that one row taller than the fifteen
    // around it. Measured with both held on one line: every row is 63px, where before nine sat at
    // 68 and one at 82. The table is ~98px wider for it and still fits the card at 1440, so the
    // price of a column grid that reads as a grid is paid inside the table's own scroller rather
    // than in ragged rows.
    datetime: (
      <span className="num text-caption text-text-muted whitespace-nowrap">
        <span className="block">{formatTimestamp(trade.openedAt).slice(0, 10)}</span>
        <span className="block text-text-faint">{formatTimestamp(trade.openedAt).slice(11)}</span>
      </span>
    ),
    symbol: <span className="text-body font-medium text-text">{trade.symbol}</span>,
    market: (
      <span className="text-caption text-text-muted whitespace-nowrap">
        {MARKET_LABEL[trade.market]}
      </span>
    ),
    // Every chip in this row is one line (`wrap={false}`), which is the row's own contract rather
    // than a per-label decision: a chip that wraps has stopped being a chip, and — the reason it is
    // stated once for the whole row — the height of a row must not depend on which vocabulary word
    // a record happens to carry. With the chips allowed to wrap, a trade whose compliance read
    // *rule broken* — three Persian words where the neighbours' read one — took three lines and
    // stood 20px taller than the nine beside it.
    direction: <DirectionBadge direction={trade.direction} wrap={false} />,
    setup: <SetupBadge setupId={trade.setupId} wrap={false} />,
    session: (
      <span className="text-caption text-text-muted whitespace-nowrap">
        {SESSION_LABEL[trade.session]}
      </span>
    ),
    entry: <span className="num text-caption text-text-muted">{price(trade.plan.entry)}</span>,
    exit: <span className="num text-caption text-text-muted">{price(trade.actual?.exit)}</span>,
    stop: <span className="num text-caption text-text-muted">{price(trade.plan.stopLoss)}</span>,
    target: (
      <span className="num text-caption text-text-muted">{price(trade.plan.takeProfit)}</span>
    ),
    risk: (
      <span className="num text-caption text-text-muted">
        {trade.plan.riskAmount.toLocaleString('en-US')}
      </span>
    ),
    plannedRr: (
      <span className="num text-caption text-text-muted">{trade.plan.plannedRr.toFixed(1)}</span>
    ),
    // The realised multiple is a *value* cell too, and `not scored` is as much a value as `+2.60R`:
    // it is one reading of one column, not a sentence. Left to wrap it took two lines in a column
    // 75px wide, which made the unscored rows 2px taller than the scored ones beside them. Also the
    // reason the column is nowrap rather than the fallback string alone: the digits and the absence
    // are the same cell, so they must be the same number of lines.
    actualR: (
      <RMultipleIndicator
        value={trade.actual?.actualR ?? null}
        planned={trade.plan.plannedRr}
        className="whitespace-nowrap"
      />
    ),
    result: (
      <Badge tone={RESULT_TONE[trade.result]} wrap={false}>
        {RESULT_LABEL[trade.result]}
      </Badge>
    ),
    compliance: <RuleComplianceBadge compliance={trade.compliance} wrap={false} />,
    status: (
      <Badge tone={STATUS_TONE[trade.status]} wrap={false}>
        {STATUS_LABEL[trade.status]}
      </Badge>
    ),
    actions: (
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          label={`Actions for ${trade.ref}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={(event) => {
            setMenuAnchor(event.currentTarget);
            setMenuOpen((value) => !value);
          }}
        >
          <MoreVertical size={14} aria-hidden />
        </Button>
        <AnchoredMenu
          open={menuOpen}
          anchor={menuAnchor}
          onClose={() => setMenuOpen(false)}
          closeLabel={msg('journal.closeActionsMenu')}
        >
          <MenuItem
            icon={<Eye size={13} aria-hidden />}
            label={msg('tradeRow.viewDetails')}
            onSelect={() => {
              setMenuOpen(false);
              onView(trade);
            }}
          />
          <MenuItem
            icon={<Pencil size={13} aria-hidden />}
            label={msg('tradeRow.editRecord')}
            onSelect={() => {
              setMenuOpen(false);
              onEdit(trade);
            }}
          />
          <MenuItem
            icon={<Copy size={13} aria-hidden />}
            label={msg('tradeRow.duplicateAsTemplate')}
            onSelect={() => {
              setMenuOpen(false);
              onDuplicate(trade);
            }}
          />
          <MenuItem
            icon={<MessageSquarePlus size={13} aria-hidden />}
            label={msg('tradeRow.addReview')}
            onSelect={() => {
              setMenuOpen(false);
              onAddReview(trade);
            }}
          />
          <MenuItem
            icon={<ImageIcon size={13} aria-hidden />}
            label={`View screenshots (${trade.screenshots.length})`}
            onSelect={() => {
              setMenuOpen(false);
              onViewScreenshots(trade);
            }}
          />
          <div className="my-1 border-t border-border" />
          <MenuItem
            icon={<Archive size={13} aria-hidden />}
            label={trade.status === 'archived' ? 'Already archived' : 'Archive record'}
            disabled={trade.status === 'archived'}
            disabledReason={msg('tradeRow.thisRecordIsAlreadyArchived')}
            onSelect={() => {
              setMenuOpen(false);
              onArchive(trade);
            }}
          />
          <MenuItem
            icon={<Trash2 size={13} aria-hidden />}
            label={msg('tradeRow.deleteRecord')}
            tone="danger"
            onSelect={() => {
              setMenuOpen(false);
              onDelete(trade);
            }}
          />
        </AnchoredMenu>
      </div>
    ),
  };

  return (
    <TableRow
      accent={ROW_ACCENT[trade.result]}
      muted={trade.status === 'archived'}
      className={cn(ROW_TINT[trade.status], className)}
    >
      {columns.map((column) => {
        const definition = TRADE_COLUMNS.find((item) => item.id === column);
        return (
          <TableCell
            key={column}
            align={definition?.align === 'end' ? 'end' : 'start'}
            className={column === 'ref' ? 'ps-4' : undefined}
          >
            {cells[column]}
          </TableCell>
        );
      })}
    </TableRow>
  );
}
