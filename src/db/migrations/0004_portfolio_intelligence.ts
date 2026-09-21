/**
 * 0004 — portfolio intelligence.
 *
 * Three tables, split along one line: what is **current** and what is **historical**.
 *
 *   - `portfolios` — the container: identity, a name, the currency the user thinks in.
 *     Current state, mutable, one row per account.
 *   - `portfolio_positions` — the declared composition right now. Mutable, and replaced
 *     as a whole rather than patched: a redeclaration that failed halfway would otherwise
 *     leave a portfolio that is half of what the user described and half of what they
 *     meant, and every figure computed from it would be wrong in a way nobody could see.
 *   - `portfolio_snapshots` — append-only history, one row per version holding the whole
 *     document. This is what makes an analysis reviewable: the composition it was computed
 *     from is recoverable exactly as it was, and no later edit can rewrite it.
 *
 * **No value is stored anywhere.** A market value, a cost basis, a concentration figure —
 * all of them are computed from the positions every time they are asked for. A stored
 * total would be a second source of truth that drifts the moment a price moves, and a
 * drift like that is invisible: the number would look exactly like a correct one.
 *
 * Migrations 0001–0003 are untouched. A change to any of them would change its recorded
 * checksum, and the runner refuses to run against a database whose checksum no longer
 * matches — which is how "never edit an applied migration" is enforced rather than
 * merely stated.
 */

import { createSchemaSql, dropSchemaSql } from '../ddl.js';
import { schemaSubset, type TableName } from '../schema.js';
import type { Migration } from './types.js';

export const ADDED_TABLES: readonly TableName[] = [
  'portfolios',
  'portfolio_positions',
  'portfolio_snapshots',
];

export const portfolioIntelligenceMigration: Migration = {
  id: '0004_portfolio_intelligence',
  version: 4,
  description:
    'Create the declared portfolio, its current positions and the append-only history of its composition.',
  tables: ADDED_TABLES,
  up: (dialect) => createSchemaSql(dialect, schemaSubset(ADDED_TABLES)),
  down: (dialect) => dropSchemaSql(dialect, schemaSubset(ADDED_TABLES)),
};
