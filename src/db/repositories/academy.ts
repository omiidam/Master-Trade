/**
 * Academy repository — owner: `academy`.
 *
 * Curriculum, lessons, per-user progress, exams and attempts. Two rules shape it:
 *
 *   - **Authored content is versioned, not edited silently.** A lesson rewrite is
 *     a new curriculum version; `upsertLesson` exists for authoring the *current*
 *     version, and the slug stays stable so progress survives a rewrite.
 *   - **Progress is derived from evidence.** `recordProgress` refuses to mark a
 *     lesson `mastered` without a score, and the schema refuses a completion with
 *     no completion timestamp — the same rule in two places on purpose, because a
 *     learner's record is what they are paying attention to.
 */

import { AppError } from '../../../packages/shared/src/core/errors.js';
import { ids } from '../../../packages/shared/src/core/ids.js';
import type { SqlExecutor } from '../executor.js';
import { Table } from '../table.js';
import type { Owner } from '../ownership.js';
import type { TableName } from '../schema.js';

export const OWNER: Owner = 'academy';
export const OWNED_TABLES: readonly TableName[] = [
  'curricula',
  'lessons',
  'lesson_progress',
  'exams',
  'exam_attempts',
];

export type ProgressStatus = 'locked' | 'available' | 'in_progress' | 'completed' | 'mastered';

export interface CurriculumRow {
  id: string;
  title: string;
  version: string;
  created_at: string;
}

export interface LessonRow {
  id: string;
  curriculum_id: string;
  slug: string;
  title: string;
  difficulty: number;
  order_index: number;
  content: unknown;
  prerequisites: unknown;
  created_at: string;
}

export interface ProgressRow {
  id: string;
  user_id: string;
  lesson_id: string;
  status: ProgressStatus;
  score: number | null;
  completed_at: string | null;
  updated_at: string;
}

export interface ExamRow {
  id: string;
  lesson_id: string;
  title: string;
  rubric: unknown;
  pass_score: number;
  created_at: string;
}

export interface ExamAttemptRow {
  id: string;
  exam_id: string;
  user_id: string;
  answers: unknown;
  grading: unknown;
  score: number;
  passed: boolean;
  created_at: string;
}

export interface AcademyRepositoryOptions {
  now?: () => number;
  newId?: (kind: string) => string;
}

export interface LessonInput {
  slug: string;
  title: string;
  difficulty?: number;
  orderIndex: number;
  content: unknown;
  prerequisites?: unknown;
}

export class AcademyRepository {
  private readonly curricula: Table<CurriculumRow>;
  private readonly lessons: Table<LessonRow>;
  private readonly progress: Table<ProgressRow>;
  private readonly exams: Table<ExamRow>;
  private readonly attempts: Table<ExamAttemptRow>;
  private readonly now: () => number;
  private readonly newId: (kind: string) => string;

  constructor(db: SqlExecutor, options: AcademyRepositoryOptions = {}) {
    this.curricula = new Table<CurriculumRow>(db, 'curricula');
    this.lessons = new Table<LessonRow>(db, 'lessons');
    this.progress = new Table<ProgressRow>(db, 'lesson_progress');
    this.exams = new Table<ExamRow>(db, 'exams');
    this.attempts = new Table<ExamAttemptRow>(db, 'exam_attempts');
    this.now = options.now ?? Date.now;
    this.newId = options.newId ?? ((kind) => ids.id(kind));
  }

  private iso(): string {
    return new Date(this.now()).toISOString();
  }

  /* ------------------------------------------------------------ curricula */

  createCurriculum(input: { title: string; version: string }): Promise<CurriculumRow> {
    return this.curricula.insert({
      id: this.newId('curr'),
      title: input.title,
      version: input.version,
      created_at: this.iso(),
    });
  }

  curriculum(id: string): Promise<CurriculumRow | null> {
    return this.curricula.findById(id);
  }

  async upsertLesson(curriculumId: string, input: LessonInput): Promise<LessonRow> {
    const existing = await this.lessons.findOne({ slug: input.slug });
    if (existing) {
      const updated = await this.lessons.update(existing.id, {
        title: input.title,
        difficulty: input.difficulty ?? existing.difficulty,
        order_index: input.orderIndex,
        content: input.content,
        prerequisites: input.prerequisites ?? existing.prerequisites,
      });
      if (!updated) throw new AppError('INTERNAL', 'Lesson update did not persist');
      return updated;
    }
    return this.lessons.insert({
      id: this.newId('lesn'),
      curriculum_id: curriculumId,
      slug: input.slug,
      title: input.title,
      difficulty: input.difficulty ?? 1,
      order_index: input.orderIndex,
      content: input.content,
      prerequisites: input.prerequisites ?? [],
      created_at: this.iso(),
    });
  }

  lessonBySlug(slug: string): Promise<LessonRow | null> {
    return this.lessons.findOne({ slug });
  }

  lessonsOf(curriculumId: string): Promise<LessonRow[]> {
    return this.lessons.findMany(
      { curriculum_id: curriculumId },
      { orderBy: 'order_index', direction: 'asc', limit: 500 },
    );
  }

  /* ------------------------------------------------------------- progress */

  /**
   * Record progress for a user/lesson pair. `completed` and `mastered` require a
   * timestamp; `mastered` also requires a score — the same constraint the
   * database enforces, raised here first so the error names the rule.
   */
  async recordProgress(input: {
    userId: string;
    lessonId: string;
    status: ProgressStatus;
    score?: number | null;
  }): Promise<ProgressRow> {
    const isDone = input.status === 'completed' || input.status === 'mastered';
    if (isDone && input.score === undefined) {
      throw new AppError('VALIDATION_FAILED', `status "${input.status}" requires a score`);
    }
    if (input.status === 'mastered' && (input.score ?? 0) < 80) {
      throw new AppError('VALIDATION_FAILED', 'mastery requires a score of at least 80');
    }
    const now = this.iso();
    const existing = await this.progress.findOne({
      user_id: input.userId,
      lesson_id: input.lessonId,
    });
    const values: Partial<ProgressRow> = {
      status: input.status,
      score: input.score ?? existing?.score ?? null,
      completed_at: isDone ? (existing?.completed_at ?? now) : null,
      updated_at: now,
    };
    if (!existing) {
      return this.progress.insert({
        id: this.newId('prog'),
        user_id: input.userId,
        lesson_id: input.lessonId,
        status: input.status,
        score: values.score ?? null,
        completed_at: values.completed_at ?? null,
        updated_at: now,
      });
    }
    const updated = await this.progress.update(existing.id, values);
    if (!updated) throw new AppError('INTERNAL', 'Progress update did not persist');
    return updated;
  }

  progressFor(userId: string): Promise<ProgressRow[]> {
    return this.progress.findMany(
      { user_id: userId },
      { orderBy: 'updated_at', direction: 'desc' },
    );
  }

  async progressSummary(userId: string): Promise<Record<ProgressStatus, number>> {
    const rows = await this.progressFor(userId);
    const summary: Record<ProgressStatus, number> = {
      locked: 0,
      available: 0,
      in_progress: 0,
      completed: 0,
      mastered: 0,
    };
    for (const row of rows) summary[row.status] += 1;
    return summary;
  }

  /* ---------------------------------------------------------------- exams */

  createExam(input: {
    lessonId: string;
    title: string;
    rubric: unknown;
    passScore?: number;
  }): Promise<ExamRow> {
    return this.exams.insert({
      id: this.newId('exam'),
      lesson_id: input.lessonId,
      title: input.title,
      rubric: input.rubric,
      pass_score: input.passScore ?? 70,
      created_at: this.iso(),
    });
  }

  /** Attempts are immutable: a retake is a new row, never an edit. */
  recordAttempt(input: {
    examId: string;
    userId: string;
    answers: unknown;
    grading: unknown;
    score: number;
    passed: boolean;
  }): Promise<ExamAttemptRow> {
    return this.attempts.insert({
      id: this.newId('attm'),
      exam_id: input.examId,
      user_id: input.userId,
      answers: input.answers,
      grading: input.grading,
      score: input.score,
      passed: input.passed,
      created_at: this.iso(),
    });
  }

  attemptsFor(userId: string, examId?: string): Promise<ExamAttemptRow[]> {
    return this.attempts.findMany(
      examId === undefined ? { user_id: userId } : { user_id: userId, exam_id: examId },
      { orderBy: 'created_at', direction: 'desc' },
    );
  }

  /** Best score per exam, for a longitudinal view that hides retake noise. */
  async bestScores(userId: string): Promise<{ examId: string; best: number; attempts: number }[]> {
    const rows = await this.attemptsFor(userId);
    const byExam = new Map<string, { best: number; attempts: number }>();
    for (const row of rows) {
      const current = byExam.get(row.exam_id) ?? { best: 0, attempts: 0 };
      byExam.set(row.exam_id, {
        best: Math.max(current.best, row.score),
        attempts: current.attempts + 1,
      });
    }
    return [...byExam.entries()].map(([examId, value]) => ({ examId, ...value }));
  }
}

export function createAcademyRepository(
  db: SqlExecutor,
  options: AcademyRepositoryOptions = {},
): AcademyRepository {
  return new AcademyRepository(db, options);
}
