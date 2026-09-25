/**
 * Response guidance — Phase 7.5.3.2, Task 3.
 *
 * The whole output of this module is a *specification of how to word an answer*, and the interesting part
 * is how little it can carry.
 *
 * Every string it can produce comes from a closed catalogue in this file. The tone, the depth, the
 * terminology style and the structure are values of closed vocabularies; the notes are **ids** that the
 * response layer resolves against `GUIDANCE_NOTES`; and even the `reason` is assembled from
 * `GUIDANCE_CLAUSES` rather than from the readings that produced it — which matters, because a reading's
 * reason quotes the message verbatim, and guidance that quotes the message is guidance that can drift
 * into restating it. The suite asserts all of it: a message carrying a token that appears nowhere else
 * cannot get that token into the guidance, and two messages that read the same get byte-identical
 * guidance however far apart their facts are.
 *
 * That is the mechanical form of the phase's real requirement. **Guidance may change wording, structure,
 * explanation depth, terminology and formality. It may not change facts, calculations, tool results,
 * permissions, safety rules, trading restrictions or uncertainty** — and the way to guarantee that is not
 * to promise it in a comment but to give guidance no field, no note and no reason a figure, a result or a
 * permission could travel in. `GUIDANCE_INVARIANTS` travels with every guidance so the response stage has
 * the list in hand, and `GUIDANCE_FIELDS` is what the suite compares the produced object against: a field
 * added to carry a number fails the suite rather than reaching a model.
 *
 * The four cases the phase names, as they come out:
 *
 *   - **Persian, technical** → `fa`, `product-terms`, the formal-or-neutral Persian note, and the
 *     figures-verbatim note.
 *   - **Persian, conversational** → `fa` with the conversational note — natural Persian, no `میباشد`.
 *   - **English, technical** → `en`, `english-terms`, and the same verbatim warning.
 *   - **Mixed** → the language the person is mostly writing, `bilingual`, and a note that says which
 *     terms are owed a gloss and which are never to be translated.
 *
 * What this deliberately is not: an engine. There is no prompt text, no model call, no ordering of
 * paragraphs and no tone-of-voice library here. It is the structured input the adaptive response stage
 * will be built on, and it says so rather than half-implementing it.
 */

import type {
  CommunicationProfile,
  CommunicationProfileOptions,
  TerminologyStyle,
} from './communication.js';
import { communicationProfile } from './communication.js';
import type { ContextDepth, ContextExpertise, ContextIntent, ContextSetting } from './context.js';
import type { LanguageRegister } from './detect.js';
import type { ReplyLanguage } from './profile.js';

/** Bumped when a note means something different than it did. */
export const GUIDANCE_VERSION = 1;

/**
 * How the reply should sound, in one word.
 *
 * `neutral` is not a missing value: it is the register the product's own Persian copy is written in, and
 * a message that claims no register gets it rather than a guess.
 */
export const GUIDANCE_TONES = ['formal', 'neutral', 'conversational'] as const;
export type GuidanceTone = (typeof GUIDANCE_TONES)[number];

/** How the answer should be ordered. */
export const GUIDANCE_STRUCTURES = ['direct-answer', 'explained', 'step-by-step'] as const;
export type GuidanceStructure = (typeof GUIDANCE_STRUCTURES)[number];

/**
 * What guidance is not allowed to touch.
 *
 * Carried in every guidance rather than stated once in a document, because the thing that must not change
 * is the thing a response stage is most likely to change while "just rewording": a rounded figure, a
 * softened uncertainty, an implied permission. The list is closed, and the suite asserts it is exactly
 * these seven.
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
 * Each one is an instruction about *wording*, and none of them can hold a value from a message: a note is
 * a fixed string here and the guidance carries the id. Anything that would need to name a figure, a
 * result or a permission belongs in the answer itself, where the tool results already are.
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

/** The clauses the `reason` is assembled from, so it too is closed and quotable. */
export const GUIDANCE_CLAUSES = {
  fa: 'The reply is in Persian.',
  en: 'The reply is in English.',
  formal: 'The register is formal.',
  neutral: 'No register is claimed, so the neutral one is used.',
  conversational: 'The register is conversational.',
  'explicit-choice': 'The language was chosen outright.',
  'requested-language': 'The message asked for the language it is answered in.',
  'detected-language': 'The language follows the message.',
  'default-language':
    'Nothing was read and nothing was chosen, so the product answers in its own language.',
  technical: 'The wording is technical.',
  informed: 'The wording is informed but not technical.',
  plain: 'The wording is plain.',
  'setting-professional': 'The turn reads as work.',
  'setting-conversational': 'The turn reads as small talk.',
  'setting-unclear': 'Nothing says whether the turn is work or small talk.',
  concise: 'The message wants a short answer.',
  standard: 'The message wants a normal-sized answer.',
  detailed: 'The message wants a long answer.',
  'product-terms': "The terminology is the product's own Persian forms.",
  'english-terms': 'The terminology stays in English.',
  bilingual: 'The terminology is given in both languages where that helps.',
  question: 'The message asks something.',
  instruction: 'The message hands over a task.',
  discussion: 'The message is making a point.',
  statement: 'The message states something.',
  mixed_intent: 'The message both asks something and hands over a task.',
} as const;
export type GuidanceClauseId = keyof typeof GUIDANCE_CLAUSES;

/** The field names a guidance is allowed to have. The suite compares the produced object against it. */
export const GUIDANCE_FIELDS = [
  'version',
  'language',
  'tone',
  'detail',
  'terminology',
  'structure',
  'notes',
  'invariants',
  'reason',
] as const;

export interface ResponseGuidance {
  readonly version: number;
  readonly language: ReplyLanguage;
  readonly tone: GuidanceTone;
  readonly detail: ContextDepth;
  readonly terminology: TerminologyStyle;
  readonly structure: GuidanceStructure;
  /** What to do about the wording, by id, in the order a response stage should read them. */
  readonly notes: readonly GuidanceNoteId[];
  /** What is out of scope for this guidance, and must be taken from the tools unchanged. */
  readonly invariants: readonly GuidanceInvariant[];
  /** Why this guidance and not another, assembled from `GUIDANCE_CLAUSES`. */
  readonly reason: string;
}

/** The register, as a tone. `neutral` is a tone and not an absence of one. */
function toneOf(formality: LanguageRegister, setting: ContextSetting): GuidanceTone {
  if (formality === 'formal') return 'formal';
  if (formality === 'informal') return 'conversational';
  return setting === 'conversational' ? 'conversational' : 'neutral';
}

/**
 * How the answer should be ordered.
 *
 * A task that leans on the product's vocabulary is followed, so it is a sequence of steps. A question
 * asked in plain wording is answered and then explained, because the vocabulary the answer would take for
 * granted is the vocabulary the question did not use. Everything else is answered first: a discussion
 * still gets its answer, and a plain task with no figures in it is not a procedure.
 */
function structureOf(
  intent: ContextIntent,
  expertise: ContextExpertise,
  detail: ContextDepth,
): GuidanceStructure {
  if (intent === 'instruction') {
    return expertise === 'technical' || detail === 'detailed' ? 'step-by-step' : 'direct-answer';
  }
  if (intent === 'question' && expertise === 'plain') return 'explained';
  if (intent === 'discussion') return 'explained';
  return 'direct-answer';
}

const TONE_NOTES: Readonly<Record<ReplyLanguage, Readonly<Record<GuidanceTone, GuidanceNoteId>>>> =
  {
    fa: { formal: 'fa-formal', neutral: 'fa-neutral', conversational: 'fa-conversational' },
    en: { formal: 'en-formal', neutral: 'en-neutral', conversational: 'en-conversational' },
  };

const TERMINOLOGY_NOTES: Readonly<Record<TerminologyStyle, GuidanceNoteId>> = {
  'product-terms': 'terms-product',
  'english-terms': 'terms-english',
  bilingual: 'terms-bilingual',
};

const DETAIL_NOTES: Readonly<Record<ContextDepth, GuidanceNoteId>> = {
  concise: 'detail-concise',
  standard: 'detail-standard',
  detailed: 'detail-detailed',
};

const STRUCTURE_NOTES: Readonly<Record<GuidanceStructure, GuidanceNoteId>> = {
  'direct-answer': 'structure-direct',
  explained: 'structure-explained',
  'step-by-step': 'structure-stepwise',
};

const SETTING_CLAUSES: Readonly<Record<ContextSetting, GuidanceClauseId>> = {
  professional: 'setting-professional',
  conversational: 'setting-conversational',
  unclear: 'setting-unclear',
};

/**
 * Turn a resolved communication profile into guidance.
 *
 * Pure and total: every input combination produces a guidance, and the only thing read from the profile
 * beyond the resolved values is the reading the structure is chosen from. Nothing reads the message.
 */
export function responseGuidance(profile: CommunicationProfile): ResponseGuidance {
  const { context, language } = profile;
  const tone = toneOf(profile.formality.value, context.setting.value);
  const structure = structureOf(
    context.intent.value,
    context.expertise.value,
    profile.detail.value,
  );

  const notes: GuidanceNoteId[] = [
    TONE_NOTES[language.language][tone],
    TERMINOLOGY_NOTES[profile.terminology.value],
    DETAIL_NOTES[profile.detail.value],
    STRUCTURE_NOTES[structure],
  ];
  // A technical turn is where a figure is most likely to be paraphrased, and the invariant is most
  // easily broken by a helpful round number.
  if (context.expertise.value === 'technical') notes.push('figures-verbatim');
  // A task was handed over. Asking a follow-up question that the message already answered turns the
  // answer into another turn of work, which is the one failure a task-shaped turn actually minds.
  if (context.intent.value === 'instruction') notes.push('ask-nothing-further');

  const clauses: GuidanceClauseId[] = [
    language.language,
    language.source === 'explicit'
      ? 'explicit-choice'
      : language.source === 'requested'
        ? 'requested-language'
        : language.source === 'detected'
          ? 'detected-language'
          : 'default-language',
    tone === 'formal' ? 'formal' : tone === 'conversational' ? 'conversational' : 'neutral',
    context.expertise.value,
    SETTING_CLAUSES[context.setting.value],
    profile.detail.value,
    profile.terminology.value,
    context.intent.value === 'mixed' ? 'mixed_intent' : context.intent.value,
  ];

  return {
    version: GUIDANCE_VERSION,
    language: language.language,
    tone,
    detail: profile.detail.value,
    terminology: profile.terminology.value,
    structure,
    notes,
    invariants: GUIDANCE_INVARIANTS,
    reason: clauses.map((clause) => GUIDANCE_CLAUSES[clause]).join(' '),
  };
}

/**
 * The whole chain for a caller that has only text: read the message, resolve the preferences, and produce
 * the guidance. The convenience exists so the response stage has one entry point rather than three, and
 * so the suite can assert the chain end to end without assembling it by hand.
 */
export function guidanceFor(
  text: string,
  options: CommunicationProfileOptions = {},
): ResponseGuidance {
  return responseGuidance(communicationProfile(text, options));
}
