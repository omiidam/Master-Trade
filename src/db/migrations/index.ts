/**
 * Migration registry.
 *
 * Order matters and is asserted at start-up: `validateMigrations` refuses
 * duplicate ids, duplicate or non-increasing versions, an empty `up`, and a
 * dialect that produces no statements. A migration is never edited after it has
 * been applied anywhere — a change is a new migration (the checksum guard in
 * `runner.ts` is what makes that enforceable rather than aspirational).
 *
 * Every migration declares the tables it introduces, and `assertMigrationCoverage`
 * asserts the union of those declarations is exactly the schema: a table cannot be
 * declared without a migration that creates it, and two migrations cannot both claim
 * it. That is the check the frozen `INITIAL_SCHEMA_TABLES` list makes possible.
 */

import { DIALECTS } from '../dialect.js';
import { SCHEMA, type TableName } from '../schema.js';
import { initialMigration } from './0001_initial.js';
import { tradingContextMigration } from './0002_trading_context.js';
import { usageAndSubscriptionMigration } from './0003_usage_and_subscription.js';
import { portfolioIntelligenceMigration } from './0004_portfolio_intelligence.js';
import { validateMigrations, type Migration } from './types.js';

export const MIGRATIONS: readonly Migration[] = [
  initialMigration,
  tradingContextMigration,
  usageAndSubscriptionMigration,
  portfolioIntelligenceMigration,
];

export function validateMigrationRegistry(migrations: readonly Migration[] = MIGRATIONS): void {
  validateMigrations(migrations, Object.values(DIALECTS));
  assertMigrationCoverage(migrations);
}

/**
 * Every declared table is created by exactly one migration, and no migration claims a
 * table that is not declared. Runs at registry validation, so a schema addition with
 * no migration is a boot failure rather than a runtime "no such table".
 */
export function assertMigrationCoverage(
  migrations: readonly Migration[] = MIGRATIONS,
  schema: readonly { table: TableName }[] = SCHEMA,
): void {
  const declared = new Set(schema.map((entity) => entity.table));
  const claimed = new Map<TableName, string>();

  for (const migration of migrations) {
    for (const table of migration.tables ?? []) {
      if (!declared.has(table)) {
        throw new Error(`Migration ${migration.id} creates undeclared table: ${table}`);
      }
      const previous = claimed.get(table);
      if (previous !== undefined) {
        throw new Error(`Table ${table} is created by both ${previous} and ${migration.id}`);
      }
      claimed.set(table, migration.id);
    }
  }

  const uncovered = [...declared].filter((table) => !claimed.has(table));
  if (uncovered.length > 0) {
    throw new Error(
      `Declared tables with no migration creating them: ${uncovered.join(', ')}. ` +
        'Add a migration built from schemaSubset([...]).',
    );
  }
}

export function migrationById(id: string): Migration | undefined {
  return MIGRATIONS.find((migration) => migration.id === id);
}

export { SCHEMA_MIGRATIONS_TABLE, latestVersion } from './types.js';
export type { AppliedMigration, Migration } from './types.js';
