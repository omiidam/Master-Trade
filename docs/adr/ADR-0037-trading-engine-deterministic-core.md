# ADR-0037 — Extract `packages/trading-engine`; decline the other four candidate packages

- **Status:** Accepted
- **Phase:** 4.4
- **Decision id:** `DEC-REPO-3-ENGINE`
- **Refines:** [ADR-0002](./ADR-0002-modular-monolith.md), [ADR-0035](./ADR-0035-monorepo-migration-staged-boundary-first.md), [ADR-0036](./ADR-0036-extract-shared-package-source-only.md)

## Context

Phase 4.4 asked which of the remaining five candidate packages — `ui`, `database`, `ai`,
`market-data`, `trading-engine` — are genuinely justified. ADR-0035 set the test: a package
exists to be **shared**, and a package with one consumer is "a folder with ceremony and a
build-order cost". So the audit measured consumers rather than reading directory names.

**Result: of the five, four have exactly one consumer and no enforceable-boundary gain.**

| Candidate              | Real content                                        | Consumers         | Boundary already enforced?                                                                                                                                         |
| ---------------------- | --------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/ui`          | `web/src/components/**`                             | the frontend only | yes — the `@shared/*` surface already refuses a UI import of backend internals, and `monorepo-boundary.test.ts` asserts it                                         |
| `packages/database`    | `src/db/**` (23 files)                              | the backend only  | yes — "no module outside `src/db` may write SQL or import a driver"                                                                                                |
| `packages/ai`          | `src/llm` (11) + `src/agent` (9) + `src/vector` (1) | the backend only  | yes — provider SDK imports are confined to `src/llm/providers/**`; `LlmRequest` has no execution field                                                             |
| `packages/market-data` | **nothing** — `src/marketdata/` is empty            | —                 | n/a — the provider abstraction and provenance are a **contract the frontend consumes**, so they are already on the shared surface as `@shared/marketdata/provider` |

A cross-boundary scan confirms the measurement: **zero** modules in `src/` are imported
from both `src/` and `web/`. The frontend reaches the backend only through the declared
`@shared/*` surface, which points into `packages/shared`. There is no second consumer to
serve.

One candidate is different. `src/tools/**` — the `Tool` contract, `positionSizeTool`,
`rMultipleTool`, `smaTool`, `syntheticSeriesTool` — was already a **closed pure island**:
`framework.ts` imported only `packages/shared/src/types.ts`, `risk.ts` and `marketData.ts`
imported only the framework, and `index.ts` imported only its siblings. Verified: no
`node:*` builtin, no LLM, no database, no Fastify, no network.

## Decision

**Extract `packages/trading-engine` and decline the other four, recording the condition
that would reopen each.**

### Why the engine is justified without a second consumer

Not because it is shared — it is not — but because of a **safety** property the project
states as a rule:

> Risk calculations must not depend solely on LLM-generated reasoning.

That was a _convention_: `src/tools/**` happened to import nothing dangerous, and nothing
prevented the next commit from importing the LLM layer to "improve" position sizing. As a
package, the convention becomes a checkable boundary enforced by test:

> nothing in `packages/trading-engine` may import `src/llm`, `src/agent`, `src/db`,
> `src/server`, `src/realtime`, `src/vector`, `src/storage` or `web/`, and no `node:*`
> builtin. Its only permitted dependency is `packages/shared` and itself.

A model influence on trading math would now have to cross a package boundary that a test
refuses. That is a different class of guarantee from "the folder currently looks clean".

### What the package is, and is not

It **is** the Phase-1 **Tools** layer — the explicit, typed, deterministic, testable
calculations — now physically separated. "Trading engine" names the domain (risk math and
market-data calculation), not a new component. Master Trade's **Model / Tools /
Instructions** separation is unchanged: the Model and the Instructions stay in the
backend, and this package contains neither.

The evaluation/backtest harness (`src/evaluation`) explicitly does **not** move: it drives
the agent's `Orchestrator`, so it is not deterministic in the sense this package requires.

## Alternatives rejected

- **Creating `ui`, `database`, `ai` or `market-data`.** Each would have one consumer and an
  already-enforced boundary. This is precisely the "empty package created to satisfy an org
  chart" that ADR-0035 rejected, and Phase 4.1 already found `packages/trading-engine`
  would otherwise have been such a case — the difference here is that there is real code
  with a real isolation guarantee, not a directory named after a diagram.
- **`packages/market-data` holding the provider abstraction.** It would have to be
  _removed_ from the shared surface, which the frontend consumes for `DataProvenance`.
  That trades a working contract for a package with no content. Correctly declined.
- **Splitting market-data _calculations_ into their own package.** `marketData.ts` would
  need the same `Tool` framework as `risk.ts`, making a one-consumer package depend on
  another one-consumer package for a shared contract. The framework is the Tools
  contract; it belongs with the tools.
- **Moving `src/evaluation` into the engine.** It imports `../agent/orchestrator.js`. Putting
  it in would immediately violate the package's own determinism rule — the first thing the
  new test caught when the move set was drafted.
- **A build step / npm workspaces.** Same reasoning as ADR-0036: `npm ci` with the
  committed lockfile stays the single install path, and the npm hoisting surface behind the
  `@tailwindcss/oxide` failure stays closed.

## Consequences

The deterministic core is now a boundary the toolchain and a test both enforce, and the
repository has a falsifiable answer to "how do you know the risk math can't be driven by
the model". The four declined packages are documented with the evidence and the trigger
that would justify each, so the question reopens deliberately rather than by drift.

Costs, accepted: one more package to keep closed; the backend's imports of the tools layer
are now relative paths into `packages/trading-engine`; and three directories that Phase 4.3
had emptied (`src/api`, `src/frontend`, `src/marketdata`) were removed, so any document
naming them is now historical.

## Reopening conditions

`packages/ui`, `packages/database`, `packages/ai` and `packages/market-data` should be
created only when: a **second consumer** appears, independent packaging/release is
required, a non-Rust sidecar build step appears, or two consumers need **different builds**
of the same module — ADR-0035's triggers, unchanged.
