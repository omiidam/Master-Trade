/**
 * 0003 — usage credits and subscriptions.
 *
 * Four tables, each with one job, because the alternative is one table that has to be
 * two things at once:
 *
 *   - `subscriptions` — which plan an account is on (current state, mutable, attributed);
 *   - `credit_accounts` — the balance, and nothing else, so a debit is one atomic
 *     guarded statement instead of a read-then-write race;
 *   - `credit_ledger` — append-only: every movement, with the balance after it. This is
 *     the accounting record and the identity of an operation, which is why the
 *     idempotency guarantee lives here and not on the metering table;
 *   - `usage_events` — append-only: every metered attempt, including the refusals and the
 *     free ones that moved nothing.
 *
 * `schemaSubset` emits only these four and leaves the references to `users` to the
 * engine, exactly as the generator would. Migrations 0001 and 0002 are untouched — a
 * change to either would change its checksum, and the runner refuses to run against a
 * database whose recorded checksum no longer matches.
 */

import { createSchemaSql, dropSchemaSql } from '../ddl.js';
import { schemaSubset, type TableName } from '../schema.js';
import type { Migration } from './types.js';

export const ADDED_TABLES: readonly TableName[] = [
  'subscriptions',
  'credit_accounts',
  'credit_ledger',
  'usage_events',
];

export const usageAndSubscriptionMigration: Migration = {
  id: '0003_usage_and_subscription',
  version: 3,
  description:
    'Create the subscription record, the credit balance, the append-only credit ledger and the metering log.',
  tables: ADDED_TABLES,
  up: (dialect) => createSchemaSql(dialect, schemaSubset(ADDED_TABLES)),
  down: (dialect) => dropSchemaSql(dialect, schemaSubset(ADDED_TABLES)),
};
