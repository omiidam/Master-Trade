# ADR-0040 — A boot refusal is reported before the logger exists

- **Status:** Accepted
- **Phase:** 4.7
- **Decision id:** `DEC-SERVER-3-REFUSAL`

## Context

The server refuses to start in several situations, all of them safety-relevant: an
unsafe configuration value (`assertSafeConfig`), an unsafe environment variable
(`unsafeEnvFlags`), a hardline execution operation in the catalogue
(`assertNoHardlineOperations`), an incomplete route catalogue (`assertApiCatalogue`), or
an invalid instruction policy (`loadInstructions`). These are the guarantees the project
is built around — `docs/workflow.md` lists them as invariants that must stay green.

All of them run inside `createServer()`, **before** the logger is constructed, because
`createLogging()` is built from the very configuration being validated. That ordering is
correct and was not changed.

But `startServer()` called `createServer()` _outside_ its `try`/`catch`:

```ts
const instance = createServer(deps);        // may refuse — nothing has logged yet
const { app, config, logger } = instance;
try {
  await app.listen(...);
} catch (error) {
  logger.error(...);                        // this path logs, because a logger exists
  throw appError;
}
```

The throw propagated to the module-level guard, whose comment asserted the failure "has
already been logged structurally". That is true for a `listen` failure and false for a
**precondition refusal** — there is no logger yet. Reproduced against the built artifact:

```
$ MASTER_TRADE_API_HOST=0.0.0.0 node dist/src/server/start.js
$ echo $?
1
                                        # ← no output at all, on stdout or stderr
```

The process fails closed, which is correct and is why this is not a security defect. It is
a **diagnosability defect on the refusal path**, and it lands on the worst possible one: an
operator who has just set `MASTER_TRADE_LIVE_TRADING=true`, or pointed the API at a public
interface, is told nothing about what was refused or why. On a VPS deploy
(`npm run api`) that is a silent non-start with no lead to follow. The repository's own
style already answers this — `src/db/cli.ts` writes its refusals to `process.stderr` — but
the server entry point did not.

The gap survived because it is only visible in a **separate process**: every test
exercised `createServer()` in-process with an injected config and asserted the throw, and
`startServer()` had no test at all. A test that can observe the throw cannot observe the
silence.

## Decision

**A refusal that happens before a logger exists is written to `stderr` as one structured,
redacted record, and the process still exits non-zero.**

- `createServer()` moved inside a `try` in `startServer()`; the refusal is reported and
  then re-thrown, so the outer guard's `process.exitCode = 1` is unchanged.
- `reportBootRefusal(error, stream = process.stderr)` is exported and takes an injectable
  write target, so the behaviour is testable without touching the real stderr or spawning a
  process. It emits the same JSON shape the logger emits
  (`{level, time, event, code, message, details}`), event `server.refused`.
- The record is passed through the existing `redactString`/`redactValue` helpers from
  `packages/shared/src/core/logging.ts`. A refusal is exactly where a misconfigured
  credential-shaped value would appear, so redaction is mandatory, not deferred.
- The `listen` path is untouched: it already has a logger, so it is not double-reported.

Writing directly to `stderr` rather than through the logger is deliberate and is the only
honest option here — the refusal is the reason no logger exists.

## Consequences

- An unsafe setting now explains itself, and the explanation is machine-readable and
  testable:

  ```
  {"level":"error","time":…,"event":"server.refused","code":"POLICY_VIOLATION",
   "message":"Refusing to bind 0.0.0.0: the API is loopback-only by design …",
   "details":{"host":"0.0.0.0"}}
  ```

- Two tests were added to `tests/server.test.ts`: one drives `startServer()` with an unsafe
  config and asserts the record's `event`, `code`, message and `details.violations`; the
  other proves a credential-shaped value is redacted out of a refusal record. The suite
  went from 25 to 27 tests.
- The healthy path is unchanged and was re-verified after the change: `npm run build`, then
  boot → `200` on `/v1/health` and the usual `api listening` line.
- The refusal record is not part of the HTTP surface and never will be: it is a start-up
  diagnostic for the operator, and the API cannot be serving if it is being written.

## Alternatives considered

- **Construct the logger before the preconditions and log through it.** Rejected: the
  logger is configured _from_ `AppConfig`, so it would have to be built from unvalidated
  input — including the redaction setting the preconditions are checking. The ordering is
  the guarantee, not an accident.
- **Let the outer `.catch()` print `error.message`.** Rejected: it would print an
  unstructured line, bypassing redaction, and it conflates the refusal path with the
  already-logged `listen` path, producing a duplicate line for a bind failure.
- **Have `createServer()` write its own refusal and exit.** Rejected: it would make a
  library function terminate the process, so the tests that assert the throw in-process
  would lose the ability to observe it, and `createServer` is deliberately side-effect-free
  outside the socket it owns.
- **Leave it, and document "check the exit code".** Rejected: an exit code says that
  something failed, never what. The project treats documentation drift as a defect; a
  silent refusal on the safety path is the same class of problem.
