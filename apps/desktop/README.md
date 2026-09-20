# apps/desktop — placeholder (not a package)

Reserved for the desktop shell. **Nothing lives here yet**, and this directory contains
no `package.json`, so npm does not treat it as a package and nothing can be imported
from it.

Today the shell is `src-tauri/**` (Rust: 7 modules, 13 typed commands) plus
`src/desktop/**` (the TypeScript shell contract, IPC and verifier), and it stays there
— Phase 4.2 moved no files
([ADR-0035](../../docs/adr/ADR-0035-monorepo-migration-staged-boundary-first.md)).

**Will hold:** the Tauri crate, `capabilities/main.json`, the config and sidecar
modules, and the shell contract.

**This is the last directory that should move.** The build chain hardcodes the current
layout — `src-tauri/tauri.conf.json` sets `frontendDist: "../web/dist"` and
`externalBin: ["binaries/master-trade-api"]`, and `scripts/build-sidecar.mjs` resolves
`dist/server/start.js` from the repository root. There is no Rust toolchain in this
environment, so the shell's own `desktop:verify` pass would be the only check available
after a move, and the sidecar could not be proven to build.

**Trigger to populate:** the desktop build needing to consume a shared package
directly, or non-Rust sidecar build steps that should not share a dependency graph with
frontend tooling.
