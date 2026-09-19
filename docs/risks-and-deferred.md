# Risks, Trade-offs & Deferred Decisions

## 1. Risks

| #   | Risk                                                                                     | Impact                               | Likelihood      | Mitigation in place                                                                                                   | Next step                                                                                            |
| --- | ---------------------------------------------------------------------------------------- | ------------------------------------ | --------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| R1  | LLM produces plausible but wrong trading guidance                                        | learner learns a bad habit           | high            | deterministic tools for all numbers; epistemic labels; unverified memory cannot become fact                           | model evaluation harness with adversarial prompts; human review of curriculum-critical answers       |
| R2  | Scope creep toward execution ("just a paper-trade button")                               | safety failure                       | medium          | no operation/tool/capability/id exists; config + tests fail if added                                                  | keep ADR-0002 and the hardline checks as merge gates                                                 |
| R3  | Secret leakage through logs, prompts or config                                           | credential theft, cost abuse         | medium          | `SecretRef`-only config, mandatory recursive redaction, keychain storage                                              | secret-scanning in CI; audit of debug-level logging                                                  |
| R4  | Vendor lock-in to one LLM provider                                                       | cost/availability, migration pain    | medium          | `LlmProvider` interface + gateway; provider-specific code isolated                                                    | implement a second real provider early to prove the seam                                             |
| R5  | Context budget drifts as curricula grow                                                  | truncated context, degraded teaching | medium          | deterministic budgeted assembly; instructions never dropped; dropped sections reported                                | measure context size per lesson; add summarization as an explicit section source                     |
| R6  | Trust laundering: model text promoted to knowledge                                       | corrupted knowledge base             | low             | model writes forced `unverified`; `authoritative` requires a human verifier                                           | periodic trust report in the UI; audit sampled promotions                                            |
| R7  | Approval fatigue (humans rubber-stamp)                                                   | weakens rule governance              | medium          | approvals require rationale + provenance evidence; self-approval blocked                                              | approval UI showing evaluation metrics side by side; SLA + expiry                                    |
| R8  | Synthetic data mistaken for real                                                         | wrong expectations                   | medium          | provenance on every bar and every UI banner; NOT NULL provenance column                                               | visual watermark on synthetic charts                                                                 |
| R9  | SQLite contention once jobs run concurrently                                             | lock errors, job failures            | low             | `concurrency` bounded (default 2), short transactions, WAL mode                                                       | load test; move heavy analytics to read replicas/files                                               |
| R10 | WebSocket replay gaps after long disconnection                                           | stale UI, confusion                  | low             | sequence numbers + bounded replay buffer + gap detection                                                              | durable event log with cursor-based resume                                                           |
| R11 | Desktop WebView inconsistencies (Tauri)                                                  | UI bugs on one OS                    | medium          | contract-first view models, structural invariants testable in CI                                                      | cross-OS UI test matrix before first release                                                         |
| R12 | Cost overrun from an agentic loop                                                        | budget surprise                      | medium          | `UsageTracker` + `monthlyBudgetUsd` refusal, per-request token caps                                                   | per-session cost display; alerting thresholds                                                        |
| R13 | Evaluation metrics mistaken for predictive validity                                      | false confidence in a rule           | medium          | `EvaluationVerdict` includes `inconclusive`; verdict + sample size stored                                             | require minimum sample size and out-of-sample split                                                  |
| R14 | Single-process monolith blocks work                                                      | responsiveness                       | low now, rising | jobs bounded, providers timeout-bounded                                                                               | extract job runner and market-data ingestion into separate processes when measured                   |
| R15 | Native SQLite module (`better-sqlite3`) breaks on a Node ABI or platform change          | app cannot start, data inaccessible  | medium          | repository layer isolates the driver; WAL database file is portable across builds                                     | pin the sidecar Node ABI, rebuild per target, keep a prebuilt-binary matrix in packaging (Phase 3.2) |
| R16 | Library churn (React 19, Fastify 5, Zod 4, chart library) invalidates the Phase 3.1 lock | rework, inconsistent stack           | medium          | adapter boundaries (`ChartAdapter`, API adapter, `LlmProvider` adapters) keep swaps local                             | supersede rule: a locked choice changes only via a new ADR, enforced by the lock test                |     | R17 | Frontend misuses the two state systems (streaming tokens into the query cache) | dropped chunks, janky UI | medium | one dedicated transient store slice for streaming; committed messages flow through a mutation | document the rule in `desktop-and-frontend.md`; add a rendering test for a long stream |
| R18 | Preview UI mistaken for a working product (mock data read as real)                       | false expectations, lost trust       | medium          | persistent `Preview · mock data` badge, per-page honesty markers, preview alert on the dashboard, tested announcement | keep the badge until every page has a real data source; remove per page as it lands                  |
| R19 | React/Radix/Framer/Motion bundle grows past what a desktop shell wants                   | slower first paint in the WebView    | low             | adapter boundaries keep swaps local; bundle is measured at build time                                                 | code-split per page once real pages load real data; revisit in the Tauri packaging step              |

## 2. Trade-offs consciously accepted

1. **Modular monolith over microservices** — no network security surface, simple
   deploys; boundary discipline relies on code review and the dependency
   direction documented in `architecture.md`.
2. **SQLite over PostgreSQL** — perfect for desktop, weaker for multi-writer
   server workloads; mitigated by repository boundaries.
3. **In-memory adapters for storage/vector/jobs** — Phase 2 validates contracts;
   data is lost on restart. Acceptable now, blocking for daily use.
4. **Scripted LLM provider as default** — offline, deterministic and testable,
   but not a real model; the seam is proven by the gateway tests, not by
   production traffic.
5. **Hash embeddings** — deterministic and offline, but weak semantic quality;
   good enough to test ranking and trust plumbing, not for a real Academy.
6. **Deny-by-default operation catalogue** — verbose, but every capability is
   explicit and auditable; no accidental power.
7. **Tombstone deletion** — preserves audit trail; conflicts with strict
   "delete my data" expectations until hard-delete lands.
8. **Approval expiry (7 days)** — prevents stale approvals, but adds retry
   friction for long-running research proposals.

## 3. Deferred implementation items

| Area                    | Deferred                                                                                                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LLM                     | real OpenAI/Anthropic/local adapters, streaming, true cancellation, prompt template registry                                                                                |
| Agent                   | tool-calling loop with multi-step tool use, summarization section source, per-user model preference                                                                         |
| Database                | SQLite driver + repositories, WAL configuration, backup/restore, hard-delete job, seed content                                                                              |
| Storage                 | filesystem and remote adapters, content-hash dedup on disk, export pipeline for reports                                                                                     |
| Jobs                    | durable scheduler, worker processes, cron-style schedules, job cancellation of running work                                                                                 |
| Real-time               | WebSocket server + auth handshake, backpressure, durable cursor resume                                                                                                      |
| Market data             | real historical provider, CSV import, corporate-action handling, tick storage/retention                                                                                     |
| Vector memory           | remote embeddings, ANN index, re-embedding migration job, retrieval-quality evaluation                                                                                      |
| Education               | full 6-month curriculum content, exam authoring tooling, spaced-repetition scheduling                                                                                       |
| Evaluation              | rubric-based grading, longitudinal skill model, model-quality benchmarks                                                                                                    |
| Backtesting             | deterministic backtest engine (behind `backtest.run`, approval-gated)                                                                                                       |
| Security                | secret scanning in CI, signed desktop builds, dependency audit policy                                                                                                       |
| Experimental technology | Menai (pure deterministic compute), Agen (orchestration ideas), Vercel Zero (capability/diagnostics inspiration), AXON (auditability/provenance influence) — none installed |

## 4. Phase 3 plan

### 4.1 Phase 3.1 — technology lock (complete)

Decided the whole stack before writing implementation code:
React 19 + Vite, TanStack Query + Zustand, Tailwind + Radix, Lightweight Charts
behind an adapter, Node 22 LTS + Fastify 5 over the existing typed contracts,
Zod as the only validator, better-sqlite3 + Drizzle (PostgreSQL deferred),
`LlmProvider` adapters with no agent framework, Tauri 2 + Node sidecar on
loopback, WebSocket over the existing event bus, durable database-backed jobs.
Rationale: [technology-decisions.md](./technology-decisions.md); rejected
alternatives: [ADR-0010…ADR-0019](./adr/README.md); enforcement:
`src/core/architectureLock.ts` + `tests/technology-lock.test.ts`.

### 4.2 Phase 3.2 — implementation on the locked stack

**Done — frontend foundation.** `web/` ships the application shell (sidebar,
topbar, workspace), the design token system, ten reusable primitives and five
prototype pages driven by mock data typed against the backend view models. The
interface is honest about not being connected, RTL-ready, keyboard-accessible,
and guarded by tests ([frontend-foundation.md](./frontend-foundation.md)).
No TanStack Query and no chart library are installed yet, on purpose
([technology-decisions.md](./technology-decisions.md) § 11).

**Remaining, in dependency order:**

1. **Persistence slice** (next): better-sqlite3 + Drizzle, repositories for
   users/lessons/memory/rules/audit, migration runner, first real migration,
   WAL + backup settings, DB in the OS app-data directory.
2. **API server adapter**: Fastify mounting `API_ROUTES`, Zod schemas replacing
   hand-written body validators, loopback + per-launch bearer token; then wire
   TanStack Query to real endpoints.
3. **One real LLM provider** behind `LlmProvider` (streaming + cost dashboard),
   so the abstraction is validated against reality, not only fakes.
4. **Durable jobs**: claim + lease worker loop, real `embedding.generate` and
   `marketData.ingest` handlers, scheduled `maintenance.cleanup`.
5. **Real-time transport**: `/ws` endpoint, session handshake, heartbeat,
   backpressure, `fromSeq` resume wired to the UI (replaces the Offline badge).
6. **Desktop shell skeleton** (Tauri 2) hosting the Node sidecar and the five
   pages; packaging pins the Node ABI (R15). Lightweight Charts replaces the
   `ChartAdapter` placeholder body.
7. **Curriculum v1** for the first 8 weeks, with lessons, exams and grading.
8. Keep every Phase 1/2/3.1/3.2 invariant green in CI; add a merge gate that
   fails if `assertSafeConfig`, `assertNoHardlineOperations`,
   `assertArchitectureLock`, the frontend shell invariants or the UI-control check
   regress.
