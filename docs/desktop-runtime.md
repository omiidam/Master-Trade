# Desktop local runtime

How the desktop app starts, watches, restarts and stops the bundled Master Trade API — and what the
interface is told while it does. Phase 6.2. See also
[`desktop-architecture.md`](./desktop-architecture.md) (the shell boundary) and
[`adr/ADR-0052-one-process-machine-two-implementations.md`](./adr/ADR-0052-one-process-machine-two-implementations.md).

## 1. What this replaces

Before Phase 6.2 the shell spawned the API, polled `/v1/health` once, showed the window and then
**never looked at the process again**. Three consequences, all of them real:

- an API that died an hour into a session left the interface reporting `ready` for the rest of it;
- readiness was a four-value string (`stopped | starting | ready | failed`), so a crash mid-restart
  had no honest state — a status card could say "starting" about a failure or "failed" about a
  recovery under way;
- the shutdown path called `Child::kill()`, which is `SIGKILL` on Unix, while the comment above it
  claimed a graceful stop — and the child's stdout was piped but never read, so the API would block
  once its own log output filled the pipe buffer.

Phase 6.2 fixes all four. The states are now one shared vocabulary; the process is watched;
termination asks before it insists; and both pipes are drained.

## 2. Process architecture

```text
   ┌──────────────────────────────────────────────────────────────┐
   │  Tauri shell (Rust)          src-tauri/src/                  │
   │    lib.rs          window, single instance, exit path        │
   │    sidecar.rs      plan · spawn · health · supervise · stop  │
   │    commands.rs     shell_status → RuntimeReport              │
   └───────────────┬──────────────────────────────────────────────┘
                   │ spawns and owns (no WebView capability to do so)
   ┌───────────────▼──────────────────────────────────────────────┐
   │  Master Trade API — one external binary, one loopback port   │
   │    127.0.0.1:4317  ·  per-launch token in its environment    │
   └───────────────▲──────────────────────────────────────────────┘
                   │ polled: GET /v1/health with Bearer <token>
   ┌───────────────┴──────────────────────────────────────────────┐
   │  React UI                                                    │
   │    useShellStatus  → startup.ts → STARTING/READY/…           │
   │    Topbar, Settings — what is running, said out loud          │
   └──────────────────────────────────────────────────────────────┘
```

**The supervisor is a model with two implementations.** `src-tauri/src/sidecar.rs` is the one that
actually spawns and watches. `src/desktop/sidecar.ts` is the same policy expressed in TypeScript,
where it can be tested; `src/desktop/child-process.ts` is a real `node:child_process` port so those
tests exercise an actual child. `npm run desktop:verify` compares the two: `process-state.agreement`
fails if the Rust state list and `PROCESS_STATES` differ, `process.policy-agreement` fails if any
deadline differs, and `protocol.agreement` keeps the shell protocol number honest. That is what
"mirrored" means here — a description that cannot silently drift from the other one.

## 3. Lifecycle state machine

Nine states, declared once in `packages/shared/src/desktop/process.ts`, mirrored literally in
`sidecar.rs` as `STATES`.

| State             | Means                                        | Reachable from                         |
| ----------------- | -------------------------------------------- | -------------------------------------- |
| `idle`            | nothing launched yet                         | start of a launch                      |
| `starting`        | the child exists                             | `idle`, `stopped`, `restarting`        |
| `health-checking` | probing `/v1/health`                         | `starting`                             |
| `ready`           | running **and** health answered              | `health-checking` only                 |
| `stopping`        | a stop has been asked for                    | `ready`, `starting`, `crashed`, …      |
| `stopped`         | the child is gone                            | `stopping`, `error`                    |
| `crashed`         | it left unexpectedly                         | `ready`, `starting`, `health-checking` |
| `restarting`      | waiting out the backoff before a new attempt | `crashed`                              |
| `error`           | given up, with a reason                      | any state                              |

Two properties are load-bearing and enforced by the transition table, not by convention:

- **`ready` is only reachable from `health-checking`.** There is no edge from `starting` to `ready`,
  so a spawn that never answers health cannot be reported as ready even by mistake.
- **`crashed` and `restarting` are separate states.** "It died" and "we are bringing it back" are
  different things to a person watching, and showing only the second hides an incident.

`stopped` is terminal for that process — its only exit is `starting`, because a restart is a new
process, not a resurrection of the old one.

## 4. Startup sequence

1. **Single instance.** A second launch focuses the existing window (§`lib.rs`), so there is never a
   second database handle and never a second API.
2. **Per-launch credential.** 256 bits from the OS RNG, hex-encoded, passed to the child through its
   environment and handed to the frontend only by `shell_handshake`.
3. **Plan.** Executable, arguments and environment come from a typed structure. The argument list is
   fixed; the executable is resolved from the running binary's directory, never from a
   caller-supplied path; the bind address is asserted loopback.
4. **Spawn**, then `starting`, then `health-checking`. The pid is reported — it is not a state
   change, and re-entering `starting` would be an illegal move the table refuses.
5. **Health.** `/v1/health` with the launch credential, every 250 ms, up to a 30 s deadline.
6. **Ready**, and the window is shown unless the profile asks for a minimised start.
7. **Hand off** to the monitor loop on its own thread.

Failure at any step is `error` with the step named — a missing bundle, a busy port and a spawned
child that never answers are three different messages.

## 5. Health and readiness

**Readiness means all three, and the shell proves each:**

| Requirement              | How it is proved                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------- |
| the process is running   | `try_wait` says it has not exited                                                      |
| health check passed      | `GET /v1/health` answered 200                                                          |
| the API contract answers | that request used _this launch's_ token, so an unrelated listener on the port fails it |

`isProcessReady(status)` is the only thing a caller should trust for that question, and it requires
both `state === 'ready'` **and** `health === 'healthy'`. A report assembled by hand — a fixture, a
future transport — still cannot claim readiness without the evidence. `desktopStartupState` reads it
the same way: a report saying `ready` with `health: 'unreachable'` is a contradiction, and the safe
reading is `RECOVERING`, never `READY`.

The port is **fixed** (4317) rather than dynamic, because the CSP names the exact origin the WebView
may reach and `http://127.0.0.1:*` would let a page talk to any local service. A busy port is
therefore a start-up failure with an actionable message, not a silent relocation.

## 6. Restart behaviour

A crash goes `crashed → restarting → starting → health-checking → ready`, with:

- **a bound of 3 restarts**, after which the state is `error` and the reason says so;
- **exponential backoff** of 500 ms → 1 s → 2 s (bounded at 10 s), so a broken binary fails visibly
  instead of spawning forever;
- **a refreshed budget after stable uptime.** A process that ran healthily for 60 s and then died is a
  new incident, so the counter resets — otherwise a flapping API would retry forever at one attempt
  per minute.

The budget is **not** refreshed on each restart: that would turn the bound into an infinite respawn
loop, which is exactly what the bound exists to prevent.

A process that is alive but stops answering is also treated as failed. Eight consecutive health
misses (two seconds of silence) move it to `crashed`, which is the same false-positive avoidance as
§5 — an API that cannot answer is not usable, whatever its pid says.

## 7. Shutdown behaviour

```text
closing the window        hides it. A months-long training record should not be one keystroke
                          from being gone; quitting is explicit.
quit / app_quit / exit    stopping → SIGTERM → bounded wait (10 s) → SIGKILL only if needed → stopped
```

Order matters: the API is stopped **before** the shell exits, so SQLite closes through its own
shutdown path rather than being killed mid-write. If the child ignores `SIGTERM`, the bound is what
makes the forced path reachable, and the forced path is recorded in `lastError` — the cost is WAL
recovery next launch, and it is stated rather than hidden.

`stop()` always leaves the process dead and always resolves. A caller on an exit path must not be
blocked by a bug in the thing it is shutting down, so a child that reports a failure while stopping
is logged and reported, not propagated.

`.gitignore`-style correctness for orphans: the child is **not** detached, so it shares this
process's group; and `stop()` resolves only when `try_wait` reports it gone, not when the signal is
sent. `tests/desktop-runtime.test.ts` asserts the pid is no longer alive afterwards.

## 8. Security boundaries

- **No `shell:` permission exists at all.** `capabilities.ts` refuses the whole `shell:` family by
  name, so a compromised page cannot start a process even if the Rust side registered one.
- **One spawner per layer.** `process.single-spawner` fails if any Rust file other than `sidecar.rs`
  constructs a process; `process.single-spawner.typescript` fails if any `src/**` file other than
  `child-process.ts` imports `node:child_process`. A second place that can start a process is a
  second place that can start the wrong one.
- **No caller-shaped arguments.** The launch is a plan, not a command string; nothing the WebView
  sends reaches `args`, `executable` or `env`.
- **Loopback only**, and the port is asserted to agree across the CSP, the TypeScript constant, the
  Rust constant and the backend default.
- **The credential is never logged.** The child's captured output is passed through `redactToken`
  before it reaches any sink, because a backend that printed its own environment would otherwise put
  a live credential in the shell log.
- **The report is not a handle.** `SupervisorStatus` carries state, pid, health, uptime, restart
  count and a safe message. No path, no port, no signal, no command.

## 9. Web versus desktop

|                              | Browser                         | Desktop shell                        |
| ---------------------------- | ------------------------------- | ------------------------------------ |
| API process                  | none, and none is started       | spawned, watched, restarted, stopped |
| `runtime.state`              | `idle` → rendered `unavailable` | the real state                       |
| keychain, cache, file dialog | reported missing, with reasons  | available                            |
| business logic               | **identical**                   | **identical**                        |

Being inside the shell never selects a different path through the domain layer. Only host concerns
differ, and they go through `ShellBridge`, which reports what is missing instead of pretending. The
frontend cannot import `src/desktop/sidecar.ts` or `child-process.ts`: neither is a declared
`@shared/*` specifier and the alias resolver is exact-match, so the bundle refuses them.

A browser is `STOPPED`/`unavailable` — deliberately **not** `STARTING`, which would leave a spinner
running forever on the preview build.

## 10. Troubleshooting

| Symptom                                         | Cause                                            | What to check                                                                        |
| ----------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Window stays hidden, `runtime.state` is `error` | the API never answered within 30 s               | is port 4317 free? is `binaries/master-trade-api` present (`npm run build:sidecar`)? |
| `RECOVERING` never becomes `READY`              | the restart is failing too                       | `lastError` names the exit code; three failures move it to `error`                   |
| `notifications` listed as unavailable           | it needs the API                                 | `runtime.state` must be `ready`                                                      |
| Credential "silently does nothing"              | the WebView exposed only the legacy Tauri global | detection lives in one place now; see `desktop-foundation.test.ts`                   |
| The API hangs after logging a lot               | (fixed) unread stdout pipe                       | both pipes are drained in `lib.rs` and `child-process.ts`                            |

## 11. Limitations of Phase 6.2

1. **The Rust supervisor is not compiled here.** This environment has no Rust toolchain, so
   `process-state.agreement`, `process.policy-agreement` and `protocol.agreement` prove that the two
   implementations _describe_ one machine with one set of deadlines — and nothing executes the Rust
   side. The Node supervisor, exercised against real child processes, is what those behaviours are
   tested against. Recorded as TDR-13; the verifier's `unverifiable` list says so too.
2. **Windows has no graceful signal.** `std::process::Child::kill` is `TerminateProcess` and `std`
   offers nothing else, so on Windows the API is terminated rather than asked. A real `SIGTERM` is
   sent on Unix. Recorded as TDR-12.
3. **Readiness is liveness, not contract version.** The shell proves the health route answers with
   the right credential; it does not compare an API schema or build version. A mismatched-but-alive
   API would pass. (A build-version handshake is Phase 6.6 material.)
4. **No automatic update check or installer.** Declared placeholders only; `desktop:verify` reports a
   placeholder update key as a warning in development and an error in production.
5. **The supervisor's monitor is the shell's, not the library's.** `SidecarSupervisor.handleExit` is
   called by an owner (Rust's `supervise`, or a test). Any future Node-hosted or headless shell must
   supply its own loop; `child-process.ts` deliberately provides the port, not the loop.

## 12. Deferred to later phases

| Phase         | Deferred                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------- |
| 6.3           | backup and restore, quota enforcement, encryption at rest (see [desktop-storage.md](./desktop-storage.md)) |
| 6.4           | secure storage and OS keychain integration, advanced desktop permission workflows                          |
| 6.5           | installer, signing and notarisation, auto-update                                                           |
| 6.6           | final hardening, release QA, build-version handshake                                                       |
| Design system | visual redesign, new component library, shine/glow overhaul                                                |

Phase 6.2 implemented none of these. Phase 6.3 has since implemented the local database lifecycle and
the file-system layer ([desktop-storage.md](./desktop-storage.md)); the row above now names only what
6.3 left undone. Live trading, broker execution and autonomous order placement remain disabled:
`liveTradingEnabled` and `brokerExecutionEnabled` are literal `false`, asserted by `safety` and
`release-baseline` tests.

## 13. Where this is tested

`tests/desktop-runtime.test.ts` — 47 tests: the state machine and its illegal moves; the three
readiness components; slow health and the startup deadline; a plan that cannot be built; a child that
dies while starting; crash → restart → ready with a real process and a real pid change; the restart
budget and its refresh after stable uptime; exponential backoff; graceful stop, forced stop and a
stop that reports failure; duplicate and concurrent starts; listener fan-out; the launch plan's
fixed arguments; redaction of captured output; the five user-facing states including the refusal to
report `READY` without evidence; and browser behaviour.

`tests/desktop-shell.test.ts` and `tests/desktop-foundation.test.ts` — the shell contract, the
verifier, the capability boundary and the startup derivation.
