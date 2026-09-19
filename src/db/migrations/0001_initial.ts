/**
 * 0001 — initial schema.
 *
 * Generated from `SCHEMA` for each dialect rather than hand-written, so a table
 * cannot be declared without being created, and the two engines are created from
 * one description. Editing this file is a *migration change*: the runner records
 * a checksum of the statements it applied and refuses to run against a database
 * whose recorded checksum no longer matches.
 */

import { createSchemaSql, dropSchemaSql } from '../ddl.js';
import type { Migration } from './types.js';

export const initialMigration: Migration = {
  id: '0001_initial_schema',
  version: 1,
  description: 'Create the initial Master Trade schema (22 tables, indexes and integrity checks).',
  up: (dialect) => createSchemaSql(dialect),
  down: (dialect) => dropSchemaSql(dialect),
};
