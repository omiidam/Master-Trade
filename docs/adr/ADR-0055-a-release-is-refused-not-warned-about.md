# ADR-0055 — a release is refused, not warned about

- **Status:** Accepted
- **Decision id:** `DEC-DESKTOP-10-RELEASE`
- **Phase:** 6.5 (Windows Packaging, Signing & Auto Update)
- **Depends on:** ADR-0001 (Tauri over Electron), ADR-0029 (WebView capability boundary), ADR-0031
  (desktop config, app-data and keychain), ADR-0051 (the shell hosts and the domain decides),
  ADR-0054 (a credential is a name, a port and a lifecycle).

## Context

Three failures in this phase share a shape: they are invisible until the product is on someone else's
machine, and by then the artifact is out.

1. **A version in four files.** `0.6.0` is written in `package.json`, `src-tauri/tauri.conf.json`,
   `src-tauri/Cargo.toml` and `src/core/config.ts`. Three are read by different build systems and the
   fourth is what the health endpoint reports. The verifier checked three of them; the fourth had
   already drifted out of its sight once.
2. **A placeholder signing key.** A build carrying one still starts, still checks, still downloads,
   and refuses every genuine update with a signature error forever. The user sees an app that reports
   "up to date" while being permanently un-updatable. The existing verifier reported it as a warning
   in development and an error in production, which was right, but the rule lived inline in the
   verifier — so nothing else could enforce it and no release path consulted it.
3. **A source map in the installer.** `vite.config.ts` had `sourcemap: true`. `web/dist` is not a
   public directory; it is the `frontendDist` the desktop bundle ships. So the installer carried a map
   of the entire frontend, and a release artefact cannot be unreleased.

And one missing capability: there was no update lifecycle at all. The plugin was registered in Rust
and the permission was granted to the WebView, and nothing decided what an update was allowed to be.

## Decision

**A release gate refuses; it does not warn.** Concretely:

1. **One version source, three mirrors, one check.** `package.json` is the source because it is what
   every release tool already reads and the only one a human edits. `version.ts` owns the list, the
   per-file shape, the reads and the rewrites; `version.agreement` was widened from three surfaces to
   four rather than a second check being added beside it. `release:sync-version` writes only the
   drifted mirrors and **re-reads what it wrote**, so a rewrite that matched the wrong thing throws
   instead of reporting success it cannot evidence.

2. **Mode changes severity, never the rule.** `packaging.ts` holds every rule about the bundle, with
   two callers: `desktop:verify` (development) and `release:preflight` (release). A missing sidecar is
   a warning in one and an error in the other; nothing is skipped, and the detail line says which mode
   allowed it. `release:preflight` **refuses to run at all** when the environment is not declared
   production, because a preflight that silently checked a development tree is a green light nobody
   earned.

3. **Signing material fails closed.** In production, absent, placeholder or malformed material is an
   error. A placeholder is matched by marker anywhere in an uppercase comparison (refusing one that is
   _nearly_ right beats accepting one); a key is malformed unless it is an `untrusted comment:` line
   followed by a base64 blob, because a truncated paste still looks like configuration. A non-https
   endpoint blocks in **both** modes. `describesSignedProductionRelease` is the single function
   allowed to answer "is this a signed release", and release metadata is asserted against it.

4. **Release hygiene is a rule, not a habit.** No source map, no environment file, no dependency tree,
   no log artefact, no PEM private key, no minisign secret key and no hard-coded credential ships.
   No `.pem`/`.key`/`.p12`/`.pfx`/`.p8`/`.sig` file may exist anywhere in the tree. Source maps became
   opt-in (`MASTER_TRADE_SOURCEMAPS=1`) rather than trimmed, because a rule with an exception is a rule
   nobody can verify. `.gitignore` lists the same key extensions so an accidental `git add .` cannot
   stage one first.

5. **The update lifecycle is a state machine with evidence.** Nine states, four rules: nothing
   unverified is downloaded (metadata without a signature is refused before a byte moves); nothing goes
   backwards (a downgrade, or a cross-major target without an explicit policy opt-in, is refused); the
   installed version is **read back and must equal the target** before `updated` is reported; and a
   failure changes nothing, so there is no rollback to implement. Everything OS-specific is behind
   `UpdatePort`, and a browser gets `unavailableUpdatePort()` — reads answer `false`, writes refuse.

## Consequences

- **The verifier and the release gate cannot disagree**, because they call the same two modules.
  `desktop:verify` reports at development severity and `release:preflight` refuses at release severity.
- **Three check ids moved**, and the tests and docs that named them were updated rather than
  duplicated: `updater.pubkey` → `signing.update-key`, `updater.https-only` →
  `signing.update-endpoints-https`, `environment.update-endpoint` → `signing.update-endpoints-reachable`.
  `version.agreement` kept its id because it is the same rule, widened.
- **The committed tree is not releasable, and that is recorded.** `signing.update-key` is a
  placeholder and `signing.update-endpoints-reachable` uses the reserved `.invalid` TLD. No production
  release can be produced from this tree, and `docs/release-baseline.json` records
  `productionReleaseSigned: false` — asserted against the module, so the file cannot claim otherwise.
- **No key, ever, in the repository.** The public key belongs in `tauri.conf.json`; the private key
  belongs in a CI secret. `package.no-signing-material` fails the build if one appears.
- **The Windows bundle and the Rust updater are not executed here** — no toolchain. Every rule that
  decides whether a bundle may be built is verified; the bundle is not, and `signing.ts` cannot prove
  a signature either, because that needs the private key. What proves a signature is Tauri's updater
  against the compiled-in key, at install time. TDR-13, and the verifier's own `unverifiable` list.
- **The release workflow has never completed a release.** The gate path is exercised by
  `release:preflight` and covered by tests; the packaging job is a described path, not a verified one.
  Installer code signing, notarisation and a real end-to-end release are Phase 6.6.

Packaging rules, the version surfaces, the signing boundary, the update lifecycle, CI requirements and
every limitation are in [desktop-release.md](../desktop-release.md).
