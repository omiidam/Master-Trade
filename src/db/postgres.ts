/**
 * PostgreSQL executor — production mode.
 *
 * Production mode is not a second implementation of the domain: the same schema
 * declarations, the same migrations and the same repositories run here. Only two
 * things differ, and both live in `dialect.ts`: storage types, and `?`
 * placeholders becoming `$1…$n`.
 *
 * The driver is **injected** (`PgQueryable`). That is deliberate for this phase:
 * `pg` is a dependency whose value is zero until a server exists, and the
 * production path stays verifiable without one — this executor is real code, and
 * the test suite drives it with a recording client that asserts the exact SQL and
 * parameters a PostgreSQL server would receive.
 *
 * Transactions use `BEGIN`/`COMMIT`/`ROLLBACK`. Nesting is refused rather than
 * silently flattened, so a future savepoint implementation has to be added where
 * it belongs instead of being emulated by accident. The connection itself is
 * owned by the caller: `close()` is a no-op, so a pooled client is never closed
 * behind a caller's back.
 */

import { AppError } from '../core/errors.js';
import { DIALECTS, type SqlDialect, type SqlValue } from './dialect.js';
import type { SqlExecutor, SqlParams, SqlRow } from './executor.js';

/** The slice of a PostgreSQL client this adapter needs. */
export interface PgQueryable {
  query(
    text: string,
    params?: readonly SqlValue[],
  ): Promise<{ rows: SqlRow[]; rowCount?: number | null }>;
}

export interface PgExecutorOptions {
  client: PgQueryable;
  /** For logs and health: host/database name, never a credential. */
  description: string;
}

class PostgresExecutor implements SqlExecutor {
  readonly dialect: SqlDialect = DIALECTS.postgres;
  readonly description: string;
  readonly transactionalDdl = true;
  private readonly client: PgQueryable;
  private inTransaction = false;

  constructor(options: PgExecutorOptions) {
    this.client = options.client;
    this.description = options.description;
  }

  async execute(sql: string, params: SqlParams = []): Promise<{ changes: number }> {
    const result = await this.client.query(this.dialect.prepare(sql), params);
    return { changes: Number(result.rowCount ?? 0) };
  }

  async queryAll(sql: string, params: SqlParams = []): Promise<SqlRow[]> {
    const result = await this.client.query(this.dialect.prepare(sql), params);
    return result.rows;
  }

  async queryOne(sql: string, params: SqlParams = []): Promise<SqlRow | null> {
    const rows = await this.queryAll(sql, params);
    return rows[0] ?? null;
  }

  async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    if (this.inTransaction) {
      throw new AppError(
        'INTERNAL',
        'Nested transactions are not supported on PostgreSQL; use a single level',
      );
    }
    this.inTransaction = true;
    await this.client.query('BEGIN');
    try {
      const result = await fn(this);
      await this.client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await this.client.query('ROLLBACK');
      } catch {
        // Keep the original failure visible.
      }
      throw error;
    } finally {
      this.inTransaction = false;
    }
  }

  async close(): Promise<void> {
    // The caller owns the connection (and the pool).
  }
}

export function openPostgres(options: PgExecutorOptions): SqlExecutor {
  if (!options.client || typeof options.client.query !== 'function') {
    throw new AppError(
      'VALIDATION_FAILED',
      'A PostgreSQL client with a query() method is required',
    );
  }
  return new PostgresExecutor(options);
}
