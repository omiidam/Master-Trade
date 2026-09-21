/**
 * Migration model.
 *
 * A migration is a *function of the dialect*, not a pile of SQL text: the same
 * migration produces SQLite statements and PostgreSQL statements from one
 * declaration, so the two engines cannot drift. The initial migration is
 * generated from `SCHEMA`, which means the schema and the migration are the same
 * artefact.
 *
 * Strategy (unchanged from Phase 2, now executable):
 *   1. versions increase strictly; ids are unique;
 *   2. forward-only in normal use — `down` exists for local development only and
 *      is never run automatically;
 *   3. each migration runs inside a transaction and is recorded in
 *      `schema_migrations` with a checksum of the statements actually run;
 *   4. a checksum mismatch, an unknown applied migration or a database newer than
 *      the code refuses to proceed instead of guessing.
 */

import type { SqlDialect } from '../dialect.js';
import type { TableName } from '../schema.js';

export interface Migration {
  id: string;
  version: number;
  description: string;
  /**
   * The tables this migration introduces.
   *
   * Declared rather than inferred, because the statements are generated: without it
   * nothing could tell a table that is created somewhere from a table that is
   * created nowhere. `assertMigrationCoverage()` asserts the union of these is
   * exactly the schema, so a declaration cannot exist that no migration creates.
   *
   * Optional so a test can build a throwaway migration; the registry check treats a
   * missing list as claiming no tables, which then fails coverage.
   */
  tables?: readonly TableName[];
  /** Statements to apply, in order. */
  up(dialect: SqlDialect): readonly string[];
  /** Local rollback only; never executed by the runner automatically. */
  down(dialect: SqlDialect): readonly string[];
}

export interface AppliedMigration {
  version: number;
  id: string;
  checksum: string;
  appliedAt: string;
  executionMs: number;
}

export const SCHEMA_MIGRATIONS_TABLE = 'schema_migrations';

export function validateMigrations(
  migrations: readonly Migration[],
  dialects: readonly SqlDialect[],
): void {
  const ids = new Set<string>();
  const versions = new Set<number>();
  let previous = 0;

  for (const migration of migrations) {
    if (ids.has(migration.id)) throw new Error(`Duplicate migration id: ${migration.id}`);
    if (versions.has(migration.version)) {
      throw new Error(`Duplicate migration version: ${migration.version}`);
    }
    if (migration.version <= previous) {
      throw new Error(`Migration versions must increase: ${migration.id}`);
    }
    if (!Number.isInteger(migration.version) || migration.version < 1) {
      throw new Error(`Migration ${migration.id} has an invalid version`);
    }
    if (migration.description.trim().length === 0) {
      throw new Error(`Migration ${migration.id} needs a description`);
    }
    for (const dialect of dialects) {
      const statements = migration.up(dialect);
      if (statements.length === 0) {
        throw new Error(`Migration ${migration.id} has no statements for ${dialect.id}`);
      }
      for (const statement of statements) {
        if (!statement.trim().endsWith(')') && !/;$/.test(statement.trim())) {
          throw new Error(
            `Migration ${migration.id} produced a suspicious statement for ${dialect.id}: ${statement.slice(0, 60)}`,
          );
        }
      }
    }
    ids.add(migration.id);
    versions.add(migration.version);
    previous = migration.version;
  }
}

export function latestVersion(migrations: readonly Migration[] = []): number {
  return migrations.reduce((max, migration) => Math.max(max, migration.version), 0);
}
