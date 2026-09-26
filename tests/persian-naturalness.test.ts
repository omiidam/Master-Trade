/**
 * Phase 7.5.3.5.3 — the Persian naturalness and context evaluation.
 *
 * The claims, in the order they can fail:
 *
 *   1. **It is a reading judged against a context, and it changes nothing.** The input comes back
 *      unchanged on text that holds every shape the layer can see; the same answer under the same
 *      context is the same report twice; every verdict's offset really does point at the characters it
 *      names; and no verdict carries a replacement, because the phase's first requirement is that the
 *      response is not rewritten.
 *   2. **One text, two verdicts.** The phase's whole subject: the same sentence is a `problem` in one
 *      context and `technical-english`, `style` or `acceptable` in another, and the cases below assert
 *      both halves of that — `stop loss` asked for in English and asked for in Persian, `میشه` in a
 *      conversational answer and in a formal one, a lower-case Latin word in both.
 *   3. **It is not a second quality layer.** The quality layer's findings are re-read rather than
 *      re-scanned, the two phrase tables answer different questions and neither fires on the other's
 *      phrases, the six checks of this layer's own are different questions, and the module's imports
 *      and exports are an allow-list — so a store, a rewrite or a duplicate ruleset cannot arrive in
 *      this file without failing here first.
 *   4. **A wrong answer is still worse than a missing one.** The false-positive half is the bigger
 *      half: a natural technical answer, symbols and identifiers, protected literals, a word used
 *      three times, one address used consistently, a heading over the sentence it introduces and
 *      Persian prose carrying a single English term all produce no `problem` at all.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LANGUAGE_QUALITY_AXES,
  LANGUAGE_QUALITY_CHECKS,
  LANGUAGE_QUALITY_LIMITS,
  LANGUAGE_QUALITY_READINGS,
  NATURALNESS_ASPECTS,
  NATURALNESS_CHECKS,
  NATURALNESS_CONFIDENCES,
  NATURALNESS_LIMITS,
  NATURALNESS_STANCES,
  NATURALNESS_THRESHOLDS,
  REGISTER_FORMS,
  evaluatePersianNaturalness,
  evaluatePersianQuality,
  isNaturalnessContext,
  naturalnessCheckIds,
  type NaturalnessContext,
  type NaturalnessReport,
  type NaturalnessStance,
  type NaturalnessVerdict,
} from '../web/src/language/index.js';
import * as naturalness from '../web/src/language/naturalness.js';

/** A register pair, read from the table rather than retyped: `[spoken, written]`. */
const [SPOKEN] = REGISTER_FORMS[0] as readonly [string, string];

/** The contexts an answer is judged in. The product's own vocabulary, not a second one. */
const FORMAL: NaturalnessContext = {
  tone: 'formal',
  terminology: 'product-terms',
  mixing: 'none',
};

const CONVERSATIONAL: NaturalnessContext = { ...FORMAL, tone: 'conversational' };

const ENGLISH_TERMS: NaturalnessContext = {
  tone: 'neutral',
  terminology: 'english-terms',
  mixing: 'terms-only',
};

const BOTH_LANGUAGES: NaturalnessContext = {
  tone: 'neutral',
  terminology: 'bilingual',
  mixing: 'sentence',
};

const BILINGUAL: NaturalnessContext = { ...FORMAL, terminology: 'bilingual' };

/** Every context a case below judges in. */
const CONTEXTS: readonly NaturalnessContext[] = [
  FORMAL,
  CONVERSATIONAL,
  ENGLISH_TERMS,
  BOTH_LANGUAGES,
  BILINGUAL,
];

/**
 * One text that must produce a verdict from each of this layer's own checks.
 *
 * The ids here are this layer's; the quality catalogue is covered by `tests/persian-evaluation.test.ts`,
 * and the case-per-check rule below is about the six questions this phase adds.
 */
const CASE_FOR: Readonly<Record<string, string>> = {
  'naturalness.literal-frame': 'این تنظیمات حائز اهمیت است.',
  'naturalness.repeated-sentence': 'حد ضرر را رعایت کنید. حجم را کم کنید. حد ضرر را رعایت کنید.',
  'naturalness.repeated-word': 'مدیریت ریسک مهم است. مدیریت ریسک یعنی مدیریت ضرر و مدیریت صبر.',
  'naturalness.shared-opener':
    'این ابزار ریسک را نشان می‌دهد. این ابزار ضرر را کم می‌کند. این ابزار گزارش می‌سازد.',
  'naturalness.address-drift': 'اگر تو صبر کنی بهتر است؛ اما شما باید حد ضرر را رعایت کنید.',
  // Three words rather than two, because the table is also the completeness case below and a two-word
  // run is the one shape the context lowers to a note: the declaration is what a check reports in the
  // product's own context, and a pair is the exception the cases further down are written for.
  'naturalness.english-run': 'برای این کار the risk of ruin را در نظر بگیرید.',
};

/** Every verdict a text produces, under one context. */
function verdictsIn(
  text: string,
  context: NaturalnessContext = FORMAL,
): readonly NaturalnessVerdict[] {
  return evaluatePersianNaturalness(text, context).verdicts;
}

/** The verdicts of one check. */
function verdictsOf(
  text: string,
  check: string,
  context: NaturalnessContext = FORMAL,
): readonly NaturalnessVerdict[] {
  return verdictsIn(text, context).filter((verdict) => verdict.check === check);
}

/** The only verdict of a check, asserted to be exactly one. */
function soleVerdict(
  text: string,
  check: string,
  context: NaturalnessContext = FORMAL,
): NaturalnessVerdict {
  const found = verdictsOf(text, check, context);
  expect(found, `${check} on ${JSON.stringify(text)}`).toHaveLength(1);
  return found[0] as NaturalnessVerdict;
}

/** A report with no `problem` in it, asserted to be one. */
function noProblems(report: NaturalnessReport): void {
  expect(report.problems.map((problem) => `${problem.check} «${problem.found}»`)).toEqual([]);
}

describe('the evaluation is a reading of an answer, and it changes nothing', () => {
  const SOURCE = readFileSync(join('web', 'src', 'language', 'naturalness.ts'), 'utf8');

  /**
   * The value imports of one file, resolved to the file they name.
   *
   * `import type` and `export type` are skipped, because a type is erased and cannot pull a store into
   * a running program — which is how this layer reads 7.5.3.2's `ContextMixing` without carrying the
   * message reading, its lexicon or its store.
   */
  function valueImports(file: string): string[] {
    const source = readFileSync(file, 'utf8');
    const imports: string[] = [];
    for (const match of source.matchAll(
      /(?:^|\n)\s*(?:import|export)\s+(type\s+)?[^;]*?from\s*'([^']+)'/g,
    )) {
      if (match[1] !== undefined) continue;
      const specifier = match[2] ?? '';
      if (!specifier.startsWith('.')) continue;
      imports.push(join(dirname(file), specifier.replace(/\.js$/, '.ts')).split('\\').join('/'));
    }
    return imports;
  }

  it('imports the quality layer and nothing that can reach a store, transitively', () => {
    // The layering as a shape rather than a promise: this layer reads `evaluation.ts`, and everything
    // reachable from there is the language layer's own closed tables. The terminology lexicon — which
    // reaches the store through `memory.ts` — is read by nobody here, which is what lets this run over
    // an archived answer in a test, in a build step, or beside a review surface.
    const reachable = new Set<string>();
    const queue = ['web/src/language/naturalness.ts'];
    while (queue.length > 0) {
      const file = queue.pop() as string;
      if (reachable.has(file)) continue;
      reachable.add(file);
      queue.push(...valueImports(file));
    }
    expect([...reachable].sort()).toEqual([
      'web/src/language/evaluation.ts',
      'web/src/language/fa.ts',
      'web/src/language/grammar.ts',
      'web/src/language/naturalness.ts',
      'web/src/language/rules.ts',
      'web/src/language/spelling.ts',
    ]);
  });

  it('exports verdicts and a context, and nothing that could write or correct', () => {
    // An allow-list rather than a spot check: a future `applyNaturalness` or `rewriteNaturalness` in
    // this file would fail here, which is where `do not rewrite the response` is worth defending.
    expect(Object.keys(naturalness).sort()).toEqual([
      'NATURALNESS_ASPECTS',
      'NATURALNESS_CHECKS',
      'NATURALNESS_CONFIDENCES',
      'NATURALNESS_LIMITS',
      'NATURALNESS_STANCES',
      'NATURALNESS_THRESHOLDS',
      'evaluatePersianNaturalness',
      'isNaturalnessContext',
      'naturalnessCheckIds',
    ]);
    // And no verdict type can carry one either: `instead` is a field the quality layer has and this
    // layer deliberately does not, so the type's absence is asserted where it would be written.
    expect(SOURCE).not.toMatch(/instead\s*:/);
  });

  it('reports without rewriting, on text that holds every shape it can see', () => {
    const text = Object.values(CASE_FOR).join(' ');
    const report = evaluatePersianNaturalness(text, FORMAL);
    expect(report.verdicts.length).toBeGreaterThanOrEqual(Object.keys(CASE_FOR).length);
    // The claim in one line: the report is about the answer, and the answer is the answer it was given.
    expect(report.text).toBe(text);
    expect(report.input).toBe(text);
    for (const verdict of report.verdicts) {
      expect(report.text.slice(verdict.index, verdict.index + verdict.found.length)).toBe(
        verdict.found,
      );
    }
  });

  it('answers the same question the same way twice', () => {
    const text = Object.values(CASE_FOR).join(' ');
    expect(JSON.stringify(evaluatePersianNaturalness(text, FORMAL))).toBe(
      JSON.stringify(evaluatePersianNaturalness(text, FORMAL)),
    );
  });

  it('carries the context it judged against, and a reason a person can argue with', () => {
    const report = evaluatePersianNaturalness('این تنظیمات حائز اهمیت است.', FORMAL);
    expect(report.context).toEqual(FORMAL);
    expect(report.problems.length).toBeGreaterThan(0);
    for (const verdict of report.verdicts) {
      expect(NATURALNESS_STANCES, verdict.check).toContain(verdict.stance);
      expect(NATURALNESS_CONFIDENCES, verdict.check).toContain(verdict.confidence);
      expect(NATURALNESS_ASPECTS, verdict.check).toContain(verdict.aspect);
      expect(verdict.reason.length, verdict.check).toBeGreaterThan(40);
      // Which layer saw it is part of the id, so a reviewer never has to guess.
      expect(verdict.check).toMatch(/^(quality|naturalness)\./);
    }
  });
});

describe('the context is what decides the verdict', () => {
  it('reads a term in English as the instruction when English terms were asked for', () => {
    const text = 'برای این کار از stop loss استفاده کنید.';
    const asked = soleVerdict(text, 'naturalness.english-run', FORMAL);
    // A two-word run is the shape of a two-word term, so the product's own forms being asked for makes
    // it a note: `stop loss` is what a Persian trader may well say, and the run check is for prose.
    expect(asked.stance).toBe('style');
    expect(asked.confidence).toBe('low');
    // The same characters, the same answer, a different instruction.
    const english = soleVerdict(text, 'naturalness.english-run', ENGLISH_TERMS);
    expect(english.stance).toBe('technical-english');
    expect(english.confidence).toBe('high');
    // A person who writes both languages: nothing here is wrong at all.
    expect(soleVerdict(text, 'naturalness.english-run', BOTH_LANGUAGES).stance).toBe(
      'technical-english',
    );
    // A gloss asked for in both languages: a note, because a term is one word and this is a phrase.
    expect(soleVerdict(text, 'naturalness.english-run', BILINGUAL).stance).toBe('style');
  });

  it('reads a Latin word through the quality layer’s own finding, and reads it as a word', () => {
    const text = 'این trend صعودی است.';
    const verdict = soleVerdict(text, 'quality.script.latin-word-in-persian', FORMAL);
    expect(verdict.stance).toBe('style');
    expect(verdict.confidence).toBe('medium');
    expect(verdict.reason).toContain('the product’s own Persian forms');
    // The quality layer files this finding as `intentional-english` and reports no `error` for it; the
    // context is what decides what it means, which is the difference between the two layers.
    expect(evaluatePersianQuality(text).errors).toEqual([]);
    expect(soleVerdict(text, 'quality.script.latin-word-in-persian', ENGLISH_TERMS).stance).toBe(
      'technical-english',
    );
    expect(soleVerdict(text, 'quality.script.latin-word-in-persian', BILINGUAL).stance).toBe(
      'technical-english',
    );
    // And never a problem: one lower-case word can be a technology's own name, which is why the
    // product's own copy writes `loopback` — the *run* is where prose is called prose.
    noProblems(evaluatePersianNaturalness(text, FORMAL));
  });

  it('reads untranslated prose as a problem, where a two-word term is only a note', () => {
    const prose = 'برای این کار the risk of ruin را در نظر بگیرید.';
    const asked = soleVerdict(prose, 'naturalness.english-run', FORMAL);
    expect(asked.stance).toBe('problem');
    expect(asked.confidence).toBe('medium');
    // Asked for in English, the same three words are the vocabulary that was requested.
    expect(soleVerdict(prose, 'naturalness.english-run', ENGLISH_TERMS).stance).toBe(
      'technical-english',
    );
    // And the run is reported once and in full: `the risk of ruin` is one finding of four words, not
    // two findings of two, which is what makes the length a usable fact about it.
    expect(asked.found).toBe('the risk of ruin');
    // A two-word run is the shape of a two-word term: a note, whichever style was asked for.
    const term = 'برای این کار از stack trace استفاده کنید.';
    expect(soleVerdict(term, 'naturalness.english-run', FORMAL).stance).toBe('style');
    expect(NATURALNESS_THRESHOLDS.englishPhrase).toBe(3);
  });

  it('reads spoken Persian as the instruction in a conversational answer', () => {
    const text = `اگه حجم کم بشه، ریسک هم کم ${SPOKEN}.`;
    const spoke = soleVerdict(text, 'quality.wording.informal', CONVERSATIONAL);
    expect(spoke.stance).toBe('acceptable');
    expect(spoke.reason).toContain('conversational');
    // The same sentence in a formal answer is a register note, not an error: a note is worth showing.
    const formal = soleVerdict(text, 'quality.wording.informal', FORMAL);
    expect(formal.stance).toBe('style');
    expect(formal.confidence).toBe('medium');
    // Neither context produces an actionable problem, because a register is not a mistake.
    noProblems(evaluatePersianNaturalness(text, CONVERSATIONAL));
    noProblems(evaluatePersianNaturalness(text, FORMAL));
  });

  it('keeps an error an error in every context', () => {
    const text = 'در این معامله ۳ معاملات بسته شد.';
    for (const context of CONTEXTS) {
      const report = evaluatePersianNaturalness(text, context);
      const verdict = report.verdicts.find(
        (candidate) => candidate.check === 'quality.grammar.plural-after-numeral',
      );
      expect(verdict?.stance, JSON.stringify(context)).toBe('problem');
      expect(verdict?.confidence).toBe('high');
      expect(report.problems.length).toBeGreaterThan(0);
    }
  });

  it('never makes the writer’s own wording a problem, whatever the context', () => {
    // `میباشد` is a bookish construction: the quality layer files it as the writer's wording, and no
    // tone or terminology style turns somebody's phrasing into a defect.
    const text = 'این مورد میباشد.';
    for (const context of CONTEXTS) {
      const report = evaluatePersianNaturalness(text, context);
      noProblems(report);
      expect(
        report.verdicts.find((verdict) => verdict.check === 'quality.wording.bookish-phrase')
          ?.stance,
      ).toBe('user-wording');
    }
  });

  it('judges only the vocabulary it was handed, and says so', () => {
    expect(isNaturalnessContext(FORMAL)).toBe(true);
    expect(isNaturalnessContext({ tone: 'chatty', terminology: 'product-terms' })).toBe(false);
    expect(isNaturalnessContext({ tone: 'formal', terminology: 'persian' })).toBe(false);
  });
});

describe('the shapes this layer reads for itself', () => {
  it('reports a sentence carried over from English word for word', () => {
    const verdict = soleVerdict('این تنظیمات حائز اهمیت است.', 'naturalness.literal-frame');
    expect(verdict.found).toBe('حائز اهمیت');
    expect(verdict.stance).toBe('problem');
    expect(verdict.aspect).toBe('wording');
    // Every frame in the table is found by its own kind of sentence.
    for (const frame of [
      'این معامله نقش مهمی در نتیجه ایفا می‌کند.',
      'این ابزار قادر به تحلیل بازار است.',
      'لازم به ذکر است که ریسک کم است.',
      'این مورد مورد استفاده قرار می‌گیرد.',
      'تغییر مسیر امکان‌پذیر است.',
      'این کار به عنوان یک راه‌حل پیشنهاد شد.',
    ]) {
      expect(verdictsOf(frame, 'naturalness.literal-frame'), frame).toHaveLength(1);
    }
  });

  it('does not overlap the quality layer’s bookish table, in either direction', () => {
    // Two tables, two questions: `در خصوص` is a bookish *word* — Persian, and correct, in a register
    // this product's copy does not use — while `حائز اهمیت است` is an English *frame* wearing Persian
    // words. A phrase claimed by both would be reported twice, so the day the tables overlap is the
    // day this case fails and somebody decides which layer owns it.
    for (const bookish of [
      'در خصوص این معامله بگویید.',
      'این مورد میباشد.',
      'بر روی نمودار بکشید.',
      'و یا این کار را انجام دهید.',
    ]) {
      expect(verdictsOf(bookish, 'naturalness.literal-frame'), bookish).toEqual([]);
    }
    for (const frame of [
      'این تنظیمات حائز اهمیت است.',
      'این ابزار قادر به تحلیل است.',
      'لازم به ذکر است که ریسک کم است.',
    ]) {
      expect(
        evaluatePersianQuality(frame).findings.filter(
          (finding) => finding.check === 'wording.bookish-phrase',
        ),
        frame,
      ).toEqual([]);
    }
  });

  it('reports the same sentence written twice, and not a sentence written once', () => {
    const verdict = soleVerdict(
      'حد ضرر را رعایت کنید. حجم را کم کنید. حد ضرر را رعایت کنید.',
      'naturalness.repeated-sentence',
    );
    expect(verdict.stance).toBe('problem');
    expect(verdict.confidence).toBe('high');
    expect(verdict.found).toBe('حد ضرر را رعایت کنید.');
    // Below the floor a repeat is not reported: two words are a phrase somebody may use twice.
    expect(
      verdictsOf('صبر کن. حجم را کم کنید. صبر کن.', 'naturalness.repeated-sentence'),
    ).toHaveLength(0);
    // And a heading over the sentence it introduces is not a repeated sentence.
    expect(
      verdictsOf('مدیریت ریسک: مدیریت ریسک یعنی کم کردن زیان.', 'naturalness.repeated-sentence'),
    ).toHaveLength(0);
    expect(NATURALNESS_THRESHOLDS.sentenceWords).toBe(4);
  });

  it('counts a word that is doing all the work, at the threshold and no lower', () => {
    const verdict = soleVerdict(
      CASE_FOR['naturalness.repeated-word'] ?? '',
      'naturalness.repeated-word',
    );
    expect(verdict.found).toBe('مدیریت');
    expect(verdict.stance).toBe('style');
    expect(verdict.confidence).toBe('low');
    expect(verdict.reason).toContain('4 times');
    // One use below the threshold is not a finding: the table's own number is the boundary.
    expect(
      verdictsOf('مدیریت ریسک مهم است. مدیریت ریسک یعنی کم کردن ضرر.', 'naturalness.repeated-word'),
    ).toHaveLength(0);
    expect(NATURALNESS_THRESHOLDS.wordUses).toBe(4);
  });

  it('notes an answer whose sentences all open the same way', () => {
    const verdict = soleVerdict(
      CASE_FOR['naturalness.shared-opener'] ?? '',
      'naturalness.shared-opener',
    );
    expect(verdict.found).toBe('این');
    expect(verdict.stance).toBe('style');
    expect(verdict.confidence).toBe('low');
    expect(verdict.reason).toContain('3 sentences');
    expect(
      verdictsOf(
        'این ابزار ریسک را نشان می‌دهد. سپس ضرر را کم می‌کند.',
        'naturalness.shared-opener',
      ),
    ).toHaveLength(0);
  });

  it('reports the switch when one answer addresses the reader two ways', () => {
    const verdict = soleVerdict(
      CASE_FOR['naturalness.address-drift'] ?? '',
      'naturalness.address-drift',
    );
    expect(verdict.stance).toBe('style');
    expect(verdict.confidence).toBe('medium');
    // The *switch* is what is reported, and only once: the finding sits on the second form used.
    expect(verdict.found).toBe('شما');
    // One address used consistently is not drift, in either direction.
    for (const one of [
      'اگر شما صبر کنید بهتر است؛ شما باید حد ضرر را رعایت کنید.',
      'اگر تو صبر کنی بهتر است؛ تو باید حد ضرر را رعایت کنی.',
    ]) {
      expect(verdictsOf(one, 'naturalness.address-drift'), one).toHaveLength(0);
    }
  });

  it('reads a run of English words where a term would be one word', () => {
    const verdict = soleVerdict(
      'برای این کار از risk reward استفاده کنید.',
      'naturalness.english-run',
    );
    expect(verdict.found).toBe('risk reward');
    expect(verdict.stance).toBe('style');
    expect(verdict.aspect).toBe('script');
    // One Latin word is the quality layer's finding and not a run, and a symbol is neither.
    expect(verdictsOf('اندیکاتور ATR روی XAUUSD است.', 'naturalness.english-run')).toHaveLength(0);
    expect(verdictsOf('این trend صعودی است.', 'naturalness.english-run')).toHaveLength(0);
  });

  it('gives every check an id, a stance, an aspect and a case of its own that fires', () => {
    const ids = NATURALNESS_CHECKS.map((check) => check.id);
    expect(new Set(ids).size).toBe(ids.length);
    // The catalogue is the case table: a check added here without a sentence that fires it fails, and a
    // case written for a check that was renamed fails from the other side.
    expect(Object.keys(CASE_FOR).sort()).toEqual([...ids].sort());
    for (const check of NATURALNESS_CHECKS) {
      expect(naturalnessCheckIds(), check.id).toContain(check.id);
      expect(NATURALNESS_STANCES, check.id).toContain(check.stance);
      expect(NATURALNESS_CONFIDENCES, check.id).toContain(check.confidence);
      expect(NATURALNESS_ASPECTS, check.id).toContain(check.aspect);
      expect(check.describe.length, check.id).toBeGreaterThan(20);
      const found = verdictsIn(CASE_FOR[check.id] ?? '').filter(
        (verdict) => verdict.check === check.id,
      );
      expect(found.length, `${check.id} produced nothing on its own case`).toBeGreaterThan(0);
      // The verdict carries what the catalogue declares, so a check cannot describe itself one way and
      // report another. Under the product's own context, which is the one that means "this is wrong
      // here"; the cases above are the ones that show a context moving a stance.
      expect(found[0]?.aspect).toBe(check.aspect);
      expect(found[0]?.stance).toBe(check.stance);
    }
    // The catalogue is both layers' ids, and every quality check is in it exactly once.
    expect(naturalnessCheckIds().filter((id) => id.startsWith('quality.'))).toHaveLength(
      LANGUAGE_QUALITY_CHECKS.length,
    );
  });

  it('groups by what a reader notices, and covers every axis the quality layer has', () => {
    const report = evaluatePersianNaturalness(
      'این مورد میباشد و trend تغییر کرد و ۳ معاملات بسته شد و بله!!',
      FORMAL,
    );
    expect(Object.keys(report.counts).sort()).toEqual([...NATURALNESS_ASPECTS].sort());
    const counted = NATURALNESS_ASPECTS.reduce((total, aspect) => total + report.counts[aspect], 0);
    expect(counted).toBe(report.verdicts.length);
    // The four axes of that sentence arrive as four different things a reader notices, which is what
    // the total axis-to-aspect table is for: a new axis cannot arrive here ungrouped.
    const aspects = new Set(report.verdicts.map((verdict) => verdict.aspect));
    expect([...aspects].sort()).toEqual(['marks', 'script', 'structure', 'wording']);
    for (const check of LANGUAGE_QUALITY_CHECKS) {
      expect(LANGUAGE_QUALITY_AXES, check.id).toContain(check.axis);
    }
  });
});

describe('what it must not report', () => {
  it('says nothing about a natural Persian answer, in either register', () => {
    for (const text of [
      'در این معامله نسبت ریسک به سود ۱ به ۳ بود و حد ضرر رعایت شد.',
      'حجم پوزیشن را کم کنید؛ نسبت R:R برابر ۲ است.',
      'اگر تارگت خورد، بخشی از پوزیشن را ببندید.',
      'خب، این معامله خوب بود. ریسکت کم بود و تارگت خورد.',
    ]) {
      for (const context of [FORMAL, CONVERSATIONAL]) {
        expect(
          evaluatePersianNaturalness(text, context).problems.map((problem) => problem.check),
          `${text} (${context.tone})`,
        ).toEqual([]);
      }
    }
  });

  it('says nothing about a symbol, an identifier or a URL', () => {
    for (const text of [
      'اندیکاتور ATR روی XAUUSD مقدار ۲.۴ را نشان می‌دهد.',
      'فایل `index.ts` را باز کنید و `npm test` را اجرا کنید.',
      'نسبت BTC/USDT برابر ۱.۲ است.',
      'آدرس https://example.com/docs را ببینید.',
    ]) {
      const report = evaluatePersianNaturalness(text, FORMAL);
      noProblems(report);
      expect(verdictsOf(text, 'naturalness.english-run'), text).toEqual([]);
    }
  });

  it('notices a command written as prose, and says the same thing the quality layer says', () => {
    // The boundary rather than an oversight, and the same one the quality layer draws: `npm test`
    // outside a code span is two Latin words in Persian prose, and an answer that means "type this"
    // writes it in backticks. Both layers name the same characters — a note here, and a finding there —
    // which is what makes this a boundary rather than a disagreement.
    const bare = 'فایل `index.ts` را باز کنید و npm test را اجرا کنید.';
    const noted = verdictsOf(bare, 'naturalness.english-run');
    expect(noted).toHaveLength(1);
    expect(noted[0]?.found).toBe('npm test');
    expect(noted[0]?.stance).toBe('style');
    expect(
      evaluatePersianQuality(bare).findings.filter(
        (finding) => finding.check === 'script.latin-word-in-persian',
      ),
    ).toHaveLength(2);
  });

  it('says nothing about a term used twice, under either terminology style', () => {
    // Repetition is a count and a count is not a judgement: under `english-terms` the same Latin term
    // twice is the instruction, and under the product's own terms the count still stops at a note.
    const text = 'برای تعیین حجم از ATR استفاده کنید و ATR را با نوسان بازار بسنجید.';
    for (const context of [FORMAL, ENGLISH_TERMS, BILINGUAL]) {
      noProblems(evaluatePersianNaturalness(text, context));
    }
  });

  it('says nothing about a frame inside text the caller protected', () => {
    const text = 'معیار ما حائز اهمیت بود و عدد ۳ را ثبت کردیم.';
    expect(verdictsOf(text, 'naturalness.literal-frame')).toHaveLength(1);
    expect(
      evaluatePersianNaturalness(text, FORMAL, {
        protectedLiterals: ['حائز اهمیت'],
      }).verdicts.filter((verdict) => verdict.check === 'naturalness.literal-frame'),
    ).toEqual([]);
    // A code span is protected by the span finder itself, without the caller saying anything.
    expect(verdictsOf('معیار ما `حائز اهمیت` بود.', 'naturalness.literal-frame')).toHaveLength(0);
  });

  it('reports no naturalness problem in the product’s own written Persian', () => {
    // The corpus, rather than a sentence somebody chose to make the layer look right: every Persian
    // value in the interface catalogue that is long enough to be prose. Two things are being claimed.
    // The six checks are *quiet* about written Persian this product already ships, which is what a note
    // rather than a complaint has to mean; and they cannot be quietly quiet, because the floor below
    // fails if the extraction stopped finding the catalogue.
    const source = readFileSync(join('web', 'src', 'i18n', 'messages.fa.ts'), 'utf8');
    const values = [...source.matchAll(/^\s{2,}'[^']+':\s*\n?\s*'(.+)',$/gm)]
      .map((match) => (match[1] ?? '').replace(/\\'/g, "'"))
      .filter((value) => value.length > 24);
    expect(values.length, 'the catalogue scan found no prose').toBeGreaterThan(1000);

    const offenders: string[] = [];
    let notes = 0;
    for (const value of values) {
      const report = evaluatePersianNaturalness(value, FORMAL);
      notes += report.verdicts.filter((verdict) => verdict.stance === 'style').length;
      for (const problem of report.problems) {
        if (problem.check.startsWith('naturalness.'))
          offenders.push(`${problem.check} «${problem.found}»`);
      }
    }
    expect(offenders, 'a shape this layer reads is written by the product itself').toEqual([]);
    // And the notes it does have are few, which is the other half of being quiet.
    expect(notes / values.length).toBeLessThan(0.05);
  });

  it('reports an issue and a confidence, and never a replacement', () => {
    const report = evaluatePersianNaturalness(
      'این تنظیمات حائز اهمیت است و stop loss را رعایت کنید.',
      FORMAL,
    );
    expect(report.problems.length).toBeGreaterThan(0);
    for (const problem of report.problems) {
      expect(problem.stance).toBe('problem');
      expect(NATURALNESS_CONFIDENCES).toContain(problem.confidence);
      // Nothing in a verdict is a sentence to paste back: the reason explains, and that is all.
      expect(Object.keys(problem).sort()).toEqual([
        'aspect',
        'check',
        'confidence',
        'found',
        'index',
        'reason',
        'stance',
      ]);
    }
    // The actionable list is ordered by confidence first, so the surest thing is shown first.
    const order = report.problems.map((problem) =>
      NATURALNESS_CONFIDENCES.indexOf(problem.confidence),
    );
    expect([...order].sort((left, right) => left - right)).toEqual(order);
  });
});

describe('the report a surface reads', () => {
  it('can reach every stance, which is what makes the five worth having', () => {
    const texts = [
      'این مورد میباشد.',
      'در این معامله ۳ معاملات بسته شد.',
      `اگه بشه ${SPOKEN} بهتر است.`,
      'این trend صعودی است.',
      'این تنظیمات حائز اهمیت است.',
    ];
    const stances = new Set<NaturalnessStance>();
    for (const text of texts) {
      for (const context of CONTEXTS) {
        for (const verdict of verdictsIn(text, context)) stances.add(verdict.stance);
      }
    }
    expect([...stances].sort()).toEqual([...NATURALNESS_STANCES].sort());
    // And the reading this layer re-reads is the quality layer's own list, not a second one.
    expect([...LANGUAGE_QUALITY_READINGS].sort()).toEqual(
      ['conversational', 'error', 'intentional-english', 'terminology', 'user-wording'].sort(),
    );
  });

  it('carries what it accepted, from the quality report rather than a second scan', () => {
    const text = 'اندیکاتور ATR و XAUUSD را ببینید.';
    const report = evaluatePersianNaturalness(text, FORMAL);
    expect(report.accepted.map((entry) => entry.kind)).toContain('terminology');
    expect(report.accepted).toEqual(evaluatePersianQuality(text).recognised);
    expect(report.quality.checks.length).toBeGreaterThan(0);
    // The quality report it carries is the one it read: same findings, same order.
    expect(report.quality.findings).toEqual(evaluatePersianQuality(text).findings);
  });

  it('leaves a check out when a caller asks, from either catalogue', () => {
    const text = 'این تنظیمات حائز اهمیت است و در این معامله ۳ معاملات بسته شد.';
    const report = evaluatePersianNaturalness(text, FORMAL, {
      exceptChecks: ['naturalness.literal-frame', 'grammar.plural-after-numeral'],
    });
    expect(report.skippedChecks).toContain('naturalness.literal-frame');
    expect(report.skippedChecks).toContain('grammar.plural-after-numeral');
    expect(report.checks).not.toContain('naturalness.literal-frame');
    expect(report.checks).not.toContain('grammar.plural-after-numeral');
    noProblems(report);
    // The quality report it read says the same thing, which is what keeps one answer to one question.
    expect(report.quality.skippedChecks).toContain('grammar.plural-after-numeral');
  });

  it('names its limits, and does not repeat the quality layer’s', () => {
    const report = evaluatePersianNaturalness('سلام', FORMAL);
    expect(report.notEvaluated).toEqual(
      expect.arrayContaining([...NATURALNESS_LIMITS, ...LANGUAGE_QUALITY_LIMITS]),
    );
    for (const question of ['meaning', 'collocation', 'how long an answer']) {
      expect(
        report.notEvaluated.some((line) => line.includes(question)),
        question,
      ).toBe(true);
    }
    // The two lists are disjoint: a limit cannot be papered over by being written twice, and the
    // naturalness list is about fit while the quality list is about correctness.
    expect(NATURALNESS_LIMITS.filter((line) => LANGUAGE_QUALITY_LIMITS.includes(line))).toEqual([]);
  });

  it('reads the tables it is given rather than copies of them', () => {
    // The thresholds are exported data, so a reader can see the number a count was measured against.
    for (const [name, value] of Object.entries(NATURALNESS_THRESHOLDS)) {
      expect(value, name).toBeGreaterThan(1);
    }
    // The quality module is imported, not re-implemented: its catalogue has one home, and this layer
    // names every one of its checks rather than a subset of the ones it happens to read.
    expect(naturalnessCheckIds().filter((id) => id.startsWith('quality.'))).toHaveLength(
      LANGUAGE_QUALITY_CHECKS.length,
    );
  });
});
