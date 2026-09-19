import { useState } from 'react';
import { BookOpen, CheckCircle2, GraduationCap, ListChecks, Lock, Target } from 'lucide-react';
import { Badge } from '../components/Badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Section,
} from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { TabPanel, Tabs } from '../components/Tabs';
import { Tooltip } from '../components/Tooltip';
import { Grid, Workspace } from '../app/Workspace';
import {
  EPISTEMIC_LABEL,
  mockCurriculum,
  mockExams,
  mockLessons,
  mockProgress,
} from '../mock/data';
import { formatPercent } from '../lib/format';
import { cn } from '../lib/cn';

const STATUS_TONE = {
  complete: 'primary',
  'in-progress': 'info',
  available: 'neutral',
  locked: 'outline',
} as const;

const LESSON_TONE = {
  complete: 'primary',
  'in-progress': 'info',
  available: 'neutral',
  locked: 'outline',
} as const;

const TABS = [
  { id: 'modules', label: 'Modules', icon: <BookOpen size={14} aria-hidden /> },
  { id: 'lessons', label: 'Lessons', icon: <ListChecks size={14} aria-hidden /> },
  { id: 'exams', label: 'Examinations', icon: <GraduationCap size={14} aria-hidden /> },
] as const;

export function AcademyPage() {
  const [tab, setTab] = useState<string>('modules');

  return (
    <Workspace
      title="Academy"
      description="A six-month curriculum from market mechanics to independent operation. Lessons unlock by prerequisite; examinations are graded deterministically."
      actions={
        <Badge tone="info" icon={<Target size={12} aria-hidden />}>
          {mockProgress.level}
        </Badge>
      }
    >
      <Grid columns={3}>
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="text-body">Curriculum progress</CardTitle>
              <CardDescription>
                {mockProgress.lessonsComplete} of {mockProgress.lessonsTotal} lessons complete
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={mockProgress.lessonsTotal}
              aria-valuenow={mockProgress.lessonsComplete}
              aria-label="Lessons complete"
              className="h-1.5 w-full overflow-hidden rounded-[var(--radius-pill)] bg-surface-sunken"
            >
              <div
                className="h-full rounded-[var(--radius-pill)] bg-primary"
                style={{
                  width: `${(mockProgress.lessonsComplete / mockProgress.lessonsTotal) * 100}%`,
                }}
              />
            </div>
            <p className="mt-2 text-caption text-text-faint">
              Progress is recorded per lesson, never inferred from time spent.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="text-body">Exam average</CardTitle>
              <CardDescription>Best score per examination</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <span className="num text-[1.5rem] leading-none font-semibold text-text">
              {mockProgress.examAverage === null ? '—' : formatPercent(mockProgress.examAverage)}
            </span>
            <p className="mt-2 text-caption text-text-faint">
              Grading is rubric-based and deterministic; the model does not decide pass/fail.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="text-body">How grading works</CardTitle>
              <CardDescription>What the Academy guarantees</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5 text-caption text-text-muted">
            <p>Answers are scored against a rubric, not by the model&apos;s opinion.</p>
            <p>
              Explanations carry {EPISTEMIC_LABEL.analysis} and {EPISTEMIC_LABEL.uncertainty}{' '}
              labels.
            </p>
            <p>Rule changes proposed during study require human approval before activation.</p>
          </CardContent>
        </Card>
      </Grid>

      <Tabs
        items={TABS.map((item) => ({ id: item.id, label: item.label, icon: item.icon }))}
        value={tab}
        onValueChange={setTab}
        aria-label="Academy sections"
      >
        <TabPanel value="modules" className="space-y-4">
          <Section
            title="Six-month curriculum"
            description="Each module lists its focus areas. Locked modules unlock when prerequisites are complete."
          >
            <ol className="space-y-3">
              {mockCurriculum.map((module) => (
                <li key={module.id}>
                  <Card interactive className={cn(module.status === 'locked' && 'opacity-70')}>
                    <CardHeader>
                      <div className="flex items-start gap-3">
                        <span
                          aria-hidden
                          className="num grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-control)] border border-border bg-surface-sunken text-caption text-text-muted"
                        >
                          {module.month}
                        </span>
                        <div>
                          <CardTitle className="text-body">{module.title}</CardTitle>
                          <CardDescription>{module.summary}</CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={STATUS_TONE[module.status]} dot={module.status !== 'locked'}>
                          {module.status}
                        </Badge>
                        {module.status === 'locked' ? (
                          <Tooltip content="Unlocks when prerequisite lessons are complete.">
                            <span className="text-text-faint" aria-label="Locked">
                              <Lock size={14} aria-hidden />
                            </span>
                          </Tooltip>
                        ) : null}
                      </div>
                    </CardHeader>
                    <CardContent className="flex flex-wrap items-center gap-2">
                      {module.focus.map((focus) => (
                        <Badge key={focus} tone="outline">
                          {focus}
                        </Badge>
                      ))}
                      <span className="num ms-auto text-caption text-text-faint">
                        {module.lessons} lessons
                      </span>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ol>
          </Section>
        </TabPanel>

        <TabPanel value="lessons" className="space-y-3">
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="text-body">Module 2 — Risk First</CardTitle>
                <CardDescription>Lesson states and prerequisite gating</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="divide-y divide-border">
              {mockLessons.map((lesson) => (
                <div key={lesson.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <span
                    aria-hidden
                    className={cn(
                      'grid h-7 w-7 shrink-0 place-items-center rounded-[var(--radius-control)] border border-border',
                      lesson.status === 'complete' ? 'text-primary' : 'text-text-faint',
                    )}
                  >
                    {lesson.status === 'complete' ? (
                      <CheckCircle2 size={15} />
                    ) : (
                      <span className="num text-caption">{lesson.difficulty}</span>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body text-text">{lesson.title}</p>
                    <p className="text-caption text-text-faint">
                      {lesson.prerequisites.length === 0
                        ? 'No prerequisites'
                        : `Requires ${lesson.prerequisites.join(', ')}`}
                    </p>
                  </div>
                  <Badge tone={LESSON_TONE[lesson.status]}>{lesson.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabPanel>

        <TabPanel value="exams" className="space-y-3">
          <Grid columns={3}>
            {mockExams.map((exam) => (
              <Card key={exam.id}>
                <CardHeader>
                  <div>
                    <CardTitle className="num text-body">{exam.id}</CardTitle>
                    <CardDescription>{exam.questionCount} questions</CardDescription>
                  </div>
                  <Badge tone={exam.bestScore === null ? 'outline' : 'primary'}>
                    {exam.bestScore === null ? 'not attempted' : formatPercent(exam.bestScore)}
                  </Badge>
                </CardHeader>
                <CardContent className="text-caption text-text-muted">
                  {exam.bestScore === null
                    ? 'No attempt recorded. Attempts are kept for longitudinal skill tracking.'
                    : 'Best score kept; every attempt is retained with per-question results.'}
                </CardContent>
              </Card>
            ))}
          </Grid>
          <Card>
            <CardHeader>
              <CardTitle className="text-body">Examination integrity</CardTitle>
            </CardHeader>
            <CardContent>
              <EmptyState
                icon={<GraduationCap size={22} aria-hidden />}
                title="Exam runner is not part of this phase"
                description="The interface for taking an exam will be added with the persistence slice, when lessons and attempts can actually be stored and graded."
                hint="Until then this tab shows the planned shape, not a working exam."
              />
            </CardContent>
          </Card>
        </TabPanel>
      </Tabs>
    </Workspace>
  );
}
