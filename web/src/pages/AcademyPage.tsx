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
import { InterfaceStatesPanel } from '../components/InterfaceStates';
import { Reveal } from '../components/Reveal';
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
import { msg } from '../i18n/index.js';

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
  {
    id: 'modules',
    get label(): string {
      return msg('capabilities.modules');
    },
    icon: <BookOpen size={14} aria-hidden />,
  },
  {
    id: 'lessons',
    get label(): string {
      return msg('journal.lessons');
    },
    icon: <ListChecks size={14} aria-hidden />,
  },
  {
    id: 'exams',
    get label(): string {
      return msg('exams.examinations');
    },
    icon: <GraduationCap size={14} aria-hidden />,
  },
] as const;

export function AcademyPage() {
  const [tab, setTab] = useState<string>('modules');

  return (
    <Workspace
      title={msg('academy.academy')}
      description={msg('academyPage.aSixMonthCurriculumFromMarketMechanicsToIndependent')}
      actions={
        <Badge tone="info" icon={<Target size={12} aria-hidden />}>
          {mockProgress.level}
        </Badge>
      }
    >
      <Grid columns={3}>
        <Card surface="metric">
          <CardHeader divider>
            <div>
              <CardTitle className="text-body">{msg('academy.curriculumProgress')}</CardTitle>
              <CardDescription>
                {mockProgress.lessonsComplete} {msg('exams.of')} {mockProgress.lessonsTotal}{' '}
                {msg('academy.lessonsComplete')}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={mockProgress.lessonsTotal}
              aria-valuenow={mockProgress.lessonsComplete}
              aria-label={msg('academy.lessonsComplete2')}
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
              {msg('academy.progressIsRecordedPerLessonNever')}
            </p>
          </CardContent>
        </Card>
        <Card surface="metric">
          <CardHeader divider>
            <div>
              <CardTitle className="text-body">{msg('academy.examAverage')}</CardTitle>
              <CardDescription>{msg('academy.bestScorePerExamination')}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <span className="num text-metric text-text">
              {mockProgress.examAverage === null ? '—' : formatPercent(mockProgress.examAverage)}
            </span>
            <p className="mt-2 text-caption text-text-faint">
              {msg('academy.gradingIsRubricBasedAndDeterministic')}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader divider>
            <div>
              <CardTitle className="text-body">{msg('academy.howGradingWorks')}</CardTitle>
              <CardDescription>{msg('academy.whatTheAcademyGuarantees')}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5 text-caption text-text-muted">
            <p>{msg('academy.answersAreScoredAgainstARubric')}</p>
            <p>
              {msg('academy.explanationsCarry')} {EPISTEMIC_LABEL.analysis} {msg('academy.and')}{' '}
              {EPISTEMIC_LABEL.uncertainty} {msg('academy.labels')}
            </p>
            <p>{msg('academy.ruleChangesProposedDuringStudyRequire')}</p>
          </CardContent>
        </Card>
      </Grid>

      <Tabs
        items={TABS.map((item) => ({ id: item.id, label: item.label, icon: item.icon }))}
        value={tab}
        onValueChange={setTab}
        aria-label={msg('academy.academySections')}
      >
        <TabPanel value="modules" className="space-y-4">
          <Section
            title={msg('academy.sixMonthCurriculum')}
            description={msg('academyPage.eachModuleListsItsFocusAreasLockedModules')}
          >
            <ol className="space-y-3">
              {mockCurriculum.map((module, index) => (
                <li key={module.id}>
                  {/* Modules reveal in order, so the six-month shape reads as a
                      sequence rather than appearing all at once. */}
                  <Reveal index={index}>
                    <Card
                      surface={
                        module.status === 'in-progress'
                          ? 'featured'
                          : module.status === 'locked'
                            ? 'utility'
                            : undefined
                      }
                      interactive
                      className={cn(module.status === 'locked' && 'opacity-70')}
                    >
                      <CardHeader divider>
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
                            <Tooltip
                              content={msg('academyPage.unlocksWhenPrerequisiteLessonsAreComplete')}
                            >
                              <span className="text-text-faint" aria-label={msg('academy.locked')}>
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
                          {module.lessons} {msg('academy.lessons')}
                        </span>
                      </CardContent>
                    </Card>
                  </Reveal>
                </li>
              ))}
            </ol>
          </Section>

          <InterfaceStatesPanel
            states={['loading', 'error']}
            title={msg('academy.statesThisCurriculumSurfaceOwesYou')}
            description={msg('academyPage.theModuleListIsStaticInThisPreview')}
            loadingTitle={msg('academyPage.readingTheCurriculum')}
            loadingDescription={msg('academyPage.moduleSkeletonsHoldTheLayoutWhileTheCurriculum')}
            errorTitle={msg('academyPage.curriculumCouldNotBeRead')}
            errorDescription={msg('academyPage.aFailedReadIsReportedWithItsTyped')}
            errorCode="PROVIDER_UNAVAILABLE"
            hint={msg('academyPage.progressIsRecordedPerLessonAgainstTheReal')}
          />
        </TabPanel>

        <TabPanel value="lessons" className="space-y-3">
          <Card surface="data">
            <CardHeader divider>
              <div>
                <CardTitle className="text-body">{msg('academy.module2RiskFirst')}</CardTitle>
                <CardDescription>
                  {msg('academy.lessonStatesAndPrerequisiteGating')}
                </CardDescription>
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
              <Card surface="data" key={exam.id}>
                <CardHeader divider>
                  <div>
                    <CardTitle className="num text-body">{exam.id}</CardTitle>
                    <CardDescription>
                      {exam.questionCount} {msg('academy.questions')}
                    </CardDescription>
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
            <CardHeader divider>
              <CardTitle className="text-body">{msg('academy.examinationIntegrity')}</CardTitle>
            </CardHeader>
            <CardContent>
              <EmptyState
                icon={<GraduationCap size={22} aria-hidden />}
                title={msg('academy.examRunnerIsNotPartOf')}
                description={msg('academyPage.theInterfaceForTakingAnExamWillBe')}
                hint={msg('academyPage.untilThenThisTabShowsThePlannedShape')}
              />
            </CardContent>
          </Card>
        </TabPanel>
      </Tabs>
    </Workspace>
  );
}
