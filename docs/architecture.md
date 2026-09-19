# Master Trade — System Architecture

Desktop-based **Trading Training Agent** that takes a learner from beginner to
advanced over ≥6 months. TypeScript core, single-process modular monolith,
training-only: no live trading, no broker execution, no automatic rule activation.

This document is the top-level map. Each layer has its own document; ADRs record
why the decisions were made.

| Area                                         | Document                                             |
| -------------------------------------------- | ---------------------------------------------------- |
| Desktop shell, frontend, view models         | [desktop-and-frontend.md](./desktop-and-frontend.md) |
| API layer, contracts, auth/authz             | [api-auth.md](./api-auth.md)                         |
| AI layer, prompts, LLM abstraction           | [ai-and-llm.md](./ai-and-llm.md)                     |
| Database, entities, migrations, file storage | [database-and-storage.md](./database-and-storage.md) |
| Background jobs, WebSocket layer             | [jobs-and-realtime.md](./jobs-and-realtime.md)       |
| Market-data abstraction                      | [market-data.md](./market-data.md)                   |
| Vector memory                                | [vector-memory.md](./vector-memory.md)               |
| Logging, audit, observability                | [observability.md](./observability.md)               |
| Risks, trade-offs, deferred work             | [risks-and-deferred.md](./risks-and-deferred.md)     |
| Architecture Decision Records                | [adr/](./adr/)                                       |

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
2. **Tools** (`src/tools/`) — explicit, typed, deterministic, side-effect free.
   The registry refuses to register a side-effecting tool at all.
3. **Instructions** (`src/instructions/loader.ts`) — versioned, immutable, and
   validated against a policy gate that rejects authorization language.

Supporting subsystems added in Phase 2 keep the same separation: permissions
(`src/auth`), memory (`src/memory`, `src/vector`), evaluation
(`src/evaluation`), approvals (`src/agent/approval.ts`), proposals
(`src/agent/proposals.ts`), context assembly (`src/agent/context.ts`).

## 3. Component responsibility matrix

| Component             | Owns                                                               | Never does                                              | Module                                              |
| --------------------- | ------------------------------------------------------------------ | ------------------------------------------------------- | --------------------------------------------------- |
| Desktop shell         | windows, OS keychain, dialogs, offline cache, updates              | business logic, provider credentials in plain text      | `src/desktop/host.ts`                               |
| Frontend              | UI, application state, rendering provenance/labels                 | calling providers directly, offering execution controls | `src/frontend/viewModels.ts`                        |
| API layer             | versioned routes, validation, authZ guard, error mapping           | business rules, direct DB access                        | `src/api/contracts.ts`                              |
| Backend services      | orchestration, education, evaluation, risk services                | provider-specific code, transport concerns              | `src/agent/*`                                       |
| AI orchestrator       | lifecycle, context assembly, permission checks, provenance         | numeric risk calculations, direct provider calls        | `src/agent/orchestrator.ts`, `src/agent/context.ts` |
| LLM abstraction       | provider interface, fallback, retry/timeout, token & cost tracking | executing tools, granting permissions                   | `src/llm/provider.ts`                               |
| Tools                 | deterministic calculations, labeled data retrieval                 | side effects, network writes, order logic               | `src/tools/*`                                       |
| Instructions          | versioned rules, safety policy text                                | being edited in place; being authored by the model      | `src/instructions/loader.ts`                        |
| Auth                  | sessions, roles, deny-by-default grants, approval flags            | live trading or broker capabilities (they do not exist) | `src/auth/model.ts`                                 |
| Permissions (Phase 1) | capability table for tools                                         | granting model direct memory/backtest access            | `src/permissions/model.ts`                          |
| Database layer        | entity definitions, migrations, repositories                       | storing secrets or raw file bytes                       | `src/db/schema.ts`                                  |
| File storage          | metadata, ownership, validation, size limits                       | storing sensitive categories by default                 | `src/storage/files.ts`                              |
| Jobs                  | queueing, idempotency, retry/timeout, approval gate                | running unapproved evaluation/backtest work             | `src/jobs/queue.ts`                                 |
| Real-time bus         | role-scoped delivery, ordering, replay                             | sending internal events to clients                      | `src/realtime/events.ts`                            |
| Market data           | provider interface, normalization, quality checks, provenance      | fetching live data in this phase; trading               | `src/marketdata/provider.ts`                        |
| Vector memory         | embeddings, ranking, trust, versioning, deletion                   | promoting model output to trusted knowledge             | `src/vector/memory.ts`                              |
| Observability         | structured logs, redaction, correlation ids, audit                 | logging secrets, unredacted payloads                    | `src/core/logging.ts`                               |
| Approvals             | human approval requests/decisions                                  | self-approval, approval of non-gated operations         | `src/agent/approval.ts`                             |

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

## 9. Implementation status (Phase 2)

Implemented (types + behaviour + tests):

- config, errors, provenance/trust, logging + redaction, retry/timeout, rate limit
- auth model (roles, sessions, deny-by-default, approval flags)
- API contracts, validation, guard, error mapping
- LLM provider interface + gateway (fallback, retry, timeout, budget, usage)
- market-data provider interface, normalization, quality validation, provenance
- database entity definitions + migration validation
- file storage contract + validation + in-memory adapter
- job definitions + queue (idempotency, retry/dead-letter, approval gate)
- real-time bus (role visibility, ordering, replay)
- vector memory (embedding provider, ranking, trust, versioning, tombstone)
- approval workflow, rule registry, context assembly, desktop host, view models
- Phase 1 model/tools/instructions separation and safety gates, still enforced

Deferred intentionally: real LLM providers, real market-data providers,
SQLite driver and repositories, durable job scheduler, WebSocket transport
server, embedding provider (remote), full curriculum content, backtesting.

See [risks-and-deferred.md](./risks-and-deferred.md) for the trade-offs and the
recommended Phase 3.
