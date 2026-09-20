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
} from '../../../src/frontend/viewModels.js';
import type { EpistemicKind } from '../../../src/types.js';

/**
 * The assessment rows live with the Exams module (`./exams.js`) so the Academy
 * compact list and the Exams page cannot disagree about a score.
 */
export { mockExamViews as mockExams } from './exams.js';

export const MOCK_DATA_NOTICE =
  'Illustrative data for layout review. Nothing on this screen is connected to a backend, a model or a market feed.';

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
    title: 'Market Mechanics & Vocabulary',
    month: 1,
    summary: 'Orders, spreads, sessions and the language of price.',
    lessons: 8,
    status: 'complete',
    focus: ['Market structure', 'Sessions', 'Order types (theory only)'],
  },
  {
    id: 'm2',
    title: 'Risk First',
    month: 2,
    summary: 'Position sizing, R-multiples and survivable loss.',
    lessons: 9,
    status: 'in-progress',
    focus: ['Fixed-fractional sizing', 'R-multiples', 'Drawdown control'],
  },
  {
    id: 'm3',
    title: 'Chart Reading',
    month: 3,
    summary: 'Structure, levels and context before pattern names.',
    lessons: 8,
    status: 'available',
    focus: ['Support & resistance', 'Trend structure', 'Volume context'],
  },
  {
    id: 'm4',
    title: 'Execution Discipline',
    month: 4,
    summary: 'Process, journaling and review instead of prediction.',
    lessons: 8,
    status: 'locked',
    focus: ['Pre-trade checklist', 'Journaling', 'Post-trade review'],
  },
  {
    id: 'm5',
    title: 'Statistics of Outcomes',
    month: 5,
    summary: 'Expectancy, sample size and why small samples lie.',
    lessons: 8,
    status: 'locked',
    focus: ['Expectancy', 'Sample size', 'Out-of-sample caution'],
  },
  {
    id: 'm6',
    title: 'Independent Operator',
    month: 6,
    summary: 'A written, evidence-backed process of your own.',
    lessons: 7,
    status: 'locked',
    focus: ['Written plan', 'Rule proposals', 'Human-approved changes'],
  },
];

export const mockLessons: readonly LessonView[] = [
  {
    id: 'l-risk-01',
    title: 'Risk per trade before reward per trade',
    difficulty: 2,
    status: 'complete',
    prerequisites: [],
  },
  {
    id: 'l-risk-02',
    title: 'Fixed-fractional position sizing',
    difficulty: 2,
    status: 'in-progress',
    prerequisites: ['l-risk-01'],
  },
  {
    id: 'l-risk-03',
    title: 'Thinking in R instead of currency',
    difficulty: 3,
    status: 'available',
    prerequisites: ['l-risk-02'],
  },
  {
    id: 'l-risk-04',
    title: 'Drawdown you can actually survive',
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
    sources: ['risk.positionSize (not yet connected)'],
    createdAt: '2026-09-19T08:41:06Z',
  },
  {
    id: 'msg-3',
    role: 'agent',
    text: 'Hypothesis: traders who fix risk first tend to reduce decision fatigue later. That is a testable claim about your process, not a market prediction, and it should be checked against your own journal before you trust it.',
    epistemicKind: 'hypothesis',
    sources: ['academy.m2.risk-first'],
    createdAt: '2026-09-19T08:41:11Z',
  },
  {
    id: 'msg-4',
    role: 'agent',
    text: 'Uncertainty: nothing here tells you whether this setup will work. Sample size is one, and a single outcome carries no statistical weight.',
    epistemicKind: 'uncertainty',
    sources: [],
    createdAt: '2026-09-19T08:41:14Z',
  },
];

export const EPISTEMIC_LABEL: Record<EpistemicKind, string> = {
  fact: 'Fact',
  analysis: 'Analysis',
  hypothesis: 'Hypothesis',
  uncertainty: 'Uncertainty',
};

/* ------------------------------------------------------------------ */
/* Dashboard, lab and system surfaces                                  */
/* ------------------------------------------------------------------ */

export const mockDashboard: DashboardView = {
  capability: 'read-only',
  symbol: 'SYNTH-DEMO',
  timeframe: '1D',
  dataProvenance: 'synthetic',
  lastUpdated: MOCK_GENERATED_AT,
  headings: ['Training equity curve', 'Streaks and consistency', 'Risk-tool usage'],
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
    label: 'Review streak',
    value: '11 days',
    delta: '+3',
    trend: 'up',
    hint: 'Consecutive days with a completed review session',
  },
  {
    id: 'exams',
    label: 'Exam average',
    value: '82.5%',
    delta: '+4.0',
    trend: 'up',
    hint: 'Mean of your best score per examination',
  },
  {
    id: 'completed',
    label: 'Lessons complete',
    value: '7 / 48',
    delta: '+2',
    trend: 'up',
    hint: 'Across the six-month curriculum',
  },
  {
    id: 'journal',
    label: 'Journal entries',
    value: '26',
    delta: '-1',
    trend: 'down',
    hint: 'Written reviews, not predictions',
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
    title: 'Pullback to prior support, risk defined',
    status: 'reviewed',
    tags: ['structure', 'risk-first'],
    note: 'Reviewed against the month 2 checklist. Process notes only — no outcome claimed.',
    checklist: [
      { label: 'Risk defined before entry', done: true },
      { label: 'Invalidation level written down', done: true },
      { label: 'Position size from deterministic tool', done: false },
    ],
  },
  {
    id: 'setup-2',
    title: 'Range edge, low conviction',
    status: 'draft',
    tags: ['range', 'patience'],
    note: 'Draft. Kept as a counter-example: the reason to skip a trade is also a record.',
    checklist: [
      { label: 'Risk defined before entry', done: true },
      { label: 'Invalidation level written down', done: false },
      { label: 'Position size from deterministic tool', done: false },
    ],
  },
  {
    id: 'setup-3',
    title: 'Post-earnings gap continuation',
    status: 'awaiting-review',
    tags: ['gap', 'volatility'],
    note: 'Waiting for review. Elevated volatility means wider stops and smaller size.',
    checklist: [
      { label: 'Risk defined before entry', done: true },
      { label: 'Invalidation level written down', done: true },
      { label: 'Position size from deterministic tool', done: true },
    ],
  },
];

export const mockNotifications: readonly NotificationView[] = [
  {
    id: 'n-1',
    severity: 'info',
    message: 'Module 2 unlocked: Risk First.',
    createdAt: '2026-09-18T18:20:00Z',
  },
  {
    id: 'n-2',
    severity: 'warning',
    message: 'Exam average dipped below 80% in the last attempt.',
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
    detail: 'Response labelled with fact / analysis / hypothesis / uncertainty',
    correlationId: 'corr_preview_01',
  },
  {
    id: 'a-2',
    at: '2026-09-19T08:41:06Z',
    actor: 'system',
    event: 'tool.requested',
    detail: 'risk.positionSize requested — permission check and execution are orchestrator-owned',
    correlationId: 'corr_preview_01',
  },
  {
    id: 'a-3',
    at: '2026-09-18T18:20:00Z',
    actor: 'system',
    event: 'curriculum.unlocked',
    detail: 'Module 2 available after module 1 completion',
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
    label: 'OpenAI',
    state: 'missing',
    secretRef: 'keychain:llm.openai',
    note: 'Keys are stored in the OS keychain; configuration only ever holds a reference.',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    state: 'missing',
    secretRef: 'keychain:llm.anthropic',
    note: 'Second provider exists to prove the gateway is provider-independent.',
  },
  {
    id: 'scripted',
    label: 'Scripted (offline)',
    state: 'offline-default',
    secretRef: 'none',
    note: 'Deterministic default used when no hosted provider is configured.',
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
  { id: 'month', label: 'This month', spent: '$3.42', budget: '$25.00', share: 0.14 },
  { id: 'context', label: 'Context assembly', spent: '$1.10', budget: '—', share: 0.32 },
  { id: 'grading', label: 'Exam grading', spent: '$0.86', budget: '—', share: 0.25 },
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
