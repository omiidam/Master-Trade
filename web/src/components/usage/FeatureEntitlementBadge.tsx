import type { UsageFeatureViewData } from '@shared/api/contracts';
import { Badge, type BadgeTone } from '../Badge';
import { Tooltip } from '../Tooltip';
import { denialHeading, denialTone } from './labels';

/**
 * Whether one capability is available to this account, and why not when it is not.
 *
 * The badge reports the *decision*, not a derived impression of it: `allowed` and `denial`
 * come from the resolver, and the heading comes from the denial's own group. Nothing here
 * infers "probably available" from a plan name or a balance — a client that could reason
 * its way to an entitlement would be a client that could disagree with the server about
 * one, which is precisely the disagreement the resolver exists to prevent.
 *
 * A refusal's sentence is not written here. The server ships it (`reason`), the tooltip
 * shows it verbatim, and this component contributes only a heading.
 */

export interface FeatureEntitlementBadgeProps {
  feature: UsageFeatureViewData;
  className?: string;
}

export function featureBadgeTone(feature: UsageFeatureViewData): BadgeTone {
  if (feature.allowed) return feature.state === 'available' ? 'success' : 'info';
  return denialTone(feature.denial ?? 'unknown-feature');
}

export function FeatureEntitlementBadge({ feature, className }: FeatureEntitlementBadgeProps) {
  const label = feature.allowed
    ? feature.creditCost === 0
      ? 'Available, free'
      : `Available, ${feature.creditCost} credit${feature.creditCost === 1 ? '' : 's'}`
    : denialHeading(feature.denial ?? 'unknown-feature');

  return (
    <Tooltip content={feature.reason}>
      <Badge tone={featureBadgeTone(feature)} className={className}>
        {label}
      </Badge>
    </Tooltip>
  );
}
