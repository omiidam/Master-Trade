/**
 * SQLite executor — local mode.
 *
 * Driver: `node:sqlite`, the SQLite engine built into Node.js. ADR-0025
 * supersedes the earlier `better-sqlite3` choice for two concrete reasons: there
 * is no prebuilt binary for current Node ABIs (installing here fell back to
 * compiling against Visual Studio, which is not present), and a native module is
 * the one dependency that can break a desktop upgrade for reasons unrelated to
 * our code (risk R15). Switching back is a driver change behind this port, not a
 * rewrite: the repositories never see either driver.
 *
 * The module is loaded lazily, so a runtime without `node:sqlite` (Node < 22.5,
 * or a Node 22 build that still needs `--experimental-sqlite`) produces a typed
 * error and an honest health report instead of a crash at import time.
 *
 * Settings applied on open: WAL journaling, foreign keys enforced, a busy
 * timeout and NORMAL synchronous mode — the combination documented for a desktop
 * workload in docs/database-and-storage.md. Foreign keys matter more than usual
 * here: the governance checks in the schema depend on them being enforced.
 */

import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { AppError } from '../../packages/shared/src/core/errors.js';
import { DIALECTS, type SqlDialect, type SqlValue } from './dialect.js';
import type { SqlExecutor, SqlParams, SqlRow } from './executor.js';

/** The subset of `node:sqlite` this adapter uses. */
interface SqliteStatement {
  run(...params: SqlValue[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  all(...params: SqlValue[]): SqlRow[];
  get(...params: SqlValue[]): SqlRow | undefined;
}

interface SqliteDatabase {
  prepare(sql: string): SqliteStatement;
  exec(sql: string): void;
  close(): void;
}

interface SqliteModule {
  DatabaseSync: new (path: string) => SqliteDatabase;
}

/**
 * This package is ESM, so the built-in module is required through
 * `createRequire`. Loading it lazily is what keeps an unsupported runtime a
 * typed error instead of a crash on module load.
 */
const nodeRequire = createRequire(import.meta.url);

function loadSqliteModule(): SqliteModule {
  return nodeRequire('node:sqlite') as SqliteModule;
}

export interface SqliteDriverInfo {
  available: boolean;
  /** Why it is unavailable, when it is. */
  reason?: string;
  /** Remediation hint for the operator. */
  hint?: string;
}

/** Probe the runtime for a usable SQLite driver without throwing. */
export function sqliteDriverInfo(): SqliteDriverInfo {
  try {
    const loaded = loadSqliteModule();
    if (typeof loaded?.DatabaseSync !== 'function') {
      return { available: false, reason: 'node:sqlite did not expose DatabaseSync' };
    }
    return { available: true };
  } catch (error) {
    const code = (error as { code?: string }).code;
    return {
      available: false,
      reason:
        code === 'ERR_UNKNOWN_BUILTIN_MODULE'
          ? 'node:sqlite is not available in this Node build'
          : String(error),
      hint:
        'Local mode needs Node ≥ 22.5 with node:sqlite enabled (Node 23+ enables it by default). ' +
        'On Node 22 run with --experimental-sqlite, or use a newer Node.',
    };
  }
}

class SqliteExecutor implements SqlExecutor {
  readonly dialect: SqlDialect = DIALECTS.sqlite;
  readonly description: string;
  readonly transactionalDdl = true;
  private readonly db: SqliteDatabase;

  constructor(db: SqliteDatabase, description: string) {
    this.db = db;
    this.description = description;
    for (const pragma of this.dialect.connectionPragmas) {
      // `:memory:` cannot switch journal mode; that is expected, not an error.
      if (description === 'sqlite::memory:' && pragma.includes('journal_mode')) continue;
      this.db.exec(pragma);
    }
  }

  /** The driver is synchronous; the port is not. Awaiting a resolved value is free. */
  async execute(sql: string, params: SqlParams = []): Promise<{ changes: number }> {
    const result = this.db.prepare(this.dialect.prepare(sql)).run(...params);
    return { changes: Number(result.changes ?? 0) };
  }

  async queryAll(sql: string, params: SqlParams = []): Promise<SqlRow[]> {
    return this.db.prepare(this.dialect.prepare(sql)).all(...params);
  }

  async queryOne(sql: string, params: SqlParams = []): Promise<SqlRow | null> {
    return this.db.prepare(this.dialect.prepare(sql)).get(...params) ?? null;
  }

  /**
   * One transaction at a time, on the one connection there is.
   *
   * The driver is synchronous but the port is not, so a transaction yields at its `await`s
   * — and a second request's continuation can therefore run in the middle of it. Without
   * this queue, that second request opens its own transaction on the same connection and
   * the driver refuses it: `cannot start a transaction within a transaction`, which is a
   * 500 for one of two perfectly ordinary concurrent requests. Serialising is not a
   * limitation being papered over; it is the truth about a single-connection engine, and
   * the alternative — a second connection — would move the problem into `SQLITE_BUSY`
   * retries without making the arithmetic any safer.
   *
   * The queue never rejects: a transaction's failure is reported to *its* caller and must
   * not poison the next one.
   */
  private queue: Promise<void> = Promise.resolve();

  async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    const wait = this.queue;
    let open!: () => void;
    this.queue = new Promise<void>((resolve) => {
      open = resolve;
    });

    await wait;
    try {
      this.db.exec('BEGIN');
      try {
        const result = await fn(this);
        this.db.exec('COMMIT');
        return result;
      } catch (error) {
        try {
          this.db.exec('ROLLBACK');
        } catch {
          // A failed rollback must not mask the original failure.
        }
        throw error;
      }
    } finally {
      open();
    }
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

export interface OpenSqliteOptions {
  /** File path, or `:memory:` for tests. */
  file: string;
  /** Create missing parent directories (desktop app-data path). */
  createDirectories?: boolean;
}

export function openSqlite(options: OpenSqliteOptions): SqlExecutor {
  const info = sqliteDriverInfo();
  if (!info.available) {
    throw new AppError(
      'PROVIDER_UNAVAILABLE',
      `SQLite driver unavailable: ${info.reason ?? 'unknown'}`,
      { details: { hint: info.hint } },
    );
  }

  const file = options.file;
  if (file !== ':memory:' && options.createDirectories !== false) {
    mkdirSync(dirname(file), { recursive: true });
  }

  const { DatabaseSync } = loadSqliteModule();
  const db = new DatabaseSync(file);
  return new SqliteExecutor(db, file === ':memory:' ? 'sqlite::memory:' : `sqlite:${file}`);
}

/** Convenience for tests and CLI probes: an in-memory database. */
export function openInMemorySqlite(): SqlExecutor {
  return openSqlite({ file: ':memory:' });
}
