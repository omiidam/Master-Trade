# packages/ — target structure (documentation marker)

Reserved for shared packages:

| Directory         | Will hold                                                            | Consumers today            |
| ----------------- | -------------------------------------------------------------------- | -------------------------- |
| `shared/`         | the 13 `@shared/*` modules that already cross the boundary           | web + api (**two**)        |
| `ui/`             | `web/src/components`, `web/src/design`, `web/src/lib`                | web only                   |
| `database/`       | `src/db/**` — schema, dialects, migrations, repositories             | api only                   |
| `ai/`             | `src/llm/**`, `src/agent/**`, `src/vector/**`, `src/instructions/**` | api only                   |
| `market-data/`    | `src/marketdata/**`                                                  | api only                   |
| `trading-engine/` | `src/tools/risk.ts` + the `src/evaluation/**` harness                | api only, **nearly empty** |

**No package exists here yet.** Phase 4.2 implemented the `@shared/*` boundary
([monorepo.md](../docs/monorepo.md)) and moved nothing. A directory contains a
`package.json` only when the package is real; the root `package.json` deliberately
declares **no `workspaces`**, so these directories are inert — they cannot be built,
installed or imported. Both facts are asserted by `tests/monorepo-boundary.test.ts`.

Package directories exist to be _shared_. Five of the six have exactly one consumer
today, so creating them now would add build-order cost and empty ceremony without
sharing anything ([ADR-0035](../docs/adr/ADR-0035-monorepo-migration-staged-boundary-first.md)).
`packages/shared` is the one exception — it is the first extraction (§7 of
monorepo.md).
