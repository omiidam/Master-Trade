# ADR-0022 — The local API trust boundary: loopback, per-launch shell token, hashed sessions

- **Status:** Accepted (Phase 3.3, decision id `DEC-DESKTOP-2-SECURITY`, first implemented here)
- **Date:** 2026-09-19
- **Supersedes:** none (narrows [ADR-0007](./ADR-0007-deny-by-default-auth.md) to the transport)

## Context

The backend listens on a TCP socket inside a desktop machine. On a local machine
"local" is not an identity: any other process — a browser page with a fetch to
`127.0.0.1`, a stray script, a malicious dependency in another app — can reach a
loopback port. Deny-by-default authorization protects _operations_; it does not by
itself answer "who may talk to this socket at all", and the session tokens issued
after login must not be replayable from a log or a database dump.

Phase 3.1 recorded the intent (`DEC-DESKTOP-2-SECURITY`): loopback-only,
per-launch bearer token, keychain secrets, capability allow-list. Phase 3.3 is
where it had to become behaviour.

## Decision

Four layers, each failing closed, in this order:

1. **Loopback is a guarantee, not a setting.** `assertSafeConfig()` refuses any
   `api.host` outside `127.0.0.1`/`::1`/`localhost`, the loader re-checks
   `MASTER_TRADE_API_HOST` before it is applied, and the pipeline refuses any
   request whose socket address is not loopback (`451 POLICY_VIOLATION`). There is
   no configuration path that binds a public interface.
2. **A per-launch shell token.** When `api.shellToken` is configured (the Tauri
   shell sets it at launch, from the environment or the OS keychain), every
   request must carry it in `x-master-trade-shell-token`; comparison is
   constant-time. If the ref is configured but unresolvable the request is
   refused (`INTERNAL`) rather than downgraded. When no token is configured the
   server **logs a boot warning** instead of pretending the boundary is there.
3. **Sessions are hashes.** `SessionService` stores SHA-256 hashes only, returns
   the raw token exactly once, checks expiry on every redeem, and revokes on
   demand. Diagnostics (`list()`) expose hashes and metadata, never tokens.
4. **Presented-but-invalid credentials are always an error.** A bearer token that
   does not resolve is a `401`, even on a public route; anonymous access is only
   for requests that presented nothing.

## Alternatives rejected

| Alternative                                                 | Why rejected                                                                                                                                       |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unix domain socket / named pipe instead of TCP              | Stronger isolation, but Windows support, Tauri sidecar packaging and cross-platform tooling cost outweigh it now; loopback + token is portable.    |
| Token in a query parameter                                  | Ends up in URLs, logs and browser history; headers are the only reasonable place for a credential.                                                 |
| Storing raw session tokens in memory                        | A memory dump or an accidental serialization of the session store becomes a replayable credential.                                                 |
| Cookie-based sessions with `SameSite`                       | Solves a browser threat model we do not have; a desktop sidecar is not a browser and cookies invite CSRF reasoning we would then have to maintain. |
| mTLS between shell and backend                              | Certificate lifecycle (issue, rotate, store) for two processes on one machine — significant cost for a marginal gain over a per-launch token.      |
| Relying on "localhost is safe" / no token at all            | Every other local process, including a browser page, could then call the API; this is the assumption that turns a local service into a pivot.      |
| OS-level access control only (file permissions on a socket) | Not portable and not checkable in tests; the policy would live outside the codebase, invisible during review.                                      |

## Consequences

**Positive:** the socket is not a usable surface without a per-launch secret; a
stolen session dump is not directly replayable; the checks are testable
(`tests/server.test.ts` asserts loopback refusal, missing/wrong token, token
hashing and expiry); the desktop shell handshake is already specified.

**Negative:** a second local tool (for example a CLI debugger) must obtain the
shell token, so local debugging needs one extra step; the token must be re-issued
each launch, and a long-running user session therefore depends on the shell
staying alive.

**Security impact:** strongly positive. It also deliberately keeps the door closed
for future hosting: enabling remote access requires a new ADR, not an env var.

## References

- [backend-foundation.md § 6, § 9](../backend-foundation.md)
- [desktop-and-frontend.md](../desktop-and-frontend.md), [api-auth.md](../api-auth.md)
- `src/server/access.ts`, `src/auth/sessions.ts`, `src/config/loader.ts`
