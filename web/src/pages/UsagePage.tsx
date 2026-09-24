import { useEffect, useState } from 'react';
import { Coins, History, Layers, ShieldCheck, Wallet } from 'lucide-react';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card, CardContent, CardTile } from '../components/Card';
import { ErrorState } from '../components/ErrorState';
import { Skeleton } from '../components/Skeleton';
import { TabPanel, Tabs } from '../components/Tabs';
import {
  ComingSoonNotice,
  DisabledFeatureNotice,
  FeatureEntitlementBadge,
  InsufficientCreditsState,
  PlanComparison,
  SubscriptionPlanCard,
  SubscriptionStatusCard,
  UpgradePrompt,
  UsageCreditsCard,
  UsageEmptyState,
  UsageHistory,
  UsageLimitNotice,
  UsageProgressBar,
} from '../components/usage';
import { Grid, Workspace } from '../app/Workspace';
import { useUsageStore } from '../store/usage';

/**
 * Usage: the plan, the allowance, what has been consumed, and what is not available.
 *
 * Four surfaces, one module, and the order between them is the reading order of the
 * question this page answers — what am I on, what is left, what can I use, what happened.
 * The tabs are internal, so the sidebar keeps one entry for this and never grows a
 * sub-tree.
 *
 * Three rules the page keeps, all of them inherited from the phase:
 *
 *   1. **Every number is the server's.** Nothing here adds, subtracts or estimates. The
 *      balance, the per-capability counts and the totals all arrive computed, from a
 *      ledger the client cannot write to.
 *   2. **A refusal is shown, not smoothed.** A capability the account cannot use appears
 *      in the same list as one it can, with the server's own sentence and the honest
 *      heading — including the cases where the answer is "not built yet" or "held for
 *      review", which are not upgrades and are never offered as one.
 *   3. **No fixture stands in for an account.** With no session there is nothing to read,
 *      and the page says so with the resolver's own reason rather than rendering a
 *      plausible-looking allowance.
 */

const TABS = [
  { id: 'overview', label: 'Overview', icon: <Coins size={14} aria-hidden /> },
  { id: 'features', label: 'Capabilities', icon: <Layers size={14} aria-hidden /> },
  { id: 'plans', label: 'Plans', icon: <Wallet size={14} aria-hidden /> },
  { id: 'history', label: 'History', icon: <History size={14} aria-hidden /> },
] as const;

const TITLE = 'Usage';
const DESCRIPTION =
  'Your plan, your credit allowance, what each capability costs and what has actually been consumed.';

export function UsagePage() {
  const status = useUsageStore((state) => state.status);
  const usage = useUsageStore((state) => state.usage);
  const unavailableReason = useUsageStore((state) => state.unavailableReason);
  const error = useUsageStore((state) => state.error);
  const load = useUsageStore((state) => state.load);

  const historyStatus = useUsageStore((state) => state.historyStatus);
  const history = useUsageStore((state) => state.history);
  const historyError = useUsageStore((state) => state.historyError);
  const loadHistory = useUsageStore((state) => state.loadHistory);

  const [tab, setTab] = useState<string>('overview');

  useEffect(() => {
    if (status === 'idle') void load();
  }, [status, load]);

  // The history is requested when its tab is opened, for the same reason the quality
  // assessment is: it is only meaningful while it is on screen, and a list fetched for
  // every visitor would be stale by the time most of them read it.
  useEffect(() => {
    if (tab === 'history' && historyStatus === 'idle') void loadHistory();
  }, [tab, historyStatus, loadHistory]);

  if (status === 'idle' || status === 'loading') {
    return (
      <Workspace title={TITLE} description={DESCRIPTION}>
        <Grid columns={3}>
          {[0, 1, 2].map((index) => (
            <Card key={index}>
              <CardContent className="space-y-3 pt-4">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-8 w-2/3" />
                <Skeleton className="h-3 w-full" />
              </CardContent>
            </Card>
          ))}
        </Grid>
      </Workspace>
    );
  }

  if (status === 'unavailable') {
    return (
      <Workspace title={TITLE} description={DESCRIPTION}>
        <ErrorState
          severity="info"
          title="No usage to show"
          description={`${unavailableReason ?? 'The usage service could not be reached.'} Nothing is displayed in its place: a balance is a fact about your account, so a stand-in figure would be worse than an empty page.`}
        />
      </Workspace>
    );
  }

  if (status === 'error' || usage === null) {
    return (
      <Workspace title={TITLE} description={DESCRIPTION}>
        <ErrorState
          title="Could not read usage"
          description={error?.message ?? 'The request failed without a reason.'}
          code={error?.code}
          action={
            <Button size="sm" variant="secondary" onClick={() => void load()}>
              Try again
            </Button>
          }
        />
      </Workspace>
    );
  }

  const spendBlocked = usage.features.filter(
    (feature) => !feature.allowed && feature.denial === 'insufficient-credits',
  );
  const categories: Record<string, string> = Object.fromEntries(
    usage.features.map((feature) => [feature.id, feature.category]),
  );

  return (
    <Workspace title={TITLE} description={DESCRIPTION}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="primary">{usage.plan.displayName}</Badge>
        <Badge tone={usage.durable ? 'outline' : 'warning'}>
          {usage.durable ? 'Durable ledger' : `${usage.storeKind} store`}
        </Badge>
        <Badge tone="neutral">{usage.balance} credits left</Badge>
        {spendBlocked.length > 0 ? (
          <Badge tone="warning">{spendBlocked.length} capability(s) unaffordable now</Badge>
        ) : null}
      </div>

      <Tabs items={TABS} value={tab} onValueChange={setTab} aria-label="Usage sections">
        <TabPanel value="overview">
          <div className="space-y-4">
            <Grid columns={2}>
              <SubscriptionStatusCard usage={usage} allowance={usage.plan.periodCredits} />
              <UsageCreditsCard usage={usage} />
            </Grid>

            <Card>
              <CardContent className="space-y-3 pt-4">
                <h2 className="text-h3 font-semibold text-text">Consumption this period</h2>
                <p className="text-body-sm text-text-muted">
                  Counted from the ledger rather than from a stored counter, so a corrected charge
                  cannot leave the count wrong.
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {usage.features
                    .filter((feature) => feature.periodLimit !== null)
                    .map((feature) => (
                      <UsageProgressBar
                        key={feature.id}
                        label={feature.label}
                        used={feature.usedThisPeriod}
                        limit={feature.periodLimit}
                        unit="uses"
                      />
                    ))}
                </div>
                {usage.features.every((feature) => feature.periodLimit === null) ? (
                  <UsageEmptyState
                    title="No capability is capped separately by this plan"
                    hint="The credit balance is the only limit, so there is no per-capability usage to report."
                  />
                ) : null}
              </CardContent>
            </Card>

            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  ['Granted', usage.totals.granted, 'Allowances added, including the period grant'],
                  ['Consumed', usage.totals.consumed, 'Credits kept for completed work'],
                  [
                    'Returned',
                    usage.totals.refunded,
                    'Credits given back when work did not complete',
                  ],
                  ['Expired', usage.totals.expired, 'Unused allowance at the end of a period'],
                ] as const
              ).map(([label, value, hint]) => (
                <CardTile key={label}>
                  <dt className="text-caption text-text-muted">{label}</dt>
                  <dd className="text-h3 font-semibold tabular-nums text-text">{value}</dd>
                  <p className="text-caption text-text-faint">{hint}</p>
                </CardTile>
              ))}
            </dl>

            {spendBlocked.length > 0 ? (
              <InsufficientCreditsState usage={usage} feature={spendBlocked[0] ?? null} />
            ) : null}
          </div>
        </TabPanel>

        <TabPanel value="features">
          <div className="space-y-4">
            <Card>
              <CardContent className="space-y-4 pt-4">
                <div className="space-y-1">
                  <h2 className="text-h3 font-semibold text-text">Declared capabilities</h2>
                  <p className="text-body-sm text-text-muted">
                    Every capability the platform declares, whether or not it exists yet. A
                    capability that is not built and one that is not in your plan are different
                    answers, and they are never shown with the same words.
                  </p>
                </div>

                <ul className="space-y-3" role="list">
                  {usage.features.map((feature) => (
                    <CardTile space="roomy" key={feature.id} className="space-y-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-body font-medium text-text">{feature.label}</span>
                        <FeatureEntitlementBadge feature={feature} />
                        <Badge tone="neutral">
                          {feature.creditCost === 0
                            ? 'no cost'
                            : `${feature.creditCost} credit${feature.creditCost === 1 ? '' : 's'}`}
                        </Badge>
                        {feature.operation === null ? null : (
                          <span className="font-mono text-caption text-text-faint">
                            {feature.operation}
                          </span>
                        )}
                      </div>

                      <p className="text-body-sm text-text-muted">{feature.description}</p>
                      <p className="text-caption text-text-faint">{feature.costBasis}</p>

                      {feature.periodLimit === null ? null : (
                        <UsageProgressBar
                          label="This period"
                          used={feature.usedThisPeriod}
                          limit={feature.periodLimit}
                          unit="uses"
                        />
                      )}

                      <UpgradePrompt
                        feature={feature}
                        upgradePlanName={
                          usage.plans.find((plan) => plan.id === feature.upgradePlanId)
                            ?.displayName ?? null
                        }
                      />
                      <UsageLimitNotice feature={feature} resetsAt={usage.period.resetsAt} />
                      <DisabledFeatureNotice feature={feature} />
                      <ComingSoonNotice feature={feature} />

                      {feature.allowed ? null : (
                        <p className="text-caption text-text-muted">{feature.reason}</p>
                      )}
                    </CardTile>
                  ))}
                </ul>

                <p className="inline-flex items-start gap-1.5 text-caption text-text-faint">
                  <ShieldCheck size={13} aria-hidden className="mt-0.5 shrink-0 text-success" />
                  <span>{usage.note}</span>
                </p>
              </CardContent>
            </Card>
          </div>
        </TabPanel>

        <TabPanel value="plans">
          <div className="space-y-4">
            <PlanComparison
              plans={usage.plans}
              currentPlanId={usage.plan.id}
              categories={categories}
            />
            <Grid columns={2}>
              {usage.plans.map((plan) => (
                <SubscriptionPlanCard
                  key={plan.id}
                  plan={plan}
                  current={plan.id === usage.plan.id}
                />
              ))}
            </Grid>
          </div>
        </TabPanel>

        <TabPanel value="history">
          <div className="space-y-4">
            {historyStatus === 'loading' ? (
              <Card>
                <CardContent className="space-y-3 pt-4">
                  <Skeleton className="h-4 w-1/4" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-5/6" />
                </CardContent>
              </Card>
            ) : null}

            {historyStatus === 'error' ? (
              <ErrorState
                title="Could not read usage history"
                description={historyError?.message ?? 'The request failed without a reason.'}
                code={historyError?.code}
                action={
                  <Button size="sm" variant="secondary" onClick={() => void loadHistory()}>
                    Try again
                  </Button>
                }
              />
            ) : null}

            {historyStatus === 'unavailable' ? (
              <ErrorState
                severity="info"
                title="No history to show"
                description="No usage store is reachable from this session, so there is no ledger to read. Nothing is shown in its place."
              />
            ) : null}

            {historyStatus === 'ready' && history !== null ? (
              <UsageHistory history={history} />
            ) : null}

            {historyStatus === 'idle' ? (
              <UsageEmptyState
                title="Usage history has not been requested yet"
                hint="Open this tab to read the movements and attempts behind the balance."
              />
            ) : null}
          </div>
        </TabPanel>
      </Tabs>
    </Workspace>
  );
}
