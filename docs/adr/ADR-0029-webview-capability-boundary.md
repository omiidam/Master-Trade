# ADR-0029 — The WebView is granted no `shell:` permission; Rust spawns the sidecar

- **Status:** Accepted (Phase 3.6, decision id `DEC-DESKTOP-3-CAPABILITIES`)
- **Date:** 2026-09-20
- **Supersedes:** none (implements the capability half of [ADR-0022](./ADR-0022-local-api-trust-boundary.md))

## Context

The shell must run the TypeScript API as a child process, read and write the OS
keychain, cache lesson content, and write `config.json`. Tauri gives two ways to
do this. Either the WebView is granted `shell:allow-spawn`/`allow-execute` (and
`fs:`/`store:` equivalents) and the frontend drives the child process, or the
**Rust host** does the privileged work and the WebView calls typed commands.

The first option is what most Tauri sidecar examples show, and it is the one that
turns a single XSS or a compromised dependency in the WebView into arbitrary
process execution on the user's machine. This is the layer that holds an LLM API
key and a six-month training history.

## Decision

The WebView receives **five** permissions and nothing else:

```
core:app:default  core:event:default  core:window:default
core:window:allow-hide  core:window:allow-show
```

No `shell:`, `fs:`, `path:`, `http:`, `process:`, `store:`,
`global-shortcut:` or `notification:` permission, and no `core:default` catch-all.
Following the Tauri 2 documentation, a sidecar spawned **by Rust** needs no shell
permission in the capability file at all — the permission is only required to let
the _WebView_ spawn. So the design keeps the capability it would have to defend
and simply does not take it.

The boundary is enforced three ways:

1. `src/desktop/capabilities.ts` holds the allow-list **with a written reason for
   each forbidden family**, so removing an entry produces a test failure that
   explains itself rather than a silent widening.
2. `src/desktop/verify.ts` parses the real `capabilities/main.json` and fails on
   any permission not on the allow-list, plus specific dangerous entries
   (`core:window:allow-create`, `core:window:allow-set-always-on-top`, …).
3. Command-name parity is checked **in both directions** between
   `src/desktop/ipc.ts` and `src-tauri/src/commands.rs`, so a Rust-only command is
   a verification failure rather than a quiet extra capability.

No command returns a filesystem path: `export_report` returns a file name and the
shell resolves the destination.

## Alternatives rejected

| Alternative                                                           | Why rejected                                                                                                                                                     |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shell:allow-spawn` for the WebView, as in the common sidecar example | One injection in the WebView becomes arbitrary process execution. The cheapest capability to secure is the one never granted.                                    |
| `core:default` as a convenient baseline                               | A moving target: it grows with Tauri releases, so an upgrade could grant something no one reviewed.                                                              |
| Granting `fs:` and scoping it with `allow: [...]` to the app-data dir | Scope paths are string prefixes; still a WebView-driven filesystem API, and the frontend never actually needs one. A typed Rust command is smaller and testable. |
| `http:allow-fetch` for the API calls                                  | Would let the WebView reach **any** allowed host; the CSP already limits it to the loopback origin, and the bridge calls the API the way the frontend does.      |
| Enabling permissions "for now" and tightening later                   | Permissions are the kind of thing that never gets tightened; the allow-list is cheap now and expensive to retrofit after code depends on it.                     |
| Relying on the CSP alone for the security boundary                    | The CSP governs what a page may load, not what native APIs it may call. It is a second layer, not this one.                                                      |

## Consequences

**Positive:** the WebView has no primitive to start a process with, so the worst
case for a compromised page is the typed command surface — every entry of which is
reviewed, validated and listed. The rule is machine-checked and self-explaining.

**Negative:** every new capability must be implemented in Rust and exposed as a
command, which is slower than granting a plugin permission. This is accepted as
the cost of the boundary, and § 6 of
[desktop-shell.md](../desktop-shell.md) documents the procedure.

**Security impact:** strongly positive. The permission surface is five items long
and reviewed as a unit.

## References

- [desktop-and-frontend.md § 3](../desktop-and-frontend.md), [desktop-shell.md](../desktop-shell.md)
- `src/desktop/capabilities.ts`, `src/desktop/verify.ts`, `src-tauri/capabilities/main.json`
- Tauri 2: security capabilities and sidecar documentation
