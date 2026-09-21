# Portfolio Intelligence

**Status:** the deterministic half is **implemented** (Phase 5.5). Scenario evaluation,
correlation and the model-narrated analysis are **deferred**, with their prerequisites named.
**Decision record:** [ADR-0046](./adr/ADR-0046-the-portfolio-is-declared-and-its-values-are-never-stored.md).
**Depends on:** [input-quality-and-data-reliability.md](./input-quality-and-data-reliability.md)
(the gate this composes), [user-profile-and-trading-context.md](./user-profile-and-trading-context.md)
(where the risk tolerance and horizon come from).

## 1. What the layer answers

Two questions, and nothing else:

| Scope                   | The question                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| `portfolio.composition` | How is the portfolio put together, in what proportion?                                              |
| `portfolio.risk`        | What is the composition exposed to, read against the risk tolerance and horizon that were declared? |

Neither is a forecast and neither proposes a target. There is no profitability claim anywhere in
the layer, and no position sizing: those are the ADR-0042 boundaries, and they are why the engine
owns the arithmetic and the model owns none of it.

## 2. The domain model

`packages/shared/src/portfolio/model.ts`

- **`Portfolio`** — identity, name, base currency, optional cash weight, the positions, and the
  created/updated instants. `PortfolioPosition` carries `quantity` and `averageEntryPrice` as
  `ContextField<number>` (value + source + observation time, exactly as the trading context does),
  an optional `price` with its own provenance, and an optional declared `weightPercent`.
- **`PositionState`** — the _reading_ of a position: what was usable, at what age, with which
  findings. `null` everywhere means "not usable", never "zero".
- **`PortfolioDocumentAssessment`** — per-position readings, the currency set, the coverage counts,
  the declared-weight sum, the freshness range, the findings and the worst severity.
- **`PortfolioMetrics`** — totals (money, by currency), cost basis, unrealised P/L, the two weight
  populations, coverage, assumptions and gaps. **No value is stored anywhere.**
- **`PortfolioInsight`** — one of eight closed types, three severities (`observation`, `watch`,
  `elevated`), always with metrics, sources, assumptions, confidence, a timestamp and limitations.
- **`PortfolioSnapshot`** — an append-only version holding the whole document as it was.

Nineteen **closed** issue codes give every absence, malformation and contradiction a stable name.
`detail` is written by the code that raises it, so no user text can enter an assessment — which is
why an assessment needs no redaction pass and can be logged verbatim.

## 3. Calculation rules

`packages/trading-engine/src/portfolio.ts` — pure, no clock read (`now` is an input), no network,
no database, no model. That constraint is enforced by `tests/monorepo-boundary.test.ts`.

| Figure               | Rule                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------- |
| Market value         | `quantity × price`, only when both are usable. Never derived from a declared weight.                    |
| Cost basis           | `quantity × averageEntryPrice`, only when both are usable.                                              |
| Unrealised P/L       | `marketValue − costBasis`; `null` when either side is missing.                                          |
| Share of the whole   | Only when **every** position was valued **and** the document is single-currency. Otherwise `null`.      |
| Declared weights     | Used as declared, with the population's total reported so a set that does not sum to 100 is visible.    |
| Concentration        | Top 1/3/5, HHI over fractional shares, `1 / HHI` effective positions — per population, with its basis.  |
| Rounding             | Half-up on the absolute value, so a loss and a gain round the same way.                                 |
| Mixed currencies     | Grouped per currency. **Never converted**: no rate source is wired, so a combined total is refused.     |
| Zero/negative values | Refused at the schema bound: a quantity, price or weight must be positive. `null` is the absence state. |

Thresholds for the concentration and horizon observations are declared constants with a stated
meaning (`CONCENTRATION_WATCH_PERCENT = 25` means four equal positions; `HHI_WATCH = 0.15` is
roughly seven). They are **reporting** levels, not limits and not targets.

## 4. The readiness gate

`packages/shared/src/portfolio/readiness.ts` — composed from the phase 5.3 verdict, and it can
only narrow it:

```
readiness = worse(base.readiness, documentReadiness)
```

`documentReadiness` is derived from a **declared rule per scope per code**: the same gap costs
different things depending on the question. Three deliberate asymmetries:

- a **missing price** does not stop a composition (\"30% in three ETFs\" is complete without a
  price) but does stop a risk characterisation — `limit` for one scope, `clarify` for the other;
- an **incomplete valuation** is a limitation, not a refusal: each priced position's own value is
  correct, and what cannot be produced is a share of the whole;
- **an invalid value always blocks** — a malformed quantity is not a smaller quantity, and asking
  a question about it would be the system negotiating with a typo.

Outcomes: `READY_FOR_ANALYSIS`, `READY_WITH_LIMITATIONS`, `REQUIRES_CLARIFICATION`, `BLOCKED`.
Every decision carries the base verdict it was composed with, the findings behind the portfolio
half, the questions worth asking, the rule that decided it (`decidedBy`) and its own note.

## 5. Provenance and freshness

- A price is used only with `value`, `currency`, `observedAt` and a `provenance` reference
  (`source`, `ref`, `trust`, `recordedAt`). **A price with no observation time is an assumption**,
  and a finding says so rather than the age being guessed.
- `trust` is `unverified` for anything a user typed. Only a provider can make a price
  `verified` or `authoritative` — which is why the declared form marks its own input as
  `unverified` rather than pretending otherwise.
- `PORTFOLIO_PRICE_MAX_AGE_HOURS = 72` is the window a price is treated as current. Beyond it the
  price is `price-stale`: still usable, always named.
- Prices are never carried forward. An old price stays as old as it is, and the gap it leaves is
  reported.

## 6. What is stored, and what is not

`src/db/migrations/0004_portfolio_intelligence.ts` — three tables:

- `portfolios` — the container: identity, name, base currency, cash weight. **No total.**
- `portfolio_positions` — the current composition. **No value, no share, no return.** Replaced as
  a whole inside one transaction, never patched row by row.
- `portfolio_snapshots` — append-only history, one row per version holding the whole document.
  There is no update and no delete: a change appends `n+1`.

Ownership is `portfolio`, so `repositoryCoverage()` in the database suite proves every table has
exactly one owning repository, and the drop order is derived from the schema rather than written
by hand.

## 7. API

| Route               | Operation         | Notes                                                                                                     |
| ------------------- | ----------------- | --------------------------------------------------------------------------------------------------------- |
| `GET /v1/portfolio` | `portfolio.read`  | The composition, the assessment, the metrics, the insights, both readiness verdicts and the version list. |
| `PUT /v1/portfolio` | `portfolio.write` | Declares or replaces the composition; the server mints every id and assigns the version.                  |

No route accepts a subject — not in the path, not in the body, not in the query — so reading or
writing another account's portfolio is **unrepresentable** rather than merely forbidden. The
bodies are strict: a client that sends `marketValue`, `version` or `userId` gets a validation
error rather than a silently ignored field.

**Metering.** `GET /v1/portfolio` is metered through `portfolio.composition`, which costs zero
credits and names `portfolio.read` as its operation. The entitlement is still resolved and the
attempt is still recorded, because the balance is not the only reason a capability can refuse —
a role, a plan, a period cap or a deliberate hold can all say no. The declaration is **not**
metered: a declaration consumes nothing, and metering it would blur what the platform did with
what the user said.

## 8. Frontend

`web/src/pages/PortfolioPage.tsx` — one sidebar entry, six internal tabs: overview, holdings,
allocation, observations, quality, declare.

Components (`web/src/components/portfolio/`): `PortfolioOverview`, `PortfolioValueCard`,
`HoldingsTable`, `AssetAllocationChart` (+ `AllocationPair`), `ConcentrationRiskCard`,
`RiskExposurePanel`, `PortfolioInsightCard` (+ list), `PortfolioQualitySummary`,
`PortfolioReadinessPanel`, `MissingHoldingData`, `PortfolioSnapshotTimeline`, `HoldingsEditor`.

Three rules the surface keeps, and `tests/frontend-portfolio.test.ts` proves them rather than
trusting them:

1. **Every number is the server's.** No component multiplies, divides or sums a position, and the
   concentration card reads the engine's verdict instead of re-deriving a band (an earlier version
   compared the top share against a threshold copied into the browser, which could have disagreed
   with the insight beside it).
2. **`null` is rendered as absent.** The formatter is the one place a missing figure becomes text,
   and it becomes an em dash. A zero would have been a factual claim.
3. **No fixture stands in for an account.** With no session the page shows the resolver's own
   reason, and nothing is drawn in its place.

## 9. Security and privacy

- Deny-by-default: `portfolio.read` and `portfolio.write` are separate operations, granted to the
  learner; an **observer reads and cannot declare**.
- A holding can be somebody's entire financial position, so no log line carries a symbol, a
  quantity, an amount or the portfolio's name — only counts, codes and the version.
- `note` is the one free-text field, is never logged and never enters a finding or an insight.
- Live trading, broker execution and order placement remain disabled and are refused at boot:
  `assertNoHardlineOperations()` has no exception for this layer, and the engine has no vocabulary
  for an order.
- No secrets, no rate provider keys and no external service call exist in this layer.

## 10. Future market-data integration

The engine takes prices as **declared data with provenance**, so a provider can start supplying
them without changing a single calculation rule:

1. a provider writes prices with `source: 'market-data'`, a `ref` and `trust: 'verified'|'authoritative'`;
2. the `price-unverified` finding stops firing for those positions;
3. `price-stale` becomes a real age check against a live clock rather than against a user-typed
   instant;
4. scenario evaluation and correlation become possible, because they need a **series per holding**
   — which is the same missing provider the input-quality gate already reports as
   `market-data-unavailable`.

Until then, `portfolio.risk` is gated on the document rather than on a provider, and the
model-narrated `portfolio.analysis` stays `coming-soon` at five credits.

## 11. Deferred, with triggers

| Deferred                                      | Trigger to revisit                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------ |
| Scenario evaluation, correlation, hedging     | A registered market-data provider with a series per holding                    |
| Model-narrated portfolio analysis (5 credits) | The above, plus a turn that can carry the metrics as tool output               |
| Reading a specific old version's document     | A review flow that needs the composition behind an analysis, not just its date |
| Cash as a first-class position                | A user for whom the declared cash weight is not enough                         |
| Portfolio-level tax or fee modelling          | A jurisdiction-specific requirement, and legal review                          |
| Aggregate or multi-user positions             | Not planned: the product has no aggregate view by design                       |
