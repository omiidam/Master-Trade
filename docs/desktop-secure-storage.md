# Desktop secure storage (Phase 6.4)

Where a credential lives, who may ask for it, and what happens when there is no keychain at all.

Status legend: **Implemented** · **Partial** · **Deferred** · **Requires review**.

---

## 1. Architecture

Four layers, each with one job. A credential value exists in exactly one of them at a time.

```
React page                       never holds a value just to display state
  │  credentialConfigured() → has()
  ▼
shellBridge.secureStore          @shared/desktop/ipc  (typed, validated, allow-listed)
  │  shell command
  ▼
Rust commands.rs                 secure_store_{get,set,delete,has}
  │
  ▼
secrets.rs                       the one file that reaches the OS keychain
  ═══════════════════════════════════════════════════════════════════════════
API process (Node)               InjectedEnvironmentStorage  ← what the shell injected
  │
  ▼
CredentialVault → resolver       the only thing that turns a ref into a value
```

| Module                                   | Role                                                                                                                    |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/desktop/secrets.ts` | **The contract.** Namespace, declared credentials, key/value validation, the unavailable fallback, the port.            |
| `src-tauri/src/secrets.rs`               | **The keychain.** One namespace-checked entry per credential; no enumeration.                                           |
| `src/desktop/secure-store.ts`            | **The validation layer.** Decides what may be asked of a port; answers existence from `has`; metadata-only projections. |
| `src/desktop/credential-vault.ts`        | **The lifecycle.** Reads once at startup, releases on shutdown, rotates, and is the only holder of a value.             |

**Implemented.** No new dependency was added: the keychain already existed in
`src-tauri` behind the `keyring` crate, and the work was to give it a contract, a namespace and a
lifecycle rather than to buy a mechanism.

---

## 2. Keychain strategy

- **Service** `app.mastertrade.desktop` — the OS entry's owner. Set once in `secrets.rs`.
- **Account** the credential key, always under `master-trade/`.
- Platforms: macOS Keychain, Windows Credential Manager, Secret Service on Linux — whatever
  `keyring` resolves to on the host.
- **No plugin permission is granted to the WebView.** Credential access is a Rust command, so a
  compromised page cannot reach the keychain even by calling the OS correctly; the capability file
  grants no `store:` or `keyring` permission and `desktop:verify` refuses one.
- **No filesystem or database fallback exists anywhere.** Not a "not yet" — a refusal. A
  credential on disk is the thing this phase exists to avoid.

---

## 3. Namespace rules

Two halves, both required:

1. **Service** separates us from other applications' entries.
2. **Key prefix** `master-trade/` (`SECRET_NAMESPACE_PREFIX`) makes the namespace a property of the
   credential rather than of the code that happens to call the module.

Rust and TypeScript each hold the prefix, and `desktop:verify` fails the build if they drift
(`secrets.namespace-agreement`). Validation, on both sides: the prefix, an identifier shape (no
whitespace, no control characters, letters/digits/`.`/`_`/`-`/`/`), no `..` segment, no backslash.

### The declared credentials

Adding one is a deliberate edit in three places (the contract, the Rust namespace check's consumers,
and the shared-surface consumer), which is the point.

| Credential                     | Required | May be read by         | Leaves the device                             |
| ------------------------------ | -------- | ---------------------- | --------------------------------------------- |
| `master-trade/session/token`   | yes      | `web/realtime/session` | no                                            |
| `master-trade/ai/provider-key` | no       | `server/agent-gateway` | yes                                           |
| `master-trade/probe`           | no       | `desktop/shell-status` | n/a — the shell's keychain reachability check |

A key that is well-shaped but **undeclared is refused as a policy violation**, so a command cannot
be used to probe for entries this product does not know about, and a typo cannot silently create a
new one.

---

## 4. IPC boundary

`React → typed service → explicit Tauri command → validation → OS keychain → typed result`

- The command surface is an **exact allow-list** (`SHELL_COMMANDS`), pinned by a test, and the Rust
  handler list is compared against it in both directions (`commands.contract-parity`).
- Credential commands are four: `secure_store_get`, `secure_store_set`, `secure_store_delete`, and
  `secure_store_has` (new in protocol **v3**).
- `has` exists so a screen can render "configured" **without the value crossing the boundary**.
  Before it, the only way to ask was `get`, which put a credential into page state purely to compare
  it against `null`. The frontend's `credentialConfigured()` now uses it.
- **Nothing enumerates.** `secrets.no-enumeration` refuses any command name that lists, dumps or
  exports credentials, and `secrets.rs` has no listing function to expose.
- Keys are validated in the frontend _before_ the call, so a malformed request never reaches the
  shell — proven by asserting the injected `invoke` was never called.

**Implemented.**

---

## 5. Permission model

| Question                        | Answer                                                                             |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| What may the WebView ask for?   | The commands in `SHELL_COMMANDS`, nothing else.                                    |
| What may a command touch?       | `secrets.rs`, via names beginning `secure_store_`.                                 |
| What may touch the OS keychain? | One file. `secrets.single-keyring-file` fails the build otherwise.                 |
| What may be stored?             | Only a declared credential, with a bounded non-empty value.                        |
| What may be listed?             | Nothing.                                                                           |
| Who may read a value?           | The composition root that builds a provider, through `CredentialVault.resolve`.    |
| What may a capability see?      | `describe()` / `toJSON()` — ids, sources, loaded flags and reasons. Never a value. |

An **undeclared keychain reference throws** rather than being ignored: asking for a credential the
product does not declare is a programming error or an attack, not a configuration state. An absent
or unreadable credential is the opposite — reported, and the app keeps running.

`desktop:verify` checks all of this from the Rust source, on a machine with no Rust toolchain: five
`secrets.*` checks, alongside the process and capability checks from Phases 6.1–6.3.

---

## 6. Lifecycle

```
APP START
  → credential channel constructed            (keychain in the shell; injected env in the API process)
  → vault.load()                              once; every failure reported, never thrown
  → metadata logged                           ids, loaded flags, reasons — no values
  → DESKTOP READY                             offline adapter answers if a provider key is absent

SHUTDOWN
  → vault.clear()                             every in-memory reference released, before the socket closes
  → sockets closed → process exits
```

`startServer()` (`npm run api`) is where this is wired for the API process: it builds a vault over
`InjectedEnvironmentStorage`, loads the declared credentials, logs **metadata only**
(`credentials.loaded`), passes `resolveSecret` into the server, and clears the vault in its
`shutdown` handler. Clear-before-close is deliberate: a supervisor that restarts the API without
restarting the shell must not find a value reachable in the process it believes it stopped.

### Why the API process reads injected credentials

The API is a **separate Node process**; only the Rust shell can reach the OS keychain. So the shell
hands a credential to the API process through its own environment, under a name derived from the
credential id (`credentialEnvName` → `MASTER_TRADE_CREDENTIAL_AI_PROVIDER_KEY`). This is the same
mechanism the shell already uses for the per-launch API token.

Before this phase, `resolveSecretFromEnv` returned `null` for every `keychain` reference
unconditionally ("only the desktop shell can do this"), so the vault closes a documented hole:
`tests/desktop-secure-storage.test.ts` asserts both halves side by side — the environment-only
resolver still answers `null`, and the vault answers the value once the shell has supplied it.

Resolution is **synchronous** because the gateway's resolver is: a value is read once at startup
rather than on every model call.

---

## 7. Failure behaviour

| Situation                                       | Behaviour                                                                                                                                     |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| No keychain (browser, or the shell not running) | `get` → `null`, `has` → `false`, `set`/`delete` → typed refusal. A preview never claims to have stored a credential.                          |
| Keychain unreachable in the shell               | `availability()` reports false with a curated reason; `summary()` marks every credential unconfigured; the app still starts.                  |
| Credential missing                              | `resolve` → `null`; the provider endpoint is **skipped with a reason** by the gateway composition, not invented; the offline adapter answers. |
| Credential unreadable / denied                  | Recorded as `the credential could not be read`. The platform message is deliberately not surfaced — it can name an entry.                     |
| Rotation                                        | `rotate()` writes the store and memory together.                                                                                              |
| Deletion                                        | `remove()` deletes both; absent is then a normal state, not an error.                                                                         |
| Released vault                                  | `resolve` → `null` for everything; `describe()` still answers, because metadata holds no value.                                               |

---

## 8. Browser fallback

`UnavailableSecureStorage` and `browserShellBridge()` implement the honest no-keychain behaviour, and
the browser bridge reports `secure-store` in `unavailable[]` with a reason — the Settings screen
renders that instead of pretending. The browser cannot invoke a native keychain operation because it
has no bridge to one: `resolveInvoke()` finds no Tauri internals outside the shell, so the bridge
falls back to the browser implementation.

---

## 9. Security assumptions

1. **The OS protects the entry.** We rely on the platform keychain's own access control; we do not
   add a second encryption layer. A machine where another process can read the OS keychain is a
   machine where this design offers nothing, and no local design fixes it.
2. **The shell is trusted; the WebView is not.** The boundary is the IPC contract, which is why the
   contract is the thing that is tested.
3. **The injected environment is private to the child process.** A credential in the sidecar's
   environment is visible to anything that can read that process's environment (`/proc` on Linux,
   Process Explorer on Windows, the same user's own shell). This is the same trust assumption the
   per-launch API token has had since Phase 6.2.
4. **Logs are redacted twice.** `Logger` redacts sensitive-looking keys and token-shaped strings, and
   the vault only ever offers metadata.
5. **The value never enters Agent reasoning.** `CredentialVault` is not memory: no credential is
   written to `memory_records`, and `toJSON()` is the only projection a context builder can use —
   so a turn can know that a provider key exists without the key being in its input.

---

## 10. Known limitations

1. **No credential management UI.** Setting a key is a shell command or an environment variable;
   there is no screen. Deliberate for this phase ("minimal internal integration is sufficient").
2. **Rotation is not automatic.** `rotate()` exists and is tested; nothing calls it on a schedule,
   and there is no expiry tracking.
3. **The Rust half is described, not executed.** There is no Rust toolchain in this environment, so
   `secure_store_has`, the namespace check and the single-keyring rule are verified from source and
   listed in the verifier's `unverifiable` set (TDR-13 for the same reason).
4. **A keychain read is not cached across restarts.** Each launch reads once; there is no encrypted
   on-disk cache, because a cache is a second place a credential lives.
5. **The injected-environment channel can be enumerated by the local user.** See assumption 3. A
   control socket or a stdin handshake would be stronger and is not in scope.
6. **`master-trade/probe` is written only by the shell.** Until the shell writes it, a standalone
   API process reports the probe as unconfigured — harmless, but it is why the injected port
   answers `availability()` from the channel rather than from the probe.

**Requires review:** none of the items above is a legal or financial-characterisation question.
Credential handling itself falls under the security-review items already tracked in
`security-and-privacy.md` §14.

---

## 11. Deferred to Phase 6.5 / 6.6

| Phase | Deferred                                                                                                                                                                                   |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 6.5   | installer, signing and notarisation (which is what makes the keychain _entry_ trustworthy to the OS), auto-update                                                                          |
| 6.6   | final hardening and release QA: a native build that exercises the keychain for real, code-signing verification, and an end-to-end check that a signed build can read a credential it wrote |
| Later | a credential management screen; automatic rotation and expiry; a control-socket credential channel instead of the process environment                                                      |

Nothing in 6.5 or 6.6 was started here. Live trading and broker execution remain disabled:
`liveTradingEnabled` and `brokerExecutionEnabled` are literal `false`, asserted by `safety` and
`release-baseline`.

---

## 12. Where this is tested

`tests/desktop-secure-storage.test.ts` — 29 tests:

- **contract** — namespaced and declared credentials, unique ids, non-namespaced / traversal /
  malformed / control-character keys refused, undeclared-but-namespaced refused as policy, key
  masking, no key echoed in an error, deterministic environment names, the unavailable fallback;
- **store** — get/overwrite/delete/absent-as-`null`, undeclared and empty and oversized values
  refused, no value in any error or metadata projection, availability from the port rather than
  optimism, `requiredCredentialsPresent`;
- **boundary** — the five `secrets.*` verifier checks pass, the Rust namespace equals the contract's,
  only `secrets.rs` references the keyring crate, no enumeration function or command exists, all four
  credential commands are present on both sides at protocol v3, malformed keys never reach the shell,
  and the browser bridge refuses writes while answering reads honestly;
- **lifecycle** — load/resolve/metadata, absent credential, unreachable store, undeclared reference
  refused, environment references unchanged, rotate/remove/clear/reload, no value in a structured log
  record, resolution only through the resolver, injected credentials readable but not writable in the
  API process, and the closed `resolveSecretFromEnv` hole.
