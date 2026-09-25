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

/**
 * The vocabularies, the note catalogue and the invariants are the *response-style contract*
 * (`@shared/language/guidance`, Phase 7.5.3.4.2), imported and re-exported under the names this layer has
 * used since 7.5.3.2.
 *
 * They are defined on the shared surface rather than here for one reason: a note is **resolved by the
 * response stage**, which runs on the other side of the process divide, and two copies of an instruction
 * are two instructions. This module owns the reading that produces the ids; the contract owns the text they
 * resolve to, and neither can drift from the other without a compile error.
 */
export {
  GUIDANCE_INVARIANTS,
  GUIDANCE_NOTES,
  GUIDANCE_STRUCTURES,
  GUIDANCE_TONES,
  GUIDANCE_VERSION,
  type GuidanceInvariant,
  type GuidanceNoteId,
  type GuidanceStructure,
  type GuidanceTone,
} from '@shared/language/guidance';
// The same names again, imported rather than exported: `export … from` does not bind anything locally, and
// this module reads the catalogue as well as publishing it.
import {
  GUIDANCE_INVARIANTS,
  GUIDANCE_VERSION,
  type GuidanceInvariant,
  type GuidanceNoteId,
  type GuidanceStructure,
  type GuidanceTone,
  type ResponseStyle,
} from '@shared/language/guidance';

/** The clauses the `reason` is assembled from, so it too is closed and quotable. */
export const GUIDANCE_CLAUSES = {
  fa: 'The reply is in Persian.',
  en: 'The reply is in English.',
  formal: 'The register is formal.',
  neutral: 'No register is claimed, so the neutral one is used.',
  conversational: 'The register is conversational.',
  'explicit-choice': 'The language was chosen outright.',
  'requested-language': 'The message asked for the language it is answered in.',
  'observed-language': 'The language follows what this person is habitually answered in.',
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
    // One clause per source, and the chain is exhaustive on purpose: a source added to 7.5.3.1's list
    // without a clause here would silently describe itself as "nothing was read and nothing was chosen",
    // which is the one sentence a guidance may not say about a decision it did make.
    language.source === 'explicit'
      ? 'explicit-choice'
      : language.source === 'requested'
        ? 'requested-language'
        : language.source === 'observed'
          ? 'observed-language'
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

/**
 * The same decision in the shape that crosses the process divide — Phase 7.5.3.4.2.
 *
 * A projection and nothing more: four values and the note ids, copied out of a resolved guidance, so the
 * object a response stage is handed cannot become a second opinion about the same turn. What is *dropped*
 * is as deliberate as what is kept — the `reason` stays here, because it is written for a person to read
 * and disagree with, and a model has no business being told why it is being asked to sound a certain way;
 * the language is not here either, because it travels as its own field and a turn whose language and style
 * arrived in one object could be given one without the other.
 *
 * Exported as a function over a guidance rather than as a second resolver, which is the property that
 * matters: there is one place where a style is decided, and this is how it is written down.
 */
export function responseStyle(guidance: ResponseGuidance): ResponseStyle {
  return {
    tone: guidance.tone,
    detail: guidance.detail,
    terminology: guidance.terminology,
    structure: guidance.structure,
    notes: guidance.notes,
  };
}
