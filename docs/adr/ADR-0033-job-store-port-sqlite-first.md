# ADR-0033 — A `JobStore` port, SQLite first, Redis only ever as an adapter

- **Status:** Accepted
- **Phase:** 3.7
- **Decision id:** `DEC-JOBS-2-STORE`
- **Refines:** ADR-0018 (durable database-backed queue)

## Context

ADR-0018 chose a durable database-backed queue with in-process workers. Implementing
it raised the question every queue eventually faces: does the queue _own_ its
storage?

The environment settles part of it. Master Trade is a local-first desktop
application: requiring Redis to run the product would mean shipping a server to every
user so that a laptop can grade an exam in the background. But a queue that only
works in one process cannot grow into anything else either.

Behind that sits a sharper problem: a job queue makes promises — idempotency,
cancellation, retry, "jobs survive a restart" — and each promise is a property of
_storage_, not of the engine. Putting those promises in process memory and hoping is
how a queue loses work.

## Decision

The engine talks to a **`JobStore` port** (`src/jobs/store.ts`) and never to a
database or a `Map`. Two implementations ship:

- `InMemoryJobStore` — the default when no database is open. It reports
  `durable: false`, so readiness says what it is instead of implying durability it
  does not have.
- `SqliteJobStore` — the durable local implementation over the existing `jobs` table
  and `job_scratch`, reusing `PlatformRepository`'s atomic conditional-claim, leases
  and UNIQUE idempotency key rather than re-implementing that SQL.

The port is deliberately small: everything the engine needs to make a guarantee, and
nothing that forces an implementation detail (SQL, a connection, a scheduler) on the
in-memory case. **Redis/BullMQ would be a third implementation of the same port**,
not a new dependency of the product.

Two supporting rules:

- **Progress lives in scratch, not in the job row.** Progress is intermediate state;
  `job_scratch` is TTL'd and purgeable. Dropping it loses the bar and nothing else,
  which is why "no progress reported" is a state the UI can render truthfully.
- **Cancellation is the row's status**, so it crosses processes and survives a
  restart. A worker in another process sees it at its next checkpoint.

## Alternatives rejected

- **Redis/BullMQ as the initial queue.** Requires a server on every desktop, and the
  failure mode is a product that will not start. Rejected for local-first.
- **An in-process queue with no durability.** Fails the "survives a restart"
  requirement outright, and makes idempotency impossible to guarantee across
  processes.
- **A queue in its own table with its own SQL.** The atomic claim, lease and unique
  key already existed and were written with this consumer in mind; a second
  implementation is a second place for the same bug.
- **A progress column on the job row.** Progress would then be persistent state that
  looks authoritative after a crash — a bar frozen at 40% for a job that never ran.
- **A generic "task" abstraction over anything callable.** The catalogue names one
  operation per kind, asserts that approval-gated kinds are gated, and refuses a kind
  whose name looks like trade execution. A generic invitation to run arbitrary work is
  exactly the capability this system must not have.

## Consequences

Adding a queue backend is an adapter, and the guarantee tests
(`tests/jobs-persistence.test.ts`, over a real on-disk database reopened between
phases) run against whichever store is wired. "Jobs survive a restart" is verified by
reopening a file, not by reading a comment.

The cost is one more indirection between the engine and SQL. It buys the ability to
state each guarantee as a store obligation, and to test the in-memory path without a
database at all.
