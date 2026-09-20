# `packages/trading-engine` — the deterministic trading core

**Status:** a real, physical package as of **Phase 4.4** ([ADR-0037](../../docs/adr/ADR-0037-trading-engine-deterministic-core.md)).
This is no longer a placeholder directory.

## What this package is

It is the **Phase-1 Tools layer** — the explicit, typed, testable, deterministic
calculations — extracted so that determinism is a _structural_ property rather than a
convention. "Trading engine" names the domain: risk math and market-data calculation.

It is **not** a new architectural component, and it does not absorb the Model or the
Instructions. Master Trade's Model / Tools / Instructions separation is unchanged; this
package is the Tools part, and the Model and Instructions stay in the backend.

| Module              | What it holds                                                     |
| ------------------- | ----------------------------------------------------------------- |
| `src/framework.ts`  | the `Tool` contract, `ToolRegistry`, result helpers, capabilities |
| `src/risk.ts`       | `positionSizeTool`, `rMultipleTool` — the risk calculations       |
| `src/marketData.ts` | `smaTool`, `syntheticSeriesTool` — deterministic series math      |
| `src/index.ts`      | the `defaultToolRegistry`                                         |

## Why it exists — the safety argument, not a sharing one

Every other candidate package in this repository was declined in Phase 4.4 because it had
exactly **one consumer** and its boundary was already enforceable (see
[monorepo.md §6](../../docs/monorepo.md)). This one is different.

The project's rule is that **risk calculations must not depend on LLM-generated
reasoning**. That was a convention: `src/tools/**` happened to import nothing dangerous.
As a package it becomes checkable, and `tests/monorepo-boundary.test.ts` now asserts it:

> nothing in `packages/trading-engine` may import the LLM layer, the agent, the database,
> the HTTP server, the realtime hub, or any `node:*` builtin. It depends on
> `packages/shared` and on itself — nothing else.

A future change that tried to let a model influence position sizing would have to cross a
package boundary the test refuses, rather than quietly adding an import.

## The rules this package obeys

1. **It is deterministic and pure.** No LLM, no database, no network, no `node:*`
   builtins, no Fastify. Asserted by test.
2. **It depends only on `packages/shared`.** It never imports `src/**`, `web/**` or the
   Rust shell.
3. **It is source-only.** No build step. It is compiled with the repository
   (`tsconfig.build.json` includes it, `rootDir: "."`), so output is
   `dist/packages/trading-engine/src/**`.
4. **It is private and not an npm workspace**, preserving `npm ci` with the committed
   lockfile as the single install path.
5. **Nothing here can place an order.** There is no broker client, no execution path and
   no live-trading flag to read. `syntheticSeriesTool` generates **synthetic** data and
   labels it as such, which is why the tool is allowed to exist at all.

## What does _not_ live here

- The **LLM gateway**, provider adapters and agent orchestration (`src/llm`, `src/agent`).
- The **database** foundation and repositories (`src/db`).
- The **evaluation / backtest harness** (`src/evaluation`) — it drives the agent's
  `Orchestrator`, so it is not deterministic in the sense this package requires, and it
  must not live here.
- The **market-data provider abstraction and provenance** — a contract the frontend also
  needs, so it is on the shared surface (`@shared/marketdata/provider`), not here.
