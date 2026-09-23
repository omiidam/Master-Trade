# Product Foundation — handoff

Phases 5.1–5.10 built the Product Foundation of Master Trade: a trading and portfolio intelligence
workstation where **deterministic engines own every number**, **the model owns only explanation**,
and **missing information is named rather than filled**.

This is the handoff document. It states what exists, what was verified and how, what is not done, and
what a next phase may assume. Where a claim is only true in part, the part is named.

---

## 1. Executive summary

|                       |                                                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Verified by**       | 927 hermetic tests (52 files) + 27 rendered-browser tests (1 file) = **954**                                          |
| **Rendered-browser**  | 7 widths × 14 pages = **98 rendered pages**, zero horizontal overflow                                                 |
| **Dependency audit**  | `npm audit` **0**, `npm audit --omit=dev` **0**                                                                       |
| **Live trading**      | Disabled. No operation, tool, job kind or configuration key exists for it, and the flags are typed as literal `false` |
| **Broker execution**  | Disabled, the same way                                                                                                |
| **Public deployment** | **None.** Public-demo validation was not performed, because there is nothing deployed to validate                     |
| **Baseline**          | Machine-readable checkpoint in [`release-baseline.json`](./release-baseline.json)                                     |

One sentence per layer:

- **Input quality (5.3)** classifies declared context, reaches a readiness verdict, and refuses to
  treat stale, conflicting or unverified input as reliable.
- **Portfolio intelligence (5.5)** computes allocation, cost basis, concentration and exposure from
  declared holdings, in pure functions, and names every gap instead of filling it.
- **Decision evaluation (5.6)** records what was decided and reports what the recorded prices say
  happened, with everything unmeasurable stated as such.
- **Capabilities (5.7)** are declared, deny-by-default, and every request walks an eleven-stage plan
  that can refuse at a named stage.
- **Credits (5.4)** are a ledger with idempotent operations; a request refused before execution holds
  no credits at all.
- **Security (5.8)** refuses before it authenticates, and the trading boundary is asserted against the
  source tree rather than only the configuration.
- **The interface (5.10)** is verified as a browser renders it, not as the source describes it.

---

## 2. Implemented phases 5.1–5.9

Classification is deliberately conservative. "Complete" means the phase's stated objective is met and
verified; "complete with limitations" means it is met for the declared scope and a specific, named
capability is absent.

| Phase | Subject                               | Class                         | The limitation, exactly                                                                                                                                                                    | Blocks a next phase?                |
| ----- | ------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| 5.1   | Product foundation & architecture     | **Complete**                  | The web application is a labelled interface prototype (mock fixtures, `Preview · mock data` on screen), which is the declared scope of this phase rather than a gap                        | No                                  |
| 5.2   | User profile & trading context        | **Complete with limitations** | No hard delete or data export surface; `derivedField()` exists as a first-class status but nothing writes one yet; conflict findings are re-derived per read rather than recorded as asked | No — but see TDR-1, TDR-2           |
| 5.3   | Input quality & data reliability      | **Complete**                  | None recorded                                                                                                                                                                              | No                                  |
| 5.4   | Usage credits & premium               | **Complete with limitations** | No payment provider and no billing integration (by instruction for the phase); metering has no durable queue; four priced capabilities are `coming-soon`                                   | No — but see TDR-3                  |
| 5.5   | Portfolio intelligence                | **Complete with limitations** | No market-data provider exists, so prices are declared by the user and never stored (ADR-0046); the model-narrated `portfolio.analysis` remains `coming-soon` at five credits              | No — but see TDR-4                  |
| 5.6   | Portfolio decision evaluation         | **Complete with limitations** | Evaluation depends on recorded prices; without an observation time it returns `INCOMPLETE_OUTCOME_DATA` rather than guessing                                                               | No — but see TDR-4                  |
| 5.7   | Agent capability & module integration | **Complete with limitations** | No hosted provider is registered — the default adapter is offline and scripted — so the AI Workspace stays a labelled prototype; capability runs are audited but not persisted as records  | Yes for "real analysis" — see TDR-5 |
| 5.8   | Security, privacy, compliance & brand | **Complete with limitations** | Seven compliance items require professional review before production (`security-and-privacy.md` §14); no legal conclusion is asserted anywhere                                             | Yes before production — see TDR-6   |
| 5.9   | Testing & quality assurance           | **Complete**                  | Its own recorded weaknesses were source-text assertions, environment-conditional coverage and a single-worker run. Phase 5.10 closed the first; the other two stand and are recorded below | No                                  |

Nothing in Phases 5.1–5.9 is **NOT IMPLEMENTED**, **PARTIALLY COMPLETE** or **BLOCKED** as a phase. The
individual deferrals above are the honest version of that statement, and each has a trigger.

---

## 3. Phase 5.10 verification

Phase 5.10 added one thing to the product and a great deal to its evidence.

**Added:** the browser suite (`tests/browser/`, `vitest.browser.config.ts`, `npm run test:e2e`), and
the handoff artifacts. The suite is described in §14 and decided in
[ADR-0050](./adr/ADR-0050-the-browser-is-driven-not-installed.md).

**Fixed — one real defect, found only by rendering.** The `Tabs` list was a plain flex row with no
wrapping and no overflow handling. Because a tab strip's width is set by its _content_, it became the
widest thing on the page, and on a phone **the document itself scrolled sideways**. Five screens
failed: Memory, Research, Exams, Activity and Settings, by up to 179 px. Twelve pages use `Tabs`. The
fix makes the strip a bounded horizontal scroller on narrow screens rather than a wrapped block,
keeping one row and keeping every tab reachable.

**Fixed — one harness defect that was hiding the above.** The first version of `visit()` waited on
`aria-current="page"`. The sidebar flips that the instant the store changes, but the workspace swaps
children inside `AnimatePresence mode="wait"`, so for the length of the exit animation the previous
page is still in the DOM. The measurement therefore described the page _before_ the one requested,
and five overflowing screens passed. Waiting on the rendered heading is what exposed them.

**Corrected — three of my own measurement rules.** A 1×1 `sr-only` box was being counted as "clipped
text" and, in RTL, as "overflow"; both were probe defects, not product defects, and both were fixed
in the probes while the document-level width check kept guarding the real thing. The hygiene guard
that forbids a committed skip fired on a property named `shell.skip`; the pattern is now anchored on
the forms `vitest` actually honours.

**Not performed, and not claimed:** public-demo validation (§15).

---

## 4. Architecture overview

One repository, one modular monolith (ADR-0002). The dependency direction is enforced by
`tests/monorepo-boundary.test.ts`, which refuses an import of the LLM layer, the agent, the database,
the HTTP server, the realtime hub or a `node:*` builtin from inside `packages/shared`.

```
packages/shared/src     pure domain: models, schemas, contracts, readiness gates, policy
packages/trading-engine pure arithmetic — no network, no clock, no database, no model
src/                    Fastify API, SQLite (node:sqlite) + repository layer, agent, providers,
                        jobs, realtime hub, desktop shell sidecar
web/                    React 19 + Vite interface, built to web/dist
tests/                  hermetic suites (no network, no browser, no build)
tests/browser/          rendered-browser suite (needs web/dist and a browser)
```

The `@shared/*` surface is declared **once** in `config/sharedSurface.ts` and mirrored into both
tsconfigs, the Vite alias and the Vitest alias, so the frontend and backend cannot disagree about
where a boundary module lives.

---

## 5. Critical product flows

| Flow                        | Path                                                                                                         | Verified by                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| **A — User context**        | Profile → trading context → validation → quality → readiness                                                 | `product-flows.test.ts`, `quality-api.test.ts`, `profile.test.ts` |
| **B — Portfolio**           | Context → holdings → quality → engine → structured result                                                    | `product-flows.test.ts`, `portfolio-api.test.ts`                  |
| **C — Decision evaluation** | Context → decision → evidence → readiness → engine → result                                                  | `product-flows.test.ts`, `decisions-api.test.ts`                  |
| **D — Agent capability**    | Request → resolve → validate → quality → readiness → permission → entitlement → engine → provenance → result | `capabilities-api.test.ts`, `capability-orchestration.test.ts`    |
| **E — Memory**              | Input → validation → provenance → trust → retrieval → capability use                                         | `product-flows.test.ts`, `vector-memory.test.ts`                  |

In the browser, flows are exercised as far as this build allows: navigation to all fourteen pages,
the loading state replaced by the application, the shell's safety posture, the safety dialog opened
and closed with a real `Escape`, and the full responsive matrix. Flows that depend on a provider or on
a **login** cannot be driven end-to-end, because neither exists (see §16).

---

## 6. Security boundaries

Full detail in [`security-and-privacy.md`](./security-and-privacy.md). The guarantees that matter to a
next phase:

- **Deny-by-default everywhere.** Operations, tools, capabilities and routes are declared; an
  undeclared id does not exist, with no fuzzy match and no fallback (ADR-0047).
- **Refusal happens before authentication.** Security headers, a loopback-only origin policy that
  _refuses_ a foreign origin rather than merely withholding CORS headers, and a per-client rate limit
  counted before the session lookup (ADR-0048).
- **Errors are relocated, not leaked.** A message this codebase did not author is replaced in the
  response body and kept in the log; the correlation id in both joins them.
- **No direct LLM → privileged execution.** Capability authority is checked before an engine runs,
  and the LLM cannot widen a permission, a plan or a readiness verdict.
- **The trading boundary is asserted against the source tree**, not only the configuration, and
  `liveTradingEnabled` / `brokerExecutionEnabled` are typed as the literal `false`.

---

## 7. Data-quality model

[`input-quality-and-data-reliability.md`](./input-quality-and-data-reliability.md). Dimensions:
completeness, validity, consistency, reliability, freshness, relevance, confidence and provenance.
Verdicts are enumerated rather than scored: `SUFFICIENT`, `PARTIALLY_SUFFICIENT`, `INSUFFICIENT`,
`INVALID`, `STALE`, `CONFLICTING`, `UNVERIFIED`. **No arbitrary numeric score is used**, because a
score without a documented meaning invites a threshold nobody can defend.

The rule that survives every layer above it: _low-quality input produces a lower readiness verdict,
and a higher layer may only narrow that verdict — never widen it._

---

## 8. Agent capability model

[`capability-integration.md`](./capability-integration.md) and
[ADR-0047](./adr/ADR-0047-capabilities-are-declared-and-the-pipeline-is-a-plan.md).

Capabilities are declared with inputs, quality requirements, permissions, entitlements, engines,
output types, risk level, availability and provenance requirements. Eleven pipeline stages are
**data**, and `planCapabilityRun` is a pure function, so a refusal is a _value naming its stage_
rather than a thrown error. Three positions are load-bearing:

- readiness precedes permission — nobody is told they lack authority for something their inputs
  cannot support;
- permission precedes entitlement — authority is not affordability;
- entitlement precedes the engine — **a request refused at any gate holds no credits at all**, not a
  charge followed by a refund.

Availability and readiness are separate axes: `available` / `coming-soon` / `disabled` describes the
build; `READY` / `READY_WITH_LIMITATIONS` / `REQUIRES_CLARIFICATION` / `BLOCKED` / `UNAVAILABLE`
describes this request.

---

## 9. Portfolio intelligence

[`portfolio-intelligence.md`](./portfolio-intelligence.md) and
[ADR-0046](./adr/ADR-0046-the-portfolio-is-declared-and-its-values-are-never-stored.md).

Portfolio arithmetic is pure and lives outside the LLM. Total value, allocation, cost basis,
unrealised P/L, concentration and exposure are computed from declared holdings and declared prices.
**Stored records hold no computed figures** — a value is derived on read from what was declared, so a
stored number can never disagree with the inputs that produced it.

Everything unreliable has a named outcome rather than a substituted value: a missing price, an
unsupported currency, an invalid quantity, stale data, a conflicting input and an unverified holding
each narrow the readiness verdict and appear in the result as a gap.

---

## 10. Decision evaluation

The evaluation engine compares a recorded decision against recorded observations. It distinguishes
realised, unrealised, hypothetical and simulated performance, and returns an explicit
`INCOMPLETE_OUTCOME_DATA` when a price carries no observation time — it never fills a missing value,
and it never ranks a decision as objectively successful on short-term performance.

Neutral language is a requirement, not a preference: no profit promises, no guaranteed outcomes, and
no presentation of hypothetical results as actual performance.

---

## 11. Credits & entitlements

[`usage-credits-and-premium.md`](./usage-credits-and-premium.md). A ledger with idempotent
operations, an operation id per movement, and explicit prevention of negative balances, duplicate
consumption, race-condition overconsumption, untracked change and client-side manipulation. The
frontend is never trusted for a balance, a permission or an entitlement.

Cost is declared once, on the feature, and read from there everywhere. The three shipped deterministic
capabilities cost **zero** — ADR-0041's rule is that a calculation must not stop working because a
balance ran out.

---

## 12. Memory & provenance

[`vector-memory.md`](./vector-memory.md). Every record carries provenance, confidence, freshness and a
verification state, and **unverified memory cannot silently influence a high-impact capability**: a
`high-impact` capability that would cite unverified memory fails the boot check rather than quietly
using it. Model-written entries are forced to `unverified`; `authoritative` requires a human verifier.

---

## 13. Responsive & mobile strategy

Mobile is a first-class target from Phase 5.7 onward. There is **one** responsive implementation — no
separate mobile product. Breakpoints come from the shared system; the navigation rail collapses to
icons below the compact-shell breakpoint while keeping an accessible name on every entry; tables gain
a horizontal alternative; control strips scroll rather than wrap.

Verified in the browser at 7 widths across all 14 pages (§14) for overflow, touch-target size, text
clipping and RTL mirroring. The stated requirements — no horizontal overflow, touch-friendly controls,
readable typography, usable navigation, adaptive grids, dialogs that fit the viewport — are asserted
against measured boxes rather than class lists.

---

## 14. Browser E2E coverage

`npm run test:e2e` → `vitest.browser.config.ts` → `tests/browser/e2e.test.ts` (27 tests), driving a
Chromium-family browser over the DevTools Protocol with **no new dependency**
([ADR-0050](./adr/ADR-0050-the-browser-is-driven-not-installed.md)).

| Area                  | What is asserted                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Boot**              | Title, `application-name`, theme colour, dark colour scheme, viewport meta, the four icon links, manifest, Apple touch icon, OG image |
| **Loading state**     | The boot splash is present in the served HTML and gone from the mounted document                                                      |
| **Landmarks**         | Exactly one `main`, a labelled `Primary` navigation, a skip link whose target exists                                                  |
| **Runtime errors**    | Empty console-error and exception log across all fourteen pages                                                                       |
| **Page rendering**    | All 14 pages render, each titled by the entry that opens it; nav entries and groups match the declared order                          |
| **Responsive matrix** | 7 widths × 14 pages: no document overflow, no element past the edge (offenders named)                                                 |
| **Touch targets**     | Every control ≥ 24×24 CSS px at 430, 390 and 375 (WCAG 2.2 Target Size Minimum)                                                       |
| **RTL**               | No overflow mirrored, at 390, on three pages                                                                                          |
| **Text**              | No non-deliberate clipping at 390 across all pages                                                                                    |
| **Accessibility**     | Every control has an accessible name, every image an `alt` or `aria-hidden`, at 1440 and 390                                          |
| **Keyboard**          | A real `Tab` focuses the skip link and makes it visible; a real `Escape` closes the safety dialog                                     |
| **Brand**             | The mark is decoded by the browser (`naturalWidth > 0`) and never unnamed                                                             |
| **Asset delivery**    | Every brand asset returns 200 and matches its magic bytes; every manifest icon resolves                                               |
| **Manifest**          | `short_name`, `start_url`, `scope`, `standalone`, theme/background colours, 192/512 and a maskable icon                               |
| **Bundle**            | Every hashed `/assets/...` the document requests is served; no `sourceMappingURL` requested                                           |
| **Render substance**  | Screenshot is a PNG at the requested viewport, with an element-count floor                                                            |
| **Posture**           | Trading and broker execution stated as disabled on screen; the preview marker present; the safety dialog repeats the guarantee        |

---

## 15. Production & public-demo status

**There is no public deployment, and this phase did not create one.**

No domain, DNS record, certificate or host was configured in Phases 5.1–5.10, and Phase 5.10 was
instructed not to modify production DNS or infrastructure. `docs/brand-assets.md` already recorded
that there is no public deployment in this phase, and `security-and-privacy.md` records TLS
termination as deferred with its trigger.

What _was_ validated is the **production build artifact**, served over real HTTP to a real browser:
every brand asset returns 200 and is the format it claims, the manifest resolves with all its icons,
the hashed bundle the document requests is served, and no source map is requested. That is
build-artifact validation, and it is not the same claim as "the public site was verified". The
baseline states this explicitly rather than recording a pass.

Before any public surface exists, the deferred items in
[`risks-and-deferred.md`](./risks-and-deferred.md) §6 apply in full: TLS termination, trusted-proxy
placement, audit retention, an incident runbook, and the professional review listed in
`security-and-privacy.md` §14.

---

## 16. Known limitations

Honest, and each one is a place a defect could still pass.

1. **No public demo was validated.** Nothing is deployed. See §15.
2. **No login or session flow exists in the web client.** The shell-token handshake is desktop-only, so
   "login → dashboard" cannot be driven in a browser because there is nothing to log into. This is a
   scope fact, not a broken flow.
3. **The pages render labelled fixtures.** The `empty` and `error` states are demonstrated by
   `InterfaceStatesPanel` but are **not reachable through the UI**, so they are verified at the
   component level and not in the browser. Loading _is_ browser-verified, through the real boot splash.
4. **No pixel-diff visual regression.** The suite measures layout properties, screenshot dimensions and
   a render-substance floor. A colour or type-scale regression that keeps the geometry would pass.
5. **Environment-conditional coverage remains.** The browser suite skips by name when no browser is
   installed; the database, bundle and Tailwind-native checks remain guarded as Phase 5.9 recorded. A
   green run on a bare machine ran fewer tests, and vitest reports those as skipped rather than passing.
6. **`getBoundingClientRect` is not a user.** It cannot see occlusion by a fixed element, a z-index
   mistake, or an unreadable contrast ratio. Contrast is unchanged from the design system and was not
   re-measured here.
7. **No hosted provider is registered**, so no real model output has ever been rendered by this
   interface, and the AI Workspace remains a labelled prototype.

---

## 17. Deferred technical debt

Tracked with ids, severity and triggers in [`technical-debt.md`](./technical-debt.md). The register
holds only real remaining items discovered in Phases 5.1–5.10; normal future enhancements are listed
as roadmap in [`risks-and-deferred.md`](./risks-and-deferred.md) instead of as defects.

---

## 18. Recommended next-phase entry conditions

The Foundation is a **verifiable checkpoint**, not a finished product. A next phase may rely on:

- the `@shared/*` boundary, the readiness gates, the capability pipeline and the credit ledger as
  stable, tested contracts;
- the browser suite as the place where a UI change is proved, with `npm run validate` running it in
  the correct order after `build:web`;
- the trading boundary as a merge gate, not a convention.

Before the Foundation can be shown to anyone outside the project, four things should be true:

1. **A hosted provider is registered**, so the AI Workspace stops being a prototype and capability
   output is rendered from structured results rather than fixtures (TDR-5).
2. **The public-demo surface is created deliberately**, with TLS, trusted-proxy placement, audit
   retention, an incident runbook and clear demo labelling — followed by the validation §15 could not
   perform.
3. **A market-data source with provenance exists**, which is what turns the four `coming-soon`
   capabilities into real ones and lets portfolio and evaluation rest on observed prices (TDR-4).
4. **The professional review in `security-and-privacy.md` §14 completes**, because no test can assert
   a legal conclusion.
