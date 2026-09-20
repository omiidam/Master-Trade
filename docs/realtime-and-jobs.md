# Real-time events and background jobs (Phase 3.7)

Two capabilities that share one property: **they report work the user did not do
synchronously**. That makes both of them places where a system can quietly lie — an
event stream that drops a message, a progress bar that never moves, a queue that
loses a job on restart. This document describes what was built, and for each promise,
where it is enforced.

```
                       ┌──────────────────────────────────────────┐
   publisher ─────────▶│ EventBus   (audience, seq, replay ring)  │
   (agent, jobs,       │ validate → deny-by-default delivery      │
    system)            └───────────────┬──────────────────────────┘
                                       │ only events with an audience
                                       ▼
                       ┌──────────────────────────────────────────┐
                       │ RealtimeHub   sessions, subscriptions,   │
                       │ heartbeat, rate limit, backpressure      │
                       └───────────────┬──────────────────────────┘
                                       │ frames over /ws
   browser client ─────────────────────┴──────────────────────────▶
   (web/src/realtime/client.ts)  auth+subscribe in one frame, validate,
                                 dedupe by seq, backoff, heartbeat liveness

   JobService ──▶ JobQueue (authorize, timeout, cancel, retry, progress)
                     │
                     └──▶ JobStore port ──┬── InMemoryJobStore (tests, no DB open)
                                          └── SqliteJobStore ── `jobs` table + `job_scratch`
                     │
                     └──▶ JobWorkerPool (per-kind concurrency, lease renewal, drain)
```

## 1. Event contracts

`src/realtime/contracts.ts` is the single registry. Each type declares:

| Field           | Why it cannot be inferred                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| `payloadSchema` | strict Zod; a payload that fails is refused **before** the bus, so no subscriber defends against an unknown shape |
| `schemaVersion` | travels with the event; a consumer refuses a version it cannot read                                               |
| `audience`      | roles that may receive it; **empty means internal**                                                               |
| `internal`      | an internal event is never serialized to a client, whatever is subscribed                                         |
| `publishers`    | who may emit it; a module cannot forge `job.status` or `audit.record`                                             |

Two checks no schema can express run alongside: payload size is bounded
(`MAX_EVENT_PAYLOAD_BYTES`) and any key shaped like a credential is refused —
**refused, not filtered**, because a silently-removed field is a field a caller will
believe was delivered.

Deliveries are counted. `PublishReceipt` reports `delivered` and `dropped` with
reasons per subscriber, so "the client did not see it" is answerable.

## 2. WebSocket transport

`src/realtime/ws.ts` mounts `/ws` and applies the **same gates an HTTP request
passes**, in an order where each step assumes the previous:

1. access policy — loopback only, plus the per-launch shell token when configured;
2. protocol version — `mt.rt.v1` subprotocol, refused rather than negotiated down;
3. authentication — a bearer token when the client can set an `Authorization`
   header, otherwise the **first frame** within a deadline.

The token is in the body, not the URL and not a cookie: a query string ends up in
logs and terminal history (ADR-0022), and a browser cannot set a header on a
`WebSocket`.

Registration order is load-bearing and was a real defect during development: the
route is registered inside a plugin that first awaits `@fastify/websocket`, because
the plugin adds the `onRoute` hook that understands `websocket: true`. A route
registered before that hook exists compiles as an ordinary HTTP route and the
upgrade never happens — the client simply hangs.

Close codes are application-range and meaningful to a reconnecting client:
`4001` credential rejected, `4002` protocol violation, `4004` subscription refused,
`4009` rate limited, `4010` backpressure, `4011` too many connections.

## 3. Client

`web/src/realtime/client.ts` is framework-free: React renders its state, it does not
implement it. That is what makes `tests/realtime-client.test.ts` possible with an
injected socket and injected timers — no DOM, no real waiting.

It enforces, in its own words:

- **Auth + subscription in one frame.** The subscription rides with the token so the
  server replays into the right subscription set; a client that subscribed after
  authenticating would miss the replay it just asked for.
- **Validate everything.** Envelope, then payload contract, then the internal-event
  check. Invalid, unknown and internal events are counted and dropped.
- **Stale events are dropped by sequence.** A duplicate or an older event cannot
  make the feed run backwards.
- **Reconnect only when it can help.** `web/src/realtime/client.ts` defines its own
  terminal set. It deliberately does **not** reuse the protocol module's
  `shouldReconnect`, which answers the _server's_ question and treats `1001 going
away` as final — a server restarting is the one case where a client should retry.
- **Heartbeat liveness.** A socket that is open but silent is not a working stream.
- **Replay gaps are admitted.** If the server's buffer no longer covers the resume
  point, the client records the gap instead of continuing from a counter that looks
  continuous.

## 4. Jobs

`src/jobs/queue.ts` holds the definitions and the engine; `src/jobs/store.ts` is the
port. Every guarantee is tied to a store operation rather than to process memory:

| Guarantee     | Where it lives                                                                                                                                      |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Idempotency   | `<prefix>:<caller suffix>` key, enforced by a UNIQUE constraint in the durable store                                                                |
| Authorization | each kind names its operation; `enqueue` refuses without it                                                                                         |
| Approval gate | `requiresApproval` kinds refuse without a recorded `approvalId`                                                                                     |
| Timeout       | a deadline per kind; overrunning aborts the handler into the normal retry path                                                                      |
| Cancellation  | the row's **status** — so it works across processes and survives a restart                                                                          |
| Retry         | retryable failures return to `queued` with backoff; non-retryable ones dead-letter immediately (routing them through `fail` would be a retry storm) |
| Progress      | coarse `current/total/label`, never a status change                                                                                                 |
| Lease         | claimed with a deadline, renewed while running, reclaimed when a worker dies                                                                        |

`assertJobDefinitions()` refuses a catalogue with a kind that looks like trade
execution (`HARDLINE_JOB_PATTERN`), a kind without an operation, or a kind outside
the vocabulary.

### Persistence (local-first)

`SqliteJobStore` makes "jobs survive a restart" true rather than aspirational, and it
is deliberately thin: the atomic claim, the lease and the UNIQUE idempotency key
already existed in `PlatformRepository`. It adds two things:

- **progress without a schema change** — progress is intermediate state, so it goes
  to `job_scratch` (TTL'd, purgeable). If scratch is dropped, the job record survives
  and the UI says "no progress reported", which is truthful, instead of showing a bar
  frozen at whatever number was persisted;
- **one status vocabulary**, the repository's `dead-letter` spelling.

Postgres is the same port over the same table; Redis/BullMQ would be a third
implementation of `JobStore`, not a requirement for local use (ADR-0033).

### Worker pool

Per-kind concurrency from the definitions (a heavy deterministic run is `1` on
purpose), lease renewal, reclaim of expired leases, and `stop()` that drains rather
than aborts and returns how many were still running. `settle()` waits for in-flight
handlers without stopping the pool — that is how a test observes _completion_ rather
than _start_.

## 5. API surface

| Route                         | Operation    | Notes                                |
| ----------------------------- | ------------ | ------------------------------------ |
| `GET /v1/jobs`                | `job.read`   | list + queue summary                 |
| `GET /v1/jobs/:jobId`         | `job.read`   | one job with progress and last error |
| `POST /v1/jobs/:jobId/cancel` | `job.cancel` | audit-recorded, optional reason      |

There is deliberately **no `POST /v1/jobs`**: a client may watch and cancel work;
enqueueing stays a server-side act with its own operation and approval gate.
`JobService` repeats the authorization check the route already made, because the
service is also reachable in-process from the agent and the worker pool.

Both `job.enqueued` and `job.cancelled` write an audit row. The _keys_ of a job
payload are recorded; never its values, which can hold user content.

## 6. Frontend

- `web/src/api/client.ts` — typed HTTP client for the job routes. Credentials in
  headers, never a URL; every failure becomes an `ApiError` carrying the server's own
  code, and there is no order route to call.
- `web/src/realtime/session.ts` — resolves the endpoint and credentials, or returns
  **why there is none**. In a browser there is no sidecar and no keychain, so it
  reports `not-in-shell` with an action rather than opening an anonymous socket.
- `web/src/realtime/store.ts` — Zustand: the connection, a bounded feed derived from
  events, the job list from the API, and client-raised notices (dropped frames, replay
  gaps) beside server ones.
- `web/src/components/realtime/*` — `ConnectionStatus`, `JobProgressIndicator`,
  `JobStatusCard`, `CancelTaskControl`, `RetryState`, `AgentActivityFeed`,
  `BackgroundTaskPanel`, `RealtimeNotification`.
- `web/src/pages/ActivityPage.tsx` — the surface, wired into navigation as **Activity**.

The preview fixtures in `web/src/mock/realtime.ts` are rendered _only_ while the
stream is not live, in panels that say so, under the same `PREVIEW_FIXTURE` code the
error surfaces use. Nothing routes a fixture into the live store.

## 7. Known limitations

1. **A WebView cannot present the shell token on a socket upgrade.** The access policy
   reads upgrade headers, and a browser `WebSocket` cannot set them. Until the socket
   is opened from Rust, streaming inside a token-gated sidecar needs either an
   exception scoped to loopback + session, or the shell doing the connecting. Tracked
   in `docs/risks-and-deferred.md`.
2. **No session is issued yet.** Sessions exist and are verified; the login/local
   issuance slice that hands one to the shell has not landed, so the Activity page
   reports `no-session` rather than connecting.
3. **No enqueue route, by design**, and no job handler ships for `backtest.run`
   yet — the kind exists with its approval gate and no implementation, which is
   honest: a capability that does not exist does not run.
4. **Streaming LLM output** is not wired to the event stream; a turn is one
   structured summary, so `agent.message` arrives whole.
