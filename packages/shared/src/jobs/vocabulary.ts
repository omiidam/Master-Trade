/**
 * Job vocabulary — one status list and one kind list, in one place.
 *
 * Phase 2 had two vocabularies: the in-memory queue said `dead`, the database
 * said `dead-letter`. Two words for one state is a bug waiting for a mapping
 * table, so `dead-letter` — the spelling the schema's CHECK constraint uses, and
 * therefore the one that cannot be changed without a migration — is now the only
 * spelling. The database is the arbiter because it is the layer that rejects.
 *
 * The lifecycle, matching the schema and the UI:
 *
 *   queued ──▶ running ──▶ succeeded
 *                 │           (terminal)
 *                 ├──▶ failed ──▶ queued (retry, with backoff)
 *                 │           └──▶ dead-letter (attempt budget spent)
 *                 ├──▶ cancelled
 *   queued ─────────────▶ cancelled
 *
 * `failed` is a *transient* state in the store: a failure either schedules a
 * retry (`queued`) or exhausts the budget (`dead-letter`). It is in the
 * vocabulary because a job's last error must be reportable without pretending the
 * job is still queued.
 */

export const JOB_STATUSES = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'dead-letter',
  'cancelled',
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

/** Statuses from which nothing else happens. */
export const TERMINAL_JOB_STATUSES: readonly JobStatus[] = [
  'succeeded',
  'dead-letter',
  'cancelled',
];

export function isTerminal(status: JobStatus): boolean {
  return TERMINAL_JOB_STATUSES.includes(status);
}

/**
 * Job kinds. Every kind names the operation it requires, so enqueueing is
 * authorized by the same catalogue that authorizes an HTTP request.
 */
export const JOB_KINDS = [
  'training.gradeSession',
  'training.progress',
  'backtest.run',
  'dataset.process',
  'embedding.generate',
  'memory.index',
  'marketData.ingest',
  'report.generate',
  'evaluation.scheduled',
  'maintenance.cleanup',
] as const;

export type JobKind = (typeof JOB_KINDS)[number];

export function isJobKind(value: unknown): value is JobKind {
  return typeof value === 'string' && (JOB_KINDS as readonly string[]).includes(value);
}

/**
 * Job kinds that would move money or touch a broker. There are none, and the
 * list exists so that a future addition has to be a deliberate, visible act.
 * Enforced by `assertJobDefinitions()`.
 */
export const HARDLINE_JOB_PATTERN =
  /(order|trade|broker|live[-_.]?(trade|order)|execute|withdraw|deposit|position[-_.]?send)/i;
