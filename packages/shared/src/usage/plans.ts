/**
 * Subscription plans.
 *
 * **Plans are code, not rows.** A plan decides what a user may consume, and an
 * entitlement composed with the role table is part of the authorization boundary. A
 * writable table would make that boundary mutable by a database write; a constant
 * makes it reviewable, tested and revertible by a deploy. The consequence is stated
 * plainly rather than hidden: changing an allowance is a code change plus a
 * migration, and the trigger for revisiting that is in ADR-0045.
 *
 * What *is* stored is which plan a user is on (see `subscriptions`), because that is
 * a fact about a user rather than a rule about the product.
 *
 * The non-escalation rule is the load-bearing one, and it is enforced in three places
 * rather than described in one:
 *
 *   - `assertPlanCatalogue()` refuses a catalogue in which a plan includes a feature
 *     whose operation is `critical` — a tier may never reach an operation the role
 *     table treats as requiring human approval;
 *   - `resolveEntitlement()` (see `entitlements.ts`) has no path where `included`
 *     beats a denied permission;
 *   - the plan's own `mayNot` list states, in words, what every plan is forbidden to
 *     do, so a reviewer can check the intention without reading the resolver.
 *
 * **No plan is purchasable in this build.** `purchasable: false` and `price: null` are
 * the honest values: there is no payment integration, so no price can be charged and
 * none is displayed as if it could be.
 */

import { OPERATIONS, type OperationId } from '../auth/model.js';
import { FEATURE_IDS, assertFeatureCatalogue, featureFor, type FeatureId } from './features.js';

export const PLAN_IDS = ['free', 'premium'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

/** Billing cadence. `none` is a plan that is not billed at all. */
export const BILLING_PERIODS = ['none', 'monthly', 'annual'] as const;
export type BillingPeriod = (typeof BILLING_PERIODS)[number];

/**
 * The stored subscription state. `unknown` is a real value, not a default: it is what
 * a read that found nothing resolves to, and it denies.
 */
export const SUBSCRIPTION_STATUSES = [
  'active',
  'inactive',
  'expired',
  'pending',
  'unknown',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const SUBSCRIPTION_STATUS_LABEL: Readonly<Record<SubscriptionStatus, string>> = {
  active: 'Active',
  inactive: 'Not subscribed',
  expired: 'Expired',
  pending: 'Pending',
  unknown: 'Unknown',
};

/** Statuses that entitle anything at all. Deny-by-default: everything else denies. */
export const ENTITLING_STATUSES: readonly SubscriptionStatus[] = ['active'];

export interface ResetPolicy {
  /** When the allowance is renewed. `none` means the grant never repeats. */
  cadence: 'daily' | 'monthly' | 'none';
  /** Hour of the UTC day the period turns over. Only 0 is implemented. */
  atHourUtc: 0;
  /**
   * What happens to credits left over.
   *
   * `expire` is the implemented rule and the honest one for an allowance: free credits
   * are a daily budget, not a balance, so they do not accumulate into a hoard that
   * makes the allowance meaningless. Credits that must never expire are a purchase,
   * and purchases do not exist in this build.
   */
  carryOver: 'expire';
}

export interface FeatureEntitlement {
  feature: FeatureId;
  /** False means the plan does not include it, whatever the balance is. */
  included: boolean;
  /**
   * How many invocations this plan includes in one period, or `null` for "not limited
   * separately" (which is only honest for a feature that costs nothing).
   */
  periodLimit: number | null;
}

export interface Plan {
  id: PlanId;
  displayName: string;
  tagline: string;
  /** False retires a plan: `resolvePlan` still returns it, and it still denies. */
  active: boolean;
  billingPeriod: BillingPeriod;
  /** Credits granted at the start of every period. Integer. */
  periodCredits: number;
  reset: ResetPolicy;
  entitlements: readonly FeatureEntitlement[];
  /** Always `null` in this build: no payment integration exists, so no price can be charged. */
  price: null;
  purchasable: false;
  /** What this plan is forbidden to do, in words a reviewer can check. */
  mayNot: readonly string[];
  notes: readonly string[];
}

const freeEntitlements: readonly FeatureEntitlement[] = FEATURE_IDS.map((feature) => {
  if (feature === 'agent.chat') return { feature, included: true, periodLimit: 20 };
  if (feature === 'quality.assess') return { feature, included: true, periodLimit: null };
  // Composition costs nothing, so it is on every plan including this one: gating a free
  // calculation behind a tier would make the tier the price of arithmetic.
  if (feature === 'portfolio.composition') return { feature, included: true, periodLimit: null };
  // Measuring a decision the user recorded is arithmetic over their own record, so it is
  // on every plan for the same reason composition is: a tier may not be the price of
  // arithmetic.
  if (feature === 'decision.evaluation') return { feature, included: true, periodLimit: null };
  return { feature, included: false, periodLimit: null };
});

const premiumEntitlements: readonly FeatureEntitlement[] = [
  { feature: 'agent.chat', included: true, periodLimit: 200 },
  { feature: 'quality.assess', included: true, periodLimit: null },
  { feature: 'portfolio.composition', included: true, periodLimit: null },
  { feature: 'decision.evaluation', included: true, periodLimit: null },
  { feature: 'portfolio.analysis', included: true, periodLimit: 20 },
  { feature: 'research.report', included: true, periodLimit: 5 },
  // Deliberately included by **no** tier: `backtest.run` is approval-gated, so it is a
  // human decision rather than a feature, and `assertPlanCatalogue` refuses a catalogue in
  // which a plan includes it. Selling one would be selling a way past an approval.
  { feature: 'backtest.run', included: false, periodLimit: null },
  { feature: 'dataset.process', included: true, periodLimit: 5 },
  // Held for the data-protection review rather than for a plan: no tier may export
  // before the retention duties behind it are settled, so `included` here would be a
  // promise the product may not keep.
  { feature: 'memory.export', included: false, periodLimit: null },
];

const sharedMayNot: readonly string[] = [
  'add an operation the role table denies, or reach an operation whose sensitivity is critical',
  'replace or weaken any permission check, or run anything without one',
  'raise a limit above the hardware and provider budget the deployment is configured for',
];

export const PLAN_CATALOGUE: readonly Plan[] = [
  {
    id: 'free',
    displayName: 'Free',
    tagline: 'The whole deterministic product, plus a daily allowance of agent turns.',
    active: true,
    billingPeriod: 'none',
    periodCredits: 20,
    reset: { cadence: 'daily', atHourUtc: 0, carryOver: 'expire' },
    entitlements: freeEntitlements,
    price: null,
    purchasable: false,
    mayNot: sharedMayNot,
    notes: [
      'Twenty credits per UTC day, one credit per agent turn.',
      'Deterministic capabilities cost nothing, so they keep working with a spent allowance.',
      'Unused credits expire at the end of the day rather than accumulating.',
    ],
  },
  {
    id: 'premium',
    displayName: 'Premium',
    tagline: 'A larger daily allowance and the analysis capabilities as they are built.',
    active: true,
    billingPeriod: 'monthly',
    periodCredits: 200,
    reset: { cadence: 'daily', atHourUtc: 0, carryOver: 'expire' },
    entitlements: premiumEntitlements,
    price: null,
    purchasable: false,
    mayNot: sharedMayNot,
    notes: [
      'Two hundred credits per UTC day, with the same one-credit agent turn.',
      'Includes the portfolio and research capabilities at their declared costs.',
      'No tier includes the backtest: its operation is approval-gated, and a plan may never buy past a human decision.',
      'Not purchasable in this build: no payment integration exists yet.',
    ],
  },
];

export const DEFAULT_PLAN_ID: PlanId = 'free';

export const PLANS_BY_ID: Readonly<Record<PlanId, Plan>> = Object.fromEntries(
  PLAN_CATALOGUE.map((plan) => [plan.id, plan]),
) as Readonly<Record<PlanId, Plan>>;

/**
 * A plan by id, or `null`.
 *
 * Returning `null` for an unknown id is deliberate and load-bearing: it lets a caller
 * fail closed on a stored plan that this build does not know, instead of silently
 * falling back to something permissive.
 */
export function resolvePlan(id: string): Plan | null {
  return Object.prototype.hasOwnProperty.call(PLANS_BY_ID, id)
    ? (PLANS_BY_ID[id as PlanId] ?? null)
    : null;
}

/** The plan a request falls back to: never an unknown one. */
export function defaultPlan(): Plan {
  return PLANS_BY_ID[DEFAULT_PLAN_ID];
}

export function isPlanId(value: string): value is PlanId {
  return (PLAN_IDS as readonly string[]).includes(value);
}

/** The plan's entitlement for a feature, or `null` when the plan does not mention it. */
export function entitlementFor(plan: Plan, feature: FeatureId): FeatureEntitlement | null {
  return plan.entitlements.find((entry) => entry.feature === feature) ?? null;
}

/** The cheapest active plan that includes a feature, for an upgrade prompt. */
export function cheapestPlanIncluding(feature: FeatureId): Plan | null {
  const candidates = PLAN_CATALOGUE.filter(
    (plan) => plan.active && entitlementFor(plan, feature)?.included === true,
  ).sort((a, b) => a.periodCredits - b.periodCredits);
  return candidates[0] ?? null;
}

/** The next plan up from this one, by allowance. `null` at the top of the catalogue. */
export function nextPlanAbove(plan: Plan): Plan | null {
  const candidates = PLAN_CATALOGUE.filter(
    (candidate) => candidate.active && candidate.periodCredits > plan.periodCredits,
  ).sort((a, b) => a.periodCredits - b.periodCredits);
  return candidates[0] ?? null;
}

/**
 * Structural rules the catalogue must satisfy.
 *
 * The non-escalation rule is checked against the real operation table rather than a
 * copy of it: a feature whose operation is `critical` (or approval-gated) may not be
 * included by any plan, because a tier that could reach an approval-gated operation
 * would be a way to buy past a human decision.
 */
export function assertPlanCatalogue(plans: readonly Plan[] = PLAN_CATALOGUE): void {
  assertFeatureCatalogue();
  const seen = new Set<string>();
  for (const plan of plans) {
    if (seen.has(plan.id)) throw new Error(`Duplicate plan id: ${plan.id}`);
    seen.add(plan.id);
    if (!Number.isInteger(plan.periodCredits) || plan.periodCredits < 0) {
      throw new Error(`Plan ${plan.id} declares a non-integer or negative allowance.`);
    }
    if (plan.purchasable !== false || plan.price !== null) {
      throw new Error(
        `Plan ${plan.id} claims to be purchasable. No payment integration exists in this build.`,
      );
    }
    for (const entry of plan.entitlements) {
      const feature = featureFor(entry.feature);
      if (feature === null)
        throw new Error(`Plan ${plan.id} entitles unknown feature ${entry.feature}`);
      if (
        entry.periodLimit !== null &&
        (!Number.isInteger(entry.periodLimit) || entry.periodLimit <= 0)
      ) {
        throw new Error(`Plan ${plan.id} declares an unusable period limit for ${entry.feature}.`);
      }
      if (!entry.included) continue;
      const operation: OperationId | null = feature.operation;
      if (operation === null) continue;
      const declared = OPERATIONS[operation];
      if (declared.sensitivity === 'critical' || declared.requiresApproval) {
        throw new Error(
          `Plan ${plan.id} includes ${entry.feature}, whose operation ${operation} is approval-gated. A tier may never buy past a human decision.`,
        );
      }
    }
  }
}
