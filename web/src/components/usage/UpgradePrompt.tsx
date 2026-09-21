import { ArrowUpRight, CircleAlert, Clock, ShieldAlert } from 'lucide-react';
import type { UsageFeatureViewData, UsageStatusData } from '@shared/api/contracts';
import { Badge } from '../Badge';
import { Button } from '../Button';
import { denialHeading } from './labels';

/**
 * Three refusals, three surfaces, and the difference between them is the product decision.
 *
 *   - `UpgradePrompt` — an upgrade would actually resolve this. It renders **only** when
 *     the server said so (`upgradeOffered`), because the client cannot tell an upgradeable
 *     refusal from one that upgrading would not fix, and guessing would sell something
 *     that does not deliver.
 *   - `UsageLimitNotice` — the allowance for this period is used. Nothing is broken and
 *     nothing is for sale that would fix it today; it renews.
 *   - `InsufficientCreditsState` — the balance does not cover one invocation. Reported as
 *     a state of the account, not as an error, because it is a normal outcome.
 *
 * None of the three offers a purchase. There is no payment integration in this build, so
 * the prompt states what a larger allowance would do and stops there. A button that took
 * money would be a promise no code here can keep.
 */

export interface UpgradePromptProps {
  feature: UsageFeatureViewData;
  /** The plan the server named as the one that would help. */
  upgradePlanName?: string | null;
  className?: string;
}

export function UpgradePrompt({ feature, upgradePlanName, className }: UpgradePromptProps) {
  if (feature.allowed || !feature.upgradeOffered) return null;

  return (
    <div
      className={
        className ??
        'space-y-1.5 rounded-[var(--radius-control)] border border-border bg-surface-sunken px-3 py-2'
      }
    >
      <div className="flex items-center gap-1.5">
        <ArrowUpRight size={14} aria-hidden className="text-info" />
        <p className="text-body-sm font-medium text-text">
          {upgradePlanName === undefined || upgradePlanName === null
            ? 'A larger allowance would cover this'
            : `${upgradePlanName} would cover this`}
        </p>
      </div>
      <p className="text-body-sm text-text-muted">{feature.reason}</p>
      <p className="text-caption text-text-faint">
        Nothing here can take a payment: this build has no payment integration, and every plan is
        declared as not purchasable.
      </p>
    </div>
  );
}

export interface UsageLimitNoticeProps {
  feature: UsageFeatureViewData;
  /** The server's own reset instant, so the wording is not a guess. */
  resetsAt?: string | null;
  className?: string;
}

export function UsageLimitNotice({ feature, resetsAt, className }: UsageLimitNoticeProps) {
  if (feature.allowed || feature.denial !== 'period-limit-reached') return null;

  return (
    <div
      className={
        className ??
        'flex items-start gap-2 rounded-[var(--radius-control)] border border-[#3d2c12] bg-warning-soft px-3 py-2'
      }
    >
      <Clock size={14} aria-hidden className="mt-0.5 shrink-0 text-warning" />
      <div className="space-y-1">
        <p className="text-body-sm font-medium text-text">
          {feature.label}: {feature.usedThisPeriod} of {feature.periodLimit ?? 0} used this period
        </p>
        <p className="text-body-sm text-text-muted">{feature.reason}</p>
        {resetsAt === undefined || resetsAt === null ? null : (
          <p className="text-caption text-text-faint">The allowance renews at {resetsAt}.</p>
        )}
      </div>
    </div>
  );
}

export interface InsufficientCreditsStateProps {
  usage: UsageStatusData;
  feature?: UsageFeatureViewData | null;
  action?: React.ReactNode;
  className?: string;
}

export function InsufficientCreditsState({
  usage,
  feature,
  action,
  className,
}: InsufficientCreditsStateProps) {
  const cost = feature?.creditCost ?? null;
  const shortfall = cost === null ? null : Math.max(0, cost - usage.balance);

  return (
    <div
      role="status"
      className={
        className ??
        'space-y-2 rounded-[var(--radius-panel)] border border-[#3d2c12] bg-warning-soft px-4 py-3'
      }
    >
      <div className="flex items-center gap-1.5">
        <CircleAlert size={15} aria-hidden className="text-warning" />
        <p className="text-body font-medium text-text">Not enough credits</p>
        <Badge tone="warning">{denialHeading('insufficient-credits')}</Badge>
      </div>
      <p className="text-body-sm text-text-muted">
        {cost === null
          ? `Your balance is ${usage.balance}. Nothing was consumed.`
          : `This costs ${cost} credits and your balance is ${usage.balance}${
              shortfall === null || shortfall === 0 ? '' : ` — ${shortfall} short`
            }. Nothing was consumed.`}
      </p>
      <p className="text-caption text-text-faint">
        The allowance is a budget for the period rather than a balance that accumulates, and the
        deterministic capabilities keep working with a spent allowance.
      </p>
      {action === undefined ? null : <div className="pt-1">{action}</div>}
    </div>
  );
}

/** A disabled capability, which is a hold rather than a backlog item. */
export function DisabledFeatureNotice({ feature }: { feature: UsageFeatureViewData }) {
  if (feature.denial !== 'feature-disabled') return null;
  return (
    <div className="flex items-start gap-2 rounded-[var(--radius-control)] border border-border bg-surface-sunken px-3 py-2">
      <ShieldAlert size={14} aria-hidden className="mt-0.5 shrink-0 text-text-faint" />
      <p className="text-body-sm text-text-muted">{feature.stateReason ?? feature.reason}</p>
    </div>
  );
}

export interface ComingSoonNoticeProps {
  feature: UsageFeatureViewData;
  action?: React.ReactNode;
}

export function ComingSoonNotice({ feature, action }: ComingSoonNoticeProps) {
  if (feature.denial !== 'feature-coming-soon') return null;
  return (
    <div className="space-y-1 rounded-[var(--radius-control)] border border-border bg-surface-sunken px-3 py-2">
      <p className="text-body-sm text-text-muted">
        {feature.stateReason ??
          'This capability is included in your plan and has not been built yet.'}
      </p>
      <p className="text-caption text-text-faint">
        That is a gap in the product, not in your entitlement — the declared cost is{' '}
        {feature.creditCost} credits per invocation once it exists.
      </p>
      {action === undefined ? null : action}
    </div>
  );
}

/** Nothing is left to show yet, and saying so is better than an empty pane. */
export function UsageEmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-[var(--radius-control)] border border-dashed border-border px-4 py-6 text-center">
      <p className="text-body-sm text-text-muted">{title}</p>
      <p className="mt-1 text-caption text-text-faint">{hint}</p>
    </div>
  );
}

/** A retry control that is honest about being a retry, not a repair. */
export function UsageRetryAction({ onRetry }: { onRetry: () => void }) {
  return (
    <Button variant="secondary" size="sm" onClick={onRetry}>
      Try again
    </Button>
  );
}
