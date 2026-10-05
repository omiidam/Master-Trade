# ADR-0062 — Three memory layers: scoped, versioned and bridged to the context builder

- **Status:** Accepted
- **Decision id:** `DEC-AI-13-MEMORY-LAYERS`, `DEC-AI-14-MEMORY-SCOPING`
- **Phase:** Task 1.5 (AI Workplace Memory foundation)
- **Depends on:** ADR-0006 (vector memory separate from structured records,
  trust-gated — the template for trust-carrying memory), ADR-0060 (the run
  harness, whose assembly this connects to), ADR-0061 (the prompt engine —
  memory sections enter prompts as labelled context, never as system
  instructions), ADR-0007 (deny-by-default authorization).

## Context

Task 1.3 fixed the run side: working memory is ephemeral, per-run and
disposed on every terminal path. What a run could _draw on_ was however
limited to caller-supplied runtime context — there was no persistent
memory architecture at all, by design. Before any layer can be persisted,
the boundaries have to exist, or the first persistence PR will invent
them under deadline pressure:

1. **No layer structure.** "Memory" was one undifferentiated concept.
   Skills, durable facts and dated events have different owners,
   lifetimes and sensitivity rules, and mixing them is how user
   conversation ends up feeding behaviour.
2. **No scoping model.** Vector memory (ADR-0006) carries trust, but
   nothing said who a record belongs to or who may read it.
3. **No versioning rule.** A durable fact that changes in place leaves
   no history and no audit trail.
4. **No bridge.** Even a correct memory store would have had to hand
   the harness untyped blobs.

## Decision

**1. Three layers, closed union, one contract shape each
(`DEC-AI-13-MEMORY-LAYERS`).**
`src/memory/layers.ts` defines `procedural | semantic | episodic` and a
record type per layer:

- **Procedural** — skills, rules, how-to instructions (`ProceduralKind`:
  `skill | rule | how-to`). System-owned, versioned like code,
  shared across every run. The layer that may _not_ hold private
  content, precisely because it is shared.
- **Semantic** — durable facts and user profile knowledge
  (`durable-fact | user-profile`). User-scoped by default; what is
  true for a long time.
- **Episodic** — dated events and conversation history
  (`event | conversation`). Always user-scoped, always timestamped,
  the only layer where conversational content is admissible.

**2. The write gate is one function, not per-store convention.**
`assertRecordAdmissible` runs before any storage write: layer/store
agreement, private-content placement (procedural and system-owned
records refuse `private`), conversational content episodic-only, semver
strictly increasing within a lineage, and ownership immutable across
versions. A durable backend implements the same `MemoryLayerStore`
contract and inherits the gate by calling the same function.

**3. Scoping is enforced at read and write, and cross-user reads throw
(`DEC-AI-14-MEMORY-SCOPING`).**
Every record carries a `MemoryOwner` (`system` or `{scope:'user',
userId}`). `read`/`history`/`query` take the caller's scope; a
system-owned record is visible to everyone, a user-scoped record only to
its owner. A cross-user read is a `NOT_FOUND` — thrown, never filtered
quietly, so a scoping bug is loud instead of a silent partial result.

**4. Versioning replaces editing.**
Records are immutable. `writeVersion` appends a new semver linked to the
version it supersedes; history is the lineage, oldest first. Ownership
cannot change across versions, so a record's audience is fixed for its
whole life.

**5. Retrieval is per-layer, labelled, capped — and never merged.**
`LayeredMemoryRetriever` (`src/memory/retrieval.ts`) retrieves each
layer with its own query semantics and its own token cap (procedural
1_000, semantic 1_500, episodic 1_500 by default), and returns three
_separate_ section lists plus a presentation-ordered flat list
(procedural → semantic → episodic). Procedural sections present as
`instructions`-source (they are the system's own how-tos); semantic and
episodic present as `memory` with full provenance, semantic verified and
episodic unverified — what happened is never presented as what to do.
Episodic retrieval is bounded by a recency window (30 days default),
newest first. No summarization or distillation happens here: sections
are the records themselves.

**6. The bridge to the context builder is a typed one-liner.**
`memoryContextSource(retriever).sectionsFor(request)` returns
`ContextSection[]` — the exact type `AgentRunInput.runtimeContext`
takes. Memory reaches a run only through the harness's existing
assembly, so the budget rules, priority ordering and "instructions are
never dropped" rule are the product's own. Working memory stays
ephemeral and separate: the harness's `WorkingMemory` is untouched, and
nothing in the memory layers holds run state between calls.

## Alternatives rejected, and why

- **One memory store with a `type` field.** A union-tagged row invites
  queries that blend layers ("give me everything about sizing"), which
  is exactly the mixing the layers exist to prevent. Three contracts,
  three query types, three caps: the boundary is in the types.
- **Auto-distill episodic → semantic.** Summarization without a
  retention policy and a review step is the fastest way to enshrine a
  misreading of a conversation into "durable fact". Explicitly deferred:
  the task forbids it, and ADR-0059's provenance discipline applies when
  it arrives.
- **User-authored procedural memory ("teach the agent my workflow").**
  Procedural memory outranks context in every prompt it appears in. A
  user-authored rule there is a user instruction in the system layer —
  the boundary ADR-0061 forbids. Procedural records are system-owned;
  a user-contributed rule is a _proposal_ until a system owner versions
  it in.
- **Private content in procedural memory with redaction at read time.**
  Redact-on-read is one bug away from no redaction. The layer that
  every run shares simply refuses private content at write time.
- **Feed retrieval straight into the prompt engine.** The harness's
  context assembly already owns budget and priority; a second path into
  the prompt would bypass it. The bridge produces sections; the
  existing assembly does the composing.

## Consequences

- **A durable backend is now a drop-in.** It implements
  `MemoryLayerStore` per layer and calls `assertRecordAdmissible`; the
  scoping, versioning and sensitivity rules are already law.
- **The harness can consume memory today.** Wire
  `memoryContextSource(...).sectionsFor(...)` into
  `AgentRunInput.runtimeContext` and a run sees procedural, semantic
  and episodic sections under the same budget rules as any other
  context.
- **Privacy is a write-time property.** Private content lives only in
  user-scoped semantic/episodic records, readable only by their owner —
  there is no path by which it reaches another user or the shared
  procedural layer.
- **Summarization, distillation and the learning loop are parked, visibly.**
  The retrieval contract returns records as-is; a future phase adds a
  distillation contract beside this one without changing it.
- **The decisions are locked.** Both ids are recorded in
  `src/core/architectureLock.ts` and quoted in
  `docs/technology-decisions.md`, so documentation drift stays
  machine-checked.
