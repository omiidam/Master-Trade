# ADR-0070 — The Response Pipeline: one centralized path from Agent execution to the user's response

- **Status:** Accepted
- **Decision id:** `DEC-AI-22-RESPONSE-PIPELINE`
- **Phase:** Response Pipeline (AI Workplace)
- **Depends on:** ADR-0027 (the structured summary contract that already
  refuses chain-of-thought at parse time), ADR-0065 (the Run Manager's
  terminal vocabulary and durable run records), ADR-0066 (the Agent Loop
  Engine whose settled result is the primary input) and ADR-0060 (the
  per-run harness whose assembly is the source of the internals the
  policy stage forbids).
- **Uses:** the existing summary primitives (`src/llm/summary.ts` —
  `stripReasoningBlocks`, `EPISTEMIC_KINDS`), consumed never duplicated.

## Context

Phases 2.6–2.10 built everything that _produces_ an answer: the harness,
the Run Manager, the Context Builder, the Agent Loop, the Tool Registry
and the permission gate. What did not exist was the single place where a
settled execution becomes something shown to a user. Each surface shaped
responses itself: the chat handler copied fields off the turn, and a
loop-driven consumer would have had to invent its own mapping from
`completed / blocked / failed / cancelled` to something a person reads.

That gap has four costs, and they are the requirements of this phase:

1. **Nothing structurally prevented a misleading success.** A run that
   hit a limit after two productive steps still carried its accumulated
   statements; a surface that rendered "the run's statements" would have
   presented a partial answer as a complete one. Honesty depended on
   every consumer re-deriving it.
2. **Nothing preserved the why.** Run id, stop reason, usage and whether
   the response was ever validated lived in different places — or
   nowhere — by the time a response left the backend.
3. **Nothing enforced what may leave.** The output contract (ADR-0027)
   refuses chain-of-thought _at parse time_, on the model's own output.
   Between execution and the user sits more material than model output —
   system instructions the run assembled, context digests, tool
   execution records, error messages — and none of it was checked against
   the outgoing text.
4. **Nothing distinguished the non-answers.** "There is no answer" is
   several different facts: the run was stopped, it errored, it was
   cancelled, it finished but still needs input, or the data never
   arrived. Surfaces could not tell them apart because the vocabulary
   did not exist.

## Decision (`DEC-AI-22-RESPONSE-PIPELINE`)

One centralized pipeline — `src/agent/responsePipeline.ts`,
`runResponsePipeline()` — sits between Agent execution and the final
user response, as the only path a response takes to become text. It is
pure and UI-independent: same input, same plain-data result; no clock, no
I/O, no rendering. Two input builders define the two execution seams:
`responsePipelineInputFromLoop()` (a settled `AgentLoopResult` with the
Run Manager's run id) and `responsePipelineInputFromTurn()` (one service
turn behind `agent.chat`).

### Five explicit stages, always in this order

1. **Result normalization** — one defensive shape for every input: run
   id, run status, stop reason, usage, statements, summary, outstanding
   tool requests, a candidate reply, and the internals the policy stage
   will forbid (harvested from the run: system-instruction lines, context
   digests, tool execution ids and details). A malformed input is a
   violation _here_, never a surprise downstream.
2. **Response validation** — does the answer that would ship hold
   together: statements with a known epistemic kind, non-empty text,
   well-formed sources. Nothing to validate (a run that never completed,
   or completed with no statements) is recorded as `skipped` — never
   silently `passed`.
3. **Policy check** — may this text reach the user at all. The outgoing
   pool is scanned for inline reasoning markup (`<thinking>` and its
   kin, via the same primitive the summary contract uses), stack traces,
   secret-shaped material (provider keys, tokens, private-key blocks,
   assigned secrets), and the verbatim internals collected in stage 1. A
   hit **withholds the whole response** with a stage-tagged violation
   code; nothing is quietly stripped, because stripping would hide the
   contract violation.
4. **Uncertainty handling** — the summary's `uncertainty` notes are
   carried (never silently dropped), and the stage decides whether an
   answer exists at all: an answered run, a run that still needs
   clarification (finished with outstanding tool work), or a run whose
   data never arrived.
5. **Final response formatting** — the user-facing text for the decided
   kind, the epistemic label (a single statement keeps its own; a mixed
   answer is never upgraded to `fact`), and the preserved metadata.

### Five outcome kinds — and only five

`completed` (a completed answer), `clarification` (clarification
required), `blocked` (blocked response), `failed` (failed response),
`unavailable-data` (unavailable-data response).

The mapping is total and honest:

- run `failed` → `failed`; run `blocked` or `cancelled` → `blocked`
  (a cancellation _prevented_ the response, it did not error — and
  `metadata.runStatus` says exactly which, so nothing is misrepresented);
- a completed run whose answer failed validation or policy → `blocked`
  (withheld);
- a completed, clean run → `completed` when statements exist,
  `clarification` when tool work is still outstanding, otherwise
  `unavailable-data`.

**The honesty rule:** only `kind: 'completed'` carries statements, and
`success` is true only then. Blocked, failed, cancelled and incomplete
runs drop their partial material in full — statements and uncertainty
alike — so no non-completed outcome can be rendered as a hedged or
partial success.

### Metadata preserved on every outcome

`metadata` carries the run id, the run status, the loop's stop reason
_verbatim and structured_, the usage counters, the validation status
(`passed / failed / skipped`, the stage that decided it, and its
stage-tagged violation codes), and a verdict for each of the five stages
in execution order — so "the pipeline checked" is evidence a consumer
can read, not a claim.

### Leakage prevention

Free-text internal messages never enter the reply. A failed run gets a
fixed, honest sentence; the stop reason's message (which can carry
paths, provider errors, anything) stays in `metadata.stopReason` for
internal consumers. The same rule covers tool internals: execution ids,
refusal details and serialized records are stage-1 forbidden values, and
a response reproducing one is withheld — while tool _names_ in
`sources` remain what they always were, provenance shown to the user.

The `agent.chat` handler finalizes every response through this pipeline:
the reply, epistemic label, statements and status of the payload it
shapes are the pipeline's decision, and its kind, run id, stop-reason
code and validation status ride along as response metadata. A refusal
candidate is preserved as the reply when it passes the policy check —
the refusal _is_ the reply — but it never overrides the decided kind.

## Consequences

- One place decides what a response _is_: five stages, five kinds, one
  honesty rule, checked by tests that hold the stage order, the kind
  mapping, the metadata and every leak class. A surface renders; it no
  longer decides whether a partial run looked successful.
- Terminal honesty now extends all the way to the user's eyes: the Run
  Manager's `completed / blocked / failed / cancelled` maps onto a
  response vocabulary that cannot lie about it, and an incomplete answer
  classifies itself as clarification or unavailable data rather than
  shipping empty.
- Leak prevention is a checked property, not a convention: reasoning
  markup, system instructions, digests, tool records, secrets and stack
  traces each withhold the response with a greppable code.
- The pipeline is additive and independent from UI rendering: the Agent
  Loop, Run Manager, Harness, Context Builder, Tool Registry, permission
  gate and LLM Gateway are untouched, and the result is plain JSON any
  surface can draw.
- Out of scope, unchanged: evaluation, observability, diagnosis, quality
  gates, memory consolidation, learning; no chain-of-thought exposure
  (the pipeline never has reasoning to expose — upstream contracts
  refuse it); no mock responses — every non-completed kind states what
  happened and asserts nothing.
