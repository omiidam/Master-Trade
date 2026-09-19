# ADR-0013 — Charting: TradingView Lightweight Charts behind an adapter

- **Status:** Accepted (Phase 3.1, architecture lock `DEC-FE-4-CHARTING`)
- **Date:** 2026-09-19
- **Supersedes:** none

## Context

The dashboard must render historical and synthetic OHLC data (candles,
overlays such as SMA) for training and review, at tens of thousands of bars, in
a WebView, without ever suggesting that the user can trade. Three requirements
collide with most general charting libraries:

1. **Financial semantics** — time scale with session gaps, crosshair with OHLC
   readout, candles, volume in a separate pane.
2. **Provenance is mandatory** — synthetic data must be visibly labelled as
   synthetic on the chart itself (`provenanceLabel()`), not only in a banner.
3. **No execution affordance** — no order-line, position or "buy/sell" control
   may exist anywhere near a chart.

## Decision

**TradingView Lightweight Charts**, wrapped in a single internal
`ChartAdapter` component.

- The adapter is the only place a chart is instantiated; screens pass `Bar[]`
  and metadata, never provider payloads.
- The adapter always renders the provenance label and a read-only marker; it has
  no props that can produce an order ticket, position box or alert-to-trade
  control.
- The adapter is Typed to the market-data layer, so a chart cannot be fed
  unvalidated data.
- License: Apache-2.0 wrapper library, canvas rendering (cheap for large series,
  no per-candle DOM nodes). Attribution is retained in the component.

## Alternatives rejected

| Alternative             | Why rejected                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Recharts                | React-idiomatic but SVG-based and not built for 10k+ candles or financial crosshair semantics; performance collapses at target sizes. |
| Apache ECharts          | Powerful and broad, but much heavier than needed and its candlestick/scale ergonomics are generic rather than trading-first.          |
| Chart.js (+ financial)  | Not candle-first; the financial plugin adds another dependency layer for a capability we would still have to wrap.                    |
| Highcharts              | Commercial license terms are unnecessary risk for a personal training tool.                                                           |
| Raw D3                  | Maximum control, maximum cost: axis/time-scale/interaction code is exactly the work we do not want to own for a training dashboard.   |
| Build candles ourselves | Reimplements canvases, zoom and crosshair with no safety benefit; the adapter boundary already gives us the isolation we need.        |

## Consequences

**Positive:** purpose-built financial rendering at low weight; one file to change
if the library is ever replaced (recorded as `locked-with-fallback`); provenance
and read-only guarantees are centralized instead of repeated per chart.

**Negative:** the library is opinionated about styling, so theme matching
requires configuration; advanced indicators (Bollinger, RSI panes) need explicit
work later.

**Security impact:** positive — the adapter is the single choke point for
enforcing the provenance label and the absence of trading affordances.

## References

- [technology-decisions.md § 1.4](../technology-decisions.md)
- [ADR-0012](./ADR-0012-ui-system-tailwind-radix.md)
- [`src/marketdata/provider.ts`](../../src/marketdata/provider.ts) (bar provenance)
