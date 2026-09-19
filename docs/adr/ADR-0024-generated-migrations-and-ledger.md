# ADR-0024 — Generated migrations, a checksummed ledger, and refusal over guessing

- **Status:** Accepted (Phase 3.4, decision id `DEC-DB-3-MIGRATIONS`)
- **Date:** 2026-09-19
- **Supersedes:** none
- **Related:** [ADR-0003](./ADR-0003-sqlite-first.md), [ADR-0016](./ADR-0016-persistence-driver-and-orm.md), [ADR-0025](./ADR-0025-sqlite-driver-and-dialects.md)

## Context

Phase 1/2 declared `Migration { up[], down[] }` and `validateMigrations()`, with
`INITIAL_MIGRATION` containing placeholder strings (`CREATE TABLE users (...)`) —
declarations that would never have run. Phase 3.1 locked "forward-only, numbered,
recorded in `schema_migrations`" and left the execution model open.

The decision that matters for this product: a learner accumulates six months of
progress, answers, memory and audit history in one file. A migration system that
guesses when the database and the code disagree risks corrupting the one artefact
the user cannot get back.

## Decision

**1. Migrations are generated from the schema declarations.** A migration is
`up(dialect) => statements`; the initial migration calls `createSchemaSql()`, which
walks `SCHEMA` in dependency order. A table therefore cannot be declared without
appearing in the migration, and the migration cannot drift from the declaration.
The same migration produces SQLite and PostgreSQL statements, so the two engines
cannot diverge silently.

**2. The ledger is the source of truth, and it is checksummed.**
`schema_migrations(version, id, checksum, applied_at, execution_ms)` is created by
the runner (it must exist in an empty database). The checksum covers the statements
applied _for this dialect_, so editing an applied migration is detected rather than
trusted.

**3. Three conditions refuse instead of guessing:**

| Condition                                     | Result                                                       |
| --------------------------------------------- | ------------------------------------------------------------ |
| An applied migration no longer exists in code | `CONFLICT` — this build is older than the database           |
| An applied migration's statements changed     | `CONFLICT` — the recorded history no longer matches the code |
| The database is ahead of the code             | `CONFLICT` — refuse to run an older build                    |

**4. Forward-only.** Each migration runs inside a transaction (both engines have
transactional DDL) and `down()` exists for local development only; the runner never
executes it. Destructive changes keep the documented two-step flow: create the
replacement, migrate, then drop in a later version.

**5. `status` before `migrate`.** `migrationPlan()` computes the same comparison
without writing, and the CLI exposes it, so an operator can see what would happen.

## Alternatives rejected

| Alternative                                         | Why rejected                                                                                                                                 |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Timestamped migration files, hand-written SQL       | Ordering collapses when two branches share a millisecond; the link to the schema declarations is lost and can drift.                         |
| `CREATE TABLE IF NOT EXISTS` everywhere             | Hides the divergence this system needs to surface: a "successful" run that silently skipped a needed change is worse than a failure at boot. |
| ORM-generated migration folders (Drizzle/Prisma)    | The migration becomes library output rather than reviewable SQL, and two engines means two generated histories to keep in agreement.         |
| Auto-repair (drop and rebuild an unexpected schema) | The database holds the user's only copy of their learning record; rebuilding it is not a repair.                                             |
| Storing the schema version only (no checksums)      | Cannot tell "migration never applied" from "migration applied and then edited" — the exact case that corrupts data in production.            |
| Running migrations lazily on first query            | A partially migrated database would serve requests; boot-time migration keeps the failure at start-up where it is visible and recoverable.   |
| `down` migrations run automatically on downgrade    | Data-losing by construction; a downgrade must be a deliberate operator action with a backup.                                                 |

## Consequences

**Positive:** the schema cannot drift from the migration; both engines are created
from one description; editing an applied migration is a build failure rather than a
review miss; `status` is safe to run against a production file.

**Negative:** adding a table requires editing declarations (a code change) rather
than writing SQL, which is a deliberate trade against generated migration files;
the initial migration remains one large transaction (fine at 22 tables, watched as
the schema grows).

**Security impact:** neutral-positive. The ledger carries no personal data, and
refusing on drift prevents a partially applied schema from serving requests with
weaker constraints than the code assumes.

## References

- [database-and-storage.md § 4](../database-and-storage.md)
- `src/db/migrations/**`, `src/db/runner.ts`, `src/db/ddl.ts`, `src/db/cli.ts`, `tests/database.test.ts`
