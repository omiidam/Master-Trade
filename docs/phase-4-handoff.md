# Phase 4 — final validation and handoff

- **Phase:** 4.7
- **Scope:** the whole repository as it exists on `main` after Phases 4.1–4.6
- **Method:** inspect, measure, reproduce. Every claim below was produced by a command run
  in this phase; anything not run is named as deferred rather than asserted.
- **Outcome:** Phase 4 is **complete**. One genuine code-level defect was found and fixed
  ([ADR-0040](./adr/ADR-0040-a-refusal-is-reported-before-the-logger-exists.md)). No
  architecture was changed, no test was weakened, skipped or deleted.

## 0. Headline

| Metric                 | Value                                                                  |
| ---------------------- | ---------------------------------------------------------------------- |
| `npm run validate`     | **exit 0**                                                             |
| Tests                  | **433 passed / 433** (30 files, 0 skipped, 0 todo)                     |
| Desktop verification   | **22 checks, 0 errors, 1 warning** (updater placeholder signing key)   |
| Production-scope audit | **0 vulnerabilities** (`npm run audit:prod`)                           |
| Full `npm audit`       | 5 advisories, **all in the dev/test toolchain** — see §7               |
| Clean-install check    | `rm -rf node_modules && npm ci` → **exit 0**, then `validate` → exit 0 |
| Runtime integration    | `/v1/health` → `200`; protected catalogue → typed `401`                |
| Secrets tracked        | **0** (`.env*` and `data/` are gitignored and absent)                  |

> **Superseded after this phase (dependency audit).** The 5 dev-only advisories in the row
> above were resolved by the `vitest` 2 → 4 upgrade: `npm audit` and
> `npm audit --omit=dev` both report **0** now. See
> [dependency-audit.md](./dependency-audit.md) and
> [risks-and-deferred.md](./risks-and-deferred.md) §8. Everything else in this document is
> the state as of Phase 4.7 and is unchanged.

## 1. Phase 4 completion status

| Phase | Objective                                       | Status       | Record                                                                                                                                       |
| ----- | ----------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1   | Monorepo migration assessment, planning only    | **Complete** | [ADR-0035](./adr/ADR-0035-monorepo-migration-staged-boundary-first.md), [monorepo-assessment.md](./monorepo-assessment.md)                   |
| 4.2   | Monorepo foundation, boundary first             | **Complete** | [monorepo.md](./monorepo.md) §7 — `@shared/*` declared, nothing moved                                                                        |
| 4.3   | `packages/shared` extracted (source-only)       | **Complete** | [ADR-0036](./adr/ADR-0036-extract-shared-package-source-only.md)                                                                             |
| 4.4   | Deterministic core extracted; four declined     | **Complete** | [ADR-0037](./adr/ADR-0037-trading-engine-deterministic-core.md)                                                                              |
| 4.5   | Import paths, config and boundary stabilization | **Complete** | [ADR-0038](./adr/ADR-0038-finalized-import-and-package-strategy.md)                                                                          |
| 4.6   | Security, performance and integration audit     | **Complete** | [ADR-0039](./adr/ADR-0039-one-clock-per-authorization-decision.md), [security-and-integration-audit.md](./security-and-integration-audit.md) |
| 4.7   | Final validation and handoff (this phase)       | **Complete** | this document, [ADR-0040](./adr/ADR-0040-a-refusal-is-reported-before-the-logger-exists.md)                                                  |

**Objectives met.** The staged-boundary decision (ADR-0035) was executed exactly as written:
two packages became physical, six did not, and each deferral carries a trigger rather than an
open question. No dependency was added in any Phase 4 commit; the lockfile is intact and
`npm ci` remains the single install path.

**Objectives explicitly deferred, with triggers** — see §7. Nothing in Phase 4 was left
half-done and unrecorded.

**No unrelated changes.** Phase 4.7's diff is confined to the boot-refusal fix, its tests,
and documentation. Reviewed file by file in §8.

## 2. Architecture status

**Verified by test, not by inspection.** `tests/monorepo-boundary.test.ts` (25 tests) and
`tests/technology-lock.test.ts` (7 tests) pass, asserting:

- **Dependency direction is one-way.** Nothing in `src/` imports `web/`, and no frontend file
  reaches into `src/` by relative path.
- **Two physical packages.** `packages/shared` (a closed 22-module set) and
  `packages/trading-engine` (the deterministic core). `packages/{ui,database,ai,market-data}`
  and `apps/{web,api,desktop}` are inert README placeholders with no `package.json`, so npm
  ignores them — asserted, so they cannot silently become packages.
- **`packages/shared` is closed and actually consumed.** Its `exports` equal the declared
  13-entry surface, no module inside it imports outside it, and the backend is a genuine
  second consumer.
- **The trading engine cannot reach the model.** `packages/trading-engine` imports only
  `packages/shared` and itself, with no `node:*` builtin and no `src/{llm,agent,db,server,
realtime,vector,storage}`. The project's rule that risk math must not depend on LLM
  reasoning is a boundary the toolchain refuses, not a convention.
- **No circular dependencies**, and a cross-boundary scan finds **zero** modules imported
  from both `src/` and `web/` — no duplicated logic.
- **No npm workspaces**, deliberately, which keeps the optional-dependency hoisting surface
  closed (§6).

Integration with the existing stack is unchanged and verified: **Tauri** (`src-tauri/`, no
change needed — `web/` and `src-tauri/` never moved), **Vite** (builds and serves),
**Fastify 5** (boots, answers), **SQLite** (migrations and repositories run), **Vitest**
(433 tests), **TypeScript** (both typechecks clean). **Prisma is not used** — the project
chose a generated-migration runner over it in Phase 3.4; that decision stands.

## 3. Security and safety status

Re-verified in this phase against the running artifact and the source. No defect found.

| Control                            | Evidence                                                                                                                                            |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live trading cannot be represented | `liveTradingEnabled`/`brokerExecutionEnabled` typed as the **literal `false`** (`src/config/loader.ts`); a compile error is required to change them |
| Transaction disabled at runtime    | `assertSafeConfig` refuses `true`; `assertNoHardlineOperations` proves no broker operation exists; the orchestrator refuses to start                |
| Loopback-only                      | `assertSafeConfig` requires a loopback host **and** `enforceLoopback === true`. Verified: `MASTER_TRADE_API_HOST=0.0.0.0` → **exit 1**, no bind     |
| Deny-by-default authorization      | Verified live: `curl /v1/jobs` → **`401`** with the typed envelope and a correlation id, refused before any handler runs                            |
| The LLM cannot execute anything    | The model returns tool-call _requests_ only; the orchestrator authorizes each one and one denied or unknown tool blocks the whole turn              |
| No chain-of-thought exposure       | Summaries carrying reasoning, deliberation or self-labelled facts are refused by name, in the adapter and in the parser                             |
| No command execution / no `eval`   | Zero `child_process`, `execSync`, `eval(` or `new Function` in `src/`, `packages/` or `web/src/`                                                    |
| Secret handling                    | `SecretRef`-only configuration; recursive redaction applied when the log record is built; no secret is ever written to the database                 |
| No secrets in the repository       | **0** `.env*` files present or tracked; `.gitignore` covers `.env*`, `data/`, `*.db*`                                                               |
| Unauthenticated privileged events  | The event bus refuses to give an internal event an audience; the client refuses `internal` types independently                                      |
| Production-scope advisories        | `npm run audit:prod` → **0 vulnerabilities**, and it is a CI step                                                                                   |
| Refusals are now audible           | New in this phase: a pre-logger boot refusal writes one structured, redacted record to `stderr` before exiting non-zero (§5)                        |

`npm audit fix --force` was **not** run.

## 4. Validation results

Run against a **clean install** in this phase, in this order:

| #   | Command                                                         | Result                                                     |
| --- | --------------------------------------------------------------- | ---------------------------------------------------------- |
| 1   | `rm -rf node_modules && npm ci`                                 | **exit 0**                                                 |
| 2   | `npm run format:check`                                          | pass                                                       |
| 3   | `npm run typecheck`                                             | pass                                                       |
| 4   | `npm run typecheck:web`                                         | pass                                                       |
| 5   | `npm test` (`vitest run`)                                       | **433 passed / 433**, 30 files, 0 skipped, 0 todo          |
| 6   | `npm run build`                                                 | pass                                                       |
| 7   | `npm run build:web`                                             | pass (24–55 s)                                             |
| 8   | `npm run desktop:verify`                                        | **22 checks, 0 errors, 1 warning**                         |
| 9   | `npm run audit:prod`                                            | **0 vulnerabilities**                                      |
| 10  | `npm run validate` (1–8 chained)                                | **exit 0**                                                 |
| 11  | Runtime: boot `node dist/src/server/start.js`, `GET /v1/health` | **200**, `{ok:true,…,checks:14}`                           |
| 12  | Runtime: `GET /v1/jobs` with no session                         | **401** `UNAUTHENTICATED`, typed envelope + correlation id |
| 13  | Runtime: unsafe host / unsafe flag                              | **exit 1** with a structured refusal on `stderr`           |

**Lint.** There is no `lint` script and no ESLint configuration in this repository. The
project's static analysis is `prettier --check`, `tsc --noEmit` (twice, backend and
frontend), and the test suites. `lint` is therefore **not applicable**, not skipped.

**End-to-end tests.** There is no Playwright/browser E2E suite. `npm run desktop:verify`
covers the desktop contract structurally, and `tests/realtime-ws.test.ts` exercises real
WebSocket upgrades in-process. A browser-level E2E is deferred (§7) — the honest reason is
that no session can yet be issued to a browser.

**The one warning** is the updater placeholder signing key
(`src-tauri/tauri.conf.json` → `updater.pubkey`), a release-time prerequisite, not a code
defect. It is reported as a warning rather than hidden.

## 5. The defect found in this phase

**A boot refusal exited silently.** The preconditions (`assertSafeConfig`, the unsafe-env
refusal, `assertNoHardlineOperations`, `assertApiCatalogue`, `loadInstructions`) run before a
logger can exist, because the logger is built _from_ the configuration being validated.
`startServer()` nonetheless constructed the server outside its `try`, so a refusal
propagated to the module-level guard — whose comment claimed the failure "has already been
logged structurally" — and the operator got nothing:

```
before:  MASTER_TRADE_API_HOST=0.0.0.0 node dist/src/server/start.js   →  exit 1, zero output
after:   { "level":"error", "event":"server.refused", "code":"POLICY_VIOLATION",
           "message":"Refusing to bind 0.0.0.0: the API is loopback-only by design …",
           "details":{"host":"0.0.0.0"} }
```

It fails closed, so this was never a security hole — it is a **diagnosability defect on the
refusal path**, which is the worst place to have one: the operator who just tried to enable
live trading learns nothing. It mattered for this phase specifically because the VPS deploy
path is `npm run api`, where a silent non-start has no lead to follow. `src/db/cli.ts`
already wrote refusals to `stderr`; the server entry point did not.

**Why it survived:** it is only observable in a **separate process**. Every existing test
drove `createServer()` in-process and asserted the throw; `startServer()` had no test at all.
A test that observes the throw cannot observe the silence.

**Fix:** `createServer()` moved inside a `try`; the refusal is reported and re-thrown so the
exit code is unchanged. The reporter is exported with an injectable stream, emits the
logger's own JSON record shape, and runs through the existing `redactString`/`redactValue`
helpers. Two tests were added (the suite went 431 → **433**): one drives `startServer()` with
an unsafe config and asserts the record's event, code, message and `details.violations`; the
other proves a credential-shaped value is redacted out of a refusal record. Full record:
[ADR-0040](./adr/ADR-0040-a-refusal-is-reported-before-the-logger-exists.md).

## 6. VPS compatibility (Ubuntu 24.04, 2 vCPU, 4 GB RAM, 25 GB)

**Verdict: installable and fully validatable on this VPS.** The exact install path below was
executed here, and CI runs the same `npm ci` + `npm run validate` on `ubuntu-latest`.

**Requirements**

| Requirement     | Value                                          | Why                                                                                          |
| --------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Node.js         | **>= 22.5** (`engines.node`), **22 LTS or 24** | `node:sqlite` is the SQLite driver (ADR-0025). CI runs both 22 and 24 lanes                  |
| npm             | 11.x (repo) — any npm honouring `.npmrc`       | `include=optional` must be respected                                                         |
| Rust toolchain  | **not required** to build/validate             | only needed for `npm run desktop:build` (Tauri), which is why the desktop bundle is deferred |
| C/C++ toolchain | **not required**                               | see "native dependencies" below                                                              |
| Disk            | ~700 MB for `node_modules` + `dist`            | comfortable inside 25 GB                                                                     |
| Memory          | 4 GB is ample; builds peak well under 2 GB     | measured on the runs above                                                                   |

**Native dependencies — the good news.** There is **no native build on the production
runtime path**:

- SQLite runs on the **Node built-in** `node:sqlite`, loaded lazily. `better-sqlite3` is
  **absent from `package.json` and from the lockfile** (rejected in Phase 3.4 — no prebuilt
  binary for that ABI and no MSVC toolchain on the authoring host). This is the opposite of
  the `@tailwindcss/oxide` failure this project already hit once.
- The only install-script entries in the lockfile are `esbuild` (build tooling, and
  `build:web` succeeds here even with its postinstall skipped by npm's `allowScripts`
  gating) and `fsevents` (darwin-only, dev).
- `@tailwindcss/oxide` ships its engine as **per-platform optional packages**. Verified in
  the lockfile: `@tailwindcss/oxide-linux-x64-gnu` and `-linux-x64-musl` are present with
  `os: ["linux"]`, `cpu: ["x64"]`, `optional: true`. The repository `.npmrc` sets
  `include=optional` so a host or user-level `omit=optional` cannot silently drop the engine
  again — the exact cause of the earlier VPS failure. `tests/native-engine.test.ts` fails the
  build if the engine is ever missing.

**Install and validation steps (as run)**

```bash
git clone https://github.com/omiidam/Master-Trade && cd Master-Trade
git checkout main

node --version          # must be >= 22.5
npm ci                  # committed lockfile; do NOT pass --omit=optional or --no-optional
npm run validate        # format + both typechecks + 433 tests + both builds + desktop checks
npm run audit:prod      # production-scope security gate
```

To run the API:

```bash
npm run build && npm run api      # http://127.0.0.1:4317
curl http://127.0.0.1:4317/v1/health
curl http://127.0.0.1:4317/v1/health/ready    # reports 'degraded' and names any absent layer
```

**Environment configuration.** All variables use the `MASTER_TRADE_` prefix. There is no
`.env` file in the repository and **none is required** — every value has a safe default. An
**unknown `MASTER_TRADE_*` variable is rejected**, so a typo cannot silently do nothing.

| Variable                              | Default              | Notes                                                                       |
| ------------------------------------- | -------------------- | --------------------------------------------------------------------------- |
| `MASTER_TRADE_API_HOST`               | `127.0.0.1`          | **Must be loopback**; anything else refuses to start                        |
| `MASTER_TRADE_API_PORT`               | `4317`               | 1–65535                                                                     |
| `MASTER_TRADE_LOG_LEVEL`              | `info`               | `debug` \| `info` \| `warn` \| `error`                                      |
| `MASTER_TRADE_DB_FILE`                | OS app-data dir      | Path to the SQLite file                                                     |
| `MASTER_TRADE_SESSION_TTL_MINUTES`    | `480`                | must be > 0                                                                 |
| `MASTER_TRADE_AUDIT_RETENTION_DAYS`   | `365`                | 1–3650                                                                      |
| `MASTER_TRADE_AI_PROVIDER` / `_MODEL` | `scripted` / offline | The offline adapter answers unless a provider is configured                 |
| `MASTER_TRADE_AI_MONTHLY_BUDGET_USD`  | `0`                  | a spent budget blocks a turn before any provider call                       |
| `MASTER_TRADE_AI_KEY_ENV`             | —                    | Names the variable holding the provider key; the key itself is never config |
| `MASTER_TRADE_SHELL_TOKEN_ENV`        | —                    | Set by the desktop shell at launch; unset is a boot **warning**             |

**Six variables are refused when truthy** — they exist so the refusal is explicit rather than
an "unknown variable" error: `MASTER_TRADE_LIVE_TRADING`, `MASTER_TRADE_BROKER_EXECUTION`,
`MASTER_TRADE_ALLOW_SENSITIVE_FILES`, `MASTER_TRADE_ALLOW_ANONYMOUS_LOGIN`,
`MASTER_TRADE_ALLOW_MODEL_TOOL_EXECUTION`, `MASTER_TRADE_REDACT_SECRETS`. Setting any of
them to a truthy value aborts start-up with `POLICY_VIOLATION` and a named variable. There
is no setting that enables live trading — the guarantee is code, not configuration.

## 7. Known limitations, deferred tasks and remaining blockers

**Critical blockers to a _production_ claim: none in the code.** There are, however, items
that mean this is not yet a shippable desktop product, and they are stated rather than
smoothed over.

| #   | Limitation                                                                                                                                                                  | Impact / when it must be resolved                                                                                                                                                                                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-1 | **No compiled desktop bundle.** No Rust toolchain here or in CI, so `cargo build`, `tauri dev`, the keychain round-trip, window timing and code signing are **unexercised** | Blocks the first real end-to-end (window → handshake → agent turn). `desktop:verify` checks the _contract_, and says so                                                                                                                                             |
| B-2 | **No session is issued to a browser.** Sessions are created, hashed and verified, but no login/local-issuance slice hands one to the shell                                  | The Activity page reports `no-session` instead of connecting; the browser realtime path is unproven end-to-end                                                                                                                                                      |
| B-3 | **A WebView cannot present the shell token on a socket upgrade**                                                                                                            | Needs the socket opened from Rust, or a socket-scoped token path onto first-frame auth                                                                                                                                                                              |
| B-4 | ~~**5 dev/test advisories** (`vite`/`vitest`/`esbuild`/`vite-node` chain)~~ **RESOLVED**                                                                                    | Was production scope **0** throughout. Fixed by the scoped `vitest` 2.1.9 → `^4.1.11` upgrade (one devDependency line): the nested duplicate major was deleted rather than patched, and both audits are now **0**. See [dependency-audit.md](./dependency-audit.md) |
| B-5 | **No `pg` driver**, so PostgreSQL production mode cannot actually connect                                                                                                   | Required only when a PostgreSQL instance is deployed; the adapter and `SqlExecutor` boundary already exist                                                                                                                                                          |
| L-1 | Single **1.0 MB** frontend chunk, no code splitting                                                                                                                         | Low impact inside Tauri (local disk). Resolve before any browser deployment                                                                                                                                                                                         |
| L-2 | Repository routes are **prototype-with-mock-data** beyond Activity                                                                                                          | Every mock surface is labelled as such and a test fails the build if a fixture reaches the live store                                                                                                                                                               |
| L-3 | `lesson.complete`, `rule.propose`, `rule.activate` answer an authorized **`501`**                                                                                           | Intentional; readiness reports the missing capability as `degraded` rather than pretending                                                                                                                                                                          |
| L-4 | **No lint step** (no ESLint config)                                                                                                                                         | Prettier + two `tsc` passes + 433 tests are the current static gate                                                                                                                                                                                                 |

**Explicitly deferred with triggers (unchanged from Phase 4.6):** the four declined packages
and `apps/web` + `apps/api` (trigger: a second consumer, independent frontend packaging, or
non-Rust sidecar build steps — ADR-0035 §6); npm workspaces (trigger: the longer backend
specifiers becoming real friction, with a clean Ubuntu install re-verifying the native engine
first); a built `@master-trade/shared`; browser E2E (needs B-2).

## 8. Files changed in this phase

Four files, all justified by §5 and §7:

| File                                                                                                                       | Change                                                                        |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `src/server/start.ts`                                                                                                      | `createServer()` inside a `try`; new exported `reportBootRefusal()`           |
| `src/server/index.ts`                                                                                                      | Export `reportBootRefusal` and its `RefusalSink` type                         |
| `tests/server.test.ts`                                                                                                     | 2 tests: the refusal record, and redaction inside a refusal record (25 → 27)  |
| `docs/adr/ADR-0040-…md`, `docs/adr/README.md`, `docs/phase-4-handoff.md`, `docs/risks-and-deferred.md`, `docs/workflow.md` | The decision, its index entry, this handoff, and the invariant it establishes |

No dependency changed. `package.json` and `package-lock.json` are untouched. No test was
skipped, weakened or deleted. No mock or fake behaviour was introduced. The trading safety
flags are exactly as they were: typed as the literal `false`, and refused by
`assertSafeConfig` if they are ever anything else.

## 9. Recommended Phase 5 starting point

**Phase 5 should begin with the session/issuance slice that unblocks the live path.** It is
the single item that converts built machinery into a working product: issue a session to the
shell (or to a loopback browser in development), so that `/v1/jobs` stops answering `401` and
the Activity page stops reporting `no-session`. Everything downstream of it is already
built — the socket, the event bus, the job queue, the components — and is currently verified
only in-process. This also resolves B-2 and B-3 together.

**Second, and independent of the first: build the shell once on a machine with a Rust
toolchain** (B-1), because four phases of desktop work are policy-verified and never
executed. Until that runs, no desktop claim in this repository is an executed one.

**Third, the most interesting product move:** the deterministic core is now importable as a
unit with no model in the loop (`packages/trading-engine`, enforced by test). A real,
agent-free backtest over historical bars — sample size, win rate, average R, drawdown — is
therefore reachable without touching the safety architecture, and it is the first thing that
would make the Research module's metrics factual instead of `synthetic`.

**Not recommended yet:** the remaining monorepo migration, npm workspaces, or any dependency
major. Each has a recorded trigger and none has fired.

---

**Readiness statement.** Phase 4 is complete and the repository is green on every applicable
check, from a clean install. It is **not** production-ready: B-1 and B-2 are real gaps that
must close before the application can be described as working end-to-end, and both are
recorded here rather than implied away. No critical _code-level_ blocker remains; the
remaining work is unbuilt surface, not unknown defects.
