/**
 * Market-data repository — owner: `platform` (provenance rules from the
 * market-data layer, ADR-0005).
 *
 * Bars are stored with mandatory provenance, and this repository refuses to store
 * live data: `DATA_PROVENANCE_VALUES` has no `live` member, so the unrepresentable
 * state cannot be written even by a future caller who tries. A corrected bar is
 * written under a new `source`, never as an update — the append-only rule that
 * makes a training history reproducible.
 */

import { PolicyViolationError } from '../../core/errors.js';
import { ids } from '../../core/ids.js';
import type { SqlExecutor } from '../executor.js';
import { Table } from '../table.js';
import type { Owner } from '../ownership.js';
import { DATA_PROVENANCE_VALUES, type TableName } from '../schema.js';

export const OWNER: Owner = 'platform';
export const OWNED_TABLES: readonly TableName[] = ['market_data_bars'];

export type BarProvenance = (typeof DATA_PROVENANCE_VALUES)[number];

export interface BarRow {
  id: string;
  symbol: string;
  timeframe: string;
  provenance: BarProvenance;
  source: string;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BarInput {
  symbol: string;
  timeframe: string;
  provenance: BarProvenance;
  source: string;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketDataRepositoryOptions {
  now?: () => number;
  newId?: (kind: string) => string;
}

export class MarketDataRepository {
  private readonly bars: Table<BarRow>;
  private readonly now: () => number;
  private readonly newId: (kind: string) => string;

  constructor(db: SqlExecutor, options: MarketDataRepositoryOptions = {}) {
    this.bars = new Table<BarRow>(db, 'market_data_bars');
    this.now = options.now ?? Date.now;
    this.newId = options.newId ?? ((kind) => ids.id(kind));
  }

  /**
   * Store bars, ignoring duplicates on (symbol, timeframe, provenance, source,
   * time). Re-ingesting the same range is therefore a no-op rather than an error,
   * which is what makes a retried ingestion job safe.
   */
  async saveBars(bars: readonly BarInput[]): Promise<number> {
    let stored = 0;
    for (const bar of bars) {
      if (!DATA_PROVENANCE_VALUES.includes(bar.provenance)) {
        throw new PolicyViolationError(
          `Refusing to store bars with provenance "${String(bar.provenance)}"`,
          { symbol: bar.symbol, provenance: String(bar.provenance) },
        );
      }
      if (bar.high < bar.low) {
        throw new PolicyViolationError('A bar cannot have a high below its low', {
          symbol: bar.symbol,
          time: bar.time,
        });
      }
      const existing = await this.bars.findOne({
        symbol: bar.symbol,
        timeframe: bar.timeframe,
        provenance: bar.provenance,
        source: bar.source,
        time: bar.time,
      });
      if (existing) continue;
      await this.bars.insert({
        id: this.newId('bar'),
        symbol: bar.symbol,
        timeframe: bar.timeframe,
        provenance: bar.provenance,
        source: bar.source,
        time: bar.time,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      });
      stored += 1;
    }
    return stored;
  }

  /** Bars for one series, oldest first. */
  async series(input: {
    symbol: string;
    timeframe: string;
    provenance: BarProvenance;
    source?: string;
    limit?: number;
  }): Promise<BarRow[]> {
    const rows = await this.bars.findMany(
      {
        symbol: input.symbol,
        timeframe: input.timeframe,
        provenance: input.provenance,
        ...(input.source === undefined ? {} : { source: input.source }),
      },
      { orderBy: 'time', direction: 'asc', limit: input.limit ?? 5_000 },
    );
    return rows;
  }

  lastBarTime(input: {
    symbol: string;
    timeframe: string;
    provenance: BarProvenance;
    source: string;
  }): Promise<string | null> {
    return this.bars
      .findMany(
        {
          symbol: input.symbol,
          timeframe: input.timeframe,
          provenance: input.provenance,
          source: input.source,
        },
        { orderBy: 'time', direction: 'desc', limit: 1 },
      )
      .then((rows) => rows[0]?.time ?? null);
  }

  async sourcesFor(symbol: string, timeframe: string): Promise<string[]> {
    const rows = await this.bars.findMany({ symbol, timeframe }, { limit: 10_000 });
    return [...new Set(rows.map((row) => `${row.source} (${row.provenance})`))].sort();
  }
}

export function createMarketDataRepository(
  db: SqlExecutor,
  options: MarketDataRepositoryOptions = {},
): MarketDataRepository {
  return new MarketDataRepository(db, options);
}
