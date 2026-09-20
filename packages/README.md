# `packages/` — package index

Two packages are **real**. Four directories are still **inert documentation markers** and
contain no `package.json`.

| Directory         | Status   | Holds today                                                              | Consumer(s)               |
| ----------------- | -------- | ------------------------------------------------------------------------ | ------------------------- |
| `shared/`         | **real** | the 13 `@shared/*` contract modules + their 9-module closure (22)        | web **and** api (**two**) |
| `trading-engine/` | **real** | the Phase-1 Tools layer: the `Tool` contract, `risk.ts`, `marketData.ts` | api (one — see below)     |
| `ui/`             | marker   | `web/src/components`, `web/src/design`, `web/src/lib` would go here      | web only                  |
| `database/`       | marker   | `src/db/**` — schema, dialects, migrations, repositories would go here   | api only                  |
| `ai/`             | marker   | `src/llm/**`, `src/agent/**`, `src/vector/**` would go here              | api only                  |
| `market-data/`    | marker   | **nothing to put here** — see below                                      | —                         |

## Why only two

[ADR-0035](../docs/adr/ADR-0035-monorepo-migration-staged-boundary-first.md) set the test:
packages exist to be **shared**, and a package with one consumer is ceremony plus a
build-order cost.

- **`shared`** is the one package with **two genuine consumers** — the frontend reaches it
  through `@shared/*`, the backend by relative path. Extracted in Phase 4.3
  ([ADR-0036](../docs/adr/ADR-0036-extract-shared-package-source-only.md)).
- **`trading-engine`** has **one** consumer, and was extracted anyway — for a **safety**
  reason rather than a sharing one. "Risk calculations must not depend on LLM-generated
  reasoning" was a convention; as a package it is a boundary a test refuses, since the
  engine may import `packages/shared` and itself and nothing else. Phase 4.4
  ([ADR-0037](../docs/adr/ADR-0037-trading-engine-deterministic-core.md)). Note that
  `src/evaluation` did **not** move: it drives the agent's `Orchestrator`, so it is not
  deterministic in the sense the package requires.

The other four were **declined with evidence**: measured, **zero** modules in `src/` are
imported from both `src/` and `web/`, and each declined candidate's boundary is already
enforced in place. `market-data` has nothing to put in it — the provider abstraction and
provenance are a contract the frontend consumes, so they are on the shared surface as
`@shared/marketdata/provider`.

## The markers are inert, deliberately

A directory here contains a `package.json` **only** when the package is real, and the root
`package.json` deliberately declares **no `workspaces`**, so the markers cannot be built,
installed or imported. Both facts are asserted by `tests/monorepo-boundary.test.ts`, along
with the package closures. Reopening a declined package is governed by ADR-0035's trigger
conditions, not by the existence of the directory.

Current layout and next steps: [monorepo.md](../docs/monorepo.md).
