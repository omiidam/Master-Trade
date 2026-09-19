# ADR-0002 — Single-process modular monolith

**Status:** Accepted · **Date:** 2026-09-19

## Context

The requested architecture diagram shows desktop → frontend → API → backend →
AI orchestrator → database → vector memory. That is a _layering_ requirement.
It does not require separate deployed services.

## Decision

Implement the layers as modules in **one process** with one strict dependency
direction (`api → agent → {llm, tools, vector, marketdata, auth, core}`), each
layer owning an explicit interface, and extract a layer into its own process only
when measurements demand it.

## Consequences

- No network between our own components: no internal auth, no serialization
  overhead, no service discovery, dramatically simpler desktop packaging.
- Boundaries are enforced by directory structure, interface types and tests
  rather than by the network — discipline is required in review.
- Every layer already has an extraction seam: `FileStorage`, `JobQueue`,
  `MarketDataProvider`, `EmbeddingProvider`, `LlmProvider`, `VectorMemoryStore`.
- Rejected alternatives: microservices (premature for one local user), a
  frontend-embedded agent (would put the LLM key and tools inside the renderer).
