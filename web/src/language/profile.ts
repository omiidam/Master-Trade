/**
 * The linguistic profile — Phase 7.5.3.1, Task 2.
 *
 * Task 1 answers "what is this message". This module answers the two questions a later stage actually
 * needs, and keeps them apart:
 *
 *   1. **What does the exchange look like?** — a `LanguageProfile`: the detection, plus the person's
 *      standing preference, plus the resolution between them. One value, structured, reusable.
 *   2. **What language should the reply be in?** — the `reply` inside it, produced by `resolveLanguage`.
 *
 * The separation is the point. Detection is about the *message* and changes every time somebody types;
 * the preference is about the *person* and changes when they say so; and the reply is the one thing that
 * combines them. A later stage that conflated them would have to re-decide the precedence every time,
 * which is exactly how two stages end up disagreeing about the same conversation.
 *
 * The precedence rule, in one sentence: **an instruction in the message wins, then an explicit choice, then
 * what previous turns showed, and only then what this reading implies.**
 *
 *   - a message that asks (`به انگلیسی جواب بده`) → what it asked for, `source: 'requested'`. This is the
 *     sharpest case of the phase's rule that an explicit instruction outranks a learned or stored
 *     preference: the request was made *now*, in words, and a setting chosen last month cannot outweigh
 *     it. Where the stored choice disagreed, the reply says that it was passed over.
 *   - preference `fa` and an English message → Persian. That is the override Phase 7.5.3.1 asks for, and
 *     it is the reason the setting exists: a Persian speaker reading English documentation still wants
 *     the answer in Persian, and no amount of detection can know that.
 *   - preference `auto`, a habit of being answered in Persian, and an English message → Persian,
 *     `source: 'observed'`. This is Phase 7.5.3.4's step, and it is deliberately *above* the reading:
 *     the learned counts describe the person, and the reading describes one message they typed. It sits
 *     *below* the explicit choice for the same reason — a habit may be inferred, a setting may not.
 *   - preference `auto` and a Finglish message → Persian, because Finglish *is* Persian written in Latin
 *     letters and answering it in English would answer a different question.
 *   - preference `auto` and a message with no letters at all → the product's own language, and the
 *     profile says `default` rather than `detected`, because nothing was detected.
 *
 * `overridden` is recorded rather than implied. When it is true, the profile is stating that two explicit
 * statements disagreed — a setting and a request, or a setting and the message — which is a fact a later
 * stage may want to act on, and one that would otherwise be invisible.
 *
 * What this module does not do
 * ---------------------------
 * It does not rewrite the message, and it holds no copy of it. The profile is derived values only, and
 * `tests/language-detection.test.ts` asserts that: the evidence it carries is the message's own words,
 * verbatim, and there is no field anywhere in it that a corrected string could travel in. Language
 * analysis must never alter the meaning of what somebody wrote, and the way to guarantee that is to
 * never have the text in hand at the moment a decision is made.
 *
 * It also does not decide *how* to answer. There is no prompt text, no instruction and no tone here — the
 * adaptive response system is a later sub-phase, and this one establishes what it will be built on.
 */

import {
  detectLanguage,
  type DetectionOptions,
  type LanguageContext,
  type LanguageDetection,
  type LanguageKind,
  type LanguageRegister,
  type LanguageRequest,
  type LanguageStyle,
  type LanguageVerbosity,
  type LanguageWording,
} from './detect.js';
import {
  DEFAULT_LANGUAGE_PREFERENCE,
  readLanguagePreference,
  type LanguagePreference,
  type PreferenceStorage,
} from './preference.js';

/**
 * The version of the analysis, bumped when a verdict means something different than it did.
 *
 * A later stage that stores or caches a profile needs to know which rules produced it; a profile is
 * derived knowledge, and derived knowledge without its producer is a number nobody can re-derive.
 */
export const LANGUAGE_PROFILE_VERSION = 1;

/**
 * The language a reply should be written in.
 *
 * `fa` or `en` only. A reply is never `mixed` — that describes a *message*, not a writing instruction —
 * and never `unknown`, because a product has to answer in something. `finglish` is a way of writing
 * Persian, not a third language to answer in.
 */
export const REPLY_LANGUAGES = ['fa', 'en'] as const;
export type ReplyLanguage = (typeof REPLY_LANGUAGES)[number];

/**
 * Where the reply's language came from.
 *
 * `requested` is the strongest source there is — the message asked — and `default` the weakest: nothing
 * was read, nothing was chosen and nothing was learned. The order of this list is the precedence: the
 * first two are statements the person made, `observed` is what their own previous turns showed, and the
 * last two are what this one message implies.
 */
export const REPLY_SOURCES = ['requested', 'explicit', 'observed', 'detected', 'default'] as const;
export type ReplySource = (typeof REPLY_SOURCES)[number];

/**
 * What previous turns of this conversation showed about the language to answer in.
 *
 * Counts, not a verdict about a person: `count` turns of `samples` were answered in `language`. The
 * caller that owns the learned store decides when there is enough evidence to call that a habit
 * (`learnedLanguage` in `communication.ts`); this module only reads the answer it is handed.
 */
export interface LearnedLanguage {
  readonly language: ReplyLanguage;
  readonly count: number;
  readonly samples: number;
}

export interface LanguageReply {
  readonly language: ReplyLanguage;
  readonly source: ReplySource;
  /** True when an explicit choice disagreed with what the message looks like. */
  readonly overridden: boolean;
  /** Why, in a sentence a person can read and disagree with. */
  readonly reason: string;
}

export interface LanguageProfile extends LanguageDetection {
  readonly profileVersion: number;
  /** What the person has chosen. `auto` when they have chosen nothing. */
  readonly preference: LanguagePreference;
  readonly reply: LanguageReply;
}

export interface LanguageProfileOptions extends DetectionOptions {
  /** The person's standing choice. Defaults to `auto`, which is what a first run has. */
  readonly preference?: LanguagePreference;
  /** What previous turns showed, when there is enough of them to count. `null` is "nothing learned". */
  readonly learned?: LearnedLanguage | null;
}

/**
 * The language a reply should be written in, given a choice, what previous turns showed, and a reading of
 * the message.
 *
 * Exported on its own because it is the rule Task 3 names — the explicit selection overrides detection —
 * and a rule worth stating is worth testing without building a whole profile to test it.
 *
 * The learned argument is optional and defaults to nothing, so a caller that has no history calls this
 * exactly as it always did and gets exactly what it always got.
 */
export function resolveLanguage(
  preference: LanguagePreference,
  detection: LanguageDetection,
  learned: LearnedLanguage | null = null,
): LanguageReply {
  // An instruction inside the message comes first, before the setting: it is the most explicit signal
  // available, it was given for this turn rather than for every turn, and the phase's rule about explicit
  // instructions outranking stored preferences is what it is. The request vocabulary cannot produce
  // `mixed` or `unknown`, so this narrows to the two languages a reply may be written in.
  const request = detection.request;
  if (request !== null) {
    const requested: ReplyLanguage = request.language === 'en' ? 'en' : 'fa';
    const setting: ReplyLanguage | 'auto' = preference;
    const lost = setting !== 'auto' && setting !== requested;
    return {
      language: requested,
      source: 'requested',
      overridden: lost,
      reason:
        setting === 'auto' || !lost
          ? `The message asks for ${describe(requested)} (${request.phrase}), so that is the language of the reply.`
          : `The message asks for ${describe(requested)} (${request.phrase}), which outranks the ${describe(setting)} setting chosen for this person.`,
    };
  }

  if (preference !== 'auto') {
    const overridden = detection.language !== 'unknown' && !matches(preference, detection.language);
    return {
      language: preference,
      source: 'explicit',
      overridden,
      reason: overridden
        ? `This person chose ${describe(preference)}, and the message looks ${describe(detection.language)}; an explicit choice is what wins.`
        : `This person chose ${describe(preference)}.`,
    };
  }

  // Then what their own previous turns showed. This step is above the reading of the message and below
  // the setting: it is evidence about the person rather than a statement by them, so it may outweigh one
  // message — and may never outweigh a choice. A habit that disagrees with the message is recorded, the
  // same way a setting that disagrees with it is.
  if (learned !== null) {
    const overridden =
      detection.language !== 'unknown' && !matches(learned.language, detection.language);
    return {
      language: learned.language,
      source: 'observed',
      overridden,
      reason: overridden
        ? `${learned.count} of ${learned.samples} previous turn(s) were answered in ${describe(learned.language)}, and this message reads ${describe(detection.language)}; a habit outranks the reading of one message.`
        : `${learned.count} of ${learned.samples} previous turn(s) were answered in ${describe(learned.language)}.`,
    };
  }

  const detected = replyFor(detection);
  if (detected !== null) {
    return {
      language: detected,
      source: 'detected',
      overridden: false,
      reason: reasonFor(detection),
    };
  }

  return {
    language: 'en',
    source: 'default',
    overridden: false,
    reason:
      'The message carries no letters and no choice has been made, so the product answers in its own language.',
  };
}

/** Whether an explicit choice agrees with what the message looks like. */
function matches(preference: LanguagePreference, detected: LanguageKind): boolean {
  return preference === detected || (preference === 'fa' && detected === 'finglish');
}

/**
 * The language the message itself implies, or nothing when it implies none.
 *
 * `mixed` is decided by which script has more letters, because a Persian sentence with three English
 * technical tokens is a Persian sentence — and the reverse. The technical tokens are English by nature
 * and stay English in the reply; they are not evidence about what language to *write* in.
 */
function replyFor(detection: LanguageDetection): ReplyLanguage | null {
  switch (detection.language) {
    case 'fa':
    case 'finglish':
      return 'fa';
    case 'en':
      return 'en';
    case 'mixed':
      return detection.context.persianLetters >= detection.context.latinLetters ? 'fa' : 'en';
    case 'unknown':
      return null;
  }
}

function reasonFor(detection: LanguageDetection): string {
  const { persianLetters, latinLetters } = detection.context;
  switch (detection.language) {
    case 'fa':
      return `The message is written in Persian (${persianLetters} Persian letters, no Latin ones).`;
    case 'en':
      return `The message is written in English (${latinLetters} Latin letters, no Persian ones).`;
    case 'finglish':
      return 'The message is Persian written in Latin letters, so the reply is in Persian.';
    case 'mixed':
      return `The message mixes both scripts, and ${
        persianLetters >= latinLetters
          ? `the Persian half is larger (${persianLetters} against ${latinLetters})`
          : `the Latin half is larger (${latinLetters} against ${persianLetters})`
      }, so the reply follows it.`;
    case 'unknown':
      return 'The message carries no letters.';
  }
}

function describe(kind: LanguageKind): string {
  switch (kind) {
    case 'fa':
      return 'Persian';
    case 'en':
      return 'English';
    case 'mixed':
      return 'a mix of Persian and English';
    case 'finglish':
      return 'Persian written in Latin letters';
    case 'unknown':
      return 'unreadable as a language';
  }
}

/**
 * Build the profile a later stage consumes.
 *
 * Detection first, then the resolution, then both under one version. The message is read and not kept:
 * the returned value contains counts, closed-vocabulary verdicts and the words that were evidence, and
 * nothing that could stand in for the message itself.
 */
export function languageProfile(
  text: string,
  options: LanguageProfileOptions = {},
): LanguageProfile {
  const detection = detectLanguage(text, options);
  const preference = options.preference ?? DEFAULT_LANGUAGE_PREFERENCE;
  return {
    profileVersion: LANGUAGE_PROFILE_VERSION,
    ...detection,
    preference,
    reply: resolveLanguage(preference, detection, options.learned ?? null),
  };
}

/**
 * The profile options that honour whatever this person has chosen.
 *
 * This is the seam between the switch and the language system, and it is the only one: the control
 * writes the preference through `preference.ts`, and a language stage that wants to respect it calls
 * this function and passes the result to `languageProfile`. Neither side knows about the other — a
 * stage that reads storage directly would duplicate the key, and a stage that read the interface store
 * would make the language layer depend on React — so the *setting* is read here, from the one module
 * that knows where it lives, and the caller never has to think about persistence at all.
 *
 * An unreadable store is not an error: it produces `auto`, which is the answer for somebody who has
 * chosen nothing.
 */
export function storedProfileOptions(storage?: PreferenceStorage | null): LanguageProfileOptions {
  return { preference: readLanguagePreference(storage).preference };
}

/**
 * The field names a profile is allowed to have, in one place.
 *
 * This exists so the honesty rule is checkable rather than aspirational: `tests/language-detection.test.ts`
 * asserts the built profile's keys against this list, so a field that describes *who somebody is* — a
 * name, an age, a gender, a country, a religion, a native language — fails the suite instead of shipping
 * as a quiet addition. Detection is allowed to notice how a person writes. It is not allowed to build a
 * picture of the person.
 */
export const LANGUAGE_PROFILE_FIELDS = [
  'profileVersion',
  'preference',
  'reply',
  // The detection, carried whole.
  'language',
  'confidence',
  'register',
  'registerConfidence',
  'wording',
  'style',
  'verbosity',
  'request',
  'context',
] as const;

export type {
  LanguageContext,
  LanguageDetection,
  LanguageRegister,
  LanguageRequest,
  LanguageStyle,
  LanguageVerbosity,
  LanguageWording,
};
