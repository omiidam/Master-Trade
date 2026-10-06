# ADR-0066 — An Agent Loop Engine: bounded multi-step reasoning around the per-run harness

- **Status:** Accepted
- **Decision id:** `DEC-AI-18-AGENT-LOOP-ENGINE`
- **Phase:** Agent Loop Engine (AI Workplace)
- **Depends on:** ADR-0060 (the run harness, one bounded reasoning step, which
  the loop composes per iteration), ADR-0064 (the Context Builder, whose
  delivered-digest seam the loop feeds), ADR-0027 (structured summaries — the
  loop's decision surface, never model prose), ADR-0058 (request scoping and
  extension seams), ADR-0065 (the Run Manager whose terminal vocabulary the
  loop's outcome reuses).

## Context

The harness (ADR-0060) owns exactly one reasoning step: assemble, one call
through the real `AsyncModelAdapter` over the LLM Gateway, respond, dispose.
What nothing owned was the _control_ that turns several such steps into a
loop — deciding whether the work is finished, running the next step if not,
and stopping honestly when it must. Without that owner, a multi-step agent is
either a hard-coded `while` with no limits (a runaway or a retry storm is one
model quirk away) or a single step pretending the world needs one call.

Two failure modes had to be impossible by construction: an **infinite loop**
(a model that always asks for one more step), and a **futile loop** (re-asking
the identical question, where the model sees exactly what it saw last step and
cannot produce new work). And the future had to fit without redesign: tool
calling and retrieval are later phases that must continue a loop with fresh
material, not bolt a second control path onto it.

## Decision (`DEC-AI-18-AGENT-LOOP-ENGINE`)

One **Agent Loop Engine** (`src/agent/agentLoop.ts`) owns the controlled
multi-step loop:

- **Each iteration is the four phases.** Reasoning (one `AgentRunHarness.run`
  — the single entry point for one bounded run, so the gateway is reached
  only through the existing adapter), context update (the digests of every
  context section the step delivered are recorded for the Context Builder's
  `alreadyDeliveredDigests` seam), next-step decision (the structured summary
  is read; an injected decider answers "is the work complete?", defaulting to
  complete when the summary requested no tool work), and completion.
- **An explicit, machine-checked lifecycle:** `idle → reasoning →
context-update → deciding`, looping back to `reasoning` while the work
  continues, with `completed`, `blocked`, `failed` and `cancelled` terminal —
  the same vocabulary the Run Manager publishes, so a loop-driven run maps
  onto run status without translation. A reasoning phase starts exactly when
  a step will actually run.
- **Three configurable limits, all enforced between phases:** `maxIterations`
  (the structural ceiling on steps), `maxExecutionTimeMs` (wall clock, checked
  before each paid step), `maxOutputTokens` (accumulated completion tokens
  across steps). A limit stop is terminal `blocked` with the precise reason —
  never an exception, never a silent truncation.
- **Stop is immediate.** Completion, a step failure, an observed cooperative
  cancellation (`shouldCancel`, also wired into each harness run's hook) and
  limit exhaustion each end the loop at the next phase boundary, and every
  terminal path returns the accumulated statements, the last summary, the
  recorded (never executed) tool requests, the token usage, the per-step
  harness results and the timeline.
- **Identical steps are refused before they run.** The digest of what an
  iteration would show the model (instructions, user input, history, runtime
  context) is compared against every prior iteration; a repeat is terminal
  `blocked` (`repeated-step`) before the gateway is asked — re-asking cannot
  produce new work. Combined with the iteration budget, an infinite or futile
  loop is impossible by construction, not by vigilance.

## Alternatives rejected and why

- **Put the loop inside `AgentRunHarness`:** the harness's contract is _one_
  bounded run, pinned by `DEC-AI-9-RUN-LIFECYCLE` and its tests. Folding loop
  control into it would make one component own two levels of recursion and
  break the pinned contract; the loop composes the harness, as the Run
  Manager does.
- **Let the model decide freely with no ceiling ("loop until the model says
  done"):** a model that never says done is exactly the failure the limits
  exist for. The decider is a seam over the summary contract, and the
  iteration, time and output-token ceilings bound whatever it answers.
- **Detect identical steps only after they run:** the wasted gateway call is
  the cost of the bug; refusing the step before it is paid for is the whole
  point of the guard.
- **Deduplicate by filtering the next iteration's runtime context:** silently
  shrinking what the model sees makes later steps _differ_ from earlier ones
  and defeats the very guard that stops a futile loop; delivered digests are
  recorded and exposed instead, for a later phase that supplies genuinely new
  material.

## Consequences

- Multi-step agent behaviour is now bounded, cancellable, observable and
  honest about why it stopped; the AI Workplace can render iterations, usage
  and the stop reason from one settled result.
- Tool calling and retrieval have their seams and nothing more: a tool step
  continues the loop with fresh context material (new digests pass the guard)
  and records executed work; this phase executes nothing and retrieves
  nothing.
- The harness, the Context Builder and the LLM Gateway are unchanged; the
  loop reaches the model only through the existing adapter over the gateway.
- Deliberately out of scope: tool calling, RAG, persistent memory,
  evaluation, learning, and any mock responses — the loop fabricates nothing.
