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
risks-and-deferred) and [ADRs](./docs/adr/).

## Technology baseline (locked, Phase 3.1)

| Layer    | Locked choice                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend | React 19 + Vite 6 · TanStack Query + Zustand · Tailwind + Radix · Lightweight Charts (adapter)                                       |
| Backend  | Node.js 22 LTS · Fastify 5 as an adapter over the typed contracts · Zod as sole validator                                            |
| Database | SQLite (WAL) + generated migrations; PostgreSQL 16 deferred for hosted mode; driver behind a port                                    |
| AI       | `LlmProvider` adapters (OpenAI, Anthropic, local OpenAI-compatible) behind our gateway; no agent framework                           |
| Desktop  | Tauri 2 shell + Node sidecar on loopback, per-launch bearer token, keychain-only secrets; WebView holds no `shell:`/`fs:` permission |
| Realtime | WebSocket `/ws` over the existing event bus                                                                                          |
| Jobs     | Durable database-backed queue with in-process workers, atomic claim + lease, dead-letter                                             |

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

Nothing on those screens is connected: there is no model provider, no database,
no realtime link and no market feed, and every page says so. There is no order or
execution affordance anywhere, and a test fails the build if one is ever added.
See [frontend-foundation.md](./docs/frontend-foundation.md).

## Backend (Phase 3.3)

`src/server/**` mounts the typed API contracts on Fastify 5 — loopback only, Zod
as the sole validator, one error handler, structured request logging, hashed
sessions and environment-driven configuration that refuses to start on an unsafe
setting. Six catalogue routes are registered behind one required pipeline; three
answer an authorized `501` naming the capability they are waiting for
(`lesson.complete`, `rule.propose`, `rule.activate` — the last one approval-gated,
so it is `451` first).

```bash
npm run build && npm run api
curl http://127.0.0.1:4317/v1/health          # liveness
curl http://127.0.0.1:4317/v1/health/ready    # readiness: degraded, and says why
```

No persistence, no hosted model provider, no `/ws` and no job workers yet;
readiness reports each of those as `degraded` rather than pretending otherwise.
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

## Safety

- No live trading, no broker connections, no order placement — no operation,
  tool, job kind or config key for it exists; `assertNoHardlineOperations()` and
  `assertSafeConfig()` fail startup and CI if one is ever added.
- Risk numbers come only from deterministic tools, never from model reasoning.
- Facts / analysis / hypotheses / uncertainty are always labeled; unverified
  memory is labelled uncertainty and can never be promoted by automation.
- New trading rules require a recorded human approval before activation.
- Secrets live in the OS keychain; configuration holds `SecretRef` only and
  logging redacts credentials recursively.
