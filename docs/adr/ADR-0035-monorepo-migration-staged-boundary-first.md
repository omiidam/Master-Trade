# ADR-0035 — Keep one package; make the frontend/backend boundary explicit before splitting it

- **Status:** Accepted
- **Phase:** 4.1
- **Decision id:** `DEC-REPO-1-LAYOUT`
- **Refines:** ADR-0002 (single-process modular monolith)
- **Assessment:** [monorepo-assessment.md](../monorepo-assessment.md)

## Context

Master Trade currently ships as **one npm package**: a backend in `src/` (108 TS
files), a frontend in `web/src/` (81 files), a Rust shell in `src-tauri/`, and 28
root-level test suites. ADR-0002 chose this deliberately — a modular monolith,
boundaries by module rather than by process.

Phase 4.1 asked whether that should become an npm-workspace monorepo
(`apps/{desktop,web,api}` + `packages/{ui,database,ai,market-data,trading-engine,shared}`).

The inspection found the question is **mis-framed**, because the boundary the
monorepo is supposed to create already exists — as a path depth. **18 frontend
files** import backend source through raw relative specifiers up to four levels
deep (`../../../../src/marketdata/provider.js`), resolving against nine backend
modules. Nothing under `src/` imports `web/`, so the direction is already
one-way.

What is missing is not the _shape_ but the _enforcement_: `web/tsconfig.json`
declares no `paths`, the root `tsconfig.json` reaches into `web/src/{config,design,mock}`
to type-check them, and `vitest.config.ts` exists only because Vite's root is
`web/`. A UI component could import `src/db/sqlite.ts` today and both type checks
would pass.

## Decision

**Do not migrate to the full `apps/` + `packages/` layout now.** Take the
low-risk step that captures the benefit, and record explicit triggers for the
real migration.

1. **The dependency direction stays one-way** (`web → src`, never the reverse),
   enforced by `tests/monorepo-boundary.test.ts`.
2. **Cross-boundary imports are restricted to a declared set of backend entry
   modules.** A frontend file importing `src/db/**`, `src/server/**`, `src/auth/**`
   or `src/jobs/queue.ts` fails the build. The shared surface becomes a contract
   instead of an accident.
3. **The next step is a single import alias** for that surface — one `paths`
   entry mirrored in both tsconfigs — turning `../../../../src/...` into one
   stable specifier. No directory moves.
4. **Extract `packages/shared` first and alone**, as source-only, when the alias
   is in place. It is the only package with two genuine consumers.
5. **Split the rest only when a second consumer appears**, per the trigger
   conditions in §6 of the assessment.

## Alternatives rejected

- **Full `apps/` + `packages/` migration now.** Commit `c92fa9c`, two commits
  ago, fixed `@tailwindcss/oxide` failing to find its native binding on the VPS
  because npm was omitting _optional_ dependencies. Workspaces hoist differently;
  the platform package that resolves today can move or disappear. Migrating
  re-opens a failure this project has just closed, to buy structure it does not
  yet need.
- **Creating `packages/trading-engine` to match the target diagram.** There is no
  trading engine to put in it. The deterministic trading logic is `src/tools/risk.ts`
  plus the evaluation harness. An empty package created to satisfy an org chart is
  precisely the premature structure ADR-0002 exists to prevent.
- **`packages/ui`, `packages/database`, `packages/ai`, `packages/market-data` now.**
  Each would have exactly one consumer. Packages are for _sharing_; one consumer
  makes them folders with ceremony and a build-order cost.
- **Cross-package imports resolving to built `.d.ts`.** Today the frontend reads
  backend `.ts` source directly and it type-checks. Introducing a build step
  between them adds an ordering failure mode (`ERR_MODULE_NOT_FOUND` after
  bundling) that no test currently covers.
- **Enforcing the boundary with a linter dependency.** The repository already
  encodes architecture as executable invariants in `tests/`; a new lint stack is a
  new dependency for a check a 40-line suite performs today.
- **Doing nothing and only documenting.** The leaks are concrete: an unenforced
  boundary is one careless import away from a UI bundle pulling in the database
  driver. Documenting without enforcing would let the risk grow.

## Consequences

The frontend can no longer reach into backend internals — the boundary is checked
by test, so the eventual extraction is a mechanical rename rather than an
excavation. The assessment's own claims are pinned by the same suite, so it cannot
drift from the code it describes.

The cost is one more test suite and a declared-entries list that must be updated
when a genuinely new shared surface appears. That update is the intended friction:
it forces the question "is this the contract, or an implementation detail?" at the
moment it is asked, rather than after a frontend has imported a driver.

This ADR does **not** close the monorepo question. It converts it from an
undocumented mismatch into a decision with a trigger, so that reopening it is
deliberate.
