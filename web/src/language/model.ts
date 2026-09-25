/**
 * The Persian language knowledge model — Phase 7.5.1.
 *
 * What this is, and what it is not
 * --------------------------------
 * Persian is a first-class language here, which means the *knowledge about* Persian has to be data
 * the product owns, rather than strings scattered through components. This module is that data's
 * shape: every rule, term, translation, preferred wording, spelling rule, exception and example the
 * interface will ever render is an entry with a version, a provenance and a status — not a literal.
 *
 * It is deliberately **one file that knows nothing but its own schema**. It does not import the
 * Agent Memory, and it does not import the credential surface; there is no path from here to either
 * (`tests/persian-language.test.ts` asserts that, rather than trusting this comment). The two are
 * separate stores with separate shapes for a reason: an agent's recollection is a *statement about
 * the world* that may be wrong and is expected to change, while a language rule is a *decision about
 * how the product speaks* that a human has reviewed. Sharing a table between them is how an
 * unreviewed model output becomes trusted interface copy.
 *
 * The shape of an entry
 * --------------------
 * - `key` — where the knowledge applies, dotted and stable (`journal.entry.price`), so a correction
 *   renames nothing: it adds a version to the same key.
 * - `kind` — what kind of knowledge it is. The kinds are the categories the language layer has to
 *   hold, not a taxonomy invented for tidiness.
 * - `value` — the knowledge itself: the rule, the term, the translation.
 * - `status` — how much trust it currently carries. Only `trusted` knowledge may be rendered as
 *   interface copy.
 * - `confidence` — how sure the *source* was, which is not the same question as status and is kept
 *   because a reviewed rule that a reviewer was unsure about should be visible as such.
 * - `version` — a monotonic counter per key. A correction is version 2 of the same key, never an
 *   edit in place, so "what did this say when this screen shipped" always has an answer.
 * - `provenance` — who recorded it, on what authority, and when. `agent-proposal` is a legal origin;
 *   it is simply not a *trusted* one.
 * - `examples` / `mapping` / `notes` — the evidence. `mapping` exists for orthography entries that
 *   state a character-level rule, and it is not decoration: the normalizer in `fa.ts` is checked
 *   against it, so the store's prose and the code's behaviour cannot drift apart.
 */

import { z } from 'zod';

/** The only locale this layer speaks today. A union because a second one is the obvious addition. */
export const LANGUAGE_LOCALE = 'fa-IR';
export type LanguageLocale = typeof LANGUAGE_LOCALE;

/**
 * The kinds of knowledge the language layer holds.
 *
 * These are the seven the phase asks for, and each has a different *reviewer*: an `orthography`
 * rule is answerable to Unicode, a `translation` to a Persian-speaking reviewer, a `terminology`
 * entry to the domain, and a `wording` preference to whoever owns the product's voice. `exception`
 * exists because a rule with no room for its exceptions is a rule that gets broken quietly: an
 * unreviewable edge case belongs in the store, named, not in an `if` at a call site.
 */
export const LANGUAGE_KNOWLEDGE_KINDS = [
  'rule',
  'terminology',
  'translation',
  'wording',
  'orthography',
  'exception',
  'example',
] as const;
export type LanguageKnowledgeKind = (typeof LANGUAGE_KNOWLEDGE_KINDS)[number];

/** One sentence per kind, so the docs and the audit records can name them without inventing prose. */
export const LANGUAGE_KIND_MEANING: Record<LanguageKnowledgeKind, string> = {
  rule: 'a rule of the language layer itself: how a term is inflected, how a figure is read out',
  terminology: 'the agreed Persian name for a domain concept (`trade`, `R multiple`, `drawdown`)',
  translation: 'the Persian copy for a specific interface string, keyed to where it appears',
  wording: 'a preference between correct alternatives: the phrasing this product chooses',
  orthography: 'a spelling rule at the character or word level (which yeh, where the ZWNJ goes)',
  exception: 'a named case where a rule above does not apply, and why',
  example: 'a worked example that shows a rule, kept as evidence for a reviewer',
};

/**
 * How much trust the entry currently carries.
 *
 * `proposed` is where anything an agent writes lands, and where it stays until a human decides.
 * `validated` is a reviewed entry that is not yet the product's committed copy. `deprecated` is a
 * retired entry, kept rather than deleted so a historical screen can still be explained.
 */
export const LANGUAGE_KNOWLEDGE_STATUSES = [
  'proposed',
  'validated',
  'trusted',
  'deprecated',
] as const;
export type LanguageKnowledgeStatus = (typeof LANGUAGE_KNOWLEDGE_STATUSES)[number];

/**
 * Where an entry came from — the field that decides whether it may be trusted.
 *
 * `human-review` is a person accepting responsibility for the wording. `upstream-standard` is an
 * external authority the product is *citing* rather than deciding (Unicode's character database,
 * CLDR's locale data), and it is trusted because the authority is the source, not because we agree.
 * `agent-proposal` is model output: always recorded, never promoted by its own say-so.
 */
export const LANGUAGE_ORIGINS = ['human-review', 'upstream-standard', 'agent-proposal'] as const;
export type LanguageOrigin = (typeof LANGUAGE_ORIGINS)[number];

/** The origins that may carry `validated` or `trusted` status. */
export const TRUSTED_LANGUAGE_ORIGINS = ['human-review', 'upstream-standard'] as const;

/** True when this origin is allowed to state something as trusted. */
export function isTrustedOrigin(origin: LanguageOrigin): boolean {
  return (TRUSTED_LANGUAGE_ORIGINS as readonly LanguageOrigin[]).includes(origin);
}

/**
 * The namespace, and the guard that keeps the stores apart.
 *
 * Every entry this layer stores is addressed as `lang:<key>`. Agent Memory ids are minted as `mem_*`
 * by `src/memory/store.ts`, and a language entry can never be one of those — not by convention, but
 * because the id is derived from the key here and the store refuses anything else.
 */
export const LANGUAGE_MEMORY_PREFIX = 'lang:';

/** The Agent Memory id prefix, stated here only so the separation can be asserted. */
export const AGENT_MEMORY_ID_PREFIX = 'mem_';

/** The address of a language entry, derived from its key. */
export function languageMemoryId(key: string): string {
  return `${LANGUAGE_MEMORY_PREFIX}${key}`;
}

/** True when this id addresses a language entry. */
export function isLanguageMemoryId(id: string): boolean {
  return id.startsWith(LANGUAGE_MEMORY_PREFIX) && id.length > LANGUAGE_MEMORY_PREFIX.length;
}

/** True when this id addresses an Agent Memory record — which is never a language entry. */
export function isAgentMemoryId(id: string): boolean {
  return id.startsWith(AGENT_MEMORY_ID_PREFIX);
}

/**
 * What a key may look like.
 *
 * Dotted lower-case words, because the key is also the address: `journal.entry.price` sorts with its
 * siblings, reads as a path in a diff, and cannot contain a character that would need escaping when
 * it becomes an object key or a URL fragment.
 */
export const LANGUAGE_KEY_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

/** The JSON shape of a persisted snapshot, and its own version — separate from an entry's version. */
export const LANGUAGE_SNAPSHOT_FORMAT = 'master-trade.language-knowledge';
export const LANGUAGE_SNAPSHOT_FORMAT_VERSION = 1;

const isoDate = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'must be an ISO-8601 date' });

const keySchema = z
  .string()
  .min(1)
  .max(120)
  .regex(LANGUAGE_KEY_PATTERN, 'a key is dotted lower-case words, e.g. `journal.entry.price`');

const localeSchema = z.literal(LANGUAGE_LOCALE);
const kindSchema = z.enum(LANGUAGE_KNOWLEDGE_KINDS);
const statusSchema = z.enum(LANGUAGE_KNOWLEDGE_STATUSES);
const originSchema = z.enum(LANGUAGE_ORIGINS);

/**
 * A character-level statement, for orthography entries.
 *
 * `to: null` means the rule *removes* the character (`from`), which is how the diacritic and
 * tatweel rules are stated. Exactly one code point in, one code point or nothing out: a rule that
 * needed more would be a rule about words, which is what `value` and `examples` are for.
 */
export const languageMappingSchema = z.strictObject({
  from: z.string().min(1).max(4),
  to: z.string().max(4).nullable(),
});
export type LanguageMapping = z.infer<typeof languageMappingSchema>;

/**
 * Provenance: who recorded this, on what authority, and when.
 *
 * `reference` is required and is never empty. A rule that cannot say where it came from is a rule
 * the next person has to re-derive, and "trust the comment" is exactly the failure this store
 * exists to remove — so the field is mandatory rather than optional.
 */
export const languageProvenanceSchema = z.strictObject({
  origin: originSchema,
  reference: z.string().min(1).max(300),
  recordedAt: isoDate,
});
export type LanguageProvenance = z.infer<typeof languageProvenanceSchema>;

/**
 * A stored entry — every field always present.
 *
 * `strictObject` on purpose: an unknown field is a field some future version of this layer wrote
 * and this one does not understand, and silently dropping it would lose knowledge on a round trip
 * through an older build. It fails instead, which is the honest outcome for a *knowledge* store.
 */
export const languageEntrySchema = z.strictObject({
  key: keySchema,
  kind: kindSchema,
  locale: localeSchema,
  value: z.string().min(1).max(2000),
  status: statusSchema,
  confidence: z.number().finite().min(0).max(1),
  version: z.number().int().positive(),
  provenance: languageProvenanceSchema,
  examples: z.array(z.string().min(1).max(500)).max(20),
  mapping: languageMappingSchema.nullable(),
  notes: z.string().min(1).max(1000).nullable(),
});
export type LanguageKnowledgeEntry = z.infer<typeof languageEntrySchema>;

/**
 * What a caller may hand the store to add or correct knowledge.
 *
 * The differences from an entry are the differences between *asking* and *having asked*: the status
 * is not the caller's to declare (the store decides it from the origin and the review), `version`
 * is not the caller's to invent (`baseVersion` is the version it believes it is replacing, and 0
 * means "I believe this key is new"), and the examples/mapping/notes may be omitted.
 *
 * `recordedAt` is required rather than defaulted to the current clock, because provenance that
 * writes its own timestamp cannot be replayed in a test — and an entry whose provenance cannot be
 * reproduced is an entry nobody can audit.
 */
export const languageProposalSchema = z.strictObject({
  key: keySchema,
  kind: kindSchema,
  value: z.string().min(1).max(2000),
  origin: originSchema,
  reference: z.string().min(1).max(300),
  recordedAt: isoDate,
  baseVersion: z.number().int().nonnegative(),
  confidence: z.number().finite().min(0).max(1).optional(),
  examples: z.array(z.string().min(1).max(500)).max(20).optional(),
  mapping: languageMappingSchema.nullable().optional(),
  notes: z.string().min(1).max(1000).nullable().optional(),
});
export type LanguageProposal = z.infer<typeof languageProposalSchema>;

/** A serializable whole-store value: the persistence seam this phase stops at. */
export const languageSnapshotSchema = z.strictObject({
  format: z.literal(LANGUAGE_SNAPSHOT_FORMAT),
  formatVersion: z.literal(LANGUAGE_SNAPSHOT_FORMAT_VERSION),
  memoryVersion: z.number().int().nonnegative(),
  entries: z.array(languageEntrySchema),
});
export type LanguageSnapshot = z.infer<typeof languageSnapshotSchema>;

/** What a review decided about a pending proposal. */
export const LANGUAGE_REVIEW_DECISIONS = ['accept', 'reject'] as const;
export type LanguageReviewDecision = (typeof LANGUAGE_REVIEW_DECISIONS)[number];

/** One line of the append-only change log. Written by the store; never edited. */
export const languageChangeSchema = z.strictObject({
  at: isoDate,
  key: keySchema,
  action: z.enum(['proposed', 'applied', 'promoted', 'deprecated', 'rejected']),
  fromVersion: z.number().int().nonnegative(),
  toVersion: z.number().int().nonnegative(),
  origin: originSchema,
  reference: z.string().min(1).max(300),
});
export type LanguageChange = z.infer<typeof languageChangeSchema>;
