/**
 * Usage, credits and subscription handlers.
 *
 * Thin by design, like the profile and quality handlers: the pipeline already
 * authenticated, authorized and validated, so this reads the caller's own state and shapes
 * the answer.
 *
 * Four behaviours that are decisions rather than plumbing:
 *
 *   1. **The subject is the principal, always.** The read routes take no user id, so
 *      reading somebody else's balance is not expressible. The two administrative routes
 *      *do* take one — that is their whole purpose — and are reachable only through
 *      `usage.adjust`, which is approval-gated, plus the service's refusal to let an
 *      operator act on their own account.
 *   2. **No store, no answer.** With no usage store the read routes refuse with
 *      `PROVIDER_UNAVAILABLE` naming the missing capability, rather than reporting a
 *      balance of zero for an account that may well have one.
 *   3. **The refusal travels with the decision.** Every feature carries the meaning of its
 *      refusal, shipped from the shared catalogue, so a surface cannot invent an
 *      explanation and cannot show a paid upgrade where none would help.
 *   4. **The log carries no balances and no references.** An operator's reference is free
 *      text; it goes to the audit record, which has its own rules, and never into a log
 *      line here.
 */

import { AppError } from '../../../packages/shared/src/core/errors.js';
import type {
  UsageAdminData,
  UsageHistoryData,
  UsageStatusData,
} from '../../../packages/shared/src/api/contracts.js';
import type {
  UsageAdjustBody,
  UsageHistoryQuery,
  UsageSubscriptionBody,
} from '../../../packages/shared/src/api/schemas.js';
import type { Principal } from '../../../packages/shared/src/auth/model.js';
import type { Plan } from '../../../packages/shared/src/usage/plans.js';
import type { UsageService, UsageStatusView } from '../../usage/service.js';
import type { RouteHandler } from '../context.js';

export interface UsageHandlerDeps {
  /** Absent when the server runs without a usage store. */
  usage?: UsageService | undefined;
  now?: (() => number) | undefined;
}

function service(deps: UsageHandlerDeps): UsageService {
  if (deps.usage === undefined) {
    throw new AppError(
      'PROVIDER_UNAVAILABLE',
      'No usage store is configured: the server was started without one, so there is no balance to report.',
      { details: { capability: 'usage.store' } },
    );
  }
  return deps.usage;
}

function principalOf(context: { principal: Principal | null }): Principal {
  if (context.principal === null) {
    throw new AppError('UNAUTHENTICATED', 'Usage is reported for an authenticated account.');
  }
  return context.principal;
}

/** The catalogue entry, as the API reports it. Prices are `null`: none can be charged. */
function planView(plan: Plan): UsageStatusData['plans'][number] {
  return {
    id: plan.id,
    displayName: plan.displayName,
    tagline: plan.tagline,
    active: plan.active,
    billingPeriod: plan.billingPeriod,
    periodCredits: plan.periodCredits,
    resetCadence: plan.reset.cadence,
    carryOver: plan.reset.carryOver,
    purchasable: false,
    price: null,
    entitlements: plan.entitlements.map((entry) => ({
      feature: entry.feature,
      included: entry.included,
      periodLimit: entry.periodLimit,
    })),
    mayNot: [...plan.mayNot],
    notes: [...plan.notes],
  };
}

export function usageStatusView(view: UsageStatusView, plans: readonly Plan[]): UsageStatusData {
  return {
    plan: planView(view.plan),
    plans: plans.map(planView),
    subscriptionStatus: view.subscriptionStatus,
    subscriptionLabel: view.subscriptionLabel,
    subscriptionRecorded: view.subscriptionRecorded,
    balance: view.balance,
    lifetime: view.lifetime,
    period: view.period,
    totals: view.totals,
    features: view.features.map((entry) => ({
      id: entry.feature.id,
      label: entry.feature.label,
      description: entry.feature.description,
      category: entry.feature.category,
      creditCost: entry.feature.creditCost,
      costBasis: entry.feature.costBasis,
      state: entry.feature.state,
      stateReason: entry.feature.stateReason,
      operation: entry.feature.operation,
      allowed: entry.decision.allowed,
      denial: entry.decision.allowed ? null : entry.decision.denial,
      reason: entry.decision.reason,
      upgradeOffered: entry.upgradeOffered,
      upgradePlanId: entry.decision.allowed ? null : (entry.decision.upgrade?.id ?? null),
      usedThisPeriod: entry.usedThisPeriod,
      periodLimit: entry.periodLimit,
    })),
    durable: view.durable,
    storeKind: view.storeKind,
    purchasable: false,
    note: view.note,
  };
}

export function usageStatusHandler(deps: UsageHandlerDeps): RouteHandler<never, UsageStatusData> {
  return async ({ context }) => {
    const usage = service(deps);
    const principal = principalOf(context);
    const view = await usage.status(principal);
    context.logger.info(
      'usage reported',
      {
        userId: principal.id,
        plan: view.plan.id,
        subscriptionRecorded: view.subscriptionRecorded,
        durable: view.durable,
        storeKind: view.storeKind,
        // A count, not a number: how much is left is the user's business, and a log line
        // is not a place it needs to be.
        features: view.features.length,
        blocked: view.features.filter((entry) => !entry.decision.allowed).length,
      },
      'usage.read',
    );
    return { data: usageStatusView(view, usage.plans()) };
  };
}

export function usageHistoryHandler(deps: UsageHandlerDeps): RouteHandler<never, UsageHistoryData> {
  return async ({ context, query }) => {
    const usage = service(deps);
    const principal = principalOf(context);
    const filters = query as UsageHistoryQuery;
    const history = await usage.history(principal, {
      ...(filters.limit === undefined ? {} : { limit: filters.limit }),
      ...(filters.feature === undefined ? {} : { feature: filters.feature }),
    });
    return {
      data: {
        movements: history.movements.map((row) => ({
          id: row.id,
          kind: row.kind,
          status: row.status,
          reason: row.reason,
          reasonLabel: usage.reasonLabel(row.reason),
          delta: row.delta,
          balanceAfter: row.balance_after,
          feature: row.feature,
          correlationId: row.correlation_id,
          actor: row.actor,
          createdAt: row.created_at,
        })),
        attempts: history.attempts.map((row) => ({
          id: row.id,
          feature: row.feature,
          category: row.category,
          status: row.status,
          credits: row.credits,
          denial: row.denial,
          correlationId: row.correlation_id,
          occurredAt: row.occurred_at,
          settledAt: row.settled_at,
          note: row.note,
        })),
        totals: history.totals,
        note: history.note,
      },
    };
  };
}

/**
 * `POST /v1/usage/credits/adjust`
 *
 * The audit record is written by the service, together with the movement, so a movement
 * cannot exist without the record that explains it.
 */
export function usageCreditsAdjustHandler(
  deps: UsageHandlerDeps,
): RouteHandler<UsageAdjustBody, UsageAdminData> {
  return async ({ context, body }) => {
    const usage = service(deps);
    const principal = principalOf(context);
    const result = await usage.adjust({
      targetUserId: body.userId,
      actorId: principal.id,
      amount: body.amount,
      reference: body.reference,
      correlationId: context.correlationId,
    });
    context.logger.warn(
      'credits adjusted',
      {
        actorId: principal.id,
        targetUserId: body.userId,
        credits: body.amount,
        approvalId: context.approvalId,
        movementId: result.row.id,
      },
      'usage.credits.adjusted',
    );
    return {
      data: {
        userId: body.userId,
        balance: result.balance,
        change: {
          kind: 'credits',
          credits: body.amount,
          reference: body.reference,
          purchase: null,
        },
        note: 'Applied as an administrative adjustment under a recorded approval. Credits are never granted or removed silently, and the reference is kept in the audit record.',
      },
    };
  };
}

/**
 * `POST /v1/usage/subscription`
 *
 * The plan catalogue is code, so this changes *which* plan an account is on, and never
 * what a plan allows. No payment is taken, and the response says so rather than leaving a
 * surface to imply otherwise.
 */
export function usageSubscriptionHandler(
  deps: UsageHandlerDeps,
): RouteHandler<UsageSubscriptionBody, UsageAdminData> {
  return async ({ context, body }) => {
    const usage = service(deps);
    const principal = principalOf(context);
    const result = await usage.changeSubscription({
      targetUserId: body.userId,
      actorId: principal.id,
      planId: body.planId,
      status: body.status,
      reference: body.reference,
      correlationId: context.correlationId,
    });
    context.logger.warn(
      'subscription changed',
      {
        actorId: principal.id,
        targetUserId: body.userId,
        planId: result.plan.id,
        status: result.status,
        approvalId: context.approvalId,
      },
      'usage.subscription.changed',
    );
    return {
      data: {
        userId: body.userId,
        // The target's balance, read back after the change — never the actor's, and never
        // a number supplied by the caller.
        balance: result.balance,
        change: {
          kind: 'subscription',
          planId: result.plan.id,
          status: result.status,
          reference: body.reference,
          purchase: null,
        },
        note: 'Recorded as an administrative grant under a recorded approval. No payment was taken: this build has no payment integration, and the plan catalogue declares every plan as not purchasable.',
      },
    };
  };
}
