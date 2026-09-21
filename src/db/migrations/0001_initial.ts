/**
 * 0001 — initial schema.
 *
 * Generated from `SCHEMA` for each dialect rather than hand-written, so a table
 * cannot be declared without being created, and the two engines are created from
 * one description. Editing this file is a *migration change*: the runner records
 * a checksum of the statements it applied and refuses to run against a database
 * whose recorded checksum no longer matches.
 *
 * **The table list is explicit and frozen** (`INITIAL_SCHEMA_TABLES`). While this
 * migration used the whole schema, adding a table anywhere would silently change
 * the statements this migration produces — and every existing database would then
 * refuse to migrate, reporting the change as tampering. Naming the set keeps this
 * migration byte-identical for the life of the project; a new table is a new
 * migration built from `schemaSubset([...])`.
 */

import { createSchemaSql, dropSchemaSql } from '../ddl.js';
import { INITIAL_SCHEMA_TABLES, schemaSubset } from '../schema.js';
import type { Migration } from './types.js';

export const initialMigration: Migration = {
  id: '0001_initial_schema',
  version: 1,
  description: 'Create the initial Master Trade schema (22 tables, indexes and integrity checks).',
  tables: INITIAL_SCHEMA_TABLES,
  up: (dialect) => createSchemaSql(dialect, schemaSubset(INITIAL_SCHEMA_TABLES)),
  down: (dialect) => dropSchemaSql(dialect, schemaSubset(INITIAL_SCHEMA_TABLES)),
};
