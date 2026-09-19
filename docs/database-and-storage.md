# Database & File Storage

## 1. Database choice

**SQLite** (`src/db/schema.ts`, `engine: 'sqlite'`). Rationale — see
[ADR-0003](./adr/ADR-0003-sqlite-first.md):

- single local user, desktop deployment: no server to secure or operate;
- real transactions and constraints (the audit trail and approvals depend on them);
- one file to back up, which matters for a 6-month learning record;
- simple migration path to PostgreSQL if a multi-user server ever appears
  (all access goes through repositories, not through SQL sprinkled in services).

Not chosen: JSON files (no integrity, painful concurrent jobs), in-browser
storage (no jobs/backups), PostgreSQL now (operational weight with no benefit),
a document store (the domain is strongly relational: users → lessons → exams →
memory → approvals).

## 2. Entity overview

Full column definitions live in `src/db/schema.ts`; the shape:

```
users ──┬── credentials            (hash + salt only)
        ├── sessions               (transient)
        ├── settings               (key/value, non-secret)
        ├── lesson_progress ── lessons ── curricula
        ├── exam_attempts ── exams ── lessons
        ├── conversations ── messages        (epistemic label, tool calls, instruction version)
        ├── memory_records ──┬── memory_versions   (immutable edit history)
        │                    └── memory_embeddings (vector + model + dimensions)
        ├── trading_rules ──┬── rule_evaluations
        │                   └── activation_approval_id ── approvals
        ├── files                  (metadata; bytes in storage)
        └── audit_records          (append-only, correlation id)
jobs ── job_scratch (transient)      market_data_bars (provenance column mandatory)
```

Key constraints:

- `trading_rules.activation_approval_id` is nullable but activation requires it
  in code; an active rule without an approval id is a bug the repository layer
  must reject.
- `approvals` records both requester and decider so self-approval is detectable.
- `market_data_bars.provenance` (`synthetic | historical | live`) is NOT NULL —
  synthetic data can never be stored as if it were real.
- `messages.correlation_id` + `audit_records.correlation_id` allow one query to
  reconstruct everything that happened for a user action.

## 3. Temporary vs persistent data

| Persistent (backed up)                                | Transient (TTL, safe to drop)                   |
| ----------------------------------------------------- | ----------------------------------------------- |
| users, credentials, settings                          | sessions                                        |
| curricula, lessons, progress, exams                   | job_scratch (`transientTtlHours`, default 48 h) |
| conversations, messages, memory, versions, embeddings | realtime replay buffers (in memory)             |
| trading_rules, evaluations, approvals, audit_records  | offline cache entries                           |
| files metadata, market_data_bars, jobs history        | provider response caches                        |

The `maintenance.cleanup` job purges expired sessions and scratch rows. Nothing
transient is referenced by a persistent foreign key.

## 4. Migration strategy

`Migration { id, version, description, up[], down[] }`, validated by
`validateMigrations()`:

- versions strictly increasing, no duplicate ids, `up` never empty;
- forward-only in production; `down` exists for local rollback;
- each migration runs inside a transaction and is recorded in
  `schema_migrations`;
- `INITIAL_MIGRATION` (version 1) creates the schema above;
- destructive changes (dropping a column/table) require a two-step migration:
  stop writing, then drop in a later version.

## 5. File storage

`src/storage/files.ts`.

- **Local now, remote later**: `FileStorage` is the contract; the only
  implementation is `InMemoryFileStorage` (validates fully, persists nothing).
  A filesystem adapter and an S3-compatible adapter implement the same interface.
- **Content addressing**: `sha256` is stored per file; blobs are keyed by
  content hash locally, which deduplicates datasets and makes integrity checks
  trivial.
- **Categories and limits**: `document`, `dataset`, `chart-image`,
  `report-export`, `attachment`, each with its own max size and MIME allow-list
  (`DEFAULT_FILE_POLICY`).
- **Safe handling**: `sanitizeFilename()` strips directories, traversal
  segments and unsafe characters; empty files are rejected; the total quota
  (`maxTotalBytes`) is enforced on write.
- **Ownership and metadata**: owner id, category, size, hash, sensitivity and a
  `provenanceRef` used by vector memory and the audit trail.
- **No storage paths for the frontend**: files are addressed by id only.
- **Sensitive files**: `sensitivity: 'sensitive'` is refused unless
  `allowSensitiveFiles` is explicitly true; the config validator rejects that
  value at startup, so the policy can only change with a deliberate code change,
  not a settings toggle.
