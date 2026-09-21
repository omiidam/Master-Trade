# Backend foundation (Phase 3.3)

The HTTP surface, mounted on the Phase 3.1 lock (Node.js 22 + Fastify 5, Zod as
the only validator — [ADR-0014](./adr/ADR-0014-backend-runtime-fastify.md),
[ADR-0015](./adr/ADR-0015-validation-zod-single-source.md)).

**Scope of this phase:** server structure, API versioning, error handling,
validation, the authentication boundary, authorization middleware, logging,
configuration management and health checks — plus tests that make the
architectural invariants executable. **Not** in this phase: persistence, hosted
model providers, market-data providers, real-time transport and job workers.
Nothing here executes a trade, and no order-placing capability exists to reach.

## 1. Module map

| File                          | Responsibility                                                                                              |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `src/server/app.ts`           | Assembly + boot preconditions. `createServer()` is the single entry point.                                  |
| `src/server/start.ts`         | Process entry point: binds loopback, logs, graceful SIGINT/SIGTERM shutdown.                                |
| `src/server/authorization.ts` | **The request pipeline** — version gate → access policy → envelope → authN → authZ → approval → validation. |
| `src/server/access.ts`        | Local access policy: loopback-only, optional per-launch shell token.                                        |
| `src/server/approval.ts`      | Approval gate the pipeline consults; defaults to denying everything.                                        |
| `src/server/context.ts`       | Per-request context (correlation id, route, principal, logger) and handler types.                           |
| `src/server/routes.ts`        | Registers every catalogue route behind the same `preHandler`; route coverage proof.                         |
| `src/server/errors.ts`        | One error handler and one 404 handler for the whole process.                                                |
| `src/server/logging.ts`       | Pino as a redacting sink; the structured request-completed line.                                            |
| `src/server/health.ts`        | `HealthRegistry`: liveness, readiness, critical vs non-critical aggregation.                                |
| `src/server/checks.ts`        | The concrete checks, including the ones that re-assert safety invariants at runtime.                        |
| `src/server/handlers/*.ts`    | Thin handlers: shape a response from a service call.                                                        |
| `src/auth/sessions.ts`        | Session service: issue/redeem/revoke, SHA-256 token hashes, TTL.                                            |
| `src/config/loader.ts`        | Environment → `AppConfig`, refusal rules, redacted `describeConfig()`.                                      |
| `src/agent/service.ts`        | Backend entry point for one agent turn (composes the Phase 1 orchestrator).                                 |

`src/server/index.ts` is a barrel so backend-only entry points (agent demo,
tools, evaluation) do not pull Fastify into their process.

## 2. The request pipeline

Every route in `API_ROUTES` is registered with the same `preHandler`, and
`assertRouteCoverage()` fails start-up if any registered route lacks it. The
steps run in this order:

| #   | Step                 | Refuses when                                                                      |
| --- | -------------------- | --------------------------------------------------------------------------------- |
| 1   | Version gate         | `x-api-version` names a version other than `v1` → 400                             |
| 2   | Access policy        | The request did not arrive over loopback → 451; shell token missing/invalid → 401 |
| 3   | Envelope unwrap      | An envelope-shaped body fails version/route/correlation checks → 400              |
| 4   | Authentication       | A bearer token was presented but does not resolve → 401                           |
| 5   | Authorization        | No role grants the route's operation (deny-by-default) → 401/403                  |
| 6   | Approval gate        | `requiresApproval` operation without a recorded human approval → 451              |
| 7   | Validation           | Zod rejects params, query or body → 400 (safe `issues`)                           |
| 8   | Identifier agreement | Path and body name the same id differently → 400                                  |

Authorization deliberately runs **before** body validation: an unauthenticated
caller learns nothing about which fields the server would have accepted.
Correlation id is taken from `x-correlation-id` when it is safe to echo, from the
envelope otherwise, and minted locally as a fallback.

`routeEntries()` reports the catalogue with an `implemented` flag, and the
pending routes answer `501 NOT_IMPLEMENTED` naming the missing capability. They
are registered rather than omitted so there is exactly **one** code path per
request — an unimplemented route is still authenticated, authorized and
validated before it says no. See
[ADR-0021](./adr/ADR-0021-single-request-pipeline.md).

### Why the pipeline is a middleware, not a call

A guard that a handler must remember to call is a guard that will eventually be
forgotten. Registering it as `preHandler` for routes generated from the
catalogue makes "handler reached without authorization" impossible rather than
unlikely, and `assertRouteCoverage()` turns a future bypass into a boot failure.

## 3. API versioning

- Version lives in the path (`/v1/...`) and is checked again via
  `x-api-version`, so a client that pins a version gets a refusal instead of a
  best-effort interpretation.
- `assertApiCatalogue()` runs at start-up and refuses: duplicate route ids, a
  route whose `version` differs from the current one, a path outside `/v1`, and
  any anonymous route that is not read-only (GET).
- The `/v2` migration policy in [api-auth.md](./api-auth.md) is unchanged: a
  breaking change adds a version; it never mutates `v1`.

## 4. Error handling

`installErrorHandlers()` is installed once at construction, so no route can opt
out. Every failure leaves through it and produces the same envelope:

```json
{
  "ok": false,
  "error": { "code": "UNAUTHENTICATED", "message": "…", "details": {} },
  "correlationId": "…"
}
```

- Status comes from the single `ERROR_STATUS` table in `src/core/errors.ts`
  (`POLICY_VIOLATION` 451, `NOT_IMPLEMENTED` 501, `PROVIDER_UNAVAILABLE` 503, …).
- A rejection **inside** the pipeline is returned by the pipeline (so it is not
  double-handled); anything thrown afterwards becomes `INTERNAL` unless it is a
  typed `AppError`.
- Transport-level failures Fastify raises _before_ any handler (malformed JSON,
  unsupported media type, body over the limit) are mapped into
  `VALIDATION_FAILED` (400) instead of leaking a Fastify-specific status.
- The response body is built from the typed error only: never a stack trace,
  never the original thrown value, never a provider payload. Unknown paths get
  the same envelope with `NOT_FOUND` (404).

### A boot refusal is reported, never silent

The start-up preconditions — `assertSafeConfig()`, the unsafe-environment refusal,
`assertNoHardlineOperations()`, `assertApiCatalogue()` and `loadInstructions()` — all
run inside `createServer()`, **before** `createLogging()` builds from the very
configuration they are checking. That ordering is the guarantee, so it stands.

The consequence is that a refusal has no logger to go through, and until Phase 4.7 it
had no output either: `node dist/src/server/start.js` with
`MASTER_TRADE_API_HOST=0.0.0.0` exited **1 with nothing on stdout or stderr**. The
entry point now calls `reportBootRefusal()`, which writes **one structured, redacted
record** with event `server.refused` directly to `stderr` and then re-throws, so the
exit code is unchanged and the `listen` failure path (which does have a logger) is not
double-reported. `src/server/start.ts` exports it with an injectable stream, which is
how it is tested without spawning a process. See
[ADR-0040](./adr/ADR-0040-a-refusal-is-reported-before-the-logger-exists.md).

## 5. Validation

Zod schemas in `src/api/schemas.ts` are the only runtime validator; Fastify's own
body validation is disabled (`ADR-0015`). Schemas are `z.strictObject`, so an
unknown field is rejected rather than silently ignored — a field a client relies
on but the server drops is a bug that only shows up in production. Types come
from `z.infer`, so shape and check cannot drift. Issue messages are
`field: reason` only.

## 6. Authentication boundary

`SessionService` (in-memory for this phase):

- `issue()` returns the raw token **once** and stores only its SHA-256 hash, so a
  dump of the session table cannot be replayed.
- `redeem()`/`require()` resolve a token to a principal with an explicit expiry
  check; an expired or revoked session is a 401, never a silent downgrade to
  anonymous — even on a public route.
- `issue()` refuses a session with no roles: a principal that can do nothing is a
  bug, not a convenience (deny-by-default, `ADR-0007`).
- `revoke()`, `revokeAllForUser()`, `purgeExpired()` and `activeCount()` exist;
  `list()` returns hashes and metadata only, never tokens.

Not implemented on purpose: password/credential verification. That belongs to
the persistence slice (credentials table + argon2/scrypt); this service assumes
the caller has already authenticated the account and manages sessions only.

## 7. Authorization middleware

`guardRoute()` (Phase 2, unchanged) plus the pipeline: an authenticated principal
is authorized for the route's `operation` against the 33-operation catalogue;
absent operation or absent grant means denied, and the response is 403 with the
reason. `rule.activate` and `backtest.run` additionally require a recorded human
approval — `denyAllApprovals` is the default gate, so a server built without an
approval workflow cannot activate a rule at all.

## 8. Logging

Structured records only (see [observability.md](./observability.md)); Pino is
the sink, not the interface, and carries its own redaction list as a second line
of defence.

| Event                    | When                                                       |
| ------------------------ | ---------------------------------------------------------- |
| `server.constructed`     | Once per `createServer()`, with route counts and mode      |
| `server.boot.warning`    | Non-blocking conditions (no shell token, relative storage) |
| `http.request.rejected`  | Pipeline refusal, with code + status + route id            |
| `http.request.failed`    | Error handler, with code + status + safe message           |
| `http.request.completed` | One line per request: method, route id, status, duration   |
| `agent.turn.completed`   | One line per agent turn: status, label, tool result count  |

Fastify's own request logging is off via a `LogController` instance (the
top-level `disableRequestLogging` option is deprecated and removed in v6), so
there is exactly one line per request and it carries the route id and correlation
id. Bodies, headers and query strings are never logged; the test suite asserts a
session token does not appear anywhere in the sink.

## 9. Configuration management

`loadConfigFromEnv()` builds a fully resolved `AppConfig`; nothing downstream
reads `process.env`.

1. **Unsafe keys are refused first.** `MASTER_TRADE_LIVE_TRADING`,
   `MASTER_TRADE_BROKER_EXECUTION`, `MASTER_TRADE_ALLOW_SENSITIVE_FILES`,
   `MASTER_TRADE_ALLOW_ANONYMOUS_LOGIN`,
   `MASTER_TRADE_ALLOW_MODEL_TOOL_EXECUTION`, `MASTER_TRADE_REDACT_SECRETS` —
   any truthy value aborts start-up. A falsy value is a no-op; those names are
   part of the schema (guarded by a `satisfies` check so the refusal list and the
   schema cannot drift) rather than being rejected as "unknown".
2. **Unknown `MASTER_TRADE_*` variables are rejected**, so a typo cannot silently
   leave an intention unapplied.
3. **Secrets are never read here.** The loader stores a `SecretRef` naming the
   environment variable; resolution happens at the point of use
   (`resolveSecretFromEnv`, or the OS keychain in the desktop build).
4. **`assertSafeConfig()` re-checks the result structurally**, and
   `createServer()` calls it again before opening a socket: loopback host only,
   no live trading, no broker execution, no sensitive files, no remote storage,
   no live market data provenance, redaction on, approval requirement on, and the
   model cannot execute tools directly.
5. **`describeConfig()`** returns the effective configuration with values
   replaced by references (`env:OPENAI_API_KEY`, `shellToken.configured`) — safe
   to log, safe to show behind the owner-only readiness view.

`bootWarnings()` reports conditions that do not block start-up but must be
visible: no shell token configured, a non-scripted provider with no adapter
registered, a relative storage root, and `allowAnonymousLocalLogin` (which the
HTTP server deliberately does **not** honour, because a socket-only client cannot
prove "local user").

## 10. Health checks

| Endpoint               | Answers                             | Access                              |
| ---------------------- | ----------------------------------- | ----------------------------------- |
| `GET /v1/health`       | Liveness: process identity + uptime | anonymous, never calls a dependency |
| `GET /v1/health/ready` | Readiness: per-dependency state     | anonymous gets coarse status only   |

- **Critical** checks failing make the process not-ready: `503
PROVIDER_UNAVAILABLE` naming the failed checks. They re-assert the safety
  invariants at runtime — safe configuration, no trade-capable operation in the
  catalogue, no side-effecting tool registered, policy-compliant instructions, a
  legal agent lifecycle state.
- **Non-critical** checks report the honest state of this phase: database,
  storage, jobs, realtime, hosted LLM and market data are all `degraded`, because
  none of them is wired yet. Readiness returning `degraded` for a partially built
  system is better than claiming `ok`.
- Detail exposure follows the principal: anonymous → `{name, status}`;
  authenticated → adds `critical` and `detail`; owner → adds the redacted config
  summary. Synthetic secrets are asserted absent from every readiness response.

## 11. Route surface

| Route                                           | Status                                                         |
| ----------------------------------------------- | -------------------------------------------------------------- |
| `GET /v1/health`                                | Implemented                                                    |
| `GET /v1/health/ready`                          | Implemented                                                    |
| `POST /v1/agent/messages`                       | Implemented (offline deterministic adapter)                    |
| `POST /v1/academy/lessons/:lessonId/complete`   | `501` — needs the persistence slice                            |
| `POST /v1/rules/proposals`                      | `501` — needs the persistence slice + rule registry wiring     |
| `POST /v1/rules/proposals/:proposalId/activate` | `501` **and** approval-gated: no approval ⇒ 451 before the 501 |

## 12. Running it

```bash
npm run build
npm run api          # binds 127.0.0.1:4317 (config.api.host/port), graceful shutdown on Ctrl-C
curl http://127.0.0.1:4317/v1/health
```

There is no way to log in yet — sessions are issued programmatically
(`server.sessions.issue({userId, roles})`) — which is why the desktop shell
handshake and credential persistence are the next steps.

## 13. Tests

`tests/server.test.ts` (25) and `tests/config-loader.test.ts` (8) cover: the
envelope and correlation-id contract; per-role readiness detail; authentication
before authorization on **every** protected route; expired/unknown tokens;
never-downgrade-to-anonymous; Zod strictness, length limits, malformed JSON;
version and 404 handling; path/body disagreement; the 501 answers; the approval
gate failing closed and then passing with a recorded decision; loopback refusal;
the shell token; the deterministic tool path over HTTP; refusal to boot with an
unsafe config; route coverage; log redaction; a critical check producing 503; and
session/token handling (hashing, revocation, expiry, deny-by-default issuance).

Phase 1/2 safety assertions are unchanged and still in the default suite, so a
backend change cannot quietly relax them.

## 14. Deferred, with the reason

| Deferred                                          | Blocked on                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------- |
| Repositories, credential verification, migrations | Persistence slice (better-sqlite3 + Drizzle, `ADR-0016`)            |
| Hosted LLM provider behind the gateway            | Provider adapter work (`ADR-0019`); scripted adapter is the default |
| `/ws` real-time transport                         | `ADR-0017`; the event bus and auth model are ready                  |
| Durable job workers                               | `ADR-0018`; queue contract and health check exist                   |
| CORS / desktop bridge packaging                   | Tauri shell; loopback + shell token already constrain the surface   |
| Rate limiting per route                           | Nothing to protect yet; `src/core/rateLimit.ts` is ready            |
