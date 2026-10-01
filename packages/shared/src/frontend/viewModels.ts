/**
 * Frontend view models.
 *
 * The frontend renders these shapes and owns application state. Two structural
 * guarantees live here, enforced by tests:
 *   - no navigation item or view model describes an execution/trading control;
 *   - market data always shows its provenance (synthetic vs. historical).
 */

import type { EpistemicKind } from '../types.js';
import type { DataProvenance } from '../marketdata/provider.js';
import { PolicyViolationError } from '../core/errors.js';

export type AppSection =
  'conversation' | 'academy' | 'dashboard' | 'notifications' | 'logs' | 'settings';

export interface NavItem {
  id: AppSection;
  label: string;
  description: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { id: 'conversation', label: 'Agent', description: 'Ask questions and review answers' },
  { id: 'academy', label: 'Academy', description: 'Curriculum, lessons and examinations' },
  { id: 'dashboard', label: 'Dashboard', description: 'Read-only training charts and metrics' },
  { id: 'notifications', label: 'Notifications', description: 'Progress, job and system notices' },
  { id: 'logs', label: 'Activity', description: 'What the agent did, with provenance' },
  { id: 'settings', label: 'Settings', description: 'Preferences, providers and safety status' },
];

/**
 * Any UI affordance that would imply order placement or broker access.
 * The frontend must never render such a control: the backend cannot perform it.
 */
export const FORBIDDEN_UI_CONTROL =
  /(place[._\- ]?order|execute|broker|buy[._\- ]?now|sell[._\- ]?now|live[._\- ]?trade)/i;

export function assertNoExecutionControls(labels: readonly string[]): void {
  const offenders = labels.filter((label) => FORBIDDEN_UI_CONTROL.test(label));
  if (offenders.length > 0) {
    throw new PolicyViolationError(
      `UI must not offer execution controls: ${offenders.join(', ')}`,
      {
        offenders,
      },
    );
  }
}

export interface ConversationMessageView {
  id: string;
  role: 'user' | 'agent' | 'system';
  text: string;
  epistemicKind: EpistemicKind;
  /** Tool/provenance references backing the statement. */
  sources: string[];
  createdAt: string;
}

export interface LessonView {
  id: string;
  title: string;
  difficulty: number;
  status: 'locked' | 'available' | 'in-progress' | 'complete';
  prerequisites: string[];
}

export interface ExamView {
  id: string;
  lessonId: string;
  questionCount: number;
  bestScore: number | null;
}

export interface ProgressView {
  level: string;
  lessonsComplete: number;
  lessonsTotal: number;
  examAverage: number | null;
}

/* ------------------------------------------------------------------ */
/* Dashboard read model (Phase 9.2)                                    */
/* ------------------------------------------------------------------ */

/**
 * The dashboard's data contract.
 *
 * One authenticated read of the caller's own learning record, in the shape the
 * eight dashboard surfaces render. Every section is *nullable by meaning* rather
 * than by accident: `null` is a stated fact — "no attempt has been scored", "the
 * lesson list has no lesson in progress" — and the interface renders that fact,
 * while a missing field would read as an error and a fabricated zero would read
 * as data. No field here is a number the client computes: percentages, means and
 * counts arrive as the server derived them from the stored rows.
 */

/**
 * A learning domain's mastery, as the mean of the user's best examination
 * scores in that domain. `attemptCount` rides along so "a high share of a small
 * sample" is visible rather than hidden.
 */
export interface DomainMasteryView {
  domain: string;
  /** Mean of best scores, 0..100. Present only when at least one attempt exists. */
  masteryPercent: number | null;
  attemptCount: number;
}

/** The caller's course and lesson, as two separately labelled facts. */
export interface DashboardCourseView {
  /** The course (curriculum module) currently in progress. */
  course: { id: string; title: string; lessonsTotal: number } | null;
  /** The lesson currently in progress inside it, when there is one. */
  lesson: { id: string; title: string; status: 'in-progress' } | null;
}

/** The most recent scored examination attempt, or `null` when none exists. */
export interface DashboardExamView {
  examId: string;
  examTitle: string;
  /** The attempt's own score, not the exam's best. */
  scorePercent: number;
  passed: boolean;
  attemptedAt: string;
  attemptCount: number;
}

/** One recurring mistake pattern, as the assessment rows recorded it. */
export interface DashboardErrorView {
  id: string;
  topic: string;
  occurrences: number;
  lastSeenAt: string;
}

/** The one card the dashboard draws for the market analysis. Entry point, not engine. */
export interface DashboardMarketView {
  symbol: string;
  timeframe: string;
  /** Never hidden: the reader always knows what kind of data this is. */
  dataProvenance: DataProvenance;
  /** The newest bar's time, or `null` when the deployment holds no series. */
  lastBarAt: string | null;
  barCount: number;
}

export interface DashboardMetricsView {
  /** The level the curriculum declares for the caller, or `null` before any progress exists. */
  agentLevel: string | null;
  /** One entry per learning domain, weakest first. */
  knowledgeMastery: DomainMasteryView[];
  course: DashboardCourseView;
  examScore: DashboardExamView | null;
  /** The domains whose mean sits lowest, from `knowledgeMastery` itself. */
  weakAreas: DomainMasteryView[];
  /** The most recent mistake patterns, newest first, bounded to three. */
  recentErrors: DashboardErrorView[];
  /** Consecutive days with a recorded learning activity, up to today. */
  learningStreakDays: number;
  marketAnalysis: DashboardMarketView;
  /** When this reading was taken, so a cached render can say how old it is. */
  asOf: string;
}

/**
 * The dashboard read, exactly as the API returns it.
 *
 * `capability` restates the structural guarantee above: this surface reads and never writes.
 */
export interface DashboardReadData {
  capability: 'read-only';
  metrics: DashboardMetricsView;
  note: string;
}

export interface DashboardView {
  /** Structural guarantee: the dashboard is read-only, always. */
  capability: 'read-only';
  symbol: string;
  timeframe: string;
  /** Never hidden: the user always knows what kind of data they are seeing. */
  dataProvenance: DataProvenance;
  lastUpdated: string;
  headings: string[];
}

export interface NotificationView {
  id: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  createdAt: string;
}

export interface JobStatusView {
  id: string;
  kind: string;
  status: string;
  attempts: number;
}

export interface SystemStatusView {
  agentState: string;
  llmProvider: string;
  llmBudgetUsedUsd: number;
  realtimeConnected: boolean;
  dataSources: { id: string; provenance: DataProvenance }[];
  jobs: JobStatusView[];
  safety: { mode: string; liveTradingEnabled: false; brokerExecutionEnabled: false };
}

/** Provenance banner text; synthetic data must never read as real. */
export function provenanceLabel(provenance: DataProvenance): string {
  switch (provenance) {
    case 'synthetic':
      return 'Synthetic training data — not real market data';
    case 'historical':
      return 'Historical market data';
    case 'live':
      return 'Live market data (read-only)';
  }
}
