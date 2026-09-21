# ADR-0042 — Portfolio output is analysis, not advice

- **Status:** Accepted
- **Phase:** 5.1
- **Decision id:** `DEC-PRODUCT-3-NOT-ADVICE`

## Context

Master Trade is a training and decision-review environment (ADR-0002 fixes it as a
single-process local application; ADR-0007 makes authorization deny-by-default; ADR-0009
puts all risk math in deterministic tools and forbids the model from bypassing permission
checks). It has, so far, said nothing about **what class of output it is allowed to
produce** once it starts reasoning about a user's actual portfolio rather than about
educational examples.

That gap matters because the planned capabilities in
`docs/product-vision-system-architecture.md` §3 change the character of the output. Analysing
a textbook position size is general information. Analysing _this user's_ holdings, against
_this user's_ stated horizon, and producing a number they will act on, sits on a boundary
that is drawn differently in different jurisdictions and that depends on framing and
personalisation — not on a technical property.

The project is in no position to resolve that legal question, and it must not pretend to. But
it _is_ in a position to make an engineering decision that keeps the product on the safe side
of the boundary: **the system describes and quantifies; it does not resolve the user's
ambiguity on the user's behalf.**

That framing also happens to be the honest one, and it is the same discipline as ADR-0041:
a system that fills in a missing risk tolerance to produce a cleaner recommendation is
making a personal judgement call for the user. Refusing to make that call is both the safer
and the more truthful behaviour.

## Decision

**Portfolio output is analysis of a composition the user described. Master Trade does not
produce personalized investment advice, and must not be built, marketed or phrased as though
it does.**

1. **Describe, quantify, and disclose — never instruct.** The output states what was
   measured, over what window and sample, what the user's own stated constraints say, what is
   uncertain, and what would change the answer.
2. **The system does not resolve the user's ambiguity.** A conflict between a stated horizon
   and a holding's described thesis is surfaced as a question, never settled by choosing the
   more convenient reading (ADR-0041 §4).
3. **No "you should" about a specific user's position.** Educational framing belongs to the
   Agent Core and must be sourced to the curriculum; the Portfolio Engine produces
   measurements and constraint checks, not recommendations.
4. **Assumptions are structured data, not prose.** Method, window, sample size and
   limitations travel with the numbers so they cannot be detached from them.
5. **A constraint breach is reported as a breach** — "34% in one sector, above the 25% limit
   you stated" — not as an instruction to correct it.
6. **Scenarios are labelled hypothetical**, with parameters visible, and are never presented
   as forecasts. Historical correlation and volatility are described as observed, never as
   expected future values.
7. **No profitability claim, and no predictive claim.** Nothing may state or imply that past
   results predict future ones, including an evaluated decision's own hit rate (risk R13;
   `inconclusive` is a first-class verdict).
8. **Jurisdiction review is a release gate.** No capability in §3 ships in a market before
   qualified counsel has reviewed the items in §6.6 of the architecture document. The
   decision recorded here keeps the product on the conservative side while that review is
   outstanding; it is not a legal conclusion and does not substitute for one.

This ADR is normative wording, not a UI convention. Any surface that phrases a measurement as
an instruction to a specific user is a defect against this decision.

## Consequences

- **The analysis/advice boundary is a documentation and review artefact, not case law.** It
  gives reviewers something concrete to assess — a table of permitted and forbidden outputs
  — instead of an unbounded claim about the product's character.
- **Some capabilities are deliberately less useful than they could be.** A system that says
  "reduce technology exposure" is more satisfying than one that says "you are 34% in
  technology, above your stated 25% limit". The second is what ships.
- **Marketing and product wording is constrained too.** Describing Master Trade as an "AI
  advisor" or a "portfolio recommendation engine" contradicts this decision and is a defect,
  not a copy choice.
- **`docs/product-vision-system-architecture.md` §6.6 becomes the gate list** for the
  capabilities that depend on this decision, and it is deliberately phrased as
  "Requires validation" rather than answered.
- **The existing safety posture is unchanged.** This decision adds no mechanism and removes
  none: trading stays absent, permissions stay deny-by-default, and the model still cannot
  execute anything.

## Alternatives considered

- **Ask counsel first, and defer the product decision until then.** Rejected: the review
  cannot begin without a concrete position to review. Stating the intended boundary makes the
  review tractable and gives it an artefact to challenge; waiting produces neither.
- **Ship a disclaimer and full recommendations.** Rejected: this is the pattern the decision
  exists to avoid. A disclaimer does not change what the system did — it resolved the user's
  ambiguity and told them what to do — and it puts the entire product on the regulated side of
  a boundary while pretending otherwise.
- **Restrict to education only and never touch a user's real portfolio.** Rejected: it
  removes the capability the product is being built for, and the analysis of a described
  composition is legitimately useful without being advice. The boundary is about what the
  system _concludes_, not about whether it looks at real holdings.
- **Let the model decide how to phrase each answer.** Rejected outright: it makes the
  boundary non-deterministic and untestable, and the model is exactly the component with an
  incentive to be helpful by being specific. The boundary must be structural.
- **Treat this as a wording guideline in a style guide.** Rejected: a guideline is not
  enforceable and drifts. The project's convention is that a guarantee which matters gets a
  decision id, a document and a check.
