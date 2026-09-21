import { Check, Lock, Minus, ShieldAlert } from 'lucide-react';
import type { UsagePlanView } from '@shared/api/contracts';
import { Badge } from '../Badge';
import { Card, CardHeader, CardTitle } from '../Card';
import { usageCategoryLabel } from './labels';

/**
 * One plan, described by the catalogue the server serves rather than by a copy in the UI.
 *
 * The catalogue is code — an allowance is part of the authorization boundary, so it is
 * reviewed and deployed rather than written to a table. That makes it *data* the moment it
 * crosses the wire, and this card renders it as data: an entitlement is shown as included
 * or not, a cost is shown with its basis, and a limit is shown as a number or as
 * "not limited separately".
 *
 * What it will not show is a price. `price` is `null` and `purchasable` is `false` in this
 * build, and the card says why in one sentence instead of rendering a button that could not
 * charge anyone.
 */

export interface SubscriptionPlanCardProps {
  plan: UsagePlanView;
  /** The plan the account is actually on, so "current" is stated rather than implied. */
  current?: boolean;
  className?: string;
}

export function SubscriptionPlanCard({
  plan,
  current = false,
  className,
}: SubscriptionPlanCardProps) {
  const included = plan.entitlements.filter((entry) => entry.included);
  const excluded = plan.entitlements.filter((entry) => !entry.included);

  return (
    <Card className={className} tone={current ? 'raised' : 'default'}>
      <CardHeader>
        <div className="space-y-1">
          <CardTitle className="flex flex-wrap items-center gap-2">
            {plan.displayName}
            {current ? <Badge tone="primary">Your plan</Badge> : null}
            {plan.active ? null : <Badge tone="neutral">Retired</Badge>}
          </CardTitle>
          <p className="text-body-sm text-text-muted">{plan.tagline}</p>
        </div>
        <div className="text-right">
          <p className="text-body-sm font-medium tabular-nums text-text">
            {plan.periodCredits} credits
          </p>
          <p className="text-caption text-text-faint">
            {plan.resetCadence === 'none' ? 'granted once' : `per ${plan.resetCadence} period`}
          </p>
        </div>
      </CardHeader>

      <div className="space-y-3 px-4 pb-4 pt-3">
        <div className="space-y-1">
          {included.map((entry) => (
            <div key={entry.feature} className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-body-sm text-text">
                <Check size={13} aria-hidden className="text-success" />
                {entry.feature}
              </span>
              <span className="text-caption tabular-nums text-text-muted">
                {entry.periodLimit === null ? 'no separate cap' : `${entry.periodLimit} per period`}
              </span>
            </div>
          ))}
          {excluded.map((entry) => (
            <div key={entry.feature} className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-body-sm text-text-faint">
                <Minus size={13} aria-hidden />
                {entry.feature}
              </span>
              <span className="text-caption text-text-faint">not included</span>
            </div>
          ))}
        </div>

        <div className="space-y-1">
          <h4 className="text-caption font-medium text-text-muted">What this plan may not do</h4>
          <ul className="list-disc space-y-1 pl-5" role="list">
            {plan.mayNot.map((line, index) => (
              <li key={index} className="text-caption text-text-faint">
                {line}
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-1">
          {plan.notes.map((note, index) => (
            <p key={index} className="text-caption text-text-muted">
              {note}
            </p>
          ))}
        </div>

        <p className="inline-flex items-start gap-1.5 rounded-[var(--radius-control)] border border-border bg-surface-sunken px-3 py-2 text-caption text-text-muted">
          <ShieldAlert size={13} aria-hidden className="mt-0.5 shrink-0 text-warning" />
          <span>
            Price: not offered. This build has no payment integration, so this plan is not
            purchasable and no amount is displayed.
          </span>
        </p>
      </div>
    </Card>
  );
}

export interface PlanComparisonProps {
  plans: readonly UsagePlanView[];
  /** The plan the account is on. Highlighted, never pre-selected on the user's behalf. */
  currentPlanId: string;
  /**
   * Category per feature id, from the status payload's own feature list.
   *
   * Passed in rather than looked up here, because the plan view deliberately carries only
   * what a plan decides — include, exclude, limit — and a component that reached for a
   * second source to decorate it would be the beginning of two catalogues.
   */
  categories?: Readonly<Record<string, string>>;
  className?: string;
}

/**
 * The catalogue side by side.
 *
 * The comparison is built from the *union* of every declared feature rather than from the
 * first plan's list, so a feature only one plan includes is still a row — a comparison
 * that silently omits the difference between the plans is not a comparison. Missing rows
 * read "not included", which is what the catalogue actually says.
 */
export function PlanComparison({
  plans,
  currentPlanId,
  categories = {},
  className,
}: PlanComparisonProps) {
  const features = [...new Set(plans.flatMap((plan) => plan.entitlements.map((e) => e.feature)))];

  return (
    <section className={className ?? 'space-y-3'} aria-label="Plan comparison">
      <header className="space-y-1">
        <h2 className="text-h3 font-semibold text-text">Plans</h2>
        <p className="text-body-sm text-text-muted">
          Allowances are declared in code and served as data. Nothing here can be bought: there is
          no payment integration in this build.
        </p>
      </header>

      <div className="overflow-x-auto rounded-[var(--radius-panel)] border border-border">
        <table className="w-full min-w-[40rem] border-collapse text-left">
          <caption className="sr-only">
            Every declared capability, by plan, with its per-period limit and cost.
          </caption>
          <thead>
            <tr className="border-b border-border bg-surface-sunken">
              <th scope="col" className="px-3 py-2 text-caption font-medium text-text-muted">
                Capability
              </th>
              {plans.map((plan) => (
                <th
                  key={plan.id}
                  scope="col"
                  className="px-3 py-2 text-caption font-medium text-text"
                >
                  <span className="flex items-center gap-1.5">
                    {plan.displayName}
                    {plan.id === currentPlanId ? <Badge tone="primary">Current</Badge> : null}
                  </span>
                </th>
              ))}
              <th scope="col" className="px-3 py-2 text-caption font-medium text-text-muted">
                Category
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border">
              <th scope="row" className="px-3 py-2 text-body-sm font-medium text-text">
                Credits per period
              </th>
              {plans.map((plan) => (
                <td key={plan.id} className="px-3 py-2 text-body-sm tabular-nums text-text">
                  {plan.periodCredits}
                </td>
              ))}
              <td className="px-3 py-2 text-caption text-text-faint">allowance</td>
            </tr>
            {features.map((feature) => {
              const category = categories[feature];
              return (
                <tr key={feature} className="border-b border-border last:border-b-0">
                  <th scope="row" className="px-3 py-2 text-body-sm font-medium text-text">
                    {feature}
                  </th>
                  {plans.map((plan) => {
                    const entry = plan.entitlements.find(
                      (candidate) => candidate.feature === feature,
                    );
                    return (
                      <td key={plan.id} className="px-3 py-2 text-body-sm">
                        {entry === undefined || !entry.included ? (
                          <span className="inline-flex items-center gap-1 text-text-faint">
                            <Lock size={12} aria-hidden />
                            not included
                          </span>
                        ) : entry.periodLimit === null ? (
                          <span className="text-text-muted">included, no separate cap</span>
                        ) : (
                          <span className="tabular-nums text-text">
                            {entry.periodLimit} per period
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-caption text-text-faint">
                    {category === undefined ? '' : usageCategoryLabel(category)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
