/**
 * SQL executor port.
 *
 * This is the *only* thing repositories know about persistence: run parameterized
 * SQL written with `?` placeholders and get plain objects back. No repository
 * imports a driver, opens a connection, or knows whether SQLite or PostgreSQL is
 * underneath — that is what keeps business logic free of database coupling
 * (checked by `tests/database.test.ts`, which fails the build if a driver import
 * or a raw SQL literal appears outside `src/db`).
 *
 * The port is **promise-based** on purpose. SQLite's driver is synchronous and
 * PostgreSQL's is not; if the port were synchronous, production mode would need a
 * second set of repositories. Awaiting an already-resolved promise costs nothing
 * measurable, so one repository implementation serves both engines.
 *
 * Rows come back exactly as the engine returned them; `decodeRow()` turns that
 * into a typed object using the schema declarations, so a repository never
 * hand-writes column coercion and both engines agree on booleans and JSON.
 */

import { AppError } from '../core/errors.js';
import { decodeValue, encodeValue, type SqlDialect, type SqlValue } from './dialect.js';
import type { EntityDefinition, TableName } from './schema.js';

export type SqlRow = Record<string, unknown>;

export type SqlParams = readonly SqlValue[];

export interface SqlExecutor {
  readonly dialect: SqlDialect;
  /** Where this executor writes, for logs and health: never includes a secret. */
  readonly description: string;
  /** True when the engine can run DDL inside a transaction. */
  readonly transactionalDdl: boolean;
  /**
   * Run a statement that returns no rows. The change count is returned so a
   * conditional UPDATE can be used as an atomic claim (`changes === 1` means this
   * caller won the row) without depending on `RETURNING`, which is newer on
   * SQLite than the rest of the SQL we emit.
   */
  execute(sql: string, params?: SqlParams): Promise<{ changes: number }>;
  queryAll(sql: string, params?: SqlParams): Promise<SqlRow[]>;
  queryOne(sql: string, params?: SqlParams): Promise<SqlRow | null>;
  /** All-or-nothing block; the callback receives an executor bound to the tx. */
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Decode one row into the declared shape of its entity. */
export function decodeRow<T extends object>(entity: EntityDefinition, row: SqlRow): T {
  const out: Record<string, unknown> = {};
  for (const column of entity.columns) {
    if (!(column.name in row)) continue;
    out[column.name] = decodeValue(column, row[column.name]);
  }
  return out as T;
}

export function decodeRows<T extends object>(
  entity: EntityDefinition,
  rows: readonly SqlRow[],
): T[] {
  return rows.map((row) => decodeRow<T>(entity, row));
}

/** Encode a patch object into positional parameters, skipping absent fields. */
export function encodeValues(
  entity: EntityDefinition,
  values: Record<string, unknown>,
): { columns: string[]; params: SqlValue[] } {
  const columns: string[] = [];
  const params: SqlValue[] = [];
  for (const column of entity.columns) {
    if (!(column.name in values)) continue;
    const value = values[column.name];
    if (value === undefined) continue;
    columns.push(column.name);
    params.push(encodeValue(column, value));
  }
  return { columns, params };
}

/** Column names a caller may not write directly. */
export const IMMUTABLE_COLUMNS: readonly string[] = ['id'];

/**
 * Fail fast, and in our own words, when a write would violate NOT NULL. The
 * database would reject it anyway; doing it here produces an error the caller can
 * act on instead of a driver string.
 */
export function assertRequiredColumns(
  entity: EntityDefinition,
  values: Record<string, unknown>,
  context: { table: TableName } = { table: entity.table },
): void {
  const missing = entity.columns
    .filter(
      (column) =>
        !column.nullable && column.primaryKey !== true && values[column.name] === undefined,
    )
    .map((column) => column.name);
  if (missing.length > 0) {
    throw new AppError(
      'VALIDATION_FAILED',
      `${context.table}: missing required column(s): ${missing.join(', ')}`,
      { details: { table: context.table, missing } },
    );
  }
}

/** Numeric column without a value must not be stored as NaN. */
export function assertFiniteNumbers(
  entity: EntityDefinition,
  values: Record<string, unknown>,
): void {
  for (const column of entity.columns) {
    const value = values[column.name];
    if (value === undefined || value === null) continue;
    if ((column.type === 'integer' || column.type === 'real') && typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new AppError(
          'VALIDATION_FAILED',
          `${entity.table}.${column.name} must be a finite number`,
        );
      }
    }
  }
}
