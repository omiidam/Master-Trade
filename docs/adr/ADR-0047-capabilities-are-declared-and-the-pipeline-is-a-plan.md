# ADR-0047 — capabilities are declared, and the pipeline is a plan

- **Status:** Accepted
- **Decision id:** `DEC-CAPABILITY-1-DECLARED-AND-PLANNED`
- **Phase:** 5.7 (Agent Capability & Module Integration)
- **Supersedes:** nothing. **Depends on:** ADR-0007 (permissions are decided by the role table),
  ADR-0041 (input quality gates the output), ADR-0044 (the gate runs before the model),
  ADR-0045 (plans are code and entitlement only narrows), ADR-0046 (the portfolio is declared).

## Context

Phases 5.2–5.6 each built one module: the trading context, the quality gate, the usage
ledger, the portfolio engine, the evaluation engine. What none of them built is the thing
phase 5.1 said must exist instead of an all-knowing agent — a **capability** as a declared
unit of work, with the inputs it needs, the permission it requires, the credits it costs,
the engine that computes its figures, and the risk it carries.

Three questions had to be settled before any code could be written.

**What happens when a request matches nothing?** The failure mode of an agent platform is a
request that is _approximately_ matched: the model picks the nearest tool and runs it on the
wrong data. Deny-by-default is the only construction where that is impossible rather than
merely discouraged.

**Where does the decision to stop live?** The flow the phase asks for has eleven stages. The
tempting implementation is eleven `await`s, and the interesting behaviour — _which_ stage
refused, and why — has nowhere to live in that shape.

**Who may ask for what?** "No direct LLM-to-tool execution" is either a field somebody checks
or an emergent property of how the calls happen to be written. Only the first is auditable.

## Decision

**1. A capability is declared code, and an undeclared id does not exist.** `CAPABILITY_CATALOGUE`
is the complete set. `resolveCapability` returns `null` for anything else, and the first
pipeline stage refuses it — before input quality, before permission, before cost. There is no
fuzzy match, no nearest-neighbour resolution and no fallback capability.

**2. The catalogue is cross-checked against every other registry at boot.**
`assertCapabilityCatalogue` refuses a build in which a capability names an analysis type the
requirement table does not declare, a feature the entitlement catalogue does not define, an
operation the role table does not know, a cost that disagrees with the feature that owns it,
a `high-impact` capability whose `memoryPolicy` is not `cite-verified-only`, a capability that
claims figures while declaring no engine, or a capability that claims a module while declaring
nothing that needs it. A declaration that cannot fail is documentation, not a contract.

**3. The pipeline is a plan, not a call chain.** `planCapabilityRun` is pure: no I/O, no clock,
no provider. It returns either a refusal that names the stage it stopped at and the reasons, or
a plan that names the engine to run. `PIPELINE_STAGES` is the order as data, rendered by the
surface, so the diagram in the documentation and the behaviour in production cannot drift.

**4. The order is fixed, and three positions in it are load-bearing.**
_Readiness precedes permission_, so nobody is told they lack authority for something their
inputs cannot support. _Permission precedes entitlement_, because authority is not affordability —
a denied operation stops before a balance is read. _Entitlement precedes the engine_, so a
request that is going to be refused holds no credits: the plan contains **no credit movement on
a refusal at all**.

**5. Availability and readiness are two axes, and both are reported.** `available` /
`coming-soon` / `disabled` describes the build; `READY` / `READY_WITH_LIMITATIONS` /
`REQUIRES_CLARIFICATION` / `BLOCKED` / `UNAVAILABLE` describes this request. Saying only one of
them would mislead in both directions — inputs can be perfectly ready for something that is not
built, and something built can be blocked on a missing input.

**6. `modelMayRequest` makes the LLM boundary a declared property.** A capability the model may
not ask for is reachable only from a human or a job, and `humanOnly` is a separate field because
"the model may not" and "a person must decide" are different restrictions. No stage consults a
model about readiness, permission or cost; the explanation stage runs after all three have been
decided, and a refused capability never reaches a model at all.

**7. One result shape, whether it ran or was refused.** `CapabilityResult` carries the state, the
calculations with unit and provenance, the insights, the risks, the limitations, the uncertainty,
the usage and the next actions — and a refusal is the same shape with the reasons filled in. The
frontend renders it; it never parses prose, and it never derives a state from an availability.

**8. A figure the engine could not produce is an absence with a reason.** `null` is a state, not
a zero (ADR-0046), and the reason — `not measurable`, `not stated` — travels with it. No surface
is permitted to substitute a dash, and none may compute a difference the engine did not report.

**9. Deterministic work is free, and nothing execution-shaped exists.** `quality.assess`,
`portfolio.composition` and `decision.evaluation` cost zero credits because they run no provider:
a calculation must not stop working because a balance ran out. No capability declares an
order, a broker or an execution output, `liveTradingEnabled` and `brokerExecutionEnabled` remain
disabled, and the UI guard refuses execution vocabulary in any label the surfaces render.

## Consequences

- Every refusal is reproducible: the stage, the reason and the code come from the plan rather
  than from a code path, so the log answers "why was this refused" without a model's help.
- Adding a capability is a declaration plus an engine binding. Forgetting the permission, the
  cost or the memory policy fails the boot check rather than producing a capability with a hole.
- The frontend gains no authority: the catalogue arrives resolved through the API, and the
  surface renders states rather than deciding them. The one thing the UI is trusted with is
  presentation.
- The gate's verdict reaches a capability through one composition point, so a future capability
  cannot accidentally skip the readiness layer without failing the catalogue check.
- Deferred, with their triggers: per-execution persistence of capability runs (the audit record
  already carries the attempt, and a table would be a second source of truth until replay is
  needed), a job-requester execution path (the field exists and no job requests a capability
  yet), and the model-narrated half of portfolio and market analysis (declared `coming-soon`
  and still dependent on a market-data provider).

## Rejected alternatives

- **Resolve by similarity and let the model pick a tool.** The failure mode deny-by-default
  exists to prevent: a plausible match on the wrong data, with no way for the refusal to happen.
- **Eleven awaited steps in the request handler.** No single place owns the decision to stop, so
  "refused at readiness" becomes indistinguishable from a thrown error.
- **Check entitlement before permission.** Cheaper ordering, and it bills for work the user was
  never allowed to ask for.
- **Charge a reservation on a request that is refused downstream.** Tidy accounting is not worth
  taking credits for work that did not happen.
- **Fold availability into readiness.** One status that means two things cannot be explained to
  the person reading it.
- **Let the model narrate the readiness verdict.** ADR-0044 settled that the gate runs before the
  model; this ADR is where that rule became a field rather than a convention.
