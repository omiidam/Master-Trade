/**
 * The Persian locale foundation — fa-IR.
 *
 * What this module is for
 * -----------------------
 * Everything the interface needs in order to *speak* Persian correctly, in one place, with Unicode
 * and CLDR as the authority rather than somebody's memory of Persian typing:
 *
 *   - **Character normalization** (`normalizePersianText`) — the folds that make two visually
 *     identical strings the same string: the Arabic yeh and kaf onto their Persian letters, the
 *     Arabic presentation forms onto their base letters, the Arabic-Indic digits onto the Persian
 *     set, and the removal of the marks Persian does not write. It is an *identity* pass over one
 *     string; the content pipeline that corrects mixed Persian and technical text is `normalize.ts`,
 *     and the difference between the two is deliberate — see both contracts below.
 *   - **Digits in both directions** (`toPersianDigits`, `toLatinDigits`) — because a Persian reader
 *     wants ۳۳۴۵ in prose and a machine, a clipboard and a search box want 3345.
 *   - **Separators, punctuation and numbering** as *constants* (`PERSIAN_DECIMAL_SEPARATOR` and
 *     friends), each one checked against CLDR in the test suite rather than typed from a blog post.
 *   - **Dates, times, currency, percentages and relative time** (`formatFa*`) — all through `Intl`
 *     with the locale's own numbering and the Persian calendar made explicit.
 *   - **Bidi isolation** (`latinRun`, `persianRun`, `isolateBidi`) — the Unicode isolate mechanism
 *     for mixed Persian + Latin text, which is what a trading interface full of `XAUUSD` in a Persian
 *     sentence actually needs.
 *   - **ZWNJ** — `ZWNJ`, `hasZwnj`, `stripZwnj`. The default is *preservation*, and the one function
 *     that removes it says out loud that it is for search keys.
 *
 * The three rules this module holds itself to
 * -------------------------------------------
 *   1. **No invented orthography.** Every fold here is a documented Unicode code-point mapping, and
 *      the rules the normalizer applies are stored as data in `seed.ts` with their provenance. Where
 *      a decision is this product's rather than Unicode's — which ranges of marks to drop — the
 *      decision is named, its edges are stated, and it carries `human-review` provenance instead of
 *      being smuggled in as a "standard".
 *   2. **Nothing here is hand-rolled that CLDR already answers.** Separators, the percent sign, the
 *      calendar, digit shapes, relative-time wording and plural categories all come from `Intl`.
 *      The only strings this file hard-codes are the ones it *asserts* against CLDR in the suite.
 *   3. **English is untouched.** Not one function here is on an existing code path: the interface's
 *      own formatters (`web/src/lib/format.ts`, `portfolio/labels.ts`) keep their behaviour, and
 *      nothing in this module is a re-implementation of them. Duplicating `formatMoney` in Persian
 *      would immediately reproduce the project it belongs to, with two number conventions instead of
 *      one — so `formatFa*` is a sibling, not a replacement, and the suite proves the English side
 *      still formats exactly as it did.
 *
 * A deliberate non-goal: translating the interface. That is Phase 7.5.2, and this file contains no
 * product copy — only the machinery that copy will be rendered with.
 */

/** The locale this module speaks. It is the only argument the formatters ever assume. */
export const PERSIAN_LOCALE = 'fa-IR';

/** The two digit repertoires a Persian surface legitimately needs. */
export type FaDigits = 'persian' | 'latin';

/* ────────────────────────────────────────────────────────────────────────────
 * Code points
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The digit sets, in order, so a mapping is an index lookup rather than ten comparisons.
 *
 * `PERSIAN_DIGITS` is U+06F0–U+06F9 (Unicode's *Extended* Arabic-Indic digits, which are the ones
 * Persian uses) and `ARABIC_INDIC_DIGITS` is U+0660–U+0669 (the ones Arabic uses). They look almost
 * identical at interface sizes and are different characters, which is why the fold exists.
 */
const LATIN_DIGITS = '0123456789';
export const PERSIAN_DIGITS = '\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9';
export const ARABIC_INDIC_DIGITS = '\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669';

/**
 * The separators and punctuation CLDR gives `fa-IR`.
 *
 * Spelled with the escape rather than the character, because U+066B `٫` and U+066C `٬` are
 * indistinguishable from a comma and an apostrophe in most editors — and because a reader of this
 * file should be able to check each one against the Unicode code chart without a hex viewer. The
 * suite asserts every constant here equals what `Intl.NumberFormat('fa-IR')` actually emits, so
 * these are *recorded* facts about CLDR rather than this file's opinion.
 */
export const PERSIAN_DECIMAL_SEPARATOR = '\u066B';
export const PERSIAN_GROUP_SEPARATOR = '\u066C';
export const PERSIAN_PERCENT_SIGN = '\u066A';

/** Persian prose punctuation. Figures keep their ASCII separators; sentences do not. */
export const PERSIAN_PUNCTUATION = {
  comma: '\u060C',
  semicolon: '\u061B',
  questionMark: '\u061F',
  percent: PERSIAN_PERCENT_SIGN,
} as const;

/**
 * The zero-width non-joiner, and the two bidi controls.
 *
 * ZWNJ is not whitespace and not a decoration: in Persian it is the difference between `میرود`
 * ("goes", a single word) and `میرود`. Nothing in this module removes it by accident.
 *
 * LRI/RLI/PDI are Unicode's *isolate* controls (UAX #9): the modern replacement for the deprecated
 * LRE/RLE/PDF embeddings. An isolate gives the run inside it its own bidi context without disturbing
 * the surrounding paragraph, which is exactly the problem a `XAUUSD` or a `-1.00R` poses inside a
 * Persian sentence.
 */
export const ZWNJ = '\u200C';
export const BIDI_CONTROLS = {
  leftToRightIsolate: '\u2066',
  rightToLeftIsolate: '\u2067',
  firstStrongIsolate: '\u2068',
  popDirectionalIsolate: '\u2069',
} as const;

/**
 * The Arabic script, for the compatibility fold below.
 *
 * Scoped rather than applied to the whole string, because NFKC is a *text-wide* operation by nature:
 * run it over Latin text and it happily rewrites full-width digits and the `fi` ligature, which is a
 * change to English this phase has no reason to make (Phase 7.5.2.1 explains the same choice in
 * `rules.ts`).
 */
const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+/gu;

/**
 * The Arabic letters that Persian does not write, and their Persian counterparts.
 *
 * `\u06AA` and `\u06AB` are the two kaf variants — SWASH KAF and KAF WITH RING — added in Phase
 * 7.5.2.1. They are the one pair here that Unicode keeps as distinct letters rather than spelling as
 * a form of another, so this fold is a product decision stated as `orthography.kaf-variants` in
 * `seed.ts`, not a Unicode mapping. It can be retired by deprecating that entry.
 */
const LETTER_FOLDS: readonly (readonly [string, string])[] = [
  // ARABIC LETTER YEH and ARABIC LETTER ALEF MAKSURA → ARABIC LETTER FARSI YEH.
  ['\u064A', '\u06CC'],
  ['\u0649', '\u06CC'],
  // ARABIC LETTER KAF → ARABIC LETTER KEHEH.
  ['\u0643', '\u06A9'],
  // ARABIC LETTER SWASH KAF and ARABIC LETTER KAF WITH RING → ARABIC LETTER KEHEH.
  ['\u06AA', '\u06A9'],
  ['\u06AB', '\u06A9'],
];

/**
 * The marks that are removed, as ranges and singles.
 *
 * U+064B–U+0652 are the Arabic vowel marks (tanwin and harakat) and U+0670 is the superscript alef,
 * none of which Persian orthography writes. U+0653–U+0655 — the *combining* hamza and madda — are
 * deliberately **not** in this list: a decomposed Persian letter can legitimately be built from them,
 * so removing them would change a letter rather than a vowel mark. This is the one judgement call in
 * the file and it is recorded with its edges as `orthography.harakat-removed` in `seed.ts`.
 */
const REMOVED_MARKS: readonly (readonly [string, string])[] = [
  ['\u064B', '\u0652'],
  ['\u0670', '\u0670'],
];

/** TATWEEL, the connection lengthener: purely a justification device, no word meaning. */
const TATWEEL = '\u0640';

/* ────────────────────────────────────────────────────────────────────────────
 * Digits
 * ──────────────────────────────────────────────────────────────────────────── */

/** Rewrite every digit in a string into the Persian set. */
export function toPersianDigits(input: string): string {
  return mapDigits(input, PERSIAN_DIGITS);
}

/**
 * Rewrite every digit in a string into ASCII.
 *
 * Both non-Latin sets are folded, so this is the function a search box, a copy-to-clipboard or a
 * parser calls when it needs the number a Persian reader typed.
 */
export function toLatinDigits(input: string): string {
  return mapDigits(input, LATIN_DIGITS);
}

/** The shared digit mapping: one `replace` over the union of both non-Latin sets. */
function mapDigits(input: string, target: string): string {
  return input.replace(/[0-9\u06F0-\u06F9\u0660-\u0669]/g, (character) => {
    const index = digitIndex(character);
    return index === -1 ? character : (target[index] ?? character);
  });
}

/** Where a digit sits in the 0–9 ladder, whichever of the three repertoires it came from. */
function digitIndex(character: string): number {
  const latin = LATIN_DIGITS.indexOf(character);
  if (latin !== -1) return latin;
  const persian = PERSIAN_DIGITS.indexOf(character);
  if (persian !== -1) return persian;
  return ARABIC_INDIC_DIGITS.indexOf(character);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Normalization
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Fold a Persian string onto one spelling of itself.
 *
 * This is an *identity* operation, not a display one: two strings that a reader sees as the same
 * word should compare equal, hash equal and match in a search index. So it folds the Arabic letters
 * Persian never writes, the Arabic presentation forms onto their base letters (Unicode NFKC, scoped
 * to the Arabic script), the Arabic-Indic digits, the marks and the tatweel — and it **keeps** the
 * ZWNJ, the digits that are already Persian, and anything Latin.
 *
 * Two things are worth saying about the digits, because Phase 7.5.2.1 sharpened the question. This
 * function folds *every* digit it finds, Latin ones included, because its caller is asking whether
 * two strings are the same string and a number written in Persian digits is the same number. What it
 * is **not** is a display pass: a figure that must stay `3345.20` is the business of
 * `normalizePersianContent` in `normalize.ts`, which decides per figure by asking what the text
 * around it is. The split matters — running this one over `XAUUSD 3345.20` to "tidy" a screen would
 * corrupt a price, and it is the reason the two functions exist rather than one with a flag.
 *
 * Idempotent by construction: every rule maps onto a value the rules leave alone, which the suite
 * asserts rather than assumes.
 */
export function normalizePersianText(input: string): string {
  let output = input.replace(ARABIC_SCRIPT, (run) => run.normalize('NFKC'));
  for (const [from, to] of LETTER_FOLDS) {
    output = output.split(from).join(to);
  }
  output = output.split(TATWEEL).join('');
  for (const [from, to] of REMOVED_MARKS) {
    output = removeRange(output, from, to);
  }
  return trimZwnjEdges(mapDigits(output, PERSIAN_DIGITS));
}

/** Remove every code point between two bounds inclusive, as a single pass. */
function removeRange(input: string, from: string, to: string): string {
  const low = from.codePointAt(0) ?? 0;
  const high = to.codePointAt(0) ?? 0;
  let output = '';
  for (const character of input) {
    const point = character.codePointAt(0) ?? 0;
    if (point < low || point > high) output += character;
  }
  return output;
}

/* ────────────────────────────────────────────────────────────────────────────
 * ZWNJ
 * ──────────────────────────────────────────────────────────────────────────── */

/** True when the text uses the zero-width non-joiner — a fact worth asserting, not removing. */
export function hasZwnj(input: string): boolean {
  return input.includes(ZWNJ);
}

/**
 * Remove every ZWNJ. **For search keys and only for search keys.**
 *
 * Named to be hard to reach for by accident, because the one thing a ZWNJ must never do is disappear
 * from text a reader is looking at: `میرود` and `میرود` are different words and one of them is
 * wrong. A comparison key — a duplicate check, an index, a lookup — wants the letters only, and it
 * says so by calling this.
 */
export function stripZwnj(input: string): string {
  return input.split(ZWNJ).join('');
}

/**
 * Drop a ZWNJ that is doing no work: one at either end of the string, or one beside a space.
 *
 * This is the only ZWNJ edit the normalizer makes, and it is not an orthographic claim: a ZWNJ
 * *joins two letters*, so next to a space or at an edge there is nothing for it to join. Every
 * interior ZWNJ — the ones that carry meaning — is left exactly where it was.
 */
export function trimZwnjEdges(input: string): string {
  return input
    .replace(new RegExp(`^(${ZWNJ})+`, 'u'), '')
    .replace(new RegExp(`(${ZWNJ})+$`, 'u'), '')
    .replace(new RegExp(`(${ZWNJ})+\\s`, 'gu'), ' ')
    .replace(new RegExp(`\\s(${ZWNJ})+`, 'gu'), ' ');
}

/* ────────────────────────────────────────────────────────────────────────────
 * Bidi: mixed Persian and Latin
 * ──────────────────────────────────────────────────────────────────────────── */

/** A Latin run inside Persian text, isolated so it cannot be reordered by the paragraph. */
export function latinRun(text: string): string {
  return isolateBidi(text, 'ltr');
}

/** A Persian run inside Latin text — the same mechanism, the other direction. */
export function persianRun(text: string): string {
  return isolateBidi(text, 'rtl');
}

/**
 * Wrap a run in Unicode isolate controls.
 *
 * `auto` asks for the isolate that resolves on the *first strong* character (`FSI`), which is what a
 * caller wants when it does not know what it is holding. The default is `ltr`, because the runs that
 * need isolating in this product are technical — a symbol, a signed figure, a timestamp — and the
 * paragraph around them is the thing that must not decide their order.
 */
export function isolateBidi(text: string, direction: 'ltr' | 'rtl' | 'auto' = 'ltr'): string {
  const open =
    direction === 'rtl'
      ? BIDI_CONTROLS.rightToLeftIsolate
      : direction === 'auto'
        ? BIDI_CONTROLS.firstStrongIsolate
        : BIDI_CONTROLS.leftToRightIsolate;
  return `${open}${text}${BIDI_CONTROLS.popDirectionalIsolate}`;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Formatting, through Intl
 * ──────────────────────────────────────────────────────────────────────────── */

/** The options every Persian formatter shares. */
export interface FaFormatOptions {
  /** `persian` (the default) renders ۱۲۳; `latin` renders 123 through the `-nu-latn` extension. */
  digits?: FaDigits;
  /** An IANA zone. Left to the host until Phase 7.5.2 decides what a trading date means here. */
  timeZone?: string;
}

/** The numeric formatters take the same locale choices, plus the two fraction limits. */
export interface FaNumberOptions extends FaFormatOptions {
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
}

/**
 * The locale tag for a formatter.
 *
 * The `-u-` extension is how a caller asks CLDR for a specific numbering system without rebuilding
 * the format by hand: `fa-IR-u-nu-latn` is Persian formatting with ASCII digits, which is the one
 * combination a trading figure needs and `toLatinDigits` cannot produce (it would also lose the
 * grouping and the separators CLDR chose).
 */
function localeTag(digits: FaDigits = 'persian'): string {
  return digits === 'latin' ? `${PERSIAN_LOCALE}-u-nu-latn` : PERSIAN_LOCALE;
}

/**
 * A number, as Persian prose writes it: `۱٬۲۳۴٬۵۶۷٫۸۹`.
 *
 * Note what this is *not*: a replacement for `labels.ts#formatNumber`. That one is pinned to the
 * reader's default locale and is what every existing screen renders; this one exists for a surface
 * that has decided it is Persian. Changing the first would change the product today.
 */
export function formatFaNumber(value: number, options: FaNumberOptions = {}): string {
  return new Intl.NumberFormat(localeTag(options.digits), {
    maximumFractionDigits: options.maximumFractionDigits,
    minimumFractionDigits: options.minimumFractionDigits,
  }).format(value);
}

/** The shape of an ISO 4217 code: three ASCII letters, which is all `Intl` will accept. */
const CURRENCY_CODE = /^[A-Za-z]{3}$/;

/**
 * Money, in the currency it is actually in.
 *
 * Same contract as `labels.ts#formatMoney`: the currency is required, because a formatter with a
 * fallback lets a surface print a figure from one currency beside another's symbol.
 *
 * The guard is not decoration. `Intl.NumberFormat` does not throw for a *missing* code — it renders
 * the name of the missing value, so `formatFaCurrency(1_250_000.5)` with nothing else printed
 * `۱٬۲۵۰٬۰۰۰٫۵ undefined` and a screen doing that is claiming a symbol it does not have. A code
 * that is not three letters is not a currency, so no symbol is claimed: the figure stays, and
 * whatever the caller passed is shown as itself.
 */
export function formatFaCurrency(
  value: number,
  currency: string,
  options: FaFormatOptions = {},
): string {
  if (!CURRENCY_CODE.test(currency ?? '')) {
    const code = typeof currency === 'string' && currency.length > 0 ? ` ${currency}` : '';
    return `${formatFaNumber(value, options)}${code}`;
  }
  try {
    return new Intl.NumberFormat(localeTag(options.digits), {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    // An unrecognised code is still a number; showing it with its code is honest.
    return `${formatFaNumber(value, options)} ${currency}`;
  }
}

/**
 * A share of a whole, on `Intl`'s own convention: `0.0245` renders as `۲٫۵٪`.
 *
 * The name says *share* because that is the convention this function keeps, and the sibling below
 * says *points* because that is the one the rest of the product uses — `labels.ts#formatPercent(2.45)`
 * is 2.45%. Two conventions genuinely collide here, so they get two names rather than a comment
 * nobody reads.
 */
export function formatFaShare(fraction: number, options: FaNumberOptions = {}): string {
  return new Intl.NumberFormat(localeTag(options.digits), {
    style: 'percent',
    maximumFractionDigits: options.maximumFractionDigits ?? 1,
    minimumFractionDigits: options.minimumFractionDigits,
  }).format(fraction);
}

/** A figure already in percent points, matching the rest of the product: `2.45` renders as `۲٫۴۵٪`. */
export function formatFaPercentPoints(points: number, options: FaNumberOptions = {}): string {
  return formatFaShare(points / 100, options);
}

/** A date input, in the shapes a caller can reasonably hold. */
export type FaDateInput = Date | string | number;

/** Shared shape for the three date formatters. */
export interface FaDateOptions extends FaFormatOptions {
  dateStyle?: 'short' | 'medium' | 'long' | 'full';
  timeStyle?: 'short' | 'medium' | 'long' | 'full';
}

/**
 * The Persian calendar, made explicit.
 *
 * CLDR gives `fa-IR` the Persian (Solar Hijri) calendar as its default, so a bare `fa-IR` formatter
 * already produces `۱۴۰۵/۷/۳`. The calendar is stated in the tag anyway: a default is a fact about a
 * locale *version*, and a date the product renders for a user should not move because an ICU build
 * changed its mind.
 */
const DATE_TAG = `${PERSIAN_LOCALE}-u-ca-persian-nu-arabext`;

/** The same calendar, with ASCII digits — the combination a technical date readout wants. */
const DATE_TAG_LATIN = `${PERSIAN_LOCALE}-u-ca-persian-nu-latn`;

/** The date tag for the requested digit repertoire. */
function dateTag(digits: FaDigits = 'persian'): string {
  return digits === 'latin' ? DATE_TAG_LATIN : DATE_TAG;
}

/**
 * A date in the Persian calendar.
 *
 * An unparseable value is returned as it was given, which is what `lib/format.ts#formatTimestamp`
 * already does: displaying the raw value is honest, and inventing a date is not.
 */
export function formatFaDate(input: FaDateInput, options: FaDateOptions = {}): string {
  return formatFaInstant(input, { dateStyle: options.dateStyle ?? 'short' }, options);
}

/** A date and a time together, in the Persian calendar. */
export function formatFaDateTime(input: FaDateInput, options: FaDateOptions = {}): string {
  return formatFaInstant(
    input,
    { dateStyle: options.dateStyle ?? 'medium', timeStyle: options.timeStyle ?? 'short' },
    options,
  );
}

/** A time alone. */
export function formatFaTime(input: FaDateInput, options: FaDateOptions = {}): string {
  return formatFaInstant(input, { timeStyle: options.timeStyle ?? 'short' }, options);
}

/** The one place a `Date` is built, so "an unparseable value is shown as given" is stated once. */
function formatFaInstant(
  input: FaDateInput,
  styles: { dateStyle?: FaDateOptions['dateStyle']; timeStyle?: FaDateOptions['timeStyle'] },
  options: FaDateOptions,
): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return typeof input === 'string' ? input : String(input);
  return new Intl.DateTimeFormat(dateTag(options.digits), {
    ...styles,
    timeZone: options.timeZone,
  }).format(date);
}

/**
 * How long ago, in Persian, from CLDR's own relative-time vocabulary.
 *
 * Drafted rather than translated: `Intl.RelativeTimeFormat('fa-IR', { numeric: 'auto' })` owns the
 * wording (and the Persian digits), so this function decides only *which unit* the distance lands
 * in — the same thresholds `lib/format.ts#formatRelative` uses for English.
 */
export function formatFaRelative(input: FaDateInput, now: Date | number = Date.now()): string {
  const then = input instanceof Date ? input.getTime() : new Date(input).getTime();
  const reference = now instanceof Date ? now.getTime() : now;
  if (Number.isNaN(then)) return typeof input === 'string' ? input : String(input);
  const formatter = new Intl.RelativeTimeFormat(PERSIAN_LOCALE, { numeric: 'auto' });
  const minutes = Math.round((reference - then) / 60_000);
  if (Math.abs(minutes) < 1) return formatter.format(0, 'second');
  if (Math.abs(minutes) < 60) return formatter.format(-minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(-hours, 'hour');
  return formatter.format(-Math.round(hours / 24), 'day');
}

/** Compare two Persian strings the way a Persian reader sorts them. */
export function comparePersian(left: string, right: string): number {
  return new Intl.Collator(PERSIAN_LOCALE).compare(left, right);
}

/**
 * Which CLDR plural category a count falls in.
 *
 * Persian has two (`one` and `other`, with `one` for exactly 1), which is the difference between
 * `۱ معامله` and `۳ معامله`. Copy that decides a word by counting must ask CLDR rather than test for
 * `=== 1`, because a locale that gained a category would silently render the wrong sentence.
 */
export function faPluralCategory(count: number): ReturnType<Intl.PluralRules['select']> {
  return new Intl.PluralRules(PERSIAN_LOCALE).select(count);
}
