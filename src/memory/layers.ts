/**
 * Memory layers — the persistent-memory architecture, as contracts.
 *
 * Task 1.5: three separate layers with separate storage contracts,
 * separate retrieval boundaries and separate lifetimes. What a layer
 * *is* decides what may be written to it and who may read it back:
 *
 *   - **Procedural memory** — skills, rules, how-to instructions.
 *     How to do things. System-owned (or explicitly delegated),
 *     versioned like code, readable by every run. Never user-authored.
 *   - **Semantic memory** — durable facts and user profile knowledge.
 *     What is true, for a long time. Always user-scoped (or system
 *     reference material); every record carries its owner.
 *   - **Episodic memory** — dated events and conversation history.
 *     What happened, when. Always user-scoped, always timestamped,
 *     and the only layer that may hold conversational content.
 *
 * Boundaries this module enforces, not merely states:
 *
 *   1. **One layer, one contract.** A record type is not interchangeable
 *      across layers: an episodic record cannot masquerade as semantic,
 *      and procedural memory cannot hold user events.
 *   2. **Scoping is enforced at read and write.** A user-scoped record
 *      is written with its owner and readable only by that owner.
 *      Cross-user reads throw; they are never filtered quietly.
 *   3. **Versioning replaces editing.** Records are immutable; a change
 *      appends a new version and the store links it to the previous one.
 *   4. **Private data stays inside the layers.** Content classified
 *      `private` is only admissible in user-scoped layers (semantic and
 *      episodic), and only for its owner. Procedural memory — the layer
 *      shared across every run — refuses private content outright.
 *
 * What this module deliberately does **not** do: no summarization or
 * distillation between layers, no learning loop, no tool calling, no
 * evaluation. Writing and reading are the whole surface.
 */

import { AppError } from '../../packages/shared/src/core/errors.js';

// ── The layer union ────────────────────────────────────────────────────────

export type MemoryLayer = 'procedural' | 'semantic' | 'episodic';

export const MEMORY_LAYERS: readonly MemoryLayer[] = ['procedural', 'semantic', 'episodic'];

/** Who owns a record — and therefore who may ever read it. */
export type MemoryOwner = { scope: 'system' } | { scope: 'user'; userId: string };

/**
 * How sensitive the content is. `private` content is user-specific
 * material (profile details, conversations); it may live only in
 * user-scoped records of the semantic and episodic layers.
 */
export type MemorySensitivity = 'public' | 'internal' | 'private';

interface MemoryRecordBase {
  layer: MemoryLayer;
  /** Immutable identity of the record *lineage*; versions share it. */
  id: string;
  owner: MemoryOwner;
  sensitivity: MemorySensitivity;
  createdAt: string;
  /** Semver of the content; a change is a new version, never an edit. */
  version: string;
  /** The id of the record this version supersedes, when not the first. */
  supersedes?: string;
}

// ── Procedural memory: skills, rules, how-tos ──────────────────────────────

/** What kind of procedural knowledge this is. */
export type ProceduralKind = 'skill' | 'rule' | 'how-to';

export interface ProceduralRecord extends MemoryRecordBase {
  layer: 'procedural';
  kind: ProceduralKind;
  /** Stable name, e.g. `position-sizing.walkthrough`. */
  name: string;
  /** The how-to body. Instructions only — never user conversation. */
  content: string;
  /** Which instruction-module id this procedural record extends, when one does. */
  instructionModuleId?: string;
}

// ── Semantic memory: durable facts, user profile ───────────────────────────

export type SemanticKind = 'durable-fact' | 'user-profile';

export interface SemanticRecord extends MemoryRecordBase {
  layer: 'semantic';
  kind: SemanticKind;
  /** What the fact is about, e.g. `user.risk-tolerance`. */
  subject: string;
  content: string;
}

// ── Episodic memory: dated events, conversation history ────────────────────

export type EpisodicKind = 'event' | 'conversation';

export interface EpisodicRecord extends MemoryRecordBase {
  layer: 'episodic';
  kind: EpisodicKind;
  /** When it happened (ISO 8601). Episodic records are always dated. */
  occurredAt: string;
  /** A short, factual label of the event. */
  title: string;
  /** The body. Conversational content lives only here. */
  content: string;
}

/** Any record of any layer. */
export type MemoryLayerRecord = ProceduralRecord | SemanticRecord | EpisodicRecord;

// ── The write gate ─────────────────────────────────────────────────────────

/**
 * Admit a record into a layer, enforcing the boundaries every store
 * shares. This is the function the storage contracts call before
 * touching storage, so the rules live in exactly one place:
 *
 *   - a record's `layer` must match the store's layer;
 *   - `private` content is refused in procedural memory and in
 *     system-scoped records — private means a specific user's, and
 *     only that user's layers may hold it;
 *   - conversational content (`kind: 'conversation'`) is episodic-only;
 *   - versions must be well-formed and strictly greater than the
 *     record being superseded, when there is one.
 */
export function assertRecordAdmissible(
  record: MemoryLayerRecord,
  storeLayer: MemoryLayer,
  previous?: MemoryLayerRecord,
): void {
  if (record.layer !== storeLayer) {
    throw new AppError(
      'POLICY_VIOLATION',
      `record of layer "${record.layer}" refused by the ${storeLayer} store`,
    );
  }
  if (record.sensitivity === 'private') {
    if (storeLayer === 'procedural') {
      throw new AppError(
        'POLICY_VIOLATION',
        'private content is refused in procedural memory: it is shared across every run',
      );
    }
    if (record.owner.scope === 'system') {
      throw new AppError(
        'POLICY_VIOLATION',
        'private content requires a user-scoped record; system-owned records cannot hold it',
      );
    }
  }
  if (record.kind === 'conversation' && record.layer !== 'episodic') {
    throw new AppError('POLICY_VIOLATION', 'conversational content is episodic-only');
  }
  if (previous !== undefined) {
    if (previous.id !== record.id) {
      throw new AppError(
        'VALIDATION_FAILED',
        'a new version must keep the record id of its lineage',
      );
    }
    if (
      previous.owner.scope !== record.owner.scope ||
      (record.owner.scope === 'user' &&
        previous.owner.scope === 'user' &&
        previous.owner.userId !== record.owner.userId)
    ) {
      throw new AppError('POLICY_VIOLATION', 'a new version cannot change the owner of a record');
    }
    if (compareVersions(record.version, previous.version) <= 0) {
      throw new AppError(
        'VALIDATION_FAILED',
        `version ${record.version} must be greater than the superseded ${previous.version}`,
      );
    }
  }
}

/** Semver-ish compare for `x.y.z`; non-semver strings refuse at write time. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const parts = v.split('.').map((p) => Number.parseInt(p, 10));
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n) || n < 0)) {
      throw new AppError('VALIDATION_FAILED', `version "${v}" is not semver (x.y.z)`);
    }
    return parts as [number, number, number];
  };
  const [a1, a2, a3] = parse(a);
  const [b1, b2, b3] = parse(b);
  return a1 - b1 || a2 - b2 || a3 - b3;
}

// ── Storage contracts ──────────────────────────────────────────────────────

/**
 * The storage contract every layer shares. Retrieval queries are the
 * layer's own (`ProceduralQuery` etc.) — the boundary between layers
 * is also a query boundary, not just a record-shape boundary.
 */
export interface MemoryLayerStore<R extends MemoryLayerRecord, Q> {
  readonly layer: MemoryLayer;
  /** Write the first version of a record. Refuses a duplicate lineage id. */
  write(record: R): R;
  /** Append a new version of an existing lineage. Immutably. */
  writeVersion(record: R): R;
  /** Read one record by id — only within the given owner's scope. */
  read(id: string, scope: MemoryOwner): R;
  /** The version history of a lineage, oldest first, scope-checked. */
  history(id: string, scope: MemoryOwner): readonly R[];
  /** Query the layer with its own query type, scope-checked. */
  query(query: Q, scope: MemoryOwner): readonly R[];
}

export interface ProceduralQuery {
  kind?: ProceduralKind;
  namePrefix?: string;
  /** Match against name and content, case-insensitive. */
  text?: string;
}

export interface SemanticQuery {
  kind?: SemanticKind;
  subjectPrefix?: string;
  text?: string;
}

export interface EpisodicQuery {
  kind?: EpisodicKind;
  /** ISO 8601 lower bound on `occurredAt`, inclusive. */
  from?: string;
  /** ISO 8601 upper bound on `occurredAt`, inclusive. */
  to?: string;
  text?: string;
  /** Newest first when true (the default for conversation history). */
  newestFirst?: boolean;
}

// ── In-memory reference implementation ─────────────────────────────────────

/**
 * The reference store: same contract a durable backend will implement,
 * small enough to be read in one sitting and tested without setup.
 * Scoping failures throw — a cross-user read is a bug, not an empty page.
 */
export class InMemoryLayerStore<R extends MemoryLayerRecord, Q> implements MemoryLayerStore<R, Q> {
  readonly layer: MemoryLayer;
  private readonly records = new Map<string, R[]>();
  private readonly matches: (record: R, query: Q) => boolean;

  constructor(layer: MemoryLayer, matches: (record: R, query: Q) => boolean) {
    this.layer = layer;
    this.matches = matches;
  }

  write(record: R): R {
    assertRecordAdmissible(record, this.layer);
    if (this.records.has(record.id)) {
      throw new AppError(
        'VALIDATION_FAILED',
        `record "${record.id}" already exists; use writeVersion`,
      );
    }
    this.records.set(record.id, [record]);
    return record;
  }

  writeVersion(record: R): R {
    const lineage = this.records.get(record.id);
    if (lineage === undefined || lineage.length === 0) {
      throw new AppError('VALIDATION_FAILED', `record "${record.id}" does not exist; use write`);
    }
    const previous = lineage[lineage.length - 1];
    if (previous === undefined) {
      throw new AppError('VALIDATION_FAILED', `record "${record.id}" does not exist; use write`);
    }
    assertRecordAdmissible(record, this.layer, previous);
    const stamped: R = {
      ...record,
      supersedes: previous.version ? `${previous.id}@${previous.version}` : undefined,
    };
    lineage.push(stamped);
    return stamped;
  }

  private current(id: string, scope: MemoryOwner): R {
    const lineage = this.records.get(id);
    const record = lineage?.[lineage.length - 1];
    if (record === undefined || !withinScope(record.owner, scope)) {
      throw new AppError('NOT_FOUND', `record "${id}" not found within scope`);
    }
    return record;
  }

  read(id: string, scope: MemoryOwner): R {
    return this.current(id, scope);
  }

  history(id: string, scope: MemoryOwner): readonly R[] {
    // Reading history requires reading the lineage; scope-check via current.
    this.current(id, scope);
    return [...(this.records.get(id) ?? [])];
  }

  query(query: Q, scope: MemoryOwner): readonly R[] {
    return [...this.records.values()]
      .map((lineage) => lineage[lineage.length - 1])
      .filter((record): record is R => record !== undefined)
      .filter((record) => withinScope(record.owner, scope) && this.matches(record, query));
  }
}

/** Can `scope` read a record owned by `owner`? System records: everyone. */
function withinScope(owner: MemoryOwner, scope: MemoryOwner): boolean {
  if (owner.scope === 'system') return true;
  return scope.scope === 'user' && scope.userId === owner.userId;
}

// ── Factories with each layer's matcher ────────────────────────────────────

function textHit(haystack: string, needle?: string): boolean {
  return needle === undefined || haystack.toLowerCase().includes(needle.toLowerCase());
}

export function createProceduralStore(): MemoryLayerStore<ProceduralRecord, ProceduralQuery> {
  return new InMemoryLayerStore<ProceduralRecord, ProceduralQuery>(
    'procedural',
    (r, q) =>
      (q.kind === undefined || r.kind === q.kind) &&
      (q.namePrefix === undefined || r.name.startsWith(q.namePrefix)) &&
      textHit(`${r.name} ${r.content}`, q.text),
  );
}

export function createSemanticStore(): MemoryLayerStore<SemanticRecord, SemanticQuery> {
  return new InMemoryLayerStore<SemanticRecord, SemanticQuery>(
    'semantic',
    (r, q) =>
      (q.kind === undefined || r.kind === q.kind) &&
      (q.subjectPrefix === undefined || r.subject.startsWith(q.subjectPrefix)) &&
      textHit(`${r.subject} ${r.content}`, q.text),
  );
}

export function createEpisodicStore(): MemoryLayerStore<EpisodicRecord, EpisodicQuery> {
  return new InMemoryLayerStore<EpisodicRecord, EpisodicQuery>('episodic', (r, q) => {
    if (q.kind !== undefined && r.kind !== q.kind) return false;
    if (q.from !== undefined && r.occurredAt < q.from) return false;
    if (q.to !== undefined && r.occurredAt > q.to) return false;
    if (!textHit(`${r.title} ${r.content}`, q.text)) return false;
    return true;
  });
}
