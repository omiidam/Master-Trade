/**
 * SQL dialect abstraction (ADR-0025).
 *
 * The database boundary has to satisfy two engines with one schema: SQLite for
 * the desktop (local mode) and PostgreSQL for a future hosted deployment
 * (production mode). Rather than maintain two schema definitions, the difference
 * is confined to this file:
 *
 * - **Types** differ (`boolean` is INTEGER 0/1 in SQLite, BOOLEAN in PostgreSQL;
 *   `json` is TEXT in SQLite, JSONB in PostgreSQL; `timestamp` is TEXT holding an
 *   ISO-8601 UTC string in SQLite, TIMESTAMPTZ in PostgreSQL).
 * - **Placeholders** differ (`?` vs `$1`). Repositories therefore always write
 *   `?` and the dialect rewrites them, so repository SQL has exactly one source.
 * - **Identifier quoting** is identical (`"…"`) but is applied centrally so a
 *   reserved word can never leak into a statement unquoted.
 *
 * Values, not just DDL, are normalized: `encodeValue`/`decodeValue` mean a
 * repository deals in `boolean` and `unknown` (parsed JSON), never in 1/0 or a
 * stringified object, regardless of which engine is underneath.
 *
 * Nothing here imports a driver: a dialect is pure data plus pure functions, so
 * both engines are fully testable without a server or a native module.
 */

import { AppError } from '../../packages/shared/src/core/errors.js';
import type { ColumnDef, ColumnType } from './schema.js';

export type DialectId = 'sqlite' | 'postgres';
export type SqlValue = string | number | null | Uint8Array;

export interface SqlDialect {
  readonly id: DialectId;
  /** Human-readable engine name for logs and health details. */
  readonly engine: string;
  /** Storage type for a declared column type. */
  typeFor(type: ColumnType): string;
  /** Statement the engine needs to make `LIMIT`/`ORDER BY`-style queries safe. */
  limitClause(limit: number, offset: number): string;
  /** Rewrite `?` placeholders into the engine's own form. */
  prepare(sql: string): string;
  /** Quote an identifier (table, column, index). */
  quote(identifier: string): string;
  /** How this engine spells a boolean literal inside generated SQL. */
  booleanLiteral(value: boolean): string;
  /** True when DDL may run inside a transaction (both engines allow it). */
  readonly transactionalDdl: boolean;
  /** Extra statements issued right after opening a connection. */
  readonly connectionPragmas: readonly string[];
  /** Whether `INSERT … ON CONFLICT DO NOTHING` is used instead of `OR IGNORE`. */
  readonly conflictSyntax: 'on-conflict' | 'sqlite-or';
}

const SQLITE_TYPES: Readonly<Record<ColumnType, string>> = {
  // Prefixed string ids, never native UUIDs: a UUID column would reject `usr_…`.
  uuid: 'TEXT',
  text: 'TEXT',
  integer: 'INTEGER',
  real: 'REAL',
  boolean: 'INTEGER',
  timestamp: 'TEXT',
  json: 'TEXT',
  'blob-ref': 'TEXT',
};

const POSTGRES_TYPES: Readonly<Record<ColumnType, string>> = {
  uuid: 'TEXT',
  text: 'TEXT',
  integer: 'INTEGER',
  real: 'DOUBLE PRECISION',
  boolean: 'BOOLEAN',
  timestamp: 'TIMESTAMPTZ',
  json: 'JSONB',
  'blob-ref': 'TEXT',
};

/**
 * Rewrite `?` into `$1…$n`, skipping anything inside single-quoted string
 * literals, double-quoted identifiers and `--` comments. The parser is
 * deliberately small and total: repository SQL is written by us, and this is the
 * only transformation applied to it.
 */
export function rewritePlaceholders(sql: string): string {
  let out = '';
  let index = 0;
  let position = 0;
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;

  while (index < sql.length) {
    const char = sql[index] as string;
    const next = sql[index + 1];

    if (inLineComment) {
      out += char;
      if (char === '\n') inLineComment = false;
      index += 1;
      continue;
    }
    if (inSingle) {
      out += char;
      if (char === "'") {
        if (next === "'") {
          out += "'";
          index += 2;
          continue;
        }
        inSingle = false;
      }
      index += 1;
      continue;
    }
    if (inDouble) {
      out += char;
      if (char === '"') {
        if (next === '"') {
          out += '"';
          index += 2;
          continue;
        }
        inDouble = false;
      }
      index += 1;
      continue;
    }

    if (char === '-' && next === '-') {
      inLineComment = true;
      out += '--';
      index += 2;
      continue;
    }
    if (char === "'") {
      inSingle = true;
      out += char;
      index += 1;
      continue;
    }
    if (char === '"') {
      inDouble = true;
      out += char;
      index += 1;
      continue;
    }
    if (char === '?') {
      position += 1;
      out += `$${position}`;
      index += 1;
      continue;
    }
    out += char;
    index += 1;
  }

  return out;
}

const sqliteDialect: SqlDialect = {
  id: 'sqlite',
  engine: 'SQLite',
  typeFor: (type) => SQLITE_TYPES[type],
  limitClause: (limit, offset) => ` LIMIT ${limit} OFFSET ${offset}`,
  // SQLite's own placeholder is `?`: nothing to rewrite.
  prepare: (sql) => sql,
  quote: (identifier) => `"${identifier.replace(/"/g, '""')}"`,
  booleanLiteral: (value) => (value ? '1' : '0'),
  transactionalDdl: true,
  connectionPragmas: [
    'PRAGMA journal_mode = WAL',
    'PRAGMA foreign_keys = ON',
    'PRAGMA busy_timeout = 5000',
    'PRAGMA synchronous = NORMAL',
  ],
  conflictSyntax: 'on-conflict',
};

const postgresDialect: SqlDialect = {
  id: 'postgres',
  engine: 'PostgreSQL',
  typeFor: (type) => POSTGRES_TYPES[type],
  limitClause: (limit, offset) => ` LIMIT ${limit} OFFSET ${offset}`,
  prepare: rewritePlaceholders,
  quote: (identifier) => `"${identifier.replace(/"/g, '""')}"`,
  booleanLiteral: (value) => (value ? 'TRUE' : 'FALSE'),
  transactionalDdl: true,
  // PostgreSQL's equivalent settings are server-level policy, not session
  // statements we should be issuing on connect.
  connectionPragmas: [],
  conflictSyntax: 'on-conflict',
};

export const DIALECTS: Readonly<Record<DialectId, SqlDialect>> = {
  sqlite: sqliteDialect,
  postgres: postgresDialect,
};

export function dialectFor(id: DialectId): SqlDialect {
  const dialect = DIALECTS[id];
  if (!dialect) throw new AppError('VALIDATION_FAILED', `Unknown SQL dialect: ${String(id)}`);
  return dialect;
}

/* ------------------------------------------------------------------ */
/* Value codecs                                                        */
/* ------------------------------------------------------------------ */

/** Convert a JavaScript value into what the engine stores. */
export function encodeValue(column: ColumnDef, value: unknown): SqlValue {
  if (value === null || value === undefined) return null;
  switch (column.type) {
    case 'boolean':
      return typeof value === 'boolean' ? (value ? 1 : 0) : (value as number);
    case 'json':
      return JSON.stringify(value);
    case 'integer':
    case 'real':
      return typeof value === 'number' ? value : Number(value);
    case 'timestamp':
      return value instanceof Date ? value.toISOString() : String(value);
    default:
      return String(value);
  }
}

/**
 * Convert a stored value back into the declared type. Tolerates both engine
 * shapes (1/true, `'{"a":1}'`/already-parsed object), so a repository is written
 * once and both adapters agree.
 */
/**
 * Make an engine timestamp string parseable: `T` separator, and an offset of
 * `+HH` padded to `+HH:MM` (JavaScript's parser rejects the short form).
 */
export function normalizeTimestampText(text: string): string {
  return text.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');
}

export function decodeValue(column: ColumnDef, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  switch (column.type) {
    case 'boolean':
      if (typeof value === 'boolean') return value;
      return value === 1 || value === '1' || value === 'true';
    case 'json':
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch {
          throw new AppError('INTERNAL', `Column ${column.name} holds invalid JSON`, {
            details: { column: column.name },
          });
        }
      }
      return value;
    case 'integer': {
      const asNumber = typeof value === 'number' ? value : Number(value);
      if (!Number.isInteger(asNumber)) {
        throw new AppError('INTERNAL', `Column ${column.name} holds a non-integer value`, {
          details: { column: column.name },
        });
      }
      return asNumber;
    }
    case 'real':
      return typeof value === 'number' ? value : Number(value);
    case 'timestamp': {
      if (value instanceof Date) return value.toISOString();
      // PostgreSQL TIMESTAMPTZ comes back as `2026-09-19 19:00:00+00` (space
      // separator, offset without minutes); SQLite returns the ISO string we
      // wrote. Normalize both to one ISO-8601 UTC format so a caller never has to
      // care which engine answered.
      const parsed = new Date(normalizeTimestampText(String(value)));
      return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
    }
    default:
      return typeof value === 'string' ? value : String(value);
  }
}
