/**
 * The communication profile — Phase 7.5.3.2, Task 2.
 *
 * One value, four sources, and one rule about who wins
 * ---------------------------------------------------
 * A later stage needs to know how to write to this person: which language, how much detail, which
 * register, and how to handle the product's terminology. Four things can have an opinion about each of
 * those, and they are not equally good evidence:
 *
 *   1. **an explicit instruction in the message** — `خلاصه بگو`, `رسمی بنویس`, `با معادل فارسی`. It was
 *      asked for, now, in words. It wins. Always.
 *   2. **something this person stated outright** — the statements in `learning.ts`, from Phase 7.5.3.4.3.
 *      Words somebody used about how they want to be answered, which is not an inference and therefore
 *      not something a reading or a count may overrule.
 *   3. **what previous turns looked like** — the observations below, which are counts and nothing else.
 *      A person's own standing preference, counted rather than guessed, and the source of it is named in
 *      the reason so nobody is answered in a register they never asked for without being told why.
 *   4. **what this message looks like** — a four-word turn wants a short answer, and that is evidence
 *      about *this* turn rather than about anybody's taste.
 *   5. **the default** — standard detail, neutral register, the product's own terminology.
 *
 * Steps 2 and 3 in that order are Phase 7.5.3.4.3's rule, and the split between them is the honest one:
 * a statement is the person's own words and a count is the product's guess, so the guess never gets to
 * outrank the sentence — and an inference is still better than a reading of one turn, which 7.5.3.4.2
 * established when it **reversed** the order 7.5.3.2 had, where the counts were consulted only where the
 * reading of the message claimed nothing.
 * The argument is the one 7.5.3.4.1 made for the language of an answer — an inference is drawn from *one*
 * turn and a learned preference is a count of the person's own — with the same safeguard: an explicit
 * request still outranks both, and where the learned value disagrees with the reading the reason says so,
 * so the disagreement is visible instead of being reconciled in silence. A person who usually wants one
 * line and who this time writes a paragraph and asks for detail still gets a detailed answer, because
 * asking is the one thing that always wins. The rule is stated once in `resolveCommunication`, and the
 * reason on each dimension names which source won and which was passed over.
 *
 * What "learned" means here, and why it is safe to call it that
 * ------------------------------------------------------------
 * Observations are **counts of closed-vocabulary readings** — how many turns read as informal, how many
 * asked for detail — with no text, no words from any message, no identifier and no timestamp. The suite
 * asserts that by walking the stored value and requiring every leaf to be a number, because that is the
 * property that makes a learned store reviewable: a histogram of *how* somebody writes cannot become a
 * record of *what* they wrote, and it cannot hold a credential.
 *
 * Three further consequences, all intentional:
 *
 *   - **Nothing here writes a preference.** There is no path from these counts to a stored setting. The
 *     counts are inputs to a resolution whose output carries `source: 'observed'` and a reason naming the
 *     counts it came from, so a learned preference is always attributable — a reader of the profile can
 *     see that it was inferred, from how many turns, and can disagree with it.
 *   - **The memory is bounded and decays.** Past `OBSERVATION_WINDOW` turns the counts are halved, so a
 *     style from a year ago does not outlive the person's current one, and the store cannot grow without
 *     limit.
 *   - **The store is namespaced with the other language setting** and is *not* the language knowledge
 *     store: `LanguageMemory` holds cited, reviewed, shared knowledge about Persian, and this holds
 *     per-user behaviour counts. The two are never the same shape, which is why they are never the same
 *     store.
 */

import {
  CONTEXT_DEPTHS,
  analyzeCommunication,
  type CommunicationContext,
  type CommunicationContextOptions,
  type ContextDepth,
} from './context.js';
import { GUIDANCE_TERMINOLOGY } from '@shared/language/guidance';
import { detectLanguage, LANGUAGE_REGISTERS, type LanguageRegister } from './detect.js';
import { statedPreference, type CorrectionStore } from './learning.js';
import {
  resolveLanguage,
  reversalClause,
  saidTimes,
  REPLY_LANGUAGES,
  type LanguageReply,
  type LearnedLanguage,
  type ReplyLanguage,
} from './profile.js';
import {
  DEFAULT_LANGUAGE_PREFERENCE,
  preferenceStorage,
  type LanguagePreference,
  type PreferenceStorage,
} from './preference.js';
import { standaloneMatches } from './rules.js';

/** Bumped when a resolved value means something different than it did. */
export const COMMUNICATION_VERSION = 1;

/**
 * Where a resolved value came from, strongest first — the order `resolveCommunication` consults them in.
 *
 * Two things are written down in this one line, and neither is visible in the resolver alone. `observed`
 * moved ahead of `detected` in Phase 7.5.3.4.2, which is the phase's "learned preferences come before
 * automatic inference": a count of somebody's own turns is evidence about *them*, and the reading of one
 * message is evidence about one message. `corrected` joined in Phase 7.5.3.4.3, above both, because a
 * statement is not an inference at all — `explicit` and `corrected` are words the person used, and the
 * other three are things the product worked out.
 */
export const PREFERENCE_SOURCES = [
  'explicit',
  'corrected',
  'observed',
  'detected',
  'default',
] as const;
export type PreferenceSource = (typeof PREFERENCE_SOURCES)[number];

/**
 * How a reply should handle the product's terminology.
 *
 * Balance and style are one dimension here on purpose: `product-terms` with "keep the English too" is not
 * a third setting, it is a contradiction, and two fields that can contradict each other is how a
 * response stage ends up with a rule nobody can explain.
 *
 *   - `product-terms` — use the form the language store records for each concept. The default, and the
 *     answer whenever the person names no concepts in the other language.
 *   - `english-terms` — keep the English word. What an English reply does, and what a person who asks to
 *     keep the English gets.
 *   - `bilingual` — the product's form, with the English beside it where the English is what the person
 *     is reading in. The mixed-message case: it preserves the terms a person already knows without
 *     translating the ones that have no Persian counterpart.
 *
 * The vocabulary is the response-style contract's (`@shared/language/guidance`, Phase 7.5.3.4.2):
 * `TerminologyStyle` is `GuidanceTerminology` under this layer's older name, for the same reason the depth
 * reading is — the value that says how a turn names concepts and the value that tells a response stage how
 * to name them are the same value, and two lists for it could disagree.
 */
export const TERMINOLOGY_STYLES = GUIDANCE_TERMINOLOGY;
export type TerminologyStyle = (typeof TERMINOLOGY_STYLES)[number];

/**
 * Words that ask for the terms themselves, rather than for a language.
 *
 * No phrase here is a prefix of a phrase in another list, and that is a requirement rather than a tidy-up:
 * asking for two styles at once is refused as a contradiction, so `با معادل` sitting inside `با معادل
 * فارسی` would turn one clear request into none. The two-word phrases are the ones an Iranian writer
 * actually types; `انگلیسیاش کن` is the colloquial form and is kept because that is what people say.
 */
export const TERMINOLOGY_REQUESTS: Readonly<Record<TerminologyStyle, readonly string[]>> = {
  'product-terms': [
    'معادل فارسی',
    'واژه فارسی',
    'فارسیاش کن',
    'persian term',
    'persian equivalent',
  ],
  'english-terms': [
    'همان انگلیسی',
    'انگلیسیاش کن',
    'معادل انگلیسی',
    'english term',
    'in english terms',
  ],
  bilingual: [
    'هم فارسی هم انگلیسی',
    'در پرانتز بنویس',
    'به هر دو زبان',
    'both languages',
    'with the english',
  ],
};

/** A resolved value: what to use, who said so, and why. */
export interface PreferenceReading<T extends string> {
  readonly value: T;
  readonly source: PreferenceSource;
  /** One sentence naming what won and, where it matters, what was passed over. */
  readonly reason: string;
}

export interface CommunicationProfile {
  readonly version: number;
  /** 7.5.3.1's resolution, carried rather than recomputed. */
  readonly language: LanguageReply;
  readonly formality: PreferenceReading<LanguageRegister>;
  readonly detail: PreferenceReading<ContextDepth>;
  readonly terminology: PreferenceReading<TerminologyStyle>;
  /** The reading this was resolved from, so a consumer never has to read the message twice. */
  readonly context: CommunicationContext;
  /** How many previous turns informed the resolution. Zero means nothing was learned yet. */
  readonly observedSamples: number;
}

/* ────────────────────────────────────────────────────────────────────────────
 * What has been observed before
 * ──────────────────────────────────────────────────────────────────────────── */

/** Past this many turns the counts are halved, so the store is bounded and recent turns count more. */
export const OBSERVATION_WINDOW = 50;

/** Fewer samples than this and an observation is not evidence of anything, so it is not consulted. */
export const OBSERVATION_MINIMUM = 5;

/**
 * The learned store: how many turns read each way, and nothing else.
 *
 * Every leaf is a count of a closed-vocabulary reading. There is no field for a message, a word from one,
 * a user, a session or a time, and the suite requires every leaf to be a number.
 *
 * Three dimensions are counted, and terminology is deliberately absent from all of them. Register and
 * detail are the ones where a standing style is worth knowing *and* the current turn can be silent about
 * it — a one-line message says nothing about how formal somebody likes their answers. **Language** is the
 * third (Phase 7.5.3.4), and it is counted as *the language each turn was answered in*: a person who has
 * been reading Persian answers for a week and then types one English sentence has not stopped being a
 * Persian reader, and the count is the only place that fact is written down. Terminology is never silent:
 * the style follows the script mixing in the message in front of it, or a request in that message, so a
 * count of past turns would only ever be a fourth and weaker opinion with no gap to fill.
 */
export interface CommunicationObservations {
  readonly samples: number;
  readonly formality: Readonly<Record<LanguageRegister, number>>;
  readonly detail: Readonly<Record<ContextDepth, number>>;
  readonly languages: Readonly<Record<ReplyLanguage, number>>;
}

/** The key, namespaced with the product's other setting and outside the knowledge store's namespace. */
export const COMMUNICATION_OBSERVATION_KEY = 'master-trade.language.observations';

function zeroes<T extends string>(values: readonly T[]): Record<T, number> {
  return Object.fromEntries(values.map((value) => [value, 0])) as Record<T, number>;
}

export function emptyObservations(): CommunicationObservations {
  return {
    samples: 0,
    formality: zeroes(LANGUAGE_REGISTERS),
    detail: zeroes(CONTEXT_DEPTHS),
    languages: zeroes(REPLY_LANGUAGES),
  };
}

/**
 * Halve every count once the window is full.
 *
 * Flooring loses a sample's worth of precision and keeps the arithmetic exact, which matters more: a
 * fraction stored in a counter is a number that stops being countable, and this value's whole claim is
 * that it is a count.
 */
function decay(observations: CommunicationObservations): CommunicationObservations {
  if (observations.samples < OBSERVATION_WINDOW) return observations;
  const halve = <T extends string>(counts: Readonly<Record<T, number>>): Record<T, number> => {
    const result = {} as Record<T, number>;
    for (const key of Object.keys(counts) as T[]) result[key] = Math.floor(counts[key] / 2);
    return result;
  };
  return {
    samples: Math.floor(observations.samples / 2),
    formality: halve(observations.formality),
    detail: halve(observations.detail),
    languages: halve(observations.languages),
  };
}

/**
 * Record one turn. The only way anything is ever added to the learned store.
 *
 * The language is the one reading that comes from the *resolution* rather than from the message — the
 * reply's own language, which already folds in the person's setting and any request they made, so the
 * count is of what this product actually answered them in. A caller that has no resolution to record
 * omits it, and the counter simply stays where it was rather than being invented.
 */
export function observeCommunication(
  context: CommunicationContext,
  observations: CommunicationObservations = emptyObservations(),
  replyLanguage: ReplyLanguage | null = null,
): CommunicationObservations {
  const current = decay(observations);
  const formality = { ...current.formality };
  const detail = { ...current.detail };
  formality[context.formality.value] = (formality[context.formality.value] ?? 0) + 1;
  detail[context.depth.value] = (detail[context.depth.value] ?? 0) + 1;
  const languages = { ...current.languages };
  if (replyLanguage !== null) {
    languages[replyLanguage] = (languages[replyLanguage] ?? 0) + 1;
  }
  return { ...current, samples: current.samples + 1, formality, detail, languages };
}

/**
 * The language this person is habitually answered in, when there is enough evidence to call it a habit.
 *
 * The rules are the ones the register and detail dimensions already use, and they are reused rather than
 * restated so the three dimensions cannot drift apart: the minimum sample count is the same, a tie is not
 * a preference, and counts that never rose above zero are nothing at all. What differs is *which* question
 * is being asked — this one is about the reply rather than about the message — and that difference is
 * exactly why it is a count and not a reading.
 */
export function learnedLanguage(
  observations: CommunicationObservations | null,
  minimum: number = OBSERVATION_MINIMUM,
): LearnedLanguage | null {
  if (observations === null) return null;
  const dominant = dominantObservation(observations.languages, observations.samples, minimum);
  if (dominant === null) return null;
  return {
    language: dominant.value as ReplyLanguage,
    count: dominant.count,
    samples: observations.samples,
  };
}

/** Merge two stores, for a caller assembling history from more than one place. */
export function mergeObservations(
  a: CommunicationObservations,
  b: CommunicationObservations,
): CommunicationObservations {
  const add = <T extends string>(
    left: Readonly<Record<T, number>>,
    right: Readonly<Record<T, number>>,
  ): Record<T, number> =>
    Object.fromEntries(
      Object.keys(left).map((key) => [key, (left[key as T] ?? 0) + (right[key as T] ?? 0)]),
    ) as Record<T, number>;
  return {
    samples: a.samples + b.samples,
    formality: add(a.formality, b.formality),
    detail: add(a.detail, b.detail),
    languages: add(a.languages, b.languages),
  };
}

/** The value a counter is dominated by, when there is enough evidence to say it is dominated at all. */
export function dominantObservation<T extends string>(
  counts: Readonly<Record<T, number>>,
  samples: number,
  minimum: number = OBSERVATION_MINIMUM,
): { readonly value: T; readonly count: number } | null {
  if (samples < minimum) return null;
  const entries = Object.entries(counts) as [T, number][];
  const sorted = entries.slice().sort((left, right) => right[1] - left[1]);
  const [first, second] = [sorted[0], sorted[1]];
  if (first === undefined || first[1] === 0) return null;
  // A tie is not a preference. `informal 3, neutral 3` is somebody whose turns change, and picking the
  // first alphabetically would be inventing a tendency out of a coin toss.
  if (second !== undefined && second[1] === first[1]) return null;
  return { value: first[0], count: first[1] };
}

/**
 * Read a stored value back, keeping only what this build understands.
 *
 * Validation is structural rather than merely syntactic: unknown keys are dropped, counts that are not
 * non-negative integers are dropped, and the result is always a complete store. A value written by a
 * newer build therefore degrades to what this one can honour rather than becoming a fourth state the
 * resolution has to have an opinion about.
 */
export function parseObservations(raw: unknown): CommunicationObservations {
  const base = emptyObservations();
  if (raw === null || typeof raw !== 'object') return base;
  const source = raw as Record<string, unknown>;
  const counts = <T extends string>(value: unknown, values: readonly T[]): Record<T, number> => {
    if (value === null || typeof value !== 'object') return zeroes(values);
    const record = value as Record<string, unknown>;
    const result = zeroes(values);
    for (const key of values) {
      const count = record[key];
      if (typeof count === 'number' && Number.isInteger(count) && count >= 0) result[key] = count;
    }
    return result;
  };
  const samples = source.samples;
  return {
    samples: typeof samples === 'number' && Number.isInteger(samples) && samples >= 0 ? samples : 0,
    formality: counts(source.formality, LANGUAGE_REGISTERS),
    detail: counts(source.detail, CONTEXT_DEPTHS),
    languages: counts(source.languages, REPLY_LANGUAGES),
  };
}

export interface ObservationReading {
  readonly observations: CommunicationObservations;
  /** True when a real store answered; false when there was none, or it threw. */
  readonly storable: boolean;
  /** True when the store held something this build could read. */
  readonly stored: boolean;
}

export function readCommunicationObservations(
  storage: PreferenceStorage | null = preferenceStorage(),
): ObservationReading {
  if (storage === null)
    return { observations: emptyObservations(), storable: false, stored: false };
  try {
    const raw = storage.getItem(COMMUNICATION_OBSERVATION_KEY);
    if (raw === null) return { observations: emptyObservations(), storable: true, stored: false };
    const parsed: unknown = JSON.parse(raw);
    return { observations: parseObservations(parsed), storable: true, stored: true };
  } catch {
    // A store that throws, or holds something that is not JSON at all: nothing was learned, and the
    // resolution falls back on the message in front of it.
    return { observations: emptyObservations(), storable: false, stored: false };
  }
}

export function writeCommunicationObservations(
  observations: CommunicationObservations,
  storage: PreferenceStorage | null = preferenceStorage(),
): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(COMMUNICATION_OBSERVATION_KEY, JSON.stringify(observations));
    return true;
  } catch {
    return false;
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * The resolution
 * ──────────────────────────────────────────────────────────────────────────── */

/** A closed list matched as words, case-insensitively — the same question the context module asks. */
function matchesOf(text: string, forms: readonly string[]): string[] {
  const lower = text.toLowerCase();
  return forms.filter((form) => standaloneMatches(lower, form.toLowerCase()).length > 0);
}

function explicitTerminologyIn(text: string): TerminologyStyle | null {
  const found = TERMINOLOGY_STYLES.filter(
    (style) => matchesOf(text, TERMINOLOGY_REQUESTS[style]).length > 0,
  );
  // Asked two ways at once: neither reading is honoured, and the message itself decides.
  return found.length === 1 ? (found[0] as TerminologyStyle) : null;
}

/**
 * Resolve the four preferences, in the one order this file argues for.
 *
 * The text is passed alongside the context because an explicit instruction is a fact about the message
 * that the readings deliberately do not fold in: `requestedFormality` says that a style was asked for,
 * and the words that asked for it are needed to say so in the reason.
 *
 * The order is **explicit, corrected, learned, detected, default**. The middle pair was reversed in Phase
 * 7.5.3.4.2 — 7.5.3.2 read the message first and fell back on the learned counts only where the reading
 * claimed nothing — and `corrected` was added above both in Phase 7.5.3.4.3. The arguments are the ones
 * 7.5.3.4.1 made for the language of an answer, applied to style: an inference is drawn from *one* turn, a
 * learned preference is a count of the person's own, and a statement is the person's own words — so the
 * order is statement, then count, then reading. Where any two of them disagree the disagreement is recorded
 * in the reason and named to the person rather than reconciled in silence, which is what "do not silently
 * overwrite" means once the value has already been decided. An explicit request still outranks all of them,
 * which is what makes every rule below it correctable: `رسمی بنویس` is answered as asked.
 */
export function resolveCommunication(
  context: CommunicationContext,
  language: LanguageReply,
  text: string,
  signals: CommunicationSignals = {},
): CommunicationProfile {
  const observations = signals.observations ?? null;
  const samples = observations?.samples ?? 0;

  const formality = ((): PreferenceReading<LanguageRegister> => {
    if (context.requestedFormality !== null) {
      return {
        value: context.requestedFormality,
        source: 'explicit',
        reason: `The message asks for ${context.requestedFormality} wording, which outranks how it happens to be phrased.`,
      };
    }
    const stated = statedPreference<LanguageRegister>(signals.corrections, 'formality');
    if (stated !== null) {
      const disagrees =
        context.formality.value !== 'neutral' && context.formality.value !== stated.value;
      return {
        value: stated.value,
        source: 'corrected',
        reason: `${
          disagrees
            ? `This person asked for ${stated.value} wording${saidTimes(stated.confirmations)}, and this message reads ${context.formality.value}; a stated correction outranks the reading of one message.`
            : `This person asked for ${stated.value} wording${saidTimes(stated.confirmations)}, so that is the register of the reply.`
        }${reversalClause(stated, (value) => value)}`,
      };
    }
    const learned =
      observations === null ? null : dominantObservation(observations.formality, samples);
    if (learned !== null) {
      const disagrees =
        context.formality.value !== 'neutral' && context.formality.value !== learned.value;
      return {
        value: learned.value,
        source: 'observed',
        reason: disagrees
          ? `${learned.count} of ${samples} previous turn(s) read as ${learned.value}, and this message reads ${context.formality.value}; a learned preference outranks the reading of one message, and the next request for a register outranks both.`
          : `The message claims no register, and ${learned.count} of ${samples} previous turn(s) read as ${learned.value}.`,
      };
    }
    if (context.formality.value !== 'neutral') {
      return {
        value: context.formality.value,
        source: 'detected',
        reason: context.formality.reason,
      };
    }
    return {
      value: 'neutral',
      source: 'default',
      reason:
        'Nothing claims a register and nothing has been observed about one, so the reply is neutral.',
    };
  })();

  const detail = ((): PreferenceReading<ContextDepth> => {
    if (context.requestedDepth !== null) {
      return {
        value: context.requestedDepth,
        source: 'explicit',
        reason: context.depth.reason,
      };
    }
    const stated = statedPreference<ContextDepth>(signals.corrections, 'detail');
    if (stated !== null) {
      const disagrees = context.depth.value !== 'standard' && context.depth.value !== stated.value;
      return {
        value: stated.value,
        source: 'corrected',
        reason: `${
          disagrees
            ? `This person asked for ${stated.value} answers${saidTimes(stated.confirmations)}, and this message reads ${context.depth.value}; a stated correction outranks the reading of one message.`
            : `This person asked for ${stated.value} answers${saidTimes(stated.confirmations)}, so that is the length of the reply.`
        }${reversalClause(stated, (value) => value)}`,
      };
    }
    const learned =
      observations === null ? null : dominantObservation(observations.detail, samples);
    if (learned !== null) {
      const disagrees = context.depth.value !== 'standard' && context.depth.value !== learned.value;
      return {
        value: learned.value,
        source: 'observed',
        reason: disagrees
          ? `${learned.count} of ${samples} previous turn(s) asked for ${learned.value} detail, and this message reads ${context.depth.value}; a learned preference outranks the reading of one message, and the next request for a length outranks both.`
          : `The message asks for nothing either way, and ${learned.count} of ${samples} previous turn(s) asked for ${learned.value} detail.`,
      };
    }
    if (context.depth.value !== 'standard') {
      return { value: context.depth.value, source: 'detected', reason: context.depth.reason };
    }
    return {
      value: 'standard',
      source: 'default',
      reason: 'The message asks for nothing either way and nothing has been observed about detail.',
    };
  })();

  const terminology = ((): PreferenceReading<TerminologyStyle> => {
    const explicit = explicitTerminologyIn(text);
    if (explicit !== null) {
      return {
        value: explicit,
        source: 'explicit',
        reason:
          'The message asks for its terms a particular way, which is not something a default may overrule.',
      };
    }
    if (language.language === 'en') {
      return {
        value: 'english-terms',
        source: 'detected',
        reason:
          'The reply is in English, so the concepts keep the words the product shows in English.',
      };
    }
    const mixing = context.terminology.value;
    if (mixing === 'sentence') {
      return {
        value: 'bilingual',
        source: 'detected',
        reason:
          "The person writes whole clauses in English, so a Persian reply keeps the English beside the product's form of each concept.",
      };
    }
    // `none`, `terms-only` and `stray` all come to the same instruction, and the reason says which of
    // them it was: the difference between one and the other is why the person's Latin words are there,
    // and only the stray case is worth naming, because it is the one that is not our vocabulary.
    return {
      value: 'product-terms',
      source: 'detected',
      reason:
        mixing === 'stray'
          ? "The Latin words in the message are not this product's vocabulary, so no concept is owed a gloss and the reply uses the product's own forms."
          : `The message mixes nothing but the product's own terms (${mixing}), so the reply uses the form the language store records for each concept.`,
    };
  })();

  return {
    version: COMMUNICATION_VERSION,
    language,
    formality,
    detail,
    terminology,
    context,
    observedSamples: samples,
  };
}

/**
 * The two learned signals a resolution reads, as one value.
 *
 * They are passed together rather than as two positional arguments because they are the same kind of
 * thing — something known about this person from before this turn — and because a caller that has one and
 * not the other is the ordinary case rather than the exception: a first run has neither, and a run after
 * a correction but before five turns have been counted has only the second.
 */
export interface CommunicationSignals {
  /** What previous turns looked like, from `readCommunicationObservations`. */
  readonly observations?: CommunicationObservations | null;
  /** What this person stated outright, from `readCorrections`. `null` is "they have said nothing". */
  readonly corrections?: CorrectionStore | null;
}

export interface CommunicationProfileOptions
  extends CommunicationContextOptions, CommunicationSignals {
  /** The person's standing choice. Defaults to `auto`, which is what a first run has. */
  readonly preference?: LanguagePreference;
}

/**
 * The whole task in one call: read the message, resolve the preference of 7.5.3.1, and resolve the three
 * communication preferences against it.
 *
 * The language resolution is handed what the same learned store knows about previous turns, so a caller
 * that passes observations gets one resolution rather than a language that ignores the history the rest
 * of the profile honours. When nothing has been learned — the usual case, and the case for every caller
 * that passes no store at all — the resolver behaves exactly as it did before the argument existed.
 */
export function communicationProfile(
  text: string,
  options: CommunicationProfileOptions = {},
): CommunicationProfile {
  const detection = options.detection ?? detectLanguage(text, options);
  const context = analyzeCommunication(text, { ...options, detection });
  const signals: CommunicationSignals = {
    observations: options.observations ?? null,
    corrections: options.corrections ?? null,
  };
  const language = resolveLanguage(
    options.preference ?? DEFAULT_LANGUAGE_PREFERENCE,
    detection,
    learnedLanguage(signals.observations ?? null),
    statedPreference<ReplyLanguage>(signals.corrections, 'language'),
  );
  return resolveCommunication(context, language, text, signals);
}
