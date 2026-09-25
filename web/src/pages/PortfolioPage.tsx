import { useEffect, useState } from 'react';
import { Coins, Gauge, Layers, ListChecks, PencilLine, Sparkles } from 'lucide-react';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { Skeleton } from '../components/Skeleton';
import { TabPanel, Tabs } from '../components/Tabs';
import { AnalysisReadinessPanel } from '../components/quality/AnalysisReadinessPanel';
import {
  AllocationPair,
  ConcentrationRiskCard,
  HoldingsEditor,
  HoldingsTable,
  MissingHoldingData,
  PortfolioInsightsList,
  PortfolioOverview,
  PortfolioQualitySummary,
  PortfolioReadinessPanel,
  PortfolioSnapshotTimeline,
  PortfolioValueCard,
  RiskExposurePanel,
} from '../components/portfolio';
import { Grid, Workspace } from '../app/Workspace';
import { usePortfolioStore } from '../store/portfolio';
import { useQualityStore } from '../store/quality';
import { msg } from '../i18n/index.js';

/**
 * Portfolio: what is declared, what it is worth, and what cannot be said about it.
 *
 * One page, six internal tabs, so the sidebar keeps one entry and never grows a sub-tree. The
 * tab order is the reading order of the question this module answers: what is declared, what it
 * is worth, how it is put together, what it is exposed to, what the engine observed, and what
 * would have to change for more to be known.
 *
 * Four rules the page keeps, all inherited from the phase:
 *
 *   1. **Every number is the server's.** Nothing here values a position, sums a total or
 *      derives a share. The engine does the arithmetic; this page renders it, including the
 *      figures it did *not* produce.
 *   2. **`null` is never rendered as zero.** An absent market value and a market value of nothing
 *      are opposite statements, and the components are built so the difference survives to the
 *      screen.
 *   3. **A refusal is shown.** A `BLOCKED` scope appears with the findings and the questions
 *      behind it, rather than the page quietly rendering fewer panels.
 *   4. **No fixture stands in for an account.** With no session there is nothing to read, and the
 *      page says so with the resolver's own reason rather than drawing a plausible portfolio.
 */

const TABS = [
  {
    id: 'overview',
    get label(): string {
      return msg('dashboardPage.overview');
    },
    icon: <Gauge size={14} aria-hidden />,
  },
  {
    id: 'holdings',
    get label(): string {
      return msg('portfolioPage.holdings');
    },
    icon: <Layers size={14} aria-hidden />,
  },
  {
    id: 'allocation',
    get label(): string {
      return msg('portfolioPage.allocation');
    },
    icon: <Coins size={14} aria-hidden />,
  },
  {
    id: 'insights',
    get label(): string {
      return msg('decisions.observations');
    },
    icon: <Sparkles size={14} aria-hidden />,
  },
  {
    id: 'quality',
    get label(): string {
      return msg('portfolioPage.quality');
    },
    icon: <ListChecks size={14} aria-hidden />,
  },
  {
    id: 'declare',
    get label(): string {
      return msg('portfolioPage.declare');
    },
    icon: <PencilLine size={14} aria-hidden />,
  },
] as const;

const TITLE = 'Portfolio';
function description(): string {
  return msg('portfolio.description');
}

export function PortfolioPage() {
  const status = usePortfolioStore((state) => state.status);
  const view = usePortfolioStore((state) => state.view);
  const unavailableReason = usePortfolioStore((state) => state.unavailableReason);
  const error = usePortfolioStore((state) => state.error);
  const load = usePortfolioStore((state) => state.load);
  const save = usePortfolioStore((state) => state.save);
  const saveStatus = usePortfolioStore((state) => state.saveStatus);
  const saveError = usePortfolioStore((state) => state.saveError);
  const validationIssues = usePortfolioStore((state) => state.validationIssues);
  const clearSave = usePortfolioStore((state) => state.clearSave);

  // The Phase 5.3 gate is read separately from the portfolio's own one, so the page can show
  // both layers of the same verdict: what the declared context allows, and what the document
  // supports. They are not the same question, and a surface that merged them would send a user
  // to fix the wrong one.
  const qualityStatus = useQualityStore((state) => state.status);
  const assessment = useQualityStore((state) => state.assessment);
  const assess = useQualityStore((state) => state.load);

  const [tab, setTab] = useState<string>('overview');

  useEffect(() => {
    if (status === 'idle') void load();
  }, [status, load]);

  useEffect(() => {
    if (tab === 'insights' && qualityStatus === 'idle') void assess();
  }, [tab, qualityStatus, assess]);

  if (status === 'idle' || status === 'loading') {
    return (
      <Workspace title={TITLE} description={description()}>
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
      <Workspace title={TITLE} description={description()}>
        <ErrorState
          severity="info"
          title={msg('portfolio.noPortfolioToShow')}
          description={`${unavailableReason ?? 'The portfolio service could not be reached.'} Nothing is displayed in its place: a holding is a fact about your account, so an illustrative one would be worse than an empty page.`}
        />
      </Workspace>
    );
  }

  if (status === 'error' || view === null) {
    return (
      <Workspace title={TITLE} description={description()}>
        <ErrorState
          title={msg('portfolio.couldNotReadThePortfolio')}
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

  const blocked = view.readiness.filter((decision) => decision.readiness === 'BLOCKED');

  return (
    <Workspace title={TITLE} description={description()}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={view.declared ? 'primary' : 'info'}>
          {view.declared ? `declared · version ${view.version}` : 'not declared yet'}
        </Badge>
        <Badge tone="neutral">
          {view.metrics.coverage.positions} {msg('portfolio.position')}
          {view.metrics.coverage.positions === 1 ? '' : 's'}
        </Badge>
        <Badge tone={view.metrics.valuationComplete ? 'success' : 'warning'}>
          {view.metrics.valuationComplete ? 'fully valued' : 'partial valuation'}
        </Badge>
        {blocked.length > 0 ? (
          <Badge tone="danger">
            {blocked.length} {msg('portfolio.scopeSBlocked')}
          </Badge>
        ) : null}
        {view.insights.length > 0 ? (
          <Badge tone="outline">
            {view.insights.length} {msg('portfolio.observationS')}
          </Badge>
        ) : null}
      </div>

      {saveStatus === 'saved' ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border border-primary/40 bg-primary-soft px-3 py-2">
          <p className="text-body text-text">
            {msg('portfolio.theDeclarationWasStoredAsVersion')} {view.version}
            {msg('portfolio.everyEarlierVersionIsKeptAnd')}
          </p>
          <Button size="sm" variant="ghost" onClick={clearSave}>
            {msg('portfolio.dismiss')}
          </Button>
        </div>
      ) : null}

      {saveStatus === 'failed' ? (
        <ErrorState
          title={msg('portfolio.theDeclarationWasNotStored')}
          description={saveError?.message ?? 'The request failed without a reason.'}
          code={saveError?.code}
        />
      ) : null}

      <Tabs
        items={TABS}
        value={tab}
        onValueChange={setTab}
        aria-label={msg('portfolio.portfolioSections')}
      >
        <TabPanel value="overview">
          <div className="space-y-4">
            <PortfolioOverview view={view} />
            <PortfolioValueCard metrics={view.metrics} />
            <PortfolioReadinessPanel decisions={view.readiness} />
          </div>
        </TabPanel>

        <TabPanel value="holdings">
          <div className="space-y-4">
            {view.metrics.positions.length === 0 ? (
              <EmptyState
                title={msg('portfolio.noPositionsDeclared')}
                description={msg('portfolioPage.nothingHasBeenDeclaredForThisAccountSo')}
                action={
                  <Button size="sm" onClick={() => setTab('declare')}>
                    Declare a composition
                  </Button>
                }
              />
            ) : (
              <>
                <Card>
                  <CardHeader divider>
                    <div className="min-w-0">
                      <CardTitle>{msg('portfolio.positions')}</CardTitle>
                      <CardDescription>
                        {msg('portfolio.everyFigureWasComputedOnThe')}
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <HoldingsTable metrics={view.metrics} />
                  </CardContent>
                </Card>
                <MissingHoldingData gaps={view.metrics.gaps} />
              </>
            )}
          </div>
        </TabPanel>

        <TabPanel value="allocation">
          <div className="space-y-4">
            <AllocationPair
              byMarketValue={view.metrics.weights.byMarketValue}
              byDeclaredWeight={view.metrics.weights.byDeclaredWeight}
              dimension="assetClass"
            />
            <AllocationPair
              byMarketValue={view.metrics.weights.byMarketValue}
              byDeclaredWeight={view.metrics.weights.byDeclaredWeight}
              dimension="currency"
            />
            <ConcentrationRiskCard
              byMarketValue={view.metrics.weights.byMarketValue}
              byDeclaredWeight={view.metrics.weights.byDeclaredWeight}
              insight={view.insights.find((insight) => insight.type === 'concentration') ?? null}
            />
            <RiskExposurePanel metrics={view.metrics} />
          </div>
        </TabPanel>

        <TabPanel value="insights">
          <div className="space-y-4">
            <PortfolioInsightsList insights={view.insights} />

            {qualityStatus === 'loading' ? (
              <Card>
                <CardContent className="space-y-3 pt-4">
                  <Skeleton className="h-4 w-1/4" />
                  <Skeleton className="h-3 w-full" />
                </CardContent>
              </Card>
            ) : null}

            {assessment === null ? null : (
              <div className="space-y-3">
                <p className="text-caption text-text-faint">
                  {msg('portfolio.theTwoLayersOfTheSame')}
                </p>
                {assessment.decisions
                  .filter(
                    (decision) =>
                      decision.requestedType === 'portfolio.composition' ||
                      decision.requestedType === 'portfolio.risk',
                  )
                  .map((decision) => (
                    <AnalysisReadinessPanel key={decision.requestedType} decision={decision} />
                  ))}
              </div>
            )}
          </div>
        </TabPanel>

        <TabPanel value="quality">
          <div className="space-y-4">
            <PortfolioQualitySummary assessment={view.assessment} metrics={view.metrics} />
            <PortfolioSnapshotTimeline snapshots={view.snapshots} currentVersion={view.version} />
          </div>
        </TabPanel>

        <TabPanel value="declare">
          <div className="space-y-4">
            <HoldingsEditor
              portfolio={view.portfolio}
              saving={saveStatus === 'saving'}
              validationIssues={validationIssues}
              onSubmit={async (document) => {
                await save(document);
              }}
            />
            {view.declared ? (
              <MissingHoldingData gaps={view.metrics.gaps} />
            ) : (
              <EmptyState
                title={msg('portfolio.nothingIsStoredYet')}
                description={msg('portfolioPage.savingHereCreatesVersion1OfTheDeclaration')}
              />
            )}
          </div>
        </TabPanel>
      </Tabs>
    </Workspace>
  );
}
