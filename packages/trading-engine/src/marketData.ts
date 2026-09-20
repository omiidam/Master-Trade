/**
 * Market-data tools.
 *
 * Phase 1 uses a deterministic synthetic dataset so everything is testable
 * offline. A future `dataSource` implementation (real provider) will plug in
 * behind the same interface, with provenance recorded in memory.
 */

import type { Bar } from '../../shared/src/types.js';
import type { Tool } from './framework.js';
import { err, ok, type ToolResult } from './framework.js';

/** Deterministic pseudo-random generator (mulberry32) — same seed, same bars. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Simple moving average over closes. Deterministic. */
export function sma(values: number[], period: number): number | null {
  if (period <= 0 || values.length < period) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) {
    sum += values[i] as number;
  }
  return sum / period;
}

export interface SyntheticSeriesInput {
  symbol: string;
  /** Number of daily bars to generate. */
  bars: number;
  /** Deterministic seed. Same seed -> identical series. */
  seed: number;
  startPrice: number;
}

export interface SyntheticSeriesOutput {
  symbol: string;
  bars: Bar[];
  /** Provenance note attached to every bar set. */
  provenance: string;
}

/** Deterministic synthetic OHLCV series for training and testing. */
export const syntheticSeriesTool: Tool<SyntheticSeriesInput, ToolResult<SyntheticSeriesOutput>> = {
  descriptor: {
    name: 'marketData.syntheticSeries',
    category: 'market-data',
    capabilities: ['marketData.synthetic', 'marketData.read'],
    semantics: { epistemicKind: 'fact', hasSideEffects: false },
    description:
      'Generate a deterministic synthetic OHLCV series (clearly labeled as synthetic training data).',
    version: '1.0.0',
  },
  run(input): ToolResult<SyntheticSeriesOutput> {
    if (typeof input.symbol !== 'string' || input.symbol.length === 0) {
      return err('symbol must be a non-empty string');
    }
    if (!Number.isInteger(input.bars) || input.bars < 2 || input.bars > 5000) {
      return err('bars must be an integer in [2, 5000]');
    }
    if (!Number.isFinite(input.startPrice) || input.startPrice <= 0) {
      return err('startPrice must be a finite positive number');
    }

    const rand = mulberry32(input.seed);
    const bars: Bar[] = [];
    let price = input.startPrice;
    const start = new Date(Date.UTC(2024, 0, 1));

    for (let i = 0; i < input.bars; i++) {
      const drift = 0.0002;
      const shock = (rand() - 0.5) * 0.02; // ±1% daily move
      const close = price * (1 + drift + shock);
      const high = Math.max(price, close) * (1 + rand() * 0.005);
      const low = Math.min(price, close) * (1 - rand() * 0.005);
      const volume = Math.floor(100_000 + rand() * 900_000);
      const date = new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10);
      bars.push({ symbol: input.symbol, date, open: price, high, low, close, volume });
      price = close;
    }

    return ok({
      symbol: input.symbol,
      bars,
      provenance: 'synthetic://master-trade/seeded-series — NOT real market data',
    });
  },
};

export interface SmaInput {
  closes: number[];
  period: number;
}

export interface SmaOutput {
  period: number;
  value: number | null;
  note: string;
}

/** SMA indicator tool. Deterministic. */
export const smaTool: Tool<SmaInput, ToolResult<SmaOutput>> = {
  descriptor: {
    name: 'marketData.sma',
    category: 'market-data',
    capabilities: ['marketData.read'],
    semantics: { epistemicKind: 'fact', hasSideEffects: false },
    description: 'Compute simple moving average over a series of closes.',
    version: '1.0.0',
  },
  run(input): ToolResult<SmaOutput> {
    if (!Array.isArray(input.closes) || input.closes.some((c) => !Number.isFinite(c))) {
      return err('closes must be an array of finite numbers');
    }
    if (!Number.isInteger(input.period) || input.period <= 0) {
      return err('period must be a positive integer');
    }
    const value = sma(input.closes, input.period);
    return ok({
      period: input.period,
      value,
      note: value === null ? `not enough data for SMA(${input.period})` : 'ok',
    });
  },
};
