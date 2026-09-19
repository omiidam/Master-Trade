# ADR-0006 — Vector memory separate from structured records, trust-gated

**Status:** Accepted · **Date:** 2026-09-19

## Context

Semantic retrieval and structured records answer different questions. A hybrid
store would blur provenance and make "where did this claim come from?" hard to
answer — unacceptable for a system that teaches risk decision-making.

## Decision

Keep structured records in SQLite and semantic retrieval in a dedicated vector
store (`src/vector/memory.ts`) with its own embedding-provider abstraction. Every
record carries provenance, a `TrustLevel` and an `EpistemicKind`. Trust can only
be raised by a non-model verifier, and `authoritative` only by a human.

## Consequences

- Retrieval never invents knowledge: each hit points back to a record (and
  optionally a file) with provenance.
- Model-authored memory is forced to `unverified`, so automation cannot launder
  its own text into trusted knowledge; `contextKindForTrust()` labels such
  material as uncertainty in the model context.
- Embedding model and dimensions are stored per vector, making re-embedding a
  migration rather than a silent corruption.
- Versioning plus tombstone deletion preserves history for audit while removing
  records from retrieval.
- Cost: two stores to keep consistent (record + vector + version rows), and a
  local hash embedder with weak semantic quality until a real provider lands.
