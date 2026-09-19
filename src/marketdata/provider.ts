/**
 * Market-data abstraction.
 *
 * Providers are replaceable. Everything the rest of the system sees is
 * normalized and *labelled*: synthetic, historical or live. Live data is not
 * reachable in this phase (see `allowedProvenance`), and nothing here can
 * place an order — reading prices is not trading.
 */

import type { Bar } from '../types.js';
import { AppError, PolicyViolationError } from '../core/errors.js';
import type { Provenance } from '../core/provenance.js';
import { SlidingWindowRateLimiter, rateLimitPolicyFrom } from '../core/rateLimit.js';
import { withTimeout } from '../core/retry.js';

export type DataProvenance = 'synthetic' | 'historical' | 'live';

export type AssetClass = 'equity' | 'fx' | 'crypto' | 'commodity' | 'index';

export interface Timeframe {
  unit: 'minute' | 'hour' | 'day';
  amount: number;
}

export interface SymbolRef {
  symbol: string;
  assetClass: AssetClass;
  /** Exchange/market code, or 'GLOBAL' when unknown. */
  exchange: string;
  /** IANA timezone the session timestamps belong to. */
  timezone: string;
}

export function timeframeLabel(timeframe: Timeframe): string {
  const suffix = timeframe.unit === 'minute' ? 'm' : timeframe.unit === 'hour' ? 'h' : 'd';
  return `${timeframe.amount}${suffix}`;
}

/** Canonical symbol normalization: uppercase, trimmed, explicit metadata. */
export function normalizeSymbol(
  raw: string,
  options: { assetClass?: AssetClass; exchange?: string; timezone?: string } = {},
): SymbolRef {
  const symbol = raw.trim().toUpperCase();
  if (symbol.length === 0) {
    throw new AppError('VALIDATION_FAILED', 'symbol must be a non-empty string');
  }
  return {
    symbol,
    assetClass: options.assetClass ?? 'equity',
    exchange: options.exchange ?? 'GLOBAL',
    timezone: options.timezone ?? 'UTC',
  };
}

export interface MarketDataRequest {
  symbol: SymbolRef;
  timeframe: Timeframe;
  fromIso: string;
  toIso: string;
  provenance: DataProvenance;
}

export interface ProviderLimits {
  requestsPerMinute: number;
  maxBarsPerRequest: number;
}

export interface NormalizedBar extends Bar {
  timeframe: string;
  timezone: string;
  provenance: DataProvenance;
  source: string;
}

export interface MarketDataProvider {
  readonly id: string;
  readonly limits: ProviderLimits;
  supports(provenance: DataProvenance): boolean;
  fetchBars(request: MarketDataRequest, signal?: AbortSignal): Promise<Bar[]>;
}

export const DATA_QUALITY_RULES: readonly string[] = [
  'bars must be non-empty and within the requested range',
  'timestamps must be valid ISO dates, strictly ascending, with no duplicates',
  'OHLC must satisfy low <= min(open, close) <= max(open, close) <= high',
  'prices must be finite and positive; volume must be a non-negative finite number',
];

export interface DataQualityReport {
  symbol: string;
  barCount: number;
  passed: boolean;
  issues: string[];
}

/** Validate and report. Never silently "repairs" data. */
export function validateBars(
  bars: readonly Bar[],
  request: MarketDataRequest,
  options: { maxBarsPerRequest?: number } = {},
): DataQualityReport {
  const issues: string[] = [];
  const max = options.maxBarsPerRequest;
  if (bars.length === 0) issues.push('no bars returned');
  if (max !== undefined && bars.length > max) {
    issues.push(`bar count ${bars.length} exceeds limit ${max}`);
  }

  const from = Date.parse(request.fromIso);
  const to = Date.parse(request.toIso);
  const seen = new Set<string>();
  let previous = -Infinity;

  for (const bar of bars) {
    if (bar.symbol.toUpperCase() !== request.symbol.symbol) {
      issues.push(`bar symbol mismatch: ${bar.symbol}`);
      break;
    }
    const time = Date.parse(bar.date);
    if (Number.isNaN(time)) {
      issues.push(`invalid timestamp: ${bar.date}`);
      break;
    }
    if (time < from || time > to) issues.push(`bar ${bar.date} outside requested range`);
    if (time <= previous) issues.push(`bars not strictly ascending at ${bar.date}`);
    previous = time;
    if (seen.has(bar.date)) issues.push(`duplicate bar for ${bar.date}`);
    seen.add(bar.date);

    const prices = [bar.open, bar.high, bar.low, bar.close];
    if (prices.some((p) => !Number.isFinite(p) || p <= 0)) {
      issues.push(`non-positive/non-finite price at ${bar.date}`);
      break;
    }
    if (bar.low > Math.min(bar.open, bar.close) || bar.high < Math.max(bar.open, bar.close)) {
      issues.push(`inconsistent OHLC at ${bar.date}`);
    }
    if (!Number.isFinite(bar.volume) || bar.volume < 0) {
      issues.push(`invalid volume at ${bar.date}`);
      break;
    }
  }

  return {
    symbol: request.symbol.symbol,
    barCount: bars.length,
    passed: issues.length === 0,
    issues,
  };
}

export interface MarketDataSourceConfig {
  /** Structural guard: this phase allows synthetic and historical only. */
  allowedProvenance: DataProvenance[];
  maxBarsPerRequest: number;
  requestTimeoutMs: number;
}

export interface MarketDataResult {
  bars: NormalizedBar[];
  quality: DataQualityReport;
  providerId: string;
  provenance: DataProvenance;
  provenanceRecord: Provenance;
}

export class MarketDataSource {
  private readonly limiters = new Map<string, SlidingWindowRateLimiter>();
  private readonly providers: MarketDataProvider[];
  private readonly config: MarketDataSourceConfig;

  constructor(providers: MarketDataProvider[], config: MarketDataSourceConfig) {
    this.providers = providers;
    this.config = config;
    for (const provider of providers) {
      this.limiters.set(
        provider.id,
        new SlidingWindowRateLimiter(rateLimitPolicyFrom(provider.limits.requestsPerMinute)),
      );
    }
  }

  allowedProvenance(): readonly DataProvenance[] {
    return this.config.allowedProvenance;
  }

  async getBars(
    request: MarketDataRequest,
    context: { correlationId?: string } = {},
  ): Promise<MarketDataResult> {
    if (!this.config.allowedProvenance.includes(request.provenance)) {
      throw new PolicyViolationError(
        `Market data provenance "${request.provenance}" is not permitted in this phase.`,
        { allowed: this.config.allowedProvenance },
      );
    }

    const candidates = this.providers.filter((provider) => provider.supports(request.provenance));
    if (candidates.length === 0) {
      throw new AppError('PROVIDER_UNAVAILABLE', 'No provider supports the requested provenance');
    }

    const failures: string[] = [];
    for (const provider of candidates) {
      const limiter = this.limiters.get(provider.id);
      const decision = limiter?.tryAcquire();
      if (decision && !decision.allowed) {
        failures.push(`${provider.id}: rate limited, retry after ${decision.retryAfterMs}ms`);
        continue;
      }
      try {
        const bars = await withTimeout(
          (signal) => provider.fetchBars(request, signal),
          this.config.requestTimeoutMs,
          { what: `marketData:${provider.id}`, correlationId: context.correlationId },
        );
        const quality = validateBars(bars, request, {
          maxBarsPerRequest: Math.min(
            this.config.maxBarsPerRequest,
            provider.limits.maxBarsPerRequest,
          ),
        });
        const label = timeframeLabel(request.timeframe);
        const normalized: NormalizedBar[] = bars.map((bar) => ({
          ...bar,
          symbol: request.symbol.symbol,
          timeframe: label,
          timezone: request.symbol.timezone,
          provenance: request.provenance,
          source: provider.id,
        }));
        return {
          bars: normalized,
          quality,
          providerId: provider.id,
          provenance: request.provenance,
          provenanceRecord: {
            source: request.provenance === 'synthetic' ? 'synthetic' : 'market-data',
            ref: `${provider.id}:${request.symbol.symbol}:${label}`,
            trust: request.provenance === 'synthetic' ? 'verified' : 'authoritative',
            recordedAt: new Date().toISOString(),
            note:
              request.provenance === 'synthetic'
                ? 'synthetic — not real market data'
                : `historical bars from ${provider.id}`,
          },
        };
      } catch (error) {
        failures.push(`${provider.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    throw new AppError('PROVIDER_UNAVAILABLE', 'All market-data providers failed', {
      details: { failures },
    });
  }
}

/* ------------------------------------------------------------------ */
/* In-memory providers (used by tests and offline desktop dev)          */
/* ------------------------------------------------------------------ */

/** Deterministic historical-shaped provider. Clearly labelled. */
export function syntheticProvider(
  options: {
    id?: string;
    provenance?: DataProvenance;
    limits?: ProviderLimits;
    bars?: (request: MarketDataRequest) => Bar[];
    delayMs?: number;
  } = {},
): MarketDataProvider {
  const provenance = options.provenance ?? 'synthetic';
  return {
    id: options.id ?? 'local-synthetic',
    limits: options.limits ?? { requestsPerMinute: 600, maxBarsPerRequest: 1_000 },
    supports: (candidate) => candidate === provenance,
    async fetchBars(request, signal) {
      if (options.delayMs && options.delayMs > 0) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, options.delayMs);
          signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new AppError('TIMEOUT', 'aborted'));
          });
        });
      }
      if (options.bars) return options.bars(request);
      return buildSyntheticBars(request.symbol.symbol, request.fromIso, 5);
    },
  };
}

/** Simple deterministic series helper shared by providers and tests. */
export function buildSyntheticBars(symbol: string, fromIso: string, count: number): Bar[] {
  const start = Date.parse(fromIso);
  const bars: Bar[] = [];
  let price = 100;
  for (let i = 0; i < count; i++) {
    const close = price * 1.001;
    bars.push({
      symbol,
      date: new Date(start + i * 86_400_000).toISOString(),
      open: price,
      high: Math.max(price, close) * 1.002,
      low: Math.min(price, close) * 0.998,
      close,
      volume: 1_000_000,
    });
    price = close;
  }
  return bars;
}
