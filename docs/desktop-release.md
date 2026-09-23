# Desktop release: packaging, signing and updates

Phase 6.5. Three things a desktop application has that a web application does not: an installer, a
signature, and a way to replace itself. Each one has a failure mode that only appears after the
product is on someone's machine, so each one is decided by a rule in the repository rather than by
whoever runs the build that day.

**Scope of this phase.** The Windows packaging foundation, the signing boundary, and the safe
auto-update foundation. Not installer signing certificates, not notarisation, not a release QA pass
— those are Phase 6.6. Not a UI for updates, and not the Design System.

- Rules: [`src/desktop/packaging.ts`](../src/desktop/packaging.ts),
  [`signing.ts`](../src/desktop/signing.ts), [`version.ts`](../src/desktop/version.ts),
  [`update.ts`](../src/desktop/update.ts)
- Commands: `npm run release:check`, `release:sync-version`, `release:signing`,
  `release:preflight`, `desktop:package`
- Verifier: `npm run desktop:verify` reports the same rules at development severity
- CI: [`.github/workflows/release.yml`](../.github/workflows/release.yml)

---

## 1. One version, four surfaces

`0.6.0` is written in four files, read by four different systems:

| surface                     | role   | why it has to agree                                                 |
| --------------------------- | ------ | ------------------------------------------------------------------- |
| `package.json`              | source | the number a release tool and a human both read                     |
| `src-tauri/tauri.conf.json` | mirror | names the bundle; is what `shell_status` reports as `appVersion`    |
| `src-tauri/Cargo.toml`      | mirror | is the version the compiled binary and the OS uninstall entry carry |
| `src/core/config.ts`        | mirror | is what the health endpoint and the API boot report to the shell    |

A drift is not cosmetic. A packaged installer whose `Cargo.toml` is stale produces a binary that
reports the _old_ version through `shell_status` while its update metadata announces the new one —
so the updater either re-installs what is already there or decides a newer build is present and
skips it. `src/core/config.ts` had already drifted out of the verifier's sight once, which is why it
is the fourth surface rather than an afterthought.

```bash
npm run release:check          # report every surface, exit 1 on drift
npm run release:sync-version   # write the source version into every mirror
```

`release:sync-version` rewrites only the mirrors that disagree, and **re-reads what it wrote**: a
rewrite that matched the wrong thing throws instead of reporting success it cannot evidence. The
check itself is `version.agreement` in `desktop:verify`, which is the id that check has always had —
the rule was widened, not duplicated.

`src/core/config.ts` is also read as its compiled value (`runtimeConfigVersion()`), so a build whose
file has changed since it was compiled is visible rather than assumed.

---

## 2. What a bundle is allowed to contain

`tauri build` will happily package a tree that is missing its sidecar, is carrying a stale version,
or has a private key sitting next to it. Those questions are answered before the bundle exists, by
`preflightPackaging`, which has two callers and one rule set:

| caller                      | mode        | missing sidecar | source map | signing material |
| --------------------------- | ----------- | --------------- | ---------- | ---------------- |
| `npm run desktop:verify`    | development | warning         | **error**  | warning          |
| `npm run release:preflight` | release     | **error**       | **error**  | **error**        |

Only severities change with the mode, never the rule, and no check is quiet about it: the detail line
says which mode allowed it. The checks:

- **identity** — `productName`, `identifier` and `version` present; the identifier is lowercase
  reverse-DNS. It is load-bearing beyond the bundle: it is the keychain service name from Phase 6.4,
  so an identifier that drifted would leave stored credentials unreadable.
- **`package.windows-targets`** — `bundle.targets` includes `msi`, `nsis` or `all`.
- **`bundle.icons-present`**, **`package.icon-windows`**, **`bundle.icons-macos`** — every declared
  icon resolves; exactly one `.ico` exists (a Windows bundle cannot be built without one); the
  `.icns` is reported separately because it needs a macOS toolchain.
- **`bundle.externalBin`**, **`package.sidecar-built`** — the sidecar is declared exactly once, and
  the staged binary is present.
- **`package.frontend-dist`** — `web/dist/index.html` exists before packaging.
- **`package.no-source-maps`** — **this rule caught a real defect.** `vite.config.ts` had
  `sourcemap: true`, so `web/dist` carried a map of the entire frontend and the installer would have
  shipped it. Source maps are now opt-in (`MASTER_TRADE_SOURCEMAPS=1 npm run build:web`) and the
  check refuses any map in either mode, because a map is never part of a release and a rule with an
  exception is a rule nobody can verify.
- **`package.no-dev-artifacts`** — no environment file, git directory, dependency tree, log artefact
  or local `data/` directory inside the shipped frontend.
- **`package.no-secret-material`** — the _built_ frontend is scanned for PEM private keys, minisign
  secret keys and hard-coded credentials. Scanning source would be noise; bundling is the step that
  turns a mistake into a leak.
- **`package.no-signing-material`** — no `.pem`, `.key`, `.p12`, `.pfx`, `.p8` or `.sig` file exists
  anywhere in the tree. This is the strongest form of "no private signing key in the repository":
  not a review step, a check that walks the tree, and `.gitignore` lists the same extensions so an
  accidental `git add .` cannot stage one first.

### The Windows packaging flow

```bash
npm run build:sidecar        # stage src-tauri/binaries/master-trade-api-<triple>
npm run release:preflight     # gate (needs MASTER_TRADE_ENVIRONMENT=production)
npm run desktop:package       # gate, then `tauri build`
```

`desktop:package` runs the gate first, so `tauri` cannot be invoked in a way that skips it.
Prerequisites on the build machine: a Rust toolchain (for `tauri build` and for
`build:sidecar`'s host triple), `@tauri-apps/cli`, and the platform's own bundling tools
(WiX/NSIS on Windows).

**This environment cannot produce a bundle**: there is no Rust toolchain and no
`@tauri-apps/cli`, so no `.msi` or `.exe` is created here and none is claimed. What is verified is
every rule that decides whether the bundle may be built — including the two that the real tree
currently fails (§3).

---

## 3. The signing boundary

Tauri's updater verifies a downloaded artifact against a public key compiled into the binary. That
key is a **release input**, and the failure it prevents is quiet: a build carrying a placeholder key
still starts, still checks, still downloads — and refuses every genuine update with a signature
error, forever, on every machine. The user sees an app that reports "up to date" while being
permanently un-updatable.

So, in `signing.ts`:

> **In production, absent, placeholder or malformed signing material is an error, not a warning.**
> There is no third state in which a build is "probably fine to ship".

| aspect                               | development | production |
| ------------------------------------ | ----------- | ---------- |
| `signing.update-key` absent          | warning     | **error**  |
| `signing.update-key` placeholder     | warning     | **error**  |
| `signing.update-key` malformed       | warning     | **error**  |
| `signing.update-endpoints-https`     | **error**   | **error**  |
| `signing.update-endpoints-reachable` | warning     | **error**  |

A placeholder is detected by marker (`REPLACE_WITH`, `PLACEHOLDER`, `CHANGEME`, `TODO`, …), compared
in uppercase and matched anywhere in the value — a placeholder is written by a human under time
pressure, so refusing one that is _nearly_ right is the better error. A malformed key is one that is
not a minisign public key: an `untrusted comment:` line followed by a base64 blob. Requiring both is
what separates "a key is configured" from "some string is configured", and a string is the failure
mode because a truncated paste still looks like configuration.

A non-https endpoint blocks in **both** modes. Asking for a plaintext update channel is a defect
worth fixing rather than something to rely on the signature check to cover.

The committed tree fails two aspects, and that is the recorded state rather than an oversight:

```
FAIL  signing.update-key                  the updater public key is still a placeholder
FAIL  signing.update-endpoints-reachable  reserved host in use: updates.mastertrade.invalid
```

### What "signed" may be claimed

One function decides it, so the answer never appears in two forms:

```
describesSignedProductionRelease(conf, environment)
  = production AND every signing aspect valid
```

`docs/release-baseline.json` records `signing.productionReleaseSigned: false` and
`tests/release-baseline.test.ts` asserts that flag against that function — so the release metadata
cannot claim a signed production release while the module refuses to produce one. The public key is
public and belongs in `tauri.conf.json`; the **private** key is never in the repository, and
`package.no-signing-material` fails the build if one appears.

### What this cannot do

It cannot verify a signature, and it does not pretend to: verifying needs the private key to have
signed something, and a private key here is the defect the whole area is about. What it can do is
refuse to call a release signed when the material needed to sign one is not there — which is what
stops a release from being _described_ as signed. The cryptographic check is Tauri's, at install
time, against the compiled-in key.

---

## 4. The auto-update lifecycle

```
                    ┌─────────────┐
   no updater ──────▶ unavailable │
                    └─────────────┘
   check()          ┌──────────┐        target newer        ┌──────────────────┐
   ────────────────▶│ checking │─────┬─────────────────────▶│ update_available │
                    └──────────┘     │                      └──────────────────┘
                                     │ same version           │ install()
                                     ▼                        ▼
                              ┌───────────┐            ┌─────────────┐
                              │ up_to_date│            │ downloading │
                              └───────────┘            └─────────────┘
                                     │ refusal               │
                                     ▼                        ▼
                              ┌─────────┐              ┌────────────┐
                              │ failed  │◀─────────────│ installing │
                              └─────────┘   mismatch   └────────────┘
                                                          │ confirmed
                                                          ▼
                                                    ┌─────────┐
                                                    │ updated │
                                                    └─────────┘
```

Four rules, each one something an updater gets wrong in a way a user notices:

1. **Nothing unverified is downloaded.** `parseUpdateMetadata` refuses metadata without a signature,
   with a malformed one, without a readable version, with a plaintext `url`, with an unparseable
   `pub_date`, or with unbounded notes — all before a byte moves. No function accepts a URL, a path
   or a filename: metadata tells the port whether to proceed, never where to fetch from.
2. **Nothing goes backwards.** A target older than what is installed is refused (a stale endpoint is
   how a fixed build silently reverts), and a cross-major target is refused unless a caller opts in
   with `allowMajorUpgrade`, because a major boundary is where persisted training data changes shape.
3. **"Updated" is evidence, not hope.** The installed version is read back after the install and must
   equal the target; anything else is `failed` with the reason. An installer that returned without
   throwing is not proof, and this is the state a user sees.
4. **A failure changes nothing.** The version in place is untouched and `failed` says why. There is no
   rollback to implement because nothing changes until the port's install succeeds.

Version comparison normalizes (`v1.2.3`, `1.2`, build metadata) and refuses anything else; a
pre-release sorts below its release, so a beta channel is never "newer" than the stable build it
precedes.

### The port, and the browser

Everything OS-specific is behind `UpdatePort` (`available`, `currentVersion`, `fetchMetadata`,
`download`, `install`, `installedVersion`, optional `cancel`). The service owns the rules; the port
owns the platform. `unavailableUpdatePort()` is what a browser must use: reads answer `false`, writes
refuse with an explicit message, and no page can reach an install path even by accident. The frontend
is unchanged in this phase — nothing in `web/` imports the updater, so the browser build is exactly
what it was.

The native implementation of that port is the Tauri updater plugin registered in `src-tauri/src/lib.rs`
(ADR-0055 §Consequences). It is **described, not executed**: there is no Rust toolchain here, so
`desktop:verify` says so in its own `unverifiable` list (TDR-13).

---

## 5. CI requirements for a production release

`.github/workflows/release.yml` is a gate, not CI: it runs on `workflow_dispatch` or a `v*` tag, never
on a push to a branch, because a release is a decision.

1. **`gate`** (ubuntu): `npm ci`, `npm run build`, then `npm run release:preflight` with
   `MASTER_TRADE_ENVIRONMENT=production`. That variable is what promotes a placeholder key from a
   warning to an error, and the step fails closed. The preflight also refuses to run at all when the
   environment is not declared production, so it cannot green-light a tree it never checked.
2. **`package`** (windows, `needs: gate`): a step that **fails with a readable message** when
   `TAURI_SIGNING_PRIVATE_KEY` is absent rather than skipping it — an unsigned Windows bundle is not a
   release, so there is nothing useful to do without the key. Then `npm run build:sidecar`,
   `npm run desktop:package` (the gate again, on the machine that bundles), and the installers and
   `.sig` uploaded as artifacts.

What is required of a maintainer before the first release:

- generate an update key pair with `tauri signer generate`;
- put the **public** key in `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`;
- point `plugins.updater.endpoints` at a real https host (not `.invalid`);
- add the **private** key as the `TAURI_SIGNING_PRIVATE_KEY` repository secret (plus its passphrase,
  if one was set);
- add a Windows code-signing certificate to the release job once Phase 6.6 addresses installer
  signing — the update signature and the OS code signature are **different capabilities**, and
  neither substitutes for the other.

Nothing in this workflow weakens a check to make Actions pass: there is no `continue-on-error` on the
gate, no `if: always()` around it, and no `npm audit fix`. If the gate fails, the fix belongs in the
tree.

---

## 6. Security invariants

Verified in `tests/desktop-signing.test.ts`, `tests/desktop-packaging.test.ts`,
`tests/desktop-update.test.ts` and by `desktop:verify`:

- no private signing key, credential or secret exists anywhere in the repository
  (`package.no-signing-material`, plus the same extensions in `.gitignore`);
- no secret material in the built frontend (`package.no-secret-material`);
- no version drift across the four surfaces (`version.agreement`);
- a production release is refused without valid signing material (`release:preflight` exits 1);
- an invalid or unsigned update artifact is never installed; metadata is refused before download;
- an update failure leaves the current installation untouched and reports `failed`;
- the browser cannot invoke the updater at all;
- `liveTradingEnabled: false` and `brokerExecutionEnabled: false` remain literal `false`, unchanged
  by this phase.

## 7. Master Trade Brain

None of this is Brain state, and the boundary is deliberate:

- **Version and update metadata is not memory.** No release fact is written to `memory_records`, and
  nothing here is injected into reasoning context as user data. A version is a property of the
  installation, not something the agent learned.
- **Update state is explicit system state.** `UpdateState` exists so a failure is reported as
  `failed` with a reason rather than surfacing as a confident answer derived from a stale build.
- **No new subsystem.** Release state is consumed by the shell, exactly as the diagram intends, and
  no Brain component was added to hold it.

## 8. Known limitations and what is deferred

**Limitations of this phase:**

1. **No Windows bundle was produced here.** No Rust toolchain, no `@tauri-apps/cli`. Every rule that
   decides whether a bundle may be built is verified; the bundle itself is not, and is not claimed.
2. **The Rust half is described, not executed.** The updater plugin, the sidecar and the bundle are
   covered by source-level checks. TDR-13.
3. **The release workflow has never completed a release.** The gate path is exercised by
   `release:preflight` and by tests; the packaging job is a described path.
4. **No installer signature.** An update signature proves an artifact came from the project; it does
   not stop an OS warning. Phase 6.6 did not add code signing either — see
   [desktop-release-qa.md](./desktop-release-qa.md) §10 and TDR-20.
5. **No update UI.** `UpdateService` reports status and nothing renders it. Deliberate: this phase
   had to keep the existing UI untouched.
6. **The native `UpdatePort` implementation is not written.** The plugin is registered in Rust; the
   adapter that drives it through this state machine arrives with the phase that renders it.

**Phase 6.6 delivered:** the release QA report (`npm run release:qa`), which maps every desktop
scenario to the test that proves it and marks the checks this host cannot exercise; and the
build-version handshake, which refuses to report the API ready unless it is the build the shell
shipped — [desktop-release-qa.md](./desktop-release-qa.md).

**Still deferred after 6.6:** installer and code signing, notarisation, a native build that exercises
the keychain and the updater for real, and the update UI. **Also out of scope:** rollback beyond what
Tauri's updater provides, a background update daemon, and a custom update server —
`tauri.conf.json` names the endpoint the app will ask, and no release infrastructure was built here.

Live trading and broker execution remain disabled. Nothing in this phase changed a safety flag.
