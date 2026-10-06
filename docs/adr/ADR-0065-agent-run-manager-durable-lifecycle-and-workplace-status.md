# ADR-0065 — An Agent Run Manager: the durable run lifecycle and the Workplace's window into it

- **Status:** Accepted
- **Decision id:** `DEC-AI-17-AGENT-RUN-MANAGER`
- **Phase:** Agent Run Manager (AI Workplace)
- **Depends on:** ADR-0060 (the run harness, whose executions this registers and
  observes), ADR-0058 (request scoping — the run carries an opaque `userId`),
  ADR-0062 (memory scoping — cross-user reads throw, never filter), ADR-0032
  (versioned event contracts — run status rides the existing bus), ADR-0018
  (the durability discipline this phase respects without yet persisting).

## Context

The run harness (ADR-0060) owns one bounded execution. What no component owned
was the run _as an object_: there was no registry a caller could ask "what is
running, what finished, what did it cost, what failed", no lifecycle the AI
Workplace could render, and no way to ask a run to stop. Each of those gaps was
small while runs were one-shot; the Workplace making runs visible makes them
product surface, and an invisible or unstoppable run is not acceptable surface.

The harness's own lifecycle (`pending → assembling → calling-model →
responding → completed`) is the _executor's_ vocabulary. The Workplace needs
its own: states it can render and disable controls against, at a granularity
that survives the phases to come (tool calls that wait, answers that validate).

## Decision (`DEC-AI-17-AGENT-RUN-MANAGER`)

One **Agent Run Manager** (`src/agent/runManager.ts`) owns the durable run
lifecycle:

- **Unique identity per run.** Every run is registered at creation with an id
  minted by the injected id factory. The id is the run's identity everywhere —
  record, status events and the result the caller receives are the same id.
- **An explicit, machine-checked state machine** at the Workplace's
  granularity: `idle → running → (waiting-tool → running |) validating →
responding → completed`, with `blocked`, `failed` and `cancelled` as the
  other terminal states. An illegal transition throws; a terminal state
  accepts nothing. `waiting-tool` and `validating` are defined and checked
  now, driven by the phase that implements tools — this phase does not
  implement tool calling.
- **The record outlives the execution.** Start and end times, duration, the
  model, accumulated token usage (prompt, completion, total, cost) and the
  error with the phase it surfaced in are tracked per run. Records are
  bounded per user (oldest _terminal_ run evicted; an active run is never
  evicted), so the registry cannot grow without bound.
- **Cancellation is cooperative.** `cancel()` marks the request; the
  executing driver polls `shouldCancel` between phases (the harness hook is
  wired to it) and the run ends `cancelled` when the driver observes it — a
  run is never marked cancelled while it is still writing. An `idle` run is
  cancelled immediately; a terminal run answers `false`.
- **Run/user isolation.** Every record carries the opaque `userId` of the
  principal that started it. Read, list, transition, cancel and subscribe
  are owner-checked; a cross-user read throws (`PolicyViolationError`),
  exactly the memory-scoping discipline, never a quiet filter.
- **Status exposure over the existing bus.** Every transition is announced to
  an injected notifier; the server injects one that publishes `agent.status`
  events on the existing `EventBus` — the same contracts, audiences, sequence
  numbers and replay the Workplace already consumes. No second channel is
  invented. Each conversation turn served by `agent.chat` is tracked as a
  run, so a blocked refusal is a terminal `blocked` run, not a missing one.
- **The gateway is untouched.** Model work is reached only through the
  caller-supplied `AsyncModelAdapter` over the existing `LlmGateway`
  (`DEC-AI-2-GATEWAY`); the manager composes the harness per run and never
  speaks to a provider, so there is no second gateway.

## Alternatives rejected and why

- **Extend `AgentRunHarness`'s own lifecycle to the finer states:** the
  harness's states are its execution phases, pinned by tests and by
  `DEC-AI-9-RUN-LIFECYCLE`. Folding the Workplace vocabulary into them would
  make one machine serve two masters and break the pinned contract for no
  gain — the manager maps, it does not replace.
- **Persist runs in the database now:** durability across restarts is a
  store obligation (the `DEC-JOBS-2-STORE` lesson), and nothing consumes a
  restarted run yet. The registry is in-process and bounded; a store behind
  the same shape is the resume/retry phase's work, not smuggled in here.
- **A dedicated WebSocket channel for run status:** the bus already owns
  audience filtering, ordering and replay (ADR-0032). A second channel
  would re-implement the hard parts and split the client's model.
- **Immediate cancellation that force-ends the run:** cancelling a run while
  its driver is mid-write makes state that claims to be terminal while work
  continues. Cooperative cancellation is the only honest option, and the
  harness's `shouldCancel` hook is exactly that seam.

## Consequences

- The AI Workplace can render every run's state, duration, model, cost and
  failure in real time, over the transport it already speaks, and can only
  ever see its own runs.
- Every run terminates in exactly one terminal state — `completed`,
  `blocked`, `failed` or `cancelled` — so a run cannot hang invisibly.
- `waiting-tool`, `validating`, streaming, tracing and resume/retry are
  shaped for but not implemented: the states are machine-checked, the
  transitions are timestamped and announced, and a later phase drives them
  without changing this contract.
- Deliberately out of scope: tool calling, persistent memory, evaluation,
  learning — none of them touched here.
