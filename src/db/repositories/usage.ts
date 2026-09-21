/**
 * Usage repository — owner: `usage`.
 *
 * Owns the subscription record, the credit balance, the append-only ledger and the
 * metering log. The rules that make the credit system trustworthy are enforced here,
 * in SQL, rather than described in a service:
 *
 *   1. **A debit is one guarded statement.** `UPDATE … SET balance = balance + ? WHERE
 *      user_id = ? AND balance + ? >= 0` — never a read, a decision and a write. Two
 *      concurrent reservations cannot both pass an affordability check against the same
 *      balance, because the balance is never read to decide; it is arithmetic the engine
 *      performs atomically. `changes === 1` means this caller won the row.
 *   2. **Idempotency is a unique index, not a lookup.** The ledger's
 *      `UNIQUE (user_id, operation_id)` is claimed *before* the debit, inside the
 *      transaction. A retry loses the claim, applies nothing, and reads back what the
 *      first attempt did — so a reconnect cannot be charged twice.
 *   3. **A refusal leaves nothing behind.** When the debit would cross zero the
 *      transaction rolls back, so the claim row disappears with it and the same key
 *      can succeed later once the account has credits. A refused attempt is recorded in
 *      the metering log instead, which is where a non-movement belongs.
 *   4. **The ledger is append-only.** There is no update and no delete for a movement.
 *      A correction is another movement (`adjustment`), so the history a user sees is
 *      the history that happened.
 *   5. **Every operation id is derived.** `grant:<period>`, `expire:<period>`,
 *      `refund:<operation>` or the caller's own key. Nothing a client sends can choose
 *      the id of a grant, and nothing can replay one.
 *   6. **A settlement happens once.** The usage-event transition is guarded by
 *      `WHERE status = 'reserved'`, so a double settlement is refused rather than
 *      silently applied.
 */

import { AppError } from '../../../packages/shared/src/core/errors.js';
import { ids } from '../../../packages/shared/src/core/ids.js';
import {
  applyDelta,
  assertMovement,
  deltaFor,
  type CreditReason,
  type LedgerKind,
  type LedgerStatus,
} from '../../../packages/shared/src/usage/credits.js';
import type { UsageCategory } from '../../../packages/shared/src/usage/features.js';
import type {
  BillingPeriod,
  SubscriptionStatus,
} from '../../../packages/shared/src/usage/plans.js';
import type { SqlExecutor } from '../executor.js';
import type { Owner } from '../ownership.js';
import { Table } from '../table.js';
import type { TableName } from '../schema.js';

export const OWNER: Owner = 'usage';
export const OWNED_TABLES: readonly TableName[] = [
  'subscriptions',
  'credit_accounts',
  'credit_ledger',
  'usage_events',
];

export interface SubscriptionRow {
  id: string;
  user_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  billing_period: BillingPeriod;
  current_period_start: string | null;
  current_period_end: string | null;
  started_at: string;
  ended_at: string | null;
  changed_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreditAccountRow {
  id: string;
  user_id: string;
  balance: number;
  period_key: string;
  lifetime_granted: number;
  lifetime_consumed: number;
  updated_at: string;
}

export interface CreditLedgerRow {
  id: string;
  user_id: string;
  operation_id: string;
  kind: LedgerKind;
  status: LedgerStatus;
  reason: CreditReason;
  delta: number;
  balance_after: number;
  feature: string | null;
  correlation_id: string | null;
  actor: string;
  created_at: string;
}

export type UsageEventStatus = 'reserved' | 'settled' | 'released' | 'refused';

export interface UsageEventRow {
  id: string;
  user_id: string;
  feature: string;
  category: UsageCategory;
  status: UsageEventStatus;
  credits: number;
  denial: string | null;
  operation_key: string;
  correlation_id: string | null;
  actor: string;
  occurred_at: string;
  settled_at: string | null;
  note: string | null;
}

export interface UsageRepositoryOptions {
  now?: () => number;
  newId?: (kind: string) => string;
}

export interface UpsertSubscriptionInput {
  userId: string;
  planId: string;
  status: SubscriptionStatus;
  billingPeriod: BillingPeriod;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  changedBy: string;
}

export interface ApplyCreditInput {
  userId: string;
  /** The derived idempotency key. See the header for the derivation rules. */
  operationId: string;
  kind: LedgerKind;
  reason: CreditReason;
  /** Positive magnitude, except for `adjustment`, which carries its own sign. */
  amount: number;
  /** The period the account should carry after this operation. */
  periodKey: string;
  feature?: string | null;
  correlationId?: string | null;
  actor: string;
  /** `reserved` for a metered hold; omit for a movement that is already final. */
  status?: LedgerStatus;
  /** Counted as consumed, for the lifetime counter. `consume` by default. */
  countsAsConsumed?: boolean;
}

export type ApplyCreditResult =
  | { outcome: 'applied'; row: CreditLedgerRow; balance: number }
  | { outcome: 'duplicate'; row: CreditLedgerRow; balance: number }
  | { outcome: 'insufficient'; balance: number; shortfall: number };

/** Internal signal: unwind the transaction without reporting a failure. */
class RollbackSignal extends Error {
  constructor(readonly result: ApplyCreditResult) {
    super('rollback');
  }
}

export class UsageRepository {
  private readonly db: SqlExecutor;
  private readonly now: () => number;
  private readonly newId: (kind: string) => string;
  private readonly subscriptions: Table<SubscriptionRow>;
  private readonly accounts: Table<CreditAccountRow>;
  private readonly ledgerTable: Table<CreditLedgerRow>;
  private readonly events: Table<UsageEventRow>;

  constructor(db: SqlExecutor, options: UsageRepositoryOptions = {}) {
    this.db = db;
    this.now = options.now ?? (() => Date.now());
    this.newId = options.newId ?? ((kind) => ids.id(kind));
    this.subscriptions = new Table<SubscriptionRow>(db, 'subscriptions');
    this.accounts = new Table<CreditAccountRow>(db, 'credit_accounts');
    this.ledgerTable = new Table<CreditLedgerRow>(db, 'credit_ledger');
    this.events = new Table<UsageEventRow>(db, 'usage_events');
  }

  /* ---------------------------------------------------------------- */
  /* Subscription                                                      */
  /* ---------------------------------------------------------------- */

  /** The account's subscription, or `null` when none has ever been recorded. */
  async subscription(userId: string): Promise<SubscriptionRow | null> {
    return this.subscriptions.findOne({ user_id: userId });
  }

  /**
   * Record which plan an account is on.
   *
   * One row per user, so this inserts on first use and updates afterwards. `changed_by`
   * is required and is checked: an unattributed subscription change is not auditable, and
   * attribution is what lets the caller be forbidden from changing their own plan.
   */
  async upsertSubscription(input: UpsertSubscriptionInput): Promise<SubscriptionRow> {
    if (input.changedBy.trim().length === 0) {
      throw new AppError('VALIDATION_FAILED', 'A subscription change must record who made it.', {
        details: { field: 'changedBy' },
      });
    }
    const now = new Date(this.now()).toISOString();
    const existing = await this.subscription(input.userId);

    if (existing === null) {
      return this.subscriptions.insert({
        id: this.newId('sub'),
        user_id: input.userId,
        plan_id: input.planId,
        status: input.status,
        billing_period: input.billingPeriod,
        current_period_start: input.currentPeriodStart,
        current_period_end: input.currentPeriodEnd,
        started_at: now,
        ended_at: input.status === 'active' ? null : now,
        changed_by: input.changedBy,
        created_at: now,
        updated_at: now,
      });
    }

    const updated = await this.subscriptions.update(existing.id, {
      plan_id: input.planId,
      status: input.status,
      billing_period: input.billingPeriod,
      current_period_start: input.currentPeriodStart,
      current_period_end: input.currentPeriodEnd,
      ended_at: input.status === 'active' ? null : (existing.ended_at ?? now),
      changed_by: input.changedBy,
      updated_at: now,
    });
    if (updated === null) {
      throw new AppError(
        'INTERNAL',
        'The subscription row disappeared while it was being updated.',
      );
    }
    return updated;
  }

  /* ---------------------------------------------------------------- */
  /* Accounts and the ledger                                           */
  /* ---------------------------------------------------------------- */

  async account(userId: string): Promise<CreditAccountRow | null> {
    return this.accounts.findOne({ user_id: userId });
  }

  async balance(userId: string): Promise<number> {
    return (await this.account(userId))?.balance ?? 0;
  }

  /** Newest first. Bounded: this is read for display and review. */
  async ledger(
    userId: string,
    options: { limit?: number; feature?: string } = {},
  ): Promise<CreditLedgerRow[]> {
    const where: Partial<CreditLedgerRow> = { user_id: userId };
    if (options.feature !== undefined) where.feature = options.feature;
    return this.ledgerTable.findMany(where, {
      orderBy: 'created_at',
      direction: 'desc',
      limit: Math.max(1, Math.min(500, options.limit ?? 50)),
    });
  }

  async ledgerByOperation(userId: string, operationId: string): Promise<CreditLedgerRow | null> {
    return this.ledgerTable.findOne({ user_id: userId, operation_id: operationId });
  }

  async ledgerCount(userId: string): Promise<number> {
    return this.ledgerTable.count({ user_id: userId });
  }

  /**
   * Apply one credit movement, atomically and idempotently.
   *
   * The ordering inside the transaction is the whole guarantee and is worth reading
   * once: **claim, then debit**. Claiming first means a duplicate loses the claim before
   * any balance moves. Debiting inside the same transaction means the claim and the
   * movement cannot be separated by a crash. And rolling back on a shortfall means a
   * refused attempt leaves no claim behind, so the same key is usable later.
   */
  async applyCredit(input: ApplyCreditInput): Promise<ApplyCreditResult> {
    assertMovement({ kind: input.kind, reason: input.reason, amount: input.amount });
    if (input.operationId.trim().length === 0) {
      throw new AppError('VALIDATION_FAILED', 'A credit operation must carry an operation id.', {
        details: { field: 'operationId' },
      });
    }
    const delta = deltaFor(input.kind, input.amount);
    const status: LedgerStatus = input.status ?? 'settled';
    const now = new Date(this.now()).toISOString();
    const countsAsConsumed = input.countsAsConsumed ?? input.kind === 'consume';

    try {
      return await this.db.transaction(async (tx) => {
        // 1. Claim the operation id. `changes` is the verdict, not an inference from the
        //    row that came back: 1 means this caller wrote it, 0 means the unique index
        //    refused us because somebody else already had.
        const claim = await tx.execute(
          `INSERT INTO credit_ledger
             (id, user_id, operation_id, kind, status, reason, delta, balance_after, feature, correlation_id, actor, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
          [
            this.newId('led'),
            input.userId,
            input.operationId,
            input.kind,
            status,
            input.reason,
            delta,
            input.feature ?? null,
            input.correlationId ?? null,
            input.actor,
            now,
          ],
        );

        const claims = new Table<CreditLedgerRow>(tx, 'credit_ledger');
        if (claim.changes !== 1) {
          const existing = await claims.findOne({
            user_id: input.userId,
            operation_id: input.operationId,
          });
          if (existing === null) {
            throw new AppError(
              'INTERNAL',
              'A credit operation was refused by the unique index and then not found.',
            );
          }
          return { outcome: 'duplicate', row: existing, balance: existing.balance_after };
        }

        // 2. Make sure the account row exists, without resetting it.
        await tx.execute(
          `INSERT INTO credit_accounts
             (id, user_id, balance, period_key, lifetime_granted, lifetime_consumed, updated_at)
           VALUES (?, ?, 0, ?, 0, 0, ?) ON CONFLICT DO NOTHING`,
          [this.newId('acct'), input.userId, input.periodKey, now],
        );

        const accountRow = await tx.queryOne(
          'SELECT balance FROM credit_accounts WHERE user_id = ?',
          [input.userId],
        );
        const current = Number(accountRow?.balance ?? 0);

        // 3. Refuse a debit that would cross zero *before* touching the account, so the
        //    transaction rolls back rather than being repaired.
        const projected = applyDelta(current, delta);
        if (!projected.ok) {
          throw new RollbackSignal({
            outcome: 'insufficient',
            balance: projected.balance,
            shortfall: projected.shortfall,
          });
        }

        // 4. The debit: arithmetic the engine performs, with the non-negative rule in the
        //    WHERE clause so a concurrent winner cannot be overwritten.
        const granted = delta > 0 ? delta : 0;
        const consumed = countsAsConsumed && delta < 0 ? -delta : 0;
        const updated = await tx.execute(
          `UPDATE credit_accounts
              SET balance = balance + ?,
                  period_key = ?,
                  lifetime_granted = lifetime_granted + ?,
                  lifetime_consumed = lifetime_consumed + ?,
                  updated_at = ?
            WHERE user_id = ? AND balance + ? >= 0`,
          [delta, input.periodKey, granted, consumed, now, input.userId, delta],
        );
        if (updated.changes !== 1) {
          throw new RollbackSignal({
            outcome: 'insufficient',
            balance: current,
            shortfall: Math.max(0, -delta - current),
          });
        }

        // 5. Stamp the balance the movement produced, so the history reconciles without
        //    replaying it.
        const claimed = await claims.findOne({
          user_id: input.userId,
          operation_id: input.operationId,
        });
        if (claimed === null) {
          throw new AppError('INTERNAL', 'The ledger claim vanished inside its own transaction.');
        }
        const final = current + delta;
        const row = await claims.update(claimed.id, { balance_after: final });
        if (row === null) {
          throw new AppError('INTERNAL', 'The ledger row vanished while it was being stamped.');
        }
        return { outcome: 'applied', row, balance: final };
      });
    } catch (error) {
      if (error instanceof RollbackSignal) return error.result;
      throw error;
    }
  }

  /**
   * Move a reservation to its final state, once.
   *
   * `WHERE status = 'reserved'` is the guard: a second settlement changes nothing and is
   * reported as such, so a retry after a crash cannot settle the same reservation twice.
   */
  async settleReservation(
    userId: string,
    operationId: string,
    status: Extract<LedgerStatus, 'settled' | 'released'>,
  ): Promise<{ row: CreditLedgerRow | null; changed: boolean }> {
    const result = await this.db.execute(
      'UPDATE credit_ledger SET status = ? WHERE user_id = ? AND operation_id = ? AND status = ?',
      [status, userId, operationId, 'reserved'],
    );
    const row = await this.ledgerByOperation(userId, operationId);
    return { row, changed: result.changes === 1 };
  }

  /* ---------------------------------------------------------------- */
  /* Metering                                                          */
  /* ---------------------------------------------------------------- */

  async usageEvents(
    userId: string,
    options: { limit?: number; feature?: string } = {},
  ): Promise<UsageEventRow[]> {
    const where: Partial<UsageEventRow> = { user_id: userId };
    if (options.feature !== undefined) where.feature = options.feature;
    return this.events.findMany(where, {
      orderBy: 'occurred_at',
      direction: 'desc',
      limit: Math.max(1, Math.min(500, options.limit ?? 50)),
    });
  }

  async usageEventByOperation(userId: string, operationKey: string): Promise<UsageEventRow | null> {
    return this.events.findOne({ user_id: userId, operation_key: operationKey });
  }

  async recordUsageEvent(input: {
    userId: string;
    feature: string;
    category: UsageCategory;
    status: UsageEventStatus;
    credits: number;
    denial: string | null;
    operationKey: string;
    correlationId: string | null;
    actor: string;
    note: string | null;
  }): Promise<UsageEventRow> {
    if (!Number.isInteger(input.credits) || input.credits < 0) {
      throw new AppError('VALIDATION_FAILED', 'A usage event must record a whole credit amount.', {
        details: { field: 'credits' },
      });
    }
    const now = new Date(this.now()).toISOString();
    return this.events.insert({
      id: this.newId('usg'),
      user_id: input.userId,
      feature: input.feature,
      category: input.category,
      status: input.status,
      credits: input.credits,
      denial: input.denial,
      operation_key: input.operationKey,
      correlation_id: input.correlationId,
      actor: input.actor,
      occurred_at: now,
      settled_at: input.status === 'reserved' ? null : now,
      note: input.note,
    });
  }

  /** Move a metered attempt to its final state, once. */
  async settleUsageEvent(
    userId: string,
    operationKey: string,
    status: Extract<UsageEventStatus, 'settled' | 'released'>,
    note: string | null = null,
  ): Promise<{ row: UsageEventRow | null; changed: boolean }> {
    const result = await this.db.execute(
      `UPDATE usage_events SET status = ?, settled_at = ?, note = ?
        WHERE user_id = ? AND operation_key = ? AND status = 'reserved'`,
      [status, new Date(this.now()).toISOString(), note, userId, operationKey],
    );
    const row = await this.usageEventByOperation(userId, operationKey);
    return { row, changed: result.changes === 1 };
  }
}

export function createUsageRepository(
  db: SqlExecutor,
  options: UsageRepositoryOptions = {},
): UsageRepository {
  return new UsageRepository(db, options);
}
