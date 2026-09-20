# Monorepo Foundation — current state

**Status:** Steps 1 and 2 of [ADR-0035](./adr/ADR-0035-monorepo-migration-staged-boundary-first.md)
are done. The frontend/backend boundary is a **declared contract** (Phase 4.2, `@shared/*`),
and as of **Phase 4.3** that surface is the physical, source-only package
**`packages/shared`** ([ADR-0036](./adr/ADR-0036-extract-shared-package-source-only.md)).

This is the **current-state reference** for the repository layout. ADRs and module
documents written before Phase 4.3 keep naming the pre-move paths; they are records of
the phase that wrote them and are deliberately not rewritten.

Read [monorepo-assessment.md](./monorepo-assessment.md) first for the original analysis.

## 1. What moved, and what did not

`packages/shared` now holds a **closed 22-module set** — the 13 declared surface entries
plus the 9 modules they transitively need. Fourteen modules moved out of `src/`:
`api/schemas`, `auth/model`, `core/logging`, `core/rateLimit`, `core/retry`,
`desktop/host`, `jobs/queue`, `jobs/store`, `jobs/vocabulary` were the ones ADR-0035 did
not know about, because it read the surface as 13 leaves rather than the root of an
import graph.

The subpath layout is preserved (`src/api/contracts.ts` →
`packages/shared/src/api/contracts.ts`), so the moved modules' own internal imports stayed
valid and the move was a pure `git mv` of a closed set.

**Nothing else moved.** `web/` is still `web/`, the Rust shell is still `src-tauri/`, the
tests are still `tests/`, and every other backend module is still under `src/`.
`apps/{desktop,web,api}` and `packages/{ui,database,ai,market-data,trading-engine}` remain
inert placeholders awaiting an ADR-0035 trigger.

## 2. The boundary: `@shared/*`

The frontend contains **no relative path into backend code**. It imports the declared
surface by name, and those 29 imports did not change in Phase 4.3 — only their targets in
`config/sharedSurface.ts` did. That is the claim ADR-0035 made; Phase 4.3 was the first
phase able to verify it.

**13 declared entries** (exact-match, never a directory prefix):

| Specifier                     | Module in the package                        | Used by the frontend for          |
| ----------------------------- | -------------------------------------------- | --------------------------------- |
| `@shared/api/contracts`       | `packages/shared/src/api/contracts.ts`       | route ids, envelopes, error codes |
| `@shared/core/errors`         | `packages/shared/src/core/errors.ts`         | `ERROR_STATUS`, error codes       |
| `@shared/core/headers`        | `packages/shared/src/core/headers.ts`        | the shell-token header name       |
| `@shared/core/ids`            | `packages/shared/src/core/ids.ts`            | correlation ids                   |
| `@shared/core/provenance`     | `packages/shared/src/core/provenance.ts`     | provenance sources, labels        |
| `@shared/desktop/ipc`         | `packages/shared/src/desktop/ipc.ts`         | the Rust command surface          |
| `@shared/frontend/viewModels` | `packages/shared/src/frontend/viewModels.ts` | view models + UI invariants       |
| `@shared/jobs/service`        | `packages/shared/src/jobs/service.ts`        | the job view contract             |
| `@shared/marketdata/provider` | `packages/shared/src/marketdata/provider.ts` | `DataProvenance`                  |
| `@shared/realtime/contracts`  | `packages/shared/src/realtime/contracts.ts`  | event names, payload schemas      |
| `@shared/realtime/events`     | `packages/shared/src/realtime/events.ts`     | the event envelope                |
| `@shared/realtime/protocol`   | `packages/shared/src/realtime/protocol.ts`   | the WebSocket wire protocol       |
| `@shared/types`               | `packages/shared/src/types.ts`               | `EpistemicKind`, shared types     |

`@shared/db/sqlite`, `@shared/server/app`, `@shared/jobs/queue` and bare `@shared` have
**no resolver entry**, so they fail to type-check _and_ to bundle.

`config/sharedSurface.ts` remains the **one list**, consumed by `vite.config.ts` and
`vitest.config.ts` and mirrored literally in both tsconfigs (TypeScript `paths` cannot
read a module). `tests/monorepo-boundary.test.ts` asserts all mirrors agree.

## 3. How each side resolves it

```
frontend   web/src/**  ──@shared/*──▶  config/sharedSurface.ts  ──▶ packages/shared/src/**
backend    src/**      ──relative──▶   packages/shared/src/**      (Node cannot run a .ts specifier)
```

The asymmetry is forced, not chosen. `@shared/*` exists only because it is a Vite/tsc
alias; the compiled backend is plain Node ESM, which cannot execute a `.ts` specifier, and
Node disables type-stripping for files inside `node_modules`. Of the three things that
_do_ resolve at runtime — a relative path, a built `node_modules` package, or a
`#`-prefixed subpath — only the relative path preserves "source-only, no build step", which
is what ADR-0035 required.

So the backend's shared-module specifiers are relative:
`src/server/errors.ts` imports `../../packages/shared/src/core/errors.js`. **This is
longer than the old `../core/errors.js`; the cost is accepted and recorded in ADR-0036.**

## 4. Dependency direction (the rules that must hold)

```
packages/shared  ──✗──▶  src/** , web/** , src-tauri/**
web/src/**       ──@shared/*──▶  packages/shared/**   (13 declared entries only)
src/**           ──relative──▶   packages/shared/**
src/**           ──✗──▶  web/**                        (never; asserted)
web/src/**       ──✗──▶  src/{db,server,auth,jobs/queue,jobs/store}   (internals, never)
```

`apps/*` will consume `packages/*`; `packages/*` never import an app.

## 5. Build and install topology

**Build.** `tsconfig.build.json` now sets `rootDir: "."` and includes
`packages/shared/src/**/*.ts`, so output is:

```
dist/src/**                      ← the backend
dist/packages/shared/src/**      ← the shared package
```

That move was the non-obvious cost. The previous config let TypeScript infer `rootDir`
from `src/`, which is why the entry point used to be `dist/server/start.js`. Consumers
updated in Phase 4.3: 7 `package.json` scripts, `scripts/build-sidecar.mjs`, and
`src/desktop/cli.ts`'s repository-root computation. **`tauri.conf.json` needed no
change**, because `web/` and `src-tauri/` did not move.

**Install.** `packages/shared` carries a real manifest — `name`, `private: true`, and an
`exports` map mirroring the declared surface — but is deliberately **not** an npm
workspace. `npm ci` with the committed lockfile remains the single install path, so the
optional-dependency hoisting surface behind the `@tailwindcss/oxide` failure (`c92fa9c`)
is unchanged. Both facts are asserted.

## 6. What may move next, and what may not

**May move (when a trigger fires):** `src/db` → `packages/database`, `src/llm` +
`src/agent` + `src/vector` → `packages/ai`, `src/marketdata` → `packages/market-data`,
the frontend component set → `packages/ui`, and `web/` → `apps/web`, `src/` → `apps/api`.

**Must not move without a separate, reviewed change:**

- `src-tauri/**` — the shell and `scripts/build-sidecar.mjs` hardcode `../web/dist` and
  the `dist/src/server/start.js` path; the sidecar cannot be built here (no Rust
  toolchain), so a move cannot be verified.
- The `@shared` mapping and the package's `exports` map, without updating all three
  mirrors at once.
- `packages/shared`'s closure — the package must stay closed, or it stops being a package.

## 7. Current limitations

1. **The backend's specifiers are longer.** The physical package cost 217 rewrites into
   `../../packages/shared/src/…`. A built package with one specifier everywhere remains
   available later; the `exports` map is already in place for it.
2. **No workspace tooling.** Deliberate — install topology is frozen for now.
3. **Five placeholder directories are inert.** They cannot be built, imported or installed.
4. **The frontend still reads source, not a built artifact**, so both tsconfigs must carry
   the `paths` mapping.
5. **`node:sqlite` portability is unchanged.** `packages/shared` contains no database code
   by construction: the closure is pure, with no `node:*`, Fastify or driver imports.

## 8. Next step (Phase 4.4 candidate)

Per ADR-0035, the next action is **not** the full migration. Options, in order of
justification:

1. **Wire `packages/shared` as an npm workspace + built package** — only if the longer
   backend specifiers prove to be real friction, and only with a clean Ubuntu install
   re-verifying the native engine first.
2. **Extract `packages/market-data`** if a trigger fires.
3. **`apps/web` + `apps/api`** when a trigger fires.

## 9. How it is enforced

`tests/monorepo-boundary.test.ts` (19 tests) asserts:

- dependency direction is one-way, and no frontend file reaches into `src/` relatively;
- every `@shared/*` specifier used is declared, and no declared entry is dead;
- both tsconfig `paths` blocks contain exactly the surface's 13 entries and agree on every
  target, and both bundler configs read the shared map rather than inlining literals;
- the surface contains no backend internals, and internal/unknown specifiers have **no**
  resolver entry;
- **`packages/shared` carries a manifest whose `exports` are exactly the declared
  surface**;
- **the package is closed** — no module inside it imports a file outside it, and the full
  closure is present;
- **the backend consumes it too**, so it has two genuine consumers;
- **no npm workspaces**, so the install topology cannot drift by accident;
- the remaining placeholder directories hold no `package.json` and say what they are;
- the assessment, ADR-0035, ADR-0036 and this document exist and are cross-referenced.
