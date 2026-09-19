# ADR-0004 — Provider-independent LLM gateway

**Status:** Accepted · **Date:** 2026-09-19

## Context

Multiple providers may be used over the project's lifetime; models and prices
change frequently; and the LLM must never be able to bypass system permissions.

## Decision

Core business logic depends only on `LlmProvider`; a single `LlmGateway`
(`src/llm/provider.ts`) owns configuration, primary/fallback order, retries,
timeouts, token/cost accounting and budget enforcement.

## Consequences

- Swapping or adding a provider is a new implementation plus a config entry — no
  change to orchestration, tools, storage or API.
- `LlmRequest` carries no execution capability; the gateway holds no tool
  registry, so a model can only _request_ a tool call, never perform one.
- Fallbacks make a provider outage a degraded answer rather than a failed
  session; cost tracking makes spend visible and hard-limitable.
- Cost: one more indirection to debug, and provider-specific streaming features
  must be expressed in the common response shape.
- Verified by tests: fallback, timeout, budget refusal, usage recording, and the
  absence of any tool-execution path on the gateway.
