# ADR-0017 — Real-time transport: WebSocket over the existing event bus

- **Status:** Accepted (Phase 3.1, architecture lock `DEC-RT-1-WEBSOCKET`)
- **Date:** 2026-09-19
- **Supersedes:** none

## Context

Phase 2 built `EventBus` in `src/realtime/events.ts` with the security-critical
parts already solved: per-event audiences, denial when the audience is empty,
monotonic sequence numbers, and a bounded replay buffer with `fromSeq` resume.
What remained open was the concrete transport, and the transport must not
re-implement or weaken visibility rules.

Traffic characteristics: streamed agent answer chunks (bursty, high frequency),
tool/lifecycle status (low frequency, security-sensitive), training/exam
progress, job status, notifications, system status, and read-only market-data
ticks. The client also needs to send light control messages (cancel a run,
explicit resync).

## Decision

**A single WebSocket endpoint at `/ws`, served by `@fastify/websocket` on the
same loopback server, fed by the existing `EventBus`.**

- **Authenticate before subscribing.** The socket must present a valid session
  before it is attached to any stream; unauthenticated sockets receive nothing.
- **Authorize per event.** `isVisibleTo()` remains the only visibility rule; an
  empty audience is internal and is never serialized.
- **Ordering and resume.** Monotonic `seq`; the client stores its last processed
  `seq` and reconnects with `fromSeq`. `missingSequences()` lets the client and
  the UI detect a gap, and a `fromSeq` older than the buffer produces an explicit
  resync instruction rather than a silent hole.
- **Liveness.** Server heartbeat at `realtime.heartbeatMs` (15 s) with pong
  timeout; client reconnects with exponential backoff and jitter.
- **Backpressure.** Bounded per-connection send queue; a persistently slow client
  is disconnected (then resumes with `fromSeq`) instead of growing server memory.
  `marketdata.tick` is coalesced per symbol before sending.
- **Desktop path.** The Tauri in-process bridge may deliver the same events
  without TCP, with identical visibility semantics.

## Alternatives rejected

| Alternative            | Why rejected                                                                                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Socket.IO              | Brings its own protocol, rooms and fallback machinery, plus a client dependency — none of it needed on loopback, and it would tempt us to move audience logic out of our bus. |
| Server-Sent Events     | One-way only; we need client → server messages (cancel, resync) and the same endpoint for future interactive controls.                                                        |
| Long polling           | Adds latency to token streaming and multiplies request churn, with no benefit over a loopback socket.                                                                         |
| gRPC streaming         | Heavy for a desktop client, awkward from a WebView, and duplicates the typed-contract approach we already have.                                                               |
| Redis pub/sub          | Introduces a server to a single-process desktop app; there is no multi-process fan-out need.                                                                                  |
| Polling REST endpoints | Cannot express ordering/replay guarantees, and would put audit/tool events on a path the client polls rather than one we control.                                             |

## Consequences

**Positive:** one channel for all live updates; visibility, ordering and replay
logic stay in the tested bus; reconnection is gap-aware; the same code serves the
desktop bridge.

**Negative:** WebSocket lifecycle (heartbeats, half-open sockets, backpressure)
must be implemented and tested; proxies are irrelevant here (loopback) but the
server must still clean up sockets on shutdown.

**Security impact:** positive — authentication precedes subscription, internal
events are never serialized, and the transport grants no capability beyond
receiving events the principal is already entitled to.

## References

- [technology-decisions.md § 6](../technology-decisions.md)
- [jobs-and-realtime.md § 2](../jobs-and-realtime.md)
- [ADR-0007](./ADR-0007-deny-by-default-auth.md), [ADR-0014](./ADR-0014-backend-runtime-fastify.md)
