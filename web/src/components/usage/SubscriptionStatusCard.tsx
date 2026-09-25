import { CalendarClock, CreditCard, ShieldAlert } from 'lucide-react';
import type { UsageStatusData } from '@shared/api/contracts';
import { Badge, type BadgeTone } from '../Badge';
import { Card, CardContent, CardDescription, CardHeader, CardTile, CardTitle } from '../Card';
import { Tooltip } from '../Tooltip';
import { CreditBalance } from './CreditBalance';
import { describeReset, subscriptionStatusLabel } from './labels';
import { msg } from '../../i18n/index.js';

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
      <CardHeader divider>
        <div className="space-y-1">
          <CardTitle>{usage.plan.displayName}</CardTitle>
          <CardDescription>{usage.plan.tagline}</CardDescription>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge tone={STATUS_TONE[usage.subscriptionStatus] ?? 'neutral'}>
            {subscriptionStatusLabel(usage.subscriptionStatus)}
          </Badge>
          {stored ? null : (
            <Tooltip content={msg('subscriptionStatusCard.noSubscriptionHasEverBeenStoredForThis')}>
              <span className="text-caption text-text-faint">
                {msg('usage.defaultNotRecorded')}
              </span>
            </Tooltip>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
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
          <CardTile className="inline-flex items-start gap-1.5 text-caption text-text-muted">
            <ShieldAlert size={13} aria-hidden className="mt-0.5 shrink-0 text-warning" />
            <span>{msg('usage.thisBuildHasNoPaymentIntegration')}</span>
          </CardTile>
        ) : null}

        {usage.durable ? null : (
          <p className="text-caption text-warning">
            {msg('usage.thisDeploymentReportsA')} {usage.storeKind}{' '}
            {msg('usage.usageStoreBalancesAndHistoryAre')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
