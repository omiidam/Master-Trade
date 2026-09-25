import { useState } from 'react';
import {
  AlertTriangle,
  Award,
  ClipboardList,
  GraduationCap,
  History,
  Hourglass,
  Layers,
  ShieldCheck,
  Target,
} from 'lucide-react';
import { AgentBadge, AgentCardItem, AgentCardList } from '../components/agent/AgentCard';
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
import { AnswerOption } from '../components/exams/AnswerOption';
import { ExamCard } from '../components/exams/ExamCard';
import { MistakeAnalysisCard } from '../components/exams/MistakeAnalysisCard';
import { ProgressIndicator } from '../components/exams/ProgressIndicator';
import { ScoreCard } from '../components/exams/ScoreCard';
import { QuestionPanel } from '../components/exams/QuestionPanel';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { SkeletonCard } from '../components/Skeleton';
import { Sparkline } from '../components/charts/Sparkline';
import { TabPanel, Tabs } from '../components/Tabs';
import { Tooltip } from '../components/Tooltip';
import { Grid, Workspace } from '../app/Workspace';
import { formatPercent, formatRelative, formatTimestamp } from '../lib/format';
import { cn } from '../lib/cn';
import {
  examGradingPolicy,
  examIntegrityPolicy,
  examPreviewNotice,
  EXAM_STATE_LABEL,
  mockCurrentAssessment,
  mockExamAttempts,
  mockExamCategories,
  mockExamDefinitions,
  mockMistakes,
  mockQuestions,
  mockScoreEvolution,
  summariseExamProgress,
} from '../mock/exams';
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
    id: 'current',
    get label(): string {
      return msg('exams.currentAssessment');
    },
    icon: <Hourglass size={14} aria-hidden />,
  },
  {
    id: 'history',
    get label(): string {
      return msg('examsPage.history');
    },
    icon: <History size={14} aria-hidden />,
  },
  {
    id: 'review',
    get label(): string {
      return msg('examsPage.mistakeReview');
    },
    icon: <AlertTriangle size={14} aria-hidden />,
  },
  {
    id: 'states',
    get label(): string {
      return msg('dashboardPage.stateExamples');
    },
    icon: <ClipboardList size={14} aria-hidden />,
  },
] as const;

const OUTCOME_TONE = { passed: 'primary', failed: 'danger', void: 'outline' } as const;

export function ExamsPage() {
  const [tab, setTab] = useState<string>('overview');
  const progress = summariseExamProgress();
  const openExams = mockExamDefinitions.filter(
    (exam) => exam.state === 'available' || exam.state === 'in-progress',
  );
  const lockedExams = mockExamDefinitions.filter((exam) => exam.state === 'locked');
  const recentAttempts = [...mockExamAttempts].sort((a, b) =>
    b.submittedAt.localeCompare(a.submittedAt),
  );
  const incorrect = mockMistakes.reduce((sum, pattern) => sum + pattern.occurrences, 0);

  const categoryLabel = (categoryId: string) =>
    mockExamCategories.find((category) => category.id === categoryId)?.label ?? categoryId;

  const evolutionFor = (examId: string) =>
    mockScoreEvolution
      .filter((point) => point.examId === examId)
      .map((point) => ({ at: point.at, score: point.score }));

  const meanFor = (examId: string) => {
    const scores = mockExamAttempts
      .filter((attempt) => attempt.examId === examId && attempt.outcome !== 'void')
      .map((attempt) => attempt.score);
    if (scores.length === 0) return null;
    return Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1));
  };

  const allScores = mockScoreEvolution.map((point) => point.score);

  return (
    <Workspace
      title={msg('exams.examinations')}
      description={msg('examsPage.assessmentScoringAndMistakeReviewAcrossTheSixMonth')}
      actions={
        <>
          <Badge tone="outline" icon={<ShieldCheck size={12} aria-hidden />}>
            no runner connected
          </Badge>
          <Tooltip content={examPreviewNotice()}>
            <Badge tone="warning">preview data</Badge>
          </Tooltip>
        </>
      }
    >
      <Grid columns={4}>
        <Card surface="metric">
          <CardHeader divider>
            <div>
              <CardTitle className="text-body">{msg('exams.assessmentProgress')}</CardTitle>
              <CardDescription>
                {progress.passed} {msg('exams.passed')} {progress.attempted}{' '}
                {msg('exams.attempted')} {progress.locked} {msg('exams.locked')}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <ProgressIndicator
              value={progress.passed}
              max={mockExamDefinitions.length}
              label={msg('examsPage.examinationsPassed')}
              hint={msg('examsPage.lockedExaminationsAreExcludedFromWhatIsAchievable')}
            />
          </CardContent>
        </Card>
        <Card surface="metric">
          <CardHeader divider>
            <div>
              <CardTitle className="text-body">{msg('exams.averageBestScore')}</CardTitle>
              <CardDescription>{msg('exams.meanOfTheBestScorePer')}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <span className="num text-metric text-text">
              {progress.averageBest === null ? '—' : formatPercent(progress.averageBest, 1)}
            </span>
            <div className="mt-2">
              <Sparkline values={allScores} width={140} height={24} tone="info" />
            </div>
            <p className="mt-2 text-caption text-text-faint">
              {msg('exams.aMeanAcrossDifferentExamsIs')}
            </p>
          </CardContent>
        </Card>
        <Card surface="metric">
          <CardHeader divider>
            <div>
              <CardTitle className="text-body">{msg('exams.attemptsToPass')}</CardTitle>
              <CardDescription>{msg('exams.meanAcrossPassedExaminations')}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <span className="num text-metric text-text">{progress.meanAttemptsToPass ?? '—'}</span>
            <p className="mt-2 text-caption text-text-faint">
              {msg('exams.retriesAreKeptAFailedAttempt')}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader divider>
            <div>
              <CardTitle className="text-body">{msg('academy.howGradingWorks')}</CardTitle>
              <CardDescription>{msg('exams.whatAnAssessmentGuarantees')}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5 text-caption text-text-muted">
            <p>{examGradingPolicy()}</p>
            <p>{examIntegrityPolicy()}</p>
          </CardContent>
          <CardFooter className="text-caption text-text-faint">
            <span className="num">
              {progress.attempts} {msg('exams.attemptsRecorded')}
            </span>
          </CardFooter>
        </Card>
      </Grid>

      <Tabs
        items={TABS.map((item) => ({ id: item.id, label: item.label, icon: item.icon }))}
        value={tab}
        onValueChange={setTab}
        aria-label={msg('exams.examinationSections')}
      >
        <TabPanel value="overview" className="space-y-4">
          <Card surface="featured">
            <CardHeader divider>
              <div>
                <CardTitle className="text-body">{msg('exams.currentAssessment')}</CardTitle>
                <CardDescription>
                  {mockCurrentAssessment.title} {msg('exams.attempt')}{' '}
                  <span className="num">{mockCurrentAssessment.attemptId}</span>
                </CardDescription>
              </div>
              <Badge tone="info">{EXAM_STATE_LABEL['in-progress']}</Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <ProgressIndicator
                value={mockCurrentAssessment.answered}
                max={mockCurrentAssessment.questionCount}
                label={msg('examsPage.questionsAnswered')}
                tone="info"
                hint={`Started ${formatRelative(mockCurrentAssessment.startedAt)}. The last attempt was abandoned part way through and recorded as void — a blank is never scored as zero.`}
              />
              <p className="text-caption text-text-faint">
                {mockCurrentAssessment.resumable
                  ? 'This attempt can be resumed.'
                  : 'Resuming is not available in this phase: no exam service is connected, so the attempt cannot be continued or submitted.'}
              </p>
            </CardContent>
            <CardFooter className="text-caption text-text-faint">
              <span>{msg('exams.nothingOnThisScreenGradesStores')}</span>
              <Button size="sm" variant="secondary" disabled>
                {msg('exams.resumeAttempt')}
              </Button>
            </CardFooter>
          </Card>

          <Section
            title={msg('exams.availableNow')}
            description={msg('examsPage.unlockedAssessmentsOrderedByWhenTheyBecameAvailable')}
          >
            <Grid columns={2}>
              {openExams.map((exam) => (
                <ExamCard
                  key={exam.id}
                  exam={exam}
                  categoryLabel={categoryLabel(exam.categoryId)}
                  {...(exam.state === 'in-progress'
                    ? {
                        progress: {
                          value: mockCurrentAssessment.answered,
                          max: mockCurrentAssessment.questionCount,
                        },
                      }
                    : {})}
                />
              ))}
            </Grid>
          </Section>

          <Section
            title={msg('exams.examCategories')}
            description={msg('examsPage.groupedByTheCurriculumAreaTheyTestThe')}
          >
            <Grid columns={3}>
              {mockExamCategories.map((category) => (
                <Card key={category.id}>
                  <CardHeader divider>
                    <div>
                      <CardTitle className="text-body">{category.label}</CardTitle>
                      <CardDescription>{category.description}</CardDescription>
                    </div>
                    <Badge tone="outline">
                      {category.examCount} {msg('exams.exams')}
                    </Badge>
                  </CardHeader>
                  <CardContent className="flex items-end justify-between gap-3">
                    <span className="num text-subheading text-text">
                      {category.averageScore === null
                        ? '—'
                        : formatPercent(category.averageScore, 1)}
                    </span>
                    <span className="text-caption text-text-faint">
                      {msg('exams.averageBestScore2')}
                    </span>
                  </CardContent>
                </Card>
              ))}
            </Grid>
          </Section>

          <ErrorState
            severity="info"
            title={msg('exams.previewAssessmentData')}
            description={examPreviewNotice()}
            code="PREVIEW_FIXTURE"
            action={
              <span className="text-caption">
                The exam runner, rubric grader and attempt store arrive with the API adapter; the
                shapes above are already typed against them.
              </span>
            }
          />
        </TabPanel>

        <TabPanel value="current" className="space-y-4">
          <Grid columns={2}>
            <Card surface="data">
              <CardHeader divider>
                <div>
                  <CardTitle className="text-body">{msg('exams.attemptContext')}</CardTitle>
                  <CardDescription>{msg('exams.whatTheRunnerWouldKnowAbout')}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <ProgressIndicator
                  value={mockCurrentAssessment.answered}
                  max={mockCurrentAssessment.questionCount}
                  label={msg('examsPage.questionsAnswered')}
                  tone="info"
                  threshold={80}
                />
                <dl className="space-y-1 text-caption">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-text-faint">{msg('exams.exam')}</dt>
                    <dd className="num text-text-muted">{mockCurrentAssessment.examId}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-text-faint">{msg('exams.questions')}</dt>
                    <dd className="num text-text-muted">{mockCurrentAssessment.questionCount}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-text-faint">{msg('exams.started')}</dt>
                    <dd className="num text-text-muted">
                      {formatTimestamp(mockCurrentAssessment.startedAt)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-text-faint">{msg('exams.timeLimit')}</dt>
                    <dd className="num text-text-muted">{msg('exams.enforcedServerSide')}</dd>
                  </div>
                </dl>
                <p className="text-caption text-text-faint">
                  {msg('exams.timingIsEnforcedByTheService')}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader divider>
                <div>
                  <CardTitle className="text-body">{msg('exams.integrityRules')}</CardTitle>
                  <CardDescription>{msg('exams.theRulesThisInterfaceFollows')}</CardDescription>
                </div>
                <Badge tone="primary" icon={<ShieldCheck size={12} aria-hidden />}>
                  {msg('exams.serverGraded')}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-1.5 text-caption text-text-muted">
                <p>{examIntegrityPolicy()}</p>
                <p>{examGradingPolicy()}</p>
                <p>{msg('exams.partialCreditIsExpressedPerRubric')}</p>
              </CardContent>
            </Card>
          </Grid>

          {mockQuestions.slice(0, 2).map((question, index) => (
            <QuestionPanel
              key={question.id}
              index={index + 1}
              total={mockCurrentAssessment.questionCount}
              prompt={question.prompt}
              kind={question.kind}
              choices={question.options}
              rubricRef={question.rubricRef}
              points={question.points}
              answerKeyWithheld={question.answerKeyWithheld}
            />
          ))}
        </TabPanel>

        <TabPanel value="history" className="space-y-4">
          <Grid columns={2}>
            <ScoreCard
              title={msg('exams.riskPerTradeBeforeRewardPer')}
              bestScore={91}
              passScore={80}
              attempts={2}
              evolution={evolutionFor('e-risk-01')}
              meanScore={meanFor('e-risk-01')}
              footnote={msg('examsPage.improvedAfterRework')}
            />
            <ScoreCard
              title={msg('exams.fixedFractionalPositionSizing')}
              bestScore={74}
              passScore={80}
              attempts={3}
              evolution={evolutionFor('e-risk-02')}
              meanScore={meanFor('e-risk-02')}
              footnote={msg('examsPage.closestAttempt74')}
            />
          </Grid>

          <Card surface="data">
            <CardHeader divider>
              <div>
                <CardTitle className="text-body">{msg('exams.attemptHistory')}</CardTitle>
                <CardDescription>{msg('exams.everyAttemptIsRetainedIncludingThe')}</CardDescription>
              </div>
              <Badge tone="neutral">
                {recentAttempts.length} {msg('dashboard.attempts')}
              </Badge>
            </CardHeader>
            <CardContent className="divide-y divide-border">
              {recentAttempts.map((attempt) => (
                <div
                  key={attempt.id}
                  className="flex flex-wrap items-start gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <span
                    aria-hidden
                    className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-[var(--radius-control)] border border-border bg-surface-sunken text-text-faint"
                  >
                    <Award size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-body text-text">
                        {mockExamDefinitions.find((exam) => exam.id === attempt.examId)?.title ??
                          attempt.examId}
                      </span>
                      <Badge tone={OUTCOME_TONE[attempt.outcome]}>{attempt.outcome}</Badge>
                      <span className="num text-caption text-text-faint">{attempt.id}</span>
                    </div>
                    <p className="mt-0.5 text-caption text-text-muted">{attempt.note}</p>
                  </div>
                  <div className="text-end">
                    <span
                      className={cn(
                        'num text-body',
                        attempt.outcome === 'failed' ? 'text-danger' : 'text-text',
                      )}
                    >
                      {attempt.outcome === 'void' ? '—' : formatPercent(attempt.score, 0)}
                    </span>
                    <p className="text-caption text-text-faint">
                      {attempt.durationMinutes}
                      {msg('exams.m2')} {formatTimestamp(attempt.submittedAt)}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <ErrorState
            severity="info"
            title={msg('exams.notAStoredHistory')}
            description="These attempts are illustrative. The `exam_attempts` table and its repository exist in the backend, but nothing writes to them from this interface yet."
            code="PREVIEW_FIXTURE"
          />
        </TabPanel>

        <TabPanel value="review" className="space-y-4">
          <Grid columns={2}>
            <MistakeAnalysisCard patterns={mockMistakes} incorrectAnswers={incorrect} />
            <Card surface="data">
              <CardHeader divider>
                <div>
                  <CardTitle className="text-body">{msg('exams.postSubmissionReview')}</CardTitle>
                  <CardDescription>{msg('exams.howAGradedAnswerIsDisplayed')}</CardDescription>
                </div>
                <Badge tone="info">{msg('exams.example')}</Badge>
              </CardHeader>
              <CardContent className="space-y-2">
                <AnswerOption
                  id="a"
                  name="review-example"
                  label={msg('exams.theNumberOfUnitsFromStopDistanceAnd')}
                  state="read-only"
                  review={{
                    verdict: 'correct',
                    explanation: msg('examsPage.matchesTheRubricTheBudgetAndTheStop'),
                  }}
                />
                <AnswerOption
                  id="b"
                  name="review-example"
                  label={msg('exams.theDirectionOfTheTrade')}
                  state="read-only"
                  review={{
                    verdict: 'incorrect',
                    explanation: msg('examsPage.directionIsAnInputToTheSetupNot'),
                  }}
                />
                <AnswerOption
                  id="c"
                  name="review-example"
                  label={msg('exams.theRewardTarget')}
                  state="read-only"
                  review={{
                    verdict: 'partial',
                    explanation: msg('examsPage.partiallyCorrectRewardIsComparedAgainstRiskBut'),
                  }}
                />
                <p className="text-caption text-text-faint">
                  {msg('exams.verdictsArriveWithTheServerS')}
                </p>
              </CardContent>
            </Card>
          </Grid>

          <Section
            title={msg('exams.whatTheReviewIsFor')}
            description={msg('examsPage.groupingByCauseTurnsAScoreIntoA')}
          >
            <Grid columns={3}>
              <Card>
                <CardHeader divider>
                  <CardTitle className="text-body">{msg('exams.byPattern')}</CardTitle>
                </CardHeader>
                <CardContent className="text-caption text-text-muted">
                  {msg('exams.mistakesAreGroupedByTheRule')}
                </CardContent>
              </Card>
              <Card>
                <CardHeader divider>
                  <CardTitle className="text-body">{msg('exams.byLesson')}</CardTitle>
                </CardHeader>
                <CardContent className="text-caption text-text-muted">
                  {msg('exams.everyPatternPointsBackToThe')}
                </CardContent>
              </Card>
              <Card>
                <CardHeader divider>
                  <CardTitle className="text-body">{msg('exams.byEvidence')}</CardTitle>
                </CardHeader>
                <CardContent className="text-caption text-text-muted">
                  {msg('exams.sharesAreComputedAgainstTheNumber')}
                </CardContent>
              </Card>
            </Grid>
          </Section>
        </TabPanel>

        <TabPanel value="states" className="space-y-4">
          <Section
            title={msg('exams.assessmentStates')}
            description={msg('examsPage.everyStateTheModuleMustRenderWithThe')}
          >
            <Grid columns={2}>
              {mockExamDefinitions.map((exam) => (
                <ExamCard
                  key={exam.id}
                  exam={exam}
                  categoryLabel={categoryLabel(exam.categoryId)}
                />
              ))}
            </Grid>
          </Section>

          <Grid columns={3}>
            <Card>
              <CardHeader divider>
                <CardTitle className="text-body">{msg('exams.loading')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <SkeletonCard rows={3} />
                <p className="text-caption text-text-faint">
                  {msg('exams.skeletonsWhileAnAttemptIsFetched')}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader divider>
                <CardTitle className="text-body">{msg('exams.empty')}</CardTitle>
              </CardHeader>
              <CardContent>
                <EmptyState
                  icon={<GraduationCap size={22} aria-hidden />}
                  title={msg('exams.noAttemptsInThisCategory')}
                  description={msg('examsPage.anUntouchedCategoryIsStatedPlainlyRatherThan')}
                  hint={msg('examsPage.failuresAndBlanksAreNeverRenderedAsZeroes')}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader divider>
                <CardTitle className="text-body">{msg('exams.error')}</CardTitle>
              </CardHeader>
              <CardContent>
                <ErrorState
                  severity="warning"
                  title={msg('exams.gradingJobHasNotRun')}
                  description={msg('examsPage.anAttemptSubmittedWithoutAGradingJobStays')}
                  code="PROVIDER_UNAVAILABLE"
                />
              </CardContent>
            </Card>
          </Grid>

          <Card>
            <CardHeader divider>
              <div>
                <CardTitle className="text-body">{msg('exams.lockedExaminations')}</CardTitle>
                <CardDescription>
                  {msg('exams.lockedByPrerequisiteWithTheDependency')}
                </CardDescription>
              </div>
              <Badge tone="outline" icon={<Target size={12} aria-hidden />}>
                {lockedExams.length} {msg('exams.locked')}
              </Badge>
            </CardHeader>
            {/*
              A marked list rather than a paragraph per exam: the mark is what makes the gate
              visible at a glance, and the `neutral` tone is the one the badge family reserves for
              a row that is numbered or waiting rather than confirmed.
            */}
            <CardContent>
              <AgentCardList>
                {lockedExams.map((exam) => (
                  <AgentCardItem
                    key={exam.id}
                    badge={
                      <AgentBadge tone="neutral">
                        <Hourglass size={10} strokeWidth={2.5} />
                      </AgentBadge>
                    }
                  >
                    <span className="text-text">{exam.title}</span>{' '}
                    <span className="num text-text-faint">
                      {msg('exams.requires')} {exam.prerequisites.join(', ')}
                    </span>
                  </AgentCardItem>
                ))}
              </AgentCardList>
            </CardContent>
          </Card>
        </TabPanel>
      </Tabs>
    </Workspace>
  );
}
