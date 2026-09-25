/**
 * The response-style contract — Phase 7.5.3.4.2.
 *
 * Phase 7.5.3.2 built the *reading* of a turn and turned it into a specification of wording: a tone, a
 * depth, a terminology style, a structure, and a list of note ids. That specification is produced in the
 * interface process — it is derived from a message a person typed and from counts of their own turns — and
 * it has to be *applied* where the answer is written, which is the other process. `tests/monorepo-boundary`
 * keeps the two apart: nothing in `src/` may import the frontend, and the only way across is a declared
 * `@shared/*` module.
 *
 * So the catalogue lives here, and this is the whole reason it is here rather than next to the module that
 * produces the ids: **a note is resolved by the response stage**, and two copies of an instruction would be
 * two instructions that can disagree. `web/src/language/guidance.ts` imports these and re-exports them as
 * its own surface, so the layer that reads a turn and the layer that writes an answer name one catalogue.
 *
 * What this module is not: a detector, a memory, a preference store or a prompt. It has no function, holds
 * no state and reads nothing. It is a list of closed vocabularies, the note texts those vocabularies'
 * values are rendered as, and the list of things a response stage may not touch while it renders them.
 *
 * Why the note catalogue can be trusted as an instruction
 * ------------------------------------------------------
 * Every string below is a fixed instruction about *wording*, and none of them has a hole in it: no note can
 * name a figure, a result, a permission or a person, because none of them has a placeholder. The style that
 * travels across the boundary is a set of **ids** from this file plus four values from the vocabularies
 * below, so a caller can choose which of these sentences the model reads and cannot write one of its own.
 * `tests/adaptive-style.test.ts` asserts that mechanically: every note id a client may send resolves to one
 * of these strings, an id that is not here is refused by the schema, and no note contains a digit.
 */

/**
 * The version of the catalogue, bumped when a note means something different than it did.
 *
 * A note id is stable and its text is not: the version is how a stored or logged style says which rules
 * produced it, in the same way the profile and the reply carry theirs.
 */
export const GUIDANCE_VERSION = 1;

/**
 * How the answer should sound, in one word.
 *
 * `neutral` is not a missing value: it is the register the product's own Persian copy is written in, and a
 * message that claims no register gets it rather than a guess.
 */
export const GUIDANCE_TONES = ['formal', 'neutral', 'conversational'] as const;
export type GuidanceTone = (typeof GUIDANCE_TONES)[number];

/** How much answer the turn wants. */
export const GUIDANCE_DETAILS = ['concise', 'standard', 'detailed'] as const;
export type GuidanceDetail = (typeof GUIDANCE_DETAILS)[number];

/** How the answer should handle the product's terminology. */
export const GUIDANCE_TERMINOLOGY = ['product-terms', 'english-terms', 'bilingual'] as const;
export type GuidanceTerminology = (typeof GUIDANCE_TERMINOLOGY)[number];

/** How the answer should be ordered. */
export const GUIDANCE_STRUCTURES = ['direct-answer', 'explained', 'step-by-step'] as const;
export type GuidanceStructure = (typeof GUIDANCE_STRUCTURES)[number];

/**
 * What a style is not allowed to touch.
 *
 * Carried with every style rather than stated once in a document, because the thing that must not change is
 * the thing a response stage is most likely to change while "just rewording": a rounded figure, a softened
 * uncertainty, an implied permission. The list is closed, and the suite asserts it is exactly these seven.
 */
export const GUIDANCE_INVARIANTS = [
  'facts',
  'calculations',
  'tool-results',
  'permissions',
  'safety-rules',
  'trading-restrictions',
  'uncertainty',
] as const;
export type GuidanceInvariant = (typeof GUIDANCE_INVARIANTS)[number];

/**
 * The notes a response stage applies, by id.
 *
 * Each one is an instruction about *wording*, and none of them can hold a value from a message: a note is a
 * fixed string here and the style carries the id. Anything that would need to name a figure, a result or a
 * permission belongs in the answer itself, where the tool results already are.
 *
 * The two ending in `figures-verbatim` and `ask-nothing-further` are not dimensions: they are the two
 * consequences a style is most likely to break. A long answer is where a figure gets rounded on the way
 * past, and a task-shaped turn is where an answer asks a question the message already answered.
 */
export const GUIDANCE_NOTES = {
  'fa-formal':
    'Write in the formal Persian register this product uses in its Persian copy: complete sentences and the polite forms, with no colloquial contractions.',
  'fa-neutral': 'Write in Persian, in the register the conversation is already using.',
  'fa-conversational':
    'Write natural conversational Persian — the way a knowledgeable colleague would say it, not the way a letter would. Do not reach for bookish forms like «\u0645\u06CC\u200C\u0628\u0627\u0634\u062F».',
  'en-formal':
    'Write in formal English: complete sentences and the polite forms this product uses.',
  'en-neutral': 'Write in English, in the register the conversation is already using.',
  'en-conversational': 'Write natural conversational English, the way a colleague would say it.',
  'terms-product':
    'Name each concept with the form the Persian language store records for it, and keep a term in English only where the store has no Persian form for it.',
  'terms-english': 'Name each concept in English, matching the wording the product shows.',
  'terms-bilingual':
    'Keep the English word beside the product\u2019s Persian form for a concept this person is already reading in English, and never translate a term that has no Persian counterpart. Do not gloss a term they used themselves in Persian.',
  'detail-concise': 'Answer in as few words as the question allows. Lead with the answer and stop.',
  'detail-standard':
    'Answer at the length the question deserves: the answer first, then only what it needs.',
  'detail-detailed':
    'Explain the reasoning as well as the answer, in the order it was reached, so the conclusion can be checked.',
  'structure-direct': 'Lead with the answer, then the one reason it rests on.',
  'structure-explained': 'Answer, then say what the answer rests on, in that order.',
  'structure-stepwise':
    'Give the steps in order, so the instruction can be followed one at a time, without reordering or merging them.',
  'figures-verbatim':
    'Repeat every figure, symbol and date exactly as the tool results returned it. Never round, re-derive, re-scale or restate one.',
  'ask-nothing-further':
    'Do not ask a question the message already answered, and do not ask for permission the safety rules already give.',
} as const;
export type GuidanceNoteId = keyof typeof GUIDANCE_NOTES;

/**
 * One turn's resolved style: the four dimensions, plus the ids of the notes to apply.
 *
 * This is what crosses the boundary when a caller has resolved a turn. Every field is a value of a closed
 * vocabulary or an id from `GUIDANCE_NOTES`, so the object can select wording and cannot author it — and
 * the two dimensions that are *not* here are deliberate: the language of the answer travels as its own
 * field (Phase 7.5.3.4.1), and the `reason` a person reads stays in the process that resolves it, because a
 * model has no business being told why it is being asked to sound a particular way.
 */
export interface ResponseStyle {
  readonly tone: GuidanceTone;
  readonly detail: GuidanceDetail;
  readonly terminology: GuidanceTerminology;
  readonly structure: GuidanceStructure;
  /** The notes to apply, in the order a response stage should read them. */
  readonly notes: readonly GuidanceNoteId[];
}
