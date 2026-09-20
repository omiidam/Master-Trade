# ADR-0026 — Cost is derived from our own price table, and an unpriced model is refused

- **Status:** Accepted (Phase 3.5, architecture lock `DEC-AI-2-GATEWAY`)
- **Date:** 2026-09-20
- **Supersedes:** none
- **Refines:** [ADR-0004](./ADR-0004-llm-gateway-abstraction.md), [ADR-0019](./ADR-0019-llm-adapters-not-frameworks.md)

## Context

The monthly budget is a safety control, not a dashboard number: it is what stops
an agentic loop from spending a learner's money unattended. Phase 2 left the price
of a call to the provider — `LlmResponse.usage.costUsd` was whatever the provider
reported, and a hand-rolled test double supplied it directly.

That is a control that cannot be trusted, for three reasons:

1. **A provider can under-report.** Spend is reported by the party being paid.
2. **A response is not evidence.** Providers echo a model id that may differ from
   the one we configured (a router, a dated snapshot, a silent downgrade), so even
   an honest report may describe a different call than the one we made.
3. **It made the budget unfalsifiable.** With no independent price, a bug that
   recorded zero cost would be indistinguishable from a free call.

## Decision

**The gateway computes cost from a price table we own and version, and it refuses
to call a model it cannot price.**

- `src/llm/pricing.ts` holds one row per (provider, model): USD per 1M input and
  output tokens, plus a note. Locally hosted models are priced at 0 because
  self-hosting genuinely costs nothing per token — a fact, not a placeholder.
- `LlmProvider` returns **token counts only** (`LlmTokenUsage`). There is no field
  in the provider contract that can carry money, so the mistake is structurally
  impossible rather than merely discouraged.
- The gateway prices the model **it requested**, never the model named in the
  response, and attaches `costUsd` plus `priced`.
- `UsageTracker.record()` sums the priced amounts; `BUDGET_EXCEEDED` is decided
  against that sum.
- When `requirePricedModels` is on (the default), an endpoint whose model has no
  row is refused with `POLICY_VIOLATION` naming the model — an unbudgetable model
  is an unaccountable one.
- If a provider reports no token counts at all, the gateway estimates them
  (~4 characters per token), marks the usage `estimated: true`, and still
  enforces the budget. Reporting 0 would silently disable the control.
- `createAiGateway()` warns at composition time about an unpriced configured
  model, so the refusal is visible before the first user question.

## Alternatives rejected

| Alternative                                                | Why rejected                                                                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Trust the provider's reported cost                         | The party being paid reports the spend; a bug becomes indistinguishable from a discount.                                 |
| Let each adapter compute its own cost                      | Cost would then be provider-shaped, and provider independence would end at the first price change.                       |
| Price the model the response claims                        | A response can name a cheaper model than the one called, deliberately or not; accountability follows what we configured. |
| Allow unpriced models and record cost as 0                 | Silently makes the budget unenforceable exactly where it matters most — a new, unfamiliar model.                         |
| Hard-code a single "default model price"                   | Wrong by a factor of tens between providers, and hides the fact that a decision was never made.                          |
| Estimate tokens and cost for every call to avoid the table | Estimate-only accounting cannot distinguish "cheap" from "we have no idea"; the flag matters more than the convenience.  |

## Consequences

**Positive:** the budget is enforced against a number we can derive and audit; a
price change is a reviewable diff; adding a model is a deliberate act; tests can
assert cost exactly (1,000 input + 100 output on `gpt-4o-mini` costs $0.00021).

**Negative:** the table drifts when a provider changes pricing, and a new model is
refused until a row is added. Both are accepted: an unpriced call is a bigger risk
than a refused one.

**Security impact:** positive — an LLM cannot influence the number that governs
whether it may be called again.

## References

- [technology-decisions.md § 4](../technology-decisions.md), [ai-and-llm.md](../ai-and-llm.md)
- [ADR-0004](./ADR-0004-llm-gateway-abstraction.md), [ADR-0019](./ADR-0019-llm-adapters-not-frameworks.md)
- Risk R12 (cost overrun), risk R23 (price-table drift)
