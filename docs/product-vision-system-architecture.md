# Product Vision & System Architecture

**Status of this document:** normative for product scope and module boundaries. It is the
first document that describes Master Trade as a _product_ rather than as an implementation.

**Source of truth.** Everything marked **Implemented** in this document was read from the
repository, not from intent. Counts and names were verified against the code: **31**
authorization operations, **22** database tables across **7** bounded contexts, **10** job
kinds, **12** realtime event contracts, **4** registered deterministic tools, **10** web
pages, and **433** passing tests in 30 files. Where this document and a layer document
disagree, the layer document and the code win, and this one is wrong and should be fixed.

**Status labels.** Every capability carries exactly one:

| Label                   | Meaning                                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Implemented**         | It exists in the repository and is exercised by tests or by a running process                                           |
| **Planned**             | It does not exist. The foundations it needs are named, and no foundation is assumed                                     |
| **Deferred**            | It was deliberately declined or postponed, with a trigger. Recorded in [risks-and-deferred.md](./risks-and-deferred.md) |
| **Requires validation** | It cannot be settled by engineering. It needs legal, compliance or licensed-data review first                           |

**Companion documents.** [architecture.md](./architecture.md) (component matrix and data
flows), [monorepo.md](./monorepo.md) (physical layout), [phase-4-handoff.md](./phase-4-handoff.md)
(where the build actually stands), and the ADR index for every decision already made.

---

## 1. Product vision

### 1.1 Mission

**Master Trade is a trading education and decision-review environment in which every number
is computed deterministically, every claim carries its source, and nothing executes.**

It exists to make a trader _better at deciding_, over months, with evidence — not to tell
them what to buy. Three commitments follow from that and constrain everything below:

1. **Numbers come from code, never from a model.** Position size, R-multiple, expectancy,
   drawdown and every portfolio statistic are computed by deterministic tools that are unit
   tested and have no network, no clock dependency and no model input.
2. **The system distinguishes what it knows from what it is guessing.** Facts, analysis,
   hypotheses and uncertainty are separate, typed categories — as are historical, synthetic
   and live market data.
3. **The system cannot trade, and that is not a setting.** Live trading and broker execution
   are absent from the type system, the operation catalogue and the job catalogue.

### 1.2 Long-term vision

A single local-first desktop workspace where a trader moves through a continuous loop:

```
learn a concept  →  form a hypothesis  →  test it on data  →  record the decision
      ↑                                                              ↓
      └────────  review the outcome, revise the rule  ←──────────────┘
```

The distinguishing property is not the chat interface. It is that the **loop closes**:
a lesson produces a hypothesis, the hypothesis becomes a written rule with a rationale, the
rule is evaluated against data with a recorded sample size, a decision is recorded against
the rule _before_ the outcome is known, the outcome arrives, and the evaluation compares the
two. The agent is a participant in that loop — it explains, drafts, retrieves, challenges —
and is never the authority on any number in it.

### 1.3 Who it is for

| Group                            | What they need                                                                                                                    | Status                                                                               |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **The developing retail trader** | A curriculum that reaches competency in six months, plus a journal and rule system that enforces discipline rather than willpower | **Implemented** (curriculum content is **Planned**)                                  |
| **The self-directed investor**   | Portfolio-level analysis: concentration, correlation, scenario exposure, and a written record of why each decision was taken      | **Planned** (§3.2)                                                                   |
| **The coach / mentor**           | Visibility into a student's recorded decisions, rule compliance and recurring mistakes                                            | **Planned** (`coach` role exists in the permission model, no surfaces behind it yet) |
| **The researcher**               | A place to run experiments, see sample size and confidence, and keep findings with provenance                                     | **Implemented** as UI; engine **Planned**                                            |

### 1.4 Core user problems

1. **Judgement without feedback.** Most traders never learn whether a decision was good,
   because they only record the outcome. Good decisions with bad outcomes and bad decisions
   with good outcomes are indistinguishable in a P&L column.
2. **Numbers that cannot be trusted.** Round-trip counts, position sizing and risk per trade
   are usually mental arithmetic, and any mistake compounds silently across a hundred trades.
3. **Discipline that depends on willpower.** A rule that lives in someone's head is not a
   rule. It has no version, no approval and no audit trail.
4. **Knowledge that decays.** Lessons learned are written once and never retrieved at the
   moment of decision.
5. **Advice that cannot be audited.** A recommendation that arrives without its assumptions
   cannot be revisited when those assumptions turn out to be wrong.

### 1.5 Capability map

| #   | Capability                                         | Status                                             | Where it lives today                                                                |
| --- | -------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1   | Structured agent turns with permissioned tools     | **Implemented**                                    | `src/agent/**`, `src/llm/**`, `src/permissions/**`, `packages/trading-engine`       |
| 2   | Provider-independent LLM gateway with cost control | **Implemented**                                    | `src/llm/**` (OpenAI, Anthropic, local OpenAI-compatible, offline scripted)         |
| 3   | Versioned instructions and safety policies         | **Implemented**                                    | `src/instructions/**`                                                               |
| 4   | Educational curriculum, lessons, exams             | **Implemented** (schema + UI); content **Planned** | `src/db/repositories/academy.ts`, `web/src/pages/{Academy,Exams}Page.tsx`           |
| 5   | Trading journal with rule compliance               | **Implemented** (UI, mock data)                    | `web/src/pages/JournalPage.tsx`, `web/src/components/journal/**`                    |
| 6   | Knowledge memory with trust gating                 | **Implemented**                                    | `src/memory/**`, `src/vector/**`, `src/db/repositories/memory.ts`                   |
| 7   | Market data abstraction with provenance            | **Implemented** (synthetic only)                   | `packages/shared/src/marketdata/provider.ts`; real providers **Planned**            |
| 8   | Deterministic risk and market-math tools           | **Implemented**                                    | `packages/trading-engine/src/**` — 4 tools                                          |
| 9   | Background jobs with durable local queue           | **Implemented**                                    | `src/jobs/**`, `packages/shared/src/jobs/**`                                        |
| 10  | Realtime event transport                           | **Implemented**                                    | `src/realtime/**`; browser session path **Planned** (handoff §7 B-2)                |
| 11  | Audit trail and provenance                         | **Implemented**                                    | `src/db/repositories/audit.ts`, `packages/shared/src/core/provenance.ts`            |
| 12  | Portfolio intelligence                             | **Planned**                                        | §3.2 — no module exists                                                             |
| 13  | Portfolio decision evaluation                      | **Planned**                                        | §3.3 — the existing evaluation harness does something different (§2.6)              |
| 14  | Usage credits and premium tiers                    | **Planned**                                        | §3.1 — no module exists                                                             |
| 15  | Backtesting over historical bars                   | **Deferred**                                       | `backtest.run` exists as an operation and a job kind, with **no handler** by design |

### 1.6 Objectives

**Near term (Phase 5.x).** Close the live path: issue a session to the shell, so the
Activity surface reads the real queue over the real socket. Build the Tauri shell once on a
machine with a Rust toolchain. Ship the first real deterministic backtest. None of these
adds a product module; all of them move existing work from _verified in-process_ to
_working_.

**Medium term.** Portfolio Intelligence and the deterministic backtest, in that dependency
order (§7). A real curriculum, so the Academy and Exams surfaces read content instead of
fixtures. One real market-data provider behind the existing abstraction.

**Long term.** The closed loop of §1.2 with a longitudinal record of the user's own
decisions and their evaluated outcomes — the asset that no competitor can copy, because it
is the user's history.

### 1.7 Boundaries and non-goals

**Master Trade will not:**

- **Execute trades or connect to a broker.** Not in a later phase, not behind a flag.
  `HARDLINE_OPERATION_PATTERN` (`/broker|execute|place[._-]?order|live[._-]?trading|margin/i`)
  and `HARDLINE_JOB_PATTERN` reject such names at start-up, and `assertNoHardlineOperations()`
  runs on every boot.
- **Give personalized investment advice.** See §6.5 — this is a product boundary and a
  compliance position, not a wording preference.
- **Promise or imply profitability.** No capability may state expected returns as a fact, and
  evaluation metrics may never be presented as predictive validity (see risk R13).
- **Own the user's money or move funds.** No payment instrument is ever connected to a
  brokerage relationship.
- **Send user data to a cloud service without a recorded, per-feature decision.** Local-first
  is the default; a remote capability is an ADR, not a config flag.
- **Present model output as knowledge.** Model text enters memory as `unverified` and cannot
  be promoted by automation.

**Out of scope for the product as a whole:** social/trading-floor features, copy-trading,
signal marketplaces, and any mechanism that turns another user's decisions into a
recommendation for this user.

---

## 2. Core product modules

### 2.1 Module responsibility matrix

The organising rule is that **Agent Core coordinates; it does not compute and it does not
own state.** Every module below owns its own data, its own rules and its own tests. A module
may read another's published view models; it may never write another's tables.

| Module                      | Owns (data)                                                         | Computes                                                                   | Status                                                     |
| --------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **Agent Core**              | `conversations`, `messages`                                         | Nothing. Orchestration, context assembly, provenance recording             | **Implemented**                                            |
| **Knowledge & Memory**      | `memory_records`, `memory_versions`, `memory_embeddings`            | Embedding, retrieval ranking                                               | **Implemented**                                            |
| **Market Intelligence**     | `market_data_bars`                                                  | Normalization, data-quality checks, indicators                             | **Implemented** (synthetic); real providers **Planned**    |
| **Portfolio Engine**        | _nothing yet_ — would own portfolio and position tables             | Sizing, correlation, exposure, scenario arithmetic                         | **Planned**                                                |
| **Evaluation Engine**       | `rule_evaluations`                                                  | Invariant checks (**implemented**); outcome/decision scoring (**Planned**) | Partial                                                    |
| **Usage & Subscription**    | _nothing yet_ — would own usage and entitlement tables              | Credit accounting, entitlement resolution                                  | **Planned**                                                |
| **User Profile**            | `users`, `credentials`, `sessions`, `settings`                      | Nothing                                                                    | **Implemented** (identity); profile attributes **Planned** |
| **Web Application**         | none — no client-side authority                                     | Presentation only                                                          | **Implemented**                                            |
| **Academy** (supporting)    | `curricula`, `lessons`, `lesson_progress`, `exams`, `exam_attempts` | Rubric scoring                                                             | **Implemented** (schema + UI); content **Planned**         |
| **Governance** (supporting) | `trading_rules`, `approvals`                                        | Rule lifecycle enforcement                                                 | **Implemented**                                            |
| **Audit** (supporting)      | `audit_records`                                                     | Append-only recording                                                      | **Implemented**                                            |
| **Platform** (supporting)   | `settings`, `files`, `jobs`, `market_data_bars`, `job_scratch`      | Queue mechanics                                                            | **Implemented**                                            |

The seven ownership contexts are not a design sketch — they are declared in
`src/db/ownership.ts` with a mutability class (`append-only` / `mutable` / `versioned` /
`tombstone`), a retention class, a backup class, a personal-data flag and a one-line rule a
reviewer can check at a glance.

### 2.2 Agent Core

**Responsibility.** Turn a user request plus retrieved context into a structured, sourced,
permission-respecting answer. Assemble context under a token budget. Request tools. Record
provenance. Refuse what must be refused.

**Implemented:** `Orchestrator` with the state machine
`IDLE → LOADING → READY → RUNNING → RESPONDING` and `BLOCKED`; a deterministic budgeted
context assembler; the LLM gateway with retry, timeout, fallback, cost and circuit breaker;
the permission gate; structured summary parsing.

**Explicitly does not own:** any calculation; any portfolio statistic; the curriculum; memory
trust decisions; user entitlements; market data. The orchestrator holds **no** tool handle —
it receives _requests_ and authorizes them.

**Boundary rule.** Context sections from memory must carry provenance or assembly throws
(`VALIDATION_FAILED`). This is the mechanism that stops the agent from reasoning over
unattributed text.

**Status:** **Implemented**, and the only module with a full end-to-end path today.

### 2.3 Knowledge & Memory

**Responsibility.** Be the system's long-term, trust-gated knowledge: what the user learned,
what they got wrong, what a rule exists for, and what the agent has been told.

**Implemented:** a memory store, a separate vector retrieval path with `minTrust` filtering,
three tables with version history, and a four-level trust ladder —
`unverified → corroborated → verified → authoritative`. Promotion to `verified` or
`authoritative` **requires a human verifier**, enforced by a database check constraint:
`(trust IN ('verified','authoritative')) = (verified_by IS NOT NULL)`. Memory typed as
`authoritative` cannot be soft-deleted. Model-authored text enters as `unverified` always.

**Semantic retrieval is deliberately separate from structured records** (ADR-0006): the
relational store is the record of truth, the vector index is an advisory retrieval aid. A
corroborated-but-unverified record is retrieved _with its trust level attached_, so the
answer can say "the user noted this, unverified".

**Planned:** real embedding providers (today's embeddings are deterministic hashes —
adequate to test ranking and trust plumbing, not for a real Academy); an ANN index;
re-embedding migrations; retrieval-quality evaluation.

**The trust rule is the whole point of the module.** A knowledge system that can be promoted
by the model that wrote it is a system that launders its own guesses into facts.

### 2.4 Market Intelligence

**Responsibility.** Produce normalized, validated, provenance-carrying market data and
derived factual series. Never produce an opinion.

**Implemented:** a provider-independent interface (`MarketDataProvider`), symbol
normalization, timeframe handling, `NormalizedBar`, a `DataQualityReport` from
`validateBars()`, a synthetic provider, and a `market_data_bars` table with a NOT NULL
provenance column.

**The provenance trichotomy** — `synthetic` | `historical` | `live` — is typed, and the
configuration refuses to run with `live` in `marketData.allowedProvenance`. Synthetic bars
are generated and clearly labelled; they are never presented as observation.

**Planned:** a real historical provider, CSV import, corporate-action handling, tick
retention policy, and the `marketData.ingest` job handler. **Requires validation:** provider
licensing and redistribution terms before any real feed is integrated.

**Boundary.** Market Intelligence answers "what did the market do, according to this
source?" It never answers "what should I do?" That question belongs to the Portfolio Engine
and the Agent Core, which must consume labelled data rather than raw numbers.

### 2.5 Portfolio Engine

**Responsibility.** Deterministic arithmetic over a portfolio: position sizing, value at
risk, concentration, pairwise correlation, exposure by asset class and sector, and scenario
arithmetic under stated assumptions.

**Status: Planned.** Nothing of this module exists. There is no portfolio table, no position
table, no correlation code. It must not be stubbed, faked in the frontend, or approximated
by model output.

**What it must be, when it is built:**

- Pure functions in `packages/trading-engine` or a sibling package with the same constraint —
  no network, no clock, no database handle, no model — so it is unit-testable and its
  dependency direction is enforced by a test rather than by convention. The existing
  `packages/trading-engine` boundary is the template: a test refuses imports of `src/llm`,
  `src/agent`, `src/db`, `src/server`, `src/realtime` and any `node:*` builtin.
- Every output carries the assumptions it was computed under, as data, not as prose.
- Missing inputs produce a **refusal with a named gap**, never a default. A correlation
  computed over three overlapping observations must say so.
- **Requires validation:** whether a given statistic constitutes personalized advice in a
  target jurisdiction depends on framing (§6.5), which is a review item, not an engineering
  choice.

### 2.6 Evaluation Engine

**Two different things share this name and must not be confused.**

**Implemented — the invariant harness.** `src/evaluation/harness.ts` runs scenarios against
an orchestrator and reports pass/fail with reasons: every statement carries an epistemic
label; identical inputs produce identical output; an execution request is refused. This
evaluates **the agent's compliance with its own rules**, not trading skill, and not any
portfolio decision. It is `evaluation.run` in the operation catalogue.

**Planned — decision evaluation.** The capability described in §3.3: compare a recorded
decision, its assumptions and its recommendation against the outcome that followed, and
preserve the comparison as a revisable record. This is new work. The name collision is a
real hazard: a reader who assumes `src/evaluation` scores decisions will build on a harness
that only checks invariants, so the roadmap in §7 refers to them as _invariant harness_ and
_decision evaluator_.

**Deferred — rule evaluation.** `rule.evaluate` is a sensitive operation and
`rule_evaluations` is a table, but there is no statistical engine behind them yet. Research
metrics are labelled `synthetic`/`none` rather than computed, precisely so that no number
implies a valid experiment that was never run.

### 2.7 Usage & Subscription

**Responsibility.** Account for consumption (model tokens, cost, job minutes, storage) and
resolve entitlements (what a given user is allowed to consume today, given a tier and a
credit balance).

**Status: Planned.** No module, no table, no entitlement code exists. What _does_ exist and
must be reused rather than reinvented: the gateway's token accounting, its pricing table, and
the rule that **an unpriced model is refused** — "an unbudgetable model is an unaccountable
one".

**Design constraints (§3.1):** entitlement is not permission. A paid tier may raise a quota;
it may never grant an operation that the role table denies, and it may never touch a
`critical` operation. **Requires validation:** billing, tax, consumer-withdrawal and
subscription-law duties per jurisdiction.

### 2.8 User Profile

**Responsibility.** Identity, authentication, authorization roles, and the user's stated
context: capital, risk tolerance, horizon, constraints, experience level.

**Implemented:** `users`, `credentials` (argon2id/scrypt, hash only), `sessions` (hashed
token, never stored in the clear), `settings`, five roles (`owner`, `coach`, `student`,
`observer`, `system`), and a 31-operation deny-by-default catalogue. `users` already carries
`experience_level` and `timezone`.

**Planned:** the durable profile _inputs_ that Portfolio Intelligence depends on — capital,
risk tolerance, horizon, existing holdings, constraints. Today these would have to be
re-asked every session, which is exactly what §4 forbids as a foundation.

**Privacy.** `personalData` is declared per table, so export and deletion duties are
derivable from the schema rather than remembered. Credentials are never echoed; a
credential-shaped key anywhere in configuration is refused rather than filtered.

### 2.9 Web Application

**Responsibility.** Presentation, navigation and input capture. **No client-side authority.**

**Implemented:** React 19 + Vite + Tailwind + Radix, a design token system, an application
shell, a reusable primitive library, ten pages (Dashboard, AI Workspace, Memory, Research,
Journal, Academy, Exams, Trading Lab, Activity, Settings), and a realtime client with a
connection store.

**Enforced in the frontend:** the frontend may import backend code only through 13 declared
`@shared/*` names; it cannot reach a database driver or the HTTP server at all (no resolver
entry exists, so such an import fails to compile _and_ to bundle). No navigation label or
control accessible name may match `FORBIDDEN_UI_CONTROL` — there is no order or execution
affordance and a test fails the build if one is added.

**Honest status:** most pages render labelled fixtures, and they say so. Activity is the
exception in the honest direction — it reads the real queue and opens the real socket
whenever a session exists, and reports exactly why when one does not.

---

## 3. Priority systems

### 3.1 A. Usage credits & premium

**Intent.** A daily free credit allowance that makes the product usable without payment;
premium access that raises limits; and hard cost control so a single user or a runaway loop
cannot produce an unbounded provider bill.

**Status: Planned.** No part of this exists yet.

**Why it is a separate module, not a gate in the agent.** Entitlement changes on a billing
cadence; authorization changes on a security review. Fusing them means a billing change can
alter an access decision. They must be separate and must compose in one direction only:

```
entitlement (can this user afford this?)  ──narrows──▶  permission (is this allowed?)
                                    the reverse never happens
```

**Design boundaries.**

| Concern               | Rule                                                                                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Independence          | Usage & Subscription owns its tables and exposes a resolution function. No other module reads credits.                                                                  |
| Non-escalation        | A tier may only _reduce_ what is permitted relative to the role table. It can never add an operation, and never a `critical` one (`rule.activate`, `user.role.assign`). |
| Deterministic         | Credit accounting is integer arithmetic in a tested pure function. The model never decides whether something is affordable.                                             |
| Cost is ours          | Cost is computed from the project's own reviewed price table, never from provider-reported pricing, and an unpriced model is refused.                                   |
| Budget is a pre-check | A spent budget blocks a turn **before** any provider call, so refusal is free.                                                                                          |
| Fail closed           | Unknown tier, unknown model, missing price row, or a ledger read failure all deny.                                                                                      |
| Transparent           | The user must be able to see credits consumed _and why_ (which capability, which model, how many tokens).                                                               |
| Extensible            | Adding a tier or a metered capability is a data change plus a migration, not a code change in the agent.                                                                |

**Free-tier shape (proposal, not implemented).** A daily allowance of free turns plus a
reserved share for deterministic, model-free capabilities. Deterministic tools are cheap and
should stay available when the model budget is exhausted — a position-size calculation must
not stop working because a credit ran out. This is a design intention to be settled when the
module is built, not a current behaviour.

**Requires validation:** billing, tax, refund, consumer-withdrawal and
subscription-disclosure duties in each target jurisdiction; and whether an entitlement change
constitutes a change to a paid contract.

### 3.2 B. Portfolio intelligence

**Intent.** Answer portfolio-level questions with arithmetic: how concentrated is this, what
is correlated to what, what happens to this portfolio under a stated scenario, and what
assumptions would have to be wrong for the answer to change.

**Status: Planned.** Requires User Profile inputs (§2.8) and Market Intelligence data (§2.4)
to exist first. Building it before either produces a calculator with nothing to calculate.

**Design boundaries.**

| Concern                  | Rule                                                                                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Determinism              | Every statistic is computed by tested pure code. The model explains, contextualises and questions; it never computes.                                                        |
| Assumptions are data     | Every analysis carries its assumptions as a structured list (`{id, statement, value?, source?}`), not as prose that a reader must parse.                                     |
| Constraints are explicit | The user's stated constraints (no leverage, no single position above N%, no sector above M%) are inputs, and a breach is reported as a breach, not smoothed into an average. |
| Reassessment conditions  | Each analysis states what would invalidate it — new data, a passed horizon, a changed correlation regime — so it can be revisited rather than silently superseded.           |
| Scenario honesty         | A scenario is labelled hypothetical, with its parameters visible. It is never presented as a forecast.                                                                       |
| Historical ≠ predictive  | Historical correlation and volatility are described as observed, never as expected future values.                                                                            |
| Missing input → refusal  | An incomplete portfolio produces a named gap and a clarifying question, never a defaulted assumption (§4).                                                                   |
| Not advice               | The output is analysis of the composition the user described. It is not a recommendation to buy, sell, hold or allocate (§6.5).                                              |

**Required output shape (to be fixed by an ADR when built).** Analysis, not a verdict:
what was measured, over what window, with what sample; what the user's own constraints say;
what is uncertain; what would change the answer. Any "should" belongs in the Agent Core's
educational framing, sourced to the curriculum, and never phrased as a personal instruction.

### 3.3 C. Portfolio decision evaluation

**Intent.** Make the §1.4 problem tractable: preserve what was decided, why, and what
happened — so that decision quality can be assessed separately from outcome.

**Status: Planned.** This is the long-term differentiator and the last capability in the
dependency order, because it consumes everything above it.

**The record it must preserve.**

| Field                               | Purpose                                                                           | Exists today                                      |
| ----------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------- |
| Original input                      | What the user actually asked, verbatim, so it cannot be re-read with hindsight    | `messages` (agent context)                        |
| Market context at the time          | What was observable _then_, with provenance and a timestamp                       | `market_data_bars` (schema only)                  |
| Assumptions                         | The beliefs the decision rested on                                                | **Planned**                                       |
| Generated analysis / recommendation | What the system proposed, with model, instruction version and cost                | Partially — provenance exists, no decision record |
| Observed outcome                    | What actually happened over a stated horizon                                      | **Planned**                                       |
| Evaluation                          | A comparison under a declared method, with sample size and a confidence statement | `rule_evaluations` table, no engine               |
| Uncertainty and limitations         | What the evaluation cannot show                                                   | **Planned**                                       |
| Revision and learning record        | The later revision, linked to the original, never overwriting it                  | `memory_versions` is the pattern                  |

**Design boundaries.**

- **Decisions are append-only.** A later judgement of a decision is a _new_ record that
  references the first. Nothing is rewritten, so the record cannot be retrofitted to look
  better.
- **Outcome never rewrites reasoning.** The evaluation reports both a decision-quality
  assessment and an outcome, and must be able to say _good decision, bad outcome_.
- **Provenance is mandatory.** A recommendation without its model, instruction version and
  source context is not evaluable and must not be stored as if it were.
- **No predictive claim.** An evaluated decision is a historical record. The module may not
  state or imply that a past hit rate predicts a future one — this is exactly the failure
  mode recorded as risk R13 (`inconclusive` is a first-class verdict for this reason).
- **The evaluation method is declared before it is run**, so the method cannot be chosen to
  fit the result.
- **Insufficient sample → `inconclusive`.** A small sample produces an inconclusive verdict,
  not a weak one dressed as a finding.

---

## 4. Input quality principle

### 4.1 The principle

> **Master Trade produces analysis and recommendations whose quality is bounded by the
> quality, completeness, reliability and recency of the information available to it. It must
> state which of those it has, and behave proportionately to the weakest of them.**

This is normative and it is enforced by ADR-0041. It has one corollary that runs against
every product instinct:

> **More information is not automatically better information.**

A larger input set can be worse. A stale holding list, a self-reported risk tolerance
inconsistent with a stated horizon, or a conflicting capital figure does not merely fail to
help — it degrades the answer while _increasing_ the user's confidence in it. Volume must
never be mistaken for sufficiency, and confidence is a property of the _weakest_ required
input, not the average.

### 4.2 The input contract

Each required input is described by four properties, and the system must know them before it
can decide whether to proceed:

| Property      | Meaning                                                                       |
| ------------- | ----------------------------------------------------------------------------- |
| **Required?** | Whether analysis is possible at all without it                                |
| **Present?**  | Whether a value was supplied, and when                                        |
| **Reliable?** | How it came to be known: user-stated, computed from sourced data, or inferred |
| **Current?**  | Whether it is inside its freshness window for this kind of input              |

| Input               | Required for                         | Freshness expectation                         | Today                                         |
| ------------------- | ------------------------------------ | --------------------------------------------- | --------------------------------------------- |
| Capital             | Any sizing or exposure statement     | Days–weeks; changes on deposit/withdrawal     | **Planned** (no durable profile store)        |
| Risk tolerance      | Sizing, concentration limits         | Months; must be re-confirmed after a loss run | **Planned**                                   |
| Investment horizon  | Scenario windows, reassessment dates | Months–years                                  | **Planned**                                   |
| Existing holdings   | Any portfolio statement              | Positions: hours–days                         | **Planned**                                   |
| Market data         | Any market statement                 | Bounded by timeframe and asset class          | **Implemented** (synthetic; provenance typed) |
| User constraints    | Compliance reporting, filtering      | Stable; changes deliberately                  | **Planned**                                   |
| Data freshness      | Every output                         | Per-input, must be displayed                  | **Planned** (per-row timestamps exist)        |
| Missing/conflicting | Every output                         | Immediate                                     | **Planned**                                   |

The gap is stark and is stated rather than glossed: **the market-data row is implemented and
every other row is not.** The profile inputs that Portfolio Intelligence depends on have no
durable home yet, which is why §7 orders User Profile before Portfolio Engine.

### 4.3 Validation flow

```
  request
     │
     ▼
 ┌──────────────────────────────────────────────────────────────┐
 │ 1. CLASSIFY   What capability is being asked for, and what   │
 │               inputs does it *require*? (declared, not guessed)│
 └───────────────────────────┬──────────────────────────────────┘
                             ▼
 ┌──────────────────────────────────────────────────────────────┐
 │ 2. COLLECT    Gather each required input with provenance:    │
 │               user-stated / computed / inferred              │
 └───────────────────────────┬──────────────────────────────────┘
                             ▼
 ┌──────────────────────────────────────────────────────────────┐
 │ 3. CHECK      presence · freshness · reliability · internal  │
 │               consistency · conflicts between sources        │
 └───────────────────────────┬──────────────────────────────────┘
                             ▼
 ┌──────────────────────────────────────────────────────────────┐
 │ 4. SCORE      Input confidence = the WEAKEST required input. │
 │               Reported, never hidden.                        │
 └───────────────────────────┬──────────────────────────────────┘
                             ▼
 ┌──────────────────────────────────────────────────────────────┐
 │ 5. DECIDE     Sufficient → analyse. Sparse → clarify or      │
 │               limited. Insufficient → refuse to be precise.  │
 └───────────────────────────┬──────────────────────────────────┘
                             ▼
 ┌──────────────────────────────────────────────────────────────┐
 │ 6. RECORD     Inputs, provenance, confidence, gaps and the   │
 │               decision taken — in the audit trail.           │
 └──────────────────────────────────────────────────────────────┘
```

**Conflict handling.** When two sources disagree (user-stated capital vs. holdings that sum
differently), the system states the conflict, does not silently prefer either, and asks. A
silent choice is indistinguishable from a bug to the user and invisible to the auditor.

**Freshness.** Freshness is a property of the input _kind_, not a global TTL. A holdings list
is stale within a day; a risk tolerance is stale over months. An expired input is not
deleted — it is used only with the staleness stated, or not used at all if the capability
requires currency.

### 4.4 Input confidence and provenance

```
input confidence  =  min( presence, freshness, reliability )  over every REQUIRED input
```

`min`, not mean, and deliberately so: averaging lets a well-sourced market series hide an
assumed risk tolerance. The reported confidence is always the weakest link, and the UI must
name **which** input is the weakest.

Provenance reuses the existing machinery rather than inventing a parallel one: the same
`DataProvenance` trichotomy for market data, the same source-tagged statements for model
output, and the same audit records for the decision taken.

### 4.5 Behaviour when information is insufficient

A ladder, from most to least information. The system may descend; it may never skip upward.

| Level  | Condition                                      | Permitted behaviour                                                                                                           | Forbidden                                                               |
| ------ | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **L1** | All required inputs present, fresh, consistent | Full analysis, with assumptions and uncertainty stated                                                                        | Presenting analysis as fact; omitting the uncertainty                   |
| **L2** | Some non-critical input missing or stale       | **Ask clarifying questions first.** If the user declines, proceed with the gap named in the output                            | Silently defaulting the missing value                                   |
| **L3** | A required input missing                       | **Limited analysis**, scoped to what the inputs support, with the gap named. State explicitly what cannot be answered and why | Answering the larger question anyway                                    |
| **L4** | Too little to analyse                          | **Labelled hypothetical scenario** only, with all parameters visible and marked hypothetical                                  | Presenting a hypothetical as an analysis of the user's actual situation |
| **L5** | Missing, conflicting or untrustworthy inputs   | **Refuse to recommend.** Say what is missing or contradictory and what would resolve it                                       | Any specific numeric recommendation, however hedged                     |

**The L5 rule is the one that matters most.** A precise recommendation built on assumed inputs
is worse than no recommendation, because the precision is itself a claim about inputs the
system does not have. Hedging language does not repair this: "consider allocating
approximately 12% based on a risk tolerance we assumed" is a precise recommendation wearing a
disclaimer.

**Interface obligation.** The ladder level must be visible in the product. A user reading a
limited analysis must be able to see that it is limited, and why, without opening a log.

### 4.6 More is not better

Three concrete anti-patterns this principle forbids:

1. **Padding the input set to look thorough.** Adding an inferred risk tolerance because the
   analysis is otherwise blocked replaces an honest gap with a confident guess.
2. **Averaging away a weak input.** A high-confidence market series does not raise the
   confidence of an assumed horizon.
3. **Confusing volume with completeness.** Ten thousand bars of the wrong symbol, or a
   holdings list from last quarter, is not a richer input. Relevance and recency are
   properties of the _matching_ input, not the total volume.

---

## 5. System architecture

### 5.1 Context map

```
┌──────────────────────────────────────────────────────────────────────────┐
│                            Desktop shell (Tauri)                          │
│   WebView: no shell/fs/http permission. Rust: spawn, keychain, cache.     │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │ loopback + per-launch shell token
┌───────────────────────────────▼──────────────────────────────────────────┐
│                Web Application (React)  — presentation only               │
│   imports backend code ONLY through 13 declared @shared/* names            │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │ typed contracts, Zod-validated
┌───────────────────────────────▼──────────────────────────────────────────┐
│                     API layer (Fastify 5, loopback only)                  │
│   one pipeline per route: authn → authz → approval → validation            │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────────┐
│                    Agent Core (orchestrator + gateway)                    │
│   assembles context · requests tools · records provenance · cannot execute │
└───┬────────────┬──────────────┬───────────────┬──────────────┬────────────┘
    │            │              │               │              │
    ▼            ▼              ▼               ▼              ▼
┌────────┐  ┌─────────┐  ┌───────────┐  ┌────────────┐  ┌──────────────┐
│Knowledge│  │ Market  │  │ Portfolio │  │ Evaluation │  │   Usage &    │
│& Memory │  │Intellig.│  │  Engine   │  │  Engine    │  │ Subscription │
│  IMPL   │  │  IMPL*  │  │  PLANNED  │  │  PARTIAL   │  │   PLANNED    │
└────┬────┘  └────┬────┘  └─────┬─────┘  └─────┬──────┘  └──────┬───────┘
     │            │             │              │                │
     └────────────┴─────────────┴──────────────┴────────────────┘
                                │  repositories only — no module writes another's tables
┌───────────────────────────────▼──────────────────────────────────────────┐
│            Database (SQLite / node:sqlite, WAL)  ·  7 owners, 22 tables   │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────────┐
│                     Vector memory (retrieval only, trust-gated)           │
└──────────────────────────────────────────────────────────────────────────┘

   cross-cutting:  Audit (append-only) · Jobs (durable queue) · Realtime (typed events)
                   Observability (structured, redacted) · Instructions (versioned)
     * Market Intelligence is implemented against a synthetic provider only.
```

### 5.2 Dependency direction

The permitted directions are few, and each is enforced by a test rather than by convention.

```
packages/shared            ──✗──▶  src/** , web/** , src-tauri/**
packages/trading-engine    ──✗──▶  any model, database, socket, shell, or node:* builtin
web/src/**    ──@shared/*──▶  packages/shared/**      (13 exact names; nothing else resolves)
src/**        ──relative──▶   packages/shared/**
src/**        ──✗──▶  web/**                          (never)
Agent Core    ──✗──▶  another module's tables         (repositories only)
Usage & Sub.  ──narrows──▶  permissions                (never the reverse)
```

Adding a shared module is a deliberate edit to one declared list — there is no prefix
wildcard, so `@shared/db/sqlite`, `@shared/server/app` and bare `@shared` have no resolver
entry at all. A frontend import of the database driver or the HTTP server fails to compile
and fails to bundle.

### 5.3 Data flow — an analysis request

```
user question
   → API: authenticate, authorize (agent.chat), validate
   → Agent Core: classify capability, collect required inputs (§4.2)
   → Knowledge & Memory: retrieve with minTrust, provenance attached
   → Market Intelligence: normalized bars, provenance + quality report
   → context assembly: budgeted; instructions never dropped; memory without provenance throws
   → LlmGateway: price the model (refuse if unpriced) → budget pre-check → provider
   → model returns a STRUCTURED SUMMARY or the turn fails
   → Orchestrator: authorize each requested tool → run deterministic tool → record provenance
   → response: {statements[{kind, text, sources}], uncertainty[]}
   → Audit: inputs, provenance, confidence, decision taken
   → Realtime: typed events to the UI
```

Note what the model never sees: a tool handle, a database connection, a filesystem path, or
the ability to execute anything.

### 5.4 Data flow — a recorded decision and its later evaluation

```
  DECISION TIME                          │        EVALUATION TIME
                                         │
  question + inputs + provenance         │   (append-only: nothing above is rewritten)
            │                            │
            ▼                            │
  assumptions, stated as data            │
            │                            │
            ▼                            │
  analysis / recommendation + model,     │
  instruction version, cost              │
            │                            │
            └──────────► recorded ◄──────┼──────── observed outcome
                                         │              │
                                         │              ▼
                                         │   method declared BEFORE running
                                         │              │
                                         │              ▼
                                         │   verdict: supports | contradicts |
                                         │            inconclusive (+ sample size)
                                         │              │
                                         │              ▼
                                         │   revision record → links back, never overwrites
```

### 5.5 Runtime responsibilities

| Runtime                      | Owns                                                                                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Rust / Tauri**             | Window, sidecar spawn, keychain read, cache write, export destinations. No command returns a filesystem path; the WebView holds five permissions and no `shell:`/`fs:`/`http:` permission at all |
| **Node sidecar (API)**       | HTTP, authn/authz, agents, jobs, realtime, migrations, audit                                                                                                                                     |
| **WebView (React)**          | Rendering, input capture, connection state. No authority                                                                                                                                         |
| **Local SQLite**             | Durable state, WAL mode, foreign keys, `busy_timeout`; file in the OS app-data directory                                                                                                         |
| **Job workers (in-process)** | Background work with atomic claim + lease, bounded concurrency, retries, timeouts, dead-letter                                                                                                   |
| **PostgreSQL**               | **Deferred** hosted mode. The adapter and `SqlExecutor` boundary exist; no driver installed                                                                                                      |

### 5.6 The privileged-execution rule

**No model output may become an action without a permission check and an execution boundary
that the model does not control.** Concretely:

- A model **requests**; the orchestrator **authorizes and executes**. One denied or unknown
  tool blocks the entire turn rather than being skipped.
- `allowModelDirectToolExecution` is typed as the literal `false`, refused by
  `assertSafeConfig`, and reported as `false` in the redacted config view.
- Job creation is a server-side act. There is no HTTP route to enqueue a job, and no
  LLM-to-job path exists to authorize.
- `rule.activate` is `critical` **and** `requiresApproval`, so it is `451` before a handler
  can be reached, even for the owner.

---

## 6. Safety, privacy & compliance

### 6.1 Deny-by-default permissions — **Implemented**

An operation is permitted only when an explicit role grant exists. The catalogue has **31**
operations across four sensitivity classes (`normal`, `sensitive`, `critical`), and two are
`critical` with mandatory human approval (`rule.activate`, `user.role.assign`). Anything
absent from the catalogue is denied, and the API authenticates before it authorizes on every
protected route — an invalid credential is `401` even on a public route.

### 6.2 Sensitive data — **Implemented** (design), **Planned** (user surfaces)

- Credentials are hashes only (`argon2id`/`scrypt`), never reversible.
- Session tokens are hashed; the clear token is never stored, logged or configured.
- Secrets are `SecretRef`-only in configuration; the keychain holds them in the desktop build.
- Recursive redaction runs when a log record is _built_, so it cannot be bypassed by a new
  call site; `redactSecrets` is refused if ever set false.
- A credential-shaped key anywhere in configuration is **refused**, not filtered.
- The database stores no secrets and no raw file bytes.
- `personalData` is declared per table, which makes export/delete duties derivable from the
  schema. **Planned:** the user-facing export and hard-delete flows. Deletion is currently a
  tombstone, which preserves the audit trail and is recorded as a deliberate trade-off
  against strict "delete my data" expectations.

### 6.3 Auditability and provenance — **Implemented**

Append-only audit records, correlation ids on every request, provenance on every stored
statement and every market bar (NOT NULL), and a memory version history. The result is that
"why did the system say this?" is answerable after the fact — which is a precondition for
§3.3, not a nice-to-have.

### 6.4 Uncertainty communication — **Implemented**

Four epistemic kinds (`fact`, `analysis`, `hypothesis`, `uncertainty`) are typed, and
`uncertainty` is a rendered field rather than a tone of voice. A `fact` without a source is
rejected. Chain-of-thought is refused by name, so the product never exposes private
deliberation as if it were an answer.

### 6.5 Analysis versus personalized investment advice — **normative**

Master Trade produces **general information and analysis of a composition the user
describes**. It does not produce personalized investment advice and must not be built,
marketed or phrased as though it does.

The distinction is not wording; it is about what the system knows and what it recommends:

| Shaped as analysis (permitted)                                                                          | Shaped as personal advice (forbidden)         |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| "This composition is 34% in one sector, above the 25% limit you stated."                                | "You should reduce your technology exposure." |
| "Over the last 90 days these two holdings showed 0.81 correlation (n=63)."                              | "These are too correlated, so sell one."      |
| "Under a 20% broad decline, this composition's modelled drawdown is X, assuming constant correlations." | "A crash is coming; move to cash."            |
| "Your stated horizon is 3 months but this holding is described as a 5-year thesis. Which is current?"   | Silently assuming which one is current.       |

Applying this boundary — enforced by ADR-0042 — is why §4 exists. Advice is what a system
produces when it resolves the user's ambiguity on the user's behalf, and the discipline of
refusing to do that is the same discipline that keeps the ladder in §4.5 honest.

### 6.6 Jurisdiction-specific review — **Requires validation**

The following cannot be settled by engineering, and Master Trade makes **no legal
conclusion** about any of them. Each requires review by qualified counsel in every target
jurisdiction, before the corresponding capability ships:

1. **Where general information ends and regulated investment advice begins.** The boundary
   varies by jurisdiction and depends on framing, personalisation, and whether a
   consideration is received. A capability cleared in one market may be regulated in another.
2. **Whether portfolio analysis of a user's actual holdings constitutes personal
   recommendation**, independent of how it is worded.
3. **Disclosure, record-keeping and suitability obligations** that may attach to anything
   presented as decision support.
4. **Market-data licensing and redistribution**, including derived series, caching and any
   display of exchange-sourced prices. This is a licensing question, not a technical one.
5. **Monetisation law** — subscription terms, refunds and withdrawal rights, tax treatment,
   consumer-protection disclosures, and whether a credit balance is a regulated stored value.
6. **Data protection** — lawful basis, retention limits, cross-border transfer if any remote
   processing is ever added, and the interaction between the audit trail's retention and the
   right to erasure.

**These are gates, not footnotes.** No capability in §3 may be released in a market without
its review concluded, and the review outcome may change the product boundary in §1.7.

### 6.7 Disabled execution — **Implemented, permanently**

- Live trading and broker execution are typed as the literal `false`. Changing them requires
  a compile error to be resolved deliberately.
- `assertSafeConfig` refuses to start if either is ever `true`, along with a non-loopback
  host, live market data, sensitive file storage and unredacted logs.
- `assertNoHardlineOperations()` and `assertJobDefinitions()` reject any operation or job
  whose _name_ suggests orders, brokers, funds movement or live trading.
- The API is loopback-only, with an optional per-launch shell token compared in constant time.
- The system refuses to read a file it classifies as sensitive.
- There is no order, fill, position-send or brokerage concept anywhere in the schema — **22**
  tables, none of them an order book.

---

## 7. Roadmap alignment

### 7.1 Dependencies

```
             ┌─────────────────────────────────────────────┐
   NOW ──────▶  A. Live path (session → socket → real data) │  no new module
             └───────────────────┬─────────────────────────┘
                                 │
             ┌───────────────────▼─────────────────────────┐
             │  B. Desktop shell built once (Rust toolchain)│  no new module
             └───────────────────┬─────────────────────────┘
                                 │
      ┌──────────────────────────▼──────────────────────────┐
      │  C. User Profile inputs (capital, risk, horizon,     │
      │     holdings, constraints) + input-quality flow (§4) │
      └───────────┬───────────────────────────┬─────────────┘
                  │                           │
      ┌───────────▼────────────┐  ┌───────────▼──────────────┐
      │ D. Market Intelligence │  │  E. Deterministic backtest│
      │    real provider       │  │     (backtest.run handler)│
      └───────────┬────────────┘  └───────────┬──────────────┘
                  │                           │
                  └─────────────┬─────────────┘
                                ▼
      ┌─────────────────────────────────────────────────────┐
      │  F. Portfolio Engine  →  G. Portfolio Intelligence   │
      └───────────────────────────┬─────────────────────────┘
                                  ▼
      ┌─────────────────────────────────────────────────────┐
      │  H. Decision evaluation (§3.3)                       │
      └───────────────────────────┬─────────────────────────┘
                                  ▼
      ┌─────────────────────────────────────────────────────┐
      │  I. Usage credits & premium (§3.1) — can land earlier │
      │     for the *existing* capabilities, but not before   │
      │     its own compliance review (§6.6)                  │
      └─────────────────────────────────────────────────────┘
```

### 7.2 Phase map

| Suggested phase | Work                                                                        | Why it is here                                                                             |
| --------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **5.2**         | Live path: session issuance → authenticated socket → real queue in Activity | Everything behind it is built and verified only in-process. Highest value per unit of risk |
| **5.3**         | Build the desktop shell once (Rust toolchain); first real end-to-end        | Four phases of desktop work are policy-verified and never executed                         |
| **5.4**         | User Profile inputs + the §4 validation flow as a tested module             | The foundation every portfolio capability needs; also fixes the L2–L5 gap                  |
| **5.5**         | `backtest.run` handler + real curriculum content                            | Turns Research and Academy from fixtures into facts                                        |
| **5.6**         | Real market-data provider behind the existing abstraction                   | Requires the licensing review (§6.6 item 4) first                                          |
| **6.x**         | Portfolio Engine, then Portfolio Intelligence                               | Needs 5.4 and 5.6                                                                          |
| **7.x**         | Decision evaluation (§3.3)                                                  | Consumes everything above; the long-term differentiator                                    |
| **—**           | Usage credits & premium                                                     | Schematically independent, but **gated on §6.6 item 5**                                    |

### 7.3 What must not be built yet

The instruction to avoid premature implementation is a dependency statement, not a
preference:

- **Portfolio Intelligence before User Profile.** Without durable capital, risk tolerance,
  horizon and holdings, the module cannot produce a confident figure — so it would either
  violate §4 by assuming inputs, or produce nothing. Both are worse than waiting.
- **Decision evaluation before recorded decisions.** It has nothing to evaluate until (a)
  decisions are recorded with assumptions and provenance, and (b) outcomes can be observed
  from sourced data. Building the evaluator first designs a schema for records that do not
  exist.
- **Premium before its compliance review.** A credit system that charges for regulated
  output is a regulated product.
- **Real market data before its licensing review.**
- **Backtesting that presents results as strategy quality.** The engine computes; the claim
  about predictive validity needs the sample-size and out-of-sample discipline in §3.3.

### 7.4 ADRs added by this phase

| ADR                                                                   | Decision                                                                                                                                                                        |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ADR-0041](./adr/ADR-0041-input-quality-gates-the-output.md)          | Output quality is bounded by input quality; confidence is the weakest required input (`min`, never a mean); insufficient input descends the §4.5 ladder and never skips upward  |
| [ADR-0042](./adr/ADR-0042-portfolio-output-is-analysis-not-advice.md) | Portfolio output is analysis of a described composition; the system does not resolve the user's ambiguity and does not issue personalized advice; jurisdiction review is a gate |

---

## Appendix A — implemented inventory (verified)

| Area                | Verified fact                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| Tests               | **433 passing** in 30 files, 0 skipped, `npm run validate` exit 0 from a clean `npm ci`             |
| Authorization       | **31** operations, 5 roles, 2 `critical`-with-approval, deny-by-default                             |
| Database            | **22** tables, **7** ownership contexts, driver-agnostic DDL, generated + ledgered migrations       |
| Deterministic tools | **4**: `risk.positionSize`, `risk.rMultiple`, `marketData.sma`, `marketData.syntheticSeries`        |
| LLM providers       | OpenAI, Anthropic, local OpenAI-compatible, offline scripted — native `fetch`, no vendor SDK        |
| Job kinds           | **10**, none matching the hardline pattern                                                          |
| Realtime contracts  | **12** typed events, deny-by-default audiences, authenticated in the first frame                    |
| Web pages           | **10**, one sidebar entry per module, no execution affordance                                       |
| Desktop             | **22** verification checks, 0 errors, 1 warning (updater placeholder key) — **never compiled**      |
| Safety              | loopback-only, `false`-typed trading flags, no `child_process`/`eval` in `src/`, no `.env*` tracked |
| Production audit    | **0** vulnerabilities (`npm run audit:prod`)                                                        |

## Appendix B — glossary

| Term                    | Meaning in this project                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| **Analysis**            | A deterministic or sourced statement about what was measured. Carries its method and window      |
| **Recommendation**      | A proposed action. Must carry assumptions; never resolved on the user's behalf                   |
| **Personalized advice** | A recommendation that resolves the user's own ambiguity. **Out of scope** (§6.5)                 |
| **Assumption**          | A belief the output rests on, stored as structured data with an id and, where possible, a source |
| **Confidence**          | The weakest required input's quality — `min`, not mean (§4.4)                                    |
| **Provenance**          | Where a value came from: source, reference and epistemic kind                                    |
| **Epistemic kind**      | `fact` \| `analysis` \| `hypothesis` \| `uncertainty`                                            |
| **Data provenance**     | `synthetic` \| `historical` \| `live` — typed, and `live` is refused in configuration            |
| **Trust level**         | `unverified` → `corroborated` → `verified` → `authoritative`; the last two need a human verifier |
| **Hardline pattern**    | The regex that rejects any operation or job name suggesting execution, brokers or live trading   |
| **Ladder (L1–L5)**      | The permitted-behaviour levels for insufficient input (§4.5)                                     |
| **Inconclusive**        | A first-class evaluation verdict: the sample does not support a conclusion                       |
