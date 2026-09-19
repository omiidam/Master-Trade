# Logging & Observability

Implemented in `src/core/logging.ts` (+ correlation ids from `src/core/ids.ts`).

## 1. Structured logs

Every log is a record, never a formatted string:

```ts
LogRecord {
  level: 'debug' | 'info' | 'warn' | 'error';
  time: string;                 // ISO
  component: string;            // 'api', 'agent.orchestrator', 'llm.gateway', ...
  message: string;              // redacted
  correlationId?: string;
  event?: string;               // stable name, e.g. 'llm.endpoint.failed'
  data?: Record<string, unknown>; // recursively redacted
}
```

- `Logger.child(component, correlationId?)` derives scoped loggers without
  losing the correlation id; end-to-end tracing is one filter away.
- Level filtering via `LOG_LEVEL_ORDER` (`config.observability.level`, default
  `info`).
- Sinks are pluggable: `MemoryLogSink` (tests, in-app log panel),
  `JsonLinesLogSink` (local JSONL file, later a rotating file sink). A remote
  sink is deferred and must never receive unredacted payloads.

## 2. Redaction — never log credentials

Redaction is structural, not a convention:

- `SENSITIVE_KEY` (`api_key`, `apikey`, `secret`, `password`, `token`,
  `authorization`, `cookie`, `credential`, `private_key`, `session_id`,
  `session_secret`) — matching keys are replaced with `[redacted]`.
- `SECRET_VALUE` patterns (`sk-…`, `AKIA…`, JWT `eyJ…`, `bearer …`, `ghp_…`) —
  matching substrings inside messages and values are replaced.
- `redactValue()` recurses through objects and arrays (depth-capped) so nested
  or accidental secrets are covered.
- `observability.redactSecrets` is typed `true` and validated at startup;
  disabling it is impossible without a code change.
- Config never holds secrets at all (`SecretRef` only), which removes the most
  common leak path.

## 3. Correlation ids

`IdFactory.correlationId()` mints one id per user-visible operation at the API
boundary. It is threaded into: API response, backend service, orchestrator run,
context assembly, tool calls, memory writes, jobs, real-time events and log
records. `audit_records.correlation_id` and `messages.correlation_id` are
indexed, so "show me everything that happened for this click" is one query.

## 4. Agent events, tool calls, provenance

| Signal           | Where                                              | Contains                                       |
| ---------------- | -------------------------------------------------- | ---------------------------------------------- |
| Agent lifecycle  | `agent.status` events + logs                       | state transitions, block reasons               |
| Agent statements | `messages` table + audit                           | text, epistemic label, sources                 |
| Tool calls       | memory/audit entries                               | tool name, version, capability, epistemic kind |
| LLM attempts     | `llm.*` log events                                 | provider, model, outcome, code, latency, usage |
| Market data      | `DataQualityReport` + provenance                   | issues, provenance, provider, source           |
| Rule lifecycle   | `trading_rules` + `rule_evaluations` + `approvals` | status, metrics, deciders                      |
| Jobs             | `jobs` table + `job.status` events                 | status, attempts, error, idempotency key       |

`agent.tool` and `audit.record` real-time events default to owner/coach
audiences, matching the file-level audit policy.

## 5. Audit trail

- `audit_records` is append-only: `correlation_id`, `actor_id`, `event`,
  `payload`, `recorded_at`.
- Provenance is recorded on every memory write and tool invocation, which makes
  the audit trail a by-product of normal operation rather than an afterthought.
- Approvals store requester, decider and timestamp, so "who activated this rule,
  and who approved it" is always answerable.
- Retention: `observability.auditRetentionDays` (default 365). Audit rows are
  never mutated; expiry is handled by a future archiving job.

## 6. What is deliberately not logged

Raw prompts and provider payloads containing user content are logged only at
`debug` with redaction and are excluded from the default level; API keys and
session secrets never appear at any level; stack traces never cross the API
boundary (they stay in local error logs and the UI shows typed errors only).
