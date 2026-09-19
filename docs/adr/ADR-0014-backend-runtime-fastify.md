# ADR-0014 — Backend runtime and framework: Node.js 22 LTS + Fastify 5

- **Status:** Accepted (Phase 3.1, architecture lock `DEC-BE-1-RUNTIME`, `DEC-BE-2-FRAMEWORK`, `DEC-BE-3-API`)
- **Date:** 2026-09-19
- **Supersedes:** none

## Context

Phase 2 built the API layer as transport-agnostic typed contracts
(`src/api/contracts.ts`) with a fixed pipeline: envelope validation → authN/authZ
guard → body validation → dispatch. The backend must now be mounted on a real
HTTP server without duplicating that pipeline, while remaining one desktop
process alongside jobs, the agent orchestrator and a WebSocket endpoint.

Additional constraints: the API is loopback-only; secrets resolve at the point
of use; a per-launch local bearer token will be added by the Tauri shell
(ADR-0001); logs must stay structured and redacted; the runtime must be
bundleable as a Tauri sidecar.

## Decision

**Runtime: Node.js 22 LTS. Framework: Fastify 5 (loopback only). API shape:
contracts stay in `src/api/contracts.ts` and Fastify is an adapter.**

- Fastify's hook lifecycle maps 1:1 onto our pipeline (`onRequest` → envelope,
  `preHandler` → guard, handler → typed body), so the guard cannot be bypassed
  by forgetting to call it: routes are registered by iterating `API_ROUTES`.
- Fastify provides native Pino logging (feeding `src/core/logging.ts` redaction),
  first-class WebSocket support (`@fastify/websocket`, ADR-0017), and body-size
  and request-timeout limits that already exist in `AppConfig`.
- Node 22 LTS is the bundled sidecar runtime; `engines.node >= 20` and the CI
  Node 20 + 22 matrix are kept for compatibility, not as a second target.
- Both transports (HTTP and the in-process desktop bridge) run the _same_
  pipeline, so transport cannot change authorization outcomes.

## Alternatives rejected

| Alternative       | Why rejected                                                                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Express           | No built-in validation/lifecycle model, so the guard pipeline would be re-implemented per route; slower; v5 maintenance churn is avoidable risk.                                                 |
| NestJS            | DI container, decorators and modules duplicate the explicit typed contracts and the dependency-direction rules already documented; heavy for a single-process desktop app.                       |
| Hono              | Excellent for edge/serverless, but we need a long-lived stateful process with a database, a job worker pool and WebSockets — Fastify's plugin ecosystem is a better fit.                         |
| Raw `node:http`   | We would rebuild routing, error mapping, timeouts and WebSocket handling — all solved problems with battle-tested libraries.                                                                     |
| Bun               | Fast and appealing, but native-module support (better-sqlite3) and sidecar/Tauri packaging maturity are not yet comparable; adopting it would put the storage layer at risk.                     |
| Deno              | Smaller ecosystem for our SQLite/WebSocket/job needs; its permission model does not replace our own deny-by-default authorization, so it adds migration cost without removing the need for ours. |
| Python backend    | Would fork the type system: the risk tools, permissions and contracts are already strict TypeScript shared with the frontend.                                                                    |
| Rust-only backend | Would move the domain model into a second language; the Rust host is reserved for pure deterministic compute behind the `Tool` interface.                                                        |

## Consequences

**Positive:** guard pipeline enforced structurally; one logging path; WebSocket
and HTTP on the same loopback server; the Fastify server can be swapped for the
in-process bridge with zero contract changes.

**Negative:** Fastify's schema validation must be deliberately disabled (see
ADR-0015) or two validators would exist; plugin ordering must be reviewed
whenever a new global hook is added.

**Security impact:** positive — centralized hooks mean authorization runs before
every handler by construction, and the loopback bind plus token handshake keeps
other local processes out.

## References

- [technology-decisions.md § 2](../technology-decisions.md)
- [api-auth.md](../api-auth.md)
- [ADR-0015](./ADR-0015-validation-zod-single-source.md), [ADR-0017](./ADR-0017-realtime-websocket-transport.md)
