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
  readonly id: LlmProviderId; // 'scripted' | 'openai' | 'anthropic' | 'local-openai-compatible'
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

`LlmRequest` carries exactly: correlation id, model, messages, max tokens,
temperature, timeout. It has **no** field that can execute anything.
`LlmResponse` carries text, tool-call _requests_, finish reason, usage and
latency. Executing a `LlmToolCall` requires the orchestrator's permission check —
the gateway has no tool registry at all.

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
└── providers/
    ├── http.ts               # JSON POST, timeout/abort, status → typed error
    ├── openaiCompatible.ts   # OpenAI and any OpenAI-compatible local server
    ├── anthropic.ts          # Messages API (system split, content blocks)
    └── scripted.ts           # offline deterministic adapter (always registered)
```

| Concern              | Where it lives, and why it is there                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Transport + timeouts | `providers/http.ts`: one JSON POST, `AbortSignal` on timeout, no `Response` escapes the adapter                         |
| Error taxonomy       | `http.ts`: 429/5xx retryable; 401/403 `FORBIDDEN` and 400/404 `VALIDATION_FAILED` not — a bad credential is not a flake |
| Credential travel    | `x-api-key` for Anthropic, `Authorization: Bearer` otherwise; never in a detail object, an error or a log               |
| Reasoning exclusion  | adapters never read reasoning fields/blocks; the summary parser refuses them by name                                    |
| Tool arguments       | parsed from JSON, or the call is refused — a deterministic calculator must never receive guessed inputs                 |
| Cost                 | `pricing.ts` + gateway: priced by the model **we** requested, not the one the response names                            |
| Composition          | `registry.ts`: the scripted adapter is always registered; a provider that cannot be built is skipped _with a reason_    |

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
- **The multi-step tool loop**: re-asking the model to explain a deterministic
  result, with the result supplied as a source.
- **Embedding + reranking for context selection** — retrieval quality, not layer
  structure.
- Prompt templates distinct from instruction modules and an instruction registry.
- Per-user model preference, cost dashboards and a spend report per session.
- A provider-registry UI: configuration is code/config today, resolved by
  `createAiGateway()`.
