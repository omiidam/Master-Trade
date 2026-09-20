# Master Trade — Technology Decisions & Architecture Lock (Phase 3.1)

**Status: locked for Phase 3.2.** This document is the official technology
baseline. Its machine-readable twin is `src/core/architectureLock.ts`
(`LOCKED_DECISIONS`), and `tests/technology-lock.test.ts` fails the build if an
area goes unanswered, if an ADR is missing, or if this document stops mentioning
a decision id. Changing a locked choice requires a new ADR — never a silent edit.

Scope: _which technologies_ are used and _where the boundaries are_, not how to
implement Phase 3.2. No dependency is installed by this phase; every library
named below is a decision, not yet a package.

Phase 1/2 invariants are unchanged and remain authoritative:

1. **Model / Tools / Instructions stay separate.** The model reasons; tools
   compute; instructions are versioned data.
2. **All risk math is deterministic** and lives outside the LLM.
3. **Permissions and safety policy are centralized** (`src/auth`,
   `src/permissions`, `src/core/config.ts`).
4. **No live trading, no broker execution, no automatic rule activation.**

## 0. Locked stack at a glance

| Area                  | Decision                                                                                | Decision id                  | ADR(s)                                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Frontend framework    | React 19 + TypeScript (strict) bundled by Vite 6                                        | `DEC-FE-1-FRAMEWORK`         | [0010](./adr/ADR-0010-frontend-framework-react-vite.md)                                                    |
| Frontend state        | TanStack Query v5 (async) + Zustand v5 (UI state)                                       | `DEC-FE-2-STATE`             | [0011](./adr/ADR-0011-frontend-state-tanstack-query-zustand.md)                                            |
| UI system             | Tailwind CSS v4 + Radix primitives (vendored shadcn-style) + lucide-react               | `DEC-FE-3-UI-SYSTEM`         | [0012](./adr/ADR-0012-ui-system-tailwind-radix.md)                                                         |
| Charting              | TradingView Lightweight Charts behind an internal `ChartAdapter`                        | `DEC-FE-4-CHARTING`          | [0013](./adr/ADR-0013-charting-lightweight-charts.md)                                                      |
| UI motion             | Framer Motion with reduced-motion presets; motion never carries information             | `DEC-FE-5-MOTION`            | [0020](./adr/ADR-0020-ui-motion-framer-motion.md)                                                          |
| Backend runtime       | Node.js 22 LTS (Node 20 compatibility lane stays in CI)                                 | `DEC-BE-1-RUNTIME`           | [0014](./adr/ADR-0014-backend-runtime-fastify.md)                                                          |
| Backend framework     | Fastify 5, loopback-only, plugin lifecycle hooks                                        | `DEC-BE-2-FRAMEWORK`         | [0014](./adr/ADR-0014-backend-runtime-fastify.md)                                                          |
| API architecture      | Typed contracts in `src/api/contracts.ts`; Fastify is an adapter over the same pipeline | `DEC-BE-3-API`               | [0002](./adr/ADR-0002-modular-monolith.md), [0014](./adr/ADR-0014-backend-runtime-fastify.md)              |
| Validation            | Zod schemas as the single validator; Fastify body validation disabled                   | `DEC-BE-4-VALIDATION`        | [0015](./adr/ADR-0015-validation-zod-single-source.md)                                                     |
| Request pipeline      | One `preHandler` pipeline per catalogue route; coverage asserted at boot                | `DEC-BE-5-PIPELINE`          | [0021](./adr/ADR-0021-single-request-pipeline.md)                                                          |
| Database — local      | SQLite via `node:sqlite`, WAL, foreign keys on, file in OS app-data dir                 | `DEC-DB-1-LOCAL`             | [0003](./adr/ADR-0003-sqlite-first.md), [0025](./adr/ADR-0025-sqlite-driver-and-dialects.md)               |
| Database — production | PostgreSQL behind one declaration set + dialect, driver injected (not installed yet)    | `DEC-DB-2-PRODUCTION`        | [0016](./adr/ADR-0016-persistence-driver-and-orm.md), [0025](./adr/ADR-0025-sqlite-driver-and-dialects.md) |
| Migrations            | Generated from the schema, numbered, forward-only, checksummed, drift refuses at boot   | `DEC-DB-3-MIGRATIONS`        | [0024](./adr/ADR-0024-generated-migrations-and-ledger.md)                                                  |
| Data access           | Repository boundary over a `SqlExecutor` port; one owner repository per table           | `DEC-DB-4-REPOSITORIES`      | [0023](./adr/ADR-0023-repository-boundary-and-data-ownership.md)                                           |
| AI abstraction        | `LlmProvider` interface; adapters only in `src/llm/providers/`                          | `DEC-AI-1-ABSTRACTION`       | [0004](./adr/ADR-0004-llm-gateway-abstraction.md), [0019](./adr/ADR-0019-llm-adapters-not-frameworks.md)   |
| AI gateway            | Existing `LlmGateway`: fallback, retry, timeout, streaming, token/cost, budget          | `DEC-AI-2-GATEWAY`           | [0004](./adr/ADR-0004-llm-gateway-abstraction.md), [0019](./adr/ADR-0019-llm-adapters-not-frameworks.md)   |
| Provider independence | Import-boundary test confines provider SDKs to `src/llm/providers/**`                   | `DEC-AI-3-INDEPENDENCE`      | [0004](./adr/ADR-0004-llm-gateway-abstraction.md), [0019](./adr/ADR-0019-llm-adapters-not-frameworks.md)   |
| Desktop runtime       | Tauri 2 shell + TypeScript backend as bundled Node sidecar on loopback                  | `DEC-DESKTOP-1-RUNTIME`      | [0001](./adr/ADR-0001-desktop-shell-tauri.md)                                                              |
| Desktop security      | Loopback-only + per-launch bearer token, keychain-only secrets, capability allow-list   | `DEC-DESKTOP-2-SECURITY`     | [0001](./adr/ADR-0001-desktop-shell-tauri.md), [0007](./adr/ADR-0007-deny-by-default-auth.md)              |
| Desktop capabilities  | WebView granted no `shell:`/`fs:`/`path:`/`http:` permission; Rust owns privileged work | `DEC-DESKTOP-3-CAPABILITIES` | [0029](./adr/ADR-0029-webview-capability-boundary.md)                                                      |
| Desktop lifecycle     | Fixed launch plan, per-launch token, health-gated window, bounded restarts              | `DEC-DESKTOP-4-LIFECYCLE`    | [0030](./adr/ADR-0030-sidecar-supervision-fixed-port.md)                                                   |
| Desktop config        | App-data directory, one strict schema shared with Rust, credentials refused             | `DEC-DESKTOP-5-CONFIG`       | [0031](./adr/ADR-0031-desktop-config-appdata-keychain.md)                                                  |
| Realtime              | WebSocket at `/ws` (`@fastify/websocket`) over the existing `EventBus`                  | `DEC-RT-1-WEBSOCKET`         | [0017](./adr/ADR-0017-realtime-websocket-transport.md)                                                     |
| Realtime contracts    | Versioned event contracts, deny-by-default audiences, auth + subscribe in one frame     | `DEC-RT-2-PROTOCOL`          | [0032](./adr/ADR-0032-versioned-event-contracts-deny-by-default.md)                                        |
| Background jobs       | Durable DB-backed queue, in-process workers, claim + lease, dead-letter                 | `DEC-JOBS-1-QUEUE`           | [0018](./adr/ADR-0018-durable-db-backed-job-queue.md)                                                      |
| Job storage           | `JobStore` port: in-memory or SQLite over `jobs`; Redis only as an adapter              | `DEC-JOBS-2-STORE`           | [0033](./adr/ADR-0033-job-store-port-sqlite-first.md)                                                      |
| Interface states      | Loading, empty and error designed per surface, rendered with the real components        | `DEC-FE-8-STATES`            | [0034](./adr/ADR-0034-loading-empty-error-are-designed-states.md)                                          |

Everything else in Phase 1/2 — error codes, provenance vocabulary, redaction,
retry primitives, approval workflow, vector memory, market-data normalization,
observability — is already technology-neutral and is reused as-is.

## 1. Frontend

### 1.1 Framework — `DEC-FE-1-FRAMEWORK`

**React 19 + TypeScript (strict), bundled by Vite 6.** The frontend is a
long-lived, stateful desktop console (streaming conversation, 6-month progress
record, charts), not a content site.

- React gives the largest, most stable ecosystem for the three things this UI
  needs most: virtualized lists (conversation + activity log), accessible
  component primitives, and financial charting wrappers.
- Vite 6 is the bundler for both the WebView bundle and the frontend dev server;
  Tauri 2's official template is Vite-based, so no bespoke build pipeline.
- TypeScript strict is already the repo standard; `frontend/viewModels.ts` stays
  the shared contract between UI, backend and tests.

Rejected alternatives and why: [ADR-0010](./adr/ADR-0010-frontend-framework-react-vite.md)
(Svelte 5, Vue 3, SolidJS, Next.js).

### 1.2 State management — `DEC-FE-2-STATE`

Two kinds of state, two tools, no global store sprawl:

| State                                                       | Owner                     | Why                                                                           |
| ----------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------- |
| Server/agent data (threads, curriculum, jobs, audit, cost)  | TanStack Query v5         | cache, dedupe, retry/backoff, stale-while-revalidate, optimistic updates      |
| Local UI state (open panels, filters, draft message, theme) | Zustand v5                | tiny, no providers/boilerplate, trivially testable outside React              |
| Streaming tokens                                            | Zustand (transient slice) | arrives over WebSocket, not request/response; must not thrash the query cache |

Security rule: credentials are never part of client state. Components see a
`SecretRef`-shaped status ("configured / missing"), never a key value.

Rejected: [ADR-0011](./adr/ADR-0011-frontend-state-tanstack-query-zustand.md)
(Redux Toolkit, MobX, Jotai/Recoil, Context-only).

### 1.3 UI system — `DEC-FE-3-UI-SYSTEM`

**Tailwind CSS v4 for styling, Radix primitives for behavior, shadcn-style
components vendored into the repo, lucide-react for icons.**

- Radix supplies focus management, ARIA wiring and keyboard behavior — the part
  of a UI kit that is expensive and risky to hand-roll.
- Components are vendored (copy-in) rather than imported from a package, so the
  design system is ours and a dependency release cannot reshape the app.
- Tailwind keeps styling colocated with markup, which matters for a small team
  and avoids a runtime CSS-in-JS engine in a WebView that already renders
  streaming text.

The `FORBIDDEN_UI_CONTROL` invariant is enforced at the design-system layer: the
nav labels and control vocabulary are validated by tests, so no component may
introduce an order/execution affordance regardless of styling.

Rejected: [ADR-0012](./adr/ADR-0012-ui-system-tailwind-radix.md)
(MUI, Ant Design, Chakra UI, bespoke SCSS).

### 1.4 Charting — `DEC-FE-4-CHARTING`

**TradingView Lightweight Charts**, wrapped in an internal `ChartAdapter`
component that is the _only_ place a chart is rendered. It renders canvas
candles/volume with crosshair, pan/zoom and time-scale handling at 10k+ bars
without the memory profile of an SVG chart library. The adapter:

- always renders the `provenanceLabel()` banner (synthetic data is never shown
  as real);
- is typed to accept only `Bar[]` from the market-data layer, never a provider
  payload;
- has no interactive affordance that could resemble an order ticket or position
  management.

Rejected: [ADR-0013](./adr/ADR-0013-charting-lightweight-charts.md) (Recharts,
Apache ECharts, Chart.js, Highcharts, raw D3). The adapter boundary keeps a
future chart replacement a one-file change.

### 1.6 Motion — `DEC-FE-5-MOTION`

**Framer Motion**, used only through the presets in `web/src/design/motion.ts`
(page transitions, overlays, list reinforcement). Components consult
`useReducedMotion()` and drop their transitions when it is set, and the CSS layer
neutralizes durations under `prefers-reduced-motion` as a second line of defence.
Motion is presentation only: nothing in the interface may depend on an animation
completing to be understood. Rejected alternatives (CSS-only, react-spring, GSAP,
Motion One, Radix data-state styling):
[ADR-0020](./adr/ADR-0020-ui-motion-framer-motion.md).

### 1.5 Screens and contracts

Six screens, exactly the `NAV_ITEMS`/`SystemStatusView` contract from Phase 2:
Agent, Academy, Dashboard (read-only), Notifications, Activity, Settings. The
frontend's prohibition list is unchanged: no direct provider calls, no risk math,
no execution controls, no secrets in state.

## 2. Backend

### 2.1 Runtime — `DEC-BE-1-RUNTIME`

**Node.js 22 LTS** (current LTS, native `fetch`, improved test runner, stable
Worker threads). `engines.node >= 20` stays, and CI keeps its Node 20 + 22
matrix so the app runs on both LTS lines. The runtime must be the _same_ one the
Tauri sidecar bundles, so the version is pinned in the packaging manifest in
Phase 3.2.

Rejected: [ADR-0014](./adr/ADR-0014-backend-runtime-fastify.md) (Bun, Deno,
Python, Rust-only backend).

### 2.2 Framework — `DEC-BE-2-FRAMEWORK`

**Fastify 5** as the HTTP adapter. It fits the existing architecture instead of
competing with it:

- its hook pipeline mirrors our pipeline exactly (envelope → authN/authZ →
  validation → handler), so the guard stays in one place;
- first-class WebSocket plugin for `DEC-RT-1-WEBSOCKET`;
- Pino logging natively, so structured logs feed the existing redaction step;
- loopback-only listen (`127.0.0.1`), request timeout and body size limits
  already configured in `AppConfig` (`requestTimeoutMs`, `maxBodyBytes`).

Rejected: [ADR-0014](./adr/ADR-0014-backend-runtime-fastify.md) (Express,
NestJS, Hono, raw `node:http`).

### 2.3 API architecture — `DEC-BE-3-API`

Unchanged and now locked: **`src/api/contracts.ts` is the only API definition.**

```
HTTP (Fastify adapter) ─┐
                        ├─► envelope validation ─► guardRoute (authN→authZ→approval)
in-process bridge ──────┘                              └─► route.validateBody ─► service
```

- Route ids, versions, operations and error codes are declared once; the Fastify
  server registers routes by iterating `API_ROUTES` rather than hand-wiring
  handlers.
- `/v1` versioning and the `/v2` migration policy from `api-auth.md` are
  unchanged; a breaking change adds a version, it never mutates `v1`.
- Because both transports share the pipeline, "works in the desktop bridge but
  not over HTTP" (or vice versa) is structurally impossible.
- Every route's `operation` is an id from the 33-operation catalogue, so
  `assertNoHardlineOperations()` still proves no trade-capable endpoint can be
  introduced by the transport layer.

### 2.4 Validation — `DEC-BE-4-VALIDATION`

**Zod is the single validator.** The hand-written `validateBody` functions from
Phase 2 are replaced by Zod schemas, with types derived via `z.infer` so there is
one source of truth per payload. Fastify's built-in
JSON-schema validation is **disabled** for request bodies: two validators that
can disagree are a security bug waiting to happen, and Ajv schemas cannot be
inferred into TypeScript types.

- `validateEnvelope` stays a tiny explicit function (five fields, version gate).
- Validation errors are mapped into the existing `VALIDATION_FAILED` (400) shape
  with a safe `issues: string[]` — never a stack trace.
- Schemas live beside the route they guard, so input shape and authorization
  requirement are read together during review.

Rejected: [ADR-0015](./adr/ADR-0015-validation-zod-single-source.md)
(Ajv/JSON Schema only, TypeBox, io-ts, hand-rolled guards).

### 2.5 Request pipeline — `DEC-BE-5-PIPELINE`

Phase 3.3 turned § 2.3's diagram into a middleware rather than a convention:

```
version gate → access policy (loopback + shell token) → envelope unwrap
             → authentication → authorization → approval gate
             → params/query/body validation → path/body agreement → handler
```

- Routes are **generated** from `API_ROUTES` and all of them carry the same
  `preHandler`; `assertRouteCoverage()` fails start-up if a registered route
  lacks it or a catalogue route is missing. A bypass is a boot failure.
- Authorization runs **before** body validation, so an unauthenticated caller
  learns nothing about which fields the server would accept.
- Routes whose capability does not exist yet are registered anyway and answer
  `501 NOT_IMPLEMENTED` with the missing capability named, through the full
  pipeline: one code path per request, and the frontend can distinguish
  _unimplemented_ from _forbidden_.

Rejected: [ADR-0021](./adr/ADR-0021-single-request-pipeline.md) (guard called
per handler, global-only hook, validation before authorization, omitting pending
routes, unauthenticated 501s).

### 2.6 Implementation status — Phase 3.3

`src/server/**` implements this section on the locked stack, using the
`DEC-DESKTOP-2-SECURITY` boundary from § 5.2 as behaviour rather than intent,
and Phase 3.6 implemented the shell itself against
`DEC-DESKTOP-3-CAPABILITIES`, `DEC-DESKTOP-4-LIFECYCLE` and
`DEC-DESKTOP-5-CONFIG` ([ADR-0029](./adr/ADR-0029-webview-capability-boundary.md),
[ADR-0030](./adr/ADR-0030-sidecar-supervision-fixed-port.md),
[ADR-0031](./adr/ADR-0031-desktop-config-appdata-keychain.md))
([backend-foundation.md](./backend-foundation.md), [ADR-0022](./adr/ADR-0022-local-api-trust-boundary.md)):
six catalogue routes, three implemented, Zod-only validation, one error handler,
structured request logging, environment-driven config with refusal rules, and
liveness/readiness checks that re-assert the safety invariants at runtime.
Persistence, hosted providers, `/ws` and durable workers are still deferred.

## 3. Database

### 3.1 Local mode (primary) — `DEC-DB-1-LOCAL`

**SQLite via `node:sqlite`** — the engine built into Node, synchronous, embedded,
no server and no native build step. Amended in Phase 3.4: `better-sqlite3` had no
prebuilt binary for the current Node ABI and fell back to compiling against Visual
Studio, which is exactly risk R15 ([ADR-0025](./adr/ADR-0025-sqlite-driver-and-dialects.md));
it remains the documented fallback driver behind the same port. With:

- `journal_mode = WAL` (readers do not block the writer — required once workers
  and the UI read concurrently);
- `foreign_keys = ON`, `busy_timeout` set, short transactions;
- the database file under the OS **app-data directory** (e.g.
  `%APPDATA%/master-trade`), never inside the app bundle, so an installer
  upgrade cannot wipe six months of learning history;
- a single writer discipline: all writes go through repositories, jobs write in
  short transactions, no long-held write locks;
- **no secrets** (keychain only) and **no raw file bytes** (storage layer).

Why better-sqlite3 over the alternatives: it is the most mature embeddable
SQLite binding for Node, has no async API to misuse around transactions, and
ships prebuilt binaries for the three desktop targets. The one cost — a native
module — is accepted and tracked as a packaging task in Phase 3.2 (rebuild per
platform, pin the Node ABI used by the sidecar).

### 3.2 Production mode (deferred) — `DEC-DB-2-PRODUCTION`

**PostgreSQL 16**, using the _same_ Drizzle schema and the _same_ repository
interfaces, is the designated multi-user/hosted target (a future coach or
classroom deployment). It is deferred: no hosted deployment exists, and the
desktop app must stay offline-capable. Choosing it now only means the schema and
query layer must not depend on SQLite-only semantics — which is why aggregates,
timestamps and types stay portable (ISO timestamps, `text` ids, no
SQLite-specific SQL in services).

Policy: even in production mode there is no broker or trading data — a hosted
deployment hosts _training_ data only.

### 3.3 Migrations — `DEC-DB-3-MIGRATIONS`

drizzle-kit generates numbered migration files from the typed schema; each is
applied inside a transaction and recorded in `schema_migrations`, and every file
still passes the existing `validateMigrations()` checks (increasing versions, no
duplicates, non-empty `up`).

- Forward-only in production; `down` exists for local rollback during
  development.
- Destructive changes use the documented two-step migration (stop writing, then
  drop in a later version).
- The SQL is reviewed as SQL: the query builder is used for reads/writes but
  migrations are plain SQL files, so nobody has to trust an ORM's diffing.
- Persistent/transient split is unchanged: sessions, `job_scratch`, caches and
  replay buffers are transient and purged by `maintenance.cleanup`.

Rejected: [ADR-0016](./adr/ADR-0016-persistence-driver-and-orm.md) (Prisma,
TypeORM, Kysely, raw SQL with no query layer, storing the DB in the app bundle).

### 3.4 Where the data lives

```
OS app-data dir/
├── master-trade.db        # SQLite (WAL) — the learner's record, the only file to back up
├── files/                 # content-addressed blobs managed by src/storage
└── logs/                  # structured logs, rotated, redacted
```

## 4. AI layer

### 4.1 Abstraction — `DEC-AI-1-ABSTRACTION`

`LlmProvider` (Phase 2) stays the boundary. Phase 3.2 adds three adapters in
`src/llm/providers/`:

| Adapter                                            | Purpose                                                           |
| -------------------------------------------------- | ----------------------------------------------------------------- |
| `providers/openaiCompatible.ts`                    | primary hosted reasoning model (and any OpenAI-compatible server) |
| `providers/anthropic.ts`                           | second hosted provider — proves the seam is real, not nominal     |
| `providers/openaiCompatible.ts` with `id: local-…` | llama.cpp / Ollama / LM Studio / vLLM for offline use             |
| `providers/scripted.ts`                            | offline default and test double; always registered                |

`LlmRequest` still has no field that can execute anything; adapters translate
transport details only. Implemented in Phase 3.5 over native `fetch` with no
vendor SDK ([ADR-0028](./adr/ADR-0028-provider-transport-native-fetch.md)).

### 4.2 Gateway — `DEC-AI-2-GATEWAY`

The existing `LlmGateway` keeps ownership of: endpoint order, fallback on
provider failure, retry for retryable codes only, per-request timeout via
`AbortSignal`, `UsageTracker` token/cost accounting, and budget refusal
(`BUDGET_EXCEEDED`).

Phase 3.5 added the consecutive-failure **circuit breaker** (a provider that is
down stops being attempted, and is re-probed after a reset window) and moved cost
ownering to the gateway: a provider returns tokens, the gateway prices them from
`src/llm/pricing.ts`, and a model with no price row is refused
(`POLICY_VIOLATION`) because an unbudgetable model is an unaccountable one
([ADR-0026](./adr/ADR-0026-cost-from-our-price-table.md)).

Still deferred: streaming (`stream()` returning `AsyncIterable<LlmStreamChunk>`).
When it lands it changes nothing about authority — a chunk can carry text and
tool-call _requests_, never an execution. The gateway holds no `ToolRegistry` in
either case.

### 4.3 Provider independence — `DEC-AI-3-INDEPENDENCE`

Enforced by test, not by convention: `tests/technology-lock.test.ts` scans
`src/**` and fails if any module outside `src/llm/providers/**` imports a
provider SDK (`openai`, `@anthropic-ai/*`, `@google/genai`, `cohere-ai`,
`mistralai`, `langchain*`, `llamaindex`). Core business logic therefore cannot
acquire vendor coupling by accident.

Rejected: [ADR-0019](./adr/ADR-0019-llm-adapters-not-frameworks.md) (agent
frameworks such as LangChain/LlamaIndex, SDK calls inside services, a
self-hosted model as the primary path).

### 4.4 Prompt and instruction management

Unchanged: versioned immutable modules (`src/instructions/loader.ts`), validated
against authorization language, stamped into every message
(`messages.instructions_version`), never edited in place. Prompt templates are
distinct from instruction modules and are added in Phase 3.2 as data with the
same versioning rule.

### 4.5 Why the LLM still cannot bypass permissions

1. `LlmRequest` cannot express tool execution.
2. The gateway has no execution API (asserted by test).
3. Tools run in the orchestrator, after `authorize()`; denied requests produce
   `BLOCKED` with a reason.
4. `ai.allowModelDirectToolExecution` is literally `false` and startup-validated.
5. New in Phase 3.1: provider SDKs cannot be imported into the permission,
   orchestrator or tool layers at all.

## 5. Desktop

### 5.1 Runtime — `DEC-DESKTOP-1-RUNTIME`

**Tauri 2** (per [ADR-0001](./adr/ADR-0001-desktop-shell-tauri.md)), with the
TypeScript backend shipped as a **bundled Node sidecar**:

```
Tauri 2 shell (Rust)
├── Rust host         — window, tray, updater, dialogs, OS keychain, single instance
├── Node sidecar      — API + backend + agent + jobs (one process, loopback port)
└── WebView           — React frontend (same typed contracts)
```

The Rust host starts the sidecar, waits for its health signal, passes it a
per-launch secret, and shuts it down with the app. Phase 3.2 adds the shell and
sidecar; the Rust host remains the future home for pure deterministic compute
(the Menai concept) behind the `Tool` interface.

Rejected: Electron (bundle/memory), a Rust-only backend (would fork the typed
data model), routing all traffic through Tauri IPC (would duplicate the entire
API surface).

### 5.2 Security boundaries — `DEC-DESKTOP-2-SECURITY`

| Boundary              | Rule                                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------- |
| Network exposure      | Sidecar binds `127.0.0.1` on an ephemeral port; nothing is reachable from another machine                       |
| Other local processes | API requires a per-launch bearer token injected by the shell; an unrelated local process cannot call it         |
| Secrets               | LLM keys live in the OS keychain via `SecureStore`; config, DB and logs hold `SecretRef` only                   |
| Frontend capability   | Capability allow-list; no shell API returns a filesystem path; files are addressed by storage id                |
| Content               | CSP with no remote origins; links open through an allow-listed opener, never in the app's WebView               |
| Updates               | Signed Tauri updater; the DB lives outside the bundle so updates never touch the learner's record               |
| Execution             | No shell or API capability for broker connection, order placement or live trading — absent, not merely disabled |
| Offline               | Lessons, review, deterministic tools and synthetic data work offline; only real LLM/data calls need network     |

Phase 3.3 implemented the first four rows as behaviour — loopback refusal,
per-launch shell token, hashed session tokens and fail-closed configuration —
rejecting Unix sockets, query-parameter tokens, raw-token storage, cookies and
mTLS ([ADR-0022](./adr/ADR-0022-local-api-trust-boundary.md)). The CSP, updater
and capability allow-list remain shell work.

## 6. Real-time layer

### 6.1 Strategy — `DEC-RT-1-WEBSOCKET`, implemented under `DEC-RT-2-PROTOCOL`

**Implemented in Phase 3.7.** The transport above is built, and the wire policy on
top of it is a contract registry: every event declares a strict payload schema, a
schema version, an audience, an internal flag and its permitted publishers, and
delivery is deny-by-default. A frame is validated on both sides — the server before
it becomes an event, the client before anything is rendered. The token, the protocol
version, the resume sequence and the subscription travel together in the first
frame, which is what makes a reconnect atomic. Internal events are never serialized
to a client, and a payload whose keys look like credentials is refused rather than
filtered. See [realtime-and-jobs.md](./realtime-and-jobs.md) § 1–3 and
[ADR-0032](./adr/ADR-0032-versioned-event-contracts-deny-by-default.md).

### 6.2 Strategy — `DEC-RT-1-WEBSOCKET`

**One WebSocket endpoint at `/ws`** (`@fastify/websocket`, `ws` underneath) on
the same loopback server, fed by the Phase 2 `EventBus`. The bus already owns
the hard parts — audience filtering, monotonic `seq`, bounded replay — so the
transport is a thin adapter:

```
EventBus.publish ──► audience filter ──► per-principal send queue ──► WS frame
       ▲                                        │
   replay buffer ◄── fromSeq on reconnect ───────┘
```

Locked details:

- **Authentication first**: the socket must present a valid session (session
  token in the connect frame / subprotocol) before it is subscribed to anything.
  Unauthenticated sockets receive no events, including "public" ones.
- **Authorization per event**: unchanged audience rule; an empty audience is
  internal and is never serialized.
- **Ordering**: monotonic `seq`; a client stores its last `seq` and reconnects
  with `fromSeq`; `missingSequences()` lets the client and the UI prove there is
  no gap, and a client whose `fromSeq` falls outside the buffer is told to
  resync rather than silently missing events.
- **Liveness**: server heartbeat at `heartbeatMs` (15 s) with pong timeout,
  client-side exponential reconnect with jitter.
- **Backpressure**: bounded per-connection queue; a slow client is disconnected
  (and reconnects with `fromSeq`) rather than growing server memory. High-volume
  `marketdata.tick` is coalesced per symbol before sending.
- **Desktop bridge**: the Tauri path may deliver the same events in-process,
  bypassing TCP, with identical visibility rules.

Rejected: [ADR-0017](./adr/ADR-0017-realtime-websocket-transport.md) (Socket.IO,
SSE, gRPC streaming, Redis pub/sub).

## 7. Background jobs

### 7.1 Strategy — `DEC-JOBS-1-QUEUE`, storage under `DEC-JOBS-2-STORE`

**Implemented in Phase 3.7.** The engine talks to a `JobStore` port with two
implementations: in-memory (which reports itself as non-durable) and SQLite over the
existing `jobs` table plus TTL'd `job_scratch` for progress. Idempotency, leases,
atomic claim and the status vocabulary come from `PlatformRepository`; cancellation is
the row's status, so it crosses processes. The worker pool enforces per-kind
concurrency, renews leases and drains on shutdown. A Redis/BullMQ backend would be a
third implementation of the same port, never a local requirement. See
[realtime-and-jobs.md](./realtime-and-jobs.md) § 4–5 and
[ADR-0033](./adr/ADR-0033-job-store-port-sqlite-first.md).

### 7.2 Strategy — `DEC-JOBS-1-QUEUE`

**A durable, database-backed queue with in-process workers** — no external
broker, consistent with the modular monolith ([ADR-0002](./adr/ADR-0002-modular-monolith.md)).

```
scheduler tick ─┐
API handler ────┼─► enqueue (idempotency key, approval gate) ─► jobs row (status=queued)
job handler ────┘                                                      │
                                       atomic claim: UPDATE ... WHERE status='queued'
                                                                       ▼
                                        worker pool (concurrency, default 2) ─► running
                                                                       │
                    retry w/ exponential backoff + jitter ─────────────┤
                    lease expiry returns a crashed run to queued ──────┤
                    attempts exhausted ─► dead (last error recorded) ──┘
```

Locked details:

- **Claim + lease**: a claim is a single atomic `UPDATE` guarded by status, and
  every run carries a lease deadline. A sidecar crash mid-job becomes a retry,
  not a job stuck in `running` forever.
- **Durability**: jobs live in SQLite, so an app restart does not lose queued
  work or its history.
- **Idempotency**: `<prefix>:<entity id>` keys stay mandatory; re-enqueueing the
  same key returns the existing job.
- **Retry/timeout/dead-letter**: unchanged policies from `src/core/retry.ts`;
  `POLICY_VIOLATION` is never retried.
- **Scheduling**: the tick that enqueues `maintenance.cleanup` and
  `evaluation.scheduled` uses period-scoped idempotency keys, so a duplicated
  tick cannot run the same scheduled job twice.
- **Approval gate**: `backtest.run` and any future rule-affecting kind still
  refuse to enqueue without `approved: true` from the `ApprovalWorkflow`.
- **Extraction seam**: heavy work (backtests, embedding batches, ingestion) can
  move to a separate sidecar process reading the same WAL database; the
  interface that makes that a deployment change rather than a rewrite is the
  repository + job-handler boundary.

Rejected: [ADR-0018](./adr/ADR-0018-durable-db-backed-job-queue.md) (Redis +
BullMQ, Temporal, pg-boss/graphile-worker, `node-cron` only, cloud queues,
in-memory-only `setInterval`).

## 8. Supporting choices (not ADR-worthy, recorded for consistency)

| Concern            | Choice                                                      | Note                                                  |
| ------------------ | ----------------------------------------------------------- | ----------------------------------------------------- |
| Structured logging | Pino (Fastify's default), fed through `src/core/logging.ts` | redaction stays mandatory and recursive               |
| Unit/integration   | Vitest 2 (already in use)                                   | architecture invariants stay in the default suite     |
| Desktop E2E        | Playwright driving the WebView via `tauri-driver`           | chosen for WebView/CDP support; Cypress rejected      |
| Lint/format        | Prettier (current); ESLint flat config added in Phase 3.2   | import-boundary rules move into lint as a second gate |
| CI                 | GitHub Actions: `npm run validate` on Node 20 and 22        | unchanged, still a merge requirement                  |
| IDs                | `src/core/ids.ts` (uuid v4 style)                           | human-readable prefixes per entity                    |
| Config             | `src/core/config.ts` + `assertSafeConfig()`                 | code defaults now; a TOML file can layer on later     |

## 9. Explicitly not decided here

- Hosted/team deployment topology (needs an ADR; PostgreSQL path is prepared).
- Model _selection_ per lesson (a curriculum concern, not a technology concern).
- Remote object storage and remote embeddings (deferred; interfaces exist).
- Backtesting engine internals (deterministic engine, approval-gated — Phase 4).
- Mobile/web clients (the typed contract layer makes them possible; nothing is
  built for them).

## 10. How this lock is enforced

| Enforcement point           | Mechanism                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| Every area answered         | `assertArchitectureLock()` + `MISSING_AREA` check in `tests/technology-lock.test.ts`          |
| ADRs exist and are cited    | test asserts each cited ADR file is present on disk                                           |
| Document ↔ code sync        | test asserts this document mentions every `id` and every cited ADR                            |
| Provider independence       | test scans `src/**` for provider SDK imports outside `src/llm/providers/**`                   |
| No experimental core tech   | test rejects decisions naming Menai/Agen/Vercel Zero/AXON/LangChain/LlamaIndex as core        |
| Phase 1/2 safety invariants | unchanged: `assertSafeConfig`, `assertNoHardlineOperations`, approval gates, UI-control check |

Process rule: a locked decision changes only by adding an ADR that supersedes the
previous one, updating `LOCKED_DECISIONS` and this document in the same commit.

## 11. Phase 3.2 status against this lock

The frontend foundation is implemented on the locked stack (see
[frontend-foundation.md](./frontend-foundation.md)):

| Locked choice      | Status in Phase 3.2                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| React 19 + Vite 6  | installed; `vite.config.ts` (root = `web/`) and `web/tsconfig.json`                             |
| Tailwind CSS v4    | installed via `@tailwindcss/vite`; theme tokens in `web/src/styles/global.css`                  |
| Radix primitives   | installed for Modal, Tooltip and Tabs                                                           |
| Zustand            | installed; `web/src/store/ui.ts` holds UI state only                                            |
| Framer Motion      | installed; presets in `web/src/design/motion.ts`                                                |
| lucide-react       | installed; icon set for shell and cards                                                         |
| TanStack Query     | **not installed yet** — deferred until there are real requests to cache (no fake fetches added) |
| Lightweight Charts | **not installed yet** — `ChartAdapter` ships an SVG placeholder behind the final props contract |

Two deliberate deviations, both narrowing rather than widening scope:

1. **No data-fetching library yet.** With no backend endpoint to call, adding
   TanStack Query would be an unexercised dependency; the lock stands, the
   installation waits for the API adapter.
2. **Chart adapter before chart library.** `ChartAdapter` already enforces the
   two invariants that matter (mandatory provenance label, no trading
   affordance) so Phase 3.3 only swaps the rendering body.

Everything else in the lock (backend, database, AI, desktop, realtime, jobs) is
untouched by Phase 3.2 and still governs the next phase.

## 12. Phase 3.3 status against this lock

The backend foundation is implemented on the locked stack (see
[backend-foundation.md](./backend-foundation.md)):

| Locked choice            | Status in Phase 3.3                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Node 22 + Fastify 5      | installed; `src/server/**`, bound to `127.0.0.1:4317`, graceful shutdown                                    |
| Fastify as an adapter    | routes generated from `API_ROUTES`; both transports share one pipeline                                      |
| Zod as sole validator    | `src/api/schemas.ts` (strict objects); Fastify validation disabled; envelope check stays explicit           |
| `DEC-BE-5-PIPELINE`      | implemented and asserted at boot (`assertRouteCoverage`, `assertApiCatalogue`)                              |
| `DEC-DESKTOP-2-SECURITY` | implemented: loopback refusal, shell token, hashed sessions, `assertSafeConfig` re-checked before listening |
| Structured logging       | Pino sink + our request/agent lines; redaction asserted by test                                             |
| better-sqlite3 + Drizzle | **not installed yet** — nothing persists in this phase; health reports the database as `degraded`           |
| Hosted LLM adapters      | **not installed yet** — the scripted adapter answers; readiness says so                                     |
| WebSocket `/ws`          | **not mounted yet** — the bus and auth model are ready; health reports it as `degraded`                     |
| Durable job workers      | **not started yet** — the in-process queue contract and its health check exist                              |

No locked decision was changed and no experimental technology was introduced.
Readiness deliberately reports `degraded` for every unbuilt layer instead of
claiming `ok`, which is the same honesty rule the frontend applies with its
`Preview · mock data` badge.

## 13. Phase 3.4 status against this lock

The database foundation and three product modules are implemented on the locked
stack (see [database-and-storage.md](./database-and-storage.md) and
[frontend-foundation.md](./frontend-foundation.md) § 9):

| Locked choice           | Status in Phase 3.4                                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| SQLite local mode       | implemented over `node:sqlite` (WAL, app-data directory) behind the executor port; `better-sqlite3` remains the documented fallback |
| PostgreSQL production   | **still deferred** — the same schema/DDL generator and repositories target it; the driver is not installed                          |
| Generated migrations    | implemented (`db:migrate`, `db:status`) with an applied-migrations ledger, changing only by appending                               |
| Repository boundary     | implemented — eight repositories; no SQL or driver import outside `src/db` (asserted by test)                                       |
| Data ownership rules    | implemented as machine-readable rules (`src/db/ownership.ts`, `audit`)                                                              |
| Frontend stack          | unchanged — the modules use the existing tokens and primitives only; no new dependency added                                        |
| TanStack Query / charts | **still not installed** — the module surfaces render typed mock data, nothing fetches                                               |

One locked decision was amended rather than superseded: the SQLite driver moved
to the Node built-in because the better-sqlite3 install failed on this platform
(exactly risk R15), and the driver port keeps the swap reversible
([ADR-0025](./adr/ADR-0025-sqlite-driver-and-dialects.md)). No experimental
technology was introduced.

## 14. Phase 3.5 status against this lock

The AI infrastructure is implemented on the locked stack (see
[ai-and-llm.md](./ai-and-llm.md)):

| Locked choice                       | Status in Phase 3.5                                                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `LlmProvider` abstraction           | implemented; a provider returns **token counts only** — the contract cannot carry money                                             |
| OpenAI / Anthropic / local adapters | implemented over native `fetch` in `src/llm/providers/` ([ADR-0028](./adr/ADR-0028-provider-transport-native-fetch.md))             |
| `LlmGateway` ownership              | endpoint order, fallback, retry, timeout, cost, budget **and** the circuit breaker                                                  |
| Provider independence               | enforced by the existing import-scope test; no provider SDK is a dependency                                                         |
| Cost tracking                       | computed from our own price table; an unpriced model is refused ([ADR-0026](./adr/ADR-0026-cost-from-our-price-table.md))           |
| Model output                        | structured summary only; chain-of-thought refused by name ([ADR-0027](./adr/ADR-0027-structured-summaries-not-chain-of-thought.md)) |
| Context management                  | `assembleContext()` + `buildTurnMessages()`: instructions mandatory, every section labelled with trust and provenance               |
| Scripted provider                   | kept, always registered, and now answers inside the summary contract — the offline default is a real path                           |
| Streaming                           | **still deferred** — the interface change waits for real cancellation plumbing                                                      |
| Server wiring                       | **not yet** — the server still registers no provider; readiness reports that honestly and names the adapters that exist             |

Three locked decisions were refined and none was superseded; no experimental
technology was introduced.

## 15. Phase 3.6 status against this lock

The desktop shell is implemented on the locked stack (see
[desktop-and-frontend.md](./desktop-and-frontend.md) § 3 and
[desktop-shell.md](./desktop-shell.md)):

| Locked choice              | Status in Phase 3.6                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tauri 2 runtime            | `src-tauri/` holds the project: config, capability file, six Rust modules, five plugins                                                                 |
| Node sidecar               | launched from a typed plan (`planSidecarLaunch`) on the fixed loopback port 4317; `scripts/build-sidecar.mjs` packages it                               |
| Per-launch secret          | implemented — 256-bit token through the environment, health probe uses it, handshake exposes it to the WebView only                                     |
| Capability allow-list      | five permissions, zero `shell:`/`fs:`/`path:`/`http:` permissions ([ADR-0029](./adr/ADR-0029-webview-capability-boundary.md))                           |
| Keychain-only secrets      | implemented in `src-tauri/src/secrets.rs`; the config file refuses credential-shaped keys                                                               |
| CSP with no remote origins | implemented; verified present and restrictive                                                                                                           |
| Application lifecycle      | implemented as a machine-checked state machine; the window is gated on the API answering ([ADR-0030](./adr/ADR-0030-sidecar-supervision-fixed-port.md)) |
| Local configuration        | implemented in the per-OS app-data directory under one strict schema shared with Rust ([ADR-0031](./adr/ADR-0031-desktop-config-appdata-keychain.md))   |
| Verification without Rust  | `npm run desktop:verify` — 22 checks including both-direction command parity, spawn-location, port/version/schema agreement                             |
| Compiled bundle            | **still deferred** — no Rust toolchain in this environment or in CI; the shell is source-complete and policy-verified, not built                        |
| Updater signing            | **placeholder key** — reported as a warning and a release blocker, not an error                                                                         |
| Icons and signing identity | **not supplied** — placeholders, documented in `src-tauri/icons/README.md`                                                                              |

Three locked decisions were added (the three desktop ones above) and none was
superseded. No experimental technology was introduced: no Electron, no Rust
rewrite of the backend, no Tauri plugin beyond the five whose permissions are
listed, and no change to the Model / Tools / Instructions separation.
