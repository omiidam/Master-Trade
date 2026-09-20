# Market-Data Layer

Implemented in `packages/shared/src/marketdata/provider.ts` (moved from `src/marketdata/`
in Phase 4.3; that directory no longer exists). Reading prices is not trading: this
layer is read-only, and nothing in it can reach a broker.

## 1. Provider-independent interface

```ts
interface MarketDataProvider {
  readonly id: string;
  readonly limits: ProviderLimits; // requestsPerMinute, maxBarsPerRequest
  supports(provenance: DataProvenance): boolean;
  fetchBars(request: MarketDataRequest, signal?: AbortSignal): Promise<Bar[]>;
}
```

Adding a provider (CSV import, broker-agnostic vendor, exchange API) means
implementing this interface; no business logic changes. `MarketDataSource` owns
selection, rate limiting, timeouts, validation, normalization and provenance.

## 2. Historical vs real-time

`DataProvenance = 'synthetic' | 'historical' | 'live'` is explicit on every
request, every stored bar (`market_data_bars.provenance`) and every returned bar.

| Provenance   | This phase                           | Storage       | Trust                                   |
| ------------ | ------------------------------------ | ------------- | --------------------------------------- |
| `synthetic`  | allowed (training default)           | yes, labelled | `verified`, note "not real market data" |
| `historical` | allowed                              | yes           | `authoritative` for the provider        |
| `live`       | **refused** (`PolicyViolationError`) | not reachable | n/a                                     |

`config.marketData.allowedProvenance` defaults to `['synthetic','historical']`
and `assertSafeConfig()` rejects configs that include `'live'`. Enabling live
read-only data therefore requires a deliberate, reviewable change — and even
then there is no execution path anywhere in the system.

The separation of historical ingestion (batch jobs, `marketData.ingest`) from
real-time ticks (`marketdata.tick` events) is part of the design: they have
different quality rules, storage paths and consumers.

## 3. Validation and normalization

`normalizeSymbol()` uppercases and trims, and attaches `assetClass`, `exchange`
and an IANA `timezone`; the timezone travels with every bar so session-aware
logic cannot silently mix zones.

`validateBars()` reports (never "repairs"):

| Rule                                               | Example violation              |
| -------------------------------------------------- | ------------------------------ |
| non-empty and within the requested range           | bar dated outside `[from, to]` |
| valid ISO timestamps, strictly ascending           | unsorted series                |
| no duplicates                                      | same timestamp twice           |
| `low ≤ min(open, close) ≤ max(open, close) ≤ high` | impossible candle              |
| finite positive prices, non-negative volume        | `NaN`, zero or negative prices |
| bar count within the provider and config limits    | over-limit requests            |

Result is a `DataQualityReport { symbol, barCount, passed, issues[] }` returned
alongside the data, so a caller can decide (and can surface the problem to the
user) instead of quietly trading on broken data. Every returned bar is
`NormalizedBar`: symbol, timeframe label, timezone, provenance and provider id.

## 4. Rate limits, failures and fallbacks

- Each provider gets a `SlidingWindowRateLimiter` built from its own
  `requestsPerMinute`; a rate-limited provider reports the retry delay and the
  source moves on to the next candidate.
- Every fetch is wrapped in `withTimeout` using
  `config.marketData.requestTimeoutMs`; a timeout aborts the provider and counts
  as a failure.
- When all candidates fail, `PROVIDER_UNAVAILABLE` is raised with the per-provider
  failure list in `details` — enough for the UI and the audit trail to explain
  what happened without leaking provider internals.
- Partial success is not hidden: a provider returning low-quality data still
  yields `quality.passed === false` with reasons.

## 5. Provenance into the agent

`MarketDataSource.getBars()` returns a `Provenance` record
(`source`, `ref`, `trust`, `recordedAt`, `note`) which is stored with the bars
and attached to memory/audit entries. The agent therefore always knows — and
must state — whether a number came from synthetic training data, a historical
provider, or (in future) live data. `provenanceLabel()` renders this in the UI.
