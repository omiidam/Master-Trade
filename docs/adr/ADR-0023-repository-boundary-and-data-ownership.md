# ADR-0023 — Repository boundary and declared data ownership

- **Status:** Accepted (Phase 3.4, decision id `DEC-DB-4-REPOSITORIES`)
- **Date:** 2026-09-19
- **Supersedes:** none
- **Related:** [ADR-0002](./ADR-0002-modular-monolith.md), [ADR-0007](./ADR-0007-deny-by-default-auth.md), [ADR-0024](./ADR-0024-generated-migrations-and-ledger.md)

## Context

Phase 2 declared 22 entities and promised that "all access goes through
repositories", but nothing enforced it: a service could have imported a driver,
opened the database and written SQL directly, and the promise would have survived
review simply because it was written down in a document.

Two concrete risks followed from that gap:

1. **Coupling.** SQL in a service makes the storage engine a domain concern, and a
   future PostgreSQL deployment becomes a rewrite rather than a configuration
   change.
2. **Unowned data.** With no rule about _who_ may write a table, "the audit trail
   is append-only" and "a rule cannot be activated without an approval" are
   intentions that any new code path can quietly violate.

## Decision

**1. One port, one boundary.** `SqlExecutor` (`src/db/executor.ts`) is the only
persistence interface. It is promise-based, takes SQL with `?` placeholders and
returns plain rows. Drivers live behind it (`openSqlite`, `openPostgres`), and
nothing outside `src/db/**` may import a driver or write a SQL statement — a test
fails the build if either appears (ADR-0025 covers the dialect half).

**2. Table toolkit plus explicit SQL.** Repositories use `Table<T>` for CRUD and
`db.queryAll()` with `decodeRows()` for the queries that genuinely need SQL
(joins, an atomic claim). An ORM was rejected: the schema is already the single
source of truth, and the interesting queries would still be hand-written — just
harder to see.

**3. Data ownership is declared, not implied.** `src/db/ownership.ts` assigns every
table exactly one `Owner` (bounded context), a `mutability` (`append-only`,
`mutable`, `versioned`, `tombstone`), a `Retention` and a `BackupClass`.
`validateOwnership()` fails the build if a table has no rule, two rules, is
transient but backed up, is persistent but not backed up, is append-only yet
carries `updated_at`, or is the audit trail with mutable rows.

**4. One repository per owner, with coverage asserted.** Each repository module
declares `OWNER` and `OWNED_TABLES`; `repositoryCoverage()` proves the union equals
the schema, no table is claimed twice, and every claim matches its ownership rule.

**5. Integrity lives in the database.** The constraints that encode governance are
CHECK constraints, not only code: an approved approval must name a decider, a
decider cannot be the requester, a verified memory record must name a verifier, an
active rule must cite an approval, a stored bar may not be `live`. The repository
raises the same rule first, so the failure is a typed error with a readable
reason.

## Alternatives rejected

| Alternative                                                   | Why rejected                                                                                                                                                                                                                                    |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ORM (Drizzle/Prisma/TypeORM) as the access layer              | A second schema definition that can drift from the declarations; migrations become library output instead of reviewable SQL; still needs raw SQL for the interesting queries. Drizzle remains a possible _adapter_ later, behind the same port. |
| Raw SQL in services                                           | Makes the engine a domain concern and rules out the PostgreSQL path without a rewrite.                                                                                                                                                          |
| Active Record models (`user.save()`)                          | Data access spread across the domain; ownership becomes implicit again, and a model gains the power to write tables it has no business touching.                                                                                                |
| Generic `runQuery(sql)` service available everywhere          | The port already exists for that; exposing it to business logic is exactly the coupling this ADR forbids.                                                                                                                                       |
| Trusting conventions for append-only tables                   | Conventions do not survive a new contributor or a deadline. The audit repository has no update/delete method and the ownership rule is validated.                                                                                               |
| A `deleted` flag on every table                               | Makes "delete my data" unsayable on tables where it is meaningful; only memory tombstones, deliberately.                                                                                                                                        |
| Storing ownership rules in the schema declarations themselves | Ownership is a review question about _who writes_, not a column type; keeping it separate keeps the rule readable and forces a separate decision.                                                                                               |

## Consequences

**Positive:** PostgreSQL support is a dialect and a driver, not a rewrite; the
safety rules that matter (audit, approvals, memory trust, rule activation) hold
even if a future call path bypasses a service; the dependency direction
`api → agent → (db, llm, tools, …)` is now checkable; and a new table cannot ship
without a decision about its owner and retention.

**Negative:** more files than a single data module; two ways to read (toolkit vs
explicit SQL) means a reviewer must know which is appropriate — the rule is
"toolkit unless the query is an aggregate, a join or an atomic claim".

**Security impact:** positive. The audit trail being physically append-only, and
self-approval being unrepresentable in the database, removes two classes of
failure that would otherwise depend on every future code path behaving.

## References

- [database-and-storage.md](../database-and-storage.md)
- `src/db/executor.ts`, `src/db/table.ts`, `src/db/ownership.ts`, `src/db/repositories/**`, `tests/database.test.ts`
