/**
 * Memory repository — owner: `memory`.
 *
 * The persistence model for agent memory. Four rules, each enforced in code *and*
 * in the schema (`src/db/schema.ts`), because the failure mode here is quiet:
 *
 *   1. **Provenance is mandatory.** Every record carries a source and a reference.
 *      A memory without provenance is not representable.
 *   2. **A model write can never be trusted.** `create()` forces
 *      `unverified` unless a verifier id is supplied, and — unlike every other
 *      repository — it does not accept a `verifiedBy` from a model-originated
 *      call site: the parameter is typed as a human principal id and must be
 *      present for the human-verified trust levels.
 *   3. **Promotion requires a human.** `setTrust('verified'|'authoritative')`
 *      without a `verifiedBy` throws, and the schema CHECK makes the same state
 *      unwritable by another route later.
 *   4. **History is append-only.** Every revision writes a `memory_versions` row
 *      in the same transaction, so a claim can always be rolled back to what it
 *      said when it was trusted. Deletion is a tombstone, never a DELETE.
 *
 * Embeddings live in their own table keyed by model, so migrating embedding models
 * is a re-embedding job rather than a rewrite of the memory records.
 */

import { AppError, PolicyViolationError } from '../../core/errors.js';
import { ids } from '../../core/ids.js';
import type { SqlExecutor } from '../executor.js';
import { Table } from '../table.js';
import type { Owner } from '../ownership.js';
import { HUMAN_VERIFIED_TRUST_LEVELS, MEMORY_TRUST_LEVELS, type TableName } from '../schema.js';

export const OWNER: Owner = 'memory';
export const OWNED_TABLES: readonly TableName[] = [
  'memory_records',
  'memory_versions',
  'memory_embeddings',
];

export type MemoryTrust = (typeof MEMORY_TRUST_LEVELS)[number];
export type MemoryType =
  'lesson-note' | 'trade-review' | 'rule-rationale' | 'mistake' | 'strength' | 'glossary';
export type EpistemicKind = 'fact' | 'analysis' | 'hypothesis' | 'uncertainty';

export interface MemoryRecordRow {
  id: string;
  user_id: string | null;
  type: MemoryType;
  text: string;
  provenance_source: string;
  provenance_ref: string;
  trust: MemoryTrust;
  epistemic_kind: EpistemicKind;
  version: number;
  verified_by: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemoryVersionRow {
  id: string;
  record_id: string;
  /** Orders the entries within a record; always increases. */
  history_index: number;
  /** The record version each entry documents (trust changes do not bump it). */
  version: number;
  text: string;
  metadata: unknown;
  changed_by: string;
  created_at: string;
}

export interface MemoryEmbeddingRow {
  id: string;
  record_id: string;
  model: string;
  dimensions: number;
  vector: number[];
  created_at: string;
}

export interface MemoryRepositoryOptions {
  now?: () => number;
  newId?: (kind: string) => string;
}

export interface CreateMemoryInput {
  userId?: string | null;
  type: MemoryType;
  text: string;
  provenance: { source: string; ref: string };
  epistemicKind: EpistemicKind;
  /** Human verifier id. Present only when a person has checked the claim. */
  verifiedBy?: string;
  trust?: MemoryTrust;
  /** Who or what created the record, recorded in the first version row. */
  createdBy: string;
}

export class MemoryRepository {
  private readonly db: SqlExecutor;
  private readonly records: Table<MemoryRecordRow>;
  private readonly versions: Table<MemoryVersionRow>;
  private readonly embeddings: Table<MemoryEmbeddingRow>;
  private readonly now: () => number;
  private readonly newId: (kind: string) => string;

  constructor(db: SqlExecutor, options: MemoryRepositoryOptions = {}) {
    this.db = db;
    this.records = new Table<MemoryRecordRow>(db, 'memory_records');
    this.versions = new Table<MemoryVersionRow>(db, 'memory_versions');
    this.embeddings = new Table<MemoryEmbeddingRow>(db, 'memory_embeddings');
    this.now = options.now ?? Date.now;
    this.newId = options.newId ?? ((kind) => ids.id(kind));
  }

  private iso(): string {
    return new Date(this.now()).toISOString();
  }

  /**
   * Append one immutable history entry, numbered per record. The index is read
   * inside the caller's transaction, and the unique index on
   * (record_id, history_index) turns a lost race into a failed write rather than
   * a rewritten history.
   */
  private async appendHistory(
    tx: SqlExecutor,
    input: {
      recordId: string;
      version: number;
      text: string;
      metadata: Record<string, unknown>;
      changedBy: string;
      at: string;
    },
  ): Promise<void> {
    const versions = new Table<MemoryVersionRow>(tx, 'memory_versions');
    const row = await tx.queryOne(
      `SELECT MAX(${tx.dialect.quote('history_index')}) AS latest FROM ${tx.dialect.quote(
        'memory_versions',
      )} WHERE ${tx.dialect.quote('record_id')} = ?`,
      [input.recordId],
    );
    const latest = row?.latest === null || row?.latest === undefined ? 0 : Number(row.latest);
    await versions.insert({
      id: this.newId('memv'),
      record_id: input.recordId,
      history_index: latest + 1,
      version: input.version,
      text: input.text,
      metadata: input.metadata,
      changed_by: input.changedBy,
      created_at: input.at,
    });
  }

  /**
   * Create a memory record at version 1. Trust defaults to `unverified`; a
   * human-verified level is only writable when a `verifiedBy` id is supplied.
   */
  async create(input: CreateMemoryInput): Promise<MemoryRecordRow> {
    const trust = input.trust ?? 'unverified';
    if (HUMAN_VERIFIED_TRUST_LEVELS.includes(trust) && !input.verifiedBy) {
      throw new PolicyViolationError(
        `Trust level "${trust}" requires a human verifier; automation cannot promote a memory`,
        { trust },
      );
    }
    if (input.text.trim().length === 0) {
      throw new AppError('VALIDATION_FAILED', 'A memory record needs text');
    }
    const at = this.iso();
    const id = this.newId('mem');
    const record = await this.records.insert({
      id,
      user_id: input.userId ?? null,
      type: input.type,
      text: input.text,
      provenance_source: input.provenance.source,
      provenance_ref: input.provenance.ref,
      trust,
      epistemic_kind: input.epistemicKind,
      version: 1,
      verified_by: input.verifiedBy ?? null,
      deleted_at: null,
      created_at: at,
      updated_at: at,
    });
    await this.db.transaction((tx) =>
      this.appendHistory(tx, {
        recordId: id,
        version: 1,
        text: input.text,
        metadata: { action: 'create', trust, createdBy: input.createdBy },
        changedBy: input.createdBy,
        at,
      }),
    );
    return record;
  }

  record(id: string): Promise<MemoryRecordRow | null> {
    return this.records.findById(id);
  }

  /** Live records for a user (tombstoned rows are excluded by default). */
  listForUser(
    userId: string,
    options: { includeDeleted?: boolean } = {},
  ): Promise<MemoryRecordRow[]> {
    const where =
      options.includeDeleted === true ? { user_id: userId } : { user_id: userId, deleted_at: null };
    return this.records.findMany(where, { orderBy: 'created_at', direction: 'desc', limit: 1_000 });
  }

  /** Retrieval by trust floor; the vector index provider ranks the results later. */
  listByTrust(
    trusts: readonly MemoryTrust[],
    options: { limit?: number } = {},
  ): Promise<MemoryRecordRow[]> {
    return this.records
      .findMany(
        { deleted_at: null },
        { orderBy: 'updated_at', direction: 'desc', limit: options.limit ?? 500 },
      )
      .then((rows) => rows.filter((row) => trusts.includes(row.trust)));
  }

  /**
   * Revise the text of a record. Writes an immutable version row and bumps the
   * record, in one transaction: a crash between the two would leave a version
   * history that does not match the current text, which is exactly the state an
   * audit is supposed to rule out.
   */
  async revise(
    id: string,
    input: { text: string; changedBy: string; metadata?: Record<string, unknown> },
  ): Promise<MemoryRecordRow> {
    const record = await this.records.findById(id);
    if (!record) throw new AppError('NOT_FOUND', `Memory record ${id} was not found`);
    if (record.deleted_at !== null) {
      throw new PolicyViolationError('A tombstoned memory record cannot be revised', { id });
    }
    if (input.text.trim().length === 0) {
      throw new AppError('VALIDATION_FAILED', 'A memory revision needs text');
    }
    const at = this.iso();
    const nextVersion = record.version + 1;
    return this.db.transaction(async (tx) => {
      const records = new Table<MemoryRecordRow>(tx, 'memory_records');
      await this.appendHistory(tx, {
        recordId: id,
        version: nextVersion,
        text: input.text,
        metadata: { action: 'revise', ...(input.metadata ?? {}) },
        changedBy: input.changedBy,
        at,
      });
      const updated = await records.update(id, {
        text: input.text,
        version: nextVersion,
        updated_at: at,
      });
      if (!updated) throw new AppError('INTERNAL', 'Memory revision did not persist');
      return updated;
    });
  }

  /**
   * Promote (or lower) trust. Promotion to a human-verified level requires a
   * verifier id and is recorded as its own version, so "who trusted this, and
   * when" is answerable.
   */
  async setTrust(
    id: string,
    trust: MemoryTrust,
    input: { verifiedBy?: string; changedBy: string; note?: string },
  ): Promise<MemoryRecordRow> {
    const record = await this.records.findById(id);
    if (!record) throw new AppError('NOT_FOUND', `Memory record ${id} was not found`);
    // A human decision is not silently withdrawn. Lowering a verified record
    // would leave the claim retrievable while quietly dropping the fact that a
    // person checked it — the record should be tombstoned and replaced instead.
    if (
      HUMAN_VERIFIED_TRUST_LEVELS.includes(record.trust) &&
      !HUMAN_VERIFIED_TRUST_LEVELS.includes(trust)
    ) {
      throw new PolicyViolationError(
        `A memory at trust level "${record.trust}" cannot be demoted implicitly; tombstone it and record the replacement`,
        { id, from: record.trust, to: trust },
      );
    }
    if (record.trust === trust) {
      return record;
    }
    const needsVerifier = HUMAN_VERIFIED_TRUST_LEVELS.includes(trust);
    if (needsVerifier && !input.verifiedBy) {
      throw new PolicyViolationError(`Promoting to "${trust}" requires a human verifier id`, {
        id,
        trust,
      });
    }
    const at = this.iso();
    return this.db.transaction(async (tx) => {
      const records = new Table<MemoryRecordRow>(tx, 'memory_records');
      await this.appendHistory(tx, {
        recordId: id,
        version: record.version,
        text: record.text,
        metadata: {
          action: 'trust',
          from: record.trust,
          to: trust,
          verifiedBy: input.verifiedBy ?? null,
          note: input.note ?? null,
        },
        changedBy: input.changedBy,
        at,
      });
      const updated = await records.update(id, {
        trust,
        verified_by: needsVerifier ? (input.verifiedBy ?? null) : null,
        updated_at: at,
      });
      if (!updated) throw new AppError('INTERNAL', 'Trust update did not persist');
      return updated;
    });
  }

  /** Tombstone: the record stops being retrievable, its history is kept. */
  async tombstone(
    id: string,
    input: { changedBy: string; reason?: string },
  ): Promise<MemoryRecordRow> {
    const record = await this.records.findById(id);
    if (!record) throw new AppError('NOT_FOUND', `Memory record ${id} was not found`);
    if (record.deleted_at !== null) return record;
    const at = this.iso();
    return this.db.transaction(async (tx) => {
      const records = new Table<MemoryRecordRow>(tx, 'memory_records');
      await this.appendHistory(tx, {
        recordId: id,
        version: record.version,
        text: record.text,
        metadata: { action: 'tombstone', reason: input.reason ?? null },
        changedBy: input.changedBy,
        at,
      });
      const updated = await records.update(id, { deleted_at: at, updated_at: at });
      if (!updated) throw new AppError('INTERNAL', 'Tombstone did not persist');
      return updated;
    });
  }

  /** Full edit history, oldest first. */
  history(recordId: string): Promise<MemoryVersionRow[]> {
    return this.versions.findMany(
      { record_id: recordId },
      { orderBy: 'history_index', direction: 'asc', limit: 1_000 },
    );
  }

  /* ---------------------------------------------------------- embeddings */

  /** Store (or replace) the vector for a record under one model. */
  async putEmbedding(
    recordId: string,
    input: { model: string; vector: readonly number[] },
  ): Promise<MemoryEmbeddingRow> {
    if (input.vector.length === 0) {
      throw new AppError('VALIDATION_FAILED', 'An embedding must have a non-zero dimension');
    }
    const existing = await this.embeddings.findOne({ record_id: recordId, model: input.model });
    if (existing) {
      const updated = await this.embeddings.update(existing.id, {
        vector: [...input.vector],
        dimensions: input.vector.length,
      });
      if (!updated) throw new AppError('INTERNAL', 'Embedding update did not persist');
      return updated;
    }
    return this.embeddings.insert({
      id: this.newId('embe'),
      record_id: recordId,
      model: input.model,
      dimensions: input.vector.length,
      vector: [...input.vector],
      created_at: this.iso(),
    });
  }

  embeddingsFor(recordId: string, model?: string): Promise<MemoryEmbeddingRow[]> {
    return this.embeddings.findMany(
      model === undefined ? { record_id: recordId } : { record_id: recordId, model },
      { orderBy: 'created_at', direction: 'asc' },
    );
  }

  /** Records that still need a vector for a model — the re-embedding work list. */
  async recordsMissingEmbedding(model: string, limit = 100): Promise<MemoryRecordRow[]> {
    const rows = await this.db.queryAll(
      `SELECT r.* FROM ${this.db.dialect.quote('memory_records')} r
         LEFT JOIN ${this.db.dialect.quote('memory_embeddings')} e
           ON e.${this.db.dialect.quote('record_id')} = r.${this.db.dialect.quote('id')}
          AND e.${this.db.dialect.quote('model')} = ?
        WHERE r.${this.db.dialect.quote('deleted_at')} IS NULL
          AND e.${this.db.dialect.quote('id')} IS NULL
        ${this.db.dialect.limitClause(limit, 0)}`,
      [model],
    );
    return rows.map((row) => ({
      id: String(row.id),
      user_id: (row.user_id as string | null) ?? null,
      type: String(row.type) as MemoryType,
      text: String(row.text),
      provenance_source: String(row.provenance_source),
      provenance_ref: String(row.provenance_ref),
      trust: String(row.trust) as MemoryTrust,
      epistemic_kind: String(row.epistemic_kind) as EpistemicKind,
      version: Number(row.version),
      verified_by: (row.verified_by as string | null) ?? null,
      deleted_at: (row.deleted_at as string | null) ?? null,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    }));
  }

  async counts(): Promise<{ records: number; live: number; byTrust: Record<string, number> }> {
    const all = await this.records.findMany({}, { limit: 10_000 });
    const byTrust: Record<string, number> = {};
    for (const row of all) byTrust[row.trust] = (byTrust[row.trust] ?? 0) + 1;
    return {
      records: all.length,
      live: all.filter((row) => row.deleted_at === null).length,
      byTrust,
    };
  }
}

export function createMemoryRepository(
  db: SqlExecutor,
  options: MemoryRepositoryOptions = {},
): MemoryRepository {
  return new MemoryRepository(db, options);
}
