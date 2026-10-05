# ADR-0060 — The agent run harness: lifecycle, ephemeral working memory and the three-party contract

- **Status:** Accepted
- **Decision id:** `DEC-AI-9-RUN-LIFECYCLE`, `DEC-AI-10-EPHEMERAL-CONTEXT-RAM`
- **Phase:** Task 1.3 (AI Workplace Agent Harness foundation)
- **Depends on:** ADR-0058 (extension seams, request scoping), ADR-0059
  (training foundation — the same contract-first discipline), ADR-0004 (the
  gateway abstraction), ADR-0007 (deny-by-default authorization).

## Context

The product already had the pieces of an agent run, but they were spread
across callers rather than owned by one component:

- `AgentService` → `Orchestrator.runAsync` → `AsyncModelAdapter` →
  `LlmGateway` was the real request path, and it worked — but nothing
  defined _when_ a run starts, what it is allowed to accumulate, or what
  happens to that accumulation when the run ends.
- Context assembly existed (`assembleContext`) and prompt building existed
  (`buildTurnMessages`), but the boundary between "the caller decides what
  the model sees" and "the harness decides" was implicit.
- There was no per-run working memory at all. Chat history was whatever the
  caller happened to pass, and nothing was isolated: two concurrent runs
  had no structural guarantee of not seeing each other's data.
- Failure handling was per-caller: some paths returned `{status:'blocked'}`,
  some threw, and none had a lifecycle to attribute a failure to a phase.

The next phases — Memory, Tool Calling, Reasoning loops, Evaluation,
Learning — all need a run to attach to. Without a named run object, each
of those phases would invent its own notion of "the current run" and its
own place to put state.

## Decision

**1. The harness owns the run lifecycle (`DEC-AI-9-RUN-LIFECYCLE`).**
`AgentRunHarness.run(input)` is the single entry point for one bounded
run. `AgentRunLifecycle` is a machine-checked state machine —
`pending → assembling → calling-model → responding → completed`, with
`failed` and `cancelled` reachable from the active phases. An illegal
transition throws; a run cannot be left in a non-terminal state; every
terminal state is recorded in a timeline the caller can inspect.

**2. Working memory is ephemeral and per-run (`DEC-AI-10-EPHEMERAL-CONTEXT-RAM`).**
`WorkingMemory` is created inside `run()`, seeded with the caller's chat
history and the current prompt, written to during the run, and disposed in
a `finally` block — on success, failure and cancellation alike. After
disposal every read and write throws. Nothing persists, nothing is shared
between runs, and there is no registry that could leak one run's memory
into another. Persistent memory is a later phase and gets its own
contract; it must not be smuggled in through this one.

**3. The harness assembles four things, and only four.**
`assemble()` composes: system instructions (source `instructions`,
priority 100, never dropped), current chat history (source
`conversation`, from this run's memory, oldest first, current prompt
last), the user prompt (passed to the adapter as `userInput`), and
relevant runtime context (supplied by the caller as `ContextSection`s).
Assembly runs through the existing `assembleContext`, so the token
budget, the priority ordering and the "instructions are never dropped"
rule are the ones the product already enforces. The harness performs **no
retrieval** — runtime context is the caller's, which is what keeps RAG
out of this phase.

**4. Three parties, three contracts, one direction.**

- **Harness → Context Builder:** `AgentRunInput` in,
  `HarnessAssembly` out (instructions, history, user prompt, kept
  sections, dropped section ids, estimated tokens). Assembly is pure:
  same input, same assembly.
- **Context Builder → LLM Gateway:** the harness calls the existing
  `AsyncModelAdapter.completeTurn` with `{correlationId, userId?,
userInput, instructions, context, responseLanguage?, responseStyle?}`
  and receives a `ModelTurn`. The adapter is the only thing that touches
  `LlmGateway`; the harness never speaks to a provider, never builds an
  HTTP body, and never fabricates an answer. The real gateway is
  preserved, not re-implemented.
- **Harness → caller:** `AgentRunResult` — run id, correlation id,
  terminal status, the turn (when completed), tool requests the model
  made (recorded, never executed), the failure (phase + message, when
  failed), the assembly the model saw, the lifecycle timeline and the
  duration.

**5. Failure is a state, not an exception.**
A thrown hook, a provider error, or a contract violation inside the
adapter becomes `status: 'failed'` with `failure.phase` naming where it
surfaced (`assembling`, `calling-model` or `responding`) and the message
carried verbatim. The working memory is still disposed, the timeline
still records the path, and `onRunFailure` still fires. A caller never
has to guess whether a run died before or after the model call.

**6. The later phases get observation points, not hooks into behavior.**
`HarnessRuntimeHooks` exposes `beforeModelCall`, `afterTurn`,
`onRunFailure` and a cooperative `shouldCancel`. Every hook is optional
and observational: a hook may read what the harness produced and may
cancel the run, but it cannot rewrite the assembly or supply an answer.
Memory, Evaluation and Learning attach here; Tool Calling attaches to
the `responding` phase later; Reasoning loops remain the `AgentLoop`
seam from ADR-0058 and are untouched by this ADR.

## Alternatives rejected, and why

- **Put run state on the orchestrator.** The orchestrator is a
  long-lived singleton with one `AgentLifecycle`; concurrent runs would
  share it. A per-run object with its own lifecycle is the only shape
  that makes isolation structural rather than conventional.
- **Keep working memory in the caller.** Then every caller decides its
  own isolation rules, and the first one to reuse a buffer leaks history
  across users. The harness owns it precisely so no caller can.
- **Make working memory persistent ("we'll need it later").** Persistence
  without a retention policy, a user scope and a deletion story is a
  privacy incident with a nice name. It is a later phase with its own
  contract; the ephemeral version is a strict subset of that design.
- **Let the harness call `LlmGateway` directly.** That would duplicate
  the adapter's contract enforcement (the structured-summary gate) and
  give the harness a second path to the provider. Routing through the
  existing adapter keeps exactly one way to reach the gateway.
- **Auto-execute the tool requests the model returns.** Tool execution
  is an authorization decision that belongs to the orchestrator with its
  permission check; a harness that ran tools would be a second, weaker
  gate. The harness records `toolRequests` and hands them back.
- **Add a mock adapter for tests inside `src/`.** The suite uses the
  existing offline adapters (`scriptedAsyncModelAdapter`, or the real
  gateway over a fake HTTP endpoint); no new mock lives in production
  code.

## Consequences

- **Every later phase has a run to attach to.** Memory, Tool, Reasoning,
  Evaluation and Learning extend `HarnessRuntimeHooks` or consume
  `AgentRunResult` — none of them needs to change the harness's core.
- **Isolation is testable and tested.** Two runs see only their own
  history; disposed memory refuses reads and writes; a failed run still
  disposes.
- **The gateway is untouched.** No file under `src/llm` changed; the
  harness reaches the provider only through `AsyncModelAdapter`, and the
  real-gateway test drives `LlmGateway` end to end over a fake HTTP
  endpoint.
- **Failures are attributable.** The phase in `AgentRunFailure` is the
  difference between "the model said something we refuse" and "we could
  not build a prompt", and it is recorded rather than inferred.
- **The decisions are locked.** Both ids are recorded in
  `src/core/architectureLock.ts` and quoted in
  `docs/technology-decisions.md`, so documentation drift stays
  machine-checked.
