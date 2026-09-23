# Security, privacy and compliance foundation

Status labels: **Implemented** · **Planned** · **Requires review** (professional legal, security or
deployment review — see §14).

This document is the current statement of the platform's security and privacy posture: what is
enforced by code, what is verified by tests, and what is explicitly _not_ covered. The Phase 4
audit in [security-and-integration-audit.md](./security-and-integration-audit.md) is the historical
record of that phase; where the two disagree, this document is current.

Phase 5.8 added the transport boundary described in §3 and closed one real information-disclosure
gap (§6). Everything else in this document already existed and is now verified rather than assumed.

**The standing constraint:** this platform has no broker connection, no order route and no execution
path. `safety.liveTradingEnabled`, `safety.brokerExecutionEnabled` and
`ai.allowModelDirectToolExecution` are `false` by type, by default and by a boot-time check that
refuses to start otherwise (ADR-0020, ADR-0044).

## 1. The boundary at a glance

| Boundary                                                   | Enforced by                                                                                  | Verified by                                               |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Process refuses to start with an unsafe configuration      | `assertSafeConfig` (`src/core/config.ts`)                                                    | `tests/architecture.test.ts`, `tests/security.test.ts`    |
| Transport: headers, origin policy, rate limit              | `installSecurity` (`src/server/security.ts`)                                                 | `tests/security.test.ts`                                  |
| Local-only access, per-launch shell token                  | `createAccessPolicy` (`src/server/access.ts`)                                                | `tests/server.test.ts`                                    |
| Session tokens (Bearer, hashed at rest, TTL, revoke)       | `SessionService` (`src/auth/sessions.ts`)                                                    | `tests/server.test.ts`                                    |
| Per-route authorization, deny-by-default                   | `guardRoute` + `authorize` (`packages/shared/src/auth`)                                      | `tests/server.test.ts`, `tests/usage-api.test.ts`         |
| Capability catalogue is closed                             | `resolveCapability` (`packages/shared/src/capabilities`)                                     | `tests/capabilities.test.ts`                              |
| Eleven-stage pipeline order; refusal before the engine     | `planCapabilityRun`                                                                          | `tests/capabilities.test.ts`                              |
| Credits: no movement on a refusal, no double charge        | `UsageService` (`src/usage/service.ts`)                                                      | `tests/usage-api.test.ts`                                 |
| WebSocket authorization + deadlines + rate limits          | `RealtimeHub` (`src/realtime/hub.ts`)                                                        | `tests/realtime-hub.test.ts`, `tests/realtime-ws.test.ts` |
| Secret redaction in every log record                       | `redactValue` (`packages/shared/src/core/logging.ts`)                                        | `tests/security.test.ts`, `tests/usage-api.test.ts`       |
| Safe API errors (no stack, no library text)                | `toHttpFailure` (`src/server/errors.ts`)                                                     | `tests/security.test.ts`                                  |
| Desktop shell: no fs/shell/http capability, single spawner | `src-tauri/capabilities`, `verifyDesktopShell`                                               | `tests/desktop-shell.test.ts`, `npm run desktop:verify`   |
| Model cannot call a tool                                   | `ai.allowModelDirectToolExecution: false`; no tool registry is reachable from the model path | `tests/llm-registry.test.ts`, `tests/safety.test.ts`      |

## 2. Authentication, authorization and sessions

**Implemented.** Sessions are issued by `SessionService.issue` for an already-authenticated account
and resolved from a hashed token; the raw token never touches storage. A session with no role cannot
be issued, which is deny-by-default expressed as an invariant rather than a convention. Tokens
travel in `Authorization: Bearer`, never in a query string (a token in a URL ends up in logs).

Authorization is **per route**, decided by the route's declared `operation` against the role table,
with `guardRoute` refusing before any handler runs. The frontend's own restrictions are never
authorization: the interface may hide a control, and the server still decides.

Privilege escalation was reviewed across three shapes and is closed for each:

- **Self-promotion.** A role is not a request field anywhere; nothing in a body or path names a role.
- **Subject substitution.** No route names a user id. Reading another account's data is
  _unrepresentable_ rather than merely forbidden, and the API suites prove it with two sessions.
- **Operator self-dealing.** A credit adjustment is approval-gated, and an operator cannot adjust
  their own balance (`tests/usage-api.test.ts`).

**Planned:** multi-factor authentication, device binding and session listing/revocation from the UI.
None of them changes the model above; they add factors to the same session service.

## 3. Transport security (new in Phase 5.8)

**Implemented** in `src/server/security.ts`, mounted on every request and every reply, before any
route — including on failures, because a header that is missing exactly when something went wrong is
not a header.

**Response headers.** `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`,
`Cross-Origin-Resource-Policy: same-origin`, `Cross-Origin-Opener-Policy: same-origin`,
`Permissions-Policy` denying camera/microphone/geolocation/payment/USB, and `Cache-Control: no-store`
— not `no-cache`: portfolio declarations, decisions and session material are not to be written to a
WebView cache at all.

**Cross-origin policy.** An allow-list of loopback origins (Vite dev 5173, preview 4173, the API
itself 4317, on both `127.0.0.1` and `localhost`). An allowed origin is echoed **exactly** — never
`*` — with credentials, `Vary: Origin`, an explicit method list and an explicit header list that
includes the shell-token and correlation headers by name. A request that _states_ a foreign origin
is **refused** with `FORBIDDEN`, not merely denied CORS headers: the browser would block the read,
but the write would still have happened. A private-network origin is refused like any other, because
loopback means loopback. A request with no `Origin` at all is passed through untouched — the desktop
shell, the CLI and the test suite are not browsers, and the shell token and session token are what
authorize them. `assertSafeConfig` refuses to boot with a non-loopback entry in the allow-list, so
the policy cannot be widened by configuration.

**Rate limiting.** A sliding window per client address, keyed on the peer address
(`trustProxy: false`, so it is the socket, not a header the caller chooses), counted **before**
authentication — an unauthenticated flood is refused as a flood instead of costing a session lookup
per request. Default 600 requests/minute; a zero limit is a configuration violation. The bucket
table is bounded (oldest-first eviction) because an unbounded map keyed by client is itself a denial
of service. Exhaustion returns `429` with `Retry-After` and `x-ratelimit-remaining`.

**Not covered deliberately:** TLS. The API binds loopback only and its clients are local, so
terminating TLS here would add a certificate lifecycle with no attacker to stop. A public deployment
is **Requires review** (§14); `npm run desktop:verify` does assert that the desktop content security
policy is loopback-only with no wildcard and `object-src 'none'`.

## 4. The Agent and tool boundary

**Implemented.** The model cannot execute anything: there is no registry a model response can name,
`allowModelDirectToolExecution` is `false`, and the instruction loader refuses authorization language
in a prompt (`tests/safety.test.ts`). Deterministic engines are called by _code_ on the server, not
by the model; the model explains what the engine computed.

A capability run follows a plan whose order is the security property
([capability-integration.md](./capability-integration.md)): readiness → permission → entitlement →
engine. Two consequences worth stating: a request refused at any gate holds **no credits at all**
(not a charge and a refund), and a `high-impact` capability that would cite unverified memory is
rejected at boot.

Approvals: sensitive operations are approval-gated (`workflowApprovalGate`), and
`auth.requireApprovalForSensitiveOps` is `true` by type.

**Planned:** prompt-injection evaluation for hosted providers (currently the offline `scripted`
adapter is the default and no hosted provider is registered).

## 5. Data classification, ownership and retention

| Data                              | Class            | Stored where                         | Owner          | Retention assumption                      |
| --------------------------------- | ---------------- | ------------------------------------ | -------------- | ----------------------------------------- |
| Session material                  | **Restricted**   | In memory, token hashed              | The session    | Until TTL or revoke; never persisted      |
| Secrets (`SecretRef` → env)       | **Restricted**   | Environment only                     | Deployment     | Never logged, never in a response         |
| Profile and trading context       | **Confidential** | SQLite (local)                       | The account    | Until the account deletes it              |
| Portfolio declarations, decisions | **Confidential** | SQLite (local), append-only versions | The account    | Until the account deletes it              |
| Credit ledger, usage history      | **Confidential** | SQLite (local)                       | The account    | Integrity-preserving: append-only         |
| Audit records                     | **Confidential** | SQLite (local)                       | The deployment | `observability.auditRetentionDays`        |
| Knowledge and memory              | **Confidential** | SQLite (local) + vector index        | The account    | Until the account deletes it              |
| Uploaded files                    | **Confidential** | In-memory only in this phase         | The uploader   | Not durable — there is no disk write path |
| Market data                       | **Internal**     | Not persisted; supplied per request  | The provider   | Provenance and freshness travel with it   |

**Implemented — ownership.** Every stored record carries an owner, and no route names a subject, so
reading another account's data is unrepresentable. File storage implements `list(ownerId)`, and
`InMemoryFileStorage` is the only implementation — no disk path exists to traverse or leak.

**Implemented — retention.** `observability.auditRetentionDays` is a configured number. Purge jobs
that act on it are **Planned**; today the number is a declaration with no scheduled enforcement, and
that is recorded in [risks-and-deferred.md](./risks-and-deferred.md).

**Planned — deletion.** A user-initiated account/data deletion flow, including the append-only
records (credit ledger and context versions), which by design cannot be edited in place and would
need a documented erasure exception. This is the most important open privacy item, and it is
**Requires review** before any real user data is accepted.

## 6. Secrets, logs and errors

**Secret management.** A secret is referenced by `SecretRef` (`env:NAME`) and resolved from the
environment at the moment of use. There is no secret in a source file, a lockfile, a database row or
a frontend bundle; §5 of `tests/security.test.ts` scans every shipped source file for high-signal
credential shapes (private-key blocks, `sk-…`, `AKIA…`, `ghp_…`, `xox…`, a Postgres URL with a
password) and fails on a match. Server-only secrets stay server-side because the frontend bundle
imports only `@shared/*` contracts, never `src/config` or an adapter (see
[monorepo.md](./monorepo.md)).

**Logging.** Records are structured, never free-form. Redaction is mandatory and recursive: a key
matching `api[_-]?key|secret|password|token|authorization|cookie|credential|private[_-]?key|session…`
is replaced wholesale, and a _value_ matching a credential shape is replaced inside any string, at
any depth. `observability.redactSecrets` is `true` by type and asserted at boot. Suites in domains
that hold financial data additionally assert that no log line carries a balance, an amount, a symbol
or an operator reference.

**Error redaction (fixed in Phase 5.8).** Every failure left through one path with a typed code and
a safe message, but `toAppError` copies an arbitrary thrown value's message — so a driver error's
file path, a provider's payload or a connection string could be echoed to the caller. Now a message
this codebase did not author is **replaced** in the response body (`An internal error occurred.
Quote the correlation id when reporting it.`) while the **log keeps the full text**; the correlation
id in both is what joins them. Deliberately-raised errors keep their own message, because those are
written to be shown. Status codes come from one table (`ERROR_STATUS`), and no stack trace is ever
serialized.

**Correlation ids.** Accepted from the caller only when they match
`^[A-Za-z0-9._:-]{1,128}$` (an injected id with a newline is replaced), echoed in the body and the
`x-correlation-id` header, and attached to every log record for that request.

## 7. Database and file access

**Implemented.** Access goes through repositories over a driver interface with an in-process queue,
so there is one SQLite path and no raw query string built from user input anywhere in the request
path. Migrations are versioned and applied by an explicit command
([database-and-storage.md](./database-and-storage.md)). The PostgreSQL adapter is
**Planned**, not implemented; the abstraction exists so it is additive.

**Path traversal.** The only filename sink is `sanitizeFilename`, which takes the basename (both
separators), strips everything outside `[\w.\- ]`, strips leading dots and caps the length — so
`../../etc/passwd` becomes `passwd` and `..\..\windows\system32\config.sys` becomes `config.sys`.
`tests/security.test.ts` feeds it six traversal shapes including URL-encoded and doubled separators,
and asserts no result contains a separator or begins with a dot. Uploads are additionally
category-restricted by MIME type and size, and `sensitive` files are refused outright
(`allowSensitiveFiles: false`, asserted at boot).

**Not covered:** cloud object storage, signed URLs and backup/restore boundaries — **Planned**, and
the `FileStorage` interface is where they attach.

## 8. Third-party and dependency security

**Implemented.** `npm audit` and `npm audit --omit=dev` both report **0 vulnerabilities**, production
scope throughout. `npm audit fix --force` has never been run in this repository. The history — the
five development-only advisories and the structural cause — is in
[dependency-audit.md](./dependency-audit.md); `tests/dependency-graph.test.ts` is the standing guard
that fails if a second nested `vite`, a `vite-node`, an `overrides` pin or a version below a patched
floor ever comes back.

**Requires review at release:** a signed release pipeline (SLSA-style provenance, signed sidecar and
installer) and a periodic re-audit cadence. `npm run desktop:verify` currently reports the updater
public key as a warning until a real key is configured.

## 9. Privacy principles

**Implemented as design constraints, not as policy prose:**

1. **Declared, not inferred.** The platform does not estimate a user's risk tolerance, capital or
   holdings. An absent field stays absent, and the readiness gate says so rather than filling it.
2. **Minimum necessary.** Capital is a _range_; no account numbers, no broker credentials, no
   payment data — there is no field for any of them.
3. **Purpose-bound.** Usage records exist to meter and to audit, and they carry an operation and a
   cost, not a description of what the user asked.
4. **User-visible provenance.** Every figure states its source and its time; nothing is presented as
   observed when it is assumed, and an assumption is labelled as one at the point of use.
5. **Local-first.** Data is on the user's own machine in a local SQLite file, and the desktop shell
   grants the WebView no filesystem capability at all.
6. **No third-party egress by default.** No hosted model provider is registered; the default adapter
   is offline and scripted. Sending anything anywhere requires a deliberate configuration change.

**Consent boundaries — Implemented:** the platform collects profile and context data only through
explicit, editable forms, and every field is optional. **Planned:** a first-run disclosure of what is
stored locally, and an export.

## 10. Analysis versus advice, and the uncertainty contract

**Implemented as product behaviour, and it is not a legal conclusion.** Master Trade produces
_analysis and evaluation_. It does not provide personalized investment advice, does not execute
anything, and does not guarantee an outcome. Concretely:

- Every capability declares its risk level; `high-impact` capabilities are the ones the readiness
  gate treats most strictly.
- Output separates observed facts, computed metrics, assumptions, uncertainty, limitations and
  educational material, and the structured result carries each as a distinct field rather than as
  prose to be parsed.
- Hypothetical and backtested results are labelled as such, and realized, unrealized, hypothetical
  and simulated performance are four different classifications — never presented as one number.
- No ranking of users, no "successful decision" label from short-term performance, and no fabricated
  metric when data is missing.
- The model explains the engine's numbers; it cannot change them, and it cannot introduce a number
  the engine did not compute.

Insufficient information produces one of four honest outcomes — ask a clarifying question, deliver
limited analysis, deliver a clearly labelled hypothetical, or refuse — rather than an unsupported
precise recommendation.

## 11. Incident assumptions

**Implemented as properties that can be relied on during an incident:**

- **Traceability.** A `correlationId` joins a user-visible failure to its log records to its audit
  record; the response body carries the id precisely so it can be quoted.
- **Auditability.** Credit operations, approvals, subscription changes and job actions append audit
  records; the ledger is append-only, so a disputed balance can be reconstructed rather than
  argued about.
- **Fail-closed.** Unresolvable shell token, missing role, unknown capability, expired session and
  failed schema validation all refuse rather than degrade.
- **Containment.** The API is loopback-only and the desktop shell holds no fs/shell/http capability,
  so an application-level compromise has no ambient filesystem or network authority to escalate
  with.

**Planned:** an incident runbook (rotation, revocation, evidence collection), structured alerting,
and centralized log retention. Today the log sink is local, and a local sink is lost if the machine
is lost — **Requires review** before any hosted deployment.

## 12. What was fixed in this phase

| #   | Finding                                                                                                                               | Severity                            | Fix                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | An unexpected internal failure echoed the raw thrown message — a driver path, a provider payload, a connection string — to the caller | **Medium** (information disclosure) | `toHttpFailure` replaces a non-authored message in the body and keeps it in the log; `INTERNAL_MESSAGE` is the only text                                           |
| 2   | No HTTP-level rate limit: an unauthenticated caller could drive unbounded work                                                        | **Medium** (availability)           | Per-client sliding window before authentication, bounded bucket table, `Retry-After`                                                                               |
| 3   | No security response headers, and no CORS policy at all (the API's origin behaviour was whatever Fastify defaulted to)                | **Low–Medium**                      | Explicit loopback allow-list that refuses a foreign origin, plus the header set in §3                                                                              |
| 4   | No test proved the trading boundary at the source level — only the configuration was asserted                                         | **Low** (assurance gap)             | `tests/security.test.ts` asserts no route names a trading action and no source file enables live trading, broker execution, remote storage or model tool authority |
| 5   | No test proved the file-name sanitiser against traversal shapes                                                                       | **Low** (assurance gap)             | Six traversal shapes, plus owner isolation and sensitive-category refusal                                                                                          |

### 12.1 What the end-of-Phase-6 security gate fixed

Phase 6 closed with an attack simulation — 150 adversarial cases in ten stages — rather than a review.
The method, the gate criteria, the sandbox boundary and every limitation are in
[security-gate.md](./security-gate.md); each finding below is kept permanently, with root cause,
regression case and re-test result, in [security-knowledge-base.md](./security-knowledge-base.md).

| #   | Finding                                                                                                                                                                                            | Severity                           | Fix                                                                                                                                                          | Regression |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| 1   | An update could keep a `verified` trust label after its text was replaced with model-authored content, which `query({ minTrust: 'verified' })` then returned                                       | **High** (trust laundering)        | `upsert` takes the lower of the trust the incoming write earned and the stored trust; raising stays `promote()`'s job                                        | SEC-087    |
| 2   | A declared portfolio price could assert `market-data`/`authoritative` provenance, which the read path returned as the price's own and which suppressed the `price-unverified` readiness limitation | **Medium** (caller-asserted trust) | `portfolioDeclaredPriceSchema` narrows the declaration to `user`/`derived` + `unverified`, and `PortfolioRepository.replace` refuses the claim independently | SEC-093    |
| 3   | An instruction set whose module carried its text outside `content` loaded without the safety scan seeing it                                                                                        | **Medium** (policy bypass)         | `loadInstructions` validates the document shape before the safety scan reads it                                                                              | SEC-016    |
| 4   | A session token interpolated into a log _message_ was written verbatim — `SECRET_VALUE` knew other vendors' formats but not this product's own prefix                                              | **Medium** (log disclosure)        | `SECRET_VALUE` recognises `mt_s_…`; the fixture's synthetic secret is shaped the same way                                                                    | SEC-035    |
| 5   | `SidecarSupervisor.handleExit` threw an illegal transition when called after the restart budget was exhausted                                                                                      | **Medium** (failure path)          | The call returns the current state instead of transitioning; the normal path is unchanged                                                                    | SEC-129    |
| 6   | Concurrent `stop()` calls collided in the state machine (`stopping -> stopping`)                                                                                                                   | **Medium** (shutdown race)         | The in-flight stop promise is shared, so the child is signalled once                                                                                         | SEC-131    |

One case is `NOT_APPLICABLE` — per-principal memory ownership, because a memory record carries no
owner in this build. It is reported in its own column and is **not** counted as a pass. Nothing in
the gate supports the conclusion that the product is secure; see
[security-gate.md](./security-gate.md) §14.

## 13. Verification

`npm run validate` covers formatting, both typechecks, the full suite, both production builds, the
desktop shell report (`0 errors`) and the browser suite. Security-specific coverage lives in
`tests/security.test.ts` (26 tests), the end-of-Phase-6 gate in `tests/security-gate` (150 attacks),
and adjacent claims in `safety`, `realtime-ws`, `llm-registry`, `usage-api`, `portfolio-api`,
`quality-api`, `database`, `desktop-shell`, `desktop-hardening`, `desktop-runtime` and
`dependency-graph`.

## 14. Requires professional review before production

None of the following is a legal conclusion, and each is a real prerequisite rather than a caveat:

1. **Personalized-advice characterization** in each target jurisdiction — where analysis stops being
   education, what triggers adviser registration, and what disclosures are required.
2. **Financial-data handling** — whether the local files fall under a regime (GDPR "processing on
   behalf of", financial-record rules), and what retention and erasure are actually required.
3. **Data-subject rights** — access, correction and erasure against append-only records (§5).
4. **Consent and terms** — privacy notice, terms of service, and the disclosure that no advice or
   execution is offered.
5. **Deployment security** — TLS termination, host hardening, secret injection, backup encryption,
   network exposure.
6. **Marketing claims** — "smarter trading, bigger possibilities" and any performance figure shown
   to a prospective user must be reviewed against local advertising rules.
7. **Model providers** — a data-processing agreement, a retention position and prompt-injection
   evaluation before any hosted provider is registered.

## 15. Known limitations

- **No HTTP rate limit tiering.** One window per client address, not per route or per principal, so a
  legitimately heavy operation and a flood share a budget. Tiering is **Planned**.
- **No CSP on the API's own error pages.** The API returns JSON only; the WebView's CSP is the
  desktop shell's, checked by `desktop:verify`.
- **`Retry-After` is whole seconds**, rounded up, so a client may wait up to a second longer than
  necessary.
- **Rate-limited requests are not audited**, only logged with the `security.ratelimit.refused` event.
  A flood is therefore visible in logs but absent from the audit table — deliberate, because writing
  an audit row per refused request is the amplification the limiter exists to prevent.
- **The client address is the only key.** `trustProxy: false` is correct for a loopback API and wrong
  for a proxied deployment: a reverse proxy in front of this server would make every caller share one
  bucket, and that must be revisited together with TLS (**Requires review**).
