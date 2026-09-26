/**
 * The Persian language-quality evaluation — Phase 7.5.3.5.1, extended in 7.5.3.5.2.
 *
 * What this file is, and what it deliberately is not
 * --------------------------------------------------
 * An *evaluation*: it reads Persian text and reports what is wrong with it, axis by axis, with the
 * exact characters each finding is about. It rewrites nothing, decides nothing on a reviewer's
 * behalf, and — the point of it being its own module rather than a flag on the pipeline — it does not
 * ask the language store anything.
 *
 * Why the separation is the design and not a preference
 * -----------------------------------------------------
 * The correction pipeline (`normalize.ts`, `languageQa.ts`) is authoritative by construction: a rule
 * runs only when the store holds `trusted` knowledge at its key, so every correction has a
 * provenance, a version and a person behind it. That is right for text the product *renders* and
 * wrong for text the product is *judging*:
 *
 *   - an evaluation has to answer for any text, including Persian a reviewer has never decided about.
 *     A report that silently shrinks to "the rules we happen to have approved" is not an evaluation
 *     of the text; it is a report on its own configuration;
 *   - a report must not be able to change anything. Nothing here proposes a rule, approves a form or
 *     writes an entry, so running it over somebody's message cannot move the knowledge base;
 *   - and it has to be usable where no store is: a test, a build step, a review surface, a batch over
 *     the archive.
 *
 * So the checks below read the product's *closed tables* — the compound pairs, the register forms,
 * the half-space clitic inventory, the character folds — because those are the product's spelling
 * decisions written down once, and they ask the store for nothing. 7.5.3.5.2 added the second kind of
 * reuse, which is stronger: the seven **grammar rules** of Phase 7.5.2.3 are *called*, not re-derived,
 * so against the one thing this product already detects reliably there is no second implementation and
 * nothing to drift. `tests/persian-evaluation.test.ts` holds the separation as a rule over this file's
 * import graph — walked transitively — and over its export surface, not as a promise in a comment.
 *
 * One consequence is worth stating before it is discovered: a compound pair the store holds as
 * `pending` is **not** asserted here. The product has not decided it, so an evaluation that reported
 * it would be inventing a rule the pipeline is not allowed to apply. Those pairs are named in every
 * report's `notEvaluated` rather than quietly dropped.
 *
 * The axes, and why they are not the pipeline's stages
 * ----------------------------------------------------
 * The pipeline's families are *what it does* (normalization, grammar, spelling, terminology). These
 * are *what a reader notices*: the sentence's structure, its wording, its spelling, its marks, the
 * space around them, the half-space, and the one axis that exists only in a bilingual product —
 * Persian prose with English technical text inside it. `grammar` is the one axis whose name is also a
 * family's, and it is called that deliberately: sentence structure is both what the layer does and
 * what a reader notices, and pretending otherwise would leave the reader's word for it unused.
 * `spelling` is wider here than the family of the same name (it holds the compound pairs *and* the
 * letter repertoire), and the overlaps are deliberate, because a spelling slip is a spelling slip
 * whoever notices it — and because that overlap is what keeps a report honest after a rule has been
 * retired: the evaluation still sees it.
 *
 * What a finding is allowed to mean
 * ---------------------------------
 * A report that can only say "wrong" is a report that will be argued with, because Persian text is
 * full of shapes that are right for one register and one purpose and wrong for another. So every
 * check declares a `reading` from a closed list of five, and the list is the answer to *do not correct
 * natural Persian*:
 *
 *   - **`error`** — wrong in a way no reader would defend;
 *   - **`conversational`** — honest spoken Persian: a register note, and never an error;
 *   - **`terminology`** — the product's own kind of term (a symbol, a code, a technology name), which
 *     is *recognised* rather than reported;
 *   - **`intentional-english`** — a Latin word or literal the writer meant to write, where the finding
 *     is about how it sits in the sentence rather than about the word;
 *   - **`user-wording`** — the writer's own phrasing, which may be deliberate, including anything the
 *     caller protected by hand and anything a reviewer protected in the store.
 *
 * `report.errors` is the one list a surface should act on, and it is deliberately the smallest: the
 * rest is a reading of the text, and `report.recognised` names what the layer saw and *chose* not to
 * report so that a distinction the report makes is visible rather than silent.
 *
 * Two rules every check obeys
 * ---------------------------
 *   1. **A finding carries its evidence.** The characters, where they were, and — where the product
 *      has an opinion — what it writes instead. A finding without the characters it is about cannot
 *      be argued with.
 *   2. **A technical token is not prose.** Every check runs through `findSpans`, so a URL, a path, an
 *      email, a code span or a dotted identifier is never reported as a mistake — which is where a
 *      cross-language quality check earns or loses its trust: `XAUUSD` in a Persian sentence is
 *      correct Persian, and so is `index.ts`. One check asks to see a little further than the rest,
 *      and says so in its own comment, in the limits list every report carries, and in a test: a
 *      digit's repertoire is a script fact rather than a value, so a figure is read even though it is
 *      a figure.
 *
 * And one distinction the report carries per finding rather than once: `deterministic` means the
 * answer is decided by the rule and there is exactly one of it (a doubled mark, an Arabic letter, a
 * half-space beside a space). A finding without it is a judgement — a person's call on wording, on
 * register, on where a quotation should close — and it is reported with no replacement offered
 * whenever the product has no business naming the replacement.
 */

import { ARABIC_INDIC_DIGITS, PERSIAN_DIGITS, PERSIAN_PUNCTUATION, ZWNJ } from './fa.js';
import { GRAMMAR_RULES } from './grammar.js';
import {
  LATIN_LETTERS,
  PERSIAN_LETTERS,
  ZWNJ_CLITIC_FORMS,
  findSpans,
  overlapsSpan,
  standaloneMatches,
  type LanguageRule,
  type RuleInput,
  type Span,
  type SpanKind,
} from './rules.js';
import { COMPOUND_PAIRS, REGISTER_FORMS } from './spelling.js';

/* ────────────────────────────────────────────────────────────────────────────
 * The axes
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The seven axes, in report order.
 *
 * Roughly the order a reader notices them: the sentence's structure, then its words, then its
 * spelling, then its marks, then the space around those marks, then the half-space, then the other
 * script inside it.
 */
export const LANGUAGE_QUALITY_AXES = [
  'grammar',
  'wording',
  'spelling',
  'punctuation',
  'spacing',
  'zwnj',
  'script',
] as const;
export type LanguageQualityAxis = (typeof LANGUAGE_QUALITY_AXES)[number];

/**
 * What a finding is allowed to mean, in the order severity runs.
 *
 * The vocabulary is closed and every check declares one: it is what keeps a quality layer from
 * telling a Persian writer that their own sentence is wrong. See the header for the five in full.
 */
export const LANGUAGE_QUALITY_READINGS = [
  'error',
  'conversational',
  'terminology',
  'intentional-english',
  'user-wording',
] as const;
export type LanguageQualityReading = (typeof LANGUAGE_QUALITY_READINGS)[number];

/**
 * What this layer cannot judge, named once and carried by every report.
 *
 * An evaluation that lists only what it checks invites a reader to treat its silence as approval. The
 * honest form of that sentence is a list of the questions it does not ask — and one of these is
 * data-derived on purpose: whether the product has decided about a compound is a fact about the
 * store, and a report that hid it would be claiming a decision somebody else has not made.
 */
export const LANGUAGE_QUALITY_LIMITS: readonly string[] = [
  'meaning — whether a sentence says what its writer meant',
  'idiom and collocation outside the fixed tables — whether a phrase is what a Persian speaker would say here',
  'morphology — a word derived in a way the closed tables do not hold',
  'register outside the pairs in `REGISTER_FORMS`, which hold spoken forms rather than every informal wording',
  'a Latin technical term that is neither all-capitals, capitalised nor inside a code span: it is reported as a shape, with no preferred equivalent offered, because this layer holds no lexicon',
  'whether a figure is correct — only which repertoire its digits are written in',
  'a digit inside a technical token: a ratio written as a slash token, a path and a code span are all protected as another language’s, so a mixed digit repertoire inside one goes unread (the same protection that keeps `BTC/USDT` intact also keeps `۳٣٤٥/۲۰` out of the report)',
  'the language of a text whose prose is not clearly one script — the script ahead has to hold at least twice the letters of the other, so a two-word message of one Persian and one English word is read as neither and neither mixed-script check reports anything about it',
  'sentence structure beyond the seven shapes the grammar catalogue holds — a parse, a clause boundary and a relative clause are the grammar layer’s business and it deliberately has none of them',
  'punctuation that is missing without evidence: an absent comma between two independent clauses, or a full stop a paragraph ends without, because a heading, a list item and a fragment are all legitimate and none of them is distinguishable from prose by a rule',
  'a term this product writes differently — the comparison lives in the terminology lexicon (`terminology.ts`), which reaches the language store and is therefore not read here; the shape of a technical token is read instead, and named in `recognised`',
];

/* ────────────────────────────────────────────────────────────────────────────
 * The shape of a finding
 * ──────────────────────────────────────────────────────────────────────────── */

/** One thing a check found: the characters, where they were, and what the product writes instead. */
export interface QualityMatch {
  readonly index: number;
  readonly found: string;
  /**
   * What to write in those characters' place. `null` when the product offers no replacement — a
   * judgement about wording has to say *why*, and inventing a phrase the product does not write
   * would be this layer making a copy decision. The empty string is a real answer: delete them.
   */
  readonly instead: string | null;
  readonly reason: string;
}

/** What every check is handed. */
export interface QualityInput {
  readonly text: string;
  /** The protected spans themselves, which a rule from `rules.ts` is handed as part of its input. */
  readonly spans: readonly Span[];
  /**
   * True when any part of `[start, end)` lies inside a protected span.
   *
   * A range, because a check is about the characters it reports rather than about one insertion
   * point: a comma it names must be *entirely* outside a URL for the finding to be about prose.
   */
  readonly protects: (start: number, end: number, kinds?: readonly SpanKind[]) => boolean;
  /**
   * The same question about one character — the shape a rule in `rules.ts` asks through its own
   * `RuleInput`, which is why the bridge to those rules needs it.
   */
  readonly protectsCharacter: (index: number, kinds?: readonly SpanKind[]) => boolean;
}

/** A check: one question, asked of the whole text, without touching a store. */
export interface LanguageQualityCheck {
  /** Stable id, `<axis>.<what it looks for>`. Cited in tests and in a review. */
  readonly id: string;
  readonly axis: LanguageQualityAxis;
  /** What it looks for, in one sentence, for a report a person reads. */
  readonly describe: string;
  /** True when the answer is decided rather than judged. */
  readonly deterministic: boolean;
  /** What a finding from this check means about the text — its place in the five readings. */
  readonly reading: LanguageQualityReading;
  readonly run: (input: QualityInput) => readonly QualityMatch[];
}

/** A finding as it leaves the layer: the check's answer, with the check named. */
export interface LanguageQualityFinding extends QualityMatch {
  readonly axis: LanguageQualityAxis;
  readonly check: string;
  readonly length: number;
  readonly deterministic: boolean;
  readonly reading: LanguageQualityReading;
}

/**
 * The readings a report *recognises* instead of reporting: what it saw and chose not to flag.
 *
 * The other two readings are not here and the absence is the design. An `error` is reported by
 * definition, and a `conversational` register is reported too — a writer benefits from seeing that a
 * form is spoken rather than written, which is a note and not a silence.
 */
export const LANGUAGE_QUALITY_RECOGNITION_KINDS = [
  'terminology',
  'intentional-english',
  'user-wording',
] as const;
export type LanguageQualityRecognitionKind = (typeof LANGUAGE_QUALITY_RECOGNITION_KINDS)[number];

/**
 * Something the evaluation saw and deliberately did not report.
 *
 * The distinction the five readings draw is only worth making if it is visible, so a report names the
 * other side of it too: the terms it recognised, the literals it left alone and the caller's own
 * wording. `found` is capped — `more` says how many forms were not listed — because this is a summary
 * of a stance and not an inventory of a document.
 */
export interface LanguageQualityRecognition {
  readonly kind: LanguageQualityRecognitionKind;
  /** The distinct forms recognised, in the order they appear in the text. */
  readonly found: readonly string[];
  /** How many further forms this kind recognised and did not list. */
  readonly more: number;
  readonly reason: string;
}

export interface LanguageQualityReport {
  readonly input: string;
  /** Always `input`. This layer reports; it does not rewrite, and the suite holds it to that. */
  readonly text: string;
  /** In text order; at one index, in axis order. */
  readonly findings: readonly LanguageQualityFinding[];
  /** The real errors: the `error` subset, and the only list a surface should act on. */
  readonly errors: readonly LanguageQualityFinding[];
  /** What was recognised and not reported, one entry per kind, with the forms that produced it. */
  readonly recognised: readonly LanguageQualityRecognition[];
  readonly counts: Readonly<Record<LanguageQualityAxis, number>>;
  /** The checks that ran, in order. */
  readonly checks: readonly string[];
  /** The checks a caller left out — named, never silently absent. */
  readonly skippedChecks: readonly string[];
  /** `LANGUAGE_QUALITY_LIMITS`, plus the compounds the product has not decided. */
  readonly notEvaluated: readonly string[];
}

export interface LanguageQualityOptions {
  /** Leave these check ids out: a surface that has decided it wants less. */
  readonly exceptChecks?: readonly string[];
  /**
   * The caller's own exceptions — text this evaluation must not comment on, as plain strings rather
   * than patterns, because they are somebody's decision and a decision is not a regex.
   *
   * Passed in by the caller, never read from the store: this layer has no way to fetch one, which is
   * the property that lets it run where the store is not.
   */
  readonly protectedLiterals?: readonly string[];
}

/* ────────────────────────────────────────────────────────────────────────────
 * Shared reading: what script is this text near?
 * ──────────────────────────────────────────────────────────────────────────── */

const PERSIAN_LETTER = new RegExp(`[${PERSIAN_LETTERS}]`, 'u');
const LATIN_LETTER = new RegExp(`[${LATIN_LETTERS}]`, 'u');

/** Which script the prose around a token is written in, or `null` when there is no prose to ask. */
type ProseScript = 'persian' | 'latin' | null;

interface FoundLetter {
  readonly character: string;
  readonly index: number;
}

/**
 * The nearest *prose* letter in one direction, skipping everything that is not a letter.
 *
 * It stops at a line break, because a new line is a new context, and — the one place this differs from
 * the walk `rules.ts` makes for `isPersianProse` — it walks *past* a letter that sits inside a
 * protected span. A URL is not prose: reading the `m` of `com` as the sentence's language is how a
 * Persian sentence containing a code span gets called Persian text inside an English one.
 *
 * Passing over a span can only ever move an answer, never break one: the letters inside a span are
 * skipped and the search continues to the nearest letter a reader would actually read.
 */
function nearestProseLetter(input: QualityInput, from: number, step: 1 | -1): FoundLetter | null {
  for (let index = from; index >= 0 && index < input.text.length; index += step) {
    const character = input.text[index] as string;
    if (character === '\n' || character === '\r') return null;
    if (!PERSIAN_LETTER.test(character) && !LATIN_LETTER.test(character)) continue;
    if (input.protects(index, index + 1)) continue;
    return { character, index };
  }
  return null;
}

/**
 * Which script the prose around a token is written in.
 *
 * The nearer of the two neighbouring letters decides, and **a tie goes to Persian** — the same way
 * `isPersianProse` decides one, and for the same reason: a token equidistant from a Persian and a
 * Latin letter must not read as Persian-in-English to one check and English-in-Persian to another.
 *
 * With no letter on either side there is no context and the answer is `null`, which no check treats as
 * a match: the reason a bare `سلام` is not a Persian phrase inside an English sentence, and a bare
 * `3345` is not yet a number in a Persian one.
 */
function proseAround(input: QualityInput, start: number, end: number): ProseScript {
  const left = nearestProseLetter(input, start - 1, -1);
  const right = nearestProseLetter(input, end, 1);
  const leftDistance = left === null ? Number.POSITIVE_INFINITY : start - left.index;
  const rightDistance = right === null ? Number.POSITIVE_INFINITY : right.index - end + 1;
  if (leftDistance === Number.POSITIVE_INFINITY && rightDistance === Number.POSITIVE_INFINITY) {
    return null;
  }
  const nearest = leftDistance <= rightDistance ? left : right;
  if (nearest === null) return null;
  return scriptOf(nearest.character);
}

/** Which script one letter belongs to. */
function scriptOf(character: string): ProseScript {
  return PERSIAN_LETTER.test(character) ? 'persian' : 'latin';
}

/** How many letters of each script a text's prose holds. */
interface ProseCensus {
  readonly persian: number;
  readonly latin: number;
}

/**
 * Count the prose letters of each script — the reading the two mixed-script checks use.
 *
 * A nearest-letter reading answers "whose punctuation is this?", which is a local question about a
 * mark, and it is the wrong question to ask about *language*. Tried and measured: in
 * `اندیکاتور ATR روی نماد XAUUSD سیگنال خرید میدهد.` the words between the two symbols have Latin on
 * both sides, and a local rule calls a Persian sentence Persian text inside English. A symbol is not a
 * language. Neither is a code span, nor a path — which is why the census counts the letters a reader
 * reads and passes over the ones inside a protected span.
 *
 * This is the same reading `detectLanguage` makes of a message, kept here because that module answers
 * for a whole message while this one has to answer for the prose around a token; the numbers are two
 * counts and the comparison is one, which is what lets both checks below be stated in a sentence.
 */
function proseCensus(input: QualityInput): ProseCensus {
  let persian = 0;
  let latin = 0;
  for (let index = 0; index < input.text.length; index += 1) {
    const character = input.text[index] as string;
    const isPersian = PERSIAN_LETTER.test(character);
    if (!isPersian && !LATIN_LETTER.test(character)) continue;
    if (input.protects(index, index + 1)) continue;
    if (isPersian) persian += 1;
    else latin += 1;
  }
  return { persian, latin };
}

/**
 * Which script a text's prose is written in, when it is clearly one of them.
 *
 * "Clearly" is one comparison: the script ahead holds at least **twice** the letters of the other.
 * A `روند trend` — four Persian letters against five Latin ones — is a two-word message and not a
 * statement about a language, and a check that reported it would be reading a coin toss. A Persian
 * sentence with a symbol in it, or an English one with a Persian word quoted in it, clears the bar by
 * an order of magnitude; the ones that do not are the ones where the honest answer is silence.
 */
function dominantProse(input: QualityInput): 'persian' | 'latin' | null {
  const { persian, latin } = proseCensus(input);
  if (persian === 0 && latin === 0) return null;
  if (persian >= latin * 2) return 'persian';
  if (latin >= persian * 2) return 'latin';
  return null;
}

/** Every match of a pattern that stands as a whole word, so `و یا` is not found inside `و یازده`. */
function phraseMatches(text: string, pattern: RegExp): { index: number; found: string }[] {
  const wordCharacter = new RegExp(`[${PERSIAN_LETTERS}${LATIN_LETTERS}${ZWNJ}]`, 'u');
  const found: { index: number; found: string }[] = [];
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined || match[0] === '') continue;
    const before = match.index === 0 ? '' : (text[match.index - 1] as string);
    const after = text[match.index + match[0].length];
    const startsClean = before === '' || !wordCharacter.test(before);
    const endsClean = after === undefined || !wordCharacter.test(after);
    if (startsClean && endsClean) found.push({ index: match.index, found: match[0] });
  }
  return found;
}

/** Escape a literal for a pattern — the marks below are reused inside character classes. */
function escaped(character: string): string {
  return character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ────────────────────────────────────────────────────────────────────────────
 * Grammar: the one thing this product already detects, called rather than rebuilt
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * What each grammar rule means for a reader.
 *
 * Two of the seven say in their own notes that the shape they detect has a legitimate reading — a
 * clause the object marker ends may be a heading or a fragment, and `خوبها` may be the *noun* "the good
 * ones" — so those are the writer's wording and not errors. The other five are mistakes no reader
 * would defend: a numeral takes a singular noun, a plural subject takes a plural verb, two scripts
 * written without a boundary read as one word.
 *
 * The table is keyed by rule id and the suite requires a reading for every rule in the catalogue, so a
 * grammar rule cannot arrive without somebody deciding what its findings mean — which is the whole
 * question this phase is about.
 */
const GRAMMAR_READINGS: Readonly<Record<string, LanguageQualityReading>> = {
  'grammar.mixed-script-boundary': 'error',
  'grammar.ezafe-yeh': 'error',
  'grammar.plural-after-numeral': 'error',
  'grammar.verb-number-agreement': 'error',
  'grammar.pronoun-agreement': 'error',
  // "A heading or a fragment is still a legitimate use, so it reports." — `grammar.ts`
  'grammar.object-marker-before-verb': 'user-wording',
  // "`خوبها` is also a legitimate *noun* … A reviewer, who can see whether the word modifies a noun,
  // is the one who decides." — `grammar.ts`
  'grammar.adjective-invariant': 'user-wording',
};

/**
 * A grammar check, derived from the catalogue's own rule rather than written again here.
 *
 * The rule's `correct` edits and its `detect` findings are both findings here, and the difference
 * between them survives as `deterministic`: a `correct` rule has one answer and it is printed, a
 * `report` rule has a suggestion a person confirms. The reason is the rule's own sentence wherever the
 * rule does not carry a better one, so the text a reviewer reads in a report is the text the rule
 * already documents itself with.
 *
 * Nothing about authorisation changes: the rule functions are pure and this layer calls them directly,
 * where the pipeline would first ask the store whether the rule's key is trusted. That is the
 * difference between the two layers in one line of code, and it is the reason a rule whose store entry
 * has been deprecated still reaches a report here — a reading is about the text, not about what we have
 * decided to correct.
 */
function grammarCheck(rule: LanguageRule): LanguageQualityCheck {
  return {
    id: rule.id,
    axis: 'grammar',
    describe: rule.describe,
    deterministic: rule.enforcement === 'correct',
    reading: GRAMMAR_READINGS[rule.id] ?? 'error',
    run: (input) => {
      const ruleInput: RuleInput = {
        text: input.text,
        spans: input.spans,
        // The kinds are the rule's own, exactly as the pipeline hands them to it: a rule that protects
        // figures asks about figures, and one that does not is free to read them.
        protects: (index) => input.protectsCharacter(index, rule.protectedKinds),
      };
      const matches: QualityMatch[] = [];
      for (const edit of rule.correct?.(ruleInput) ?? []) {
        matches.push({
          index: edit.start,
          // An insertion has nothing to quote, and that is honest rather than empty: `found` is the
          // characters the finding is about, and this one is about the place between two of them.
          found: input.text.slice(edit.start, edit.end),
          instead: edit.after,
          reason: rule.describe,
        });
      }
      for (const finding of rule.detect?.(ruleInput) ?? []) {
        matches.push({
          index: finding.index,
          found: finding.match,
          instead: finding.suggestion,
          reason: finding.reason,
        });
      }
      return matches;
    },
  };
}

/** The grammar axis, one check per rule in the catalogue. */
const GRAMMAR_CHECKS: readonly LanguageQualityCheck[] = GRAMMAR_RULES.map(grammarCheck);

/* ────────────────────────────────────────────────────────────────────────────
 * The half-space
 * ──────────────────────────────────────────────────────────────────────────── */

/** The forms this product writes after a half-space, read from the catalogue rather than retyped. */
const CLITIC_FORMS = ZWNJ_CLITIC_FORMS;

/**
 * The light verbs a separated `می` almost always belongs to.
 *
 * The closed list is what makes the check reportable at all: `می` is a word of its own — wine, and a
 * noun Persian prose happily puts before a verb — so "a space after `می`" is not on its own evidence
 * of anything. A closed list of the verbs this product's copy conjugates turns a guess into a
 * reading, and the verdict stays a judgement because it is still a reading.
 */
const LIGHT_VERBS: readonly string[] = [
  'شود',
  'کند',
  'رود',
  'آید',
  'تواند',
  'دهد',
  'گیرد',
  'دارد',
  'بود',
  'ماند',
];

/** The Persian half-space checks. */
const ZWNJ_CHECKS: readonly LanguageQualityCheck[] = [
  {
    id: 'zwnj.clitic-separated',
    axis: 'zwnj',
    describe:
      'A plural with a clitic after it is written with a space: the half-space joins them into one word.',
    deterministic: true,
    reading: 'error',
    run: (input) => {
      const found: QualityMatch[] = [];
      for (const form of CLITIC_FORMS) {
        for (const index of standaloneMatches(input.text, form)) {
          // A space before it is the whole finding: the form is joined to its noun with a half-space
          // and never with a space. The closed-up case is deliberately not reported — where a
          // half-space belongs inside `کتابهایی` depends on how the plural was written, and a
          // mechanical claim about a position this rule cannot see would be a guess.
          if (input.text[index - 1] !== ' ' || index < 2) continue;
          if (!PERSIAN_LETTER.test(input.text[index - 2] as string)) continue;
          if (input.protects(index - 1, index + form.length)) continue;
          found.push({
            index: index - 1,
            found: ` ${form}`,
            instead: `${ZWNJ}${form}`,
            reason:
              'The plural with a clitic after it is one word in Persian, written with a half-space (U+200C) and never with a space.',
          });
        }
      }
      return found;
    },
  },
  {
    id: 'zwnj.beside-space',
    axis: 'zwnj',
    describe: 'A half-space sits at an edge, or next to a space, where there is nothing to join.',
    deterministic: true,
    reading: 'error',
    run: (input) => {
      const found: QualityMatch[] = [];
      for (let index = 0; index < input.text.length; index += 1) {
        if (input.text[index] !== ZWNJ) continue;
        const before = input.text[index - 1];
        const after = input.text[index + 1];
        const neighbourIsSpace = (character: string | undefined): boolean =>
          character === ' ' || character === '\t';
        if (!(
          before === undefined ||
          after === undefined ||
          neighbourIsSpace(before) ||
          neighbourIsSpace(after)
        )) {
          continue;
        }
        if (input.protects(index, index + 1)) continue;
        found.push({
          index,
          found: ZWNJ,
          instead: '',
          reason:
            'A half-space joins two letters; at an edge of the text or beside a space there is nothing for it to join, so it is an invisible character a reader cannot see and a search cannot find.',
        });
      }
      return found;
    },
  },
  {
    id: 'zwnj.repeated',
    axis: 'zwnj',
    describe: 'Two or more half-spaces in a row: one of them is always invisible and always wrong.',
    deterministic: true,
    reading: 'error',
    run: (input) => {
      const found: QualityMatch[] = [];
      const pattern = new RegExp(`${ZWNJ}{2,}`, 'gu');
      for (const match of input.text.matchAll(pattern)) {
        if (match.index === undefined) continue;
        if (input.protects(match.index, match.index + match[0].length)) continue;
        found.push({
          index: match.index,
          found: match[0],
          instead: ZWNJ,
          reason: 'Two half-spaces at one position are one half-space; the second joins nothing.',
        });
      }
      return found;
    },
  },
  {
    id: 'zwnj.in-latin-run',
    axis: 'zwnj',
    describe: 'A half-space inside a run of Latin letters or digits, where it breaks the token.',
    deterministic: true,
    reading: 'error',
    run: (input) => {
      const found: QualityMatch[] = [];
      const token = new RegExp(`[${LATIN_LETTERS}0-9]`, 'u');
      for (let index = 0; index < input.text.length; index += 1) {
        if (input.text[index] !== ZWNJ) continue;
        const before = input.text[index - 1];
        const after = input.text[index + 1];
        if (!token.test(before ?? '') || !token.test(after ?? '')) continue;
        if (input.protects(index, index + 1)) continue;
        found.push({
          index,
          found: ZWNJ,
          instead: '',
          reason:
            'The half-space is Persian orthography; inside a Latin token it is an invisible character that stops the token being copied, searched or matched as itself.',
        });
      }
      return found;
    },
  },
  {
    id: 'zwnj.prefix-separated',
    axis: 'zwnj',
    describe:
      'A `می` or `نمی` prefix written with a space before one of the light verbs this product conjugates.',
    deterministic: false,
    reading: 'error',
    run: (input) => {
      const found: QualityMatch[] = [];
      const verbs = LIGHT_VERBS.join('|');
      const pattern = new RegExp(`(ن?می)[ \\t]+(${verbs})(?![${PERSIAN_LETTERS}])`, 'gu');
      for (const match of input.text.matchAll(pattern)) {
        if (match.index === undefined) continue;
        const prefix = match[1] as string;
        const verb = match[2] as string;
        if (input.protects(match.index, match.index + match[0].length)) continue;
        found.push({
          index: match.index,
          found: match[0],
          instead: `${prefix}${ZWNJ}${verb}`,
          reason: `The continuous prefix \`${prefix}\` is written with a half-space and not a space. A judgement rather than a rule, because \`${prefix}\` is also a word of its own and only the verb tells the two apart.`,
        });
      }
      return found;
    },
  },
];

/* ────────────────────────────────────────────────────────────────────────────
 * Punctuation, and the space around it
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The marks that hug what precedes them.
 *
 * A space before a closing mark is a slip in every script — the mark belongs to the word it closes —
 * so this is one set rather than a Persian set and an English one.
 *
 * The ordinary full stop is in the set, and it is the entry worth arguing about: a period is also a
 * decimal point and an abbreviation, which is why the protected spans matter here rather than
 * anywhere else. `۳٫۵` and `index.ts` are protected and safe; `او رفت .` is a space between a word
 * and the mark that ends it, and it is the shape two of the evaluated toolkits produce and one of
 * them explicitly removes (Hazm's own example turns `دارم .` into `دارم.`). An English sentence is
 * untouched, because the nearer letter decides which language is being written.
 */
const HUGGING_MARKS = `${PERSIAN_PUNCTUATION.comma}${PERSIAN_PUNCTUATION.semicolon}${PERSIAN_PUNCTUATION.questionMark}!${PERSIAN_PUNCTUATION.percent}.\u00BB)]`;

/**
 * True when the full stop at `index` is one of a run of periods.
 *
 * A run of periods is an ellipsis, and an ellipsis is a mark with a space in front of it in ordinary
 * writing (`صبر کن ... بعد`) — so both of the checks that look at the space around a mark have to be
 * able to tell the two apart. One shared predicate rather than two guards, because two guards is how
 * one of them eventually stops agreeing with the other; the spaced ellipsis below is the case that
 * proves it.
 */
function isEllipsisPeriod(text: string, index: number): boolean {
  return text[index] === '.' && (text[index - 1] === '.' || text[index + 1] === '.');
}

/**
 * The marks a following word is separated from by a space.
 *
 * The full stop is here for the same reason it is in the hugging set: `بله.خوب` is two sentences run
 * together, and the reader sees one word. It is not in the *doubled* check, which is a deliberate
 * asymmetry — `..` and `...` are an ellipsis and a slip told apart by count, and a rule that collapsed
 * a run of periods would eat the ellipsis. That check's own guard states the same thing from its side.
 */
const SEPARATING_MARKS = `${PERSIAN_PUNCTUATION.comma}${PERSIAN_PUNCTUATION.semicolon}${PERSIAN_PUNCTUATION.questionMark}.`;

/**
 * The particles that can only begin a question.
 *
 * A closed list, and the closing is the point: `چه` and `کی` are also words of their own, so a
 * sentence beginning with one of them is not evidence of anything. These five cannot start a sentence
 * that is not asking. `چرا` is deliberately absent even though it is the commonest of them, because it
 * is also the word for *pasture*, and a report that called a sentence about grazing a missing question
 * mark would be exactly the noise this layer exists not to make.
 */
const INTERROGATIVE_OPENERS: readonly string[] = ['آیا', 'چگونه', 'چطور', 'چقدر', 'کدام', 'کجا'];

/**
 * The paired marks, which come in twos or not at all.
 *
 * Each entry is `[opener, closer]`. Brackets are the same in both scripts, so this table is not about
 * translation; it is about a pair a reader will look for and not find.
 */
const MARK_PAIRS: readonly (readonly [string, string])[] = [
  ['\u00AB', '\u00BB'],
  ['(', ')'],
  ['[', ']'],
];

/**
 * A mark and the ASCII lookalike it is the same mark as.
 *
 * A doubled or mixed run collapses to the first entry, which is the Persian one for the three marks
 * that have a Persian form and the ASCII one for `!`, which has no other form. The same groups
 * `spelling.ts` uses, because two tables of "which marks mean the same thing" would eventually
 * disagree about the percent sign.
 */
const MARK_GROUPS: readonly (readonly [string, string])[] = [
  [`${PERSIAN_PUNCTUATION.comma},`, PERSIAN_PUNCTUATION.comma],
  [`${PERSIAN_PUNCTUATION.semicolon};`, PERSIAN_PUNCTUATION.semicolon],
  [`${PERSIAN_PUNCTUATION.questionMark}?`, PERSIAN_PUNCTUATION.questionMark],
  ['!', '!'],
];

/** The punctutation checks: which mark, and where it sits. */
const PUNCTUATION_CHECKS: readonly LanguageQualityCheck[] = [
  {
    id: 'punctuation.ascii-mark',
    axis: 'punctuation',
    describe:
      'An ASCII comma, semicolon or question mark inside Persian prose, where Persian has its own mark.',
    deterministic: true,
    reading: 'error',
    run: (input) => {
      const folds: readonly (readonly [string, string])[] = [
        [',', PERSIAN_PUNCTUATION.comma],
        [';', PERSIAN_PUNCTUATION.semicolon],
        ['?', PERSIAN_PUNCTUATION.questionMark],
      ];
      const found: QualityMatch[] = [];
      for (const [ascii, persian] of folds) {
        for (
          let index = input.text.indexOf(ascii);
          index !== -1;
          index = input.text.indexOf(ascii, index + 1)
        ) {
          if (proseAround(input, index, index + 1) !== 'persian') continue;
          if (input.protects(index, index + 1)) continue;
          found.push({
            index,
            found: ascii,
            instead: persian,
            reason: `Persian prose uses its own ${persian} rather than the ASCII ${ascii}. The full stop is deliberately not folded: Persian prose ends a sentence with the period it shares with English.`,
          });
        }
      }
      return found;
    },
  },
  {
    id: 'punctuation.doubled',
    axis: 'punctuation',
    describe: 'Two marks in a row where one is meant, in the same group or in two.',
    deterministic: true,
    reading: 'error',
    run: (input) => {
      const characters = MARK_GROUPS.map(([group]) => group).join('');
      const pattern = new RegExp(`[${escaped(characters)}]{2,}`, 'gu');
      const found: QualityMatch[] = [];
      for (const match of input.text.matchAll(pattern)) {
        if (match.index === undefined) continue;
        if (input.protects(match.index, match.index + match[0].length)) continue;
        const group = MARK_GROUPS.find(([members]) =>
          [...match[0]].every((character) => members.includes(character)),
        );
        // A run that mixes groups — `?!`, `،?` — is punctuation somebody chose. One report per group
        // is a claim this layer can support; a claim about `؟!` is a copy decision.
        if (group === undefined) continue;
        found.push({
          index: match.index,
          found: match[0],
          instead: group[1],
          reason: `\`${group[0]}\` are the same mark written twice, or in two scripts; one of them is meant.`,
        });
      }
      return found;
    },
  },
  {
    id: 'punctuation.unbalanced',
    axis: 'punctuation',
    describe: 'A quotation or a bracket opened and not closed, or closed and not opened.',
    deterministic: false,
    reading: 'error',
    run: (input) => {
      const found: QualityMatch[] = [];
      for (const [opener, closer] of MARK_PAIRS) {
        const opens = input.text.split(opener).length - 1;
        const closes = input.text.split(closer).length - 1;
        if (opens === closes) continue;
        const index = input.text.indexOf(opens > closes ? opener : closer);
        if (index === -1) continue;
        found.push({
          index,
          found: opens > closes ? opener : closer,
          instead: null,
          reason: `\`${opener}\` appears ${opens} time(s) and \`${closer}\` ${closes}; a pair is closed or it is not opened. Which end is missing is the writer's to say, so no replacement is offered.`,
        });
      }
      return found;
    },
  },
  {
    id: 'punctuation.missing-question-mark',
    axis: 'punctuation',
    describe:
      'A sentence that opens with a word which can only ask a question, and does not end with the question mark.',
    // Reported rather than decided: the missing mark is punctuation, but what this rule sees is an
    // opening word, and a heading, a quoted question and a question somebody asked on purpose all look
    // the same to it.
    deterministic: false,
    reading: 'error',
    run: (input) => {
      const found: QualityMatch[] = [];
      const questionMark = PERSIAN_PUNCTUATION.questionMark;
      const openers = INTERROGATIVE_OPENERS.join('|');
      // A sentence starts at the beginning of the text, after a newline, or after a terminal mark. A
      // comma does not start one, which is what keeps `بله، آیا` out of this check.
      const pattern = new RegExp(
        `(?:^|[\n.${questionMark}!])\\s*(${openers})(?![${PERSIAN_LETTERS}])`,
        'gu',
      );
      for (const match of input.text.matchAll(pattern)) {
        if (match.index === undefined) continue;
        const opener = match[1] as string;
        const at = match.index + match[0].length - opener.length;
        if (input.protects(at, at + opener.length)) continue;
        // Where the sentence ends is the first terminal mark or line break after the opener.
        let end = input.text.length;
        for (let index = at + opener.length; index < input.text.length; index += 1) {
          const character = input.text[index] as string;
          if (
            character === '\n' ||
            character === '.' ||
            character === questionMark ||
            character === '!'
          ) {
            end = index;
            break;
          }
        }
        const terminator = input.text[end];
        if (terminator === questionMark) continue;
        const opening = `\`${opener}\` can only open a question`;
        const closing =
          terminator === undefined || terminator === '\n'
            ? 'and the sentence it opens ends without a mark'
            : `and the sentence it opens ends with \`${terminator}\` rather than \`${questionMark}\``;
        found.push({
          index: at,
          found: opener,
          instead: null,
          reason: `${opening}, ${closing}. The mark belongs at the end of that sentence, and a heading, a fragment and a question somebody asked on purpose all look the same here, so the finding names the evidence and leaves the placement to the writer.`,
        });
      }
      return found;
    },
  },
];

/** The spacing checks: the space between a word and a mark, and between two words. */
const SPACING_CHECKS: readonly LanguageQualityCheck[] = [
  {
    id: 'spacing.before-mark',
    axis: 'spacing',
    describe: 'A space before a mark that belongs to the word before it.',
    deterministic: true,
    reading: 'error',
    run: (input) => {
      const pattern = new RegExp(`[ \\t]+[${escaped(HUGGING_MARKS)}]`, 'gu');
      const found: QualityMatch[] = [];
      for (const match of input.text.matchAll(pattern)) {
        if (match.index === undefined) continue;
        const mark = match[0][match[0].length - 1] as string;
        const markIndex = match.index + match[0].length - 1;
        if (isEllipsisPeriod(input.text, markIndex)) continue;
        if (proseAround(input, match.index, markIndex + 1) !== 'persian') continue;
        if (input.protects(match.index, markIndex + 1)) continue;
        found.push({
          index: match.index,
          found: match[0],
          instead: mark,
          reason: `\`${mark}\` closes or ends the word before it, so it is written against it and never after a space.`,
        });
      }
      return found;
    },
  },
  {
    id: 'spacing.after-mark',
    axis: 'spacing',
    describe: 'A separating mark with the next word run against it, where a space belongs.',
    deterministic: true,
    reading: 'error',
    run: (input) => {
      const pattern = new RegExp(`[${escaped(SEPARATING_MARKS)}](?=[^\\s])`, 'gu');
      const found: QualityMatch[] = [];
      for (const match of input.text.matchAll(pattern)) {
        if (match.index === undefined) continue;
        const index = match.index;
        const mark = match[0] as string;
        // A run of periods is an ellipsis, and one period of it is not a sentence ending.
        if (isEllipsisPeriod(input.text, index)) continue;
        // A mark at the end of its line needs nothing after it; only a following *letter* is a word
        // run against the mark.
        const after = input.text[index + 1] as string;
        if (!PERSIAN_LETTER.test(after) && !LATIN_LETTER.test(after)) continue;
        if (proseAround(input, index, index + 1) !== 'persian') continue;
        if (input.protects(index, index + 1)) continue;
        found.push({
          index,
          found: `${mark}${after}`,
          instead: `${mark} ${after}`,
          reason: `\`${mark}\` separates; the word after it is separated by a space, exactly as the word before it is.`,
        });
      }
      return found;
    },
  },
  {
    id: 'spacing.double',
    axis: 'spacing',
    describe: 'Two or more spaces between two Persian words.',
    deterministic: true,
    reading: 'error',
    run: (input) => {
      const pattern = new RegExp(
        `(?<=[${PERSIAN_LETTERS}])[ \\t]{2,}(?=[${PERSIAN_LETTERS}])`,
        'gu',
      );
      const found: QualityMatch[] = [];
      for (const match of input.text.matchAll(pattern)) {
        if (match.index === undefined) continue;
        if (input.protects(match.index, match.index + match[0].length)) continue;
        found.push({
          index: match.index,
          found: match[0],
          instead: ' ',
          reason:
            'One space separates two words. A run of spaces between Persian words is invisible on screen and misleading in a copy, and aligning a table is done with a table, not with spaces.',
        });
      }
      return found;
    },
  },
];

/* ────────────────────────────────────────────────────────────────────────────
 * Spelling, and the letter repertoire
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The characters this product folds, and what it folds them to.
 *
 * The pairs are the ones `normalizePersianText` in `fa.ts` applies, and the suite asserts that by
 * asking that function rather than by comparing two lists: a fold that changed there and not here
 * would be a report that disagreed with the product's own normalization.
 */
const CHARACTER_FOLDS: readonly (readonly [string, string])[] = [
  ['\u064A', '\u06CC'],
  ['\u0649', '\u06CC'],
  ['\u0643', '\u06A9'],
];

/** The spelling checks: whole words, and single characters. */
const SPELLING_CHECKS: readonly LanguageQualityCheck[] = [
  {
    id: 'spelling.compound',
    axis: 'spelling',
    describe: 'A compound the product writes in two words, written as one.',
    deterministic: true,
    reading: 'error',
    run: (input) => {
      const found: QualityMatch[] = [];
      for (const pair of COMPOUND_PAIRS) {
        // A pair the store holds as `pending` is not this layer's to assert: the product has not
        // decided it, and reporting it would be inventing a rule the pipeline may not apply.
        if (pair.proposed === true) continue;
        for (const index of standaloneMatches(input.text, pair.written)) {
          if (input.protects(index, index + pair.written.length)) continue;
          found.push({
            index,
            found: pair.written,
            instead: pair.correct,
            reason: pair.why,
          });
        }
      }
      return found;
    },
  },
  {
    id: 'spelling.arabic-repertoire',
    axis: 'spelling',
    describe:
      'A letter or a digit from the Arabic repertoire where Persian has its own — including inside a figure, where the pipeline may not rewrite but a reader still sees it.',
    deterministic: true,
    reading: 'error',
    run: (input) => {
      const found: QualityMatch[] = [];
      // Only structural spans are respected here, and the figure deliberately is not. A wrong digit
      // *repertoire* is a script fact rather than a value: the suggestion replaces the digits with the
      // same digits, so there is nothing here for the pipeline's price-protection rule to protect.
      const kinds: readonly SpanKind[] = ['technical', 'exception'];
      const report = (index: number, instead: string, reason: string): void => {
        const character = input.text[index] as string;
        if (proseAround(input, index, index + 1) !== 'persian') return;
        if (input.protects(index, index + 1, kinds)) return;
        found.push({ index, found: character, instead, reason });
      };
      for (let index = 0; index < input.text.length; index += 1) {
        const character = input.text[index] as string;
        for (const [arabic, persian] of CHARACTER_FOLDS) {
          if (character !== arabic) continue;
          report(
            index,
            persian,
            `\`${arabic}\` is the Arabic letter; Persian writes \`${persian}\`. Both render almost identically, which is exactly why a reader cannot see the difference and a report has to say it.`,
          );
        }
        const digit = ARABIC_INDIC_DIGITS.indexOf(character);
        if (digit !== -1) {
          report(
            index,
            PERSIAN_DIGITS[digit] as string,
            `\`${character}\` is an Arabic-Indic digit; Persian prose writes \`${PERSIAN_DIGITS[digit]}\`. The two sets look the same at interface sizes and are different characters.`,
          );
        }
      }
      return found;
    },
  },
];

/* ────────────────────────────────────────────────────────────────────────────
 * Wording and register
 * ──────────────────────────────────────────────────────────────────────────── */

/** A construction this product's copy does not write, and what it writes instead. */
interface BookishPhrase {
  readonly pattern: RegExp;
  readonly instead: string | null;
  readonly why: string;
}

/**
 * The bookish constructions, each one a decision with its reason.
 *
 * This table is the evaluation's own, and it is an editorial position rather than store knowledge:
 * every entry replaces ceremony with the word the sentence is actually made of — the simple verb, the
 * plain preposition, one conjunction instead of two. Nothing here is a correction the pipeline makes,
 * which is why every finding from it is a judgement: a person may write `در خصوص` on purpose, and this
 * layer's job is to say that the product's copy does not.
 */
const BOOKISH_PHRASES: readonly BookishPhrase[] = [
  {
    pattern: new RegExp(`می[ \\t${ZWNJ}]?باشد`, 'gu'),
    instead: 'است',
    why: '`است` is the verb. `میباشد` wraps it in a passive-impersonal form that says nothing the verb does not, and this product’s copy does not write it.',
  },
  {
    pattern: new RegExp(`می[ \\t${ZWNJ}]?گردد`, 'gu'),
    instead: `می${ZWNJ}شود`,
    why: 'The `گردید` chain turns an action into something that happens to somebody. The product writes the active `میشود`.',
  },
  {
    pattern: /در خصوص/gu,
    instead: 'درباره',
    why: 'A calque of *in regard to*; `درباره` is the word, and it is one word shorter.',
  },
  {
    pattern: /به منظور/gu,
    instead: 'برای',
    why: '`به منظور` is a nominal wrapper around a preposition. `برای` is the preposition.',
  },
  {
    pattern: /بر روی/gu,
    instead: 'روی',
    why: '`بر` and `روی` say the same thing; the product writes one of them.',
  },
  {
    pattern: /و یا/gu,
    instead: 'یا',
    why: '`و` and `یا` are both conjunctions and a choice needs one.',
  },
  {
    pattern: /نمایید|نمائید/gu,
    instead: 'کنید',
    why: 'The `نمودن` chain turns a simple verb into a ceremony: `بررسی نمایید` is `بررسی کنید`.',
  },
  {
    pattern: /نمایند/gu,
    instead: 'کنند',
    why: 'The same `نمودن` chain in the third person; the product writes the simple verb.',
  },
];

/** The wording checks: the sentence, and the register it is written in. */
const WORDING_CHECKS: readonly LanguageQualityCheck[] = [
  {
    id: 'wording.bookish-phrase',
    axis: 'wording',
    describe: 'A bookish construction where the product’s copy writes the plain word.',
    deterministic: false,
    // A written register may legitimately keep `در خصوص`; the product's copy does not write it.
    reading: 'user-wording',
    run: (input) => {
      const found: QualityMatch[] = [];
      for (const phrase of BOOKISH_PHRASES) {
        for (const match of phraseMatches(input.text, phrase.pattern)) {
          if (input.protects(match.index, match.index + match.found.length)) continue;
          found.push({
            index: match.index,
            found: match.found,
            instead: phrase.instead,
            reason: `${phrase.why} A judgement rather than a rule: a written register may legitimately keep it, and this product’s copy does not.`,
          });
        }
      }
      return found;
    },
  },
  {
    id: 'wording.informal',
    axis: 'wording',
    describe: 'A spoken form where the product writes the written one.',
    deterministic: false,
    // Spoken Persian is not a mistake: this is a register note, and the suite holds that a message
    // written the way somebody talks produces no `error` at all.
    reading: 'conversational',
    run: (input) => {
      const found: QualityMatch[] = [];
      for (const [spoken, written] of REGISTER_FORMS) {
        for (const index of standaloneMatches(input.text, spoken)) {
          if (input.protects(index, index + spoken.length)) continue;
          found.push({
            index,
            found: spoken,
            instead: written,
            reason: `\`${spoken}\` is how the word is said; the product writes \`${written}\`. A judgement, because a spoken form inside a quotation is somebody speaking.`,
          });
        }
      }
      return found;
    },
  },
  {
    id: 'wording.register-switch',
    axis: 'wording',
    describe: 'One text using both the spoken and the written form of the same word.',
    deterministic: false,
    reading: 'conversational',
    run: (input) => {
      const found: QualityMatch[] = [];
      for (const [spoken, written] of REGISTER_FORMS) {
        const spokenAt = standaloneMatches(input.text, spoken).filter(
          (index) => !input.protects(index, index + spoken.length),
        );
        const writtenAt = standaloneMatches(input.text, written).filter(
          (index) => !input.protects(index, index + written.length),
        );
        if (spokenAt.length === 0 || writtenAt.length === 0) continue;
        // Report the switch itself: the first occurrence of either form that comes *after* the other
        // one has already been used. One finding per pair, at the point a reader would notice the
        // change, rather than one per word.
        const firstSpoken = Math.min(...spokenAt);
        const firstWritten = Math.min(...writtenAt);
        const switchAt = Math.min(
          ...spokenAt.filter((index) => index > firstWritten),
          ...writtenAt.filter((index) => index > firstSpoken),
        );
        if (!Number.isFinite(switchAt)) continue;
        const isSpoken = spokenAt.includes(switchAt);
        found.push({
          index: switchAt,
          found: isSpoken ? spoken : written,
          instead: null,
          reason: `The text writes both \`${spoken}\` and \`${written}\`. One text keeps one register; which one is the writer's to choose, so no replacement is offered.`,
        });
      }
      return found;
    },
  },
];

/* ────────────────────────────────────────────────────────────────────────────
 * Mixed Persian and English
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * A Latin word inside a Persian sentence.
 *
 * The check reports **lower-case** Latin words and nothing else, and that shape is the whole design:
 * this product writes a symbol, a code or an acronym in capitals (`XAUUSD`, `NQ`, `ATR`, `R`) and a
 * technology under its own name with a capital (`TypeScript`, `Intl`), so a lower-case Latin word in a
 * Persian sentence is the case that is usually prose that leaked from the other language. A
 * capitalised or all-capitals token is not reported, and neither is anything inside a code span or a
 * path — that is where a literal like `npm test` legitimately lives, and `findSpans` already protects
 * it.
 */
const LATIN_WORD = new RegExp(`\\b[a-z][a-z0-9]*\\b`, 'gu');

/**
 * Any Latin token, for the recognition scan.
 *
 * The same shape as `LATIN_WORD` apart from case, and the case is the whole distinction: a lower-case
 * token is the finding, while an all-capitals or capitalised one is the terminology the report
 * *recognises* instead — see `recognisedText` below.
 */
const LATIN_TOKEN = new RegExp(`\\b[A-Za-z][A-Za-z0-9]*\\b`, 'gu');

/** A run of Persian words, so a quoted Persian phrase is one finding rather than one per word. */
const PERSIAN_RUN = new RegExp(
  `[${PERSIAN_LETTERS}][${PERSIAN_LETTERS}${ZWNJ} \\t]*[${PERSIAN_LETTERS}]|[${PERSIAN_LETTERS}]`,
  'gu',
);

/** The mixed-script checks. */
const SCRIPT_CHECKS: readonly LanguageQualityCheck[] = [
  {
    id: 'script.latin-word-in-persian',
    axis: 'script',
    describe: 'A lower-case Latin word in a text whose prose is Persian.',
    deterministic: false,
    // The word is deliberate — it is the *placement* this check is about, and the suite asserts that
    // a text with one in it produces no `error`.
    reading: 'intentional-english',
    run: (input) => {
      // Read the text first: a lower-case Latin word is a finding in Persian prose and the ordinary
      // way to write in English, and the census is what tells the two apart.
      if (dominantProse(input) !== 'persian') return [];
      const found: QualityMatch[] = [];
      for (const match of input.text.matchAll(LATIN_WORD)) {
        if (match.index === undefined) continue;
        const start = match.index;
        if (input.protects(start, start + match[0].length)) continue;
        found.push({
          index: start,
          found: match[0],
          instead: null,
          reason:
            'A Latin word in a Persian sentence. Either the sentence is about the thing and Persian has a word for it, or the token is a literal the reader is meant to type, and a literal belongs in a code span. This layer holds no lexicon, so it names the shape and not the replacement.',
        });
      }
      return found;
    },
  },
  {
    id: 'script.persian-run-in-latin',
    axis: 'script',
    describe: 'A Persian phrase in a text whose prose is written in another language.',
    deterministic: false,
    // A term being named or a phrase being quoted is the writer's own wording, not a slip.
    reading: 'user-wording',
    run: (input) => {
      if (dominantProse(input) !== 'latin') return [];
      const found: QualityMatch[] = [];
      for (const match of input.text.matchAll(PERSIAN_RUN)) {
        if (match.index === undefined) continue;
        const start = match.index;
        if (input.protects(start, start + match[0].length)) continue;
        found.push({
          index: start,
          found: match[0],
          instead: null,
          reason:
            'A Persian word or phrase in a text that is otherwise written in another language. That is right for a term being named and wrong for a word that was meant to be translated, and the difference is the writer’s to see.',
        });
      }
      return found;
    },
  },
];

/* ────────────────────────────────────────────────────────────────────────────
 * The catalogue, and the one entry point
 * ──────────────────────────────────────────────────────────────────────────── */

/** Every check, in axis order. Exported as data, so a test can require a case for each one. */
export const LANGUAGE_QUALITY_CHECKS: readonly LanguageQualityCheck[] = [
  ...GRAMMAR_CHECKS,
  ...WORDING_CHECKS,
  ...SPELLING_CHECKS,
  ...PUNCTUATION_CHECKS,
  ...SPACING_CHECKS,
  ...ZWNJ_CHECKS,
  ...SCRIPT_CHECKS,
];

/**
 * Every axis this layer reports on, each with the checks that carry it.
 *
 * Built from the axes rather than written out, because the written-out version was a second list of
 * them: adding one meant remembering this function, and a missing key would have been a `undefined`
 * push rather than a failing test.
 */
export function languageQualityChecksByAxis(): Readonly<
  Record<LanguageQualityAxis, readonly LanguageQualityCheck[]>
> {
  const byAxis = emptyAxisRecord<LanguageQualityCheck[]>();
  for (const axis of LANGUAGE_QUALITY_AXES) byAxis[axis] = [];
  for (const check of LANGUAGE_QUALITY_CHECKS) byAxis[check.axis].push(check);
  return byAxis;
}

/** A record with one entry per axis, so no axis can be forgotten and none can arrive untyped. */
function emptyAxisRecord<Value>(): Record<LanguageQualityAxis, Value> {
  return {} as Record<LanguageQualityAxis, Value>;
}

/** The compounds the product has not decided, named for a report rather than dropped in silence. */
function pendingCompounds(): string[] {
  return COMPOUND_PAIRS.filter((pair) => pair.proposed === true).map((pair) => pair.written);
}

/** How many forms of one kind a report names, before it says how many more it recognised. */
const RECOGNISED_FORMS = 8;

/** What each recognition means, in a sentence. The record is total, so a kind cannot lack one. */
const RECOGNITION_REASONS: Readonly<Record<LanguageQualityRecognitionKind, string>> = {
  terminology:
    'Written the way this product writes a symbol, a code or a technology name: capitals for a symbol, a capital for a name. Terminology rather than Persian prose, so it is not read as English spelling.',
  'intentional-english':
    'A literal the writer is meant to type as it is — a URL, a path, a dotted identifier or a code span — protected from every check, and not read as Persian.',
  'user-wording':
    'Text the caller marked as its own, or that a reviewer protected in the language store: nothing inside it is reported, by construction.',
};

/**
 * What the evaluation saw and deliberately did not report.
 *
 * A spoken form is *not* here, and that is the distinction rather than an omission: it is reported, as a
 * finding with the `conversational` reading, because a register is worth showing a writer. What is here
 * is the other side of the coin — the things a quality check would otherwise be expected to flag and
 * has decided not to, named so that the decision is visible in the report instead of silent in the code.
 */
function recognisedText(input: QualityInput): LanguageQualityRecognition[] {
  const kinds = new Map<LanguageQualityRecognitionKind, { found: string[]; more: number }>();
  const remember = (kind: LanguageQualityRecognitionKind, form: string): void => {
    const entry = kinds.get(kind) ?? { found: [], more: 0 };
    if (!entry.found.includes(form)) {
      if (entry.found.length < RECOGNISED_FORMS) entry.found.push(form);
      else entry.more += 1;
    }
    kinds.set(kind, entry);
  };

  // A symbol, a code or a name in Persian prose: the tokens the shape rule exempts by construction.
  if (dominantProse(input) === 'persian') {
    for (const match of input.text.matchAll(LATIN_TOKEN)) {
      if (match.index === undefined) continue;
      const token = match[0];
      // A lower-case word is the finding this check is for, not a recognition.
      if (token === token.toLowerCase()) continue;
      if (input.protects(match.index, match.index + token.length)) continue;
      remember('terminology', token);
    }
  }

  // The protected spans are already computed, so both remaining kinds are read rather than scanned:
  // a technical span is a literal the writer types as it is, and an exception span is somebody's own
  // text — the caller's, or a reviewer's in the store.
  for (const span of input.spans) {
    const form = input.text.slice(span.start, span.end);
    if (span.kind === 'technical') remember('intentional-english', form);
    else if (span.kind === 'exception') remember('user-wording', form);
  }

  const recognised: LanguageQualityRecognition[] = [];
  for (const [kind, entry] of kinds) {
    recognised.push({
      kind,
      found: entry.found,
      more: entry.more,
      reason: RECOGNITION_REASONS[kind],
    });
  }
  return recognised;
}

/**
 * Evaluate Persian text, and change nothing.
 *
 * The return value carries the input back in `text` so that a caller reading the report cannot
 * mistake it for corrected copy: it is the same string, and the suite asserts that on text holding
 * every defect the catalogue can find.
 */
export function evaluatePersianQuality(
  text: string,
  options: LanguageQualityOptions = {},
): LanguageQualityReport {
  const except = new Set(options.exceptChecks ?? []);
  const spans = findSpans(text, options.protectedLiterals ?? []);
  const protects = (
    start: number,
    end: number,
    kinds: readonly SpanKind[] = ['technical', 'numeric', 'exception'],
  ): boolean => overlapsSpan(spans, start, end, kinds);
  const protectsCharacter = (index: number, kinds?: readonly SpanKind[]): boolean =>
    protects(index, index + 1, kinds);
  const input: QualityInput = { text, spans, protects, protectsCharacter };

  const checks: string[] = [];
  const skippedChecks: string[] = [];
  const findings: LanguageQualityFinding[] = [];
  for (const check of LANGUAGE_QUALITY_CHECKS) {
    if (except.has(check.id)) {
      skippedChecks.push(check.id);
      continue;
    }
    checks.push(check.id);
    for (const match of check.run(input)) {
      findings.push({
        axis: check.axis,
        check: check.id,
        index: match.index,
        length: match.found.length,
        found: match.found,
        instead: match.instead,
        reason: match.reason,
        deterministic: check.deterministic,
        reading: check.reading,
      });
    }
  }

  const axisOrder = new Map(LANGUAGE_QUALITY_AXES.map((axis, index) => [axis, index]));
  findings.sort((left, right) => {
    if (left.index !== right.index) return left.index - right.index;
    return (
      (axisOrder.get(left.axis) ?? 0) - (axisOrder.get(right.axis) ?? 0) ||
      left.check.localeCompare(right.check)
    );
  });

  const counts = emptyAxisRecord<number>();
  for (const axis of LANGUAGE_QUALITY_AXES) counts[axis] = 0;
  for (const finding of findings) counts[finding.axis] += 1;

  const pending = pendingCompounds();
  return {
    input: text,
    text,
    findings,
    // The actionable subset, and the only list a surface should act on.
    errors: findings.filter((finding) => finding.reading === 'error'),
    recognised: recognisedText(input),
    counts,
    checks,
    skippedChecks,
    notEvaluated: [
      ...LANGUAGE_QUALITY_LIMITS,
      ...(pending.length === 0
        ? []
        : [
            `the compound pairs the product has not decided (${pending
              .map((form) => `\`${form}\``)
              .join(
                ', ',
              )}): the store holds them as candidates, so a text that writes one is not reported`,
          ]),
    ],
  };
}
