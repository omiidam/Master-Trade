# ADR-0016 — Persistence: better-sqlite3 + Drizzle, SQLite local / PostgreSQL production

- **Status:** Accepted (Phase 3.1, architecture lock `DEC-DB-1-LOCAL`, `DEC-DB-2-PRODUCTION`, `DEC-DB-3-MIGRATIONS`)
- **Date:** 2026-09-19
- **Supersedes:** none
- **Refines:** [ADR-0003](./ADR-0003-sqlite-first.md) (engine choice stayed; this ADR names the driver, query layer and dual-mode strategy)

## Context

ADR-0003 chose SQLite as the initial engine and defined the entity set
(`src/db/schema.ts`: 22 tables, persistent/transient split, `validateMigrations()`
strategy). Phase 3.1 must name the actual driver and query layer, decide where
the file lives, and settle whether "production mode" means something concrete or
just an aspiration.

A desktop packaging constraint dominates: the database file must survive
application updates, and the runtime must be bundleable as a Tauri sidecar
without dragging a second server process or a multi-hundred-MB engine binary
into the installer. The audit trail, approvals and rule activation depend on
real transactions and constraints, so a "just JSON files" approach is excluded by
the Phase 1 safety requirements.

## Decision

**SQLite through `better-sqlite3`, with Drizzle as the typed query layer and
drizzle-kit for migrations. PostgreSQL 16 is the designated production mode, on
the same Drizzle schema and the same repositories.**

Local mode (primary):

- `journal_mode = WAL`; `foreign_keys = ON`; `busy_timeout` set; short
  transactions; single-writer discipline through repositories.
- Database file under the OS app-data directory, never inside the app bundle, so
  updates cannot destroy a six-month learning record.
- No secrets (keychain only) and no raw file bytes (content-addressed storage).

Production mode (deferred, prepared):

- Same schema, same repository interfaces, PostgreSQL dialect; used only if a
  hosted multi-user (coach/classroom) deployment ever happens.
- Services therefore must not rely on SQLite-only semantics: ISO timestamps,
  `text` ids, portable aggregates.
- By policy, even hosted mode stores training data only — no broker or trading
  data exists in the system at all.

Query layer and migrations:

- Drizzle gives typed queries and typed schema in TypeScript while keeping the
  generated SQL visible; migrations are plain SQL files produced by drizzle-kit,
  numbered, forward-only, applied inside a transaction, recorded in
  `schema_migrations`, and validated by the existing `validateMigrations()`.
- Destructive changes follow the documented two-step migration. `down` exists
  for local rollback only.

## Alternatives rejected

| Alternative                          | Why rejected                                                                                                                                                                     |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prisma ORM                           | Ships a separate query-engine binary and its own migration engine — a large, awkward artifact to package inside a desktop installer, and a second process model to reason about. |
| TypeORM                              | Decorator- and magic-heavy, weaker SQLite story, and its migrations are harder to review as plain SQL.                                                                           |
| Kysely                               | Pleasant typed query builder, but migrations are less batteries-included, so we would hand-roll the very layer we are trying to standardize.                                     |
| Raw SQL + hand-written migrations    | Maximum transparency, but loses typed query results across 22 tables and invites drift between schema and code.                                                                  |
| `node:sqlite` (built-in)             | Promising, but not stable enough across the supported Node LTS range to be the storage foundation of a months-long record.                                                       |
| Storing the DB inside the app bundle | Every update risks wiping the learner's history; rejected explicitly.                                                                                                            |
| Document store (Mongo/embedded)      | The domain is strongly relational (users → lessons → exams → memory → approvals → audit); joins and constraints are load-bearing.                                                |
| JSON files                           | No transactions, no integrity, poor concurrent-job behaviour; audit and approval integrity would be unenforceable.                                                               |
| PostgreSQL now                       | Operational weight with zero benefit for a single-user offline desktop app.                                                                                                      |

## Consequences

**Positive:** real transactions behind approvals and audit; one file to back up;
one schema serving both engines; SQL is reviewable; typed repository layer keeps
services portable.

**Negative:** `better-sqlite3` is a native module, so packaging must pin the Node
ABI used by the sidecar and rebuild per target (tracked as a Phase 3.2 packaging
task). SQLite's single-writer model caps parallel write throughput — acceptable
at this scale and bounded by `jobs.concurrency` (default 2) plus WAL readers.

**Security impact:** positive — secrets and file bytes are excluded from the
database by policy, the file lives in a user-scoped directory, and the two-step
destructive-migration rule protects the audit trail.

## References

- [technology-decisions.md § 3](../technology-decisions.md)
- [database-and-storage.md](../database-and-storage.md)
- [ADR-0003](./ADR-0003-sqlite-first.md), [ADR-0002](./ADR-0002-modular-monolith.md)
