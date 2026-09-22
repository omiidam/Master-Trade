/**
 * 0005 — decision evaluation.
 *
 * Two tables, splitting the same way 0004 did, along the line between what is **declared** and
 * what was **concluded**:
 *
 *   - `decisions` — the record: what was decided, on what evidence, and whether it happened. One
 *     validated JSON document per row, with columns only for what a query filters or orders by.
 *     A column per field would duplicate the domain model and allow a half-written record, and a
 *     half-written record is one whose evaluation would describe a decision nobody made.
 *   - `decision_evaluations` — append-only. What was *decided about* a record: the readiness
 *     verdict, the outcome classification, the rule that produced it and the finding codes, as of
 *     an instant, naming the version of the record it read.
 *
 * **No measured figure is stored.** A return, an R multiple, a drawdown — all of them are
 * computed from the record every time they are asked for, by `packages/trading-engine`. A stored
 * figure would be a second source of truth: it would keep its value after the prices it came from
 * were corrected, and it would look exactly like a correct number while it did.
 *
 * What the evaluation table exists for is the part that *cannot* be recomputed: that an
 * evaluation was attempted, when, from which version, and what it refused. Recomputing yesterday's
 * refusal from today's record would give today's answer, which is precisely the thing an audit
 * trail must not do.
 *
 * Migrations 0001–0004 are untouched. A change to any of them would change its recorded
 * checksum, and the runner refuses to run against a database whose checksum no longer matches.
 */

import { createSchemaSql, dropSchemaSql } from '../ddl.js';
import { schemaSubset, type TableName } from '../schema.js';
import type { Migration } from './types.js';

export const ADDED_TABLES: readonly TableName[] = ['decisions', 'decision_evaluations'];

export const decisionEvaluationMigration: Migration = {
  id: '0005_decision_evaluation',
  version: 5,
  description:
    'Create the recorded portfolio decisions and the append-only history of their evaluations.',
  tables: ADDED_TABLES,
  up: (dialect) => createSchemaSql(dialect, schemaSubset(ADDED_TABLES)),
  down: (dialect) => dropSchemaSql(dialect, schemaSubset(ADDED_TABLES)),
};
