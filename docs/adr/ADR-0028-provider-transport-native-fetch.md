# ADR-0028 — Provider transport over native `fetch`, not vendor SDKs

- **Status:** Accepted (Phase 3.5, architecture lock `DEC-AI-3-INDEPENDENCE`)
- **Date:** 2026-09-20
- **Supersedes:** none
- **Refines:** [ADR-0019](./ADR-0019-llm-adapters-not-frameworks.md)

## Context

ADR-0019 decided that providers are adapters behind our interfaces, and confined
vendor SDK imports to `src/llm/providers/**`. It did not say what the adapters
should be built _on_, and the default assumption was "the official SDKs".

Phase 3.5 needed the adapters to be more than seams. Two properties had to hold,
and an SDK makes both harder:

- **The payload boundary is a security boundary.** Hidden reasoning, tool
  arguments and usage figures are read from provider JSON. We need to decide
  exactly which fields cross into the product, and be able to show that the rest
  are unreachable — not filter them back out of an SDK's object graph.
- **The desktop app installs this.** A native build ships an installer, and every
  dependency in the reasoning path is one the learner waits for and we must audit
  for months. Several official SDKs pull retry, streaming, telemetry and
  dependency trees we deliberately implement ourselves (`withRetry`,
  `withTimeout`, the gateway's circuit breaker).

There is also the practical point that the two protocols we need are small and
stable: a POST with a JSON body, and a JSON response whose shape is documented.

## Decision

**Adapters translate protocol ↔ interface using the runtime's own `fetch`. No
vendor SDK is a dependency, and none may become one outside the adapter scope.**

- `src/llm/providers/http.ts` owns the transport concerns once: JSON POST,
  per-request timeout via `AbortSignal`, credential header selection
  (`Authorization: Bearer` by default, `x-api-key` for Anthropic), and HTTP status
  → typed error mapping with correct retryability (429 `RATE_LIMITED` and 5xx
  `PROVIDER_UNAVAILABLE` retryable; 401/403 `FORBIDDEN`, 400/404
  `VALIDATION_FAILED` not retryable).
- Provider error bodies are reduced to the conventional `error.message` /
  `message` field, one line, capped at 200 characters — an error body can echo a
  prompt, and prompts carry user data.
- `fetch` is injectable (`FetchLike`), which is how adapter behaviour is tested
  offline: no network, no interception library, no credentials.
- Credentials arrive as resolved strings from the composition root
  (`createAiGateway` + `SecretRef` resolution) and never reach a log or an error
  object.
- Adding a provider with an SDK-shaped protocol remains possible: implement
  `LlmProvider` inside `src/llm/providers/**`, where the import boundary permits
  it.

## Alternatives rejected

| Alternative                                             | Why rejected                                                                                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Official OpenAI / Anthropic SDKs                        | Their object graphs and defaults (retries, streaming, telemetry, prompt helpers) overlap with gateway responsibilities we must own.  |
| `langchain` / `llamaindex` provider packages            | Already rejected in ADR-0019: their loops execute tools, which would move execution outside the orchestrator.                        |
| A generic HTTP client (`axios`, `got`, `undici` client) | Adds a dependency for what `fetch` does, and each brings its own retry/interceptor semantics that must then be disabled.             |
| Streaming transport in this phase                       | Not needed yet: the summary contract is a single object, and streaming without cancellation wiring in the interface would be unused. |
| Hand-rolled HTTP over `node:http`                       | More code in the security-relevant boundary, and it would not run against the same `fetch` shape the desktop shell already provides. |
| Auto-generated clients from provider OpenAPI specs      | Large generated surface with no fixtures, hard to review, and it re-introduces vendor payload shapes into the module tree.           |

## Consequences

**Positive:** the reviewed surface per provider is a few dozen lines; the exact
set of fields that cross the boundary is visible and testable; failure semantics
are identical across providers; the desktop installer stays small; adapters are
tested against `Response` fixtures with no network.

**Negative:** we own protocol drift — when a provider changes a field or adds a
new stop reason, our mapping must be updated, and we do not get SDK-level
validation for free. Accepted, because that mapping is where our safety guarantees
live (reasoning exclusion, tool-argument refusal, token accounting).

**Security impact:** positive — no third-party code sits inside the boundary that
reads provider payloads, and every field that becomes product surface is named in
our code.

## References

- [ai-and-llm.md § 2](../ai-and-llm.md), [technology-decisions.md § 4](../technology-decisions.md)
- [ADR-0019](./ADR-0019-llm-adapters-not-frameworks.md), [ADR-0008](./ADR-0008-no-experimental-core-dependencies.md)
- `src/core/architectureLock.ts` (`PROVIDER_SDK_SCOPE`), risk R4 (vendor lock-in), R16 (library churn)
