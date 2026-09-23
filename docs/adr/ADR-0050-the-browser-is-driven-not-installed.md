# ADR-0050 — the browser is driven, not installed

- **Status:** Accepted
- **Decision id:** `DEC-E2E-1-DRIVEN-NOT-INSTALLED`
- **Phase:** 5.10 (Product Foundation Completion, Browser E2E & Handoff)
- **Depends on:** ADR-0035 (`@shared/*` is the frontend/backend boundary), ADR-0047 (nothing
  undeclared exists), ADR-0049 (generated, not drawn). **Supersedes:** nothing. **Closes:** the
  limitation Phase 5.9 recorded against itself in `product-foundation-test-strategy.md` §13.1.

## Context

Phase 5.9 finished with the Product Foundation verified by 921 tests and one limitation written down
rather than papered over:

> **Source assertions are not rendered assertions.** The responsive, brand and state rules are
> checked against the shipped `.tsx`, so a correct class list on an element the browser does not
> receive as expected is invisible here.

That limitation is real and it is load-bearing. A source-text assertion can prove `md:grid-cols-2`
appears in a file. It cannot answer any of the questions the product actually cares about, because
each one is decided by a layout engine:

- does the page scroll sideways on a 390 px phone?
- is that control large enough to hit with a thumb?
- did the logo load, or is it a broken-image box?
- does this screen render at all, or is it a blank rectangle behind a thrown error?

The obvious fix is a browser automation framework. That is exactly what Phases 5.1–5.9 spent their
effort refusing, and the refusal is not stylistic: this repository carries
`tests/dependency-graph.test.ts`, whose entire purpose is to fail if a second, vulnerable toolchain
reappears in the dev dependency graph. That guard exists because five advisories once lived in a
duplicated nested `vite`, and it was only found by someone remembering to re-audit. Adding
Playwright — a package plus a ~150 MB browser download — to assert `scrollWidth` would be trading a
real invariant for a heavy new one, and would make the suite unrunnable on a machine that has Chrome
but no network.

Two facts made the heavy answer unnecessary:

1. **Chrome speaks a documented JSON protocol over a WebSocket.** Launch it with
   `--remote-debugging-port`, ask `/json/list` for a page target, and drive it with `Page.navigate`,
   `Runtime.evaluate`, `Emulation.setDeviceMetricsOverride`, `Input.dispatchKeyEvent` and
   `Page.captureScreenshot`. No library is involved.
2. **Node 22+ ships a built-in `WebSocket` client.** So the transport is a global, not a package.

## Decision

**The browser suite drives whatever Chromium-family browser the host already has, over the DevTools
Protocol, with no new dependency.** The driver is `tests/browser/driver.ts`; the suite is
`tests/browser/e2e.test.ts`, run by `vitest.browser.config.ts` via `npm run test:e2e`.

Six choices inside that decision are the ones that matter:

1. **The built application is served, not the dev server.** `web/dist` over a loopback
   `node:http` fixture. This is what production ships, so the suite exercises the hashed asset
   names, the manifest and the favicon as a browser receives them, and there is no watcher, no HMR
   and no cold transform between the assertion and the thing asserted. The server confines
   resolution to its root: a fixture that can read `../../etc/passwd` is a bad example to leave
   lying around.

2. **The suite is excluded from the hermetic run.** `vitest.config.ts` excludes `tests/browser`, and
   `tests/test-hygiene.test.ts` asserts that exclusion holds. Without it the broad `tests` include
   would collect the browser suite, and `npm test` would quietly come to require a build and an
   installed browser — green locally after a build, red on a clean clone.

3. **Every wait is a bounded poll against a condition, never a settle delay.** The rule the rest of
   the suite is held to applies here too. This is not pedantry: the first version synchronised on
   `aria-current="page"` and missed a real defect because of it.

4. **A page switch is awaited on the rendered heading.** The sidebar flips `aria-current` the instant
   the store changes, but the workspace swaps children inside `AnimatePresence mode="wait"` — so for
   the length of the exit animation the _previous_ page is still what is in the DOM. A measurement
   taken on `aria-current` describes the page before the one requested. Waiting on the header text
   is what turned five silently-passing screens into five failing ones.

5. **Probes report the offender, not the symptom.** `scrollWidth > clientWidth` says a page
   overflows; it does not say what overflowed, and "the page overflows" is unfixable. The probe
   returns the offending elements widest-first, which is how the actual cause was found — a tab
   strip that could not wrap, on five screens.

6. **A missing browser is a named skip, never a failure.** It is a property of the machine, not a
   defect in the code. `MASTER_TRADE_E2E_BROWSER` overrides the search for CI.

## Consequences

- **What is now verified that was not.** 27 browser tests, including a 7 width × 14 page matrix
  (98 rendered pages) asserting zero horizontal overflow, measured touch-target sizes against the
  WCAG 2.2 minimum, accessible names and image alternatives, text clipping, RTL mirroring, real
  keyboard focus including `:focus-visible` and `Escape` on a dialog, live HTTP delivery of every
  brand asset with magic-byte format checks, a manifest a browser could install from, the hashed
  bundle a browser actually requests, and the product posture as the user reads it on screen.

- **What it cost.** ~250 lines of driver to maintain, and the protocol surface it uses is now a
  dependency of the suite in every sense except the lockfile. Chrome's CDP is stable and versioned,
  but it is not a stable public API in the way a test framework is.

- **What it still cannot see.** The pages render labelled fixtures, so the `empty` and `error` states
  are not reachable through the UI and are not exercised here; they remain covered at the component
  level. There is no pixel-diff infrastructure, so "visual regression" means measured layout
  properties, screenshot dimensions and an element-count floor rather than image comparison. And
  the suite renders the build, so it verifies the layout the build produces — not the layout of a
  hypothetical future page.

- **The alternative was measured, not assumed.** Playwright would have given a richer API and
  cross-browser coverage. It was rejected on the dependency invariant this repository maintains
  deliberately, and because the questions this phase needed answered are answered by `getBoundingClientRect`.
