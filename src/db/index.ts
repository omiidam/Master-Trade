/**
 * Database entry point.
 *
 * One function opens the database, applies the schema migrations and returns the
 * repositories bundle. Callers (the CLI today, the server and jobs next) receive
 * `{ db, repositories, plan }` and never a driver handle, which is what keeps the
 * dependency direction pointing at `src/db` rather than through it.
 *
 * Mode selection follows `AppConfig.database.engine` (SQLite in local mode).
 * PostgreSQL production mode is the same schema through a different dialect and
 * an injected client (`openPostgres`), so switching modes is a configuration
 * change plus a driver, not a code path.
 */

import { resolve } from 'node:path';
import type { AppConfig } from '../core/config.js';
import { AppError } from '../../packages/shared/src/core/errors.js';
import { MIGRATIONS } from './migrations/index.js';
import { validateMigrationRegistry } from './migrations/index.js';
import { assertDatabaseInvariants } from './ownership.js';
import {
  createRepositories,
  type Repositories,
  type RepositoryOptions,
} from './repositories/index.js';
import { describeMigrationStatus, migrate, migrationPlan, type MigrationReport } from './runner.js';
import { assertValidSchema } from './schema.js';
import type { SqlExecutor } from './executor.js';
import { openSqlite, sqliteDriverInfo } from './sqlite.js';

export interface OpenDatabaseOptions extends RepositoryOptions {
  config: AppConfig;
  /** Override the configured file (tests, CLI flags). */
  file?: string;
  /** Apply pending migrations on open. Default true. */
  autoMigrate?: boolean;
  /** In-memory database: tests only. */
  memory?: boolean;
}

export interface DatabaseHandle {
  db: SqlExecutor;
  repositories: Repositories;
  /** Result of the migration run, or the current plan when migration is skipped. */
  report: MigrationReport;
  describe(): string;
  close(): Promise<void>;
}

/**
 * Structural checks that must hold before opening anything: the declarations are
 * internally consistent, the ownership rules agree with them, and every migration
 * produces statements for every dialect.
 */
export function assertDatabaseFoundation(): void {
  assertValidSchema();
  assertDatabaseInvariants();
  validateMigrationRegistry(MIGRATIONS);
}

export async function openDatabase(options: OpenDatabaseOptions): Promise<DatabaseHandle> {
  assertDatabaseFoundation();

  const { config } = options;
  if (config.database.engine !== 'sqlite') {
    throw new AppError(
      'NOT_IMPLEMENTED',
      `Database engine "${config.database.engine}" is not wired yet; local mode uses SQLite and production mode takes an injected PostgreSQL client.`,
      { details: { engine: config.database.engine } },
    );
  }

  const file = options.memory === true ? ':memory:' : resolve(options.file ?? config.database.file);
  const db = openSqlite({ file });
  try {
    const report =
      options.autoMigrate === false
        ? { ...(await migrationPlan(db)), appliedNow: [] as number[] }
        : await migrate(db);
    const repositories = createRepositories(db, options);
    return {
      db,
      repositories,
      report,
      describe: () => `${db.description} (${describeMigrationStatus(report)})`,
      close: () => db.close(),
    };
  } catch (error) {
    await db.close();
    throw error;
  }
}

/** Report the configured database without opening it, for health and the CLI. */
export function databaseStatus(config: AppConfig): {
  engine: string;
  driverAvailable: boolean;
  detail: string;
  hint?: string;
} {
  const driver = sqliteDriverInfo();
  const detail = driver.available
    ? `${config.database.engine} at ${config.database.file}; ${MIGRATIONS.length} migration(s) declared for this build`
    : `SQLite driver unavailable: ${driver.reason ?? 'unknown'}`;
  return {
    engine: config.database.engine,
    driverAvailable: driver.available,
    detail,
    ...(driver.hint === undefined ? {} : { hint: driver.hint }),
  };
}

export { openSqlite, openInMemorySqlite, sqliteDriverInfo } from './sqlite.js';
export { openPostgres } from './postgres.js';
export type { PgQueryable, PgExecutorOptions } from './postgres.js';
export type { SqlExecutor, SqlRow, SqlParams } from './executor.js';
export { decodeRow, decodeRows, encodeValues } from './executor.js';
export { Table, table } from './table.js';
export { DIALECTS, dialectFor, rewritePlaceholders } from './dialect.js';
export type { DialectId, SqlDialect, SqlValue } from './dialect.js';
export { createSchemaSql, dropSchemaSql, orderedEntities, tablesInCreationOrder } from './ddl.js';
export {
  migrate,
  migrate as applyMigrations,
  migrationPlan,
  describeMigrationStatus,
  checksumOf,
} from './runner.js';
export type { MigrationPlan, MigrationReport } from './runner.js';
export {
  MIGRATIONS,
  assertMigrationCoverage,
  migrationById,
  validateMigrationRegistry,
  latestVersion,
} from './migrations/index.js';
export type { Migration, AppliedMigration } from './migrations/types.js';
export { SCHEMA_MIGRATIONS_TABLE } from './migrations/types.js';
export {
  SCHEMA,
  SCHEMA_BY_TABLE,
  INITIAL_SCHEMA_TABLES,
  schemaSubset,
  entityFor,
  tablesOfKind,
  columnNames,
  validateSchema,
  assertValidSchema,
  MEMORY_TRUST_LEVELS,
  HUMAN_VERIFIED_TRUST_LEVELS,
} from './schema.js';
export type { EntityDefinition, EntityKind, TableName, ColumnDef } from './schema.js';
export {
  OWNERSHIP,
  OWNERSHIP_BY_TABLE,
  ownershipFor,
  tablesForOwner,
  validateOwnership,
  assertDatabaseInvariants,
  describeOwnership,
} from './ownership.js';
export type { Owner, Mutability, Retention, TableOwnership } from './ownership.js';
export {
  createRepositories,
  repositoryCoverage,
  REPOSITORY_MODULES,
} from './repositories/index.js';
export type { Repositories } from './repositories/index.js';
