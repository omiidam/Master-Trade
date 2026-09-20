# ADR-0030 — Sidecar launch from a fixed plan: fixed loopback port, per-launch token, proven readiness, bounded restarts

- **Status:** Accepted (Phase 3.6, decision id `DEC-DESKTOP-4-LIFECYCLE`)
- **Date:** 2026-09-20
- **Supersedes:** none

## Context

The shell owns the API's lifetime. Four decisions had to be made, each of which is
easy to get quietly wrong: how the child is launched, which port it binds, how the
shell knows it is up, and what happens when it dies.

## Decision

**1. The launch is a plan, not a command string.** `planSidecarLaunch()` returns a
typed structure — executable, fixed `args`, fixed `env`, fixed `cwd`. There is no
field a caller can inject an argument into, and the WebView cannot influence any
of it (see [ADR-0029](./ADR-0029-webview-capability-boundary.md)). The host is
pinned to `127.0.0.1` in TypeScript and re-asserted by the backend's
`assertSafeConfig()`.

**2. The port is fixed at 4317, not dynamic.** The CSP names the exact origin the
WebView may reach; `http://127.0.0.1:*` would let a page talk to any local
service, so a wildcard port and a strict CSP cannot both be true. A busy port is
therefore an actionable start-up failure, not a silent relocation. `verify.ts`
asserts the port agrees across Rust, TypeScript and the backend default.

**3. A 256-bit token per launch, delivered through the environment.** Generated
with `randomBytes(32)`, handed to the child in `MASTER_TRADE_SHELL_TOKEN`, and
surfaced to the frontend only through `shell_handshake`. It is never written to a
file, never logged, and never placed in the config. A token shorter than 32
characters is refused at planning time (`POLICY_VIOLATION`).

**4. Readiness is proven, not assumed.** The supervisor polls
`GET /v1/health` with that same token until it answers, on a deadline (20s
default), and the window is shown only after that. The health check uses the real
authenticated route, so "ready" means the actual path the frontend will use works.
A failure names the step, and `lifecycle.ts` carries the reason so it is
reportable.

**5. Restarts are bounded, and the bound is real.** An unexpected exit restarts
with exponential backoff up to `maxRestarts` (default 3) and then fails. The
counter is deliberately **not** cleared by a restart — a restart resets it only for
a fresh, explicit start. Clearing it on restart is the bug that turns a bounded
budget into an infinite respawn loop while looking like recovery.

## Alternatives rejected

| Alternative                                             | Why rejected                                                                                                                                          |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dynamic port (bind `0`, report it back)                 | Incompatible with an exact-origin CSP; would require a wildcard local origin, which is a larger hole than a fixed-port clash.                         |
| Embedding the API in the Rust process (no child)        | Would mean reimplementing the backend or embedding a JS runtime; a child process keeps the API identical to the server build and testable standalone. |
| Passing the token on the command line                   | Visible in the process list to every user on the machine; the environment is the right channel.                                                       |
| Writing the port/token to a file the frontend reads     | A file is a credential on disk and a second source of truth; the handshake command already exists.                                                    |
| Trusting "the process started" as "the API is up"       | A child that crashes on config validation still starts as a process; the health gate is what makes the window wait for something true.                |
| Waiting a fixed delay instead of polling health         | Either too slow or flaky on a cold start; polling is both faster and honest.                                                                          |
| Retrying forever / relying on the OS to restart the app | An infinite respawn loop consumes the machine and masks a real crash; a bounded budget with a reported reason is what a user can act on.              |
| `taskkill`/`kill -9` at shutdown                        | Would leave the SQLite database without a clean close; the supervisor stops the child and waits for it.                                               |

## Consequences

**Positive:** the launch surface is inspectable and testable; a wrong port or a
missing binary fails loudly at planning time; readiness means the authenticated
route answered; a crash loop terminates with a described cause. All five
properties are covered by `tests/desktop-shell.test.ts`.

**Negative:** the fixed port means a second copy of the app or a stale child
conflicts — intentional, since the shell is single-instance anyway. The 20s
readiness deadline is a judgement call: slow machines may need it raised, and the
value is a configuration constant rather than scattered.

**Security impact:** positive — the token never touches disk or a log, and the
child can only be reached from a page the CSP already limits to that origin.

## References

- [desktop-and-frontend.md § 3](../desktop-and-frontend.md), [desktop-shell.md](../desktop-shell.md)
- `src/desktop/sidecar.ts`, `src/desktop/lifecycle.ts`, `src-tauri/src/lib.rs`
