/**
 * Training foundation — contracts only.
 *
 * This module names the architecture for training a model on this
 * product's domain: the four-stage ladder (base → instruction tuning →
 * domain training → continuous learning), the versioned dataset and
 * provenance schemas, and the quality, deduplication and split rules a
 * dataset must satisfy before a job may reference it.
 *
 * Nothing here trains anything. There is no runner, no backend, no
 * wiring and no default behavior — the same rule ADR-0058 set for the
 * seams holds here: a phase implements a contract, it does not grow
 * one. The runtime LLM Gateway is untouched and unreachable from this
 * module: training is infrastructure, not the request path.
 *
 * Three invariants this file encodes, matching the seam discipline:
 *
 *   1. **No live data.** Every dataset is a curated export with
 *      recorded provenance. Nothing captures conversations; a record
 *      without provenance cannot be validated, and an unvalidated
 *      dataset cannot be submitted to a job.
 *   2. **Nothing executes.** A `TrainingJob` is a record. Submitting
 *      one is an operator action over infrastructure that does not
 *      exist yet, described by a port (`TrainingBackend`) the operator
 *      supplies.
 *   3. **Nothing bypasses a contract.** Datasets are versioned
 *      (`dataset/1`), every split is derived deterministically from a
 *      seed, and every example carries the schema version it was
 *      written against.
 */

import type { LlmMessage } from '../llm/provider.js';

// ── 1. The training ladder ─────────────────────────────────────────────────

/**
 * The four stages, in the order they may run.
 *
 * - `base`: the pre-trained starting point. Never trained here; only
 *   referenced by id, so provenance of "what we started from" is a
 *   record, not an assumption.
 * - `instruction-tuning` (SFT): general instruction following.
 * - `domain`: the product's own material — epistemic labeling, risk
 *   discipline, refusal behavior — produced from curated datasets.
 * - `continuous-learning`: future retraining from production drift
 *   signals. Named and reserved; **deliberately unimplemented** and
 *   not scheduled by this task (see `CONTINUOUS_LEARNING` below).
 */
export type TrainingStage = 'base' | 'instruction-tuning' | 'domain' | 'continuous-learning';

/**
 * Reserved for a future phase. Any job whose `targetStage` is
 * `continuous-learning` must be refused by any backend until that
 * phase defines its data pipeline, triggers and guardrails.
 */
export const CONTINUOUS_LEARNING: 'continuous-learning' = 'continuous-learning';

// ── 2. Versioned dataset schemas ───────────────────────────────────────────

/**
 * The dataset schema version. Bumped only by a new ADR; readers must
 * refuse a version they do not know instead of guessing.
 */
export const DATASET_SCHEMA_VERSION = 'dataset/1' as const;
export type DatasetSchemaVersion = typeof DATASET_SCHEMA_VERSION;

/**
 * A supervised example: the conversation the model sees and the
 * response it should have produced. Structurally the `TrainingExample`
 * seam from `src/llm/extensionPoints.ts` plus the metadata every
 * curated record must carry.
 */
export interface SupervisedExample {
  /** The schema version this record was written against. */
  schemaVersion: DatasetSchemaVersion;
  /** Stable within its dataset; provenance references it. */
  id: string;
  messages: LlmMessage[];
  expected: LlmMessage[];
  /** Curated metadata; never captured user content. */
  meta: {
    /** `DEC-AI-7-DATASET-PROVENANCE`: where this record came from. */
    origin: TrainingOrigin;
    /** Stage(s) this example is intended for. */
    stages: readonly Exclude<TrainingStage, 'continuous-learning'>[];
    /** Free-form curation tags, e.g. `['risk', 'refusal']`. */
    tags?: readonly string[];
  };
}

/**
 * A preference pair for future preference optimization (DPO and its
 * relatives). The schema exists now so preference data is collected
 * curated and versioned from the start, but no optimizer consumes it
 * in this phase.
 */
export interface PreferencePair {
  schemaVersion: DatasetSchemaVersion;
  id: string;
  /** The prompt both responses answer. */
  prompt: LlmMessage[];
  /** The response curation marked as preferred. */
  chosen: LlmMessage[];
  /** The response curation marked as rejected. */
  rejected: LlmMessage[];
  meta: {
    origin: TrainingOrigin;
    stages: readonly Exclude<TrainingStage, 'continuous-learning'>[];
    tags?: readonly string[];
  };
}

/**
 * A versioned, immutable dataset: examples, optional preference
 * pairs, and the provenance that says where all of it came from.
 * Datasets are content-addressed by hash at validation time
 * (`DatasetFingerprint`), so two datasets with the same id and
 * different content cannot masquerade as each other.
 */
export interface TrainingDataset {
  schemaVersion: DatasetSchemaVersion;
  id: string;
  provenance: DatasetProvenance;
  examples: readonly SupervisedExample[];
  /** Future preference optimization (DPO-style); empty is valid. */
  preferences?: readonly PreferencePair[];
}

// ── 3. Provenance ──────────────────────────────────────────────────────────

/**
 * Where a curated record came from. Every origin names its source and
 * carries the approval that authorizes its use — `DEC-AI-7`. The
 * union is closed: adding an origin kind is a decision, not a
 * convenience, because the kinds are what the no-live-data rule is
 * checked against.
 */
export type TrainingOrigin =
  /**
   * Written by the team (docs, instruction modules, worked examples).
   */
  | { kind: 'authored'; author: string }
  /**
   * Recorded interaction that passed the approved redaction pipeline
   * (`DEC-AI-6-NO-LIVE-DATA`): reviewed, user identifiers removed,
   * consent basis recorded. There is no pipeline yet, so no backend
   * may accept this origin until one exists.
   */
  | { kind: 'reviewed-conversation'; pipeline: string; approvedBy: string }
  /**
   * Synthetic material generated by a model run and reviewed by a
   * human before inclusion.
   */
  | { kind: 'synthetic'; generator: string; reviewedBy: string }
  /**
   * Third-party material with a recorded license.
   */
  | { kind: 'licensed'; source: string; license: string };

// ── 4. Provenance and fingerprint records ──────────────────────────────────

/**
 * The provenance block every dataset must carry. It answers "where
 * did this come from and who approved it" — the questions an auditor
 * asks first.
 */
export interface DatasetProvenance {
  /** Human-readable creation record. */
  createdBy: string;
  createdAt: string;
  /** The origins present in `examples`, each with a count. */
  origins: readonly { origin: TrainingOrigin; examples: number }[];
  /**
   * Explicit approval for this dataset's use in training. Without it,
   * `validateDataset` fails — approval is data, not a comment.
   */
  approvedBy: string;
  approvedAt: string;
  /** What the approval covers, e.g. `['SFT', 'evaluation']`. */
  approvedUses: readonly string[];
}

/** Content identity of a validated dataset. */
export interface DatasetFingerprint {
  datasetId: string;
  schemaVersion: DatasetSchemaVersion;
  /** Deterministic hash over sorted example ids + their content. */
  contentHash: string;
  exampleCount: number;
}

// ── 5. Quality, validation, deduplication and splits ───────────────────────

/** Rules a dataset must satisfy before a job may reference it. */
export interface DatasetQualityRules {
  /** A validated dataset must contain at least this many examples. */
  minExamples: number;
  /** Every origin in the dataset must be one of these kinds. */
  allowedOrigins: readonly TrainingOrigin['kind'][];
  /**
   * Exact-duplicate policy: `error` refuses the dataset, `drop`
   * removes duplicates during validation (reported in the result).
   */
  onDuplicate: 'error' | 'drop';
  /** Minimum fraction of examples that must carry non-empty `expected`. */
  minExpectedRatio: number;
}

/**
 * The default rules: small, strict and reviewable. `reviewed-conversation`
 * is absent from `allowedOrigins` on purpose — until an approved
 * redaction pipeline exists, that origin cannot appear anywhere.
 */
export const DEFAULT_QUALITY_RULES: DatasetQualityRules = {
  minExamples: 8,
  allowedOrigins: ['authored', 'synthetic', 'licensed'],
  onDuplicate: 'error',
  minExpectedRatio: 1,
};

/** One validation failure, precise enough to fix the dataset. */
export interface ValidationIssue {
  code:
    | 'schema-version'
    | 'empty-id'
    | 'duplicate-id'
    | 'duplicate-content'
    | 'disallowed-origin'
    | 'empty-expected'
    | 'too-few-examples'
    | 'no-approval'
    | 'reserved-stage';
  message: string;
  /** The example id, when the issue is about one record. */
  exampleId?: string;
}

/** The report `validateDataset` returns. */
export interface DatasetValidationResult {
  ok: boolean;
  issues: readonly ValidationIssue[];
  /** Exact duplicates found, after the `onDuplicate` policy ran. */
  duplicates: readonly { exampleId: string; duplicateOf: string }[];
  /** The dataset's fingerprint, present only when `ok`. */
  fingerprint?: DatasetFingerprint;
  /**
   * The deduplicated set, present only when `ok` and the
   * `onDuplicate: 'drop'` policy removed records.
   */
  deduplicated?: TrainingDataset;
}

/**
 * Validate a dataset against the rules: schema versions, id and
 * content deduplication, allowed origins, non-empty `expected`,
 * minimum size, and recorded approval. Deterministic and side-effect
 * free — this is the gate a `TrainingJob` must pass, and it is pure
 * so the gate is testable without infrastructure.
 */
export function validateDataset(
  dataset: TrainingDataset,
  rules: DatasetQualityRules = DEFAULT_QUALITY_RULES,
): DatasetValidationResult {
  const issues: ValidationIssue[] = [];
  const duplicates: { exampleId: string; duplicateOf: string }[] = [];

  if (dataset.schemaVersion !== DATASET_SCHEMA_VERSION) {
    issues.push({
      code: 'schema-version',
      message: `expected ${DATASET_SCHEMA_VERSION}, got ${String(dataset.schemaVersion)}`,
    });
  }

  const seenIds = new Set<string>();
  const seenContent = new Map<string, string>();
  const kept: SupervisedExample[] = [];

  for (const ex of dataset.examples) {
    if (!ex.id || ex.id.trim() === '') {
      issues.push({ code: 'empty-id', message: 'example id is empty' });
      continue;
    }
    if (seenIds.has(ex.id)) {
      issues.push({
        code: 'duplicate-id',
        message: `id appears twice: ${ex.id}`,
        exampleId: ex.id,
      });
      continue;
    }
    seenIds.add(ex.id);

    const contentKey = JSON.stringify([ex.messages, ex.expected]);
    const firstId = seenContent.get(contentKey);
    if (firstId !== undefined) {
      duplicates.push({ exampleId: ex.id, duplicateOf: firstId });
      if (rules.onDuplicate === 'error') {
        issues.push({
          code: 'duplicate-content',
          message: `same content as ${firstId}`,
          exampleId: ex.id,
        });
      } else {
        continue; // drop
      }
    } else {
      seenContent.set(contentKey, ex.id);
    }

    kept.push(ex);
  }

  for (const ex of kept) {
    if (!rules.allowedOrigins.includes(ex.meta.origin.kind)) {
      issues.push({
        code: 'disallowed-origin',
        message: `origin kind "${ex.meta.origin.kind}" is not allowed by the rules`,
        exampleId: ex.id,
      });
    }
    const hasExpected =
      ex.expected.length > 0 && ex.expected.some((m) => (m.content ?? '').trim() !== '');
    if (!hasExpected) {
      issues.push({
        code: 'empty-expected',
        message: 'expected response is empty',
        exampleId: ex.id,
      });
    }
    for (const stage of ex.meta.stages as readonly TrainingStage[]) {
      if (stage === CONTINUOUS_LEARNING) {
        issues.push({
          code: 'reserved-stage',
          message: 'continuous-learning is reserved for a future phase',
          exampleId: ex.id,
        });
      }
    }
  }

  if (kept.length < rules.minExamples) {
    issues.push({
      code: 'too-few-examples',
      message: `dataset has ${kept.length} examples, rules require ${rules.minExamples}`,
    });
  }

  const withExpected = kept.filter((ex) =>
    ex.expected.some((m) => (m.content ?? '').trim() !== ''),
  ).length;
  if (kept.length > 0 && withExpected / kept.length < rules.minExpectedRatio) {
    issues.push({
      code: 'empty-expected',
      message: `expected ratio ${withExpected}/${kept.length} below ${rules.minExpectedRatio}`,
    });
  }

  if (!dataset.provenance?.approvedBy || dataset.provenance?.approvedBy.trim() === '') {
    issues.push({ code: 'no-approval', message: 'provenance has no recorded approval' });
  }

  const deduplicated =
    duplicates.length > 0 && rules.onDuplicate === 'drop' && issues.length === 0
      ? { ...dataset, examples: kept }
      : undefined;

  if (issues.length > 0) return { ok: false, issues, duplicates };

  return {
    ok: true,
    issues,
    duplicates,
    fingerprint: {
      datasetId: dataset.id,
      schemaVersion: dataset.schemaVersion,
      contentHash: hashDataset(dataset.id, kept),
      exampleCount: kept.length,
    },
    deduplicated,
  };
}

/** Deterministic FNV-1a over the sorted, serialized examples. */
function hashDataset(datasetId: string, examples: readonly SupervisedExample[]): string {
  const material = JSON.stringify([
    datasetId,
    ...[...examples].map((ex) => JSON.stringify([ex.id, ex.messages, ex.expected])).sort(),
  ]);
  let h = 0x811c9dc5;
  for (let i = 0; i < material.length; i++) {
    h ^= material.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ('00000000' + h.toString(16)).slice(-8);
}

// ── 6. Train/evaluation splits ─────────────────────────────────────────────

/** Rules for deriving a deterministic train/evaluation split. */
export interface SplitRules {
  /** Fraction of examples assigned to evaluation, in (0, 1). */
  evaluationFraction: number;
  /** Seed for the deterministic shuffle. */
  seed: number;
}

/**
 * The default split: ten percent held out for evaluation, shuffled
 * deterministically from a fixed seed so the same dataset always
 * splits identically — a split is derived, never chosen.
 */
export const DEFAULT_SPLIT_RULES: SplitRules = { evaluationFraction: 0.1, seed: 1 };

export interface DatasetSplit {
  train: readonly SupervisedExample[];
  evaluation: readonly SupervisedExample[];
  rules: SplitRules;
  /** The fingerprint the split was derived from; splits are not data. */
  ofFingerprint: string;
}

/**
 * Derive the train/evaluation split with a seeded Fisher–Yates
 * shuffle, so it is a pure function of (fingerprint, rules). Holding
 * out evaluation data before any training run is what keeps the
 * evaluation honest — a dataset that cannot produce a split cannot be
 * trained on.
 */
export function splitDataset(
  dataset: TrainingDataset,
  fingerprint: DatasetFingerprint,
  rules: SplitRules = DEFAULT_SPLIT_RULES,
): DatasetSplit {
  const pool = [...dataset.examples];
  let state = (rules.seed ^ fnv1a(fingerprint.contentHash)) >>> 0;
  for (let i = pool.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    const tmp: SupervisedExample | undefined = pool[i];
    if (tmp === undefined) continue;
    const swapWith: SupervisedExample | undefined = pool[j];
    if (swapWith === undefined) continue;
    pool[i] = swapWith;
    pool[j] = tmp;
  }
  const evalCount = Math.min(
    pool.length - 1,
    Math.max(1, Math.round(pool.length * rules.evaluationFraction)),
  );
  const shuffled: SupervisedExample[] = [];
  for (const ex of pool) {
    if (ex !== undefined) shuffled.push(ex);
  }
  return {
    train: shuffled.slice(evalCount).sort((a, b) => a.id.localeCompare(b.id)),
    evaluation: shuffled.slice(0, evalCount).sort((a, b) => a.id.localeCompare(b.id)),
    rules,
    ofFingerprint: fingerprint.contentHash,
  };
}

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// ── 7. Jobs, stages and the infrastructure boundary ────────────────────────

/** What the operator asks for, after a dataset validated `ok`. */
export interface TrainingJob {
  jobId: string;
  /** Where this job sits on the ladder. */
  targetStage: TrainingStage;
  /** The validated dataset's fingerprint — a job references identity, not content. */
  dataset: DatasetFingerprint;
  /** Stage-specific hyperparameters, opaque to this module. */
  config: Record<string, string | number | boolean>;
  requestedBy: string;
  requestedAt: string;
}

/** Operator-facing job state. Never credentials, prompts or user content. */
export interface TrainingJobResult {
  jobId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'refused';
  /** Refusal reason when status is `refused`. */
  reason?: string;
  details: string;
}

/**
 * The infrastructure port. A `TrainingBackend` is supplied by the
 * operator (config → composition root, like `createAiGateway`); it is
 * never imported by the runtime and never reachable from the gateway.
 * Refusing is part of the contract: an unknown backend stage, an
 * unvalidated dataset or the reserved continuous-learning stage must
 * come back as `refused`, not as a quiet attempt.
 */
export interface TrainingBackend {
  submit(job: TrainingJob, validated: DatasetValidationResult): Promise<TrainingJobResult>;
  status(jobId: string): Promise<TrainingJobResult>;
}

/**
 * The trainer seam, installed: `src/llm/extensionPoints.ts` named a
 * `Trainer` with `submit` and `status`. This module gives that seam
 * its concrete contract — a job may only be submitted through the
 * validation gate, and the backend is injected infrastructure.
 */
export interface TrainingFoundation {
  validate(dataset: TrainingDataset): DatasetValidationResult;
  split(dataset: TrainingDataset, fingerprint: DatasetFingerprint): DatasetSplit;
  submit(
    job: TrainingJob,
    validated: DatasetValidationResult,
    backend: TrainingBackend,
  ): Promise<TrainingJobResult>;
}
