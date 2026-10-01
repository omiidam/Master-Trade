import { useEffect, type ReactNode } from 'react';
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
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { MetricBar } from '../components/journal/MetricBar';
import { SkeletonCard } from '../components/Skeleton';
import { Reveal } from '../components/Reveal';
import { Tooltip } from '../components/Tooltip';
import { Grid, Workspace } from '../app/Workspace';
import type {
  DashboardMetricsView,
  DashboardErrorView as DashboardErrorRow,
} from '@shared/frontend/viewModels';
import { formatPercent, formatRelative, formatTimestamp } from '../lib/format';
import { useDashboardStore } from '../store/dashboard';
import { useUiStore } from '../store/ui';
import { msg } from '../i18n/index.js';

/**
 * The training dashboard, reading the caller's own metrics from the API.
 *
 * The eight surfaces keep the Phase 9.1 composition — three metric plates, the mastery
 * frame beside the one featured card, the two gap surfaces, the market summary — but
 * every figure now arrives from `GET /v1/dashboard` through the dashboard store, the
 * same session resolution every authenticated surface reuses. The page computes
 * nothing: percentages, means, the level and the streak are the server's derivation,
 * and a section with nothing to report arrives as `null` or an empty array, which each
 * card renders as its stated empty state rather than as a zero.
 *
 * The four states the store can report are all drawn: `loading` as skeletons that hold
 * the finished layout's shape (so data arriving moves nothing), `unavailable` as the
 * honest reason there is nothing to show, `error` with its typed code and a retry, and
 * `ready` as the metrics themselves.
 */
export function DashboardPage() {
  const setPage = useUiStore((state) => state.setPage);
  const status = useDashboardStore((state) => state.status);
  const dashboard = useDashboardStore((state) => state.dashboard);
  const unavailableReason = useDashboardStore((state) => state.unavailableReason);
  const error = useDashboardStore((state) => state.error);
  const load = useDashboardStore((state) => state.load);

  useEffect(() => {
    if (status === 'idle') void load();
  }, [status, load]);

  // The context row is the page's, not a state's: it renders in every state, because
  // "read-only" and "reload" describe the surface, not one branch of it.
  const actions = (
    <>
      <Badge tone="outline" icon={<ShieldCheck size={12} aria-hidden />}>
        read-only
      </Badge>
      <Tooltip content={msg('dashboard.serverDerived')}>
        <Button
          variant="secondary"
          leadingIcon={<RefreshCw size={14} aria-hidden />}
          onClick={() => void load()}
        >
          {msg('dashboard.refresh')}
        </Button>
      </Tooltip>
    </>
  );

  let body: ReactNode;
  if (status === 'idle' || status === 'loading') {
    // The skeletons mirror the ready layout's blocks, so the first paint holds the
    // same shape the data will fill — nothing below moves when the read lands.
    body = (
      <>
        <Grid columns={3}>
          {[0, 1, 2].map((index) => (
            <SkeletonCard key={index} rows={4} />
          ))}
        </Grid>
        <Grid columns={2}>
          {[0, 1].map((index) => (
            <SkeletonCard key={index} rows={5} />
          ))}
        </Grid>
      </>
    );
  } else if (status === 'unavailable') {
    body = (
      <ErrorState
        severity="info"
        title={msg('dashboard.noDashboardToShowYet')}
        description={`${unavailableReason ?? msg('dashboard.noProgressRecordedYet')} ${msg('dashboard.serverDerived')}`}
      />
    );
  } else if (status === 'error' || dashboard === null) {
    body = (
      <ErrorState
        title={msg('dashboard.couldNotReadTheDashboard')}
        description={error?.message ?? msg('dashboard.noProgressRecordedYet')}
        code={error?.code}
        action={
          <Button size="sm" variant="secondary" onClick={() => void load()}>
            {msg('dashboard.tryAgain')}
          </Button>
        }
      />
    );
  } else {
    body = <DashboardRead metrics={dashboard.metrics} onOpen={setPage} />;
  }

  return (
    <Workspace actions={actions}>
      <div className="flex flex-col gap-5">{body}</div>
    </Workspace>
  );
}

/**
 * The ready layout. Separated from the state plumbing above so the ready branch owns
 * only the eight surfaces and their empty states.
 */
function DashboardRead({
  metrics,
  onOpen,
}: {
  metrics: DashboardMetricsView;
  onOpen: (page: 'academy' | 'exams') => void;
}) {
  const { course, lesson } = metrics.course;
  const totalAttempts = metrics.knowledgeMastery.reduce(
    (sum, domain) => sum + domain.attemptCount,
    0,
  );

  return (
    <>
      <div className="flex flex-col gap-5">
        {/* The three figures a reader scans: identity, habit, evaluation. */}
        <Reveal index={0}>
          <Grid columns={3}>
            <Card surface="metric">
              <CardHeader
                divider
                actions={course ? <Badge tone="primary">{msg('dashboard.module')}</Badge> : null}
              >
                <div>
                  <CardTitle className="text-body">{msg('dashboard.agentLevel')}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {metrics.agentLevel === null ? (
                  <EmptyState
                    title={msg('dashboard.nothingYet')}
                    description={msg('dashboard.noProgressRecordedYet')}
                  />
                ) : (
                  <>
                    <span className="text-metric text-text">{metrics.agentLevel}</span>
                    <p className="text-caption text-text-faint">
                      <span className="num">{totalAttempts}</span>{' '}
                      {totalAttempts === 1
                        ? msg('dashboard.attemptsOne')
                        : msg('dashboard.attemptsMany')}{' '}
                      {msg('dashboard.basedOnAttempts')}
                    </p>
                  </>
                )}
              </CardContent>
              <CardFooter className="text-caption text-text-faint">
                <span>{msg('dashboard.levelIsTheCurriculumStage')}</span>
                <Button size="sm" variant="ghost" onClick={() => onOpen('academy')}>
                  {msg('dashboard.openAcademy')}
                </Button>
              </CardFooter>
            </Card>

            <Card surface="metric">
              <CardHeader divider>
                <div>
                  <CardTitle className="text-body">{msg('data.reviewStreak')}</CardTitle>
                  <CardDescription>{msg('dashboard.streakDays')}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="flex items-end justify-between gap-3">
                {metrics.learningStreakDays === 0 ? (
                  <EmptyState
                    icon={<Clock size={20} aria-hidden />}
                    title={msg('dashboard.nothingYet')}
                    description={msg('dashboard.streakZero')}
                  />
                ) : (
                  <span className="text-metric text-text">
                    <span className="num">{metrics.learningStreakDays}</span>{' '}
                    <span className="text-caption text-text-muted">{msg('data.days')}</span>
                  </span>
                )}
                <span className="text-text-faint" aria-hidden>
                  <Flame size={16} />
                </span>
              </CardContent>
              <CardFooter className="text-caption text-text-faint">
                <span>{msg('dashboard.streakDays')}</span>
              </CardFooter>
            </Card>

            <Card surface="metric">
              <CardHeader divider>
                <div>
                  <CardTitle className="text-body">{msg('dashboard.latestExamScore')}</CardTitle>
                  {metrics.examScore ? (
                    <CardDescription>{metrics.examScore.examTitle}</CardDescription>
                  ) : null}
                </div>
                {metrics.examScore ? (
                  <Badge tone={metrics.examScore.passed ? 'primary' : 'danger'}>
                    {metrics.examScore.passed
                      ? msg('dashboard.attemptPassed')
                      : msg('dashboard.attemptFailed')}
                  </Badge>
                ) : null}
              </CardHeader>
              <CardContent>
                {metrics.examScore ? (
                  <>
                    <span className="num text-metric text-text">
                      {formatPercent(metrics.examScore.scorePercent, 1)}
                    </span>
                    <p className="mt-2 text-caption text-text-muted">
                      <span className="num">{metrics.examScore.attemptCount}</span>{' '}
                      {msg('dashboard.attempts')} ·{' '}
                      <span className="num">{formatTimestamp(metrics.examScore.attemptedAt)}</span>
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
                <span>{msg('dashboard.rubricScoredNeverModelJudged')}</span>
                <Button size="sm" variant="ghost" onClick={() => onOpen('exams')}>
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
                    <span className="num">{metrics.knowledgeMastery.length}</span>{' '}
                    {msg('dashboard.patterns')}
                  </Badge>
                }
              >
                <div>
                  <CardTitle className="text-body">{msg('dashboard.knowledgeMastery')}</CardTitle>
                  <CardDescription>{msg('data.meanOfYourBestScorePerExamination')}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {metrics.knowledgeMastery.length === 0 ? (
                  <EmptyState
                    title={msg('dashboard.nothingYet')}
                    description={msg('dashboard.noProgressRecordedYet')}
                  />
                ) : (
                  metrics.knowledgeMastery.map((domain) => (
                    <MetricBar
                      key={domain.domain}
                      label={domain.domain}
                      value={
                        domain.masteryPercent === null
                          ? '—'
                          : formatPercent(domain.masteryPercent, 1)
                      }
                      share={domain.masteryPercent === null ? 0 : domain.masteryPercent / 100}
                      hint={`${domain.attemptCount} ${msg('dashboard.attempts')}`}
                    />
                  ))
                )}
              </CardContent>
              <CardFooter className="text-caption text-text-faint">
                <span>{msg('dashboard.masteryIsTheMeanOfBestScores')}</span>
              </CardFooter>
            </Card>

            <Card surface="featured">
              <CardHeader divider>
                <div>
                  <CardTitle>{msg('dashboard.currentCourseAndLesson')}</CardTitle>
                  <CardDescription>{msg('dashboard.serverDerived')}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {course ? (
                  <CardTile as="section" aria-label={msg('dashboard.course')} className="space-y-1">
                    <p className="text-caption font-medium text-text-faint">
                      {msg('dashboard.course')}
                    </p>
                    <p className="text-body font-semibold text-text">{course.title}</p>
                    <p className="text-caption text-text-muted">
                      <span className="num">{course.lessonsTotal}</span> {msg('academy.lessons')}
                    </p>
                  </CardTile>
                ) : (
                  <EmptyState title={msg('dashboard.noCourseInProgress')} />
                )}
                {lesson ? (
                  <CardTile as="section" aria-label={msg('dashboard.lesson')} className="space-y-1">
                    <p className="text-caption font-medium text-text-faint">
                      {msg('dashboard.lesson')}
                    </p>
                    <p className="text-body font-semibold text-text">{lesson.title}</p>
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
                <span>{msg('dashboard.basedOnAttempts')}</span>
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
                {metrics.weakAreas.length === 0 ? (
                  <EmptyState
                    title={msg('dashboard.noWeakAreasYet')}
                    hint={msg('dashboard.noWeakAreaYet')}
                  />
                ) : (
                  metrics.weakAreas.map((domain, index) => (
                    <MetricBar
                      key={domain.domain}
                      label={domain.domain}
                      value={
                        domain.masteryPercent === null
                          ? '—'
                          : formatPercent(domain.masteryPercent, 1)
                      }
                      share={domain.masteryPercent === null ? 0 : domain.masteryPercent / 100}
                      tone={index === 0 ? 'warning' : 'info'}
                      hint={`${domain.attemptCount} ${msg('dashboard.attempts')}`}
                    />
                  ))
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
                    <span className="num">{metrics.recentErrors.length}</span>{' '}
                    {msg('dashboard.patterns')}
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
                {metrics.recentErrors.length === 0 ? (
                  <EmptyState
                    icon={<CircleAlert size={20} aria-hidden />}
                    title={msg('exams.nothingMissedYet')}
                    description={msg('dashboard.noErrorsRecorded')}
                    hint={msg('dashboardPage.emptyIsAValidStateItIs')}
                  />
                ) : (
                  <ol className="space-y-3">
                    {metrics.recentErrors.map((error: DashboardErrorRow) => (
                      <li key={error.id} className="space-y-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-body text-text">{error.topic}</p>
                          <span className="num shrink-0 text-caption text-text-muted">
                            {error.occurrences} {msg('exams.misses')}
                          </span>
                        </div>
                        <p className="text-caption text-text-faint">
                          {msg('exams.lastSeen')}{' '}
                          <span className="num">{formatTimestamp(error.lastSeenAt)}</span>
                        </p>
                      </li>
                    ))}
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
              actions={<ProvenanceBadge provenance={metrics.marketAnalysis.dataProvenance} />}
            >
              <div>
                <CardTitle className="text-body">{msg('dashboard.marketAnalysis')}</CardTitle>
                <CardDescription>
                  <span className="num">{metrics.marketAnalysis.symbol}</span> ·{' '}
                  <span className="num">{metrics.marketAnalysis.timeframe}</span>
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {/*
               * A series is drawn only from the numbers the read handed over, and the
               * read hands over none yet: it reports `barCount: 0` and no last bar. So the
               * card says exactly that instead of charting a local sample under a real
               * symbol — an invented bar here would be indistinguishable from a measured
               * one, which is worse than an empty card on this surface.
               */}
              <EmptyState
                title={msg('dashboard.nothingYet')}
                description={msg('dashboard.marketSeriesUnavailable')}
                hint={msg('dashboard.marketAnalysisSummaryOnly')}
              />
            </CardContent>
            <CardFooter className="text-caption text-text-faint">
              <span>{msg('dashboard.marketAnalysisSummaryOnly')}</span>
              <span className="num">{formatRelative(metrics.asOf)}</span>
            </CardFooter>
          </Card>
        </Reveal>

        <p className="text-caption text-text-faint">
          {msg('dashboard.serverDerived')} ·{' '}
          <span className="num">{formatTimestamp(metrics.asOf)}</span>
        </p>
      </div>
    </>
  );
}
