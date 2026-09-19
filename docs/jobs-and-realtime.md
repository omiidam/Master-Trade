# Background Jobs & WebSocket Layer

## 1. Background jobs

Implemented in `src/jobs/queue.ts`.

### Job kinds

| Kind                    | Purpose                                                   | Attempts | Timeout | Approval |
| ----------------------- | --------------------------------------------------------- | -------- | ------- | -------- |
| `training.gradeSession` | grade a completed training/exam session deterministically | 3        | 30 s    | no       |
| `embedding.generate`    | embed memory records that lack vectors                    | 3        | 60 s    | no       |
| `marketData.ingest`     | fetch, validate, store provider bars                      | 4        | 120 s   | no       |
| `backtest.run`          | deterministic backtest for a proposed rule                | 1        | 600 s   | **yes**  |
| `evaluation.scheduled`  | run the invariant evaluation harness                      | 2        | 120 s   | no       |
| `maintenance.cleanup`   | purge sessions, scratch, stale buffers                    | 2        | 30 s    | no       |

### Architecture

```
producer (API handler / scheduler) → JobQueue.enqueue
     └─ approval gate    (requiresApproval kinds refuse unapproved enqueue)
     └─ idempotency      (prefix + key → existing job returned, no duplicate)
     └─ queued ──► running ──► succeeded
                       │
                       ├─ failure & attempts < max ──► queued after backoff
                       └─ failure & attempts = max ──► dead (error recorded)
```

`JobQueue.runOnce()` processes every runnable job exactly once; the worker loop
(`config.jobs.pollIntervalMs`, `concurrency`) is deferred to Phase 3. Jobs are
persisted in the `jobs` table; `job_scratch` holds intermediate state with a TTL.

### Retry, timeout and failure policy

- Retry policy comes from the job definition (`maxAttempts`, exponential backoff
  with jitter, capped by `maxDelayMs`) using the shared primitives in
  `src/core/retry.ts`.
- Only `RETRYABLE_CODES` are retried; a `POLICY_VIOLATION` fails immediately.
- Every run is wrapped in `withTimeout`, so a hung handler becomes a `TIMEOUT`
  failure rather than a stuck queue.
- Dead-lettered jobs keep their last error and full attempt count.

### Idempotency and status

Every enqueue carries an `idempotencyKey` (`<prefix>:<entity id>`). Re-enqueuing
the same key returns the existing record — this is what makes retries from the
API layer and job re-runs safe. `list({kind,status})`, `get(id)` and `cancel(id)`
back the job-status UI, which consumes `JobStatusView`.

### Approval gating

`backtest.run` (and any future rule-affecting job) cannot be enqueued without
`approved: true`, which the API layer may only set after the
`ApprovalWorkflow` reports a real approval. Automation therefore cannot
self-authorize evaluation of a trading rule.

## 2. WebSocket / real-time layer

Implemented in `src/realtime/events.ts`. It is transport-agnostic: the same bus
serves a WebSocket server today and the in-process bridge in the desktop shell.

### Event catalogue and audiences

| Event               | Default audience       | Notes                          |
| ------------------- | ---------------------- | ------------------------------ |
| `agent.message`     | owner, coach, student  | streamed answer chunks         |
| `agent.tool`        | owner, coach           | tool call + result, provenance |
| `agent.status`      | owner, coach, student  | lifecycle transitions          |
| `training.progress` | owner, coach, student  | lesson completion              |
| `exam.progress`     | owner, coach, student  | grading progress               |
| `marketdata.tick`   | all roles              | read-only data updates         |
| `job.status`        | owner, coach           | queue state changes            |
| `notification`      | owner, coach, student  | user-facing notices            |
| `system.status`     | owner, coach, observer | provider/budget/safety status  |
| `audit.record`      | owner                  | internal by default            |

### Authorization

`isVisibleTo(event, principal, now)` requires: an authenticated principal, a
non-expired session, a **non-empty** audience (empty = internal, never sent) and
a role intersection. Unauthorized events are never written to the socket — they
are not filtered client-side.

### Ordering, reconnection, replay

- Every event gets a monotonic `seq`; `assertOrdered()` and `missingSequences()`
  give the client and tests a way to prove gap-free delivery.
- The bus keeps a bounded replay buffer (`replayBufferSize`, default 500).
  `subscribe(principal, handler, {fromSeq})` replays everything the principal may
  see after that sequence **before** live events, so a reconnect resumes without
  gaps.
- Sequence numbers are per-bus; a client stores the last `seq` it processed and
  reconnects with `fromSeq = lastSeq`.

### Not exposing internal events

- `audit.record` and `agent.tool` default to owner/coach audiences.
- Payloads carry ids and summaries, not raw provider payloads or secrets.
- Redaction happens before logging; real-time payloads are constructed from
  already-safe view models.
