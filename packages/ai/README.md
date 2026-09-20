# packages/ai — placeholder (not a package)

Reserved for the AI layer. **Nothing lives here yet**, and this directory contains no
`package.json`, so npm does not treat it as a package and nothing can be imported from
it.

Today it is `src/llm/**` (provider interface, gateway, adapters), `src/agent/**`
(lifecycle, orchestrator, approval, proposals, context), `src/vector/**` (embeddings,
retrieval, trust) and `src/instructions/**` (the versioned loader) — and it stays there
— Phase 4.2 moved no files.

**Why it is deferred:** it has exactly one consumer
([ADR-0035](../../docs/adr/ADR-0035-monorepo-migration-staged-boundary-first.md)).

**Safety invariants that must survive any move** (all currently enforced by tests in
`src/`): the LLM can only _return_ tool calls and never execute them; risk math stays
deterministic and outside the model; chain-of-thought is never accepted, stored or
displayed; an unpriced model cannot be called; a provider can never bypass
permissions.

**Trigger to populate:** a second consumer — an evaluation worker, a batch/offline
analysis process, or independent packaging.
