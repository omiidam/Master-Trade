/**
 * Migration registry.
 *
 * Order matters and is asserted at start-up: `validateMigrations` refuses
 * duplicate ids, duplicate or non-increasing versions, an empty `up`, and a
 * dialect that produces no statements. A migration is never edited after it has
 * been applied anywhere — a change is a new migration (the checksum guard in
 * `runner.ts` is what makes that enforceable rather than aspirational).
 */

import { DIALECTS } from '../dialect.js';
import { initialMigration } from './0001_initial.js';
import { validateMigrations, type Migration } from './types.js';

export const MIGRATIONS: readonly Migration[] = [initialMigration];

export function validateMigrationRegistry(migrations: readonly Migration[] = MIGRATIONS): void {
  validateMigrations(migrations, Object.values(DIALECTS));
}

export function migrationById(id: string): Migration | undefined {
  return MIGRATIONS.find((migration) => migration.id === id);
}

export { SCHEMA_MIGRATIONS_TABLE, latestVersion } from './types.js';
export type { AppliedMigration, Migration } from './types.js';
