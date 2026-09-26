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
import { msg } from '../i18n/index.js';

const TABS = [
  {
    id: 'overview',
    get label(): string {
      return msg('dashboardPage.overview');
    },
  },
  {
    id: 'activity',
    get label(): string {
      return msg('realtime.activity');
    },
  },
  {
    id: 'states',
    get label(): string {
      return msg('dashboardPage.stateExamples');
    },
  },
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
      title={msg('dashboard.trainingDashboard')}
      description={msg('dashboardPage.progressStudyMetricsAndReadOnlyChartsEveryFigure')}
      actions={
        <>
          <Badge tone="outline" icon={<ShieldCheck size={12} aria-hidden />}>
            read-only
          </Badge>
          <Tooltip content={msg('dashboardPage.reloadsTheLayoutSkeletonNoJobIsQueued')}>
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
              {/*
                The delta is a signed figure, so it carries `.num`: a leading `+` is a *neutral* to the bidi
                algorithm, and in a right-to-left paragraph that paints `+3` as `3+` — a different number
                wearing the same characters. `.num` gives the figure its own left-to-right context.
              */}
              <Badge tone={metric.trend === 'up' ? 'primary' : 'warning'}>
                <span className="num">{metric.delta}</span>
              </Badge>
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
              <span>{msg('dashboard.vsPrevious30Days')}</span>
              <Sparkline values={mockSeries.slice(0, 12)} width={72} height={20} />
            </CardFooter>
          </Card>
        ))}
      </Grid>

      <Tabs
        items={TABS.map((item) => ({ id: item.id, label: item.label }))}
        value={tab}
        onValueChange={setTab}
        aria-label={msg('dashboard.dashboardSections')}
      >
        <TabPanel value="overview" className="space-y-4">
          <Card surface="featured">
            <CardHeader divider>
              <div>
                <CardTitle>{msg('dashboard.trainingEquityCurve')}</CardTitle>
                <CardDescription>
                  {mockDashboard.headings[0]} · {mockDashboard.symbol} · {mockDashboard.timeframe}
                </CardDescription>
              </div>
              <Badge tone="info">{msg('dashboard.chartAdapter')}</Badge>
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
                  <CardTitle className="text-body">{msg('dashboard.strengths')}</CardTitle>
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
                    {msg('dashboard.consistentReviewHabit11ConsecutiveDays')}
                  </AgentCardItem>
                  <AgentCardItem badge={<AgentCheck />}>
                    {msg('dashboard.riskFirstFramingAppearsInEvery')}
                  </AgentCardItem>
                </AgentCardList>
              </CardContent>
            </Card>
            <Card>
              <CardHeader divider>
                <div>
                  <CardTitle className="text-body">{msg('dashboard.watchList')}</CardTitle>
                  <CardDescription>{mockDashboard.headings[2]}</CardDescription>
                </div>
                <ShieldCheck size={16} aria-hidden className="text-text-faint" />
              </CardHeader>
              {/* The same list in its other tone: a marked row whose mark is a caution, not a tick. */}
              <CardContent>
                <AgentCardList>
                  <AgentCardItem badge={<AgentCheck tone="warning" />}>
                    {msg('dashboard.examAverageDippedOnTheSecond')}
                  </AgentCardItem>
                  <AgentCardItem badge={<AgentCheck tone="warning" />}>
                    {msg('dashboard.oneJournalEntryMissingAnExplicit')}
                  </AgentCardItem>
                </AgentCardList>
              </CardContent>
            </Card>
          </Grid>

          <Section
            title={msg('dashboard.knowledgeAssessmentAndResearch')}
            description={msg('dashboardPage.rollUpsFromTheProductModulesEachFigureIs')}
          >
            <Grid columns={4}>
              <Card surface="metric">
                <CardHeader divider>
                  <div>
                    <CardTitle className="text-body">{msg('dashboard.knowledgeMastery')}</CardTitle>
                    <CardDescription>
                      {verifiedRecords} {msg('exams.of')} {mockKnowledge.length}{' '}
                      {msg('dashboard.recordsVerified')}
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
                  <span>{msg('dashboard.verifiedMeansAHumanOrTool')}</span>
                  <Button size="sm" variant="ghost" onClick={() => setPage('memory')}>
                    {msg('dashboard.openMemory')}
                  </Button>
                </CardFooter>
              </Card>

              <Card surface="metric">
                <CardHeader divider>
                  <div>
                    <CardTitle className="text-body">{msg('dashboard.examPerformance')}</CardTitle>
                    <CardDescription>
                      {examProgress.passed} {msg('dashboard.passedOf')} {examProgress.attempted}{' '}
                      {msg('dashboard.attempted')}
                    </CardDescription>
                  </div>
                  <Badge tone="info">
                    {examProgress.attempts} {msg('dashboard.attempts')}
                  </Badge>
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
                  <span>{msg('dashboard.rubricScoredNeverModelJudged')}</span>
                  <Button size="sm" variant="ghost" onClick={() => setPage('exams')}>
                    {msg('dashboard.openExams')}
                  </Button>
                </CardFooter>
              </Card>

              <Card surface="metric">
                <CardHeader divider>
                  <div>
                    <CardTitle className="text-body">{msg('dashboard.memoryGrowth')}</CardTitle>
                    <CardDescription>{msg('dashboard.recordsAddedInTheLastMonth')}</CardDescription>
                  </div>
                  <Badge tone="neutral">
                    <span className="num">+{addedThisMonth}</span>
                  </Badge>
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
                  <span>{msg('dashboard.growthIsNotMasteryUnverifiedRows')}</span>
                  <Button size="sm" variant="ghost" onClick={() => setPage('memory')}>
                    {msg('dashboard.openHistory')}
                  </Button>
                </CardFooter>
              </Card>

              <Card surface="metric">
                <CardHeader divider>
                  <div>
                    <CardTitle className="text-body">{msg('dashboard.researchProgress')}</CardTitle>
                    <CardDescription>
                      {researchProgress.complete} {msg('dashboard.complete')}{' '}
                      {researchProgress.active} {msg('dashboard.running')}
                    </CardDescription>
                  </div>
                  <Badge tone="warning">
                    {researchProgress.pendingDecisions} {msg('dashboard.pending')}
                  </Badge>
                </CardHeader>
                <CardContent className="flex items-end justify-between gap-3">
                  <span className="num text-metric text-text">
                    {researchProgress.evaluatedTrades}
                  </span>
                  <span className="text-caption text-text-faint">
                    {msg('dashboard.tradesEvaluated')}
                  </span>
                </CardContent>
                <CardFooter className="text-caption text-text-faint">
                  <span>{msg('dashboard.aResultNeverActivatesARule')}</span>
                  <Button size="sm" variant="ghost" onClick={() => setPage('research')}>
                    {msg('dashboard.openResearch')}
                  </Button>
                </CardFooter>
              </Card>
            </Grid>
          </Section>

          <ErrorState
            severity="info"
            title={msg('dashboard.previewData')}
            description={msg('dashboardPage.thisDashboardIsNotConnectedToTheBackend')}
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
                  <CardTitle className="text-body">
                    {msg('dashboard.recentAgentAndSystemEvents')}
                  </CardTitle>
                  <CardDescription>{msg('dashboard.theShapeOfTheActivityLog')}</CardDescription>
                </div>
                <Badge tone="neutral">{msg('dashboard.mock')}</Badge>
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
                <CardTitle className="text-body">{msg('dashboard.loadingState')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <SkeletonCard rows={3} />
                <p className="text-caption text-text-faint">
                  {msg('dashboard.skeletonsAreUsedWhileAQuery')}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader divider>
                <CardTitle className="text-body">{msg('dashboard.emptyState')}</CardTitle>
              </CardHeader>
              <CardContent>
                <EmptyState
                  icon={<Clock size={22} aria-hidden />}
                  title={msg('dashboard.noSessionsRecordedYet')}
                  description={msg('dashboardPage.completedLessonsAndGradedExamsWillAppearHere')}
                  hint={msg('dashboardPage.emptyIsAValidStateItIs')}
                />
              </CardContent>
            </Card>
          </Grid>
          <ErrorState
            severity="warning"
            title={msg('dashboard.scheduledEvaluationHasNotRun')}
            description={msg('dashboardPage.theEvaluationHarnessIsInPlaceTheScheduler')}
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
        {msg('dashboard.previewGenerated')} {formatRelative(MOCK_GENERATED_AT)} ·{' '}
        {formatTimestamp(MOCK_GENERATED_AT)}
      </p>
    </Workspace>
  );
}
