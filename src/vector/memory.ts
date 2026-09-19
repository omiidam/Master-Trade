/**
 * Vector memory.
 *
 * Two memories, deliberately separate:
 *   - structured records live in the database (who/what/when, queryable);
 *   - semantic retrieval lives here (nearest neighbours over embeddings).
 *
 * The vector store never *creates* knowledge. Every record carries provenance
 * and a trust level, retrieval always reports the trust level, and promotion to
 * a higher trust level requires a non-model verifier. Unverified text can be
 * retrieved but never presented as fact.
 */

import type { EpistemicKind } from '../types.js';
import { AppError, PolicyViolationError } from '../core/errors.js';
import {
  TRUST_ORDER,
  contextKindForTrust,
  promoteTrust,
  type Provenance,
  type TrustLevel,
  type TrustVerifier,
} from '../core/provenance.js';

export type MemoryRecordType =
  | 'lesson-note'
  | 'agent-insight'
  | 'user-note'
  | 'rule-hypothesis'
  | 'trade-review'
  | 'document-chunk';

export interface MemoryMetadata {
  subject: string;
  tags: string[];
  symbol?: string;
  lessonId?: string;
  createdBy: string;
  epistemicKind: EpistemicKind;
}

export interface VectorMemoryRecord {
  id: string;
  type: MemoryRecordType;
  text: string;
  metadata: MemoryMetadata;
  provenance: Provenance;
  trust: TrustLevel;
  version: number;
  embedding: number[] | null;
  embeddingModel: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface MemoryVersion {
  version: number;
  text: string;
  changedBy: string;
  recordedAt: string;
}

/** Provider-agnostic embedding interface. */
export interface EmbeddingProvider {
  readonly id: string;
  readonly model: string;
  readonly dimensions: number;
  embed(texts: readonly string[], signal?: AbortSignal): Promise<number[][]>;
}

/** Deterministic local embedder: offline, free, good enough for ranking tests. */
export function hashEmbeddingProvider(
  options: { dimensions?: number; model?: string } = {},
): EmbeddingProvider {
  const dimensions = options.dimensions ?? 32;
  return {
    id: 'local-hash',
    model: options.model ?? `hash-${dimensions}`,
    dimensions,
    async embed(texts) {
      return texts.map((text) => embedText(text, dimensions));
    },
  };
}

export function embedText(text: string, dimensions: number): number[] {
  const vector: number[] = new Array<number>(dimensions).fill(0);
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  for (const token of tokens) {
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      hash = (hash * 31 + token.charCodeAt(i)) % 100_003;
    }
    vector[hash % dimensions] = (vector[hash % dimensions] as number) + 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] as number;
    const y = b[i] as number;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface MemoryQuery {
  text: string;
  topK?: number;
  types?: MemoryRecordType[];
  /** Minimum trust required for a record to be returned. */
  minTrust?: TrustLevel;
  subject?: string;
  symbol?: string;
  includeDeleted?: boolean;
  /** Retrieval floor; records below this are dropped. */
  minScore?: number;
}

export interface RankedMemory {
  record: VectorMemoryRecord;
  score: number;
  /** How the result must be labelled when handed to the model. */
  contextKind: EpistemicKind;
}

export interface UpsertMemoryInput {
  /** Omit to create; supply to update an existing record (version increments). */
  id?: string;
  type: MemoryRecordType;
  text: string;
  metadata: MemoryMetadata;
  provenance: Provenance;
  /** Identity performing the write, for the version history. */
  actorId: string;
}

export interface VectorMemoryStore {
  upsert(input: UpsertMemoryInput): Promise<VectorMemoryRecord>;
  get(id: string): VectorMemoryRecord | undefined;
  query(query: MemoryQuery): Promise<RankedMemory[]>;
  promote(
    id: string,
    to: TrustLevel,
    verifier: TrustVerifier,
    actorId: string,
  ): Promise<VectorMemoryRecord>;
  tombstone(id: string, actorId: string): boolean;
  versions(id: string): MemoryVersion[];
  all(): readonly VectorMemoryRecord[];
}

export interface InMemoryVectorMemoryOptions {
  embedder?: EmbeddingProvider;
  topK?: number;
  minScore?: number;
  idFactory?: () => string;
  now?: () => string;
}

export class InMemoryVectorMemory implements VectorMemoryStore {
  private readonly embedder: EmbeddingProvider;
  private readonly defaultTopK: number;
  private readonly defaultMinScore: number;
  private readonly idFactory: () => string;
  private readonly now: () => string;
  private readonly records = new Map<string, VectorMemoryRecord>();
  private readonly history = new Map<string, MemoryVersion[]>();
  private counter = 0;

  constructor(options: InMemoryVectorMemoryOptions = {}) {
    this.embedder = options.embedder ?? hashEmbeddingProvider();
    this.defaultTopK = options.topK ?? 8;
    this.defaultMinScore = options.minScore ?? 0.1;
    this.idFactory = options.idFactory ?? (() => `mem_${++this.counter}`);
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async upsert(input: UpsertMemoryInput): Promise<VectorMemoryRecord> {
    if (input.text.trim().length === 0) {
      throw new AppError('VALIDATION_FAILED', 'memory text must not be empty');
    }
    if (input.provenance.ref.trim().length === 0) {
      throw new AppError('VALIDATION_FAILED', 'memory provenance must reference a source');
    }

    const timestamp = this.now();
    const [embedding] = await this.embedder.embed([input.text]);
    if (!embedding) throw new AppError('INTERNAL', 'embedding provider returned no vector');

    const existing = input.id === undefined ? undefined : this.records.get(input.id);
    if (existing) {
      const updated: VectorMemoryRecord = {
        ...existing,
        text: input.text,
        metadata: input.metadata,
        provenance: input.provenance,
        version: existing.version + 1,
        embedding,
        embeddingModel: this.embedder.model,
        updatedAt: timestamp,
      };
      this.records.set(updated.id, updated);
      this.pushVersion(updated.id, input.actorId, timestamp, input.text);
      return updated;
    }

    const record: VectorMemoryRecord = {
      id: input.id ?? this.idFactory(),
      type: input.type,
      text: input.text,
      metadata: input.metadata,
      provenance: input.provenance,
      // Structural rule: model-authored material starts (and stays) unverified.
      trust: input.provenance.source === 'model' ? 'unverified' : input.provenance.trust,
      version: 1,
      embedding,
      embeddingModel: this.embedder.model,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.records.set(record.id, record);
    this.pushVersion(record.id, input.actorId, timestamp, input.text);
    return record;
  }

  get(id: string): VectorMemoryRecord | undefined {
    return this.records.get(id);
  }

  all(): readonly VectorMemoryRecord[] {
    return [...this.records.values()];
  }

  async query(query: MemoryQuery): Promise<RankedMemory[]> {
    const [queryVector] = await this.embedder.embed([query.text]);
    if (!queryVector) throw new AppError('INTERNAL', 'embedding provider returned no vector');
    const topK = query.topK ?? this.defaultTopK;
    const minScore = query.minScore ?? this.defaultMinScore;

    return [...this.records.values()]
      .filter((record) => (query.includeDeleted ? true : record.deletedAt === undefined))
      .filter((record) => (query.types ? query.types.includes(record.type) : true))
      .filter((record) =>
        query.minTrust ? TRUST_ORDER[record.trust] >= TRUST_ORDER[query.minTrust] : true,
      )
      .filter((record) => (query.subject ? record.metadata.subject === query.subject : true))
      .filter((record) => (query.symbol ? record.metadata.symbol === query.symbol : true))
      .map((record) => ({
        record,
        score: record.embedding ? cosineSimilarity(queryVector, record.embedding) : 0,
        contextKind: contextKindForTrust(record.trust),
      }))
      .filter((ranked) => ranked.score >= minScore)
      .sort((a, b) => b.score - a.score || a.record.id.localeCompare(b.record.id))
      .slice(0, topK);
  }

  async promote(
    id: string,
    to: TrustLevel,
    verifier: TrustVerifier,
    actorId: string,
  ): Promise<VectorMemoryRecord> {
    const record = this.records.get(id);
    if (!record) throw new AppError('NOT_FOUND', `memory record ${id} not found`);
    const trust = promoteTrust(record.trust, to, verifier);
    if (trust === record.trust) return record;
    const timestamp = this.now();
    const updated: VectorMemoryRecord = {
      ...record,
      trust,
      version: record.version + 1,
      updatedAt: timestamp,
    };
    this.records.set(id, updated);
    this.pushVersion(
      id,
      actorId,
      timestamp,
      `[trust -> ${trust} by ${verifier.kind}:${verifier.id}]`,
    );
    return updated;
  }

  tombstone(id: string, actorId: string): boolean {
    const record = this.records.get(id);
    if (!record) return false;
    const timestamp = this.now();
    this.records.set(id, {
      ...record,
      deletedAt: timestamp,
      version: record.version + 1,
      updatedAt: timestamp,
    });
    this.pushVersion(id, actorId, timestamp, '[tombstoned]');
    return true;
  }

  versions(id: string): MemoryVersion[] {
    return [...(this.history.get(id) ?? [])];
  }

  private pushVersion(recordId: string, changedBy: string, recordedAt: string, text: string): void {
    const list = this.history.get(recordId) ?? [];
    const version = list.length + 1;
    list.push({ version, text, changedBy, recordedAt });
    this.history.set(recordId, list);
  }
}

/** Guard used by callers that must not surface a deleted record. */
export function requireLiveRecord(record: VectorMemoryRecord | undefined): VectorMemoryRecord {
  if (!record || record.deletedAt !== undefined) {
    throw new PolicyViolationError('memory record is missing or deleted');
  }
  return record;
}
