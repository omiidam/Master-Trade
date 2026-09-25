/**
 * Phase 7.5.2.3 — grammar, spelling and the language QA pipeline.
 *
 * The claims, in the order they can fail:
 *
 *   1. **The catalogue is complete, cited and exercised.** Every rule the pipeline can run has a
 *      regression case here, cites a key the seeded store actually trusts, and behaves the way its own
 *      `enforcement` says it does — a `correct` rule produces its case, a `report` rule changes nothing
 *      and names what it saw.
 *   2. **The grammar rules say what the product writes.** Sentence structure, agreement, the ezafe, the
 *      invariant adjective, and the mixed Persian + English technical sentence this product is full of.
 *   3. **The spelling layer is a decision, not a spellchecker.** A compound is corrected because it is a
 *      fixed string; a spoken form and a questionable plural are *reported*, because a person can see
 *      what a pattern cannot.
 *   4. **The pipeline is one engine.** Normalization, grammar and spelling are the same runner, the same
 *      memory gate and the same protected spans, so `languageQa` cannot disagree with the layers it
 *      drives — and every suggestion says which stage saw it and whether it was applied.
 *   5. **A suggestion becomes knowledge only through a decision.** Nothing is written silently; an
 *      accepted correction carries a source, a reason, a version and a status; and a candidate that
 *      shipped as a proposal does nothing until a reviewer accepts it.
 *
 * Every form that turns on an invisible character is *derived* from the catalogue rather than retyped
 * here: the compound pairs and the register table come from `spelling.ts`, the half-space is written
 * `${ZWNJ}`, and the Persian marks come from `fa.ts`. A retyped half-space is a half-space that
 * eventually differs — which is exactly the failure this phase is about, and the canonical-input case
 * below is what turns it from a wish into an assertion.
 */

import { describe, expect, it } from 'vitest';
import {
  COMPOUND_PAIRS,
  GRAMMAR_RULES,
  LANGUAGE_LOCALE,
  LANGUAGE_QA_FAMILIES,
  LANGUAGE_RULES,
  LanguageMemory,
  PERSIAN_PERCENT_SIGN,
  PERSIAN_PUNCTUATION,
  REGISTER_FORMS,
  SPELLING_RULES,
  TERMINOLOGY_QA_RULE,
  ZWNJ,
  approveForm,
  authorisedLanguageRules,
  isLanguageMemoryId,
  languageMemoryId,
  languageQa,
  languageRule,
  languageRuleState,
  normalizePersianContent,
  promoteLanguageRule,
  protectedLiterals,
  retireLanguageRule,
  runRules,
  seededLanguageMemory,
  terminologyFindings,
  type LanguageSuggestion,
} from '../web/src/language/index.js';

/** A fixed instant, so every decision in this suite is reproducible. */
const AT = '2026-09-25T12:00:00.000Z';

/** The one rule that ships as a candidate: recorded, visible, inert until a reviewer accepts it. */
const CANDIDATE_RULE = 'spelling.compound.hich-kodam';

/** The Persian comma, semicolon and question mark, named so a test is not a typing exercise. */
const { comma, semicolon, questionMark } = PERSIAN_PUNCTUATION;

/** A compound pair from the catalogue, so a case is the source data rather than a retyped copy. */
function pair(slug: string): (typeof COMPOUND_PAIRS)[number] {
  const found = COMPOUND_PAIRS.find((candidate) => candidate.slug === slug);
  if (found === undefined) throw new Error(`there is no compound pair called \`${slug}\``);
  return found;
}

/** One compound pair's regression case: what this product does not write, and what it writes. */
function pairCase(slug: string): readonly [string, string, string] {
  const { written, correct } = pair(slug);
  return [`spelling.compound.${slug}`, written, correct];
}

/** The first spoken form and the written one it stands for. */
const [SPOKEN, WRITTEN] = REGISTER_FORMS[0] as readonly [string, string];

/**
 * One regression case per rule, `[id, input, expected]`.
 *
 * A `report` rule's expected text is its input, which is the assertion: the rule looked and changed
 * nothing. The completeness test below fails if a rule is added without a case here, or if a case
 * survives the rule being removed.
 */
const CASES: readonly (readonly [string, string, string])[] = [
  // Task 1 — grammar.
  ['grammar.mixed-script-boundary', 'XAUUSDرا', 'XAUUSD را'],
  ['grammar.ezafe-yeh', 'خانه ی من', `خانه${ZWNJ}ی من`],
  ['grammar.plural-after-numeral', '۳ معاملات', '۳ معاملات'],
  ['grammar.verb-number-agreement', `پوزیشن${ZWNJ}ها شد`, `پوزیشن${ZWNJ}ها شد`],
  ['grammar.pronoun-agreement', 'ما است', 'ما است'],
  ['grammar.object-marker-before-verb', 'این معامله را', 'این معامله را'],
  ['grammar.adjective-invariant', 'خوبها', 'خوبها'],
  // Task 2 — spelling, register and punctuation.
  pairCase('bajaye'),
  pairCase('batour'),
  pairCase('darsoorat'),
  pairCase('bemarour'),
  pairCase('benedrat'),
  pairCase('hichkas'),
  pairCase('anha'),
  pairCase('hich-kodam'),
  ['spelling.register', SPOKEN, SPOKEN],
  ['spelling.repeated-mark', ',,', comma],
];

/** The seeded store with every rule this build has trusted — the candidate accepted by a reviewer. */
function acceptedMemory(): LanguageMemory {
  const memory = seededLanguageMemory();
  const decision = promoteLanguageRule(CANDIDATE_RULE, memory, {
    origin: 'human-review',
    reference: 'review: phase-7.5.2.3',
    at: AT,
    expectedVersion: 0,
  });
  if (decision.outcome !== 'accepted') {
    throw new Error(`the candidate could not be accepted: ${decision.outcome}`);
  }
  return memory;
}

/** All the suggestions one rule produced, for a readable failure. */
function suggestionsFor(
  report: { readonly suggestions: readonly LanguageSuggestion[] },
  ruleId: string,
): LanguageSuggestion[] {
  return report.suggestions.filter((suggestion) => suggestion.rule === ruleId);
}

describe('the rule catalogue is complete, cited and exercised', () => {
  it('has one regression case per rule, and no case for a rule that is not there', () => {
    const catalogued = LANGUAGE_RULES.map((rule) => rule.id).sort();
    const exercised = CASES.map(([id]) => id).sort();
    expect(exercised).toEqual(catalogued);
    expect(new Set(catalogued).size).toBe(catalogued.length);
  });

  it('says up front what each rule does, and how sure the project is', () => {
    for (const rule of LANGUAGE_RULES) {
      expect(['grammar', 'spelling']).toContain(rule.kind);
      expect(['correct', 'report']).toContain(rule.enforcement);
      expect(rule.version).toBeGreaterThan(0);
      // A rule carries the knowledge it stands for, so the store's prose and the code's behaviour are
      // one fact stated twice rather than two that drift.
      expect(rule.value.length).toBeGreaterThan(20);
      expect(rule.notes.length).toBeGreaterThan(20);
      expect(rule.examples.length).toBeGreaterThan(0);
      expect(rule.confidence).toBeGreaterThan(0);
      expect(rule.confidence).toBeLessThanOrEqual(1);
      expect(['human-review', 'upstream-standard', 'agent-proposal']).toContain(rule.origin);
      // `correct` rules must have something to apply and `report` rules something to find; the other
      // half would be a rule that is declared and can never do anything.
      expect(rule.enforcement === 'correct' ? rule.correct : rule.detect).toBeTypeOf('function');
      expect(rule.protectedKinds.length).toBeGreaterThan(0);
      // A rule that offers a correction has to offer a *different* string — the whole reason
      // `replacePair` refuses a pair whose two spellings have come to match.
      for (const wrong of rule.examples) {
        expect(wrong).not.toBe('');
      }
    }
    // The two catalogues are separate files with separate concerns, and the pipeline's list is both.
    expect(LANGUAGE_RULES.length).toBe(GRAMMAR_RULES.length + SPELLING_RULES.length);
  });

  it('writes every case in the Persian this product already normalizes', () => {
    for (const [id, from] of CASES) {
      // If a case needed the normalizer to fix it, it would be testing Phase 7.5.2.1 rather than this
      // phase — and a half-space or an Arabic yeh typed by accident would quietly pass as a grammar
      // case. This is the assertion that makes the readable Persian above safe to write as characters.
      expect(normalizePersianContent(from).appliedRules, `${id} needed normalization`).toEqual([]);
      expect(normalizePersianContent(from).text, `${id} is not canonical input`).toBe(from);
    }
  });

  it('applies the case, or reports it, and names the rule that did', () => {
    const memory = acceptedMemory();
    for (const [id, from, to] of CASES) {
      const report = languageQa(from, { memory });
      const rule = languageRule(id);
      expect(rule, `${id} is not in the catalogue`).toBeDefined();
      expect(suggestionsFor(report, id), `${id} found nothing in its own case`).not.toEqual([]);
      if (rule?.enforcement === 'report') {
        expect(report.text, `${id} changed text it should only report`).toBe(from);
        expect(suggestionsFor(report, id).every((suggestion) => !suggestion.deterministic)).toBe(
          true,
        );
      } else {
        expect(report.text, `${id} did not produce its own case`).toBe(to);
        expect(
          report.stages
            .filter((stage) => stage.family === rule?.kind)
            .flatMap((stage) => stage.applied),
          `${id} is not named as the rule that applied`,
        ).toContain(id);
      }
    }
  });

  it('cites only knowledge the seeded store trusts, and runs by default', () => {
    const memory = seededLanguageMemory();
    for (const rule of LANGUAGE_RULES) {
      // One rule ships as a candidate, so it is *pending* rather than current — which is the learnable
      // path: it exists, it is addressable, it is visible in every report as a skipped rule, and it
      // changes nothing until a review accepts it.
      const waiting = memory.pending(rule.key);
      const entry = memory.get(rule.key) ?? waiting;
      expect(entry, `${rule.key} is not in the store`).toBeDefined();
      expect(['rule', 'orthography']).toContain(entry?.kind);
      expect(entry?.version).toBe(1);
      if (rule.key === CANDIDATE_RULE) {
        expect(waiting?.provenance.origin).toBe('agent-proposal');
        expect(memory.get(rule.key), `${rule.key} is current knowledge`).toBeUndefined();
        expect(entry?.status).toBe('proposed');
      } else {
        expect(entry?.status, `${rule.key} is not trusted by default`).toBe('trusted');
      }
    }
    // Exactly one rule is waiting on a person, and nothing else is quietly missing.
    expect(authorisedLanguageRules(memory).length).toBe(LANGUAGE_RULES.length - 1);
    expect(languageQa('').skippedRules).toEqual([CANDIDATE_RULE]);
  });
});

describe('Task 1 — grammar: sentence structure, agreement and mixed technical text', () => {
  const memory = acceptedMemory();

  it('puts a boundary between scripts, and a half-space where the suffix attaches', () => {
    // Two scripts written without a boundary read as one word, which is the whole reason this rule is
    // first: everything after it sees words rather than a run of characters.
    expect(languageQa('XAUUSDرا خریدم', { memory }).text).toBe('XAUUSD را خریدم');
    expect(languageQa('قیمتXAUUSD', { memory }).text).toBe('قیمت XAUUSD');
    // A plural ending binds to the token in front of it, so it takes a half-space rather than a space.
    expect(languageQa('ETFها بخرم', { memory }).text).toBe(`ETF${ZWNJ}ها بخرم`);
    expect(languageQa('ETFترین', { memory }).text).toBe(`ETF${ZWNJ}ترین`);
    // Every other Persian word is a word of its own, and a token already written with a half-space is
    // left exactly as it is.
    expect(languageQa('ETF خریدم', { memory }).text).toBe('ETF خریدم');
    expect(languageQa(`ETF${ZWNJ}ها بخرم`, { memory }).text).toBe(`ETF${ZWNJ}ها بخرم`);
    // A figure is not two words, however it is written: `3345R` is a number wearing a letter.
    for (const untouched of ['3345R', 'XAUUSD 3345.20', 'R multiple 2.60', 'v1.2.3', 'BTC/USDT']) {
      expect(languageQa(untouched, { memory }).text, untouched).toBe(untouched);
    }
  });

  it('attaches an ezafe written as a separate word, and only where a vowel precedes it', () => {
    expect(languageQa('خانه ی من', { memory }).text).toBe(`خانه${ZWNJ}ی من`);
    expect(languageQa('پای من', { memory }).text).toBe('پای من');
    // Nothing here says this `ی` is an ezafe, so the rule leaves it: a normalizer that rewrote every
    // standalone `ی` would eventually rewrite a letter being named.
    expect(languageQa('حرف ی', { memory }).text).toBe('حرف ی');
    expect(languageQa('Y و ی', { memory }).text).toBe('Y و ی');
    // `و` is one letter that happens to be a vowel, and it is the conjunction "and": gluing a `ی` to it
    // would rewrite a sentence rather than a spelling.
    expect(languageQa('و ی', { memory }).text).toBe('و ی');
    // A shorter word than that is still a word, and still takes the attachment.
    expect(languageQa('پا ی من', { memory }).text).toBe(`پا${ZWNJ}ی من`);
  });

  it('reports a numeral followed by a plural, and derives the singular where it can', () => {
    const report = languageQa(`۳ معاملات و ۵ نکته${ZWNJ}ها بسته شد`, { memory });
    expect(suggestionsFor(report, 'grammar.plural-after-numeral').map((s) => s.suggestion)).toEqual(
      ['۳ معامله', '۵ نکته'],
    );
    // Reported, never corrected: the singular of a broken plural is a table, not a suffix.
    expect(report.text).toBe(`۳ معاملات و ۵ نکته${ZWNJ}ها بسته شد`);
    // The numeral is its own numeric span, and the rule asks after the *noun* — asking after the
    // numeral would mean it could never fire on the one thing it exists for.
    expect(languageQa('۳ معامله بستم', { memory }).suggestions).toEqual([]);
    expect(
      suggestionsFor(
        languageQa('XAUUSD 3345.20 را دیدم', { memory }),
        'grammar.plural-after-numeral',
      ),
    ).toEqual([]);
  });

  it('reports a plural subject with a singular verb, across one intervening word', () => {
    const direct = languageQa(`پوزیشن${ZWNJ}ها شد`, { memory });
    expect(direct.review.map((s) => s.suggestion)).toContain(`پوزیشن${ZWNJ}ها شدند`);
    // `پوزیشنها بسته شد` is the ordinary sentence; a rule that could only see subject-then-verb would
    // miss it, so exactly one word is allowed between them.
    const split = languageQa(`پوزیشن${ZWNJ}ها بسته شد و معاملات خوب بود`, { memory });
    expect(split.review.map((s) => s.suggestion)).toContain(`پوزیشن${ZWNJ}ها بسته شدند`);
    // `ان` and `ات` are deliberately not subjects: `تهران` ends in `ان` and is singular, and a rule
    // that guessed would report correct sentences as wrong.
    expect(languageQa('تهران بود', { memory }).suggestions).toEqual([]);
    // The plural pronouns are stated exactly by the rule below, so this one leaves them to it.
    expect(
      suggestionsFor(languageQa('ما است', { memory }), 'grammar.verb-number-agreement'),
    ).toEqual([]);
  });

  it('conjugates a plural pronoun from closed lists on both sides', () => {
    const found = suggestionsFor(
      languageQa('ما است و شما بود', { memory }),
      'grammar.pronoun-agreement',
    );
    expect(found.map((s) => s.suggestion)).toEqual(['ما هستیم', 'شما بودید']);
    expect(found.every((s) => !s.deterministic)).toBe(true);
    // Both lists are closed, so a pronoun with the right verb is not reported and a correct copula is
    // never rewritten: this rule has no false positives by construction.
    expect(languageQa('ما هستیم و شما بودید', { memory }).suggestions).toEqual([]);
    // The half-space spelling of `آنها` and the closed-up one are both known, because a rule that only
    // saw one of them would quietly do nothing about half the text it was written for.
    expect(
      suggestionsFor(languageQa(`آن${ZWNJ}ها بود`, { memory }), 'grammar.pronoun-agreement').map(
        (s) => s.suggestion,
      ),
    ).toEqual([`آن${ZWNJ}ها بودند`]);
    expect(
      suggestionsFor(
        languageQa(pair('anha').written + ' بود', { memory }),
        'grammar.pronoun-agreement',
      ).map((s) => s.suggestion),
    ).toEqual([`آنها بودند`]);
  });

  it('reports an object marker with no verb after it, at a line end as well as a text end', () => {
    const report = languageQa('این معامله را\nمتن بعدی را بستم.', { memory });
    expect(suggestionsFor(report, 'grammar.object-marker-before-verb').length).toBe(1);
    expect(report.text).toBe('این معامله را\nمتن بعدی را بستم.');
    // The marker is a word: without that, `چرا؟` would be reported for ending in the same two letters.
    expect(languageQa(`چرا${questionMark}`, { memory }).suggestions).toEqual([]);
    expect(languageQa('این معامله را بستم.', { memory }).suggestions).toEqual([]);
  });

  it('reports an adjective carrying a plural ending, and says why it may be right', () => {
    const found = suggestionsFor(
      languageQa('معاملات خوبها بودند', { memory }),
      'grammar.adjective-invariant',
    );
    expect(found.map((s) => s.suggestion)).toEqual(['خوب']);
    expect(found[0]?.reason).toContain('noun');
    // `خوبها` can be a legitimate noun, so the ending alone is not a mistake.
    expect(languageQa('معاملات خوبها بودند', { memory }).text).toBe('معاملات خوبها بودند');
    expect(languageQa('معاملات خوب بودند', { memory }).suggestions).toEqual([]);
  });

  it('handles the mixed Persian and English technical paragraph this product is full of', () => {
    const { written, correct } = pair('bajaye');
    const text = `قیمت XAUUSD امروز ۳۳۴۵ است، و پوزیشن${ZWNJ}ها بسته شد. ${written} این، ETF${ZWNJ}ها را ببین.`;
    const report = languageQa(text, { memory });
    expect(report.text).toBe(
      `قیمت XAUUSD امروز ۳۳۴۵ است، و پوزیشن${ZWNJ}ها بسته شد. ${correct} این، ETF${ZWNJ}ها را ببین.`,
    );
    expect(report.review.map((s) => s.suggestion)).toContain(`پوزیشن${ZWNJ}ها بسته شدند`);
    // The report is *complete*: replaying the corrections it lists, in the order the rules ran and
    // right-to-left within each rule, reproduces `report.text` exactly. That is a stronger claim than
    // it looks — nothing was changed that the report does not name, and nothing the report names was
    // changed twice. A per-suggestion slice against the stage's input would not show this: an offset
    // belongs to the text *its rule* received, and an earlier rule in the same pass has already moved
    // every offset after it.
    let rebuilt = report.input;
    for (const stage of report.stages) {
      expect(stage.input, `${stage.family} is not the text the stage before produced`).toBe(
        rebuilt,
      );
      for (const ruleId of stage.applied) {
        const edits = stage.suggestions
          .filter((suggestion) => suggestion.deterministic && suggestion.rule === ruleId)
          .sort((left, right) => right.index - left.index);
        for (const edit of edits) {
          rebuilt =
            rebuilt.slice(0, edit.index) +
            edit.suggestion +
            rebuilt.slice(edit.index + edit.length);
        }
      }
    }
    expect(rebuilt).toBe(report.text);
    // And every change names the characters it replaced, except a pure insertion, which replaced none.
    for (const correction of report.corrections) {
      expect(correction.length === 0 || correction.found.length > 0).toBe(true);
    }
  });
});

describe('Task 2 — spelling, register and punctuation', () => {
  const memory = acceptedMemory();

  it('joins a compound this product writes as two words', () => {
    for (const { written, correct, slug } of COMPOUND_PAIRS) {
      if (slug === 'hich-kodam') continue; // recorded and inert until a reviewer accepts it
      expect(languageQa(written, { memory }).text, slug).toBe(correct);
      // The pair is a decision about a *string*, so the store's prose and the code agree on it.
      expect(languageRule(`spelling.compound.${slug}`)?.examples).toEqual([correct, written]);
    }
  });

  it('matches a compound as a whole word, never inside a longer one', () => {
    // `درصورتیکه` is a typo of its own; rewriting the `درصورت` inside it would be a different word.
    expect(languageQa('درصورتیکه', { memory }).text).toBe('درصورتیکه');
    expect(languageQa('بجاییکه', { memory }).text).toBe('بجاییکه');
    const { written, correct } = pair('bajaye');
    expect(languageQa(`${written} این`, { memory }).text).toBe(`${correct} این`);
    // A Latin token next to the pair is separated by the grammar rule and the pair still applies.
    expect(languageQa(`XAUUSD را ${written}`, { memory }).text).toBe(`XAUUSD را ${correct}`);
  });

  it('reports a spoken form rather than rewriting a writer’s register', () => {
    const report = languageQa(`${SPOKEN} یا ${REGISTER_FORMS[1]?.[0]}`, { memory });
    const found = suggestionsFor(report, 'spelling.register');
    expect(found.map((s) => s.suggestion)).toEqual([WRITTEN, REGISTER_FORMS[1]?.[1]]);
    expect(found.every((s) => !s.deterministic)).toBe(true);
    // The written column is the form the product renders, so the half-space after `می` is in it.
    expect(WRITTEN).toContain(`${ZWNJ}`);
    // A register check that guesses insults a writer, so the list is closed: a colloquialism that is
    // not in it is left alone, and the product can still render a note somebody wrote.
    expect(report.text).toBe(`${SPOKEN} یا ${REGISTER_FORMS[1]?.[0]}`);
    expect(languageQa(`${WRITTEN} یا نوشته میشود`, { memory }).suggestions).toEqual([]);
  });

  it('collapses a repeated mark, whichever script the copies came from', () => {
    expect(languageQa(`بستم,,`, { memory }).text).toBe(`بستم${comma}`);
    expect(languageQa(`بستم${semicolon}${semicolon}`, { memory }).text).toBe(`بستم${semicolon}`);
    expect(languageQa(`بستم${questionMark}${questionMark}`, { memory }).text).toBe(
      `بستم${questionMark}`,
    );
    expect(languageQa('بستم!!', { memory }).text).toBe('بستم!');
    expect(languageQa(`${PERSIAN_PERCENT_SIGN}${PERSIAN_PERCENT_SIGN}`, { memory }).text).toBe(
      PERSIAN_PERCENT_SIGN,
    );
    // The mixed pair is the case the rule is actually written for: a copy-paste that leaves an ASCII
    // mark beside a Persian one, and what survives is the Persian mark.
    expect(languageQa(`بستم${comma},`, { memory }).text).toBe(`بستم${comma}`);
    // An ellipsis is a style choice, and collapsing it would rewrite a pause rather than a slip.
    expect(languageQa('بستم...', { memory }).text).toBe('بستم...');
  });

  it('leaves English and technical text exactly as it was', () => {
    for (const untouched of [
      'Sizing 2.5% of equity',
      'BTC/USDT closed at 3345.20',
      'R multiple: 2.60, and the stop held',
      'https://a.example/x?q=1',
      '/usr/local/bin/master-trade',
      'process-state.agreement',
      'index.ts and README.md',
    ]) {
      const report = languageQa(untouched, { memory });
      expect(report.text, untouched).toBe(untouched);
      expect(report.suggestions, untouched).toEqual([]);
    }
  });
});

describe('Task 3 — the pipeline: normalize → check → suggest → decide', () => {
  const memory = acceptedMemory();
  const TEXT = `قیمت XAUUSD امروز ۳۳۴۵ است. ${pair('bajaye').written} این، ترید را ببین. ما است.`;

  it('runs the four families in order, each on the text the one before produced', () => {
    const report = languageQa(TEXT, { memory });
    expect(report.stages.map((stage) => stage.family)).toEqual([...LANGUAGE_QA_FAMILIES]);
    expect(report.stages[0]?.input).toBe(report.input);
    for (const [index, stage] of report.stages.entries()) {
      // The next stage's input *is* this stage's output, which is what makes an offset meaningful:
      // it is an offset into text a caller holds.
      const next = report.stages[index + 1];
      if (next !== undefined) expect(next.input).toBe(stage.output);
    }
    expect(report.stages.at(-1)?.output).toBe(report.text);
  });

  it('drives the layers rather than re-implementing them', () => {
    const report = languageQa(TEXT, { memory });
    const normalized = normalizePersianContent(TEXT, { memory });
    expect(report.stages[0]?.output).toBe(normalized.text);
    // The grammar stage is the shared runner over the grammar catalogue — one engine, one memory gate,
    // one definition of "protected", so the pipeline cannot disagree with the layer it drives.
    expect(report.stages.find((stage) => stage.family === 'grammar')?.output).toBe(
      runRules(normalized.text, GRAMMAR_RULES, { memory }).text,
    );
    // Terminology is Phase 7.5.2.2's check, not a second vocabulary.
    const terminology = terminologyFindings(report.text, { memory });
    expect(report.stages.at(-1)?.suggestions.map((s) => s.found)).toEqual(
      terminology.map((finding) => finding.foundFa),
    );
    expect(terminology.length).toBeGreaterThan(0);
    expect(report.stages.at(-1)?.suggestions[0]?.suggestion).toBe(terminology[0]?.preferredFa);
  });

  it('surfaces the reports of the layer it drives, not only that layer’s corrections', () => {
    // Phase 7.5.2.1 knows things it will not fix — the missing half-space is the clearest case — and a
    // caller that held only `languageQa` would otherwise lose them, because no later stage looks for a
    // half-space. So the normalization stage carries its findings as well as its changes.
    const text = `پوزیشن ها بسته شد`;
    const report = languageQa(text, { memory });
    const normalized = normalizePersianContent(text, { memory });
    expect(normalized.findings.length).toBeGreaterThan(0);
    const carried = new Set(
      (report.stages[0]?.suggestions ?? []).map(
        (suggestion) => `${suggestion.rule}@${suggestion.index}`,
      ),
    );
    for (const finding of normalized.findings) {
      expect(carried.has(`${finding.rule}@${finding.index}`), finding.rule).toBe(true);
    }
    // A finding was not applied — it is the same text out, and the suggestion is not deterministic.
    expect(report.text).toBe(text);
    expect(
      (report.stages[0]?.suggestions ?? [])
        .filter((suggestion) =>
          normalized.findings.some((finding) => finding.rule === suggestion.rule),
        )
        .every((suggestion) => !suggestion.deterministic),
    ).toBe(true);
  });

  it('separates what it applied from what a person decides, and says so per suggestion', () => {
    const report = languageQa(TEXT, { memory });
    expect(report.corrections).toEqual(report.suggestions.filter((s) => s.deterministic));
    expect(report.review).toEqual(report.suggestions.filter((s) => !s.deterministic));
    expect(report.corrections.length).toBeGreaterThan(0);
    expect(report.review.length).toBeGreaterThan(0);
    // Nothing probabilistic is dressed up as a fact: a suggestion carries an offset, a rule and a
    // reason, and no score, model or probability. Reported things are the ones a reviewer decides.
    for (const suggestion of report.review) {
      expect(suggestion.rule).toMatch(/^grammar\.|^spelling\.|^terminology\./);
      expect(Object.keys(suggestion)).not.toContain('confidence');
    }
    // A correction is only ever a mechanical rule's, and the rule that made it is on record as applied.
    const applied = new Set(report.stages.flatMap((stage) => stage.applied));
    for (const correction of report.corrections) expect(applied.has(correction.rule)).toBe(true);
  });

  it('is deterministic and idempotent: the same knowledge gives the same report', () => {
    const first = languageQa(TEXT, { memory });
    expect(languageQa(TEXT, { memory })).toEqual(first);
    // A second pass over its own output has nothing left to correct.
    const again = languageQa(first.text, { memory });
    expect(again.text).toBe(first.text);
    expect(again.corrections).toEqual([]);
    // And the knowledge did not move: running the pipeline never writes to the store.
    const store = seededLanguageMemory();
    const before = JSON.stringify(store.snapshot());
    languageQa(TEXT, { memory: store });
    expect(JSON.stringify(store.snapshot())).toBe(before);
    expect(languageQa(TEXT).skippedRules).toEqual([CANDIDATE_RULE]);
  });

  it('can be narrowed to one rule, or told to leave one out', () => {
    const { written, correct } = pair('bajaye');
    const only = languageQa(`${written} این`, { memory, only: ['spelling.compound.bajaye'] });
    expect(only.text).toBe(`${correct} این`);
    expect(only.suggestions.every((s) => s.rule === 'spelling.compound.bajaye')).toBe(true);

    const excepted = languageQa(`${written} این. ${SPOKEN}`, {
      memory,
      exceptRules: ['spelling.compound.bajaye'],
    });
    expect(excepted.text).toBe(`${written} این. ${SPOKEN}`);
    expect(excepted.skippedRules).toContain('spelling.compound.bajaye');

    // Terminology is a rule like any other at this level, so a surface can exclude it too.
    const consistent = 'ترید را ببین';
    expect(
      languageQa(consistent, { memory, exceptRules: [TERMINOLOGY_QA_RULE] }).suggestions,
    ).toEqual([]);
    expect(languageQa(consistent, { memory }).review.map((s) => s?.found ?? '')).toEqual(['ترید']);
  });

  it('protects a span a rule must not touch, at every stage', () => {
    // A reviewed exception is a literal the whole pipeline leaves alone — the mechanism is Phase
    // 7.5.2.1's `exception` kind, and this phase reuses it rather than inventing a flag.
    const { written } = pair('bajaye');
    const approving = seededLanguageMemory();
    const decision = approveForm(written, approving, {
      slug: 'quoted-form',
      origin: 'human-review',
      reference: 'review: a quotation',
      at: AT,
      reason: 'the sentence quotes a user’s spelling, so it is reproduced as written',
    });
    expect(decision.outcome).toBe('accepted');
    expect(protectedLiterals(approving)).toContain(written);
    const quoted = `او نوشت: ${written} این`;
    expect(languageQa(quoted, { memory: approving }).text).toBe(quoted);
    expect(languageQa(quoted, { memory: approving }).suggestions.map((s) => s.rule)).not.toContain(
      'spelling.compound.bajaye',
    );
    // The same text with the seeded store is corrected, so the protection is what did it.
    expect(languageQa(quoted, { memory }).text).toBe(`او نوشت: ${pair('bajaye').correct} این`);
  });
});

describe('a suggestion becomes knowledge only through a decision', () => {
  const { written: candidateWritten, correct: candidateCorrect } = pair('hich-kodam');

  it('does nothing with a rule that shipped as a candidate, and shows it as skipped', () => {
    const memory = seededLanguageMemory();
    const text = `${candidateWritten} نیامد`;
    const report = languageQa(text, { memory });
    expect(report.text).toBe(text);
    expect(report.suggestions).toEqual([]);
    expect(report.skippedRules).toEqual([CANDIDATE_RULE]);
    // A pending entry is not knowledge: it is addressable, and it is not current.
    expect(memory.pending(CANDIDATE_RULE)?.value).toContain(candidateCorrect);
  });

  it('accepts a candidate in a review, and the reviewer owns the provenance', () => {
    const memory = seededLanguageMemory();
    const decision = promoteLanguageRule(CANDIDATE_RULE, memory, {
      origin: 'human-review',
      reference: 'review: phase-7.5.2.3',
      at: AT,
      expectedVersion: 0,
    });
    expect(decision.outcome).toBe('accepted');
    if (decision.outcome !== 'accepted') return;
    // Source, reason, version and status, all four, on the knowledge that was accepted.
    expect(decision.entry.status).toBe('trusted');
    expect(decision.entry.version).toBe(1);
    expect(decision.entry.provenance.origin).toBe('human-review');
    expect(decision.entry.provenance.reference).toBe('review: phase-7.5.2.3');
    expect(decision.entry.provenance.recordedAt).toBe(AT);
    expect(decision.entry.value).toContain(candidateCorrect);
    expect(decision.entry.notes).toContain('candidate');

    // And now it runs, which is the only thing the acceptance was for.
    expect(languageQa(`${candidateWritten} نیامد`, { memory }).text).toBe(
      `${candidateCorrect} نیامد`,
    );
    expect(languageRuleState(CANDIDATE_RULE, memory)).toEqual({
      id: CANDIDATE_RULE,
      key: CANDIDATE_RULE,
      status: 'trusted',
      version: 1,
    });
  });

  it('refuses a decision that has nothing to decide, or that a model tried to make itself', () => {
    const memory = seededLanguageMemory();
    // Nothing is waiting on an already-decided rule.
    const nothing = promoteLanguageRule('grammar.ezafe-yeh', memory, {
      origin: 'human-review',
      reference: 'review: again',
      at: AT,
      expectedVersion: 1,
    });
    expect(nothing.outcome).toBe('rejected');
    if (nothing.outcome === 'rejected') expect(nothing.reason).toContain('nothing waiting');

    // An agent cannot accept its own proposal, whatever it says.
    const selfReview = promoteLanguageRule(CANDIDATE_RULE, memory, {
      origin: 'agent-proposal',
      reference: 'model: session-42',
      at: AT,
      expectedVersion: 0,
    });
    expect(selfReview.outcome).toBe('rejected');
    if (selfReview.outcome === 'rejected')
      expect(selfReview.reason).toContain('cannot be reviewed');
    expect(languageQa(`${candidateWritten} نیامد`, { memory }).skippedRules).toEqual([
      CANDIDATE_RULE,
    ]);

    // A rule this build does not have is not a rule it can decide about.
    const absent = 'spelling.compound.nope';
    expect(
      promoteLanguageRule(absent, memory, {
        origin: 'human-review',
        reference: 'review: nope',
        at: AT,
        expectedVersion: 0,
      }).outcome,
    ).toBe('rejected');
    expect(
      retireLanguageRule(absent, memory, {
        origin: 'human-review',
        reference: 'review: nope',
        at: AT,
        expectedVersion: 0,
      }).outcome,
    ).toBe('rejected');
    expect(languageRule(absent)).toBeUndefined();
    expect(languageRuleState(absent, memory)).toBeUndefined();
  });

  it('retires a rule with a versioned decision rather than a flag', () => {
    const memory = seededLanguageMemory();
    const decision = retireLanguageRule('grammar.ezafe-yeh', memory, {
      origin: 'human-review',
      reference: 'review: the copy no longer writes an ezafe',
      at: AT,
      expectedVersion: 1,
    });
    expect(decision.outcome).toBe('accepted');
    if (decision.outcome !== 'accepted') return;
    expect(decision.entry.status).toBe('deprecated');
    expect(decision.entry.provenance.reference).toContain('no longer writes');
    // The code is still there; the knowledge stops being trusted, so the rule stops running.
    const report = languageQa('خانه ی من', { memory });
    expect(report.text).toBe('خانه ی من');
    expect(report.skippedRules).toContain('grammar.ezafe-yeh');
    expect(languageRuleState('grammar.ezafe-yeh', memory)?.status).toBe('deprecated');
    // A decision written against a version that has moved is refused rather than applied blindly.
    expect(
      retireLanguageRule('grammar.ezafe-yeh', memory, {
        origin: 'human-review',
        reference: 'review: stale',
        at: AT,
        expectedVersion: 1,
      }).outcome,
    ).toBe('rejected');
  });

  it('approves a form a reviewer decided is right, in the store, with a source and a reason', () => {
    const memory = seededLanguageMemory();
    const note = `${SPOKEN} بیای`;
    expect(
      suggestionsFor(languageQa(note, { memory }), 'spelling.register').map((s) => s.found),
    ).toEqual([SPOKEN]);

    const decision = approveForm(SPOKEN, memory, {
      slug: 'spoken-note',
      origin: 'human-review',
      reference: 'review: a user’s own note is reproduced as written',
      at: AT,
      reason: 'a note a user wrote is quoted, not corrected',
    });
    expect(decision.outcome).toBe('accepted');
    if (decision.outcome !== 'accepted') return;
    expect(decision.entry.kind).toBe('exception');
    expect(decision.entry.value).toBe('a note a user wrote is quoted, not corrected');
    expect(decision.entry.examples).toEqual([SPOKEN]);
    expect(decision.entry.provenance.reference).toContain('reproduced as written');

    // The suggestion is gone, and the text is untouched — the exception spared it.
    const after = languageQa(note, { memory });
    expect(after.review).toEqual([]);
    expect(after.text).toBe(note);

    // A decision with nothing in it is refused, and an unreviewed one does not approve anything.
    expect(
      approveForm('   ', memory, {
        slug: 'empty',
        origin: 'human-review',
        reference: 'review: empty',
        at: AT,
        reason: 'nothing',
      }).outcome,
    ).toBe('rejected');
    const [otherSpoken] = REGISTER_FORMS.at(-1) as readonly [string, string];
    const parked = approveForm(otherSpoken, memory, {
      slug: 'spoken-last',
      origin: 'agent-proposal',
      reference: 'model: session-42',
      at: AT,
      reason: 'the model thought this was fine',
    });
    expect(parked.outcome).toBe('pending');
    if (parked.outcome === 'pending') expect(parked.reason).toContain('review');
    expect(languageQa(otherSpoken, { memory }).review.map((s) => s.found)).toEqual([otherSpoken]);
  });

  it('survives a snapshot round trip, decisions and statuses included', () => {
    const memory = acceptedMemory();
    retireLanguageRule('grammar.object-marker-before-verb', memory, {
      origin: 'human-review',
      reference: 'review: phase-7.5.2.3',
      at: AT,
      expectedVersion: 1,
    });
    const { written } = pair('bajaye');
    approveForm(written, memory, {
      slug: 'quoted-form',
      origin: 'human-review',
      reference: 'review: a quotation',
      at: AT,
      reason: 'quoted as written',
    });

    const reloaded = LanguageMemory.from(JSON.parse(JSON.stringify(memory.snapshot())));
    expect(languageRuleState(CANDIDATE_RULE, reloaded)?.status).toBe('trusted');
    expect(languageRuleState('grammar.object-marker-before-verb', reloaded)?.status).toBe(
      'deprecated',
    );
    expect(languageQa(candidateWritten, { memory: reloaded }).text).toBe(candidateCorrect);
    expect(languageQa('این معامله را', { memory: reloaded }).suggestions).toEqual([]);
    expect(languageQa(written, { memory: reloaded }).text).toBe(written);

    // A pending proposal is not in a snapshot — it is not knowledge yet — which is the trust ladder
    // surviving the round trip.
    const pending = seededLanguageMemory();
    approveForm(`${SPOKEN}`, pending, {
      slug: 'parked-note',
      origin: 'agent-proposal',
      reference: 'model: session-42',
      at: AT,
      reason: 'the model thought this was fine',
    });
    expect(pending.pending('exception.language-qa.parked-note')).toBeDefined();
    const pendingReload = LanguageMemory.from(JSON.parse(JSON.stringify(pending.snapshot())));
    expect(pendingReload.pending('exception.language-qa.parked-note')).toBeUndefined();
  });
});

describe('the language rules stay out of the other stores', () => {
  it('is knowledge in the language store, not Agent Memory and not a credential', () => {
    const memory = seededLanguageMemory();
    for (const entry of memory.list()) {
      expect(entry.locale).toBe(LANGUAGE_LOCALE);
      expect(isLanguageMemoryId(languageMemoryId(entry.key))).toBe(true);
      expect(languageMemoryId(entry.key)).toBe(`lang:${entry.key}`);
      expect(entry.key).not.toMatch(/^mem_/);
      for (const field of Object.keys(entry)) {
        expect(field).not.toMatch(/secret|token|credential|password/i);
      }
    }
    // The rules live under their own key namespace, which is what keeps a language decision from
    // colliding with a terminology term or an orthographic entry.
    for (const rule of LANGUAGE_RULES) {
      expect(rule.key).toMatch(/^(rule|spelling)\./);
    }
  });
});
