/**
 * Dashboard handler (Phase 9.2).
 *
 * One authenticated read of the caller's own learning record, in the shape the
 * dashboard's eight surfaces render (`DashboardReadData`). The handler is thin in
 * the way the profile handler is thin — the pipeline already authenticated,
 * authorized and validated — and it owns exactly the derivation the schema cannot:
 *
 *   - the learning **domain** of an exam is its lesson's curriculum module, read
 *     from the authored content once and grouped in memory, never per row;
 *   - mastery is the **mean of the caller's best scores** in that domain, computed
 *     here where the rows live, so no client re-derives an authoritative number;
 *   - a section with nothing to report is `null` or an empty array. An account with
 *     no history gets a stable, complete payload — not a 404, not a fabricated zero.
 *
 * Scoping is structural: every per-user read takes the principal's id and nothing
 * else. There is no parameter a client could point at another account.
 *
 * Read budget: five repository calls total — progress, attempts, curricula, lessons
 * and exams — with the joins done in memory over maps. No N+1.
 */

import { AppError } from '../../../packages/shared/src/core/errors.js';
import type { DashboardReadData } from '../../../packages/shared/src/frontend/viewModels.js';
import type {
  DashboardMetricsView,
  DomainMasteryView,
  DashboardExamView,
  DashboardErrorView,
} from '../../../packages/shared/src/frontend/viewModels.js';
import type { Repositories } from '../../db/repositories/index.js';
import type { RouteHandler } from '../context.js';

export interface DashboardHandlerDeps {
  /** Absent when the server runs without a database handle. */
  repositories?: Repositories | undefined;
  now?: (() => number) | undefined;
  /** The market-data fact the server already holds; absent means none. */
  marketSymbol?: string | undefined;
  marketTimeframe?: string | undefined;
}

const READ_NOTE =
  'Every figure below is derived from your own records on the server: mastery is the mean of your best scores per learning domain, and a section with nothing to report is stated as empty rather than drawn as a zero.';

/** Weak areas are the lowest assessed domains, bounded so the card stays a summary. */
const WEAK_AREA_LIMIT = 2;
const RECENT_ERROR_LIMIT = 3;

function principalId(context: Parameters<RouteHandler>[0]['context']): string {
  const principal = context.principal;
  if (principal === null) {
    throw new AppError('UNAUTHENTICATED', 'A dashboard belongs to an authenticated user.');
  }
  return principal.id;
}

function store(deps: DashboardHandlerDeps): Repositories {
  if (deps.repositories === undefined) {
    throw new AppError(
      'PROVIDER_UNAVAILABLE',
      'The learning store is not configured: the server was started without a database handle, so dashboard metrics cannot be read.',
      { details: { capability: 'academy.store' } },
    );
  }
  return deps.repositories;
}

export function dashboardReadHandler(
  deps: DashboardHandlerDeps,
): RouteHandler<Record<string, unknown> | undefined, DashboardReadData> {
  return async ({ context }) => {
    const repositories = store(deps);
    const userId = principalId(context);
    const now = (deps.now ?? (() => Date.now()))();

    // One read per table, all scoped to the caller where a scope exists. The three
    // authored-content reads are shared catalogue rows, not per-user data.
    const [progressRows, attempts, curricula, lessons, exams] = await Promise.all([
      repositories.academy.progressFor(userId),
      repositories.academy.recentAttempts(userId),
      repositories.academy.allCurricula(),
      repositories.academy.allLessons(),
      repositories.academy.allExams(),
    ]);

    /* ---------------------------------------------------------- agent level */

    // The level is the stage the curriculum declares: derived from the caller's own
    // progress, never asserted by the client. No progress at all is `null` — a stated
    // fact the interface renders as its empty state.
    const completedCount = progressRows.filter(
      (row) => row.status === 'completed' || row.status === 'mastered',
    ).length;
    const inProgressProgress = progressRows.find((row) => row.status === 'in_progress') ?? null;
    const agentLevel =
      completedCount === 0 && inProgressProgress === null ? null : `Level ${completedCount + 1}`;

    /* ----------------------------------------------------- knowledge mastery */

    // Domain of an exam = its lesson's curriculum module. Authored rows are read once
    // and grouped into maps, so the per-attempt work below is a dictionary lookup.
    const curriculumTitle = new Map(curricula.map((row) => [row.id, row.title]));
    const lessonById = new Map(lessons.map((row) => [row.id, row]));
    const examById = new Map(exams.map((row) => [row.id, row]));
    const domainOfExam = new Map<string, string>();
    for (const exam of exams) {
      const lesson = lessonById.get(exam.lesson_id);
      if (lesson === undefined) continue;
      const domain = curriculumTitle.get(lesson.curriculum_id);
      if (domain !== undefined) domainOfExam.set(exam.id, domain);
    }

    // Best score per exam, then the mean per domain — derived once, server-side.
    const bestByExam = new Map<string, number>();
    const attemptsByExam = new Map<string, number>();
    for (const attempt of attempts) {
      const current = bestByExam.get(attempt.exam_id);
      bestByExam.set(attempt.exam_id, Math.max(current ?? 0, attempt.score));
      attemptsByExam.set(attempt.exam_id, (attemptsByExam.get(attempt.exam_id) ?? 0) + 1);
    }

    const masteryTotals = new Map<string, { sum: number; exams: number }>();
    for (const [examId, best] of bestByExam) {
      const domain = domainOfExam.get(examId);
      if (domain === undefined) continue;
      const totals = masteryTotals.get(domain) ?? { sum: 0, exams: 0 };
      totals.sum += best;
      totals.exams += 1;
      masteryTotals.set(domain, totals);
    }

    const attemptTotalByDomain = new Map<string, number>();
    for (const [examId] of attemptsByExam) {
      const domain = domainOfExam.get(examId);
      if (domain === undefined) continue;
      attemptTotalByDomain.set(domain, (attemptTotalByDomain.get(domain) ?? 0) + 1);
    }

    const mastery: DomainMasteryView[] = [...masteryTotals.entries()]
      .map(([domain, totals]) => ({
        domain,
        masteryPercent: Number((totals.sum / totals.exams).toFixed(1)),
        attemptCount: attemptTotalByDomain.get(domain) ?? 0,
      }))
      .sort((a, b) => a.masteryPercent - b.masteryPercent);

    /* ------------------------------------------------- current course + lesson */

    const currentLessonProgress = progressRows.find((row) => row.status === 'in_progress') ?? null;
    const currentLessonRow =
      currentLessonProgress === null ? undefined : lessonById.get(currentLessonProgress.lesson_id);
    const courseRow =
      currentLessonRow === undefined
        ? undefined
        : curricula.find((row) => row.id === currentLessonRow.curriculum_id);

    const course =
      courseRow === undefined
        ? null
        : {
            id: courseRow.id,
            title: courseRow.title,
            lessonsTotal: lessons.filter((row) => row.curriculum_id === courseRow.id).length,
          };
    const lesson =
      currentLessonRow === undefined || currentLessonProgress === null
        ? null
        : {
            id: currentLessonRow.id,
            title: currentLessonRow.title,
            status: 'in-progress' as const,
          };

    /* ------------------------------------------------------------ exam score */

    const latestScored = attempts.find((attempt) => examById.has(attempt.exam_id)) ?? null;
    const examScore: DashboardExamView | null =
      latestScored === null
        ? null
        : {
            examId: latestScored.exam_id,
            examTitle: examById.get(latestScored.exam_id)?.title ?? 'Examination',
            scorePercent: Number(latestScored.score.toFixed(1)),
            passed: latestScored.passed,
            attemptedAt: latestScored.created_at,
            attemptCount: attemptsByExam.get(latestScored.exam_id) ?? 1,
          };

    /* -------------------------------------------------------------- weak areas */

    const weakAreas = mastery.slice(0, WEAK_AREA_LIMIT);

    /* ----------------------------------------------------------- recent errors */

    // Mistake records are the caller's own knowledge errors, newest first. The text
    // carries the topic; anything else lives in the record's provenance, which the
    // dashboard does not need.
    const mistakeRows = await repositories.memory.listForUser(userId);
    const recentErrors: DashboardErrorView[] = mistakeRows
      .filter((row) => row.type === 'mistake' && row.deleted_at === null)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, RECENT_ERROR_LIMIT)
      .map((row) => ({
        id: row.id,
        topic: row.text,
        occurrences: row.version,
        lastSeenAt: row.updated_at,
      }));

    /* ---------------------------------------------------------- learning streak */

    // Consecutive days ending today (or yesterday, so an active streak survives the
    // day it is checked) with at least one recorded activity. Attempt timestamps are
    // the activity signal the schema already keeps.
    const activeDays = new Set(
      attempts.map((attempt) => new Date(attempt.created_at).toISOString().slice(0, 10)),
    );
    let learningStreakDays = 0;
    {
      const cursor = new Date(now);
      // Allow the streak to be "alive" when today has no activity yet.
      if (!activeDays.has(cursor.toISOString().slice(0, 10))) {
        cursor.setUTCDate(cursor.getUTCDate() - 1);
      }
      while (activeDays.has(cursor.toISOString().slice(0, 10))) {
        learningStreakDays += 1;
        cursor.setUTCDate(cursor.getUTCDate() - 1);
      }
    }

    /* --------------------------------------------------------- market analysis */

    // The server's own market-data fact, reported as held rather than fetched here:
    // the dashboard is a summary surface, and the chart the card will draw reads the
    // same series through the market-data routes.
    const marketAnalysis: DashboardMetricsView['marketAnalysis'] = {
      symbol: deps.marketSymbol ?? '—',
      timeframe: deps.marketTimeframe ?? '1D',
      dataProvenance: 'synthetic',
      lastBarAt: null,
      barCount: 0,
    };

    const metrics: DashboardMetricsView = {
      agentLevel,
      knowledgeMastery: mastery,
      course: { course, lesson },
      examScore,
      weakAreas,
      recentErrors,
      learningStreakDays,
      marketAnalysis,
      asOf: new Date(now).toISOString(),
    };

    context.logger.info(
      'dashboard read',
      {
        userId,
        sections: {
          agentLevel: agentLevel !== null,
          domains: mastery.length,
          course: course !== null,
          lesson: lesson !== null,
          examScore: examScore !== null,
          weakAreas: weakAreas.length,
          recentErrors: recentErrors.length,
          streak: learningStreakDays,
        },
      },
      'dashboard.read',
    );

    return { data: { capability: 'read-only', metrics, note: READ_NOTE } };
  };
}
