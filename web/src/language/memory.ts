/**
 * The language memory — a store whose whole job is to make a *trusted* correction possible.
 *
 * The problem this solves, in one sentence: a language layer that can be corrected by anyone, from
 * anywhere, without a trace, is not a language layer — it is a cache of whatever the last writer
 * believed. So the update path is deliberately narrow:
 *
 *   new knowledge → validate → version → persist   (and a review, before anything is trusted)
 *
 * Applying that literally gives four operations and no others:
 *
 *   1. **`propose`** — a caller asks. The proposal is schema-validated before it is looked at, the
 *      `baseVersion` it claims is checked against reality, and the *status* it ends up with is
 *      decided by the store from its origin, never by the caller. A proposal from `agent-proposal`
 *      is recorded as `pending` and **cannot touch a trusted entry**, no matter what it says.
 *   2. **`review`** — a person decides. Accepting promotes the pending revision and bumps the
 *      version; rejecting drops it. An `agent-proposal` may not review itself. This is the only
 *      path by which model output becomes interface copy.
 *   3. **`deprecate`** — a human retires an entry. It is kept, not deleted: a screen that shipped
 *      with that wording must remain explainable.
 *   4. **`snapshot` / `from`** — the persistence seam. The store is in memory, exactly as
 *      `src/memory/store.ts` was in Phase 1, and the snapshot is what a durable store will one day
 *      write and read. Both directions validate: a snapshot that does not match the schema, or that
 *      was written by a format this build does not know, is refused rather than half-loaded.
 *
 * Two details that are easy to get wrong and are therefore explicit:
 *
 *   - **Nothing is edited in place.** Every accepted change is a new version of the key, and the
 *     version it replaced is archived, so `revisions(key)` answers "what did this say, and when"
 *     rather than only "what does it say".
 *   - **Every mutation is logged.** The log is append-only and records the version it moved from and
 *     to, the origin and the reference for each action, so provenance survives an update.
 *
 * What is deferred, and named as deferred rather than faked: a durable store. There is no database
 * table behind this yet, and — importantly — the entry schema has no field a credential could sit
 * in. A language rule is product knowledge; a secret is not knowledge, and the two never share a
 * shape (see `docs/persian-language.md`).
 */

// No `.js` extension: the frontend reaches the shared package through the declared alias surface,
// which is an exact-match resolver map (see `config/sharedSurface.ts`) — that is the boundary.
import { AppError } from '@shared/core/errors';
import {
  LANGUAGE_LOCALE,
  LANGUAGE_SNAPSHOT_FORMAT,
  LANGUAGE_SNAPSHOT_FORMAT_VERSION,
  languageEntrySchema,
  languageProposalSchema,
  isTrustedOrigin,
  isAgentMemoryId,
  languageSnapshotSchema,
  type LanguageChange,
  type LanguageKnowledgeEntry,
  type LanguageKnowledgeKind,
  type LanguageOrigin,
  type LanguageProposal,
  type LanguageReviewDecision,
  type LanguageSnapshot,
} from './model.js';

/** The result of a proposal: knowledge that is now current, or knowledge waiting for a reviewer. */
export interface LanguageProposalResult {
  outcome: 'applied' | 'pending';
  entry: LanguageKnowledgeEntry;
}

/** What a review or a deprecation needs to say about itself. */
export interface LanguageReviewInput {
  decision: LanguageReviewDecision;
  origin: LanguageOrigin;
  reference: string;
  at: string;
  /** The version the reviewer believes is current, so a review cannot land on a moved entry. */
  expectedVersion: number;
}

export interface LanguageDeprecation {
  origin: LanguageOrigin;
  reference: string;
  at: string;
  expectedVersion: number;
}

/** A validation failure, stated with the issues rather than as a sentence. */
function invalid(reason: string, details?: Record<string, unknown>): never {
  throw new AppError('VALIDATION_FAILED', reason, details === undefined ? {} : { details });
}

/** A rule the language layer refuses to break, stated with its code. */
function violation(reason: string, details?: Record<string, unknown>): never {
  throw new AppError('POLICY_VIOLATION', reason, details === undefined ? {} : { details });
}

/** A write against knowledge that has moved since the writer looked at it. */
function stale(key: string, expected: number, actual: number | undefined): never {
  throw new AppError('CONFLICT', `\`${key}\` has moved since this proposal was written`, {
    details: { key, expectedVersion: expected, version: actual ?? 0 },
  });
}

/**
 * Turn a proposal into an entry, with the status the *origin* earns rather than the one asked for.
 *
 * The version is the proposal's `baseVersion + 1`, which is what makes a correction a new version
 * of an existing key instead of a rewrite: version 1 is what a first proposal produces, so the
 * counter never starts at zero and there is no "unversioned" state to fall into.
 */
function entryFrom(proposal: LanguageProposal): LanguageKnowledgeEntry {
  return {
    key: proposal.key,
    kind: proposal.kind,
    locale: LANGUAGE_LOCALE,
    value: proposal.value,
    status: isTrustedOrigin(proposal.origin) ? 'trusted' : 'proposed',
    confidence: proposal.confidence ?? 0.5,
    version: proposal.baseVersion + 1,
    provenance: {
      origin: proposal.origin,
      reference: proposal.reference,
      recordedAt: proposal.recordedAt,
    },
    examples: proposal.examples ?? [],
    mapping: proposal.mapping ?? null,
    notes: proposal.notes ?? null,
  };
}

/**
 * The store.
 *
 * Construct it empty, from trusted entries, or with `LanguageMemory.seeded()` for the knowledge
 * this phase ships (the orthographic rules that come from Unicode itself — see `seed.ts`).
 */
export class LanguageMemory {
  private readonly current = new Map<string, LanguageKnowledgeEntry>();
  /** Superseded versions, oldest first, per key. A correction archives; it never deletes. */
  private readonly superseded = new Map<string, LanguageKnowledgeEntry[]>();
  /** Proposals waiting for a reviewer, per key. At most one per key: a newer one replaces it. */
  private readonly waiting = new Map<string, LanguageKnowledgeEntry>();
  private readonly changes: LanguageChange[] = [];
  private clock = 0;

  private constructor(entries: readonly LanguageKnowledgeEntry[], memoryVersion = 0) {
    for (const entry of entries) {
      this.current.set(entry.key, entry);
    }
    this.clock = memoryVersion;
  }

  /**
   * A store holding exactly these entries, validated.
   *
   * `unknown[]` rather than `LanguageKnowledgeEntry[]` on purpose: the caller passing a parsed
   * snapshot is passing values this build has never checked, and typed-but-unchecked data is how a
   * malformed record reaches a screen.
   */
  static of(entries: readonly unknown[]): LanguageMemory {
    const parsed = entries.map((entry) => languageEntrySchema.safeParse(entry));
    const failed = parsed.filter((result) => !result.success);
    if (failed.length > 0) {
      invalid('a language entry is not valid', {
        issues: failed.flatMap((result) => (result.success ? [] : result.error.issues)),
      });
    }
    return new LanguageMemory(parsed.flatMap((result) => (result.success ? [result.data] : [])));
  }

  /** Read a persisted snapshot. The format is checked before any of it is believed. */
  static from(snapshot: unknown): LanguageMemory {
    const parsed = languageSnapshotSchema.safeParse(snapshot);
    if (!parsed.success) {
      const format = (snapshot as { format?: unknown } | null)?.format;
      if (format !== undefined && format !== LANGUAGE_SNAPSHOT_FORMAT) {
        invalid('this snapshot was not written by the language layer', { format });
      }
      invalid('the language snapshot is not valid', { issues: parsed.error.issues });
    }
    return new LanguageMemory(parsed.data.entries, parsed.data.memoryVersion);
  }

  /**
   * The addressing rule, applied where it matters: a language entry can never be an Agent Memory
   * record. `mem_*` ids belong to `src/memory/store.ts`, and a key that read as one — `mem_1` is a
   * legal key shape — would put product knowledge in the wrong store, so it is refused at the door.
   */
  private static assertKeyAddressable(key: string): void {
    if (isAgentMemoryId(key)) {
      violation('a language key must not read as an Agent Memory id', { key });
    }
  }

  /** The current entry for a key, or nothing. A pending proposal is not current knowledge. */
  get(key: string): LanguageKnowledgeEntry | undefined {
    return this.current.get(key);
  }

  /** Every current entry, by key. Stable order, so a snapshot of this is diffable. */
  list(kind?: LanguageKnowledgeKind): LanguageKnowledgeEntry[] {
    const entries = [...this.current.values()].sort((left, right) =>
      left.key < right.key ? -1 : left.key > right.key ? 1 : 0,
    );
    return kind === undefined ? entries : entries.filter((entry) => entry.kind === kind);
  }

  /** The entries the interface is allowed to render as copy. */
  trusted(): LanguageKnowledgeEntry[] {
    return this.list().filter((entry) => entry.status === 'trusted');
  }

  /** The proposal waiting on a reviewer for this key, if there is one. */
  pending(key: string): LanguageKnowledgeEntry | undefined {
    return this.waiting.get(key);
  }

  /** Every version of a key this store still holds, oldest first: superseded, current, pending. */
  revisions(key: string): LanguageKnowledgeEntry[] {
    const history = this.superseded.get(key) ?? [];
    const living = [this.current.get(key), this.waiting.get(key)].filter(
      (entry): entry is LanguageKnowledgeEntry => entry !== undefined,
    );
    return [...history, ...living];
  }

  /** The append-only log, in the order things happened. */
  history(): readonly LanguageChange[] {
    return this.changes;
  }

  /**
   * Ask to add or correct knowledge.
   *
   * The three things that make this a *controlled* update rather than a write:
   *
   *   1. the proposal is validated before anything else happens, so no malformed knowledge is
   *      recorded even as a proposal;
   *   2. `baseVersion` must match what the store holds, so a proposal written against version 2
   *      cannot silently replace version 4;
   *   3. a proposal from `agent-proposal` is never applied — it is parked as `pending`, whatever
   *      status it claimed, and it cannot overwrite a trusted entry even with a correct
   *      `baseVersion`.
   */
  propose(proposal: unknown): LanguageProposalResult {
    const parsed = languageProposalSchema.safeParse(proposal);
    if (!parsed.success) {
      invalid('the language proposal is not valid', { issues: parsed.error.issues });
    }
    const asked = parsed.data;
    LanguageMemory.assertKeyAddressable(asked.key);

    const existing = this.current.get(asked.key);
    const actualVersion = existing?.version ?? 0;
    if (asked.baseVersion !== actualVersion) {
      stale(asked.key, asked.baseVersion, existing?.version);
    }

    const entry = entryFrom(asked);

    if (!isTrustedOrigin(asked.origin)) {
      // Unreviewed output. Recorded, addressable as pending, and explicitly not current knowledge.
      // A newer proposal for the same key replaces the older waiting one, so the queue cannot grow
      // into a pile of stale suggestions — each proposal carries its own `baseVersion`, and a
      // proposal for a version that is no longer current would be refused above.
      this.waiting.set(asked.key, entry);
      this.record(
        'proposed',
        asked.key,
        actualVersion,
        entry.version,
        asked.origin,
        asked.reference,
        asked.recordedAt,
      );
      return { outcome: 'pending', entry };
    }

    this.apply(entry);
    this.record(
      'applied',
      asked.key,
      actualVersion,
      entry.version,
      asked.origin,
      asked.reference,
      asked.recordedAt,
    );
    return { outcome: 'applied', entry };
  }

  /**
   * Promote or drop the proposal waiting on a key.
   *
   * Acceptance is the only way a status becomes `trusted` after the fact, and it requires a
   * trusted origin — which is why an agent cannot review its own proposal even by calling this
   * with `decision: 'accept'`.
   */
  review(key: string, input: LanguageReviewInput): LanguageKnowledgeEntry | undefined {
    if (!isTrustedOrigin(input.origin)) {
      violation('a proposal cannot be reviewed by the origin that proposed it', {
        key,
        origin: input.origin,
      });
    }
    const waiting = this.waiting.get(key);
    if (waiting === undefined) {
      throw new AppError('NOT_FOUND', `\`${key}\` has no proposal waiting for a review`, {
        details: { key },
      });
    }
    const currentVersion = this.current.get(key)?.version ?? 0;
    if (input.expectedVersion !== currentVersion) {
      stale(key, input.expectedVersion, currentVersion);
    }

    this.waiting.delete(key);
    if (input.decision === 'reject') {
      this.record(
        'rejected',
        key,
        currentVersion,
        waiting.version,
        input.origin,
        input.reference,
        input.at,
      );
      return undefined;
    }

    const promoted: LanguageKnowledgeEntry = {
      ...waiting,
      status: 'trusted',
      version: currentVersion + 1,
      provenance: { origin: input.origin, reference: input.reference, recordedAt: input.at },
    };
    this.apply(promoted);
    this.record(
      'promoted',
      key,
      currentVersion,
      promoted.version,
      input.origin,
      input.reference,
      input.at,
    );
    return promoted;
  }

  /**
   * Retire an entry without losing it.
   *
   * Deprecation is a *version*, not a deletion: the entry it replaced is archived and the retired
   * one stays addressable, so a screen that shipped with that wording can still be explained and a
   * later phase can still diff against it.
   */
  deprecate(key: string, input: LanguageDeprecation): LanguageKnowledgeEntry {
    if (!isTrustedOrigin(input.origin)) {
      violation('deprecating knowledge is a reviewed decision', { key, origin: input.origin });
    }
    const existing = this.current.get(key);
    if (existing === undefined) {
      throw new AppError('NOT_FOUND', `\`${key}\` is not in the language memory`, {
        details: { key },
      });
    }
    if (input.expectedVersion !== existing.version) {
      stale(key, input.expectedVersion, existing.version);
    }
    const retired: LanguageKnowledgeEntry = {
      ...existing,
      status: 'deprecated',
      version: existing.version + 1,
      provenance: { origin: input.origin, reference: input.reference, recordedAt: input.at },
    };
    this.apply(retired);
    this.record(
      'deprecated',
      key,
      existing.version,
      retired.version,
      input.origin,
      input.reference,
      input.at,
    );
    return retired;
  }

  /** The whole store as a serializable value: current knowledge only, plus what has been asked. */
  snapshot(): LanguageSnapshot {
    return {
      format: LANGUAGE_SNAPSHOT_FORMAT,
      formatVersion: LANGUAGE_SNAPSHOT_FORMAT_VERSION,
      memoryVersion: this.clock,
      entries: this.list(),
    };
  }

  /**
   * Replace the current entry, keeping what it replaced.
   *
   * The one write path for accepted knowledge, and deliberately the only one that is not itself
   * logged: the *caller* logs why the write happened (`applied`, `promoted`, `deprecated`), so the
   * log says what was decided rather than only that a row changed.
   */
  private apply(entry: LanguageKnowledgeEntry): void {
    const previous = this.current.get(entry.key);
    if (previous !== undefined) {
      const history = this.superseded.get(entry.key) ?? [];
      this.superseded.set(entry.key, [...history, previous]);
    }
    this.current.set(entry.key, entry);
  }

  /** One line of the log, and the store's own monotonic version, advanced by every change. */
  private record(
    action: LanguageChange['action'],
    key: string,
    fromVersion: number,
    toVersion: number,
    origin: LanguageOrigin,
    reference: string,
    at: string,
  ): void {
    this.clock += 1;
    this.changes.push({ at, key, action, fromVersion, toVersion, origin, reference });
  }
}
