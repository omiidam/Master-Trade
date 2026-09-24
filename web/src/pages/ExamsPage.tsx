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
  EXAM_GRADING_POLICY,
  EXAM_INTEGRITY_POLICY,
  EXAM_PREVIEW_NOTICE,
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

const TABS = [
  { id: 'overview', label: 'Overview', icon: <Layers size={14} aria-hidden /> },
  { id: 'current', label: 'Current assessment', icon: <Hourglass size={14} aria-hidden /> },
  { id: 'history', label: 'History', icon: <History size={14} aria-hidden /> },
  { id: 'review', label: 'Mistake review', icon: <AlertTriangle size={14} aria-hidden /> },
  { id: 'states', label: 'State examples', icon: <ClipboardList size={14} aria-hidden /> },
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
      title="Examinations"
      description="Assessment, scoring and mistake review across the six-month curriculum. Grading is rubric-based and deterministic; the model explains results but never decides pass or fail."
      actions={
        <>
          <Badge tone="outline" icon={<ShieldCheck size={12} aria-hidden />}>
            no runner connected
          </Badge>
          <Tooltip content={EXAM_PREVIEW_NOTICE}>
            <Badge tone="warning">preview data</Badge>
          </Tooltip>
        </>
      }
    >
      <Grid columns={4}>
        <Card surface="metric">
          <CardHeader divider>
            <div>
              <CardTitle className="text-body">Assessment progress</CardTitle>
              <CardDescription>
                {progress.passed} passed · {progress.attempted} attempted · {progress.locked} locked
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <ProgressIndicator
              value={progress.passed}
              max={mockExamDefinitions.length}
              label="Examinations passed"
              hint="Locked examinations are excluded from what is achievable today."
            />
          </CardContent>
        </Card>
        <Card surface="metric">
          <CardHeader divider>
            <div>
              <CardTitle className="text-body">Average best score</CardTitle>
              <CardDescription>Mean of the best score per examination</CardDescription>
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
              A mean across different exams is a study signal, not a grade.
            </p>
          </CardContent>
        </Card>
        <Card surface="metric">
          <CardHeader divider>
            <div>
              <CardTitle className="text-body">Attempts to pass</CardTitle>
              <CardDescription>Mean across passed examinations</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <span className="num text-metric text-text">{progress.meanAttemptsToPass ?? '—'}</span>
            <p className="mt-2 text-caption text-text-faint">
              Retries are kept. A failed attempt is evidence about which lesson to rework, not a
              penalty.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader divider>
            <div>
              <CardTitle className="text-body">How grading works</CardTitle>
              <CardDescription>What an assessment guarantees</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5 text-caption text-text-muted">
            <p>{EXAM_GRADING_POLICY}</p>
            <p>{EXAM_INTEGRITY_POLICY}</p>
          </CardContent>
          <CardFooter className="text-caption text-text-faint">
            <span className="num">{progress.attempts} attempts recorded</span>
          </CardFooter>
        </Card>
      </Grid>

      <Tabs
        items={TABS.map((item) => ({ id: item.id, label: item.label, icon: item.icon }))}
        value={tab}
        onValueChange={setTab}
        aria-label="Examination sections"
      >
        <TabPanel value="overview" className="space-y-4">
          <Card surface="featured">
            <CardHeader divider>
              <div>
                <CardTitle className="text-body">Current assessment</CardTitle>
                <CardDescription>
                  {mockCurrentAssessment.title} · attempt{' '}
                  <span className="num">{mockCurrentAssessment.attemptId}</span>
                </CardDescription>
              </div>
              <Badge tone="info">{EXAM_STATE_LABEL['in-progress']}</Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <ProgressIndicator
                value={mockCurrentAssessment.answered}
                max={mockCurrentAssessment.questionCount}
                label="Questions answered"
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
              <span>Nothing on this screen grades, stores or submits an answer.</span>
              <Button size="sm" variant="secondary" disabled>
                Resume attempt
              </Button>
            </CardFooter>
          </Card>

          <Section
            title="Available now"
            description="Unlocked assessments, ordered by when they became available."
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
            title="Exam categories"
            description="Grouped by the curriculum area they test; the average is illustrative."
          >
            <Grid columns={3}>
              {mockExamCategories.map((category) => (
                <Card key={category.id}>
                  <CardHeader divider>
                    <div>
                      <CardTitle className="text-body">{category.label}</CardTitle>
                      <CardDescription>{category.description}</CardDescription>
                    </div>
                    <Badge tone="outline">{category.examCount} exams</Badge>
                  </CardHeader>
                  <CardContent className="flex items-end justify-between gap-3">
                    <span className="num text-subheading text-text">
                      {category.averageScore === null
                        ? '—'
                        : formatPercent(category.averageScore, 1)}
                    </span>
                    <span className="text-caption text-text-faint">average best score</span>
                  </CardContent>
                </Card>
              ))}
            </Grid>
          </Section>

          <ErrorState
            severity="info"
            title="Preview assessment data"
            description={EXAM_PREVIEW_NOTICE}
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
                  <CardTitle className="text-body">Attempt context</CardTitle>
                  <CardDescription>What the runner would know about this attempt</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <ProgressIndicator
                  value={mockCurrentAssessment.answered}
                  max={mockCurrentAssessment.questionCount}
                  label="Questions answered"
                  tone="info"
                  threshold={80}
                />
                <dl className="space-y-1 text-caption">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-text-faint">Exam</dt>
                    <dd className="num text-text-muted">{mockCurrentAssessment.examId}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-text-faint">Questions</dt>
                    <dd className="num text-text-muted">{mockCurrentAssessment.questionCount}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-text-faint">Started</dt>
                    <dd className="num text-text-muted">
                      {formatTimestamp(mockCurrentAssessment.startedAt)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-text-faint">Time limit</dt>
                    <dd className="num text-text-muted">enforced server-side</dd>
                  </div>
                </dl>
                <p className="text-caption text-text-faint">
                  Timing is enforced by the service, not the client, so closing the window cannot
                  extend an attempt.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader divider>
                <div>
                  <CardTitle className="text-body">Integrity rules</CardTitle>
                  <CardDescription>The rules this interface follows</CardDescription>
                </div>
                <Badge tone="primary" icon={<ShieldCheck size={12} aria-hidden />}>
                  server-graded
                </Badge>
              </CardHeader>
              <CardContent className="space-y-1.5 text-caption text-text-muted">
                <p>{EXAM_INTEGRITY_POLICY}</p>
                <p>{EXAM_GRADING_POLICY}</p>
                <p>
                  Partial credit is expressed per rubric criterion, so a written answer can be
                  marked partially correct instead of all-or-nothing.
                </p>
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
              title="Risk per trade before reward per trade"
              bestScore={91}
              passScore={80}
              attempts={2}
              evolution={evolutionFor('e-risk-01')}
              meanScore={meanFor('e-risk-01')}
              footnote="improved after rework"
            />
            <ScoreCard
              title="Fixed-fractional position sizing"
              bestScore={74}
              passScore={80}
              attempts={3}
              evolution={evolutionFor('e-risk-02')}
              meanScore={meanFor('e-risk-02')}
              footnote="closest attempt: 74%"
            />
          </Grid>

          <Card surface="data">
            <CardHeader divider>
              <div>
                <CardTitle className="text-body">Attempt history</CardTitle>
                <CardDescription>
                  Every attempt is retained, including the ones that were void
                </CardDescription>
              </div>
              <Badge tone="neutral">{recentAttempts.length} attempts</Badge>
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
                      {attempt.durationMinutes}m · {formatTimestamp(attempt.submittedAt)}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <ErrorState
            severity="info"
            title="Not a stored history"
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
                  <CardTitle className="text-body">Post-submission review</CardTitle>
                  <CardDescription>
                    How a graded answer is displayed, after the server returns verdicts
                  </CardDescription>
                </div>
                <Badge tone="info">example</Badge>
              </CardHeader>
              <CardContent className="space-y-2">
                <AnswerOption
                  id="a"
                  name="review-example"
                  label="The number of units, from stop distance and budget"
                  state="read-only"
                  review={{
                    verdict: 'correct',
                    explanation:
                      'Matches the rubric: the budget and the stop distance set the size.',
                  }}
                />
                <AnswerOption
                  id="b"
                  name="review-example"
                  label="The direction of the trade"
                  state="read-only"
                  review={{
                    verdict: 'incorrect',
                    explanation:
                      'Direction is an input to the setup, not an output of the risk budget.',
                  }}
                />
                <AnswerOption
                  id="c"
                  name="review-example"
                  label="The reward target"
                  state="read-only"
                  review={{
                    verdict: 'partial',
                    explanation:
                      'Partially correct: reward is compared against risk, but it is not what the budget determines first.',
                  }}
                />
                <p className="text-caption text-text-faint">
                  Verdicts arrive with the server's explanation and are attached to the attempt, so
                  the same review is reproducible later.
                </p>
              </CardContent>
            </Card>
          </Grid>

          <Section
            title="What the review is for"
            description="Grouping by cause turns a score into a lesson."
          >
            <Grid columns={3}>
              <Card>
                <CardHeader divider>
                  <CardTitle className="text-body">By pattern</CardTitle>
                </CardHeader>
                <CardContent className="text-caption text-text-muted">
                  Mistakes are grouped by the rule that was broken, not by the question they
                  appeared in.
                </CardContent>
              </Card>
              <Card>
                <CardHeader divider>
                  <CardTitle className="text-body">By lesson</CardTitle>
                </CardHeader>
                <CardContent className="text-caption text-text-muted">
                  Every pattern points back to the lesson that teaches it, so review has a
                  destination.
                </CardContent>
              </Card>
              <Card>
                <CardHeader divider>
                  <CardTitle className="text-body">By evidence</CardTitle>
                </CardHeader>
                <CardContent className="text-caption text-text-muted">
                  Shares are computed against the number of incorrect answers, so the denominator is
                  never hidden.
                </CardContent>
              </Card>
            </Grid>
          </Section>
        </TabPanel>

        <TabPanel value="states" className="space-y-4">
          <Section
            title="Assessment states"
            description="Every state the module must render, with the action each one offers."
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
                <CardTitle className="text-body">Loading</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <SkeletonCard rows={3} />
                <p className="text-caption text-text-faint">
                  Skeletons while an attempt is fetched; the pulse respects prefers-reduced-motion.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader divider>
                <CardTitle className="text-body">Empty</CardTitle>
              </CardHeader>
              <CardContent>
                <EmptyState
                  icon={<GraduationCap size={22} aria-hidden />}
                  title="No attempts in this category"
                  description="An untouched category is stated plainly rather than hidden behind a zero."
                  hint="Failures and blanks are never rendered as zeroes."
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader divider>
                <CardTitle className="text-body">Error</CardTitle>
              </CardHeader>
              <CardContent>
                <ErrorState
                  severity="warning"
                  title="Grading job has not run"
                  description="An attempt submitted without a grading job stays pending and is labelled as pending, not scored."
                  code="PROVIDER_UNAVAILABLE"
                />
              </CardContent>
            </Card>
          </Grid>

          <Card>
            <CardHeader divider>
              <div>
                <CardTitle className="text-body">Locked examinations</CardTitle>
                <CardDescription>Locked by prerequisite, with the dependency named</CardDescription>
              </div>
              <Badge tone="outline" icon={<Target size={12} aria-hidden />}>
                {lockedExams.length} locked
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
                      requires {exam.prerequisites.join(', ')}
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
