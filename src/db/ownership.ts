/**
 * Data ownership rules.
 *
 * Every table has exactly one **owner** (the bounded context allowed to write
 * it), a **mutability** policy, a **retention** rule and a **backup** class. This
 * is declared once, here, and enforced two ways:
 *
 *   - `validateOwnership()` fails the build if a table has no rule, if a rule
 *     names a table that does not exist, if a transient table claims to be backed
 *     up, or if an append-only table is declared mutable;
 *   - repositories are written per owner (`src/db/repositories/<owner>.ts`), so
 *     "who may write this" is visible in the file layout, and the test suite
 *     asserts that no repository touches a table it does not own.
 *
 * The rules that matter for trust in this product:
 *   - `audit_records` is **append-only**: no repository method updates or deletes
 *     it, and the table has no soft-delete column;
 *   - `memory_versions` is **append-only**: history is evidence, not scratch;
 *   - `approvals` is mutable only once (a decision), and the schema's CHECK
 *     constraints make self-approval and a decider-less approval unrepresentable;
 *   - credentials hold a **hash only**; nothing may store a plaintext secret, and
 *     `validateSchema()` rejects a column name that suggests one;
 *   - transient data (sessions, job scratch) is never backed up, never referenced
 *     by a persistent foreign key, and is deleted on a schedule.
 */

import { AppError } from '../../packages/shared/src/core/errors.js';
import { SCHEMA, type EntityDefinition, type TableName } from './schema.js';

/** Bounded context that owns a table. Matches the repository file name. */
export type Owner =
  | 'identity'
  | 'academy'
  | 'agent'
  | 'memory'
  | 'governance'
  | 'audit'
  | 'platform'
  | 'profile'
  | 'usage';

export type Mutability = 'append-only' | 'mutable' | 'versioned' | 'tombstone';

export type Retention =
  'forever' | 'ttl-sessions' | 'ttl-scratch' | 'rolling-365d' | 'by-user-request';

export type BackupClass = 'backed-up' | 'not-backed-up';

export interface TableOwnership {
  table: TableName;
  owner: Owner;
  /** What the owner is allowed to do with its own rows. */
  mutability: Mutability;
  retention: Retention;
  backup: BackupClass;
  /** Whether the table may contain personal data (drives export/delete duties). */
  personalData: boolean;
  /** One line a reviewer can check at a glance. */
  rule: string;
}

export const OWNERSHIP: readonly TableOwnership[] = [
  {
    table: 'users',
    owner: 'identity',
    mutability: 'mutable',
    retention: 'forever',
    backup: 'backed-up',
    personalData: true,
    rule: 'Only the identity repository writes accounts; deletion is a user-initiated action.',
  },
  {
    table: 'credentials',
    owner: 'identity',
    mutability: 'mutable',
    retention: 'forever',
    backup: 'backed-up',
    personalData: true,
    rule: 'Hash and parameters only. A plaintext secret is never written and cannot be read back.',
  },
  {
    table: 'sessions',
    owner: 'identity',
    mutability: 'mutable',
    retention: 'ttl-sessions',
    backup: 'not-backed-up',
    personalData: false,
    rule: 'Token hashes with an expiry; revoked on sign-out and purged by the cleanup job.',
  },
  {
    table: 'settings',
    owner: 'platform',
    mutability: 'mutable',
    retention: 'forever',
    backup: 'backed-up',
    personalData: true,
    rule: 'Non-secret preferences only; a CHECK constraint rejects a key that looks like a secret.',
  },
  {
    table: 'curricula',
    owner: 'academy',
    mutability: 'mutable',
    retention: 'forever',
    backup: 'backed-up',
    personalData: false,
    rule: 'Authored content; versioned by curriculum version, never overwritten in place.',
  },
  {
    table: 'lessons',
    owner: 'academy',
    mutability: 'mutable',
    retention: 'forever',
    backup: 'backed-up',
    personalData: false,
    rule: 'Authored content; a lesson rewrite is a new curriculum version, not a silent edit.',
  },
  {
    table: 'lesson_progress',
    owner: 'academy',
    mutability: 'mutable',
    retention: 'forever',
    backup: 'backed-up',
    personalData: true,
    rule: 'One row per user and lesson; completion and mastery are derived from exam evidence.',
  },
  {
    table: 'exams',
    owner: 'academy',
    mutability: 'mutable',
    retention: 'forever',
    backup: 'backed-up',
    personalData: false,
    rule: 'Definitions and rubric; an edit after publication invalidates comparability.',
  },
  {
    table: 'exam_attempts',
    owner: 'academy',
    mutability: 'append-only',
    retention: 'forever',
    backup: 'backed-up',
    personalData: true,
    rule: 'Every attempt is kept; longitudinal skill tracking is the point of the product.',
  },
  {
    table: 'conversations',
    owner: 'agent',
    mutability: 'mutable',
    retention: 'by-user-request',
    backup: 'backed-up',
    personalData: true,
    rule: 'Thread titles only; a user may delete a thread, which cascades to its messages.',
  },
  {
    table: 'messages',
    owner: 'agent',
    mutability: 'append-only',
    retention: 'by-user-request',
    backup: 'backed-up',
    personalData: true,
    rule: 'A turn is never rewritten. It carries its epistemic label, sources and instruction version so a past answer stays explainable.',
  },
  {
    table: 'memory_records',
    owner: 'memory',
    mutability: 'tombstone',
    retention: 'by-user-request',
    backup: 'backed-up',
    personalData: true,
    rule: 'The current state of a memory. Edits bump `version` and write history; deletion tombstones, never removes.',
  },
  {
    table: 'memory_versions',
    owner: 'memory',
    mutability: 'append-only',
    retention: 'forever',
    backup: 'backed-up',
    personalData: true,
    rule: 'Immutable edit history; the only way a memory claim can be audited or rolled back.',
  },
  {
    table: 'memory_embeddings',
    owner: 'memory',
    mutability: 'mutable',
    retention: 'forever',
    backup: 'backed-up',
    personalData: false,
    rule: 'Derived data, safe to recompute: a model migration replaces rows model by model.',
  },
  {
    table: 'trading_rules',
    owner: 'governance',
    mutability: 'mutable',
    retention: 'forever',
    backup: 'backed-up',
    personalData: false,
    rule: 'A rule may not become active without citing the approval that activated it (schema CHECK + repository guard).',
  },
  {
    table: 'rule_evaluations',
    owner: 'governance',
    mutability: 'append-only',
    retention: 'forever',
    backup: 'backed-up',
    personalData: false,
    rule: 'Evidence is never edited; a re-run appends a new evaluation with its own sample size.',
  },
  {
    table: 'approvals',
    owner: 'governance',
    mutability: 'mutable',
    retention: 'forever',
    backup: 'backed-up',
    personalData: true,
    rule: 'Written once as pending, then decided once. Self-approval is rejected in SQL, not only in code.',
  },
  {
    table: 'audit_records',
    owner: 'audit',
    mutability: 'append-only',
    retention: 'rolling-365d',
    backup: 'backed-up',
    personalData: true,
    rule: 'Append-only. No repository method updates or deletes a row; expiry is an explicit archival action, never an UPDATE.',
  },
  {
    table: 'files',
    owner: 'platform',
    mutability: 'mutable',
    retention: 'by-user-request',
    backup: 'backed-up',
    personalData: true,
    rule: 'Metadata only; bytes live in managed storage and are addressed by id, never by path.',
  },
  {
    table: 'jobs',
    owner: 'platform',
    mutability: 'mutable',
    retention: 'rolling-365d',
    backup: 'backed-up',
    personalData: false,
    rule: 'The queue and its history. A terminal job is never re-queued; a retry is a new attempt count.',
  },
  {
    table: 'market_data_bars',
    owner: 'platform',
    mutability: 'append-only',
    retention: 'forever',
    backup: 'backed-up',
    personalData: false,
    rule: 'Provenance is mandatory and immutable; a corrected bar is a new source, never an edit.',
  },
  {
    table: 'job_scratch',
    owner: 'platform',
    mutability: 'mutable',
    retention: 'ttl-scratch',
    backup: 'not-backed-up',
    personalData: false,
    rule: 'Intermediate payloads with an expiry; losing it costs a recomputation, nothing else.',
  },
  {
    table: 'subscriptions',
    owner: 'usage',
    mutability: 'mutable',
    retention: 'forever',
    backup: 'backed-up',
    personalData: true,
    rule: 'Which plan an account is on. Mutable, because a subscription is current state; every change is attributed, audited and must not be made by the account being changed. No payment reference may ever be stored here.',
  },
  {
    table: 'credit_accounts',
    owner: 'usage',
    mutability: 'mutable',
    retention: 'forever',
    backup: 'backed-up',
    personalData: false,
    rule: 'The current balance. Mutated only by a guarded UPDATE that refuses to cross zero, so overconsumption is unrepresentable; the ledger, not this row, is the record of how the balance was reached.',
  },
  {
    table: 'credit_ledger',
    owner: 'usage',
    mutability: 'append-only',
    retention: 'forever',
    backup: 'backed-up',
    personalData: false,
    rule: 'Append-only accounting record. A movement is never rewritten or deleted: a correction is another movement. Operation ids are derived, never chosen by a client, and the unique index is what makes a retry idempotent.',
  },
  {
    table: 'usage_events',
    owner: 'usage',
    mutability: 'mutable',
    retention: 'rolling-365d',
    backup: 'backed-up',
    personalData: false,
    rule: 'One row per metered attempt, including the refused ones that moved no credits. Mutable exactly once: `reserved` moves to `settled` or `released` via a guarded UPDATE whose WHERE clause names the only accepted prior state, so a double settlement is refused rather than silently applied. Rolling retention: usage history is a product surface, while the ledger keeps the accounting.',
  },
  {
    table: 'trading_context_versions',
    owner: 'profile',
    mutability: 'append-only',
    retention: 'by-user-request',
    backup: 'backed-up',
    personalData: true,
    rule: 'The user declares their own context; a new version is appended and no earlier version is ever rewritten, so the context an answer was given from stays recoverable.',
  },
];

export const OWNERSHIP_BY_TABLE: Readonly<Record<TableName, TableOwnership>> = Object.fromEntries(
  OWNERSHIP.map((entry) => [entry.table, entry]),
) as Record<TableName, TableOwnership>;

export function ownershipFor(table: TableName): TableOwnership {
  const entry = OWNERSHIP_BY_TABLE[table];
  if (!entry) {
    throw new AppError('INTERNAL', `No ownership rule for table ${table}`);
  }
  return entry;
}

export function tablesForOwner(owner: Owner): TableName[] {
  return OWNERSHIP.filter((entry) => entry.owner === owner).map((entry) => entry.table);
}

export interface OwnershipIssue {
  table: TableName | '(ownership)';
  problem: string;
}

/**
 * Cross-checks the ownership rules against the schema. Called at start-up
 * (through `assertDatabaseInvariants`) and in CI.
 */
export function validateOwnership(
  ownership: readonly TableOwnership[] = OWNERSHIP,
  schema: readonly EntityDefinition[] = SCHEMA,
): OwnershipIssue[] {
  const issues: OwnershipIssue[] = [];
  const declared = new Set(schema.map((entity) => entity.table));
  const seen = new Map<TableName, number>();

  for (const entry of ownership) {
    seen.set(entry.table, (seen.get(entry.table) ?? 0) + 1);
    if (!declared.has(entry.table)) {
      issues.push({
        table: entry.table,
        problem: 'ownership rule names a table that is not declared',
      });
    }
    if (entry.rule.trim().length < 20) {
      issues.push({ table: entry.table, problem: 'ownership rule must explain itself' });
    }
  }

  for (const entity of schema) {
    const count = seen.get(entity.table) ?? 0;
    if (count === 0) {
      issues.push({ table: entity.table, problem: 'table has no ownership rule' });
    } else if (count > 1) {
      issues.push({ table: entity.table, problem: 'table has more than one ownership rule' });
    }

    const rule = ownership.find((entry) => entry.table === entity.table);
    if (!rule) continue;

    if (entity.kind === 'transient' && rule.backup === 'backed-up') {
      issues.push({ table: entity.table, problem: 'transient data must not be in the backup set' });
    }
    if (entity.kind === 'transient' && rule.retention === 'forever') {
      issues.push({ table: entity.table, problem: 'transient data cannot have forever retention' });
    }
    if (entity.kind === 'persistent' && rule.backup === 'not-backed-up') {
      issues.push({
        table: entity.table,
        problem: 'persistent data must be backed up (or declared transient)',
      });
    }
    if (
      rule.mutability === 'append-only' &&
      entity.columns.some((column) => column.name === 'updated_at')
    ) {
      issues.push({
        table: entity.table,
        problem: 'an append-only table must not carry updated_at (it implies edits)',
      });
    }
    if (rule.owner === 'audit' && rule.mutability !== 'append-only') {
      issues.push({ table: entity.table, problem: 'the audit trail must be append-only' });
    }
  }

  return issues;
}

export interface DatabaseInvariants {
  applied: true;
}

/** Boot-time gate: schema declarations and ownership rules must agree. */
export function assertDatabaseInvariants(): DatabaseInvariants {
  const issues = validateOwnership();
  if (issues.length > 0) {
    throw new AppError(
      'INTERNAL',
      `Database invariants violated: ${issues
        .map((issue) => `${issue.table}: ${issue.problem}`)
        .join('; ')}`,
      { details: { issues } },
    );
  }
  return { applied: true };
}

/** Human-readable table of the rules, for docs and diagnostics. */
export function describeOwnership(): string {
  const width = Math.max(...OWNERSHIP.map((entry) => entry.table.length));
  return OWNERSHIP.map(
    (entry) =>
      `${entry.table.padEnd(width)}  ${entry.owner.padEnd(10)}  ${entry.mutability.padEnd(11)}  ${entry.retention.padEnd(
        16,
      )}  ${entry.backup}`,
  ).join('\n');
}
