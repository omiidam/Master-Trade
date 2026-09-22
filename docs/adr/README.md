# Architecture Decision Records

Format: context → decision → **alternatives rejected and why** → consequences.
Status starts as `Accepted`; a superseded ADR keeps its number and points to its
replacement. ADRs 0010–0019 form the Phase 3.1 technology lock and each records
the alternatives that were deliberately turned down.

## Phase 1–2 — architecture and invariants

| ADR                                                     | Decision                                                                | Status   |
| ------------------------------------------------------- | ----------------------------------------------------------------------- | -------- |
| [0001](./ADR-0001-desktop-shell-tauri.md)               | Tauri as the desktop shell                                              | Accepted |
| [0002](./ADR-0002-modular-monolith.md)                  | Single-process modular monolith                                         | Accepted |
| [0003](./ADR-0003-sqlite-first.md)                      | SQLite as the initial database                                          | Accepted |
| [0004](./ADR-0004-llm-gateway-abstraction.md)           | Provider-independent LLM gateway                                        | Accepted |
| [0005](./ADR-0005-provider-independent-market-data.md)  | Provider-independent market data with mandatory provenance              | Accepted |
| [0006](./ADR-0006-vector-memory-separation.md)          | Vector memory separate from structured records, trust-gated             | Accepted |
| [0007](./ADR-0007-deny-by-default-auth.md)              | Deny-by-default authorization + human approval for sensitive operations | Accepted |
| [0008](./ADR-0008-no-experimental-core-dependencies.md) | No experimental languages/tech as core dependencies                     | Accepted |
| [0009](./ADR-0009-deterministic-tools-own-risk-math.md) | Deterministic tools own all risk math; LLM never bypasses permissions   | Accepted |

## Phase 3.1 — technology lock

| ADR                                                         | Decision                                                                    | Decision id(s)        | Status   |
| ----------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------- | -------- |
| [0010](./ADR-0010-frontend-framework-react-vite.md)         | Frontend framework: React 19 + Vite 6                                       | `DEC-FE-1-FRAMEWORK`  | Accepted |
| [0011](./ADR-0011-frontend-state-tanstack-query-zustand.md) | Frontend state: TanStack Query + Zustand                                    | `DEC-FE-2-STATE`      | Accepted |
| [0012](./ADR-0012-ui-system-tailwind-radix.md)              | UI system: Tailwind + Radix primitives (vendored)                           | `DEC-FE-3-UI-SYSTEM`  | Accepted |
| [0013](./ADR-0013-charting-lightweight-charts.md)           | Charting: TradingView Lightweight Charts behind a `ChartAdapter`            | `DEC-FE-4-CHARTING`   | Accepted |
| [0014](./ADR-0014-backend-runtime-fastify.md)               | Backend: Node 22 LTS + Fastify 5 as an adapter over typed contracts         | `DEC-BE-1·2·3`        | Accepted |
| [0015](./ADR-0015-validation-zod-single-source.md)          | Validation: Zod as the single source of truth, Fastify validation disabled  | `DEC-BE-4-VALIDATION` | Accepted |
| [0016](./ADR-0016-persistence-driver-and-orm.md)            | Persistence: better-sqlite3 + Drizzle, SQLite local / PostgreSQL production | `DEC-DB-1·2·3`        | Accepted |
| [0017](./ADR-0017-realtime-websocket-transport.md)          | Real-time: WebSocket over the existing event bus                            | `DEC-RT-1-WEBSOCKET`  | Accepted |
| [0018](./ADR-0018-durable-db-backed-job-queue.md)           | Jobs: durable database-backed queue with in-process workers                 | `DEC-JOBS-1-QUEUE`    | Accepted |
| [0019](./ADR-0019-llm-adapters-not-frameworks.md)           | LLM: adapters behind our interfaces; no agent framework                     | `DEC-AI-1·2·3`        | Accepted |
| [0020](./ADR-0020-ui-motion-framer-motion.md)               | UI motion: Framer Motion with reduced-motion presets                        | `DEC-FE-5-MOTION`     | Accepted |

## Phase 3.3 — backend foundation

| ADR                                            | Decision                                                                    | Decision id(s)           | Status   |
| ---------------------------------------------- | --------------------------------------------------------------------------- | ------------------------ | -------- |
| [0021](./ADR-0021-single-request-pipeline.md)  | One request pipeline for every route; honest 501s for unimplemented ones    | `DEC-BE-5-PIPELINE`      | Accepted |
| [0022](./ADR-0022-local-api-trust-boundary.md) | Local API trust boundary: loopback, per-launch shell token, hashed sessions | `DEC-DESKTOP-2-SECURITY` | Accepted |

## Phase 3.4 — database foundation

| ADR                                                          | Decision                                                                             | Decision id(s)                          | Status                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------ | --------------------------------------- | ------------------------------------------------- |
| [0023](./ADR-0023-repository-boundary-and-data-ownership.md) | Repository boundary + declared, validated data ownership                             | `DEC-DB-4-REPOSITORIES`                 | Accepted                                          |
| [0024](./ADR-0024-generated-migrations-and-ledger.md)        | Migrations generated from the schema, checksummed ledger, refuse instead of guessing | `DEC-DB-3-MIGRATIONS`                   | Accepted                                          |
| [0025](./ADR-0025-sqlite-driver-and-dialects.md)             | Driver becomes `node:sqlite`; one dialect serves SQLite and PostgreSQL               | `DEC-DB-1-LOCAL`, `DEC-DB-2-PRODUCTION` | Accepted (supersedes the driver half of ADR-0016) |

## Phase 3.5 — AI infrastructure

| ADR                                                             | Decision                                                                        | Decision id(s)          | Status   |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------- | -------- |
| [0026](./ADR-0026-cost-from-our-price-table.md)                 | Cost from our own price table; an unpriced model cannot be called               | `DEC-AI-2-GATEWAY`      | Accepted |
| [0027](./ADR-0027-structured-summaries-not-chain-of-thought.md) | Structured summaries only; chain-of-thought never accepted, stored or displayed | `DEC-AI-1-ABSTRACTION`  | Accepted |
| [0028](./ADR-0028-provider-transport-native-fetch.md)           | Provider transport over native `fetch`; no vendor SDK becomes a dependency      | `DEC-AI-3-INDEPENDENCE` | Accepted |

## Phase 3.6 — desktop foundation

| ADR                                                   | Decision                                                                                            | Decision id(s)               | Status   |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------- | -------- |
| [0029](./ADR-0029-webview-capability-boundary.md)     | WebView granted no `shell:` permission; Rust spawns the sidecar, commands are the only surface      | `DEC-DESKTOP-3-CAPABILITIES` | Accepted |
| [0030](./ADR-0030-sidecar-supervision-fixed-port.md)  | Fixed launch plan, fixed loopback port, per-launch token, proven readiness, bounded restarts        | `DEC-DESKTOP-4-LIFECYCLE`    | Accepted |
| [0031](./ADR-0031-desktop-config-appdata-keychain.md) | Config in the OS app-data directory, strict schema compared with Rust, credentials only in keychain | `DEC-DESKTOP-5-CONFIG`       | Accepted |

## Phase 3.7 — realtime, background jobs, preview prototype

| ADR                                                             | Decision                                                                               | Decision id(s)      | Status   |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------- | -------- |
| [0032](./ADR-0032-versioned-event-contracts-deny-by-default.md) | Versioned event contracts; deny-by-default audiences; auth + subscription in one frame | `DEC-RT-2-PROTOCOL` | Accepted |
| [0033](./ADR-0033-job-store-port-sqlite-first.md)               | A `JobStore` port, SQLite first; Redis/BullMQ only ever as an adapter                  | `DEC-JOBS-2-STORE`  | Accepted |
| [0034](./ADR-0034-loading-empty-error-are-designed-states.md)   | Loading, empty and error are designed states, shown with the real components           | `DEC-FE-8-STATES`   | Accepted |

The machine-readable form of this lock is `src/core/architectureLock.ts` and it
is enforced by `tests/technology-lock.test.ts`. Every decision id in the two
tables above also appears in [technology-decisions.md](../technology-decisions.md).

## Phase 4.1 — monorepo assessment (planning)

| ADR                                                            | Decision                                                                                                                                                                      | Decision id(s)      | Status   |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | -------- |
| [0035](./ADR-0035-monorepo-migration-staged-boundary-first.md) | Keep one package; make the frontend/backend boundary explicit (and enforced) before splitting it. Full `apps/` + `packages/` migration deferred with named trigger conditions | `DEC-REPO-1-LAYOUT` | Accepted |

The full analysis — the measured layout, the proposed `apps/`/`packages/`
mapping, the benefits that do **not** require moving directories, the
install-topology risk that motivated deferral, and the trigger conditions — is in
[monorepo-assessment.md](../monorepo-assessment.md). The boundary it declares is
enforced by `tests/monorepo-boundary.test.ts`.

## Phase 4.3 — `packages/shared` extraction

| ADR                                                      | Decision                                                                                                                                                                           | Decision id(s)              | Status   |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | -------- |
| [0036](./ADR-0036-extract-shared-package-source-only.md) | Extract the 22-file shared closure into a physical, source-only `packages/shared`: backend resolves it by relative path, frontend by `@shared/*`, no npm workspaces, no build step | `DEC-REPO-2-EXTRACT-SHARED` | Accepted |

**Path note:** ADRs and module documents written before Phase 4.3 name the modules
that have since moved — for example `src/core/errors.ts`, `src/types.ts`,
`src/api/contracts.ts`, `src/realtime/contracts.ts`, `src/jobs/service.ts` and
`src/desktop/ipc.ts` now live under `packages/shared/src/`. Those documents are kept
as records of the phase that wrote them and are **not** rewritten. For the current
layout, read [monorepo.md](../monorepo.md).

## Phase 4.4 — deterministic core, and four declined packages

| ADR                                                     | Decision                                                                                                                                                                                                         | Decision id(s)      | Status   |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | -------- |
| [0037](./ADR-0037-trading-engine-deterministic-core.md) | Extract `packages/trading-engine` (the Phase-1 Tools layer) so determinism is a testable boundary; **decline** `ui`, `database`, `ai` and `market-data` — each has one consumer and an already-enforced boundary | `DEC-REPO-3-ENGINE` | Accepted |

**Path note (continued):** `src/tools/**` now lives in `packages/trading-engine/src/**`,
and `src/api/`, `src/frontend/` and `src/marketdata/` were emptied in Phase 4.3 and removed
in Phase 4.4. Documents naming those paths describe the phase that wrote them.

## Phase 4.5 — finalized import strategy and package boundaries

| ADR                                                         | Decision                                                                                                                                                            | Decision id(s)       | Status   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | -------- |
| [0038](./ADR-0038-finalized-import-and-package-strategy.md) | The resolution rules stated once: `@shared/*` for the frontend, relative paths for the backend, one package dependency direction, and lock path claims must be true | `DEC-REPO-4-IMPORTS` | Accepted |

## Phase 4.6 — authorization clock, and the audit that found it

| ADR                                                        | Decision                                                                                                                                                                                        | Decision id(s)     | Status   |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------- |
| [0039](./ADR-0039-one-clock-per-authorization-decision.md) | Every authorization decision takes an **explicit** instant — `now` is required on `isSessionActive`, `authorize`, `requireOperation` and `guardRoute`, and each caller passes the clock it owns | `DEC-AUTH-2-CLOCK` | Accepted |

The Phase 4.6 audit is recorded in
[security-and-integration-audit.md](../security-and-integration-audit.md) (findings F-1…F-6,
with severity, evidence and dispositions).

## Phase 4.7 — final validation and handoff

| ADR                                                                  | Decision                                                                                                                                      | Decision id(s)         | Status   |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | -------- |
| [0040](./ADR-0040-a-refusal-is-reported-before-the-logger-exists.md) | A refusal that happens before a logger exists is written to `stderr` as one structured, redacted record, and the process still exits non-zero | `DEC-SERVER-3-REFUSAL` | Accepted |

The Phase 4 handoff — status per area, the VPS install path, known limitations and the
recommended Phase 5 start — is recorded in
[phase-4-handoff.md](../phase-4-handoff.md).

## Phase 5.1 — product vision and the boundaries it needs

Two decisions that constrain what the system may _conclude_, not how it is built. Both are
normative wording: a surface that phrases a measurement as an instruction to a specific user
is a defect against ADR-0042, and a capability that assumes a missing required input is a
defect against ADR-0041. The product scope they sit inside is
[product-vision-system-architecture.md](../product-vision-system-architecture.md).

| ADR                                                           | Decision                                                                                                                                                                                                                              | Decision id(s)                | Status   |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | -------- |
| [0041](./ADR-0041-input-quality-gates-the-output.md)          | Output quality is bounded by input quality: confidence is the **weakest** required input (`min`, never a mean), conflicts are surfaced rather than resolved, and insufficient input descends the L1–L5 ladder without skipping upward | `DEC-PRODUCT-2-INPUT-QUALITY` | Accepted |
| [0042](./ADR-0042-portfolio-output-is-analysis-not-advice.md) | Portfolio output is analysis of a composition the user described; the system never resolves the user's ambiguity and never issues personalized investment advice, and jurisdiction review is a release gate                           | `DEC-PRODUCT-3-NOT-ADVICE`    | Accepted |

## Phase 5.2 — the durable home for declared inputs

ADR-0041 §8 required a durable store before the capabilities that consume it are built. This is
that store, and the decision below is how it honours the four rules that cannot be applied after
the fact (provenance kept, conflicts detectable, status recomputable, gaps recoverable).

| ADR                                                                                  | Decision                                                                                                                                                                                                                | Decision id(s)                 | Status   |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | -------- |
| [0043](./ADR-0043-the-trading-context-is-derived-append-only-and-never-defaulted.md) | A trading context is a versioned, **append-only** document of field-level declarations: status is **derived** on read (never stored), a value is **never defaulted**, and the version is the server's, not the caller's | `DEC-PROFILE-1-DERIVED-STATUS` | Accepted |

The domain model, schema, ownership rules, validation rules, freshness policy and deferrals are
in [user-profile-and-trading-context.md](../user-profile-and-trading-context.md).

## Phase 5.3 — the gate runs before the model

ADR-0041 named a ladder and ADR-0043 gave the inputs a durable home. Neither said _where_ the
ladder is evaluated, and that location is the difference between a rule and a wish: put it in
the prompt and it becomes an interpretation no test can hold. The decision below puts it in a
pure function that runs first, so a refusal means the model was never asked.

| ADR                                                  | Decision                                                                                                                                                                                                                                                                                               | Decision id(s)                 | Status   |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ | -------- |
| [0044](./ADR-0044-the-gate-runs-before-the-model.md) | Requirements are declared per capability and the readiness verdict is computed from stored state **before** any model is consulted: a refusal short-circuits the turn, a permitted verdict still travels, an undecidable gate is a refusal, and one implementation serves both the route and the agent | `DEC-QUALITY-1-READINESS-GATE` | Accepted |

The eight quality dimensions, the closed issue vocabulary, the validation rules, the
freshness policy, the requirement registry, the readiness outcomes, the redaction rules and
the deferrals are in
[input-quality-and-data-reliability.md](../input-quality-and-data-reliability.md).

## Phase 5.4 — plans are code, and entitlement may only narrow

Phase 5.1 placed Usage Credits & Premium on the roadmap with two constraints: no payment
integration in this phase, and no encouragement of excessive trading. Those constraints turn out
to decide the architecture. A plan decides what an account may consume, so it belongs to the
same boundary as the role table — and a boundary that a database write can move is not a
boundary. The decision below therefore keeps the catalogue in code, makes the purchase question
answerable in the negative, and gives the resolver one direction: it may narrow what the role
table allows and can never widen it.

| ADR                                                               | Decision                                                                                                                                                                                                                                                             | Decision id(s)               | Status   |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | -------- |
| [0045](./ADR-0045-plans-are-code-and-entitlement-only-narrows.md) | Plans are declared **in code** and no plan is purchasable, enforced at boot; no tier may reach an approval-gated operation; entitlement may only **narrow** a role decision; credits are **reserved before the work** and returned in full when it does not complete | `DEC-USAGE-1-PLANS-ARE-CODE` | Accepted |

The catalogue, the credit accounting rules, the metering lifecycle, the refund and idempotency
strategy, the entitlement enforcement order, the security posture, the frontend surface, the
prerequisites of a future payment integration and the deferrals are in
[usage-credits-and-premium.md](../usage-credits-and-premium.md).

## Phase 5.5 — the portfolio is declared, and its values are never stored

Phase 5.1 asked for portfolio intelligence that analyses rather than advises. The architecture
follows from one observation: a market value is a function of a price, so a stored total is
either wrong or a second source of truth that drifts invisibly. The decision below keeps the
_document_ in the database and computes every figure from it, makes `null` a state rather than a
zero, and composes the portfolio gate with the phase 5.3 one so the second can only ever narrow
the first.

| ADR                                                                             | Decision                                                                                                                                                                                                                                                                                                             | Decision id(s)                        | Status   |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | -------- |
| [0046](./ADR-0046-the-portfolio-is-declared-and-its-values-are-never-stored.md) | The portfolio is **declared**: no value, cost basis or share is ever stored; `null` is a state, not a zero; a share of the whole requires the whole **in one currency**; two weight populations and never a hybrid; readiness may only narrow the phase 5.3 verdict; composition is free because it runs no provider | `DEC-PORTFOLIO-1-DECLARED-NOT-STORED` | Accepted |

The domain model, the calculation rules, the readiness matrix, the provenance and freshness
policy, the storage split, the API and metering boundary, the surface, and the prerequisites of a
future market-data provider are in
[portfolio-intelligence.md](../portfolio-intelligence.md).

## Phase 5.7 — capabilities are declared, and the pipeline is a plan

Phase 5.1 asked for a platform where the Agent Core does not own every responsibility. Phase 5.7
answers it with a **capability**: a declared unit of work naming the modules it composes, the
inputs that gate it, the operation the role table decides, the credits it costs, the engine that
computes its figures, and what it explicitly does not claim. Undeclared means nonexistent, the
catalogue is cross-checked against every other registry at boot, and the eleven-stage flow is a
**pure plan** rather than a chain of awaits — so a refusal names the stage it stopped at, and a
request refused before the engine holds no credits.

| ADR                                                                        | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Decision id(s)                          | Status   |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | -------- |
| [0047](./ADR-0047-capabilities-are-declared-and-the-pipeline-is-a-plan.md) | Capabilities are **declared code** and deny-by-default; the catalogue is cross-checked against the requirement, feature and role tables at boot; the pipeline is a **plan** whose refusal names the stage; readiness precedes permission precedes entitlement precedes the engine, so a refusal never moves a credit; availability and readiness are separate axes; `modelMayRequest` makes the LLM boundary declared; one result shape for a run and a refusal; deterministic work is free and nothing execution-shaped exists | `DEC-CAPABILITY-1-DECLARED-AND-PLANNED` | Accepted |

The capability model, the catalogue, the lifecycle, the readiness gate, the orchestration order,
the permission and credit boundary, the provenance and memory policy, the structured result, the
portfolio and evaluation integrations, the responsive/mobile architecture and the security
posture are in [capability-integration.md](../capability-integration.md).

## Phase 5.8 — the transport boundary, and the brand as an artifact

Phase 5.7 gave the API a capability pipeline and left almost nothing in front of it. Phase 5.8 adds
the three boundaries that run **before** authentication — response headers, a loopback-only origin
policy that refuses a foreign origin rather than merely withholding CORS headers, and a per-client
rate limit counted before the session lookup — and closes one real disclosure gap: a message this
codebase did not author no longer reaches the caller, while the log keeps it and the correlation id
joins the two. The same phase replaced the placeholder brand with one committed source image that
every icon, favicon, launcher asset and link preview is generated from, because a logo is a build
artifact and a second drawing of it is a logo that drifts.

| ADR                                                                        | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Decision id(s)                     | Status   |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | -------- |
| [0048](./ADR-0048-the-transport-boundary-refuses-before-authentication.md) | Headers, origin policy and rate limiting are mounted before every route and apply to failures as well as successes; a foreign origin is **refused**, not merely denied headers; the limit is keyed on the peer address and counted **before** authentication, with a bounded bucket table; an **unvouched** error message is replaced in the body and kept in the log, joined by the correlation id; the trading boundary is asserted against the **source tree**, not only the configuration; no TLS here and no new dependency, both deliberately | `DEC-TRANSPORT-1-REFUSE-FIRST`     | Accepted |
| [0049](./ADR-0049-the-brand-is-one-source-generated-not-drawn.md)          | One committed source image and a **dependency-free** generator; the crop box is **measured** on every test run; icons are the mark alone, the full lockup appears once (the OG card); the interface's wordmark is **live text**, not a raster; the mark is decorative unless it is the only name; identity is declared and every path is checked; stale instructions are deleted rather than annotated                                                                                                                                              | `DEC-BRAND-1-ONE-SOURCE-GENERATED` | Accepted |

The transport boundary, the data classification, secret management, the incident assumptions and
every item that needs professional review are in
[security-and-privacy.md](../security-and-privacy.md). The asset set, the usage rules and the
identity mapping are in [brand-assets.md](../brand-assets.md).
