/**
 * The Persian normalization rule catalogue — Phase 7.5.2.1.
 *
 * What this file is
 * -----------------
 * Phase 7.5.1 answered *"are these two strings the same string?"* — an identity function over one
 * message at a time (`normalizePersianText` in `fa.ts`). This file answers a different question:
 * *"is this text written the way Persian is written?"* That is a job over mixed content, and mixed
 * content is where the naive version goes wrong: a normalizer that folds every digit in the string
 * turns `XAUUSD 3345.20` into `XAUUSD ۳۳۴۵٫۲۰`, which is a symbol and a price a reader can no longer
 * copy, paste or search.
 *
 * So every rule here is stated with three things it does not have to justify twice:
 *
 *   - **an id and a version**, so a correction can be named, cited in a test and shipped a fix for;
 *   - **a `key`** — the language-memory entry that *authorises* it (Phase 7.5.1's store). A rule whose
 *     key is not trusted knowledge does not run, which is how the code and the product's decisions
 *     cannot drift;
 *   - **a scope**, because "Persian" is not a property of a whole document. Text is a sequence of
 *     runs — Persian prose, a technical token, a figure — and the run decides the rule.
 *
 * The three contexts a rule can see
 * --------------------------------
 *   1. **Technical spans** — a URL, an email address, a path or slash token (`BTC/USDT`), a code span
 *      in backticks, a dotted identifier (`index.ts`). Inside one, nothing is rewritten, ever.
 *   2. **Numeric spans** — a figure (`3345.20`, `2026-09-19`, `1:3`, `۱۲٬۳۴۵٫۶۷`). Spacing and
 *      punctuation rules keep their hands off a figure's separators; the digit rules may touch a
 *      *bare* figure, and only when the text around it is Persian prose.
 *   3. **Prose** — everything else, where the Persian rules apply, and where a mark is folded only
 *      when the nearer of its two neighbouring letters is Persian rather than Latin.
 *
 * That third nuance is the whole reason this file exists rather than a longer `normalizePersianText`:
 * `quote, said the shell` must keep its ASCII comma, and `نسبت 1:3` must keep its colon, while
 * `قیمت ورود 3345 است` should read as Persian. Context decides, not a global flag.
 *
 * No new orthography is invented here. Every rule either cites a Unicode code point mapping, or cites
 * a sentence this project's own knowledge store holds with a reviewer's provenance — and the ones
 * that are a product decision rather than a standard name themselves as such in `seed.ts`.
 */

import type { LanguageOrigin, LanguageProposal } from './model.js';

/* ────────────────────────────────────────────────────────────────────────────
 * Spans: the parts of a string a rule is not allowed to touch
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * A run of text with a reason to be left alone.
 *
 * `exception` is the third kind for a reason: a string a *reviewer* protected, rather than one this
 * file recognised structurally. It arrives from the language memory (`kind: 'exception'`), which is
 * what makes a normalizer bug fixable by adding knowledge instead of changing code.
 */
export type SpanKind = 'technical' | 'numeric' | 'exception';

export interface Span {
  readonly start: number;
  readonly end: number;
  readonly kind: SpanKind;
}

/** The digit repertoire, spelled once, so a number is recognised whichever set it is written in. */
const DIGITS = '0-9\u06F0-\u06F9\u0660-\u0669';

/**
 * The letters, split into the two scripts whose coexistence is the whole problem.
 *
 * Exported as *class sources* rather than as ready-made regular expressions, because the callers need
 * different shapes of the same fact: this file asks "is this one character a letter", while language
 * detection counts how many of each script a message contains. A second copy of these ranges is how a
 * detector and a rule eventually disagree about what the Persian alphabet is.
 */
export const PERSIAN_LETTERS = '\u0621-\u063A\u0641-\u064A\u066E-\u06D3\u06D5\u06FA-\u06FF';
export const LATIN_LETTERS = 'A-Za-z';

/** Any letter at all — used to answer "what is this text near?". */
const LETTER = new RegExp(`[${PERSIAN_LETTERS}${LATIN_LETTERS}]`, 'u');
/** A Persian letter specifically. */
const PERSIAN_LETTER = new RegExp(`[${PERSIAN_LETTERS}]`, 'u');

/** The characters of the Arabic script, including the presentation forms NFKC decomposes. */
const ARABIC_SCRIPT_RANGES = '\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF';

/**
 * What a figure looks like, in any of the three digit repertoires.
 *
 * A separator — `. , : / - _` and CLDR's own U+066B/U+066C and U+200B — makes a token a figure rather
 * than a ran-together number, and that distinction is load-bearing: `3345.20` is a price and a ratio
 * is a ratio, but a bare `3345` in a Persian sentence is just a number in prose.
 */
const FIGURE_SEPARATORS = '\u066B\u066C\u200B.,:_/\u2013-';
const GU = 'gu';

/** Runs that are technical by structure, and therefore verbatim. */
const TECHNICAL_PATTERNS: readonly RegExp[] = [
  // A code span, which a caller marked as code.
  /`[^`\n]*`/gu,
  // A URL, with or without a scheme's slashes. The scheme itself is matched by the next pattern.
  /\b[a-z][a-z0-9+.-]*:\/\/\S+/giu,
  // An email address.
  /\b[0-9A-Za-z._%+-]+@[0-9A-Za-z.-]+\.[A-Za-z]{2,}\b/gu,
  // A path, or a token with a slash in it: `BTC/USDT`, `/usr/bin`, `src/desktop/cli.ts`.
  /\S*[/\\]\S*/gu,
  // A dotted identifier: `index.ts`, `v1.2.3`, `process-state.agreement`.
  /\b[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)+\b/gu,
];

/** Every numeric token, including its separators, so a figure can be protected as a whole. */
export const FIGURE_PATTERN = new RegExp(
  `[${DIGITS}][${DIGITS}${FIGURE_SEPARATORS}]*[${DIGITS}]|[${DIGITS}]`,
  GU,
);

/** True when the token is a bare run of digits, with no separator to make it a technical figure. */
export function isBareNumber(token: string): boolean {
  return new RegExp(`^[${DIGITS}]+$`, 'u').test(token);
}

/**
 * Where a fixed form appears as a *word* rather than as part of a longer one.
 *
 * A space is a boundary and a letter is not: `تایم فریم` is two words and must still be found, while
 * `حد سود` inside `حد سوددهی` and `درس` inside `درسی` must not be. Two details carry the weight. The
 * half-space is *part of a word* rather than a boundary, because that is what it is for — it joins
 * letters into one. And a Latin letter counts as one too, so `نماد` inside `ETFنماد` is not a match: two
 * scripts written without a boundary are one token, and separating them is the grammar layer's job, in
 * an earlier stage of the pipeline that this one runs after.
 *
 * Shared rather than written twice: the terminology check and the spelling pairs ask exactly this
 * question, and two implementations of "is this a whole word" would eventually answer differently.
 */
export function standaloneMatches(text: string, form: string, from = 0): number[] {
  if (form === '') return [];
  const wordCharacter = new RegExp(`[${PERSIAN_LETTERS}${LATIN_LETTERS}\u200C]`, 'u');
  const found: number[] = [];
  let index = text.indexOf(form, from);
  while (index !== -1) {
    const before = index === 0 ? '' : (text[index - 1] as string);
    const after = text[index + form.length];
    const startsClean = before === '' || !wordCharacter.test(before);
    const endsClean = after === undefined || !wordCharacter.test(after);
    if (startsClean && endsClean) found.push(index);
    index = text.indexOf(form, index + 1);
  }
  return found;
}

/**
 * Which repertoire the figure ending at this point is written in.
 *
 * Used by the one rule whose answer is "follow the digits": a percent sign. It walks back over the
 * figure — separators and spaces included, because `۲٫۵ %` is a typo rather than another figure — and
 * answers with the first digit it meets. No figure, no answer, and no rewrite: this decides nothing
 * about a bare `%` in prose.
 */
function figureDigits(text: string, index: number): 'persian' | 'latin' | 'arabic-indic' | null {
  for (let position = index - 1; position >= 0; position -= 1) {
    const character = text[position] as string;
    if (/[\u06F0-\u06F9]/.test(character)) return 'persian';
    if (/[0-9]/.test(character)) return 'latin';
    if (/[\u0660-\u0669]/.test(character)) return 'arabic-indic';
    if (!new RegExp(`[ \\t${FIGURE_SEPARATORS}]`, 'u').test(character)) return null;
  }
  return null;
}

/**
 * Every span in `text` that a rule must respect: the structural ones, plus the literals a reviewer
 * protected in the language store.
 *
 * A protected literal is matched as a plain substring rather than as a pattern. It comes from
 * knowledge, and knowledge is not a regex: a reviewer who writes `index.ts` into the store means
 * those eight characters, not "any character then `ndex`".
 */
export function findSpans(text: string, protectedLiterals: readonly string[] = []): Span[] {
  const spans: Span[] = [];
  for (const pattern of TECHNICAL_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) continue;
      spans.push({ start: match.index, end: match.index + match[0].length, kind: 'technical' });
    }
  }
  for (const match of text.matchAll(FIGURE_PATTERN)) {
    if (match.index === undefined) continue;
    spans.push({ start: match.index, end: match.index + match[0].length, kind: 'numeric' });
  }
  for (const literal of protectedLiterals) {
    if (literal.length === 0) continue;
    let from = text.indexOf(literal);
    while (from !== -1) {
      spans.push({ start: from, end: from + literal.length, kind: 'exception' });
      from = text.indexOf(literal, from + 1);
    }
  }
  return spans;
}

/** True when `index` falls inside a span of one of `kinds`. */
/**
 * True when any part of `[start, end)` falls inside a span of one of `kinds`.
 *
 * The one protection check the pipeline has: a rule asks this about the characters it is about to
 * replace, and the answer is what keeps a figure, a URL, a path and a reviewed exception intact.
 */
export function overlapsSpan(
  spans: readonly Span[],
  start: number,
  end: number,
  kinds: readonly SpanKind[],
): boolean {
  return spans.some((span) => kinds.includes(span.kind) && start < span.end && end > span.start);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Context: which script is this text near?
 * ──────────────────────────────────────────────────────────────────────────── */

interface FoundLetter {
  readonly character: string;
  readonly index: number;
}

/**
 * The nearest letter in one direction, skipping everything that is not a letter.
 *
 * It stops at a line break, because a new line is a new context: a figure at the end of one line and
 * a word at the start of the next are not neighbours. It does *not* stop at a space, because
 * `XAUUSD 3345` is precisely the case where the space must not hide the symbol from the figure.
 */
function nearestLetter(text: string, from: number, step: 1 | -1): FoundLetter | null {
  for (let index = from; index >= 0 && index < text.length; index += step) {
    const character = text[index] as string;
    if (character === '\n' || character === '\r') return null;
    if (LETTER.test(character)) return { character, index };
  }
  return null;
}

/**
 * True when the token at `[start, end)` sits in Persian prose.
 *
 * The nearer of the two neighbouring letters decides. A tie goes to Persian, because a bare figure in
 * the middle of a Persian sentence is the commoner case by far, and the alternative — leaving a
 * Persian sentence with one Latin number in it — is the mistake a reader notices.
 *
 * With no letter on either side there is no context, and no context means no rewrite: a caller who
 * hands this a bare `3345` gets `3345` back. Guessing would be a normalizer deciding what a string
 * *means*, which is exactly what it must not do.
 */
export function isPersianProse(text: string, start: number, end: number): boolean {
  const left = nearestLetter(text, start - 1, -1);
  const right = nearestLetter(text, end, 1);
  const leftDistance = left === null ? Number.POSITIVE_INFINITY : start - left.index;
  const rightDistance = right === null ? Number.POSITIVE_INFINITY : right.index - end + 1;
  if (leftDistance === Number.POSITIVE_INFINITY && rightDistance === Number.POSITIVE_INFINITY) {
    return false;
  }
  const nearest = leftDistance <= rightDistance ? left : right;
  return nearest !== null && PERSIAN_LETTER.test(nearest.character);
}

/* ────────────────────────────────────────────────────────────────────────────
 * The rule shape
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The kinds a rule can be, in the order the pipeline runs them.
 *
 * The first five are Phase 7.5.2.1's — how Persian is *written*. The last two are 7.5.2.3's: how a
 * Persian *sentence* is put together, and how its words are spelled. They share the machinery on
 * purpose: a grammar rule and a character fold need the same three things (a stable id, an
 * authorising key, a refusal to touch a technical span), and giving the grammar half its own engine
 * would be a second pipeline that eventually disagrees with the first.
 */
export const NORMALIZATION_RULE_KINDS = [
  'character',
  'digit',
  'spacing',
  'zwnj',
  'punctuation',
  'grammar',
  'spelling',
] as const;
export type NormalizationRuleKind = (typeof NORMALIZATION_RULE_KINDS)[number];

/**
 * How a rule is allowed to act.
 *
 * `correct` rewrites text. `report` only says what it found, and it is the honest answer wherever the
 * decision is word-level rather than mechanical: whether `می رود` should be `میرود` depends on
 * knowing that `می` is a verbal prefix and not the noun it also is, and a normalizer that guesses
 * will eventually rewrite a correct sentence. So the rule that knows the *shape* of the problem
 * reports it, and the fix waits for a reviewed entry in the language store.
 */
export type NormalizationEnforcement = 'correct' | 'report';

/** What a rule is handed: the text, and the predicate that tells it what it may not touch. */
export interface RuleInput {
  readonly text: string;
  /** True when the character at `index` is inside a span this rule must not edit. */
  readonly protects: (index: number) => boolean;
  /** The spans themselves, for a rule that needs to reason about a whole figure or token. */
  readonly spans: readonly Span[];
}

/**
 * A single, exact edit: replace `[start, end)` with `after`.
 *
 * An insertion is `start === end`. Nothing is expressed as a rewritten string, so a rule cannot
 * quietly reformat text it was not asked about, and the report can name every change with the exact
 * characters it replaced. That is what makes a correction reviewable rather than magic.
 */
export interface RuleEdit {
  readonly start: number;
  readonly end: number;
  readonly after: string;
}

/** Something a rule found and deliberately did not change. */
export interface NormalizationFinding {
  readonly rule: string;
  readonly key: string;
  readonly index: number;
  readonly match: string;
  readonly suggestion: string;
  readonly reason: string;
}

export interface NormalizationRule {
  /** Stable id, `<kind>.<what it does>`: cited in tests, in the report and in a review. */
  readonly id: string;
  /** The version of this rule's *definition*. A behaviour change bumps it. */
  readonly version: number;
  /** The language-memory key that authorises the rule. Without a trusted entry, it does not run. */
  readonly key: string;
  readonly kind: NormalizationRuleKind;
  /** What the rule does, in one sentence, for a report a human reads. */
  readonly describe: string;
  readonly enforcement: NormalizationEnforcement;
  /** The span kinds this rule refuses to edit inside. */
  readonly protectedKinds: readonly SpanKind[];
  readonly correct?: (input: RuleInput) => RuleEdit[];
  readonly detect?: (input: RuleInput) => NormalizationFinding[];
}

/**
 * A rule that also carries the knowledge it stands for.
 *
 * Phase 7.5.2.3's grammar and spelling rules are each a *decision* about the language, and a decision
 * has to be able to say what it is, how it was reached, and what it does not cover — so the extra four
 * fields are the sentence stored in the language store, the reasoning a reviewer reads, the examples
 * that make it checkable, and how sure the project is. The runner ignores all of them; only the seed
 * and the report read them.
 *
 * `origin` is on the rule rather than in the seed so a rule can be *shipped as a candidate*: an
 * `agent-proposal` entry is parked as `pending`, which means the rule exists, is visible, and does
 * nothing until a reviewer accepts it. That is the learnable path of this phase, and it needs no
 * schema of its own — the store already has one.
 */
export interface LanguageRule extends NormalizationRule {
  /** The sentence stored as the entry's value. */
  readonly value: string;
  /** How the decision was reached, and what it deliberately does not cover. */
  readonly notes: string;
  readonly examples: readonly string[];
  readonly confidence: number;
  readonly origin: LanguageOrigin;
}

/**
 * A rule list as proposals for the language store — one entry per rule.
 *
 * Derived rather than written twice, for the same reason the lexicon's entries are: a decision lives in
 * one place, the store owns its trust and its versions, and the two cannot drift.
 */
export function languageRuleProposals(
  rules: readonly LanguageRule[],
  recordedAt: string,
  reference: string,
): readonly LanguageProposal[] {
  return rules.map((rule) => ({
    key: rule.key,
    kind: rule.kind === 'spelling' ? ('orthography' as const) : ('rule' as const),
    value: rule.value,
    origin: rule.origin,
    reference,
    recordedAt,
    baseVersion: 0,
    confidence: rule.confidence,
    examples: [...rule.examples],
    mapping: null,
    notes: rule.notes,
  }));
}

/* ────────────────────────────────────────────────────────────────────────────
 * Rule helpers — so a rule is one line of intent, not five of index arithmetic
 * ──────────────────────────────────────────────────────────────────────────── */

/** Every match of `pattern`, as edits, skipping any that touch a protected span. */
function editsForMatches(
  input: RuleInput,
  pattern: RegExp,
  replace: (token: string, match: RegExpMatchArray) => string | null,
): RuleEdit[] {
  const edits: RuleEdit[] = [];
  for (const match of input.text.matchAll(pattern)) {
    if (match.index === undefined) continue;
    const start = match.index;
    const end = start + match[0].length;
    if (input.protects(start) || input.protects(end - 1)) continue;
    const after = replace(match[0], match);
    if (after === null || after === match[0]) continue;
    edits.push({ start, end, after });
  }
  return edits;
}

/** Fold a set of characters onto one replacement, or remove them when the replacement is empty. */
function foldCharacters(replacement: string) {
  return (input: RuleInput, characters: string): RuleEdit[] =>
    editsForMatches(input, new RegExp(`[${characters}]`, GU), () => replacement);
}

/** Remove every character in a set. */
function removeCharacters(input: RuleInput, characters: string): RuleEdit[] {
  return editsForMatches(input, new RegExp(`[${characters}]`, GU), () => '');
}

/** Rewrite every digit of one repertoire into another, inside each token that is bare Persian prose. */
function foldDigitsInProse(from: string, to: string) {
  return (input: RuleInput): RuleEdit[] => {
    const edits: RuleEdit[] = [];
    for (const match of input.text.matchAll(FIGURE_PATTERN)) {
      if (match.index === undefined) continue;
      const start = match.index;
      const end = start + match[0].length;
      if (input.protects(start)) continue;
      // A figure with a separator is a *technical* figure — a price, a timestamp, a ratio. It keeps
      // the characters a reader types, whichever script the sentence around it is in.
      if (!isBareNumber(match[0])) continue;
      if (!isPersianProse(input.text, start, end)) continue;
      const after = match[0].replace(new RegExp(`[${from}]`, GU), (digit) => {
        const index = from.indexOf(digit);
        return index === -1 ? digit : (to[index] ?? digit);
      });
      if (after !== match[0]) edits.push({ start, end, after });
    }
    return edits;
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * The catalogue
 * ──────────────────────────────────────────────────────────────────────────── */

/** U+064A ARABIC LETTER YEH and U+0649 ALEF MAKSURA → U+06CC FARSI YEH. */
const ARABIC_YEHS = '\u064A\u0649';
/** U+0643 ARABIC LETTER KAF → U+06A9 KEHEH. */
const ARABIC_KAF = '\u0643';
/** U+06AA SWASH KAF and U+06AB KAF WITH RING: kaf variants Persian does not write. */
const KAF_VARIANTS = '\u06AA\u06AB';
/** U+0640 TATWEEL. */
const TATWEEL = '\u0640';
/** U+064B–U+0652, the Arabic vowel marks, and U+0670, the superscript alef. */
const HARAKAT = '\u064B-\u0652\u0670';
/** U+200C ZERO WIDTH NON-JOINER. */
const ZWNJ = '\u200C';
/** The Persian prose marks: U+060C, U+061B, U+061F and U+066A. */
const PERSIAN_MARKS = '\u060C\u061B\u061F\u066A';

/**
 * The plural plus a pronoun or the indefinite `ی`, which is where the half-space is missed most often.
 *
 * Exported because it is a decision with a source rather than a private detail of the rule below. The
 * inventory is Parsivar's published rule-based half-space table (`normalizer.space_correction`) — the one
 * project of the five evaluated that publishes its affixes rather than learning them; Hazm and DadmaTools
 * do the same class of correction but document the capability instead of the table. The evaluation that
 * adopted it, and what it left out, is recorded in `docs/persian-language.md`. Every entry here is
 * `ها` with a clitic after it, so none of them is ever a word of its own, which is what makes the rule
 * that reads it safe to run over text nobody asked about. The list is ordered longest-first so the match
 * does not depend on backtracking: `ها` alone is deliberately **not** here, because `zwnj.attach-candidate`
 * already reports it and two rules reporting one span would read as two mistakes.
 */
export const ZWNJ_CLITIC_FORMS: readonly string[] = [
  '\u0647\u0627\u06CC\u0645\u0627\u0646',
  '\u0647\u0627\u06CC\u062A\u0627\u0646',
  '\u0647\u0627\u06CC\u0634\u0627\u0646',
  '\u0647\u0627\u06CC\u06CC',
  '\u0647\u0627\u06CC\u0645',
  '\u0647\u0627\u06CC\u062A',
  '\u0647\u0627\u06CC\u0634',
];

/**
 * The rules, in the order they run.
 *
 * The order is a contract, not an accident: the character folds happen first so every later rule sees
 * one spelling of the text; the punctuation folds happen before the spacing rules, so `پرسش?` becomes
 * `پرسش؟` and *then* gets its space; and the ZWNJ rules run before the spacing rules, so a ZWNJ that
 * goes away does not leave the space that was meant to replace it.
 */
export const NORMALIZATION_RULES: readonly NormalizationRule[] = [
  {
    id: 'character.presentation-forms',
    version: 1,
    key: 'orthography.arabic-presentation-forms',
    kind: 'character',
    describe:
      'Arabic-script text is folded to its canonical compatibility form (NFKC), so a presentation form and its base letters become one string.',
    enforcement: 'correct',
    protectedKinds: ['technical', 'exception'],
    correct: (input) => {
      const edits: RuleEdit[] = [];
      const pattern = new RegExp(`[${ARABIC_SCRIPT_RANGES}]+`, GU);
      for (const match of input.text.matchAll(pattern)) {
        if (match.index === undefined) continue;
        const start = match.index;
        const end = start + match[0].length;
        // NFKC is scoped to the Arabic script on purpose. Applied to the whole string it would also
        // rewrite Latin compatibility characters — full-width digits, the `fi` ligature — which is a
        // change to English text that this phase has no reason to make.
        if (input.protects(start)) continue;
        const folded = match[0].normalize('NFKC');
        if (folded !== match[0]) edits.push({ start, end, after: folded });
      }
      return edits;
    },
  },
  {
    id: 'character.farsi-yeh',
    version: 1,
    key: 'orthography.farsi-yeh',
    kind: 'character',
    describe: 'The Arabic yeh and alef maksura are folded to the Persian yeh U+06CC.',
    enforcement: 'correct',
    protectedKinds: ['technical', 'exception'],
    correct: (input) => foldCharacters('\u06CC')(input, ARABIC_YEHS),
  },
  {
    id: 'character.farsi-keheh',
    version: 1,
    key: 'orthography.farsi-keheh',
    kind: 'character',
    describe: 'The Arabic kaf is folded to the Persian keheh U+06A9.',
    enforcement: 'correct',
    protectedKinds: ['technical', 'exception'],
    correct: (input) => foldCharacters('\u06A9')(input, ARABIC_KAF),
  },
  {
    id: 'character.kaf-variants',
    version: 1,
    key: 'orthography.kaf-variants',
    kind: 'character',
    describe: 'Swash kaf and kaf with ring are folded to the Persian keheh.',
    enforcement: 'correct',
    protectedKinds: ['technical', 'exception'],
    correct: (input) => foldCharacters('\u06A9')(input, KAF_VARIANTS),
  },
  {
    id: 'character.tatweel-removed',
    version: 1,
    key: 'orthography.tatweel-removed',
    kind: 'character',
    describe: 'TATWEEL, a justification device with no orthographic content, is removed.',
    enforcement: 'correct',
    protectedKinds: ['technical', 'exception'],
    correct: (input) => removeCharacters(input, TATWEEL),
  },
  {
    id: 'character.harakat-removed',
    version: 1,
    key: 'orthography.harakat-removed',
    kind: 'character',
    describe: 'The Arabic vowel marks U+064B–U+0652 and the superscript alef U+0670 are removed.',
    enforcement: 'correct',
    protectedKinds: ['technical', 'exception'],
    correct: (input) => removeCharacters(input, HARAKAT),
  },
  {
    id: 'digit.arabic-indic-to-persian',
    version: 1,
    key: 'orthography.arabic-indic-digits',
    kind: 'digit',
    describe:
      'A bare figure in Persian prose written with Arabic-Indic digits is folded to the Persian set.',
    enforcement: 'correct',
    // Not `numeric`: the rule is *about* a figure, and it decides per token whether the figure is
    // prose or technical. A technical span still wins, so an Arabic-Indic digit inside a URL or a
    // path is left exactly as it was.
    protectedKinds: ['technical', 'exception'],
    correct: foldDigitsInProse(
      '\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669',
      '\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9',
    ),
  },
  {
    id: 'digit.latin-in-prose',
    version: 1,
    key: 'rule.prose-digits-follow-the-nearest-letter',
    kind: 'digit',
    describe:
      'A bare figure in Persian prose is written with Persian digits; a figure carrying a separator stays technical and Latin.',
    enforcement: 'correct',
    protectedKinds: ['technical', 'exception'],
    correct: foldDigitsInProse(
      '0123456789',
      '\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9',
    ),
  },
  {
    id: 'punctuation.persian-marks',
    version: 1,
    key: 'rule.persian-punctuation',
    kind: 'punctuation',
    describe: 'A comma, semicolon or question mark in Persian prose becomes its Persian mark.',
    enforcement: 'correct',
    protectedKinds: ['technical', 'numeric', 'exception'],
    correct: (input) => {
      const edits: RuleEdit[] = [];
      // One class for the three marks, because they need no escaping inside it and building a pattern
      // per mark by hand is how a `?` ends up as a quantifier.
      const marks: Record<string, string> = { ',': '\u060C', ';': '\u061B', '?': '\u061F' };
      for (const match of input.text.matchAll(/[,;?]/gu)) {
        if (match.index === undefined) continue;
        if (input.protects(match.index)) continue;
        if (!isPersianProse(input.text, match.index, match.index + 1)) continue;
        edits.push({
          start: match.index,
          end: match.index + 1,
          after: marks[match[0]] ?? match[0],
        });
      }
      return edits;
    },
  },
  {
    id: 'punctuation.persian-percent',
    version: 1,
    key: 'rule.persian-punctuation',
    kind: 'punctuation',
    describe:
      'The percent sign follows its figure: a figure in Persian digits takes U+066A, and a figure in Latin digits keeps the ASCII sign.',
    enforcement: 'correct',
    protectedKinds: ['technical', 'numeric', 'exception'],
    // CLDR settles this one, and unambiguously: `fa-IR` percent formatting emits U+066A beside
    // Persian digits, and `fa-IR-u-nu-latn` emits `%` beside Latin ones. So the sign belongs to the
    // figure rather than to the sentence — which is also the only version of this rule that cannot
    // produce `2.5٪`, a figure written in two scripts at once.
    correct: (input) =>
      editsForMatches(input, /%/gu, (_token, match) =>
        figureDigits(input.text, match.index ?? 0) === 'persian' ? '\u066A' : null,
      ),
  },
  {
    id: 'zwnj.collapse-runs',
    version: 1,
    key: 'rule.zwnj-hygiene',
    kind: 'zwnj',
    describe: 'A run of ZWNJ characters collapses to one.',
    enforcement: 'correct',
    protectedKinds: ['technical', 'exception'],
    correct: (input) => editsForMatches(input, /\u200C{2,}/gu, () => ZWNJ),
  },
  {
    id: 'zwnj.drop-beside-space',
    version: 1,
    key: 'rule.zwnj-hygiene',
    kind: 'zwnj',
    describe: 'A ZWNJ beside a space joins nothing, so it goes and the space stays.',
    enforcement: 'correct',
    protectedKinds: ['technical', 'exception'],
    correct: (input) => editsForMatches(input, /[ \t]\u200C|\u200C[ \t]/gu, () => ' '),
  },
  {
    id: 'zwnj.drop-at-edges',
    version: 1,
    key: 'rule.zwnj-hygiene',
    kind: 'zwnj',
    describe: 'A ZWNJ at the start or end of a text joins nothing, so it goes.',
    enforcement: 'correct',
    protectedKinds: ['technical', 'exception'],
    correct: (input) => editsForMatches(input, /^\u200C+|\u200C+$/gu, () => ''),
  },
  {
    id: 'spacing.collapse-horizontal-runs',
    version: 1,
    key: 'rule.persian-spacing',
    kind: 'spacing',
    describe: 'A run of two or more spaces or tabs collapses to one space.',
    enforcement: 'correct',
    protectedKinds: ['technical', 'numeric', 'exception'],
    // Newlines are structure, not spacing, and so is indentation: a run that *begins* a line is where
    // the line starts, not a typo, and collapsing it would quietly destroy the layout of a pasted
    // block. This rule only ever touches horizontal runs inside a line.
    correct: (input) => {
      const edits: RuleEdit[] = [];
      for (const match of input.text.matchAll(/[ \t]{2,}/gu)) {
        if (match.index === undefined) continue;
        const start = match.index;
        const end = start + match[0].length;
        if (input.protects(start) || input.protects(end - 1)) continue;
        if (start === 0 || input.text[start - 1] === '\n') continue;
        edits.push({ start, end, after: ' ' });
      }
      return edits;
    },
  },
  {
    id: 'spacing.trim-line-trailing',
    version: 1,
    key: 'rule.persian-spacing',
    kind: 'spacing',
    describe: 'Whitespace at the end of a line is removed.',
    enforcement: 'correct',
    protectedKinds: ['technical', 'numeric', 'exception'],
    correct: (input) => editsForMatches(input, /[ \t]+(?=\r?\n)/gu, () => ''),
  },
  {
    id: 'spacing.no-space-before-mark',
    version: 1,
    key: 'rule.persian-spacing',
    kind: 'spacing',
    describe: 'A space before a punctuation mark is removed.',
    enforcement: 'correct',
    protectedKinds: ['technical', 'numeric', 'exception'],
    correct: (input) =>
      editsForMatches(input, new RegExp(`[ \\t]+(?=[${PERSIAN_MARKS}.,;:!?%])`, GU), () => ''),
  },
  {
    id: 'spacing.one-space-after-mark',
    version: 1,
    key: 'rule.persian-spacing',
    kind: 'spacing',
    describe: 'A sentence mark followed immediately by a letter gets exactly one space.',
    enforcement: 'correct',
    protectedKinds: ['technical', 'numeric', 'exception'],
    correct: (input) =>
      editsForMatches(
        input,
        // Only a sentence mark *between letters*: a dot between digits is a decimal point, a dot
        // inside an identifier is a filename, and neither of them ends a sentence.
        new RegExp(
          `(?<=[${PERSIAN_LETTERS}${LATIN_LETTERS}])([${PERSIAN_MARKS}.!?])(?=[${PERSIAN_LETTERS}])`,
          GU,
        ),
        (_token, match) => `${match[1] ?? ''} `,
      ),
  },
  {
    id: 'zwnj.attach-candidate',
    version: 1,
    key: 'rule.zwnj-placement',
    kind: 'zwnj',
    describe:
      'A space where Persian writes a half-space is reported: a verbal prefix or a plural/degree suffix separated from its word.',
    enforcement: 'report',
    protectedKinds: ['technical', 'numeric', 'exception'],
    detect: (input) => {
      const findings: NormalizationFinding[] = [];
      const reasons: string =
        'Persian writes this with a half-space (U+200C), not a space. It is reported rather than fixed because the same letter sequence is also a word of its own, and a reviewed rule is what decides.';
      // The verbal prefixes: `می` and `نمی` attach to the word that follows them.
      const prefix = new RegExp(
        `(?:^|[\\s${PERSIAN_MARKS}])(\u0646\u0645\u06CC|\u0645\u06CC)([ \\t]+)(?=[${PERSIAN_LETTERS}])`,
        GU,
      );
      for (const match of input.text.matchAll(prefix)) {
        // The report points at the prefix itself rather than at whatever preceded it, so a caller
        // can highlight the finding on the text it was given.
        const start =
          (match.index ?? 0) + match[0].length - (match[1]?.length ?? 0) - (match[2]?.length ?? 0);
        if (input.protects(start)) continue;
        findings.push({
          rule: 'zwnj.attach-candidate',
          key: 'rule.zwnj-placement',
          index: start,
          match: `${match[1]}${match[2]}`,
          suggestion: `${match[1]}${ZWNJ}`,
          reason: reasons,
        });
      }
      // The suffixes: a plural or comparative ending written as a separate word.
      const suffix = new RegExp(
        `(?<=[${PERSIAN_LETTERS}])[ \\t]+(\u0647\u0627|\u0647\u0627\u06CC|\u062A\u0631|\u062A\u0631\u06CC\u0646)(?![${PERSIAN_LETTERS}])`,
        GU,
      );
      for (const match of input.text.matchAll(suffix)) {
        const start = match.index ?? 0;
        if (input.protects(start)) continue;
        findings.push({
          rule: 'zwnj.attach-candidate',
          key: 'rule.zwnj-placement',
          index: start,
          match: match[0],
          suggestion: `${ZWNJ}${match[1]}`,
          reason: reasons,
        });
      }
      return findings;
    },
  },
  {
    id: 'zwnj.clitic-candidate',
    version: 1,
    key: 'rule.zwnj-clitics',
    kind: 'zwnj',
    describe:
      'A space before a clitic of the plural — the plural with a pronoun or the indefinite `ی` after it — is reported.',
    enforcement: 'report',
    protectedKinds: ['technical', 'numeric', 'exception'],
    detect: (input) => {
      const findings: NormalizationFinding[] = [];
      // The clitics, longest first. `ها` and `های` are deliberately absent: `zwnj.attach-candidate` above
      // already reports those two, and a second rule reporting one span would make one mistake read as two.
      const pattern = new RegExp(
        `(?<=[${PERSIAN_LETTERS}])[ \\t]+(${ZWNJ_CLITIC_FORMS.join('|')})(?![${PERSIAN_LETTERS}])`,
        GU,
      );
      for (const match of input.text.matchAll(pattern)) {
        const start = match.index ?? 0;
        if (input.protects(start)) continue;
        findings.push({
          rule: 'zwnj.clitic-candidate',
          key: 'rule.zwnj-clitics',
          index: start,
          match: match[0],
          suggestion: `${ZWNJ}${match[1]}`,
          reason:
            'The plural with a clitic after it is one word in Persian and is written with a half-space (U+200C), never a space. Reported rather than fixed because this phase reports the placement half of the half-space question and corrects only the hygiene half.',
        });
      }
      return findings;
    },
  },
  {
    id: 'digit.persian-digits-in-technical-run',
    version: 1,
    key: 'rule.technical-figures-stay-latin',
    kind: 'digit',
    describe:
      'A figure sitting next to a technical token is reported when it carries Persian digits, because that side of the interface reads in Latin digits.',
    enforcement: 'report',
    protectedKinds: ['exception'],
    detect: (input) => {
      const findings: NormalizationFinding[] = [];
      for (const match of input.text.matchAll(FIGURE_PATTERN)) {
        if (match.index === undefined) continue;
        const start = match.index;
        const end = start + match[0].length;
        if (!/[\u06F0-\u06F9]/.test(match[0])) continue;
        if (input.protects(start)) continue;
        if (isPersianProse(input.text, start, end)) continue;
        findings.push({
          rule: 'digit.persian-digits-in-technical-run',
          key: 'rule.technical-figures-stay-latin',
          index: start,
          match: match[0],
          suggestion: match[0].replace(/[\u06F0-\u06F9]/g, (digit) =>
            String.fromCharCode(digit.charCodeAt(0) - 0x06f0 + 0x30),
          ),
          reason:
            'A price, a timestamp or an instrument readout keeps Latin digits; a reader copying it expects the characters they type.',
        });
      }
      return findings;
    },
  },
];

/** The rule with this id, for a caller that wants to name one. */
export function normalizationRule(id: string): NormalizationRule | undefined {
  return NORMALIZATION_RULES.find((rule) => rule.id === id);
}

/** Every distinct language-memory key the catalogue depends on. */
export function normalizationRuleKeys(): string[] {
  return [...new Set(NORMALIZATION_RULES.map((rule) => rule.key))].sort();
}
