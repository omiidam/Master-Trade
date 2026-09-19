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
vector-memory, observability, desktop-and-frontend, risks-and-deferred) and
[ADRs](./docs/adr/).

## Technology baseline (locked, Phase 3.1)

| Layer    | Locked choice                                                                                              |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| Frontend | React 19 + Vite 6 · TanStack Query + Zustand · Tailwind + Radix · Lightweight Charts (adapter)             |
| Backend  | Node.js 22 LTS · Fastify 5 as an adapter over the typed contracts · Zod as sole validator                  |
| Database | SQLite (better-sqlite3, WAL) + Drizzle migrations; PostgreSQL 16 deferred for hosted mode                  |
| AI       | `LlmProvider` adapters (OpenAI, Anthropic, local OpenAI-compatible) behind our gateway; no agent framework |
| Desktop  | Tauri 2 shell + Node sidecar on loopback, per-launch bearer token, keychain-only secrets                   |
| Realtime | WebSocket `/ws` over the existing event bus                                                                |
| Jobs     | Durable database-backed queue with in-process workers, atomic claim + lease, dead-letter                   |

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

## Frontend (Phase 3.2)

The workstation interface lives in `web/`: React 19 + Vite + Tailwind v4 with
Radix primitives, Zustand UI state and Framer Motion presets. It ships the
application shell (sidebar, topbar, workspace), a design token system, ten
reusable primitives and five prototype pages — Dashboard, AI Workspace, Academy,
Trading Lab and Settings — rendered from mock data that is typed against the
backend view models.

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
