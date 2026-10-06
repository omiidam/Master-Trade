# ADR-0064 — A centralized Context Builder between the harness and the gateway

- **Status:** Accepted
- **Decision id:** `DEC-AI-16-CONTEXT-BUILDER`
- **Phase:** Context Assembly layer (AI Workplace)
- **Depends on:** ADR-0004 (the gateway abstraction), ADR-0058 (request scoping),
  ADR-0060 (the run harness, whose assembly step this centralizes), ADR-0061
  (the prompt engine, whose five layers this mirrors at assembly time),
  ADR-0026 (cost from our own accounting — token budgets are the same honesty
  at input scale).

## Context

Assembly of what the model sees was ad-hoc at each call site. The run harness
inlined its own section list, and three duplications had grown into it:

1. **The question travelled twice.** The current user input was recorded into
   the run's working memory before assembly, so the chat-history section ended
   with it — and the prompt path also rendered it as the question.
2. **The instruction set travelled twice.** The harness passed the instruction
   text as a context section _and_ the prompt path rendered the same text into
   the system message, at full token cost each time.
3. **Nothing validated size before the request.** A budget existed, but the
   total actually sent was never checked against it, and a caller could hand
   the prompt path any material at all.

Each duplication is paid on every call of every run, and a multi-step loop
(a future phase) would have compounded all three.

## Decision (`DEC-AI-16-CONTEXT-BUILDER`)

One centralized **Context Builder** (`src/agent/contextBuilder.ts`) owns
assembly for every LLM call the harness makes:

- **Five separated layers, in priority order** — `system-instructions` (never
  dropped, priority 100), `agent-policies` (never dropped, priority 95,
  defaulting to the product's operating rules and accounted together with the
  output contract the prompt path appends), `runtime` (droppable,
  per-section priority), `conversation` (droppable, oldest turns first, as a
  contiguous prefix so the history never grows holes), and `user-input`
  (never dropped, never truncated — oversized input is a refusal). The layer
  order is the drop order: under pressure, conversation goes before runtime,
  and the safety text never goes at all.
- **Configurable budgets** — `maxContextTokens`, `reserveForResponse`, and
  per-layer caps (`maxRuntimeTokens`, `maxConversationTokens`), settable on
  the builder instance and per call. The builder validates the assembled
  total against the usable budget before returning: a budget that cannot fit
  the never-dropped layers is an `INTERNAL` refusal, not a silent truncation
  of the safety policy.
- **Duplication is refused, not tolerated.** Sections are deduplicated within
  an assembly by whitespace-normalized content digest (the highest-priority
  copy survives), a context block that copies the system layer is dropped as
  a duplicate, and a running loop can pass `alreadyDeliveredDigests` so
  material an earlier step already carries is not re-sent. The harness no
  longer folds the current question into the chat-history section, and the
  prompt path renders the instruction set exactly once — in the system
  message; its context-section presence check stays as the assembly
  contract's proof that the safety text was budgeted and kept.
- **The gateway is untouched.** The builder produces plain `ContextSection[]`
  for the existing prompt path (`buildTurnMessages` → `AsyncModelAdapter` →
  `LlmGateway`). It never touches a provider, a payload or a credential, and
  it is stateless — one shared instance serves every run, so no run's
  assembly can leak into another's.

## Alternatives rejected and why

- **Keep per-call-site assembly and add validation at each site:** N call
  sites, N budgets, N chances to drift — exactly the failure this layer
  centralizes away. The harness would still have owned duplication fixes as
  private detail no other caller could benefit from.
- **Move assembly into the gateway:** the gateway is the transport boundary —
  endpoints, fallback, retry, budget refusal. Assembly is a _policy_ decision
  about what the model should read; putting it below the adapter seam would
  give the transport layer authority over prompt content and couple it to the
  harness's types (`DEC-AI-2-GATEWAY` keeps the gateway free of both).
- **Deduplicate by keeping per-builder state across runs:** a stateful
  registry would leak one run's delivered content into another's drop
  decisions. Runs are isolated (`DEC-AI-9-RUN-LIFECYCLE`); the loop-level
  ledger is therefore caller-supplied (`alreadyDeliveredDigests`), scoped to
  the loop that owns it.

## Consequences

- Every LLM request the harness makes is size-validated against a budget
  before it is built, and the same five layers are separated the same way at
  every call site — there is exactly one place to reason about what the
  model sees.
- The instruction-set duplication ends: instructions are rendered once, in
  the system layer, cutting the largest repeated block from every request.
- Memory, RAG, tools and multi-step loops arrive as sections or digests —
  no builder change is needed to admit them (`DEC-AI-13/14` memory already
  produces `ContextSection[]`; the tool path is permission-checked upstream
  of assembly).
- Deliberately out of scope: persistent memory, RAG retrieval, tool calling
  and evaluation — the builder admits their sections but implements none of
  them.
