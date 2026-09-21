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
