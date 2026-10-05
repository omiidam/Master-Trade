# ADR-0059 — Training foundation: datasets, provenance and the infrastructure boundary

- **Status:** Accepted
- **Decision id:** `DEC-AI-6-NO-LIVE-DATA`, `DEC-AI-7-DATASET-PROVENANCE`, `DEC-AI-8-TRAINING-LADDER`
- **Phase:** Task 1.2 (Training / Fine-tuning foundation)
- **Depends on:** ADR-0058 (extension seams and request scoping — this ADR
  gives the `Trainer` seam its concrete contract), ADR-0004 (the gateway
  abstraction), ADR-0007 (deny-by-default authorization), ADR-0006
  (vector-memory trust gating, the template for data curation here).

## Context

ADR-0058 named `Trainer` as a type-only seam: training is an operator
action, never a request path, and its datasets are curated exports. The
next phase of work — SFT, and later preference optimization — needs more
than a seam before anything can be trained safely:

1. **No data contract existed.** What a training example _is_, which
   schema version it was written against, and where it came from were
   all unspecified. Datasets without provenance are unauditable, and a
   dataset assembled casually is exactly where private user data leaks.
2. **No gate existed between "a pile of records" and "something a job
   references".** Quality, deduplication and a held-out evaluation
   split are ordinary ML practice, but here they are also the boundary
   that keeps an unvalidated dataset away from any backend.
3. **The infrastructure boundary needed a shape.** Training compute is
   not part of the desktop runtime; the runtime must not import it,
   and the gateway must not expose it.

## Decision

**1. No live data, ever, without an approved pipeline (`DEC-AI-6-NO-LIVE-DATA`).**
The origin union in `src/training/foundation.ts` is closed: `authored`,
`reviewed-conversation`, `synthetic` and `licensed`. A
`reviewed-conversation` record must name the redaction pipeline that
produced it and the person who approved it — and the default quality
rules **exclude that origin entirely** until such a pipeline exists and
is approved. Nothing in the runtime captures conversations for
training; the module has no access to sessions, transcripts or the
request path.

**2. Every dataset carries provenance, and approval is data (`DEC-AI-7-DATASET-PROVENANCE`).**
A `DatasetProvenance` block records who created the dataset, when, the
origins present with counts, and an explicit `approvedBy` / `approvedAt`
/ `approvedUses` triple. `validateDataset` refuses a dataset with no
recorded approval — approval is a field the gate checks, not a comment
beside the file. Datasets are content-addressed by a deterministic
`DatasetFingerprint`, so a job references an identity, not loose bytes,
and two datasets with the same id cannot masquerade as each other.

**3. The training ladder is named, versioned, and its last rung is reserved (`DEC-AI-8-TRAINING-LADDER`).**
`TrainingStage` enumerates the four stages — `base` (referenced by id,
never trained here), `instruction-tuning` (SFT), `domain`, and
`continuous-learning`. The first three are contract-ready;
`continuous-learning` is **reserved**: examples tagged with it are
refused by validation, and the `CONTINUOUS_LEARNING` constant plus doc
comment state that a future phase must define its data pipeline,
triggers and guardrails before any backend may accept it. The task
implements nothing of it.

**4. The gate is pure, deterministic and strict.**
`validateDataset` checks schema version (`dataset/1`; unknown versions
are refused, not coerced), id and content deduplication (exact-duplicate
policy: `error` or `drop`, always reported), allowed origins, non-empty
`expected`, minimum size, and recorded approval. `splitDataset` derives
the train/evaluation split from the fingerprint with a seeded
Fisher–Yates shuffle — the same dataset always splits identically, and
holding out evaluation data before any run is what keeps evaluation
honest. Preference optimization is prepared for by a versioned
`PreferencePair` schema (prompt / chosen / rejected) that no optimizer
consumes yet.

**5. Infrastructure is an injected port, and the runtime is walled off.**
`TrainingBackend` is the only execution surface: supplied by the
operator through configuration (the composition-root pattern
`createAiGateway()` already uses), never imported by the runtime, never
reachable from the gateway. A backend _must_ refuse rather than quietly
attempt: the reserved stage, an unvalidated dataset reference, a
disallowed stage. `src/training` imports nothing from the runtime LLM
files, and a test asserts the gateway holds no training surface and the
runtime files never reference the training module.

## Alternatives rejected, and why

- **Capture production conversations into a training store behind a
  flag.** This is the leak the task forbids, made convenient. The
  `reviewed-conversation` origin exists precisely so that when an
  approved redaction pipeline is built, it slots into a schema that
  already demands its name and approver — until then the origin is
  refused by the default rules.
- **Let `TrainingDataset` be `{ id, examples }` like the ADR-0058 seam
  sketch.** The seam was a naming placeholder; a real dataset needs
  schema version, provenance and per-record origins. Widening the seam
  type would ripple into `src/llm`; the foundation defines the concrete
  contract and the seam stays as it is.
- **Put split/train/status methods on `LlmGateway`.** The gateway is the
  request path; training is infrastructure. Adding training to the
  gateway would give the runtime a dependency on training compute and
  erode the "gateway holds no tools" assertion from ADR-0058.
- **Store datasets in the SQLite app database.** Training data is
  operator-owned, versioned and content-addressed — a file/export
  concern, not product state. Mixing it into the app database would
  couple training provenance to schema migrations.
- **Use a real cryptographic hash for the fingerprint.** Tempting, but
  the fingerprint's job here is _determinism and auditability_, not
  tamper resistance; a dependency-free FNV-1a keeps the module pure and
  the docs honest about what the hash guarantees. A stronger hash is a
  one-line change when a backend actually consumes datasets.

## Consequences

- **SFT can start from contracts, not improvisation.** The next phase
  implements a `TrainingBackend` and feeds it validated, fingerprinted,
  split datasets — the data rules are already fixed.
- **Preference optimization is schema-ready.** `PreferencePair` is
  versioned and curated from day one, so no retro-fitted collection
  pipeline is needed when a DPO-style optimizer arrives.
- **Continuous learning is parked, visibly.** The stage, its refusal
  path and its reservation are all named; implementing it later means
  filling in a documented slot, not unwinding an assumption.
- **The runtime is unchanged.** No file under `src/llm` or `src/agent`
  was modified; the gateway remains the single entry point for every
  LLM request, and the doc-drift tests now cover the three new decision
  ids.
