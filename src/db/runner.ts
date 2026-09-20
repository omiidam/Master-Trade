/**
 * Migration runner.
 *
 * The runner is deliberately strict, because the alternative is silent
 * divergence between a learner's six-month record and the code that reads it.
 * Before applying anything it checks three conditions and refuses on each:
 *
 *   - **drift**: a migration recorded as applied but no longer present in the
 *     code (this build is older than the database);
 *   - **tampering**: a recorded migration whose statements changed (checksum
 *     mismatch) — "never edit an applied migration", now enforced rather than
 *     requested;
 *   - **downgrade**: the database is at a version this build does not contain.
 *
 * Each migration is applied inside a transaction and recorded in
 * `schema_migrations` with a checksum of the statements run for *this* dialect.
 * The ledger table is created by the runner, not declared in the schema: it has
 * to exist in an empty database, before any migration.
 */

import { createHash } from 'node:crypto';
import { AppError } from '../../packages/shared/src/core/errors.js';
import type { SqlDialect } from './dialect.js';
import type { SqlExecutor } from './executor.js';
import { MIGRATIONS } from './migrations/index.js';
import {
  SCHEMA_MIGRATIONS_TABLE,
  latestVersion,
  type AppliedMigration,
  type Migration,
} from './migrations/types.js';

export interface MigrationPlan {
  applied: AppliedMigration[];
  pending: Migration[];
  /** Recorded migrations this build does not know about. */
  unknown: AppliedMigration[];
  /** Recorded migrations whose checksum no longer matches the code. */
  tampered: AppliedMigration[];
  databaseVersion: number;
  codeVersion: number;
  upToDate: boolean;
}

export interface MigrationReport extends MigrationPlan {
  /** Versions applied by this call. */
  appliedNow: number[];
}

export interface RunnerOptions {
  migrations?: readonly Migration[];
  now?: () => number;
}

export function checksumOf(dialect: SqlDialect, migration: Migration): string {
  const statements = migration.up(dialect);
  return createHash('sha256')
    .update(`${migration.id}\n${migration.version}\n${statements.join(';\n')}`)
    .digest('hex');
}

async function ensureLedger(db: SqlExecutor): Promise<void> {
  const dialect = db.dialect;
  await db.execute(
    `CREATE TABLE IF NOT EXISTS ${dialect.quote(SCHEMA_MIGRATIONS_TABLE)} (
  ${dialect.quote('version')} INTEGER PRIMARY KEY,
  ${dialect.quote('id')} TEXT NOT NULL UNIQUE,
  ${dialect.quote('checksum')} TEXT NOT NULL,
  ${dialect.quote('applied_at')} TEXT NOT NULL,
  ${dialect.quote('execution_ms')} INTEGER NOT NULL
)`,
  );
}

async function readLedger(db: SqlExecutor): Promise<AppliedMigration[]> {
  const dialect = db.dialect;
  const rows = await db.queryAll(
    `SELECT ${dialect.quote('version')} AS version, ${dialect.quote('id')} AS id, ${dialect.quote(
      'checksum',
    )} AS checksum, ${dialect.quote('applied_at')} AS applied_at, ${dialect.quote(
      'execution_ms',
    )} AS execution_ms FROM ${dialect.quote(SCHEMA_MIGRATIONS_TABLE)} ORDER BY ${dialect.quote('version')} ASC`,
  );
  return rows.map((row) => ({
    version: Number(row.version),
    id: String(row.id),
    checksum: String(row.checksum),
    appliedAt: String(row.applied_at),
    executionMs: Number(row.execution_ms ?? 0),
  }));
}

/**
 * Compare the database against the code without changing anything. `migrate()`
 * calls this first, so a refusal is always preceded by a readable plan.
 */
export async function migrationPlan(
  db: SqlExecutor,
  options: RunnerOptions = {},
): Promise<MigrationPlan> {
  const migrations = options.migrations ?? MIGRATIONS;
  await ensureLedger(db);
  const applied = await readLedger(db);
  const byVersion = new Map(migrations.map((migration) => [migration.version, migration]));

  const unknown = applied.filter((entry) => !byVersion.has(entry.version));
  const tampered = applied.filter((entry) => {
    const migration = byVersion.get(entry.version);
    if (!migration) return false;
    return checksumOf(db.dialect, migration) !== entry.checksum;
  });
  const appliedVersions = new Set(applied.map((entry) => entry.version));
  const pending = migrations.filter((migration) => !appliedVersions.has(migration.version));
  const databaseVersion = applied.reduce((max, entry) => Math.max(max, entry.version), 0);
  const codeVersion = latestVersion(migrations);

  return {
    applied,
    pending,
    unknown,
    tampered,
    databaseVersion,
    codeVersion,
    upToDate: pending.length === 0 && unknown.length === 0 && tampered.length === 0,
  };
}

function assertPlanIsSafe(plan: MigrationPlan): void {
  if (plan.tampered.length > 0) {
    throw new AppError(
      'CONFLICT',
      `Migration(s) changed after being applied: ${plan.tampered
        .map((entry) => entry.id)
        .join(', ')}. Add a new migration instead of editing an applied one.`,
      { details: { tampered: plan.tampered.map((entry) => entry.id) } },
    );
  }
  if (plan.unknown.length > 0) {
    throw new AppError(
      'CONFLICT',
      `The database contains migration(s) this build does not know: ${plan.unknown
        .map((entry) => entry.id)
        .join(', ')}. Refusing to run an older build against a newer database.`,
      { details: { unknown: plan.unknown.map((entry) => entry.id) } },
    );
  }
}

/** Apply every pending migration. Idempotent: a second call applies nothing. */
export async function migrate(
  db: SqlExecutor,
  options: RunnerOptions = {},
): Promise<MigrationReport> {
  const plan = await migrationPlan(db, options);
  assertPlanIsSafe(plan);

  const now = options.now ?? Date.now;
  const appliedNow: number[] = [];
  for (const migration of plan.pending) {
    const statements = migration.up(db.dialect);
    const checksum = checksumOf(db.dialect, migration);
    const startedAt = now();
    await db.transaction(async (tx) => {
      for (const statement of statements) await tx.execute(statement);
      await tx.execute(
        `INSERT INTO ${tx.dialect.quote(SCHEMA_MIGRATIONS_TABLE)} (${tx.dialect.quote(
          'version',
        )}, ${tx.dialect.quote('id')}, ${tx.dialect.quote('checksum')}, ${tx.dialect.quote(
          'applied_at',
        )}, ${tx.dialect.quote('execution_ms')}) VALUES (?, ?, ?, ?, ?)`,
        [
          migration.version,
          migration.id,
          checksum,
          new Date(now()).toISOString(),
          now() - startedAt,
        ],
      );
    });
    appliedNow.push(migration.version);
  }

  const after = await migrationPlan(db, options);
  return { ...after, appliedNow };
}

/** Human-readable status line, used by the CLI, logs and the health report. */
export function describeMigrationStatus(plan: MigrationPlan): string {
  if (plan.upToDate) {
    return `database at version ${plan.databaseVersion}/${plan.codeVersion}, up to date (${plan.applied
      .map((entry) => entry.id)
      .join(', ')})`;
  }
  return `database at version ${plan.databaseVersion}, code at ${plan.codeVersion}; pending: ${
    plan.pending.map((migration) => migration.id).join(', ') || 'none'
  }${plan.unknown.length > 0 ? `; unknown: ${plan.unknown.map((entry) => entry.id).join(', ')}` : ''}`;
}
