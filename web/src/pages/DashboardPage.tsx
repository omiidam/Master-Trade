import { useEffect, type ReactNode } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Section } from '../components/Card';
import { ErrorState } from '../components/ErrorState';
import { Reveal } from '../components/Reveal';
import { SkeletonCard } from '../components/Skeleton';
import { Tooltip } from '../components/Tooltip';
import { Grid, Workspace } from '../app/Workspace';
import {
  AgentLevelSection,
  CourseLessonSection,
  ExamScoreSection,
  KnowledgeMasterySection,
  MarketSummarySection,
  RecentErrorsSection,
  StreakSection,
  WeakAreasSection,
} from '../components/dashboard';
import { formatTimestamp } from '../lib/format';
import { useDashboardStore } from '../store/dashboard';
import { useUiStore } from '../store/ui';
import { msg } from '../i18n/index.js';
import type { DashboardMetricsView } from '@shared/frontend/viewModels';

/**
 * The training dashboard — the overview composition (Phase 9.3.1).
 *
 * This page owns four things and delegates the rest. It **reads the state** the dashboard store
 * reports, it **draws the four states** that state can be in, it **lays the page out** — the
 * grids, because the page-level frame is the page's decision and the shell's width is not — and
 * it holds **the context row**. The eight surfaces themselves live in `components/dashboard/`,
 * where each section knows its own provenance line, its own empty state and the figure it is
 * built to show; the page never touches a metric, and the sections never know which fetch
 * produced them. Nothing here computes a number: every figure, level, mean and streak is the
 * server's derivation, and an absent one arrives as `null` or an empty array.
 *
 * The composition answers the order a reader asks in four readings, and the design system's own
 * `Section` draws each band's `<h2>` and its `aria-label`:
 *
 *   1. **Overview** — three metric plates: identity (level), habit (streak), evaluation (score).
 *      The same plate three times on purpose — a KPI strip is meant to be compared at a glance,
 *      and it is the figures inside that differ.
 *   2. **Learning progress** — the mastery roster beside the one featured card, which holds the
 *      course and the lesson it is being learned in.
 *   3. **Gaps and mistakes** — what to study (a ranked list) beside what keeps recurring (a short
 *      timeline with counts and dates).
 *   4. **Market analysis** — the one band about the instrument rather than the learner, last
 *      because it is context for the work rather than a record of it.
 *
 * The panels use different card forms — `metric`, `featured`, `data`, and the default
 * informational panel — because they are different kinds of thing; a page that drew all eight
 * identically would make the reader re-read each one to find out what it was.
 *
 * `read-only` and `refresh` describe the surface rather than a branch of it, so the context row
 * renders above every state, including the failing ones, where "reload" is what a reader most
 * needs. And `loading` draws the finished layout's shape, so a slow read moves nothing when it
 * lands.
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
    // The shape the data will fill, band for band — not a spinner above a collapsing page.
    body = (
      <>
        <Grid columns={3}>
          {[0, 1, 2].map((index) => (
            <SkeletonCard key={`metrics-${index}`} rows={4} />
          ))}
        </Grid>
        <Grid columns={2}>
          {[0, 1].map((index) => (
            <SkeletonCard key={`progress-${index}`} rows={5} />
          ))}
        </Grid>
        <Grid columns={2}>
          {[0, 1].map((index) => (
            <SkeletonCard key={`gaps-${index}`} rows={4} />
          ))}
        </Grid>
        <SkeletonCard rows={3} />
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
    body = (
      <DashboardOverview
        metrics={dashboard.metrics}
        onOpenAcademy={() => setPage('academy')}
        onOpenExams={() => setPage('exams')}
      />
    );
  }

  return (
    <Workspace actions={actions}>
      <div className="flex flex-col gap-5">{body}</div>
    </Workspace>
  );
}

/**
 * The ready layout: four bands of the eight sections.
 *
 * Kept as its own component so the state branches above stay readable, and so the ready branch
 * owns exactly the composition — which sections, in which band, in which grid.
 */
function DashboardOverview({
  metrics,
  onOpenAcademy,
  onOpenExams,
}: {
  metrics: DashboardMetricsView;
  onOpenAcademy: () => void;
  onOpenExams: () => void;
}) {
  // The evidence line on the level plate: every attempt behind every assessed domain.
  const totalAttempts = metrics.knowledgeMastery.reduce(
    (sum, domain) => sum + domain.attemptCount,
    0,
  );

  return (
    <>
      <Section title={msg('dashboardPage.overview')}>
        <Reveal index={0}>
          <Grid columns={3}>
            <AgentLevelSection
              level={metrics.agentLevel}
              attempts={totalAttempts}
              inCourse={metrics.course.course !== null}
              onOpenAcademy={onOpenAcademy}
            />
            <StreakSection days={metrics.learningStreakDays} />
            <ExamScoreSection exam={metrics.examScore} onOpenExams={onOpenExams} />
          </Grid>
        </Reveal>
      </Section>

      <Section
        title={msg('dashboard.learningProgress')}
        description={msg('dashboard.learningProgressNote')}
      >
        <Reveal index={1}>
          <Grid columns={2}>
            <KnowledgeMasterySection domains={metrics.knowledgeMastery} />
            <CourseLessonSection course={metrics.course.course} lesson={metrics.course.lesson} />
          </Grid>
        </Reveal>
      </Section>

      <Section title={msg('dashboard.gaps')} description={msg('dashboard.gapsNote')}>
        <Reveal index={2}>
          <Grid columns={2}>
            <WeakAreasSection domains={metrics.weakAreas} />
            <RecentErrorsSection errors={metrics.recentErrors} />
          </Grid>
        </Reveal>
      </Section>

      <Section title={msg('dashboard.marketAnalysis')}>
        <Reveal index={3}>
          <MarketSummarySection market={metrics.marketAnalysis} asOf={metrics.asOf} />
        </Reveal>
      </Section>

      <p className="text-caption text-text-faint">
        {msg('dashboard.serverDerived')} ·{' '}
        <span className="num">{formatTimestamp(metrics.asOf)}</span>
      </p>
    </>
  );
}
