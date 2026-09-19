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
  complete(request: LlmRequest, signal?: AbortSignal): Promise<LlmResponse>;
}
```

Provider-specific code exists only inside providers. Adding a provider means
implementing this interface and registering it with the gateway — no change to
orchestration, permissions, tools or storage.

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

## 3. Prompt and instruction management

Instructions live in `src/instructions/loader.ts`: immutable modules with id +
version, validated by a policy gate that rejects authorization language
("may place", "allowed to trade", "connect to a broker", "enable live trading").
Changing behaviour means adding a new version — never editing one in place — so
a conversation can be replayed against the exact instructions that produced it
(`messages.instructions_version`).

## 4. Deferred

- Real provider adapters (OpenAI/Anthropic/local) with streaming.
- Prompt templates distinct from instruction modules and an instruction registry.
- Per-user model preference and cost dashboards.
- True cancellation propagation from the UI into in-flight provider calls.
