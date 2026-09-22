/**
 * Evaluation — recorded decisions, and the capability catalogue behind them.
 *
 * Two surfaces, one sidebar entry, and the tabs are internal for the same reason the Journal's are:
 * the module is one thing to a reader, and a navigation tree that grew a branch per section would
 * describe the implementation rather than the work.
 *
 * The order is the reading order of the question this page answers — *what did I decide, and what
 * does the platform claim it can do about it?* Decisions come first because they are the reader's
 * own; the catalogue second, because it explains the rest of the product rather than this page.
 *
 * Four rules, all inherited from the phase:
 *
 *   1. **Nothing is measured here.** No return, no R multiple, no drawdown, no comparison against an
 *      expectation. Every figure arrives computed by the engine and labelled with what it is, and a
 *      number derived in the browser would be a second opinion about somebody's money.
 *   2. **A refusal is rendered, not smoothed.** A record that cannot be evaluated shows the composed
 *      verdict, both gate layers and the questions that would change the answer — because a button
 *      that appears to do nothing is worse than one that explains why it will not.
 *   3. **No capability is resolved in the browser.** The catalogue's states and reasons are the
 *      server's, carried through unchanged. This page cannot authorize anything, which is the whole
 *      point of it not deciding.
 *   4. **No fixture stands in for an account.** With no session there is nothing to read, and the
 *      page says so with the resolver's own reason rather than rendering a plausible-looking
 *      record.
 *
 * Responsive from the start, and mobile is a first-class target from Phase 5.7 onward: the tabs
 * scroll rather than wrap, the decision list becomes a stacked column above the detail rather than
 * a fixed rail, and the one table on the page scrolls inside its own container so the page body
 * never scrolls sideways.
 */

import { useEffect, useMemo, useState } from 'react';
import { Blocks, FileSearch, Layers, RefreshCw, ShieldQuestion } from 'lucide-react';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Section,
} from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { Skeleton } from '../components/Skeleton';
import { TabPanel, Tabs } from '../components/Tabs';
import {
  DecisionCard,
  DecisionReadinessPanel,
  DecisionSummary,
  EvaluationHistory,
  EvaluationLimitationsPanel,
  EvaluationSummary,
} from '../components/decisions';
import {
  CapabilityCard,
  CapabilityPipeline,
  CapabilitySummary,
  ModuleMap,
} from '../components/capabilities';
import { Grid, Workspace } from '../app/Workspace';
import { useCapabilitiesStore } from '../store/capabilities';
import { useDecisionsStore } from '../store/decisions';

const TITLE = 'Evaluation';
const DESCRIPTION =
  'Record what you decided, see what the recorded prices say happened — and what could not be measured — and read what the platform claims it can and cannot do with it. Nothing here is predicted, and no decision is graded.';

const TABS = [
  { id: 'decisions', label: 'Decisions', icon: <FileSearch size={14} aria-hidden /> },
  { id: 'capabilities', label: 'Capabilities', icon: <Blocks size={14} aria-hidden /> },
];

export function EvaluationPage() {
  const [tab, setTab] = useState('decisions');

  const listStatus = useDecisionsStore((state) => state.status);
  const list = useDecisionsStore((state) => state.list);
  const listError = useDecisionsStore((state) => state.error);
  const unavailableReason = useDecisionsStore((state) => state.unavailableReason);
  const view = useDecisionsStore((state) => state.view);
  const detailStatus = useDecisionsStore((state) => state.detailStatus);
  const detailError = useDecisionsStore((state) => state.detailError);
  const evaluateStatus = useDecisionsStore((state) => state.evaluateStatus);
  const evaluateMessage = useDecisionsStore((state) => state.evaluateMessage);
  const loadDecisions = useDecisionsStore((state) => state.load);
  const selectDecision = useDecisionsStore((state) => state.select);
  const evaluateDecision = useDecisionsStore((state) => state.evaluate);
  const clearSelection = useDecisionsStore((state) => state.clearSelection);

  const capabilitiesStatus = useCapabilitiesStore((state) => state.status);
  const capabilities = useCapabilitiesStore((state) => state.view);
  const capabilitiesError = useCapabilitiesStore((state) => state.error);
  const loadCapabilities = useCapabilitiesStore((state) => state.load);

  useEffect(() => {
    void loadDecisions();
  }, [loadDecisions]);

  useEffect(() => {
    if (tab === 'capabilities' && capabilitiesStatus === 'idle') void loadCapabilities();
  }, [tab, capabilitiesStatus, loadCapabilities]);

  const decisionList = useMemo(() => list?.decisions ?? [], [list]);
  const selectedId = view?.decision.id ?? null;

  return (
    <Workspace title={TITLE} description={DESCRIPTION}>
      <Tabs items={TABS} value={tab} onValueChange={setTab} aria-label="Evaluation sections">
        {/* ------------------------------------------------------------ */}
        {/* Decisions                                                      */}
        {/* ------------------------------------------------------------ */}
        <TabPanel value="decisions" className="space-y-4">
          {listStatus === 'loading' && list === null ? (
            <Grid columns={2}>
              {[0, 1].map((index) => (
                <Card key={index}>
                  <CardContent className="space-y-3 pt-4">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-8 w-2/3" />
                    <Skeleton className="h-3 w-full" />
                  </CardContent>
                </Card>
              ))}
            </Grid>
          ) : null}

          {listStatus === 'unavailable' ? (
            <ErrorState
              severity="info"
              title="No decisions to show"
              description={`${unavailableReason ?? 'The decision store could not be reached.'} Nothing is displayed in its place: a decision is a record of something you actually did, so a stand-in would be a fabricated one.`}
            />
          ) : null}

          {listStatus === 'error' ? (
            <ErrorState
              title="Could not read your decisions"
              description={listError?.message ?? 'The request failed without a reason.'}
              code={listError?.code}
              action={
                <Button size="sm" variant="secondary" onClick={() => void loadDecisions()}>
                  Try again
                </Button>
              }
            />
          ) : null}

          {listStatus === 'ready' && decisionList.length === 0 ? (
            <EmptyState
              icon={<ShieldQuestion size={22} aria-hidden />}
              title="Nothing recorded yet"
              description="Decisions are recorded through the API with the prices, the risk you planned and what you expected. Once one exists, this page measures what its own prices say happened."
              hint="A decision is a record of your reasoning, not a trade order. Nothing on this page can place one."
            />
          ) : null}

          {listStatus === 'ready' && decisionList.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
              {/* List: a rail on desktop, a stacked list above the detail on tablet and mobile. */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-caption text-text-muted">
                    {decisionList.length} of {list?.total ?? decisionList.length} recorded
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void loadDecisions()}
                    aria-label="Refresh the decision list"
                  >
                    <RefreshCw size={14} aria-hidden />
                    Refresh
                  </Button>
                </div>
                <ul className="space-y-2">
                  {decisionList.map((decision) => (
                    <li key={decision.id}>
                      <DecisionCard
                        decision={decision}
                        selected={decision.id === selectedId}
                        onSelect={(id) => void selectDecision(id)}
                      />
                    </li>
                  ))}
                </ul>
                <p className="text-caption text-text-muted">{list?.note}</p>
              </div>

              {/* Detail */}
              <div className="min-w-0 space-y-4">
                {view === null ? (
                  <EmptyState
                    title="Select a decision"
                    description="Its record, the readiness verdict from both gates, and the evaluation computed from the prices on the record."
                  />
                ) : null}

                {detailStatus === 'loading' ? (
                  <Card>
                    <CardContent className="space-y-3 pt-4">
                      <Skeleton className="h-5 w-1/3" />
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-4/5" />
                    </CardContent>
                  </Card>
                ) : null}

                {detailStatus === 'error' || detailStatus === 'unavailable' ? (
                  <ErrorState
                    title="Could not read the decision"
                    description={detailError?.message ?? 'The request failed without a reason.'}
                    code={detailError?.code}
                  />
                ) : null}

                {view !== null ? (
                  <>
                    <DecisionSummary decision={view.decision} />

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={evaluateStatus === 'evaluating'}
                        onClick={() => void evaluateDecision(view.decision.id)}
                      >
                        {evaluateStatus === 'evaluating' ? 'Evaluating…' : 'Evaluate this decision'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={clearSelection}>
                        Close
                      </Button>
                      {/* The refusal is rendered beside the button that produced it, in the
                          server's own words, rather than as a toast that disappears. */}
                      {evaluateStatus === 'refused' ? (
                        <Badge tone="warning">Not evaluated — the reasons are below</Badge>
                      ) : null}
                      {evaluateStatus === 'done' ? (
                        <Badge tone="success">Evaluation recorded</Badge>
                      ) : null}
                      {evaluateStatus === 'failed' ? (
                        <Badge tone="danger">{evaluateMessage ?? 'The request failed.'}</Badge>
                      ) : null}
                    </div>

                    {evaluateMessage !== null && evaluateStatus !== 'failed' ? (
                      <p className="text-caption text-text-muted">{evaluateMessage}</p>
                    ) : null}

                    <DecisionReadinessPanel readiness={view.readiness} />

                    {view.report === null ? (
                      <EvaluationLimitationsPanel report={null} readiness={view.readiness} />
                    ) : (
                      <>
                        <EvaluationSummary report={view.report} />
                        <EvaluationLimitationsPanel report={view.report} />
                      </>
                    )}

                    <EvaluationHistory evaluations={view.evaluations} />
                    <p className="text-caption text-text-muted">{view.note}</p>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}
        </TabPanel>

        {/* ------------------------------------------------------------ */}
        {/* Capabilities                                                   */}
        {/* ------------------------------------------------------------ */}
        <TabPanel value="capabilities" className="space-y-4">
          {capabilitiesStatus === 'loading' || capabilitiesStatus === 'idle' ? (
            <Grid columns={2}>
              {[0, 1, 2, 3].map((index) => (
                <Card key={index}>
                  <CardContent className="space-y-3 pt-4">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-3/4" />
                  </CardContent>
                </Card>
              ))}
            </Grid>
          ) : null}

          {capabilitiesStatus === 'unavailable' ? (
            <ErrorState
              severity="info"
              title="No capability catalogue to show"
              description={`${unavailableReason ?? 'The catalogue could not be reached.'} Nothing is displayed in its place: the catalogue is a claim about what this deployment can do, and the client is not the thing that gets to make it.`}
            />
          ) : null}

          {capabilitiesStatus === 'error' ? (
            <ErrorState
              title="Could not read the capability catalogue"
              description={capabilitiesError?.message ?? 'The request failed without a reason.'}
              code={capabilitiesError?.code}
              action={
                <Button size="sm" variant="secondary" onClick={() => void loadCapabilities()}>
                  Try again
                </Button>
              }
            />
          ) : null}

          {capabilitiesStatus === 'ready' && capabilities !== null ? (
            <>
              <Card>
                <CardHeader>
                  <div className="min-w-0">
                    <CardTitle>What this account can do right now</CardTitle>
                    <CardDescription>
                      Each state is computed on the server from your own declarations and from what
                      the capability declares it needs. Availability and readiness are separate
                      claims, so a capability that is not built says so instead of asking you for
                      inputs it could not use.
                    </CardDescription>
                  </div>
                  <Badge tone="outline">
                    {capabilities.capabilities.length} declared · {capabilities.modules.length}{' '}
                    modules
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  <CapabilitySummary view={capabilities} />
                  <p className="text-caption text-text-muted">{capabilities.note}</p>
                </CardContent>
              </Card>

              <Section
                title="Capabilities"
                description="Each one declares the inputs it is gated by, the operation the role table decides, the engine that computes its figures, and what it claims — including what it does not."
              >
                <Grid columns={2}>
                  {capabilities.capabilities.map((capability) => (
                    <CapabilityCard key={capability.id} capability={capability} />
                  ))}
                </Grid>
              </Section>

              <Section
                title="Readiness per analysis"
                description="The gate's verdict for every declared analysis type, from your own context. Nothing here is decided by a model."
              >
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {capabilities.readiness.map((decision) => (
                    <Card key={decision.requestedType}>
                      <CardHeader>
                        <div className="min-w-0">
                          <CardTitle className="text-body">{decision.requestedType}</CardTitle>
                          <CardDescription>
                            {decision.capability === 'planned'
                              ? 'Declared and not built in this build'
                              : 'Built in this build'}
                          </CardDescription>
                        </div>
                        <Badge tone={decision.readiness === 'BLOCKED' ? 'danger' : 'warning'}>
                          {decision.readiness.replaceAll('_', ' ').toLowerCase()}
                        </Badge>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {/* Both layers are visible: inputs can be ready for a capability that is
                            not built, and saying only one of those would mislead. */}
                        <p className="text-caption text-text-muted">
                          Inputs: {decision.classification ?? 'nothing to assess'} · decided by{' '}
                          {decision.decidedBy}
                        </p>
                        <ul className="list-disc space-y-1 pl-5">
                          {decision.limitations.slice(0, 4).map((limitation) => (
                            <li key={limitation} className="text-caption text-text-muted">
                              {limitation}
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </Section>

              <ModuleMap modules={capabilities.modules} />
              <CapabilityPipeline stages={capabilities.stages} />

              <Card>
                <CardHeader>
                  <div className="min-w-0">
                    <CardTitle>
                      <span className="inline-flex items-center gap-2">
                        <Layers size={16} aria-hidden />
                        What is deliberately absent
                      </span>
                    </CardTitle>
                    <CardDescription>
                      No capability here places an order, connects a broker or runs live. There is
                      no operation for one, no plan includes one, and the engine has no tool behind
                      one.
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-caption text-text-muted">
                    A request naming a capability nobody declared is refused at resolution, before
                    any input is read — capabilities are deny-by-default, so an undeclared id has no
                    implementation to reach.
                  </p>
                </CardContent>
              </Card>
            </>
          ) : null}
        </TabPanel>
      </Tabs>
    </Workspace>
  );
}
