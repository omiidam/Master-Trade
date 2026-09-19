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
