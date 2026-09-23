# Desktop Shell — Development Guide

How to build, run, extend and verify the Tauri shell around Master Trade. This
document is the working guide; the architecture — the shell's purpose, the Web/Desktop
boundary, the IPC and permission model, the lifecycle, the configuration modes and what
is deferred — is in [desktop-architecture.md](./desktop-architecture.md), the bundled API process
and the states it is reported in are in [desktop-runtime.md](./desktop-runtime.md), and the
shell-versus-Electron decision is in [desktop-and-frontend.md](./desktop-and-frontend.md).

> **Status:** the shell is source-complete and policy-verified. It has not been
> compiled here, because this repository and its CI have no Rust toolchain. Every
> check that does not need a compiler runs in the normal test suite.

---

## 1. Layout

```
src-tauri/                  Rust host (the only code that can do privileged work)
  tauri.conf.json           window, CSP, bundled binary, updater endpoints
  capabilities/main.json    the entire WebView permission surface
  Cargo.toml                version must equal package.json (checked)
  build.rs
  src/lib.rs                plugin list, startup sequence, shutdown
  src/main.rs               thin binary entry
  src/sidecar.rs            the only `Command::new` in the repository
  src/secrets.rs            OS keychain access
  src/cache.rs              bounded offline cache with TTLs
  src/config.rs             config.json read/write
  src/commands.rs           the command allow-list
  icons/                    placeholders (see icons/README.md)
  README.md                 the two rules, for people editing Rust

src/desktop/                TypeScript policy layer (executable, tested)
  capabilities.ts           allow-list, forbidden-permission reasons, parser
  ipc.ts                    command set, ShellBridge, browser stand-in
  config.ts                 app-data dir, strict schema, credential refusal
  lifecycle.ts              startup/shutdown order as a state machine
  sidecar.ts                launch plan, health gate, restart budget
  host.ts                   SecureStore / OfflineCache contract (Phase 1)
  verify.ts                 reads src-tauri/ and proves the halves agree
  cli.ts                    `npm run desktop:verify`

web/src/desktop/            Frontend side
  bridge.ts                 resolves the shell bridge, or the browser stand-in
  useShellStatus.ts         `inShell`, sidecar state, base URL for the UI

tests/desktop-shell.test.ts 29 tests: capabilities, IPC, config, lifecycle, sidecar
scripts/build-sidecar.mjs   packages the API binary the shell launches
```

---

## 2. The policy model in one paragraph

The WebView is granted **five** permissions and no others: `core:app:default`,
`core:event:default`, `core:window:default`, `core:window:allow-hide`,
`core:window:allow-show`. It holds **no `shell:`, `fs:`, `path:`, `http:`,
`process:`, `store:` or `global-shortcut:` permission**, and no `core:default`
catch-all. Privileged work — spawning the API, reading the keychain, writing the
cache and config, resolving an export destination — happens in Rust and is reached
through typed commands. That is why the WebView needs no spawn right: it never
starts a process. `src/desktop/capabilities.ts` carries the allow-list
_and the reason each forbidden family is forbidden_, so a removal shows up as a
failing test that explains itself.

---

## 3. Getting set up

### Prerequisites

| Need                  | For                                                                            |
| --------------------- | ------------------------------------------------------------------------------ |
| Node 20+ and npm      | everything except the Rust build                                               |
| Rust stable + Cargo   | `npm run desktop:dev`, `npm run desktop:build`                                 |
| Platform WebView deps | Linux: `libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev` |

Nothing about the policy layer requires Rust. That is deliberate: on a machine
without a toolchain you can still verify every rule.

### Reproduce a working checkout

```bash
npm ci                 # or: npm install
npm run build          # the sidecar runs from dist/
npm run build:web      # the WebView loads web/dist/
```

### The API sidecar binary

`npm run build:sidecar` assembles the executable the shell launches. It copies
`dist/` and `node_modules` into a package built for the **target triple**, because
Tauri resolves a sidecar by the `externalBin` entry plus that triple.

```bash
npm run build:sidecar                      # host triple
npm run build:sidecar -- --target aarch64-apple-darwin
npm run build:sidecar -- --dry-run         # print the artifact names
```

The script fails when `web/dist/` or `dist/` is missing, so it cannot package a
half-built app.

---

## 4. Running it

```bash
npm run desktop:dev     # tauri dev — starts the Vite server and the shell
npm run desktop:build   # bundle for the current platform
```

`tauri dev` expects the WebView dev server on the port in `tauri.conf.json`
(5173, the Vite default) and, in development, the sidecar checks out of `dist/`.
The shell always supplies the API's data directory, port and per-launch token
itself; there is no environment setup for the developer to remember.

In a browser (`npm run dev`) everything still works and _says_ it is a browser:
`useShellStatus()` reports `inShell: false`, the Topbar shows the status dot as
unavailable, and the Settings page reports every shell capability as
"not available in a browser" rather than pretending. Secure-store writes fail
loudly instead of silently doing nothing.

---

## 5. Verifying

```bash
npm run desktop:verify   # 22 checks over src-tauri/ and src/desktop/ — no Rust
npm test                 # includes tests/desktop-shell.test.ts
npm run validate         # format:check, both typechecks, tests, both builds, verify
```

`desktop:verify` is the interesting one. It parses the real files and checks, among
others:

| Check                      | What it proves                                                   |
| -------------------------- | ---------------------------------------------------------------- |
| `capabilities.policy:*`    | every granted permission is on the allow-list, none is forbidden |
| `capabilities.required`    | the permissions the code depends on are actually granted         |
| `commands.contract-parity` | Rust commands and `ipc.ts` match **in both directions**          |
| `shell.spawn-location`     | `Command::new` appears only in `sidecar.rs`                      |
| `port.agreement`           | 4317 in Rust, TypeScript and the backend default                 |
| `config.schema-parity`     | the Rust and TypeScript config key sets agree                    |
| `version.agreement`        | `package.json` = `tauri.conf.json` = `Cargo.toml`                |
| `csp.present`              | the CSP exists and is restrictive                                |
| `updater.pubkey`           | a placeholder signing key is a **warning**, a release blocker    |

It prints a section for what it cannot cover — the native build, runtime window
timing, keychain round-trips, the bundled binary, code signing — so a green
report is not mistaken for a tested app. Exit code is non-zero on any error.

---

## 6. Changing things

### Adding a command

Both halves, in one change, or verification fails:

1. `src/desktop/ipc.ts` — add to `SHELL_COMMANDS` and expose it on `ShellBridge`
   (and decide what the browser stand-in does: fail loudly, or honestly no-op).
2. `src-tauri/src/commands.rs` — a `#[tauri::command]` with the same name.
3. `src/desktop/verify.ts` — if the command is intentionally Rust-only, list it in
   the documented exemption set; otherwise nothing to do.
4. Test it in `tests/desktop-shell.test.ts`.

### Adding a permission

**Do not.** If a design genuinely needs one, it is a design discussion first: the
forbidden list is the boundary, and an addition means editing
`src/desktop/capabilities.ts` with a written reason. Prefer doing the work in Rust
and exposing a typed command.

### A note on returning paths

No command may return a filesystem path. Export returns a **file name**; the shell
resolves the destination. If a new feature needs a location, pass storage ids and
let `src/storage/files.ts` own the mapping.

---

## 7. Troubleshooting

| Symptom                                             | Cause and fix                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------ |
| `desktop:verify` fails `commands.contract-parity`   | a command was added on one side only — see § 6                                 |
| `capabilities.policy` fails, naming a permission    | someone granted a `shell:`/`fs:`/`path:` permission; the message says why not  |
| `port 4317 is already in use`                       | another instance, or a stale child. The shell reports it; it will not relocate |
| `the API did not answer …/v1/health within 20000ms` | the sidecar crashed on start — check the shell log, then run `npm run api`     |
| `desktop config is invalid`                         | a hand-edited `config.json`: a bad value or an unknown key. Both are reported  |
| `refusing "config.x.y": credentials belong in …`    | a credential-shaped key in the config file; use the keychain                   |
| Window opens before the app is usable               | should not happen: `lifecycle.ts` gates the window on readiness                |
| `tauri: command not found`                          | no Rust toolchain; the policy layer still works, `desktop:verify` included     |
| Sidecar restarts repeatedly then gives up           | the restart budget working as intended — read the reported exit code           |

---

## 8. Known limitations

- **No compiled bundle.** No Rust toolchain here, so `cargo build`, signing and
  notarisation are unexercised. The verifier says so in its own report.
- **Update signing key is a placeholder.** `updater.pubkey` is a warning until a
  real key is configured; the updater must not ship before then.
- **Icons are placeholders** (`src-tauri/icons/README.md`) — `tauri build` needs
  real ones.
- **Keychain access is unverified at runtime.** The command and the contract are
  tested; the OS prompt is a built-app concern.
- **The cache value cap is enforced by the command**, not yet by a byte-budget
  eviction policy across keys.
