# ADR-0048 — the transport boundary refuses before authentication, and an unvouched message never leaves

- **Status:** Accepted
- **Decision id:** `DEC-TRANSPORT-1-REFUSE-FIRST`
- **Phase:** 5.8 (Security, Privacy, Compliance & Brand Identity Foundation)
- **Supersedes:** nothing. **Depends on:** ADR-0020 (no live trading), ADR-0022 (tokens travel in
  headers), ADR-0002 (one modular monolith, one local API).

## Context

By the end of Phase 5.7 the API had a well-tested _authorization_ boundary — per-route operations, a
role table, deny-by-default capabilities — and almost nothing in front of it. Three gaps are worth
recording precisely, because in each case the interesting part is _where_ the fix belongs.

**Nothing refused a flood.** `SlidingWindowRateLimiter` existed and was used in front of external
providers and on the WebSocket. The HTTP surface had no limit at all, so an unauthenticated caller on
the loopback port could drive unbounded work: a session lookup, a schema parse and a route decision
per request, none of them free.

**Origins were neither allowed nor refused.** There was no CORS policy, so the API's cross-origin
behaviour was whatever the framework defaulted to. That is not a decision, and it is worse than
either explicit choice: it cannot be reviewed, and it cannot be tested.

**A message we did not write was sent to the caller.** Every failure left through one path with a
typed code and a safe message — but `toAppError` copies an arbitrary thrown value's text, so a
`SQLITE_ERROR` carrying an absolute path, a provider's raw payload or a connection string was
serialized straight into the response body. The error _path_ was audited; the error _text_ was not.

A fourth, quieter gap: the trading boundary was asserted against the _configuration_ and never
against the _source_. "`liveTradingEnabled` is false" is a fact about one object. "No file in the
repository turns it on, and no route names an order" is a fact about the codebase, and only the
second one survives a careless edit.

## Decision

**1. Three boundaries in `src/server/security.ts`, mounted before every route.** Headers, origin
policy and rate limiting are installed as global hooks at server construction, which is what makes
them apply to failures as well as successes. A security header that is missing exactly when
something went wrong is not a security header.

**2. Headers are a fixed set, not a per-route choice.** `nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: no-referrer`, `Cross-Origin-Resource-Policy: same-origin`,
`Cross-Origin-Opener-Policy: same-origin`, a restrictive `Permissions-Policy`, and
`Cache-Control: no-store`. `no-store` rather than `no-cache`, because portfolio declarations,
decisions and session material are not to be written to a WebView cache _at all_. A route that has
already set one of these keeps its own value: the health endpoint's cache policy and a preflight's
CORS headers are deliberate, and a blanket overwrite would silently break them.

**3. A foreign origin is refused, not merely denied headers.** Withholding
`Access-Control-Allow-Origin` stops a browser _reading_ the answer; the request has already been
sent, and a state-changing request would already have happened. So a request that states an origin
outside the loopback allow-list fails with `FORBIDDEN` before the handler. The allow-list is
loopback-only, and `assertSafeConfig` refuses to boot with a non-loopback entry in it — the policy
cannot be widened by configuration. An allowed origin is echoed **exactly**, never `*`, because a
wildcard with credentials is refused by browsers and a wildcard without them is a different and
worse policy than the one declared. A request with no `Origin` is passed through: the shell, the CLI
and the suite are not browsers, and the shell token and session token are what authorize them.

**4. The rate limit is keyed on the peer address and counted before authentication.** `trustProxy` is
false, so the peer address is the socket rather than a header the caller chooses. Counting before
authentication is the point: the cheap check runs before the expensive one, so an unauthenticated
flood is refused as a flood instead of costing a session lookup per request. The bucket table is
bounded with oldest-first eviction, because an unbounded map keyed by client is itself a denial of
service. A zero limit is a configuration violation, and exhaustion answers `429` with `Retry-After`.

**5. A message this codebase did not author never reaches the caller.** In `toHttpFailure`, an error
that is neither an `AppError` nor a mapped transport error produces the response body
`An internal error occurred. Quote the correlation id when reporting it.` while the log keeps the
full text. The correlation id present in both is what joins them, so the detail is _relocated_, not
lost. Deliberately-raised errors keep their own message, because those are written to be shown.

**6. The trading boundary is asserted against the source tree, not only the configuration.**
`tests/security.test.ts` fails if any shipped file enables live trading, broker execution, remote
storage, sensitive files or model tool authority, and fails if any route id or path names an order,
trade, execution, broker, position or fill. And it scans every shipped source file for high-signal
credential shapes.

**7. No TLS here, and that is a decision rather than an omission.** The API binds loopback and its
clients are local processes. Terminating TLS in this process would add a certificate lifecycle
without an attacker to stop. It becomes necessary with a reverse proxy — and that deployment also
changes the rate limiter's key, so the two must be revisited together.

**8. No new dependency.** Each boundary is small enough to read in one sitting, and this is the code
that decides whether a request reaches authentication at all. An image toolchain and a security
header package are the same trade: convenience for a dependency in the path of every request.

## Consequences

- An unauthenticated caller cannot make the process do work proportional to their request rate, and
  they cannot make it do _any_ session work once the window is exhausted.
- A browser page on a foreign origin cannot read this API's answers, and cannot cause a
  state-changing request to be handled either.
- An internal failure no longer discloses a path, a payload or a connection string. Diagnosis is by
  correlation id, which requires the log to be reachable — and the log is local, which is a
  limitation on record rather than a property to fix here.
- The header set is asserted on both a 200 and a failure, so the invariant cannot regress by a route
  being added without it.
- **The rate limiter is now a shared dependency of every route's latency profile.** It is a
  sliding-window array per client, cheap, but it is on the hot path — and if it is ever misconfigured
  to a low limit, it refuses legitimate work. That is why a test drives the refusal path with an
  injected limiter rather than 600 real requests, and why the limit is a config value rather than a
  constant.
- `Retry-After` is whole seconds rounded up, so a client may wait up to a second longer than
  necessary. Accepted: the alternative is a client-side retry loop with sub-second precision and no
  coordination.
- Refused requests are logged but not audited. Writing an audit row per refused request is exactly
  the amplification the limiter exists to prevent. The trade is recorded in
  [security-and-privacy.md](../security-and-privacy.md) §15.
- A reverse proxy in front of this API would collapse every caller into one rate-limit bucket, and
  would need TLS and an explicit trusted-proxy position. Both are **Requires review** before any
  hosted deployment.
