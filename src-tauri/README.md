# `src-tauri/` — the desktop shell

The Tauri 2 host for Master Trade. It owns windows, the bundled API sidecar, the OS
keychain, the offline cache and the update channel. It holds no business logic and
no risk math.

Full development guide: **[../docs/desktop-shell.md](../docs/desktop-shell.md)**.

## Layout

| Path                     | Contents                                                                    |
| ------------------------ | --------------------------------------------------------------------------- |
| `tauri.conf.json`        | window, CSP, bundled binary, updater endpoints                              |
| `capabilities/main.json` | the **entire** plugin surface granted to the WebView                        |
| `src/lib.rs`             | plugins, startup sequence (instance → sidecar → health → window), shutdown  |
| `src/sidecar.rs`         | the only place a process is spawned; health probe with the per-launch token |
| `src/commands.rs`        | the command allow-list mirroring `src/desktop/ipc.ts`                       |
| `src/secrets.rs`         | OS keychain access (credentials never touch a file)                         |
| `src/cache.rs`           | bounded offline cache with TTLs, inside the app-data directory              |
| `src/config.rs`          | `config.json` read/write, unknown keys refused, credentials refused         |

## Two rules worth knowing before editing

1. **Do not add a `shell:`/`fs:`/`path:`/`http:` permission.** The WebView is
   deliberately granted none of them: Rust performs privileged work and the
   frontend calls typed commands. `npm run desktop:verify` fails the build if one
   appears, and says why.
2. **Do not add a command in one half only.** `src/desktop/ipc.ts` and
   `src/commands.rs` are checked for parity in both directions, so a command that
   exists in Rust but not in the contract is a verification failure rather than a
   quiet extra capability.

## Quick reference

```bash
npm run desktop:verify   # policy + parity checks over this directory (no Rust needed)
npm run build:sidecar    # package the API binary this shell launches
npm run desktop:dev      # cargo/tauri dev server (needs the Rust toolchain)
npm run desktop:build    # signed bundle for the current platform
```
