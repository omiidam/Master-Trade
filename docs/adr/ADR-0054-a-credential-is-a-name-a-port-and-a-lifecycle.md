# ADR-0054 — a credential is a name, a port and a lifecycle

- **Status:** Accepted
- **Decision id:** `DEC-DESKTOP-9-CREDENTIALS`
- **Phase:** 6.4 (Secure Storage, OS Keychain & Desktop Permissions)
- **Depends on:** ADR-0001 (Tauri over Electron), ADR-0022 (local API trust boundary), ADR-0029
  (WebView capability boundary), ADR-0031 (desktop config, app-data and keychain), ADR-0051 (the
  shell hosts and the domain decides), ADR-0053 (bytes have no owner, and metadata has no path).

## Context

The OS keychain has existed since Phase 2. `secrets.rs` wrote and read entries, three commands
exposed it to the WebView, and the config system modelled a secret as a `SecretRef` that names an
entry rather than carrying one. Three things were nonetheless missing, and each one was load-bearing.

1. **Nothing said which credentials exist.** `validate_key` checked _shape_: letters, digits, dots,
   dashes, slashes, up to 120 characters. Any well-shaped name was a legal keychain entry, so the
   product could not distinguish its own credential from a typo or a probe, and a future "just store
   this too" would have been invisible in review.
2. **A keychain reference could never resolve.** `resolveSecretFromEnv` returned `null` for every
   `kind: 'keychain'` ref with the comment _"only the desktop shell can do this"_. The comment was
   true — the API is a separate process and cannot reach the OS keychain — and the consequence was
   that a keychain-backed provider key could not be configured **at all**. A documented capability
   with no path to being used is a claim that does not hold.
3. **A read was the only way to ask a question about state.** The status card wanted "configured";
   the only command was `get`. So the frontend held the secret in page state purely to compare it
   against `null` — a credential in the WebView for no reason other than the absence of a `has`.

## Decision

**A credential is a declared name, a port, and a lifecycle — and the value is reachable in exactly
one place.**

1. **Declared names.** `packages/shared/src/desktop/secrets.ts` holds the namespace
   (`master-trade/`), the identifiers, the key and value validation, and the list of credentials the
   product has. A well-shaped but undeclared key is refused as a _policy violation_, not a validation
   failure: the name is fine, the credential does not exist. There is still no enumeration — `has`
   answers about one named credential and nothing answers about a set.
2. **One port, two implementations.** `SecureStoragePort` is `get`/`set`/`delete`/`has`. Behind it:
   the Rust shell for the real keychain, `InjectedEnvironmentStorage` for the API process, and
   `UnavailableSecureStorage` for a browser. The API process reads what the shell injected under
   `credentialEnvName(id)` — the same mechanism the per-launch API token already uses — so a
   keychain reference resolves without the API ever touching a keychain it cannot reach. `set` and
   `delete` **refuse** there rather than writing anywhere else; a filesystem- or database-backed
   fallback is the one implementation of this interface that must not exist.
3. **Existence without the value.** `secure_store_has` (protocol **v3**) was added so a screen can
   render state without materialising a secret, and `credentialConfigured()` now asks it rather than
   reading.
4. **A locked-down keychain boundary, machine-checked.** Rust requires the prefix and refuses
   traversal; one file (`secrets.rs`) may reference the keyring crate; credential commands are named
   `secure_store_*` and nothing else may call `secrets::`; no command may enumerate. Five
   `secrets.*` checks in `desktop:verify` fail the build on drift, because the half that reaches the
   OS keychain is the half this environment cannot execute.
5. **One holder, one lifecycle.** `CredentialVault` reads at startup (every failure **reported**,
   never thrown), serves the gateway's synchronous resolver, rotates and removes, and `clear()`s
   every in-memory reference on shutdown. `describe()` and `toJSON()` are metadata only, so the
   vault being logged or serialised cannot leak a value — and a reasoning turn can know a provider
   key exists without the key being anywhere in its input.

## Alternatives rejected and why

**Keep validating shape only, and document which keys are used.** Cheapest, and it is what the
codebase had. Rejected: the product's own credential and an arbitrary future one would be
indistinguishable, which is exactly the state a security review cannot conclude anything from.

**Make `resolveSecretFromEnv` accept a keychain ref from any environment variable.** One line, and
it makes the ref resolve by letting _any_ process set _any_ variable to impersonate a keychain
entry. Rejected: it erases the distinction between "the shell supplied this credential" and "someone
exported this variable", which is the only thing the `kind` field means.

**Give the API process a say in credential state — `load`, `save`, `delete` over the port.** The
port would then be symmetric and the API could rotate a key itself. Rejected: the API is the least
trusted of the two trusted processes and has no keychain; the correct asymmetry is that it may read
what it was handed and may not write anything.

**Hold credentials in the React state tree so the Settings screen can show them back.** Rejected for
the obvious reason, and it is what `has` removes the _temptation_ to do: the screen's question is
about state, and state is answerable without the secret.

**Add `secure_store_list` so the UI can show every stored credential.** Rejected: enumeration is the
capability that turns a read into a discovery tool, and the declared list already answers the
question the UI actually has — for credentials the product knows about, which is all of them by
definition.

**A second, thinner wrapper in the frontend that validates keys itself.** Rejected: the frontend
already validates through the shared contract before the call, and a second validator is a second
set of rules to keep in step — the failure mode this codebase has now fixed twice (the runtime
predicate in 6.1, the process machine in 6.2).

## Consequences

- **A credential must be declared to exist.** Adding one is an edit to the contract, which is a diff
  a reviewer will see, and the boundary test requires the module to be consumed.
- **`resolveSecretFromEnv`'s hole is closed in the open.** The old behaviour is still asserted in the
  test suite, next to the vault answering the same reference — so the change is visible rather than
  quietly replaced.
- **Protocol v3.** One command added; the command list is pinned by a test and compared against the
  Rust handler list in both directions.
- **The namespace is enforced twice**, in Rust and in TypeScript, and a drift fails the build. The
  duplicated constant is deliberate: neither side can be the only one that is right.
- **The credential surface is small and named.** Four commands, one prefix, no list, no dump, no
  export.
- **The vault is not memory.** Nothing writes a credential to `memory_records`, and the only
  projection offered carries no value — which is what keeps a secret out of a reasoning context by
  construction rather than by discipline.
- **The Rust behaviour remains unverified here** (no toolchain; TDR-13), and the verifier says so.
  What is proven is that the two descriptions agree.
- **A credential in the sidecar's environment is readable by the same user's other processes.** This
  is the trust assumption the per-launch token already makes, now stated rather than implied, and a
  control-socket channel is deferred rather than dismissed (TDR-17).
- **There is no credential management UI and no automatic rotation**, so a value is set by a command
  or an environment variable and rotated by hand. Deferred to a later phase, on purpose.
