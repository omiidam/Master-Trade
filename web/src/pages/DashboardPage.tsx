import { useEffect, useState } from 'react';
import {
  Activity,
  BookOpen,
  Clock,
  Info,
  RefreshCw,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Section,
} from '../components/Card';
import { AgentCardItem, AgentCardList, AgentCheck } from '../components/agent/AgentCard';
import { ChartAdapter } from '../components/charts/ChartAdapter';
import { Sparkline } from '../components/charts/Sparkline';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { SkeletonCard } from '../components/Skeleton';
import { TabPanel, Tabs } from '../components/Tabs';
import { Tooltip } from '../components/Tooltip';
import { Grid, Workspace } from '../app/Workspace';
import {
  MOCK_GENERATED_AT,
  mockActivity,
  mockBars,
  mockDashboard,
  mockSeries,
  mockStudyMetrics,
} from '../mock/data';
import { mockScoreEvolution, summariseExamProgress } from '../mock/exams';
import { memoryStatus, mockKnowledge, mockKnowledgeGrowth } from '../mock/memory';
import { summariseResearch } from '../mock/research';
import { useUiStore } from '../store/ui';
import { formatPercent, formatRelative, formatTimestamp } from '../lib/format';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'activity', label: 'Activity' },
  { id: 'states', label: 'State examples' },
] as const;

export function DashboardPage() {
  const [tab, setTab] = useState<string>('overview');
  const [loading, setLoading] = useState(true);
  const setPage = useUiStore((state) => state.setPage);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 900);
    return () => clearTimeout(timer);
  }, []);

  /** Module roll-ups for the overview widgets, derived from the mock rows only. */
  const examProgress = summariseExamProgress();
  const researchProgress = summariseResearch();
  const verifiedRecords = mockKnowledge.filter(
    (record) => memoryStatus(record) === 'verified',
  ).length;
  const verifiedShare = formatPercent((verifiedRecords / mockKnowledge.length) * 100, 0);
  const growthTotal = (point: (typeof mockKnowledgeGrowth)[number] | undefined) =>
    point === undefined ? 0 : point.verified + point.pending + point.unverified;
  const latestGrowth = growthTotal(mockKnowledgeGrowth[mockKnowledgeGrowth.length - 1]);
  const previousGrowth = growthTotal(mockKnowledgeGrowth[mockKnowledgeGrowth.length - 2]);
  const addedThisMonth = Math.max(latestGrowth - previousGrowth, 0);

  return (
    <Workspace
      title="Training dashboard"
      description="Progress, study metrics and read-only charts. Every figure below is illustrative preview data typed against the backend view models."
      actions={
        <>
          <Badge tone="outline" icon={<ShieldCheck size={12} aria-hidden />}>
            read-only
          </Badge>
          <Tooltip content="Reloads the layout skeleton. No job is queued in this phase.">
            <Button
              variant="secondary"
              leadingIcon={<RefreshCw size={14} aria-hidden />}
              onClick={() => setLoading(true)}
            >
              Refresh view
            </Button>
          </Tooltip>
        </>
      }
    >
      <Grid columns={4}>
        {mockStudyMetrics.map((metric) => (
          <Card surface="metric" key={metric.id}>
            <CardHeader divider>
              <div>
                <CardTitle className="text-body">{metric.label}</CardTitle>
                <CardDescription>{metric.hint}</CardDescription>
              </div>
              <Badge tone={metric.trend === 'up' ? 'primary' : 'warning'}>{metric.delta}</Badge>
            </CardHeader>
            <CardContent className="flex items-end justify-between gap-3">
              <span className="num text-metric text-text">{metric.value}</span>
              {metric.trend === 'up' ? (
                <span className="text-primary" aria-hidden>
                  <TrendingUp size={16} />
                </span>
              ) : (
                <span className="text-warning" aria-hidden>
                  <TrendingDown size={16} />
                </span>
              )}
            </CardContent>
            <CardFooter className="text-caption text-text-faint">
              <span>vs. previous 30 days</span>
              <Sparkline values={mockSeries.slice(0, 12)} width={72} height={20} />
            </CardFooter>
          </Card>
        ))}
      </Grid>

      <Tabs
        items={TABS.map((item) => ({ id: item.id, label: item.label }))}
        value={tab}
        onValueChange={setTab}
        aria-label="Dashboard sections"
      >
        <TabPanel value="overview" className="space-y-4">
          <Card surface="featured">
            <CardHeader divider>
              <div>
                <CardTitle>Training equity curve</CardTitle>
                <CardDescription>
                  {mockDashboard.headings[0]} · {mockDashboard.symbol} · {mockDashboard.timeframe}
                </CardDescription>
              </div>
              <Badge tone="info">chart adapter</Badge>
            </CardHeader>
            <CardContent>
              <ChartAdapter
                bars={mockBars}
                symbol={mockDashboard.symbol}
                timeframe={mockDashboard.timeframe}
                provenance={mockDashboard.dataProvenance}
                source="synthetic-generator"
                updatedAt={mockDashboard.lastUpdated}
                height={260}
              />
            </CardContent>
          </Card>

          <Grid columns={2}>
            <Card>
              <CardHeader divider>
                <div>
                  <CardTitle className="text-body">Strengths</CardTitle>
                  <CardDescription>{mockDashboard.headings[1]}</CardDescription>
                </div>
                <BookOpen size={16} aria-hidden className="text-text-faint" />
              </CardHeader>
              {/*
                The reference's checked list: a filled accent disc with a dark tick, and the
                statement beside it. A short list of things that *hold* is what the mark is for,
                which is why this card takes it and the grid of figures above does not.
              */}
              <CardContent>
                <AgentCardList>
                  <AgentCardItem badge={<AgentCheck />}>
                    Consistent review habit: 11 consecutive days with a written session.
                  </AgentCardItem>
                  <AgentCardItem badge={<AgentCheck />}>
                    Risk-first framing appears in every journal entry this month.
                  </AgentCardItem>
                </AgentCardList>
              </CardContent>
            </Card>
            <Card>
              <CardHeader divider>
                <div>
                  <CardTitle className="text-body">Watch list</CardTitle>
                  <CardDescription>{mockDashboard.headings[2]}</CardDescription>
                </div>
                <ShieldCheck size={16} aria-hidden className="text-text-faint" />
              </CardHeader>
              {/* The same list in its other tone: a marked row whose mark is a caution, not a tick. */}
              <CardContent>
                <AgentCardList>
                  <AgentCardItem badge={<AgentCheck tone="warning" />}>
                    Exam average dipped on the second risk module attempt.
                  </AgentCardItem>
                  <AgentCardItem badge={<AgentCheck tone="warning" />}>
                    One journal entry missing an explicit invalidation level.
                  </AgentCardItem>
                </AgentCardList>
              </CardContent>
            </Card>
          </Grid>

          <Section
            title="Knowledge, assessment and research"
            description="Roll-ups from the product modules. Each figure is illustrative and each card states what it cannot tell you."
          >
            <Grid columns={4}>
              <Card surface="metric">
                <CardHeader divider>
                  <div>
                    <CardTitle className="text-body">Knowledge mastery</CardTitle>
                    <CardDescription>
                      {verifiedRecords} of {mockKnowledge.length} records verified
                    </CardDescription>
                  </div>
                  <Badge tone="primary">{verifiedShare}</Badge>
                </CardHeader>
                <CardContent className="flex items-end justify-between gap-3">
                  <span className="num text-metric text-text">{verifiedShare}</span>
                  <Sparkline
                    values={mockKnowledgeGrowth.map((point) => point.verified)}
                    width={72}
                    height={20}
                  />
                </CardContent>
                <CardFooter className="text-caption text-text-faint">
                  <span>Verified means a human or tool checked it.</span>
                  <Button size="sm" variant="ghost" onClick={() => setPage('memory')}>
                    Open memory
                  </Button>
                </CardFooter>
              </Card>

              <Card surface="metric">
                <CardHeader divider>
                  <div>
                    <CardTitle className="text-body">Exam performance</CardTitle>
                    <CardDescription>
                      {examProgress.passed} passed of {examProgress.attempted} attempted
                    </CardDescription>
                  </div>
                  <Badge tone="info">{examProgress.attempts} attempts</Badge>
                </CardHeader>
                <CardContent className="flex items-end justify-between gap-3">
                  <span className="num text-metric text-text">
                    {examProgress.averageBest === null
                      ? '—'
                      : formatPercent(examProgress.averageBest, 1)}
                  </span>
                  <Sparkline
                    values={mockScoreEvolution.map((point) => point.score)}
                    width={72}
                    height={20}
                    tone="info"
                  />
                </CardContent>
                <CardFooter className="text-caption text-text-faint">
                  <span>Rubric-scored, never model-judged.</span>
                  <Button size="sm" variant="ghost" onClick={() => setPage('exams')}>
                    Open exams
                  </Button>
                </CardFooter>
              </Card>

              <Card surface="metric">
                <CardHeader divider>
                  <div>
                    <CardTitle className="text-body">Memory growth</CardTitle>
                    <CardDescription>Records added in the last month</CardDescription>
                  </div>
                  <Badge tone="neutral">+{addedThisMonth}</Badge>
                </CardHeader>
                <CardContent className="flex items-end justify-between gap-3">
                  <span className="num text-metric text-text">{latestGrowth}</span>
                  <Sparkline
                    values={mockKnowledgeGrowth.map(
                      (point) => point.verified + point.pending + point.unverified,
                    )}
                    width={72}
                    height={20}
                    tone="ai"
                  />
                </CardContent>
                <CardFooter className="text-caption text-text-faint">
                  <span>Growth is not mastery: unverified rows still count.</span>
                  <Button size="sm" variant="ghost" onClick={() => setPage('memory')}>
                    Open history
                  </Button>
                </CardFooter>
              </Card>

              <Card surface="metric">
                <CardHeader divider>
                  <div>
                    <CardTitle className="text-body">Research progress</CardTitle>
                    <CardDescription>
                      {researchProgress.complete} complete · {researchProgress.active} running
                    </CardDescription>
                  </div>
                  <Badge tone="warning">{researchProgress.pendingDecisions} pending</Badge>
                </CardHeader>
                <CardContent className="flex items-end justify-between gap-3">
                  <span className="num text-metric text-text">
                    {researchProgress.evaluatedTrades}
                  </span>
                  <span className="text-caption text-text-faint">trades evaluated</span>
                </CardContent>
                <CardFooter className="text-caption text-text-faint">
                  <span>A result never activates a rule by itself.</span>
                  <Button size="sm" variant="ghost" onClick={() => setPage('research')}>
                    Open research
                  </Button>
                </CardFooter>
              </Card>
            </Grid>
          </Section>

          <ErrorState
            severity="info"
            title="Preview data"
            description="This dashboard is not connected to the backend. Progress, metrics and charts are illustrative and typed against the final view models."
            code="PREVIEW_FIXTURE"
            action={
              <span className="inline-flex items-center gap-1.5 text-caption">
                <Info size={13} aria-hidden />
                Real figures will come from deterministic backend tools, never from the model.
              </span>
            }
          />
        </TabPanel>

        <TabPanel value="activity" className="space-y-3">
          {loading ? (
            <Grid columns={2}>
              <SkeletonCard rows={4} />
              <SkeletonCard rows={4} />
            </Grid>
          ) : (
            <Card surface="data">
              <CardHeader divider>
                <div>
                  <CardTitle className="text-body">Recent agent and system events</CardTitle>
                  <CardDescription>
                    The shape of the activity log: correlation id, actor, event, evidence
                  </CardDescription>
                </div>
                <Badge tone="neutral">mock</Badge>
              </CardHeader>
              <CardContent className="divide-y divide-border">
                {mockActivity.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="mt-0.5 text-text-faint" aria-hidden>
                      <Activity size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-body text-text">{entry.event}</span>
                        <Badge tone={entry.actor === 'agent' ? 'ai' : 'neutral'}>
                          {entry.actor}
                        </Badge>
                        <span className="num text-caption text-text-faint">
                          {entry.correlationId}
                        </span>
                      </div>
                      <p className="mt-0.5 text-caption text-text-muted">{entry.detail}</p>
                    </div>
                    <span className="num shrink-0 text-caption text-text-faint">
                      {formatTimestamp(entry.at)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabPanel>

        <TabPanel value="states" className="space-y-4">
          <Grid columns={2}>
            <Card>
              <CardHeader divider>
                <CardTitle className="text-body">Loading state</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <SkeletonCard rows={3} />
                <p className="text-caption text-text-faint">
                  Skeletons are used while a query is in flight; the pulse respects
                  prefers-reduced-motion.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader divider>
                <CardTitle className="text-body">Empty state</CardTitle>
              </CardHeader>
              <CardContent>
                <EmptyState
                  icon={<Clock size={22} aria-hidden />}
                  title="No sessions recorded yet"
                  description="Completed lessons and graded exams will appear here as soon as the persistence slice lands."
                  hint="Empty is a valid state — it is stated, not hidden."
                />
              </CardContent>
            </Card>
          </Grid>
          <ErrorState
            severity="warning"
            title="Scheduled evaluation has not run"
            description="The evaluation harness is in place; the scheduler that enqueues it arrives with the durable job queue."
            code="PROVIDER_UNAVAILABLE"
            action={
              <span className="text-caption">
                Failure surfaces report a typed error code, never a raw provider payload.
              </span>
            }
          />
        </TabPanel>
      </Tabs>

      <p className="text-caption text-text-faint">
        Preview generated {formatRelative(MOCK_GENERATED_AT)} · {formatTimestamp(MOCK_GENERATED_AT)}
      </p>
    </Workspace>
  );
}
