# Risks, Trade-offs & Deferred Decisions

## 1. Risks

| #   | Risk                                                                                        | Impact                               | Likelihood      | Mitigation in place                                                                                                                                   | Next step                                                                                                            |
| --- | ------------------------------------------------------------------------------------------- | ------------------------------------ | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| R1  | LLM produces plausible but wrong trading guidance                                           | learner learns a bad habit           | high            | deterministic tools for all numbers; epistemic labels; unverified memory cannot become fact                                                           | model evaluation harness with adversarial prompts; human review of curriculum-critical answers                       |
| R2  | Scope creep toward execution ("just a paper-trade button")                                  | safety failure                       | medium          | no operation/tool/capability/id exists; config + tests fail if added                                                                                  | keep ADR-0002 and the hardline checks as merge gates                                                                 |
| R3  | Secret leakage through logs, prompts or config                                              | credential theft, cost abuse         | medium          | `SecretRef`-only config, mandatory recursive redaction, keychain storage                                                                              | secret-scanning in CI; audit of debug-level logging                                                                  |
| R4  | Vendor lock-in to one LLM provider                                                          | cost/availability, migration pain    | medium          | `LlmProvider` interface + gateway; provider-specific code isolated                                                                                    | implement a second real provider early to prove the seam                                                             |
| R5  | Context budget drifts as curricula grow                                                     | truncated context, degraded teaching | medium          | deterministic budgeted assembly; instructions never dropped; dropped sections reported                                                                | measure context size per lesson; add summarization as an explicit section source                                     |
| R6  | Trust laundering: model text promoted to knowledge                                          | corrupted knowledge base             | low             | model writes forced `unverified`; `authoritative` requires a human verifier                                                                           | periodic trust report in the UI; audit sampled promotions                                                            |
| R7  | Approval fatigue (humans rubber-stamp)                                                      | weakens rule governance              | medium          | approvals require rationale + provenance evidence; self-approval blocked                                                                              | approval UI showing evaluation metrics side by side; SLA + expiry                                                    |
| R8  | Synthetic data mistaken for real                                                            | wrong expectations                   | medium          | provenance on every bar and every UI banner; NOT NULL provenance column                                                                               | visual watermark on synthetic charts                                                                                 |
| R9  | SQLite contention once jobs run concurrently                                                | lock errors, job failures            | low             | `concurrency` bounded (default 2), short transactions, WAL mode                                                                                       | load test; move heavy analytics to read replicas/files                                                               |
| R10 | WebSocket replay gaps after long disconnection                                              | stale UI, confusion                  | low             | sequence numbers + bounded replay buffer + gap detection                                                                                              | durable event log with cursor-based resume                                                                           |
| R11 | Desktop WebView inconsistencies (Tauri)                                                     | UI bugs on one OS                    | medium          | contract-first view models, structural invariants testable in CI                                                                                      | cross-OS UI test matrix before first release                                                                         |
| R12 | Cost overrun from an agentic loop                                                           | budget surprise                      | medium          | `UsageTracker` + `monthlyBudgetUsd` refusal, per-request token caps                                                                                   | per-session cost display; alerting thresholds                                                                        |
| R13 | Evaluation metrics mistaken for predictive validity                                         | false confidence in a rule           | medium          | `EvaluationVerdict` includes `inconclusive`; verdict + sample size stored                                                                             | require minimum sample size and out-of-sample split                                                                  |
| R14 | Single-process monolith blocks work                                                         | responsiveness                       | low now, rising | jobs bounded, providers timeout-bounded                                                                                                               | extract job runner and market-data ingestion into separate processes when measured                                   |
| R15 | Native SQLite module (`better-sqlite3`) breaks on a Node ABI or platform change             | app cannot start, data inaccessible  | medium          | repository layer isolates the driver; WAL database file is portable across builds                                                                     | pin the sidecar Node ABI, rebuild per target, keep a prebuilt-binary matrix in packaging (Phase 3.2)                 |
| R16 | Library churn (React 19, Fastify 5, Zod 4, chart library) invalidates the Phase 3.1 lock    | rework, inconsistent stack           | medium          | adapter boundaries (`ChartAdapter`, API adapter, `LlmProvider` adapters) keep swaps local                                                             | supersede rule: a locked choice changes only via a new ADR, enforced by the lock test                                |
| R17 | Frontend misuses the two state systems (streaming tokens into the query cache)              | dropped chunks, janky UI             | medium          | one dedicated transient store slice for streaming; committed messages flow through a mutation                                                         | document the rule in `desktop-and-frontend.md`; add a rendering test for a long stream                               |
| R18 | Preview UI mistaken for a working product (mock data read as real)                          | false expectations, lost trust       | medium          | persistent `Preview · mock data` badge, per-page honesty markers, preview alert on the dashboard, tested announcement                                 | keep the badge until every page has a real data source; remove per page as it lands                                  |
| R19 | React/Radix/Framer/Motion bundle grows past what a desktop shell wants                      | slower first paint in the WebView    | low             | adapter boundaries keep swaps local; bundle is measured at build time                                                                                 | code-split per page once real pages load real data; revisit in the Tauri packaging step                              |
| R20 | Backend readiness mistaken for a working system (three routes answer 501, nothing persists) | false confidence, wasted integration | medium          | readiness returns `degraded` per unbuilt layer with a detail string; the 501 body names the missing capability; owner-only config view is redacted    | keep readiness honest as slices land; make the frontend render `501 NOT_IMPLEMENTED` distinctly from `403 FORBIDDEN` |
| R21 | A new local process (or a browser page) reaching the loopback port                          | unauthorized API use                 | low now         | loopback refusal, optional per-launch shell token compared in constant time, hashed session tokens; no shell token configured triggers a boot warning | set the shell token in the Tauri handshake; add a per-session rate limit before any costly endpoint exists           |
| R22 | Body/session memory of a long-lived process grows (sessions, dead letters, log sink)        | memory pressure over weeks           | low             | sessions have a TTL with `purgeExpired()`; dead letters are bounded; logs stream to a sink rather than accumulating                                   | schedule a maintenance job once the durable queue lands; cap in-memory log retention in the desktop build            |
| R23 | Price table drifts from provider pricing, so the budget stops matching real spend           | budget control inaccurate            | medium          | cost derived from one reviewed table; unpriced models refused; usage flagged `estimated` when counts are missing                                      | review prices when a provider announces a change; add a spend reconciliation report per session                      |
| R24 | A model ignores the summary contract, so turns fail instead of degrading                    | visible failures, friction           | medium          | every rejection is typed and named (missing source, free-form text, reasoning field); the offline adapter is always available as a working default    | add a repair retry that re-asks once with the contract, then fails; measure the violation rate per provider          |
| R25 | A provider's reasoning or tool payload leaks into the product through a new field           | exposure of private deliberation     | low             | adapters read named fields only; the parser refuses reasoning keys; a structural check on summary kinds guards the contract                           | extend the adapter fixtures for each provider release; keep the structural test in CI                                |

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
| LLM                     | streaming (`stream()`), true cancellation from the UI into an in-flight call, the multi-step tool loop, prompt template registry, spend report per session                  |
| Agent                   | tool-calling loop with multi-step tool use, summarization section source, per-user model preference                                                                         |
| Database                | SQLite driver + repositories, WAL configuration, backup/restore, hard-delete job, seed content                                                                              |
| Storage                 | filesystem and remote adapters, content-hash dedup on disk, export pipeline for reports                                                                                     |
| Jobs                    | durable scheduler, worker processes, cron-style schedules, job cancellation of running work                                                                                 |
| Real-time               | WebSocket server + auth handshake, backpressure, durable cursor resume                                                                                                      |
| Market data             | real historical provider, CSV import, corporate-action handling, tick storage/retention                                                                                     |
| Vector memory           | remote embeddings, ANN index, re-embedding migration job, retrieval-quality evaluation                                                                                      |
| Education               | full 6-month curriculum content, exam authoring tooling, spaced-repetition scheduling, a live exam runner (the Exams page renders assessments only)                         |
| Evaluation              | rubric-based grading wired to the exam surface, longitudinal skill model, model-quality benchmarks                                                                          |
| Backtesting             | deterministic backtest engine (behind `backtest.run`, approval-gated); Research metrics stay labelled `synthetic`/`none` until it exists                                    |
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
2. **API server adapter**: done in Phase 3.3 (Fastify mounting `API_ROUTES`, Zod
   schemas, loopback + per-launch shell token). The remaining half is wiring
   TanStack Query to the live endpoints and rendering the pending `501`s.
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

### 4.3 Phase 3.3 — backend foundation (complete)

**Done — HTTP surface.** `src/server/**` mounts the typed contracts on Fastify 5
(loopback only): one generated pipeline per route with a start-up coverage
assertion, Zod as the sole validator, one error handler, structured request
logging with correlation ids, `SessionService` authentication, the
deny-by-default authorization middleware, the approval gate, environment-driven
configuration that refuses to start on an unsafe setting, and liveness/readiness
checks that re-assert the safety invariants at runtime. 33 new tests
([backend-foundation.md](./backend-foundation.md),
[ADR-0021](./adr/ADR-0021-single-request-pipeline.md),
[ADR-0022](./adr/ADR-0022-local-api-trust-boundary.md)).

**Not done, deliberately:** persistence, hosted providers, `/ws`, durable workers,
CORS/bridge packaging. Item 2 of the Phase 3.2 list above is now half complete —
the server exists; wiring TanStack Query to it does not.

**Next:** persistence slice (item 1), then the frontend against real endpoints.

### 4.4 Phase 3.4 — database architecture and product modules

**Done — database foundation.** `src/db/**` gives both engines one schema and one
repository surface: a driver-agnostic DDL layer (`dialect.ts`, `ddl.ts`), an
async-only `executor` port so a repository never knows which engine it talks to,
a generated/ledgered migration runner, eight repositories (identity, academy,
memory, governance, audit, platform, market data, agent) and machine-readable data
ownership rules. SQLite (node:sqlite, WAL) is the local mode; PostgreSQL the
deferred production mode. `better-sqlite3` was rejected at install: no prebuilt
binary for the installed Node ABI and no MSVC toolchain here — a driver port keeps
that reversible ([database-and-storage.md](./database-and-storage.md),
[ADR-0023](./adr/ADR-0023-repository-boundary-and-data-ownership.md),
[ADR-0024](./adr/ADR-0024-generated-migrations-and-ledger.md),
[ADR-0025](./adr/ADR-0025-sqlite-driver-and-dialects.md)).

**Done — product modules.** Three frontend surfaces the Phase 3.2 shell omitted —
Exams, Memory and Research — plus four Dashboard overview widgets, built entirely
from the existing tokens and primitives with typed mock data. No backend, AI,
permission or safety code changed; no execution affordance added; every state,
trust rule and metric-source rule is asserted by `tests/frontend-modules.test.ts`
([frontend-foundation.md](./frontend-foundation.md) § 9).

**Next:** persistence wiring (repositories → server → UI), then one real LLM
provider (Phase 3.5 AI infrastructure).

### 4.5 Phase 3.5 — AI infrastructure

**Done — the LLM layer, implemented rather than described.** Providers are real
adapters behind `LlmProvider`: OpenAI and any OpenAI-compatible local server, and
Anthropic's Messages API, over native `fetch` with no vendor SDK
([ADR-0028](./adr/ADR-0028-provider-transport-native-fetch.md)).
`createAiGateway()` is the composition root: the offline scripted adapter is
always registered, a provider that cannot be built is skipped _with a reason_, and
an unpriced model is a start-up warning and a call-time refusal.

**Done — three controls that used to be conventions.**

1. **Cost is ours.** A provider returns token counts; the gateway prices them
   from one reviewed table and refuses a model it cannot price
   ([ADR-0026](./adr/ADR-0026-cost-from-our-price-table.md)). A spent budget
   blocks the turn before any provider call.
2. **Answers are structured.** `OUTPUT_CONTRACT` is injected into every request
   and enforced after it: an answer is a JSON summary or the turn fails. A
   `fact` without a source is rejected, `uncertainty` is a rendered field, and
   chain-of-thought is refused by name — as a JSON field or an inline
   `<thinking>` block, in the adapter and in the parser
   ([ADR-0027](./adr/ADR-0027-structured-summaries-not-chain-of-thought.md)).
3. **Tools run in the orchestrator, with arguments.** `Orchestrator.runAsync()`
   authorizes each requested tool, runs it, and records provenance; one denied or
   unknown tool blocks the whole turn. The model never receives a tool handle.

**Also done:** the gateway circuit breaker (a down provider stops being
attempted, then is re-probed) and the offline default now answers _inside_ the
summary contract, so a keyless run is a real path through the same parser,
permission check and cost accounting. 42 new tests
([ai-and-llm.md](./ai-and-llm.md)); `npm run ai:demo` runs a turn offline.

**Not done, deliberately:** streaming, UI cancellation, the multi-step tool loop
(the model is not re-asked to narrate a deterministic result), and server wiring —
the HTTP server still registers no provider, and readiness keeps saying so.

**Next:** register a provider in the server composition root and expose the async
turn over the API, then wire the frontend to it.

### 4.6 Phase 3.6 — desktop foundation

**Done — the shell exists as source, and its policy is executable.** `src-tauri/`
holds the Tauri 2 project (config, capability file, six Rust modules, five
plugins); `src/desktop/` holds the same rules as TypeScript that runs in the test
suite. `npm run desktop:verify` checks 22 things across the two, including command
parity **in both directions**, that `Command::new` appears only in `sidecar.rs`,
and that port, version and config-schema agree between Rust and TypeScript.

**Done — the boundary is a list, not a promise.** The WebView is granted five
permissions and no `shell:`, `fs:`, `path:`, `http:`, `process:`, `store:` or
`global-shortcut:` permission at all
([ADR-0029](./adr/ADR-0029-webview-capability-boundary.md)). Rust spawns the
sidecar, reads the keychain, writes the cache and resolves export destinations; no
command returns a filesystem path.

**Done — lifecycle and configuration.** Launch is a typed plan on a fixed loopback
port with a per-launch token in the environment; the window waits for the
_authenticated_ health route to answer
([ADR-0030](./adr/ADR-0030-sidecar-supervision-fixed-port.md)). Config lives in the
per-OS app-data directory under one strict schema sharing its keys with Rust, and a
credential-shaped key anywhere in it is refused rather than filtered
([ADR-0031](./adr/ADR-0031-desktop-config-appdata-keychain.md)). 29 new tests.

**Four real defects this phase exposed,** all fixed and covered: the restart
budget was cleared by the restart itself, so a crash loop respawned forever while
looking like recovery; a credential named `openaiKey` slipped past the secret-key
pattern and was only caught as an unknown key; a shell build answering `null` for
the save dialog crashed the bridge; and the offline scripted provider needed to
satisfy the summary contract so a keyless turn is a real path.

**Not done — and this is the honest headline:** there is no compiled bundle. This
environment and CI have no Rust toolchain, so `cargo build`, `tauri dev`, the
keychain round-trip, window timing, code signing and notarisation are unexercised.
The verifier says so in its own report rather than implying a tested app. Icons are
placeholders, and the updater's signing key is a placeholder reported as a warning.

**Next:** build the shell on a machine with a toolchain, then run the first real
end-to-end: window → handshake → authenticated API call → agent turn.

### 4.7 Phase 3.7 — realtime, background jobs and the preview prototype

**Complete.** Event contracts with deny-by-default audiences, an authenticated
WebSocket transport, a durable job queue behind a port, job status/cancel routes, the
frontend realtime client and store, eight reusable realtime components, the Activity
page, and a preview prototype that carries loading/empty/error states through every
product surface. `docs/realtime-and-jobs.md` and `docs/preview-prototype.md` are the
implemented state; ADR-0032, ADR-0033 and ADR-0034 record why.

**Five real defects this phase exposed,** four of them found by tests written for it
and one by the shell verifier:

1. **The client reused the wrong retry policy.** `shouldReconnect` in the protocol
   module answers the _server's_ question and treats `1001 going away` as final, so a
   client that imported it refused to reconnect after a server restart — the one case
   where reconnecting always helps.
2. **The heartbeat could never fail.** `scheduleHeartbeat()` cleared the
   `awaitingPong` flag on entry, and the timer callback calls it right after sending a
   ping: the flag was erased before the next tick could check it, so a silent socket
   looked healthy forever.
3. **A WebSocket route registered before the plugin's hook never upgraded.** The
   socket route is now registered inside a plugin that first awaits
   `@fastify/websocket`, because `websocket: true` is understood only once that hook
   exists. A route compiled earlier hangs the client.
4. **Internal events were deliverable client-side.** The bus refuses to give an
   internal event an audience, but the client had no matching check; it now refuses
   `internal` types explicitly, because "unreachable" is the assumption that leaks.
5. **Three stale doc/typing drifts:** the durable `jobs` SQL mentioned in a comment
   tripped the "no SQL outside `src/db`" invariant, an unused `JobListQuery` import,
   and an unused `JobQueue.sleep` option left behind when the worker pool took over
   sleeping.

**Known limitations, in priority order:**

- **A WebView cannot present the shell token on a socket upgrade.** The access policy
  reads upgrade headers, and a browser `WebSocket` cannot set them. Streaming inside a
  token-gated sidecar therefore needs one of: the socket opened from Rust, an
  exception scoped to loopback + authenticated session, or a socket-specific token
  path onto the first-frame authentication that already exists. Until then, realtime
  is exercised by `tests/realtime-ws.test.ts` (in-process, real upgrades) rather than
  from the browser.
- **No session is issued yet.** Sessions are created, hashed and verified, but the
  login/local-issuance slice that hands one to the shell has not landed, so the
  Activity page reports `no-session` instead of connecting. This is the single
  blocking item between the built realtime layer and a live browser feed.
- **No `backtest.run` handler**, deliberately: the kind exists with its approval gate
  and no implementation, so a capability that does not exist cannot run.
- **No job enqueue over HTTP**, by design; enqueueing stays a server-side act.
- **No streaming of model output.** A turn is one structured summary, so
  `agent.message` arrives whole; `stream()` and mid-turn cancellation need an
  interface change and a real provider.
- **A job with no handler dead-letters immediately** rather than retrying, which is
  correct for a configuration error and means a missing handler is visible in the
  queue summary instead of buried in backoff.

**Next:** the session/issuance slice, then the live path — window → session →
authenticated socket → a real event and a real job in the Activity page.

### 4.8 Phase 3.8 candidates

- Market-data and vector-memory providers behind their existing interfaces.
- The first real job handlers (`dataset.process`, `embedding.generate`) with
  idempotency tested against a re-enqueued duplicate.
- Server-side rate-limit and backpressure tuning for a browser that reconnects often.

## 5. Phase 3.10 — final architecture validation (complete)

A read-only architecture audit across frontend, backend, database, AI, desktop,
realtime/jobs, testing, Git and documentation, followed by `npm run validate`
end to end. One genuine code-level defect was found and fixed; no architecture
was changed and no test was weakened.

**Fixed** — `tests/jobs-persistence.test.ts` opened a real SQLite file in every
test with no driver guard, so on a runtime without `node:sqlite` (Node < 22.5, or
a 22.x build before 22.13 where the module is still behind `--experimental-sqlite`)
all twelve tests would have **failed** with `PROVIDER_UNAVAILABLE`, while the two
sibling database suites (`database.test.ts`, `repositories.test.ts`) skip with a
recorded reason. The guard those suites use is now applied here too, so the
`ci.yml` promise ("on a 22 build without the built-in enabled they skip … instead
of failing") is true for every DB suite. On a supported runtime the tests run exactly
as before.

**Status** — all green: `format:check`, `typecheck`, `typecheck:web`, **368 tests
in 27 files** (0 skipped, 0 todo), `build`, `build:web`, and 22 desktop checks
with 0 errors and 1 warning (the updater placeholder signing key, a release-time
prerequisite, not a code defect). No secrets are tracked; `.env*` and `data/` are
gitignored.

## 6. Phase 4.1 — monorepo assessment (complete, planning only)

A repository-wide inspection followed by an architecture assessment, not a
migration. **Nothing was moved, no dependency was added, and `package.json` is
untouched.** Decision: [ADR-0035](./adr/ADR-0035-monorepo-migration-staged-boundary-first.md)
— keep the single package, **defer** the full `apps/` + `packages/` layout, and
make the existing frontend/backend boundary explicit first. Full analysis in
[monorepo-assessment.md](./monorepo-assessment.md).

**What the inspection found.** The shared surface the proposed
`packages/shared` would hold already exists — as a path depth. **18** frontend
files import backend source through raw relative specifiers up to four levels
deep, across **27** specifiers resolving to nine backend modules. The direction is
already one-way (nothing in `src/` imports `web/`), there are no circular
dependencies, and no duplicated responsibility to fix by moving directories. What
is missing is _enforcement_: `web/tsconfig.json` declares no `paths`, the root
tsconfig reaches into `web/src/{config,design,mock}`, and `vitest.config.ts` exists
only because Vite's root is `web/`.

**Why the migration is deferred.** Commit `c92fa9c` — two commits earlier — fixed
`@tailwindcss/oxide` failing to find its native binding on the VPS because npm was
omitting _optional_ dependencies. Workspaces hoist differently, so the platform
package resolving today can move or vanish, re-creating exactly that failure. On
top of that, cross-package TypeScript resolution is a new build-order cost, the
Tauri chain hardcodes `../web/dist` and `dist/server/start.js`, and
`packages/trading-engine` would be nearly empty — the only real trading logic is
`src/tools/risk.ts` plus the evaluation harness.

**What was enforced instead.** `tests/monorepo-boundary.test.ts` (7 tests) pins the
assessment's own claims so they cannot drift: the one-way dependency direction, a
**declared** shared surface that every frontend cross-boundary import must resolve
to, a refusal of deep imports into `src/db`, `src/server`, `src/auth`, `src/jobs/queue`
and `src/jobs/store`, the existence and indexing of the ADR, and the absence of a
`workspaces` field. Adding a genuinely new shared module is now a deliberate edit
to the declared list.

**Next** — the trigger for a real migration is recorded in §6 of the assessment
(a second consumer of the shared surface, independent frontend packaging, or
non-Rust sidecar build steps). Until one fires, the cheapest correct next step is
the single import alias for the shared surface (one `paths` entry mirrored in both
tsconfigs), which turns the boundary into a stable specifier with no directory
moves.

## 7. Phase 4.2 — monorepo foundation, boundary first (complete)

Implemented **step 1 of ADR-0035** and nothing else. No file was moved, no workspace was
configured, no dependency was added — `package.json` is untouched and `npm ci` against
the committed lockfile remains the single install path. Docs:
[monorepo.md](./monorepo.md).

**What changed.** The frontend's 27 relative specifiers into `src/` (spread over 18
files, up to four levels of `../`) became **13 exact `@shared/*` names**. The mapping is
declared once in `config/sharedSurface.ts`, consumed by `vite.config.ts` and
`vitest.config.ts`, and mirrored literally in both tsconfigs because TypeScript `paths`
cannot read a module.

**Why exact-match matters.** Each entry names one module, not a directory prefix, so
`@shared/db/sqlite`, `@shared/server/app`, `@shared/auth/sessions` and bare `@shared`
have **no resolver entry at all**. A frontend import of the database driver or the HTTP
server now fails to compile and fails to bundle, rather than being merely discouraged by
a test.

**Vitest needed the alias, and that was the point.** Two suites import frontend modules
directly (`tests/realtime-client.test.ts` → `web/src/realtime/client.ts`,
`tests/frontend-modules.test.ts` → `web/src/mock/*`), and those modules cross the
boundary. Had the alias lived only in `vite.config.ts`, the boundary would have worked
in production and failed in CI — so both configs read one shared map, and
`tests/monorepo-boundary.test.ts` fails if either inlines its own copy.

**Proof the change is semantically neutral:** `npm run build:web` produces the
**identical bundle hash** before and after (`index-DYVNC18H.js`, `index-BJ_1UnX4.css`) —
the alias resolved to the same modules byte for byte.

**Target structure is inert by design.** `apps/{desktop,web,api}` and
`packages/{ui,database,ai,market-data,trading-engine,shared}` exist as README markers
that state what will move there and which trigger fires it. There is deliberately no
`package.json` inside them and no `workspaces` field, so npm ignores them entirely.
Asserted by test, along with the honest note in `packages/trading-engine/README.md` that
it would be nearly empty.

**Fixed en route:** one assertion in `tests/frontend-prototype.test.ts` pinned the old
literal relative import string; it now asserts the declared name. One real config
defect was caught by the toolchain: `paths` targets must be relative to the tsconfig and,
under the root's `NodeNext`, must carry an explicit `.js` extension (`TS5090`/`TS2307`).

**Status** — all green: `format:check`, `typecheck`, `typecheck:web`, **386 tests in 29
files** (0 skipped, 0 todo), `build`, `build:web`, and 22 desktop checks with 0 errors
and 1 warning (the updater placeholder signing key).

**Next (Phase 4.3 candidate)** — extract `packages/shared` alone, source-only, by
repointing the alias target from `src/…` to `packages/shared/…`. Because every consumer
already imports one of 13 exact names, no consumer import changes. The remaining five
packages wait for a trigger (§6 of the assessment).

## 8. Dependency audit — Vitest/Vite advisories (investigated, remediation pending)

`npm audit` reports 5 vulnerabilities in the dev/test toolchain (3 moderate, 1 high, 1
critical). **Production scope is clean** — `npm audit --omit=dev --audit-level=high`
exits 0. Full analysis, reachability and the rejected alternatives:
[dependency-audit.md](./dependency-audit.md).

**Root cause:** `vitest@2.1.9` requires `vite ^5.0.0`, but the project's own `vite` is
6.4.3, so npm keeps a nested `vite@5.4.21` + `esbuild@0.21.5` + `vite-node@2.1.9` +
`@vitest/mocker@2.1.9`. Every flagged node is inside that duplicate. `5.4.21` is the
last `5.4.x` ever published, so **no patched Vite 5 exists** — the duplicate can only
be eliminated, not upgraded.

**Not reachable in this repository:** the critical advisory needs the Vitest UI or
Browser Mode (we run `vitest run` only); the `@vitest/mocker` one needs `vi.mock`
redirect mocks or a third-party dev server on Vite's unauthenticated HMR socket (`vi.mock`
appears 0 times); the `vite`/`esbuild` ones need a dev server served from the nested
copies, and our dev server is the patched top-level 6.4.3.

**Recommended fix, not applied:** `vitest` 2.1.9 → `^4.1.11`. That is the minimum fully
patched version (3.2.7 is not enough — `@vitest/mocker` is only fixed at 4.1.11), and it
clears all five: `vite-node` disappears in vitest 4, and the tree dedupes onto our
existing `vite@6.4.3`. It is a **two-major** upgrade, so it is documented rather than
applied automatically.

**Enforced instead:** `npm run audit:prod` plus a CI step, so a production-scope
advisory fails the build while dev-toolchain noise does not block unrelated work.

## 9. `packages/shared` extraction (Phase 4.3 — completed)

Executed ADR-0035 step 2 as a physical package. Full record:
[ADR-0036](./adr/ADR-0036-extract-shared-package-source-only.md); current layout:
[monorepo.md](./monorepo.md).

**§7's prediction above was wrong, and the correction is the substance of this phase.**
It said the extraction would be "source-only ... no consumer import changes" because
"every consumer already imports one of 13 exact names". Two measurement errors:

1. **The surface is not 13 leaf modules.** `src/api/contracts.ts` imports `../auth/model.js`
   and `./schemas.js`; `jobs/service.ts` imports `queue.js`/`vocabulary.js`/`core/logging.js`;
   `marketdata/provider.ts` imports `core/rateLimit.js`/`core/retry.js`. The real closure is
   **22 files**, and **91 files needed rewriting — 217 specifiers**. Only the _frontend's_
   29 imports were unchanged.
2. **`@shared/*` cannot be the backend's specifier.** It resolves only as a Vite/tsc alias;
   compiled Node ESM cannot execute a `.ts` specifier, and Node disables type-stripping for
   files under `node_modules`. The backend must use relative paths.

**Non-obvious cost found:** `tsconfig.build.json` had no `rootDir`, so TypeScript inferred
it from `src/` and emitted `dist/server/start.js`. Adding `packages/shared/src` moved the
inferred root, shifting every output to `dist/src/…`. Updated consumers: 7 `package.json`
scripts, `scripts/build-sidecar.mjs`, `src/desktop/cli.ts`. **`tauri.conf.json` needed no
change** (`web/` and `src-tauri/` did not move) — better than the assessment predicted.

**Deliberately not done:** no npm workspaces, so `npm ci` with the committed lockfile stays
the single install path and the optional-dependency hoisting surface behind the
`@tailwindcss/oxide` failure (`c92fa9c`) is unchanged. Both facts are asserted by test.

**Good news the audit produced:** all 22 modules are pure — no `node:*`, Fastify, pino or
database-driver imports anywhere in the closure — so the package is genuinely
frontend-safe rather than merely convenient. `jobs/store.ts` imports nothing at all.

**Status** — all green: `format:check`, `typecheck`, `typecheck:web`, **390 tests in 29
files** (0 skipped, 0 todo), `build`, `build:web`, and 22 desktop checks with 0 errors and
1 warning (the updater placeholder signing key). The boundary suite grew from 15 to 19
tests, and now additionally asserts that the package's `exports` equal the declared
surface, that the package is closed, and that the backend is a real consumer.

**Deferred, with triggers (ADR-0035 §6 unchanged):** `apps/web` + `apps/api`, npm
workspaces, a built `@master-trade/shared`, and the other four packages.

## 10. Deterministic core extracted; four packages declined (Phase 4.4 — completed)

Full record: [ADR-0037](./adr/ADR-0037-trading-engine-deterministic-core.md); current layout:
[monorepo.md](./monorepo.md).

**Extracted:** `packages/trading-engine`, holding the Phase-1 **Tools** layer —
`framework.ts` (the `Tool` contract, `ToolRegistry`), `risk.ts` (`positionSizeTool`,
`rMultipleTool`), `marketData.ts` (`smaTool`, `syntheticSeriesTool`) and `index.ts`
(`defaultToolRegistry`) — formerly `src/tools/**`. Four files, 357 lines, **19 specifiers
rewritten across 13 consumer files** (plus the moved files' own imports to `packages/shared`).

**The justification is safety, not sharing.** The project's rule is that risk calculations
must not depend on LLM-generated reasoning. That was a convention — `src/tools/**` happened
to import nothing dangerous. It is now a checkable boundary: the engine may import
`packages/shared` and itself, and nothing else, with no `node:*` builtin. A future model
influence on position sizing would have to cross a package boundary a test refuses.

**`src/evaluation` deliberately did not move.** It imports `../agent/orchestrator.js`, so it
is not deterministic in the sense the package requires — the new test caught this while the
move set was being drafted, which is the argument for extracting by measured dependency
rather than by directory name.

**Four candidates declined, with evidence.** `packages/ui`, `packages/database` and
`packages/ai` each have exactly **one consumer** and an already-enforced boundary;
`packages/market-data` has **nothing to put in it** — the provider abstraction and
provenance are a contract the frontend consumes, already on the shared surface as
`@shared/marketdata/provider`. A cross-boundary scan confirms **zero** modules in `src/` are
imported from both `src/` and `web/`. Creating them would be the ceremony ADR-0035 rejected.

**Cleanup:** the three directories Phase 4.3 emptied — `src/api/`, `src/frontend/`,
`src/marketdata/` — were removed, and `src/tools/` went with the engine.

**Build/install topology:** unchanged in shape. `tsconfig.build.json` gained
`packages/trading-engine/src/**`, so output is `dist/packages/trading-engine/src/**`; no
`rootDir` change was needed this time, no `package.json` script changed, and
`tauri.conf.json` is untouched again. Still **no npm workspaces**, so `npm ci` with the
committed lockfile remains the single install path and the `@tailwindcss/oxide` hoisting
surface stays closed.

**Status** — all green: `format:check`, `typecheck`, `typecheck:web`, **396 tests in 29
files** (0 skipped, 0 todo), `build`, `build:web`, and 22 desktop checks with 0 errors and
1 warning (the updater placeholder signing key). The boundary suite grew from 19 to 25
tests.

**Deferred, with triggers (ADR-0035 §6 unchanged):** the four declined packages,
`apps/web` + `apps/api`, npm workspaces, and a built package artifact.
