/**
 * Table toolkit — the shared CRUD surface behind every repository.
 *
 * Repositories are written in terms of `Table<T>` (typed rows, no SQL) or, for a
 * query that genuinely needs SQL (joins, aggregates, atomic claims), in terms of
 * `db.queryAll()` plus `decodeRows()`. Both paths write `?` placeholders, so the
 * same repository runs on SQLite and PostgreSQL.
 *
 * Why a toolkit instead of an ORM: the schema is already the single source of
 * truth, and the interesting queries here (migration ledger, trust promotion with
 * its guard, atomic job claim, append-only audit) are deliberately explicit. An
 * ORM would add a dependency, a second schema, and would still leave those
 * queries hand-written — just harder to see.
 *
 * Every identifier is quoted through the dialect, so a column named `key`,
 * `value` or `status` cannot collide with a keyword on either engine.
 */

import { AppError } from '../../packages/shared/src/core/errors.js';
import type { SqlDialect, SqlValue } from './dialect.js';
import type { EntityDefinition, TableName } from './schema.js';
import { entityFor } from './schema.js';
import {
  assertFiniteNumbers,
  assertRequiredColumns,
  decodeRow,
  encodeValues,
  type SqlExecutor,
  type SqlParams,
  type SqlRow,
} from './executor.js';

export interface FindOptions<T> {
  orderBy?: keyof T & string;
  direction?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export class Table<T extends { id: string }> {
  readonly entity: EntityDefinition;
  readonly dialect: SqlDialect;
  private readonly db: SqlExecutor;

  constructor(db: SqlExecutor, table: TableName, entity: EntityDefinition = entityFor(table)) {
    this.db = db;
    this.entity = entity;
    this.dialect = db.dialect;
  }

  private get name(): string {
    return this.dialect.quote(this.entity.table);
  }

  private quote(column: string): string {
    const known = this.entity.columns.find((candidate) => candidate.name === column);
    if (!known) {
      throw new AppError('VALIDATION_FAILED', `Unknown column ${column} on ${this.entity.table}`);
    }
    return this.dialect.quote(known.name);
  }

  private encodeOne(column: string, value: unknown): SqlValue {
    const definition = this.entity.columns.find((candidate) => candidate.name === column);
    if (!definition) {
      throw new AppError('VALIDATION_FAILED', `Unknown column ${column} on ${this.entity.table}`);
    }
    return encodeValues(this.entity, { [column]: value }).params[0] ?? null;
  }

  private whereClause(where: Partial<T> = {}): { sql: string; params: SqlValue[] } {
    const parts: string[] = [];
    const params: SqlValue[] = [];
    for (const column of this.entity.columns) {
      const value = (where as Record<string, unknown>)[column.name];
      if (value === undefined) continue;
      if (value === null) {
        parts.push(`${this.quote(column.name)} IS NULL`);
        continue;
      }
      parts.push(`${this.quote(column.name)} = ?`);
      params.push(this.encodeOne(column.name, value));
    }
    return { sql: parts.length === 0 ? '' : ` WHERE ${parts.join(' AND ')}`, params };
  }

  private orderClause(options: FindOptions<T> = {}): string {
    if (!options.orderBy) return '';
    const direction = options.direction === 'desc' ? 'DESC' : 'ASC';
    return ` ORDER BY ${this.quote(options.orderBy)} ${direction}`;
  }

  private pageClause(options: FindOptions<T> = {}): string {
    return this.dialect.limitClause(options.limit ?? 500, options.offset ?? 0);
  }

  async insert(values: T): Promise<T> {
    assertRequiredColumns(this.entity, values as Record<string, unknown>);
    assertFiniteNumbers(this.entity, values as Record<string, unknown>);
    const { columns, params } = encodeValues(this.entity, values as Record<string, unknown>);
    await this.db.execute(
      `INSERT INTO ${this.name} (${columns.map((column) => this.quote(column)).join(', ')}) VALUES (${columns
        .map(() => '?')
        .join(', ')})`,
      params,
    );
    const inserted = await this.findById(values.id);
    if (!inserted)
      throw new AppError('INTERNAL', `Insert into ${this.entity.table} did not persist`);
    return inserted;
  }

  /** Insert, or update the listed columns when the conflict target already exists. */
  async upsert(
    values: T,
    options: {
      conflictColumns: readonly (keyof T & string)[];
      updateColumns?: readonly (keyof T & string)[];
    },
  ): Promise<T> {
    assertRequiredColumns(this.entity, values as Record<string, unknown>);
    assertFiniteNumbers(this.entity, values as Record<string, unknown>);
    const { columns, params } = encodeValues(this.entity, values as Record<string, unknown>);
    const conflict = options.conflictColumns.map((column) => this.quote(column)).join(', ');
    const updateColumns = (options.updateColumns ?? options.conflictColumns).filter(
      (column) => column !== 'id',
    );
    const update =
      updateColumns.length === 0
        ? 'DO NOTHING'
        : `DO UPDATE SET ${updateColumns
            .map((column) => `${this.quote(column)} = excluded.${this.quote(column)}`)
            .join(', ')}`;
    await this.db.execute(
      `INSERT INTO ${this.name} (${columns.map((column) => this.quote(column)).join(', ')}) VALUES (${columns
        .map(() => '?')
        .join(', ')}) ON CONFLICT (${conflict}) ${update}`,
      params,
    );
    const row = await this.findById(values.id);
    if (!row) throw new AppError('INTERNAL', `Upsert into ${this.entity.table} did not persist`);
    return row;
  }

  /**
   * Insert only when absent. Returns `null` when an existing row won — including
   * when the conflict was on a different unique column than the id, in which case
   * the caller looks it up by the column it cares about (the job queue does this
   * with `idempotency_key`).
   */
  async insertIfAbsent(values: T): Promise<T | null> {
    assertRequiredColumns(this.entity, values as Record<string, unknown>);
    assertFiniteNumbers(this.entity, values as Record<string, unknown>);
    const { columns, params } = encodeValues(this.entity, values as Record<string, unknown>);
    await this.db.execute(
      `INSERT INTO ${this.name} (${columns.map((column) => this.quote(column)).join(', ')}) VALUES (${columns
        .map(() => '?')
        .join(', ')}) ON CONFLICT DO NOTHING`,
      params,
    );
    return this.findById(values.id);
  }

  async findById(id: string): Promise<T | null> {
    const row = await this.db.queryOne(`SELECT * FROM ${this.name} WHERE ${this.quote('id')} = ?`, [
      id,
    ]);
    return row ? decodeRow<T>(this.entity, row) : null;
  }

  async findOne(where: Partial<T>): Promise<T | null> {
    const clause = this.whereClause(where);
    const row = await this.db.queryOne(
      `SELECT * FROM ${this.name}${clause.sql} LIMIT 1`,
      clause.params,
    );
    return row ? decodeRow<T>(this.entity, row) : null;
  }

  async findMany(where: Partial<T> = {}, options: FindOptions<T> = {}): Promise<T[]> {
    const clause = this.whereClause(where);
    const sql = `SELECT * FROM ${this.name}${clause.sql}${this.orderClause(options)}${this.pageClause(options)}`;
    const rows = await this.db.queryAll(sql, clause.params);
    return rows.map((row) => decodeRow<T>(this.entity, row));
  }

  async count(where: Partial<T> = {}): Promise<number> {
    const clause = this.whereClause(where);
    const row = await this.db.queryOne(
      `SELECT COUNT(*) AS total FROM ${this.name}${clause.sql}`,
      clause.params,
    );
    const total = row?.total;
    return typeof total === 'number' ? total : Number(total ?? 0);
  }

  /** Update by id. Returns the new row, or null when nothing matched. */
  async update(id: string, patch: Partial<T>): Promise<T | null> {
    const assignments: string[] = [];
    const params: SqlValue[] = [];
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'id' || value === undefined) continue;
      assignments.push(`${this.quote(key)} = ?`);
      params.push(this.encodeOne(key, value));
    }
    if (assignments.length === 0) return this.findById(id);
    params.push(id);
    await this.db.execute(
      `UPDATE ${this.name} SET ${assignments.join(', ')} WHERE ${this.quote('id')} = ?`,
      params,
    );
    return this.findById(id);
  }

  /** Update every row matching `where`; returns how many rows matched. */
  async updateMany(where: Partial<T>, patch: Partial<T>): Promise<number> {
    const assignments: string[] = [];
    const params: SqlValue[] = [];
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'id' || value === undefined) continue;
      assignments.push(`${this.quote(key)} = ?`);
      params.push(this.encodeOne(key, value));
    }
    if (assignments.length === 0) return 0;
    const clause = this.whereClause(where);
    const matched = await this.count(where);
    await this.db.execute(`UPDATE ${this.name} SET ${assignments.join(', ')}${clause.sql}`, [
      ...params,
      ...clause.params,
    ]);
    return matched;
  }

  async deleteById(id: string): Promise<boolean> {
    const existing = await this.findById(id);
    if (!existing) return false;
    await this.db.execute(`DELETE FROM ${this.name} WHERE ${this.quote('id')} = ?`, [id]);
    return true;
  }

  /** Escape hatch for aggregates and joins; callers decode with `decodeRows`. */
  query(sql: string, params: SqlParams = []): Promise<SqlRow[]> {
    return this.db.queryAll(sql, params);
  }

  queryRow(sql: string, params: SqlParams = []): Promise<SqlRow | null> {
    return this.db.queryOne(sql, params);
  }
}

export function table<T extends { id: string }>(db: SqlExecutor, name: TableName): Table<T> {
  return new Table<T>(db, name);
}
