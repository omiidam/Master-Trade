/**
 * Usage service — the metering lifecycle, in one place.
 *
 * Five things, and the order between them is the design:
 *
 *   1. **Resolve entitlement** from stored state and the role table's answer, through the
 *      pure resolver. Nothing here can widen a permission, and no model is involved.
 *   2. **Reserve before the work.** The credit is claimed *before* the capability runs, so
 *      a concurrent request cannot spend the same credit — the claim is the ledger's unique
 *      operation id, and its arithmetic happens in one guarded statement below the port.
 *   3. **Settle what completed, return what did not.** A failed, blocked or refused
 *      operation costs nothing; the reservation is released in full and that is recorded
 *      as its own movement rather than as a missing one.
 *   4. **Never charge for a rejection.** An operation refused before execution — by the
 *      role table, by the plan, by the per-period cap or by the balance — writes a metering
 *      row and moves nothing.
 *   5. **Attribute every administrative change.** A credit adjustment or a subscription
 *      change is refused when the actor is the subject: an operator cannot grant themselves
 *      credits, which is the credit-system form of the self-approval rule the governance
 *      layer already enforces.
 *
 * `meter()` is the method a caller should reach for. It exists so the release-on-failure
 * rule does not depend on a handler remembering it: the work is passed in, and anything
 * other than a completed, chargeable outcome releases the reservation before the result —
 * or the error — leaves the service.
 *
 * **Balance arithmetic is never done here.** It lives in `applyDelta` (shared) and in the
 * repository's single guarded write statement, and both ports refuse a debit that would
 * cross zero. This
 * service decides *whether* to attempt a movement; it never computes a new balance.
 */

import { authorize, type Principal } from '../../packages/shared/src/auth/model.js';
import { AppError } from '../../packages/shared/src/core/errors.js';
import type { Logger } from '../../packages/shared/src/core/logging.js';
import {
  CREDIT_REASON_LABEL,
  MAX_MOVEMENT,
  expiryOperationId,
  grantOperationId,
  periodFor,
  planPeriodTurnover,
  refundOperationId,
  summariseLedger,
  type CreditReason,
  type LedgerTotals,
} from '../../packages/shared/src/usage/credits.js';
import {
  DENIAL_MEANING,
  resolveEntitlement,
  upgradeIsHonest,
  type EntitlementAllowance,
  type EntitlementDecision,
  type EntitlementRefusal,
} from '../../packages/shared/src/usage/entitlements.js';
import {
  FEATURES,
  featureFor,
  type FeatureDefinition,
  type FeatureId,
} from '../../packages/shared/src/usage/features.js';
import {
  DEFAULT_PLAN_ID,
  PLAN_CATALOGUE,
  defaultPlan,
  entitlementFor,
  resolvePlan,
  SUBSCRIPTION_STATUS_LABEL,
  type Plan,
  type SubscriptionStatus,
} from '../../packages/shared/src/usage/plans.js';
import type { CreditLedgerRow, UsageEventRow } from '../db/repositories/usage.js';
import type { UsageStore } from './store.js';

/** Sink for audit records; the composition root wires the project's audit log here. */
export interface UsageAuditSink {
  append(input: {
    correlationId: string;
    actor: string;
    event: string;
    severity: 'info' | 'warning' | 'critical';
    payload: Record<string, unknown>;
  }): Promise<void> | void;
}

export interface UsageServiceOptions {
  store: UsageStore;
  audit?: UsageAuditSink;
  logger?: Logger;
  now?: () => number;
}

/** What a caller must supply to be metered. */
export interface MeteringRequest {
  userId: string;
  featureId: string;
  /**
   * The idempotency key of this attempt.
   *
   * Required, and required to be the caller's own: an empty key would make every attempt
   * a fresh charge, and a shared key would make two different attempts one.
   */
  operationKey: string;
  /** The role table's answer for the feature's operation. Never derived here. */
  permissionGranted: boolean;
  correlationId: string | null;
  /** Recorded on the movement. The user id, or `system` for a scheduled grant. */
  actor: string;
}

export interface Reservation {
  featureId: FeatureId;
  featureLabel: string;
  credits: number;
  /** The ledger operation id, which is the caller's key. */
  operationId: string;
  operationKey: string;
  balanceAfter: number;
  /** The ledger row, or `null` when the capability costs nothing and moved nothing. */
  ledger: CreditLedgerRow | null;
  /** True when this call found an existing reservation rather than creating one. */
  replay: boolean;
}

export type MeterOutcome<T> =
  | { allowed: true; value: T; reservation: Reservation; settled: boolean }
  | { allowed: false; decision: EntitlementRefusal };

export interface UsageFeatureView {
  feature: FeatureDefinition;
  decision: EntitlementDecision;
  /** Whether a surface may honestly offer an upgrade for this refusal. */
  upgradeOffered: boolean;
  /** How many times the capability has been used in the current period. */
  usedThisPeriod: number;
  periodLimit: number | null;
}

export interface UsageStatusView {
  plan: Plan;
  /** The stored status, or `active` when no subscription row exists (the free default). */
  subscriptionStatus: SubscriptionStatus;
  subscriptionLabel: string;
  /** False when nothing has been recorded, so the default is being reported as a default. */
  subscriptionRecorded: boolean;
  balance: number;
  lifetime: { granted: number; consumed: number };
  period: { key: string; startAt: string; endAt: string; resetsAt: string };
  totals: LedgerTotals;
  features: UsageFeatureView[];
  /** True when a restart would lose the balance, reported rather than implied. */
  durable: boolean;
  storeKind: 'sqlite' | 'memory';
  /** True when the plan cannot be paid for in this build, so no purchase may be offered. */
  purchasable: false;
  note: string;
}

export interface UsageHistoryView {
  movements: CreditLedgerRow[];
  attempts: UsageEventRow[];
  totals: LedgerTotals;
  note: string;
}

const STATUS_NOTE =
  'Balances, allowances and entitlements are computed on the server from your stored plan and your own ledger. Nothing on this page is supplied by the client, and no model can change any of it.';

const HISTORY_NOTE =
  'Every movement is listed with the balance it produced, and every attempt — including the ones that were refused and the ones that cost nothing — is listed with its outcome. A movement is never edited; a correction is another movement.';

export class UsageService {
  private readonly store: UsageStore;
  private readonly audit: UsageAuditSink | undefined;
  private readonly logger: Logger | undefined;
  private readonly now: () => number;

  constructor(options: UsageServiceOptions) {
    this.store = options.store;
    this.audit = options.audit;
    this.logger = options.logger;
    this.now = options.now ?? (() => Date.now());
  }

  /* ---------------------------------------------------------------- */
  /* Reading                                                           */
  /* ---------------------------------------------------------------- */

  /** The plan catalogue. Public configuration: no user state is involved. */
  plans(): readonly Plan[] {
    return PLAN_CATALOGUE;
  }

  /**
   * The caller's own usage state, from the caller's own principal.
   *
   * The subject is taken from the session, never from a parameter, so reading another
   * account's balance is unrepresentable rather than merely forbidden. Reading it also
   * **ensures the period first**, so the balance a surface displays is the balance the
   * next request would see — a view that granted lazily on write would show a spent
   * balance at the start of every day.
   */
  async status(principal: Principal): Promise<UsageStatusView> {
    const userId = principal.id;
    const now = this.now();
    const subscription = await this.store.subscription(userId);
    const planId = subscription?.plan_id ?? DEFAULT_PLAN_ID;
    const subscriptionStatus: SubscriptionStatus = subscription?.status ?? 'active';

    const plan = resolvePlan(planId);
    if (plan !== null) await this.ensurePeriod(userId, plan, now);

    const effective = plan ?? defaultPlan();
    const account = await this.store.account(userId);
    const balance = account?.balance ?? 0;
    const period = periodFor(now, effective.reset);
    const movements = await this.store.ledger(userId, { limit: 500 });
    const used = await this.usedThisPeriod(userId, period.startMs);

    const permissions = new Map<string, boolean>();
    for (const feature of FEATURES) {
      if (feature.operation === null) continue;
      permissions.set(feature.id, authorize(principal, feature.operation, now).allowed);
    }

    const features: UsageFeatureView[] = FEATURES.map((feature) => {
      const periodLimit = entitlementFor(effective, feature.id)?.periodLimit ?? null;
      const decision = resolveEntitlement({
        planId,
        subscriptionStatus,
        featureId: feature.id,
        permissionGranted: permissions.get(feature.id) ?? true,
        balance,
        usage: { usedThisPeriod: used.get(feature.id) ?? 0, periodLimit },
      });
      return {
        feature,
        decision,
        upgradeOffered: upgradeIsHonest(decision),
        usedThisPeriod: used.get(feature.id) ?? 0,
        periodLimit,
      };
    });

    return {
      plan: effective,
      subscriptionStatus,
      subscriptionLabel: SUBSCRIPTION_STATUS_LABEL[subscriptionStatus],
      subscriptionRecorded: subscription !== null,
      balance,
      lifetime: {
        granted: account?.lifetime_granted ?? 0,
        consumed: account?.lifetime_consumed ?? 0,
      },
      period: {
        key: period.key,
        startAt: new Date(period.startMs).toISOString(),
        endAt: new Date(period.endMs).toISOString(),
        resetsAt: new Date(period.endMs).toISOString(),
      },
      totals: summariseLedger(movements),
      features,
      durable: this.store.durable,
      storeKind: this.store.kind,
      purchasable: false,
      note: STATUS_NOTE,
    };
  }

  /**
   * The ledger behind the balance.
   *
   * It brings the period in first, exactly as `status()` does, and that is a decision
   * rather than an oversight: a surface that shows 20 credits on the overview and an empty
   * history beside it would be two views of one account disagreeing about what happened.
   * The write it performs is the period's own, derived from the clock, claimed by an
   * operation id — so it happens once however often it is read.
   */
  async history(
    principal: Principal,
    options: { limit?: number; feature?: string } = {},
  ): Promise<UsageHistoryView> {
    await this.bringPeriodIn(principal.id, this.now());
    const [movements, attempts] = await Promise.all([
      this.store.ledger(principal.id, options),
      this.store.usageEvents(principal.id, options),
    ]);
    return { movements, attempts, totals: summariseLedger(movements), note: HISTORY_NOTE };
  }

  /**
   * How many times each capability was used in the current period.
   *
   * Counted from the ledger rather than kept as a counter: a counter is a second source of
   * truth that drifts the first time a movement is corrected, and this is a bounded read.
   * A released consumption is excluded — the operation did not happen, so it must not
   * count against a cap that exists to bound how much work was actually done.
   */
  private async usedThisPeriod(userId: string, startMs: number): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    const movements = await this.store.ledger(userId, { limit: 500 });
    for (const row of movements) {
      if (row.kind !== 'consume' || row.status === 'released' || row.feature === null) continue;
      const at = Date.parse(row.created_at);
      if (Number.isFinite(at) && at < startMs) continue;
      counts.set(row.feature, (counts.get(row.feature) ?? 0) + 1);
    }
    return counts;
  }

  /* ---------------------------------------------------------------- */
  /* The allowance                                                     */
  /* ---------------------------------------------------------------- */

  /**
   * Bring the account into the current period, idempotently.
   *
   * Expire first, then grant — and the grant is guarded by its own operation id rather
   * than by the account's period key, so a process that dies between the two steps is
   * repaired by the next call instead of leaving the account at zero for the rest of the
   * period. That distinction is the difference between an idempotency key and a flag.
   */
  /**
   * Bring the account into the current period, reading its plan on the way.
   *
   * Shared by the two read paths so a balance and the history behind it cannot be computed
   * against different periods. An unknown plan grants nothing: there is no allowance to
   * resolve from it, and inventing one would make a stored plan this build does not know
   * behave like a permissive one.
   */
  private async bringPeriodIn(userId: string, now: number): Promise<void> {
    const plan = resolvePlan((await this.store.subscription(userId))?.plan_id ?? DEFAULT_PLAN_ID);
    if (plan !== null) await this.ensurePeriod(userId, plan, now);
  }

  private async ensurePeriod(userId: string, plan: Plan, now: number): Promise<void> {
    const account = await this.store.account(userId);
    const period = periodFor(now, plan.reset);
    const turnover = planPeriodTurnover(
      { periodKey: account?.period_key ?? null, balance: account?.balance ?? 0 },
      period,
      plan.periodCredits,
    );

    if (turnover.expire !== null) {
      const expired = await this.store.applyCredit({
        userId,
        operationId: expiryOperationId(turnover.expire.forPeriod),
        kind: 'expire',
        reason: 'period-expiry',
        amount: turnover.expire.amount,
        periodKey: period.key,
        actor: 'system',
        correlationId: null,
      });
      if (expired.outcome === 'applied') {
        this.logger?.info(
          'expired the previous period allowance',
          { userId, credits: turnover.expire.amount, forPeriod: turnover.expire.forPeriod },
          'usage.period.expired',
        );
      }
    }

    if (turnover.grant.amount <= 0) return;
    const already = await this.store.ledgerByOperation(userId, turnover.grant.operationId);
    if (already !== null) return;

    const granted = await this.store.applyCredit({
      userId,
      operationId: turnover.grant.operationId,
      kind: 'grant',
      reason: 'plan-allowance',
      amount: turnover.grant.amount,
      periodKey: period.key,
      actor: 'system',
      correlationId: null,
    });
    if (granted.outcome === 'applied') {
      this.logger?.info(
        'granted the period allowance',
        { userId, plan: plan.id, credits: turnover.grant.amount, period: period.key },
        'usage.period.granted',
      );
    }
  }

  /* ---------------------------------------------------------------- */
  /* Metering                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * Claim the credits for one attempt, or say why not.
   *
   * `permissionGranted` is passed in rather than computed here, and that is deliberate:
   * the request pipeline already made that decision against a real session, and a second
   * decision made here could disagree with it. This layer may only narrow what the
   * pipeline allowed, which is the same composition direction the resolver enforces.
   */
  async reserve(
    request: MeteringRequest,
  ): Promise<
    | { allowed: true; reservation: Reservation; decision: EntitlementAllowance }
    | { allowed: false; decision: EntitlementRefusal }
  > {
    if (request.operationKey.trim().length === 0) {
      throw new AppError(
        'VALIDATION_FAILED',
        'A metered operation must supply an idempotency key.',
        {
          details: { field: 'operationKey' },
        },
      );
    }
    const feature = featureFor(request.featureId);
    const now = this.now();
    const subscription = await this.store.subscription(request.userId);
    const planId = subscription?.plan_id ?? DEFAULT_PLAN_ID;
    const subscriptionStatus: SubscriptionStatus = subscription?.status ?? 'active';
    const plan = resolvePlan(planId);

    if (plan !== null) await this.ensurePeriod(request.userId, plan, now);

    const effective = plan ?? defaultPlan();
    const period = periodFor(now, effective.reset);
    const balance = (await this.store.account(request.userId))?.balance ?? 0;
    const periodLimit =
      feature === null ? null : (entitlementFor(effective, feature.id)?.periodLimit ?? null);
    const used = await this.usedThisPeriod(request.userId, period.startMs);

    const decision = resolveEntitlement({
      planId,
      subscriptionStatus,
      featureId: request.featureId,
      permissionGranted: request.permissionGranted,
      balance,
      usage: {
        usedThisPeriod: feature === null ? 0 : (used.get(feature.id) ?? 0),
        periodLimit,
      },
    });

    if (!decision.allowed) {
      // A rejection before execution: a metering row, and no movement at all.
      await this.recordAttempt(request, feature, {
        status: 'refused',
        credits: 0,
        denial: decision.denial,
        note: DENIAL_MEANING[decision.denial],
      });
      return { allowed: false, decision };
    }

    if (decision.credits === 0) {
      await this.recordAttempt(request, feature, {
        status: 'settled',
        credits: 0,
        denial: null,
        note: `${decision.feature.label} costs nothing: ${decision.feature.costBasis}`,
      });
      return {
        allowed: true,
        decision,
        reservation: {
          featureId: decision.feature.id,
          featureLabel: decision.feature.label,
          credits: 0,
          operationId: request.operationKey,
          operationKey: request.operationKey,
          balanceAfter: balance,
          ledger: null,
          replay: false,
        },
      };
    }

    const applied = await this.store.applyCredit({
      userId: request.userId,
      operationId: request.operationKey,
      kind: 'consume',
      reason: 'metered-usage',
      amount: decision.credits,
      periodKey: period.key,
      feature: decision.feature.id,
      correlationId: request.correlationId,
      actor: request.actor,
      status: 'reserved',
    });

    if (applied.outcome === 'insufficient') {
      // A concurrent debit emptied the account between the decision and the claim. The
      // resolver runs again so the refusal carries the balance that actually exists.
      const settled = resolveEntitlement({
        planId,
        subscriptionStatus,
        featureId: request.featureId,
        permissionGranted: request.permissionGranted,
        balance: applied.balance,
        usage: {
          usedThisPeriod: feature === null ? 0 : (used.get(feature.id) ?? 0),
          periodLimit,
        },
      });
      await this.recordAttempt(request, feature, {
        status: 'refused',
        credits: 0,
        denial: 'insufficient-credits',
        note: DENIAL_MEANING['insufficient-credits'],
      });
      return {
        allowed: false,
        decision: settled.allowed
          ? {
              allowed: false,
              denial: 'insufficient-credits',
              feature: decision.feature,
              plan: decision.plan,
              credits: decision.credits,
              subscriptionStatus,
              reason: DENIAL_MEANING['insufficient-credits'],
              upgrade: null,
              upgradeWouldNotHelp: true,
              note: decision.note,
            }
          : settled,
      };
    }

    if (applied.outcome === 'applied') {
      await this.recordAttempt(request, feature, {
        status: 'reserved',
        credits: decision.credits,
        denial: null,
        note: `${decision.feature.label} holds ${decision.credits} credit(s) until it completes`,
      });
    }

    // A duplicate is the same reservation reported again, so no second attempt is
    // recorded: the attempt is identified by its operation key, and its outcome is
    // already on the row this call just read back.
    return {
      allowed: true,
      decision,
      reservation: {
        featureId: decision.feature.id,
        featureLabel: decision.feature.label,
        credits: decision.credits,
        operationId: request.operationKey,
        operationKey: request.operationKey,
        balanceAfter: applied.balance,
        ledger: applied.row,
        replay: applied.outcome === 'duplicate',
      },
    };
  }

  /**
   * Run a metered capability, and settle or return its reservation automatically.
   *
   * The work receives the reservation and returns whether it should be **charged**: a
   * capability that declined to produce anything — a blocked turn, a refused analysis —
   * returns `charge: false` and costs nothing. A throw releases the reservation and is
   * re-raised, so a failure costs nothing either, and neither case depends on the caller
   * remembering to clean up.
   */
  async meter<T>(
    request: MeteringRequest,
    work: (reservation: Reservation) => Promise<{ charge: boolean; value: T }>,
  ): Promise<MeterOutcome<T>> {
    const claimed = await this.reserve(request);
    if (!claimed.allowed) return { allowed: false, decision: claimed.decision };

    const { reservation } = claimed;
    let result: { charge: boolean; value: T };
    try {
      result = await work(reservation);
    } catch (error) {
      await this.release(request, reservation, 'the capability failed');
      throw error;
    }

    if (result.charge) {
      await this.settle(request, reservation);
      return { allowed: true, value: result.value, reservation, settled: true };
    }

    await this.release(request, reservation, 'the capability produced nothing');
    return { allowed: true, value: result.value, reservation, settled: false };
  }

  /** Keep the reservation. Idempotent: a second settle changes nothing. */
  async settle(request: MeteringRequest, reservation: Reservation): Promise<void> {
    if (reservation.credits === 0) return;
    const ledger = await this.store.settleReservation(
      request.userId,
      reservation.operationId,
      'settled',
    );
    await this.store.settleUsageEvent(
      request.userId,
      reservation.operationKey,
      'settled',
      `${reservation.featureLabel} completed and kept its ${reservation.credits} credit(s)`,
    );
    if (ledger.changed) {
      this.logger?.info(
        'settled a credit reservation',
        { userId: request.userId, feature: reservation.featureId, credits: reservation.credits },
        'usage.reservation.settled',
      );
    }
  }

  /**
   * Give the credits back.
   *
   * The refund is a movement, not a deletion: the original debit stays on the ledger with
   * its status moved to `released`, and the refund row beside it records that the credits
   * came back. That pair is what makes "the operation failed and cost nothing" checkable
   * rather than merely asserted — and the two rows are excluded from the period's totals
   * together, so a returned charge never reads as a charge that was spent.
   */
  async release(request: MeteringRequest, reservation: Reservation, reason: string): Promise<void> {
    if (reservation.credits === 0) return;
    const plan =
      resolvePlan((await this.store.subscription(request.userId))?.plan_id ?? DEFAULT_PLAN_ID) ??
      defaultPlan();
    const period = periodFor(this.now(), plan.reset);

    const refunded = await this.store.applyCredit({
      userId: request.userId,
      operationId: refundOperationId(reservation.operationId),
      kind: 'refund',
      reason: 'operation-failed',
      amount: reservation.credits,
      periodKey: period.key,
      feature: reservation.featureId,
      correlationId: request.correlationId,
      actor: 'system',
      // The pair is marked together: a released debit and its released refund cancel, so
      // the totals read as "this never cost anything" rather than as a spend plus income.
      status: 'released',
      countsAsConsumed: false,
    });
    await this.store.settleReservation(request.userId, reservation.operationId, 'released');
    await this.store.settleUsageEvent(
      request.userId,
      reservation.operationKey,
      'released',
      `${reservation.featureLabel} did not complete: ${reason}`,
    );
    if (refunded.outcome === 'applied') {
      this.logger?.info(
        'released a credit reservation',
        {
          userId: request.userId,
          feature: reservation.featureId,
          credits: reservation.credits,
          reason,
        },
        'usage.reservation.released',
      );
    }
  }

  private async recordAttempt(
    request: MeteringRequest,
    feature: FeatureDefinition | null,
    outcome: {
      status: 'reserved' | 'settled' | 'released' | 'refused';
      credits: number;
      denial: string | null;
      note: string | null;
    },
  ): Promise<void> {
    await this.store.recordUsageEvent({
      userId: request.userId,
      feature: feature?.id ?? request.featureId,
      category: feature?.category ?? 'ai-analysis',
      status: outcome.status,
      credits: outcome.credits,
      denial: outcome.denial,
      operationKey: request.operationKey,
      correlationId: request.correlationId,
      actor: request.actor,
      note: outcome.note,
    });
  }

  /* ---------------------------------------------------------------- */
  /* Administration                                                    */
  /* ---------------------------------------------------------------- */

  /**
   * Adjust another account's credits.
   *
   * Three refusals before anything moves, and each is a real protection rather than a
   * formality: the actor may not be the subject (a credit grant is a spend authorization,
   * and self-authorization is the failure the governance layer already refuses), a
   * reference is required (an adjustment with no ticket is an unexplained movement), and
   * the amount is bounded and non-zero. The route above this one additionally requires the
   * `usage.credits.manage` operation, so the check here is the second of two.
   */
  async adjust(input: {
    targetUserId: string;
    actorId: string;
    amount: number;
    reference: string;
    correlationId: string | null;
  }): Promise<{ row: CreditLedgerRow; balance: number }> {
    if (input.actorId === input.targetUserId) {
      throw new AppError(
        'FORBIDDEN',
        'An operator may not adjust their own credits: a credit grant is a spend authorization, and authorizing it for yourself is exactly what the approval gate exists to prevent.',
        { details: { targetUserId: input.targetUserId } },
      );
    }
    if (
      !Number.isInteger(input.amount) ||
      input.amount === 0 ||
      Math.abs(input.amount) > MAX_MOVEMENT
    ) {
      throw new AppError(
        'VALIDATION_FAILED',
        `An adjustment must be a non-zero whole number of at most ${MAX_MOVEMENT} credits.`,
        { details: { field: 'amount', limit: MAX_MOVEMENT } },
      );
    }
    if (input.reference.trim().length < 8) {
      throw new AppError(
        'VALIDATION_FAILED',
        'An adjustment must carry a reference of at least 8 characters: the decision it rests on.',
        { details: { field: 'reference' } },
      );
    }

    const subscription = await this.store.subscription(input.targetUserId);
    const planId = subscription?.plan_id ?? DEFAULT_PLAN_ID;
    const plan = resolvePlan(planId);
    const now = this.now();
    if (plan !== null) await this.ensurePeriod(input.targetUserId, plan, now);
    const period = periodFor(now, (plan ?? defaultPlan()).reset);

    const applied = await this.store.applyCredit({
      userId: input.targetUserId,
      operationId: `adjust:${input.reference.trim()}`,
      kind: 'adjustment',
      reason: 'admin-adjustment',
      amount: input.amount,
      periodKey: period.key,
      actor: `operator:${input.actorId}`,
      correlationId: input.correlationId,
    });

    if (applied.outcome === 'insufficient') {
      throw new AppError(
        'BUDGET_EXCEEDED',
        'The adjustment would take the account below zero, so nothing was changed.',
        {
          details: {
            targetUserId: input.targetUserId,
            balance: applied.balance,
            shortfall: applied.shortfall,
          },
        },
      );
    }

    await this.auditChange({
      correlationId: input.correlationId,
      actor: input.actorId,
      event: 'usage.credits.adjusted',
      severity: 'warning',
      payload: {
        targetUserId: input.targetUserId,
        credits: input.amount,
        reference: input.reference.trim(),
        balanceAfter: applied.balance,
        replayed: applied.outcome === 'duplicate',
      },
    });

    return { row: applied.row, balance: applied.balance };
  }

  /**
   * Change another account's plan or subscription status.
   *
   * A plan change is the same class of act as a credit adjustment — it changes what the
   * account may consume — so it carries the same refusals and the same audit record. The
   * audit payload states that no purchase took place, because there is no payment
   * integration in this build: what this route records is a decision by an operator, and
   * the record must not be mistakable for a receipt.
   */
  async changeSubscription(input: {
    targetUserId: string;
    actorId: string;
    planId: string;
    status: SubscriptionStatus;
    reference: string;
    correlationId: string | null;
  }): Promise<{ plan: Plan; status: SubscriptionStatus; balance: number }> {
    if (input.actorId === input.targetUserId) {
      throw new AppError('FORBIDDEN', 'An operator may not change their own subscription.', {
        details: { targetUserId: input.targetUserId },
      });
    }
    const plan = resolvePlan(input.planId);
    if (plan === null) {
      throw new AppError('NOT_FOUND', `No plan is defined with id "${input.planId}".`, {
        details: { field: 'planId' },
      });
    }
    if (!plan.active) {
      throw new AppError(
        'POLICY_VIOLATION',
        `Plan "${plan.id}" is retired and cannot be assigned.`,
        {
          details: { planId: plan.id },
        },
      );
    }
    if (input.reference.trim().length < 8) {
      throw new AppError(
        'VALIDATION_FAILED',
        'A subscription change must carry a reference of at least 8 characters.',
        { details: { field: 'reference' } },
      );
    }

    const now = this.now();
    const period = periodFor(now, plan.reset);
    const row = await this.store.upsertSubscription({
      userId: input.targetUserId,
      planId: plan.id,
      status: input.status,
      billingPeriod: plan.billingPeriod,
      currentPeriodStart: new Date(period.startMs).toISOString(),
      currentPeriodEnd: new Date(period.endMs).toISOString(),
      changedBy: `operator:${input.actorId}`,
    });
    // Read back rather than report the actor's own balance: a caller must never be shown
    // a number that belongs to a different account.
    const target = await this.store.account(input.targetUserId);

    await this.auditChange({
      correlationId: input.correlationId,
      actor: input.actorId,
      event: 'usage.subscription.changed',
      severity: 'warning',
      payload: {
        targetUserId: input.targetUserId,
        planId: row.plan_id,
        status: row.status,
        reference: input.reference.trim(),
        // Stated so the record cannot be read as a purchase.
        purchase: null,
        note: 'Recorded as an administrative grant. No payment was taken — no payment integration exists in this build.',
      },
    });

    return { plan, status: input.status, balance: target?.balance ?? 0 };
  }

  private async auditChange(input: {
    correlationId: string | null;
    actor: string;
    event: string;
    severity: 'info' | 'warning' | 'critical';
    payload: Record<string, unknown>;
  }): Promise<void> {
    if (this.audit === undefined) return;
    await this.audit.append({
      correlationId: input.correlationId ?? 'uncorrelated',
      actor: input.actor,
      event: input.event,
      severity: input.severity,
      payload: input.payload,
    });
  }

  /** Reason wording for a surface, so a ledger row can explain itself. */
  reasonLabel(reason: CreditReason): string {
    return CREDIT_REASON_LABEL[reason];
  }
}

/** Re-exported so a composition root can wire the period keys as one import. */
export { grantOperationId, expiryOperationId, refundOperationId };
