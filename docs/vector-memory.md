# Vector Memory

Implemented in `src/vector/memory.ts`.

## 1. Separation from the structured database

Two stores, two jobs:

|                 | Structured (SQLite, `src/db`) | Semantic (vector, `src/vector`)             |
| --------------- | ----------------------------- | ------------------------------------------- |
| Answers         | who/what/when/status/audit    | "what did we discuss that is relevant now?" |
| Query           | SQL, joins, constraints       | nearest neighbours, filters, ranking        |
| Source of truth | yes                           | no — always a pointer to a record           |
| Trust           | recorded columns              | recorded column + enforced promotion rules  |

Retrieval never invents knowledge: every hit maps back to a `memory_records`
row (and, for stored chunks, a `files` row via `provenance.ref`).

## 2. Memory types and metadata

`MemoryRecordType`: `lesson-note`, `agent-insight`, `user-note`,
`rule-hypothesis`, `trade-review`, `document-chunk`.

`MemoryMetadata`: `subject`, `tags`, optional `symbol` / `lessonId`,
`createdBy`, `epistemicKind` (`fact | analysis | hypothesis | uncertainty`).

Every record also carries `provenance` (`source`, `ref`, `trust`, `recordedAt`)
and a `trust` level. Filters (`types`, `subject`, `symbol`, `minTrust`) make the
retrieval space explicit rather than one undifferentiated blob.

## 3. Embedding provider abstraction

```ts
interface EmbeddingProvider {
  readonly id: string;
  readonly model: string;
  readonly dimensions: number;
  embed(texts: readonly string[], signal?: AbortSignal): Promise<number[][]>;
}
```

- `hashEmbeddingProvider()` is the local, deterministic, offline default
  (32 dims) — used for tests and for a working desktop without network.
- A remote provider (OpenAI, local model server) implements the same interface.
- `memory_embeddings` stores `model` and `dimensions` with each vector, so a
  model change is a re-embedding migration, not a silent corruption.
- Vectors are L2-normalized; `cosineSimilarity()` guards against
  length-mismatch and zero vectors.

## 4. Retrieval, ranking, filtering

```
query(text, {topK, types, minTrust, subject, symbol, minScore, includeDeleted})
  └─ embed query (same provider as ingestion)
      └─ filter: deleted, type, trust, subject, symbol
          └─ score: cosine similarity
              └─ drop score < minScore
                  └─ sort by score desc (id as deterministic tiebreak)
                      └─ slice(topK)
```

Every result is a `RankedMemory { record, score, contextKind }` where
`contextKind` is derived from trust — this is how retrieval feeds the epistemic
labels the agent must use. Ranking is deterministic, so a test or a replay sees
the same context twice.

## 5. Provenance and trust

`TrustLevel = 'unverified' | 'verified' | 'authoritative'`.

Rules enforced in code (`src/core/provenance.ts`):

- Model-authored writes are **forced** to `unverified`, whatever trust their
  provenance claims.
- Raising trust requires a `TrustVerifier`: `{kind:'human'}` or `{kind:'tool'}`.
  The `model` source is not representable as a verifier.
- `authoritative` can only be granted by a **human** verifier; automation
  (tools, jobs, graders) is refused with `PolicyViolationError`.
- `contextKindForTrust()` maps `unverified → uncertainty`, `verified → analysis`,
  `authoritative → fact`, so unverified material can never be presented as fact.
- Retrieval can be restricted with `minTrust`, e.g. only verified/authoritative
  knowledge for decision-support contexts.

This is the concrete implementation of "prevent unverified information from
becoming trusted knowledge".

## 6. Versioning and deletion

- Each write to an existing record increments `version` and appends an immutable
  `MemoryVersion { version, text, changedBy, recordedAt }`; trust promotions and
  tombstones also increment the version, so the audit trail is complete.
- Deletion is a tombstone (`deletedAt`), not a row drop: history and provenance
  survive, retrieval excludes it by default, and `includeDeleted: true` is
  available for audits.
- Hard deletion (right to erasure) is a deferred, explicit maintenance job that
  removes record, versions and embeddings together.
- The `embedding.generate` job re-embeds records whose `embeddingModel` differs
  from the configured model.
