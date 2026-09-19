# ADR-0019 — LLM adapters, not agent frameworks

- **Status:** Accepted (Phase 3.1, architecture lock `DEC-AI-1-ABSTRACTION`, `DEC-AI-2-GATEWAY`, `DEC-AI-3-INDEPENDENCE`)
- **Date:** 2026-09-19
- **Supersedes:** none
- **Refines:** [ADR-0004](./ADR-0004-llm-gateway-abstraction.md) (names the concrete adapter strategy and rejects agent frameworks)

## Context

The permission model rests on a property that is easy to lose: **the model may
request a tool, but only the orchestrator may execute one, after an authorization
check.** ADR-0004 secured this inside `LlmGateway`/`LlmProvider` — `LlmRequest`
has no execution field, and the gateway holds no tool registry.

The obvious shortcut for Phase 3 is an agent framework, because it provides tool
calling, retries and prompt plumbing out of the box. But those frameworks execute
tools internally, inside their own loop, with their own retry semantics. That
would place tool execution _outside_ the orchestrator, defeating the invariant,
and it would hide safety-relevant behaviour behind library internals that our
tests cannot reach. It would also put vendor-shaped abstractions into the core
of a system that must remain provider-independent.

## Decision

**Implement providers as adapters behind the existing interfaces, and keep
orchestration in our code. Do not adopt an agent framework.**

- Adapters live only in `src/llm/providers/`: `openai/`, `anthropic/`, and
  `openai-compatible-local/` (llama.cpp, Ollama, LM Studio, vLLM).
- `LlmGateway` keeps ownership of endpoint order, fallback, retry, timeout,
  streaming, token/cost accounting and budget refusal. Phase 3.2 adds
  `stream()` (an `AsyncIterable<LlmStreamChunk>`) and a consecutive-failure
  circuit breaker — neither changes authority: a chunk may carry text and
  tool-call _requests_, never an execution.
- Tool calling stays in the orchestrator: request → `authorize()` → deterministic
  tool run → provenance recorded.
- Provider independence is **enforced by test**: `tests/technology-lock.test.ts`
  fails the build if any module outside `src/llm/providers/**` imports `openai`,
  `@anthropic-ai/*`, `@google/genai`, `cohere-ai`, `mistralai`, `langchain*` or
  `llamaindex`.
- Provider selection is configuration (`SecretRef` for keys, resolved from the OS
  keychain), so switching providers is a config change, not a code change.

## Alternatives rejected

| Alternative                                                  | Why rejected                                                                                                                                                                                                                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LangChain / LlamaIndex style agent frameworks                | Their internal tool-execution loop would bypass the orchestrator's permission check; opaque retries and prompt assembly would hide safety-relevant behaviour; heavy dependency trees and API churn for a system that must stay stable for months. |
| Direct SDK calls inside services                             | Creates vendor coupling across the codebase, makes the permission boundary unauditable, and breaks provider independence (the enforced import scope exists precisely to prevent this).                                                            |
| A single hard-coded provider                                 | Loses the fallback path, the cost/budget abstraction and the offline option; ADR-0004 already rejected lock-in.                                                                                                                                   |
| Self-hosted model as the primary path                        | Quality and hardware expectations would dominate the project's scope; kept available through the local OpenAI-compatible adapter for offline work only.                                                                                           |
| Building our own streaming + retry from scratch per provider | Duplicates exactly what the gateway already centralizes; adapters must stay thin translations.                                                                                                                                                    |
| Framework-provided "memory" for the agent                    | Would compete with the provenance/trust model in `src/memory`/`src/vector`, where unverified material must never become trusted knowledge.                                                                                                        |

## Consequences

**Positive:** the permission invariant remains provable and testable; cost and
latency behaviour is uniform across providers; offline use is a registered
adapter; swapping a provider never touches business logic.

**Negative:** we own debug/observability work that frameworks bundle (streaming
edge cases, tool-call parsing quirks, provider-specific error mapping) — accepted
deliberately, because that work is where our safety guarantees live.

**Security impact:** positive — the import boundary makes "provider SDK leaked
into the permission layer" a build failure; budget refusal and timeouts remain
enforced in one place.

## References

- [technology-decisions.md § 4](../technology-decisions.md)
- [ai-and-llm.md](../ai-and-llm.md), [ADR-0004](./ADR-0004-llm-gateway-abstraction.md), [ADR-0008](./ADR-0008-no-experimental-core-dependencies.md)
