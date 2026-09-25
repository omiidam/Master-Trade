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

import type { ExamView } from '@shared/frontend/viewModels';
import { liveLabels, msg } from '../i18n/index.js';

/** The six states the assessment surface must be able to render. */
export type ExamRunState = 'available' | 'in-progress' | 'completed' | 'failed' | 'locked';

export const EXAM_STATE_LABEL: Record<ExamRunState, string> = liveLabels({
  available: 'exams.examState.available',
  'in-progress': 'exams.examState.in-progress',
  completed: 'exams.examState.completed',
  failed: 'exams.examState.failed',
  locked: 'exams.examState.locked',
});

export function examPreviewNotice(): string {
  return msg('exams.examPreviewNotice');
}

export function examGradingPolicy(): string {
  return msg('exams.examGradingPolicy');
}

export function examIntegrityPolicy(): string {
  return msg('exams.examIntegrityPolicy');
}

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
    get label(): string {
      return msg('profile.array.risk-management');
    },
    get description(): string {
      return msg('exams.sizingRMultiplesSurvivableLoss');
    },
    examCount: 4,
    averageScore: 82.5,
  },
  {
    id: 'market-structure',
    get label(): string {
      return msg('profile.array.market-structure');
    },
    get description(): string {
      return msg('exams.sessionsLevelsContextBeforePatterns');
    },
    examCount: 3,
    averageScore: 76,
  },
  {
    id: 'execution-discipline',
    get label(): string {
      return msg('exams.executionDiscipline');
    },
    get description(): string {
      return msg('exams.processJournalingReview');
    },
    examCount: 3,
    averageScore: null,
  },
  {
    id: 'statistics',
    get label(): string {
      return msg('exams.statisticsOfOutcomes');
    },
    get description(): string {
      return msg('exams.expectancySampleSizeOutOfSampleCaution');
    },
    examCount: 2,
    averageScore: null,
  },
  {
    id: 'process-review',
    get label(): string {
      return msg('exams.processReview');
    },
    get description(): string {
      return msg('exams.writtenPlanEvidenceHumanApprovedChanges');
    },
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
    get title(): string {
      return msg('exams.riskPerTradeBeforeRewardPer');
    },
    categoryId: 'risk-management',
    moduleId: 'm2',
    get summary(): string {
      return msg('exams.whyTheLossSideIsDecidedBeforeThe');
    },
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
    get title(): string {
      return msg('exams.fixedFractionalPositionSizing');
    },
    categoryId: 'risk-management',
    moduleId: 'm2',
    get summary(): string {
      return msg('exams.turningARiskBudgetIntoAUnitCount');
    },
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
    get title(): string {
      return msg('data.thinkingInRInsteadOfCurrency');
    },
    categoryId: 'risk-management',
    moduleId: 'm2',
    get summary(): string {
      return msg('exams.normalisingOutcomesSoTheyCanBeComparedAcross');
    },
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
    get title(): string {
      return msg('exams.sessionsSpreadsAndTheCostOfImpatience');
    },
    categoryId: 'market-structure',
    moduleId: 'm3',
    get summary(): string {
      return msg('exams.howSessionOverlapChangesWhatAFillActually');
    },
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
    get title(): string {
      return msg('exams.theWrittenPreTradeChecklist');
    },
    categoryId: 'process-review',
    moduleId: 'm4',
    get summary(): string {
      return msg('exams.whatAChecklistMustContainToBeWorth');
    },
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
    get title(): string {
      return msg('exams.expectancyAndTheSmallSampleTrap');
    },
    categoryId: 'statistics',
    moduleId: 'm5',
    get summary(): string {
      return msg('exams.whyATenTradeSampleIsNotEvidenceOf');
    },
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
    get title(): string {
      return msg('exams.reviewDisciplineAfterALoss');
    },
    categoryId: 'execution-discipline',
    moduleId: 'm4',
    get summary(): string {
      return msg('exams.separatingABadOutcomeFromABadDecision');
    },
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
    get note(): string {
      return msg('exams.firstAttemptSizingQuestionsAnsweredInCurrencyRather');
    },
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
    get note(): string {
      return msg('exams.passedAfterReworkingTheSizingLesson');
    },
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
    get note(): string {
      return msg('exams.roundingDirectionWrongInFourOfFiveSizing');
    },
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
    get note(): string {
      return msg('exams.improvedStillBelowThePassScore');
    },
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
    get note(): string {
      return msg('exams.closestAttemptSoFarGapsAreConcentrationNot');
    },
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
    get note(): string {
      return msg('exams.abandonedPartWayThroughABlankIs');
    },
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
    get note(): string {
      return msg('exams.passedOnTheFirstAttempt');
    },
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
  get title(): string {
    return msg('data.thinkingInRInsteadOfCurrency');
  },
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
    get prompt(): string {
      return msg('exams.aRiskBudgetIsDefinedInCurrencyBefore');
    },
    kind: 'single-choice',
    options: [
      {
        id: 'a',
        get label(): string {
          return msg('exams.theNumberOfUnitsFromStopDistanceAnd');
        },
      },
      {
        id: 'b',
        get label(): string {
          return msg('exams.theDirectionOfTheTrade');
        },
      },
      {
        id: 'c',
        get label(): string {
          return msg('exams.theRewardTarget');
        },
      },
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
    get prompt(): string {
      return msg('exams.whichOfTheseAreValidReasonsToExpress');
    },
    kind: 'multi-choice',
    options: [
      {
        id: 'a',
        get label(): string {
          return msg('exams.itMakesTwoDifferentSymbolsComparable');
        },
      },
      {
        id: 'b',
        get label(): string {
          return msg('exams.itRemovesTheNeedForAStop');
        },
      },
      {
        id: 'c',
        get label(): string {
          return msg('exams.itSeparatesDecisionQualityFromPositionSize');
        },
      },
    ],
    rubricRef: 'academy.m2.rubric.r-multiples',
    answerKeyWithheld: true,
    points: 2,
  },
  {
    id: 'q-stats-01',
    examId: 'e-stats-01',
    get prompt(): string {
      return msg('exams.inOneParagraphExplainWhyA12TradeWinning');
    },
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
    get topic(): string {
      return msg('exams.roundingAUnitCountUpInsteadOfDown');
    },
    categoryId: 'risk-management',
    occurrences: 5,
    share: 0.28,
    get note(): string {
      return msg('exams.roundingUpSilentlyExceedsTheStatedRiskBudget');
    },
    lastSeenAt: '2026-09-18T09:05:00Z',
    lessonId: 'l-risk-02',
  },
  {
    id: 'mist-02',
    get topic(): string {
      return msg('exams.confusingExpectancyWithWinRate');
    },
    categoryId: 'statistics',
    occurrences: 4,
    share: 0.22,
    get note(): string {
      return msg('exams.aHighWinRateWithNegativeExpectancyStill');
    },
    lastSeenAt: '2026-09-17T19:30:00Z',
    lessonId: 'l-stats-01',
  },
  {
    id: 'mist-03',
    get topic(): string {
      return msg('exams.placingTheInvalidationLevelInsideNormalNoise');
    },
    categoryId: 'market-structure',
    occurrences: 3,
    share: 0.17,
    get note(): string {
      return msg('exams.aStopInsideTheNoiseRangeIsA');
    },
    lastSeenAt: '2026-09-15T09:19:00Z',
    lessonId: 'l-structure-01',
  },
  {
    id: 'mist-04',
    get topic(): string {
      return msg('exams.skippingTheWrittenInvalidationLevel');
    },
    categoryId: 'process-review',
    occurrences: 2,
    share: 0.11,
    get note(): string {
      return msg('exams.processOmissionRatherThanAKnowledgeGapThe');
    },
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
