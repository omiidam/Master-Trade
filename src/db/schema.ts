/**
 * Database boundary.
 *
 * Phase 2 chooses SQLite as the initial engine: the product is a desktop
 * training tool with a single local user, and SQLite gives transactional
 * integrity, zero-ops backups and no server to secure. All access goes through
 * repositories behind the interfaces in this file, so a future server
 * deployment can swap in PostgreSQL without touching business logic.
 *
 * These are *definitions*, not an implementation: no driver is installed yet.
 */

export type ColumnType =
  'uuid' | 'text' | 'integer' | 'real' | 'boolean' | 'timestamp' | 'json' | 'blob-ref';

export interface ColumnDef {
  name: string;
  type: ColumnType;
  nullable: boolean;
  unique?: boolean;
  references?: TableName;
  note?: string;
}

export type TableName =
  | 'users'
  | 'credentials'
  | 'sessions'
  | 'settings'
  | 'curricula'
  | 'lessons'
  | 'lesson_progress'
  | 'exams'
  | 'exam_attempts'
  | 'conversations'
  | 'messages'
  | 'memory_records'
  | 'memory_versions'
  | 'memory_embeddings'
  | 'trading_rules'
  | 'rule_evaluations'
  | 'approvals'
  | 'audit_records'
  | 'files'
  | 'jobs'
  | 'market_data_bars'
  | 'job_scratch';

export type EntityKind = 'persistent' | 'transient';

export interface EntityDefinition {
  table: TableName;
  kind: EntityKind;
  description: string;
  columns: ColumnDef[];
  indexes?: string[];
}

const id = (): ColumnDef => ({ name: 'id', type: 'uuid', nullable: false, unique: true });
const createdAt = (): ColumnDef => ({ name: 'created_at', type: 'timestamp', nullable: false });
const updatedAt = (): ColumnDef => ({ name: 'updated_at', type: 'timestamp', nullable: false });

/**
 * Initial entity overview. Grouped by bounded context; the same list appears
 * in docs/database-and-storage.md with the relationship diagram.
 */
export const SCHEMA: readonly EntityDefinition[] = [
  {
    table: 'users',
    kind: 'persistent',
    description: 'Learner/coach accounts. No trading identity, no broker credentials.',
    columns: [
      id(),
      { name: 'display_name', type: 'text', nullable: false },
      { name: 'timezone', type: 'text', nullable: false },
      { name: 'experience_level', type: 'text', nullable: false },
      createdAt(),
      updatedAt(),
    ],
  },
  {
    table: 'credentials',
    kind: 'persistent',
    description:
      'Password/PIN hash + salt only. The plaintext secret itself lives in the OS keychain, never here.',
    columns: [
      id(),
      { name: 'user_id', type: 'uuid', nullable: false, references: 'users' },
      { name: 'algorithm', type: 'text', nullable: false },
      { name: 'password_hash', type: 'text', nullable: false },
      { name: 'created_at', type: 'timestamp', nullable: false },
    ],
  },
  {
    table: 'sessions',
    kind: 'transient',
    description: 'Active sessions; expired rows are purged by a scheduled job.',
    columns: [
      id(),
      { name: 'user_id', type: 'uuid', nullable: false, references: 'users' },
      { name: 'issued_at', type: 'timestamp', nullable: false },
      { name: 'expires_at', type: 'timestamp', nullable: false },
      { name: 'revoked_at', type: 'timestamp', nullable: true },
    ],
    indexes: ['sessions_user_id_idx'],
  },
  {
    table: 'settings',
    kind: 'persistent',
    description: 'Non-secret user/system preferences (key/value). Secrets are never stored here.',
    columns: [
      id(),
      { name: 'user_id', type: 'uuid', nullable: true, references: 'users' },
      { name: 'key', type: 'text', nullable: false, unique: true },
      { name: 'value', type: 'json', nullable: false },
      updatedAt(),
    ],
  },
  {
    table: 'curricula',
    kind: 'persistent',
    description: 'Ordered training programme spanning ≥6 months.',
    columns: [
      id(),
      { name: 'title', type: 'text', nullable: false },
      { name: 'version', type: 'text', nullable: false },
    ],
  },
  {
    table: 'lessons',
    kind: 'persistent',
    description: 'Lesson content and prerequisites inside a curriculum.',
    columns: [
      id(),
      { name: 'curriculum_id', type: 'uuid', nullable: false, references: 'curricula' },
      { name: 'slug', type: 'text', nullable: false, unique: true },
      { name: 'title', type: 'text', nullable: false },
      { name: 'difficulty', type: 'integer', nullable: false },
      { name: 'content', type: 'json', nullable: false },
      { name: 'prerequisites', type: 'json', nullable: false },
    ],
  },
  {
    table: 'lesson_progress',
    kind: 'persistent',
    description: 'Per-user completion and mastery state.',
    columns: [
      id(),
      { name: 'user_id', type: 'uuid', nullable: false, references: 'users' },
      { name: 'lesson_id', type: 'uuid', nullable: false, references: 'lessons' },
      { name: 'status', type: 'text', nullable: false },
      { name: 'score', type: 'real', nullable: true },
      { name: 'completed_at', type: 'timestamp', nullable: true },
      updatedAt(),
    ],
    indexes: ['lesson_progress_user_lesson_idx'],
  },
  {
    table: 'exams',
    kind: 'persistent',
    description: 'Examination definitions and grading rubric.',
    columns: [
      id(),
      { name: 'lesson_id', type: 'uuid', nullable: false, references: 'lessons' },
      { name: 'rubric', type: 'json', nullable: false },
    ],
  },
  {
    table: 'exam_attempts',
    kind: 'persistent',
    description: 'Attempts with per-question results, kept for longitudinal skill tracking.',
    columns: [
      id(),
      { name: 'exam_id', type: 'uuid', nullable: false, references: 'exams' },
      { name: 'user_id', type: 'uuid', nullable: false, references: 'users' },
      { name: 'answers', type: 'json', nullable: false },
      { name: 'grading', type: 'json', nullable: false },
      { name: 'passed', type: 'boolean', nullable: false },
      createdAt(),
    ],
  },
  {
    table: 'conversations',
    kind: 'persistent',
    description: 'Agent conversation threads.',
    columns: [
      id(),
      { name: 'user_id', type: 'uuid', nullable: false, references: 'users' },
      { name: 'title', type: 'text', nullable: false },
      createdAt(),
    ],
  },
  {
    table: 'messages',
    kind: 'persistent',
    description:
      'Conversation turns with epistemic label, tool/provenance references and instruction version.',
    columns: [
      id(),
      { name: 'conversation_id', type: 'uuid', nullable: false, references: 'conversations' },
      { name: 'role', type: 'text', nullable: false },
      { name: 'epistemic_kind', type: 'text', nullable: false },
      { name: 'content', type: 'text', nullable: false },
      { name: 'tool_calls', type: 'json', nullable: true },
      { name: 'instructions_version', type: 'text', nullable: false },
      { name: 'correlation_id', type: 'text', nullable: false },
      createdAt(),
    ],
    indexes: ['messages_conversation_created_idx'],
  },
  {
    table: 'memory_records',
    kind: 'persistent',
    description: 'Structured memory: provenance, trust level, epistemic kind and version pointer.',
    columns: [
      id(),
      { name: 'type', type: 'text', nullable: false },
      { name: 'text', type: 'text', nullable: false },
      { name: 'provenance_source', type: 'text', nullable: false },
      { name: 'provenance_ref', type: 'text', nullable: false },
      { name: 'trust', type: 'text', nullable: false },
      { name: 'epistemic_kind', type: 'text', nullable: false },
      { name: 'version', type: 'integer', nullable: false },
      { name: 'deleted_at', type: 'timestamp', nullable: true },
      createdAt(),
    ],
  },
  {
    table: 'memory_versions',
    kind: 'persistent',
    description: 'Immutable history of every memory edit; enables rollback and audit.',
    columns: [
      id(),
      { name: 'record_id', type: 'uuid', nullable: false, references: 'memory_records' },
      { name: 'version', type: 'integer', nullable: false },
      { name: 'text', type: 'text', nullable: false },
      { name: 'metadata', type: 'json', nullable: false },
      { name: 'changed_by', type: 'uuid', nullable: false, references: 'users' },
      createdAt(),
    ],
  },
  {
    table: 'memory_embeddings',
    kind: 'persistent',
    description: 'Vectors plus the embedding model that produced them, so models can be migrated.',
    columns: [
      id(),
      { name: 'record_id', type: 'uuid', nullable: false, references: 'memory_records' },
      { name: 'model', type: 'text', nullable: false },
      { name: 'dimensions', type: 'integer', nullable: false },
      { name: 'vector', type: 'json', nullable: false },
    ],
  },
  {
    table: 'trading_rules',
    kind: 'persistent',
    description:
      'Proposed rules with lifecycle status. Activation is impossible without an approval row.',
    columns: [
      id(),
      { name: 'proposed_by', type: 'uuid', nullable: false, references: 'users' },
      { name: 'rule_text', type: 'text', nullable: false },
      { name: 'hypothesis', type: 'text', nullable: false },
      { name: 'status', type: 'text', nullable: false },
      { name: 'activation_approval_id', type: 'uuid', nullable: true, references: 'approvals' },
      createdAt(),
    ],
  },
  {
    table: 'rule_evaluations',
    kind: 'persistent',
    description: 'Evidence attached to a proposal (deterministic metrics, backtest references).',
    columns: [
      id(),
      { name: 'rule_id', type: 'uuid', nullable: false, references: 'trading_rules' },
      { name: 'method', type: 'text', nullable: false },
      { name: 'metrics', type: 'json', nullable: false },
      { name: 'verdict', type: 'text', nullable: false },
      { name: 'job_id', type: 'uuid', nullable: true, references: 'jobs' },
      createdAt(),
    ],
  },
  {
    table: 'approvals',
    kind: 'persistent',
    description:
      'Human approval requests and decisions. Self-approval is rejected by the workflow.',
    columns: [
      id(),
      { name: 'operation', type: 'text', nullable: false },
      { name: 'subject_ref', type: 'text', nullable: false },
      { name: 'requested_by', type: 'uuid', nullable: false, references: 'users' },
      { name: 'decided_by', type: 'uuid', nullable: true, references: 'users' },
      { name: 'status', type: 'text', nullable: false },
      { name: 'rationale', type: 'text', nullable: false },
      { name: 'decided_at', type: 'timestamp', nullable: true },
      { name: 'expires_at', type: 'timestamp', nullable: false },
      createdAt(),
    ],
  },
  {
    table: 'audit_records',
    kind: 'persistent',
    description:
      'Append-only audit trail: correlation id, actor, operation, tool calls, provenance.',
    columns: [
      id(),
      { name: 'correlation_id', type: 'text', nullable: false },
      { name: 'actor_id', type: 'uuid', nullable: true, references: 'users' },
      { name: 'event', type: 'text', nullable: false },
      { name: 'payload', type: 'json', nullable: false },
      { name: 'recorded_at', type: 'timestamp', nullable: false },
    ],
    indexes: ['audit_records_correlation_idx'],
  },
  {
    table: 'files',
    kind: 'persistent',
    description: 'File metadata; bytes live in managed storage keyed by content hash.',
    columns: [
      id(),
      { name: 'owner_id', type: 'uuid', nullable: false, references: 'users' },
      { name: 'category', type: 'text', nullable: false },
      { name: 'filename', type: 'text', nullable: false },
      { name: 'mime_type', type: 'text', nullable: false },
      { name: 'size_bytes', type: 'integer', nullable: false },
      { name: 'sha256', type: 'text', nullable: false },
      { name: 'sensitivity', type: 'text', nullable: false },
      createdAt(),
    ],
  },
  {
    table: 'jobs',
    kind: 'persistent',
    description: 'Job history with idempotency key, attempts, status and last error.',
    columns: [
      id(),
      { name: 'kind', type: 'text', nullable: false },
      { name: 'status', type: 'text', nullable: false },
      { name: 'idempotency_key', type: 'text', nullable: false, unique: true },
      { name: 'attempts', type: 'integer', nullable: false },
      { name: 'correlation_id', type: 'text', nullable: false },
      { name: 'error', type: 'text', nullable: true },
      updatedAt(),
    ],
    indexes: ['jobs_status_idx'],
  },
  {
    table: 'market_data_bars',
    kind: 'persistent',
    description:
      'Normalized bars. Provenance and source are mandatory so synthetic never masquerades as real.',
    columns: [
      id(),
      { name: 'symbol', type: 'text', nullable: false },
      { name: 'timeframe', type: 'text', nullable: false },
      { name: 'provenance', type: 'text', nullable: false },
      { name: 'source', type: 'text', nullable: false },
      { name: 'time', type: 'timestamp', nullable: false },
      { name: 'open', type: 'real', nullable: false },
      { name: 'high', type: 'real', nullable: false },
      { name: 'low', type: 'real', nullable: false },
      { name: 'close', type: 'real', nullable: false },
      { name: 'volume', type: 'real', nullable: false },
    ],
    indexes: ['market_data_bars_symbol_time_idx'],
  },
  {
    table: 'job_scratch',
    kind: 'transient',
    description: 'Job intermediate state with a TTL; never backed up, safe to delete.',
    columns: [
      id(),
      { name: 'job_id', type: 'uuid', nullable: false, references: 'jobs' },
      { name: 'payload', type: 'json', nullable: false },
      { name: 'expires_at', type: 'timestamp', nullable: false },
    ],
  },
];

export function tablesOfKind(kind: EntityKind): TableName[] {
  return SCHEMA.filter((entity) => entity.kind === kind).map((entity) => entity.table);
}

/* ------------------------------------------------------------------ */
/* Migrations                                                          */
/* ------------------------------------------------------------------ */

export interface Migration {
  id: string;
  version: number;
  description: string;
  up: string[];
  down: string[];
}

/**
 * Strategy: forward-only, versioned, applied inside a transaction, recorded in
 * a `schema_migrations` table. Every migration ships with a `down` statement
 * for local rollback during development.
 */
export function validateMigrations(migrations: readonly Migration[]): void {
  const versions = new Set<number>();
  const ids = new Set<string>();
  let previous = 0;
  for (const migration of migrations) {
    if (ids.has(migration.id)) throw new Error(`Duplicate migration id: ${migration.id}`);
    if (versions.has(migration.version)) {
      throw new Error(`Duplicate migration version: ${migration.version}`);
    }
    if (migration.version <= previous) {
      throw new Error(`Migration versions must increase: ${migration.id}`);
    }
    if (migration.up.length === 0) throw new Error(`Migration ${migration.id} has no up steps`);
    ids.add(migration.id);
    versions.add(migration.version);
    previous = migration.version;
  }
}

export const INITIAL_MIGRATION: Migration = {
  id: '0001_initial_schema',
  version: 1,
  description: 'Create the initial Master Trade schema.',
  up: SCHEMA.map((entity) => `CREATE TABLE ${entity.table} (...)`),
  down: SCHEMA.map((entity) => `DROP TABLE ${entity.table}`),
};
