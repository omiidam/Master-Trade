/**
 * Phase 7.5.3.5.1 — the Persian language-quality evaluation.
 *
 * The claims, in the order they can fail:
 *
 *   1. **It is a reading, not a decision.** Every check has a case here; the report carries the input
 *      back unchanged on text that holds every defect in the catalogue; the same text evaluated twice
 *      is the same report; every finding's offset really does point at the characters it names; and
 *      the module's imports and exports are an allow-list, so a store, a writer or a second source of
 *      knowledge cannot arrive in this file without failing here first.
 *   2. **It reads the product's own tables.** The compound pairs, the register forms, the half-space
 *      clitics, the marks and the character folds all come from the language layer. Where a decision
 *      exists — `spelling.ts` — the suite asks that table; where a character fold exists, it asks
 *      `normalizePersianText` and compares the answer, so a report that disagreed with the product's
 *      own normalization would be a failing test rather than a discrepancy nobody notices.
 *   3. **A wrong answer is worse than a missing one.** The false-positive half of this suite is the
 *      bigger half: a symbol, a price, a path, a code span, an English sentence, a Persian-only
 *      message, `می` as a noun, and — the case that matters most — a compound the product has *not*
 *      decided are all reported as nothing.
 *   4. **What it cannot judge is on the record.** A report lists its limits, and names the pairs the
 *      store still holds as candidates instead of passing over them in silence.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COMPOUND_PAIRS,
  LANGUAGE_QUALITY_AXES,
  LANGUAGE_QUALITY_CHECKS,
  LANGUAGE_QUALITY_LIMITS,
  PERSIAN_DIGITS,
  PERSIAN_PUNCTUATION,
  REGISTER_FORMS,
  ZWNJ,
  evaluatePersianQuality,
  languageQualityChecksByAxis,
  normalizePersianText,
  type LanguageQualityFinding,
  type LanguageQualityReport,
} from '../web/src/language/index.js';
// The half-space clitic inventory lives in the rule catalogue rather than on the barrel: it is data a
// check reads, not a name a surface needs. Read from where it is written, not retyped here.
import { ZWNJ_CLITIC_FORMS } from '../web/src/language/rules.js';
import * as evaluation from '../web/src/language/evaluation.js';

const { comma, questionMark, semicolon } = PERSIAN_PUNCTUATION;

/** The one compound the product has decided about, and the one the store still holds as a candidate. */
const DECIDED = COMPOUND_PAIRS.find((pair) => pair.proposed !== true);
const PENDING = COMPOUND_PAIRS.find((pair) => pair.proposed === true);

/** A register pair, read from the table rather than retyped: `[spoken, written]`. */
const [SPOKEN, WRITTEN] = REGISTER_FORMS[0] as readonly [string, string];

/** The bare list of check ids, for the completeness claim below. */
const CHECK_IDS = LANGUAGE_QUALITY_CHECKS.map((check) => check.id);

/** One text that must produce a finding from each check. */
const CASE_FOR: Readonly<Record<string, string>> = {
  'wording.bookish-phrase': 'این مورد میباشد',
  'wording.informal': SPOKEN,
  'wording.register-switch': `${SPOKEN} گفت این خوب ${WRITTEN}`,
  'spelling.compound': DECIDED?.written ?? '',
  'spelling.arabic-repertoire': 'این كتاب خوب است',
  'punctuation.ascii-mark': 'این چیست?',
  'punctuation.doubled': 'بله!!',
  'punctuation.unbalanced': 'او گفت «سلام',
  'spacing.before-mark': `سلام ${comma} بله`,
  'spacing.after-mark': `بله${comma}خیر`,
  'spacing.double': 'بله  خیر',
  'zwnj.clitic-separated': `کتاب ${ZWNJ_CLITIC_FORMS[0]}`,
  'zwnj.beside-space': `خوب${ZWNJ} است`,
  'zwnj.repeated': `کتاب${ZWNJ}${ZWNJ}ها`,
  'zwnj.in-latin-run': `XAU${ZWNJ}USD`,
  'zwnj.prefix-separated': 'این کار می شود',
  'script.latin-word-in-persian': 'روند trend تغییر کرد',
  'script.persian-run-in-latin': 'he said سلام to me',
};

/** Every finding a text produces, by check id — what most of the assertions below ask for. */
function checksIn(text: string): string[] {
  return evaluatePersianQuality(text).findings.map((finding) => finding.check);
}

/** The findings of one check. */
function findingsOf(text: string, check: string): LanguageQualityFinding[] {
  return evaluatePersianQuality(text).findings.filter((finding) => finding.check === check);
}

/** The one finding of a check, asserted to be exactly one. */
function soleFinding(text: string, check: string): LanguageQualityFinding {
  const found = findingsOf(text, check);
  expect(found, `${check} on ${JSON.stringify(text)}`).toHaveLength(1);
  return found[0] as LanguageQualityFinding;
}

describe('the evaluation is a reading, not a decision', () => {
  const SOURCE = readFileSync(join('web', 'src', 'language', 'evaluation.ts'), 'utf8');

  it('imports nothing but the language layer’s own closed tables', () => {
    // The separation from Agent Memory, Language Memory, the i18n catalogue and Secrets is a shape
    // rather than a promise: there is no import here that could reach any of them. A new specifier in
    // this list is a new dependency of the evaluation, and it has to be argued for in this test.
    const specifiers = [...SOURCE.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map(
      (match) => match[1] ?? '',
    );
    expect([...specifiers].sort()).toEqual(['./fa.js', './rules.js', './spelling.js']);
  });

  it('exports readings and a catalogue, and nothing that could write', () => {
    // An allow-list rather than a spot check: a future `applyEvaluation` or `rememberEvaluation` in
    // this file would fail here, which is where the separation is worth defending.
    expect(Object.keys(evaluation).sort()).toEqual([
      'LANGUAGE_QUALITY_AXES',
      'LANGUAGE_QUALITY_CHECKS',
      'LANGUAGE_QUALITY_LIMITS',
      'evaluatePersianQuality',
      'languageQualityChecksByAxis',
    ]);
  });

  it('reports without rewriting, on text that holds every defect it can see', () => {
    const text = Object.values(CASE_FOR).join(' و ');
    const report = evaluatePersianQuality(text);
    expect(report.findings.length).toBeGreaterThanOrEqual(Object.keys(CASE_FOR).length);
    // The claim in one line: the report is about the text, and the text is the text it was given.
    expect(report.text).toBe(text);
    expect(report.input).toBe(text);
    for (const finding of report.findings) {
      expect(report.text.slice(finding.index, finding.index + finding.length)).toBe(finding.found);
    }
  });

  it('answers the same question the same way twice', () => {
    const text = Object.values(CASE_FOR).join(' و ');
    expect(JSON.stringify(evaluatePersianQuality(text))).toBe(
      JSON.stringify(evaluatePersianQuality(text)),
    );
  });

  it('gives every check an id, an axis, and a case of its own', () => {
    expect(new Set(CHECK_IDS).size).toBe(CHECK_IDS.length);
    for (const check of LANGUAGE_QUALITY_CHECKS) {
      expect(LANGUAGE_QUALITY_AXES, check.id).toContain(check.axis);
      expect(check.describe.length, check.id).toBeGreaterThan(20);
    }
    // Every check is exercised, and every case in the table belongs to a check that exists: a check
    // that stopped firing, or a case for a check that was renamed, both fail here.
    expect(Object.keys(CASE_FOR).sort()).toEqual([...CHECK_IDS].sort());
    for (const id of CHECK_IDS) {
      expect(checksIn(CASE_FOR[id] ?? ''), id).toContain(id);
    }
  });

  it('carries every axis, and counts what it found on each', () => {
    const byAxis = languageQualityChecksByAxis();
    for (const axis of LANGUAGE_QUALITY_AXES) {
      expect(byAxis[axis].length, axis).toBeGreaterThan(0);
    }
    const report = evaluatePersianQuality(Object.values(CASE_FOR).join(' و '));
    const counted = LANGUAGE_QUALITY_AXES.reduce((total, axis) => total + report.counts[axis], 0);
    expect(counted).toBe(report.findings.length);
    expect(Object.keys(report.counts).sort()).toEqual([...LANGUAGE_QUALITY_AXES].sort());
  });

  it('names its limits, and the decisions somebody else has not made', () => {
    const report = evaluatePersianQuality('سلام');
    expect(report.notEvaluated).toEqual(expect.arrayContaining([...LANGUAGE_QUALITY_LIMITS]));
    expect(report.notEvaluated.some((line) => line.includes('meaning'))).toBe(true);
    // A pending pair is not this layer's to assert, and the report says so rather than staying quiet.
    expect(PENDING, 'the catalogue ships a candidate pair').toBeDefined();
    const named = report.notEvaluated.filter((line) => line.includes(PENDING?.written ?? ''));
    expect(named).toHaveLength(1);
  });

  it('lets a caller leave a check out, and names it', () => {
    const report = evaluatePersianQuality('این مورد میباشد', {
      exceptChecks: ['wording.bookish-phrase'],
    });
    expect(report.skippedChecks).toEqual(['wording.bookish-phrase']);
    expect(report.checks).not.toContain('wording.bookish-phrase');
    expect(findingsOf('این مورد میباشد', 'wording.bookish-phrase')).toHaveLength(1);
    expect(report.findings).toEqual([]);
  });

  it('honours a caller’s own exception as data rather than as a pattern', () => {
    const text = DECIDED?.written ?? '';
    expect(findingsOf(text, 'spelling.compound')).toHaveLength(1);
    const report = evaluatePersianQuality(text, { protectedLiterals: [text] });
    expect(report.findings).toEqual([]);
  });
});

describe('spelling', () => {
  it('reports a compound the product writes in two words, with the product’s own reason', () => {
    const text = DECIDED?.written ?? '';
    const found = soleFinding(text, 'spelling.compound');
    expect(found.instead).toBe(DECIDED?.correct);
    expect(found.reason).toBe(DECIDED?.why);
    expect(found.axis).toBe('spelling');
    expect(found.deterministic).toBe(true);
  });

  it('reports the Arabic letters and digits Persian does not write', () => {
    // The pairs are the ones `normalizePersianText` folds, and this asks that function rather than
    // comparing two lists: a fold changed in `fa.ts` and not here would fail.
    const arabicYeh = '\u064A';
    const arabicKaf = '\u0643';
    expect(normalizePersianText(arabicYeh)).toBe('ی');
    expect(normalizePersianText(arabicKaf)).toBe('ک');
    const report = evaluatePersianQuality('این كتاب و مي خوب است');
    const found = report.findings.filter(
      (finding) => finding.check === 'spelling.arabic-repertoire',
    );
    expect(found.map((finding) => finding.instead).sort()).toEqual(['ک', 'ی'].sort());
  });

  it('reports an Arabic-Indic digit inside a Persian sentence, and only the repertoire', () => {
    const found = soleFinding('قیمت ٣ است', 'spelling.arabic-repertoire');
    // The value is kept: the suggestion is the same digits in the Persian set, which is why a figure
    // is not a span this check has to step around.
    expect(found.found).toBe('٣');
    expect(found.instead).toBe(PERSIAN_DIGITS[3]);
  });
});

describe('punctuation', () => {
  it('reports an ASCII mark in Persian prose, and leaves the full stop alone', () => {
    expect(soleFinding(`این چیست?`, 'punctuation.ascii-mark').instead).toBe(questionMark);
    expect(soleFinding(`بله, خوب است`, 'punctuation.ascii-mark').instead).toBe(comma);
    expect(soleFinding(`اول; دوم`, 'punctuation.ascii-mark').instead).toBe(semicolon);
    // Persian prose ends a sentence with the period it shares with English: not a finding.
    expect(findingsOf('این جمله درست است. و ادامه دارد.', 'punctuation.ascii-mark')).toHaveLength(
      0,
    );
  });

  it('collapses a doubled or mixed mark to the one that was meant', () => {
    expect(soleFinding('بله!!', 'punctuation.doubled').instead).toBe('!');
    expect(soleFinding(`بله,${comma} خیر`, 'punctuation.doubled').instead).toBe(comma);
    // Two marks from different groups are a punctuation choice, not a slip, so nothing is claimed.
    expect(findingsOf('چه شد؟!', 'punctuation.doubled')).toHaveLength(0);
  });

  it('reports a pair that was opened and not closed, and offers no replacement', () => {
    const found = soleFinding('او گفت «سلام', 'punctuation.unbalanced');
    expect(found.instead).toBeNull();
    expect(found.deterministic).toBe(false);
    expect(findingsOf('او گفت «سلام» و رفت', 'punctuation.unbalanced')).toHaveLength(0);
    expect(findingsOf('(بله) [خیر]', 'punctuation.unbalanced')).toHaveLength(0);
  });
});

describe('spacing', () => {
  it('takes the space off a mark that closes the word before it', () => {
    const found = soleFinding(`سلام ${comma} بله`, 'spacing.before-mark');
    expect(found.found).toBe(` ${comma}`);
    expect(found.instead).toBe(comma);
    // The full stop is in the set — two of the evaluated toolkits write `کرد .` — and the protected
    // spans are what keep a decimal point and a dotted identifier out of it.
    expect(soleFinding('او رفت .', 'spacing.before-mark').instead).toBe('.');
    expect(findingsOf('نسبت ۳٫۵ است.', 'spacing.before-mark')).toHaveLength(0);
    expect(findingsOf('فایل index.ts را باز کن.', 'spacing.before-mark')).toHaveLength(0);
    // An English sentence is another language’s punctuation, and this layer does not touch it.
    expect(findingsOf('quote, said the shell .', 'spacing.before-mark')).toHaveLength(0);
  });

  it('puts a space after a mark that separates words', () => {
    const found = soleFinding(`بله${comma}خیر`, 'spacing.after-mark');
    expect(found.found).toBe(`${comma}خ`);
    expect(found.instead).toBe(`${comma} خ`);
    // A mark at the end of a line separates nothing from nothing.
    expect(findingsOf(`بله${comma}\nخیر`, 'spacing.after-mark')).toHaveLength(0);
  });

  it('collapses two spaces between two Persian words, and leaves alignment alone', () => {
    expect(soleFinding('بله  خیر', 'spacing.double').instead).toBe(' ');
    // Aligning a table with spaces between Latin tokens and figures is not this check's business.
    expect(findingsOf('XAUUSD  3345.20', 'spacing.double')).toHaveLength(0);
  });
});

describe('the half-space', () => {
  it('joins a plural and its clitic with a half-space rather than a space', () => {
    const clitic = ZWNJ_CLITIC_FORMS[0] as string;
    const found = soleFinding(`کتاب ${clitic}`, 'zwnj.clitic-separated');
    expect(found.found).toBe(` ${clitic}`);
    expect(found.instead).toBe(`${ZWNJ}${clitic}`);
  });

  it('reports a half-space with nothing to join, in either shape', () => {
    expect(soleFinding(`خوب${ZWNJ} است`, 'zwnj.beside-space').instead).toBe('');
    expect(soleFinding(`سلام${ZWNJ}`, 'zwnj.beside-space').instead).toBe('');
    expect(soleFinding(`کتاب${ZWNJ}${ZWNJ}ها`, 'zwnj.repeated').instead).toBe(ZWNJ);
    expect(soleFinding(`XAU${ZWNJ}USD`, 'zwnj.in-latin-run').instead).toBe('');
  });

  it('reads a separated prefix as a judgement, and only before a verb it recognises', () => {
    const found = soleFinding('این کار می شود', 'zwnj.prefix-separated');
    expect(found.instead).toBe(`می${ZWNJ}شود`);
    expect(found.deterministic).toBe(false);
    // `می` is a word of its own, so a space before a noun it governs is not evidence of anything.
    expect(findingsOf('یک جام می خوردم', 'zwnj.prefix-separated')).toHaveLength(0);
    expect(findingsOf('میان این دو', 'zwnj.prefix-separated')).toHaveLength(0);
  });
});

describe('wording', () => {
  it('reports a bookish construction with the plain word, and never as a rule', () => {
    const found = soleFinding('این مورد میباشد', 'wording.bookish-phrase');
    expect(found.instead).toBe('است');
    expect(found.deterministic).toBe(false);
    expect(soleFinding('در خصوص این موضوع', 'wording.bookish-phrase').instead).toBe('درباره');
    expect(soleFinding('بر روی میز', 'wording.bookish-phrase').instead).toBe('روی');
    expect(soleFinding('و یا این', 'wording.bookish-phrase').instead).toBe('یا');
    // A phrase inside a longer word is a different word.
    expect(findingsOf('و یازده نفر', 'wording.bookish-phrase')).toHaveLength(0);
  });

  it('reports a spoken form with the written one the product uses', () => {
    const found = soleFinding(SPOKEN, 'wording.informal');
    expect(found.instead).toBe(WRITTEN);
    expect(found.deterministic).toBe(false);
  });

  it('reports where one text switches between the two registers of a word', () => {
    const found = soleFinding(`${SPOKEN} گفت این خوب ${WRITTEN}`, 'wording.register-switch');
    expect(found.found).toBe(WRITTEN);
    expect(found.instead).toBeNull();
    expect(findingsOf(SPOKEN, 'wording.register-switch')).toHaveLength(0);
  });
});

describe('mixed Persian and English technical text', () => {
  it('reports a lower-case Latin word inside Persian prose', () => {
    const found = soleFinding('روند trend تغییر کرد', 'script.latin-word-in-persian');
    expect(found.found).toBe('trend');
    expect(found.instead).toBeNull();
    expect(found.deterministic).toBe(false);
  });

  it('leaves the technical vocabulary this product writes alone', () => {
    // A symbol, a code and a technology name are how this product writes them: capitals, or a capital.
    for (const text of [
      'نماد XAUUSD امروز رشد کرد',
      'اندیکاتور ATR را بررسی کن',
      'فایل index.ts را باز کن',
      'در TypeScript این خطا رخ میدهد',
      'مقدار R برابر ۲ است',
    ]) {
      expect(checksIn(text), text).not.toContain('script.latin-word-in-persian');
    }
  });

  it('reports a Persian phrase inside a sentence in another language', () => {
    const found = soleFinding('he said سلام to me', 'script.persian-run-in-latin');
    expect(found.found).toBe('سلام');
    // A message that is only Persian has no other language to leak into.
    expect(findingsOf('سلام', 'script.persian-run-in-latin')).toHaveLength(0);
    // And the mirror: an English sentence with a quoted Persian word reports the quote and not its
    // own lower-case words, which is the ordinary way to write in English.
    const english = evaluatePersianQuality('the word سلام means peace');
    expect(english.findings.map((finding) => finding.check)).toEqual([
      'script.persian-run-in-latin',
    ]);
  });

  it('reads the text rather than the token, so a symbol is not a language', () => {
    // Measured on real copy: a Persian sentence that names two symbols has Latin on both sides of
    // some of its words, and a nearest-letter rule calls it Persian text inside English.
    for (const text of [
      'اندیکاتور ATR روی نماد XAUUSD سیگنال خرید میدهد.',
      'روند XAUUSD در تایم فریم چهار ساعته نزولی است',
    ]) {
      expect(checksIn(text), text).not.toContain('script.persian-run-in-latin');
      expect(checksIn(text), text).not.toContain('script.latin-word-in-persian');
    }
  });

  it('claims nothing about a text whose prose is not clearly one script', () => {
    // Four Persian letters against five Latin ones is a two-word message, not a language.
    expect(checksIn('روند trend')).toEqual([]);
  });
});

describe('what it must not report', () => {
  it('says nothing about a compound the product has not decided', () => {
    // The store holds this pair as a candidate: the pipeline may not apply it, and an evaluation that
    // reported it would be asserting a rule nobody has accepted.
    expect(evaluatePersianQuality(PENDING?.written ?? '').findings).toEqual([]);
  });

  it('says nothing about a symbol and a price', () => {
    expect(evaluatePersianQuality('XAUUSD 3345.20').findings).toEqual([]);
    expect(evaluatePersianQuality('BTC/USDT 1,234.5').findings).toEqual([]);
  });

  it('says nothing about a sentence that is already written correctly', () => {
    expect(evaluatePersianQuality('این جمله درست نوشته شده است.').findings).toEqual([]);
    expect(evaluatePersianQuality('نسبت ریسک به سود ۱ به ۳ است.').findings).toEqual([]);
  });

  it('says nothing about an English sentence', () => {
    // An English sentence passes: the folds in this layer are Persian folds, and reporting an English
    // comma as a Persian mark is the failure this case exists to prevent.
    expect(evaluatePersianQuality('quote, said the shell; then? done.').findings).toEqual([]);
  });

  it('says nothing about a quoted literal', () => {
    expect(evaluatePersianQuality('دستور `npm test` را اجرا کن').findings).toEqual([]);
  });

  it('says nothing about the digits inside a technical token', () => {
    // A ratio written with a slash is a technical token to the pipeline, so its digits are protected
    // exactly as `BTC/USDT` is — a named limit rather than an oversight. The same digits in prose are
    // reported, which the case below it holds.
    expect(findingsOf('نسبت ٣٣٤٥/۲۰ است', 'spelling.arabic-repertoire')).toHaveLength(0);
    expect(findingsOf('نسبت ١٣ به ٢ است', 'spelling.arabic-repertoire')).toHaveLength(3);
  });
});

describe('the report a surface reads', () => {
  it('is in text order, and names the check and the axis of every finding', () => {
    const text = Object.values(CASE_FOR).join(' و ');
    const report: LanguageQualityReport = evaluatePersianQuality(text);
    const indices = report.findings.map((finding) => finding.index);
    expect([...indices].sort((left, right) => left - right)).toEqual(indices);
    for (const finding of report.findings) {
      expect(CHECK_IDS).toContain(finding.check);
      expect(LANGUAGE_QUALITY_AXES).toContain(finding.axis);
      expect(finding.length).toBe(finding.found.length);
    }
  });

  it('carries a reason a person can act on, in a sentence', () => {
    const report = evaluatePersianQuality('این مورد میباشد و trend تغییر کرد');
    for (const finding of report.findings) {
      expect(finding.reason.length, finding.check).toBeGreaterThan(40);
      expect(finding.reason.trim().endsWith('.'), finding.check).toBe(true);
    }
  });
});
