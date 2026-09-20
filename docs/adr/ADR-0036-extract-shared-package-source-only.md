# ADR-0036 — Extract `packages/shared` as a source-only package resolved by relative path

- **Status:** Accepted
- **Phase:** 4.3
- **Decision id:** `DEC-REPO-2-EXTRACT-SHARED`
- **Executes:** step 2 of [ADR-0035](./ADR-0035-monorepo-migration-staged-boundary-first.md)
- **Refines:** [ADR-0002](./ADR-0002-modular-monolith.md) (single-process modular monolith)

## Context

ADR-0035 chose a **staged, boundary-first** path to a monorepo and recorded step 2 as:
_"Extract `packages/shared` first and alone, as source-only, with no build step. Because
every consumer already imports one of 13 exact specifiers, no consumer import changes."_

Phase 4.3 measured that claim, and **it is wrong in two ways.** Both matter, and both
were found by inspecting the code rather than trusting the document.

**1. The shared surface is not 13 leaf modules — it is a 22-file closure, and the
backend is a heavy consumer.**

`src/api/contracts.ts` imports `../auth/model.js` and `./schemas.js`;
`jobs/service.ts` imports `queue.js`, `vocabulary.js` and `core/logging.js`;
`marketdata/provider.ts` imports `core/rateLimit.js` and `core/retry.js`;
`desktop/ipc.ts` imports `./host.js`. A closure computation puts the real move set at
**22 files**. `core/errors.ts` alone is imported by **59** backend files. So "no consumer
import changes" was false: **91 files needed rewriting, 217 specifiers.**

The closure is, however, architecturally clean: all 22 files are pure. **None imports
`node:*`, Fastify, pino, or a database driver** — `jobs/store.ts` imports nothing at
all, and `desktop/host.ts` and `core/rateLimit.ts` are leaves.

**2. `@shared/*` cannot work at Node runtime, so it cannot be the backend's specifier.**

`@shared/*` resolves today only because it is a Vite/tsc alias. The compiled backend is
plain Node ESM, which cannot execute a `.ts` specifier — and Node disables type-stripping
for files inside `node_modules`, so a workspace-linked package pointing at source would
fail there too. Only three things resolve at runtime: a relative path, a `node_modules`
package with built `.js`, or a `#`-prefixed subpath import. The first is the only one that
preserves "source-only, no build step".

**3. Moving the files changes the build topology.** `tsconfig.build.json` set no
`rootDir`, so TypeScript inferred `src/` and emitted `dist/server/start.js`. Adding
`packages/shared/src` moves the inferred root to the repository root, so every output
path becomes `dist/src/…`.

## Decision

**Extract the 22-file closure into a physical `packages/shared`, source-only, with the
backend reaching it by relative path and the frontend by the existing `@shared/*` alias.**

1. **The package is the 22-module closure**, not the 13 declared entries. The subpath
   layout is preserved (`src/api/contracts.ts` → `packages/shared/src/api/contracts.ts`),
   so the moved modules' own internal imports stay valid and the move is a pure `git mv`
   of a closed set.
2. **The declared surface is unchanged and exact-match.** `config/sharedSurface.ts` is the
   one list; only its _targets_ moved. The frontend's 29 `@shared/*` imports did not
   change — which is the claim ADR-0035 made and this phase could finally verify.
3. **The backend uses relative paths** (`../../packages/shared/src/core/errors.js`). This
   is the only source-only specifier Node resolves at runtime. It is uglier than
   `@shared/*` and that cost is accepted deliberately — see the alternatives below.
4. **`rootDir` becomes `"."`** and output is `dist/src/**` + `dist/packages/shared/src/**`.
   The consumers of those paths were updated: 7 `package.json` scripts,
   `scripts/build-sidecar.mjs`, and `src/desktop/cli.ts`'s repository-root computation.
   `tauri.conf.json` needed **no** change, because `web/` and `src-tauri/` did not move.
5. **No npm workspaces.** `packages/shared` carries a real manifest
   (`name`, `private`, an `exports` map mirroring the surface) but is **not** declared in
   a `workspaces` field, so `npm ci` with the committed lockfile remains the single
   install path.
6. **The package is closed.** No module inside it may import anything outside it. This is
   what makes it a package rather than a relocated folder, and it is enforced by test.

## Alternatives rejected

- **Built workspace package with one `@shared/*` specifier everywhere.** The cleanest
  ergonomics, and the standard monorepo answer — but it adds a build step and a
  build-order dependency to `validate`, and npm workspaces **hoist differently**, which
  is the exact mechanism behind the `@tailwindcss/oxide` failure fixed in `c92fa9c`, two
  commits earlier. Re-opening a just-closed VPS failure to buy import cosmetics is a bad
  trade. The `exports` map is in place, so this remains available as a later step.
- **`node_modules`-linked package exporting `.ts` source.** Node refuses to type-strip
  anything under `node_modules`. It cannot work, at any Node version.
- **A compatibility shim at each old `src/` path re-exporting from the package.** It would
  have avoided the 217 rewrites — and still forced `rootDir: "."`, so it pays the build
  cost while adding 22 indirection files. Rejected.
- **`rootDirs` to merge `src` and `packages/shared/src` into one virtual root.** It keeps
  relative specifiers working, but `rootDirs` with `outDir` has ambiguous emit semantics
  and is explicitly not recommended. Rejected as too clever for a load-bearing path.
- **Moving `apps/web` and `apps/api` at the same time (the phase's original scope).**
  Deferred: ADR-0035's four trigger conditions have still not fired, and moving the apps
  before the shared package exists would have the frontend import another _package's_
  source with no declared dependency.

## Consequences

The shared surface is now a real package with two genuine consumers — the condition that
justified extracting it at all. The boundary is stronger than in Phase 4.2: the package's
closure, its manifest, and its independence are all asserted, so it cannot quietly reach
back into the backend.

The costs are real and accepted: the backend's shared-module specifiers are longer, the
build output moved under `dist/src/`, and ADRs and module docs written before this phase
name the pre-4.3 paths. Those documents are historical records of their own phase and are
not rewritten; `docs/monorepo.md` is the current-state reference.

Reopening the layout question (npm workspaces, `apps/`, a built package) is still governed
by ADR-0035's trigger conditions.
