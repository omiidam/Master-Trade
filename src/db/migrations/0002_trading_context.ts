/**
 * 0002 — the versioned Trading Context.
 *
 * One append-only table: `trading_context_versions`. Each row is a complete snapshot
 * of the user's declared context at one version, so the context an answer was given
 * from stays recoverable and a later edit cannot rewrite history.
 *
 * It references `users`, which migration 0001 created; `schemaSubset` emits only the
 * tables this migration introduces and leaves the reference to the engine, exactly as
 * the generator would.
 */

import { createSchemaSql, dropSchemaSql } from '../ddl.js';
import { schemaSubset, type TableName } from '../schema.js';
import type { Migration } from './types.js';

export const ADDED_TABLES: readonly TableName[] = ['trading_context_versions'];

export const tradingContextMigration: Migration = {
  id: '0002_trading_context_versions',
  version: 2,
  description:
    'Create the append-only Trading Context history (one row per version, current = highest).',
  tables: ADDED_TABLES,
  up: (dialect) => createSchemaSql(dialect, schemaSubset(ADDED_TABLES)),
  down: (dialect) => dropSchemaSql(dialect, schemaSubset(ADDED_TABLES)),
};
