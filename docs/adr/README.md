# Architecture Decision Records

Format: context → decision → **alternatives rejected and why** → consequences.
Status starts as `Accepted`; a superseded ADR keeps its number and points to its
replacement. ADRs 0010–0019 form the Phase 3.1 technology lock and each records
the alternatives that were deliberately turned down.

## Phase 1–2 — architecture and invariants

| ADR                                                     | Decision                                                                | Status   |
| ------------------------------------------------------- | ----------------------------------------------------------------------- | -------- |
| [0001](./ADR-0001-desktop-shell-tauri.md)               | Tauri as the desktop shell                                              | Accepted |
| [0002](./ADR-0002-modular-monolith.md)                  | Single-process modular monolith                                         | Accepted |
| [0003](./ADR-0003-sqlite-first.md)                      | SQLite as the initial database                                          | Accepted |
| [0004](./ADR-0004-llm-gateway-abstraction.md)           | Provider-independent LLM gateway                                        | Accepted |
| [0005](./ADR-0005-provider-independent-market-data.md)  | Provider-independent market data with mandatory provenance              | Accepted |
| [0006](./ADR-0006-vector-memory-separation.md)          | Vector memory separate from structured records, trust-gated             | Accepted |
| [0007](./ADR-0007-deny-by-default-auth.md)              | Deny-by-default authorization + human approval for sensitive operations | Accepted |
| [0008](./ADR-0008-no-experimental-core-dependencies.md) | No experimental languages/tech as core dependencies                     | Accepted |
| [0009](./ADR-0009-deterministic-tools-own-risk-math.md) | Deterministic tools own all risk math; LLM never bypasses permissions   | Accepted |

## Phase 3.1 — technology lock

| ADR                                                         | Decision                                                                    | Decision id(s)        | Status   |
| ----------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------- | -------- |
| [0010](./ADR-0010-frontend-framework-react-vite.md)         | Frontend framework: React 19 + Vite 6                                       | `DEC-FE-1-FRAMEWORK`  | Accepted |
| [0011](./ADR-0011-frontend-state-tanstack-query-zustand.md) | Frontend state: TanStack Query + Zustand                                    | `DEC-FE-2-STATE`      | Accepted |
| [0012](./ADR-0012-ui-system-tailwind-radix.md)              | UI system: Tailwind + Radix primitives (vendored)                           | `DEC-FE-3-UI-SYSTEM`  | Accepted |
| [0013](./ADR-0013-charting-lightweight-charts.md)           | Charting: TradingView Lightweight Charts behind a `ChartAdapter`            | `DEC-FE-4-CHARTING`   | Accepted |
| [0014](./ADR-0014-backend-runtime-fastify.md)               | Backend: Node 22 LTS + Fastify 5 as an adapter over typed contracts         | `DEC-BE-1·2·3`        | Accepted |
| [0015](./ADR-0015-validation-zod-single-source.md)          | Validation: Zod as the single source of truth, Fastify validation disabled  | `DEC-BE-4-VALIDATION` | Accepted |
| [0016](./ADR-0016-persistence-driver-and-orm.md)            | Persistence: better-sqlite3 + Drizzle, SQLite local / PostgreSQL production | `DEC-DB-1·2·3`        | Accepted |
| [0017](./ADR-0017-realtime-websocket-transport.md)          | Real-time: WebSocket over the existing event bus                            | `DEC-RT-1-WEBSOCKET`  | Accepted |
| [0018](./ADR-0018-durable-db-backed-job-queue.md)           | Jobs: durable database-backed queue with in-process workers                 | `DEC-JOBS-1-QUEUE`    | Accepted |
| [0019](./ADR-0019-llm-adapters-not-frameworks.md)           | LLM: adapters behind our interfaces; no agent framework                     | `DEC-AI-1·2·3`        | Accepted |

The machine-readable form of this lock is `src/core/architectureLock.ts` and it
is enforced by `tests/technology-lock.test.ts`. Every decision id above also
appears in [technology-decisions.md](../technology-decisions.md).
