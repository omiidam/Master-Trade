/**
 * Mock data for the interface preview.
 *
 * Rules this file follows deliberately:
 *   1. Nothing here computes trading or risk values — figures are illustrative
 *      constants, and the real numbers will come from deterministic backend
 *      tools (ADR-0009), never from the UI or the model.
 *   2. Shapes are typed against the backend view models in
 *      `src/frontend/viewModels.ts`, so this preview cannot drift into an
 *      invented contract that the real API will not satisfy.
 *   3. Every surface that renders this data shows the preview/provenance label.
 *
 * There is no fake AI, no fake order flow and no fake backend: the pages render
 * these objects and say so.
 */

import type {
  ConversationMessageView,
  DashboardView,
  LessonView,
  NotificationView,
  ProgressView,
  SystemStatusView,
} from '@shared/frontend/viewModels';
import type { EpistemicKind } from '@shared/types';
import { liveLabels, msg } from '../i18n/index.js';

/**
 * The assessment rows live with the Exams module (`./exams.js`) so the Academy
 * compact list and the Exams page cannot disagree about a score.
 */
export { mockExamViews as mockExams } from './exams.js';

export function mockDataNotice(): string {
  return msg('data.mockDataNotice');
}

export const MOCK_GENERATED_AT = '2026-09-19T09:00:00Z';

/* ------------------------------------------------------------------ */
/* Progress, curriculum and exams                                      */
/* ------------------------------------------------------------------ */

export const mockProgress: ProgressView = {
  level: 'Foundations',
  lessonsComplete: 7,
  lessonsTotal: 48,
  examAverage: 82.5,
};

export interface CurriculumModule {
  id: string;
  title: string;
  month: number;
  summary: string;
  lessons: number;
  status: 'complete' | 'in-progress' | 'available' | 'locked';
  focus: string[];
}

export const mockCurriculum: readonly CurriculumModule[] = [
  {
    id: 'm1',
    get title(): string {
      return msg('data.marketMechanicsVocabulary');
    },
    month: 1,
    get summary(): string {
      return msg('data.ordersSpreadsSessionsAndTheLanguageOfPrice');
    },
    lessons: 8,
    status: 'complete',
    get focus(): string[] {
      return [
        msg('profile.array.market-structure'),
        msg('data.sessions'),
        msg('data.orderTypesTheoryOnly'),
      ];
    },
  },
  {
    id: 'm2',
    get title(): string {
      return msg('data.riskFirst');
    },
    month: 2,
    get summary(): string {
      return msg('data.positionSizingRMultiplesAndSurvivableLoss');
    },
    lessons: 9,
    status: 'in-progress',
    get focus(): string[] {
      return [
        msg('data.fixedFractionalSizing'),
        msg('data.rMultiples'),
        msg('data.drawdownControl'),
      ];
    },
  },
  {
    id: 'm3',
    get title(): string {
      return msg('data.chartReading');
    },
    month: 3,
    get summary(): string {
      return msg('data.structureLevelsAndContextBeforePatternNames');
    },
    lessons: 8,
    status: 'available',
    get focus(): string[] {
      return [msg('data.supportResistance'), msg('data.trendStructure'), msg('data.volumeContext')];
    },
  },
  {
    id: 'm4',
    get title(): string {
      return msg('data.executionDiscipline');
    },
    month: 4,
    get summary(): string {
      return msg('data.processJournalingAndReviewInsteadOfPrediction');
    },
    lessons: 8,
    status: 'locked',
    get focus(): string[] {
      return [msg('data.preTradeChecklist'), msg('data.journaling'), msg('data.postTradeReview')];
    },
  },
  {
    id: 'm5',
    get title(): string {
      return msg('data.statisticsOfOutcomes');
    },
    month: 5,
    get summary(): string {
      return msg('data.expectancySampleSizeAndWhySmallSamplesLie');
    },
    lessons: 8,
    status: 'locked',
    get focus(): string[] {
      return [
        msg('data.expectancy'),
        msg('metricsPanel.sampleSize'),
        msg('data.outOfSampleCaution'),
      ];
    },
  },
  {
    id: 'm6',
    get title(): string {
      return msg('data.independentOperator');
    },
    month: 6,
    get summary(): string {
      return msg('data.aWrittenEvidenceBackedProcessOfYourOwn');
    },
    lessons: 7,
    status: 'locked',
    get focus(): string[] {
      return [
        msg('data.writtenPlan'),
        msg('agent.ruleProposals'),
        msg('data.humanApprovedChanges'),
      ];
    },
  },
];

export const mockLessons: readonly LessonView[] = [
  {
    id: 'l-risk-01',
    get title(): string {
      return msg('exams.riskPerTradeBeforeRewardPer');
    },
    difficulty: 2,
    status: 'complete',
    prerequisites: [],
  },
  {
    id: 'l-risk-02',
    get title(): string {
      return msg('exams.fixedFractionalPositionSizing');
    },
    difficulty: 2,
    status: 'in-progress',
    prerequisites: ['l-risk-01'],
  },
  {
    id: 'l-risk-03',
    get title(): string {
      return msg('data.thinkingInRInsteadOfCurrency');
    },
    difficulty: 3,
    status: 'available',
    prerequisites: ['l-risk-02'],
  },
  {
    id: 'l-risk-04',
    get title(): string {
      return msg('data.drawdownYouCanActuallySurvive');
    },
    difficulty: 3,
    status: 'locked',
    prerequisites: ['l-risk-03'],
  },
];

/* ------------------------------------------------------------------ */
/* Agent conversation (contract-typed; no live model behind it)         */
/* ------------------------------------------------------------------ */

export const mockConversation: readonly ConversationMessageView[] = [
  {
    id: 'msg-1',
    role: 'user',
    text: 'I want to risk 1% of a $25,000 practice account on an entry at 184.20 with a stop at 181.90.',
    epistemicKind: 'fact',
    sources: [],
    createdAt: '2026-09-19T08:41:00Z',
  },
  {
    id: 'msg-2',
    role: 'agent',
    text: 'Sizing is a deterministic calculation, so it will run as a tool rather than as reasoning. With your inputs the per-unit risk is 2.30 and the 1% budget is $250, which gives 108 units after rounding down. In this preview no tool is wired yet, so treat this as a worked example of the layout, not a result.',
    epistemicKind: 'analysis',
    get sources(): string[] {
      return [msg('data.riskPositionSizeNotYetConnected')];
    },
    createdAt: '2026-09-19T08:41:06Z',
  },
  {
    id: 'msg-3',
    role: 'agent',
    get text(): string {
      return msg('data.hypothesisTradersWhoFixRiskFirstTendTo');
    },
    epistemicKind: 'hypothesis',
    sources: ['academy.m2.risk-first'],
    createdAt: '2026-09-19T08:41:11Z',
  },
  {
    id: 'msg-4',
    role: 'agent',
    get text(): string {
      return msg('data.uncertaintyNothingHereTellsYouWhetherThisSetup');
    },
    epistemicKind: 'uncertainty',
    sources: [],
    createdAt: '2026-09-19T08:41:14Z',
  },
];

export const EPISTEMIC_LABEL: Record<EpistemicKind, string> = liveLabels({
  fact: 'data.epistemic.fact',
  analysis: 'data.epistemic.analysis',
  hypothesis: 'data.epistemic.hypothesis',
  uncertainty: 'data.epistemic.uncertainty',
});

/* ------------------------------------------------------------------ */
/* Dashboard, lab and system surfaces                                  */
/* ------------------------------------------------------------------ */

export const mockDashboard: DashboardView = {
  capability: 'read-only',
  symbol: 'SYNTH-DEMO',
  timeframe: '1D',
  dataProvenance: 'synthetic',
  lastUpdated: MOCK_GENERATED_AT,
  get headings(): string[] {
    return [
      msg('dashboard.trainingEquityCurve'),
      msg('data.streaksAndConsistency'),
      msg('data.riskToolUsage'),
    ];
  },
};

export interface StudyMetric {
  id: string;
  label: string;
  value: string;
  delta: string;
  trend: 'up' | 'down' | 'flat';
  hint: string;
}

export const mockStudyMetrics: readonly StudyMetric[] = [
  {
    id: 'streak',
    get label(): string {
      return msg('data.reviewStreak');
    },
    value: '11 days',
    delta: '+3',
    trend: 'up',
    get hint(): string {
      return msg('data.consecutiveDaysWithACompletedReviewSession');
    },
  },
  {
    id: 'exams',
    get label(): string {
      return msg('academy.examAverage');
    },
    value: '82.5%',
    delta: '+4.0',
    trend: 'up',
    get hint(): string {
      return msg('data.meanOfYourBestScorePerExamination');
    },
  },
  {
    id: 'completed',
    get label(): string {
      return msg('academy.lessonsComplete2');
    },
    value: '7 / 48',
    delta: '+2',
    trend: 'up',
    get hint(): string {
      return msg('data.acrossTheSixMonthCurriculum');
    },
  },
  {
    id: 'journal',
    get label(): string {
      return msg('data.journalEntries');
    },
    value: '26',
    delta: '-1',
    trend: 'down',
    get hint(): string {
      return msg('data.writtenReviewsNotPredictions');
    },
  },
];

export interface LabSetup {
  id: string;
  title: string;
  status: 'reviewed' | 'draft' | 'awaiting-review';
  tags: readonly string[];
  note: string;
  checklist: readonly { label: string; done: boolean }[];
}

export const mockLabSetups: readonly LabSetup[] = [
  {
    id: 'setup-1',
    get title(): string {
      return msg('data.pullbackToPriorSupportRiskDefined');
    },
    status: 'reviewed',
    tags: ['structure', 'risk-first'],
    get note(): string {
      return msg('data.reviewedAgainstTheMonth2ChecklistProcessNotes');
    },
    checklist: [
      {
        get label(): string {
          return msg('data.riskDefinedBeforeEntry');
        },
        done: true,
      },
      {
        get label(): string {
          return msg('data.invalidationLevelWrittenDown');
        },
        done: true,
      },
      {
        get label(): string {
          return msg('data.positionSizeFromDeterministicTool');
        },
        done: false,
      },
    ],
  },
  {
    id: 'setup-2',
    get title(): string {
      return msg('data.rangeEdgeLowConviction');
    },
    status: 'draft',
    tags: ['range', 'patience'],
    get note(): string {
      return msg('data.draftKeptAsACounterExampleTheReasonTo');
    },
    checklist: [
      {
        get label(): string {
          return msg('data.riskDefinedBeforeEntry');
        },
        done: true,
      },
      {
        get label(): string {
          return msg('data.invalidationLevelWrittenDown');
        },
        done: false,
      },
      {
        get label(): string {
          return msg('data.positionSizeFromDeterministicTool');
        },
        done: false,
      },
    ],
  },
  {
    id: 'setup-3',
    get title(): string {
      return msg('data.postEarningsGapContinuation');
    },
    status: 'awaiting-review',
    tags: ['gap', 'volatility'],
    get note(): string {
      return msg('data.waitingForReviewElevatedVolatilityMeansWiderStops');
    },
    checklist: [
      {
        get label(): string {
          return msg('data.riskDefinedBeforeEntry');
        },
        done: true,
      },
      {
        get label(): string {
          return msg('data.invalidationLevelWrittenDown');
        },
        done: true,
      },
      {
        get label(): string {
          return msg('data.positionSizeFromDeterministicTool');
        },
        done: true,
      },
    ],
  },
];

export const mockNotifications: readonly NotificationView[] = [
  {
    id: 'n-1',
    severity: 'info',
    get message(): string {
      return msg('data.module2UnlockedRiskFirst');
    },
    createdAt: '2026-09-18T18:20:00Z',
  },
  {
    id: 'n-2',
    severity: 'warning',
    get message(): string {
      return msg('data.examAverageDippedBelow80InTheLast');
    },
    createdAt: '2026-09-18T09:05:00Z',
  },
];

export interface ActivityEntry {
  id: string;
  at: string;
  actor: 'agent' | 'system' | 'user';
  event: string;
  detail: string;
  correlationId: string;
}

export const mockActivity: readonly ActivityEntry[] = [
  {
    id: 'a-1',
    at: '2026-09-19T08:41:14Z',
    actor: 'agent',
    event: 'answer.composed',
    get detail(): string {
      return msg('data.responseLabelledWithFactAnalysisHypothesis');
    },
    correlationId: 'corr_preview_01',
  },
  {
    id: 'a-2',
    at: '2026-09-19T08:41:06Z',
    actor: 'system',
    event: 'tool.requested',
    get detail(): string {
      return msg('data.riskPositionSizeRequestedPermissionCheckAndExecution');
    },
    correlationId: 'corr_preview_01',
  },
  {
    id: 'a-3',
    at: '2026-09-18T18:20:00Z',
    actor: 'system',
    event: 'curriculum.unlocked',
    get detail(): string {
      return msg('data.module2AvailableAfterModule1Completion');
    },
    correlationId: 'corr_preview_02',
  },
];

export const mockSystemStatus: SystemStatusView = {
  agentState: 'idle',
  llmProvider: 'not configured (scripted offline default)',
  llmBudgetUsedUsd: 3.42,
  realtimeConnected: false,
  dataSources: [
    { id: 'synthetic-generator', provenance: 'synthetic' },
    { id: 'pending-historical-provider', provenance: 'historical' },
  ],
  jobs: [
    { id: 'job-1', kind: 'training.gradeSession', status: 'succeeded', attempts: 1 },
    { id: 'job-2', kind: 'embedding.generate', status: 'queued', attempts: 0 },
    { id: 'job-3', kind: 'marketData.ingest', status: 'succeeded', attempts: 2 },
  ],
  safety: { mode: 'training', liveTradingEnabled: false, brokerExecutionEnabled: false },
};

export interface ProviderRow {
  id: string;
  label: string;
  state: 'configured' | 'missing' | 'offline-default';
  secretRef: string;
  note: string;
}

export const mockProviders: readonly ProviderRow[] = [
  {
    id: 'openai',
    get label(): string {
      return msg('data.openAI');
    },
    state: 'missing',
    secretRef: 'keychain:llm.openai',
    get note(): string {
      return msg('data.keysAreStoredInTheOSKeychainConfiguration');
    },
  },
  {
    id: 'anthropic',
    get label(): string {
      return msg('data.anthropic');
    },
    state: 'missing',
    secretRef: 'keychain:llm.anthropic',
    get note(): string {
      return msg('data.secondProviderExistsToProveTheGatewayIs');
    },
  },
  {
    id: 'scripted',
    get label(): string {
      return msg('data.scriptedOffline');
    },
    state: 'offline-default',
    secretRef: 'none',
    get note(): string {
      return msg('data.deterministicDefaultUsedWhenNoHostedProviderIs');
    },
  },
];

export interface BudgetRow {
  id: string;
  label: string;
  spent: string;
  budget: string;
  share: number;
}

export const mockBudget: readonly BudgetRow[] = [
  {
    id: 'month',
    get label(): string {
      return msg('journal.tradeRange.this-month');
    },
    spent: '$3.42',
    budget: '$25.00',
    share: 0.14,
  },
  {
    id: 'context',
    get label(): string {
      return msg('data.contextAssembly');
    },
    spent: '$1.10',
    budget: '—',
    share: 0.32,
  },
  {
    id: 'grading',
    get label(): string {
      return msg('data.examGrading');
    },
    spent: '$0.86',
    budget: '—',
    share: 0.25,
  },
];

/** Deterministic pseudo-series for the illustrative chart (no randomness). */
export const mockSeries: readonly number[] = [
  42, 44, 41, 47, 49, 46, 52, 55, 53, 58, 61, 57, 63, 66, 64, 69, 72, 70, 75, 78, 74, 80, 83, 81,
  87, 90, 88, 93, 96, 94,
];

export interface MockBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Synthetic OHLC sample — labelled as synthetic everywhere it is rendered. */
export const mockBars: readonly MockBar[] = Array.from({ length: 48 }, (_, index) => {
  const base = 180 + index * 0.6 + Math.sin(index / 2.4) * 3.4;
  const open = Number(base.toFixed(2));
  const close = Number((base + Math.cos(index / 1.9) * 1.7 - 0.4).toFixed(2));
  const high = Number((Math.max(open, close) + 0.9 + (index % 5) * 0.12).toFixed(2));
  const low = Number((Math.min(open, close) - 0.85 - (index % 3) * 0.14).toFixed(2));
  const time = new Date(Date.UTC(2026, 5, 1) + index * 86_400_000).toISOString().slice(0, 10);
  return { time, open, high, low, close, volume: 120_000 + ((index * 7919) % 90_000) };
});
