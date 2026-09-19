# ADR-0005 — Provider-independent market data with mandatory provenance

**Status:** Accepted · **Date:** 2026-09-19

## Context

Training needs reproducible price series even without network access, future
ingestion will need real providers, and a training agent must never let a learner
confuse synthetic examples with real market history.

## Decision

Define `MarketDataProvider` (`src/marketdata/provider.ts`) behind a
`MarketDataSource` that owns selection, rate limiting, timeouts, normalization
and validation. Every request, stored bar and returned bar carries an explicit
`DataProvenance` of `synthetic | historical | live`; `live` is refused in this
phase by policy and configuration.

## Consequences

- Deterministic synthetic series keep tests and offline desktop use honest and
  offline; real providers plug in without touching consumers.
- Data quality is reported, never silently repaired: `DataQualityReport` lists
  ordering, duplicate, range, OHLC and volume issues.
- Synthetic data always reads as synthetic in storage, memory provenance and the
  UI (`provenanceLabel()`); the database column is NOT NULL.
- Enabling live data later requires a deliberate config/code change and still
  provides no execution path.
- Cost: providers must map their formats into `Bar` and declare real rate limits.
