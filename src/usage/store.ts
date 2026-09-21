/**
 * The usage store port — where a balance, a movement and a metered attempt live.
 *
 * The service talks to this interface and never to a database or a `Map`. Two
 * implementations exist, and the split follows the one ADR-0033 already established for
 * the job queue, for the same reason: a durable implementation for a deployment with a
 * database handle, and an in-process one for a server that has none, with the difference
 * **reported** rather than hidden.
 *
 *   - `InMemoryUsageStore` — the default when no database handle is open. Metering still
 *     happens (a metered capability is never silently unmetered), it is simply not
 *     durable, and the readiness report says so.
 *   - `SqliteUsageStore` (see `sqliteStore.ts`) — the durable store over the four usage
 *     tables, delegating to `UsageRepository`, which is where the guarded write statement
 *     and the unique idempotency index live.
 *
 * **The port is small on purpose**, and `applyCredit` is the only method that carries a
 * guarantee rather than a signature. Its contract, which both implementations must meet:
 *
 *   1. the operation id is claimed **before** any balance moves, so a retry cannot
 *      charge twice;
 *   2. a movement that would take the balance below zero is refused and leaves **no**
 *      ledger row behind, so the same operation id is usable once the account has credits;
 *   3. a concurrent pair of debits cannot both succeed against the same balance.
 *
 * The two implementations meet (3) differently and both say how. The SQL one does it in a
 * single guarded statement that carries the non-negative condition in its own predicate,
 * so the check and the write are one operation. The in-memory one does it by mutating
 * without an `await` between the check
 * and the write, which in a single-threaded runtime is the same guarantee — and is
 * exactly the guarantee, no weaker, because there is no second thread to race.
 */

import { AppError } from '../../packages/shared/src/core/errors.js';
import { ids } from '../../packages/shared/src/core/ids.js';
import {
  applyDelta,
  assertMovement,
  deltaFor,
  type CreditReason,
  type LedgerKind,
  type LedgerStatus,
} from '../../packages/shared/src/usage/credits.js';
import type { UsageCategory } from '../../packages/shared/src/usage/features.js';
import type { BillingPeriod, SubscriptionStatus } from '../../packages/shared/src/usage/plans.js';
import type {
  ApplyCreditInput,
  ApplyCreditResult,
  CreditAccountRow,
  CreditLedgerRow,
  SubscriptionRow,
  UsageEventRow,
  UsageEventStatus,
  UpsertSubscriptionInput,
} from '../db/repositories/usage.js';

export interface UsageStore {
  /** For the readiness report: which implementation is answering. */
  readonly kind: 'sqlite' | 'memory';
  /** False when a restart loses the balance and the history. Reported, never assumed. */
  readonly durable: boolean;

  subscription(userId: string): Promise<SubscriptionRow | null>;
  upsertSubscription(input: UpsertSubscriptionInput): Promise<SubscriptionRow>;

  account(userId: string): Promise<CreditAccountRow | null>;
  applyCredit(input: ApplyCreditInput): Promise<ApplyCreditResult>;
  settleReservation(
    userId: string,
    operationId: string,
    status: Extract<LedgerStatus, 'settled' | 'released'>,
  ): Promise<{ row: CreditLedgerRow | null; changed: boolean }>;
  ledger(
    userId: string,
    options?: { limit?: number; feature?: string },
  ): Promise<CreditLedgerRow[]>;
  ledgerByOperation(userId: string, operationId: string): Promise<CreditLedgerRow | null>;

  usageEvents(
    userId: string,
    options?: { limit?: number; feature?: string },
  ): Promise<UsageEventRow[]>;
  recordUsageEvent(input: {
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
  }): Promise<UsageEventRow>;
  settleUsageEvent(
    userId: string,
    operationKey: string,
    status: Extract<UsageEventStatus, 'settled' | 'released'>,
    note?: string | null,
  ): Promise<{ row: UsageEventRow | null; changed: boolean }>;
}

export interface InMemoryUsageStoreOptions {
  now?: () => number;
  newId?: (kind: string) => string;
}

/**
 * The in-process store.
 *
 * Small, and deliberately not a second implementation of the *rules*: the arithmetic
 * comes from the shared model, so both stores refuse the same movements for the same
 * reasons. What differs is only how atomicity is obtained, and that is stated at the one
 * method where it matters.
 */
export class InMemoryUsageStore implements UsageStore {
  readonly kind = 'memory' as const;
  readonly durable = false;

  private readonly subscriptions = new Map<string, SubscriptionRow>();
  private readonly accounts = new Map<string, CreditAccountRow>();
  // Named `ledgerRows` rather than `ledger`: the class also *implements* `ledger()`, and
  // one name cannot be both a field and a method.
  private readonly ledgerRows = new Map<string, CreditLedgerRow>();
  private readonly events: UsageEventRow[] = [];
  private readonly now: () => number;
  private readonly newId: (kind: string) => string;

  constructor(options: InMemoryUsageStoreOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.newId = options.newId ?? ((kind) => ids.id(kind));
  }

  async subscription(userId: string): Promise<SubscriptionRow | null> {
    return this.subscriptions.get(userId) ?? null;
  }

  async upsertSubscription(input: UpsertSubscriptionInput): Promise<SubscriptionRow> {
    if (input.changedBy.trim().length === 0) {
      throw new AppError('VALIDATION_FAILED', 'A subscription change must record who made it.', {
        details: { field: 'changedBy' },
      });
    }
    const now = new Date(this.now()).toISOString();
    const existing = this.subscriptions.get(input.userId);
    const row: SubscriptionRow = {
      id: existing?.id ?? this.newId('sub'),
      user_id: input.userId,
      plan_id: input.planId,
      status: input.status,
      billing_period: input.billingPeriod,
      current_period_start: input.currentPeriodStart,
      current_period_end: input.currentPeriodEnd,
      started_at: existing?.started_at ?? now,
      ended_at: input.status === 'active' ? null : (existing?.ended_at ?? now),
      changed_by: input.changedBy,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };
    this.subscriptions.set(input.userId, row);
    return row;
  }

  async account(userId: string): Promise<CreditAccountRow | null> {
    return this.accounts.get(userId) ?? null;
  }

  /**
   * Apply one movement.
   *
   * There is no `await` between reading the balance and writing it, and that is the
   * whole concurrency story here: JavaScript runs one task at a time, so a second caller
   * cannot observe the balance in between. The synchronous section is entered before the
   * first `await` and left after the last mutation, so an interleaved pair of debits sees
   * each other's writes — which is the same outcome the SQL store gets from its guarded
   * guarded statement, reached differently.
   */
  async applyCredit(input: ApplyCreditInput): Promise<ApplyCreditResult> {
    assertMovement({ kind: input.kind, reason: input.reason, amount: input.amount });
    if (input.operationId.trim().length === 0) {
      throw new AppError('VALIDATION_FAILED', 'A credit operation must carry an operation id.', {
        details: { field: 'operationId' },
      });
    }

    const key = `${input.userId}\u0000${input.operationId}`;
    const claimed = this.ledgerRows.get(key);
    if (claimed !== undefined) {
      return { outcome: 'duplicate', row: claimed, balance: claimed.balance_after };
    }

    const nowIso = new Date(this.now()).toISOString();
    const current = this.accounts.get(input.userId) ?? {
      id: this.newId('acct'),
      user_id: input.userId,
      balance: 0,
      period_key: input.periodKey,
      lifetime_granted: 0,
      lifetime_consumed: 0,
      updated_at: nowIso,
    };

    const delta = deltaFor(input.kind, input.amount);
    const projected = applyDelta(current.balance, delta);
    // A refusal writes nothing at all — not the claim, not the account — so the same
    // operation id can be retried once the account has credits.
    if (!projected.ok) {
      return {
        outcome: 'insufficient',
        balance: projected.balance,
        shortfall: projected.shortfall,
      };
    }

    const countsAsConsumed = input.countsAsConsumed ?? input.kind === 'consume';
    const row: CreditLedgerRow = {
      id: this.newId('led'),
      user_id: input.userId,
      operation_id: input.operationId,
      kind: input.kind as LedgerKind,
      status: input.status ?? 'settled',
      reason: input.reason as CreditReason,
      delta,
      balance_after: projected.balance,
      feature: input.feature ?? null,
      correlation_id: input.correlationId ?? null,
      actor: input.actor,
      created_at: nowIso,
    };
    this.ledgerRows.set(key, row);
    this.accounts.set(input.userId, {
      ...current,
      balance: projected.balance,
      period_key: input.periodKey,
      lifetime_granted: current.lifetime_granted + (delta > 0 ? delta : 0),
      lifetime_consumed: current.lifetime_consumed + (countsAsConsumed && delta < 0 ? -delta : 0),
      updated_at: nowIso,
    });
    return { outcome: 'applied', row, balance: projected.balance };
  }

  async settleReservation(
    userId: string,
    operationId: string,
    status: Extract<LedgerStatus, 'settled' | 'released'>,
  ): Promise<{ row: CreditLedgerRow | null; changed: boolean }> {
    const key = `${userId}\u0000${operationId}`;
    const row = this.ledgerRows.get(key) ?? null;
    if (row === null || row.status !== 'reserved') return { row, changed: false };
    const updated: CreditLedgerRow = { ...row, status };
    this.ledgerRows.set(key, updated);
    return { row: updated, changed: true };
  }

  async ledger(
    userId: string,
    options: { limit?: number; feature?: string } = {},
  ): Promise<CreditLedgerRow[]> {
    const limit = Math.max(1, Math.min(500, options.limit ?? 50));
    return [...this.ledgerRows.values()]
      .filter((row) => row.user_id === userId)
      .filter((row) => options.feature === undefined || row.feature === options.feature)
      .sort((a, b) =>
        a.created_at === b.created_at
          ? b.id.localeCompare(a.id)
          : b.created_at.localeCompare(a.created_at),
      )
      .slice(0, limit);
  }

  async ledgerByOperation(userId: string, operationId: string): Promise<CreditLedgerRow | null> {
    return this.ledgerRows.get(`${userId}\u0000${operationId}`) ?? null;
  }

  async usageEvents(
    userId: string,
    options: { limit?: number; feature?: string } = {},
  ): Promise<UsageEventRow[]> {
    const limit = Math.max(1, Math.min(500, options.limit ?? 50));
    return this.events
      .filter((row) => row.user_id === userId)
      .filter((row) => options.feature === undefined || row.feature === options.feature)
      .sort((a, b) =>
        a.occurred_at === b.occurred_at
          ? b.id.localeCompare(a.id)
          : b.occurred_at.localeCompare(a.occurred_at),
      )
      .slice(0, limit);
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
    const row: UsageEventRow = {
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
    };
    this.events.push(row);
    return row;
  }

  async settleUsageEvent(
    userId: string,
    operationKey: string,
    status: Extract<UsageEventStatus, 'settled' | 'released'>,
    note: string | null = null,
  ): Promise<{ row: UsageEventRow | null; changed: boolean }> {
    // Newest first: a retry with the same key leaves the older attempt terminal and the
    // newer one reserved, and only a reserved attempt may settle.
    let index = -1;
    for (let candidate = this.events.length - 1; candidate >= 0; candidate -= 1) {
      const event = this.events[candidate]!;
      if (
        event.user_id === userId &&
        event.operation_key === operationKey &&
        event.status === 'reserved'
      ) {
        index = candidate;
        break;
      }
    }
    if (index === -1) {
      const latest = await this.usageEventByOperation(userId, operationKey);
      return { row: latest, changed: false };
    }
    const updated: UsageEventRow = {
      ...this.events[index]!,
      status,
      settled_at: new Date(this.now()).toISOString(),
      note,
    };
    this.events[index] = updated;
    return { row: updated, changed: true };
  }

  /** The most recent attempt under a key, whatever its outcome. */
  async usageEventByOperation(userId: string, operationKey: string): Promise<UsageEventRow | null> {
    for (let index = this.events.length - 1; index >= 0; index -= 1) {
      const row = this.events[index]!;
      if (row.user_id === userId && row.operation_key === operationKey) return row;
    }
    return null;
  }

  /** Test-only: the whole ledger, so a suite can assert nothing untracked happened. */
  allLedgerRows(): readonly CreditLedgerRow[] {
    return [...this.ledgerRows.values()];
  }
}
