# Master Trade — Architecture (Phase 1)

Trading **Training** Agent: evolves from beginner to advanced level over ≥6 months.
Desktop-oriented, TypeScript core.

## Three independent components

```
┌─────────────────────────────────────────────────────────┐
│                      User (desktop)                      │
└──────────────────────────┬──────────────────────────────┘
                           │
                  ┌────────▼────────┐
                  │   Orchestrator   │  lifecycle + permission checks
                  │  (agent engine)  │  provenance recording
                  └───┬─────────┬───┘
        ┌─────────────▼──┐   ┌──▼──────────────────┐
        │ 1. Model       │   │ 2. Tools            │
        │ (LLM adapter,  │   │ typed, deterministic│
        │  scripted in   │   │ side-effect free    │
        │  Phase 1)      │   │                     │
        └────────────────┘   └─────────────────────┘
                  ┌────────▼────────┐
                  │ 3. Instructions │  versioned, immutable
                  │  (rules/policy) │  safety-validated
                  └─────────────────┘
```

### 1. Model (`src/agent/orchestrator.ts` — `ModelAdapter`)

- Responsible for reasoning, explanation, decision _support_.
- Never performs numeric risk calculations itself — it _requests_ tool runs.
- Phase 1 ships `scriptedModelAdapter` (deterministic, offline, testable).
  A real LLM adapter implements the same interface later; permission checks
  and provenance do not change.

### 2. Tools (`src/tools/`)

- Explicit, typed, testable, **side-effect free** (enforced at registration).
- Categories: market-data, deterministic-calc, risk-management, education,
  backtesting (reserved).
- Registry rejects any tool declaring `hasSideEffects: true`.

### 3. Instructions (`src/instructions/loader.ts`)

- Versioned, immutable modules with id + semver.
- Loader rejects any instruction text that could authorize live trading,
  order placement or broker connections (regex policy gate).
- Rendered with version stamps and attached to every run for reproducibility.

## Supporting subsystems

- **Permissions** (`src/permissions/model.ts`): deny-by-default capability
  table per subject (`model` / `tool` / `human`).
- **Memory** (`src/memory/store.ts`): every entry records origin
  (tool/model/human) + epistemic kind; `InMemoryStore` is the Phase 1
  implementation; the interface is the future persistence seam.
- **Lifecycle** (`src/agent/lifecycle.ts`): explicit state machine
  `IDLE → LOADING → READY → RUNNING → RESPONDING|BLOCKED → IDLE`; illegal
  transitions throw.
- **Evaluation** (`src/evaluation/harness.ts`): invariant-based scenarios
  (labeling, determinism, refusal of execution) rather than trading skill.

## Epistemic discipline

Every model statement and memory entry carries one of:
`fact | analysis | hypothesis | uncertainty`. Facts come from deterministic
tools; the model's own output is analysis/hypothesis/uncertainty.

## Safety model (non-negotiable in Phase 1)

- `SafetyProfile` hard-codes `liveTradingEnabled: false`,
  `brokerExecutionEnabled: false` (type-level: no `true` value exists).
- Orchestrator refuses construction otherwise; tests enforce this.
- No tool registers side effects; no network/execution capability exists.
- New trading rules require human approval before activation (future
  approval workflow will build on the permissions module).

## Repository layout

```
master-trade/
├── src/
│   ├── agent/          # lifecycle + orchestrator + demo
│   ├── evaluation/     # invariant harness
│   ├── instructions/   # versioned instruction loader
│   ├── memory/         # provenance-tagged store
│   ├── permissions/    # deny-by-default capability model
│   ├── tools/          # framework + risk + market data
│   ├── types.ts        # shared types, SafetyProfile
│   └── index.ts        # public entry
├── tests/              # vitest unit + safety tests
├── docs/               # this document + workflow
└── .github/workflows/  # CI: validate on push/PR
```

## Experimental technology policy

- **Menai** — reserved for future pure/deterministic computations; not used yet.
- **Agen** — state-driven orchestration is currently modeled with typed
  TypeScript structures (lifecycle + orchestrator); revisit only if a
  documented need appears.
- **Vercel Zero** — architectural inspiration only (capabilities/diagnostics).
- **AXON** — auditability/provenance concepts informed the memory design;
  not a dependency.

## Future seams (deliberately left open)

- Real LLM adapter behind `ModelAdapter`.
- Real market-data provider behind the tool interface (with provenance).
- Persistent memory behind `MemoryStore`.
- Backtesting behind the `backtest.run` capability (human-triggered only).
- Audit log: memory provenance is the seed of it.
