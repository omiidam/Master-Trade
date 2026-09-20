# ADR-0038 — Finalized import strategy and package boundaries

- **Status:** Accepted
- **Phase:** 4.5
- **Decision id:** `DEC-REPO-4-IMPORTS`
- **Consolidates:** [ADR-0035](./ADR-0035-monorepo-migration-staged-boundary-first.md), [ADR-0036](./ADR-0036-extract-shared-package-source-only.md), [ADR-0037](./ADR-0037-trading-engine-deterministic-core.md)

## Context

Phases 4.3 and 4.4 changed where code lives and how it is reached, and left the rules
spread across three ADRs plus doc updates. Phase 4.5 was a stabilization pass: audit the
result, fix drift, and state the resolution rules **once**, normatively, so a future
change does not have to reconstruct them.

The audit found the structure sound — all `package.json` scripts resolve, the Tauri chain
needed no change, no circular dependencies, no duplicated domain logic — and found
**drift in the descriptive surfaces**, which is the class of defect a stabilization phase
should expect:

- `src/core/architectureLock.ts` named **three paths that no longer exist**
  (`src/api/contracts.ts`, `src/desktop/ipc.ts`, `src/api`). The lock is machine-readable
  and enforced, but nothing validated its _path claims_, so the drift was invisible.
- Four current-state documents named removed paths, including the canonical
  `docs/architecture.md` (four claims) and `docs/market-data.md`.

## Decision

### 1. How each side resolves code (the rule)

| Consumer                               | Specifier form    | Why                                                                                              |
| -------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------ |
| Frontend (`web/src/**`) → shared       | `@shared/*`       | a bundler resolves an alias; the specifier is stable and exact-match                             |
| Frontend → anything else               | **forbidden**     | there is no resolver entry, so it fails to type-check _and_ to bundle                            |
| Backend (`src/**`) → both packages     | **relative path** | Node ESM cannot execute a `.ts` specifier, and Node disables type-stripping under `node_modules` |
| Packages → the backend or the frontend | **forbidden**     | the direction is one-way; asserted                                                               |

`@shared/*` is deliberately **not** used by the backend. It resolves only as a Vite/tsc
alias, so using it there would produce code that type-checks and then fails at runtime —
the failure mode ADR-0036 was written to avoid. The backend's longer relative specifiers
are the accepted cost of "source-only, no build step".

### 2. What each package may depend on

```
packages/shared          ──▶  nothing outside itself
packages/trading-engine  ──▶  packages/shared, and itself
src/**                   ──▶  packages/shared, packages/trading-engine
web/src/**               ──▶  packages/shared (via @shared/*), and only that
packages/*               ──✗▶ src/**, web/**, src-tauri/**
web/src/**               ──✗▶ src/**
```

The shared surface stays **exact-match**: `@shared/db/sqlite`, `@shared/server/app` and
bare `@shared` have no resolver entry, so backend internals cannot become contracts by
accident.

### 3. Determinism is a boundary, not a convention

`packages/trading-engine` may reach no `src/llm`, `src/agent`, `src/db`, `src/server`,
`src/realtime`, `src/vector`, `src/storage`, `web/`, and no `node:*` builtin. This is what
makes "risk calculations must not depend on LLM-generated reasoning" checkable.

### 4. Path claims must be true

Any **repository path named by the architecture lock** must exist. `technology-lock.test.ts`
now enforces it, so a move cannot leave the lock describing a repository it no longer
describes. (Verified by reintroducing a stale path: the test fails.)

Current-state documents are corrected when a move invalidates them. ADRs written before a
move are **not** rewritten — they are records of their own phase, and the ADR index carries
a standing path note pointing at `docs/monorepo.md`.

### 5. Install and build topology stay frozen

**No npm workspaces**, so `npm ci` with the committed lockfile is the single install path
and the optional-dependency hoisting surface behind the `@tailwindcss/oxide` failure
(`c92fa9c`) stays closed. `rootDir` is `"."`, so output is `dist/src/**` plus
`dist/packages/*/src/**`.

## Consequences

The rules are now stated in one place and enforced by `tests/monorepo-boundary.test.ts`
(25 tests) and `tests/technology-lock.test.ts` (7 tests). The costs are unchanged and
accepted: the backend's cross-package specifiers are long, and a package that is not on the
shared surface cannot be reached by name from the frontend.

## Remaining migration work (not authorised by this ADR)

- `apps/web` + `apps/api`, and the four declined packages — each waits on an ADR-0035
  trigger.
- npm workspaces plus a built package artifact — only if the relative-specifier friction
  proves real, and only with a clean Ubuntu install re-verifying the native engine.
- An automated check that the **built** API resolves every cross-package import from
  `dist/`. Today that is covered by a typecheck, the test suite and a manual boot, not by a
  dedicated guard.
