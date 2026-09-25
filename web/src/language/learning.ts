/**
 * Language memory feedback and learning — Phase 7.5.3.4.3.
 *
 * The layer already keeps three things about a person, and they are three *kinds* of thing rather than
 * three tables:
 *
 *   - `preference.ts` — the **setting**: one value, chosen in a control, and `auto` is a legal value
 *     because "I have not chosen" has to be expressible. A setting can be taken back.
 *   - `communication.ts` — the **counts**: how many of a person's turns read each way. Anonymous,
 *     decaying, and consulted only past a minimum sample count, because a count is an inference.
 *   - this module — the **statements**: the few things a person said outright about how they want to be
 *     answered ("keep it short", "that was too formal", "answer me in Persian"), each with where they
 *     said it, how sure the store is, and how many times they have said it.
 *
 * The three are different in the way that matters for storage: a setting is one slot and is meant to be
 * changed, counts are high-frequency measurements that decay, and a statement is a small, permanent,
 * attributable fact. Putting a statement in the counts' value would mean decaying it — a person's own
 * words halving because they had used the product for fifty turns — and putting it in the setting would
 * make "automatic" impossible to get back to. So it is a third shape in the *same* language memory
 * namespace, read by the same kind of seam, and it is emphatically **not** a second memory system: this
 * module owns no store of its own, adds no key to the Agent Memory, and never writes to the reviewed
 * knowledge store (`memory.ts`) — terminology reaches that store only through the candidate path in
 * `terminologyUpdates.ts`, and a per-person statement cannot rename a concept (see `recordCorrection`).
 *
 * The flow the phase names, and where each step lives
 * --------------------------------------------------
 *
 *   interaction → candidate correction → validation → confidence → language memory → future response
 *
 *   - **Interaction.** A turn already feeds the counts (`observeCommunication`). What it cannot produce
 *     is a statement: an interaction is ambiguous by construction, and the phase's rule is that a single
 *     ambiguous interaction must not become a permanent preference. So interactions do not enter here at
 *     all — they stay where they already were, behind the sample minimum.
 *   - **Candidate and validation.** `recordCorrection` is the whole of both: the input is schema-checked
 *     before it is looked at, the value has to belong to the dimension's closed vocabulary, and one
 *     dimension — `terminology` — is *referred* rather than recorded, with the reason naming the reviewed
 *     path it belongs to.
 *   - **Confidence.** An entry's confidence is computed, never asserted: a stated correction starts at
 *     `0.8` and is read at once; a verdict about an answer starts at `0.4` and needs two more of the same
 *     verdict to cross `0.6`, which is what "repeated confirmed preferences" means in numbers rather than
 *     in prose.
 *   - **Memory.** The store value is bounded, validated on read, and carries its own version, so a stored
 *     value says how many decisions produced it.
 *   - **Future response.** `statedPreference` is the one call a resolution makes: it hands back the value
 *     to use, how sure the store is, how often it was said, when it was last said, and what the person
 *     asked for before — the last of which is why a reversal is *visible* rather than silent.
 *
 * What a statement may carry, and what it deliberately cannot
 * ----------------------------------------------------------
 * Every field of an entry is a closed value, a number or a timestamp: no field can hold a message, a
 * word from one, a case id, an account or anything else a person typed. `CORRECTION_FIELDS` is that list,
 * and `tests/language-learning.test.ts` compares the stored entry against it — so a field added to carry
 * a figure, a message or an identifier fails the suite instead of shipping as a quiet addition. The
 * "context" the phase asks to store is `surface`: *where* the person said it, from a closed list, not
 * what surrounded it. A correction is a statement about wording; it has no business holding a sentence.
 *
 * Nothing here changes what an answer *says*. It decides a register, a length, a language and a
 * terminology *style*, and the resolution it feeds only ever produces those — facts, calculations, tool
 * results, permissions, safety rules, trading restrictions and uncertainty are not reachable from here.
 */

import { z } from 'zod';
import { CONTEXT_DEPTHS } from './context.js';
import { LANGUAGE_REGISTERS } from './detect.js';
import { REPLY_LANGUAGES, type StatedPreference } from './profile.js';
import { preferenceStorage, type PreferenceStorage } from './preference.js';

/* ────────────────────────────────────────────────────────────────────────────
 * The vocabularies
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The dimensions a person can correct.
 *
 * The three that a message can also decide, plus `terminology` — which is here so that proposing one is
 * a *decision* this layer makes ("not a preference; a reviewed change to product knowledge") rather than
 * a shape it does not understand. A dimension that could not be named would be refused for the wrong
 * reason, and the refusal is a real answer.
 */
export const CORRECTION_DIMENSIONS = ['language', 'formality', 'detail', 'terminology'] as const;
export type CorrectionDimension = (typeof CORRECTION_DIMENSIONS)[number];

/**
 * The values each dimension accepts.
 *
 * The vocabularies are the resolution's own lists rather than copies of them: a correction that named a
 * register the resolver cannot produce would be a statement nothing could honour. `terminology` accepts
 * none, and it never reaches this table's empty list — `recordCorrection` refers a terminology statement
 * before it looks at the value.
 */
export const CORRECTION_VALUES: Readonly<Record<CorrectionDimension, readonly string[]>> = {
  language: REPLY_LANGUAGES,
  formality: LANGUAGE_REGISTERS,
  detail: CONTEXT_DEPTHS,
  terminology: [],
};

/**
 * Who made the statement.
 *
 * Two sources, and both of them are a person. There is deliberately **no** `agent-proposal` here, which
 * is the one place this layer differs from the knowledge store: the knowledge store records model output
 * as a pending proposal because a Persian term is a thing a model can *suggest*, while a preference is a
 * thing only its owner can state. A model that inferred "this person wants brevity" and wrote it down as
 * a correction would be manufacturing a statement nobody made — so the shape has nowhere to put one.
 */
export const CORRECTION_SOURCES = ['correction', 'feedback'] as const;
export type CorrectionSource = (typeof CORRECTION_SOURCES)[number];

/** Where the person was when they said it. The "context" the phase asks to store, as a closed list. */
export const CORRECTION_SURFACES = ['workspace', 'settings', 'review'] as const;
export type CorrectionSurface = (typeof CORRECTION_SURFACES)[number];

/**
 * What each source is worth before it has been repeated.
 *
 * The gap between the two numbers is the whole design of "a single ambiguous interaction must not become
 * a permanent preference". `correction` is unambiguous — somebody said what they want — and clears the
 * consultation bar on its own. `feedback` is a verdict on an answer that was already given: it is
 * evidence of a direction and no statement of one, so it is recorded and not read, and it becomes
 * readable only once the same verdict has been made often enough to be a preference rather than a mood.
 */
export const CORRECTION_CONFIDENCE: Readonly<Record<CorrectionSource, number>> = {
  correction: 0.8,
  feedback: 0.4,
};

/** What one more statement of the same thing adds to its confidence. */
export const CONFIRMATION_STEP = 0.1;

/**
 * The confidence a statement needs before a resolution will read it.
 *
 * `0.6` puts the two sources on either side of it at one statement each: stated corrections are read
 * immediately (0.8), and a verdict needs three (0.4, 0.5, 0.6) — which is a person saying the same thing
 * about the same kind of answer three times, not twice by accident.
 */
export const CONSULT_CONFIDENCE = 0.6;

/**
 * The most statements a stored value may hold.
 *
 * A bound on what this module will *read*, and deliberately not a policy about what a person may say:
 * every dimension but `terminology` has a closed vocabulary and a repeat confirms instead of appending,
 * so the eight statements that exist in this product are the most real use can produce and a write can
 * never reach this number. It is here because a stored value is untrusted input — one written by another
 * build, or by hand — and a reader that kept everything it found could be made to hold a list of any
 * length. Reading keeps the newest entries and drops the rest, which is the same tolerance the counts
 * store applies to a value it did not write.
 */
export const MAX_CORRECTIONS = 16;

/**
 * The closed list of things a person can say about an answer they were given.
 *
 * Each verdict maps to a dimension and to the value it wants instead, so feedback is a *vocabulary* the
 * product owns rather than a free-text channel: a person picks among six things, and there is no way to
 * send "too long" as prose that the store would then have to keep. The direction is always the one the
 * verdict names — "too formal" asks for the conversational register, it does not ask for "less".
 */
export const RESPONSE_FEEDBACK = {
  'too-long': { dimension: 'detail', value: 'concise' },
  'too-short': { dimension: 'detail', value: 'detailed' },
  'too-casual': { dimension: 'formality', value: 'formal' },
  // `informal` rather than the tone's own name for it: the register is the dimension, and the *tone* the
  // guidance derives from it (`conversational`) is a value this store never holds.
  'too-formal': { dimension: 'formality', value: 'informal' },
  'prefer-persian': { dimension: 'language', value: 'fa' },
  'prefer-english': { dimension: 'language', value: 'en' },
} as const;
export type ResponseFeedback = keyof typeof RESPONSE_FEEDBACK;
export const RESPONSE_FEEDBACKS = Object.keys(RESPONSE_FEEDBACK) as ResponseFeedback[];

/* ────────────────────────────────────────────────────────────────────────────
 * A statement, and what may be stored about one
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * One statement, as it is stored.
 *
 * Seven fields, and `CORRECTION_FIELDS` is compared against them: the four the caller supplies
 * (dimension, value, source, surface), when it was last made, and the two the store computes
 * (confidence, confirmations). There is no id, no session, no user and no text — nothing that describes
 * *who* a person is or *what* they wrote, which is the same rule the profile's field list enforces one
 * module over.
 *
 * `recordedAt` is the *last* time this statement was made rather than the first, because a statement made
 * again is a newer statement: it is what decides which of two competing statements is the current one.
 */
export interface LanguageCorrection {
  readonly dimension: CorrectionDimension;
  readonly value: string;
  readonly source: CorrectionSource;
  readonly surface: CorrectionSurface;
  readonly recordedAt: string;
  /** Computed from the source and the confirmations; never declared by a caller. */
  readonly confidence: number;
  /** How many times this same statement has been made. The first one is `1`. */
  readonly confirmations: number;
}

/** The field names a stored statement may have, in one place, asserted by the suite. */
export const CORRECTION_FIELDS = [
  'dimension',
  'value',
  'source',
  'surface',
  'recordedAt',
  'confidence',
  'confirmations',
] as const;

/**
 * The store value: the statements, and the store's own version.
 *
 * The version moves by one on every decision — recorded, confirmed, or an eviction — so a stored value
 * says how many decisions produced the state it is in. It is the same idea as the knowledge store's
 * `memoryVersion`, and it is what makes two snapshots of one person's statements comparable. An *entry*
 * has no version of its own: for a statement, the number of times it was made (`confirmations`) is the
 * version, and a second counter would be the same fact written down twice.
 */
export interface CorrectionStore {
  readonly version: number;
  readonly corrections: readonly LanguageCorrection[];
}

export function emptyCorrections(): CorrectionStore {
  return { version: 0, corrections: [] };
}

/** What a caller may say. Strict: an unknown field is a caller believing it changed something. */
const correctionInputSchema = z.strictObject({
  dimension: z.enum(CORRECTION_DIMENSIONS),
  value: z.string().min(1).max(60),
  source: z.enum(CORRECTION_SOURCES),
  surface: z.enum(CORRECTION_SURFACES),
  recordedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'recordedAt must be an ISO-8601 instant',
  }),
});
export type CorrectionInput = z.infer<typeof correctionInputSchema>;

const correctionSchema = z.strictObject({
  dimension: z.enum(CORRECTION_DIMENSIONS),
  value: z.string().min(1).max(60),
  source: z.enum(CORRECTION_SOURCES),
  surface: z.enum(CORRECTION_SURFACES),
  recordedAt: z.string(),
  confidence: z.number().finite().min(0).max(1),
  confirmations: z.number().int().positive(),
});

/** What happened to a statement. A refusal is a value, not an exception. */
export const CORRECTION_OUTCOMES = ['recorded', 'confirmed', 'referred', 'refused'] as const;
export type CorrectionOutcome = (typeof CORRECTION_OUTCOMES)[number];

export interface CorrectionDecision {
  readonly outcome: CorrectionOutcome;
  /** The store as it stands after the decision. Untouched for `referred` and `refused`. */
  readonly store: CorrectionStore;
  /** The entry that was written or confirmed, or `null` when nothing was. */
  readonly entry: LanguageCorrection | null;
  /** One sentence, in the shape the terminology candidate path uses for its own decisions. */
  readonly reason: string;
}

/** The confidence a statement carries once it has been made `confirmations` times. */
function confidenceOf(source: CorrectionSource, confirmations: number): number {
  const base = CORRECTION_CONFIDENCE[source];
  return Math.min(1, Number((base + (confirmations - 1) * CONFIRMATION_STEP).toFixed(2)));
}

function decide(
  outcome: CorrectionOutcome,
  store: CorrectionStore,
  reason: string,
  entry: LanguageCorrection | null = null,
): CorrectionDecision {
  return { outcome, store, entry, reason };
}

/**
 * Record one statement, or explain why it is not one.
 *
 * The checks run in the order a person would make them, and the *order* is a decision:
 *
 *   1. **is this a statement at all** — schema, before anything else, so nothing malformed is stored
 *      even as a note;
 *   2. **is it about terminology** — referred, before its value is looked at, because terminology has no
 *      value vocabulary here on purpose: a word is reviewed knowledge, and the path that changes it is
 *      `reviewTermCandidate` in `terminologyUpdates.ts`, where a reviewer's provenance becomes the term's
 *      provenance. A person's own statement is not a review, and this is the rule that keeps a per-person
 *      preference from rewriting shared product knowledge;
 *   3. **is the value one the resolution can honour**;
 *   4. **has this been said before** — the same dimension *and* value confirms the existing entry: it
 *      moves to the end of the store (it is the most recent statement), its `recordedAt` moves with it,
 *      and its confidence rises by `CONFIRMATION_STEP`. Saying the same thing again is not a second
 *      statement, it is the same statement made again, and counting it twice would let one person's
 *      habit look like two people's agreement;
 *   5. **or is it a new statement** — appended, with the value it competes with left in place. Nothing is
 *      overwritten: `statedPreference` reads the newest consulted statement and reports what else was
 *      asked for, which is what makes a reversal visible to the person it happened to.
 */
export function recordCorrection(
  input: unknown,
  store: CorrectionStore = emptyCorrections(),
): CorrectionDecision {
  const parsed = correctionInputSchema.safeParse(input);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'correction'} ${issue.message}`)
      .join('; ');
    return decide('refused', store, `the statement is not usable: ${detail}`);
  }
  const asked = parsed.data;

  if (asked.dimension === 'terminology') {
    return decide(
      'referred',
      store,
      'a term is reviewed knowledge rather than a preference: propose it through the terminology candidate path, where a reviewer decides, and this store stays out of it.',
    );
  }

  const values = CORRECTION_VALUES[asked.dimension];
  if (!values.includes(asked.value)) {
    return decide(
      'refused',
      store,
      `\`${asked.value}\` is not a ${asked.dimension} this product can honour; it is one of ${values.join(', ')}.`,
    );
  }

  const existing = store.corrections.find(
    (entry) => entry.dimension === asked.dimension && entry.value === asked.value,
  );
  if (existing !== undefined) {
    const confirmed: LanguageCorrection = {
      ...existing,
      source: asked.source,
      surface: asked.surface,
      recordedAt: asked.recordedAt,
      confirmations: existing.confirmations + 1,
      confidence: confidenceOf(asked.source, existing.confirmations + 1),
    };
    return decide(
      'confirmed',
      {
        version: store.version + 1,
        corrections: [...store.corrections.filter((entry) => entry !== existing), confirmed],
      },
      `this has been said ${confirmed.confirmations} time(s), and the statement now carries confidence ${confirmed.confidence}.`,
      confirmed,
    );
  }

  const entry: LanguageCorrection = {
    dimension: asked.dimension,
    value: asked.value,
    source: asked.source,
    surface: asked.surface,
    recordedAt: asked.recordedAt,
    confidence: confidenceOf(asked.source, 1),
    confirmations: 1,
  };
  // Nothing is ever evicted here, and that is a property rather than an omission: appending happens only
  // when the value is one no entry holds, and the vocabularies together hold eight values — three
  // registers, three depths, two languages — which is well under the cap. `MAX_CORRECTIONS` is the
  // reader's bound, and the reader is where a value this module did not write is met.
  const consulted = entry.confidence >= CONSULT_CONFIDENCE;
  return decide(
    'recorded',
    { version: store.version + 1, corrections: [...store.corrections, entry] },
    consulted
      ? 'the statement was recorded, and a correction this person stated is sure enough to be read on its own.'
      : `the statement was recorded with confidence ${entry.confidence}; it is not read until the same thing has been said enough times to cross ${CONSULT_CONFIDENCE}.`,
    entry,
  );
}

/**
 * Record a verdict about an answer that was already given.
 *
 * The same store, the same path, one translation: the verdict picks the dimension and the value, and the
 * source is `feedback`, which is what makes it worth less than a statement until it has been repeated.
 * The translation is a closed map rather than a sentence, so a caller cannot invent a seventh thing to
 * dislike about an answer.
 */
export function recordFeedback(
  verdict: ResponseFeedback,
  input: { surface: CorrectionSurface; recordedAt: string },
  store: CorrectionStore = emptyCorrections(),
): CorrectionDecision {
  const mapped = RESPONSE_FEEDBACK[verdict];
  if (mapped === undefined) {
    return decide(
      'refused',
      store,
      `\`${String(verdict)}\` is not something this product can act on.`,
    );
  }
  return recordCorrection({ ...mapped, source: 'feedback', ...input }, store);
}

/* ────────────────────────────────────────────────────────────────────────────
 * What a resolution reads
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The newest statement about a dimension that the store is sure enough about to be read.
 *
 * "Newest" is the store's own order, not the recorded clock: a statement moves to the end when it is made
 * again, and a client's clock is not a fact this store can order anything by. `minimum` is a parameter so
 * a caller can ask a stricter question than the default — it is never loosened, because a caller that
 * wanted to read a statement the store is unsure about would be the caller the confidence rule exists
 * for.
 */
export function consultedCorrection(
  store: CorrectionStore | null | undefined,
  dimension: CorrectionDimension,
  minimum: number = CONSULT_CONFIDENCE,
): LanguageCorrection | null {
  if (store === null || store === undefined) return null;
  for (let index = store.corrections.length - 1; index >= 0; index -= 1) {
    const entry = store.corrections[index];
    if (entry === undefined) continue;
    if (entry.dimension === dimension && entry.confidence >= minimum) return entry;
  }
  return null;
}

/**
 * A statement in the shape a resolution reads, or nothing when there is none sure enough.
 *
 * This is the whole seam between learning and deciding, and the two fields beyond the value are the
 * reason it is a function rather than a lookup: `confirmations` lets a reason say whether this is
 * something the person said once or keeps saying, and `disagreedWith` is the *other* statement about the
 * same dimension when there is one — so a resolution can tell somebody that its answer follows the thing
 * they asked for last, rather than reconciling a reversal in silence. That last fact is what "do not
 * silently overwrite" means at the point where it matters, and it is computed here, from the store as it
 * stands now, rather than stored on an entry where it would go stale the moment the person changed their
 * mind again.
 */
export function statedPreference<T extends string>(
  store: CorrectionStore | null | undefined,
  dimension: CorrectionDimension,
  minimum: number = CONSULT_CONFIDENCE,
): StatedPreference<T> | null {
  const consulted = consultedCorrection(store, dimension, minimum);
  if (consulted === null) return null;
  // The newest *other* statement, found from the end for the same reason `consultedCorrection` does: the
  // store's order is the order the person spoke in, and the one that follows the current statement is the
  // one they changed their mind from.
  const others = (store?.corrections ?? []).filter(
    (entry) => entry.dimension === dimension && entry.value !== consulted.value,
  );
  const previous = others[others.length - 1];
  return {
    value: consulted.value as T,
    confidence: consulted.confidence,
    confirmations: consulted.confirmations,
    recordedAt: consulted.recordedAt,
    disagreedWith: previous?.value ?? null,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Persistence
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The storage key.
 *
 * In the language layer's own namespace, beside the setting and the counts, and outside both the
 * knowledge store's (`lang:`) and the Agent Memory's (`mem_`) namespaces — a statement about wording is
 * neither cited product knowledge nor a recollection about the world.
 */
export const LANGUAGE_CORRECTION_KEY = 'master-trade.language.corrections';

/** What was found in storage, and whether storage could be read at all. */
export interface CorrectionsReading {
  readonly store: CorrectionStore;
  /** True when a real store answered; false when there was none, or it threw. */
  readonly storable: boolean;
  /** True when the store held something this build could read. */
  readonly stored: boolean;
}

/**
 * Read a stored value back, keeping what this build understands.
 *
 * Structural and tolerant in the same way the counts store is: an entry that does not match the schema is
 * dropped rather than taking the whole store with it, a value outside its dimension's vocabulary is
 * dropped because nothing could honour it, the list is capped, and the result is always a complete store.
 * A person's own statements should survive a build that added a field they do not use — degrading to "I
 * know less than I did" is recoverable, and refusing to read the value at all is not.
 */
export function parseCorrections(raw: unknown): CorrectionStore {
  if (raw === null || typeof raw !== 'object') return emptyCorrections();
  const source = raw as { version?: unknown; corrections?: unknown };
  const version =
    typeof source.version === 'number' && Number.isInteger(source.version) && source.version >= 0
      ? source.version
      : 0;
  if (!Array.isArray(source.corrections)) return emptyCorrections();
  const kept: LanguageCorrection[] = [];
  for (const candidate of source.corrections) {
    const parsed = correctionSchema.safeParse(candidate);
    if (!parsed.success) continue;
    const entry = parsed.data;
    if (!CORRECTION_VALUES[entry.dimension].includes(entry.value)) continue;
    kept.push(entry);
  }
  return { version, corrections: kept.slice(-MAX_CORRECTIONS) };
}

export function readCorrections(
  storage: PreferenceStorage | null = preferenceStorage(),
): CorrectionsReading {
  if (storage === null) return { store: emptyCorrections(), storable: false, stored: false };
  try {
    const raw = storage.getItem(LANGUAGE_CORRECTION_KEY);
    if (raw === null) return { store: emptyCorrections(), storable: true, stored: false };
    const parsed: unknown = JSON.parse(raw);
    return { store: parseCorrections(parsed), storable: true, stored: true };
  } catch {
    // A store that throws, or holds something that is not JSON at all: nothing has been stated, and
    // every resolution falls back on what it read and what it counted.
    return { store: emptyCorrections(), storable: false, stored: false };
  }
}

export function writeCorrections(
  store: CorrectionStore,
  storage: PreferenceStorage | null = preferenceStorage(),
): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(LANGUAGE_CORRECTION_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

/**
 * Forget everything this person said about their own wording.
 *
 * The counterpart of a store that only grows, and the seam a Settings control will use: a person who
 * wants the product to stop deciding from what they once said has to be able to say so, and deleting the
 * value is the only honest way to do it. It is *not* the same as choosing `auto` — `auto` takes back the
 * setting, and this takes back the statements — which is the distinction the two shapes exist to keep.
 */
export function clearCorrections(storage: PreferenceStorage | null = preferenceStorage()): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(LANGUAGE_CORRECTION_KEY, JSON.stringify(emptyCorrections()));
    return true;
  } catch {
    return false;
  }
}
