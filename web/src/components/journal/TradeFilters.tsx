import { useState, type ReactNode } from 'react';
import { ListFilter, RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import { Badge } from '../Badge';
import { Button } from '../Button';
import { Input, Select } from '../Input';
import { cn } from '../../lib/cn';
import {
  COMPLIANCE_LABEL,
  DIRECTION_LABEL,
  MARKET_LABEL,
  RESULT_LABEL,
  RULE_COMPLIANCES,
  SESSION_LABEL,
  STATUS_LABEL,
  TRADE_RANGES,
  TRADE_RANGE_LABEL,
  TRADE_RESULTS,
  TRADE_SETUPS,
  TRADE_STATUSES,
  countActiveFilters,
  setupLabel,
} from '../../mock/journal';
import type {
  RuleCompliance,
  TradeDirection,
  TradeFilters as TradeFilterState,
  TradeMarket,
  TradeRange,
  TradeResult,
  TradeStatus,
  TradingSession,
} from '../../mock/journal';

export interface TradeFiltersProps {
  filters: TradeFilterState;
  onChange: (filters: TradeFilterState) => void;
  onReset: () => void;
  /** How many records the current filters matched, and out of how many. */
  matched: number;
  total: number;
  /** Tight viewports collapse the facet row behind a control. */
  collapsible?: boolean;
  className?: string;
}

function Facet({
  label,
  value,
  onChange,
  children,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('block min-w-0', className)}>
      <span className="mb-1 block text-caption font-medium text-text-faint">{label}</span>
      <Select density="sm" value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </Select>
    </label>
  );
}

/**
 * The journal's filter bar.
 *
 * Search plus one facet per dimension the journal actually records. Two details
 * are deliberate: the active-filter count is shown even while the facets are
 * collapsed, so a shortened table is never mysterious; and the reset control is
 * only offered when there is something to reset. The match count states how many
 * records the current filters selected — narrowing a journal is how a review turns
 * into a study, and the count is the evidence that it happened.
 */
export function TradeFilters({
  filters,
  onChange,
  onReset,
  matched,
  total,
  collapsible = false,
  className,
}: TradeFiltersProps) {
  const [expanded, setExpanded] = useState(!collapsible);
  const active = countActiveFilters(filters);

  const set = <Key extends keyof TradeFilterState>(key: Key, value: TradeFilterState[Key]) =>
    onChange({ ...filters, [key]: value });

  const facets = (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
      <Facet
        label="Market"
        value={filters.market}
        onChange={(value) => set('market', value as TradeMarket | 'all')}
      >
        <option value="all">Any market</option>
        {(Object.keys(MARKET_LABEL) as TradeMarket[]).map((key) => (
          <option key={key} value={key}>
            {MARKET_LABEL[key]}
          </option>
        ))}
      </Facet>
      <Facet
        label="Direction"
        value={filters.direction}
        onChange={(value) => set('direction', value as TradeDirection | 'all')}
      >
        <option value="all">Both</option>
        {(Object.keys(DIRECTION_LABEL) as TradeDirection[]).map((key) => (
          <option key={key} value={key}>
            {DIRECTION_LABEL[key]}
          </option>
        ))}
      </Facet>
      <Facet
        label="Session"
        value={filters.session}
        onChange={(value) => set('session', value as TradingSession | 'all')}
      >
        <option value="all">Any session</option>
        {(Object.keys(SESSION_LABEL) as TradingSession[]).map((key) => (
          <option key={key} value={key}>
            {SESSION_LABEL[key]}
          </option>
        ))}
      </Facet>
      <Facet label="Setup" value={filters.setupId} onChange={(value) => set('setupId', value)}>
        <option value="all">Any setup</option>
        {TRADE_SETUPS.map((setup) => (
          <option key={setup.id} value={setup.id}>
            {setup.label}
          </option>
        ))}
      </Facet>
      <Facet
        label="Result"
        value={filters.result}
        onChange={(value) => set('result', value as TradeResult | 'all')}
      >
        <option value="all">Any result</option>
        {TRADE_RESULTS.map((key) => (
          <option key={key} value={key}>
            {RESULT_LABEL[key]}
          </option>
        ))}
      </Facet>
      <Facet
        label="Rule compliance"
        value={filters.compliance}
        onChange={(value) => set('compliance', value as RuleCompliance | 'all')}
      >
        <option value="all">Any state</option>
        {RULE_COMPLIANCES.map((key) => (
          <option key={key} value={key}>
            {COMPLIANCE_LABEL[key]}
          </option>
        ))}
      </Facet>
      <Facet
        label="Status"
        value={filters.status}
        onChange={(value) => set('status', value as TradeStatus | 'all')}
      >
        <option value="all">Any status</option>
        {TRADE_STATUSES.map((key) => (
          <option key={key} value={key}>
            {STATUS_LABEL[key]}
          </option>
        ))}
      </Facet>
      <Facet
        label="Date range"
        value={filters.range}
        onChange={(value) => set('range', value as TradeRange)}
      >
        {TRADE_RANGES.map((key) => (
          <option key={key} value={key}>
            {TRADE_RANGE_LABEL[key]}
          </option>
        ))}
      </Facet>
      {filters.range === 'custom' ? (
        <>
          <label className="block min-w-0">
            <span className="mb-1 block text-caption font-medium text-text-faint">From</span>
            <Input
              type="date"
              className="h-9 text-caption"
              value={filters.rangeFrom}
              onChange={(event) => set('rangeFrom', event.target.value)}
            />
          </label>
          <label className="block min-w-0">
            <span className="mb-1 block text-caption font-medium text-text-faint">To</span>
            <Input
              type="date"
              className="h-9 text-caption"
              value={filters.rangeTo}
              onChange={(event) => set('rangeTo', event.target.value)}
            />
          </label>
        </>
      ) : null}
    </div>
  );

  return (
    <section
      aria-label="Trade filters"
      className={cn(
        'space-y-3 rounded-[var(--radius-panel)] border border-border bg-surface p-4 shadow-panel',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-text-faint"
          >
            <Search size={14} />
          </span>
          <Input
            type="search"
            className="ps-9"
            placeholder="Search symbol, reference, setup or tag"
            aria-label="Search trades"
            value={filters.search}
            onChange={(event) => set('search', event.target.value)}
          />
        </div>

        {collapsible ? (
          <Button
            variant="secondary"
            size="md"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            label={expanded ? 'Hide trade filters' : 'Show trade filters'}
            leadingIcon={<SlidersHorizontal size={14} aria-hidden />}
          >
            {expanded ? 'Hide filters' : 'Filters'}
          </Button>
        ) : null}

        <Badge
          tone={active > 0 ? 'primary' : 'outline'}
          icon={<ListFilter size={11} aria-hidden />}
        >
          {active > 0 ? `${active} active` : 'no filters'}
        </Badge>

        {active > 0 ? (
          <Button
            variant="ghost"
            size="md"
            onClick={onReset}
            label="Clear all trade filters"
            leadingIcon={<RotateCcw size={14} aria-hidden />}
          >
            Reset
          </Button>
        ) : null}
      </div>

      {expanded ? facets : null}

      <p className="text-caption text-text-faint">
        {matched === total
          ? `Showing all ${total} records in the journal.`
          : `Showing ${matched} of ${total} records — the active filters are narrowing the set.`}
        {filters.setupId === 'all' ? '' : ` Setup filter: ${setupLabel(filters.setupId)}.`}
      </p>
    </section>
  );
}
