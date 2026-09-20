# Monorepo Foundation (Phase 4.2)

**Status:** Step 1 of [ADR-0035](./adr/ADR-0035-monorepo-migration-staged-boundary-first.md)
is implemented — the frontend/backend boundary is now a **declared, compiler-and-bundler
enforced contract** (`@shared/*`). The directory layout has **not** changed: nothing was
moved, no workspace was configured, no dependency was added.

Read [monorepo-assessment.md](./monorepo-assessment.md) first for the analysis. This
document covers what was built, how it is enforced, and how to continue.

## 1. Why a boundary before a layout

Phase 4.1 found the shared surface `packages/shared` would hold **already existed** —
as 18 frontend files importing backend source through relative paths up to four
levels deep (`../../../../src/marketdata/provider.js`). The migration's _benefit_
(explicit, enforceable boundaries) did not require the migration's _risk_ (moving
108 backend files, 81 frontend files, the Tauri build chain, and every test import,
while changing npm's optional-dependency hoisting — the exact mechanism behind the
`@tailwindcss/oxide` failure fixed in `c92fa9c`).

So Phase 4.2 delivered the benefit without the risk: the boundary is now named.

## 2. The boundary: `@shared/*`

The frontend no longer contains a single relative path into `src/`. It imports the
declared surface by name:

```ts
// before  — a path depth, not a contract
import type { JobView } from '../../../src/jobs/service.js';
// after
import type { JobView } from '@shared/jobs/service';
```

**13 modules** make up the declared surface:

| Specifier                     | Backend module               | What the frontend uses it for     |
| ----------------------------- | ---------------------------- | --------------------------------- |
| `@shared/api/contracts`       | `src/api/contracts.ts`       | route ids, envelopes, error codes |
| `@shared/core/errors`         | `src/core/errors.ts`         | `ERROR_STATUS`, error codes       |
| `@shared/core/headers`        | `src/core/headers.ts`        | the shell-token header name       |
| `@shared/core/ids`            | `src/core/ids.ts`            | correlation ids                   |
| `@shared/core/provenance`     | `src/core/provenance.ts`     | provenance sources, labels        |
| `@shared/desktop/ipc`         | `src/desktop/ipc.ts`         | the Rust command surface          |
| `@shared/frontend/viewModels` | `src/frontend/viewModels.ts` | view models + UI invariants       |
| `@shared/jobs/service`        | `src/jobs/service.ts`        | the job view contract             |
| `@shared/marketdata/provider` | `src/marketdata/provider.ts` | `DataProvenance`                  |
| `@shared/realtime/contracts`  | `src/realtime/contracts.ts`  | event names and payload schemas   |
| `@shared/realtime/events`     | `src/realtime/events.ts`     | the event envelope                |
| `@shared/realtime/protocol`   | `src/realtime/protocol.ts`   | the WebSocket wire protocol       |
| `@shared/types`               | `src/types.ts`               | `EpistemicKind`, shared types     |

The mapping is **exact-match, not a directory prefix**. `@shared/db/sqlite`,
`@shared/server/app` and `@shared/jobs/queue` do not resolve — at typecheck time
_and_ at bundle time. The boundary is enforced by the toolchain, not only by a test.

**One list, three consumers.** `config/sharedSurface.ts` holds the map; it is not
duplicated anywhere.

| Consumer            | How it reads the surface                                                      |
| ------------------- | ----------------------------------------------------------------------------- |
| `vite.config.ts`    | `sharedAlias(root)` → `resolve.alias` (Vite does not read TypeScript `paths`) |
| `vitest.config.ts`  | the same `sharedAlias(root)`                                                  |
| `tsconfig.json`     | a literal `paths` mirror (targets `./src/…js`, required by `NodeNext`)        |
| `web/tsconfig.json` | a literal `paths` mirror (`../src/…js`, `moduleResolution: bundler`)          |

Vitest needs the alias for a reason worth naming: several suites import frontend
modules directly (`tests/realtime-client.test.ts` → `web/src/realtime/client.ts`), and
those modules cross the boundary. A mapping that exists only in the bundle config would
make the boundary work in production and fail in CI.

`config/sharedSurface.ts` cannot be reduced to two places, because TypeScript `paths`
cannot read a module. `tests/monorepo-boundary.test.ts` therefore asserts that the two
tsconfig blocks agree with the shared map on every specifier and every target, and that
neither bundler config inlines its own copy.

No plugin was added: the alias is a plain resolver map, not a dependency.

## 3. Target structure (not yet populated)

```
apps/                        packages/
├── desktop/                 ├── ui/
├── web/                     ├── database/
└── api/                     ├── ai/
                             ├── market-data/
                             ├── trading-engine/
                             └── shared/
```

These directories exist as **documentation markers only**. Each holds a README
stating what will move there and which trigger fires it. There is deliberately
**no `package.json` inside them** and **no `workspaces` field** in the root
`package.json`, so npm does not treat them as packages and nothing can be
accidentally imported from them. `tests/monorepo-boundary.test.ts` asserts both.

Where things live **today**, unchanged: backend in `src/`, frontend in `web/`,
shell in `src-tauri/`, tests in `tests/`, docs in `docs/`.

## 4. Dependency direction (the rule that must hold)

```
web/src/**  ──@shared/*──▶  src/**   (13 declared modules only)
src/**      ──✗──▶  web/**           (never; asserted)
web/src/**  ──✗──▶  src/{db,server,auth,jobs/queue,jobs/store}   (internals, never)
```

`apps/*` will consume `packages/*`; `packages/*` never import an app. That is the
same rule, one level up, and it is what the declared surface pre-encodes.

## 5. Migration boundaries — what may and may not move

**May move (when the trigger fires):** the 13 shared modules, whole backend modules
(`src/db` → `packages/database`, `src/llm`+`src/agent`+`src/vector` → `packages/ai`,
`src/marketdata` → `packages/market-data`, the frontend component set → `packages/ui`).

**Must not move without a separate, reviewed change:**

- `src-tauri/**` — the Rust shell and `scripts/build-sidecar.mjs` hardcode
  `../web/dist` and `dist/server/start.js`; the sidecar cannot be built here (no Rust
  toolchain), so a move cannot be verified.
- `tests/**` — 28 suites import `../src/…`; `technology-lock.test.ts` reads
  `process.cwd()/src/**` directly.
- The `@shared` mapping itself, without updating all three mirrors at once.

## 6. Current limitations

1. **`@shared` is a name over `src/`, not a package.** There is no `packages/shared`
   yet; the alias points into `src/`. It makes the boundary _stable and enforceable_,
   not _physically separate_.
2. **No workspace tooling.** Deliberate (ADR-0035): `npm ci` with the committed
   lockfile remains the single install path.
3. **The placeholder directories are inert.** They cannot be built, imported or
   installed; they are a map, not a package set.
4. **The frontend still reads backend source**, so the two typecheck configs must
   both carry the `paths` mapping. A published package would need a build step.
5. **`node:sqlite` portability is unchanged** — no impact from this work.

## 7. Next step (Phase 4.3 candidate)

Per ADR-0035, the next action is **not** the full migration. It is:

**Extract `packages/shared` only — source-only, no build step.** With the alias in
place this is mechanical: create `packages/shared/` with a real `package.json`, move
the 13 modules into it, and repoint the alias target from `src/…` to `packages/shared/…`.
Because every consumer already imports one of 13 exact specifiers, no consumer import
changes — which is precisely the point of doing Step 1 first.

Split `packages/database`, `packages/ai`, `packages/market-data`, `packages/ui` and
`packages/trading-engine` only when a trigger from §6 of the assessment fires (a
second consumer, independent packaging, or non-Rust sidecar build steps).

## 8. How it is enforced

`tests/monorepo-boundary.test.ts` (14 tests) asserts:

- the dependency direction is one-way (nothing in `src/` imports `web/`);
- no frontend file reaches into `src/` by relative path — the boundary is only `@shared/*`;
- every `@shared/*` specifier used in the frontend is on the declared surface, and no
  declared module is dead (every one is actually consumed);
- both tsconfig `paths` blocks contain **exactly** the shared map's 13 specifiers and
  agree on every target file, and every target exists;
- both bundler configs import the shared map instead of inlining literals;
- the surface contains no backend internals, and internal or unknown specifiers
  (`@shared/db/sqlite`, `@shared/server/app`, bare `@shared`) have **no resolver entry**,
  so they fail to build rather than quietly resolving;
- `apps/` and `packages/` contain no `package.json` and the root package declares no
  `workspaces` (no accidental half-migration);
- the placeholder READMEs exist and say what they are;
- the assessment, ADR-0035 and this document exist and are cross-referenced.
