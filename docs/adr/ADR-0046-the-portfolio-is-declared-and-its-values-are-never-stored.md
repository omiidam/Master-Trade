# ADR-0046 — the portfolio is declared, and its values are never stored

- **Status:** Accepted
- **Decision id:** `DEC-PORTFOLIO-1-DECLARED-NOT-STORED`
- **Phase:** 5.5 (Portfolio Intelligence Foundation)
- **Supersedes:** nothing. **Depends on:** ADR-0041 (input quality gates the output),
  ADR-0042 (portfolio output is analysis, not advice), ADR-0044 (the gate runs before the
  model).

## Context

Phase 5.1 placed Portfolio Intelligence on the roadmap with two constraints that decide the
architecture: the output is **analysis rather than advice**, and no holding, price or figure may
be invented. Phase 5.3 built the gate that refuses an analysis on insufficient input, and
phase 5.4 built the metering layer that decides whether a capability may run at all.

What was missing was the thing itself: a place to record what an account holds, and deterministic
code to value it. Two design questions had to be settled before any of it could be written.

**Where does a value live?** A portfolio's market value is a function of a price, and a price
moves. Any stored total is therefore either wrong or a second source of truth that drifts — and
the drift is invisible, because a stale total looks exactly like a correct one.

**What happens when the document cannot support a figure?** A portfolio is usually partially
declared. Some positions have prices, some have only quantities, some have only a declared share.
The tempting answer is to fill the gaps: carry a price forward, assume a cost basis, treat a
missing quantity as zero. Each of those turns an absence into a number nobody can distinguish
from a real one.

## Decision

**1. Nothing about value is stored.** The database holds the _declaration_ — the container, the
current positions and an append-only snapshot per version — and no column, method or return value
carries a market value, a cost basis, a share or a return. Every figure is computed from the
declared document each time it is asked for, by `packages/trading-engine`. A stored total would
be a second source of truth, and a drifting one is worse than a missing one.

**2. `null` is a state, not a zero.** An absent, malformed or untrustworthy input produces no
figure at all, and the reason travels with it: the assessment names the finding
(`price-missing`, `price-stale`, `price-unverified` are three different absences) and the metrics
name the gap and what would close it. No value is estimated, carried forward or defaulted.

**3. A price is all-or-nothing.** A price is used only with a value, a currency, an observation
time and a provenance reference. A price with no observation time is not a slightly stale price —
it is one whose age cannot be established, and the engine treats it as an assumption that a
finding names.

**4. A share of the whole requires the whole, in one currency.** The market-value population is
formed only when every position in the document could be valued _and_ the document sits in one
currency. A ratio over two currencies divides money by money that is not the same money, so the
same rule that refuses a combined total refuses the population — and the `mixed-currency` gap
says so. Each position's own value is still reported, in its own currency.

**5. Two populations, never a hybrid.** Concentration is computed over declared weights and over
market values as two separate sets, each naming its basis and its coverage. A concentration figure
over a mixture of the two would be a number nobody could check.

**6. Readiness is composed, and may only narrow.** `assessPortfolioReadiness` takes the phase 5.3
verdict for the scope as an **input** and has no branch that reverses it. The portfolio layer can
add a refusal — an incomplete document, a mixed currency, a missing price — and can never remove
one. Both layers are returned, so a surface can say which one refused.

**7. The declarative surface is the only write, and it replaces the composition.** A declaration
is one transaction: the container, the positions deleted and re-inserted as a whole set, then the
snapshot. A partially applied redeclaration would leave a portfolio that is half what the user
described and half what they meant, and every figure computed from it would be wrong in a way no
surface could show. Position ids are minted server-side, so a client cannot name a row it does not
own.

**8. The deterministic half is free.** `portfolio.composition` costs zero credits and names
`portfolio.read` as its operation, because it runs no provider: the arithmetic is code over the
user's own declaration. ADR-0041's rule is that a calculation must not stop working because a
credit ran out. The model-narrated `portfolio.analysis` stays declared at five credits and
`coming-soon`, and **no tier includes an approval-gated operation**.

**9. The document is the only input, and user text stays in the document.** `note` is the one
free-text field: it is stored and returned to its author and is never copied into a finding, an
insight or a log line. Insights are written by the engine in its own words, which is why they can
be rendered and logged verbatim.

## Consequences

- A portfolio reading is reproducible from the snapshot it names, which is what makes it
  reviewable: the composition an analysis was computed from is recoverable exactly as it was.
- An analysis of a partially declared portfolio produces _fewer_ figures rather than approximate
  ones, and says which. This is the ADR-0041 ladder applied to a document instead of a context.
- The engine is a pure function of `(document, clock)`, enforced by the monorepo boundary test
  that refuses an import of the LLM layer, the database, the server or a `node:*` builtin from
  inside `packages/trading-engine`.
- PostgreSQL compatibility is preserved: the migration is per-dialect, the repository uses the
  schema toolkit rather than hand-written SQL, and no JSON is queried.
- A future market-data provider can supply prices with provenance without changing the engine:
  a price is a price, and its source is already a field. That is the remaining prerequisite for
  scenarios, correlation and the model-narrated half (product vision §7.1).
- Deferred, with their triggers: scenario evaluation and correlation (need a series per holding),
  per-version document retrieval (a read of an old version is a different question from a
  timeline), portfolio-level cash modelling, and any _aggregate_ multi-user view (which the
  product deliberately does not have).

## Rejected alternatives

- **Store a materialised valuation.** Fastest to read and wrong the moment a price moves, with no
  way for a reader to tell.
- **Convert currencies with a hard-coded rate.** A rate that is not sourced is a number presented
  as a fact; grouping is honest and costs one extra field.
- **Merge declared weights and market values into one concentration figure.** Tidier, and
  meaningless: the two populations answer different questions.
- **Treat a missing quantity as zero.** A zero-share position is a statement that the account does
  not hold it, which is the opposite of "not declared".
- **Meter the declaration.** Metering accounts for consumption; a declaration consumes nothing.
  Metering it would blur what the platform did with what the user said.
