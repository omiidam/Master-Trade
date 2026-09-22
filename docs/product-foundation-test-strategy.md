# Product foundation test strategy

Phase 5.9. How the suite that covers Phases 5.1–5.8 is structured, what it proves, what it does
not, and how a regression is caught before it reaches the deployment.

Parts of this document are marked deliberately, because a test document that claims more than the
suite delivers is worse than no document:

- **Verified** — asserted by a test that fails if the property changes.
- **Partially verified** — asserted under a condition (a native driver, a built artifact), so it is
  skipped where that condition is absent.
- **Known limitation** — not asserted, with the reason.
- **Future coverage** — a gap this phase did not close.

---

## 1. Running it

```bash
npm run validate     # format:check → typecheck → typecheck:web → test → build → build:web → desktop:verify
npm test             # the suite alone
npm run audit:prod   # production dependency audit
```

`validate` is the gate. It is the same sequence a release must pass, and `tests/test-hygiene.test.ts`
asserts that it still contains every one of those steps — so a step cannot be dropped from the
entry point while the individual scripts remain.

**Verified at the end of Phase 5.9:** 51 suites, 921 tests, all passing; run twice in full and the
timing-sensitive subset three more times, with no flakes observed.

---

## 2. Testing architecture

Seven layers, each in `tests/`, each with a different reason to exist. The layering is deliberate:
a domain rule and the route that exposes it are checked by different suites, so a change to one
cannot satisfy both by accident.

| Layer                          | What it holds                                                                                                                                          | Representative suites                                                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Domain and engine**          | Pure arithmetic, schema validation and classification. No network, no clock, no database handle.                                                       | `portfolio.test.ts` (47), `quality.test.ts` (41), `profile.test.ts` (33), `usage.test.ts` (44), `capabilities.test.ts` (50), `evaluation.test.ts` |
| **Boundary invariants**        | Structural rules that no feature may break: import direction, the deterministic core, the declared shared surface.                                     | `monorepo-boundary.test.ts` (25), `architecture.test.ts` (17), `technology-lock.test.ts`, `dependency-graph.test.ts`, `safety.test.ts`            |
| **Repository and persistence** | Real SQLite — migrations, ownership, versions, transactions, tombstones, isolation.                                                                    | `database.test.ts` (34), `repositories.test.ts`, `jobs-persistence.test.ts`                                                                       |
| **API**                        | The real Fastify instance over a real migrated database through `inject`. Status codes, contract shapes, error shapes, correlation ids, authorization. | `portfolio-api.test.ts`, `usage-api.test.ts` (33), `capabilities-api.test.ts`, `quality-api.test.ts` (19), `server.test.ts` (27)                  |
| **End-to-end product flows**   | The joins between phases, in the order a user reaches them.                                                                                            | `product-flows.test.ts` (30)                                                                                                                      |
| **Frontend source contracts**  | The shipped `.tsx` read as text: what a surface may compute, claim, expose and lay out.                                                                | `frontend-responsive.test.ts` (21), `frontend-evaluation.test.ts` (20), `frontend-journal.test.ts` (33), `frontend-modules.test.ts` (26)          |
| **Security and deployment**    | The transport boundary, redaction, the trading boundary, and what the deployment depends on.                                                           | `security.test.ts` (26), `production-readiness.test.ts` (19), `test-hygiene.test.ts` (10), `brand.test.ts` (19)                                   |

Two conventions carry across all of them:

1. **The subject is never a parameter.** Profile, quality, portfolio, decision and usage routes take
   no user id in a path, a query or a body. Isolation is therefore structural rather than checked,
   and each suite proves it with two sessions seeing their own state.
2. **A refusal is a value.** A blocked capability, an insufficient input set and an unevaluable
   record are all returned as structured fields naming the rule that decided the outcome, so a test
   asserts the rule rather than the wording.

---

## 3. Critical flows

`tests/product-flows.test.ts` is the phase's centrepiece: it walks the five flows through the real
routes and asserts the _seam_ between phases, which no single-phase suite can see.

### Flow A — user context → validation → quality → readiness

- A complete declaration is `SUFFICIENT` / `READY_FOR_ANALYSIS`, and the assessment is computed from
  the version stored, not from the body sent.
- An incomplete one is `PARTIALLY_SUFFICIENT` / `READY_WITH_LIMITATIONS`, and the assumptions the
  answer _would_ rest on are declared with `permitted: false` rather than silently made.
- A capability that needs the inputs (`portfolio.composition`) is `INSUFFICIENT` /
  `REQUIRES_CLARIFICATION` with structured questions.
- A risk/horizon tension classifies `CONFLICTING` on the risk scope, with `risk-horizon-tension`
  named, and asks which declaration is current.
- An impossible document is refused `400 VALIDATION_FAILED` **before** storage, and the version does
  not advance.
- **The same gate**: the verdict the quality route reports equals the verdict the agent turn stops
  on, rule for rule (`classification`, `readiness`, `decidedBy`).

### Flow B — portfolio declaration → engine → structured result

- Value, cost basis and unrealised P/L come from the engine; a mixed document is grouped by currency
  rather than summed.
- An unpriced position yields `incomplete-valuation` and `price-missing` findings and contributes
  nothing — no zero is substituted for a missing price.
- Concentration escalates by the declared band (`elevated`) and carries its metrics and sources.
- A negative quantity is refused at the route, and nothing is stored.
- A stale price is reported against the freshness policy while still being valued.
- A second account reads `declared: false` and a `null` total, not a zeroed set.

### Flow C — decision → readiness → evaluation → report

- A decision with both ends recorded evaluates to a report with computed figures and
  `outcome: 'realised'`, and the reading is never _worse_ than `READY_WITH_LIMITATIONS` without
  naming the rule (`decidedBy`) that limited it.
- Half an outcome is `INCOMPLETE_OUTCOME_DATA` with `report: null` and **no evaluation row**.
- A hypothetical with no observable outcome refuses with a reason and is never presented as
  realised performance.
- A role that may evaluate another's decision still cannot read it: the write is `403` and the read
  is `404`, so isolation cannot leak existence.

### Flow D — request → capability → gates → structured result

- An undeclared capability is refused at **resolution**, deny-by-default, with no engine run.
- A declared-but-unbuilt capability reports `UNAVAILABLE` / `coming-soon` and asks for nothing:
  availability outranks a missing input.
- A role without the route's operation never reaches the pipeline at all (`403`), so the strongest
  claim holds — no model, no engine, no capability result.
- An available capability runs, and every calculation names the engine that produced it.
- A capability whose inputs are absent is `REQUIRES_CLARIFICATION` with an `answer-question` action.
- **A refused turn leaves the ledger where it found it**: `charged: false`, `credits: 0`, the balance
  unchanged, the movements for that attempt summing to zero, and no settled consumption.

### Flow E — memory → provenance → trust → context

- A record is `unverified` unless a human verified it, and the repository refuses a model write
  claiming `verified`.
- `promoteTrust` allows any lowering, requires a non-model verifier to raise, and reserves
  `authoritative` for a human.
- The **recall path** labels an unverified record as `uncertainty`, and the rendered prompt carries
  `[UNCERTAINTY]`, `trust=unverified` and its provenance; the same record is not returned at all
  under a `verified` trust floor.
- One account cannot read another's memory.
- Every `high-impact` capability declares `cite-verified-only` and a provenance requirement, and no
  capability is permitted to cite unverified memory.

---

## 4. Security testing

`tests/security.test.ts` covers the transport boundary; `production-readiness.test.ts` covers the
deployment posture; `safety.test.ts` and `capability` suites cover agent authority.

| Property                                                                                           | Where                                                              |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Security headers applied to failures as well as successes                                          | `security.test.ts`                                                 |
| A foreign origin is refused, not merely denied CORS headers                                        | `security.test.ts`                                                 |
| Loopback-only origin allow-list, echoed exactly, never `*`                                         | `security.test.ts`, `production-readiness.test.ts`                 |
| Per-client rate limit counted before authentication, bounded bucket table, `429` + `Retry-After`   | `security.test.ts`                                                 |
| An unvouched error message replaced in the body and kept in the log                                | `security.test.ts`                                                 |
| Log redaction; no field value reaches a log line                                                   | `security.test.ts`, `quality-api.test.ts`, `portfolio-api.test.ts` |
| Path-traversal refusal and file-ownership checks                                                   | `security.test.ts`                                                 |
| No credential shape in any response body or the source tree                                        | `security.test.ts`, `production-readiness.test.ts`                 |
| Deny-by-default authorization, every route                                                         | `architecture.test.ts`, per-feature API suites                     |
| `liveTradingEnabled === false`, `brokerExecutionEnabled === false`, in the **type** and every mode | `production-readiness.test.ts`, `safety.test.ts`                   |
| No operation matches the hardline pattern; the category is asserted, not restated                  | `production-readiness.test.ts`                                     |
| No capability declares an order, broker or execution                                               | `capabilities.test.ts`, `product-flows.test.ts`                    |
| No direct LLM → privileged tool execution                                                          | `safety.test.ts`, `ai-integration.test.ts`, `architecture.test.ts` |
| Websocket authorization and refusal of an invalid session                                          | `realtime-hub.test.ts`, `realtime-ws.test.ts`                      |

**Known limitation.** The rate limiter, the origin refusal and the header set are asserted through
`inject` against the real server, not against a real socket and a real proxy. A misconfigured
reverse proxy in front of the deployment is outside what a test can see.

---

## 5. Data-quality testing

Quality is a _deterministic_ classification, and the suite treats it as one: no assertion depends on
model output, and the model is never consulted in any of these paths.

- `quality.test.ts` covers the eight dimensions, the representation rules (what an assessment may
  reproduce and what it must withhold), per-field validation, and the classification precedence
  (`INVALID` outranks `CONFLICTING`, which outranks absence, which outranks staleness).
- `product-flows.test.ts` covers the four readiness outcomes end to end, plus staleness and
  conflict, and proves the route's verdict equals the agent's.
- `portfolio.test.ts` separates a **stale** price from an **undated** one and from an **unverified**
  one, which are three different refusals.
- `capabilities.test.ts` asserts a `high-impact` capability cannot cite unverified memory.
- `quality-api.test.ts` proves a blocked input set means **no model is consulted at all**, so "the
  LLM cannot override deterministic validation" holds for the reason there is no inference to argue
  with.

**Verified:** missing, invalid, contradictory, stale and unverified inputs each produce their own
named state, and a missing value is never defaulted.

---

## 6. Responsive and mobile testing

`tests/frontend-responsive.test.ts` asserts the responsive contract for all fourteen pages and the
shell, from the source, under the same rules the two earlier per-surface suites use:

- one shared frame (`<Workspace>`) for every page, capped with `max-w-` rather than fixed;
- every grid starts at one column and widens at a breakpoint; no screen starts at three;
- every table with a minimum width sits inside its own `overflow-x-auto` container;
- the shell's content column carries `min-w-0`, so a wide child scrolls rather than stretching the
  flex parent;
- the rail collapses below the compact query regardless of the saved preference, and the collapse
  control is not rendered where there is nothing to collapse to;
- the brand mark is decorative by default and labelled exactly where it is the only name;
- no click handler on a bare `div`, so every control is keyboard-reachable;
- every page reaches a shared state component, and every page that reads a domain store renders
  loading, empty and error states chosen from a status rather than guessed from a length.

**Fixed pixel widths are an allow-list, not a pattern.** Eleven fixed widths remain in the tree
(eight decorative, four inside scrolling tables), each listed in the suite with the reason it cannot
push the page. A _new_ fixed width anywhere fails, so the cost of adding one is deciding whether it
is legitimate.

**Three real defects were found and fixed by this suite**, all the same class — a three-column stat
row with no narrow-screen layout, so a two-word label wrapped mid-phrase on a phone:

| File                                               | Was           | Now                          |
| -------------------------------------------------- | ------------- | ---------------------------- |
| `web/src/components/exams/ExamCard.tsx`            | `grid-cols-3` | `grid-cols-1 sm:grid-cols-3` |
| `web/src/components/realtime/ConnectionStatus.tsx` | `grid-cols-3` | `grid-cols-1 sm:grid-cols-3` |
| `web/src/components/research/ResearchCard.tsx`     | `grid-cols-3` | `grid-cols-1 sm:grid-cols-3` |

**Known limitation.** These are source assertions, not rendered ones. They prove the classes that
govern layout are correct; they cannot prove a specific engine's line-breaking or a real device's
viewport behaviour. One grid of skeleton bars (`journal/LoadingState.tsx`) is explicitly exempted,
and the exemption is itself asserted to contain nothing but placeholders — so a content grid cannot
hide behind it.

---

## 7. Regression strategy

Three kinds of guard, each aimed at a regression that a feature test would not catch.

1. **Boundary invariants** (`monorepo-boundary.test.ts`, `architecture.test.ts`,
   `technology-lock.test.ts`). Import direction, the deterministic core holding no clock or network,
   the declared shared surface across its mirrors, and the pinned architecture decisions. A
   capability that claims a module without needing it fails at boot
   (`assertCapabilityCatalogue`).
2. **Allow-list guards.** Fixed pixel widths, the placeholder-surface exemption, and the wait shapes
   in the suite itself are each an explicit list. Adding a new instance fails, which forces a
   decision rather than permitting a drift.
3. **Dependency invariants** (§9) and **deployment invariants** (§10), which assert the conditions a
   release depends on rather than the code in isolation.

`tests/test-hygiene.test.ts` turns the audit's findings into rules: no focused test, a skip only as
a documented environment guard, every gate still present in `validate`, no retry that would hide a
flake, and no `--force` or `|| true` in the scripts.

---

## 8. Flaky-test strategy

**The rule:** a wait is allowed in exactly three shapes, and the replacement for all three is an
explicit condition.

| Shape                                                  | Why it is acceptable                                                                          | Guarded by             |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ---------------------- |
| Inside a handler simulating work                       | It _is_ the work being scheduled, and the assertion is about what the queue does with it.     | `test-hygiene.test.ts` |
| Inside an injected `sleep`/`settle` helper             | The bound belongs to the caller, and the default is documented.                               | `test-hygiene.test.ts` |
| Inside a loop bounded by a `deadline` it polls against | It polls a condition and returns as soon as it holds; the bound only limits the failure case. | `test-hygiene.test.ts` |

**Two genuine timing assumptions were found and removed**, without weakening an assertion:

- `jobs.test.ts` — cancelling a running job waited 5 ms for the handler to start. Now the handler
  signals that it has started, and the test waits for that signal.
- `jobs.test.ts` — "still running at the drain deadline" relied on a 50 ms handler outlasting a 1 ms
  deadline. Now the handler blocks on a promise the test releases _after_ the assertion, so the
  property holds by construction rather than by being slower than a constant.

`realtime-ws.test.ts` was already correct: `waitForClose` polls a condition against a deadline, and
the one fixed settle is confined to negative assertions ("this does _not_ arrive"), where a bound is
unavoidable and is documented in the helper.

**Timeout budget, not a relaxed bar.** `vitest.config.ts` raises `testTimeout`/`hookTimeout` to 30 s
because the stated target is a 2-core VPS where a ~800 ms suite was measured at 6628 ms. No
assertion is relaxed: a test that hangs still fails, later.

**Verification.** The full suite was run twice and the timing-sensitive subset
(`jobs`, `realtime-ws`, `product-flows`, `portfolio-api`, `usage-api` — 106 tests) three times, with
no flakes observed. **Partially verified:** flake absence over five runs is evidence, not proof; a
load-dependent failure could still appear on a slower runner.

---

## 9. Dependency invariants

- `tests/dependency-graph.test.ts` asserts the dev toolchain stays deduped and patched: no second
  nested major of a build tool, and a resolvable, patched version of each advisory's package. This
  is the standing guard put in place when the five dev-toolchain advisories were cleared by
  deleting the nested `vite` major — a dependency bump that reintroduces one fails the suite.
- `tests/monorepo-boundary.test.ts` asserts the shared package is physical and the four mirrors of
  the shared surface cannot drift.
- `npm audit` and `npm audit --omit=dev` both report **0 vulnerabilities**.
  **Verified at the end of Phase 5.9.** `npm audit fix --force` is never run, and the scripts are
  asserted to contain no `--force` and no `|| true`.
- **Known limitation.** These are offline invariants over the lockfile and the resolved tree. They
  cannot see a newly published advisory against a version already pinned; only a live `npm audit`
  can, which is why it is a release step rather than a test.

---

## 10. Production validation

`tests/production-readiness.test.ts` covers what the deployment depends on, all offline and all about
configuration and files on disk.

| Property                                     | Assertion                                                                                                                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The safety posture is not a setting          | `false` in the type and the default profile; every mode resolves false; no `live` mode exists; no operation matches the hardline pattern                                                    |
| Exposure is deliberate                       | the default host is `127.0.0.1`, `enforceLoopback` is on, and every default origin is loopback                                                                                              |
| The proxy has a fixed socket path            | the event stream is served at `/ws`, so the client never needs the internal host or port                                                                                                    |
| Liveness works without a database            | `200` anonymous, envelope stamped, `x-api-version` present, `Cache-Control: no-store`                                                                                                       |
| Readiness tells the truth                    | `degraded` with no database, check detail withheld from an anonymous caller                                                                                                                 |
| No credential shape in a health body         | asserted against both endpoints                                                                                                                                                             |
| No server route is load-bearing              | no router, no `history` API and no `location.pathname` anywhere in the UI, so the static host needs no `try_files` fallback and cannot 404 on a deep link                                   |
| Root mount and loopback dev servers          | no `base` override, `outDir: 'dist'`, dev/preview bound to `127.0.0.1` with `strictPort`                                                                                                    |
| The desktop shell uses the same bundle       | `frontendDist: ../web/dist`, `devUrl` on loopback                                                                                                                                           |
| Every asset a browser is told to fetch ships | each root-absolute `href`/`src` resolves on disk, with no `http://` anywhere for mixed content                                                                                              |
| The manifest is installable                  | name, short name, root scope and start URL, `standalone`, theme colour matching the first paint, an `any` 192 and 512 and a `maskable` 512, each icon present with a size matching its name |
| The built bundle resolves its own assets     | every hashed `/assets/…` reference exists in `web/dist`                                                                                                                                     |

**Partially verified.** The bundle check is guarded by the artifact's presence, on the same
convention the database suites use for the native driver: `build:web` runs _after_ the tests inside
`validate`, so on a clean checkout the bundle is absent and the test is reported as **skipped**
rather than passing quietly. It ran and passed in this phase's verification.

**Not modified and not asserted here:** DNS, TLS termination, the reverse-proxy configuration and
the deployment host. Phase 5.9 explicitly does not touch production infrastructure.

---

## 11. Coverage and gap analysis

Counted by suite and by area. Coverage is not chased as a percentage: the areas below are ordered by
what a defect there would cost.

| Area                                 | Suites                                                                        | What is verified                                                                                                                                                                                      | Status                                                                                                           |
| ------------------------------------ | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Permissions and authorization**    | `architecture`, `safety`, `security`, per-feature API                         | Deny-by-default per route; operation grants by role; no hardline operation; approval gating; two-session isolation                                                                                    | Verified                                                                                                         |
| **Agent orchestration**              | `capabilities`, `product-flows`, `ai-integration`, `workflow`                 | Registry resolution, the eleven-stage pipeline as data, every refusal naming its stage, the structured result, safe failure                                                                           | Verified                                                                                                         |
| **Portfolio engine**                 | `portfolio`, `portfolio-api`, `product-flows`                                 | Value, weights, concentration bands, cost basis, P/L, gaps, currency grouping, freshness, rounding                                                                                                    | Verified                                                                                                         |
| **Evaluation engine**                | `evaluation`, `product-flows`, `capabilities-api`                             | Expected vs actual, drawdown, outcome kinds, `INCOMPLETE_OUTCOME_DATA`, append-only attempts that store no figures                                                                                    | Partially verified — `evaluation.test.ts` holds one test; the depth is in `product-flows` and `capabilities-api` |
| **Credits and entitlements**         | `usage`, `usage-api`, `product-flows`                                         | Plan catalogue, entitlement resolution, allocation/consume/refund, idempotency, concurrent consumption, insufficient balance, administrative adjustment under approval, a blocked turn left uncharged | Verified                                                                                                         |
| **Input quality**                    | `quality`, `quality-api`, `product-flows`                                     | Eight dimensions, classification precedence, the readiness gate, the registry, redaction, route-equals-agent                                                                                          | Verified                                                                                                         |
| **User profile and trading context** | `profile`, `quality-api`, `frontend-profile`                                  | Schema, derived status, contradictions vs questions, append-only versions, deny-by-default, completion                                                                                                | Verified                                                                                                         |
| **Memory and provenance**            | `repositories`, `data`, `product-flows`, `ai-integration`, `frontend-modules` | Trust stored with a verifier, no model promotion, tombstone, recall labelling, prompt rendering, isolation                                                                                            | Verified                                                                                                         |
| **Database and persistence**         | `database`, `repositories`, `jobs-persistence`                                | Migrations, ownership, dialects, DDL, entity lookups, restart persistence, idempotent writes                                                                                                          | Verified                                                                                                         |
| **API contracts and errors**         | Every `*-api` suite, `server`, `architecture`                                 | Schema validation, response and error shape, correlation ids, deterministic status codes, safe messages                                                                                               | Verified                                                                                                         |
| **Realtime and jobs**                | `realtime-*` (4), `jobs`, `jobs-persistence`, `platform`                      | Connect, refusal of an invalid session, subscribe, limits, shutdown, job lifecycle, retry, dead-letter, cancellation, drain, lease reclaim                                                            | Verified                                                                                                         |
| **Security**                         | `security`, `production-readiness`, `safety`                                  | Headers, origin refusal, rate limiting, error and log redaction, traversal, ownership, trading boundary asserted against the source                                                                   | Verified                                                                                                         |
| **Responsive and mobile**            | `frontend-responsive`, `frontend-shell`, per-surface frontend suites          | One frame, mobile-first grids, scroll containers, the fixed-width allow-list, state coverage, no bare-div handlers                                                                                    | Verified (source-level; see §6)                                                                                  |
| **Branding**                         | `brand`, `production-readiness`                                               | One generated source, the crop box measured, every referenced file present, identity documents, favicon/manifest/PWA metadata                                                                         | Verified                                                                                                         |
| **Desktop shell**                    | `desktop-shell`, `native-engine`                                              | IPC contract, capability boundary, sidecar supervision, local config                                                                                                                                  | Partially verified — `native-engine` is skipped without the Tailwind oxide binary                                |

**Future coverage** (deliberately not in this phase):

- **Rendered-layout testing.** A real browser at 390 / 834 / 1440 px would catch what source
  assertions cannot. This is the single largest gap and needs a browser dependency this phase was
  told not to add.
- **A live `npm audit` in CI**, as distinct from the offline lockfile invariants.
- **Load and contention testing** of the rate limiter and the WebSocket hub at the limits asserted,
  rather than just below them.
- **Provider-behaviour testing** against a hosted model, which the AI Gateway deliberately does not
  depend on.
- **Migration rollback**, which the migration registry does not currently express.

---

## 12. Test performance

Measured on the development machine, warm, over 51 suites:

| Measurement               | Value                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| Wall clock, full suite    | 106–115 s                                                                                          |
| Module import / transform | 37–42 s                                                                                            |
| Test bodies               | 28–32 s                                                                                            |
| Slowest suites            | `capabilities-api` 4.9 s, `server` 4.2 s, `profile` 3.5 s, `product-flows` 2.8 s, `security` 2.3 s |

Import time dominates. That is the cost of booting a real Fastify instance, a real SQLite file and a
real WebSocket session per suite — which is the point of the API layer, and not something to trade
away for a lower number. **No setup was changed to improve the timing**, and no assertion was
weakened for speed.

**One measurement worth noting:** the same suite measured 104.5 s at the start of the phase (47
suites) and 106.4 s at the end (51 suites, 80 more tests), so the four new suites cost roughly
nothing per test — they read files and pure functions rather than booting infrastructure.

---

## 13. Known limitations

Stated plainly, because each one is a place where a real defect could still pass:

1. **Source assertions are not rendered assertions.** The responsive, brand and state rules are
   checked against the shipped `.tsx`, so a correct class list on an element the browser does not
   receive as expected is invisible here.
2. **Conditional coverage.** The database suites, the bundle check and the Tailwind oxide check are
   each guarded by their environment. A green run on a machine without the native driver means
   fewer tests ran, and vitest reports those as skipped rather than passing.
3. **No real network, by design.** Provider adapters are tested against a fetch double, so a change
   in a provider's actual response would not be caught until integration.
4. **A single worker and no contention.** The suite does not run under the CPU contention the
   timeout budget exists for, so the budget is reasoned about rather than measured in place.
5. **Legal and compliance items remain unverified.** §14 of `security-and-privacy.md` lists what
   needs professional review; no test can assert a legal conclusion.
