/**
 * Usage, credits and subscription surfaces.
 *
 * One folder, one vocabulary: the labels live in `labels.ts` and every component imports
 * them, so a denial's heading or a ledger reason's name cannot be spelled two ways on two
 * screens. Nothing here computes a balance, an entitlement or a readiness — all three come
 * from the server, and these components only decide how to say them.
 */

export { CreditBalance, UsageProgressBar, usageBarState } from './CreditBalance.js';
export type { CreditBalanceProps, UsageBarState, UsageProgressBarProps } from './CreditBalance.js';

export { SubscriptionStatusCard } from './SubscriptionStatusCard.js';
export type { SubscriptionStatusCardProps } from './SubscriptionStatusCard.js';

export { PlanComparison, SubscriptionPlanCard } from './SubscriptionPlanCard.js';
export type { PlanComparisonProps, SubscriptionPlanCardProps } from './SubscriptionPlanCard.js';

export { FeatureEntitlementBadge, featureBadgeTone } from './FeatureEntitlementBadge.js';
export type { FeatureEntitlementBadgeProps } from './FeatureEntitlementBadge.js';

export {
  ComingSoonNotice,
  DisabledFeatureNotice,
  InsufficientCreditsState,
  UpgradePrompt,
  UsageEmptyState,
  UsageLimitNotice,
  UsageRetryAction,
} from './UpgradePrompt.js';
export type {
  ComingSoonNoticeProps,
  InsufficientCreditsStateProps,
  UpgradePromptProps,
  UsageLimitNoticeProps,
} from './UpgradePrompt.js';

export { UsageCreditsCard } from './UsageCreditsCard.js';
export type { UsageCreditsCardProps } from './UsageCreditsCard.js';

export { CreditTransactionItem, UsageHistory } from './UsageHistory.js';
export type { CreditTransactionItemProps, UsageHistoryProps } from './UsageHistory.js';

export {
  asSubscriptionStatus,
  attemptStatusLabel,
  creditReasonLabel,
  creditReasonMeaning,
  denialGroup,
  denialHeading,
  denialTone,
  describeReset,
  formatDelta,
  ledgerKindLabel,
  ledgerStatusLabel,
  subscriptionStatusLabel,
  usageCategoryLabel,
} from './labels.js';
export type { DenialGroup } from './labels.js';
