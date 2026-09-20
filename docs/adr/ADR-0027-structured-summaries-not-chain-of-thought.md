# ADR-0027 — Structured summaries only; chain-of-thought is never accepted or exposed

- **Status:** Accepted (Phase 3.5, architecture lock `DEC-AI-1-ABSTRACTION`)
- **Date:** 2026-09-20
- **Supersedes:** none
- **Refines:** [ADR-0004](./ADR-0004-llm-gateway-abstraction.md)

## Context

Until Phase 3.5, whatever a provider returned was the answer: free-form text went
straight from `LlmResponse.text` into the conversation view. That is a problem for
four distinct reasons, and only the first is cosmetic.

1. **Private deliberation would become product surface.** Reasoning models (and
   OpenAI-compatible servers imitating them) return their thinking in the same
   payload as the answer — `reasoning`, `reasoning_content`, `reasoning_details`,
   or Anthropic `thinking` blocks. Displaying it exposes an internal monologue the
   learner should never read as advice, and it is unstable, contradictory and
   unlabelled.
2. **Epistemic labels would be unenforceable.** A free-form paragraph can assert a
   number as a fact; nothing forces the model to distinguish fact, analysis,
   hypothesis and uncertainty. The project's core rule was a convention, not a
   property.
3. **A model could label its own claims as facts.** The system's premise is that
   deterministic tools own numbers, so a model calling its recollection a "fact"
   is the exact failure mode being designed against.
4. **Uncertainty would be omittable.** A model that is unsure can simply not
   mention it.

## Decision

**A model answers with a JSON object conforming to one contract, or the turn
fails. Deliberation is refused by name at every boundary.**

- `src/llm/summary.ts` defines the only accepted answer shape: `headline`,
  `statements[{kind, text, sources}]`, `uncertainty[]`, `toolRequests[]`. Extra
  fields are rejected; the field list is closed.
- `OUTPUT_CONTRACT` is injected into the system prompt on every request, so the
  requirement is stated to the model as well as enforced after it.
- **Chain-of-thought is rejected, not stripped.** A response containing a
  reasoning field (matched by name, normalised) or an inline `<thinking>`,
  `<analysis>`, `<scratchpad>` or `<reasoning>` block raises
  `POLICY_VIOLATION`, and the turn surfaces nothing. Silently removing it would
  hide a contract violation and reward the wrong behaviour.
- **Adapters drop deliberation before it can travel.** The OpenAI-compatible
  adapter never reads a reasoning field; the Anthropic adapter ignores `thinking`
  and `redacted_thinking` blocks. Reasoning tokens may still count toward cost —
  as a number, never as text.
- **`kind: "fact"` requires at least one source.** An unsourced assertion is a
  validation error, so the model cannot promote its own recollection to fact.
- **`uncertainty` is a first-class field** rendered by the interface, so an answer
  that knows what it does not know says so.
- **A tool-only turn carries no answer.** When the model asks for a tool and
  supplies no statements, the summary has empty `headline`/`statements`: the
  deterministic result is not in hand yet, and a guess at it would be the one
  thing this system must never present.
- **There is no fallback to raw text.** An unparseable answer is a failed turn
  (`VALIDATION_FAILED`), never a displayed paragraph.

## Alternatives rejected

| Alternative                                                       | Why rejected                                                                                                      |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Show the model's text as-is and label it afterwards               | The label is applied to whatever was said; nothing stops an unsourced number appearing inside it.                 |
| Strip reasoning blocks silently                                   | Hides a violation, produces an answer whose provenance is unknown, and trains the operator to ignore the signal.  |
| Ask the model in the prompt not to reason, then trust it          | A prompt is a request. Only post-conditions are guarantees.                                                       |
| Keep a second "reasoning" field for debugging, never rendered     | Anything stored is eventually displayed, logged or exported; the cheapest safe place for it is nonexistent.       |
| Markdown/prose output with a citation convention                  | Parsing prose for labels is a heuristic; the failure is silent and appears in production.                         |
| Return structured output for tool results but free text for prose | Splits the guarantee in two, and the prose half is the half learners read.                                        |
| Abort only the offending field                                    | A partial answer from a violating response is still a presentation of non-compliant output; the turn fails whole. |

## Consequences

**Positive:** the interface can only render labelled, sourced, contract-shaped
content; the "facts come from tools" rule is enforced at the boundary; a
provider's reasoning extensions cannot leak into the product; uncertainty is
visible by construction.

**Negative:** a model that ignores the contract produces a failed turn instead of
a mediocre answer, and the prompt grows by the contract text. Both are accepted:
a refused turn is recoverable and visible, an unlabelled claim is neither.

**Security impact:** positive — prompt-injected text cannot become a displayed
assertion, and hidden reasoning cannot be surfaced by a provider upgrade.

## References

- [ai-and-llm.md § 2](../ai-and-llm.md), [technology-decisions.md § 4](../technology-decisions.md)
- [ADR-0009](./ADR-0009-deterministic-tools-own-risk-math.md), [ADR-0019](./ADR-0019-llm-adapters-not-frameworks.md)
- Risk R1 (plausible but wrong guidance), R6 (trust laundering)
