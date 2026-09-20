# ADR-0039 — One clock per authorization decision

- **Status:** Accepted
- **Phase:** 4.6
- **Decision id:** `DEC-AUTH-2-CLOCK`

## Context

Phase 4.6 opened with five failing tests in `tests/realtime-ws.test.ts`. The audit traced
all five to **one missing argument**, and the shape of the bug is worth recording because
nothing about it was obvious from the failure.

The two halves of a single authorization decision read two different clocks:

| Layer                       | Clock                                                        |
| --------------------------- | ------------------------------------------------------------ |
| `SessionService` (resolve)  | injected — `options.now ?? Date.now`, passed at every call   |
| `requireOperation` (decide) | **defaulted** — `now: number = Date.now()`, silently ignored |

So a session resolved from the server's clock could be re-checked against the wall clock
one layer later and refused as `Session expired.` The realtime tests build a server with a
fixed clock (`2026-09-20T09:00:00Z`) and a 480-minute session TTL, which puts expiry at
`17:00Z`. Observed directly:

```
$ node -e '...createServer({now: () => FIXED_NOW}); ...requireOperation(principal, "realtime.connect")'
["owner"] -> {"allowed":false,"reason":"Session expired."}
```

The three consequences, in order of how much they cost:

1. **A wall-clock-dependent suite.** The same commit passed in the morning and failed
   after `17:00 UTC`. That is the worst possible shape of failure: it looks like flakiness,
   so it gets re-run until it is green and then ignored — which is exactly how a genuine
   regression would hide behind it. (It was, in fact, believed to be an environment
   limitation for several phases before this audit measured it.)
2. **A latent production defect, not merely a test defect.** Any clock that is not the
   wall clock — a simulated session, a time-travel/debug mode, a host with clock skew —
   produces a principal that one layer accepts and the next rejects. The two layers
   disagree about the same object.
3. **The same mistake existed in the test suite.** `tests/architecture.test.ts` built its
   sessions from `Date.now()` and leaned on the defaulted clock, so its "rejects expired
   sessions" assertion changed meaning depending on the hour it ran.

## Decision

**Every authorization decision receives an explicit instant. There is no defaulted clock
anywhere in the authorization path.**

- `isSessionActive(session, now)`, `authorize(principal, operation, now)` and
  `requireOperation(principal, operation, now)` take `now` as a **required** parameter.
- `guardRoute(route, principal, now)` — the HTTP pre-flight gate — is required too, for the
  same reason: the request was already resolved against a clock, and the gate must not
  invent a second one.
- Each caller passes the clock it already owns: the realtime hub passes its connection
  clock, the job queue passes the clock it stamps jobs with, the HTTP layer passes the
  request's clock, and `JobService` gained an optional `now` (defaulting to the wall clock,
  as the queue does) so it can be given the queue's clock rather than assuming its own.
- Tests state the instant they judge (`const NOW = …`) instead of inheriting the wall clock.

Making the parameter required rather than defaulted is the substantive part of the
decision: it converts a silent, time-of-day-dependent behaviour into a **compile error**.
It did exactly that on first compilation, naming all five lazy call sites — including the
one inside the test suite that no amount of reading had surfaced.

This is the same principle the repository already applies elsewhere (`packages/trading-engine`
exists so determinism is refused by the toolchain rather than by convention): prefer a
boundary the compiler enforces over a rule contributors must remember.

## Consequences

- A clock is now a visible part of every authorization signature. Callers are one argument
  longer, which is the intended cost: the clock used to be an invisible assumption.
- Time-dependent behaviour is testable without touching the system clock, and the realtime
  suite is now provably wall-clock independent. The regression test builds a server whose
  clock is **years in the past** — a session long expired by the wall clock must still be
  accepted — so the assertion cannot decay as the calendar moves.
- Verification: temporarily reverting the single argument in `src/realtime/hub.ts`
  reproduces all six original failure signatures (including `expected undefined to be
'u_owner'`); restoring it makes every one pass. The fix is proven to be the cause, not
  correlated with it.

## Alternatives considered

- **Default `now` to the injected clock via a module-level provider.** Rejected: it hides
  the dependency and makes the clock global mutable state, so two tests in one process
  cannot judge different instants.
- **Remove the expiry check from `authorize` and trust the caller's `SessionService`.**
  Rejected: the re-check is defence in depth. `authorize` must remain safe standing alone,
  since the API layer can be handed a principal from anywhere.
- **Widen the test's TTL so the fixed clock never expires.** Rejected outright: it hides
  the defect behind a larger constant and leaves every other clock (simulation, skew,
  time travel) broken. It would also have made the suite fail again on a later date.
