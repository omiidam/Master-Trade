import { useEffect, useRef, useState, type ReactNode } from 'react';
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
import { Badge } from '../Badge';
import { Button } from '../Button';
import { Tooltip } from '../Tooltip';
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
 * The row's left edge is the fastest read in a 16-row table: a win, a loss and a
 * break-even must be distinguishable before any number is read. The accent itself is the table
 * system's (`TableRow accent`), stated here as the mapping from a trade's result to one. A
 * break-even has no accent rather than a grey one: a rule for "nothing happened" is a rule that
 * draws attention to the rows with nothing in them.
 *
 * An archived row is dimmed rather than hidden, because a record that was archived can still be the
 * reason a later decision was made. An `incomplete` row keeps the warning wash, which is the one row
 * state that is *told* rather than annotated — the row is still being filled in, and that is a fact
 * about the record rather than about its outcome.
 */
const ROW_ACCENT: Record<TradeResult, TableRowAccent> = {
  win: 'success',
  loss: 'danger',
  breakeven: 'none',
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
  const menuRef = useRef<HTMLDivElement | null>(null);

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
    datetime: (
      <span className="num text-caption text-text-muted">
        <span className="block">{formatTimestamp(trade.openedAt).slice(0, 10)}</span>
        <span className="block text-text-faint">{formatTimestamp(trade.openedAt).slice(11)}</span>
      </span>
    ),
    symbol: <span className="text-body font-medium text-text">{trade.symbol}</span>,
    market: <span className="text-caption text-text-muted">{MARKET_LABEL[trade.market]}</span>,
    direction: <DirectionBadge direction={trade.direction} />,
    setup: <SetupBadge setupId={trade.setupId} />,
    session: <span className="text-caption text-text-muted">{SESSION_LABEL[trade.session]}</span>,
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
    actualR: (
      <RMultipleIndicator value={trade.actual?.actualR ?? null} planned={trade.plan.plannedRr} />
    ),
    result: <Badge tone={RESULT_TONE[trade.result]}>{RESULT_LABEL[trade.result]}</Badge>,
    compliance: <RuleComplianceBadge compliance={trade.compliance} />,
    status: <Badge tone={STATUS_TONE[trade.status]}>{STATUS_LABEL[trade.status]}</Badge>,
    actions: (
      <div className="relative flex justify-end" ref={menuRef}>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          label={`Actions for ${trade.ref}`}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
        >
          <MoreVertical size={14} aria-hidden />
        </Button>
        {menuOpen ? (
          <>
            <button
              type="button"
              aria-label={msg('journal.closeActionsMenu')}
              className="fixed inset-0 z-[var(--z-overlay)] cursor-default"
              onClick={() => setMenuOpen(false)}
            />
            <div
              role="menu"
              className={cn(
                'absolute end-0 top-8 z-[var(--z-modal)] w-52 overflow-hidden rounded-[var(--radius-control)]',
                'border border-border-strong bg-bg-elevated py-1 shadow-popover',
              )}
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
            </div>
          </>
        ) : null}
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

function MenuItem({
  icon,
  label,
  onSelect,
  disabled = false,
  tone = 'default',
}: {
  icon: ReactNode;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
}) {
  const button = (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-1.5 text-start text-caption',
        'transition-colors duration-[var(--duration-fast)] disabled:opacity-40',
        tone === 'danger'
          ? 'text-danger hover:bg-danger-soft'
          : 'text-text-muted hover:bg-surface-raised hover:text-text',
      )}
    >
      <span aria-hidden className="shrink-0">
        {icon}
      </span>
      {label}
    </button>
  );
  return disabled ? (
    <Tooltip content={msg('tradeRow.thisRecordIsAlreadyArchived')}>{button}</Tooltip>
  ) : (
    button
  );
}
