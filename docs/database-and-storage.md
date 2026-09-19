# Database & File Storage

Implemented in `src/db/**` (Phase 3.4) and `src/storage/files.ts`. The schema
declarations in `src/db/schema.ts` are the single source of truth: DDL and the
initial migration are _generated_ from them, so a table cannot exist without a
declaration and a declaration cannot exist without being created.

## 1. Engines and modes

| Mode            | Engine                         | Status                                                    |
| --------------- | ------------------------------ | --------------------------------------------------------- |
| Local (default) | SQLite via `node:sqlite` (WAL) | Implemented, tested against real files and `:memory:`     |
| Production      | PostgreSQL                     | Same schema, migrations and repositories; driver injected |

**Why SQLite** ([ADR-0003](./adr/ADR-0003-sqlite-first.md)): a single local user,
no server to secure, real transactions and constraints (the audit trail and
approvals depend on them), and one file to back up — which matters for a
six-month learning record.

**Why `node:sqlite` instead of `better-sqlite3`**
([ADR-0025](./adr/ADR-0025-sqlite-driver-and-dialects.md)): the locked driver had
no prebuilt binary for the current Node ABI and fell back to compiling against
Visual Studio, which is risk R15 (a native module that breaks a desktop upgrade).
`node:sqlite` ships with Node, needs no compiler, and is reached through the same
port — `better-sqlite3` stays the documented fallback driver, and swapping back
touches one file (`src/db/sqlite.ts`). The trade is a higher Node floor (≥ 22.5).

Not chosen: JSON files (no integrity, painful for concurrent jobs), in-browser
storage (no jobs, no backups), PostgreSQL-only (operational weight with no benefit
for one user), a document store (the domain is strongly relational).

Settings applied on open: `journal_mode = WAL`, `foreign_keys = ON` (the
governance CHECK constraints depend on it), `busy_timeout = 5000`,
`synchronous = NORMAL`. The database file lives under the OS app-data directory in
the desktop build, so an application update cannot wipe it.

## 2. Data model

22 tables, grouped by the bounded context that owns them. Full column definitions,
checks and indexes live in `src/db/schema.ts`; the shape:

```
users ──┬── credentials            (hash + parameters only)
        ├── sessions               (transient; token HASH only)
        ├── settings               (non-secret key/value)
        ├── lesson_progress ── lessons ── curricula
        ├── exam_attempts ── exams ── lessons
        ├── conversations ── messages          (label, sources, instruction version)
        ├── memory_records ──┬── memory_versions   (immutable edit history)
        │                    └── memory_embeddings (vector + model + dimensions)
        ├── trading_rules ──┬── rule_evaluations
        │                   └── activation_approval_id ── approvals
        └── audit_records          (append-only, correlation id)
files (metadata)      jobs ── job_scratch (transient)      market_data_bars (provenance NOT NULL)
```

Integrity is expressed **in the database**, not only in code. The constraints that
matter for safety:

- `approvals`: an approved row must name a decider, must have a decision time, and
  **the decider may not be the requester** (self-approval is unrepresentable);
- `trading_rules`: `status = 'active'` requires `activation_approval_id` and
  `activated_at`;
- `memory_records`: `trust IN ('verified','authoritative')` requires `verified_by`;
  an `authoritative` record cannot be tombstoned in place;
- `market_data_bars`: `provenance` is NOT NULL and limited to
  `synthetic | historical` — `live` has no representation;
- `sessions.token_hash` is unique, and the repository refuses anything that is not a
  64-character SHA-256 digest, so a raw bearer token cannot be persisted;
- `lesson_progress`: completion/mastery requires a completion timestamp, mastery
  requires a score.

Ids are prefixed strings (`usr_…`, `mem_…`), never UUIDs: the `uuid` column type maps
to TEXT on both engines, because a native UUID column would reject our own ids.
Timestamps are ISO-8601 UTC strings written by the application — TEXT in SQLite,
TIMESTAMPTZ in PostgreSQL, identical in value so ordering and comparison agree.

## 3. Data ownership rules

`src/db/ownership.ts` declares, per table: the owning bounded context, the
mutability policy, the retention rule, whether it is backed up, and whether it may
hold personal data. `validateOwnership()` fails the build if a table has no rule,
two rules, is transient but backed up, is persistent but not backed up, is
append-only yet carries `updated_at`, or is the audit trail with mutable rows. The
same statement appears per table in `docs/adr/ADR-0023…` and via
`npm run db:ownership`:

| Table                 | Owner      | Mutability  | Retention         |
| --------------------- | ---------- | ----------- | ----------------- |
| users, credentials    | identity   | mutable     | forever           |
| sessions              | identity   | mutable     | ttl-sessions      |
| curricula, lessons    | academy    | mutable     | forever           |
| lesson_progress       | academy    | mutable     | forever           |
| exams                 | academy    | mutable     | forever           |
| exam_attempts         | academy    | append-only | forever           |
| conversations         | agent      | mutable     | by-user-request   |
| messages              | agent      | append-only | by-user-request   |
| memory_records        | memory     | tombstone   | by-user-request   |
| memory_versions       | memory     | append-only | forever           |
| memory_embeddings     | memory     | mutable     | forever           |
| trading_rules         | governance | mutable     | forever           |
| rule_evaluations      | governance | append-only | forever           |
| approvals             | governance | mutable     | forever           |
| audit_records         | audit      | append-only | rolling-365d      |
| settings, files, jobs | platform   | mutable     | forever / rolling |
| market_data_bars      | platform   | append-only | forever           |
| job_scratch           | platform   | mutable     | ttl-scratch       |

A transient table is never the target of a persistent foreign key, so dropping
expired rows cannot damage the learning record. `maintenance.cleanup` (a scheduled
job, Phase 3.5) purges expired sessions and scratch rows.

## 4. Migrations

`src/db/migrations/**` + `src/db/runner.ts`
([ADR-0024](./adr/ADR-0024-generated-migrations-and-ledger.md)).

- A migration is `up(dialect) => statements`; `0001_initial_schema` calls
  `createSchemaSql()`, which walks the declarations in dependency order (parents
  before children — SQLite tolerates a forward reference, PostgreSQL does not).
- The ledger `schema_migrations(version, id, checksum, applied_at, execution_ms)`
  is created by the runner, because it must exist in an empty database.
- The checksum covers the statements applied **for this dialect**, so editing an
  applied migration is detected.
- Three conditions refuse rather than guess: an applied migration missing from the
  code, an applied migration whose statements changed, and a database ahead of the
  code. All three raise `CONFLICT` with the offending ids.
- Forward-only. `down()` exists for local development and is never run by the
  runner. Destructive changes keep the two-step flow: add the replacement, migrate,
  then drop in a later version.
- `migrationPlan()` computes the comparison without writing, and the CLI exposes it,
  so an operator can see the effect before applying it.

```bash
npm run build
npm run db:status     # read-only: what would be applied, and what is applied
npm run db:migrate    # apply pending migrations (idempotent)
npm run db:ownership  # the rules above, as a table
npm run db:schema     # declared tables in dependency order with their owner
```

## 5. Repositories — how business logic reaches the data

`src/db/repositories/**` ([ADR-0023](./adr/ADR-0023-repository-boundary-and-data-ownership.md)).

| Repository | Owner      | Tables                                                    |
| ---------- | ---------- | --------------------------------------------------------- |
| identity   | identity   | users, credentials, sessions                              |
| academy    | academy    | curricula, lessons, lesson_progress, exams, exam_attempts |
| agent      | agent      | conversations, messages                                   |
| memory     | memory     | memory_records, memory_versions, memory_embeddings        |
| governance | governance | trading_rules, rule_evaluations, approvals                |
| audit      | audit      | audit_records                                             |
| platform   | platform   | settings, files, jobs, job_scratch                        |
| marketData | platform   | market_data_bars                                          |

- **One port.** `SqlExecutor` (promise-based) is the only persistence interface;
  repositories are written in terms of `Table<T>` (typed CRUD) or `db.queryAll()` +
  `decodeRows()` when a query needs SQL (aggregates, joins, the atomic job claim).
  Repository SQL always uses `?` placeholders, so the same code runs on both engines.
- **No coupling.** Nothing outside `src/db/**` may import a database driver or write
  a SQL statement — a test fails the build if either appears, and a second test
  asserts the audit repository exposes no update or delete method.
- **The queue is a table.** `enqueueJob` is keyed by `idempotency_key`, `claimJob`
  is a conditional UPDATE (two workers cannot take the same row), `failJob` applies
  backoff and dead-letters when the attempt budget is spent, and `reclaimExpired`
  returns jobs whose worker died — so a crash cannot wedge work permanently.
- **Every table has exactly one owner repository**; `repositoryCoverage()` proves the
  union equals the schema and that no table is claimed twice.

## 6. Memory persistence model

`src/db/repositories/memory.ts`. The failure mode here is quiet, so four rules are
enforced in code **and** as CHECK constraints:

1. **Provenance is mandatory.** Every record carries a source and a reference.
2. **A model write cannot be trusted.** Trust defaults to `unverified`; creating a
   record at `verified`/`authoritative` without a verifier id throws.
3. **Promotion requires a human**, and a human-verified level cannot be implicitly
   demoted — that would leave the claim retrievable while quietly dropping the fact
   that a person checked it. Tombstone and record the replacement instead.
4. **History is append-only.** `memory_versions` carries `history_index` (the
   ordering) and `version` (the record version each entry documents); every
   revision, trust change and tombstone appends an entry in the same transaction, so
   the current text can never disagree with its history. Deletion is a tombstone.

Embeddings live in `memory_embeddings`, keyed by `(record_id, model)` with the
dimension count, so migrating embedding models is a re-embedding job:
`recordsMissingEmbedding(model)` is its work list.

## 7. Audit persistence

`src/db/repositories/audit.ts`. `audit_records` is append-only **by construction**:
the repository has no update, delete, upsert or replace method (asserted by test),
the ownership rule marks it append-only, and the table has no soft-delete column.
Every record carries a correlation id, an actor, a stable event name, a severity and
a structured payload — and the payload passes through the same redaction rules as
logs before it is stored, so the audit trail is not a second place a credential can
leak. `byCorrelation()` reconstructs everything that happened for one user action.

## 8. File storage

`src/storage/files.ts`.

- **Local now, remote later**: `FileStorage` is the contract; the only
  implementation is `InMemoryFileStorage` (validates fully, persists nothing). A
  filesystem adapter and an S3-compatible adapter implement the same interface.
- **Content addressing**: `sha256` is stored per file; blobs are keyed by content
  hash locally, which deduplicates datasets and makes integrity checks trivial.
- **Categories and limits**: `document`, `dataset`, `chart-image`, `report-export`,
  `attachment`, each with its own max size and MIME allow-list (`DEFAULT_FILE_POLICY`).
- **Safe handling**: `sanitizeFilename()` strips directories, traversal segments and
  unsafe characters; empty files are rejected; the total quota (`maxTotalBytes`) is
  enforced on write.
- **Ownership and metadata**: owner id, category, size, hash, sensitivity and a
  `provenanceRef` used by vector memory and the audit trail. Bytes live in managed
  storage; the database keeps metadata only.
- **No storage paths for the frontend**: files are addressed by id only.
- **Sensitive files**: `sensitivity: 'sensitive'` is refused unless
  `allowSensitiveFiles` is explicitly true, and the config validator rejects that
  value at startup, so the policy can only change with a deliberate code change.

## 9. Tests

`tests/database.test.ts` (31) and `tests/repositories.test.ts` (13) run against real
SQLite databases (`:memory:` and a temporary file) and cover: schema validation
(including deliberately broken declarations), ownership validation, repository
coverage, dialect type mapping and dependency ordering for both engines, placeholder
rewriting, value codecs, migration idempotency, drift and tamper refusal, the
persistence of a file across reopen, foreign-key and CHECK enforcement _in SQL_, the
PostgreSQL path through a recording client, and per-repository behaviour (session
hashing, mastery rules, memory trust and history, approval/activation guards, audit
append-only, queue idempotency/claim/backoff/dead-letter/lease reclaim, bar
provenance). They skip with a recorded reason on a runtime without `node:sqlite`.

## 10. Deferred

| Deferred                                              | Notes                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------ |
| Server and jobs opening a database handle             | Phase 3.5; the repositories are ready, the wiring is deliberate    |
| Credential verification (argon2/scrypt)               | Needs a crypto dependency decision; the table and repository exist |
| Read/write repositories for conversations in the API  | `lesson.complete` and `rule.*` routes still answer `501`           |
| Filesystem and remote object-storage adapters         | Interfaces exist; only the validating in-memory adapter is wired   |
| Backup/restore, archive job, hard-delete job          | Retention rules are declared; the jobs are Phase 3.5               |
| PostgreSQL driver (`pg`) and its CI service container | Added when a hosted deployment exists; the dialect path is tested  |
