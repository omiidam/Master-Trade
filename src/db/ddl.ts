/**
 * DDL generation.
 *
 * The schema declarations in `schema.ts` are the only definition of the shape;
 * this module turns them into `CREATE TABLE` / `CREATE INDEX` / `DROP` statements
 * for a given dialect. Two properties follow, and both are tested:
 *
 *   1. A table cannot exist without a declaration, and a declaration cannot exist
 *      without appearing in the migration (the initial migration is generated).
 *   2. The two engines receive the same logical schema — the *only* differences
 *      are the ones `SqlDialect` owns (storage types, boolean literals).
 *
 * Tables are emitted in dependency order. SQLite tolerates a forward reference,
 * PostgreSQL does not, so ordering here is what makes one migration valid on
 * both engines. Drops are emitted in the reverse order, children first.
 */

import type { EntityDefinition, TableName } from './schema.js';
import { SCHEMA } from './schema.js';
import type { SqlDialect } from './dialect.js';

/** Depth-first topological sort, stable with respect to declaration order. */
export function orderedEntities(schema: readonly EntityDefinition[] = SCHEMA): EntityDefinition[] {
  const byTable = new Map<TableName, EntityDefinition>(
    schema.map((entity) => [entity.table, entity]),
  );
  const ordered: EntityDefinition[] = [];
  const visited = new Set<TableName>();
  const visiting = new Set<TableName>();

  const visit = (table: TableName, chain: TableName[]): void => {
    if (visited.has(table)) return;
    if (visiting.has(table)) {
      // A cycle would need a deferred constraint to create; refuse instead of
      // emitting DDL that only works on one engine.
      throw new Error(`Circular foreign-key dependency: ${[...chain, table].join(' -> ')}`);
    }
    const entity = byTable.get(table);
    if (!entity) return;
    visiting.add(table);
    for (const column of entity.columns) {
      const target = column.references?.table;
      if (target !== undefined) visit(target, [...chain, table]);
    }
    visiting.delete(table);
    visited.add(table);
    ordered.push(entity);
  };

  for (const entity of schema) visit(entity.table, []);
  return ordered;
}

function columnDefinition(
  dialect: SqlDialect,
  column: EntityDefinition['columns'][number],
): string {
  const parts: string[] = [dialect.quote(column.name), dialect.typeFor(column.type)];
  if (column.primaryKey === true) parts.push('PRIMARY KEY');
  if (column.nullable === false) parts.push('NOT NULL');
  if (column.unique === true && column.primaryKey !== true) parts.push('UNIQUE');

  const reference = column.references;
  if (reference) {
    const target = reference.column ?? 'id';
    parts.push(
      `REFERENCES ${dialect.quote(reference.table)} (${dialect.quote(target)})`,
      `ON DELETE ${(reference.onDelete ?? 'restrict').toUpperCase()}`,
    );
  }

  if (column.values !== undefined && column.values.length > 0) {
    parts.push(
      `CHECK (${dialect.quote(column.name)} IN (${column.values.map(sqlLiteral).join(', ')}))`,
    );
  }
  if (column.min !== undefined) {
    parts.push(`CHECK (${dialect.quote(column.name)} >= ${column.min})`);
  }
  if (column.max !== undefined) {
    parts.push(`CHECK (${dialect.quote(column.name)} <= ${column.max})`);
  }
  if (column.maxLength !== undefined) {
    parts.push(`CHECK (length(${dialect.quote(column.name)}) <= ${column.maxLength})`);
  }
  return parts.join(' ');
}

/** Single-quote a literal for generated DDL. Values come from our own schema. */
function sqlLiteral(value: string | number): string {
  if (typeof value === 'number') return String(value);
  return `'${value.replace(/'/g, "''")}'`;
}

export function createTableSql(entity: EntityDefinition, dialect: SqlDialect): string {
  const lines = entity.columns.map((column) => `  ${columnDefinition(dialect, column)}`);
  (entity.checks ?? []).forEach((check, index) => {
    lines.push(
      `  CONSTRAINT ${dialect.quote(`${entity.table}_check_${index + 1}`)} CHECK (${check})`,
    );
  });
  return `CREATE TABLE ${dialect.quote(entity.table)} (\n${lines.join(',\n')}\n)`;
}

export function createIndexesSql(entity: EntityDefinition, dialect: SqlDialect): string[] {
  return (entity.indexes ?? []).map((index) => {
    const unique = index.unique === true ? 'UNIQUE ' : '';
    const columns = index.columns.map((column) => dialect.quote(column)).join(', ');
    return `CREATE ${unique}INDEX ${dialect.quote(index.name)} ON ${dialect.quote(entity.table)} (${columns})`;
  });
}

/** Full schema creation: dependency-ordered tables, then their indexes. */
export function createSchemaSql(
  dialect: SqlDialect,
  schema: readonly EntityDefinition[] = SCHEMA,
): string[] {
  const ordered = orderedEntities(schema);
  const statements: string[] = ordered.map((entity) => createTableSql(entity, dialect));
  for (const entity of ordered) statements.push(...createIndexesSql(entity, dialect));
  return statements;
}

/** Reverse of `createSchemaSql`, children before parents. */
export function dropSchemaSql(
  dialect: SqlDialect,
  schema: readonly EntityDefinition[] = SCHEMA,
): string[] {
  return [...orderedEntities(schema)]
    .reverse()
    .map((entity) => `DROP TABLE IF EXISTS ${dialect.quote(entity.table)}`);
}

export function tablesInCreationOrder(schema: readonly EntityDefinition[] = SCHEMA): TableName[] {
  return orderedEntities(schema).map((entity) => entity.table);
}
