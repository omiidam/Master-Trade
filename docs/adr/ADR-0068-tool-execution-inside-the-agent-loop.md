# ADR-0068 — Tool execution inside the Agent Loop: one budget, honest stops, and the run's own record

- **Status:** Accepted
- **Decision id:** `DEC-AI-20-LOOP-TOOL-EXECUTION`
- **Phase:** Tool Execution & Agent Loop Integration (AI Workplace)
- **Depends on:** ADR-0066 (the loop engine and its four phases), ADR-0067
  (the Tool Registry, the single server-side execution path), ADR-0065 (the
  Run Manager whose vocabulary and durable record the loop's outcome maps
  onto), ADR-0060 (the per-run harness the loop composes per step).

## Context

ADR-0067 gave the loop's tool phase an owner: every requested tool executes
through the registry's gate sequence and its validated outcomes are fed back
as fresh context. What the phase did not yet have was the loop's own
discipline applied _inside_ it. The three limits were checked before each
reasoning step but not between tool invocations, so a slow tool batch could
run past `maxExecutionTimeMs`; cooperative cancellation was polled at phase
boundaries but not between two asks in the same step; a model that asked
for the same tool twice in one step paid for both; and a tool that failed
or timed out was fed back as ordinary context, leaving the run's honest
stopping story — and the Run Manager's durable record — untouched by tool
work entirely. The Workplace could not see which tools a run executed, for
how long, or why one failed.

## Decision (`DEC-AI-20-LOOP-TOOL-EXECUTION`)

Tool steps become first-class citizens of the loop's control, without a
second loop, registry or permission system:

- **One budget across both step kinds.** `maxIterations` bounds reasoning
  steps structurally (a tool phase rides inside its iteration);
  `maxExecutionTimeMs` is now checked before every tool invocation as well
  as before every reasoning step, so tool time spends the same clock;
  `maxOutputTokens` moves only on reasoning steps, where tokens are spent.
- **Honest, immediate stops inside the tool phase.** Cancellation is polled
  between invocations and ends the loop `cancelled` before the next tool
  runs. A tool that fails, times out (including returning output its own
  schema rejects — the registry reports that as `failed`) settles the loop
  as terminal `failed` with a `tool-failure` stop reason naming the tool,
  the status and the error — no further reasoning step is taken. Exhausting
  the time ceiling mid-phase ends the loop `blocked` with the precise
  `time-limit` reason. Refusals (unknown, unpermitted, unapproved,
  duplicate, missing identity) remain _values_ fed back to the model — the
  repeated-step guard bounds a futile re-ask.
- **No duplicate execution within a step.** Identical asks (same tool, same
  arguments) in one step execute once; the duplicate is recorded as a
  `duplicate-request` refusal and never reaches the gateway's result path
  twice.
- **The run records its tool work.** The loop exposes an `onToolRun`
  observation seam — every settled outcome with name, status, duration and
  error detail — and the Run Manager's durable `AgentRunRecord` gains a
  bounded `toolRuns` list plus `recordToolRun`, ownership-checked like every
  other run mutation. A new `runLoop()` driver on the _existing_ Run Manager
  composes the existing loop engine with the existing adapter and registry:
  it maps the loop's terminal outcome onto the run's own vocabulary
  (`completed` / `blocked` with the JSON stop reason / `failed` / `cancelled`)
  and accumulates usage across steps. The single-step `run()` — and the
  `agent.chat` integration built on it — is untouched.

## Consequences

- A loop-driven run cannot hide tool work: what ran, what it cost in time,
  and why anything failed are on the durable record the Workplace already
  reads, with user/run isolation enforced by the same ownership check.
- Limits are now uniform: no phase of a run can spend time, iterations or
  tokens the configuration did not grant it.
- User/run isolation and server-side execution are unchanged: the loop
  still builds the tool context from the run's own user id and correlation
  id, and a run without a user identity still can never execute a tool.
- Out of scope, unchanged: trading actions and external side effects, RAG,
  evaluation, learning, and any persistent tool history — `toolRuns` lives
  with the run record and is bounded, not durable.
