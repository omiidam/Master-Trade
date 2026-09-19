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
