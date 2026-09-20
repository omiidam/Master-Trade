/**
 * Preview fixtures for the activity surface.
 *
 * These exist so the interface can be reviewed without a running sidecar, and they
 * are labelled everywhere they appear. Two rules keep them honest:
 *
 *   1. **Nothing here is presented as live.** A fixture is rendered only inside a
 *      panel that says it is a preview, and the connection banner above it says the
 *      stream is not connected. There is no code path that feeds a fixture into the
 *      live store.
 *   2. **Nothing here is a trading outcome.** The job kinds are the real ones from
 *      `src/jobs/queue.ts`, and `backtest.run` is shown as *approval-gated* with no
 *      results, because a preview of a backtest that produced numbers would be a
 *      fabricated result.
 *
 * The shapes mirror the backend contracts (`JobView` in `src/jobs/service.ts`,
 * `RealtimeEvent` in `src/realtime/events.ts`) so replacing a fixture with a real
 * payload is a data change, not a rewrite.
 */

import type { JobView } from '../../../src/jobs/service.js';

export const ACTIVITY_PREVIEW_NOTICE =
  'Interface preview — mock data only, no backend or AI connected.';

export const REALTIME_PREVIEW_NOTICE =
  'Preview fixtures: a deterministic sample of what the stream carries, not a live connection.';

export const JOB_PREVIEW_NOTICE =
  'Preview fixtures: these job records are static samples from the queue schema. No worker is running in this preview.';

/** A job as the queue would report it. Static, and labelled as such in the UI. */
export type JobPreview = JobView;

export interface ActivityPreview {
  id: string;
  /** The contract type the entry came from, e.g. `agent.status`. */
  type: string;
  source: 'agent' | 'tool' | 'job' | 'system' | 'market-data' | 'user';
  at: string;
  text: string;
  /** Extra context shown as a secondary line. */
  detail?: string;
  correlationId?: string;
}

export interface NotificationPreview {
  id: string;
  level: 'info' | 'warning' | 'danger';
  title: string;
  body: string;
  at: string;
}

export const mockJobs: readonly JobPreview[] = [
  {
    id: 'job_preview_index',
    kind: 'memory.index',
    status: 'running',
    attempts: 1,
    maxAttempts: 3,
    progress: { current: 412, total: 1_000, label: 'records' },
    progressPercent: 41,
    progressUnit: 'records',
    correlationId: 'cor_preview_1',
    error: null,
    createdAt: '2026-09-20T08:12:04.000Z',
    updatedAt: '2026-09-20T08:14:36.000Z',
    cancellable: true,
  },
  {
    id: 'job_preview_grade',
    kind: 'training.gradeSession',
    status: 'queued',
    attempts: 0,
    maxAttempts: 3,
    progress: null,
    progressPercent: null,
    progressUnit: 'questions',
    correlationId: 'cor_preview_2',
    error: null,
    createdAt: '2026-09-20T08:15:00.000Z',
    updatedAt: '2026-09-20T08:15:00.000Z',
    cancellable: true,
  },
  {
    id: 'job_preview_embed',
    kind: 'embedding.generate',
    status: 'succeeded',
    attempts: 1,
    maxAttempts: 3,
    progress: { current: 96, total: 96, label: 'records' },
    progressPercent: 100,
    progressUnit: 'records',
    correlationId: 'cor_preview_3',
    error: null,
    createdAt: '2026-09-20T07:40:00.000Z',
    updatedAt: '2026-09-20T07:41:07.000Z',
    cancellable: false,
  },
  {
    id: 'job_preview_ingest',
    kind: 'marketData.ingest',
    status: 'failed',
    attempts: 2,
    maxAttempts: 4,
    progress: { current: 3, total: 8, label: 'symbols' },
    progressPercent: 38,
    progressUnit: 'symbols',
    correlationId: 'cor_preview_4',
    error: 'PROVIDER_UNAVAILABLE: the synthetic provider fixture is not running.',
    createdAt: '2026-09-20T07:10:00.000Z',
    updatedAt: '2026-09-20T07:12:31.000Z',
    cancellable: false,
  },
  {
    id: 'job_preview_report',
    kind: 'report.generate',
    status: 'dead-letter',
    attempts: 2,
    maxAttempts: 2,
    progress: null,
    progressPercent: null,
    progressUnit: 'sections',
    correlationId: 'cor_preview_5',
    error: 'cancelled by the user before the first section was written',
    createdAt: '2026-09-20T06:55:00.000Z',
    updatedAt: '2026-09-20T06:56:02.000Z',
    cancellable: false,
  },
  {
    id: 'job_preview_backtest',
    kind: 'backtest.run',
    status: 'cancelled',
    attempts: 0,
    maxAttempts: 1,
    progress: null,
    progressPercent: null,
    progressUnit: 'bars',
    correlationId: 'cor_preview_6',
    error: null,
    createdAt: '2026-09-18T19:02:00.000Z',
    updatedAt: '2026-09-18T19:02:40.000Z',
    cancellable: false,
  },
];

export const mockActivity: readonly ActivityPreview[] = [
  {
    id: 'evt_preview_1',
    type: 'agent.status',
    source: 'agent',
    at: '2026-09-20T08:16:02.000Z',
    text: 'Agent moved to `thinking` from `idle`.',
    detail: 'A lifecycle transition. The turn is not finished until a summary arrives.',
    correlationId: 'cor_preview_7',
  },
  {
    id: 'evt_preview_2',
    type: 'agent.message',
    source: 'agent',
    at: '2026-09-20T08:16:09.000Z',
    text: 'Answer: risk per trade follows from the stop distance, not from the position size.',
    detail: '1 fact, 1 analysis, 1 uncertainty — chain-of-thought is never emitted.',
    correlationId: 'cor_preview_7',
  },
  {
    id: 'evt_preview_3',
    type: 'job.status',
    source: 'job',
    at: '2026-09-20T08:14:36.000Z',
    text: 'memory.index reported 412/1000 records.',
    detail: 'Progress only; the job is still running.',
    correlationId: 'cor_preview_1',
  },
  {
    id: 'evt_preview_4',
    type: 'training.progress',
    source: 'system',
    at: '2026-09-20T08:05:11.000Z',
    text: 'Lesson 4 of 6 complete in “Position sizing and risk of ruin”.',
    correlationId: 'cor_preview_8',
  },
  {
    id: 'evt_preview_5',
    type: 'system.error',
    source: 'system',
    at: '2026-09-20T07:12:31.000Z',
    text: 'marketData.ingest failed: PROVIDER_UNAVAILABLE.',
    detail: 'Typed code, no stack trace, no provider payload.',
    correlationId: 'cor_preview_4',
  },
];

export const mockNotifications: readonly NotificationPreview[] = [
  {
    id: 'ntf_preview_1',
    level: 'warning',
    title: 'A proposed rule is waiting for your decision',
    body: 'The evaluation finished, but activation needs a recorded human approval. The system cannot adopt its own proposal.',
    at: '2026-09-20T08:00:00.000Z',
  },
  {
    id: 'ntf_preview_2',
    level: 'info',
    title: 'Dataset validated',
    body: '1,284 rows accepted; 12 rejected for a missing timestamp. Rejected rows are listed, never dropped silently.',
    at: '2026-09-20T07:35:00.000Z',
  },
  {
    id: 'ntf_preview_3',
    level: 'danger',
    title: 'Market-data provider unavailable',
    body: 'Ingestion is paused and will retry with backoff. No live data is claimed while it is down.',
    at: '2026-09-20T07:12:40.000Z',
  },
];

export interface JobSummaryPreview {
  total: number;
  running: number;
  queued: number;
  attention: number;
}

/** Counts for the header cards. Computed from the fixtures, never hard-coded. */
export function summariseJobs(jobs: readonly JobPreview[] = mockJobs): JobSummaryPreview {
  return {
    total: jobs.length,
    running: jobs.filter((job) => job.status === 'running').length,
    queued: jobs.filter((job) => job.status === 'queued').length,
    attention: jobs.filter((job) => job.status === 'failed' || job.status === 'dead-letter').length,
  };
}

/** A fixture connection snapshot, so the status control can be reviewed mid-retry. */
export const mockRetryingSnapshot = {
  state: 'reconnecting' as const,
  detail: 'The server is shutting down. Retrying in 0.8s (attempt 2).',
  attempts: 2,
  maxAttempts: 6,
};
