import { useState } from 'react';
import { CircleAlert, Clock, Flame, GraduationCap, RefreshCw, ShieldCheck } from 'lucide-react';
import { Badge, ProvenanceBadge } from '../components/Badge';
import { Button } from '../components/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTile,
  CardTitle,
} from '../components/Card';
import { ChartAdapter } from '../components/charts/ChartAdapter';
import { ProgressIndicator } from '../components/exams/ProgressIndicator';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { MetricBar } from '../components/journal/MetricBar';
import { Reveal } from '../components/Reveal';
import { Tooltip } from '../components/Tooltip';
import { Grid, Workspace } from '../app/Workspace';
import {
  MOCK_GENERATED_AT,
  mockBars,
  mockCurriculum,
  mockDashboard,
  mockLessons,
  mockProgress,
  mockStudyMetrics,
} from '../mock/data';
import {
  mockExamAttempts,
  mockExamCategories,
  mockExamDefinitions,
  mockMistakes,
  summariseExamProgress,
  type ExamCategory,
} from '../mock/exams';
import { formatPercent, formatRelative, formatTimestamp } from '../lib/format';
import { useUiStore } from '../store/ui';
import { msg } from '../i18n/index.js';

/**
 * A learning domain the assessments have actually scored.
 *
 * Mastery and weak areas are both derived from the examination categories, and neither may
 * average a gap: a domain with no attempt is *unassessed*, which is a different statement from
 * a low score, so it is filtered out here rather than being read as a zero further down.
 */
type AssessedDomain = ExamCategory & { averageScore: number };

function assessedDomains(): AssessedDomain[] {
  return mockExamCategories
    .filter((domain): domain is AssessedDomain => domain.averageScore !== null)
    .sort((a, b) => a.averageScore - b.averageScore);
}

/**
 * The training dashboard.
 *
 * Eight surfaces, each answering one question about where the reader stands: the level the
 * curriculum declares, the mastery the assessments recorded, the course and lesson that are open,
 * the latest scored examination, the domains sitting lowest, the mistake patterns those
 * assessments produced, the review streak, and a summary of the market analysis. Every figure is
 * read from the existing module data — curriculum, examinations, assessment attempts and mistake
 * patterns — and every surface that can be empty states why it is empty rather than drawing a
 * zero: a domain nobody attempted, a lesson not yet started and a blank attempt history are
 * different facts, and they are kept different here.
 *
 * The sections are deliberately not one card repeated eight times: the three figures a reader
 * scans are metric plates, mastery and the current context are a data frame beside the one
 * featured card, the two gap surfaces are frames of their own, and the market analysis is a
 * full-width window onto the chart. "Refresh view" replays that layout — remounting the content
 * replays its entrance — and queues no job, which is what its own tooltip says.
 */
export function DashboardPage() {
  const setPage = useUiStore((state) => state.setPage);
  const [viewEpoch, setViewEpoch] = useState(0);

  /** The stage the curriculum declares, and the lesson it says is open. */
  const currentModule =
    mockCurriculum.find((module) => module.status === 'in-progress') ??
    mockCurriculum.find((module) => module.status !== 'complete');
  const currentLesson = mockLessons.find((lesson) => lesson.status === 'in-progress');
  const streakMetric = mockStudyMetrics.find((metric) => metric.id === 'streak');

  /** Mastery, weakest first, and the domains the assessments have not reached yet. */
  const assessed = assessedDomains();
  const weakDomains = assessed.slice(0, 2);
  const unassessedDomains = mockExamCategories.filter((domain) => domain.averageScore === null);

  /** The latest attempt that produced a score: a void attempt is an abandonment, not a zero. */
  const scoredAttempts = mockExamAttempts
    .filter((attempt) => attempt.outcome !== 'void')
    .slice()
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  const latestAttempt = scoredAttempts[scoredAttempts.length - 1];
  const latestExam = mockExamDefinitions.find((exam) => exam.id === latestAttempt?.examId);
  const latestCategory = mockExamCategories.find(
    (category) => category.id === latestExam?.categoryId,
  );

  /** The mistakes the assessments recorded, most recent first, bounded to the recent ones. */
  const recentErrors = [...mockMistakes]
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
    .slice(0, 3);

  const examProgress = summariseExamProgress();

  return (
    <Workspace
      actions={
        <>
          <Badge tone="outline" icon={<ShieldCheck size={12} aria-hidden />}>
            read-only
          </Badge>
          <Tooltip content={msg('dashboardPage.reloadsTheLayoutSkeletonNoJobIsQueued')}>
            <Button
              variant="secondary"
              leadingIcon={<RefreshCw size={14} aria-hidden />}
              onClick={() => setViewEpoch((epoch) => epoch + 1)}
            >
              Refresh view
            </Button>
          </Tooltip>
        </>
      }
    >
      {/* The key is the whole of "Refresh view": remounting replays the sections' entrance and
          re-derives every figure from the same rows, with no job queued and no timer waited on. */}
      <div key={viewEpoch} className="flex flex-col gap-5">
        {/* The three figures a reader scans: identity, habit, evaluation. */}
        <Reveal index={0}>
          <Grid columns={3}>
            <Card surface="metric">
              <CardHeader
                divider
                actions={
                  currentModule ? (
                    <Badge tone="primary">
                      {msg('dashboard.module')}{' '}
                      <span className="num">
                        {currentModule.month} / {mockCurriculum.length}
                      </span>
                    </Badge>
                  ) : null
                }
              >
                <div>
                  <CardTitle className="text-body">{msg('dashboard.agentLevel')}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <span className="text-metric text-text">{mockProgress.level}</span>
                <ProgressIndicator
                  value={mockProgress.lessonsComplete}
                  max={mockProgress.lessonsTotal}
                  label={msg('academy.lessonsComplete2')}
                />
              </CardContent>
              <CardFooter className="text-caption text-text-faint">
                <span>{msg('dashboard.levelIsTheCurriculumStage')}</span>
                <Button size="sm" variant="ghost" onClick={() => setPage('academy')}>
                  {msg('dashboard.openAcademy')}
                </Button>
              </CardFooter>
            </Card>

            <Card surface="metric">
              <CardHeader divider>
                <div>
                  <CardTitle className="text-body">
                    {streakMetric?.label ?? msg('data.reviewStreak')}
                  </CardTitle>
                  <CardDescription>{streakMetric?.hint}</CardDescription>
                </div>
                {streakMetric ? (
                  <Badge tone="primary">
                    <span className="num">{streakMetric.delta}</span>
                  </Badge>
                ) : null}
              </CardHeader>
              <CardContent className="flex items-end justify-between gap-3">
                {streakMetric ? (
                  <span className="text-metric text-text">
                    <span className="num">{streakMetric.value}</span>{' '}
                    <span className="text-caption text-text-muted">{msg('data.days')}</span>
                  </span>
                ) : (
                  <span className="text-metric text-text">—</span>
                )}
                <span className="text-text-faint" aria-hidden>
                  <Flame size={16} />
                </span>
              </CardContent>
              <CardFooter className="text-caption text-text-faint">
                <span>{msg('dashboard.vsPrevious30Days')}</span>
              </CardFooter>
            </Card>

            <Card surface="metric">
              <CardHeader divider>
                <div>
                  <CardTitle className="text-body">{msg('dashboard.latestExamScore')}</CardTitle>
                  {latestExam ? <CardDescription>{latestExam.title}</CardDescription> : null}
                </div>
                {latestAttempt ? (
                  <Badge tone={latestAttempt.outcome === 'passed' ? 'primary' : 'danger'}>
                    {latestAttempt.outcome === 'passed'
                      ? msg('dashboard.attemptPassed')
                      : msg('dashboard.attemptFailed')}
                  </Badge>
                ) : null}
              </CardHeader>
              <CardContent>
                {latestAttempt && latestCategory ? (
                  <>
                    <span className="num text-metric text-text">
                      {formatPercent(latestAttempt.score, 0)}
                    </span>
                    <p className="mt-2 text-caption text-text-muted">
                      {latestCategory.label} ·{' '}
                      <span className="num">{formatTimestamp(latestAttempt.submittedAt)}</span>
                    </p>
                  </>
                ) : (
                  <EmptyState
                    icon={<GraduationCap size={20} aria-hidden />}
                    title={msg('dashboard.noExamScoredYet')}
                    description={msg('dashboardPage.completedLessonsAndGradedExamsWillAppearHere')}
                  />
                )}
              </CardContent>
              <CardFooter className="text-caption text-text-faint">
                <span>
                  <span className="num">{latestExam?.attempts ?? 0}</span>{' '}
                  {msg('dashboard.attempts')} · {msg('dashboard.rubricScoredNeverModelJudged')}
                </span>
                <Button size="sm" variant="ghost" onClick={() => setPage('exams')}>
                  {msg('dashboard.openExams')}
                </Button>
              </CardFooter>
            </Card>
          </Grid>
        </Reveal>

        {/* Learning progress beside the one card the screen is organised around. */}
        <Reveal index={1}>
          <Grid columns={2}>
            <Card surface="data">
              <CardHeader
                divider
                actions={
                  <Badge tone="outline">
                    <span className="num">{examProgress.attempted}</span>{' '}
                    {msg('dashboard.attempted')}
                  </Badge>
                }
              >
                <div>
                  <CardTitle className="text-body">{msg('dashboard.knowledgeMastery')}</CardTitle>
                  <CardDescription>{msg('data.meanOfYourBestScorePerExamination')}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {mockExamCategories.map((domain) => (
                  <div key={domain.id} className="space-y-1">
                    <MetricBar
                      label={domain.label}
                      value={
                        domain.averageScore === null ? '—' : formatPercent(domain.averageScore, 1)
                      }
                      share={domain.averageScore === null ? 0 : domain.averageScore / 100}
                      hint={domain.description}
                    />
                    {domain.averageScore === null ? (
                      <p className="text-caption text-text-faint">
                        {msg('dashboard.notAttemptedYet')}
                      </p>
                    ) : null}
                  </div>
                ))}
              </CardContent>
              <CardFooter className="text-caption text-text-faint">
                <span>{msg('dashboard.masteryIsTheMeanOfBestScores')}</span>
              </CardFooter>
            </Card>

            <Card surface="featured">
              <CardHeader divider>
                <div>
                  <CardTitle>{msg('dashboard.currentCourseAndLesson')}</CardTitle>
                  {currentModule ? (
                    <CardDescription>{currentModule.summary}</CardDescription>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {currentModule ? (
                  <CardTile as="section" aria-label={msg('dashboard.course')} className="space-y-1">
                    <p className="text-caption font-medium text-text-faint">
                      {msg('dashboard.course')}
                    </p>
                    <p className="text-body font-semibold text-text">{currentModule.title}</p>
                    <p className="text-caption text-text-muted">
                      <span className="num">{currentModule.lessons}</span> {msg('academy.lessons')}
                    </p>
                  </CardTile>
                ) : (
                  <EmptyState title={msg('dashboard.noCourseInProgress')} />
                )}
                {currentLesson ? (
                  <CardTile as="section" aria-label={msg('dashboard.lesson')} className="space-y-1">
                    <p className="text-caption font-medium text-text-faint">
                      {msg('dashboard.lesson')}
                    </p>
                    <p className="text-body font-semibold text-text">{currentLesson.title}</p>
                    <Badge tone="info">{msg('dashboard.lessonInProgress')}</Badge>
                  </CardTile>
                ) : (
                  <EmptyState
                    icon={<Clock size={20} aria-hidden />}
                    title={msg('dashboard.noLessonInProgress')}
                    description={msg('dashboardPage.completedLessonsAndGradedExamsWillAppearHere')}
                    hint={msg('dashboardPage.emptyIsAValidStateItIs')}
                  />
                )}
              </CardContent>
              <CardFooter className="text-caption text-text-faint">
                <span>{msg('dashboardPage.rollUpsFromTheProductModulesEachFigureIs')}</span>
              </CardFooter>
            </Card>
          </Grid>
        </Reveal>

        {/* The two gap surfaces: where the assessments sit lowest, and what went wrong in them. */}
        <Reveal index={2}>
          <Grid columns={2}>
            <Card surface="data">
              <CardHeader divider>
                <div>
                  <CardTitle className="text-body">{msg('dashboard.weakAreas')}</CardTitle>
                  <CardDescription>{msg('dashboard.weakestDomainsFirst')}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {weakDomains.length === 0 ? (
                  <EmptyState
                    title={msg('dashboard.noWeakAreasYet')}
                    hint={msg('dashboardPage.emptyIsAValidStateItIs')}
                  />
                ) : (
                  <>
                    {weakDomains.map((domain, index) => (
                      <MetricBar
                        key={domain.id}
                        label={domain.label}
                        value={formatPercent(domain.averageScore, 1)}
                        share={domain.averageScore / 100}
                        tone={index === 0 ? 'warning' : 'info'}
                        hint={domain.description}
                      />
                    ))}
                    {unassessedDomains.length > 0 ? (
                      <p className="text-caption text-text-faint">
                        {msg('dashboard.notYetAssessed')}:{' '}
                        {unassessedDomains.map((domain) => domain.label).join(' · ')}
                      </p>
                    ) : null}
                  </>
                )}
              </CardContent>
              <CardFooter className="text-caption text-text-faint">
                <span>{msg('dashboard.weakIsTheLowestMean')}</span>
              </CardFooter>
            </Card>

            <Card surface="data">
              <CardHeader
                divider
                actions={
                  <Badge tone="warning">
                    <span className="num">{recentErrors.length}</span> {msg('dashboard.patterns')}
                  </Badge>
                }
              >
                <div>
                  <CardTitle className="text-body">{msg('dashboard.recentErrors')}</CardTitle>
                  <CardDescription>
                    {msg('exams.patternsComeFromStoredAttemptResults')}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {recentErrors.length === 0 ? (
                  <EmptyState
                    icon={<CircleAlert size={20} aria-hidden />}
                    title={msg('exams.nothingMissedYet')}
                    description={msg(
                      'mistakeAnalysisCard.mistakePatternsAppearOnceAGradedAttemptHas',
                    )}
                    hint={msg('mistakeAnalysisCard.emptyIsStatedNotHidden')}
                  />
                ) : (
                  <ol className="space-y-3">
                    {recentErrors.map((error) => {
                      const category = mockExamCategories.find(
                        (candidate) => candidate.id === error.categoryId,
                      );
                      return (
                        <li key={error.id} className="space-y-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <p className="text-body text-text">{error.topic}</p>
                            <span className="num shrink-0 text-caption text-text-muted">
                              {error.occurrences} {msg('exams.misses')}{' '}
                              {formatPercent(error.share * 100, 0)} {msg('exams.ofMisses')}
                            </span>
                          </div>
                          <p className="text-caption text-text-muted">{error.note}</p>
                          <p className="text-caption text-text-faint">
                            {category?.label} {msg('exams.lastSeen')}{' '}
                            <span className="num">{formatTimestamp(error.lastSeenAt)}</span>
                          </p>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </CardContent>
              <CardFooter className="text-caption text-text-faint">
                <span>{msg('dashboard.theThreeMostRecent')}</span>
              </CardFooter>
            </Card>
          </Grid>
        </Reveal>

        {/* Market analysis: a summary surface and an entry point, not the engine. */}
        <Reveal index={3}>
          <Card surface="data">
            <CardHeader
              divider
              actions={<ProvenanceBadge provenance={mockDashboard.dataProvenance} />}
            >
              <div>
                <CardTitle className="text-body">{msg('dashboard.marketAnalysis')}</CardTitle>
                <CardDescription>
                  <span className="num">{mockDashboard.symbol}</span> ·{' '}
                  <span className="num">{mockDashboard.timeframe}</span>
                </CardDescription>
              </div>
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
            <CardFooter className="text-caption text-text-faint">
              <span>{msg('dashboard.marketAnalysisSummaryOnly')}</span>
              <span className="num">{formatRelative(mockDashboard.lastUpdated)}</span>
            </CardFooter>
          </Card>
        </Reveal>

        <ErrorState
          severity="info"
          title={msg('dashboard.previewData')}
          description={msg('dashboardPage.thisDashboardIsNotConnectedToTheBackend')}
          code="PREVIEW_FIXTURE"
          action={
            <span className="inline-flex items-center gap-1.5 text-caption">
              Real figures will come from deterministic backend tools, never from the model.
            </span>
          }
        />

        <p className="text-caption text-text-faint">
          {msg('dashboard.previewGenerated')} {formatRelative(MOCK_GENERATED_AT)} ·{' '}
          {formatTimestamp(MOCK_GENERATED_AT)}
        </p>
      </div>
    </Workspace>
  );
}
