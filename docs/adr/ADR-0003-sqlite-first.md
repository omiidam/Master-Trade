# ADR-0003 — SQLite as the initial database

**Status:** Accepted · **Date:** 2026-09-19

## Context

The domain is strongly relational (users → curriculum → lessons → exams →
memory → rules → approvals → audit) and the deployment target is a desktop
application with a single local user. Candidates: SQLite, PostgreSQL, document
store, JSON files.

## Decision

Use **SQLite** initially, with all access behind repositories defined in
`src/db/schema.ts`.

## Consequences

- Transactions and constraints are available for the audit trail, approvals and
  the "an active rule must have an approval id" invariant.
- One file to back up: important for a multi-month learning record.
- No server to operate or secure; no credentials for the database itself.
- Concurrency is limited: bounded job concurrency, short transactions and WAL
  mode are required (see R9 in risks-and-deferred.md).
- Migration path: repositories already isolate SQL, so a future multi-user
  server can move to PostgreSQL without touching business logic.
- Rejected: JSON files (no integrity, unsafe with background jobs), document
  store (relationships dominate), PostgreSQL today (operational weight, no user).
