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
  CONFIDENCE_CAVEAT,
  EXPERIMENT_STATUS_LABEL,
  RESEARCH_METHOD_NOTE,
  RESEARCH_PREVIEW_NOTICE,
  mockExperimentTimeline,
  mockExperiments,
  mockReports,
  summariseResearch,
} from '../mock/research';

const TABS = [
  { id: 'overview', label: 'Overview', icon: <Layers size={14} aria-hidden /> },
  { id: 'experiments', label: 'Experiments', icon: <FlaskConical size={14} aria-hidden /> },
  { id: 'metrics', label: 'Metrics', icon: <Sigma size={14} aria-hidden /> },
  { id: 'report', label: 'Report', icon: <ClipboardCheck size={14} aria-hidden /> },
  { id: 'timeline', label: 'Timeline', icon: <GitBranch size={14} aria-hidden /> },
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
      title="Research"
      description="Experiments that test a proposed rule against evidence. Metrics come from deterministic code over a fixed data set; a rule cannot become active without a recorded human approval."
      actions={
        <>
          <Badge tone="outline" icon={<ShieldCheck size={12} aria-hidden />}>
            approval-gated
          </Badge>
          <Tooltip content={RESEARCH_PREVIEW_NOTICE}>
            <Badge tone="warning">preview data</Badge>
          </Tooltip>
        </>
      }
    >
      <Grid columns={4}>
        <Card surface="metric">
          <CardHeader divider>
            <div>
              <CardTitle className="text-body">Research progress</CardTitle>
              <CardDescription>
                {progress.complete} complete · {progress.active} running · {progress.planned}{' '}
                planned
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <ProgressIndicator
              value={progress.complete}
              max={mockExperiments.length}
              label="Experiments evaluated"
              hint="A completed experiment is a finished measurement, not an adopted rule."
            />
          </CardContent>
        </Card>
        <Card surface="metric">
          <CardHeader divider>
            <div>
              <CardTitle className="text-body">Evaluated trades</CardTitle>
              <CardDescription>Total across evaluations with metrics</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <span className="num text-metric text-text">{progress.evaluatedTrades}</span>
            <p className="mt-2 text-caption text-text-faint">
              Sample size is reported before any rate, because a rate without it is a rumour.
            </p>
          </CardContent>
        </Card>
        <Card surface="metric">
          <CardHeader divider>
            <div>
              <CardTitle className="text-body">Pending decisions</CardTitle>
              <CardDescription>Awaiting a recorded human approval</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <span className="num text-metric text-warning">{progress.pendingDecisions}</span>
            <p className="mt-2 text-caption text-text-faint">
              A promising result stays inactive until a person decides. The system cannot adopt its
              own proposal.
            </p>
          </CardContent>
        </Card>
        <Card surface="metric">
          <CardHeader divider>
            <div>
              <CardTitle className="text-body">Abandoned</CardTitle>
              <CardDescription>Stopped with the reason recorded</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <span className="num text-metric text-text-muted">{progress.abandoned}</span>
            <p className="mt-2 text-caption text-text-faint">
              Rejections are kept. An experiment tuned until it looks good is a worse outcome than
              one that was dropped.
            </p>
          </CardContent>
        </Card>
      </Grid>

      <Tabs
        items={TABS.map((item) => ({ id: item.id, label: item.label, icon: item.icon }))}
        value={tab}
        onValueChange={setTab}
        aria-label="Research sections"
      >
        <TabPanel value="overview" className="space-y-4">
          <Grid columns={2}>
            <Card surface="featured">
              <CardHeader divider>
                <div>
                  <CardTitle className="text-body">Active experiments</CardTitle>
                  <CardDescription>Running, plus anything waiting on a decision</CardDescription>
                </div>
                <Badge tone="info">{progress.active + progress.awaitingApproval} open</Badge>
              </CardHeader>
              <CardContent className="space-y-2 text-caption text-text-muted">
                <p>{RESEARCH_METHOD_NOTE}</p>
                <p>{CONFIDENCE_CAVEAT}</p>
              </CardContent>
            </Card>
            <Card surface="data">
              <CardHeader divider>
                <div>
                  <CardTitle className="text-body">Findings summary</CardTitle>
                  <CardDescription>The one line each experiment currently supports</CardDescription>
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
            title="Experiments in flight"
            description="Each card states its hypothesis before its numbers."
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
            title="No backtest engine in this phase"
            description={RESEARCH_PREVIEW_NOTICE}
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
                      <CardTitle className="text-body">Findings</CardTitle>
                      <CardDescription>
                        What this experiment currently supports, and what it does not
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
                    <span>updated {formatRelative(selected.updatedAt)}</span>
                  </CardFooter>
                </Card>
              </Grid>
            </Section>
          ) : null}

          <EmptyState
            icon={<Beaker size={22} aria-hidden />}
            title="Select an experiment to inspect it"
            description="Choosing a card shows its evaluation metrics, findings and provenance. The preview ships five experiments, including one abandoned on purpose."
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
              caveat={`${CONFIDENCE_CAVEAT} This experiment is still running, so the interval around average R still contains zero.`}
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
                <CardTitle className="text-body">Reported first</CardTitle>
              </CardHeader>
              <CardContent className="text-caption text-text-muted">
                Sample size comes before any rate on every surface, because a rate without its
                sample is a claim without its limits.
              </CardContent>
            </Card>
            <Card>
              <CardHeader divider>
                <CardTitle className="text-body">Win rate is not edge</CardTitle>
              </CardHeader>
              <CardContent className="text-caption text-text-muted">
                A 58% win rate with negative average R is the textbook shape of hidden tail risk.
                Expectancy is what the evaluation is about.
              </CardContent>
            </Card>
            <Card>
              <CardHeader divider>
                <CardTitle className="text-body">Missing means missing</CardTitle>
              </CardHeader>
              <CardContent className="text-caption text-text-muted">
                An unevaluated experiment shows no metrics at all — never zeroes, which would read
                as a measured flat result.
              </CardContent>
            </Card>
          </Grid>
        </TabPanel>

        <TabPanel value="report" className="space-y-4">
          <ReportViewer report={report} provenance="synthetic" sourceRef="synthetic-generator" />
          <Grid columns={3}>
            <Card>
              <CardHeader divider>
                <CardTitle className="text-body">No model text</CardTitle>
              </CardHeader>
              <CardContent className="text-caption text-text-muted">
                Reports are assembled from stored evaluation rows and rubric references. The model
                may explain a report, but it does not write the numbers into it.
              </CardContent>
            </Card>
            <Card>
              <CardHeader divider>
                <CardTitle className="text-body">Same visual weight</CardTitle>
              </CardHeader>
              <CardContent className="text-caption text-text-muted">
                Limitations are rendered alongside the findings, not in a footnote, so a report is
                not read as a green light.
              </CardContent>
            </Card>
            <Card>
              <CardHeader divider>
                <CardTitle className="text-body">Decision, not activation</CardTitle>
              </CardHeader>
              <CardContent className="text-caption text-text-muted">
                A report can recommend continuing or stopping the study. Adopting a rule is a
                separate, human-approved action.
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
                  <CardTitle className="text-body">Evidence is appended</CardTitle>
                  <CardDescription>Never edited in place</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="text-caption text-text-muted">
                A re-run adds a new evaluation with its own sample size, so an earlier verdict stays
                readable in the context it was reached in.
              </CardContent>
            </Card>
            <Card>
              <CardHeader divider>
                <div>
                  <CardTitle className="text-body">Approval is explicit</CardTitle>
                  <CardDescription>Recorded with a rationale</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="text-caption text-text-muted">
                Requesting approval writes a pending record; the decision names a decider and cannot
                be made by the requester.
              </CardContent>
            </Card>
            <Card>
              <CardHeader divider>
                <div>
                  <CardTitle className="text-body">Loading and empty</CardTitle>
                  <CardDescription>Stated, not hidden</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <SkeletonCard rows={2} />
                <p className="text-caption text-text-faint">
                  <span className="inline-flex items-center gap-1.5">
                    <Hourglass size={12} aria-hidden />A running experiment with no evaluation yet
                    shows an empty metrics panel.
                  </span>
                </p>
              </CardContent>
            </Card>
          </Grid>
          <p className="text-caption text-text-faint">
            {mockExperiments.length} experiments · {progress.evaluatedTrades} trades across every
            evaluation that produced metrics · {progress.awaitingApproval} awaiting a human
            decision.
          </p>
        </TabPanel>
      </Tabs>
    </Workspace>
  );
}
