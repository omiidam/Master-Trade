/**
 * Language detection — Phase 7.5.3.1, Task 1.
 *
 * What this is, and what it refuses to be
 * ---------------------------------------
 * This module **counts characters and closed lists**, and that is the whole of it. There is no model, no
 * classifier and no score that pretends to be a probability. Every verdict here can be re-derived by
 * hand from the message and the lists printed in this file, which is the only kind of language detection
 * that fits a layer whose store holds *cited* knowledge: `detected: 'fa'` has to be answerable with "so
 * many of the letters were Persian", not with "a model said so".
 *
 * It follows from that that confidence is a statement about *evidence*, not about certainty. The formula
 * is written out in `confidenceOf` and it says exactly two things: how much of the message's alphabet is
 * one script, and how little of the message there is. `XAUUSD` scores about 0.7 — one token is real
 * evidence and thin evidence — and a full English sentence scores 1. It is never a guess dressed as a
 * number, and a reader who disagrees with the formula can read it.
 *
 * The six things the phase asks for, and where each one lives
 * ----------------------------------------------------------
 *   - **Persian, English, mixed** — `languageOf`, from the letter counts per script.
 *   - **Persian with trading or technical terminology** — the `terms`, `domains`, `technicalSpans` and
 *     `technicalFigures` of the context, matched against the existing lexicon and the existing span
 *     finder. Nothing here re-implements "is this a term" or "is this a figure".
 *   - **Informal Persian** — a count over `REGISTER_FORMS` (the register table Phase 7.5.2.3 already
 *     owns) plus a short, closed list of colloquial markers, against a short list of formal ones.
 *   - **Finglish, where practical** — a closed list of transliterations and clitics, and it says out
 *     loud that it is a heuristic with a bounded confidence rather than a transliteration classifier.
 *   - **The register, the wording, the style and the explicit request** — `registerOf`, `wordingOf`,
 *     `styleOf` and `explicitRequestIn`, each one printed as a small function a reader can check.
 *
 * What it will not do
 * -------------------
 * It does not read the message for *who wrote it*. There is no field for a name, an age, a gender, a
 * location, a nationality, a religion or a native language here, and `tests/language-detection.test.ts`
 * asserts the profile's field names against a closed list, so adding one fails the suite rather than
 * shipping quietly. Language analysis is allowed to notice how a person *writes*; it is not allowed to
 * assemble a profile of who they are.
 *
 * Two smaller rules, both of which the tests hold it to:
 *
 *   - **nothing is rewritten.** This module does not import the normalization pipeline, so a message
 *     cannot come out of detection corrected. The words it reports as evidence are the words that were
 *     typed, verbatim.
 *   - **nothing is invented.** An empty message is `unknown` with confidence 0, not English by
 *     convention; a message of three Latin letters is English with a low confidence, not a decision.
 */

import { PERSIAN_DIGITS, ZWNJ } from './fa.js';
import type { LanguageMemory } from './memory.js';
import {
  FIGURE_PATTERN,
  PERSIAN_LETTERS,
  LATIN_LETTERS,
  findSpans,
  isBareNumber,
  standaloneMatches,
} from './rules.js';
import { REGISTER_FORMS } from './spelling.js';
import { allAlternatives, lexiconTerms, type TerminologyDomain } from './terminology.js';

/* ────────────────────────────────────────────────────────────────────────────
 * The vocabulary
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * What a message is written in.
 *
 * `mixed` is a first-class answer rather than a failure: a Persian sentence full of `XAUUSD` is the
 * normal shape of this product's text, and a detector that called it either language alone would be
 * wrong about the case it exists for. `finglish` is Persian typed in Latin letters — a Persian speaker,
 * writing Persian, in a keyboard that has no Persian on it.
 */
export const LANGUAGE_KINDS = ['fa', 'en', 'mixed', 'finglish', 'unknown'] as const;
export type LanguageKind = (typeof LANGUAGE_KINDS)[number];

/** How a person is writing: the polite register, the familiar one, or nothing that says. */
export const LANGUAGE_REGISTERS = ['formal', 'informal', 'neutral'] as const;
export type LanguageRegister = (typeof LANGUAGE_REGISTERS)[number];

/** Whether the wording is the product's own vocabulary or ordinary language. */
export const LANGUAGE_WORDINGS = ['technical', 'general'] as const;
export type LanguageWording = (typeof LANGUAGE_WORDINGS)[number];

/** What kind of message this is. Three mechanical predicates, listed in `styleOf`. */
export const LANGUAGE_STYLES = ['question', 'instruction', 'statement', 'mixed'] as const;
export type LanguageStyle = (typeof LANGUAGE_STYLES)[number];

/** How much of a message there is, by word count. Not a judgement, a band. */
export const LANGUAGE_VERBOSITIES = ['terse', 'standard', 'detailed'] as const;
export type LanguageVerbosity = (typeof LANGUAGE_VERBOSITIES)[number];

/** A language the message itself asks to be answered in. */
export interface LanguageRequest {
  /** The language asked for. */
  readonly language: LanguageKind;
  /** The words that asked for it, exactly as they were written. */
  readonly phrase: string;
  readonly confidence: number;
}

/**
 * The evidence behind every verdict above, kept rather than discarded.
 *
 * The profile exists so a later stage can act on it, and a later stage that cannot see *why* would have
 * to re-derive the reasons — which is how two stages end up disagreeing about the same message.
 */
export interface LanguageContext {
  readonly characters: number;
  readonly words: number;
  readonly persianLetters: number;
  readonly latinLetters: number;
  readonly persianDigits: number;
  readonly persianWords: number;
  readonly latinWords: number;
  readonly technicalSpans: number;
  /** Figures that carry a separator — a price, a ratio, a timestamp. A bare numeral is not one. */
  readonly technicalFigures: number;
  /** The lexicon concepts the message names, by id. The product's own vocabulary, not a guess. */
  readonly terms: readonly string[];
  readonly domains: readonly TerminologyDomain[];
  readonly informalMarkers: readonly string[];
  readonly formalMarkers: readonly string[];
}

export interface LanguageDetection {
  readonly language: LanguageKind;
  readonly confidence: number;
  readonly register: LanguageRegister;
  readonly registerConfidence: number;
  readonly wording: LanguageWording;
  readonly style: LanguageStyle;
  readonly verbosity: LanguageVerbosity;
  readonly request: LanguageRequest | null;
  readonly context: LanguageContext;
}

export interface DetectionOptions {
  /**
   * The store the lexicon is read through, so a term a reviewer added counts as this product's
   * vocabulary. Defaults to the seeded terminology of Phase 7.5.2.2.
   */
  readonly memory?: LanguageMemory;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Counting
 * ──────────────────────────────────────────────────────────────────────────── */

const PERSIAN_LETTER_RUN = new RegExp(`[${PERSIAN_LETTERS}]`, 'gu');
const LATIN_LETTER_RUN = new RegExp(`[${LATIN_LETTERS}]`, 'gu');
const PERSIAN_DIGIT_RUN = new RegExp(`[${PERSIAN_DIGITS}]`, 'gu');
/** A word, for counting: letters and the half-space that joins them. Digits and marks are not words. */
const WORD = new RegExp(`[${PERSIAN_LETTERS}${LATIN_LETTERS}${ZWNJ}]+`, 'gu');

const count = (text: string, pattern: RegExp): number => text.match(pattern)?.length ?? 0;

interface ScriptCounts {
  readonly persianLetters: number;
  readonly latinLetters: number;
  readonly persianDigits: number;
  readonly persianWords: number;
  readonly latinWords: number;
  readonly words: number;
}

/**
 * The script census of a message.
 *
 * A word counts for a script when it *contains* that script's letters, so `XAUUSDها` is one Persian word
 * and one Latin word and the census is honest about the confusion rather than picking a side.
 */
function census(text: string): ScriptCounts {
  const words = text.match(WORD) ?? [];
  const hasPersian = new RegExp(`[${PERSIAN_LETTERS}]`, 'u');
  const hasLatin = new RegExp(`[${LATIN_LETTERS}]`, 'u');

  // A word that contains both scripts is counted in both columns, because the question the columns
  // answer is "how much of this message is that script", not "how many words are there".
  return {
    persianLetters: count(text, PERSIAN_LETTER_RUN),
    latinLetters: count(text, LATIN_LETTER_RUN),
    persianDigits: count(text, PERSIAN_DIGIT_RUN),
    persianWords: words.filter((word) => hasPersian.test(word)).length,
    latinWords: words.filter((word) => hasLatin.test(word)).length,
    words: words.length,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Language
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * How sure the census is.
 *
 * Two factors, both visible in the arithmetic: the share of letters in the winning script, and how much
 * text there was to look at. A one-token message is real evidence and thin evidence, so it lands near
 * 0.7 rather than 1. The result is rounded to two places, because a detector whose output changes
 * between runs cannot be asserted in a test — and it is not a probability, which is why it is called
 * confidence rather than likelihood.
 */
function confidenceOf(letters: number, dominant: number): number {
  if (letters === 0) return 0;
  const share = dominant / letters;
  const evidence = Math.min(1, letters / 24);
  return Math.round(share * (0.6 + 0.4 * evidence) * 100) / 100;
}

/**
 * Finglish markers: Persian words typed in Latin letters.
 *
 * A closed list, and a short one. Every entry is a transliteration that is *not* an English word, which
 * is why `to`, `in`, `man` and `bed` are absent — they are all Persian words and all English words, and
 * a list that cannot tell them apart would call English English-sounding-in-Persian. Names are absent
 * for the same reason plus a better one: reading a name is reading a person, and this module does not.
 */
const FINGLISH_WORDS: readonly string[] = [
  'salam',
  'khoobi',
  'khobi',
  'chetori',
  'chi',
  'chist',
  'shoma',
  'oon',
  'mikham',
  'mikhay',
  'nemikham',
  'mishe',
  'misheh',
  'beshe',
  'nist',
  'bood',
  'cheghadr',
  'chand',
  'gheymat',
  'tamoom',
  'biya',
  'khabar',
  'mersi',
  'bebakhshid',
  'lotfan',
  'alan',
  'hala',
  'vaghean',
  'dige',
  'shayad',
  'khodam',
  'daram',
  'nazar',
  'midooni',
  'nemidooni',
  'chikar',
  'kojast',
  'daram',
  'khaste',
  'mamnoon',
] as const;

/**
 * Persian clitics and digraphs, which are evidence *only in company*.
 *
 * `sh` is in `cash` and `kh` is in `khaki`, so neither is evidence on its own. Two of these together
 * plus one Finglish word is a different claim than `sh` alone, and the arithmetic in `finglishScore`
 * is what makes the difference explicit rather than a threshold nobody can check.
 */
const FINGLISH_SHAPES: readonly RegExp[] = [
  /(?:^|[^a-z])(?:kh|gh|aa|ee|oo)[a-z]/u,
  /[a-z]+(?:am|et|ash|emun|etun|eshoon)(?:$|[^a-z])/u,
  /[a-z]*q[a-z]/u,
];

/** Words that make Latin text English rather than Persian-in-Latin-letters. */
const ENGLISH_STOPWORDS: readonly string[] = [
  'the',
  'of',
  'is',
  'are',
  'was',
  'were',
  'and',
  'for',
  'with',
  'this',
  'that',
  'what',
  'how',
  'why',
  'when',
  'there',
  'have',
  'has',
  'been',
  'from',
  'about',
  'should',
  'would',
  'could',
  'will',
  'not',
  'you',
  'your',
  'it',
  'as',
  'at',
  'on',
] as const;

/** How strongly the Latin part of a message reads as Persian typed in Latin letters. */
function finglishScore(text: string): {
  words: readonly string[];
  shapes: number;
  stopwords: number;
} {
  const lower = text.toLowerCase();
  const words = lower.match(/[a-z]+/gu) ?? [];
  const found = words.filter((word) => FINGLISH_WORDS.includes(word));
  return {
    words: [...new Set(found)],
    shapes: FINGLISH_SHAPES.filter((shape) => shape.test(lower)).length,
    stopwords: [...new Set(words.filter((word) => ENGLISH_STOPWORDS.includes(word)))].length,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Register
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Colloquial Persian markers, beyond the register table.
 *
 * `رو` is the spoken object marker for `را`, `واسه` is the spoken `برای`, and `میدونی` is a verb whose
 * written form carries a half-space. Each one is a *form* marker: how a person writes, never who they
 * are. The list is short because a longer list would start encoding vocabulary rather than register.
 */
const INFORMAL_FA: readonly string[] = [
  'رو',
  'واسه',
  'الان',
  'خب',
  'ببین',
  'اینا',
  'اونا',
  'اینطوری',
  'اونطوری',
  'بذار',
  'چیز',
] as const;

/** `میدونی` and friends, written with the half-space this product writes them with. */
const INFORMAL_FA_JOINED: readonly string[] = [`می${ZWNJ}دونی`, `نمی${ZWNJ}دونی`, `می${ZWNJ}تونی`];

/**
 * Formal Persian markers: the written register of a letter, not of a chat window.
 *
 * `میباشد` is the clearest of them — it is the bookish copula, and a sentence using it is not casual
 * whatever else it contains.
 */
const FORMAL_FA: readonly string[] = [
  `می${ZWNJ}باشد`,
  'لطفا',
  'لطفاً',
  'بفرمایید',
  'فرمایید',
  'نمایید',
  'گردد',
  'خواهشمندم',
  'جنابعالی',
  'احتراماً',
  'سپاسگزارم',
  'بنده',
] as const;

/** Informal English markers. Contractions written without their apostrophe are the commonest. */
const INFORMAL_EN: readonly string[] = [
  'gonna',
  'wanna',
  'gotta',
  'yeah',
  'yep',
  'nope',
  'lol',
  'btw',
  'pls',
  'thx',
  'ur',
  'im',
  'dont',
  'cant',
  'wont',
  'idk',
  'tbh',
  'hey',
] as const;

/** Formal English markers, on the same principle: a form of address, not a level of politeness. */
const FORMAL_EN: readonly string[] = [
  'please',
  'kindly',
  'regards',
  'sincerely',
  'thank you',
  'would you',
  'could you',
  'appreciate',
  'respectfully',
] as const;

/** A marker found by whole word, so `رو` inside `روز` is not the spoken object marker. */
function matchesOf(text: string, forms: readonly string[]): string[] {
  return forms.filter((form) => standaloneMatches(text, form).length > 0);
}

/** A marker found by substring, for the English ones where a word boundary would miss `gonna,`. */
function substringsOf(text: string, forms: readonly string[]): string[] {
  const lower = ` ${text.toLowerCase()} `;
  return forms.filter((form) => lower.includes(` ${form}`) || lower.includes(`${form} `));
}

interface RegisterReading {
  readonly register: LanguageRegister;
  readonly confidence: number;
  readonly informal: readonly string[];
  readonly formal: readonly string[];
}

/**
 * The register, from a count of closed lists.
 *
 * A tie is `neutral` rather than a coin toss, and a message with no marker at all is `neutral` with a
 * confidence that grows with the message: a long paragraph that reaches for none of the markers is
 * fairly confidently neutral, and a four-word one says almost nothing either way.
 */
function registerOf(text: string, words: number): RegisterReading {
  const informal = [
    ...new Set([
      ...REGISTER_FORMS.flatMap(([spoken]) => matchesOf(text, [spoken])),
      ...matchesOf(text, INFORMAL_FA),
      ...matchesOf(text, INFORMAL_FA_JOINED),
      ...substringsOf(text, INFORMAL_EN),
    ]),
  ];
  const formal = [...new Set([...matchesOf(text, FORMAL_FA), ...substringsOf(text, FORMAL_EN)])];
  const margin = Math.abs(informal.length - formal.length);
  const confidence =
    margin === 0
      ? Math.round(Math.min(0.5, words / 80) * 100) / 100
      : Math.round(Math.min(0.95, 0.6 + 0.15 * margin) * 100) / 100;
  const register: LanguageRegister =
    margin === 0 ? 'neutral' : informal.length > formal.length ? 'informal' : 'formal';
  return { register, confidence, informal, formal };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Style
 * ──────────────────────────────────────────────────────────────────────────── */

const QUESTION_STARTERS: readonly string[] = [
  'چرا',
  'چطور',
  'چگونه',
  'چیه',
  'چی',
  'چیست',
  'کجا',
  'کی',
  'چند',
  'چقدر',
  'آیا',
  'what',
  'why',
  'how',
  'when',
  'where',
  'which',
  'who',
  'whose',
  'can',
  'could',
  'should',
  'would',
  'is',
  'are',
  'do',
  'does',
  'did',
  'will',
];

const REQUEST_STARTERS: readonly string[] = [
  'بنویس',
  'بگو',
  'بده',
  'توضیح',
  'خلاصه',
  'ترجمه',
  'بررسی',
  'نشان',
  'بیاور',
  // Persian puts the verb of an instruction at the end, so `این معامله را خلاصه کن` opens with a noun
  // and closes with the imperative. These are the verb *forms* that close one, and none of them is a
  // word that also ends a statement: `کن` is the imperative or nothing.
  'کن',
  'کنید',
  'بکن',
  'بگیر',
  'بگیرید',
  // The imperatives this product's own vocabulary takes, closed and named. They are checked as *whole
  // final words*, so `بازار` is not the imperative `باز` and a statement ending in one is still a
  // statement: only a word that is itself the verb counts.
  'بگذار',
  'بگذارید',
  'ببند',
  'ببندید',
  'بفرست',
  'بفرستید',
  'بخر',
  'بفروش',
  'بزن',
  'بساز',
  'write',
  'reply',
  'answer',
  'respond',
  'explain',
  'show',
  'give',
  'tell',
  'summarize',
  'translate',
  'help',
  'check',
  'review',
  'list',
  'compare',
  'fix',
  'add',
  'remove',
];

/** The first word, lowercased, stripped of a leading quote or bracket. */
function firstWord(text: string): string {
  const match = text.trim().match(/^[«"'([\s]*([^\s\u060C\u061B\u061F.!?,،؛]+)/u);
  return (match?.[1] ?? '').toLowerCase();
}

/** The last word, for the imperative that closes a Persian instruction. */
function lastWord(text: string): string {
  const match = text
    .trim()
    .match(/([^\s\u060C\u061B\u061F.!?,،؛]+)[\s\u060C\u061B\u061F.!?,،؛]*$/u);
  return match?.[1] ?? '';
}

/**
 * What kind of message this is.
 *
 * Three predicates, none of which parses a sentence: a message *asks* if it carries a question mark
 * anywhere or opens with a question word; it *requests* if it opens with a request verb, closes with a
 * Persian imperative or names one politely; and a message that does both is `mixed` rather than one of
 * them chosen by order. A statement is what is left, which is the honest default — assuming an
 * instruction is worse than assuming prose.
 *
 * The question mark is looked for anywhere rather than only at the end, because a message in this
 * product is a chat turn and not a paragraph: somebody who writes `قیمت رو دیدی؟ الان چیکار کنم` has
 * asked something and then asked something else, and a rule that only read the final character would
 * call the whole thing a statement.
 */
function styleOf(text: string): LanguageStyle {
  const trimmed = text.trim();
  const asks = /[\u061F?]/u.test(trimmed) || QUESTION_STARTERS.includes(firstWord(trimmed));
  const requests =
    REQUEST_STARTERS.includes(firstWord(trimmed)) ||
    REQUEST_STARTERS.includes(lastWord(trimmed)) ||
    /(?:^|\s)(?:لطفا|لطفاً|please)(?=\s|$)/u.test(trimmed) ||
    /\b(?:can|could|would)\s+you\b/u.test(trimmed);
  if (asks && requests) return 'mixed';
  if (asks) return 'question';
  if (requests) return 'instruction';
  return 'statement';
}

/* ────────────────────────────────────────────────────────────────────────────
 * An explicit request
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The phrases that ask for a language, most specific first.
 *
 * Closed and ordered on purpose. A request is only a request when it names both a language *and* an act
 * of answering: `فارسی سخته` ("Persian is hard") names the language and asks for nothing, and a
 * detector that keyed on the word alone would answer in Persian to a question about Persian. Where two
 * patterns match, the earlier one wins, and the list is ordered so the more explicit reading is earlier.
 */
const REQUESTS: readonly {
  readonly language: LanguageKind;
  readonly pattern: RegExp;
  readonly confidence: number;
}[] = [
  // Persian, most explicit first.
  { language: 'fa', pattern: /(?:^|\s)(?:به|با)\s+فارسی(?=\s|$|[\u060C.!؟])/u, confidence: 1 },
  {
    language: 'fa',
    pattern: /(?:لطفا|لطفاً)?\s*فارسی\s+(?:جواب|پاسخ|بنویس|بگو|صحبت|حرف|توضیح)/u,
    confidence: 0.95,
  },
  {
    language: 'fa',
    pattern: /(?:جواب|پاسخ|بنویس|بگو|صحبت|حرف|توضیح|بنویسید|بگویید)\s+(?:را\s+)?(?:به\s+)?فارسی/u,
    confidence: 0.95,
  },
  {
    language: 'fa',
    pattern:
      /\b(?:reply|answer|respond|write|speak|talk|continue|explain|translate)\b[^.!?\n]{0,24}\bin\s+(?:persian|farsi)\b/iu,
    confidence: 0.95,
  },
  { language: 'fa', pattern: /\bin\s+(?:persian|farsi)\b/iu, confidence: 0.9 },
  { language: 'fa', pattern: /\b(?:persian|farsi)\s+please\b/iu, confidence: 0.9 },
  // English, by the same shapes.
  { language: 'en', pattern: /(?:^|\s)(?:به|با)\s+انگلیسی(?=\s|$|[\u060C.!؟])/u, confidence: 1 },
  {
    language: 'en',
    pattern: /(?:لطفا|لطفاً)?\s*انگلیسی\s+(?:جواب|پاسخ|بنویس|بگو|صحبت|حرف|توضیح)/u,
    confidence: 0.95,
  },
  {
    language: 'en',
    pattern: /(?:جواب|پاسخ|بنویس|بگو|صحبت|حرف|توضیح)\s+(?:را\s+)?(?:به\s+)?انگلیسی/u,
    confidence: 0.95,
  },
  {
    language: 'en',
    pattern:
      /\b(?:reply|answer|respond|write|speak|talk|continue|explain|translate)\b[^.!?\n]{0,24}\bin\s+english\b/iu,
    confidence: 0.95,
  },
  { language: 'en', pattern: /\bin\s+english\b/iu, confidence: 0.9 },
  { language: 'en', pattern: /\benglish\s+please\b/iu, confidence: 0.9 },
];

/**
 * Words that turn "Persian" into a request for a *term* rather than for a language.
 *
 * `با معادل فارسی بگو` asks for the Persian word for something, and a pattern that keys on `فارسی بگو`
 * would read it as `answer me in Persian` — a language request that was never made, against a setting the
 * person did choose. The distinction is one word, so it is checked as one word.
 */
const TERM_REQUEST_WORDS: readonly string[] = ['معادل', 'واژه', 'کلمه', 'برابر'];

function requestIsAboutATerm(text: string, index: number): boolean {
  // `\s*$` rather than `\s+$` because a Persian request pattern may itself begin with the whitespace it
  // allows, so the word being looked for can be the last thing before the match with no gap at all.
  const before = text.slice(Math.max(0, index - 24), index);
  return TERM_REQUEST_WORDS.some((word) => new RegExp(`${word}[\\s\u200C]*$`, 'u').test(before));
}

function explicitRequestIn(text: string): LanguageRequest | null {
  for (const entry of REQUESTS) {
    const match = text.match(entry.pattern);
    if (match === null || match.index === undefined) continue;
    if (requestIsAboutATerm(text, match.index)) continue;
    return { language: entry.language, phrase: match[0].trim(), confidence: entry.confidence };
  }
  return null;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Technical wording
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Whether a message names a concept, in either language.
 *
 * The English side is matched too, and case-insensitively, because it is the product's vocabulary just as
 * much as the Persian is — "the English the product already shows" is the lexicon's own description of
 * that field. Without it an English question about a stop-loss read as *general* wording, which is the
 * one reading the phase's "English + technical context" case depends on getting right.
 */
function names(text: string, lower: string, form: string): boolean {
  return /[A-Za-z]/u.test(form)
    ? standaloneMatches(lower, form.toLowerCase()).length > 0
    : standaloneMatches(text, form).length > 0;
}

/** The lexicon concepts a message names, and the domains they belong to. */
function termsIn(
  text: string,
  memory?: LanguageMemory,
): { terms: string[]; domains: TerminologyDomain[] } {
  const terms: string[] = [];
  const domains: TerminologyDomain[] = [];
  const lower = text.toLowerCase();
  for (const term of lexiconTerms(memory)) {
    const forms = [term.preferredFa, term.english, ...allAlternatives(term)];
    if (!forms.some((form) => names(text, lower, form))) continue;
    terms.push(term.id);
    if (!domains.includes(term.domain)) domains.push(term.domain);
  }
  return { terms, domains };
}

/** Figures that carry a separator, which Phase 7.5.2.1 already defines as the technical ones. */
function technicalFiguresIn(text: string): number {
  return (text.match(FIGURE_PATTERN) ?? []).filter((token) => !isBareNumber(token)).length;
}

/* ────────────────────────────────────────────────────────────────────────────
 * The detection
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Read a message: what it is written in, how it is written, and whether it asked for anything.
 *
 * The options exist so a caller can point the lexicon at a store it trusts; everything else is a
 * function of the characters in the message.
 */
export function detectLanguage(text: string, options: DetectionOptions = {}): LanguageDetection {
  const counts = census(text);
  const letters = counts.persianLetters + counts.latinLetters;
  const reading = registerOf(text, counts.words);
  const terms = termsIn(text, options.memory);
  const technicalSpans = findSpans(text).filter((span) => span.kind === 'technical').length;
  const technicalFigures = technicalFiguresIn(text);
  const context: LanguageContext = {
    characters: [...text].length,
    words: counts.words,
    persianLetters: counts.persianLetters,
    latinLetters: counts.latinLetters,
    persianDigits: counts.persianDigits,
    persianWords: counts.persianWords,
    latinWords: counts.latinWords,
    technicalSpans,
    technicalFigures,
    terms: terms.terms,
    domains: terms.domains,
    informalMarkers: reading.informal,
    formalMarkers: reading.formal,
  };

  return {
    language: languageOf(counts, text),
    confidence: languageConfidence(counts, letters, text),
    register: reading.register,
    registerConfidence: reading.confidence,
    wording:
      terms.terms.length > 0 || technicalSpans > 0 || technicalFigures > 0
        ? 'technical'
        : 'general',
    style: styleOf(text),
    verbosity: verbosityOf(counts.words),
    request: explicitRequestIn(text),
    context,
  };
}

/**
 * Which language the message is in.
 *
 * Letters decide, and nothing else does. Digits are deliberately not evidence: `3345.20` is a price and
 * reads the same in every language, so counting it would move a verdict without carrying information.
 * A Persian digit is weak evidence at best and is reported in the context rather than counted here —
 * the one case it matters is a message with no letters at all, and there `unknown` is the honest answer,
 * because a bare figure is not a language.
 */
function languageOf(counts: ScriptCounts, text: string): LanguageKind {
  const { persianLetters, latinLetters } = counts;
  if (persianLetters > 0 && latinLetters > 0) return 'mixed';
  if (persianLetters > 0) return 'fa';
  if (latinLetters === 0) return 'unknown';
  return isFinglish(text) ? 'finglish' : 'en';
}

/**
 * Whether Latin text is Persian typed in Latin letters.
 *
 * Two Finglish words, or one word plus two shapes and no English stopwords, and the rule is stated
 * rather than tuned: English text of any length reaches for its own stopwords immediately, and Finglish
 * does not reach for them at all. The threshold is the honest part — one mark is not a verdict.
 */
function isFinglish(text: string): boolean {
  const score = finglishScore(text);
  if (score.stopwords >= 2) return false;
  if (score.words.length >= 2) return true;
  return score.words.length >= 1 && score.shapes >= 2 && score.stopwords === 0;
}

/** Confidence for the verdict, with `unknown` and `mixed` handled where the formula does not apply. */
function languageConfidence(counts: ScriptCounts, letters: number, text: string): number {
  const kind = languageOf(counts, text);
  if (kind === 'unknown') return 0;
  if (kind === 'mixed') {
    // A mix is not a second-best answer to a two-way choice, so the confidence is not how sure the
    // census is of one language — it is how *evenly divided* the message is. A Persian sentence with one
    // English token scores low, because a single foreign word is thin evidence that somebody is mixing
    // languages and it is already reported as the technical token that it is; a message that really is
    // half in each script scores high, because that is the claim being made.
    const balance = (2 * Math.min(counts.persianLetters, counts.latinLetters)) / letters;
    const evidence = Math.min(1, letters / 24);
    return Math.round(balance * (0.6 + 0.4 * evidence) * 100) / 100;
  }
  if (kind === 'finglish') {
    const score = finglishScore(text);
    return Math.round(Math.min(0.85, 0.55 + 0.1 * (score.words.length + score.shapes)) * 100) / 100;
  }
  return confidenceOf(letters, Math.max(counts.persianLetters, counts.latinLetters));
}

/** Word-count bands. A message is not "dense" because it is important. */
function verbosityOf(words: number): LanguageVerbosity {
  if (words < 8) return 'terse';
  if (words < 40) return 'standard';
  return 'detailed';
}
