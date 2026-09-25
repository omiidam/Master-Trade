import { Gauge, ShieldCheck } from 'lucide-react';
import type { UsageStatusData } from '@shared/api/contracts';
import { Badge } from '../Badge';
import { Card, CardContent, CardDescription, CardHeader, CardTile, CardTitle } from '../Card';
import { CreditBalance, UsageProgressBar } from './CreditBalance';
import { FeatureEntitlementBadge } from './FeatureEntitlementBadge';
import { UsageLimitNotice } from './UpgradePrompt';
import { denialGroup, usageCategoryLabel } from './labels';
import { msg } from '../../i18n/index.js';

/**
 * The whole allowance in one card: the balance, what each capability costs and where each
 * one currently stands.
 *
 * Four things this card refuses to do, each because doing them would mislead:
 *
 *   1. **It does not total what you "could" still buy.** Credits are not a currency with a
 *      price; 12 credits is 12 agent turns, and a backtest is 25 of them. The number and
 *      the per-capability costs are shown side by side so the arithmetic is the user's.
 *   2. **It does not hide a refusal.** A capability you cannot use is listed with the same
 *      prominence as one you can, because "what can I not do" is the question this card is
 *      opened to answer.
 *   3. **It does not merge delivery gaps with upgrades.** Grouped by `denialGroup`, so a
 *      capability that is merely unbuilt is never shown beside one that is for sale.
 *   4. **It does not show a price.** `purchasable` is false and there is no payment
 *      integration, so the card states the allowance and stops.
 */

export interface UsageCreditsCardProps {
  usage: UsageStatusData;
  className?: string;
}

export function UsageCreditsCard({ usage, className }: UsageCreditsCardProps) {
  const grouped = {
    spend: usage.features.filter(
      (feature) => !feature.allowed && denialGroup(feature.denial ?? '') === 'spend',
    ),
    entitlement: usage.features.filter(
      (feature) => !feature.allowed && denialGroup(feature.denial ?? '') === 'entitlement',
    ),
    permission: usage.features.filter(
      (feature) => !feature.allowed && denialGroup(feature.denial ?? '') === 'permission',
    ),
    delivery: usage.features.filter(
      (feature) => !feature.allowed && denialGroup(feature.denial ?? '') === 'delivery',
    ),
  };
  const metered = usage.features.filter((feature) => feature.creditCost > 0);

  return (
    <Card className={className}>
      <CardHeader divider>
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <Gauge size={16} aria-hidden className="text-primary" />
            {msg('usage.usageCredits')}
          </CardTitle>
          <CardDescription>{msg('usage.oneCreditIsOneAgentTurn')}</CardDescription>
        </div>
        <Badge tone="outline">{usage.plan.displayName}</Badge>
      </CardHeader>

      <CardContent className="space-y-4">
        <CreditBalance
          balance={usage.balance}
          allowance={usage.plan.periodCredits}
          lifetimeConsumed={usage.lifetime.consumed}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          {usage.features.map((feature) => (
            <CardTile key={feature.id} className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-body font-medium text-text">{feature.label}</span>
                <FeatureEntitlementBadge feature={feature} />
                <span className="text-caption text-text-faint">
                  {usageCategoryLabel(feature.category)}
                </span>
              </div>
              {feature.periodLimit === null ? (
                <p className="text-caption text-text-faint">
                  {feature.creditCost === 0
                    ? 'Free to run: it calls no provider.'
                    : 'No separate period cap; the balance is the only limit.'}
                </p>
              ) : (
                <UsageProgressBar
                  label={msg('usageCreditsCard.thisPeriod')}
                  used={feature.usedThisPeriod}
                  limit={feature.periodLimit}
                  unit="uses"
                />
              )}
            </CardTile>
          ))}
        </div>

        {metered.length === 0 ? null : (
          <div className="space-y-1">
            <h4 className="text-caption font-semibold text-text-muted uppercase">
              {msg('usage.whatEachCostMeans')}
            </h4>
            <ul className="space-y-1" role="list">
              {metered.map((feature) => (
                <li key={feature.id} className="text-caption text-text-muted">
                  <span className="text-text">{feature.label}: </span>
                  {feature.costBasis}
                </li>
              ))}
            </ul>
          </div>
        )}

        {grouped.spend.map((feature) => (
          <UsageLimitNotice
            key={feature.id}
            feature={feature}
            resetsAt={feature.denial === 'insufficient-credits' ? null : usage.period.resetsAt}
          />
        ))}

        {grouped.permission.length > 0 ? (
          <div className="space-y-1">
            <h4 className="text-caption font-semibold text-text-muted uppercase">
              {msg('usage.notPermittedForYourRole')}
            </h4>
            <ul className="space-y-1" role="list">
              {grouped.permission.map((feature) => (
                <li key={feature.id} className="text-caption text-text-muted">
                  <span className="text-text">{feature.label}: </span>
                  {feature.reason}
                </li>
              ))}
            </ul>
            <p className="text-caption text-text-faint">
              {msg('usage.aPlanNeverGrantsAnOperation')}
            </p>
          </div>
        ) : null}

        {grouped.entitlement.length > 0 ? (
          <div className="space-y-1">
            <h4 className="text-caption font-semibold text-text-muted uppercase">
              {msg('usage.notInThisPlan')}
            </h4>
            <ul className="space-y-1" role="list">
              {grouped.entitlement.map((feature) => (
                <li key={feature.id} className="text-caption text-text-muted">
                  <span className="text-text">{feature.label}: </span>
                  {feature.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="inline-flex items-start gap-1.5 text-caption text-text-faint">
          <ShieldCheck size={13} aria-hidden className="mt-0.5 shrink-0 text-success" />
          <span>{usage.note}</span>
        </p>
      </CardContent>
    </Card>
  );
}
