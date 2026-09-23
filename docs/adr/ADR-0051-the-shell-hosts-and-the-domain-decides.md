# ADR-0051 — the shell hosts and the domain decides

- **Status:** Accepted
- **Decision id:** `DEC-DESKTOP-6-RUNTIME-AND-STARTUP`
- **Phase:** 6.1 (Tauri Foundation & Desktop Architecture)
- **Depends on:** ADR-0001 (Tauri over Electron), ADR-0029 (WebView capability boundary),
  ADR-0030 (sidecar supervision), ADR-0031 (app-data config and keychain), ADR-0035
  (`@shared/*` is the frontend/backend boundary), ADR-0048 (refuse before authenticating).

## Context

Phase 6.1 arrives at a desktop shell that already works. Earlier phases built the Rust host, the
capability grant, the command surface, the sidecar launch plan, the config store, the verifier and
the lifecycle machine. The phase's job was therefore not to build a foundation but to align one, and
aligning is where three specific problems were found.

**Two modules answered "is this the desktop shell?" differently, and both were right by their own
reading.** The IPC contract (`packages/shared/src/desktop/ipc.ts`) accepts either the legacy
`__TAURI__` global or Tauri 2's `__TAURI_INTERNALS__`, because a WebView exposing either one is
genuinely the shell. The frontend bridge (`web/src/desktop/bridge.ts`) tested only
`__TAURI_INTERNALS__`. So a WebView with the legacy global was the shell to one half of the codebase
and a browser to the other — the kind of disagreement that presents as "the keychain silently
does nothing on one machine", which is a bug nobody files.

**A second lifecycle model was tempting, and wrong.** `src/desktop/lifecycle.ts` owns a nine-state
machine that sequences window visibility against API liveness. That machine is about the shell
process, it lives in `src/` where the frontend may not import it, and its states describe internals
rather than what a user is owed. The interface still needs an answer to "is this ready, and if not,
why?" — and Phase 6.1 §11 requires that foundation to exist _before_ Phase 6.2's supervisor needs to
report into it. Writing a second machine with its own transitions would have created two accounts of
the same truth, free to disagree.

**The shell had no name for which environment it was in.** Development, test and production differ in
what they permit — a placeholder update key stops a development build from shipping and stops a
release from existing. Nothing in the repository recorded which one a given run was, so the
distinction was carried in the operator's head.

## Decision

**The shell hosts and the domain decides.** Concretely, four choices:

1. **One predicate, one wrapper.** `@shared/desktop/runtime` owns
   `detectRuntime` / `isDesktopRuntime` / `currentRuntime`, and delegates to the single predicate in
   the IPC contract. No component tests a global by hand; components ask. The two modules agree by
   construction, and a test asserts that agreement for each shape of target — including by
   installing fake globals and calling the production code path.

2. **The startup state is a narrowing, not a second machine.** `@shared/desktop/startup` maps the
   shell's _own report_ (`ShellStatus`, which already crosses the boundary) into the five states a
   screen branches on: `STARTING`, `READY`, `STOPPING`, `STOPPED`, `ERROR`. It starts, stops and
   supervises nothing. Two rules inside it are the reason it exists:

   - it **never reports `READY` over a failed initialisation** — `sidecarState: 'ready'` with a
     missing _required_ capability is `ERROR`, named; an optional capability stays optional;
   - a **failure outranks a shutdown**, because a user asking to quit is not evidence that the
     application started.

   A browser is `STOPPED`, never `STARTING`: there is no shell process to wait for, and a spinner
   that never resolves is the wrong answer to a question that has already been answered. A failed
   status call is `ERROR` for the same reason.

3. **Environment modes are declared, refused when unrecognised, and load-bearing.**
   `MASTER_TRADE_ENVIRONMENT` is `development` (the default), `test`, or `production`. An
   unrecognised value is refused rather than coerced, and a production run must _declare_ itself:
   relying on a default would make the process's mode depend on whether someone remembered to export
   a variable. The mode then changes what `desktop:verify` requires — a placeholder update signing
   key is a **warning in development and an error in production**, and a debug `.invalid` update
   endpoint is refused in production. A mode can make an assurance stricter; it can never make a
   safeguard looser.

4. **No business logic crosses into the shell, and no Tauri API is required to run the web
   product.** The shell keeps only host concerns. Detection selects _which host implementation_ to
   use, never a different path through the domain, and `invoke` is resolved lazily so a browser
   bundle never needs the Tauri package to exist.

## Consequences

- **A real defect is closed and guarded.** The legacy-global disagreement is fixed, and
  `tests/desktop-foundation.test.ts` asserts the contract and the bridge reach the same verdict for
  no globals, internals only, the legacy global only, and both.

- **Two accounts of the same truth cannot diverge.** `desktopStartupState()` is pure and derives
  from the shell's report, so the interface cannot claim a state the shell is not in. Phase 6.2's
  supervisor reports into the shell's machine and the UI keeps rendering from the same function.

- **The mode does something.** A green `desktop:verify` now names the mode it verified as, and the
  release blockers are severity-dependent, so nobody can read a development pass as a release pass.

- **What it cost.** Two new shared modules and their registration on four mirrors
  (`config/sharedSurface.ts`, both tsconfigs, `packages/shared/package.json`) — the boundary test
  refuses a declared module nothing imports, which is what keeps that list honest. The interface
  gains fields on one hook and changes no visual behaviour.

- **What it deliberately did not do.** No process supervisor, no database or file lifecycle, no
  keychain workflow, no installer or updater, no hardening pass, no visual redesign. The `updater`
  block in `tauri.conf.json` remains a declared placeholder whose endpoint cannot resolve; Phase 6.1
  made that fact an error in production and did not implement updating.
