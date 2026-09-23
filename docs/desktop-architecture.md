# Desktop architecture

The Master Trade desktop shell: what it is for, where its boundary runs, and what it is
deliberately not allowed to become.

This document is the architecture. [`desktop-shell.md`](./desktop-shell.md) is the development
guide (how to build and run the shell), and the per-phase records live in
[`adr/`](./adr/) — see [ADR-0051](./adr/ADR-0051-the-shell-hosts-and-the-domain-decides.md) for the
decision this phase settled.

---

## 1. Desktop Shell purpose

The shell exists to give a browser-based product four things a browser cannot give it, **and nothing
else**:

| It provides            | Because                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------- |
| OS keychain access     | Provider credentials must not live in a file, a database or a WebView              |
| A native window        | A long-running training workstation should behave like an application, not a tab   |
| An offline cache       | The interface must render something honest with no connection                      |
| A single-instance lock | Two instances would open two databases and two API processes over one set of files |

Everything else the product does — analysis, capabilities, portfolio arithmetic, decision
evaluation, memory, credits, permissions — belongs to the domain layer, which is identical in both
runtimes. The shell is a **host**, not a second application.

The single sentence that governs every decision below: **the shell hosts and the domain decides.**
A feature may ask the shell for a credential; it may never ask the shell what a number means.

---

## 2. Tauri architecture

Tauri 2, with the Rust host and the system WebView (WebView2 on Windows, WKWebView on macOS,
WebKitGTK on Linux). `docs/desktop-and-frontend.md` records why Tauri rather than Electron; the short
version is bundle size, no Node runtime in the renderer, and a capability model that matches this
project's existing permission thinking.

| Piece              | Location                                          | What it is                                                      |
| ------------------ | ------------------------------------------------- | --------------------------------------------------------------- |
| Configuration      | `src-tauri/tauri.conf.json`                       | Identity, window, CSP, bundle, sidecar declaration              |
| Rust library       | `src-tauri/src/lib.rs`                            | Startup sequence, window events, run-event handling             |
| Rust entry point   | `src-tauri/src/main.rs`                           | A one-line call into the library                                |
| Command surface    | `src-tauri/src/commands.rs`                       | The 13 registered commands — the whole IPC surface              |
| Host concerns      | `src-tauri/src/{config,secrets,cache,sidecar}.rs` | Config file, keychain, offline cache, sidecar supervision       |
| Capability grant   | `src-tauri/capabilities/main.json`                | What the WebView is allowed to do without asking Rust           |
| Node-side contract | `src/desktop/`                                    | Command allow-list, capabilities, config, lifecycle, verifier   |
| Shared contract    | `packages/shared/src/desktop/`                    | Runtime detection, startup states, the IPC contract the UI uses |

### Identity and version agreement

`productName` is **Master Trade**, the identifier is `app.mastertrade.desktop`, and the version is
checked to be **the same string** in `package.json`, `tauri.conf.json`, `src-tauri/Cargo.toml` and
`src/core/config.ts` — four surfaces since Phase 6.5, which also gave the version one authoritative
source and a `release:sync-version` command that writes the mirrors. `npm run desktop:verify`
reports `version.agreement` and fails if they diverge, because a bundle whose version disagrees with
its own manifest cannot be updated reliably.

### Window foundation

One window, `label: "main"`, 1440×900, minimum 1024×640, resizable, decorated, centred, and —
the detail that matters — **`visible: false`**. The window is hidden until the shell has confirmed
the local API answers, then shown. A slow start therefore shows a branded splash rather than a blank
frame, and the interface never renders against an API that is not there. A `CloseRequested` event
prevent-closes and hides instead of quitting, so the same window is reused and the shutdown sequence
is driven deliberately rather than by a window's destruction.

Nothing beyond this: no tray, no global shortcuts, no custom title bar, no docking, no multi-window
architecture. Those are later-phase concerns and none of them is needed to run the product.

### Content security policy

`default-src 'self'`, with `connect-src` limited to the IPC transport and the local API
(`http://127.0.0.1:4317`, `ws://127.0.0.1:4317`), `object-src 'none'`, `base-uri 'none'`,
`frame-ancestors 'none'`, `form-action 'none'`, and `freezePrototype` on. The shell makes no other
outbound request from the WebView, and the policy says so rather than trusting that it does not.

---

## 3. Web vs Desktop boundary

One React application, two runtimes. There is **no** desktop-only screen, no parallel component tree
and no second build target for the interface: `web/dist` is what the shell serves and what a browser
serves.

```
                   ┌─────────────── one React application ───────────────┐
browser  ─────────▶│  pages · components · stores · @shared/* contracts  │
Tauri WebView ────▶└─────────────────────────┬───────────────────────────┘
                                             │
                        @shared/desktop/runtime   (one detection function)
                                             │
                    ┌────────────────────────┴─────────────────────────┐
                    │                                                  │
        web  → browserShellBridge()                    desktop-tauri → createShellBridge(invoke)
        (reports what is missing)                      (typed IPC into the Rust host)
```

**Detection happens once.** `@shared/desktop/runtime` is the only place that decides which runtime a
page is in, and it is a wrapper over the single predicate in the IPC contract. Components do not test
`window.__TAURI__`; they ask. This is not stylistic — the two modules had already drifted apart (the
contract accepted the legacy `__TAURI__` global, the frontend bridge tested only
`__TAURI_INTERNALS__`), so a WebView exposing only the legacy global was the shell to one half of the
codebase and a browser to the other. `tests/desktop-foundation.test.ts` now asserts the two agree on
every shape of target.

**A browser is a first-class runtime, not a degraded one.** Outside the shell the bridge reports the
missing capabilities instead of pretending: `browserShellBridge()` answers with no API base URL, no
keychain and no cache, naming each absence with a reason. That is what lets the same pages render
honestly in a browser preview.

**No Tauri API is required to build or run the web product.** `invoke` is resolved lazily from the
injected internals, so a browser bundle never needs the Tauri package to exist.

---

## 4. IPC architecture

Frontend → typed desktop service → explicit Tauri command → validated input → Rust handler → typed
response. Both halves are deny-by-default, and they are checked against each other:

| Half                           | Says                                            | Lives in                             |
| ------------------------------ | ----------------------------------------------- | ------------------------------------ |
| What the WebView is _granted_  | Plugin permissions the WebView may use directly | `src-tauri/capabilities/main.json`   |
| What the WebView may _ask for_ | The 13 commands, with argument validation       | `packages/shared/src/desktop/ipc.ts` |

`npm run desktop:verify` fails if the Rust command list and the TypeScript allow-list disagree, so
the two halves cannot drift into a state where the frontend calls a command nothing implements, or a
command exists that nothing declares.

The commands are: `shell_status`, `shell_handshake`, `secure_store_{set,get,delete}`,
`cache_{get,set,clear}`, `export_report`, `export_report_as`, `open_external`, `window_hide`,
`app_quit`.

Three properties make this surface safe to widen later, and all three are tested:

1. **The allow-list is exact.** A command not in it is refused _in the frontend_ before the IPC
   boundary is reached, so a bug in a page cannot reach a command the shell forgot it had.
2. **Arguments are validated before they cross.** Credential and cache keys are identifier-shaped;
   a cached value is capped at 512 KB; an export name is refused if it contains a separator,
   `..`, a control character or an unlisted extension; an external URL must be `https`. No command
   takes or returns a filesystem path — files are _named_ and the Rust host decides where they live.
3. **There is no generic anything.** No `exec`, no shell, no eval, no arbitrary filesystem command,
   no HTTP proxy and no "run this" bridge. A deny-list of general-purpose shapes is asserted over
   the command names, so adding one has to be deliberate.

The typed boundary is `ShellBridge` (`./host.ts` for the host contract, `./ipc.ts` for the shell
bridge), and the browser implementation is a real implementation of the same interface rather than a
stub that throws on every method.

---

## 5. Capability and permission model

The WebView is granted the minimum Tauri permissions that make a window work, and nothing that could
reach the operating system:

- **Granted:** `core:app`, `core:event`, `core:window` (plus `allow-hide`, `allow-show`,
  `allow-set-focus`), `core:webview`, `core:menu`, `core:resources`, `notification`, `updater`, and
  `opener:allow-open-url` scoped to `https://*`.
- **Not granted, deliberately:** `fs`, `shell`, `path`, `http`, `store` and every process-execution
  permission. Anything the app needs beyond the list is a Rust command, which is reviewable in one
  file and validated in TypeScript before it is called.

`src/desktop/capabilities.ts` holds the declared matrix **and** the forbidden rules, so the
intention is expressed next to the grant. `capabilityMatrix()` prints the list in the verifier
output, and `tests/desktop-shell.test.ts` asserts no permission that could reach the OS is granted,
that a forbidden permission is refused _by name with its reason_, and that the granting file matches
the declared matrix.

**No second permission system.** These permissions govern what the _WebView_ may do directly. They
do not govern what a user may do: authentication, roles, capabilities, entitlements and credits all
remain where they already are, in the domain layer, and the shell never becomes an authority on them.

---

## 6. Lifecycle model

Two layers, one source of truth, and no third model invented.

**The shell's own machine** (`src/desktop/lifecycle.ts`) sequences the process:
`idle → instance-checked → sidecar-starting → sidecar-ready → window-shown → ready`, with `failed`,
`shutting-down` and `stopped`. Illegal transitions throw, and the order is _data_
(`STARTUP_ORDER`), each step carrying the reason a faster ordering would break it — a second instance
must exit before it opens a second database handle; liveness is confirmed before the window renders;
the frontend gets its handshake before the shell is called interactive.

**The state a screen renders** (`@shared/desktop/startup.ts`) is a _narrowing_ of the shell's report
into the five states a UI branches on:

```
STARTING  →  READY  →  STOPPING  →  STOPPED        ERROR from anywhere
```

`desktopStartupState()` is pure: runtime, the shell's `ShellStatus`, and whether a quit was
requested. Two rules in it are load-bearing:

- **It never reports `READY` over a failed initialisation.** `sidecarState: 'ready'` with a missing
  _required_ capability (keychain, file dialog, offline cache, single-instance) is `ERROR`, named.
  An optional capability — auto-update on a development build — stays optional.
- **A failure outranks a shutdown.** A user asking to quit is not evidence that the application
  started, so `ERROR` is reported rather than hidden behind `STOPPING`.

A browser is `STOPPED`, never `STARTING`: there is no shell process to wait for, and a spinner that
never resolves is the wrong answer to a question that has already been answered.

`useShellStatus()` exposes this to React, with a deliberate asymmetry: a _failed_ status call is
`ERROR`, not `STARTING`, because the answer is not coming.

Phase 6.2's process supervisor has a place to report into without any of this changing shape.

---

## 7. Configuration modes

Three modes, in `src/desktop/environment.ts`, declared by `MASTER_TRADE_ENVIRONMENT` and following
this project's existing `MASTER_TRADE_*` convention:

| Mode          | What it means                                                        |
| ------------- | -------------------------------------------------------------------- |
| `development` | The default. Release blockers are reported as warnings.              |
| `test`        | The test run. A deployment mode is not `NODE_ENV=test`.              |
| `production`  | Every release-time assurance is required; a placeholder is an error. |

Two refusal rules:

1. **An unrecognised value is refused, not coerced.** `staging`, `prod` or an empty string does not
   mean "probably production"; it is a violation, and the run is treated as `development`.
2. **A production run must declare itself.** Relying on the default would make this process's mode
   depend on whether somebody remembered to export a variable.

The mode is **load-bearing**, which is the only reason it is worth having. `npm run desktop:verify`
takes an injected environment and:

- reports a placeholder updater signing key as a **warning in development and an error in
  production** — one fact, two severities, decided by the mode;
- refuses a **debug update endpoint** in production (the committed endpoint uses the reserved
  `.invalid` TLD, which can never resolve: harmless while developing, a shipped build that can never
  be updated);
- reports an unrecognised environment as a failed check.

The verifier prints which mode it verified as, because a green report that does not name its
environment is ambiguous.

**A mode can make an assurance stricter; it can never make a safeguard looser.** `liveTradingEnabled`
and `brokerExecutionEnabled` are typed as the literal `false` and `assertSafeConfig` refuses a boot
that sets them — in every mode, including `test`. Safety guarantees are code, not settings.

**No secrets are embedded in the binary.** Configuration holds `SecretRef` names only; credentials
resolve from the OS keychain at runtime; the desktop config file is refused if a credential-shaped
key appears anywhere in it, at any depth; and the file lives in the app-data directory, never the
install directory.

---

## 8. Security principles

1. **Deny-by-default, twice.** An undeclared command does not exist, and an undeclared permission is
   not granted. Neither has a fallback or a fuzzy match.
2. **Validate before the boundary, not after.** Argument validation lives in TypeScript, in front of
   the IPC call, so a malformed request never reaches Rust.
3. **No path crosses.** No command accepts or returns a filesystem path. The frontend names a file;
   the host decides where it goes.
4. **Nothing generic.** No execution, proxy, filesystem or "run what I give you" command exists, and
   the absence is asserted.
5. **Errors are safe to show.** A refusal says what was refused and why, and carries no path, no
   environment variable, no stack trace and no internal identifier. A browser-only refusal does not
   describe the machine it is refusing on.
6. **The shell holds no business logic.** It cannot decide a readiness verdict, a credit balance, a
   portfolio value or a permission — see §1, and [ADR-0051](./adr/ADR-0051-the-shell-hosts-and-the-domain-decides.md).
7. **Trading stays closed.** No operation, tool, capability, job kind or configuration key exists
   for live trading, broker execution or autonomous order placement.

---

## 9. API integration boundary

The shell does not own the API client. The boundary is:

```
Desktop UI
  → the existing API client abstraction (`web/src/api/client.ts`)
  → a base URL and per-launch token from `shell_handshake`
  → the existing health/status surface
```

`shell_handshake` returns `{ apiBaseUrl, token, expiresAt }`: a loopback base URL and a
**per-launch** credential the shell generated. Nothing in the frontend can read or write a
credential directly, and `apiHandshake()` returns `null` rather than throwing when there is no shell
or the sidecar is still starting, so a caller renders "not connected" instead of handling an
exception on every load.

The design constraint for the next phase is the shape, not the implementation: the base URL is
**resolved at runtime** and never hard-coded, so a supervisor can start the API on a chosen port and
report it without any UI change. Phase 6.1 does **not** implement process orchestration; it
establishes where the URL comes from.

---

## 10. Phases 6.1 and 6.2 — implemented

Everything below is new in these phases and covered by tests.

| Item                              | What changed                                                                                                                                                                                                                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Runtime detection, one source** | `@shared/desktop/runtime` added. It owns `detectRuntime` / `isDesktopRuntime` / `currentRuntime`, so no component tests a global by hand.                                                                                                                                                        |
| **A real detection defect fixed** | The frontend bridge tested only `__TAURI_INTERNALS__` while the IPC contract also accepted the legacy `__TAURI__` global; a legacy-only WebView was the shell to one module and a browser to the other. Both now answer from the same predicate, and the agreement is asserted per target shape. |
| **Startup state foundation**      | `@shared/desktop/startup` added: `DesktopStartupState` (`STARTING`/`READY`/`STOPPING`/`STOPPED`/`ERROR`), `desktopStartupState()`, `isStartupSettled`, `isStartupPending`. Pure, and a narrowing of the shell's own report rather than a second lifecycle.                                       |
| **The UI consumes it**            | `useShellStatus()` now exposes `runtime` and a derived `startup` view, and a failed status call resolves to `ERROR` rather than an endless `STARTING`.                                                                                                                                           |
| **Environment modes**             | `src/desktop/environment.ts`: `development`/`test`/`production`, declared by `MASTER_TRADE_ENVIRONMENT`, an unrecognised value refused rather than coerced, and production required to declare itself.                                                                                           |
| **Modes made load-bearing**       | `desktop:verify` takes an injected environment: a placeholder update key is a warning in development and an **error** in production, a debug `.invalid` update endpoint is refused in production, and an unrecognised mode fails a check. The report names the mode it verified.                 |
| **Shared surface registration**   | Both new modules registered on all four mirrors (`config/sharedSurface.ts`, both tsconfigs, `packages/shared/package.json`), which the boundary test enforces.                                                                                                                                   |
| **Tests**                         | `tests/desktop-foundation.test.ts`: 31 behavioural tests across runtime detection, the command contract, argument validation, the five startup states, environment modes, the verifier's mode dependence and browser compatibility.                                                              |
| **Documentation**                 | This document, and [ADR-0051](./adr/ADR-0051-the-shell-hosts-and-the-domain-decides.md).                                                                                                                                                                                                         |

**Not changed:** the product UI, the domain layer, the API, the database, the brand assets, the
window configuration, the capability grant and the Rust command surface. Phase 6.1 aligned and
verified the foundation rather than rebuilding it, and `web/dist` still serves the same interface to
browsers and to the shell.

### Phase 6.2 — the local API process, supervised

Full detail in [`desktop-runtime.md`](./desktop-runtime.md) and
[ADR-0052](./adr/ADR-0052-one-process-machine-two-implementations.md).

| Item                                 | What changed                                                                                                                                                                                                                            |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **One process vocabulary**           | `@shared/desktop/process` declares the nine states, the legal transitions, `SupervisorStatus`, `PROCESS_POLICY` and the five user-facing states. `sidecar.rs` mirrors the state list, the policy and the report shape.                  |
| **The process is watched**           | The shell spawns the API and previously never looked at it again. `sidecar::supervise` now polls `try_wait`, treats eight consecutive health misses as a failure, and recovers within a bounded budget with 500 ms → 10 s backoff.      |
| **A crash has an honest state**      | `crashed` and `restarting` are separate, so "it died" and "we are bringing it back" cannot be confused. `RECOVERING` was added to the startup states for the same reason.                                                               |
| **A real graceful stop**             | `Child::kill()` is `SIGKILL` on Unix; the old comment claimed a graceful stop anyway. `sidecar::terminate` sends a real `SIGTERM` (Unix) and `sidecar::stop` bounds the wait before forcing. Windows keeps `TerminateProcess` (TDR-12). |
| **The pipes are drained**            | The child's stdout and stderr were piped and never read, so the API could block on its own log line once the buffer filled. Both are forwarded, with the launch credential redacted.                                                    |
| **Readiness needs evidence**         | `isProcessReady` requires `ready` **and** `healthy`, and `desktopStartupState` refuses `READY` on a report that claims one without the other.                                                                                           |
| **Runtime crosses the IPC boundary** | `shell_status` returns `runtime: DesktopReport` — state, pid, health, uptime, restart count, safe error — replacing the four-value `sidecarState`. Protocol v2; `protocol.agreement` holds the two constants together.                  |
| **The UI renders it**                | `useShellStatus` exposes the process state and polls at 1 s while something is happening and 5 s once settled, so a crash an hour in is still noticed. The Topbar and Settings render it.                                               |
| **One spawner per layer**            | `process.single-spawner` (Rust) existed; `process.single-spawner.typescript` extends it to `src/**`, so only `child-process.ts` may import `node:child_process`.                                                                        |
| **Tests**                            | `tests/desktop-runtime.test.ts`: 47 tests, including real child processes for the graceful signal, output redaction, crash→restart with a pid change and the orphan check.                                                              |

**Not changed in 6.2:** the product layout and design system, the domain layer, the API's own
behaviour, the database, the brand assets, the window configuration and the capability grant. The
browser product is untouched and still builds and runs without Tauri.

---

## 11. Phase 6.3+ — deferred

Named here so the boundary is explicit, and so nothing in Phases 6.1–6.2 is mistaken for it.

The process supervisor that earlier phases left as a set of primitives — a fixed launch plan, a
per-launch credential, a health poll, a bounded restart — is now a first-class subsystem (Phase 6.2,
§10 above): policy-driven recovery, health monitoring surfaced through the lifecycle into the UI, and
graceful start/stop driven by the running application.

Phase **6.3** established the local database lifecycle and the file-system layer: the database and
the content store now live under the OS application-data directory, separated by environment, with a
content-addressed byte store and a metadata-owning file store — [desktop-storage.md](./desktop-storage.md).
What remains deferred from 6.3 is **backup and restore**, migrating an existing repository `data/`
database into app-data, per-owner quota enforcement, and **encryption at rest for the database and
the content store** — which is a different capability from the OS keychain Phase 6.4 added, and is
not scheduled (TDR-14).

Phase **6.4** gave the keychain the contract it lacked: declared, namespaced credentials; one port in
front of the keychain with an injected-environment implementation for the API process, which cannot
reach a keychain itself; `secure_store_has` so a screen can render "configured" without a value
crossing the boundary; and a vault that reads once at startup and releases on shutdown —
[desktop-secure-storage.md](./desktop-secure-storage.md). What remains deferred from 6.4 is advanced
desktop permission _workflows_ (a user-facing grant/revoke surface), a credential management screen
and automatic rotation.

Implemented in **6.5:** the Windows packaging foundation, the release gate and the safe auto-update
foundation. `packaging.ts` holds every rule about the bundle and is shared by `desktop:verify`
(development severity) and `release:preflight` (release severity); `signing.ts` makes absent,
placeholder or malformed signing material an **error** in production; `version.ts` gives the version
one source and three checked mirrors; `update.ts` is a nine-state machine whose `updated` state
requires reading the installed version back. See [desktop-release.md](./desktop-release.md).

Still deferred from 6.5: the installer is not code-signed (a different capability from the update
signature — TDR-20), no native `UpdatePort` adapter exists yet (TDR-21), no bundle has been produced
on a machine with a Rust toolchain (TDR-18), and nothing renders update state.

Implemented in **6.6:** the failure-boundary hardening, the **build-version handshake** and the
release QA report — [desktop-release-qa.md](./desktop-release-qa.md). Readiness gained its third
clause (the API must be the build the shell shipped), the child-output capture bound and the
abandoned-spawn path closed two leaks the earlier phases could not reach, the IPC bridge curates a
rejected command instead of repeating the transport's text, and `npm run release:qa` maps every
scenario the phase names to the test that proves it while marking what this host cannot exercise.

Still deferred after 6.6: a `cargo build` job in CI, which is what would turn every described parity
check into an executed one (TDR-13); a real Windows release pass — an installer produced, signed,
installed and inspected (TDR-18); installer code signing and notarisation (TDR-20); and the native
`UpdatePort` adapter with the update UI (TDR-21).

Deferred to the **Design System phase:** the visual redesign, a new component system and the
shine/glow/shadow/colour overhaul.

---

## 12. Known limitations

Stated plainly, because each one is a place where a defect could still pass.

1. **The native build is not exercised here.** `npm run desktop:verify` reads the shell's _source_
   and configuration; it does not compile it. There is no Rust toolchain in this environment, so
   `cargo build`, `tauri build` and the bundle are unverified — the verifier prints this in its own
   `unverifiable` list rather than letting a green report be read as "the shell was launched".
2. **Runtime behaviour needs a real app.** Window show timing, keychain access, single-instance
   focus, the sidecar handshake and the Rust command handlers are properties of a _running_ shell.
   The TypeScript half of each is tested; the Rust half is reviewed, not executed.
3. **The `desktop:verify` report is a static analysis.** It checks that paths resolve, that versions
   agree, that the command lists match and that the permissions are minimal. It cannot prove a
   permission is _unused_ at runtime.
4. **The environment mode describes the process that verifies, not the packaged app.** A packaged
   binary sets its own environment; nothing here can prove what a shipped bundle will set.
5. **The web and desktop runtimes are verified by contract, not by launching both.** The browser
   suite (`npm run test:e2e`) renders the built interface in a real browser; the shell's own render
   path is not driven in this environment.
6. **`icon.icns` is generated outside this environment.** Only `tauri icon` produces the macOS
   container, and only on macOS. It is reported as a warning, never an error, and it is the one
   platform asset that cannot be produced here.
7. **The Rust supervisor is described, not executed.** `process-state.agreement`,
   `process.policy-agreement` and `protocol.agreement` prove that Rust and TypeScript describe one
   machine with one set of deadlines; nothing compiles or runs the Rust side. The Node supervisor,
   exercised against real child processes, is what those behaviours are tested against (TDR-13).
8. **Windows has no graceful signal.** `std` offers only `TerminateProcess` there, so the API is
   terminated rather than asked and SQLite may need WAL recovery (TDR-12).
9. **Readiness is liveness, not contract version.** The health route answering with the right
   credential is proved; a build or schema version match is not. A mismatched-but-alive API passes.
