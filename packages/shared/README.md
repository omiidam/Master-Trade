# `packages/shared` — the shared surface

**Status:** a real, physical package as of **Phase 4.3** ([ADR-0035](../../docs/adr/ADR-0035-monorepo-migration-staged-boundary-first.md) step 2).
This is no longer a placeholder directory.

It holds the contract both the backend and the frontend depend on: the API envelope,
error codes, correlation ids, provenance, the realtime wire protocol, the job view
contract, the desktop IPC surface, and the view models.

## What is here

`src/` holds **22 modules** — the **13 declared surface entries** plus the 9 modules they
transitively need:

| Declared entry (specifier)    | Module                       |
| ----------------------------- | ---------------------------- |
| `@shared/api/contracts`       | `src/api/contracts.ts`       |
| `@shared/core/errors`         | `src/core/errors.ts`         |
| `@shared/core/headers`        | `src/core/headers.ts`        |
| `@shared/core/ids`            | `src/core/ids.ts`            |
| `@shared/core/provenance`     | `src/core/provenance.ts`     |
| `@shared/desktop/ipc`         | `src/desktop/ipc.ts`         |
| `@shared/frontend/viewModels` | `src/frontend/viewModels.ts` |
| `@shared/jobs/service`        | `src/jobs/service.ts`        |
| `@shared/marketdata/provider` | `src/marketdata/provider.ts` |
| `@shared/realtime/contracts`  | `src/realtime/contracts.ts`  |
| `@shared/realtime/events`     | `src/realtime/events.ts`     |
| `@shared/realtime/protocol`   | `src/realtime/protocol.ts`   |
| `@shared/types`               | `src/types.ts`               |

The 9 further modules — `api/schemas`, `auth/model`, `core/logging`, `core/rateLimit`,
`core/retry`, `desktop/host`, `jobs/queue`, `jobs/store`, `jobs/vocabulary` — are the
closure those entries pull in. They are **not** independently importable; only the 13
declared specifiers resolve.

## The rules this package obeys

1. **It depends on nothing.** No module here imports a file outside
   `packages/shared/src`. Verified by `tests/monorepo-boundary.test.ts`.
2. **It is source-only.** There is no build step. The frontend reaches it through the
   `@shared/*` alias (`config/sharedSurface.ts`); the backend imports it by relative
   path, because Node cannot execute a TypeScript specifier at runtime and disables
   type-stripping inside `node_modules`.
3. **It is private.** `"private": true`, and it is deliberately **not** an npm
   workspace yet — `npm ci` with the committed lockfile remains the single install
   path, so the optional-dependency hoisting surface behind the `@tailwindcss/oxide`
   failure (`c92fa9c`) is unchanged.
4. **It is compiled with the repository.** `tsconfig.build.json` includes it and sets
   `rootDir: "."`, so output is `dist/packages/shared/src/**` alongside `dist/src/**`.

## What does _not_ live here

`packages/ui`, `packages/database`, `packages/ai`, `packages/market-data` and
`packages/trading-engine` are still inert placeholders. They wait for an ADR-0035
trigger — a second consumer, independent packaging, or non-Rust sidecar build steps.

Implementation modules such as `db/`, `server/` and `auth/sessions` must never appear
on the surface: the declared specifiers are an **exact-match** list, so a frontend
import of `@shared/db/sqlite` or `@shared/server/app` fails to build.
