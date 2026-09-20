/**
 * Background jobs — public surface.
 *
 * `store.ts` (where a job lives) and `queue.ts` (what happens to it) are separate
 * so the durability question has exactly one answer per deployment: an in-memory
 * store when no database handle is open, the `jobs` table when there is one.
 */

export {
  DEFAULT_LEASE_MS,
  InMemoryJobStore,
  type ClaimOptions,
  type EnqueueStoreInput,
  type JobProgress,
  type JobRecord,
  type JobStore,
} from '../../packages/shared/src/jobs/store.js';
export {
  JOB_DEFINITIONS,
  JobQueue,
  assertJobDefinitions,
  type EnqueueInput,
  type JobDefinition,
  type JobHandler,
  type JobHandlerContext,
  type JobObservers,
  type JobQueueOptions,
  type JobQueueStatus,
  type JobStatusEvent,
} from '../../packages/shared/src/jobs/queue.js';
export { JobWorkerPool, type WorkerPoolOptions, type WorkerPoolSnapshot } from './worker.js';
export { SqliteJobStore } from './sqliteStore.js';
export {
  JobService,
  type EnqueueRequest,
  type JobAuditSink,
  type JobEventSink,
  type JobServiceOptions,
  type JobView,
} from '../../packages/shared/src/jobs/service.js';
export {
  HARDLINE_JOB_PATTERN,
  JOB_KINDS,
  JOB_STATUSES,
  TERMINAL_JOB_STATUSES,
  isJobKind,
  isTerminal,
  type JobKind,
  type JobStatus,
} from '../../packages/shared/src/jobs/vocabulary.js';
