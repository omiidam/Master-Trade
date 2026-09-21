import { CalendarClock, CreditCard, ShieldAlert } from 'lucide-react';
import type { UsageStatusData } from '@shared/api/contracts';
import { Badge, type BadgeTone } from '../Badge';
import { Card, CardHeader, CardTitle } from '../Card';
import { Tooltip } from '../Tooltip';
import { CreditBalance } from './CreditBalance';
import { describeReset, subscriptionStatusLabel } from './labels';

/**
 * What plan this account is on, and whether that is a record or a default.
 *
 * The distinction the card exists to make: `subscriptionRecorded` false means nothing has
 * ever been stored, so the free plan is being *reported as a default*. That is a different
 * statement from "you are on the free plan", and a surface that blurred the two would be
 * claiming a record the database does not have.
 *
 * The second distinction is about money. `purchasable` is false and no price exists, so
 * the card says there is no payment integration rather than showing an upgrade button —
 * a control that could not charge anyone is worse than no control.
 */

const STATUS_TONE: Readonly<Record<string, BadgeTone>> = {
  active: 'success',
  inactive: 'neutral',
  expired: 'warning',
  pending: 'info',
  unknown: 'danger',
};

export interface SubscriptionStatusCardProps {
  usage: UsageStatusData;
  /** The plan's per-period allowance, used so the balance reads as a fraction. */
  allowance: number;
  className?: string;
}

export function SubscriptionStatusCard({
  usage,
  allowance,
  className,
}: SubscriptionStatusCardProps) {
  const stored = usage.subscriptionRecorded;

  return (
    <Card className={className}>
      <CardHeader>
        <div className="space-y-1">
          <CardTitle>{usage.plan.displayName}</CardTitle>
          <p className="text-body-sm text-text-muted">{usage.plan.tagline}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge tone={STATUS_TONE[usage.subscriptionStatus] ?? 'neutral'}>
            {subscriptionStatusLabel(usage.subscriptionStatus)}
          </Badge>
          {stored ? null : (
            <Tooltip content="No subscription has ever been stored for this account, so the free plan is being reported as a default rather than read back from a record.">
              <span className="text-caption text-text-faint">Default, not recorded</span>
            </Tooltip>
          )}
        </div>
      </CardHeader>

      <div className="space-y-3 px-4 pb-4 pt-3">
        <CreditBalance
          balance={usage.balance}
          allowance={allowance}
          lifetimeConsumed={usage.lifetime.consumed}
        />

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-text-muted">
          <span className="inline-flex items-center gap-1">
            <CalendarClock size={13} aria-hidden />
            {usage.plan.resetCadence === 'none'
              ? 'No periodic renewal: the allowance is granted once.'
              : `Renews ${usage.plan.resetCadence}. ${describeReset(usage.period.resetsAt)}`}
          </span>
          <span className="inline-flex items-center gap-1">
            <CreditCard size={13} aria-hidden />
            {usage.plan.billingPeriod === 'none'
              ? 'Not billed'
              : `Billed ${usage.plan.billingPeriod}`}
          </span>
        </div>

        {usage.purchasable === false ? (
          <p className="inline-flex items-start gap-1.5 rounded-[var(--radius-control)] border border-border bg-surface-sunken px-3 py-2 text-caption text-text-muted">
            <ShieldAlert size={13} aria-hidden className="mt-0.5 shrink-0 text-warning" />
            <span>
              This build has no payment integration, so no plan is purchasable and no price is
              shown. A change of plan is recorded only as an administrative grant, with the decision
              on file.
            </span>
          </p>
        ) : null}

        {usage.durable ? null : (
          <p className="text-caption text-warning">
            This deployment reports a {usage.storeKind} usage store: balances and history are not
            durable here, so a restart resets them. The capability itself still meters.
          </p>
        )}
      </div>
    </Card>
  );
}
