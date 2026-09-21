/**
 * Entitlement resolution — can this user afford this, and is it theirs to use?
 *
 * The one rule this module exists to enforce is the composition direction from the
 * product vision §3.1:
 *
 * ```
 * entitlement (can this user afford it?)  ──narrows──▶  permission (is it allowed?)
 *                                     the reverse never happens
 * ```
 *
 * `permissionGranted` is an **input**: the role table's answer, already computed by the
 * request pipeline. There is no branch in this file where a plan's inclusion overrides it,
 * which is what makes "a paid tier may never grant an operation the role table denies"
 * a property of the code rather than a promise about it. It also means a tier can never
 * reach an approval-gated operation, because `assertPlanCatalogue` refuses a catalogue in
 * which one does.
 *
 * The resolver is pure: plan id, subscription status, feature id, permission answer and
 * balance in; a decision out. No clock, no store, no provider. That is what lets the same
 * function answer the API's question and the agent's question without either being able to
 * disagree with the other, and it is why no language model is anywhere near it — a model
 * that could decide what is affordable would be a model that could spend money.
 *
 * **Precedence is a product decision, so it is stated rather than implied.** A feature
 * that is `disabled` outranks everything: it is a deliberate hold, and reporting it as an
 * upgrade would be selling something the product cannot deliver. An unknown plan outranks
 * an unknown balance: fail closed on what is unreadable rather than on what is merely low.
 * A missing inclusion outranks a missing permission, because "this is not in your plan" is
 * the more useful and less alarming answer when both are true — but a *denied* permission
 * is never reported as an upgrade, and never masked by one.
 */

import type { FeatureDefinition, FeatureId } from './features.js';
import { featureFor } from './features.js';
import {
  ENTITLING_STATUSES,
  cheapestPlanIncluding,
  entitlementFor,
  nextPlanAbove,
  resolvePlan,
  type Plan,
  type SubscriptionStatus,
} from './plans.js';

/** Every way a request can be refused before any work happens. Closed set. */
export const ENTITLEMENT_DENIALS = [
  'unknown-feature',
  'feature-disabled',
  'unknown-plan',
  'subscription-inactive',
  'not-in-plan',
  'permission-denied',
  'feature-coming-soon',
  'period-limit-reached',
  'insufficient-credits',
] as const;

export type EntitlementDenial = (typeof ENTITLEMENT_DENIALS)[number];

/**
 * What each refusal means.
 *
 * Shipped with the decision rather than restated by a client, for the same reason the
 * readiness gate ships its own wording: a caller that has to invent the explanation will
 * eventually invent the meaning, and "your plan ended" and "we have not built that yet"
 * are not the same message.
 */
export const DENIAL_MEANING: Readonly<Record<EntitlementDenial, string>> = {
  'unknown-feature':
    'This capability is not declared anywhere in the platform, so there are no rules to apply to it and nothing is permitted.',
  'feature-disabled':
    'The capability is deliberately held rather than merely unbuilt, and the review that would release it is named. No plan reaches it.',
  'unknown-plan':
    'The stored plan is not one this build defines, so nothing can be resolved from it. An unrecognised plan denies rather than falling back to a default.',
  'subscription-inactive':
    'The subscription is not active, so the plan’s entitlements do not apply. The allowance itself is not spent — restoring the subscription restores the entitlement.',
  'not-in-plan':
    'The capability exists and works, and this plan does not include it. This one is an upgrade rather than a delivery gap.',
  'permission-denied':
    'Your role does not include this operation. A plan never grants an operation the role table denies, so this cannot be resolved by upgrading.',
  'feature-coming-soon':
    'Your plan includes this capability and the capability has not been built yet. That is a gap in the product, not in your entitlement.',
  'period-limit-reached':
    'The capability is included and permitted, and you have used every invocation this plan allows in the current period. The allowance itself is not spent — the limit is per capability, and it resets with the period.',
  'insufficient-credits':
    'The capability is included and permitted, and the balance does not cover it. Nothing was consumed.',
};

export interface EntitlementRequest {
  /** The user's stored plan id. Never a client-supplied one. */
  planId: string;
  /** The stored subscription status. `unknown` denies. */
  subscriptionStatus: SubscriptionStatus;
  featureId: string;
  /**
   * The role table's answer for the feature's operation, when it has one.
   *
   * `true` for a feature with no operation (a declared-but-unbuilt capability is gated by
   * its state, not by a permission nobody has yet).
   */
  permissionGranted: boolean;
  /** The user's current balance. Integer. */
  balance: number;
  /**
   * How much of the plan's per-period allowance for this feature is already used.
   *
   * Optional, and the resolver is honest about the difference: a caller that does not
   * know the usage cannot be refused on it, so `absent` means "not evaluated" rather
   * than "unlimited". The metering service always supplies it, because it is the service
   * that holds the ledger the count comes from.
   */
  usage?: { usedThisPeriod: number; periodLimit: number | null };
}

export interface EntitlementAllowance {
  allowed: true;
  feature: FeatureDefinition;
  plan: Plan;
  /** Credits this invocation will hold. Integer; zero is a legitimate allowance. */
  credits: number;
  subscriptionStatus: SubscriptionStatus;
  /** One sentence, in the contract's own words. */
  reason: string;
  note: string;
}

export interface EntitlementRefusal {
  allowed: false;
  denial: EntitlementDenial;
  /** `null` only for `unknown-feature`, where there is nothing to describe. */
  feature: FeatureDefinition | null;
  plan: Plan | null;
  /** Credits this invocation would have held. Zero when the feature is unknown. */
  credits: number;
  subscriptionStatus: SubscriptionStatus;
  reason: string;
  /** The plan that would resolve this, when an upgrade would help. */
  upgrade: Plan | null;
  /** True when an upgrade alone would not help, so the surface must not offer one. */
  upgradeWouldNotHelp: boolean;
  note: string;
}

export type EntitlementDecision = EntitlementAllowance | EntitlementRefusal;

const NOTE =
  'Entitlement is resolved from your stored plan, your subscription status, your role and your balance. It is deterministic, it is computed on the server, and no model decides whether something is affordable.';

/** True when a plan's inclusion is enough to *consider* the feature, before permission. */
function included(plan: Plan, feature: FeatureId): boolean {
  return entitlementFor(plan, feature)?.included === true;
}

export function resolveEntitlement(request: EntitlementRequest): EntitlementDecision {
  const feature = featureFor(request.featureId);
  const plan = resolvePlan(request.planId);
  const subscriptionStatus = request.subscriptionStatus;

  const refuse = (
    denial: EntitlementDenial,
    options: { upgrade?: Plan | null; credits?: number; upgradeWouldNotHelp?: boolean } = {},
  ): EntitlementRefusal => {
    const upgrade = options.upgrade ?? null;
    return {
      allowed: false,
      denial,
      feature,
      plan,
      credits: options.credits ?? feature?.creditCost ?? 0,
      subscriptionStatus,
      reason: DENIAL_MEANING[denial],
      upgrade,
      upgradeWouldNotHelp: options.upgradeWouldNotHelp ?? upgrade === null,
      note: NOTE,
    };
  };

  // 1. Nothing is declared, so nothing can be resolved.
  if (feature === null) return refuse('unknown-feature', { credits: 0 });

  // 2. A deliberate hold outranks every other answer. Reporting a held capability as an
  //    upgrade would be selling something the product has decided not to ship.
  if (feature.state === 'disabled') return refuse('feature-disabled');

  // 3. An unreadable plan denies. Falling back to a default here is how a stored plan
  //    that this build does not know would silently become a permissive one.
  if (plan === null) return refuse('unknown-plan');

  // 4. An inactive subscription means the entitlements do not apply.
  if (!ENTITLING_STATUSES.includes(subscriptionStatus)) return refuse('subscription-inactive');

  const includedInPlan = included(plan, feature.id);

  // 5. Included by the plan, or not. Checked before permission because it is the more
  //    useful answer when both are missing, and because it is where an upgrade helps.
  if (!includedInPlan) {
    return refuse('not-in-plan', {
      upgrade: cheapestPlanIncluding(feature.id),
      upgradeWouldNotHelp: cheapestPlanIncluding(feature.id) === null,
    });
  }

  // 6. The role table's answer is final. There is no branch below this that can overturn
  //    it, which is the non-escalation rule expressed as control flow.
  if (!request.permissionGranted) {
    return refuse('permission-denied', { upgradeWouldNotHelp: true });
  }

  // 7. The plan includes it and the capability is not built. A delivery gap, and it is
  //    checked before the caps because a limit that is not reachable is not the answer.
  if (feature.state === 'coming-soon') return refuse('feature-coming-soon');

  // 8. The per-capability allowance for this period. Separate from the credit balance on
  //    purpose: a cheap capability is capped by invocations and an expensive one by
  //    credits, and neither cap can stand in for the other. An upgrade genuinely helps
  //    here, so it is offered.
  const usage = request.usage;
  if (
    usage !== undefined &&
    usage.periodLimit !== null &&
    Number.isInteger(usage.periodLimit) &&
    usage.usedThisPeriod >= usage.periodLimit
  ) {
    const better = nextPlanAbove(plan);
    return refuse('period-limit-reached', {
      upgrade: better,
      upgradeWouldNotHelp: better === null,
    });
  }

  // 9. Affordable? `upgrade` is the next plan up, which is a real recommendation here
  //    because a larger allowance is the thing that would resolve it.
  if (!Number.isInteger(request.balance) || request.balance < feature.creditCost) {
    const better = nextPlanAbove(plan);
    return refuse('insufficient-credits', {
      upgrade: better,
      upgradeWouldNotHelp: better === null,
    });
  }

  return {
    allowed: true,
    feature,
    plan,
    subscriptionStatus,
    credits: feature.creditCost,
    note: NOTE,
    reason:
      feature.creditCost === 0
        ? `${feature.label} is included in ${plan.displayName} and costs nothing: it runs no provider and reads only what you have already declared.`
        : `${feature.label} is included in ${plan.displayName} and holds ${feature.creditCost} credit(s) until it completes.`,
  };
}

/** Resolve every declared feature, for a surface that lists them. */
export function resolveAllEntitlements(
  request: Omit<EntitlementRequest, 'featureId'> & { featureIds: readonly string[] },
): EntitlementDecision[] {
  return request.featureIds.map((featureId) =>
    resolveEntitlement({
      usage: request.usage,
      planId: request.planId,
      subscriptionStatus: request.subscriptionStatus,
      permissionGranted: request.permissionGranted,
      balance: request.balance,
      featureId,
    }),
  );
}

/**
 * Whether an upgrade is the honest thing to offer.
 *
 * A surface must not show a paid upsell for a capability that is held for review, refused
 * by a role, or simply not built — each of those would be a purchase that does not deliver.
 * Stated as a function so the UI cannot decide it differently from the backend.
 */
export function upgradeIsHonest(decision: EntitlementDecision): boolean {
  if (decision.allowed) return false;
  if (decision.upgrade === null) return false;
  return (
    decision.denial === 'not-in-plan' ||
    decision.denial === 'insufficient-credits' ||
    decision.denial === 'period-limit-reached'
  );
}
