# ADR-0031 — Local configuration in the OS app-data directory; credentials only in the keychain

- **Status:** Accepted (Phase 3.6, decision id `DEC-DESKTOP-5-CONFIG`)
- **Date:** 2026-09-20
- **Supersedes:** none (extends [ADR-0022](./ADR-0022-local-api-trust-boundary.md))

## Context

The shell needs preferences the server does not have: window size and position,
startup mode, offline cache lifetime, update channel. They must survive upgrades
and be readable by both Rust and TypeScript. Separately, the app stores an LLM API
key — the single most valuable thing on the machine.

## Decision

**1. The config lives in the per-OS app-data directory**, never beside the
executable:

```
Windows  %APPDATA%\Master Trade\config.json
macOS    ~/Library/Application Support/Master Trade/config.json
Linux    $XDG_CONFIG_HOME/master-trade/config.json   (or ~/.config/master-trade)
```

A path helper (`appDataDir(platform, env)`) is the only place this is computed, and
it takes the environment as an argument, so it is testable without touching the
disk. An installer upgrade cannot erase six months of training history, and a
sandboxed profile can relocate it.

**2. One strict schema, shared and compared.** `config.json` is validated with Zod
`strictObject` — unknown keys are refused, matching the API layer
([ADR-0015](./ADR-0015-validation-zod-single-source.md)). A typo in a hand-edited
file is an error with the offending path, not a silently ignored line. Rust reads
the same file, and `verify.ts` compares the key sets between the two
implementations so they cannot drift.

**3. A malformed file is a hard failure.** Falling back to defaults would hide a
corrupted profile and then overwrite it with those defaults on the next save. A
missing file, by contrast, is normal on first run and produces a warning.

**4. No credential may be written to the config, at any depth.** A recursive check
refuses any key named like a secret — `key`, `token`, `secret`, `password`,
`passphrase`, `credential`, `private_key` — wherever it appears in the tree, and
the **value** is rejected with a policy error rather than filtered out. A
well-meaning "just cache the key here to avoid a prompt" change fails immediately
instead of writing a key to disk in plaintext. LLM keys live in the OS keychain
via `src-tauri/src/secrets.rs`.

Precedence is `defaults < file < explicit overrides`, and overrides are validated
too, so a caller cannot inject an invalid value.

## Alternatives rejected

| Alternative                                              | Why rejected                                                                                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Config beside the executable / in the install directory  | An upgrade overwrites it, a system-wide install may not be writable, and per-user settings in a shared location leak between OS users.     |
| `localStorage` / the WebView's storage                   | Cleared by cache-clearing, invisible to Rust and to a support workflow, and not where a desktop app's settings belong.                     |
| A key-value store (`store` plugin)                       | Loses the strict schema and the ability to hand-edit a file during troubleshooting; and it would add another WebView capability to defend. |
| Environment variables for preferences                    | Not persistent for a desktop user, and awkward to change from the UI.                                                                      |
| Skipping the secret-key check and trusting reviewers     | The check is what makes the rule survive contact with a future change; it is cheap and it has a test.                                      |
| Storing the LLM key encrypted in a file with a local key | Encryption with a key stored next to the ciphertext is obfuscation; the OS keychain is the mechanism that actually exists for this.        |
| Falling back to defaults on a malformed config           | Silently discards the user's settings and then persists the defaults — the failure is postponed rather than surfaced.                      |
| A permissive schema with a warning for unknown keys      | Warnings in a desktop log are not read; a typo that changes behaviour must stop the app with the path named.                               |

## Consequences

**Positive:** settings survive upgrades and are inspectable in a documented place;
the two implementations cannot drift silently; the "key in the config" failure mode
is closed by a test rather than by review; the config never contains a credential,
so it is safe to attach to a bug report.

**Negative:** the recursive key check is broad — a legitimate future setting named
`cacheKeys` would be refused and would need a rename or an explicit exception. Both
outcomes force a conversation, which is the intent.

**Security impact:** positive, and it keeps the blast radius of the file small:
the config is not a secret store, so it can be shared in diagnostics.

## References

- [desktop-and-frontend.md § 3](../desktop-and-frontend.md), [desktop-shell.md](../desktop-shell.md)
- `src/desktop/config.ts`, `src-tauri/src/config.rs`, `src-tauri/src/secrets.rs`
