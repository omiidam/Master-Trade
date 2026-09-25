import { useState } from 'react';
import {
  Beaker,
  ClipboardCheck,
  FlaskConical,
  GitBranch,
  Hourglass,
  Layers,
  Lightbulb,
  ShieldCheck,
  Sigma,
} from 'lucide-react';
import { Badge } from '../components/Badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Section,
} from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { SkeletonCard } from '../components/Skeleton';
import { ProgressIndicator } from '../components/exams/ProgressIndicator';
import { ExperimentTimeline } from '../components/research/ExperimentTimeline';
import { MetricsPanel } from '../components/research/MetricsPanel';
import { ReportViewer } from '../components/research/ReportViewer';
import { ResearchCard } from '../components/research/ResearchCard';
import { ProvenanceBanner } from '../components/ProvenanceBanner';
import { TabPanel, Tabs } from '../components/Tabs';
import { Tooltip } from '../components/Tooltip';
import { Grid, Workspace } from '../app/Workspace';
import { formatRelative } from '../lib/format';
import {
  confidenceCaveat,
  EXPERIMENT_STATUS_LABEL,
  methodNote,
  previewNotice,
  mockExperimentTimeline,
  mockExperiments,
  mockReports,
  summariseResearch,
} from '../mock/research';
import { msg } from '../i18n/index.js';

const TABS = [
  {
    id: 'overview',
    get label(): string {
      return msg('dashboardPage.overview');
    },
    icon: <Layers size={14} aria-hidden />,
  },
  {
    id: 'experiments',
    get label(): string {
      return msg('researchPage.experiments');
    },
    icon: <FlaskConical size={14} aria-hidden />,
  },
  {
    id: 'metrics',
    get label(): string {
      return msg('research.metrics');
    },
    icon: <Sigma size={14} aria-hidden />,
  },
  {
    id: 'report',
    get label(): string {
      return msg('research.report');
    },
    icon: <ClipboardCheck size={14} aria-hidden />,
  },
  {
    id: 'timeline',
    get label(): string {
      return msg('researchPage.timeline');
    },
    icon: <GitBranch size={14} aria-hidden />,
  },
] as const;

export function ResearchPage() {
  const [tab, setTab] = useState<string>('overview');
  const [selectedId, setSelectedId] = useState<string>(mockExperiments[0]?.id ?? '');
  const progress = summariseResearch();
  const selected = mockExperiments.find((experiment) => experiment.id === selectedId);
  const report = mockReports[0] ?? null;
  const awaiting = mockExperiments.filter(
    (experiment) => experiment.status === 'awaiting-approval',
  );
  const experimentTitles = Object.fromEntries(
    mockExperiments.map((experiment) => [experiment.id, experiment.title]),
  );

  return (
    <Workspace
      title={msg('research.research')}
      description={msg('researchPage.experimentsThatTestAProposedRuleAgainstEvidence')}
      actions={
        <>
          <Badge tone="outline" icon={<ShieldCheck size={12} aria-hidden />}>
            approval-gated
          </Badge>
          <Tooltip content={previewNotice()}>
            <Badge tone="warning">preview data</Badge>
          </Tooltip>
        </>
      }
    >
      <Grid columns={4}>
        <Card surface="metric">
          <CardHeader divider>
            <div>
              <CardTitle className="text-body">{msg('dashboard.researchProgress')}</CardTitle>
              <CardDescription>
                {progress.complete} {msg('dashboard.complete')} {progress.active}{' '}
                {msg('realtime.running')} {progress.planned} {msg('research.planned')}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <ProgressIndicator
              value={progress.complete}
              max={mockExperiments.length}
              label={msg('researchPage.experimentsEvaluated')}
              hint={msg('researchPage.aCompletedExperimentIsAFinishedMeasurementNot')}
            />
          </CardContent>
        </Card>
        <Card surface="metric">
          <CardHeader divider>
            <div>
              <CardTitle className="text-body">{msg('research.evaluatedTrades')}</CardTitle>
              <CardDescription>{msg('research.totalAcrossEvaluationsWithMetrics')}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <span className="num text-metric text-text">{progress.evaluatedTrades}</span>
            <p className="mt-2 text-caption text-text-faint">
              {msg('research.sampleSizeIsReportedBeforeAny')}
            </p>
          </CardContent>
        </Card>
        <Card surface="metric">
          <CardHeader divider>
            <div>
              <CardTitle className="text-body">{msg('research.pendingDecisions')}</CardTitle>
              <CardDescription>{msg('research.awaitingARecordedHumanApproval')}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <span className="num text-metric text-warning">{progress.pendingDecisions}</span>
            <p className="mt-2 text-caption text-text-faint">
              {msg('research.aPromisingResultStaysInactiveUntil')}
            </p>
          </CardContent>
        </Card>
        <Card surface="metric">
          <CardHeader divider>
            <div>
              <CardTitle className="text-body">{msg('research.abandoned')}</CardTitle>
              <CardDescription>{msg('research.stoppedWithTheReasonRecorded')}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <span className="num text-metric text-text-muted">{progress.abandoned}</span>
            <p className="mt-2 text-caption text-text-faint">
              {msg('research.rejectionsAreKeptAnExperimentTuned')}
            </p>
          </CardContent>
        </Card>
      </Grid>

      <Tabs
        items={TABS.map((item) => ({ id: item.id, label: item.label, icon: item.icon }))}
        value={tab}
        onValueChange={setTab}
        aria-label={msg('research.researchSections')}
      >
        <TabPanel value="overview" className="space-y-4">
          <Grid columns={2}>
            <Card surface="featured">
              <CardHeader divider>
                <div>
                  <CardTitle className="text-body">{msg('research.activeExperiments')}</CardTitle>
                  <CardDescription>{msg('research.runningPlusAnythingWaitingOnA')}</CardDescription>
                </div>
                <Badge tone="info">
                  {progress.active + progress.awaitingApproval} {msg('research.open')}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-2 text-caption text-text-muted">
                <p>{methodNote()}</p>
                <p>{confidenceCaveat()}</p>
              </CardContent>
            </Card>
            <Card surface="data">
              <CardHeader divider>
                <div>
                  <CardTitle className="text-body">{msg('research.findingsSummary')}</CardTitle>
                  <CardDescription>
                    {msg('research.theOneLineEachExperimentCurrently')}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {mockExperiments.map((experiment) => (
                  <div key={experiment.id} className="flex items-start gap-2">
                    <span aria-hidden className="mt-0.5 text-text-faint">
                      <Lightbulb size={13} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-caption text-text">{experiment.title}</p>
                      <p className="text-caption text-text-muted">
                        {experiment.findings[0] ?? 'No finding recorded yet.'}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </Grid>

          <Section
            title={msg('research.experimentsInFlight')}
            description={msg('researchPage.eachCardStatesItsHypothesisBeforeItsNumbers')}
          >
            <Grid columns={2}>
              {mockExperiments
                .filter(
                  (experiment) =>
                    experiment.status === 'running' || experiment.status === 'awaiting-approval',
                )
                .map((experiment) => (
                  <ResearchCard
                    key={experiment.id}
                    experiment={experiment}
                    onOpen={(id) => {
                      setSelectedId(id);
                      setTab('experiments');
                    }}
                  />
                ))}
            </Grid>
          </Section>

          <ErrorState
            severity="info"
            title={msg('research.noBacktestEngineInThisPhase')}
            description={previewNotice()}
            code="PROVIDER_UNAVAILABLE"
            action={
              <span className="text-caption">
                The durable queue, `rule_evaluations` table and approval gate exist in the backend;
                the `backtest.run` handler arrives with the job worker.
              </span>
            }
          />
        </TabPanel>

        <TabPanel value="experiments" className="space-y-4">
          <Grid columns={2}>
            {mockExperiments.map((experiment) => (
              <ResearchCard
                key={experiment.id}
                experiment={experiment}
                onOpen={(id) => setSelectedId(id)}
                className={selectedId === experiment.id ? 'border-primary' : undefined}
              />
            ))}
          </Grid>

          {selected ? (
            <Section
              title={`Detail — ${selected.title}`}
              description={`${EXPERIMENT_STATUS_LABEL[selected.status]} · ${selected.method}`}
            >
              <Grid columns={2}>
                <MetricsPanel
                  metrics={selected.metrics}
                  {...(selected.metricsSource === 'synthetic'
                    ? {
                        provenance: 'synthetic' as const,
                        sourceRef: selected.provenance.ref,
                        updatedAt: selected.provenance.recordedAt,
                      }
                    : {})}
                />
                <Card surface="data">
                  <CardHeader divider>
                    <div>
                      <CardTitle className="text-body">{msg('portfolio.findings')}</CardTitle>
                      <CardDescription>
                        {msg('research.whatThisExperimentCurrentlySupportsAnd')}
                      </CardDescription>
                    </div>
                    <Badge tone="neutral">{selected.findings.length}</Badge>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {selected.findings.map((finding) => (
                      <p key={finding} className="text-caption text-text-muted">
                        {finding}
                      </p>
                    ))}
                    <ProvenanceBanner
                      provenance={
                        selected.metricsSource === 'synthetic' ? 'synthetic' : 'historical'
                      }
                      source={selected.provenance.ref}
                      updatedAt={selected.provenance.recordedAt}
                    />
                    {selected.provenance.note ? (
                      <p className="text-caption text-text-faint">{selected.provenance.note}</p>
                    ) : null}
                  </CardContent>
                  <CardFooter className="text-caption text-text-faint">
                    <span>
                      {selected.approvalRef === null
                        ? 'No approval request attached'
                        : `Approval ${selected.approvalRef} pending`}
                    </span>
                    <span>
                      {msg('memory.updated')} {formatRelative(selected.updatedAt)}
                    </span>
                  </CardFooter>
                </Card>
              </Grid>
            </Section>
          ) : null}

          <EmptyState
            icon={<Beaker size={22} aria-hidden />}
            title={msg('research.selectAnExperimentToInspectIt')}
            description={msg('researchPage.choosingACardShowsItsEvaluationMetricsFindings')}
          />
        </TabPanel>

        <TabPanel value="metrics" className="space-y-4">
          {awaiting.map((experiment) => (
            <MetricsPanel
              key={experiment.id}
              metrics={experiment.metrics}
              provenance="synthetic"
              sourceRef={experiment.provenance.ref}
              updatedAt={experiment.provenance.recordedAt}
            />
          ))}

          <Grid columns={2}>
            <MetricsPanel
              metrics={
                mockExperiments.find((experiment) => experiment.id === 'exp-02')?.metrics ?? null
              }
              provenance="synthetic"
              sourceRef="synthetic-generator"
              updatedAt="2026-09-18T07:30:00Z"
              caveat={`${confidenceCaveat()} This experiment is still running, so the interval around average R still contains zero.`}
            />
            <MetricsPanel
              metrics={
                mockExperiments.find((experiment) => experiment.id === 'exp-04')?.metrics ?? null
              }
            />
          </Grid>

          <Grid columns={3}>
            <Card>
              <CardHeader divider>
                <CardTitle className="text-body">{msg('research.reportedFirst')}</CardTitle>
              </CardHeader>
              <CardContent className="text-caption text-text-muted">
                {msg('research.sampleSizeComesBeforeAnyRate')}
              </CardContent>
            </Card>
            <Card>
              <CardHeader divider>
                <CardTitle className="text-body">{msg('research.winRateIsNotEdge')}</CardTitle>
              </CardHeader>
              <CardContent className="text-caption text-text-muted">
                {msg('research.a58WinRateWithNegative')}
              </CardContent>
            </Card>
            <Card>
              <CardHeader divider>
                <CardTitle className="text-body">{msg('research.missingMeansMissing')}</CardTitle>
              </CardHeader>
              <CardContent className="text-caption text-text-muted">
                {msg('research.anUnevaluatedExperimentShowsNoMetrics')}
              </CardContent>
            </Card>
          </Grid>
        </TabPanel>

        <TabPanel value="report" className="space-y-4">
          <ReportViewer report={report} provenance="synthetic" sourceRef="synthetic-generator" />
          <Grid columns={3}>
            <Card>
              <CardHeader divider>
                <CardTitle className="text-body">{msg('research.noModelText')}</CardTitle>
              </CardHeader>
              <CardContent className="text-caption text-text-muted">
                {msg('research.reportsAreAssembledFromStoredEvaluation')}
              </CardContent>
            </Card>
            <Card>
              <CardHeader divider>
                <CardTitle className="text-body">{msg('research.sameVisualWeight')}</CardTitle>
              </CardHeader>
              <CardContent className="text-caption text-text-muted">
                {msg('research.limitationsAreRenderedAlongsideTheFindings')}
              </CardContent>
            </Card>
            <Card>
              <CardHeader divider>
                <CardTitle className="text-body">{msg('research.decisionNotActivation')}</CardTitle>
              </CardHeader>
              <CardContent className="text-caption text-text-muted">
                {msg('research.aReportCanRecommendContinuingOr')}
              </CardContent>
            </Card>
          </Grid>
        </TabPanel>

        <TabPanel value="timeline" className="space-y-4">
          <ExperimentTimeline
            entries={mockExperimentTimeline}
            experimentTitles={experimentTitles}
          />
          <Grid columns={3}>
            <Card>
              <CardHeader divider>
                <div>
                  <CardTitle className="text-body">{msg('research.evidenceIsAppended')}</CardTitle>
                  <CardDescription>{msg('research.neverEditedInPlace')}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="text-caption text-text-muted">
                {msg('research.aReRunAddsANew')}
              </CardContent>
            </Card>
            <Card>
              <CardHeader divider>
                <div>
                  <CardTitle className="text-body">{msg('research.approvalIsExplicit')}</CardTitle>
                  <CardDescription>{msg('research.recordedWithARationale')}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="text-caption text-text-muted">
                {msg('research.requestingApprovalWritesAPendingRecord')}
              </CardContent>
            </Card>
            <Card>
              <CardHeader divider>
                <div>
                  <CardTitle className="text-body">{msg('research.loadingAndEmpty')}</CardTitle>
                  <CardDescription>{msg('research.statedNotHidden')}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <SkeletonCard rows={2} />
                <p className="text-caption text-text-faint">
                  <span className="inline-flex items-center gap-1.5">
                    <Hourglass size={12} aria-hidden />
                    {msg('research.aRunningExperimentWithNoEvaluation')}
                  </span>
                </p>
              </CardContent>
            </Card>
          </Grid>
          <p className="text-caption text-text-faint">
            {mockExperiments.length} {msg('research.experiments')} {progress.evaluatedTrades}{' '}
            {msg('research.tradesAcrossEveryEvaluationThatProduced')} {progress.awaitingApproval}{' '}
            {msg('research.awaitingAHumanDecision')}
          </p>
        </TabPanel>
      </Tabs>
    </Workspace>
  );
}
