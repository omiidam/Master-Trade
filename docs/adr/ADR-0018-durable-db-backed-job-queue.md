# ADR-0018 — Background jobs: durable database-backed queue with in-process workers

- **Status:** Accepted (Phase 3.1, architecture lock `DEC-JOBS-1-QUEUE`)
- **Date:** 2026-09-19
- **Supersedes:** none

## Context

Phase 2 defined six job kinds (`training.gradeSession`, `embedding.generate`,
`marketData.ingest`, `backtest.run`, `evaluation.scheduled`,
`maintenance.cleanup`) and an in-process queue with idempotency keys, retry with
backoff, timeout-per-run, dead-lettering and an approval gate for
rule-affecting kinds. What was deferred was the durability model: the queue's
state must outlive a crash or an app restart, because a training record and an
approval-linked backtest must not silently vanish.

The deployment reality is a single desktop process with a SQLite database and no
external infrastructure. Queue work is moderate in volume but occasionally long
(backtests up to 10 minutes), and one kind (`backtest.run`) is
security-sensitive: it cannot run without a recorded human approval.

## Decision

**Keep the queue in the database, run workers in-process, and claim work
atomically with leases.**

- Jobs persist in the `jobs` table with `idempotency_key`, `attempts`, `status`,
  `correlation_id` and last error; `job_scratch` (TTL) holds intermediate state.
- A worker claims work with a single atomic `UPDATE ... WHERE status='queued'`,
  so two workers cannot run the same job.
- Every run holds a lease deadline; a crashed or killed run is returned to
  `queued` when the lease expires rather than sticking in `running` forever.
- Retry uses the shared `RetryPolicy` (exponential backoff with jitter, capped
  delay); retryable codes only — `POLICY_VIOLATION` fails immediately. Exhausted
  attempts land in `dead` with the last error preserved.
- Every run is wrapped in `withTimeout`, so a hung handler cannot block the pool.
- Scheduling (`maintenance.cleanup`, `evaluation.scheduled`) is enqueued by a tick
  using period-scoped idempotency keys, so a duplicated tick cannot double-run a
  period.
- The approval gate is unchanged: `backtest.run` cannot be enqueued without
  `approved: true` derived from a real `ApprovalWorkflow` decision.
- Extraction seam: heavy work can later move to a separate sidecar process on the
  same WAL database, because the boundary is the repository + job-handler
  interface, not the queue implementation.

## Alternatives rejected

| Alternative                        | Why rejected                                                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Redis + BullMQ                     | Requires installing, securing and supervising a second server on every user's desktop (with poor Windows service ergonomics) for a single-process app. |
| Temporal                           | Server plus a workflow programming model far heavier than six job kinds warrant.                                                                       |
| pg-boss / graphile-worker          | Depend on PostgreSQL, which is deferred (ADR-0016) and unnecessary for local mode.                                                                     |
| Cloud queues (SQS/Cloud Tasks)     | Violates the offline-first requirement and adds credentials and cost for local work.                                                                   |
| `node-cron` only                   | Schedules but does not persist, retry, deduplicate or dead-letter — all of which the safety model depends on.                                          |
| In-memory `setInterval` queue      | Loses queued and in-flight work on restart or crash, including approval-linked evaluation jobs. Unacceptable for an audit trail.                       |
| OS scheduler (cron/Task Scheduler) | Platform-specific, invisible to the app's status UI, and cannot carry correlation ids or the approval gate.                                            |

## Consequences

**Positive:** queued and in-flight work survives restarts; job history and
failure reasons are queryable for the activity log; no extra infrastructure;
approval gating remains enforceable and testable.

**Negative:** SQLite's single-writer model means claims and completions serialize
— bounded by low job volume and short transactions; polling (`pollIntervalMs`)
adds a small idle cost, mitigated by an event-driven wake-up on enqueue.

**Security impact:** positive — approval-gated work cannot be auto-enqueued by
automation, dead-lettered failures keep their provenance, and no broker
credentials exist to leak.

## References

- [technology-decisions.md § 7](../technology-decisions.md)
- [jobs-and-realtime.md § 1](../jobs-and-realtime.md)
- [ADR-0002](./ADR-0002-modular-monolith.md), [ADR-0007](./ADR-0007-deny-by-default-auth.md), [ADR-0016](./ADR-0016-persistence-driver-and-orm.md)
