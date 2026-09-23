# Desktop release QA

Phase 6.6 is the last sub-phase of the Desktop Shell. It adds no product feature: it makes
6.1–6.5 behave as one product, and it says — in one report, on one screen of output — what is
ready to ship and what nobody has checked.

Two documents already describe the parts: `desktop-architecture.md` (the shell), and the
per-layer documents `desktop-runtime.md` (the API process), `desktop-storage.md` (database and
files), `desktop-secure-storage.md` (credentials) and `desktop-release.md` (packaging and
updates). This one describes the **joint** claim: the startup and shutdown sequence across all
of them, the build-version handshake that binds them, how to run the release QA report, and
exactly which validations this repository cannot perform in every environment.

## 1. The release QA report

```bash
npm run release:qa          # node dist/src/desktop/release-cli.js qa
```

It prints every finding with one of four verdicts, grouped by area:

| verdict         | means                                                        | affects the exit code |
| --------------- | ------------------------------------------------------------ | --------------------- |
| `PASS`          | the check ran and the tree satisfies it                      | no                    |
| `WARN`          | the check ran and something should be fixed before a release | no                    |
| `FAIL`          | the check ran and the tree is not releasable as it stands    | **yes**               |
| `NOT_AVAILABLE` | **this environment cannot exercise the check**               | no                    |

`NOT_AVAILABLE` is the reason this report exists separately from `npm run desktop:verify`. Every
other check in the repository answers _is it right?_; none of them can answer _was it looked
at?_ — and a report that silently omits a step is indistinguishable from one that passed it. An
unexercised check therefore never fails the command, is listed again at the bottom under _what
this report cannot vouch for_, and is never allowed to read as a pass.

The report is a **view, not a second rulebook**. The bundle rules come from `packaging.ts`, the
signing verdict from `signing.ts`, the version surfaces from `version.ts`, and all of it through
`verifyDesktopShell` — the same report `npm run desktop:verify` prints and `npm run validate`
gates on. The things this layer owns are exactly three:

1. **The verdict vocabulary**, above.
2. **The evidence matrix** (§6): every scenario the phase names, mapped to the test that proves
   it. If a test is renamed away, the report fails and names the scenario that lost its witness.
3. **The platform boundary** (§7): which parts of the release path this host cannot exercise.

`npm run release:preflight` remains the command that _refuses_ to package. `release:qa` answers a
different question and is not a gate.

## 2. Startup sequence

The shell is one process; the API is a child it owns. In a packaged app the Rust host performs
these steps (`src-tauri/src/sidecar.rs`); `src/desktop/sidecar.ts` is the same policy expressed
where it can be tested against a real child process (TDR-13).

```
application start
  → single-instance check        (a second copy focuses the first window)
  → desktop runtime detection    (web | desktop, one function)
  → data directories resolved    (OS app-data, environment-scoped; desktop-storage.md §2)
  → database opened + migrated   (a failure here is `failed`, never a healthy-looking boot)
  → sidecar plan built           (fixed executable + argument list, loopback only)
  → child spawned                (pipes drained: the shell can never deadlock on child output)
  → health polled                (/v1/health with the per-launch token, bounded deadline)
  → build-version handshake      ← Phase 6.6
  → window shown + `ready`
```

Two orderings are load-bearing and are enforced rather than intended:

- **`ready` is only reachable from `health-checking`.** The state table has no edge from
  `starting`, so a spawn that never answers health cannot be reported as ready even by accident.
- **The handshake runs after health and before `ready`.** Asking a process that is not listening
  would fail for the wrong reason; asking one that _is_ listening is exactly the case that
  matters, because a stale API answers health perfectly well.

Readiness therefore means three things, and `READY` is reported only when all three hold:

```
process running  +  health check passed  +  the API is the build the shell shipped
```

A failure at any step is an `error` with a reason a screen can render. The interface sees the
result of this sequence as five states — `STARTING`, `READY`, `RECOVERING`, `STOPPING`,
`STOPPED`, plus `ERROR` — narrowed by `@shared/desktop/startup` from the shell's own report.
`desktop-runtime.md` §4 owns that derivation.

## 3. Shutdown sequence

```
window close / quit
  → stop the API gracefully (SIGTERM on Unix, TerminateProcess elsewhere — TDR-12)
  → wait, bounded by PROCESS_POLICY.stopTimeoutMs
  → force termination only if the bound expires, and say so in the log
  → database closed by the child before it exits
  → shell exits
```

Requirements this sequence exists to satisfy, each with a witness (§6): no orphan child survives
(`matrix.orphan-prevention`, `matrix.concurrent-stop`), shutdown cannot hang
(`matrix.forced-termination`), and a stop that races a spawn leaves no process behind
(`matrix.concurrent-stop`).

That last one was a real defect found in this phase. `stop()` arriving while a spawn was in
flight settled the machine as `stopped`, and the spawn then made the new child `this.process`
before asking whether the state machine could adopt it — leaving a running process that no later
`stop()` could reach. The supervisor now stops the child itself (`discard`) and refuses the
start, and the report's node it names the state it lost the race to.

## 4. Failure states

| failure                        | detected by                      | resulting state                           | user-visible |
| ------------------------------ | -------------------------------- | ----------------------------------------- | ------------ |
| spawn fails                    | spawn error                      | `error`, reason kept                      | ERROR        |
| child dies while starting      | liveness probe during the poll   | `crashed` → `restarting`                  | RECOVERING   |
| health never answers           | readiness deadline               | `error` with the deadline                 | ERROR        |
| API stops answering later      | periodic health re-probe         | `crashed` → `restarting`                  | RECOVERING   |
| restart budget exhausted       | failure counter vs `maxRestarts` | `error`, budget named                     | ERROR        |
| API is another build           | version handshake                | `error`, both versions named              | ERROR        |
| keychain refused               | capability report                | ERROR only if required                    | ERROR        |
| database cannot open / migrate | initialization stages            | initialization failure, path never leaked | ERROR        |
| child output has no newline    | capture bound                    | truncated record, shell stays up          | READY        |
| IPC command rejects            | bridge wrapper                   | typed `PROVIDER_UNAVAILABLE`              | ERROR        |

Two rules hold across the whole table. **Nothing fails silently**: every one of these ends in a
state, a reason, or both. And **nothing degrades security to keep going**: a keychain that
refuses is never replaced by a file, an update that cannot be verified is never installed, and a
version mismatch is never treated as a warning beside a `ready` the application cannot honour.

## 5. The build-version handshake

`src/desktop/handshake.ts` owns the rule; the supervisor asks it through one seam.

```
shell's own version (tauri.conf.json / Cargo.toml)
        vs
API's reported version (GET /v1/health → config.version)
```

Both descend from the single version source `package.json`, whose four mirrors
`version.agreement` holds in step (`desktop-release.md` §2). That makes one _tree_ consistent; it
does not make a _running application_ consistent, because two programs are running. Every way
they can disagree is a silent failure: an installer built from a stale `dist/` reports the old
version at the one endpoint support reads; an API left behind by an earlier install talks to a
window built against different code, with the protocol version unchanged so nothing else notices.

Four results, in `HANDSHAKE_STATES`, mirrored in `sidecar.rs` and compared by the verifier:

| state                  | when                                           | outcome          |
| ---------------------- | ---------------------------------------------- | ---------------- |
| `VERSION_OK`           | the two normalize equal                        | `ready`          |
| `VERSION_MISMATCH`     | both readable, different (says which is older) | refused, `error` |
| `VERSION_UNAVAILABLE`  | the API answered without a version             | refused, `error` |
| `VERSION_CHECK_FAILED` | the request failed, or a version is unreadable | refused, `error` |

**Equality is the rule, not "compatible enough".** A tolerance cannot be checked against what the
bundle was meant to contain, which is the kind of rule this phase removes. Normalization is
shared (`update.ts` / `normalize_version` in Rust): a leading `v` is dropped, a missing minor or
patch is padded, build metadata is ignored, and a pre-release sorts below its release — so
`1.0.0-rc1` never satisfies a stable shell.

Only `VERSION_OK` proceeds. There is no development-only relaxation: a development tree whose
`dist/` predates the source is precisely the case the handshake catches, and it is caught here
long before a release.

## 6. The evidence matrix

`QA_MATRIX` in `release-qa.ts` maps every scenario to the suite and test that proves it. The
report fails if a witness disappears, so "we tested that" is a dependency rather than a memory.

| area        | scenarios                                                                | primary witnesses                                             |
| ----------- | ------------------------------------------------------------------------ | ------------------------------------------------------------- |
| startup     | normal, fresh, slow, timeout                                             | `desktop-runtime.test.ts`                                     |
| runtime     | crash, restart, backoff, exhaustion, failed health                       | `desktop-runtime.test.ts`                                     |
| shutdown    | graceful, forced termination, orphan prevention                          | `desktop-runtime.test.ts`                                     |
| concurrency | concurrent start, concurrent stop, stop during startup                   | `desktop-runtime.test.ts`, `desktop-hardening.test.ts`        |
| pipes       | unbounded output without a newline                                       | `desktop-hardening.test.ts` (real child)                      |
| IPC         | allow-list refusal, curated transport failure, malformed key             | `desktop-hardening.test.ts`                                   |
| handshake   | mismatch, missing version, malformed metadata                            | `desktop-hardening.test.ts`                                   |
| storage     | DB init failure, migration failure, filesystem failure, traversal        | `desktop-storage.test.ts`                                     |
| credentials | keychain denied, no plaintext fallback                                   | `desktop-secure-storage.test.ts`, `desktop-hardening.test.ts` |
| updates     | invalid metadata, invalid signature, failed install, unconfirmed success | `desktop-update.test.ts`                                      |
| packaging   | identity, version surfaces, bundle hygiene, signing fails closed         | `desktop-packaging.test.ts`, `desktop-signing.test.ts`        |
| interface   | the five rendered states, browser isolation                              | `desktop-runtime.test.ts`, `desktop-hardening.test.ts`        |

Run them together with the rest of the gate:

```bash
npm run typecheck && npm run typecheck:web && npm test
npm run build && npm run build:web && npm run desktop:verify
npm run test:e2e          # browser suite, including the responsive matrix
npm run release:qa        # this document's report
```

## 7. Supported validation environments

This is the honest boundary of what has been executed, not what has been written.

| validation                                                                              | where it runs                                                          | notes                                                                             |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| unit and integration suites                                                             | any OS                                                                 | 60+ suites, no native code required                                               |
| `desktop:verify` (51 checks)                                                            | any OS                                                                 | static: capability files, command parity, CSP, ports, versions, handshake parity  |
| `release:qa`                                                                            | any OS                                                                 | the report above; `platform.host` is `NOT_AVAILABLE` off Windows                  |
| browser E2E (Playwright/Chromium)                                                       | any OS                                                                 | desktop, tablet and phone widths                                                  |
| the Rust host (`cargo build`, `tauri build`, an installer)                              | needs a Rust toolchain                                                 | **not run in this repository's CI** — TDR-13                                      |
| the Windows runtime path (single-instance focus, uninstall entry, OS certificate store) | Windows                                                                | exercises `src-tauri`; not claimed from a non-Windows host                        |
| OS keychain operations                                                                  | Windows (Credential Manager), macOS (Keychain), Linux (secret service) | the TypeScript layer is tested against a scripted store; the platform call is not |
| a signed update, end to end                                                             | a release machine with the private key                                 | the key's absence is deliberate (TDR-19)                                          |

The Rust supervisor is _described_ in two halves that the verifier compares — process states,
deadlines, the handshake states — and _executed_ only in the Node implementation
(`sidecar.ts` + `child-process.ts`), which tests drive against real child processes. That is the
strongest available claim, and it is a claim about policy rather than about the compiled binary.

## 8. Release checklist

Run once, in order, from a clean checkout:

1. `git status` is clean and the branch is the one to release from.
2. `npm ci` — the lockfile is the dependency set; no `audit fix --force`.
3. `npm run validate` — format, both typechecks, the full suite, both builds, `desktop:verify`,
   the browser E2E suite. All green.
4. `npm run release:qa` — **no `FAIL`**. Read the `NOT_AVAILABLE` list and confirm every entry is
   explained by §7 rather than by an oversight.
5. `npm run release:check` — `package.json` and its three mirrors agree.
6. `MASTER_TRADE_ENVIRONMENT=production npm run release:preflight` — releasable. This is the gate
   that refuses a release over missing or placeholder signing material.
7. `npm run desktop:build` on a Windows machine with the Rust toolchain, then confirm from
   `release:qa` that `platform.installer-artifact` is now `PASS` and inspect the bundle.
8. Install on a clean Windows profile. Confirm: one instance, the window shows only after health,
   `release:qa` is `VERSION_OK` in the shell's own report, a credential round-trips, and closing
   the window leaves no `master-trade-api` process.
9. Verify `liveTradingEnabled` and `brokerExecutionEnabled` are `false` and autonomous trading is
   unavailable — `npm run test -- safety` covers the literals.
10. Tag, publish the artifact and the update metadata signed with the release key.

Steps 7–8 have never been performed in this repository's history (TDR-18), so they are a
checklist, not a record.

## 9. Master Trade Brain

The desktop shell is infrastructure and sits outside the Brain. Phase 6.6 changes none of the
Brain contracts and adds no subsystem:

- **Memory** — the API process owns the database; a runtime _failure_ is never written as a
  memory record, so a crash cannot become fabricated knowledge.
- **Reasoning** — the handshake and the supervisor produce system state, never reasoning input.
  Nothing in `src/agent` may import the credential layer, which `secrets.isolated-from-reasoning`
  enforces at build time.
- **Learning** — diagnostics reach Learning only through the existing approved paths (test
  results, the quality suite). The QA report is a release tool and writes nothing.
- **Decision Core** — untouched: this phase adds no capability that can reach a broker, and
  `liveTradingEnabled`/`brokerExecutionEnabled` remain literal `false`.

## 10. Known limitations

- **The Rust half is described, not compiled** (TDR-13). The verifier compares the two
  descriptions — states, deadlines, handshake states — and the Node supervisor is what the tests
  execute against real child processes.
- **Windows-specific runtime validation is unavailable off a Windows host**, and has not been
  performed on one in this repository's history (TDR-18). The report says so rather than
  inferring a pass from configuration.
- **No installer has been produced or inspected** (TDR-18). `platform.sidecar-built` is a warning
  in development for the same reason.
- **`signing.ts` cannot verify a signature** — that needs the private key whose absence is the
  point (TDR-19). It reviews whether the material is _shaped_ correctly, and the native updater
  verifies a real signature at install time.
- **Graceful termination on Windows is `TerminateProcess`** (TDR-12), which is all `std` offers;
  the child's `SIGTERM` handling is exercised on Unix.
- **Test-name coupling**: `QA_MATRIX` matches fragments of test names, so renaming a witness
  fails `release:qa` until the map is updated. That is deliberate — a silently missing witness is
  worse — but it is a maintenance cost.
- **The QA report is not a gate**, only `release:preflight` refuses to package. A green
  `release:qa` means nothing failed; it does not mean everything was exercised.

## 11. Deferred work

Phase 6.6 closes the Desktop Shell roadmap. Nothing after it is started or scheduled here, and
the deferred items below are recorded so that "not done" is not mistaken for "not needed":

- **Rust CI** — a `cargo build` job, which would turn every described parity check into an
  executed one (TDR-13).
- **A real Windows release pass** — produce an installer, sign it, install it on a clean profile
  and run §8 steps 7–8 (TDR-18).
- **An authenticated update channel** — a real minisign keypair in CI, published metadata, and an
  end-to-end update performed on an installed build (TDR-19).
- **A native update adapter** — the `UpdatePort` implementation for the Tauri updater, plus the
  update UI (TDR-21).
- **Code signing and notarisation** — a different capability from the update signature
  (TDR-20).
- **Startup timing instrumentation** — the sequence is bounded but not measured, so "slow start"
  is currently a test fixture rather than a production observation.
- **Design System and remaining UI work** — explicitly out of scope for the desktop shell
  sub-phases.
