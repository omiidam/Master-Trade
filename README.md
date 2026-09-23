# Master Trade

A desktop-oriented **Trading Training Agent** that evolves from beginner to
advanced level over ≥6 months. Training only — no live trading, no broker
execution, no automatic rule activation, by design.

## Three independent components

1. **Model** — reasoning/explanation (LLM behind a provider-independent gateway;
   deterministic scripted adapter by default)
2. **Tools** — explicit, typed, deterministic, side-effect free
3. **Instructions** — versioned, safety-validated rules and policies

## Architecture

```
Desktop (Tauri) → Frontend → API → Backend → AI Orchestrator → Database → Vector Memory
```

Layered modules in one local process (no microservices), each with an explicit
interface: API contracts, auth/authz, LLM gateway, tools, market data, jobs,
real-time bus, vector memory, storage, observability.

Full documentation: [docs/architecture.md](./docs/architecture.md) — component
matrix, data-flow diagrams, security boundaries — plus per-layer documents
(api-auth, ai-and-llm, database-and-storage, jobs-and-realtime, market-data,
vector-memory, observability, desktop-and-frontend, desktop-shell,
desktop-architecture, desktop-runtime, desktop-storage, desktop-secure-storage,
user-profile-and-trading-context, input-quality-and-data-reliability,
usage-credits-and-premium, portfolio-intelligence, capability-integration,
security-and-privacy, brand-assets, risks-and-deferred) and
[ADRs](./docs/adr/).

Security and privacy posture, data classification, secret handling and every item
that needs professional review before production:
[docs/security-and-privacy.md](./docs/security-and-privacy.md). Brand asset
mapping and usage rules: [docs/brand-assets.md](./docs/brand-assets.md).

**The Product Foundation (Phases 5.1–5.10)** — what exists, what was verified and
how, what is not done and what a next phase may assume:
[docs/product-foundation-handoff.md](./docs/product-foundation-handoff.md). The
real remaining items are in [docs/technical-debt.md](./docs/technical-debt.md), and
the machine-readable checkpoint is
[docs/release-baseline.json](./docs/release-baseline.json).

```bash
npm run brand:assets      # regenerate every icon/favicon/launcher asset from one source
npm run brand:measure     # print the measured bounding box of the mark in that source
```

```bash
npm test                  # the hermetic suite: no network, no browser, no build needed
npm run test:e2e          # drive the real browser over the DevTools Protocol; needs web/dist
npm run validate          # every gate, in the right order: format, types, tests, builds, e2e
```

The browser suite needs a Chromium-family browser already installed and a built
`web/dist`; set `MASTER_TRADE_E2E_BROWSER` to point at a specific binary. Without a
browser it skips by name rather than failing, and `npm test` is unaffected either way
([ADR-0050](./docs/adr/ADR-0050-the-browser-is-driven-not-installed.md)).

Product scope, the eight core modules and their boundaries, and the
capability-by-capability roadmap (every item labelled Implemented / Planned /
Deferred / Requires validation):
[docs/product-vision-system-architecture.md](./docs/product-vision-system-architecture.md).

## Technology baseline (locked, Phase 3.1)

| Layer    | Locked choice                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend | React 19 + Vite 6 · TanStack Query + Zustand · Tailwind + Radix · Lightweight Charts (adapter)                                       |
| Backend  | Node.js 22 LTS · Fastify 5 as an adapter over the typed contracts · Zod as sole validator                                            |
| Database | SQLite (WAL) + generated migrations; PostgreSQL 16 deferred for hosted mode; driver behind a port                                    |
| AI       | `LlmProvider` adapters (OpenAI, Anthropic, local OpenAI-compatible) behind our gateway; no agent framework                           |
| Desktop  | Tauri 2 shell + Node sidecar on loopback, per-launch bearer token, keychain-only secrets; WebView holds no `shell:`/`fs:` permission |
| Realtime | WebSocket `/ws` over the existing event bus, versioned contracts, deny-by-default audiences                                          |
| Jobs     | Durable database-backed queue with in-process workers, atomic claim + lease, dead-letter, `JobStore` port                            |

See [docs/technology-decisions.md](./docs/technology-decisions.md) for the
rationale and [ADR-0010…0019](./docs/adr/) for every alternative that was
rejected. The lock is enforced by `tests/technology-lock.test.ts`.

## Quick start

```bash
npm install
npm run validate     # format + both typechecks + tests + both builds
npm run dev          # workstation UI preview → http://127.0.0.1:5173
npm run build && npm run api   # HTTP API on http://127.0.0.1:4317 (loopback only)
npm run agent:demo   # run the end-to-end agent demo (backend)
```

## Frontend (Phase 3.2, modules in Phase 3.4)

The workstation interface lives in `web/`: React 19 + Vite + Tailwind v4 with
Radix primitives, Zustand UI state and Framer Motion presets. It ships the
application shell (sidebar, topbar, workspace), a design token system, ten
reusable primitives and eight prototype pages — Dashboard, AI Workspace, Memory,
Research, Academy, Exams, Trading Lab and Settings — rendered from mock data that
is typed against the backend view models.

Phase 3.4 added the Memory, Exams and Research surfaces (15 module components)
and four Dashboard overview widgets, on the same tokens and primitives.

Phase 3.7 added the **Activity** page (the live event stream and the
background-task queue) and a preview pass that carries loading, empty and error
states through every product surface, with motion presets that honour
`prefers-reduced-motion`.

Most screens are still rendered from mock data, and they say so: the topbar badge,
the panel labels and the fixture notices all name it, and a test fails the build if
a fixture ever reaches the live store. Activity is the exception in the honest
direction — it reads the real queue and opens the real socket whenever a session
exists, and reports exactly why when one does not.

There is no order or execution affordance anywhere, and a test fails the build if
one is ever added. See [frontend-foundation.md](./docs/frontend-foundation.md) and
[preview-prototype.md](./docs/preview-prototype.md).

## Backend (Phase 3.3)

> **Layout note (Phase 4.3).** The contract types both sides depend on — the API
> envelope, error codes, correlation ids, provenance, the realtime wire protocol, the job
> view contract, the desktop IPC surface and the view models — now live in the physical
> package **`packages/shared`** (22 modules), not under `src/`. The backend resolves it by
> relative path and the frontend by `@shared/*`; the build root is the repository root, so
> compiled output is `dist/src/**` and `dist/packages/shared/src/**`. See
> [monorepo.md](./docs/monorepo.md) and [ADR-0036](./docs/adr/ADR-0036-extract-shared-package-source-only.md).

`src/server/**` mounts the typed API contracts on Fastify 5 — loopback only, Zod
as the sole validator, one error handler, structured request logging, hashed
sessions and environment-driven configuration that refuses to start on an unsafe
setting. Nine catalogue routes are registered behind one required pipeline; three
answer an authorized `501` naming the capability they are waiting for
(`lesson.complete`, `rule.propose`, `rule.activate` — the last one approval-gated,
so it is `451` first).

```bash
npm run build && npm run api
curl http://127.0.0.1:4317/v1/health          # liveness
curl http://127.0.0.1:4317/v1/health/ready    # readiness: degraded, and says why
```

This section describes the server as Phase 3.3 left it. Persistence (3.4), a
hosted model provider (3.5), `/ws` and the job workers (3.7) landed in the phases
below; the routes that still have no handler (`lesson.complete`, `rule.propose`,
`rule.activate`) answer an authorized `501`, and readiness reports any capability
that is absent as `degraded` rather than pretending otherwise.
See [backend-foundation.md](./docs/backend-foundation.md).

## Database (Phase 3.4)

`src/db/**` gives both engines one schema and one repository surface: a
driver-agnostic DDL layer, an async-only executor port (so no repository knows
which engine it talks to), a generated/ledgered migration runner, eight
repositories and machine-readable data-ownership rules. SQLite (WAL, in the OS
app-data directory) is the local mode; PostgreSQL is the deferred production
mode. `better-sqlite3` was rejected at install (no prebuilt binary for this Node
ABI, no toolchain) — the driver port keeps that reversible.

```bash
npm run db:migrate     # apply pending migrations to the local database
npm run db:status      # show applied / pending migrations
```

```bash
npm run build && npm run api
curl http://127.0.0.1:4317/v1/health/ready    # readiness reflects the database
```

See [database-and-storage.md](./docs/database-and-storage.md) and
[ADR-0023…0025](./docs/adr/).

## AI layer (Phase 3.5)

`src/llm/**` is provider-independent by construction. A provider returns **token
counts only**; the gateway owns endpoints, fallback, retry, timeout, cost,
budget and the circuit breaker, and prices every call from its own table
(`src/llm/pricing.ts`) — a model with no price row is refused, because an
unbudgetable model is an unaccountable one.

Adapters for OpenAI, any OpenAI-compatible local server and Anthropic live in
`src/llm/providers/` and are built on native `fetch`, with no vendor SDK in the
dependency tree. `createAiGateway()` turns settings into a live gateway, always
registers the offline scripted adapter, and reports any provider it had to skip.

A model answers with a **structured summary or not at all**: `headline`,
`statements[{kind, text, sources}]`, `uncertainty[]`, `toolRequests[]`. A `fact`
without a source is rejected, and chain-of-thought is refused by name — as a JSON
field or an inline `<thinking>` block. Tools it requests are authorized and run
by the orchestrator; it never receives a tool handle.

```bash
npm run build && npm run ai:demo   # offline: a full async turn, no key, no network
```

See [ai-and-llm.md](./docs/ai-and-llm.md) and
[ADR-0026…0028](./docs/adr/).

## Desktop shell (Phase 3.6)

`src-tauri/` is the Tauri 2 host: it owns the window, the bundled API sidecar, the
OS keychain, the offline cache and the update channel — and holds no business logic
and no risk math. `src/desktop/` holds the same policy as TypeScript, so the rules
are testable without a compiler.

The WebView is granted **five permissions and no `shell:` permission at all**, plus
no `fs:`, `path:`, `http:`, `process:`, `store:` or `global-shortcut:` permission.
Rust performs privileged work and exposes typed commands; no command returns a
filesystem path. That is only sound because **Rust**, not the WebView, spawns the
sidecar ([ADR-0029](./docs/adr/ADR-0029-webview-capability-boundary.md)).

The sidecar launches from a typed plan on the fixed loopback port 4317 with a
256-bit token generated per launch and passed through the environment; the window
is shown only after `/v1/health` answers _with that token_, and a crash restarts
under a bound that a restart does not reset
([ADR-0030](./docs/adr/ADR-0030-sidecar-supervision-fixed-port.md)). Local config
lives in the per-OS app-data directory under one strict schema whose keys are
compared with Rust, and any credential-shaped key in it is **refused**, not
filtered ([ADR-0031](./docs/adr/ADR-0031-desktop-config-appdata-keychain.md)).

```bash
npm run desktop:verify   # 22 policy/parity checks; no Rust toolchain needed
desktop:dev / desktop:build   # require Rust; see docs/desktop-shell.md
```

The shell is **source-complete and policy-verified, not compiled** — there is no
Rust toolchain in this environment. The verifier prints what that leaves
uncovered. See [desktop-shell.md](./docs/desktop-shell.md) for the development
guide and [ADR-0029…0031](./docs/adr/).

## Realtime and background jobs (Phase 3.7)

The versioned event contracts (strict payload schema, schema version, audience,
internal flag, publisher allow-list) live in `packages/shared/src/realtime/**`, and
`src/realtime/**` holds the hub that owns sessions, subscriptions, heartbeats, rate
limits and backpressure over an authenticated WebSocket at `/ws`. The queue engine —
idempotency, timeouts, cooperative cancellation, retry with backoff, dead-letter,
progress — sits in `packages/shared/src/jobs/**` behind a `JobStore` port, with an
in-memory implementation and a SQLite one over the existing `jobs` table, and the
persistence adapters stay in `src/jobs/**`. Jobs therefore survive a restart without
Redis being a local requirement. `GET /v1/jobs` and `POST /v1/jobs/:jobId/cancel` expose watch-and-stop;
there is no enqueue route.

The frontend client is framework-free (`web/src/realtime/client.ts`) and validates
every inbound frame: stale events are dropped by sequence, unknown and internal
types are refused, and a replay gap is reported rather than hidden.

See [realtime-and-jobs.md](./docs/realtime-and-jobs.md) and
[ADR-0032](./docs/adr/ADR-0032-versioned-event-contracts-deny-by-default.md),
[ADR-0033](./docs/adr/ADR-0033-job-store-port-sqlite-first.md).

## Safety

- No live trading, no broker connections, no order placement — no operation,
  tool, job kind or config key for it exists; `assertNoHardlineOperations()` and
  `assertSafeConfig()` fail startup and CI if one is ever added.
- Risk numbers come only from deterministic tools, never from model reasoning. Since
  Phase 4.4 this is structural, not conventional: the deterministic core is the package
  `packages/trading-engine`, and it may import `packages/shared` and itself — reaching the
  LLM, the agent, the database or the server is a package-boundary violation that
  `tests/monorepo-boundary.test.ts` fails on. See
  [ADR-0037](./docs/adr/ADR-0037-trading-engine-deterministic-core.md).
- Facts / analysis / hypotheses / uncertainty are always labeled; unverified
  memory is labelled uncertainty and can never be promoted by automation.
- New trading rules require a recorded human approval before activation.
- Secrets live in the OS keychain; configuration holds `SecretRef` only and
  logging redacts credentials recursively.

## Testing

`npm run validate` is the gate: format, both typechecks, the full suite, both builds and the
desktop verification. The suite is 51 files and 921 tests across seven layers, from pure-engine
arithmetic to end-to-end product flows, the transport boundary and the deployment posture —
including the responsive contract for every screen. How it is structured, what each layer proves,
the flake and dependency invariants, and the gaps it does not close are in
[docs/product-foundation-test-strategy.md](./docs/product-foundation-test-strategy.md).
