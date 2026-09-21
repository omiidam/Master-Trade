import { CREDIT_REASON_LABEL, CREDIT_REASON_MEANING } from '@shared/usage/credits';
import { ENTITLEMENT_DENIALS, type EntitlementDenial } from '@shared/usage/entitlements';
import { USAGE_CATEGORY_LABEL } from '@shared/usage/features';
import { SUBSCRIPTION_STATUS_LABEL, type SubscriptionStatus } from '@shared/usage/plans';
import type { BadgeTone } from '../Badge';

/**
 * Names for the things a credit surface talks about.
 *
 * Everything the shared catalogue already names is *imported* rather than re-written:
 * the plan's statuses, the reasons a movement happened, and the categories a capability
 * belongs to are contract vocabulary, and a second copy in the UI would be a second
 * vocabulary that eventually describes a different state. What lives here is only what
 * the backend has no reason to carry — the short label for a ledger row, the tone a
 * denial belongs to, and the two formatting helpers.
 *
 * An unknown token renders as itself. That is deliberate and matches the quality
 * surface: a value this build does not recognise is evidence the two sides have drifted,
 * and prettifying it into something plausible would hide exactly that.
 */

export function creditReasonLabel(reason: string): string {
  return (CREDIT_REASON_LABEL as Readonly<Record<string, string>>)[reason] ?? reason;
}

export function creditReasonMeaning(reason: string): string {
  return (CREDIT_REASON_MEANING as Readonly<Record<string, string>>)[reason] ?? reason;
}

export function subscriptionStatusLabel(status: string): string {
  return (SUBSCRIPTION_STATUS_LABEL as Readonly<Record<string, string>>)[status] ?? status;
}

/** Narrow a server string onto the contract's own status vocabulary. */
export function asSubscriptionStatus(status: string): SubscriptionStatus | null {
  return (Object.keys(SUBSCRIPTION_STATUS_LABEL) as SubscriptionStatus[]).includes(
    status as SubscriptionStatus,
  )
    ? (status as SubscriptionStatus)
    : null;
}

export function usageCategoryLabel(category: string): string {
  return (USAGE_CATEGORY_LABEL as Readonly<Record<string, string>>)[category] ?? category;
}

/** Why a ledger row exists, in a few words. */
const LEDGER_KIND_LABEL: Readonly<Record<string, string>> = {
  grant: 'Allowance granted',
  consume: 'Credit held',
  refund: 'Credit returned',
  expire: 'Allowance expired',
  adjustment: 'Adjustment',
};

export function ledgerKindLabel(kind: string): string {
  return LEDGER_KIND_LABEL[kind] ?? kind;
}

/**
 * Whether the movement holds or has finished.
 *
 * `released` is the one that matters for honesty: it means the work did not complete and
 * the credit came back, so a surface that showed it as spent would be reporting a charge
 * that never happened.
 */
const LEDGER_STATUS_LABEL: Readonly<Record<string, string>> = {
  reserved: 'Held until the work finishes',
  settled: 'Final',
  released: 'Returned — the work did not complete',
};

export function ledgerStatusLabel(status: string): string {
  return LEDGER_STATUS_LABEL[status] ?? status;
}

const ATTEMPT_STATUS_LABEL: Readonly<Record<string, string>> = {
  reserved: 'Held',
  settled: 'Completed and charged',
  released: 'Completed nothing — returned',
  refused: 'Refused before it ran — nothing was charged',
};

export function attemptStatusLabel(status: string): string {
  return ATTEMPT_STATUS_LABEL[status] ?? status;
}

/** Which family a refusal belongs to, so a surface can group them honestly. */
export type DenialGroup = 'entitlement' | 'permission' | 'delivery' | 'spend';

const DENIAL_GROUP: Readonly<Record<EntitlementDenial, DenialGroup>> = {
  'unknown-feature': 'delivery',
  'feature-disabled': 'delivery',
  'unknown-plan': 'entitlement',
  'subscription-inactive': 'entitlement',
  'not-in-plan': 'entitlement',
  'permission-denied': 'permission',
  'feature-coming-soon': 'delivery',
  'period-limit-reached': 'spend',
  'insufficient-credits': 'spend',
};

/**
 * Group a denial.
 *
 * Exhaustive over the contract's denial set, and that is the point: a new denial added
 * server-side stops this file compiling until it is given a group, so a surface cannot
 * silently invent one. An unknown token — a newer server — is reported as `delivery`
 * with the raw code, which is the least wrong answer available.
 */
export function denialGroup(denial: string): DenialGroup {
  if ((ENTITLEMENT_DENIALS as readonly string[]).includes(denial)) {
    return DENIAL_GROUP[denial as EntitlementDenial];
  }
  return 'delivery';
}

const DENIAL_HEADING: Readonly<Record<string, string>> = {
  'unknown-feature': 'Not a declared capability',
  'feature-disabled': 'Held for review',
  'unknown-plan': 'Plan not recognised',
  'subscription-inactive': 'Subscription not active',
  'not-in-plan': 'Not included in your plan',
  'permission-denied': 'Not permitted for your role',
  'feature-coming-soon': 'Not built yet',
  'period-limit-reached': 'Period allowance used',
  'insufficient-credits': 'Not enough credits',
};

export function denialHeading(denial: string): string {
  return DENIAL_HEADING[denial] ?? denial;
}

/** The tone a denial should be shown in. Never green: a refusal is not a success. */
export function denialTone(denial: string): BadgeTone {
  switch (denialGroup(denial)) {
    case 'spend':
      return 'warning';
    case 'permission':
      return 'danger';
    case 'entitlement':
      return 'info';
    case 'delivery':
      return 'outline';
  }
}

/** A signed credit number, with its sign kept visible. */
export function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : String(delta);
}

/** Reset timing in plain words, from the server's own instant. */
export function describeReset(resetsAt: string, now: number = Date.now()): string {
  const target = Date.parse(resetsAt);
  if (!Number.isFinite(target)) return resetsAt;
  const remainingMinutes = Math.round((target - now) / 60_000);
  if (remainingMinutes <= 0) return 'Renews on the next use of a metered capability.';
  const hours = Math.floor(remainingMinutes / 60);
  if (hours >= 1) return `Renews in about ${hours} hour${hours === 1 ? '' : 's'}.`;
  return `Renews in about ${remainingMinutes} minute${remainingMinutes === 1 ? '' : 's'}.`;
}
