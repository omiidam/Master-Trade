# Capability integration — Phase 5.7

**Status:** implemented. Everything marked _planned_ or _deferred_ below is labelled where it
appears, and nothing in this document describes a feature as shipped that is not.

Phase 5.7 makes Master Trade one coherent capability system rather than a set of modules that
happen to share a database. It introduces the missing unit of work — the **capability** — and one
orchestration path that every request, from a person or from a model, travels through.

The design decision is recorded in
[ADR-0047](./adr/ADR-0047-capabilities-are-declared-and-the-pipeline-is-a-plan.md). This document
is the reference: the model, the catalogue, the lifecycle, the gates, the integrations, the
surface, and what remains.

## 1. The core principle, made structural

Agent output quality depends on the quality of what it was given. The phase's principle — never
silently treat incomplete, conflicting, stale or unverified information as reliable — is not a
guideline in this codebase; it is the shape of the pipeline:

- **Readiness is decided before authority and before cost.** A capability whose inputs cannot
  support it is refused at `readiness`, so nobody is told they lack permission for something
  their inputs could not support anyway.
- **A refusal is a value, not an exception.** It carries the stage it stopped at, a code and the
  reasons, and is rendered as data.
- **Nothing is charged for work that did not happen.** The plan contains no credit movement on a
  refusal at all (ADR-0045's reservation happens in the engine stage, which a refusal never
  reaches).

## 2. The capability model

`packages/shared/src/capabilities/model.ts` defines the contract; `registry.ts` holds the
catalogue. A capability declares:

| Field                                  | Meaning                                                                                                                                                                                                               |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `name`, `description`            | Stable identity. The id is the only way a request can name it.                                                                                                                                                        |
| `category`                             | One of `education`, `assessment`, `market-analysis`, `portfolio-analysis`, `decision-evaluation`, `research`, `memory`, `reporting`.                                                                                  |
| `modules`                              | The product modules it composes (`agent-core`, `knowledge-memory`, `market-intelligence`, `portfolio-engine`, `evaluation-engine`, `usage-subscription`, `user-profile`, `web-application`). Checked, not decorative. |
| `analysisType`                         | The analysis type in the phase 5.3 requirement table whose declared inputs gate it, or `null` for the gate itself.                                                                                                    |
| `feature`                              | The metered feature that owns its cost, or `null` when unmetered. Never a second cost.                                                                                                                                |
| `operation`                            | The operation the role table decides (ADR-0007), or `null`.                                                                                                                                                           |
| `engineCapability`                     | The deterministic engine tool that owns its arithmetic, or `null`. A string, because `packages/shared` must not depend on the engine that depends on it.                                                              |
| `modelMayRequest`, `humanOnly`         | Whether a model may ask for it, and whether only a person may trigger it. Two fields, because they are two different restrictions.                                                                                    |
| `availability`, `riskLevel`, `outputs` | Build state, weight, and what the result may contain.                                                                                                                                                                 |
| `producesFigures`                      | Whether it produces numbers at all. Checked against its declared engine.                                                                                                                                              |
| `memoryPolicy`                         | `cite-verified-only` or `may-cite-unverified`. `high-impact` capabilities must use the former.                                                                                                                        |
| `provenance`                           | Whether provenance is required, which labels are permitted, and the requirement in words.                                                                                                                             |
| `claims`                               | What the result claims — and, explicitly, what it does not.                                                                                                                                                           |

### The catalogue

| Capability              | Category            | Availability | Risk          | Operation                       | Feature (cost)              | Engine                | Model may ask |
| ----------------------- | ------------------- | ------------ | ------------- | ------------------------------- | --------------------------- | --------------------- | ------------- |
| `education.explain`     | education           | available    | informational | `agent.chat`                    | `agent.chat` (1)            | —                     | yes           |
| `quality.assess`        | assessment          | available    | informational | `quality.assess`                | `quality.assess` (0)        | —                     | no            |
| `portfolio.composition` | portfolio-analysis  | available    | advisory      | `portfolio.read`                | `portfolio.composition` (0) | `portfolio.calculate` | yes           |
| `decision.evaluation`   | decision-evaluation | available    | high-impact   | `decision.evaluate`             | `decision.evaluation` (0)   | `decision.evaluate`   | yes           |
| `portfolio.risk`        | portfolio-analysis  | coming-soon  | high-impact   | —                               | `portfolio.analysis` (5)    | —                     | yes           |
| `market.structure`      | market-analysis     | coming-soon  | advisory      | —                               | —                           | —                     | yes           |
| `research.report`       | research            | coming-soon  | advisory      | —                               | `research.report` (10)      | —                     | yes           |
| `backtest.run`          | research            | coming-soon  | advisory      | `backtest.run` (approval-gated) | `backtest.run` (25)         | —                     | no            |
| `memory.export`         | memory              | disabled     | informational | `file.download`                 | `memory.export`             | —                     | no            |

Two entries are deliberately priced at nothing. `quality.assess` and the two shipped
deterministic capabilities run no provider, and ADR-0041's rule is that a calculation must not
stop working because a credit ran out. The three coming-soon entries carry a declared cost and no
engine: a price list with no purchasable product behind it is honest only while the availability
says `coming-soon`, which is why no tier includes an approval-gated operation (ADR-0045).

### Boot invariants

`assertCapabilityCatalogue` runs at boot and refuses a build in which:

- a capability names an **analysis type** the phase 5.3 requirement table does not declare;
- it names a **feature** the entitlement catalogue does not define, or a **cost** that disagrees
  with the feature that owns it;
- it names an **operation** the role table does not know;
- a `high-impact` capability's `memoryPolicy` is not `cite-verified-only`;
- it claims to produce figures while declaring no engine, or declares an engine while claiming no
  figures;
- it claims a module while declaring nothing that needs it — the check that keeps "Agent Core does
  not own every responsibility" true.

A declaration that cannot fail is documentation. These can fail.

## 3. The lifecycle

`PIPELINE_STAGES` in `packages/shared/src/capabilities/orchestration.ts` is the order as data,
rendered by the surface so the diagram here and the behaviour in production cannot drift.

| #   | Stage                    | Decides                                                                         | Blocks                                                           |
| --- | ------------------------ | ------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1   | Capability resolution    | Find it by exact id. An undeclared id does not exist.                           | Unknown id, unimplemented capability, requester not permitted    |
| 2   | Input validation         | The declaration is usable and its engine binding is one this process honours.   | Malformed request, unhonourable engine binding                   |
| 3   | Input quality assessment | The per-field report: present, valid, current, consistent, provenance recorded. | Nothing — it produces the report stage 4 decides on              |
| 4   | Readiness gate           | `READY` / `READY_WITH_LIMITATIONS` / `REQUIRES_CLARIFICATION` / `BLOCKED`.      | A refused input set                                              |
| 5   | Permission check         | The role table's answer for the capability's operation.                         | A denied operation                                               |
| 6   | Entitlement and credits  | What the plan includes, and whether the balance covers the declared cost.       | Unavailable feature, inactive subscription, insufficient balance |
| 7   | Deterministic execution  | Runs the registered engine tool. Every figure comes from here.                  | An engine failure refuses the capability                         |
| 8   | Evidence and provenance  | Collects what the result rests on, with trust level and observation time.       | Nothing                                                          |
| 9   | Explanation              | A model may explain the result and may not alter it.                            | Nothing — a refusal never reaches a model                        |
| 10  | Structured result        | One shape, whether it ran or was refused.                                       | Nothing                                                          |
| 11  | Audit and usage record   | Appends the attempt and any credit movement.                                    | Nothing — a refusal is recorded like any other attempt           |

The pipeline is a **plan**: `planCapabilityRun` is pure — no I/O, no clock, no provider — and
returns either a refusal naming the stage it stopped at or a plan naming the engine to run. That
is why "refused at readiness" is a value the API can return rather than a thrown error, and why
the refusal path is exhaustively testable.

## 4. Readiness: two axes

Availability describes the build (`available`, `coming-soon`, `disabled`). Readiness describes
this request (`READY`, `READY_WITH_LIMITATIONS`, `REQUIRES_CLARIFICATION`, `BLOCKED`,
`UNAVAILABLE`). Both are reported because either alone misleads: inputs can be perfectly ready for
something not built, and something built can be blocked on a missing input. When availability
dominates, the state is `UNAVAILABLE` and the reason says which one applies.

`stateFromReadiness` maps the phase 5.3 verdict into the capability vocabulary, and `worseState`
composes two states by taking the worse — the same narrowing-only rule the portfolio and
evaluation gates follow.

## 5. Permissions, credits and memory

- **Permissions** are the role table's answer (ADR-0007), asked once, in the permission stage. The
  frontend never supplies an operation and no plan can widen one (ADR-0045).
- **Entitlement may only narrow.** `resolveEntitlement` reads stored state plus the role answer and
  has no branch that adds a permission. An unrecognised state falls back to the _strictest_
  reading — falling back to "allowed" is the one way a capability could run unmetered.
- **Credits** are reserved in the engine stage, not before it. A request refused at stages 1–6
  holds nothing, and the refund path (ADR-0045) covers a deterministic run that then fails.
- **Memory** carries a policy per capability. `high-impact` capabilities must declare
  `cite-verified-only`, so unverified memory cannot silently influence portfolio or decision
  analysis; the invariant above enforces it rather than trusting the declaration.
- **Provenance** is required by every capability that reads a price or a series, with the permitted
  labels declared. `market.structure` permits `historical` and `synthetic` — and requires a reading
  from synthetic bars to be labelled a training result rather than a measurement.

## 6. The structured result

`CapabilityResult` is one shape for a run and a refusal: capability, state, summary, data quality,
assumptions, evidence, calculations, insights, risks, limitations, uncertainty, provenance, usage
and next actions. Each figure travels as a `CalculationItem` with its unit and its source, because
a number without either is the shape in which an engine's output becomes a claim about the world.

Two presentation rules follow from it and are enforced by tests, not convention:

- **An absence is rendered as an absence** — `not measurable`, `not stated` — never a zero and
  never a bare dash, because `—` reads as "flat".
- **The frontend derives nothing.** No component in either family subtracts, averages, percentages
  or rounds; the expected-versus-actual difference is read from the contract, and the R-multiple
  row says the engine reports no difference rather than filling the gap.

## 7. Portfolio integration

`portfolio.composition` (phase 5.5) is the first capability with a real engine. The division of
labour is the one the product vision asked for:

- **`packages/trading-engine` owns the arithmetic.** Allocation, cost basis, unrealised P/L,
  concentration and exposure are pure functions of `(document, clock)`.
- **The capability owns the gate.** It declares `requiresProvenance: true`, so a price with no
  label is not used and an unvalued holding is reported as unvalued rather than valued at zero.
- **The agent explains.** The explanation stage runs after the figures exist and cannot change
  them.
- **It is free.** `portfolio.read` is the operation; the cost is zero, so a balance can never be
  what stops a user from seeing their own composition.

Missing data, stale data and quality warnings arrive as findings and gaps inside the result — a
partially declared portfolio produces _fewer_ figures with reasons, not approximate ones.

## 8. Decision evaluation integration

`decision.evaluation` (phase 5.6) is the second, and it is the one where misrepresentation is
easiest, so the constraints are tightest:

- The record holds the **declaration** — prices at entry and exit, the plan, the risk — and stores
  no computed figure.
- The engine reports expected versus actual, absolute and percentage performance, drawdown over a
  valid series and the attribution the data supports, and labels every figure `realised`,
  `unrealised`, `hypothetical` or `incomplete`.
- Both ends of a measurement must carry the time they were observed. A price without an observation
  time is not used.
- It does not predict, does not grade a decision as correct, and does not place an order.

`READY_FOR_EVALUATION` / `READY_WITH_LIMITATIONS` / `REQUIRES_CLARIFICATION` / `BLOCKED` /
`INCOMPLETE_OUTCOME_DATA` compose the phase 5.3 verdict with the record's own findings, narrowing
only.

## 9. The agent path

`src/server/handlers/agent.ts` is where the registry meets a running request. A turn that names a
`capabilityId` resolves it through `resolveCapability` first, builds the request
(`planCapabilityRun`), and returns `resultFromPlan` — a `CapabilityResult` — to the caller. The
agent service takes the readiness decision and the structured result as **inputs** and refuses on
three conditions: no readiness decision was supplied for an analysis request, the capability is
declared but not implemented, or the gate returned `BLOCKED` or `REQUIRES_CLARIFICATION`. In the
last case the refusal carries the gate's own questions.

There is no branch in the agent service that consults a model about readiness, permission or cost.
A capability whose `modelMayRequest` is `false` cannot be reached from the model at all, and a
refused capability never reaches a model.

## 10. API and persistence

| Route                                     | Purpose                                                                                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/capabilities`                    | The catalogue as the caller sees it: declared definition, resolved availability and the readiness verdict for every declared analysis type. |
| `GET /v1/decisions`                       | The caller's records.                                                                                                                       |
| `POST /v1/decisions`                      | Create a record. Ids are minted server-side.                                                                                                |
| `GET /v1/decisions/:decisionId`           | One record with its readiness and its evaluations.                                                                                          |
| `PATCH /v1/decisions/:decisionId`         | Amend a record.                                                                                                                             |
| `POST /v1/decisions/:decisionId/evaluate` | Run the evaluation and append it.                                                                                                           |

Every response carries a `note` naming what was and was not decided. Persistence is the minimum:
one migration (`0005_decision_evaluation`) for decision records and their evaluations, written
through the schema toolkit so SQLite and PostgreSQL stay one code path, with ownership rules
extending the existing per-user isolation. Access control is by owner: a caller reads and writes
their own records and nothing else. Capability runs are **not** persisted — the audit record
already carries the attempt, and a table would be a second source of truth until replay is
actually needed.

## 11. Frontend: one entry, internal sections

Evaluation is a single sidebar entry in the `workspace` group, with two internal tabs —
**Decisions** and **Capabilities** — so the navigation never grows a sub-tree. The journal, usage
and portfolio surfaces already keep that rule.

The surface renders what the server decided and derives nothing:

- `DecisionReadinessPanel` shows both gate layers (the declared context and the record itself),
  the findings with their severity, and the limitations.
- The expected-versus-actual panel reads the difference from the contract and says "reported for
  the return only" where the engine reports none.
- `EvaluationLimitationsPanel` renders the report's limitations when there is a report and the
  gate's when there is not.
- The capabilities tab renders the catalogue, the per-analysis readiness with **which authority
  decided it**, the module map, and the pipeline stages themselves.

Loading, empty, error, unavailable and blocked states are all reachable: `Skeleton` while a
request is in flight, `EmptyState` with no records, `ErrorState` with the server's own code,
`unavailable` with the resolver's stated reason (never a plausible-looking stand-in catalogue), and
a refusal badged beside the button that produced it.

## 12. Responsive and mobile architecture

Mobile is a first-class target from this phase. The surfaces use the shared responsive system
rather than a parallel mobile product:

- **The shell adapts, not the page.** Below 1100px (`COMPACT_SHELL_QUERY`) the sidebar collapses to
  a 76px icon rail with tooltips and `aria-label`s, so the workspace keeps its width at 375px.
- **`Workspace`** caps content at 1400px and wraps its header actions; **`Grid`** is mobile-first by
  construction (`grid-cols-1` widening at `sm`/`md`/`xl`).
- **The one table scrolls inside its own container.** The evaluation table carries
  `min-w-[34rem]` inside `overflow-x-auto`, so the page body never scrolls sideways.
- **The expected-versus-actual row is a grid on wide screens and a stacked pair on narrow ones**,
  rather than a table that would need a horizontal scroll to read two numbers.
- **Limitations are never behind a disclosure**, so the qualification travels with the figure at
  every width.
- **Interactive elements carry visible focus** (`focus-visible:ring-2`) and rows are buttons rather
  than clickable `div`s, so the surface is keyboard-reachable.

`tests/frontend-evaluation.test.ts` enforces the properties rather than trusting review: no fixed
pixel width on a container (the one table excepted and asserted), no grid wider than two columns
unconditionally and a breakpoint on every two-column grid, the table inside an `overflow-x-auto`
container, focus states present, and every interface state reachable.

## 13. Security posture

- **Deny by default.** An undeclared capability id does not exist; a capability the requester may
  not use is refused at resolution, before anything else is considered.
- **No direct LLM-to-privileged execution.** `modelMayRequest` and `humanOnly` are declared fields,
  and no stage accepts a model's opinion about readiness, permission or cost.
- **No arbitrary execution.** No capability declares an order, a broker or an execution output, and
  the UI guard refuses execution vocabulary in any label a surface renders.
- **Entitlement may only narrow**, and an unrecognised state resolves to the strictest reading.
- **Errors are safe.** Refusals carry codes and contract text; user free text is never copied into
  a log line.
- **Still disabled:** `liveTradingEnabled`, `brokerExecutionEnabled`, and any autonomous order
  placement. No phase in this work introduced them.

## 14. Tests

`tests/capabilities.test.ts` (domain), `tests/capabilities-api.test.ts` (routes, ownership,
metering), `tests/frontend-evaluation.test.ts` (surface and responsive properties), plus additions
to the existing portfolio, quality, database, monorepo-boundary and frontend-shell suites. They
cover registration and deny-by-default lookup; every readiness flavour; allowed, denied and
unauthorised tool paths; sufficient and insufficient credits; portfolio analysis with missing and
stale data; decision evaluation with incomplete context; verified, unverified and stale memory;
routing, clarification and blocked flows; and the security properties above. The full suite runs
in the standard validation pipeline.

## 15. Deferred, with triggers

| Deferred                                                                | Trigger                                                                                |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Per-execution persistence of capability runs                            | Replay or user-visible run history becomes a requirement                               |
| A job requester running a capability                                    | The first capability a scheduled job needs (`dataset.process`, `research.report`)      |
| `portfolio.risk`, `market.structure`, `research.report`, `backtest.run` | A market-data provider with provenance — a series is the prerequisite, not the code    |
| Model-narrated `portfolio.analysis`                                     | The provider above, plus the scenario/correlation work deferred in ADR-0046            |
| `memory.export`                                                         | The data-protection review that export and hard-delete land together for               |
| Mobile-specific navigation (bottom bar, gestures)                       | Only if the icon rail proves insufficient; the shared responsive system is the default |
