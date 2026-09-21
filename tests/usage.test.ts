/**
 * The credit domain, pure and deterministic.
 *
 * The claims this suite exists to defend — each of them a rule a later change could quietly
 * break, because every one of them is a *refusal* that nothing else would notice:
 *
 *   1. **No plan can be bought.** `purchasable` is false and `price` is null for every plan,
 *      and the catalogue refuses to load if that stops being true. Without this check the
 *      first plan that acquired a price would be a way to take money for something no code
 *      in the repository can charge for.
 *   2. **No tier reaches an approval-gated operation.** The catalogue is checked against the
 *      real operation table, so a plan that included one would be a way to buy past a human
 *      decision.
 *   3. **A balance is never negative, and that is arithmetic rather than a hope.** The rule
 *      lives in one function, and every caller of it inherits the rule.
 *   4. **A cost has a stated basis.** A number nobody can review is a price list.
 *   5. **Precedence is fixed and deliberate.** A held capability outranks an upgrade, an
 *      unreadable plan outranks a low balance, and a denied permission is never reported as
 *      something an upgrade would fix.
 *   6. **A period is derived from the clock.** Two processes on the same instant agree about
 *      which period they are in, because the key is computed rather than stored.
 *   7. **A returned charge cancels.** A released debit and its released refund net to zero,
 *      so a failure reads as "this never cost anything" rather than as a spend plus income.
 */

import { describe, expect, it } from 'vitest';
import {
  OPERATIONS,
  ROLE_PERMISSIONS,
  roleHasOperation,
} from '../packages/shared/src/auth/model.js';
import {
  MAX_BALANCE,
  MAX_MOVEMENT,
  applyDelta,
  applyMovement,
  assertMovement,
  canAfford,
  deltaFor,
  expiryOperationId,
  grantOperationId,
  periodFor,
  planPeriodTurnover,
  refundOperationId,
  summariseLedger,
} from '../packages/shared/src/usage/credits.js';
import {
  DENIAL_MEANING,
  ENTITLEMENT_DENIALS,
  resolveEntitlement,
  upgradeIsHonest,
} from '../packages/shared/src/usage/entitlements.js';
import {
  FEATURE_IDS,
  FEATURES,
  assertFeatureCatalogue,
  featureFor,
  meteredFeatures,
} from '../packages/shared/src/usage/features.js';
import {
  DEFAULT_PLAN_ID,
  ENTITLING_STATUSES,
  PLAN_CATALOGUE,
  PLANS_BY_ID,
  assertPlanCatalogue,
  cheapestPlanIncluding,
  defaultPlan,
  entitlementFor,
  nextPlanAbove,
  resolvePlan,
  type Plan,
} from '../packages/shared/src/usage/plans.js';

const DAY = 86_400_000;
const NOW = Date.parse('2026-09-21T12:00:00.000Z');

function request(
  overrides: Partial<Parameters<typeof resolveEntitlement>[0]> = {},
): Parameters<typeof resolveEntitlement>[0] {
  return {
    planId: 'free',
    subscriptionStatus: 'active',
    featureId: 'agent.chat',
    permissionGranted: true,
    balance: 20,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* The catalogue                                                       */
/* ------------------------------------------------------------------ */

describe('the plan catalogue', () => {
  it('loads, and prices nothing', () => {
    expect(() => assertPlanCatalogue()).not.toThrow();
    for (const plan of PLAN_CATALOGUE) {
      expect(plan.purchasable).toBe(false);
      expect(plan.price).toBe(null);
    }
  });

  it('refuses a catalogue in which a plan became purchasable', () => {
    const broken = { ...defaultPlan(), purchasable: true } as unknown as Plan;
    expect(() => assertPlanCatalogue([broken])).toThrow(/purchasable/);
  });

  it('refuses a plan that charges a price without a payment integration', () => {
    const broken = { ...defaultPlan(), price: 19 } as unknown as Plan;
    expect(() => assertPlanCatalogue([broken])).toThrow(/purchasable/);
  });

  it('refuses to load if a plan includes an approval-gated operation', () => {
    // The rule is checked against the real operation table, not against a copy of it, and
    // it is checked at boot — an invariant nothing calls is documentation.
    const backtest = OPERATIONS['backtest.run'];
    expect(backtest.requiresApproval).toBe(true);

    // No shipped tier includes it, precisely because a plan may never buy past a human
    // decision.
    for (const plan of PLAN_CATALOGUE) {
      expect(entitlementFor(plan, 'backtest.run')?.included).toBe(false);
    }

    // And the check has teeth: a plan that included it is refused.
    const premium = PLANS_BY_ID.premium;
    const broken = {
      ...premium,
      entitlements: premium.entitlements.map((entry) =>
        entry.feature === 'backtest.run'
          ? { feature: entry.feature, included: true, periodLimit: 2 }
          : entry,
      ),
    } as unknown as Plan;
    expect(() => assertPlanCatalogue([broken])).toThrow(/approval-gated/);
  });

  it('resolves an unknown plan to null rather than to a permissive default', () => {
    expect(resolvePlan('enterprise')).toBe(null);
    expect(resolvePlan(DEFAULT_PLAN_ID)?.id).toBe('free');
  });

  it('declares one allowance per period and one reset policy per plan', () => {
    for (const plan of PLAN_CATALOGUE) {
      expect(Number.isInteger(plan.periodCredits)).toBe(true);
      expect(plan.periodCredits).toBeGreaterThan(0);
      expect(plan.reset.carryOver).toBe('expire');
      expect(['daily', 'monthly', 'none']).toContain(plan.reset.cadence);
    }
  });

  it('gives the free plan the deterministic capabilities and no more', () => {
    const free = defaultPlan();
    expect(entitlementFor(free, 'quality.assess')?.included).toBe(true);
    expect(entitlementFor(free, 'agent.chat')?.included).toBe(true);
    expect(entitlementFor(free, 'backtest.run')?.included).toBe(false);
    // Held for a review rather than for a tier: no plan may include it.
    for (const plan of PLAN_CATALOGUE) {
      expect(entitlementFor(plan, 'memory.export')?.included).toBe(false);
    }
  });

  it('names the cheapest plan that would help, and the next plan up', () => {
    expect(cheapestPlanIncluding('portfolio.analysis')?.id).toBe('premium');
    expect(cheapestPlanIncluding('memory.export')).toBe(null);
    expect(nextPlanAbove(defaultPlan())?.id).toBe('premium');
    expect(nextPlanAbove(PLANS_BY_ID.premium)).toBe(null);
  });
});

describe('the feature catalogue', () => {
  it('loads, and gives every cost a stated basis', () => {
    expect(() => assertFeatureCatalogue()).not.toThrow();
    for (const feature of FEATURES) {
      expect(feature.costBasis.length).toBeGreaterThan(20);
      expect(Number.isInteger(feature.creditCost)).toBe(true);
      expect(feature.creditCost).toBeGreaterThanOrEqual(0);
    }
  });

  it('refuses a fractional or negative cost', () => {
    const base = FEATURES[0]!;
    expect(() => assertFeatureCatalogue([{ ...base, creditCost: 1.5 }])).toThrow(/non-integer/);
    expect(() => assertFeatureCatalogue([{ ...base, creditCost: -1 }])).toThrow(/non-integer/);
  });

  it('refuses a cost with no stated basis', () => {
    const base = FEATURES[0]!;
    expect(() => assertFeatureCatalogue([{ ...base, costBasis: 'because' }])).toThrow(/basis/);
  });

  it('refuses an available capability with no operation to check', () => {
    const base = FEATURES[0]!;
    expect(() =>
      assertFeatureCatalogue([{ ...base, state: 'available', operation: null }]),
    ).toThrow(/no operation/);
  });

  it('prices the deterministic capability at zero, and says why', () => {
    const quality = featureFor('quality.assess');
    expect(quality?.creditCost).toBe(0);
    expect(quality?.usesModel).toBe(false);
    // The free capabilities are the point: they must keep working with a spent allowance.
    expect(meteredFeatures().map((feature) => feature.id)).not.toContain('quality.assess');
  });

  it('keeps a held capability apart from an unbuilt one', () => {
    expect(featureFor('memory.export')?.state).toBe('disabled');
    expect(featureFor('memory.export')?.stateReason).toMatch(/review/);
    expect(featureFor('backtest.run')?.state).toBe('coming-soon');
    expect(featureFor('backtest.run')?.stateReason).toBeTruthy();
  });

  it('declares no capability that is not on the surface', () => {
    // Every feature the resolver can be asked about is declared once, and only once.
    expect(new Set(FEATURE_IDS).size).toBe(FEATURE_IDS.length);
    expect(featureFor('not.a.feature')).toBe(null);
  });
});

/* ------------------------------------------------------------------ */
/* Credit arithmetic                                                   */
/* ------------------------------------------------------------------ */

describe('credit arithmetic', () => {
  it('moves a balance by kind, with the sign decided by the kind', () => {
    expect(deltaFor('grant', 5)).toBe(5);
    expect(deltaFor('refund', 5)).toBe(5);
    expect(deltaFor('consume', 5)).toBe(-5);
    expect(deltaFor('expire', 5)).toBe(-5);
    // An adjustment carries its own direction: a correction goes either way.
    expect(deltaFor('adjustment', -5)).toBe(-5);
  });

  it('refuses a debit that would cross zero, and reports the shortfall', () => {
    const refused = applyDelta(3, -5);
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error('unreachable');
    expect(refused.reason).toBe('insufficient-credits');
    expect(refused.balance).toBe(3);
    expect(refused.shortfall).toBe(2);
  });

  it('refuses a movement that is not a whole, non-zero, bounded number', () => {
    expect(() => assertMovement({ kind: 'consume', reason: 'metered-usage', amount: 1.5 })).toThrow(
      /whole number/,
    );
    expect(() => assertMovement({ kind: 'consume', reason: 'metered-usage', amount: 0 })).toThrow(
      /not a movement/,
    );
    expect(() =>
      assertMovement({ kind: 'grant', reason: 'plan-allowance', amount: MAX_MOVEMENT + 1 }),
    ).toThrow(/limited to/);
  });

  it('lets only an adjustment carry a sign, and only an adjustment be administrative', () => {
    expect(() => assertMovement({ kind: 'consume', reason: 'metered-usage', amount: -5 })).toThrow(
      /signed amount/,
    );
    expect(() => assertMovement({ kind: 'grant', reason: 'admin-adjustment', amount: 5 })).toThrow(
      /administrative reason/,
    );
    expect(() =>
      assertMovement({ kind: 'adjustment', reason: 'metered-usage', amount: 5 }),
    ).toThrow(/administrative/);
  });

  it('keeps a balance under its ceiling, because a bound is the only cost control there is', () => {
    expect(applyDelta(MAX_BALANCE, 0).ok).toBe(true);
    expect(() => applyDelta(MAX_BALANCE, 1)).toThrow(/limited to/);
  });

  it('answers affordability with one rule, including for a free capability', () => {
    expect(canAfford(0, 0)).toBe(true);
    expect(canAfford(0, 1)).toBe(false);
    expect(canAfford(5, 5)).toBe(true);
  });

  it('applies a movement by kind and magnitude', () => {
    const outcome = applyMovement(10, { kind: 'consume', reason: 'metered-usage', amount: 3 });
    expect(outcome.ok && outcome.balance).toBe(7);
  });
});

describe('the period', () => {
  it('derives the key from the clock, so two processes agree', () => {
    const daily = periodFor(NOW, { cadence: 'daily', atHourUtc: 0, carryOver: 'expire' });
    expect(daily.key).toBe('d2026-09-21');
    expect(daily.startMs).toBe(Date.parse('2026-09-21T00:00:00.000Z'));
    expect(daily.endMs).toBe(daily.startMs + DAY);

    const monthly = periodFor(NOW, { cadence: 'monthly', atHourUtc: 0, carryOver: 'expire' });
    expect(monthly.key).toBe('m2026-09');
    expect(monthly.startMs).toBe(Date.parse('2026-09-01T00:00:00.000Z'));
    expect(monthly.endMs).toBe(Date.parse('2026-10-01T00:00:00.000Z'));

    const never = periodFor(NOW, { cadence: 'none', atHourUtc: 0, carryOver: 'expire' });
    expect(never.key).toBe('lifetime');
  });

  it('expires the previous allowance and always names this period’s grant', () => {
    const period = periodFor(NOW, { cadence: 'daily', atHourUtc: 0, carryOver: 'expire' });
    const turnover = planPeriodTurnover({ periodKey: 'd2026-09-20', balance: 4 }, period, 20);
    expect(turnover.expire).toEqual({ amount: 4, forPeriod: 'd2026-09-20' });
    expect(turnover.grant.amount).toBe(20);
    expect(turnover.grant.operationId).toBe(grantOperationId('d2026-09-21'));
  });

  it('grants on every call and expires only on a real turnover', () => {
    const period = periodFor(NOW, { cadence: 'daily', atHourUtc: 0, carryOver: 'expire' });
    const same = planPeriodTurnover({ periodKey: 'd2026-09-21', balance: 12 }, period, 20);
    expect(same.expire).toBe(null);
    // The grant is returned anyway: its idempotency is its operation id, not this decision,
    // so a turnover interrupted between the two steps is repaired by the next call.
    expect(same.grant.amount).toBe(20);

    // Nothing to expire when nothing is left.
    const spent = planPeriodTurnover({ periodKey: 'd2026-09-20', balance: 0 }, period, 20);
    expect(spent.expire).toBe(null);
    // Nor on the very first call for an account that has never been granted anything.
    const fresh = planPeriodTurnover({ periodKey: null, balance: 0 }, period, 20);
    expect(fresh.expire).toBe(null);
  });

  it('derives every operation id, so none can be chosen or replayed', () => {
    expect(grantOperationId('d2026-09-21')).toBe('grant:d2026-09-21');
    expect(expiryOperationId('d2026-09-20')).toBe('expire:d2026-09-20');
    expect(refundOperationId('turn:abc')).toBe('refund:turn:abc');
  });
});

describe('ledger summaries', () => {
  it('cancels a released debit with its released refund', () => {
    const totals = summariseLedger([
      { kind: 'grant', delta: 20, status: 'settled' },
      { kind: 'consume', delta: -5, status: 'released' },
      { kind: 'refund', delta: 5, status: 'released' },
      { kind: 'consume', delta: -1, status: 'settled' },
    ]);
    expect(totals.granted).toBe(20);
    // The returned charge is not reported as a charge that was spent...
    expect(totals.consumed).toBe(1);
    // ...and its return is not reported as income.
    expect(totals.refunded).toBe(0);
    expect(totals.net).toBe(19);
  });

  it('counts a reservation as spent, because the ledger holds the debit', () => {
    const totals = summariseLedger([{ kind: 'consume', delta: -25, status: 'reserved' }]);
    expect(totals.consumed).toBe(25);
    expect(totals.net).toBe(-25);
  });

  it('keeps an adjustment signed, so a correction in either direction is readable', () => {
    const totals = summariseLedger([
      { kind: 'adjustment', delta: -3, status: 'settled' },
      { kind: 'adjustment', delta: 7, status: 'settled' },
    ]);
    expect(totals.adjusted).toBe(4);
    expect(totals.net).toBe(4);
  });
});

/* ------------------------------------------------------------------ */
/* Entitlement resolution                                              */
/* ------------------------------------------------------------------ */

describe('entitlement resolution', () => {
  it('allows what the plan includes and the balance covers', () => {
    const decision = resolveEntitlement(request());
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) throw new Error('unreachable');
    expect(decision.credits).toBe(1);
    expect(decision.plan.id).toBe('free');
  });

  it('refuses an undeclared capability with nothing to resolve', () => {
    const decision = resolveEntitlement(request({ featureId: 'portfolio.trade' }));
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error('unreachable');
    expect(decision.denial).toBe('unknown-feature');
    expect(decision.feature).toBe(null);
    expect(decision.credits).toBe(0);
    // Nothing to upgrade to, because there is nothing declared to buy.
    expect(upgradeIsHonest(decision)).toBe(false);
  });

  it('lets a deliberate hold outrank an upgrade that would otherwise be offered', () => {
    const decision = resolveEntitlement(
      request({ featureId: 'memory.export', planId: 'premium', balance: 500 }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error('unreachable');
    expect(decision.denial).toBe('feature-disabled');
    // A held capability is not for sale: reporting it as an upgrade would be selling
    // something the product has decided not to ship.
    expect(upgradeIsHonest(decision)).toBe(false);
  });

  it('fails closed on a plan it cannot read rather than falling back to a default', () => {
    const decision = resolveEntitlement(request({ planId: 'enterprise' }));
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error('unreachable');
    expect(decision.denial).toBe('unknown-plan');
    expect(decision.plan).toBe(null);
  });

  it('applies no entitlement while the subscription is inactive', () => {
    for (const status of ['inactive', 'expired', 'pending', 'unknown'] as const) {
      const decision = resolveEntitlement(request({ subscriptionStatus: status }));
      expect(decision.allowed).toBe(false);
      if (decision.allowed) throw new Error('unreachable');
      expect(decision.denial).toBe('subscription-inactive');
      expect(ENTITLING_STATUSES).not.toContain(status);
    }
  });

  it('reports "not in your plan" as an upgrade, and says a paid tier would help', () => {
    const decision = resolveEntitlement(request({ featureId: 'portfolio.analysis' }));
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error('unreachable');
    expect(decision.denial).toBe('not-in-plan');
    expect(upgradeIsHonest(decision)).toBe(true);
  });

  it('never turns a denied permission into an upgrade', () => {
    const decision = resolveEntitlement(request({ permissionGranted: false }));
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error('unreachable');
    expect(decision.denial).toBe('permission-denied');
    expect(decision.upgrade).toBe(null);
    expect(decision.upgradeWouldNotHelp).toBe(true);
    expect(upgradeIsHonest(decision)).toBe(false);
    expect(decision.reason).toMatch(/cannot be resolved by upgrading/);
  });

  it('reports an unbuilt capability as a delivery gap, not as an upgrade', () => {
    const decision = resolveEntitlement(
      request({ featureId: 'portfolio.analysis', planId: 'premium', balance: 100 }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error('unreachable');
    expect(decision.denial).toBe('feature-coming-soon');
    expect(upgradeIsHonest(decision)).toBe(false);
  });

  it('keeps the approval-gated capability out of every tier, and says so', () => {
    // A backtest is a human decision rather than a feature, so no plan grants it — and the
    // refusal must not be dressed up as an upgrade, because upgrading would not help.
    const decision = resolveEntitlement(
      request({ featureId: 'backtest.run', planId: 'premium', balance: 500 }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error('unreachable');
    expect(decision.denial).toBe('not-in-plan');
    expect(cheapestPlanIncluding('backtest.run')).toBe(null);
    expect(upgradeIsHonest(decision)).toBe(false);
  });

  it('enforces the per-period cap separately from the balance', () => {
    const decision = resolveEntitlement(
      request({ usage: { usedThisPeriod: 20, periodLimit: 20 } }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error('unreachable');
    expect(decision.denial).toBe('period-limit-reached');
    expect(upgradeIsHonest(decision)).toBe(true);
    // One under the cap is still allowed.
    expect(
      resolveEntitlement(request({ usage: { usedThisPeriod: 19, periodLimit: 20 } })).allowed,
    ).toBe(true);
    // And a caller that does not know the usage is not refused on it.
    expect(resolveEntitlement(request()).allowed).toBe(true);
  });

  it('refuses when the balance does not cover the cost, without consuming anything', () => {
    const decision = resolveEntitlement(
      request({ planId: 'premium', featureId: 'portfolio.analysis', balance: 0 }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error('unreachable');
    // The plan includes it and it is not built, so the delivery gap is the answer — the
    // precedence is what keeps a backlog item from looking like a billing problem.
    expect(decision.denial).toBe('feature-coming-soon');

    // A working capability the plan includes, with a balance that does not cover it — and
    // the largest allowance being the one already held means there is nothing to offer.
    const unaffordable = resolveEntitlement(
      request({ planId: 'premium', featureId: 'agent.chat', balance: 0 }),
    );
    expect(unaffordable.allowed).toBe(false);
    if (unaffordable.allowed) throw new Error('unreachable');
    expect(unaffordable.denial).toBe('insufficient-credits');
    expect(upgradeIsHonest(unaffordable)).toBe(false);
    // The refusal still reports what the capability *would* cost, so a surface can say
    // what it takes — the number is declared, not charged.
    expect(decision.credits).toBe(featureFor('portfolio.analysis')?.creditCost);

    // The same refusal on a plan with somewhere to go is offered as an upgrade, because a
    // larger allowance is genuinely what would resolve it.
    const upgradeable = resolveEntitlement(
      request({ planId: 'free', featureId: 'agent.chat', balance: 0 }),
    );
    expect(upgradeable.allowed).toBe(false);
    if (upgradeable.allowed) throw new Error('unreachable');
    expect(upgradeable.denial).toBe('insufficient-credits');
    expect(upgradeIsHonest(upgradeable)).toBe(true);
    expect(upgradeable.upgrade?.id).toBe('premium');
  });

  it('refuses a non-integer balance as unaffordable rather than trusting it', () => {
    const decision = resolveEntitlement(request({ balance: 1.5 }));
    expect(decision.allowed).toBe(false);
  });

  it('ships the meaning of every refusal with the decision', () => {
    for (const denial of ENTITLEMENT_DENIALS) {
      expect(DENIAL_MEANING[denial].length).toBeGreaterThan(20);
    }
    expect(new Set(Object.values(DENIAL_MEANING)).size).toBe(ENTITLEMENT_DENIALS.length);
  });
});

describe('the operation table', () => {
  it('declares the usage operations, and grants them by role', () => {
    expect(roleHasOperation('student', 'usage.read')).toBe(true);
    expect(roleHasOperation('observer', 'usage.read')).toBe(true);
    // Adjusting somebody else's credits is the owner's alone, and even then needs approval.
    expect(ROLE_PERMISSIONS.student).not.toContain('usage.adjust');
    expect(ROLE_PERMISSIONS.coach).not.toContain('usage.adjust');
    expect(ROLE_PERMISSIONS.owner).toContain('usage.adjust');
    expect(OPERATIONS['usage.adjust'].requiresApproval).toBe(true);
    expect(OPERATIONS['usage.adjust'].sensitivity).toBe('sensitive');
  });

  it('adds no way to spend money without a human decision', () => {
    // The credit system introduces no operation that touches a broker or takes a payment:
    // a payment operation would need a payment integration, and this phase has none.
    expect(
      Object.keys(OPERATIONS).filter((id) => /payment|purchase|subscribe|charge|invoice/i.test(id)),
    ).toEqual([]);
  });
});
