# Risks, Trade-offs & Deferred Decisions

## 1. Risks

| #   | Risk                                                       | Impact                               | Likelihood      | Mitigation in place                                                                         | Next step                                                                                      |
| --- | ---------------------------------------------------------- | ------------------------------------ | --------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| R1  | LLM produces plausible but wrong trading guidance          | learner learns a bad habit           | high            | deterministic tools for all numbers; epistemic labels; unverified memory cannot become fact | model evaluation harness with adversarial prompts; human review of curriculum-critical answers |
| R2  | Scope creep toward execution ("just a paper-trade button") | safety failure                       | medium          | no operation/tool/capability/id exists; config + tests fail if added                        | keep ADR-0002 and the hardline checks as merge gates                                           |
| R3  | Secret leakage through logs, prompts or config             | credential theft, cost abuse         | medium          | `SecretRef`-only config, mandatory recursive redaction, keychain storage                    | secret-scanning in CI; audit of debug-level logging                                            |
| R4  | Vendor lock-in to one LLM provider                         | cost/availability, migration pain    | medium          | `LlmProvider` interface + gateway; provider-specific code isolated                          | implement a second real provider early to prove the seam                                       |
| R5  | Context budget drifts as curricula grow                    | truncated context, degraded teaching | medium          | deterministic budgeted assembly; instructions never dropped; dropped sections reported      | measure context size per lesson; add summarization as an explicit section source               |
| R6  | Trust laundering: model text promoted to knowledge         | corrupted knowledge base             | low             | model writes forced `unverified`; `authoritative` requires a human verifier                 | periodic trust report in the UI; audit sampled promotions                                      |
| R7  | Approval fatigue (humans rubber-stamp)                     | weakens rule governance              | medium          | approvals require rationale + provenance evidence; self-approval blocked                    | approval UI showing evaluation metrics side by side; SLA + expiry                              |
| R8  | Synthetic data mistaken for real                           | wrong expectations                   | medium          | provenance on every bar and every UI banner; NOT NULL provenance column                     | visual watermark on synthetic charts                                                           |
| R9  | SQLite contention once jobs run concurrently               | lock errors, job failures            | low             | `concurrency` bounded (default 2), short transactions, WAL mode                             | load test; move heavy analytics to read replicas/files                                         |
| R10 | WebSocket replay gaps after long disconnection             | stale UI, confusion                  | low             | sequence numbers + bounded replay buffer + gap detection                                    | durable event log with cursor-based resume                                                     |
| R11 | Desktop WebView inconsistencies (Tauri)                    | UI bugs on one OS                    | medium          | contract-first view models, structural invariants testable in CI                            | cross-OS UI test matrix before first release                                                   |
| R12 | Cost overrun from an agentic loop                          | budget surprise                      | medium          | `UsageTracker` + `monthlyBudgetUsd` refusal, per-request token caps                         | per-session cost display; alerting thresholds                                                  |
| R13 | Evaluation metrics mistaken for predictive validity        | false confidence in a rule           | medium          | `EvaluationVerdict` includes `inconclusive`; verdict + sample size stored                   | require minimum sample size and out-of-sample split                                            |
| R14 | Single-process monolith blocks work                        | responsiveness                       | low now, rising | jobs bounded, providers timeout-bounded                                                     | extract job runner and market-data ingestion into separate processes when measured             |

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

## 4. Recommended Phase 3

1. **Persistence slice**: SQLite driver, repositories for users/lessons/memory/
   rules/audit, migrations runner, first real migration.
2. **One real LLM provider** behind `LlmProvider` (with a cost dashboard), so the
   abstraction is validated against reality, not only against fakes.
3. **Durable jobs + first real job** (`embedding.generate`, `marketData.ingest`).
4. **Curriculum v1** for the first 8 weeks, with lessons, exams and grading.
5. **Desktop shell skeleton** (Tauri) hosting the local API and the six screens
   against the existing view models.
6. Keep every Phase 1/2 invariant test green in CI; add a merge gate that fails
   if `assertNoHardlineOperations`, `assertSafeConfig` or the UI-control check
   regress.
