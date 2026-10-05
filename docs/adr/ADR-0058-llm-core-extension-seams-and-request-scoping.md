# ADR-0058 — LLM core architecture: extension seams and the scoped request

- **Status:** Accepted
- **Decision id:** `DEC-AI-4-EXTENSION-SEAMS`, `DEC-AI-5-REQUEST-SCOPING`
- **Phase:** Task 1.1 (LLM Core Architecture)
- **Depends on:** ADR-0004 (the LLM gateway abstraction), ADR-0019 (adapters,
  not frameworks), ADR-0026 (cost from our own price table), ADR-0027
  (structured summaries, not chain-of-thought), ADR-0007 (deny-by-default
  authorization).

## Context

Phase 3.5 established the LLM layer the product runs on: one `LlmGateway`
as the single entry point, typed request/response contracts, provider logic
confined to `src/llm/providers/`, and three auditable contracts (what the
model may return, what it may see, what a call is allowed to cost). Two gaps
remained before the next phase of work could start.

1. **A request had no user scope.** The only identity on `LlmRequest` and
   `LlmCompletionInput` was a correlation id. Usage, budget and audit could
   therefore not be attributed to the authenticated user. The tempting fix —
   passing the `Principal` down — would have leaked authorization, roles and
   session material into a layer that must never exercise any of them.
2. **The future capabilities had no seams.** Prompt engine, context builder,
   agent loops, tool calling, evaluation and training were all named as
   deferred, but nothing in the code said where each one would attach. The
   next phase would have had to widen existing interfaces or invent coupling
   — and an "implemented later" capability that is half-wired today is how
   the tool-execution boundary gets eroded.

## Decision

**1. Every completion request carries a user scope, never a principal.**
`LlmRequestScope` (`src/llm/provider.ts`) is `{ correlationId, userId? }`
and is extended by both `LlmRequest` and `LlmCompletionInput`. `userId` is
an opaque identifier set by the caller that already authenticated the
principal. It is threaded `AgentService.runAsync` → `Orchestrator.runAsync`
→ `AsyncModelAdapter.completeTurn` → `LlmGateway.complete` → `LlmRequest`.
The LLM layer receives the identifier and nothing else — no `Principal`, no
roles, no credentials, no permissions — so it can attribute and audit
requests without gaining authorization power of its own. Adapters choose
what, if anything, the transport sees; today nothing is serialized, and the
provider payload builders construct their bodies field by field.

**2. The six future capabilities are type-only seams.**
`src/llm/extensionPoints.ts` names them — `PromptEngine`, `ContextBuilder`,
`AgentLoop`, `ToolCalling`, `Evaluator`, `Trainer` — collected in
`LlmExtensionPoints`. They are contracts only: no implementation, no default
behavior, no wiring. Until a phase consumes a seam, the `LlmGateway` stays
the single entry point for every LLM request, exactly as before.

**3. The seams encode the invariants, not just the shapes.**

- Nothing executes. `ToolCalling` separates `authorize` from `execute`, and
  `execute` is only reachable for a call `authorize` allowed. `AgentLoop`
  routes every tool step through the `ToolCalling` seam and is bounded by a
  hard `maxTurns` — a loop cannot execute a tool itself.
- Nothing is trusted. Every seam input extends `LlmRequestScope`, so no seam
  can see a principal, a credential or a permission.
- Nothing bypasses a contract. Prompt composition feeds the same
  `LlmMessage` path, and outputs remain subject to the structured-summary
  contract in `summary.ts`.
- `src/llm` still must not depend on `src/agent`: the context seam uses a
  local structural type (`PromptContextSection`) that the orchestrator's
  `ContextSection` already satisfies.

## Alternatives rejected, and why

- **Pass the `Principal` (or roles) into the LLM layer.** It gives the LLM
  layer authorization power it must never exercise, and every future seam —
  prompt engine, agent loop, evaluator — would then see permissions it has no
  business reasoning about. The deny-by-default boundary between "the model
  asks" and "the product allows" would blur at exactly the point where it is
  cheapest to keep it sharp.
- **Put the seams on the gateway as optional fields.** The gateway is
  asserted by test to hold no `ToolRegistry` and to expose no execution
  method. Seams are consumed by future components, not by the gateway;
  keeping them off the gateway keeps that assertion true by construction.
- **Implement minimal versions of the seams now ("just a stub").** A stub is
  mock behavior, and an unwired type cannot drift from an implementation that
  does not exist. The task is the architecture layer; the seams are the
  deliverable.
- **One generic "extension hook" interface.** An opaque hook hides what each
  capability needs and weakens the invariants — six named seams each carry
  their own boundary rules, and a reviewer can check each one.
- **Define the context seam in terms of the orchestrator's `ContextSection`.**
  That would make `src/llm` depend on `src/agent` and reverse the dependency
  direction the layer has always kept. A local structural type preserves it.

## Consequences

- **Attribution without authorization.** Usage, budget and audit can now be
  attributed per user; the LLM layer still cannot do anything with the
  identifier beyond recording it, and nothing about it is transmitted today.
- **The next phase starts from contracts.** Implementing a capability means
  implementing one seam and installing it — not re-editing the core, and not
  re-litigating the tool-execution boundary.
- **The gateway's test assertions are unaffected.** The seams are compile-time
  only; `Object.keys(gateway)` still has no `tools`, and the gateway still
  exposes no execution method.
- **The decisions are locked.** Both ids are recorded in
  `src/core/architectureLock.ts` and quoted in `docs/technology-decisions.md`
  (§0 and §4.6–§4.7), so documentation drift is machine-checked.
