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
npm run validate     # format check + typecheck + tests + build
npm run agent:demo   # run the end-to-end agent demo
```

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
