import { Lock, Minus, ShieldAlert } from 'lucide-react';
import type { UsagePlanView } from '@shared/api/contracts';
import { AgentCheck } from '../agent/AgentCard';
import { Badge } from '../Badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTile,
  CardTitle,
  Section,
} from '../Card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableRowHeaderCell,
} from '../Table';
import { usageCategoryLabel } from './labels';
import { msg } from '../../i18n/index.js';

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
      <CardHeader divider>
        <div className="space-y-1">
          <CardTitle className="flex flex-wrap items-center gap-2">
            {plan.displayName}
            {current ? <Badge tone="primary">{msg('usage.yourPlan')}</Badge> : null}
            {plan.active ? null : <Badge tone="neutral">{msg('usage.retired')}</Badge>}
          </CardTitle>
          <CardDescription>{plan.tagline}</CardDescription>
        </div>
        <div className="text-right">
          <p className="text-body font-medium num text-text">
            {plan.periodCredits} {msg('usage.credits')}
          </p>
          <p className="text-caption text-text-faint">
            {plan.resetCadence === 'none' ? 'granted once' : `per ${plan.resetCadence} period`}
          </p>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="space-y-1">
          {/*
            The reference's tick — a filled disc of the accent with a dark glyph — not a bare
            check icon. It is the same mark the agent's rows use (`AgentCheck`), so "this is
            included" looks identical wherever the product says it.
          */}
          {included.map((entry) => (
            <div key={entry.feature} className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-body text-text">
                <AgentCheck />
                {entry.feature}
              </span>
              <span className="text-caption num text-text-muted">
                {entry.periodLimit === null ? 'no separate cap' : `${entry.periodLimit} per period`}
              </span>
            </div>
          ))}
          {excluded.map((entry) => (
            <div key={entry.feature} className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-body text-text-faint">
                <Minus size={13} aria-hidden />
                {entry.feature}
              </span>
              <span className="text-caption text-text-faint">{msg('usage.notIncluded')}</span>
            </div>
          ))}
        </div>

        <div className="space-y-1">
          <h4 className="text-caption font-semibold text-text-muted uppercase">
            {msg('usage.whatThisPlanMayNotDo')}
          </h4>
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

        <CardTile className="inline-flex items-start gap-1.5 text-caption text-text-muted">
          <ShieldAlert size={13} aria-hidden className="mt-0.5 shrink-0 text-warning" />
          <span>{msg('usage.priceNotOfferedThisBuildHas')}</span>
        </CardTile>
      </CardContent>
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
    <Section
      title={msg('usage.plans')}
      description={msg('subscriptionPlanCard.allowancesAreDeclaredInCodeAndServedAs')}
      className={className}
    >
      {/* The frame keeps its own outline: this is a matrix rather than a record list, so it is a
          plate the reader looks *into* rather than a table laid on the card. */}
      <div className="rounded-[var(--radius-panel)] border border-border">
        <Table
          minWidth={640}
          label={msg('subscriptionPlanCard.everyDeclaredCapabilityByPlanWithItsPerPeriod')}
        >
          <TableHead>
            <TableHeaderCell>{msg('usage.capability')}</TableHeaderCell>
            {plans.map((plan) => (
              // A `heading`: a plan's name is a proper noun and the most important column in the
              // table, so it is not rendered as an uppercase micro-label.
              <TableHeaderCell key={plan.id} variant="heading">
                <span className="flex items-center gap-1.5">
                  {plan.displayName}
                  {plan.id === currentPlanId ? (
                    <Badge tone="primary">{msg('usage.current')}</Badge>
                  ) : null}
                </span>
              </TableHeaderCell>
            ))}
            <TableHeaderCell>{msg('usage.category')}</TableHeaderCell>
          </TableHead>
          <TableBody>
            <TableRow>
              <TableRowHeaderCell>{msg('usage.creditsPerPeriod')}</TableRowHeaderCell>
              {plans.map((plan) => (
                <TableCell key={plan.id} numeric>
                  {plan.periodCredits}
                </TableCell>
              ))}
              <TableCell tone="faint">{msg('usage.allowance')}</TableCell>
            </TableRow>
            {features.map((feature) => {
              const category = categories[feature];
              return (
                <TableRow key={feature}>
                  <TableRowHeaderCell>{feature}</TableRowHeaderCell>
                  {plans.map((plan) => {
                    const entry = plan.entitlements.find(
                      (candidate) => candidate.feature === feature,
                    );
                    return (
                      <TableCell key={plan.id}>
                        {entry === undefined || !entry.included ? (
                          <span className="inline-flex items-center gap-1 text-text-faint">
                            <Lock size={12} aria-hidden />
                            {msg('usage.notIncluded')}
                          </span>
                        ) : entry.periodLimit === null ? (
                          <span className="text-text-muted">
                            {msg('usage.includedNoSeparateCap')}
                          </span>
                        ) : (
                          <span className="num text-text">
                            {entry.periodLimit} {msg('usage.perPeriod')}
                          </span>
                        )}
                      </TableCell>
                    );
                  })}
                  <TableCell tone="faint">
                    {category === undefined ? '' : usageCategoryLabel(category)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Section>
  );
}
