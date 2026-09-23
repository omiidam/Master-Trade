# ADR-0052 — one process machine, two implementations

- **Status:** Accepted
- **Decision id:** `DEC-DESKTOP-7-PROCESS-SUPERVISION`
- **Phase:** 6.2 (Local Runtime & API Process Management)
- **Depends on:** ADR-0001 (Tauri over Electron), ADR-0029 (WebView capability boundary), ADR-0030
  (sidecar supervision), ADR-0051 (the shell hosts and the domain decides).

## Context

Phase 6.1 left the shell able to start the API and unable to do anything else with it. It spawned the
child, polled `/v1/health` once, showed the window and forgot the process. Four problems, one of them
a false statement in the source:

1. **A crash was invisible.** Nothing watched the child. An API that died an hour into a session left
   the interface reporting `ready` for the rest of it — the same class of false positive Phase 6.1 §12
   forbids, applied to a live process.
2. **Readiness had no honest vocabulary.** `sidecarState` was four strings. A crash mid-restart could
   only be reported as `starting` (a failure presented as progress) or `failed` (false while a restart
   is still in flight).
3. **The graceful stop was a comment, not code.** `stop_sidecar` called `Child::kill()` — an
   unconditional `SIGKILL` on Unix — under a comment claiming SQLite would close through its own
   shutdown path. WAL makes that survivable; it does not make the comment true.
4. **The child's stdout was piped and never read.** `Stdio::piped()` with no reader fills the pipe
   buffer, at which point the API blocks writing its own log line. A hang nobody would connect to
   logging.

The hard part is not any one fix. It is that the supervisor has to exist **twice**: once in Rust,
where it runs, and once where it can be tested — and this environment has no Rust toolchain, so the
running copy cannot be executed, compiled or even type-checked here.

## Decision

**The process states and policy are a shared contract; both implementations refer to it, and the
verifier holds them together.**

1. `packages/shared/src/desktop/process.ts` declares the nine states, the legal transitions, the
   `SupervisorStatus` report, the five user-facing states and every deadline in `PROCESS_POLICY`.
2. `src-tauri/src/sidecar.rs` mirrors the state list (`STATES`), the policy constants and the report
   shape (`DesktopReport`), and implements the supervisor — spawn, drain both pipes, probe, watch
   with `try_wait`, recover with bounded backoff, stop gracefully then forcibly.
3. `src/desktop/sidecar.ts` implements the same machine in TypeScript against an injected spawn port,
   and `src/desktop/child-process.ts` is one real `node:child_process` implementation of that port.
4. `npm run desktop:verify` compares the two: `process-state.agreement`, `process.policy-agreement`
   and `protocol.agreement` fail the build if either description drifts. `process.single-spawner`
   (Rust) and `process.single-spawner.typescript` confine process creation to one file per layer.
5. Readiness is one predicate — process running **and** health answered **and** the answer came from
   this launch's credential — and `isProcessReady` is the only thing a caller should trust for it.

## Alternatives rejected and why

**Let the Rust supervisor be the only implementation, and test it by inspection.** The cheapest
option, and it leaves every behaviour in this phase asserted by reading source text: that a graceful
signal is delivered, that a crash is recovered, that output is redacted, that no orphan survives.
Those are exactly the claims a text assertion cannot support. Rejected: a phase whose subject is
process reliability cannot verify itself by counting characters.

**Write the supervisor once in Rust and drive it from a Rust integration test.** Correct in principle
— and impossible here, because there is no toolchain. Rejected as unavailable rather than as wrong;
TDR-13 records it as the real gap that remains.

**Let the two implementations own their own states.** Simplest to write, and it is what caused
problem 2: two accounts of the same process that can disagree. A status card reporting a state the
shell never had is indistinguishable from a bug in the shell. Rejected.

**Bend the Rust test into a "parity" check by copying the state names into the test.** Then the test
asserts that two literals written in the same file are equal. Rejected: the check must read the Rust
source, so that changing one side alone is what fails.

**Add a `libc` dependency for `SIGTERM`.** This one was _accepted_, narrowly, and it is the only new
dependency in the phase. `std` cannot send `SIGTERM`: `Child::kill` is `SIGKILL` on Unix and
`TerminateProcess` elsewhere. There is no `std`-only way to ask a process to leave, and the phase
requires asking first. It is a Unix-only target dependency.

## Consequences

- **The states cannot drift.** Adding a state in TypeScript and not in Rust fails `desktop:verify`;
  so does changing a deadline on one side.
- **The Rust supervisor's runtime behaviour is still unproven here.** The parity checks compare
  descriptions; they do not execute the Rust copy. This is stated in the verifier's own
  `unverifiable` list and as TDR-13, in the same spirit that a green report must never be read as
  "the app was built and launched".
- **Two implementations to change together.** Bounded by the parity checks — the failure mode is a
  red check, which is the point — and cheaper than one implementation nobody can test.
- **Windows keeps `TerminateProcess`.** A real `SIGTERM` is sent on Unix (proven by a real child
  running its own handler in `tests/desktop-runtime.test.ts`); Windows cannot deliver one, so the
  API there may need WAL recovery. Recorded as TDR-12 rather than papered over.
- **The report is a report.** `SupervisorStatus` carries no path, port, signal or command, so the
  same shape crosses the IPC boundary safely; `shell_status` returns it as `runtime` (protocol v2).
- **A browser is `idle`**, which every screen renders as `unavailable`. A preview never shows a
  progress indicator for a process it is not starting.
