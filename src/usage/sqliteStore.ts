/**
 * The durable usage store.
 *
 * Thin by construction: every method delegates to `UsageRepository`, which is where the
 * guarded write statement, the unique idempotency index and the transaction live. A store
 * that re-implemented any of that would be a second place for the credit rules to be right
 * or wrong, and the rules are the reason this module exists.
 *
 * The `kind` and `durable` flags are what the readiness report reads. "Usage survives a
 * restart" is either true for this deployment or it is not, and a check that has to infer
 * it from the presence of a driver is a check that will eventually be wrong.
 */

import type { UsageRepository } from '../db/repositories/usage.js';
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
import type { LedgerStatus } from '../../packages/shared/src/usage/credits.js';
import type { UsageCategory } from '../../packages/shared/src/usage/features.js';
import type { UsageStore } from './store.js';

export class SqliteUsageStore implements UsageStore {
  readonly kind = 'sqlite' as const;
  readonly durable = true;

  private readonly repository: UsageRepository;

  constructor(repository: UsageRepository) {
    this.repository = repository;
  }

  async subscription(userId: string): Promise<SubscriptionRow | null> {
    return this.repository.subscription(userId);
  }

  async upsertSubscription(input: UpsertSubscriptionInput): Promise<SubscriptionRow> {
    return this.repository.upsertSubscription(input);
  }

  async account(userId: string): Promise<CreditAccountRow | null> {
    return this.repository.account(userId);
  }

  async applyCredit(input: ApplyCreditInput): Promise<ApplyCreditResult> {
    return this.repository.applyCredit(input);
  }

  async settleReservation(
    userId: string,
    operationId: string,
    status: Extract<LedgerStatus, 'settled' | 'released'>,
  ): Promise<{ row: CreditLedgerRow | null; changed: boolean }> {
    return this.repository.settleReservation(userId, operationId, status);
  }

  async ledger(
    userId: string,
    options: { limit?: number; feature?: string } = {},
  ): Promise<CreditLedgerRow[]> {
    return this.repository.ledger(userId, options);
  }

  async ledgerByOperation(userId: string, operationId: string): Promise<CreditLedgerRow | null> {
    return this.repository.ledgerByOperation(userId, operationId);
  }

  async usageEvents(
    userId: string,
    options: { limit?: number; feature?: string } = {},
  ): Promise<UsageEventRow[]> {
    return this.repository.usageEvents(userId, options);
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
    return this.repository.recordUsageEvent(input);
  }

  async settleUsageEvent(
    userId: string,
    operationKey: string,
    status: Extract<UsageEventStatus, 'settled' | 'released'>,
    note: string | null = null,
  ): Promise<{ row: UsageEventRow | null; changed: boolean }> {
    return this.repository.settleUsageEvent(userId, operationKey, status, note);
  }
}
