# ADR-0056 — the API must be the build the shell shipped

- **Status:** Accepted
- **Decision id:** `DEC-DESKTOP-11-HANDSHAKE`
- **Phase:** 6.6 (Desktop Hardening, Release QA & Build-Version Handshake)
- **Depends on:** ADR-0051 (the shell hosts and the domain decides), ADR-0052 (one process machine,
  two implementations), ADR-0055 (a release is refused, not warned about).

## Context

Phase 6.5 gave the application one version. `package.json` is the source, three mirrors must agree
with it, and `version.agreement` fails when they do not. That makes a single _tree_ internally
consistent. It does not make a running _application_ consistent, because two programs are running:
the shell, whose version comes from `tauri.conf.json` and `Cargo.toml`, and the bundled API, whose
version comes from the compiled `DEFAULT_CONFIG.version` and is reported at `GET /v1/health`.

Those two were built together, so they were assumed to agree. Every way that assumption can be
false is a silent failure:

1. **A release built from a stale `dist/`.** The installer is named `0.6.0` and the API inside it
   reports `0.5.0`. The updater compares the wrong number — it either reinstalls what is present or
   decides a newer build is already there — and the health endpoint, which is the one place a user,
   a bug report or a support conversation can read the running version from, answers with a build
   that is not installed.
2. **An API left behind by an earlier install.** The window is built against one tree and every
   request is served by another. The protocol version has not changed, so nothing else notices, and
   a schema change between the two builds is read by the wrong reader.
3. **A development tree running `dist/` from before the current edit.** Every symptom is an
   inexplicable 404 or a missing field, and the version is the only evidence that exists.

Readiness already had two clauses — the process is running, and health passes (ADR-0052). Both are
true of a stale API. The third clause was missing, and the existing supervisor had no seam for it.

## Decision

**Readiness requires the API to report the shell's own version, and a disagreement refuses the
start.**

1. **One rule, in one module.** `src/desktop/handshake.ts` owns the four results —
   `VERSION_OK`, `VERSION_MISMATCH`, `VERSION_UNAVAILABLE`, `VERSION_CHECK_FAILED` — the pure
   decision (`decideHandshake`), the authenticated probe and the refusal. The state list is mirrored
   in `sidecar.rs` and `handshake.state-agreement` compares the two.

2. **The check runs after health and before `ready`.** Asking a process that is not listening would
   fail for the wrong reason. The supervisor asks through one optional port (`verifyVersion`), so
   the decision is testable without an HTTP server and `handshake.readiness-gate.typescript` /
   `.rust` assert that both halves actually apply it rather than merely define it.

3. **Equality, not "compatible enough".** Both artifacts come from one tree and one version source,
   and Phase 6.5 makes that source machine-checked, so any difference means the bundle mixes two
   builds. A tolerance — a patch-level allowance, say — would be a rule that _cannot_ be checked
   against what the bundle was meant to contain, which is the class of rule this phase removes.
   Normalization is shared with the updater: a leading `v` is dropped, a missing minor or patch is
   padded, build metadata is ignored, and a pre-release sorts below its release, so `1.0.0-rc1`
   never satisfies a stable shell.

4. **A mismatch is an error, not a warning.** `VERSION_MISMATCH` moves the process report to `error`
   naming both versions, and the interface renders `ERROR`. Reporting a warning beside a `ready` the
   application cannot honour would defeat the check: every query would be answered by another
   build's code and the interface would present it as normal.

5. **The four states stay distinct.** "The API answered without a version" is a fact about the API;
   "we could not ask" is a fact about the check. Collapsing them would file a broken probe under a
   missing field, and the two have different fixes.

## Consequences

- **A stale bundle can no longer masquerade as a working one.** The three failure modes above end in
  `error` with both versions named, on the first launch, before any request is served.
- **A development tree is held to the same rule.** There is no development-only relaxation: a
  `dist/` that predates the source is exactly the case this catches, and catching it locally is
  cheaper than catching it in a release.
- **The browser is unaffected.** A page has no shell to ask, so `desktopStartupState` reports
  `STOPPED` for `web` before any of this is relevant; nothing here runs outside the shell.
- **A mismatched API is now a start failure**, so a bug that would previously have degraded into
  confusing 404s becomes a refusal with a reason. That is a deliberately louder failure.
- **The Rust half is described, not compiled** (TDR-13). The parity checks prove both halves write
  the same rule; the decision itself is executed by the TypeScript supervisor against real child
  processes, and the packaged app's enforcement of it is a claim about the source rather than about
  a built binary.

The full sequence, the failure table, the evidence matrix and the validations this environment
cannot perform are in [desktop-release-qa.md](../desktop-release-qa.md).
