# AI Layer & LLM Abstraction

## 1. AI orchestrator

`src/agent/orchestrator.ts` is the single place where model output becomes
action. Responsibilities:

1. **Lifecycle**: `IDLE → LOADING → READY → RUNNING → RESPONDING → IDLE`, with
   `BLOCKED` reachable from `RUNNING` and `RESPONDING`. Illegal transitions
   throw, so a sequencing bug fails a test instead of corrupting a run.
2. **Context assembly**: `src/agent/context.ts` builds what the model sees under
   a token budget (`maxTokens`, `reserveForResponse`).
3. **Instruction attachment**: `renderInstructions()` stamps every module with
   its id and semver, so a run is reproducible and auditable.
4. **Tool request handling**: for every tool the model references, the
   orchestrator checks `auth` + the Phase 1 capability table, then runs the tool
   itself. The model never gets a tool handle.
5. **Provenance**: each executed tool is recorded with origin and epistemic kind.

### Context assembly rules

- Instructions are **never dropped**; if they do not fit, assembly throws rather
  than truncating the safety policy.
- Memory sections must carry provenance or assembly fails.
- Selection is deterministic: priority, then id, then the budget.
- Every retrieved section carries a trust-derived label; unverified material is
  labelled `uncertainty` (`contextKindForTrust`).
- Assembly is centralized in the **Context Builder**
  (`src/agent/contextBuilder.ts`,
  [ADR-0064](./adr/ADR-0064-central-context-builder-between-harness-and-gateway.md),
  `DEC-AI-16-CONTEXT-BUILDER`): five separated layers — system instructions
  and agent policies (never dropped), runtime context (per-section priority),
  conversation (oldest turns first, as a contiguous prefix) and user input
  (never dropped or truncated). Budgets (`maxContextTokens`,
  `reserveForResponse`, per-layer caps) are configurable per instance and per
  call, the assembled total is validated before every request, and duplicate
  content is dropped by digest — within an assembly, against the system
  layer, and across the steps of a running loop via caller-supplied
  digests.

### Agent state management

`AgentLifecycle` holds the per-run state machine; longer-lived state (progress,
memory, sessions) lives in the database. "State-driven orchestration" from the
Agen concept is expressed with typed structures (lifecycle + orchestrator
inputs/outputs) rather than a new runtime — see
[ADR-0008](./adr/ADR-0008-no-experimental-core-dependencies.md).

### Human approval workflow

`src/agent/approval.ts` + `src/agent/proposals.ts` implement the only path from
idea to active rule:

```
propose (draft) → evaluate (deterministic) → approval-request → human decision → activate
```

`RuleRegistry.activate()` refuses to proceed without (a) a non-rejected
evaluation and (b) a non-expired approval whose subject is that exact proposal
and whose operation is `rule.activate`. Neither the model nor a job can shortcut
this.

## 2. LLM abstraction layer

`src/llm/provider.ts`. Core business logic depends on the interface only:

```ts
interface LlmProvider {
  readonly id: LlmProviderId; // 'scripted' | 'openai' | 'anthropic' | 'arvancloud' | 'local-openai-compatible'
  readonly models: readonly string[];
  complete(request: LlmRequest, signal?: AbortSignal): Promise<LlmProviderResponse>;
}
```

Provider-specific code exists only inside providers. Adding a provider means
implementing this interface and registering it with the gateway — no change to
orchestration, permissions, tools or storage.

**Phase 3.5 status: implemented.** Three things changed in Phase 3.5, and each is
recorded as an ADR:

- a provider returns **token counts only** (`LlmTokenUsage`) — the contract has no
  field that can carry money, so cost cannot be self-reported
  ([ADR-0026](./adr/ADR-0026-cost-from-our-price-table.md));
- a model answers with a **structured summary** and nothing else; chain-of-thought
  is refused by name ([ADR-0027](./adr/ADR-0027-structured-summaries-not-chain-of-thought.md));
- adapters are built on native `fetch`, not vendor SDKs
  ([ADR-0028](./adr/ADR-0028-provider-transport-native-fetch.md)).

### Request/response contract

`LlmRequest` carries exactly: a user scope (correlation id plus an optional
opaque `userId` — the authenticated user, never a `Principal`), model,
messages, max tokens, temperature, timeout. It has **no** field that can
execute anything. `LlmResponse` carries text, tool-call _requests_, finish
reason, usage and latency. Executing a `LlmToolCall` requires the
orchestrator's permission check — the gateway has no tool registry at all.
The scope is threaded `AgentService.runAsync` → `Orchestrator.runAsync` →
`AsyncModelAdapter.completeTurn` → `LlmGateway.complete` (`DEC-AI-5-REQUEST-SCOPING`,
[ADR-0058](./adr/ADR-0058-llm-core-extension-seams-and-request-scoping.md)):
the LLM layer gains attribution, not authorization, and no part of the scope
is serialized to a provider today.

### Gateway responsibilities

| Concern             | Behaviour                                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| Primary + fallback  | try endpoints in order; log each failure; succeed on first healthy provider                                    |
| Retry               | shared `RetryPolicy`, only for retryable codes (`TIMEOUT`, `RATE_LIMITED`, `PROVIDER_UNAVAILABLE`, `INTERNAL`) |
| Timeout             | `withTimeout` aborts the provider via `AbortSignal` and raises typed `TIMEOUT`                                 |
| Token/cost tracking | `UsageTracker` accumulates `promptTokens`, `completionTokens`, `totalTokens`, `costUsd`                        |
| Budget              | requests are refused with `BUDGET_EXCEEDED` once `monthlyBudgetUsd` is spent                                   |
| Observability       | every attempt logs provider, model, outcome; tool-call requests logged as requests, not actions                |
| All endpoints down  | `PROVIDER_UNAVAILABLE` with the per-endpoint failure list                                                      |

If a provider is not registered, its endpoint is skipped rather than failing the
whole chain (this is what makes `scripted` the safe offline default).

### Provider adapters (Phase 3.5)

```
src/llm/
├── provider.ts        # interfaces + LlmGateway (the only component that knows
│                      #   about endpoints, fallback, retry, timeout, pricing, budget)
├── pricing.ts         # one price row per (provider, model); cost is computed here
├── summary.ts         # the only accepted answer shape + the output contract text
├── prompt.ts          # assembled context → labelled provider messages
├── registry.ts        # settings → a live gateway (the composition root)
├── extensionPoints.ts # type-only seams for future capabilities (DEC-AI-4)
└── providers/
    ├── http.ts               # JSON POST, timeout/abort, status → typed error
    ├── openaiCompatible.ts   # OpenAI and any OpenAI-compatible local server
    ├── arvancloud.ts         # ArvanCloud AI: the OpenAI-compatible adapter + the apikey scheme
    ├── anthropic.ts          # Messages API (system split, content blocks)
    └── scripted.ts           # offline deterministic adapter (always registered)
```

| Concern              | Where it lives, and why it is there                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transport + timeouts | `providers/http.ts`: one JSON POST, `AbortSignal` on timeout, no `Response` escapes the adapter                                                   |
| Error taxonomy       | `http.ts`: 429/5xx retryable; 401/403 `FORBIDDEN` and 400/404 `VALIDATION_FAILED` not — a bad credential is not a flake                           |
| Credential travel    | `x-api-key` for Anthropic, `Authorization: apikey` for ArvanCloud, `Authorization: Bearer` otherwise; never in a detail object, an error or a log |
| Reasoning exclusion  | adapters never read reasoning fields/blocks; the summary parser refuses them by name                                                              |
| Tool arguments       | parsed from JSON, or the call is refused — a deterministic calculator must never receive guessed inputs                                           |
| Cost                 | `pricing.ts` + gateway: priced by the model **we** requested, not the one the response names                                                      |
| Composition          | `registry.ts`: the scripted adapter is always registered; a provider that cannot be built is skipped _with a reason_                              |

The offline default is a real path, not a stub: with the scripted provider
registered, a turn still goes through the prompt builder, the summary parser, the
permission check and the cost accounting — running without a key degrades answer
quality, never a guarantee.

### Model configuration

```ts
ai: {
  primary:   { provider: 'scripted', model: 'scripted-v1', secret: null, maxTokensPerRequest: 2048 },
  fallbacks: [],
  requestTimeoutMs: 30_000,
  maxRetries: 2,
  monthlyBudgetUsd: 25,
  allowModelDirectToolExecution: false,   // literal false, enforced by assertSafeConfig
}
```

Configured providers that cannot be built (missing credential, malformed
settings) are skipped and reported by `createAiGateway()` — the app degrades to
the next endpoint rather than failing to start, and "it silently used the offline
model" cannot happen without a recorded reason. An unpriced configured model is a
start-up warning and a `POLICY_VIOLATION` at call time.

Secrets are `SecretRef` values (`{kind:'env'|'keychain', name}`) — configuration
objects can be logged, exported and committed without leaking keys. The desktop
shell resolves `kind:'keychain'` from the OS keychain.

### ArvanCloud AI (Phase 2.3)

ArvanCloud's hosted AI service is the first non-OpenAI/Anthropic hosted provider
([ADR-0063](./adr/ADR-0063-arvancloud-ai-hosted-provider.md),
`DEC-AI-15-ARVANCLOUD-PROVIDER`). It speaks the OpenAI Chat Completions protocol
but authenticates with `Authorization: apikey <key>`; the adapter
(`src/llm/providers/arvancloud.ts`) composes `openAiCompatibleProvider` and
overrides only the credential scheme, so payload mapping, error taxonomy,
reasoning-field dropping and tool-argument refusal are the existing code.

Configuration (server-side only, see `.env.example`):

```
MASTER_TRADE_AI_PROVIDER=arvancloud
MASTER_TRADE_AI_MODEL=DeepSeek-V4-Flash
MASTER_TRADE_AI_KEY_ENV=ARVANCLOUD_API_KEY
ARVANCLOUD_API_KEY=<the key itself>
```

With `ARVANCLOUD_API_KEY` unset the provider is skipped with a recorded reason
and the offline scripted adapter answers — local development needs no key. The
server installs `createLlmModelAdapter({ gateway })` on the agent surface only
when a hosted endpoint was actually built, so the AI Workplace answers from
ArvanCloud through the same gateway (fallbacks, retries, budget, summary
contract) and never through a second path.

### Why the LLM can never bypass permissions

1. `LlmRequest` cannot express "run this tool".
2. The gateway holds no `ToolRegistry` and exposes no execution method
   (asserted by test).
3. Tool execution lives in the orchestrator, after `checkPermission` /
   `authorize`; unknown or denied tools block the run.
4. `ai.allowModelDirectToolExecution` is typed `false` and validated at startup.
5. Denied runs are recorded as `BLOCKED` with a reason, so attempts are visible
   in the audit trail rather than silently dropped.

### One asynchronous turn, in order

`Orchestrator.runAsync()` (`src/agent/orchestrator.ts`) is the path a hosted model
takes. The order is the safety property:

```
1. lifecycle: IDLE → LOADING → READY → RUNNING
2. render instructions (version-stamped)
3. assemble context under a token budget          (src/agent/context.ts)
4. build the prompt: instructions + operating rules + OUTPUT CONTRACT  (src/llm/prompt.ts)
     (+ the response language, when the caller resolved one — Phase 7.5.3.4)
5. gateway.complete()  → primary, then fallbacks; retry/timeout/budget/circuit
6. summarizeModelOutput()  → structured summary, or the turn fails
7. lifecycle: RUNNING → RESPONDING
8. for each tool request: authorize() → run → record provenance
     unknown tool            → BLOCKED (whole turn)
     permission denied       → BLOCKED (whole turn)
     tool reports an error   → recorded as a value, not an exception
9. lifecycle: RESPONDING → IDLE
```

Step 8 is where the LLM-permission rule is enforced with arguments in hand: the
model supplies the arguments, but `checkPermission` runs first, and the tool is
executed by the orchestrator. A single unknown or denied tool blocks the whole
turn — a model that asks for something it may not have does not get a partial run.

`AgentService.runAsync()` wraps this into the view the API layer serves
(`summary`, `statements`, `toolExecutions`, `usage`, `provider`, `model`), and
`npm run ai:demo` runs it offline end to end.

**Not implemented in this phase:** the multi-step tool loop. A turn runs the
tools it asked for and the deterministic results are returned as values; the model
is not called a second time to narrate them. That is deliberate — an unverified
narrative over a deterministic result is exactly the content this layer is built to
keep separated.

### The run manager (AI Workplace)

One level above the orchestrator and the harness, the **Agent Run Manager**
(`src/agent/runManager.ts`, ADR-0065, `DEC-AI-17-AGENT-RUN-MANAGER`) owns the
run _as an object_: a unique id per run, a record that outlives the execution
(start/end times, duration, model, accumulated token usage, the error and the
phase it surfaced in), and a machine-checked state machine in the Workplace's
vocabulary — `idle → running → waiting-tool → validating → responding →
completed`, with `blocked`, `failed` and `cancelled` as the other terminal
states. Every conversation turn served by `agent.chat` is tracked as a run,
so a gate refusal is a terminal `blocked` run, not a missing one.

Cancellation is cooperative: `cancel()` marks the request, the executing
driver polls `shouldCancel` between phases, and the run ends `cancelled` when
the driver observes it — never mid-write. Reads, transitions and
subscriptions are owner-checked against the opaque `userId`; a cross-user
read throws rather than filtering quietly. Every transition is announced as
an `agent.status` event on the existing `EventBus`, so the AI Workplace sees
run progress over the same WebSocket contracts, audiences and replay as every
other surface — no second channel and no second gateway. `waiting-tool` and
`validating` are machine-checked now and driven by the phase that implements
tools; streaming, tracing, evaluation, persistent memory and resume/retry are
shaped for, not implemented.

### The agent loop engine

One level above the harness, the **Agent Loop Engine**
(`src/agent/agentLoop.ts`, ADR-0066, `DEC-AI-18-AGENT-LOOP-ENGINE`) owns the
controlled multi-step loop. Each iteration is exactly the four phases: one
`AgentRunHarness.run` (the LLM reasoning step — the only place the gateway is
reached), a context update that records the digests of everything the step
delivered (the Context Builder's `alreadyDeliveredDigests` feedstock), a
next-step decision read off the structured summary — never model prose — and
completion.

Three configurable limits bound every loop: `maxIterations`,
`maxExecutionTimeMs` and `maxOutputTokens` (accumulated completion tokens).
The loop ends in exactly one terminal state — `completed`, `blocked`,
`failed` or `cancelled`, the Run Manager's own vocabulary — and a limit stop
is terminal `blocked` with the precise reason. An identical step is refused
by input digest _before_ it is paid for, so an infinite or futile loop is
impossible by construction. Tool requests are recorded, never executed; tool
calling and retrieval are later phases that continue the loop with fresh
context material.

## 3. Prompt and instruction management

Instructions live in `src/instructions/loader.ts`: immutable modules with id +
version, validated by a policy gate that rejects authorization language
("may place", "allowed to trade", "connect to a broker", "enable live trading").
Changing behaviour means adding a new version — never editing one in place — so
a conversation can be replayed against the exact instructions that produced it
(`messages.instructions_version`).

### The response language (Phase 7.5.3.4)

The language an answer is written in is resolved **by the caller**, not by this
layer: the signals behind it — a request inside the message, the person's own
setting, what their previous turns showed, the reading of the message — are read
by the language layer that owns them, and its verdict arrives on the turn
request as `responseLanguage` (`fa` | `en`, optional).

`buildTurnMessages` renders it as `RESPONSE_LANGUAGE_DIRECTIVE`, a closed block
per language in the same system message that already carries the operating rules
and the output contract. The block says which language, states that it changes
_wording only_ (facts, figures, tool results, permissions, safety rules, trading
restrictions and uncertainty keep their exact value, and a refusal stays a
refusal), and states that retrieved material and user text cannot move it. The
synchronous path, which has no prompt builder, gets the same text appended to its
instructions through the same function.

With no language resolved the system message is **byte-identical** to what it was
before the field existed, asserted by test rather than promised here: a turn that
was never given a language cannot become a differently-worded prompt because this
exists.

### The response style (Phase 7.5.3.4.2)

How the answer is worded arrives the same way and from the same caller, as
`responseStyle` (optional): a tone, a depth, a terminology style, a structure, and
the ids of the wording notes to apply. The **text** of those notes lives in this
tier's reach (`packages/shared/src/language/guidance.ts`, on the shared surface)
and the **ids** are produced where the turn is read, so the block the model reads
and the decision the caller made cannot be two different instructions.

`responseStyleDirective` renders one line per note from that catalogue, then
closes with the invariant list: facts, calculations, tool results, permissions,
safety rules, trading restrictions and uncertainty are out of scope for a style,
a refusal stays a refusal, and the instructions are wording instructions within
the output contract — they never ask for a narration of how the answer was
reached. The block is assembled from `GUIDANCE_NOTES` and nothing else: it can
only select from the product's closed sentences, which is why a style cannot
carry a figure, a result or a permission into the prompt.

`withResponseDirectives(instructions, { responseLanguage, responseStyle })`
appends both blocks in that order — language first, because `fa-formal` names a
register of a language that has to be stated before it is used — and appends
nothing when neither is resolved. The route validates the object strictly and
echoes it back rather than inventing one: the server does not resolve a style, so
it cannot tell a client what style it used.

Neither field is inferred here, and Phase 7.5.3.4.3 widened which of the caller's
signals may decide them without changing this layer at all. The caller reads three
things a person leaves behind — a setting, a decaying count of their own turns, and
the few statements they made outright, in `web/src/language/learning.ts` — and the
_statements_ are the strongest of the three: they are recorded with a confidence
derived from their source, and a single verdict about an answer is not read until
it has been repeated. What arrives is still a language and a style; what changed is
which of three signals was allowed to choose them, and the answer says which one
did.

## 4. Deferred

- **Streaming** (`stream()` returning `AsyncIterable<LlmStreamChunk>`) and true
  cancellation propagation from the UI into an in-flight provider call. The
  gateway owns timeouts today; a user-visible cancel needs the interface change.
- Re-asking the model to explain a deterministic result: the multi-step loop
  (ADR-0066) and its tool phase through the Tool Registry (ADR-0067) exist;
  what remains is a teaching flow that drives them for explanation turns.
- **Embedding + reranking for context selection** — retrieval quality, not layer
  structure.
- Prompt templates distinct from instruction modules and an instruction registry.
- Per-user model preference, cost dashboards and a spend report per session.
- A provider-registry UI: configuration is code/config today, resolved by
  `createAiGateway()`.

Every deferred capability above now has a named, type-only seam in
`src/llm/extensionPoints.ts` (`DEC-AI-4-EXTENSION-SEAMS`,
[ADR-0058](./adr/ADR-0058-llm-core-extension-seams-and-request-scoping.md)):
`PromptEngine`, `ContextBuilder`, `AgentLoop`, `ToolCalling`, `Evaluator` and
`Trainer`, collected in `LlmExtensionPoints`. Implementing one means
implementing its seam and installing it — the gateway remains the single
entry point for every LLM request until a phase does.

### The memory foundation (Task 1.5)

Persistent memory is three layers
([ADR-0062](./adr/ADR-0062-three-memory-layers-scoped-versioned-and-bridged-to-the-context-builder.md)):
procedural (skills, rules, how-tos — system-owned, versioned like code,
shared by every run, refusing private content), semantic (durable facts
and user profile knowledge, user-scoped) and episodic (dated events and
conversation history, always timestamped and user-scoped). Records are
immutable and versioned; every record carries an owner and a cross-user
read throws rather than filtering quietly. Retrieval is per-layer,
labelled and capped, and reaches a run only as `ContextSection[]`
through the harness's existing context assembly — working memory stays
ephemeral and separate. Summarization, distillation, tool calling,
evaluation and the learning loop are deliberately absent.

### The prompt engine (Task 1.4)

`PromptEngine.compose`
([ADR-0061](./adr/ADR-0061-prompt-engine-layered-roles-and-the-quarantine-boundary.md))
is the concrete contract of the prompt seam: five separated layers
(system instructions from a versioned template, developer instructions,
agent policies, labelled context, user input), with the system layer
closed — user text and context never enter it — and untrusted material
fenced in the user message. Injection-override patterns are scanned and
recorded, not refused; every layer is token-accounted against an
enforced budget; templates change by version, never by edit. The engine
emits the same message shape the existing turn builder hands the
adapter, so provider/model logic remains inside the gateway.

### The agent run harness (Task 1.3)

`AgentRunHarness.run`
([ADR-0060](./adr/ADR-0060-agent-run-harness-lifecycle-and-ephemeral-working-memory.md))
owns one bounded agent run: a machine-checked lifecycle (`pending →
assembling → calling-model → responding → completed`, with `failed` and
`cancelled`), an ephemeral per-run `WorkingMemory` disposed on every
terminal path, and assembly of exactly four things — system instructions
(never dropped), chat history, the user prompt, and caller-supplied
runtime context — through the existing `assembleContext`. The model is
reached only through the existing `AsyncModelAdapter`, so the gateway
path is unchanged; tool requests come back recorded, never executed.
Later Memory, Evaluation and Learning systems attach as observational
hooks (`HarnessRuntimeHooks`), never as behavior changes to the core.

### The training foundation (Task 1.2)

The `Trainer` seam has a concrete contract now:
`src/training/foundation.ts`
([ADR-0059](./adr/ADR-0059-training-foundation-datasets-provenance-and-the-infrastructure-boundary.md)).
It defines the stage ladder (base referenced by id, instruction-tuning,
domain; continuous-learning reserved and refused), versioned dataset
schemas (`dataset/1`) with per-record provenance and explicit approval,
quality/deduplication rules behind a pure `validateDataset` gate, a
deterministic seeded train/evaluation split, and a versioned
`PreferencePair` schema for future preference optimization. Execution is
an injected `TrainingBackend` port the runtime never imports — training
is infrastructure, and this module has no access to the gateway, the
request path or any conversation store. No model is trained in this
phase.

### The tool registry (Phase 2.7)

Agent tools execute through one server-side path
([ADR-0067](./adr/ADR-0067-tool-registry-server-side-tool-calling.md)):
`src/agent/tools/registry.ts`, with the typed contracts in
`src/agent/tools/contracts.ts`. A tool declares its identity (name, semver),
description, category, zod input and output schemas, capability classes
from the existing permission model, risk level, per-call timeout, approval
requirement and side effects; registration refuses any contract that
declares critical risk, side effects or the trading category without a
human-approval requirement. One invocation is one gate sequence — identity
(an explicit user/run context; a run without a user identity can never
execute a tool), existence, approval, permissions (`checkPermission` over
`PHASE1_PERMISSIONS`, consumed not copied), input validation, execution
under the timeout, output validation — and settles into one recorded
outcome (`succeeded`, `failed`, `timeout`, `refused`). The Agent Loop
Engine's tool phase invokes through the registry and feeds validated
outcomes back as fresh runtime context. No trading action, RAG/retrieval
tool, persistent tool history, evaluation or learning ships in this phase.

### Tool execution inside the loop (Phase 2.9)

The loop's tool phase now carries the loop's discipline
([ADR-0068](./adr/ADR-0068-tool-execution-inside-the-agent-loop.md)): the
three limits span LLM and tool steps (the time ceiling is checked between
tool invocations, so tool time spends the same clock), cancellation is
polled between invocations, and a tool that fails, times out or returns
invalid output settles the loop immediately as `failed` with a
`tool-failure` stop reason naming the tool — while refusals stay values
fed back to the model. An identical ask executes once per step. Every
settled outcome (name, status, duration, error) flows through the loop's
`onToolRun` seam onto `AgentRunRecord.toolRuns`, and the Run Manager's new
`runLoop()` driver maps the loop's outcome onto the run's own vocabulary
and accumulates usage across steps — the single-step `run()` and the
`agent.chat` integration are untouched, and no second loop, registry or
permission system exists.

### Tool permissions and the risk gate (Phase 2.10)

Every tool call now passes one centralized pre-execution decision
([ADR-0069](./adr/ADR-0069-tool-permission-and-risk-gate.md)):
`src/agent/tools/permissionGate.ts` answers `ALLOW`, `BLOCK` or
`REQUIRE_APPROVAL` from five dimensions — the acting user's server-resolved
grants against the required operation, the run's state (a tool runs only in
an active, known run), the tool's declared capabilities against the existing
`checkPermission`/`PHASE1_PERMISSIONS` rules, its risk level against a policy
table, and its approval requirement. Deny by default runs through all of it:
missing permission or risk information blocks with a reason naming what was
missing. The gate is evaluated inside `AgentToolRegistry.invoke` — the one
server-side execution path — before `execute` is ever reachable, so the
agent cannot bypass it and permissions stay server-side and user/run
scoped. The decision and its reason land on `AgentRunRecord.toolRuns[].gate`,
so the Workplace can answer "why did (not) that tool run?" from the run
trace; future risk levels attach through the policy table without touching
the Registry, and read-only versus side-effecting stays distinguishable in
every evaluation. There is still exactly one permission system — no trading
action, approval UI, RAG, evaluation, learning or mock response ships in
this phase.

### The response pipeline (Phase 2.11)

Every response now leaves through one centralized pipeline
([ADR-0070](./adr/ADR-0070-response-pipeline.md)),
`src/agent/responsePipeline.ts`, sitting between Agent execution and the
final user response — five explicit stages, always in order: **result
normalization** (one defensive shape for every input, harvesting the
run's internals — system-instruction lines, context digests, tool
execution ids and details — for the policy stage), **response
validation** (known epistemic kinds, non-empty text, well-formed
sources; nothing to validate is recorded `skipped`, never silently
`passed`), **policy check** (the outgoing text is scanned for inline
reasoning markup, stack traces, secret-shaped material and the stage-1
internals; a hit withholds the whole response rather than stripping it),
**uncertainty handling** (the summary's uncertainty notes are carried,
and the stage decides whether an answer exists: answered, needs
clarification, or data never arrived), and **final response formatting**
(reply, epistemic label, preserved metadata).

The pipeline settles on one of five outcome kinds — `completed`,
`clarification`, `blocked`, `failed`, `unavailable-data` — and enforces
the honesty rule the phase exists for: **only `completed` carries
statements and reports success.** A run that hit a limit after
productive steps, errored, was cancelled, or finished without an answer
loses its partial material in full, so none of them can be shaped into a
misleading success; a cancellation maps to `blocked` with
`metadata.runStatus` saying exactly which. Metadata travels with every
outcome: run id, run status, the loop's stop reason structured and
verbatim, usage, the validation status with stage-tagged violation
codes, and a verdict for each stage in execution order. Free-text
failure messages stay server-side behind fixed, honest copy. The
`agent.chat` handler finalizes through the pipeline — its reply, label,
statements and status are the pipeline's decision, with kind, run id,
stop-reason code and validation status as response metadata — while the
pipeline itself stays pure and UI-independent: same input, same
plain-data result. The Agent Loop, Run Manager, Harness, Context
Builder, Tool Registry, permission gate and LLM Gateway are untouched;
no evaluation, observability, diagnosis, quality gate, memory
consolidation, learning, chain-of-thought exposure or mock response
ships in this phase.

### Decision router foundation (Phase 2.12-A)

The Local Decision Router's contract now exists ahead of its model
([ADR-0071](./adr/ADR-0071-decision-router-taxonomy-and-training-foundation.md)):
`src/training/decisionRouter.ts` defines what **Needle 3** — a
lightweight local routing model, _not_ the main reasoning model and not
a replacement for DeepSeek or the cloud LLM Gateway — will classify and
route _before_ any expensive LLM call. Eight closed intents
(`NON_TRADING`, `TRADING_EDUCATION`, `MARKET_ANALYSIS`,
`PORTFOLIO_ANALYSIS`, `RISK_MANAGEMENT`, `TRADE_JOURNAL`,
`MARKET_DATA_REQUEST`, `SYSTEM_REQUEST`) each carry their subcategories
and a one-sentence meaning; five closed routes (`LOCAL_RESPONSE`,
`MEMORY_RETRIEVAL`, `TOOL_REQUIRED`, `LLM_GATEWAY`, `BLOCK`) each carry
a meaning and the two flags they imply (`requires_llm` only for the
gateway, `requires_tool` only for tools), plus per-intent route
guidance in which `BLOCK` is reachable from every intent — policy can
reject anything.

The decision output is a strict, machine-consumption-only schema:
`intent`, `route`, `confidence` (integer 0–100), `reason` (bounded to
200 characters), `requires_llm`, `requires_tool` — unknown keys
refused, flags refined to equal the route, and **no field anywhere that
can carry an answer**, because the router decides and never replies.
`training-data/decision-router.jsonl` holds the first 30 hand-authored
examples (origin `authored` under the ADR-0059 provenance rules — never
captured conversations) covering all eight intents, all five routes and
the promised categories, with trade-execution and permission-bypass
requests labelled `BLOCK` from the first record;
`parseDecisionRouterJsonl()` validates the file as a pure function with
line-numbered issues for malformed JSON, schema violations, duplicate
inputs, incoherent flags and routes the taxonomy does not allow. The
safety rules — never advise, never execute, never bypass permissions,
never call tools directly, only decide the route — are carried as data
and enforced structurally. Nothing is wired into the request path: the
Agent Loop, LLM Gateway and response pipeline are untouched, no model
is trained, and no mock response or trading logic ships in this phase —
Phase 2.12-B fine-tunes Needle 3 against this contract.
