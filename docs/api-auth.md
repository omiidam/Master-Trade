# API Layer, Authentication & Authorization

## 1. API layer

Implemented in `src/api/contracts.ts`; every request passes the same four steps,
in order, before any backend code runs:

1. **Envelope validation** — `validateEnvelope()` requires `version`,
   `correlationId`, `routeId`. Unknown versions are rejected rather than
   best-effort interpreted, so version skew is visible instead of silent.
2. **Authorization** — `guardRoute()` → `authorize()` (section 3).
3. **Body validation** — `route.validateBody()` returns typed input or a list of
   issues. No route handler ever receives `unknown`.
4. **Dispatch** — the backend receives typed input plus the correlation id.

### Versioning

`API_VERSION = 'v1'`, paths are `/v1/...`, and `ApiRoute` carries the version it
belongs to. Breaking change policy: add `/v2/...`, keep `/v1` until the desktop
client ships; identical `routeId` in both versions is allowed because the
envelope names the version explicitly. `API_ROUTES` is validated by tests to
contain only v1 entries today.

### Error handling

`src/core/errors.ts` defines the code → HTTP status map once:

| Code                   | Status | Meaning                                     |
| ---------------------- | ------ | ------------------------------------------- |
| `VALIDATION_FAILED`    | 400    | malformed or invalid input                  |
| `UNAUTHENTICATED`      | 401    | missing/expired session                     |
| `FORBIDDEN`            | 403    | authenticated but not permitted (or policy) |
| `NOT_FOUND`            | 404    | unknown entity/route                        |
| `CONFLICT`             | 409    | idempotency or state conflict               |
| `RATE_LIMITED`         | 429    | provider or local quota                     |
| `BUDGET_EXCEEDED`      | 402    | LLM budget exhausted                        |
| `POLICY_VIOLATION`     | 451    | safety rule forbids the operation           |
| `TIMEOUT`              | 504    | provider/job timeout                        |
| `PROVIDER_UNAVAILABLE` | 503    | all providers failed                        |
| `INTERNAL`             | 500    | unexpected                                  |

`RETRYABLE_CODES` marks which failures jobs and gateways may retry. Responses
use `ApiResponse<T>` = `{ok:true,data,correlationId}` or
`{ok:false,error,correlationId}`; error bodies are always `ErrorCode + message`
(+ optional non-sensitive details), never a stack trace.

### Protection against unauthorized operations

- Deny-by-default: no role grant means no permission.
- Approval-gated routes report `approvalRequired: true` from the guard, so the
  client learns the requirement _before_ attempting anything.
- Internal events are never serialized to a client (see `jobs-and-realtime.md`).
- There is no route whose operation can trade; `assertNoHardlineOperations()`
  fails startup if such an operation is ever introduced.

## 2. Authentication strategy

Local-first desktop authentication:

1. The user creates a local account; the password/PIN is hashed (argon2id or
   scrypt) and stored in `credentials`. The plaintext never leaves memory.
2. A session is issued (`Session {id, issuedAt, expiresAt}`) with TTL from
   `config.auth.sessionTtlMinutes`; sessions are transient rows and are purged
   by the `maintenance.cleanup` job.
3. Optional OS-keychain unlock: the shell's `SecureStore` holds a device secret
   that unlocks the local profile without re-typing a password.
4. `config.auth.allowAnonymousLocalLogin` defaults to `false`; anonymous access
   is never enabled by accident because `assertSafeConfig()` rejects unsafe
   combinations only, and this flag is explicit.

Session rules enforced in code (`isSessionActive`): expired sessions are denied
everywhere, including real-time subscriptions. Session ids are treated as
sensitive: the logger redacts keys matching `session[_-]?id`.

## 3. Authorization model

`src/auth/model.ts`:

- **Roles**: `owner`, `coach`, `student`, `observer`, `system`.
- **Operations**: 33 explicit ids (`lesson.read`, `agent.chat`, `tool.run`,
  `memory.verify`, `rule.propose`, `rule.activate`, `backtest.run`, ...), each
  with `sensitivity` and `requiresApproval`.
- **Grants**: `ROLE_PERMISSIONS` maps each role to operation ids. A role absent
  from the table can do nothing.
- **Decision**: `authorize(principal, operation, now)`:
  1. hardline prohibition (`broker`, `execute`, `place-order`, `live-trading`) → deny;
  2. missing principal → deny (`UNAUTHENTICATED`);
  3. expired session → deny;
  4. no role grant → deny (`FORBIDDEN`);
  5. otherwise allow, reporting whether approval is required.

- **Human approval for sensitive operations**: `rule.activate` (critical),
  `backtest.run` and `user.role.assign` require a recorded approval.
  `ApprovalWorkflow` enforces: only gated operations can be submitted, the
  requester cannot approve their own request, only `owner` may decide, and
  expired requests cannot be approved.

- **No live trading or broker execution**: there is no capability, operation,
  tool, job kind or config key for it. `SafetyProfile` types the flags as literal
  `false`; `assertSafeConfig()` and `assertNoHardlineOperations()` make the
  absence testable, and CI fails if that ever changes.

## 4. Transport

- Local HTTP + WebSocket on `127.0.0.1` (loopback only by default config).
- The desktop shell may bypass TCP with an in-process bridge, but the contracts,
  validation and guard are identical.
- `maxBodyBytes` (2 MB default) and `requestTimeoutMs` (30 s default) bound
  every request; oversized bodies fail with `VALIDATION_FAILED`.
