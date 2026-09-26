/**
 * The Persian naturalness and context evaluation — Phase 7.5.3.5.3.
 *
 * What this adds to 7.5.3.5.1–5.2, and what it deliberately does not add
 * ---------------------------------------------------------------------
 * The layer before this one answers *is this Persian text written correctly*. This one answers the
 * harder question a reader actually asks of an answer: **is this Persian natural here** — in the
 * register the turn was resolved to, with the terminology it was resolved to, and for a message mixed
 * the way this one was. That second question is a judgement, and the whole design follows from taking
 * that seriously.
 *
 * **It does not check the text a second time.** Everything 7.5.3.5.1–5.2 can see — the grammar shapes,
 * the spelling, the marks, the half-space, the script — is read by calling `evaluatePersianQuality`
 * once and *re-reading its findings against the context*. A second scan for the same defects would be
 * the duplicate system this phase is told not to build, so there is no duplicate scan: there is one
 * call, and then a stance.
 *
 * **The stance is the phase.** The quality layer says what a finding *means*; this layer says what it
 * means *here*, and the closed list is the answer to the requirement that a real problem, acceptable
 * conversational Persian, intentional technical English, a person's own terminology and a stylistic
 * choice be told apart:
 *
 *   - **`problem`** — genuine: the answer is wrong, or wrong *for the guidance it was given*. The only
 *     list a surface should act on.
 *   - **`acceptable`** — a register the answer was asked for. A formal Persian answer that says `میشه`
 *     is a note; a conversational one that says `میشه` is doing what it was told.
 *   - **`technical-english`** — Latin the writer meant to write: a term, a symbol, an identifier, or
 *     English the answer was asked to keep in English.
 *   - **`user-wording`** — the writer's own phrasing, which is never this layer's to correct.
 *   - **`style`** — a shape worth showing a writer and not worth calling wrong: repetition, several
 *     sentences opening the same way, an address that changes mid-answer.
 *
 * So one sentence gets two verdicts in two contexts, and that is measured in the suite rather than
 * promised here: `stop loss` inside a Persian answer is `technical-english` when the guidance asked
 * for English terms and a `problem` when it asked for the product's own Persian forms.
 *
 * **It offers no replacement, ever.** A quality finding carries an `instead`, because the product has
 * an opinion about `میباشد`; a naturalness verdict carries none — *do not rewrite the response* is
 * the requirement, and a report that hands over a rewrite is a rewrite waiting to be applied. The
 * verdict says what it saw, where, how sure it is and why; the writer or the model does the rest. The
 * type has no field for a replacement, so the property is a compile error rather than a promise.
 *
 * **Confidence travels with every verdict.** A naturalness judgement is a claim about somebody's
 * Persian, and a claim with no confidence is an assertion. `high` is a shape no reader would defend
 * (a sentence written twice, a slip the quality layer called an error); `medium` is a reading of a
 * pattern a person may have written on purpose (a translation frame, a phrase in English, a Latin
 * word where Persian was asked for); `low` is a count (four uses of one word, three sentences opening
 * alike). The actionable list is sorted by confidence first, so the first thing a surface shows is
 * what it is surest about.
 *
 * The questions it cannot answer are on the record and are not the quality layer's: **meaning** —
 * whether an answer said what the turn asked — cannot be read by a rule at all, and `notEvaluated`
 * carries that line, the quality layer's own limits, and the thresholds below named rather than
 * hidden.
 *
 * Where the context comes from
 * ----------------------------
 * Tone and terminology are the *response-style contract*'s (`@shared/language/guidance`,
 * Phase 7.5.3.4.2), read rather than re-declared: the answer was handed a tone and a terminology style
 * by the response stage, and "contextually appropriate" means appropriate to those. How the message
 * mixed the two scripts is 7.5.3.2's `ContextMixing` reading, and it is the third input because it is
 * the one that says whether English inside an answer is the reader's own language or vocabulary that
 * leaked. Both arrive as *types* from those modules: this layer computes no reading of a message,
 * touches no store, and can therefore run over an archived answer in a test, in a build step, or beside
 * a review surface.
 */

import {
  GUIDANCE_TERMINOLOGY,
  GUIDANCE_TONES,
  type GuidanceTerminology,
  type GuidanceTone,
} from '@shared/language/guidance';
import type { ContextMixing } from './context.js';
import { PERSIAN_PUNCTUATION, ZWNJ } from './fa.js';
import {
  PERSIAN_LETTERS,
  findSpans,
  overlapsSpan,
  standaloneMatches,
  type SpanKind,
} from './rules.js';
import {
  LANGUAGE_QUALITY_CHECKS,
  evaluatePersianQuality,
  type LanguageQualityAxis,
  type LanguageQualityFinding,
  type LanguageQualityOptions,
  type LanguageQualityReading,
  type LanguageQualityRecognition,
  type LanguageQualityReport,
} from './evaluation.js';

/* ────────────────────────────────────────────────────────────────────────────
 * The vocabulary
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * What a verdict means, in severity order — the phase, in one list.
 *
 * `problem` is first because it is the only stance a surface should act on; the other four exist so
 * that "not reported as a problem" is a *decision with a name* rather than a silence, which is what
 * keeps a naturalness layer from telling a Persian writer that their own answer is wrong.
 */
export const NATURALNESS_STANCES = [
  'problem',
  'acceptable',
  'technical-english',
  'user-wording',
  'style',
] as const;
export type NaturalnessStance = (typeof NATURALNESS_STANCES)[number];

/** How sure the rule is, in the order the actionable list is sorted. */
export const NATURALNESS_CONFIDENCES = ['high', 'medium', 'low'] as const;
export type NaturalnessConfidence = (typeof NATURALNESS_CONFIDENCES)[number];

/**
 * What a reader notices — this report's own grouping, and where the two layers meet.
 *
 * The quality layer groups by axis, because a check knows which axis it belongs to. A naturalness
 * report is read by somebody deciding what to say to the writer, and the useful grouping there is the
 * reader's: the wording, the structure of the sentences, the spelling, the marks, the script, the
 * register, and repetition. Quality findings are mapped onto it by a total table, so a new axis in
 * `evaluation.ts` cannot arrive here ungrouped.
 */
export const NATURALNESS_ASPECTS = [
  'wording',
  'structure',
  'spelling',
  'marks',
  'script',
  'register',
  'repetition',
] as const;
export type NaturalnessAspect = (typeof NATURALNESS_ASPECTS)[number];

/**
 * The context an answer is judged against.
 *
 * Three fields, each one a reading this layer does not compute: tone and terminology style come from
 * the guidance the response stage was handed, and the mixing from 7.5.3.2's reading of the message.
 * All three are required, and that is the design — a naturalness verdict with no context is a verdict
 * about the wrong thing, and a default would let a caller produce one without noticing.
 */
export interface NaturalnessContext {
  /** The register the answer was asked for: `formal`, `neutral` or `conversational`. */
  readonly tone: GuidanceTone;
  /** The language the terms were to be written in: the product's own forms, English, or both. */
  readonly terminology: GuidanceTerminology;
  /** How the message mixed the two scripts, which decides whether Latin inside the answer is the reader's own. */
  readonly mixing: ContextMixing;
}

/** One thing this layer saw, with the context's verdict on it. */
export interface NaturalnessVerdict {
  /**
   * Stable id. A re-read quality finding keeps its own id behind a `quality.` prefix, so a reader can
   * always tell which layer saw it; this layer's own checks are `naturalness.<what>`.
   */
  readonly check: string;
  /** What a reader notices, in this report's grouping. */
  readonly aspect: NaturalnessAspect;
  readonly stance: NaturalnessStance;
  readonly confidence: NaturalnessConfidence;
  readonly index: number;
  readonly found: string;
  readonly reason: string;
}

export interface NaturalnessReport {
  readonly input: string;
  /** Always `input`. This layer reports; it does not rewrite, and the suite holds it to that. */
  readonly text: string;
  /** What it judged against, carried so a reader can disagree with the judgement and not only the verdict. */
  readonly context: NaturalnessContext;
  /** Everything it saw, in text order. Includes what it accepted. */
  readonly verdicts: readonly NaturalnessVerdict[];
  /** The `problem` subset, most confident first — the only list a surface should act on. */
  readonly problems: readonly NaturalnessVerdict[];
  /** What was recognised and accepted rather than reported, carried from the quality report. */
  readonly accepted: readonly LanguageQualityRecognition[];
  /** The quality evaluation this report read rather than repeated, carried whole for a reviewer. */
  readonly quality: LanguageQualityReport;
  readonly counts: Readonly<Record<NaturalnessAspect, number>>;
  /** The checks that ran, in the order they ran: the quality layer's, then this layer's own. */
  readonly checks: readonly string[];
  /** The checks a caller left out, from either catalogue. Named, never silently absent. */
  readonly skippedChecks: readonly string[];
  /** `NATURALNESS_LIMITS`, and everything the quality report said it could not judge. */
  readonly notEvaluated: readonly string[];
}

export interface NaturalnessOptions extends LanguageQualityOptions {
  /**
   * Leave these checks out: a surface that has decided it wants less.
   *
   * Ids from either catalogue — a quality check as `evaluation.ts` names it, a naturalness check as
   * this file names it — because a caller skipping `spelling.arabic-repertoire` and a caller skipping
   * `naturalness.repeated-word` are asking the same kind of question. What was left out is named in
   * `skippedChecks`.
   */
  readonly exceptChecks?: readonly string[];
}

/**
 * What this layer cannot judge, named once and carried by every report.
 *
 * The quality layer's list is appended rather than restated, and the two are disjoint: this one is
 * about naturalness and fit, that one about correctness. A test asserts no sentence appears in both,
 * so a limit cannot be papered over by being written twice.
 */
export const NATURALNESS_LIMITS: readonly string[] = [
  'meaning — whether the answer says what the turn asked and keeps what the tools returned: a rule reads wording, and only a person or the model that wrote the answer can say whether the meaning survived',
  'unnatural wording that is not a shape — a collocation, a metaphor, a word used in the wrong sense: this layer has no lexicon and reads shapes',
  'repetition a reader accepts — a term used again because the answer is about that term, a heading that repeats the sentence beneath it, a summary that closes with the point it opened on',
  'an English word a Persian reader would use themselves (`backtest`, `drawdown`): the shape is read, and whether the product’s own Persian form was owed is a decision about vocabulary that lives in the terminology lexicon',
  'the register of a sentence quoted inside an answer — a quotation is somebody else’s words, and only text a caller protected is exempt from being read as the answer’s own',
  'the person a verb agrees with — this layer reads the pronouns that *are* the address, so an answer that says `شما` and then `کنی` is drift it cannot see, because telling that ending from a noun ending in the same letter needs morphology the grammar catalogue deliberately does not have',
  'how long an answer should be, and how much detail it owes: both are the guidance’s, and the guidance is not this layer’s to read',
  'a count below the threshold: one repeated word under four uses, a repeated sentence under four words and two sentences that open alike are not reported, because a count is not a judgement',
  'the rules it re-reads are as good as the rule that produced them, and two of them are not good enough alone: `grammar.verb-number-agreement` recognises its subject by a `ها` ending, so a correct sentence whose plural noun is inside the predicate — `نمودار خالی واقعیتی درباره دادهها است` — is reported and re-read here as a `problem`; and `grammar.pronoun-agreement` reads `شما` as the subject when it is a possessive (`قابلیتی که در طرح شما نیست`). Running this layer over the product’s own Persian copy found 21 of the first and 1 of the second, and telling a subject from a noun inside a predicate — or from a possessive — needs a clause boundary the grammar catalogue deliberately has none of',
];

/**
 * The thresholds the shape checks count to, in one table.
 *
 * Named and exported rather than left in the code, because a threshold is a judgement with a number
 * attached and a reader is entitled to see the number. Every one of them feeds a `style` or a
 * `medium`-confidence verdict, so a threshold that is too eager produces a note rather than a
 * complaint — the shapes that report a `problem` outright do not count anything.
 */
export const NATURALNESS_THRESHOLDS = {
  /** Uses of one word, in the whole answer, before it is worth a note. */
  wordUses: 4,
  /** Words in a sentence before a verbatim repeat of it is a defect. */
  sentenceWords: 4,
  /** Sentences opening with the same word before the answer reads as a list. */
  sharedOpeners: 3,
  /** Words in a run of lower-case Latin before it is worth reading as one thing. */
  englishRun: 2,
  /**
   * Words in a run before it is a phrase rather than a term.
   *
   * Two English words are how a term of two words is written — `stop loss`, `take profit`, `stack
   * trace` — so a pair is a note at most. Three is a clause, and no term is three words long. The
   * number came from running this layer over the product's own Persian copy, where the two-word case
   * is what a real sentence contains: see the phase record for what that measurement found.
   */
  englishPhrase: 3,
} as const;

/* ────────────────────────────────────────────────────────────────────────────
 * Reading the text: sentences and words
 * ──────────────────────────────────────────────────────────────────────────── */

/** A run of Persian letters, which is what a word is for the checks that count them. */
const PERSIAN_WORD = new RegExp(`[${PERSIAN_LETTERS}][${PERSIAN_LETTERS}${ZWNJ}]*`, 'gu');

/** Where a sentence ends. An ellipsis ends one here as it does everywhere else. */
const SENTENCE_END = new RegExp(`[.${PERSIAN_PUNCTUATION.questionMark}!?\\u2026\\n]`, 'gu');

/**
 * Two or more lower-case Latin words in a row.
 *
 * The same shape the quality layer reports one word at a time (`script.latin-word-in-persian`), and
 * the difference between the two is the whole of this check: a *term* this product keeps in Latin is
 * one word, so a run is English prose — which is naturalness, not spelling.
 */
const LOWERCASE_LATIN_WORD = '[a-z][a-z0-9]*';
const LATIN_RUN = new RegExp(
  // The group repeats, so the match is the *whole* run: written as exactly two words it would report
  // `the risk of ruin` as `the risk` and `of ruin`, which is two findings about one sentence and —
  // worse — two words each, so the longest run this layer is built to call prose would never be
  // counted as one.
  `\\b${LOWERCASE_LATIN_WORD}\\b(?:[ \\t]+\\b${LOWERCASE_LATIN_WORD}\\b)+`,
  'gu',
);

/** One sentence and where it is. */
interface Sentence {
  readonly start: number;
  readonly end: number;
  /** Whitespace-collapsed, for the verbatim-repeat test. */
  readonly key: string;
  /** The first token, for the opener test, and the tokens' count, for the length floor. */
  readonly first: string;
  readonly words: number;
}

/** The sentences of a text, with their offsets, so a finding can point at one. */
function sentencesOf(text: string): Sentence[] {
  const ended: number[] = [];
  for (const match of text.matchAll(SENTENCE_END)) {
    if (match.index !== undefined) ended.push(match.index + match[0].length);
  }
  ended.push(text.length);

  const sentences: Sentence[] = [];
  let start = 0;
  for (const end of ended) {
    const body = text.slice(start, end);
    const lead = body.search(/\S/u);
    const tokens = body.trim().split(/\s+/u);
    const first = tokens[0];
    if (lead !== -1 && first !== undefined && first.length > 0) {
      sentences.push({
        start: start + lead,
        end: start + body.trimEnd().length,
        key: tokens.join(' '),
        first,
        words: tokens.length,
      });
    }
    start = end;
  }
  return sentences;
}

/** One word and where it is, so a count can point at the use that crossed the threshold. */
interface FoundWord {
  readonly word: string;
  readonly index: number;
}

/** Every Persian word in the text that no protected span covers, in text order. */
function wordsOf(text: string, protects: (start: number, end: number) => boolean): FoundWord[] {
  const found: FoundWord[] = [];
  for (const match of text.matchAll(PERSIAN_WORD)) {
    if (match.index === undefined) continue;
    if (protects(match.index, match.index + match[0].length)) continue;
    found.push({ word: match[0], index: match.index });
  }
  return found;
}

/* ────────────────────────────────────────────────────────────────────────────
 * This layer's own checks
 * ──────────────────────────────────────────────────────────────────────────── */

/** One thing one of this layer's checks found, before the context has a verdict on it. */
interface NaturalnessMatch {
  readonly index: number;
  readonly found: string;
  readonly reason: string;
}

/** A construction Persian inherits from a word-for-word translation, and why it is not the product’s. */
interface LiteralFrame {
  readonly pattern: RegExp;
  readonly why: string;
}

/**
 * The translation frames, each one a decision with its reason.
 *
 * This table is deliberately **not** the quality layer's `BOOKISH_PHRASES`, and the difference is the
 * point of having two: `در خصوص` is a *bookish word* — Persian, and correct, in a register this
 * product's copy does not use — while `حائز اهمیت است` is an English frame wearing Persian words (*is
 * of importance*). The first is somebody's style, which is why the quality layer files it as
 * `user-wording`; the second is a shape that says the sentence was translated, which is why it is a
 * `problem` here. A test asserts the two tables share no phrase, so the day they overlap is the day
 * somebody decides which layer owns it rather than the day a text is reported twice.
 */
const LITERAL_FRAMES: readonly LiteralFrame[] = [
  {
    pattern: /به عنوان یک/gu,
    why: '`as a` rendered word for word: Persian takes `به عنوان` with no article.',
  },
  {
    pattern: /نقش[^.!؟\n]{0,24}?ایفا/gu,
    why: '`plays a role` — a verb borrowed to say that something matters; `مهم است` is what the sentence is made of.',
  },
  {
    pattern: /قادر (به|نیست|است)/gu,
    why: '`is capable of` — Persian has the verb, and it is `میتواند`.',
  },
  {
    pattern: /(لازم|قابل) به ذکر است/gu,
    why: '`it is worth noting` — a frame that announces a sentence instead of being one.',
  },
  {
    pattern: /حائز اهمیت/gu,
    why: '`is of importance` — an English construction around a loanword; `مهم است` is the Persian.',
  },
  {
    pattern: /مورد استفاده قرار/gu,
    why: '`is put to use` — English syntax laid over two Persian words; `استفاده میشود` is the sentence.',
  },
  {
    pattern: new RegExp(`امکان[ ${ZWNJ}]?پذیر`, 'gu'),
    why: '`is possible` rendered as a two-word compound; `ممکن است` is the Persian.',
  },
];

/**
 * How an answer can address the reader, in two closed lists of pronouns.
 *
 * Both cannot be how one answer speaks, and that is the whole check. The lists hold the *pronouns* and
 * deliberately not the verb endings, which is a limit the report names rather than a gap: telling `کنی`
 * from `کنید` is one comparison, and telling `کنی` from a noun that ends in `ی` needs morphology this
 * layer does not have — so `شما … کنی` is drift it cannot see, and the pronoun pair it can. A
 * half-check that is honest about its half is worth more than one that guesses.
 */
const ADDRESS_PRONOUNS = {
  informal: ['تو', 'خودت'],
  formal: ['شما', 'خودتان'],
} as const;

/** The three kinds of span no check of this layer may report from: a literal, a figure, and somebody's own text. */
const PROTECTED_KINDS: readonly SpanKind[] = ['technical', 'numeric', 'exception'];

/** What a check is handed: the text, and the spans no finding may come from. */
interface NaturalnessInput {
  readonly text: string;
  readonly protects: (start: number, end: number) => boolean;
}

/** A check of this layer's own: one question about the answer as an answer. */
export interface NaturalnessCheck {
  readonly id: string;
  readonly aspect: NaturalnessAspect;
  readonly describe: string;
  readonly stance: NaturalnessStance;
  readonly confidence: NaturalnessConfidence;
  readonly run: (input: NaturalnessInput) => readonly NaturalnessMatch[];
}

/**
 * The six shapes this layer reads for itself.
 *
 * Six, and each one is a claim a reviewer makes while reading an answer: *this sentence is here
 * twice*, *every sentence starts the same way*, *this is a translation*, *the answer changed who it is
 * talking to*, *this word is doing all the work*, *this is English prose rather than a term*. None of
 * them duplicates a quality check, and the suite keeps the two catalogues apart.
 *
 * Exported as data, like the quality layer's catalogue and for the same reason: a suite can require a case
 * for every check, a surface can ask what this layer looks for, and a check added here without a case of
 * its own fails rather than shipping unread.
 */
export const NATURALNESS_CHECKS: readonly NaturalnessCheck[] = [
  {
    id: 'naturalness.literal-frame',
    aspect: 'wording',
    describe: 'A construction carried over from English word for word.',
    stance: 'problem',
    // A reader can defend `حائز اهمیت` as a written register and still hear the frame in it, which is
    // what `medium` is for.
    confidence: 'medium',
    run: (input) => {
      const found: NaturalnessMatch[] = [];
      for (const frame of LITERAL_FRAMES) {
        for (const match of input.text.matchAll(frame.pattern)) {
          if (match.index === undefined) continue;
          if (input.protects(match.index, match.index + match[0].length)) continue;
          found.push({
            index: match.index,
            found: match[0],
            reason: `${frame.why} A frame rather than a slip: the meaning is intact and the sentence was translated rather than written, which is the shape a Persian reader hears.`,
          });
        }
      }
      return found;
    },
  },
  {
    id: 'naturalness.repeated-sentence',
    aspect: 'repetition',
    describe: 'The same sentence written more than once in one answer.',
    stance: 'problem',
    // The one repetition a reader is certain about: the characters are the same characters.
    confidence: 'high',
    run: (input) => {
      const seen = new Map<string, Sentence>();
      const found: NaturalnessMatch[] = [];
      for (const sentence of sentencesOf(input.text)) {
        if (sentence.words < NATURALNESS_THRESHOLDS.sentenceWords) continue;
        const first = seen.get(sentence.key);
        if (first === undefined) {
          seen.set(sentence.key, sentence);
          continue;
        }
        found.push({
          index: first.start,
          found: input.text.slice(first.start, first.end),
          reason: `The same sentence is written twice, here and at character ${sentence.start}. A sentence that appears twice is the one shape no reader defends: a heading that repeats the sentence beneath it is a heading, and this is the same sentence in the same paragraph.`,
        });
      }
      return found;
    },
  },
  {
    id: 'naturalness.repeated-word',
    aspect: 'repetition',
    describe: 'One word doing all the work in an answer.',
    // A term repeated because the answer is about that term is a reader's expectation, not a defect —
    // which is why this is a note and why its confidence is the lowest in the catalogue.
    stance: 'style',
    confidence: 'low',
    run: (input) => {
      const uses = new Map<string, FoundWord[]>();
      for (const word of wordsOf(input.text, (start, end) => input.protects(start, end))) {
        const key = word.word.replaceAll(ZWNJ, '');
        if (key.length < 4) continue;
        uses.set(key, [...(uses.get(key) ?? []), word]);
      }
      const found: NaturalnessMatch[] = [];
      for (const [word, places] of uses) {
        if (places.length < NATURALNESS_THRESHOLDS.wordUses) continue;
        const crossed = places[NATURALNESS_THRESHOLDS.wordUses - 1] as FoundWord;
        found.push({
          index: crossed.index,
          found: crossed.word,
          reason: `\`${word}\` is used ${places.length} times. A term repeated because the answer is about it is a reader's expectation, so this is a note and not a complaint: only the writer can say whether the word is carrying the answer or the answer has not decided what it is about.`,
        });
      }
      return found;
    },
  },
  {
    id: 'naturalness.shared-opener',
    aspect: 'structure',
    describe: 'Several sentences of one answer opening with the same word.',
    // Parallel sentences are a real Persian style, so this is the lowest-confidence note here.
    stance: 'style',
    confidence: 'low',
    run: (input) => {
      const openers = new Map<string, Sentence[]>();
      for (const sentence of sentencesOf(input.text)) {
        openers.set(sentence.first, [...(openers.get(sentence.first) ?? []), sentence]);
      }
      const found: NaturalnessMatch[] = [];
      for (const [word, sentences] of openers) {
        if (sentences.length < NATURALNESS_THRESHOLDS.sharedOpeners) continue;
        const third = sentences[NATURALNESS_THRESHOLDS.sharedOpeners - 1] as Sentence;
        found.push({
          index: third.start,
          found: word,
          reason: `${sentences.length} sentences open with \`${word}\`, which is the rhythm of a list rather than of an answer. Persian does write parallel sentences on purpose, so nothing is claimed here beyond the count.`,
        });
      }
      return found;
    },
  },
  {
    id: 'naturalness.address-drift',
    aspect: 'register',
    describe: 'One answer addressing the reader both informally and formally.',
    stance: 'style',
    // Medium: the switch is visible, and a quoted sentence can legitimately contain the other address.
    confidence: 'medium',
    run: (input) => {
      const places = (forms: readonly string[]): FoundWord[] =>
        forms.flatMap((form) =>
          standaloneMatches(input.text, form)
            .filter((index) => !input.protects(index, index + form.length))
            .map((index) => ({ word: form, index })),
        );
      const informal = places(ADDRESS_PRONOUNS.informal);
      const formal = places(ADDRESS_PRONOUNS.formal);
      if (informal.length === 0 || formal.length === 0) return [];
      // Report the *switch*: the first address of either kind to appear after the other kind already
      // has. One finding per answer rather than one per pronoun, because what a reader notices is the
      // change and not either half of it.
      const firstInformal = Math.min(...informal.map((entry) => entry.index));
      const firstFormal = Math.min(...formal.map((entry) => entry.index));
      const switched = [
        ...informal.filter((entry) => entry.index > firstFormal),
        ...formal.filter((entry) => entry.index > firstInformal),
      ].sort((left, right) => left.index - right.index)[0];
      if (switched === undefined) return [];
      return [
        {
          index: switched.index,
          found: switched.word,
          reason: `The answer addresses the reader as both \`${ADDRESS_PRONOUNS.informal[0]}\` and \`${ADDRESS_PRONOUNS.formal[0]}\`. One answer keeps one way of speaking to the person reading it; which way is the writer's to choose, so nothing is offered in its place.`,
        },
      ];
    },
  },
  {
    id: 'naturalness.english-run',
    aspect: 'script',
    describe: 'A run of English words inside a Persian answer, where a term would be one word.',
    // Re-stanced by the context and by the run's own length below: a two-word run has the shape of a
    // term, an answer asked to keep its terms in English is not doing anything wrong, and a person who
    // writes both languages is owed nothing at all.
    stance: 'problem',
    confidence: 'medium',
    run: (input) => {
      const found: NaturalnessMatch[] = [];
      for (const match of input.text.matchAll(LATIN_RUN)) {
        if (match.index === undefined) continue;
        if (input.protects(match.index, match.index + match[0].length)) continue;
        found.push({
          index: match.index,
          found: match[0],
          reason: `\`${match[0]}\` is two or more English words in a row, which is prose rather than a term: a term this product keeps in Latin is one word (\`ATR\`, \`XAUUSD\`), and a phrase is a sentence that was not written in the language of the answer.`,
        });
      }
      return found;
    },
  },
];

/** Every check of this layer's own, by id — so a caller can skip one by name. */
const OWN_CHECK_IDS: readonly string[] = NATURALNESS_CHECKS.map((check) => check.id);

/**
 * The aspects the quality axes map onto, and the table is total.
 *
 * A `Record<LanguageQualityAxis, NaturalnessAspect>` rather than a lookup with a fallback, because a
 * fallback is how a new axis arrives ungrouped: with this type, adding an axis to `evaluation.ts` fails
 * the build here, and the person adding it decides what a reader notices about it.
 */
const ASPECT_OF_AXIS: Readonly<Record<LanguageQualityAxis, NaturalnessAspect>> = {
  grammar: 'structure',
  wording: 'wording',
  spelling: 'spelling',
  punctuation: 'marks',
  spacing: 'marks',
  zwnj: 'marks',
  script: 'script',
};

/* ────────────────────────────────────────────────────────────────────────────
 * Re-reading the quality findings against the context
 * ──────────────────────────────────────────────────────────────────────────── */

/** What the context makes of one reading: the stance, how sure, and why. */
interface Stance {
  readonly stance: NaturalnessStance;
  readonly confidence: NaturalnessConfidence;
  readonly reason: string;
}

/**
 * What each reading means once the context is known.
 *
 * A record keyed by the reading rather than a chain of conditionals, so the mapping is total by type:
 * a sixth reading in `evaluation.ts` fails the build here, and whoever adds it decides what it means
 * for an answer rather than having it fall through to a default nobody chose. The three readings that
 * can turn are the three that are about *fit* rather than about correctness:
 *
 *   - `error` is an error in every context — no tone makes `میباشد` right;
 *   - `intentional-english` is the vocabulary question, and the guidance answers it: a Latin word in a
 *     Persian answer is the instruction when the terms were asked for in English, half of what was
 *     requested when both languages were, and a `style` note when the product's own Persian forms
 *     were — a note and not a problem, because one lower-case word can be a technology's own name, and
 *     the product's own copy writes `loopback` and `stack trace`;
 *   - `conversational` is the register question, and the tone answers it: spoken Persian in an answer
 *     that was asked to be conversational is the instruction being followed;
 *   - `user-wording` and `terminology` are the writer's own, and no context gets a say in them.
 */
const STANCE_OF_READING: Readonly<
  Record<LanguageQualityReading, (context: NaturalnessContext) => Stance>
> = {
  error: () => ({
    stance: 'problem',
    confidence: 'high',
    reason:
      'No tone and no terminology style makes this right for the reader: it is a slip in the answer’s own text, and the quality layer reports it as an error in every context.',
  }),
  'intentional-english': (context) => {
    if (context.terminology === 'english-terms') {
      return {
        stance: 'technical-english',
        confidence: 'high',
        reason:
          'The guidance asked for the terms in English, so a Latin word here is the instruction being followed rather than vocabulary that leaked.',
      };
    }
    if (context.terminology === 'bilingual') {
      return {
        stance: 'technical-english',
        confidence: 'high',
        reason:
          'The terminology was asked for in both languages, so a Latin word is half of what was requested.',
      };
    }
    return {
      stance: 'style',
      confidence: 'medium',
      reason:
        'The terminology was asked for in the product’s own Persian forms, so a Latin word here is worth a note — and only a note, because one lower-case word can be a technology’s own name and the product’s own copy writes `loopback` and `stack trace`. Prose is a run, not a word, and the run is where this layer stops being gentle.',
    };
  },
  terminology: () => ({
    stance: 'technical-english',
    confidence: 'high',
    reason:
      'A symbol, a code or a technology under its own name: terminology rather than Persian prose, and correct as it is.',
  }),
  conversational: (context) => {
    if (context.tone === 'conversational') {
      return {
        stance: 'acceptable',
        confidence: 'high',
        reason:
          'The tone asked for is conversational, which is what this is: spoken Persian answering a turn that was resolved as small talk.',
      };
    }
    return {
      stance: 'style',
      confidence: 'medium',
      reason: `The tone asked for is ${context.tone}, so a spoken form is a register note rather than an error — and a note is worth showing the writer.`,
    };
  },
  'user-wording': () => ({
    stance: 'user-wording',
    confidence: 'high',
    reason:
      'The writer’s own phrasing, which the context does not get a say in: a bookish construction is a register somebody chose, and a Persian phrase inside an English sentence is a term being named.',
  }),
};

/** The verdict on one quality finding. */
function verdictFor(
  finding: LanguageQualityFinding,
  context: NaturalnessContext,
): NaturalnessVerdict {
  const reading = STANCE_OF_READING[finding.reading];
  const decided = reading(context);
  return {
    check: `quality.${finding.check}`,
    aspect: ASPECT_OF_AXIS[finding.axis],
    stance: decided.stance,
    confidence: decided.confidence,
    index: finding.index,
    found: finding.found,
    // The check's own sentence first, because it explains the defect, and the context's second,
    // because it explains the verdict. A reason that dropped either would be a report a reader has to
    // go to two places to argue with.
    reason: `${finding.reason} ${decided.reason}`,
  };
}

/** The verdict on one of this layer's own findings. */
function ownVerdict(
  check: NaturalnessCheck,
  match: NaturalnessMatch,
  context: NaturalnessContext,
): NaturalnessVerdict {
  let stance = check.stance;
  let confidence = check.confidence;
  let reason = match.reason;

  if (check.id === 'naturalness.english-run') {
    // A run of two has the shape of a term — `stop loss`, `take profit`, `stack trace` — and a term is
    // what a Persian technical answer legitimately carries. Three is a clause, and no term is three
    // words long, so that is where the stance stops being a note. The measurement behind the number is
    // in the phase record: this layer run over the product's own copy reported two-word runs only, and
    // every one of them was a term the copy had chosen deliberately.
    if (match.found.split(/[ \t]+/u).length < NATURALNESS_THRESHOLDS.englishPhrase) {
      stance = 'style';
      confidence = 'low';
      reason = `${reason} Two words is how a two-word term is written, so this is a note: a reader of Persian technical text is likely to have seen it.`;
    }
    if (context.mixing === 'sentence') {
      stance = 'technical-english';
      confidence = 'high';
      reason = `${reason} The message itself was written in both languages, so this reader reads English: nothing here is wrong.`;
    } else if (context.terminology === 'english-terms') {
      // `stop loss` and `take profit` are English terms and nothing else, and the answer was asked for
      // its terms in English — so the run is the instruction, and the note that a *term* is one word is
      // all this layer has to say about it.
      stance = 'technical-english';
      confidence = 'high';
      reason = `${reason} The terminology was asked for in English, so an English phrase is the vocabulary that was requested.`;
    } else if (context.terminology === 'bilingual') {
      stance = 'style';
      reason = `${reason} The terminology was asked for in both languages, and a gloss is a word: a phrase is the answer switching language rather than translating one.`;
    }
  }

  return {
    check: check.id,
    aspect: check.aspect,
    stance,
    confidence,
    index: match.index,
    found: match.found,
    reason,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * The entry point
 * ──────────────────────────────────────────────────────────────────────────── */

/** Whether a tone and a terminology style are the vocabulary this layer judges against. */
export function isNaturalnessContext(context: {
  readonly tone: string;
  readonly terminology: string;
}): boolean {
  return (
    (GUIDANCE_TONES as readonly string[]).includes(context.tone) &&
    (GUIDANCE_TERMINOLOGY as readonly string[]).includes(context.terminology)
  );
}

/**
 * Evaluate an answer's Persian against the context it was written for, and change nothing.
 *
 * The order of work is the design: the quality evaluation runs once, its findings are re-read into
 * stances, this layer's own six checks run over the text, and the two lists are merged in text order.
 * Nothing is computed twice, nothing is written anywhere, and the input comes back in `text` so a
 * caller cannot mistake the report for a rewrite.
 */
export function evaluatePersianNaturalness(
  text: string,
  context: NaturalnessContext,
  options: NaturalnessOptions = {},
): NaturalnessReport {
  const ownIds = new Set(OWN_CHECK_IDS);
  const requested = options.exceptChecks ?? [];
  const ownSkipped = requested.filter((id) => ownIds.has(id));
  const qualitySkipped = requested.filter((id) => !ownIds.has(id));
  const quality = evaluatePersianQuality(text, { ...options, exceptChecks: qualitySkipped });

  const spans = findSpans(text, options.protectedLiterals ?? []);
  const input: NaturalnessInput = {
    text,
    // Every check asks the same question of the same three kinds of span, so the kinds are stated here
    // once rather than at each call site: a check that could ask for a subset would be one that reports
    // a figure, a URL or a caller's own text as prose.
    protects: (start, end) => overlapsSpan(spans, start, end, PROTECTED_KINDS),
  };

  const ranOwn: string[] = [];
  const verdicts: NaturalnessVerdict[] = quality.findings.map((finding) =>
    verdictFor(finding, context),
  );
  for (const check of NATURALNESS_CHECKS) {
    if (ownSkipped.includes(check.id)) continue;
    ranOwn.push(check.id);
    for (const match of check.run(input)) verdicts.push(ownVerdict(check, match, context));
  }

  const aspectOrder = new Map(NATURALNESS_ASPECTS.map((aspect, index) => [aspect, index]));
  const confidenceOrder = new Map(NATURALNESS_CONFIDENCES.map((level, index) => [level, index]));
  verdicts.sort((left, right) => {
    if (left.index !== right.index) return left.index - right.index;
    return (
      (aspectOrder.get(left.aspect) ?? 0) - (aspectOrder.get(right.aspect) ?? 0) ||
      left.check.localeCompare(right.check)
    );
  });

  const counts = {} as Record<NaturalnessAspect, number>;
  for (const aspect of NATURALNESS_ASPECTS) counts[aspect] = 0;
  for (const verdict of verdicts) counts[verdict.aspect] += 1;

  // The actionable list, and the only one a surface should act on. Sorted by confidence first, because
  // the point of a confidence is to decide what a reader is shown first.
  const problems = verdicts
    .filter((verdict) => verdict.stance === 'problem')
    .sort(
      (left, right) =>
        (confidenceOrder.get(left.confidence) ?? 0) -
          (confidenceOrder.get(right.confidence) ?? 0) || left.index - right.index,
    );

  return {
    input: text,
    text,
    context,
    verdicts,
    problems,
    accepted: quality.recognised,
    quality,
    counts,
    checks: [...quality.checks, ...ranOwn],
    skippedChecks: [...quality.skippedChecks, ...ownSkipped],
    notEvaluated: [...NATURALNESS_LIMITS, ...quality.notEvaluated],
  };
}

/** Every check id this layer can name, from both catalogues: the quality layer's, then its own. */
export function naturalnessCheckIds(): readonly string[] {
  return [...LANGUAGE_QUALITY_CHECKS.map((check) => `quality.${check.id}`), ...OWN_CHECK_IDS];
}
