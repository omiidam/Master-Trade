/**
 * Portfolio repository — owner: `portfolio`.
 *
 * Owns the declared composition and its history. Five rules are enforced here rather
 * than trusted to callers:
 *
 *   1. **No value is ever stored.** There is no column, no method and no return value
 *      that carries a market value, a cost basis, a concentration figure or a return.
 *      Every one of them is computed from the positions each time it is asked for, by
 *      `packages/trading-engine`. A stored total would be a second source of truth that
 *      drifts the moment a price moves, and the drift would look exactly like a correct
 *      number.
 *   2. **A stored document is validated, not assumed.** Every write passes the shared
 *      Zod schema, so a hand-built object cannot enter the database and a currency the
 *      engine does not recognise cannot reach it either.
 *   3. **A composition is replaced as a whole.** Positions are deleted and re-inserted
 *      inside one transaction. Row-by-row editing would allow a redeclaration that failed
 *      halfway to leave a portfolio that is half of what the user described and half of
 *      what they meant — and every figure computed from it would be wrong in a way no
 *      surface could show.
 *   4. **A version is never rewritten.** There is no update and no delete for a snapshot.
 *      A change appends version *n+1*, so the composition an analysis was computed from
 *      stays recoverable exactly as it was.
 *   5. **Every read and write names a user.** There is no method that returns another
 *      account's portfolio, and no route accepts a user id, so cross-user access is not
 *      merely forbidden — it is unrepresentable at the API boundary.
 *
 * `note` is the one free-text field, and it is the reason findings and insights are
 * shaped the way they are: the text is stored and returned to its author, and nothing
 * in this repository ever copies it into a finding, a log payload or a summary.
 */

import { AppError } from '../../../packages/shared/src/core/errors.js';
import { ids } from '../../../packages/shared/src/core/ids.js';
import {
  MAX_POSITIONS,
  emptyPortfolio,
  portfolioDocumentSchema,
  type Portfolio,
  type PortfolioCurrency,
  type PortfolioDocumentInput,
  type PortfolioPosition,
  type PortfolioSnapshotReason,
} from '../../../packages/shared/src/portfolio/model.js';
import type { AssetClass, FactSource } from '../../../packages/shared/src/profile/model.js';
import type { SqlExecutor } from '../executor.js';
import { Table } from '../table.js';
import type { Owner } from '../ownership.js';
import type { TableName } from '../schema.js';

export const OWNER: Owner = 'portfolio';
export const OWNED_TABLES: readonly TableName[] = [
  'portfolios',
  'portfolio_positions',
  'portfolio_snapshots',
];

export interface PortfolioRow {
  id: string;
  user_id: string;
  name: string;
  base_currency: PortfolioCurrency;
  cash_weight_percent: number | null;
  created_at: string;
  updated_at: string;
}

export interface PortfolioPositionRow {
  id: string;
  portfolio_id: string;
  symbol: string;
  asset_class: AssetClass;
  currency: PortfolioCurrency;
  quantity: number | null;
  quantity_source: FactSource;
  quantity_observed_at: string | null;
  average_entry_price: number | null;
  entry_price_source: FactSource;
  entry_price_observed_at: string | null;
  price: number | null;
  price_currency: string | null;
  price_observed_at: string | null;
  price_source: string | null;
  price_trust: string | null;
  price_ref: string | null;
  weight_percent: number | null;
  note: string | null;
}

export interface PortfolioSnapshotRow {
  id: string;
  portfolio_id: string;
  user_id: string;
  version: number;
  reason: PortfolioSnapshotReason;
  document: Portfolio;
  changed_by: string;
  created_at: string;
}

export interface PortfolioRepositoryOptions {
  now?: () => number;
  newId?: (kind: string) => string;
}

export interface StoredPortfolio {
  row: PortfolioRow;
  /** The current composition, assembled from the container and its positions. */
  portfolio: Portfolio;
  /** The version the current composition was written as. */
  version: number;
}

export interface ReplacePortfolioInput {
  userId: string;
  document: PortfolioDocumentInput;
  /** User id or `system`. Attribution is required: an unattributed change is not reviewable. */
  changedBy: string;
  reason: PortfolioSnapshotReason;
}

export class PortfolioRepository {
  private readonly db: SqlExecutor;
  private readonly containers: Table<PortfolioRow>;
  private readonly positions: Table<PortfolioPositionRow>;
  private readonly snapshots: Table<PortfolioSnapshotRow>;
  private readonly now: () => number;
  private readonly newId: (kind: string) => string;

  constructor(db: SqlExecutor, options: PortfolioRepositoryOptions = {}) {
    this.db = db;
    this.containers = new Table<PortfolioRow>(db, 'portfolios');
    this.positions = new Table<PortfolioPositionRow>(db, 'portfolio_positions');
    this.snapshots = new Table<PortfolioSnapshotRow>(db, 'portfolio_snapshots');
    this.now = options.now ?? (() => Date.now());
    this.newId = options.newId ?? ((kind) => ids.id(kind));
  }

  /** The container row, or `null` when the account has never declared a portfolio. */
  async container(userId: string): Promise<PortfolioRow | null> {
    return this.containers.findOne({ user_id: userId });
  }

  /**
   * The current composition, or `null` when nothing has been declared.
   *
   * `null` rather than an empty portfolio, because the two are different facts: one is
   * "this account has not told us what it holds", the other is "it told us it holds
   * nothing". A surface that conflated them would show an empty portfolio to somebody
   * who had simply not answered yet — and the honest answer to both is different.
   */
  async current(userId: string): Promise<StoredPortfolio | null> {
    const row = await this.container(userId);
    if (row === null) return null;
    const [positionRows, snapshot] = await Promise.all([
      this.positions.findMany({ portfolio_id: row.id }, { orderBy: 'symbol', direction: 'asc' }),
      this.latestSnapshot(row.id),
    ]);
    return {
      row,
      portfolio: this.assemble(row, positionRows),
      version: snapshot?.version ?? 0,
    };
  }

  /**
   * Replace the composition, append a version, and return what was written.
   *
   * All three steps happen in one transaction. The order inside it matters: the
   * container is created or updated first, so the positions have a parent; the positions
   * are then deleted and re-inserted as one set; and the snapshot is written last, so a
   * version never exists for a composition that was not stored.
   */
  async replace(input: ReplacePortfolioInput): Promise<StoredPortfolio> {
    if (input.changedBy.trim().length === 0) {
      throw new AppError('VALIDATION_FAILED', 'A portfolio change must record who made it.', {
        details: { field: 'changedBy' },
      });
    }

    const parsed = portfolioDocumentSchema.safeParse(input.document);
    if (!parsed.success) {
      throw new AppError('VALIDATION_FAILED', 'The portfolio is not a valid document.', {
        details: {
          fields: parsed.error.issues.slice(0, 10).map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      });
    }
    const document = parsed.data;

    // A declared price may not claim a provenance the caller cannot have.
    //
    // `portfolioDeclaredPriceSchema` already refuses this at the API boundary (VULN-002,
    // end-of-Phase-6 security gate), but this is the single function that writes a price row, and
    // the stored shape has to keep accepting what the product itself produces. Stating the rule
    // here means the guarantee belongs to the writer rather than to whichever caller happens to
    // validate first: no row can be written whose provenance says `market-data`, `system` or a
    // raised trust level unless the product itself decided it — and nothing can, yet.
    for (const position of document.positions) {
      const provenance = position.price?.provenance;
      if (provenance === undefined) continue;
      if (
        provenance.source === 'system' ||
        provenance.source === 'market-data' ||
        provenance.trust !== 'unverified'
      ) {
        throw new AppError(
          'POLICY_VIOLATION',
          'A declared price may not claim a source or a trust level only this product can produce.',
          { details: { field: 'positions.price.provenance', symbol: position.symbol } },
        );
      }
    }

    // Duplicate symbols are refused at the boundary rather than stored and reported
    // later. The engine would treat them as ambiguous — which is honest — but the moment
    // to tell the user is now, not when a figure is missing.
    const symbols = new Set<string>();
    for (const position of document.positions) {
      const key = position.symbol.trim().toUpperCase();
      if (symbols.has(key)) {
        throw new AppError(
          'VALIDATION_FAILED',
          'The same symbol is declared more than once, so its size would be ambiguous. Combine the rows into one.',
          { details: { field: 'positions', symbol: position.symbol } },
        );
      }
      symbols.add(key);
    }

    const now = this.now();
    const at = new Date(now).toISOString();

    return this.db.transaction(async (tx) => {
      const containers = new Table<PortfolioRow>(tx, 'portfolios');
      const positions = new Table<PortfolioPositionRow>(tx, 'portfolio_positions');
      const snapshots = new Table<PortfolioSnapshotRow>(tx, 'portfolio_snapshots');

      const existing = await containers.findOne({ user_id: input.userId });
      const container: PortfolioRow =
        existing === null
          ? {
              id: this.newId('pf'),
              user_id: input.userId,
              name: document.name,
              base_currency: document.baseCurrency,
              cash_weight_percent: document.cashWeightPercent,
              created_at: at,
              updated_at: at,
            }
          : {
              ...existing,
              name: document.name,
              base_currency: document.baseCurrency,
              cash_weight_percent: document.cashWeightPercent,
              updated_at: at,
            };

      const stored =
        existing === null
          ? await containers.insert(container)
          : ((await containers.update(container.id, container)) ?? container);

      // A redeclaration replaces the composition; it never patches rows. One statement,
      // inside the transaction, so there is no state in which a portfolio is half the
      // old composition and half the new one — a state in which every figure computed
      // from it would be wrong and nothing would say so.
      await tx.execute('DELETE FROM portfolio_positions WHERE portfolio_id = ?', [stored.id]);

      const positionRows: PortfolioPositionRow[] = document.positions
        .slice(0, MAX_POSITIONS)
        .map((position) => this.toRow(stored.id, position));
      for (const row of positionRows) await positions.insert(row);

      const versionRows = await snapshots.findMany(
        { portfolio_id: stored.id },
        { orderBy: 'version', direction: 'desc', limit: 1 },
      );
      const version = (versionRows[0]?.version ?? 0) + 1;

      const assembled = this.assemble(stored, positionRows);
      await snapshots.insert({
        id: this.newId('pfs'),
        portfolio_id: stored.id,
        user_id: input.userId,
        version,
        reason: existing === null && input.reason === 'edited' ? 'created' : input.reason,
        document: assembled,
        changed_by: input.changedBy,
        created_at: at,
      });

      return { row: stored, portfolio: assembled, version };
    });
  }

  /**
   * The version history, newest first.
   *
   * Bounded, because it is read for review. `document` is a JSON column, so the rows are
   * read through `Table` rather than a hand-written SELECT: the toolkit decodes every
   * column by its declared type, and a query that built its own rows would hand back the
   * stored text instead of the document.
   */
  async snapshotsFor(userId: string, limit = 20): Promise<PortfolioSnapshotRow[]> {
    return this.snapshots.findMany(
      { user_id: userId },
      { orderBy: 'version', direction: 'desc', limit: Math.max(1, Math.min(100, limit)) },
    );
  }

  async snapshotCount(userId: string): Promise<number> {
    return this.snapshots.count({ user_id: userId });
  }

  private async latestSnapshot(portfolioId: string): Promise<PortfolioSnapshotRow | null> {
    const rows = await this.snapshots.findMany(
      { portfolio_id: portfolioId },
      { orderBy: 'version', direction: 'desc', limit: 1 },
    );
    return rows[0] ?? null;
  }

  /** Assemble the domain document from the container and its position rows. */
  private assemble(row: PortfolioRow, rows: readonly PortfolioPositionRow[]): Portfolio {
    return {
      id: row.id,
      name: row.name,
      baseCurrency: row.base_currency,
      cashWeightPercent: row.cash_weight_percent,
      positions: rows.map((position) => this.toPosition(position)),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private toPosition(row: PortfolioPositionRow): PortfolioPosition {
    return {
      id: row.id,
      symbol: row.symbol,
      assetClass: row.asset_class,
      currency: row.currency,
      quantity: {
        value: row.quantity,
        source: row.quantity_source,
        observedAt: row.quantity_observed_at,
      },
      averageEntryPrice: {
        value: row.average_entry_price,
        source: row.entry_price_source,
        observedAt: row.entry_price_observed_at,
      },
      // A price is all-or-nothing: a value with no observation time or no provenance is
      // not a price this product will use, so the whole reference is absent rather than
      // half-populated and read as something it is not.
      price:
        row.price === null ||
        row.price_currency === null ||
        row.price_observed_at === null ||
        row.price_trust === null
          ? null
          : {
              value: row.price,
              currency: row.price_currency as PortfolioCurrency,
              observedAt: row.price_observed_at,
              provenance: {
                source: (row.price_source ?? 'user') as
                  'user' | 'derived' | 'system' | 'market-data',
                ref: row.price_ref ?? 'unspecified',
                trust: row.price_trust as 'unverified' | 'verified' | 'authoritative',
                recordedAt: row.price_observed_at,
              },
            },
      weightPercent: row.weight_percent,
      ...(row.note === null ? {} : { note: row.note }),
    };
  }

  private toRow(portfolioId: string, position: PortfolioPosition): PortfolioPositionRow {
    return {
      id: this.newId('pfp'),
      portfolio_id: portfolioId,
      symbol: position.symbol,
      asset_class: position.assetClass,
      currency: position.currency,
      quantity: position.quantity.value,
      quantity_source: position.quantity.source,
      quantity_observed_at: position.quantity.observedAt,
      average_entry_price: position.averageEntryPrice.value,
      entry_price_source: position.averageEntryPrice.source,
      entry_price_observed_at: position.averageEntryPrice.observedAt,
      price: position.price?.value ?? null,
      price_currency: position.price?.currency ?? null,
      price_observed_at: position.price?.observedAt ?? null,
      price_source: position.price?.provenance.source ?? null,
      price_trust: position.price?.provenance.trust ?? null,
      price_ref: position.price?.provenance.ref ?? null,
      weight_percent: position.weightPercent,
      note: position.note ?? null,
    };
  }
}

export function createPortfolioRepository(
  db: SqlExecutor,
  options: PortfolioRepositoryOptions = {},
): PortfolioRepository {
  return new PortfolioRepository(db, options);
}

/**
 * Read a portfolio into the shape the engine analyses.
 *
 * Exported because the handler needs exactly this and nothing else: the conversion from
 * "nothing declared" to a document must happen once, so the gate and the engine cannot
 * be handed two different descriptions of the same account.
 */
export function portfolioOrDefault(
  stored: StoredPortfolio | null,
  now: number,
): { portfolio: Portfolio; declared: boolean; version: number } {
  if (stored !== null) {
    return { portfolio: stored.portfolio, declared: true, version: stored.version };
  }
  return {
    portfolio: emptyPortfolio('undeclared', new Date(now).toISOString()),
    declared: false,
    version: 0,
  };
}
