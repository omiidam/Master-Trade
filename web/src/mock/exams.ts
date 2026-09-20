/**
 * Exam module mock data.
 *
 * Everything here is *illustrative*. It exists so the assessment interface can be
 * reviewed at full maturity before the persistence slice lands, and it is typed
 * against the backend view models and error vocabulary so it cannot drift into a
 * contract the real API will not satisfy.
 *
 * What this file deliberately does NOT do:
 *   - it does not grade anything. Scoring is rubric-based and deterministic and
 *     lives in the backend (`src/evaluation/**`); the model never decides
 *     pass/fail;
 *   - it does not ship an answer key. `QuestionPreview.answerKeyWithheld` is
 *     `true` for every question, and the panel says so: a client that can read
 *     the key before submitting cannot be examined;
 *   - it does not claim real results. Scores are illustrative constants and the
 *     page states that plainly.
 */

import type { ExamView } from '../../../src/frontend/viewModels.js';

/** The six states the assessment surface must be able to render. */
export type ExamRunState = 'available' | 'in-progress' | 'completed' | 'failed' | 'locked';

export const EXAM_STATE_LABEL: Record<ExamRunState, string> = {
  available: 'Available',
  'in-progress': 'In progress',
  completed: 'Completed',
  failed: 'Failed',
  locked: 'Locked',
};

export const EXAM_PREVIEW_NOTICE =
  'Illustrative assessment data. No exam runner, grader or answer key is connected in this phase — scores shown are layout examples, not results.';

export const EXAM_GRADING_POLICY =
  'Grading is rubric-based and deterministic: the backend scores each answer against the rubric and the model only explains. Pass/fail is never a model opinion.';

export const EXAM_INTEGRITY_POLICY =
  'The answer key never reaches the client before submission. Questions below are shape only: every one is marked as withheld.';

export interface ExamCategory {
  id: string;
  label: string;
  description: string;
  examCount: number;
  /** Illustrative mean of best scores in this category, or null when unattempted. */
  averageScore: number | null;
}

export const mockExamCategories: readonly ExamCategory[] = [
  {
    id: 'risk-management',
    label: 'Risk management',
    description: 'Sizing, R-multiples, survivable loss',
    examCount: 4,
    averageScore: 82.5,
  },
  {
    id: 'market-structure',
    label: 'Market structure',
    description: 'Sessions, levels, context before patterns',
    examCount: 3,
    averageScore: 76,
  },
  {
    id: 'execution-discipline',
    label: 'Execution discipline',
    description: 'Process, journaling, review',
    examCount: 3,
    averageScore: null,
  },
  {
    id: 'statistics',
    label: 'Statistics of outcomes',
    description: 'Expectancy, sample size, out-of-sample caution',
    examCount: 2,
    averageScore: null,
  },
  {
    id: 'process-review',
    label: 'Process review',
    description: 'Written plan, evidence, human-approved changes',
    examCount: 2,
    averageScore: 88,
  },
];

export interface ExamDefinition {
  id: string;
  title: string;
  categoryId: string;
  moduleId: string;
  summary: string;
  questionCount: number;
  /** Percentage required to pass; a scored attempt below it is `failed`. */
  passScore: number;
  durationMinutes: number;
  difficulty: number;
  state: ExamRunState;
  /** Best score across attempts, or null when never attempted. */
  bestScore: number | null;
  attempts: number;
  /** Lesson ids that must be complete before the exam unlocks. */
  prerequisites: readonly string[];
  /** Latest attempt timestamp, when there is one. */
  lastAttemptAt: string | null;
}

export const mockExamDefinitions: readonly ExamDefinition[] = [
  {
    id: 'e-risk-01',
    title: 'Risk per trade before reward per trade',
    categoryId: 'risk-management',
    moduleId: 'm2',
    summary: 'Why the loss side is decided before the entry is considered.',
    questionCount: 12,
    passScore: 80,
    durationMinutes: 20,
    difficulty: 2,
    state: 'completed',
    bestScore: 91,
    attempts: 2,
    prerequisites: ['l-risk-01'],
    lastAttemptAt: '2026-09-16T09:12:00Z',
  },
  {
    id: 'e-risk-02',
    title: 'Fixed-fractional position sizing',
    categoryId: 'risk-management',
    moduleId: 'm2',
    summary: 'Turning a risk budget into a unit count without rounding up.',
    questionCount: 15,
    passScore: 80,
    durationMinutes: 25,
    difficulty: 3,
    state: 'failed',
    bestScore: 74,
    attempts: 3,
    prerequisites: ['l-risk-02'],
    lastAttemptAt: '2026-09-18T09:05:00Z',
  },
  {
    id: 'e-risk-03',
    title: 'Thinking in R instead of currency',
    categoryId: 'risk-management',
    moduleId: 'm2',
    summary: 'Normalising outcomes so they can be compared across symbols.',
    questionCount: 10,
    passScore: 80,
    durationMinutes: 18,
    difficulty: 3,
    state: 'in-progress',
    bestScore: null,
    attempts: 1,
    prerequisites: ['l-risk-03'],
    lastAttemptAt: '2026-09-19T07:40:00Z',
  },
  {
    id: 'e-structure-01',
    title: 'Sessions, spreads and the cost of impatience',
    categoryId: 'market-structure',
    moduleId: 'm3',
    summary: 'How session overlap changes what a fill actually costs.',
    questionCount: 14,
    passScore: 80,
    durationMinutes: 22,
    difficulty: 2,
    state: 'available',
    bestScore: null,
    attempts: 0,
    prerequisites: ['l-structure-01'],
    lastAttemptAt: null,
  },
  {
    id: 'e-process-01',
    title: 'The written pre-trade checklist',
    categoryId: 'process-review',
    moduleId: 'm4',
    summary: 'What a checklist must contain to be worth keeping.',
    questionCount: 9,
    passScore: 80,
    durationMinutes: 15,
    difficulty: 1,
    state: 'completed',
    bestScore: 88,
    attempts: 1,
    prerequisites: ['l-process-01'],
    lastAttemptAt: '2026-09-11T19:00:00Z',
  },
  {
    id: 'e-stats-01',
    title: 'Expectancy and the small-sample trap',
    categoryId: 'statistics',
    moduleId: 'm5',
    summary: 'Why a ten-trade sample is not evidence of an edge.',
    questionCount: 16,
    passScore: 85,
    durationMinutes: 28,
    difficulty: 4,
    state: 'locked',
    bestScore: null,
    attempts: 0,
    prerequisites: ['l-stats-01'],
    lastAttemptAt: null,
  },
  {
    id: 'e-exec-01',
    title: 'Review discipline after a loss',
    categoryId: 'execution-discipline',
    moduleId: 'm4',
    summary: 'Separating a bad outcome from a bad decision.',
    questionCount: 11,
    passScore: 80,
    durationMinutes: 18,
    difficulty: 3,
    state: 'locked',
    bestScore: null,
    attempts: 0,
    prerequisites: ['l-exec-01'],
    lastAttemptAt: null,
  },
];

/**
 * The same assessment shape the backend `ExamView` exposes, derived from the
 * definitions above so the two cannot disagree. Kept exported for the Academy
 * page, which renders the compact card form.
 */
export const mockExamViews: readonly ExamView[] = mockExamDefinitions.map((exam) => ({
  id: exam.id,
  lessonId: exam.prerequisites[0] ?? exam.id,
  questionCount: exam.questionCount,
  bestScore: exam.bestScore,
}));

export interface ExamAttempt {
  id: string;
  examId: string;
  startedAt: string;
  submittedAt: string;
  score: number;
  outcome: 'passed' | 'failed' | 'void';
  durationMinutes: number;
  questionCount: number;
  /** Why an attempt was void, when it was (a blank answer is not a zero). */
  note: string;
}

export const mockExamAttempts: readonly ExamAttempt[] = [
  {
    id: 'att-01',
    examId: 'e-risk-01',
    startedAt: '2026-09-14T08:50:00Z',
    submittedAt: '2026-09-14T09:06:00Z',
    score: 58,
    outcome: 'failed',
    durationMinutes: 16,
    questionCount: 12,
    note: 'First attempt; sizing questions answered in currency rather than R.',
  },
  {
    id: 'att-02',
    examId: 'e-risk-01',
    startedAt: '2026-09-16T08:56:00Z',
    submittedAt: '2026-09-16T09:12:00Z',
    score: 91,
    outcome: 'passed',
    durationMinutes: 16,
    questionCount: 12,
    note: 'Passed after reworking the sizing lesson.',
  },
  {
    id: 'att-03',
    examId: 'e-risk-02',
    startedAt: '2026-09-12T09:00:00Z',
    submittedAt: '2026-09-12T09:21:00Z',
    score: 61,
    outcome: 'failed',
    durationMinutes: 21,
    questionCount: 15,
    note: 'Rounding direction wrong in four of five sizing questions.',
  },
  {
    id: 'att-04',
    examId: 'e-risk-02',
    startedAt: '2026-09-15T09:02:00Z',
    submittedAt: '2026-09-15T09:19:00Z',
    score: 68,
    outcome: 'failed',
    durationMinutes: 17,
    questionCount: 15,
    note: 'Improved, still below the pass score.',
  },
  {
    id: 'att-05',
    examId: 'e-risk-02',
    startedAt: '2026-09-18T08:44:00Z',
    submittedAt: '2026-09-18T09:05:00Z',
    score: 74,
    outcome: 'failed',
    durationMinutes: 21,
    questionCount: 15,
    note: 'Closest attempt so far; gaps are concentration, not raw error.',
  },
  {
    id: 'att-06',
    examId: 'e-risk-03',
    startedAt: '2026-09-19T07:22:00Z',
    submittedAt: '2026-09-19T07:40:00Z',
    score: 0,
    outcome: 'void',
    durationMinutes: 18,
    questionCount: 10,
    note: 'Abandoned part way through — a blank is recorded as void, never as zero.',
  },
  {
    id: 'att-07',
    examId: 'e-process-01',
    startedAt: '2026-09-11T18:45:00Z',
    submittedAt: '2026-09-11T19:00:00Z',
    score: 88,
    outcome: 'passed',
    durationMinutes: 15,
    questionCount: 9,
    note: 'Passed on the first attempt.',
  },
];

export interface ScorePoint {
  attemptId: string;
  examId: string;
  at: string;
  score: number;
}

/** Attempt-by-attempt evolution, oldest first — the shape the trend needs. */
export const mockScoreEvolution: readonly ScorePoint[] = mockExamAttempts
  .filter((attempt) => attempt.outcome !== 'void')
  .slice()
  .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
  .map((attempt) => ({
    attemptId: attempt.id,
    examId: attempt.examId,
    at: attempt.submittedAt,
    score: attempt.score,
  }));

/** The in-flight assessment the overview card summarises. */
export const mockCurrentAssessment = {
  examId: 'e-risk-03',
  attemptId: 'att-06',
  title: 'Thinking in R instead of currency',
  questionCount: 10,
  answered: 6,
  startedAt: '2026-09-19T07:22:00Z',
  resumed: false,
  /** Honest: the runner is a preview, so the attempt cannot actually continue. */
  resumable: false,
} as const;

export type QuestionKind = 'single-choice' | 'multi-choice' | 'numeric' | 'written';

export interface QuestionPreview {
  id: string;
  examId: string;
  prompt: string;
  kind: QuestionKind;
  options: readonly { id: string; label: string }[];
  /** Rubric reference the grader will score against, not a model opinion. */
  rubricRef: string;
  /** Always true in this phase: the key is withheld until submission. */
  answerKeyWithheld: true;
  points: number;
}

export const mockQuestions: readonly QuestionPreview[] = [
  {
    id: 'q-risk-01',
    examId: 'e-risk-01',
    prompt:
      'A risk budget is defined in currency before an entry is considered. What does the budget determine first?',
    kind: 'single-choice',
    options: [
      { id: 'a', label: 'The number of units, from stop distance and budget' },
      { id: 'b', label: 'The direction of the trade' },
      { id: 'c', label: 'The reward target' },
    ],
    rubricRef: 'academy.m2.rubric.sizing-order',
    answerKeyWithheld: true,
    points: 1,
  },
  {
    id: 'q-risk-02',
    examId: 'e-risk-02',
    prompt: 'A $250 risk budget with $2.30 of risk per unit allows 108.69 units. What is entered?',
    kind: 'numeric',
    options: [],
    rubricRef: 'academy.m2.rubric.rounding-direction',
    answerKeyWithheld: true,
    points: 2,
  },
  {
    id: 'q-risk-03',
    examId: 'e-risk-03',
    prompt: 'Which of these are valid reasons to express an outcome in R rather than currency?',
    kind: 'multi-choice',
    options: [
      { id: 'a', label: 'It makes two different symbols comparable' },
      { id: 'b', label: 'It removes the need for a stop' },
      { id: 'c', label: 'It separates decision quality from position size' },
    ],
    rubricRef: 'academy.m2.rubric.r-multiples',
    answerKeyWithheld: true,
    points: 2,
  },
  {
    id: 'q-stats-01',
    examId: 'e-stats-01',
    prompt: 'In one paragraph, explain why a 12-trade winning streak is not evidence of an edge.',
    kind: 'written',
    options: [],
    rubricRef: 'academy.m5.rubric.sample-size',
    answerKeyWithheld: true,
    points: 4,
  },
];

export interface MistakePattern {
  id: string;
  topic: string;
  categoryId: string;
  occurrences: number;
  /** Share of all incorrect answers, 0..1. */
  share: number;
  note: string;
  lastSeenAt: string;
  /** Which lesson the review points back to. */
  lessonId: string;
}

export const mockMistakes: readonly MistakePattern[] = [
  {
    id: 'mist-01',
    topic: 'Rounding a unit count up instead of down',
    categoryId: 'risk-management',
    occurrences: 5,
    share: 0.28,
    note: 'Rounding up silently exceeds the stated risk budget — the error is in the size, not the answer.',
    lastSeenAt: '2026-09-18T09:05:00Z',
    lessonId: 'l-risk-02',
  },
  {
    id: 'mist-02',
    topic: 'Confusing expectancy with win rate',
    categoryId: 'statistics',
    occurrences: 4,
    share: 0.22,
    note: 'A high win rate with negative expectancy still loses money; the rubric scores the distinction, not the arithmetic.',
    lastSeenAt: '2026-09-17T19:30:00Z',
    lessonId: 'l-stats-01',
  },
  {
    id: 'mist-03',
    topic: 'Placing the invalidation level inside normal noise',
    categoryId: 'market-structure',
    occurrences: 3,
    share: 0.17,
    note: 'A stop inside the noise range is a decision to be stopped out, not a risk limit.',
    lastSeenAt: '2026-09-15T09:19:00Z',
    lessonId: 'l-structure-01',
  },
  {
    id: 'mist-04',
    topic: 'Skipping the written invalidation level',
    categoryId: 'process-review',
    occurrences: 2,
    share: 0.11,
    note: 'Process omission rather than a knowledge gap: the checklist answer was correct, the journal practice was not.',
    lastSeenAt: '2026-09-11T19:00:00Z',
    lessonId: 'l-process-01',
  },
];

export interface ExamProgressSummary {
  attempted: number;
  passed: number;
  inProgress: number;
  available: number;
  locked: number;
  averageBest: number | null;
  /** Attempts recorded across every examination. */
  attempts: number;
  /** Mean number of attempts before a pass, where a pass exists. */
  meanAttemptsToPass: number | null;
} /** Derived, but from the mock rows above only — never from a model. */
export function summariseExamProgress(
  exams: readonly ExamDefinition[] = mockExamDefinitions,
): ExamProgressSummary {
  const scored = exams
    .map((exam) => exam.bestScore)
    .filter((score): score is number => score !== null);
  /** Passed examinations only — unattempted ones must not inflate a retry mean. */
  const completed = exams.filter((exam) => exam.state === 'completed');
  return {
    attempted: exams.filter((exam) => exam.attempts > 0).length,
    passed: completed.length,
    inProgress: exams.filter((exam) => exam.state === 'in-progress').length,
    available: exams.filter((exam) => exam.state === 'available').length,
    locked: exams.filter((exam) => exam.state === 'locked').length,
    averageBest:
      scored.length === 0
        ? null
        : Number((scored.reduce((sum, value) => sum + value, 0) / scored.length).toFixed(1)),
    attempts: exams.reduce((sum, exam) => sum + exam.attempts, 0),
    meanAttemptsToPass:
      completed.length === 0
        ? null
        : Number(
            (completed.reduce((sum, exam) => sum + exam.attempts, 0) / completed.length).toFixed(1),
          ),
  };
}
