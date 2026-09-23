# Master Trade — System Architecture

Desktop-based **Trading Training Agent** that takes a learner from beginner to
advanced over ≥6 months. TypeScript core, single-process modular monolith,
training-only: no live trading, no broker execution, no automatic rule activation.

This document is the top-level map. Each layer has its own document; ADRs record
why the decisions were made.

| Area                                              | Document                                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Product vision, module boundaries, roadmap**    | **[product-vision-system-architecture.md](./product-vision-system-architecture.md)** |
| **Technology decisions / architecture lock**      | **[technology-decisions.md](./technology-decisions.md)**                             |
| Frontend implementation (shell, UI library)       | [frontend-foundation.md](./frontend-foundation.md)                                   |
| Trading journal module                            | [journal.md](./journal.md)                                                           |
| User profile and trading context                  | [user-profile-and-trading-context.md](./user-profile-and-trading-context.md)         |
| Input quality and the analysis-readiness gate     | [input-quality-and-data-reliability.md](./input-quality-and-data-reliability.md)     |
| Usage credits, plans and premium                  | [usage-credits-and-premium.md](./usage-credits-and-premium.md)                       |
| Portfolio intelligence (declared, never stored)   | [portfolio-intelligence.md](./portfolio-intelligence.md)                             |
| Capabilities, orchestration, evaluation surface   | [capability-integration.md](./capability-integration.md)                             |
| Desktop shell, frontend, view models              | [desktop-and-frontend.md](./desktop-and-frontend.md)                                 |
| API layer, contracts, auth/authz                  | [api-auth.md](./api-auth.md)                                                         |
| AI layer, prompts, LLM abstraction                | [ai-and-llm.md](./ai-and-llm.md)                                                     |
| Database, entities, migrations, file storage      | [database-and-storage.md](./database-and-storage.md)                                 |
| Background jobs, WebSocket layer                  | [jobs-and-realtime.md](./jobs-and-realtime.md)                                       |
| Market-data abstraction                           | [market-data.md](./market-data.md)                                                   |
| Vector memory                                     | [vector-memory.md](./vector-memory.md)                                               |
| Logging, audit, observability                     | [observability.md](./observability.md)                                               |
| Where the build actually stands (Phase 4 handoff) | [phase-4-handoff.md](./phase-4-handoff.md)                                           |
| Risks, trade-offs, deferred work                  | [risks-and-deferred.md](./risks-and-deferred.md)                                     |
| Architecture Decision Records                     | [adr/](./adr/)                                                                       |

## 1. High-level architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│ Desktop Application (Tauri shell)                                    │
│  · windows, tray, notifications, OS keychain, offline cache          │
│  · hosts one local process: API + backend + agent (modular monolith) │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ in-process IPC (same typed contracts as HTTP)
┌──────────────────────────────▼───────────────────────────────────────┐
│ Frontend (WebView, TypeScript)                                       │
│  conversation · academy · dashboard (read-only) · logs · settings    │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ typed requests / responses + WebSocket events
┌──────────────────────────────▼───────────────────────────────────────┐
│ API Layer (src/api)                                                  │
│  versioned routes · body validation · authN/authZ guard · errors     │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ application services (no transport types)
┌──────────────────────────────▼───────────────────────────────────────┐
│ Backend (src/agent, src/instructions, src/memory, src/evaluation)    │
│  agent orchestration · education · evaluation · risk services        │
└───────────────┬────────────────────────────────────┬─────────────────┘
                │                                    │
┌───────────────▼──────────────────┐  ┌──────────────▼──────────────────┐
│ AI Orchestrator                  │  │ Tools (deterministic)           │
│  context assembly · lifecycle ·  │  │ risk, market-data, education    │
│  permission checks · provenance  │  │ side-effect free by construction│
└───────────────┬──────────────────┘  └─────────────────────────────────┘
                │ provider-independent
┌───────────────▼──────────────────┐
│ LLM Abstraction (src/llm)        │
│  provider interface · fallbacks  │
│  tokens/cost · timeouts          │
└──────────────────────────────────┘

        ┌──────────────────────────────┐   ┌───────────────────────────┐
        │ Database (SQLite)            │   │ File storage (local)      │
        │ structured records, audit    │   │ documents, datasets, imgs │
        └──────────────┬───────────────┘   └───────────────────────────┘
                       │ pointers + metadata
        ┌──────────────▼───────────────┐   ┌───────────────────────────┐
        │ Vector memory                │   │ Jobs + real-time bus      │
        │ embeddings, trust, versions  │   │ queue, events, replay     │
        └──────────────────────────────┘   └───────────────────────────┘
```

### Why one process

The product is a desktop training tool with one local user. Microservices would
add deployment, authentication and observability overhead with no benefit. The
module boundaries above are therefore _enforced by directory + dependency
discipline_, not by the network — so any of them (jobs, market data, vector
memory) can be extracted later behind its existing interface.

## 2. Three independent components (Phase 1 invariant, preserved)

1. **Model** (`ModelAdapter` in `src/agent/orchestrator.ts`, `LlmProvider` in
   `src/llm/provider.ts`) — reasoning, explanation, decision _support_. It never
   performs risk math and never executes a tool.
2. **Tools** (`packages/trading-engine/src/`) — explicit, typed, deterministic,
   side-effect free. Extracted as a package in Phase 4.4 so its determinism is enforced
   rather than assumed ([ADR-0037](./adr/ADR-0037-trading-engine-deterministic-core.md)).
   The registry refuses to register a side-effecting tool at all.
3. **Instructions** (`src/instructions/loader.ts`) — versioned, immutable, and
   validated against a policy gate that rejects authorization language.

Supporting subsystems added in Phase 2 keep the same separation: permissions
(`src/auth`), memory (`src/memory`, `src/vector`), evaluation
(`src/evaluation`), approvals (`src/agent/approval.ts`), proposals
(`src/agent/proposals.ts`), context assembly (`src/agent/context.ts`).

## 3. Component responsibility matrix

| Component             | Owns                                                                                                   | Never does                                                       | Module                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Desktop shell         | windows, OS keychain, dialogs, offline cache, updates                                                  | business logic, provider credentials in plain text               | `src/desktop/host.ts`                                                         |
| Frontend              | UI, application state, rendering provenance/labels                                                     | calling providers directly, offering execution controls          | `packages/shared/src/frontend/viewModels.ts`                                  |
| API layer             | versioned routes, validation, authZ guard, error mapping                                               | business rules, direct DB access                                 | `src/api/contracts.ts`                                                        |
| Backend services      | orchestration, education, evaluation, risk services                                                    | provider-specific code, transport concerns                       | `src/agent/*`                                                                 |
| AI orchestrator       | lifecycle, context assembly, permission checks, provenance                                             | numeric risk calculations, direct provider calls                 | `src/agent/orchestrator.ts`, `src/agent/context.ts`                           |
| LLM abstraction       | provider interface, fallback, retry/timeout, circuit breaker, pricing from our table, summary contract | executing tools, granting permissions, reading private reasoning | `src/llm/provider.ts`, `pricing.ts`, `summary.ts`, `prompt.ts`, `registry.ts` |
| Tools                 | deterministic calculations, labeled data retrieval                                                     | side effects, network writes, order logic                        | `packages/trading-engine/src/*`                                               |
| Instructions          | versioned rules, safety policy text                                                                    | being edited in place; being authored by the model               | `src/instructions/loader.ts`                                                  |
| Auth                  | sessions, roles, deny-by-default grants, approval flags                                                | live trading or broker capabilities (they do not exist)          | `src/auth/model.ts`                                                           |
| Permissions (Phase 1) | capability table for tools                                                                             | granting model direct memory/backtest access                     | `src/permissions/model.ts`                                                    |
| Database layer        | entity definitions, migrations, repositories                                                           | storing secrets or raw file bytes                                | `src/db/schema.ts`                                                            |
| File storage          | metadata, ownership, validation, size limits                                                           | storing sensitive categories by default                          | `src/storage/files.ts`                                                        |
| Jobs                  | queueing, idempotency, retry/timeout, approval gate                                                    | running unapproved evaluation/backtest work                      | `src/jobs/queue.ts`                                                           |
| Real-time bus         | role-scoped delivery, ordering, replay                                                                 | sending internal events to clients                               | `src/realtime/events.ts`                                                      |
| Market data           | provider interface, normalization, quality checks, provenance                                          | fetching live data in this phase; trading                        | `packages/shared/src/marketdata/provider.ts`                                  |
| Vector memory         | embeddings, ranking, trust, versioning, deletion                                                       | promoting model output to trusted knowledge                      | `src/vector/memory.ts`                                                        |
| Observability         | structured logs, redaction, correlation ids, audit                                                     | logging secrets, unredacted payloads                             | `src/core/logging.ts`                                                         |
| Approvals             | human approval requests/decisions                                                                      | self-approval, approval of non-gated operations                  | `src/agent/approval.ts`                                                       |

## 4. Data flows

### 4.1 User → Frontend → API → Backend

```
User action
  └─ Frontend builds ApiEnvelope {version, correlationId, routeId, body}
      └─ API: validateEnvelope() ──invalid──> 400 VALIDATION_FAILED
      └─ API: guardRoute() ──unauthenticated──> 401 / forbidden ──> 403
      └─ API: route.validateBody() ──invalid──> 400
      └─ Backend service (no transport types)
          └─ repository / tool / agent call
              └─ ApiResponse {ok:true, data, correlationId}
                  └─ Frontend view model (+ provenance label)
```

### 4.2 User → AI Orchestrator → Model → Tools

```
User message
  └─ Orchestrator: lifecycle IDLE→LOADING→READY→RUNNING
      └─ Context assembly (budgeted): instructions + memory + history + data
          └─ Model (LLM) returns statements + tool-call *requests*
              └─ Orchestrator, per requested tool:
                   permission check (auth + PHASE1_PERMISSIONS)
                     ├─ denied ──> BLOCKED → IDLE, reason returned
                     └─ allowed ──> deterministic tool run
                                     └─ provenance recorded in memory/audit
      └─ RESPONDING → IDLE with labeled statements
```

### 4.3 Market data → validation → storage → agent

```
Provider (synthetic/historical only)
  └─ MarketDataSource: rate limit → timeout → fetchBars
      └─ validateBars: ordering, duplicates, range, OHLC, volume
          ├─ issues ──> DataQualityReport (never silently "repaired")
          └─ normalized bars + provenance record
              └─ market_data_bars table (provenance column mandatory)
                  └─ agent context: labeled fact, synthetic explicitly marked
```

### 4.4 Agent → proposal → evaluation → human approval

```
Model or human proposes a rule          (status: draft)
  └─ deterministic evaluation / backtest job ── requires approval to enqueue
      └─ attachEvaluation (verdict: promising | inconclusive | rejected)
           ├─ rejected ──> status rejected (terminal)
           └─ otherwise ──> status awaiting-approval
               └─ ApprovalWorkflow.submit (operation: rule.activate)
                   └─ human decider (owner role, not the requester)
                       ├─ rejected ──> stays non-active
                       └─ approved ──> RuleRegistry.activate() succeeds
                                       └─ status: active + activationApprovalId
```

Activation is impossible without a recorded approval: `activate()` throws a
`PolicyViolationError` if the proposal has no evaluation or no approved request.

## 5. Security boundaries

| Boundary                  | Rule                                                                        |
| ------------------------- | --------------------------------------------------------------------------- |
| Untrusted input → typing  | only `src/api` parses; everything downstream is typed                       |
| Frontend → backend        | frontend never calls a provider, DB or the LLM directly                     |
| Model → tools             | model returns _requests_; the orchestrator executes after permission checks |
| Model → memory            | model writes are forced to trust `unverified`                               |
| Automation → knowledge    | tool/system verifiers can never grant `authoritative` trust                 |
| Jobs → evaluation         | approval-gated job kinds cannot even be enqueued unapproved                 |
| Realtime → client         | events declare an audience; empty audience is never delivered               |
| Config → secrets          | config holds `SecretRef` only; secrets resolve from the OS keychain         |
| Logs → secrets            | redaction is recursive and mandatory (`redactSecrets: true`)                |
| Storage → sensitive files | sensitive category refused unless policy changed by a human                 |
| Any layer → trading       | no operation id, tool, capability or config key can trade                   |

## 6. Safety model (unchanged, extended)

- `SafetyProfile` keeps `liveTradingEnabled: false` and
  `brokerExecutionEnabled: false` as literal types — there is no `true` value.
- `assertSafeConfig()` refuses startup if any layer could reach live data,
  execution, sensitive storage, unredacted logs or direct model tool execution.
- `assertNoHardlineOperations()` proves no operation like `broker.*`,
  `execute`, `place-order` or `live-trading` exists in the catalogue.
- `FORBIDDEN_UI_CONTROL` prevents the UI from ever rendering an execution control.
- New trading rules require a human approval row before activation.

## 7. Epistemic discipline

`fact | analysis | hypothesis | uncertainty` remains the label on every
statement and memory record. `contextKindForTrust()` maps retrieval trust to a
label so unverified material enters the context as _uncertainty_, never as fact.

## 8. Repository layout (Phase 2)

```
master-trade/
├── src/
│   ├── api/            # typed contracts, validation, route guard
│   ├── agent/          # lifecycle, orchestrator, approval, proposals, context
│   ├── auth/           # roles, sessions, deny-by-default authorization
│   ├── core/           # config, errors, provenance, logging, retry, rate limit, ids
│   ├── db/             # entity definitions + migration strategy
│   ├── desktop/        # desktop shell contract + evaluation
│   ├── evaluation/     # invariant harness
│   ├── frontend/       # view models + UI invariants
│   ├── instructions/   # versioned instruction loader
│   ├── jobs/           # job definitions + in-process queue
│   ├── llm/            # provider abstraction + gateway
│   ├── marketdata/     # provider interface, normalization, quality
│   ├── memory/         # provenance-tagged structured memory (Phase 1)
│   ├── permissions/    # tool-capability table (Phase 1)
│   ├── realtime/       # event bus, visibility, ordering, replay
│   ├── storage/        # file metadata + validation + adapters
│   ├── tools/          # framework + risk + market data tools
│   ├── vector/         # embeddings, retrieval, trust, versioning
│   └── types.ts        # shared types + SafetyProfile
├── tests/              # 9 suites incl. architectural invariant tests
└── docs/               # this set + adr/
```

Dependency direction: `api → agent → (llm, tools, vector, marketdata, auth,
core)`; `core` depends on nothing above it. No module imports `api`.

The frontend is a second boundary. Phase 4.1 assessed whether the project should
become an npm-workspace monorepo and decided **not to migrate now**: the shared surface
already existed as a path depth, the install topology that just broke on the VPS
(`@tailwindcss/oxide`, `c92fa9c`) is sensitive to workspace hoisting, and the target
`packages/trading-engine` would be nearly empty.

Phase 4.2 implemented the decision's first step with **no directory change**: the
frontend imports backend code only through 13 exact `@shared/*` names, declared once in
`config/sharedSurface.ts`, mirrored in both tsconfigs and used by the Vite and Vitest
resolvers. Exact-match means `@shared/db/sqlite` or `@shared/server/app` do not
resolve, so the compiler and the bundler — not just a test — refuse a frontend import
that reaches backend internals.

Phase 4.3 executed step 2: that surface is now the physical, source-only package
**`packages/shared`**, holding a closed **22-module** set (the 13 declared entries plus
the 9 modules they transitively need). Two genuine consumers use it — the frontend
through `@shared/*`, and the backend through relative paths, because Node cannot execute
a TypeScript specifier at runtime. The package imports nothing outside itself, and
`npm ci` with the committed lockfile is still the only install path (no workspaces yet).
Phase 4.4 extracted a second package, **`packages/trading-engine`** — the Phase-1 **Tools**
layer (the `Tool` contract, the risk calculations, the deterministic market-data math). Its
justification is **safety rather than sharing**: "risk calculations must not depend on
LLM-generated reasoning" was a convention, and is now a boundary the test refuses — the
engine may import `packages/shared` and itself, and nothing else. The Model and the
Instructions remain in the backend, so the Model / Tools / Instructions separation is
unchanged. The other four candidate packages were declined for want of a second consumer
(see [ADR-0037](./adr/ADR-0037-trading-engine-deterministic-core.md)).

See [monorepo.md](./monorepo.md),
[ADR-0035](./adr/ADR-0035-monorepo-migration-staged-boundary-first.md),
[ADR-0036](./adr/ADR-0036-extract-shared-package-source-only.md) and
[ADR-0037](./adr/ADR-0037-trading-engine-deterministic-core.md); enforced by
`tests/monorepo-boundary.test.ts`.

## 9. Implementation status (Phase 2)

Implemented (types + behaviour + tests):

- config, errors, provenance/trust, logging + redaction, retry/timeout, rate limit
- auth model (roles, sessions, deny-by-default, approval flags)
- API contracts, validation, guard, error mapping
- LLM provider interface + gateway (fallback, retry, timeout, circuit breaker,
  tokens, pricing from our own table, budget refusal) and the structured-summary
  contract a model answer must satisfy
- market-data provider interface, normalization, quality validation, provenance
- database entity definitions + migration validation
- file storage contract + validation + in-memory adapter
- job definitions + queue (idempotency, retry/dead-letter, approval gate)
- real-time bus (role visibility, ordering, replay)
- vector memory (embedding provider, ranking, trust, versioning, tombstone)
- approval workflow, rule registry, context assembly, desktop host, view models
- Phase 1 model/tools/instructions separation and safety gates, still enforced

Phase 3.3 mounted this on HTTP (see § 12); Phase 3.4 added the SQLite driver,
generated migrations and repositories; Phase 3.5 implemented the LLM adapters,
cost accounting and the summary contract. Deferred intentionally: real
market-data providers, a hosted provider actually registered by the server,
durable job scheduler, WebSocket transport server, streaming and UI
cancellation, embedding provider (remote), full curriculum content, backtesting.

See [risks-and-deferred.md](./risks-and-deferred.md) for the trade-offs and the
recommended Phase 3.

## 10. Technology lock (Phase 3.1)

Phase 3.1 added no behaviour: it decided _which technologies_ implement the
boundaries above and froze that decision set so Phase 3.2 cannot start on an
undocumented stack.

| Layer    | Locked implementation                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------- |
| Frontend | React 19 + Vite 6, TanStack Query + Zustand, Tailwind + Radix, Lightweight Charts via adapter                       |
| Backend  | Node.js 22 LTS + Fastify 5 as an adapter over `src/api/contracts.ts`, Zod as sole validator                         |
| Database | better-sqlite3 (WAL, app-data dir) + Drizzle; PostgreSQL 16 deferred for hosted mode                                |
| AI       | `LlmProvider` adapters (OpenAI, Anthropic, local OpenAI-compatible) behind the existing gateway; no agent framework |
| Desktop  | Tauri 2 shell + Node sidecar on loopback with a per-launch bearer token and keychain secrets                        |
| Realtime | WebSocket `/ws` (`@fastify/websocket`) over the existing `EventBus`                                                 |
| Jobs     | Durable database-backed queue, in-process workers, atomic claim + lease, dead-letter                                |

- Decisions and rationale: [technology-decisions.md](./technology-decisions.md)
- Machine-readable lock: `src/core/architectureLock.ts` (`LOCKED_DECISIONS`)
- Enforcement: `tests/technology-lock.test.ts` — every area answered, every ADR
  present, no experimental technology as a core dependency, and provider SDK
  imports confined to `src/llm/providers/**`.
- Alternatives rejected for each choice are recorded in
  [ADR-0010…ADR-0019](./adr/README.md).

No dependency was installed in Phase 3.1; the lock is documentation plus data
structures plus tests. Phase 1/2 safety gates (`assertSafeConfig`,
`assertNoHardlineOperations`, approval workflow, UI-control check, provenance
rules) are unchanged and still enforced.

## 11. Frontend foundation (Phase 3.2)

`web/` now contains a running React workstation interface — shell (sidebar,
topbar, workspace), design token system, ten-primitive component library and five
prototype pages — built on the locked stack and driven by mock data that is
**typed against the backend view models**. No backend, AI, permission or safety
module was modified, and no endpoint, model or feed is connected: every screen
says so. Details, guardrails and remaining accessibility gaps:
[frontend-foundation.md](./frontend-foundation.md). The trading journal — one sidebar
entry with seven internal sections, and the record rules it enforces — is
[journal.md](./journal.md); it introduces no new boundary, reads no store, and
computes nothing the engine owns.

## 12. Backend foundation (Phase 3.3)

`src/server/**` mounts the Phase 2 API contract layer on Fastify 5, loopback
only, with Zod as the sole validator:

```
version gate → access policy (loopback + shell token) → envelope unwrap
             → authentication → authorization → approval gate
             → validation → path/body agreement → handler
```

- The pipeline is a `preHandler` **generated for every catalogue route**, and
  start-up asserts coverage: a route without the pipeline, or a catalogue route
  missing from the server, is a boot failure ([ADR-0021](./adr/ADR-0021-single-request-pipeline.md)).
- Routes whose capability does not exist yet are registered anyway and answer an
  authenticated, authorized `501` naming what is missing — including the
  approval-gated `rule.activate`, which is refused with `451` **before** it can
  reach that 501.
- One error handler maps every failure through the typed `ERROR_STATUS` table;
  one logging path emits one structured line per request with the route id and
  correlation id; readiness re-asserts the safety invariants at runtime and
  reports every unbuilt layer as `degraded` rather than `ok`.
- Configuration is environment-driven with refusal rules, `SecretRef`-only
  secrets and a redacted `describeConfig()` for the owner-only readiness view.

No trading capability was added, no permission was relaxed, and the Model /
Tools / Instructions separation plus the approval gates are untouched. Details:
[backend-foundation.md](./backend-foundation.md),
[ADR-0022](./adr/ADR-0022-local-api-trust-boundary.md).

## 13. Capability integration (Phase 5.7)

Phases 5.2–5.6 each built one module. Phase 5.7 gave them one unit of work and one
path: a **capability** is declared code naming the modules it composes, the analysis
type that gates it, the operation the role table decides, the credits it costs, the
engine that owns its arithmetic, and what it explicitly does not claim.

```
request → resolution → validation → quality → readiness → permission
        → entitlement → engine → evidence → explanation → result → audit
```

- **Deny-by-default.** An undeclared id does not exist; there is no fuzzy match and no
  fallback capability ([ADR-0047](./adr/ADR-0047-capabilities-are-declared-and-the-pipeline-is-a-plan.md)).
- **The pipeline is a plan, not a call chain.** `planCapabilityRun` is pure, so a
  refusal names the stage it stopped at as a value the API returns.
- **Order is load-bearing.** Readiness precedes permission (nobody is told they lack
  authority for something their inputs cannot support); permission precedes
  entitlement (authority is not affordability); entitlement precedes the engine, so a
  refused request holds no credits at all.
- **The catalogue is cross-checked at boot** against the requirement table, the feature
  catalogue and the role table, and a `high-impact` capability that would cite
  unverified memory fails the check rather than shipping.
- **The surface derives nothing.** One sidebar entry with two internal tabs renders the
  structured result — including absences with their reasons — and performs no arithmetic.
  Responsive behaviour is the shared system's (icon rail below 1100px, mobile-first
  grids, the one table inside its own scroll container), enforced by tests.

No execution capability exists, `liveTradingEnabled` and `brokerExecutionEnabled`
remain disabled, and no model has a vote on readiness, permission or cost. Details:
[capability-integration.md](./capability-integration.md).

## 14. Security, privacy and brand identity (Phase 5.8)

Phase 5.8 added nothing to the product's capability surface and two things to its guarantees.

**The transport boundary.** Three hooks run before any route and apply to every reply, including
failures: a fixed header set (`nosniff`, no framing, `no-referrer`, same-origin resource policy, a
restrictive permissions policy, and `Cache-Control: no-store`), a **loopback-only** origin policy
that refuses a foreign origin outright rather than merely withholding CORS headers, and a per-client
sliding-window rate limit counted **before** the session lookup so an unauthenticated flood is
refused as a flood. The allow-list cannot be widened: `assertSafeConfig` refuses to boot with a
non-loopback origin in it. See `src/server/security.ts` and ADR-0048.

**Error redaction.** A failure's response body now carries a message only when this codebase wrote
it. An unexpected throw — a driver error holding a file path, a provider payload — is replaced with a
generic message in the body while the log keeps the full text, joined by the correlation id that is
in both. The error _path_ was already audited; the error _text_ now is too.

**The trading boundary is asserted against the source.** `tests/security.test.ts` fails if any
shipped file enables live trading, broker execution, remote storage, sensitive files or model tool
authority, if any route names an order, trade, execution, broker, position or fill, or if any shipped
source file matches a high-signal credential shape. `liveTradingEnabled` and `brokerExecutionEnabled`
remain `false` by type, by default and by a boot check.

**Brand identity is a build artifact.** One committed source image
(`assets/brand/master-trade-logo-source.png`) and one dependency-free generator produce every icon,
favicon, apple-touch icon, PWA manifest icon, desktop launcher icon and the Open Graph card. The
in-app mark is that same generated icon, so the interface, the browser tab and the desktop launcher
cannot show three different logos; the wordmark in the interface is live text so it inherits the type
scale and mirrors in RTL. The mark is decorative unless it is the only name for the product. Full
asset mapping, usage rules and the responsive behaviour per surface:
[brand-assets.md](./brand-assets.md), ADR-0049.

**Detailed posture, data classification and the items that need professional review:**
[security-and-privacy.md](./security-and-privacy.md).

## 15. Product foundation testing (Phase 5.9)

**The suite is a layered contract, not a coverage number.** Fifty-one files and 921 tests sit in
seven layers, and the layering is deliberate: a domain rule and the route that exposes it are
checked by different suites, so a change to one cannot satisfy both by accident. Pure-engine
arithmetic (`portfolio`, `quality`, `usage`, `capabilities`) has no clock, no network and no
database handle; the API layer boots a real Fastify instance over a real migrated SQLite file; the
frontend layer reads the shipped `.tsx` as text and asserts what a surface may compute, claim,
expose and lay out.

**The joins between phases are asserted, not assumed.** `tests/product-flows.test.ts` walks the five
flows end to end through the real routes — the profile write the quality gate reads, the gate's
verdict the agent turn stops on, the capability pipeline's refusal naming its stage, and the credit
ledger left where it found it by a turn that was refused. A per-phase suite structurally cannot see
that seam; this is the suite that does.

**The responsive contract is checked for every screen.** All fourteen pages render inside one frame,
every grid starts at one column, every wide table scrolls inside its own container, and the fixed
pixel widths that remain are an allow-list with a stated reason each — eleven of them, and a twelfth
anywhere fails the build. The audit found three real defects of one class (a three-column stat row
with no narrow-screen layout) and they were fixed rather than exempted.

**Regressions are guarded offline where the dependency is critical.** The dev toolchain must stay
deduped and patched, the tests may not focus, skip without a documented environment guard, or wait a
fixed duration to synchronise, and the scripts may not force or swallow a failure. The trading
boundary is asserted against the **source tree** as well as the configuration.

**Detailed strategy, per-area coverage and the gaps this phase did not close:**
[product-foundation-test-strategy.md](./product-foundation-test-strategy.md).

---

## 12. The Foundation is verified as a browser renders it (Phase 5.10)

Phase 5.9 verified the interface with 921 tests and recorded the one limitation it could not close:
the responsive, branding and state rules were asserted against the shipped `.tsx` **as text**. A
source-text assertion can prove that a class is present; it cannot answer a question a layout engine
decides — whether a page scrolls sideways on a phone, whether a control is big enough to hit, whether
the logo loaded, whether a screen rendered at all.

**The browser is driven, not installed** ([ADR-0050](./adr/ADR-0050-the-browser-is-driven-not-installed.md)).
A Chromium-family browser already on the host is launched with `--remote-debugging-port` and driven
over the DevTools Protocol by ~250 lines in `tests/browser/driver.ts`, using Node's built-in
`WebSocket` for transport. No dependency is added — which matters here, because
`tests/dependency-graph.test.ts` exists specifically to fail if a second, vulnerable toolchain
reappears in the graph.

**The build is served, not the dev server.** `web/dist` over a loopback `node:http` fixture, so the
suite exercises the hashed asset names, the manifest and the favicon exactly as a browser receives
them, with no watcher or cold transform between an assertion and the thing asserted.

**The suite is excluded from the hermetic run**, and `tests/test-hygiene.test.ts` asserts that the
exclusion holds, because the broad `tests` include would otherwise collect it and `npm test` would
quietly come to require a build and an installed browser.

**What the first honest run found.** A tab strip was a plain flex row with no wrapping and no overflow
handling. Because a tab strip's width is set by its content, it became the widest thing on the page and
on a phone **the document itself scrolled sideways** — five screens, up to 179 px, across twelve pages
that use `Tabs`. The text-based rules had passed it. The defect that hid it was in the harness: the
first version waited on `aria-current`, which the sidebar flips immediately, while the workspace swaps
children inside `AnimatePresence mode="wait"` — so the measurement described the page _before_ the one
requested. Waiting on the rendered heading is what exposed it.

**What it measures.** 7 widths × 14 pages = 98 rendered pages, asserting zero horizontal overflow with
offending elements named, touch targets against the WCAG 2.2 minimum, accessible names and image
alternatives, text clipping, RTL mirroring, real key events (including `:focus-visible` and `Escape` on
a dialog), live HTTP delivery of every brand asset with magic-byte checks, a manifest a browser could
install from, and the product posture as the user reads it on screen.

**Handoff, debt and the checkpoint: **
[product-foundation-handoff.md](./product-foundation-handoff.md),
[technical-debt.md](./technical-debt.md), [release-baseline.json](./release-baseline.json).
