# Monorepo Migration Assessment (Phase 4.1)

**Status:** assessment complete · **Decision:** [ADR-0035](./adr/ADR-0035-monorepo-migration-staged-boundary-first.md)
— **do not migrate the full `apps/` + `packages/` layout yet**; adopt a staged
boundary-first path.

This document is analysis. No files were moved, no dependency was added, and no
module was rewritten. Everything below is derived from the repository at commit
`c92fa9c` and is checked by `tests/monorepo-boundary.test.ts`.

## 1. Current architecture (measured, not assumed)

| Fact                 | Value                                                                                |
| -------------------- | ------------------------------------------------------------------------------------ |
| npm packages         | **one** (`master-trade`), one `package.json`, one `package-lock.json`                |
| Backend source       | `src/**` — **108** TypeScript files, 24 top-level modules                            |
| Frontend source      | `web/src/**` — **81** files (9 pages, ~45 components, 4 mock fixtures)               |
| Desktop shell        | `src-tauri/**` — Rust, 7 modules, 13 typed commands, Tauri 2                         |
| Tests                | `tests/**` — **28** suites, root-level                                               |
| Docs                 | `docs/**` + **34** ADRs                                                              |
| Scripts              | `scripts/build-sidecar.mjs`                                                          |
| Build outputs        | `dist/` (backend `tsc`), `web/dist/` (Vite bundle)                                   |
| Architecture pattern | Single-process **modular monolith** ([ADR-0002](./adr/ADR-0002-modular-monolith.md)) |

**Dependency direction is already one-way and correct.** Nothing under `src/`
imports `web/` (the only match is a documentation string inside
`src/core/architectureLock.ts`). `web → src` is the sole cross-boundary edge.

**That edge is real and non-trivial.** 18 frontend files import backend source
through raw relative paths, at three and four levels of `../`:

```
web/src/api/client.ts          → ../../../src/api/contracts.js
web/src/components/Badge.tsx   → ../../../src/types.js
web/src/components/charts/…    → ../../../../src/marketdata/provider.js
web/src/realtime/store.ts      → ../../../src/jobs/service.js
```

The 27 distinct specifiers resolve against nine backend modules: `api/contracts`,
`core/{errors,headers,ids,provenance}`, `desktop/ipc`, `frontend/viewModels`,
`jobs/service`, `marketdata/provider`, `realtime/{protocol,contracts,events}`,
`types`.

So the shared surface the proposed `packages/shared` would hold **already exists
de facto**. It is expressed as a path depth instead of a package name.

### Boundary leaks found

1. **Path-depth coupling.** The boundary is enumerated by `../` count. Moving a
   frontend file one directory deeper silently breaks four imports, and there is
   no import alias anywhere in the frontend (`web/tsconfig.json` defines no
   `paths`).
2. **Unenforced boundary in config.** The root `tsconfig.json` explicitly
   `include`s `web/src/config/**`, `web/src/design/**` and `web/src/mock/**`
   while `web/tsconfig.json` independently compiles `web/src`. Two type checks
   own overlapping files; nothing prevents a _deep_ backend import
   (`src/db/sqlite.ts` from a UI component would typecheck today).
3. **A config file that exists only to work around layout.** `vitest.config.ts`
   exists because `vite.config.ts` sets `root: 'web'`, so Vitest would otherwise
   look for tests inside `web/`. It is a layout workaround, not a test decision.
4. **No cycle at module level.** Backend cross-imports are shallow and local
   (`./core/` ×8, `./migrations/` ×7, `./handlers/` ×7, `./agent/` ×7). There is
   **no circular dependency and no duplicated responsibility** to fix by moving
   directories.

## 2. Proposed target → current mapping

| Proposed location          | What exists today                                                                                                                                                                                                              | Migration size                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| `apps/desktop/`            | `src-tauri/**` + `src/desktop/**` (shell contract, IPC, verify)                                                                                                                                                                | Large (Rust + build chain)                    |
| `apps/web/`                | `web/**` (UI, design tokens, mock fixtures)                                                                                                                                                                                    | Large (81 files)                              |
| `apps/api/`                | `src/server`, `src/api`, `src/auth`, `src/agent`, `src/llm`, `src/jobs`, `src/realtime`, `src/db`, `src/instructions`, `src/config`, `src/core`, `src/storage`, `src/memory`, `src/vector`, `src/marketdata`, `src/evaluation` | Large (108 files)                             |
| `packages/ui/`             | `web/src/components`, `web/src/design`, `web/src/lib`                                                                                                                                                                          | Medium; currently only `apps/web` consumes it |
| `packages/database/`       | `src/db/**` (schema, dialect, migrations, repositories, sqlite, postgres)                                                                                                                                                      | Clean split; one consumer today               |
| `packages/ai/`             | `src/llm/**`, `src/agent/**`, `src/vector/**`, `src/instructions/**`                                                                                                                                                           | Clean split; one consumer                     |
| `packages/market-data/`    | `src/marketdata/**`                                                                                                                                                                                                            | Clean split; one consumer                     |
| `packages/trading-engine/` | `src/tools/risk.ts` + the `src/evaluation/**` harness                                                                                                                                                                          | **Nearly empty** — see §4                     |
| `packages/shared/`         | `src/core/**`, `src/types.ts`, `src/api/contracts.ts`, `src/permissions/model.ts`, `src/frontend/viewModels.ts`, `src/realtime/{contracts,protocol}.ts`                                                                        | **The only package with two consumers**       |
| `tests/`                   | root `tests/**` (28 suites, all import `../src/…`)                                                                                                                                                                             | Rewrite every import                          |
| `docs/`                    | unchanged in either layout                                                                                                                                                                                                     | None                                          |
| `scripts/`                 | unchanged, but its hardcoded paths move (§5)                                                                                                                                                                                   | Small                                         |

**The mapping is honest, not flattering.** `packages/shared` has two consumers
(web and api). `packages/ui` has one. `packages/database`, `packages/ai` and
`packages/market-data` each have one. `packages/trading-engine` has almost
nothing in it.

## 3. Benefits

- **The boundary becomes nameable and enforceable.** `@master-trade/shared`
  replaces `../../../../src/...`; a lint/build rule can then forbid `apps/web`
  from importing `packages/database` directly.
- **Removes the two config workarounds** (§1.2, §1.3): one tsconfig per package,
  and Vitest no longer needs a separate config file.
- **Independent build/enforce topology.** `apps/api` could be type-checked and
  built without loading the frontend toolchain, which today both root typechecks
  interleave.
- **A place to put the desktop shell's contract** so Rust-side and TS-side
  definitions stop living in two trees that must be compared by a verifier.

## 4. Risks — and why the trigger has not fired

1. **Install topology is a demonstrated failure surface on this project.**
   Commit `c92fa9c` fixed `@tailwindcss/oxide` failing to find its native binding
   on Ubuntu. The cause was npm omitting _optional_ dependencies, and the fix is
   a committed `.npmrc` with `include=optional`. **Workspaces hoist
   differently** — the optional platform package resolving today at the root can
   move to a nested `node_modules` or vanish, re-creating exactly that bug on the
   VPS. Migrating now re-opens a failure that is two commits old.
2. **Cross-package TypeScript resolution is the hidden cost.** Today
   `web/src/…` reads backend `.ts` **source directly**, which works because it is
   one package with `NodeNext` resolution. Across packages, imports must resolve
   through `exports`/`paths` to source, or through built `.d.ts` with a correct
   build order. Neither is free, and a wrong choice shows up as a runtime
   `ERR_MODULE_NOT_FOUND` only after bundling.
3. **The desktop build chain hardcodes the current layout.**
   `src-tauri/tauri.conf.json` sets `frontendDist: "../web/dist"` and
   `externalBin: ["binaries/master-trade-api"]`; `scripts/build-sidecar.mjs`
   hardcodes `join(root, 'dist', 'server', 'start.js')` for its SEA bundle. Under
   `apps/api/` those paths and the `beforeBuildCommand` npm scripts all change,
   and the sidecar cannot be built here (no Rust toolchain) to prove the change.
4. **28 test suites import `../src/…` by relative path**, and
   `technology-lock.test.ts` reads `process.cwd()/src/**` and
   `process.cwd()/docs/adr` directly. A move is a mechanical but repository-wide
   edit of the very invariants that make this codebase trustworthy.
5. **`packages/trading-engine` would be nearly empty.** The interface phase
   promised a "trading engine", but the real deterministic trading logic today is
   `src/tools/risk.ts` plus the evaluation harness. Creating an empty package to
   satisfy a target diagram is premature structure — the opposite of ADR-0002's
   whole point.
6. **Coordination cost without coordination benefit.** A workspace tool earns its
   keep when packages are versioned, published or owned separately. Here there is
   one lockfile, one author, and two apps. npm's workspace orchestration would be
   pure overhead against a native-engine risk.

## 5. Impacts, if it were done

| Area                | Impact                                                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Imports             | 27 cross-boundary specifiers + ~200 intra-`src` relative imports rewrite                                                           |
| Type checking       | per-package tsconfigs; root typecheck becomes an orchestrator                                                                      |
| Build               | `tsc` per package; `web/dist` and `dist/` paths change                                                                             |
| Tauri               | `frontendDist`, `externalBin`, `beforeBuildCommand`/`beforeDevCommand` update                                                      |
| Sidecar             | `scripts/build-sidecar.mjs` paths and SEA blob location                                                                            |
| SQLite / PostgreSQL | **no impact** — `node:sqlite` is a builtin and PG is an injected client ([ADR-0025](./adr/ADR-0025-sqlite-driver-and-dialects.md)) |
| Testing             | all 28 suites' import paths; `technology-lock` root-relative reads                                                                 |
| CI                  | `npm ci` at root still works with workspaces, but `npm run validate` must orchestrate builds                                       |
| Reversibility       | one squashable commit; revert restores layout exactly                                                                              |
| Rollback risk       | low **if** the native-engine install is re-verified on a clean Ubuntu install first                                                |

## 6. Decision: staged boundary-first, migration deferred

The benefits above are real, but **none of them require moving directories.**
They require the boundary to be _nameable_ and _enforceable_. So the decision
(ADR-0035) is:

**Do not perform the `apps/` + `packages/` migration now.** Instead take the
low-risk step that captures most of the benefit, and record the trigger that
should start the real migration.

### Step 1 — make the boundary explicit (no directory moves)

- Introduce a **single import alias** for the shared surface (one `paths` entry,
  mirrored in the root and `web` tsconfigs) so `../../../../src/...` becomes one
  stable specifier. This is a rename with no semantic change.
- Keep the **one-way direction** (`web → src`, never the reverse) enforced by
  test — now done in `tests/monorepo-boundary.test.ts`.
- Restrict cross-boundary imports to the **declared entry modules**, so a UI
  component cannot reach into `src/db/sqlite.ts` or `src/server/**`.

### Step 2 — extract `packages/shared` only (when the alias is in place)

`packages/shared` is the only package justified by _two_ consumers. Extract it
first, alone, as source-only (no build step) — it is the mechanical rename that
proves cross-package resolution without touching the desktop chain.

### Step 3 — split the rest only when a second consumer appears

`packages/database`, `packages/ai`, `packages/market-data`, `packages/ui` and
`packages/trading-engine` exist to be _shared_. They should be created when
something other than `apps/api` or `apps/web` consumes them, or when an
independent release cycle exists.

### Trigger conditions for the full migration

Any **one** of these should start Step 2–3 for real:

1. A second consumer of the shared surface appears (a CLI, a second UI, a worker
   process).
2. The frontend must be published or packaged independently of the backend.
3. The desktop sidecar must gain non-Rust build steps that would otherwise share
   a dependency graph with frontend tooling.
4. The boundary alias proves insufficient — i.e. two consumers need _different_
   builds of the same module.

Until then, the current layout is the **cheaper correct answer**, and this
document plus ADR-0035 exist so that reopening it is a decision, not an accident.

## 7. What is enforced now

`tests/monorepo-boundary.test.ts` pins the facts this assessment rests on, so the
analysis cannot silently drift:

- nothing under `src/` may import `web/` (direction stays one-way);
- every frontend cross-boundary import must resolve to a **declared** backend
  entry module — a deep import into `db/`, `server/`, `auth/` or `jobs/queue`
  fails the build;
- the assessment's mapping is complete: every declared shared module exists;
- ADR-0035 exists and is indexed.

## 8. Reversibility

This phase changed **documentation and one test suite**. Nothing moved, nothing
was installed, and `package.json` is untouched. Reverting is a single `git
revert` with no build-side consequence.
