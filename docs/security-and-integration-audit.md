# Phase 4.6 — Security, performance and integration audit

- **Phase:** 4.6
- **Scope:** the Monorepo foundation and all Phase 1–4.5 work, as it actually exists on `main`
- **Method:** inspect, measure, reproduce. Every finding below carries the command or file
  that produced it. Nothing is reported as verified that was not run in this phase.
- **Outcome:** one real defect found and fixed ([ADR-0039](./adr/ADR-0039-one-clock-per-authorization-decision.md));
  baseline was 5 failing tests, now **431/431 passing** (430 pre-existing plus the regression
  test added for the defect).

## 1. Headline

The repository was not in the state the validation baseline claimed. `npm run validate`
exited non-zero with **5 failing tests**, all in `tests/realtime-ws.test.ts`, and they had
been treated as an environment limitation across several phases. They were not: they were
one missing function argument, and they masked a clock inconsistency that would affect any
non-wall clock, not just a test.

| Metric | Before | After |
| ------------------ | ------- | ----------- || Test files | 29/30 | **30/30** |
| Tests | 425/430 | **431/431** |
| `npm run validate` | exit 1 | exit 0 |

## 2. Findings

Severity is judged by impact on correctness, safety and verification integrity — not by how
much code a fix touches.

| Id | Severity | Finding | Action |
| --- | ------------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------- || F-1 | **High** (verification) / Medium (runtime) | Two clocks per authorization decision; suite is wall-clock dependent | **Fixed** |
| F-7 | Info | Default boot is loopback-only with no shell token, and warns about it | No action |
| F-2 | Medium | The same defect inside the test suite's own expiry assertion | **Fixed** |
| F-3 | Low | 5 dev-only dependency advisories (Vite/Vitest/esbuild chain) | Deferred, justified |
| F-4 | Low | Single 1.0 MB frontend JS chunk; no code splitting | Recommended |
| F-5 | Info | PostgreSQL adapter present with no driver dependency installed | By design |
| F-6 | Info | `better-sqlite3` absent: SQLite runs on the Node built-in, so no native build on the VPS | Positive |

### F-1 — Two clocks per authorization decision (fixed)

**Evidence.** `SessionService` is clock-injectable and always passes it
(`src/auth/sessions.ts:118`); the realtime hub called the gate without one
(`src/realtime/hub.ts:278`, `requireOperation(principal, 'realtime.connect')`), and the
gate's signature defaulted the clock to the wall clock
(`packages/shared/src/auth/model.ts`, `now: number = Date.now()`). Executed directly:

```
real UTC now:                    Sun Sep 20 18:58:10 UTC 2026
session expiresAt (fixed clock): 2026-09-20T17:00:00.000Z   -> expired by wall clock
requireOperation(owner, "realtime.connect") -> { allowed: false, reason: "Session expired." }
```

**Impact.** The realtime suite passed before `17:00 UTC` and failed after it, on identical
code. A failure that moves with the clock reads as flakiness, so it invites re-running
instead of investigation — the ideal place for a real regression to hide. Beyond tests, any
clock that is not the wall clock (simulation, time-travel mode, skewed host) makes one
layer accept a principal the next rejects.

**Fix.** `now` is now **required** on `isSessionActive`, `authorize`, `requireOperation` and
`guardRoute`; every caller passes the clock it owns (realtime hub → connection clock; job
queue → the clock it stamps jobs with; `JobService` → optional `now`; HTTP layer → request
clock). See [ADR-0039](./adr/ADR-0039-one-clock-per-authorization-decision.md).

**Verification.** Making the parameter required turned the defect into a compile error and
named all five call sites at once. Reverting the single argument in `src/realtime/hub.ts`
reproduces **all six** original failure signatures verbatim — `expected [] to have a length
of 1 but got +0`, `Cannot read properties of undefined (reading 'principalId')`,
`expected undefined to be 'u_owner'`, the 5000 ms timeout, `expected [] to deeply equal
[ 2, 3 ]`, and `expected 4001 to be 1001` — and restoring it makes every one pass. The
causal link is proven, not inferred.

A regression test now pins it with a clock **years in the past**, so the assertion cannot
decay with the calendar: a session long expired by the wall clock must still authenticate.

### F-2 — The same defect in the test suite (fixed)

`tests/architecture.test.ts` built sessions from `Date.now()` and relied on the defaulted
clock, so its "rejects expired sessions" case changed meaning depending on the hour. Both
the session instant and the judged instant are now a fixed `NOW`, and the test additionally
asserts the session is accepted one second _earlier_ — pinning that the caller's clock
decides.

### F-3 — Dev-scope dependency advisories (**resolved**)

As recorded at the time of this audit:

```
npm run audit:prod   -> found 0 vulnerabilities
npm audit            -> 5 vulnerabilities (3 moderate, 1 high, 1 critical)
```

All five sat in the **development** chain — `vite` nested under `vitest`/`vite-node`,
depending on a vulnerable `esbuild`. Production scope was clean, and the production
dependency list is 13 packages, all pure JavaScript. There was no non-breaking remedy: the
fix was a Vitest **major** upgrade, which the phase rules forbade without documented
justification. Deferred and recorded, and recommended as its own phase with the suite as
the acceptance test — which is what eventually happened.

**Resolved:** `vitest` 2.1.9 → `^4.1.11`. It removes the nested duplicate major outright
(15 packages deleted, `vite-node` gone, one deduped `vite@6.4.3`), and **both** `npm audit`
and `npm audit --omit=dev` now report 0. Applied on top of `d873ba0`; accepted on a
held-constant delta because the tree carried unrelated unfinished work. Full record:
[dependency-audit.md](./dependency-audit.md).

### F-4 — One 1.0 MB frontend chunk (recommended)

```
web/dist/assets/index-*.js      1,007,351 bytes   (4.1 MB source map)
web/dist/assets/index-*.css        40,028 bytes
```

`vite.config.ts` declares no `manualChunks` and the pages are imported eagerly, so the
initial payload carries every surface (Academy, Exams, Journal, Research, Trading Lab, AI
Workspace) plus the icon set. This is _low_ severity for a desktop application loading from
local disk over the Tauri asset protocol, and it is explicitly not worth a speculative
refactor in an audit phase. The recommended change is route-level `React.lazy` for the page
components behind the existing loading surface, plus a vendor chunk — measurable and
reversible. Recorded as deferred work rather than silently optimised.

### F-5 / F-6 — Two properties worth recording

- **PostgreSQL is an adapter, not a dependency.** `src/db/postgres.ts` calls
  `this.client.query(...)` on an **injected** client and imports no driver, so production
  mode exists structurally while the driver remains a deliberate non-dependency. The claim
  "SQLite-first, PostgreSQL-compatible" therefore remains true without shipping `pg`.
- **No native module is on the production path.** `better-sqlite3` is not a dependency at
  all; the SQLite layer uses `node:sqlite`, loaded lazily so a runtime without it reports
  honestly instead of crashing at import. This is why `engines.node` is `>=22.5`, and it
  removes the native-rebuild risk entirely on a VPS — a meaningful contrast with the
  `@tailwindcss/oxide` failure this project previously hit, which `.npmrc` (`include=optional`)
  and `tests/native-engine.test.ts` now guard.

## 3. Security findings

**No security defect was found.** The controls below were verified by reading the code that
enforces them, not by trusting documentation.

| Control                        | Evidence                                                                                                                                                                                                                                                          | Result                                           |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Trading disabled, structurally | `liveTradingEnabled` / `brokerExecutionEnabled` typed as the literal `false` (`packages/shared/src/types.ts`); `assertSafeConfig` rejects `true` (`src/core/config.ts:232`); the orchestrator refuses to start if either is set (`src/agent/orchestrator.ts:122`) | **Pass** — unrepresentable, not merely unchecked |
| Remote access                  | `host: '127.0.0.1'`, `enforceLoopback: true`, and `assertSafeConfig` **requires** `enforceLoopback === true` (`src/core/config.ts:229`)                                                                                                                           | **Pass**                                         |
| Deny-by-default                | Role grants are an allow-list; `authorize` denies an ungranted operation; a tool that declares no capability can never be authorised (`src/agent/orchestrator.ts:226`)                                                                                            | **Pass**                                         |
| LLM cannot execute tools       | The model only _returns_ tool-call requests; the orchestrator authorises and runs them, and one unknown or denied tool **blocks the whole turn** (`src/agent/orchestrator.ts:137-201`, covered by `tests/ai-integration.test.ts`)                                 | **Pass**                                         |
| No chain-of-thought surfaced   | Summaries that smuggle reasoning, deliberation or a self-labelled fact are refused (`tests/ai-integration.test.ts`)                                                                                                                                               | **Pass**                                         |
| Secret redaction               | Central `redactString`/`redactValue` with `SENSITIVE_KEY` matching, applied when the log record is built (`packages/shared/src/core/logging.ts:40-47,155-159`)                                                                                                    | **Pass**                                         |
| Secret storage                 | Zero `.env*` files present or tracked; `.gitignore` covers `.env`/`.env.*`; config holds an `env:` **reference**, resolved at use                                                                                                                                 | **Pass**                                         |
| Shell token comparison         | `constantTimeEquals`; a configured-but-unresolvable secret **refuses** rather than downgrading (`src/server/access.ts:79-90`)                                                                                                                                     | **Pass**                                         |
| SQL injection                  | All values bound as parameters (`?` + spread params; pg `query(text, values)`); identifiers are validated against the entity's declared columns and throw if unknown (`src/db/table.ts:55-60`)                                                                    | **Pass**                                         |
| Command execution / injection  | No `child_process`, `eval` or `new Function` anywhere in `src/`. Every `.exec(` hit is a regex or an internal `db.exec` pragma                                                                                                                                    | **Pass**                                         |
| Path traversal                 | No user-input-derived filesystem path in `src/`; the only `path.join` calls are Zod issue-path arrays                                                                                                                                                             | **Pass**                                         |
| WebSocket hardening            | Loopback + shell token via the same `assertAllowed` as HTTP; `maxPayload` 16 KB; auth deadline; heartbeat; idle timeout; inbound/outbound rate limits; `maxConnections: 8` (`src/realtime/ws.ts`, `src/realtime/hub.ts`)                                          | **Pass**                                         |
| Unbounded resources            | Replay history is buffer-capped (`events.ts:194`); every job declares a small `maxAttempts` (2–4) and a `timeoutMs`                                                                                                                                               | **Pass**                                         |
| Frontend frame parsing         | `parseServerFrame(raw, maxBytes = 256 * 1024)` bounds what the client will even parse (`web/src/realtime/client.ts:714`)                                                                                                                                          | **Pass**                                         |

### Security decision recorded this phase

Authorization now takes an explicit instant (ADR-0039). This has a security dimension as
well as a determinism one: previously, whether a _valid_ session was honoured depended on
the wall clock, so a freshly authenticated principal could be refused on a host whose clock
had drifted. An authorization outcome that depends on which clock is consulted is not a
property the system should have.

## 4. Performance and resource findings

Target: 2 vCPU, 4 GB RAM, 25 GB storage.

| Area             | Finding                                                                                                             | Verdict     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- | ----------- |
| Process model    | One Fastify process, one Vitest run, no Redis, no broker, no sidecar in the request path                            | Fits easily |
| Native builds    | None on the production path (`node:sqlite`) — no compiler needed on the VPS                                         | Fits        |
| Storage          | SQLite file plus a 5.0 MB frontend bundle; 25 GB is not a constraint                                                | Fits        |
| Bounded work     | Realtime history capped; max 8 socket connections; job retries 2–4 with explicit timeouts                           | Fits        |
| Duplication      | No duplicated domain logic found; the whole cross-boundary scan found zero modules shared between `src/` and `web/` | Clean       |
| Idle cost        | 15 s heartbeat per socket, capped at 8 sockets — negligible                                                         | Clean       |
| Frontend payload | 1.0 MB single chunk (F-4) — the one measurable efficiency item, and low impact under Tauri                          | Recommended |

No premature optimisation was applied. Nothing here justifies new infrastructure.

## 5. Integration results

| Boundary                    | Result                                                                                                                                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend → shared           | `@shared/*` alias only; a package-boundary suite (25 tests) refuses other specifiers, and the frontend is asserted not to import backend paths, Node builtins, browser storage or `fetch` |
| Frontend → API              | Typed `ApiClient` with `ApiError`, versioned path prefix (`web/src/api/client.ts`); framework-free `RealtimeClient` with injected `SocketLike`/`SocketFactory`                            |
| API → database              | One `SqlExecutor` interface with SQLite and PostgreSQL dialects behind it; no SQL in business logic                                                                                       |
| API → AI                    | Orchestrator authorises and executes tools; the gateway only proposes. Provider fallback and budget exhaustion covered by tests                                                           |
| Realtime → jobs             | `JobService` attaches exactly one status observer that publishes to the bus, so there is a single path from "something changed" to "the client was told"                                  |
| Error handling / validation | Typed error envelope, Zod validation, correlation ids, and provenance strips on every analytic surface                                                                                    |     | Broker execution / live trading | Absent by construction — no operation id matches `/(broker | execute | live)/i`, asserted by `tests/architecture.test.ts` |

### Runtime probes against the built output

Integration claims were checked against a running server, not only against tests:

```
$ MASTER_TRADE_API_PORT=5199 MASTER_TRADE_DB_FILE=/tmp/p46/audit.sqlite node dist/src/server/start.js
GET /v1/health -> 200 {"ok":true,"data":{"status":"ok","version":"0.6.0","uptimeMs":2977,"checks":14},...}
GET /v1/jobs   -> 401 {"ok":false,"error":{"code":"UNAUTHENTICATED","message":"Authentication required."},
                        "correlationId":"mt_cmua6z9re12luxm9"}
```

Both the success and the refusal leave through the same typed envelope with a correlation id,
and the unauthenticated catalogue route is refused **before** any handler runs.

### F-7 — Boot warnings are honest, not silent (informational)

Starting with defaults logs two warnings rather than failing quietly:

- _"No shell token is configured: any local process that can reach the loopback port may call
  the API. The desktop shell sets one at launch."_ The default posture is loopback-only with
  no token; the desktop shell supplies one. The warning names the residual risk instead of
  hiding it.
- _"File storage root `data/files` is relative; the desktop build will point it at the OS
  app-data directory."_

No action required. Recorded because a security audit should distinguish "safe by default"
from "open by default but loud about it" — this is the latter, deliberately.

## 6. Validation results

All commands were run in this phase on the working tree.

| Command                  | Result                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------- |
| `npm run validate`       | **exit 0** (chains everything below)                                                    |
| `npm run format:check`   | pass                                                                                    |
| `npm run typecheck`      | pass (backend + packages, including the new required-clock signatures)                  |
| `npm run typecheck:web`  | pass                                                                                    |
| `npx vitest run`         | **431 passed / 431**, 30 files                                                          |
| `npm run build`          | pass (`tsc -p tsconfig.build.json`)                                                     |
| `npm run build:web`      | pass                                                                                    |
| `npm run desktop:verify` | 0 errors, 1 warning (updater signing key is a placeholder until release signing exists) |
| `npm run audit:prod`     | 0 vulnerabilities                                                                       |
| Package boundaries       | 25 boundary + 7 technology-lock + 3 native-engine tests pass                            |

No test was deleted, skipped, weakened or rewritten to reach this result. The only test
changes were (a) supplying the explicit clock the new signature requires, (b) adding a
regression test for the defect, and (c) strengthening the expiry assertion to also pin the
clock-relative behaviour.

## 7. Remaining risks and deferred work

1. **Dev dependency advisories (F-3).** Deferred; requires a Vitest/Vite major upgrade.
   The 430-test suite is the acceptance criterion for that change.
2. **Frontend code splitting (F-4).** Recommended, not urgent under Tauri.
3. **No driver for production PostgreSQL.** The adapter and interface exist; `pg` is not
   installed. Deliberate: installing a driver with no deployed database would be dead weight.
4. **Realtime sessions.** No session is issued to a browser yet, so catalogue routes return
   a typed 401 and the Activity surface stays on fixtures. This is the documented
   limitation, not a defect.
5. **Rust toolchain absent in this environment**, so the desktop chain remains
   policy-verified (`desktop:verify`) rather than compiled here.
6. **`npm` gates install scripts behind `allowScripts` on this host**, so esbuild's
   postinstall was skipped. Harmless for `build:web` and the sidecar bundle, but a release
   build should be produced on a host without that gate.

## 8. Recommended next step

The **dependency modernization pass** recommended here has since been completed: `vitest`
2.1.9 → `^4.1.11`, one scoped change with the suite and both builds as the acceptance test,
re-audited to 0. See [dependency-audit.md](./dependency-audit.md) §4 and
[risks-and-deferred.md](./risks-and-deferred.md) §8.

The more interesting follow-up is suggested by this audit's own method: the clock defect
survived multiple phases precisely because nothing asserted that the _runtime_ behaviour
matches the _documented_ one. A small conformance suite that boots the built API and probes
its real responses — the same way this audit did by hand — would turn several manual checks
in this document into automated ones.
