# ADR-0041 — Input quality gates the output

- **Status:** Accepted
- **Phase:** 5.1
- **Decision id:** `DEC-PRODUCT-2-INPUT-QUALITY`

## Context

Master Trade is about to grow capabilities that reason over information it does not control:
a portfolio, a set of holdings, a position size, a scenario. Today it only reads market data
it generates itself and memory it can label, so the question of _how good the inputs are_ has
not yet had to be answered.

It has to be answered now, because the alternative is to answer it accidentally. Every
plausible default is a product decision, and the tempting ones are the dangerous ones:

- Assume a conventional risk tolerance when the user has not stated one.
- Use the positions we last saw, without noting they may be stale.
- Average the confidence of a well-sourced price series with a guessed horizon and report
  the result as "input confidence".
- Answer the question asked, because refusing feels like a failure to the user.

Each of these produces **a confident answer to a question the system cannot actually
answer**, and the more precise the output looks, the worse the failure is — precision reads
as evidence. This is the same class of failure the project already guards against with
epistemic labels and provenance (ADR-0006, the trust ladder, `fact`-requires-a-source). Those
rules govern _how a statement is presented_. Nothing yet governed _whether an answer should
be attempted at all_, and nothing prevented the specific trap of treating a larger input set
as a better one.

The project has no durable store for capital, risk tolerance, horizon, holdings or
constraints (`docs/product-vision-system-architecture.md` §4.2). So this decision does not
only constrain future code — it sets a requirement that must be met _before_ the capabilities
that need those inputs can be built.

## Decision

**Output quality is bounded by input quality. The system states what it has, and behaves
proportionately to the weakest thing it is missing.**

1. **Every capability declares the inputs it requires.** Required is a property of the
   capability, not something inferred at runtime from whatever happened to arrive.
2. **Every input carries four properties:** present, reliable (user-stated / computed /
   inferred), current (against a freshness window that belongs to the input _kind_, not a
   global TTL), and internally consistent with the others.
3. **Confidence is the minimum, never the mean.**

   ```
   input confidence = min(presence, freshness, reliability) over every REQUIRED input
   ```

   A mean lets a well-sourced price series hide an assumed risk tolerance. The weakest
   required input governs, and **the output must name which input it is**.

4. **Conflicts are surfaced, never resolved silently.** When user-stated capital disagrees
   with a holdings sum, the system states the disagreement and asks. A silent choice is
   invisible to both the user and the auditor.
5. **Insufficient input descends a ladder and may never skip upward:**

   | Level | Condition                           | Permitted                                                               |
   | ----- | ----------------------------------- | ----------------------------------------------------------------------- |
   | L1    | complete, fresh, consistent         | full analysis, with assumptions and uncertainty                         |
   | L2    | non-critical input missing or stale | **ask clarifying questions**, then proceed only with the gap named      |
   | L3    | a required input missing            | **limited analysis**, scoped, explicitly naming what cannot be answered |
   | L4    | too little to analyse               | **labelled hypothetical** with all parameters visible                   |
   | L5    | missing, conflicting, untrustworthy | **refuse to recommend**; say what is missing and what would resolve it  |

6. **The level is visible in the product.** A limited analysis must be recognisable as
   limited, and why, without reading a log.
7. **More information is not automatically better.** Volume must not be mistaken for
   sufficiency: an inferred risk tolerance does not improve an answer, and a stale holdings
   list actively degrades one while increasing apparent authority.
8. **Required inputs get a durable home.** Capital, risk tolerance, horizon, holdings and
   constraints must be stored with their provenance and observation time before the
   capabilities that consume them are built.

## Consequences

- **L5 is a feature, not a failure.** The system will sometimes decline to produce a number.
  That is the intended behaviour and it must be presented as a capability, because a precise
  recommendation built on assumed inputs is worse than no recommendation — hedging language
  does not repair it ("approximately 12%, based on a risk tolerance we assumed" is a precise
  recommendation wearing a disclaimer).
- **Input validation becomes a testable module**, not a scattering of `if (!x) return`
  checks. It has declared requirements, a scoring function, a ladder and a recorded outcome,
  so it can be unit-tested the way the deterministic tools are.
- **The product needs somewhere to keep profile inputs.** This is the concrete dependency
  that places User Profile _before_ Portfolio Engine in the roadmap: without a durable store
  the module can only ask every session, and a capability that re-asks is one users will
  answer carelessly.
- **Every new capability must answer "what do you require?"** before it is built, which makes
  the dependency graph in §7.1 explicit rather than discovered.
- The existing market-data path already satisfies this for its own inputs (typed
  `DataProvenance`, NOT NULL provenance column, `validateBars()` quality report), so this
  decision extends an established pattern rather than introducing a new one.

## Alternatives considered

- **Assume sensible defaults and state them.** Rejected: it converts a known gap into an
  unknown one. The user reads the output, not the disclaimer, and a defaulted risk tolerance
  looks identical to a stated one in every downstream calculation.
- **Always ask for everything, always.** Rejected: it makes every simple question an
  interrogation, and users who are asked for information they do not need learn to answer
  carelessly — which degrades the inputs that _were_ required.
- **Average the confidence of the required inputs.** Rejected: statistically incoherent here.
  One weak required input does not become stronger because a different input is strong, and
  the average produces a middle number that describes none of the actual inputs.
- **Proceed at full scope but lower the tone of certainty.** Rejected: this is the failure
  mode the decision exists to prevent. Softer wording does not make an unanswerable question
  answerable, and it is harder to audit than a refusal.
- **Treat a larger input set as better.** Rejected explicitly: recency and relevance are
  properties of the _matching_ input. Ten thousand bars of the wrong symbol are not a richer
  input, and a longer answer built from more irrelevant context is a worse one.
- **Leave the principle to documentation without a schema or a test.** Rejected: the project's
  standing rule is that a guarantee enforced only by convention drifts. The
  `packages/trading-engine` extraction exists for exactly this reason, and the trust ladder is
  a database check constraint rather than a code review habit.
