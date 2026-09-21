/**
 * Schema — the single source of truth for the database shape.
 *
 * These are *declarations*, not SQL: `src/db/ddl.ts` turns each entity into
 * dialect-appropriate DDL for SQLite and PostgreSQL, and the initial migration
 * is generated from this list. That means a table cannot exist without a
 * declaration, and a declaration cannot exist without appearing in the
 * migration — the two cannot drift.
 *
 * Design rules encoded here (see docs/database-and-storage.md):
 * 1. Ids are prefixed strings (`usr_…`, `mem_…`), never UUIDs. The `uuid` column
 *    type therefore maps to TEXT in both dialects on purpose: a native UUID
 *    column would reject our own ids.
 * 2. Timestamps are ISO-8601 UTC strings written by the application. They are
 *    TEXT in SQLite and TIMESTAMPTZ in PostgreSQL; because the format is
 *    identical, comparisons and ordering agree in both.
 * 3. Integrity lives in the database as well as in code: NOT NULL, UNIQUE,
 *    FOREIGN KEY, CHECK on enumerated values, and the governance checks that
 *    matter (an active rule must cite an approval; an approval must be decided
 *    by someone other than its requester).
 * 4. No column may hold a secret. Credentials store a hash; everything else
 *    holds a `SecretRef` name at most.
 * 5. Transient data is marked and is never the target of a persistent foreign
 *    key, so dropping it cannot damage the learning record.
 */

export type ColumnType =
  'uuid' | 'text' | 'integer' | 'real' | 'boolean' | 'timestamp' | 'json' | 'blob-ref';

export type ReferentialAction = 'cascade' | 'restrict' | 'set null';

export interface ForeignKey {
  table: TableName;
  column?: string;
  onDelete?: ReferentialAction;
}

export interface ColumnDef {
  name: string;
  type: ColumnType;
  nullable: boolean;
  /** Part of the primary key. Exactly one column per table carries this. */
  primaryKey?: boolean;
  unique?: boolean;
  references?: ForeignKey;
  /** Enumerated values; emitted as `CHECK (col IN (...))`. */
  values?: readonly string[];
  /** Numeric range checks, for scores, difficulty and dimensions. */
  min?: number;
  max?: number;
  /** Length guard for free text that must not grow unbounded. */
  maxLength?: number;
  /** Why this column exists, when the name alone is not enough. */
  note?: string;
}

export interface IndexDef {
  name: string;
  columns: readonly string[];
  unique?: boolean;
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
  | 'job_scratch'
  | 'trading_context_versions';

export type EntityKind = 'persistent' | 'transient';

export interface EntityDefinition {
  table: TableName;
  kind: EntityKind;
  description: string;
  columns: ColumnDef[];
  indexes?: readonly IndexDef[];
  /** Table-level checks that reference more than one column. */
  checks?: readonly string[];
}

export type MemoryTrust = 'unverified' | 'corroborated' | 'verified' | 'authoritative';

export const MEMORY_TRUST_LEVELS: readonly MemoryTrust[] = [
  'unverified',
  'corroborated',
  'verified',
  'authoritative',
];

/** Trust levels a human verifier must sign off before they can be assigned. */
export const HUMAN_VERIFIED_TRUST_LEVELS: readonly MemoryTrust[] = ['verified', 'authoritative'];

export const EPISTEMIC_KINDS = ['fact', 'analysis', 'hypothesis', 'uncertainty'] as const;
export const MEMORY_TYPES = [
  'lesson-note',
  'trade-review',
  'rule-rationale',
  'mistake',
  'strength',
  'glossary',
] as const;
export const RULE_STATUSES = [
  'proposed',
  'evaluating',
  'approved',
  'rejected',
  'active',
  'archived',
] as const;
export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected', 'expired'] as const;
export const EVALUATION_VERDICTS = [
  'supports',
  'rejects',
  'inconclusive',
  'insufficient-data',
] as const;
export const PROGRESS_STATUSES = [
  'locked',
  'available',
  'in_progress',
  'completed',
  'mastered',
] as const;
export const JOB_STATUSES = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'dead-letter',
  'cancelled',
] as const;
export const DATA_PROVENANCE_VALUES = ['synthetic', 'historical'] as const;

const pk = (): ColumnDef => ({ name: 'id', type: 'uuid', nullable: false, primaryKey: true });
const createdAt = (): ColumnDef => ({ name: 'created_at', type: 'timestamp', nullable: false });
const updatedAt = (): ColumnDef => ({ name: 'updated_at', type: 'timestamp', nullable: false });
const fk = (table: TableName, onDelete?: ReferentialAction): ForeignKey =>
  onDelete === undefined ? { table } : { table, onDelete };

/** Initial entity overview, grouped by bounded context. */
export const SCHEMA: readonly EntityDefinition[] = [
  {
    table: 'users',
    kind: 'persistent',
    description: 'Learner/coach accounts. No trading identity, no broker credentials.',
    columns: [
      pk(),
      { name: 'display_name', type: 'text', nullable: false, unique: true, maxLength: 120 },
      { name: 'timezone', type: 'text', nullable: false, maxLength: 64 },
      {
        name: 'experience_level',
        type: 'text',
        nullable: false,
        values: ['beginner', 'intermediate', 'advanced'],
      },
      { name: 'last_seen_at', type: 'timestamp', nullable: true },
      createdAt(),
      updatedAt(),
    ],
  },
  {
    table: 'credentials',
    kind: 'persistent',
    description:
      'Password/PIN hash only. The plaintext secret never reaches this database; the OS keychain holds anything raw.',
    columns: [
      pk(),
      {
        name: 'user_id',
        type: 'uuid',
        nullable: false,
        unique: true,
        references: fk('users', 'cascade'),
      },
      { name: 'algorithm', type: 'text', nullable: false, values: ['argon2id', 'scrypt'] },
      {
        name: 'password_hash',
        type: 'text',
        nullable: false,
        note: 'Includes the salt and parameters; never a reversible value.',
      },
      createdAt(),
    ],
  },
  {
    table: 'sessions',
    kind: 'transient',
    description: 'Active sessions. Only a token hash is stored, so a dump cannot be replayed.',
    columns: [
      pk(),
      { name: 'user_id', type: 'uuid', nullable: false, references: fk('users', 'cascade') },
      {
        name: 'token_hash',
        type: 'text',
        nullable: false,
        unique: true,
        note: 'SHA-256 of the bearer token; the token itself is never stored.',
      },
      { name: 'roles', type: 'json', nullable: false },
      { name: 'issued_at', type: 'timestamp', nullable: false },
      { name: 'expires_at', type: 'timestamp', nullable: false },
      { name: 'revoked_at', type: 'timestamp', nullable: true },
    ],
    indexes: [{ name: 'sessions_user_idx', columns: ['user_id'] }],
  },
  {
    table: 'settings',
    kind: 'persistent',
    description: 'Non-secret preferences (key/value). Secrets are never stored here.',
    columns: [
      pk(),
      { name: 'user_id', type: 'uuid', nullable: true, references: fk('users', 'cascade') },
      { name: 'key', type: 'text', nullable: false, maxLength: 120 },
      { name: 'value', type: 'json', nullable: false },
      updatedAt(),
    ],
    indexes: [{ name: 'settings_scope_key_idx', columns: ['user_id', 'key'], unique: true }],
    checks: ['"key" NOT LIKE \'%secret%\''],
  },
  {
    table: 'curricula',
    kind: 'persistent',
    description: 'Ordered training programme spanning at least six months.',
    columns: [
      pk(),
      { name: 'title', type: 'text', nullable: false, maxLength: 200 },
      { name: 'version', type: 'text', nullable: false, maxLength: 32 },
      createdAt(),
    ],
  },
  {
    table: 'lessons',
    kind: 'persistent',
    description: 'Lesson content and prerequisites inside a curriculum.',
    columns: [
      pk(),
      {
        name: 'curriculum_id',
        type: 'uuid',
        nullable: false,
        references: fk('curricula', 'cascade'),
      },
      { name: 'slug', type: 'text', nullable: false, unique: true, maxLength: 120 },
      { name: 'title', type: 'text', nullable: false, maxLength: 200 },
      { name: 'difficulty', type: 'integer', nullable: false, min: 1, max: 5 },
      { name: 'order_index', type: 'integer', nullable: false, min: 0 },
      { name: 'content', type: 'json', nullable: false },
      { name: 'prerequisites', type: 'json', nullable: false },
      createdAt(),
    ],
    indexes: [{ name: 'lessons_curriculum_order_idx', columns: ['curriculum_id', 'order_index'] }],
  },
  {
    table: 'lesson_progress',
    kind: 'persistent',
    description: 'Per-user completion and mastery state. One row per user/lesson.',
    columns: [
      pk(),
      { name: 'user_id', type: 'uuid', nullable: false, references: fk('users', 'cascade') },
      { name: 'lesson_id', type: 'uuid', nullable: false, references: fk('lessons', 'cascade') },
      { name: 'status', type: 'text', nullable: false, values: PROGRESS_STATUSES },
      { name: 'score', type: 'real', nullable: true, min: 0, max: 100 },
      { name: 'completed_at', type: 'timestamp', nullable: true },
      updatedAt(),
    ],
    indexes: [
      { name: 'lesson_progress_user_lesson_idx', columns: ['user_id', 'lesson_id'], unique: true },
    ],
    checks: [
      "(status IN ('completed', 'mastered')) = (completed_at IS NOT NULL)",
      "status <> 'mastered' OR score IS NOT NULL",
    ],
  },
  {
    table: 'exams',
    kind: 'persistent',
    description: 'Examination definitions and grading rubric.',
    columns: [
      pk(),
      { name: 'lesson_id', type: 'uuid', nullable: false, references: fk('lessons', 'cascade') },
      { name: 'title', type: 'text', nullable: false, maxLength: 200 },
      { name: 'rubric', type: 'json', nullable: false },
      { name: 'pass_score', type: 'real', nullable: false, min: 0, max: 100 },
      createdAt(),
    ],
  },
  {
    table: 'exam_attempts',
    kind: 'persistent',
    description: 'Attempts with per-question results, kept for longitudinal skill tracking.',
    columns: [
      pk(),
      { name: 'exam_id', type: 'uuid', nullable: false, references: fk('exams', 'cascade') },
      { name: 'user_id', type: 'uuid', nullable: false, references: fk('users', 'cascade') },
      { name: 'answers', type: 'json', nullable: false },
      { name: 'grading', type: 'json', nullable: false },
      { name: 'score', type: 'real', nullable: false, min: 0, max: 100 },
      { name: 'passed', type: 'boolean', nullable: false },
      createdAt(),
    ],
    indexes: [{ name: 'exam_attempts_user_idx', columns: ['user_id', 'created_at'] }],
  },
  {
    table: 'conversations',
    kind: 'persistent',
    description: 'Agent conversation threads.',
    columns: [
      pk(),
      { name: 'user_id', type: 'uuid', nullable: false, references: fk('users', 'cascade') },
      { name: 'title', type: 'text', nullable: false, maxLength: 200 },
      createdAt(),
    ],
    indexes: [{ name: 'conversations_user_idx', columns: ['user_id', 'created_at'] }],
  },
  {
    table: 'messages',
    kind: 'persistent',
    description:
      'Conversation turns with epistemic label, tool/provenance references and the instruction version that produced them.',
    columns: [
      pk(),
      {
        name: 'conversation_id',
        type: 'uuid',
        nullable: false,
        references: fk('conversations', 'cascade'),
      },
      { name: 'role', type: 'text', nullable: false, values: ['user', 'agent', 'tool', 'system'] },
      { name: 'epistemic_kind', type: 'text', nullable: false, values: EPISTEMIC_KINDS },
      { name: 'content', type: 'text', nullable: false, maxLength: 32_000 },
      { name: 'tool_calls', type: 'json', nullable: true },
      { name: 'sources', type: 'json', nullable: false },
      { name: 'instructions_version', type: 'text', nullable: false, maxLength: 64 },
      { name: 'correlation_id', type: 'text', nullable: false, maxLength: 128 },
      createdAt(),
    ],
    indexes: [
      { name: 'messages_conversation_created_idx', columns: ['conversation_id', 'created_at'] },
    ],
  },
  {
    table: 'memory_records',
    kind: 'persistent',
    description:
      'Structured memory: provenance, trust level, epistemic kind, current version. Trust promotion to a human-verified level requires a verifier id.',
    columns: [
      pk(),
      { name: 'user_id', type: 'uuid', nullable: true, references: fk('users', 'set null') },
      { name: 'type', type: 'text', nullable: false, values: MEMORY_TYPES },
      { name: 'text', type: 'text', nullable: false, maxLength: 16_000 },
      { name: 'provenance_source', type: 'text', nullable: false, maxLength: 120 },
      { name: 'provenance_ref', type: 'text', nullable: false, maxLength: 256 },
      { name: 'trust', type: 'text', nullable: false, values: MEMORY_TRUST_LEVELS },
      { name: 'epistemic_kind', type: 'text', nullable: false, values: EPISTEMIC_KINDS },
      { name: 'version', type: 'integer', nullable: false, min: 1 },
      { name: 'verified_by', type: 'uuid', nullable: true, references: fk('users', 'set null') },
      { name: 'deleted_at', type: 'timestamp', nullable: true },
      createdAt(),
      updatedAt(),
    ],
    indexes: [
      { name: 'memory_records_trust_idx', columns: ['trust', 'created_at'] },
      { name: 'memory_records_user_idx', columns: ['user_id', 'created_at'] },
    ],
    checks: [
      "(trust IN ('verified', 'authoritative')) = (verified_by IS NOT NULL)",
      "deleted_at IS NULL OR trust <> 'authoritative'",
    ],
  },
  {
    table: 'memory_versions',
    kind: 'persistent',
    description:
      'Immutable history of every memory edit; enables rollback and audit. `history_index` orders the entries, `version` says which record version each entry documents (several entries may document one version — a trust change does not rewrite text).',
    columns: [
      pk(),
      {
        name: 'record_id',
        type: 'uuid',
        nullable: false,
        references: fk('memory_records', 'cascade'),
      },
      { name: 'history_index', type: 'integer', nullable: false, min: 1 },
      { name: 'version', type: 'integer', nullable: false, min: 1 },
      { name: 'text', type: 'text', nullable: false, maxLength: 16_000 },
      { name: 'metadata', type: 'json', nullable: false },
      {
        name: 'changed_by',
        type: 'text',
        nullable: false,
        maxLength: 120,
        note: 'user id or "system"',
      },
      createdAt(),
    ],
    indexes: [
      {
        name: 'memory_versions_record_index_idx',
        columns: ['record_id', 'history_index'],
        unique: true,
      },
    ],
  },
  {
    table: 'memory_embeddings',
    kind: 'persistent',
    description:
      'Vectors plus the model that produced them, so embeddings can be migrated model by model.',
    columns: [
      pk(),
      {
        name: 'record_id',
        type: 'uuid',
        nullable: false,
        references: fk('memory_records', 'cascade'),
      },
      { name: 'model', type: 'text', nullable: false, maxLength: 120 },
      { name: 'dimensions', type: 'integer', nullable: false, min: 1, max: 8192 },
      { name: 'vector', type: 'json', nullable: false },
      createdAt(),
    ],
    indexes: [
      { name: 'memory_embeddings_record_model_idx', columns: ['record_id', 'model'], unique: true },
      { name: 'memory_embeddings_model_idx', columns: ['model'] },
    ],
  },
  {
    table: 'trading_rules',
    kind: 'persistent',
    description:
      'Proposed rules with lifecycle status. An active rule must cite the approval that activated it.',
    columns: [
      pk(),
      { name: 'proposed_by', type: 'uuid', nullable: false, references: fk('users', 'restrict') },
      { name: 'rule_text', type: 'text', nullable: false, maxLength: 4_000 },
      { name: 'hypothesis', type: 'text', nullable: false, maxLength: 4_000 },
      { name: 'status', type: 'text', nullable: false, values: RULE_STATUSES },
      {
        name: 'activation_approval_id',
        type: 'uuid',
        nullable: true,
        references: fk('approvals', 'restrict'),
      },
      { name: 'activated_at', type: 'timestamp', nullable: true },
      createdAt(),
      updatedAt(),
    ],
    indexes: [{ name: 'trading_rules_status_idx', columns: ['status', 'created_at'] }],
    checks: [
      "status <> 'active' OR activation_approval_id IS NOT NULL",
      "status <> 'active' OR activated_at IS NOT NULL",
    ],
  },
  {
    table: 'rule_evaluations',
    kind: 'persistent',
    description: 'Evidence attached to a proposal: deterministic metrics and their verdict.',
    columns: [
      pk(),
      {
        name: 'rule_id',
        type: 'uuid',
        nullable: false,
        references: fk('trading_rules', 'cascade'),
      },
      { name: 'method', type: 'text', nullable: false, maxLength: 120 },
      { name: 'metrics', type: 'json', nullable: false },
      { name: 'verdict', type: 'text', nullable: false, values: EVALUATION_VERDICTS },
      { name: 'sample_size', type: 'integer', nullable: false, min: 0 },
      { name: 'job_id', type: 'uuid', nullable: true, references: fk('jobs', 'set null') },
      createdAt(),
    ],
    indexes: [{ name: 'rule_evaluations_rule_idx', columns: ['rule_id', 'created_at'] }],
  },
  {
    table: 'approvals',
    kind: 'persistent',
    description:
      'Human approval requests and decisions. The database refuses self-approval and an approval with no decider.',
    columns: [
      pk(),
      { name: 'operation', type: 'text', nullable: false, maxLength: 120 },
      { name: 'subject_ref', type: 'text', nullable: false, maxLength: 256 },
      { name: 'requested_by', type: 'uuid', nullable: false, references: fk('users', 'restrict') },
      { name: 'decided_by', type: 'uuid', nullable: true, references: fk('users', 'restrict') },
      { name: 'status', type: 'text', nullable: false, values: APPROVAL_STATUSES },
      { name: 'rationale', type: 'text', nullable: false, maxLength: 4_000 },
      { name: 'evidence', type: 'json', nullable: false },
      { name: 'decision_note', type: 'text', nullable: true, maxLength: 2_000 },
      { name: 'decided_at', type: 'timestamp', nullable: true },
      { name: 'expires_at', type: 'timestamp', nullable: false },
      createdAt(),
    ],
    indexes: [
      { name: 'approvals_subject_idx', columns: ['operation', 'subject_ref', 'status'] },
      { name: 'approvals_status_idx', columns: ['status', 'created_at'] },
    ],
    checks: [
      "status <> 'approved' OR decided_by IS NOT NULL",
      "status <> 'approved' OR decided_at IS NOT NULL",
      'decided_by IS NULL OR decided_by <> requested_by',
      "status = 'pending' OR decided_by IS NOT NULL OR status = 'expired'",
    ],
  },
  {
    table: 'audit_records',
    kind: 'persistent',
    description:
      'Append-only audit trail: correlation id, actor, event, payload. No update or delete path exists.',
    columns: [
      pk(),
      { name: 'correlation_id', type: 'text', nullable: false, maxLength: 128 },
      {
        name: 'actor_id',
        type: 'text',
        nullable: true,
        maxLength: 120,
        note: 'user id, "system" or null',
      },
      { name: 'event', type: 'text', nullable: false, maxLength: 120 },
      { name: 'severity', type: 'text', nullable: false, values: ['info', 'warning', 'critical'] },
      { name: 'payload', type: 'json', nullable: false },
      { name: 'recorded_at', type: 'timestamp', nullable: false },
    ],
    indexes: [
      { name: 'audit_records_correlation_idx', columns: ['correlation_id'] },
      { name: 'audit_records_recorded_idx', columns: ['recorded_at'] },
      { name: 'audit_records_event_idx', columns: ['event', 'recorded_at'] },
    ],
  },
  {
    table: 'files',
    kind: 'persistent',
    description: 'File metadata; bytes live in managed storage keyed by content hash.',
    columns: [
      pk(),
      { name: 'owner_id', type: 'uuid', nullable: false, references: fk('users', 'cascade') },
      {
        name: 'category',
        type: 'text',
        nullable: false,
        values: ['document', 'dataset', 'chart-image', 'report-export', 'attachment'],
      },
      { name: 'filename', type: 'text', nullable: false, maxLength: 255 },
      { name: 'mime_type', type: 'text', nullable: false, maxLength: 120 },
      { name: 'size_bytes', type: 'integer', nullable: false, min: 1 },
      { name: 'sha256', type: 'text', nullable: false, maxLength: 64 },
      { name: 'sensitivity', type: 'text', nullable: false, values: ['normal', 'sensitive'] },
      { name: 'provenance_ref', type: 'text', nullable: true, maxLength: 256 },
      createdAt(),
    ],
    indexes: [
      { name: 'files_owner_idx', columns: ['owner_id', 'created_at'] },
      { name: 'files_sha256_idx', columns: ['sha256'] },
    ],
  },
  {
    table: 'jobs',
    kind: 'persistent',
    description:
      'Job history with idempotency key, attempts, lease and last error. The queue is this table.',
    columns: [
      pk(),
      { name: 'kind', type: 'text', nullable: false, maxLength: 120 },
      { name: 'status', type: 'text', nullable: false, values: JOB_STATUSES },
      { name: 'idempotency_key', type: 'text', nullable: false, unique: true, maxLength: 200 },
      { name: 'payload', type: 'json', nullable: false },
      { name: 'result', type: 'json', nullable: true },
      { name: 'attempts', type: 'integer', nullable: false, min: 0 },
      { name: 'max_attempts', type: 'integer', nullable: false, min: 1 },
      { name: 'priority', type: 'integer', nullable: false, min: 0, max: 9 },
      { name: 'available_at', type: 'timestamp', nullable: false },
      { name: 'lease_until', type: 'timestamp', nullable: true },
      { name: 'correlation_id', type: 'text', nullable: true, maxLength: 128 },
      { name: 'error', type: 'text', nullable: true, maxLength: 2_000 },
      createdAt(),
      updatedAt(),
    ],
    indexes: [
      { name: 'jobs_status_available_idx', columns: ['status', 'available_at', 'priority'] },
      { name: 'jobs_lease_idx', columns: ['status', 'lease_until'] },
      { name: 'jobs_kind_idx', columns: ['kind', 'created_at'] },
    ],
    checks: ["status <> 'running' OR lease_until IS NOT NULL"],
  },
  {
    table: 'market_data_bars',
    kind: 'persistent',
    description:
      'Normalized bars. Provenance is mandatory, so synthetic never masquerades as real.',
    columns: [
      pk(),
      { name: 'symbol', type: 'text', nullable: false, maxLength: 32 },
      { name: 'timeframe', type: 'text', nullable: false, maxLength: 16 },
      { name: 'provenance', type: 'text', nullable: false, values: DATA_PROVENANCE_VALUES },
      { name: 'source', type: 'text', nullable: false, maxLength: 120 },
      { name: 'time', type: 'timestamp', nullable: false },
      { name: 'open', type: 'real', nullable: false },
      { name: 'high', type: 'real', nullable: false },
      { name: 'low', type: 'real', nullable: false },
      { name: 'close', type: 'real', nullable: false },
      { name: 'volume', type: 'real', nullable: false, min: 0 },
    ],
    indexes: [
      {
        name: 'market_data_bars_unique_idx',
        columns: ['symbol', 'timeframe', 'provenance', 'source', 'time'],
        unique: true,
      },
      { name: 'market_data_bars_symbol_time_idx', columns: ['symbol', 'timeframe', 'time'] },
    ],
    checks: ['high >= low', 'high >= open', 'high >= close', 'low <= open', 'low <= close'],
  },
  {
    table: 'job_scratch',
    kind: 'transient',
    description: 'Job intermediate state with a TTL; never backed up, safe to delete.',
    columns: [
      pk(),
      { name: 'job_id', type: 'uuid', nullable: false, references: fk('jobs', 'cascade') },
      { name: 'payload', type: 'json', nullable: false },
      { name: 'expires_at', type: 'timestamp', nullable: false },
    ],
    indexes: [{ name: 'job_scratch_expires_idx', columns: ['expires_at'] }],
  },
  {
    table: 'trading_context_versions',
    kind: 'persistent',
    description:
      'Append-only history of the user-declared Trading Context. One row per version; the current context is the highest version for a user, so there is no second copy to drift. Columns carry identity, ordering and attribution only — the document itself is one JSON value validated by the shared Zod schema, because a column per field would duplicate the model and allow a half-written context.',
    columns: [
      pk(),
      {
        name: 'user_id',
        type: 'uuid',
        nullable: false,
        references: fk('users', 'cascade'),
      },
      { name: 'version', type: 'integer', nullable: false, min: 1 },
      {
        name: 'context',
        type: 'json',
        nullable: false,
        note: 'A TradingContext document: every declared field with its source and observation time.',
      },
      {
        name: 'changed_by',
        type: 'text',
        nullable: false,
        maxLength: 120,
        note: 'user id or "system"; who caused this version',
      },
      createdAt(),
    ],
    indexes: [
      {
        name: 'trading_context_versions_user_version_idx',
        columns: ['user_id', 'version'],
        unique: true,
      },
    ],
  },
];

/**
 * The tables migration `0001_initial` created.
 *
 * **Frozen on purpose.** `0001_initial` is generated from `SCHEMA`, so the moment a
 * table is added to the schema its generated statements change — and the runner
 * (`runner.ts`) refuses to run against a database whose recorded checksum no longer
 * matches, which is how "never edit an applied migration" became enforceable rather
 * than aspirational. This list pins what 0001 emits; a new table is a **new**
 * migration built from `schemaSubset([...])`.
 *
 * `assertMigrationCoverage()` in `./migrations/index.js` asserts that the union of
 * every migration's declared tables is exactly this set plus the later ones, so a
 * declaration cannot exist without appearing in a migration.
 */
export const INITIAL_SCHEMA_TABLES: readonly TableName[] = [
  'users',
  'credentials',
  'sessions',
  'settings',
  'curricula',
  'lessons',
  'lesson_progress',
  'exams',
  'exam_attempts',
  'conversations',
  'messages',
  'memory_records',
  'memory_versions',
  'memory_embeddings',
  'trading_rules',
  'rule_evaluations',
  'approvals',
  'audit_records',
  'files',
  'jobs',
  'market_data_bars',
  'job_scratch',
];

/**
 * The declarations for a named set of tables, in schema order.
 *
 * Used by the migrations so each one emits exactly the tables it introduced. Order
 * is re-derived by `orderedEntities` at generation time, so a subset still emits its
 * tables parents-first.
 */
export function schemaSubset(
  tables: readonly TableName[],
  schema: readonly EntityDefinition[] = SCHEMA,
): EntityDefinition[] {
  const wanted = new Set(tables);
  return schema.filter((entity) => wanted.has(entity.table));
}

export const SCHEMA_BY_TABLE: Readonly<Record<TableName, EntityDefinition>> = Object.fromEntries(
  SCHEMA.map((entity) => [entity.table, entity]),
) as Record<TableName, EntityDefinition>;

export function entityFor(table: TableName): EntityDefinition {
  return SCHEMA_BY_TABLE[table];
}

export function tablesOfKind(kind: EntityKind): TableName[] {
  return SCHEMA.filter((entity) => entity.kind === kind).map((entity) => entity.table);
}

export function columnNames(table: TableName): string[] {
  return entityFor(table).columns.map((column) => column.name);
}

/** Words that must not appear as bare identifiers, in either dialect. */
export const RESERVED_WORDS: readonly string[] = [
  'select',
  'from',
  'where',
  'group',
  'order',
  'table',
  'index',
  'insert',
  'update',
  'delete',
  'join',
  'union',
  'check',
  'constraint',
  'primary',
  'foreign',
  'references',
  'default',
  'user',
  'transaction',
  'grant',
  'all',
  'and',
  'or',
  'not',
  'null',
  'case',
  'when',
  'then',
];

/** Column-name fragments that would make a column a credential store. */
export const FORBIDDEN_COLUMN_PATTERN =
  /(password(?!_hash)|passwd|plaintext|_secret$|api[_-]?key|private[_-]?key|token(?!_hash)|bearer|cookie)/i;

export interface SchemaIssue {
  table: TableName | '(schema)';
  problem: string;
}

/**
 * Structural validation of the declarations themselves. Runs at start-up and in
 * CI, because a broken declaration would otherwise surface as a failed migration
 * on a user's machine.
 */
export function validateSchema(schema: readonly EntityDefinition[] = SCHEMA): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  const seen = new Set<string>();
  const transient = new Set(
    schema.filter((entity) => entity.kind === 'transient').map((e) => e.table),
  );

  for (const entity of schema) {
    const table = entity.table;
    if (seen.has(table)) issues.push({ table, problem: 'duplicate table declaration' });
    seen.add(table);

    const columns = new Set(entity.columns.map((column) => column.name));
    const primaryKeys = entity.columns.filter((column) => column.primaryKey === true);
    if (primaryKeys.length !== 1) {
      issues.push({
        table,
        problem: `expected exactly one primary key, found ${primaryKeys.length}`,
      });
    }
    if (primaryKeys[0] && primaryKeys[0].nullable) {
      issues.push({ table, problem: 'the primary key must not be nullable' });
    }

    for (const column of entity.columns) {
      if (FORBIDDEN_COLUMN_PATTERN.test(column.name)) {
        issues.push({
          table,
          problem: `column "${column.name}" looks like a stored secret; only *_hash columns are allowed`,
        });
      }
      if (RESERVED_WORDS.includes(column.name)) {
        issues.push({ table, problem: `column "${column.name}" is a reserved word` });
      }
      if (column.values !== undefined && column.values.length === 0) {
        issues.push({ table, problem: `column "${column.name}" has an empty value list` });
      }
      if (column.min !== undefined && column.max !== undefined && column.min > column.max) {
        issues.push({ table, problem: `column "${column.name}" has min > max` });
      }
      if (column.nullable && column.primaryKey === true) {
        issues.push({ table, problem: `primary key "${column.name}" cannot be nullable` });
      }
      const target = column.references?.table;
      if (target !== undefined) {
        const targetEntity = schema.find((candidate) => candidate.table === target);
        if (!targetEntity) {
          issues.push({
            table,
            problem: `column "${column.name}" references unknown table "${target}"`,
          });
        } else {
          const targetColumn = column.references?.column ?? 'id';
          if (!targetEntity.columns.some((candidate) => candidate.name === targetColumn)) {
            issues.push({
              table,
              problem: `column "${column.name}" references ${target}.${targetColumn}, which does not exist`,
            });
          }
          if (entity.kind === 'persistent' && transient.has(target)) {
            issues.push({
              table,
              problem: `persistent table references transient table "${target}"`,
            });
          }
        }
      }
    }

    for (const index of entity.indexes ?? []) {
      for (const column of index.columns) {
        if (!columns.has(column)) {
          issues.push({ table, problem: `index ${index.name} uses unknown column "${column}"` });
        }
      }
    }
    for (const check of entity.checks ?? []) {
      const open = (check.match(/\(/g) ?? []).length;
      const close = (check.match(/\)/g) ?? []).length;
      if (open !== close) {
        issues.push({ table, problem: `check expression has unbalanced parentheses: ${check}` });
      }
      for (const referenced of check.matchAll(/"([a-z_]+)"/g)) {
        const column = referenced[1] ?? '';
        if (!columns.has(column)) {
          issues.push({ table, problem: `check references unknown column "${column}"` });
        }
      }
    }
  }

  return issues;
}

export function assertValidSchema(schema: readonly EntityDefinition[] = SCHEMA): void {
  const issues = validateSchema(schema);
  if (issues.length > 0) {
    throw new Error(
      `Invalid schema declaration: ${issues.map((issue) => `${issue.table}: ${issue.problem}`).join('; ')}`,
    );
  }
}
