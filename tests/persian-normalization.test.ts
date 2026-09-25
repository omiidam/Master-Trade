/**
 * Phase 7.5.2.1 — the normalization contract.
 *
 * Four claims, each of which is easy to write in a comment and hard to hold in code:
 *
 *   1. **Every rule is one fixed behaviour.** The table below names a case for each rule in the
 *      catalogue, and the first test refuses to pass if a rule is added without one. A rule that
 *      ships untested is a rule that will one day rewrite something nobody meant to rewrite.
 *   2. **English and technical text are untouched.** Not "mostly untouched": a corpus of English,
 *      symbols, URLs, paths, identifiers and figures comes out byte-identical, and the report
 *      contains no change at all.
 *   3. **The store decides, not the code.** A rule runs only while the language store trusts the
 *      knowledge at its key, so model output cannot switch a correction on and a deprecation can
 *      switch one off.
 *   4. **It is deterministic and idempotent.** Same input and same store, same report; and a second
 *      pass over the output changes nothing, which is the property that lets a caller normalize
 *      before it stores and again before it renders without fearing the second pass.
 *
 * The Persian in here is written with escapes rather than as characters, on purpose: U+064A and
 * U+06CC are the same shape on screen, and a test suite is the worst possible place to hide which one
 * is meant.
 */

import { describe, expect, it } from 'vitest';
import {
  BIDI_CONTROLS,
  FIGURE_PATTERN,
  NORMALIZATION_RULES,
  LanguageMemory,
  authorisedRules,
  isNormalizedPersian,
  latinRun,
  normalizePersianContent,
  normalizePersianText,
  normalizationRule,
  normalizationRuleKeys,
  persianFindings,
  protectedLiterals,
  seededLanguageMemory,
  type LanguageProposal,
} from '../web/src/language/index.js';

/** A fixed instant, so every proposal in this suite is reproducible. */
const AT = '2026-09-25T12:00:00.000Z';

/** A reviewed proposal, for building a store the pipeline will listen to. */
function reviewed(overrides: Partial<LanguageProposal> = {}): LanguageProposal {
  return {
    key: 'rule.persian-spacing',
    kind: 'rule',
    value: 'Persian prose has one space between words.',
    origin: 'human-review',
    reference: 'review: test',
    recordedAt: AT,
    baseVersion: 0,
    ...overrides,
  };
}

/**
 * One regression case per rule: `[rule id, input, expected]`.
 *
 * The two `report` rules have no correction to make, so their expected value is the input — the
 * assertion for them is that they appear in the *findings*, which is checked separately below.
 */
const CASES: readonly (readonly [string, string, string])[] = [
  ['character.presentation-forms', '\uFDFC', '\u0631\u06CC\u0627\u0644'],
  ['character.farsi-yeh', '\u064A\u0649', '\u06CC\u06CC'],
  ['character.farsi-keheh', '\u0631\u0643\u0646', '\u0631\u06A9\u0646'],
  ['character.kaf-variants', '\u06AA\u06AB', '\u06A9\u06A9'],
  ['character.tatweel-removed', '\u0645\u0640\u0627\u0646\u0640\u062F', '\u0645\u0627\u0646\u062F'],
  ['character.harakat-removed', '\u06A9\u0650\u062A\u0627\u0628', '\u06A9\u062A\u0627\u0628'],
  [
    'digit.arabic-indic-to-persian',
    '\u0642\u06CC\u0645\u062A \u0663\u0663\u0664\u0665',
    '\u0642\u06CC\u0645\u062A \u06F3\u06F3\u06F4\u06F5',
  ],
  [
    'digit.latin-in-prose',
    '\u0642\u06CC\u0645\u062A \u0648\u0631\u0648\u062F 3345',
    '\u0642\u06CC\u0645\u062A \u0648\u0631\u0648\u062F \u06F3\u06F3\u06F4\u06F5',
  ],
  ['punctuation.persian-marks', '\u067E\u0631\u0633\u0634?', '\u067E\u0631\u0633\u0634\u061F'],
  ['punctuation.persian-percent', '\u06F2\u066B\u06F5%', '\u06F2\u066B\u06F5\u066A'],
  [
    'zwnj.collapse-runs',
    '\u0645\u06CC\u200C\u200C\u0631\u0648\u062F',
    '\u0645\u06CC\u200C\u0631\u0648\u062F',
  ],
  [
    'zwnj.drop-beside-space',
    '\u0645\u06CC\u200C \u0631\u0648\u062F',
    '\u0645\u06CC \u0631\u0648\u062F',
  ],
  ['zwnj.drop-at-edges', '\u200C\u0645\u06CC', '\u0645\u06CC'],
  [
    'spacing.collapse-horizontal-runs',
    '\u0642\u06CC\u0645\u062A  \u0648\u0631\u0648\u062F',
    '\u0642\u06CC\u0645\u062A \u0648\u0631\u0648\u062F',
  ],
  [
    'spacing.trim-line-trailing',
    '\u0642\u06CC\u0645\u062A   \n\u0633\u0648\u062F',
    '\u0642\u06CC\u0645\u062A\n\u0633\u0648\u062F',
  ],
  [
    'spacing.no-space-before-mark',
    '\u0642\u06CC\u0645\u062A \u060C \u0648\u0631\u0648\u062F',
    '\u0642\u06CC\u0645\u062A\u060C \u0648\u0631\u0648\u062F',
  ],
  [
    'spacing.one-space-after-mark',
    '\u0631\u0648\u0646\u062F.\u0635\u0639\u0648\u062F\u06CC',
    '\u0631\u0648\u0646\u062F. \u0635\u0639\u0648\u062F\u06CC',
  ],
  ['zwnj.attach-candidate', '\u0645\u06CC \u0631\u0648\u062F', '\u0645\u06CC \u0631\u0648\u062F'],
  [
    'digit.persian-digits-in-technical-run',
    'XAUUSD \u06F3\u06F3\u06F4\u06F5',
    'XAUUSD \u06F3\u06F3\u06F4\u06F5',
  ],
];

/** Text that must come out exactly as it went in. */
const UNTOUCHED: readonly string[] = [
  'Sizing 2.5% of equity',
  'BTC/USDT closed at 3345.20',
  'R multiple: 2.60',
  'index.ts',
  'process-state.agreement',
  'https://a.example/x?q=1',
  'a, b; c?',
  'Won 3 of 4; risk 0.5%',
  'v1.2.3',
  '/usr/local/bin/master-trade',
  '2026-09-19 10:20',
  'MA 50 > MA 200',
  'The fi ligature and \uFF11\u00B2 stay put',
  'quote, said the shell',
  'XAUUSD 3345.20',
  'نسبت 1:3',
  '\u0646\u0633\u0628\u062A \u0631\u06CC\u0633\u06A9 1:3',
];

/** Persian prose that is already correct, including the mixed case a real screen will hold. */
const ALREADY_CORRECT: readonly string[] = [
  '\u0633\u0644\u0627\u0645',
  '\u0642\u06CC\u0645\u062A \u0648\u0631\u0648\u062F \u06F3\u06F3\u06F4\u06F5 \u0627\u0633\u062A',
  '\u0645\u06CC\u200C\u0631\u0648\u062F',
  '\u06A9\u062A\u0627\u0628\u200C\u0647\u0627\u06CC \u0645\u0646',
  '\u062A\u0627\u06CC\u0645\u200C\u0641\u0631\u06CC\u0645 \u06F1 \u0633\u0627\u0639\u062A\u0647',
  'XAUUSD \u062F\u0631 \u062A\u0627\u06CC\u0645\u200C\u0641\u0631\u06CC\u0645 \u06F1 \u0633\u0627\u0639\u062A\u0647\u060C 3345.20 \u0631\u0627 \u0634\u06A9\u0633\u062A \u0648 R \u0622\u0646 2.60 \u0628\u0648\u062F.',
];

const MIXED_SAMPLES: readonly string[] = [
  ...CASES.map(([, from]) => from),
  ...UNTOUCHED,
  ...ALREADY_CORRECT,
  'XAUUSD  \u062F\u0631 \u062A\u0627\u06CC\u0645 \u0641\u0631\u06CC\u0645 \u06F1 \u0633\u0627\u0639\u062A\u0647 , 3345.20 \u0631\u0627 \u0634\u06A9\u0633\u062A?',
];

describe('the rule catalogue is complete, cited and exercised', () => {
  it('has one regression case per rule, and no case for a rule that is not there', () => {
    const catalogued = NORMALIZATION_RULES.map((rule) => rule.id).sort();
    const exercised = CASES.map(([id]) => id).sort();
    expect(exercised).toEqual(catalogued);
    expect(new Set(exercised).size).toBe(exercised.length);
  });

  it('applies the case, or reports it, and names the rule that did', () => {
    for (const [id, from, to] of CASES) {
      const report = normalizePersianContent(from);
      const rule = normalizationRule(id);
      expect(rule, `${id} is not in the catalogue`).toBeDefined();
      if (rule?.enforcement === 'report') {
        // A report rule changes nothing and says what it saw.
        expect(report.text, `${id} changed text it should only report`).toBe(from);
        expect(
          report.findings.map((finding) => finding.rule),
          `${id} found nothing in its own case`,
        ).toContain(id);
      } else {
        expect(report.text, `${id} did not produce its own case`).toBe(to);
        expect(report.appliedRules, `${id} is not named as the rule that applied`).toContain(id);
      }
    }
  });

  it('cites only knowledge the seeded store trusts, and runs by default', () => {
    const memory = seededLanguageMemory();
    const trusted = new Set(memory.trusted().map((entry) => entry.key));
    for (const key of normalizationRuleKeys()) {
      expect(trusted.has(key), `${key} is not trusted knowledge`).toBe(true);
      expect(['orthography', 'rule', 'wording', 'exception']).toContain(memory.get(key)?.kind);
    }
    // Nothing is off by default: an unauthorised rule would be a rule nobody can see is missing.
    expect(authorisedRules(memory).length).toBe(NORMALIZATION_RULES.length);
    expect(normalizePersianContent('').skippedRules).toEqual([]);
  });

  it('reports each change with its rule, its version, its key and the exact characters', () => {
    const report = normalizePersianContent('\u0642\u06CC\u0645\u062A  \u0648\u0631\u0648\u062F');
    const collapse = report.changes.find(
      (change) => change.rule === 'spacing.collapse-horizontal-runs',
    );
    expect(collapse).toBeDefined();
    expect(collapse?.key).toBe('rule.persian-spacing');
    expect(collapse?.ruleVersion).toBe(1);
    expect(collapse?.before).toBe('  ');
    expect(collapse?.after).toBe(' ');
    // The index is the offset in the text *that rule* received, which is what makes a report
    // explainable without diffing two blobs.
    expect(report.input.slice(collapse?.index ?? 0, (collapse?.index ?? 0) + 2)).toBe('  ');
  });
});

describe('Task 1 — character normalization', () => {
  it('folds the Arabic letters Persian does not write', () => {
    const { text } = normalizePersianContent('\u0628\u064A\u062A \u0643\u0644\u0645\u0647 \u0649');
    expect([...text].map((character) => character.codePointAt(0))).toEqual([
      0x0628, 0x06cc, 0x062a, 0x0020, 0x06a9, 0x0644, 0x0645, 0x0647, 0x0020, 0x06cc,
    ]);
  });

  it('folds the Arabic presentation forms onto their base letters, in Arabic script only', () => {
    // The whole reason NFKC is scoped: applied to everything it would also rewrite the Latin
    // compatibility characters — full-width digits, the `fi` ligature, U+00B2 — and that is a change
    // to English text this product has no reason to make.
    expect(normalizePersianContent('\uFEF1').text).toBe('\u06CC');
    expect(normalizePersianContent('The fi ligature and \uFF11\u00B2 stay put').text).toBe(
      'The fi ligature and \uFF11\u00B2 stay put',
    );
  });

  it('removes the tatweel and the vowel marks, and keeps the combining hamza and madda', () => {
    expect(normalizePersianContent('\u0645\u0640\u0627\u0646\u0640\u062F').text).toBe(
      '\u0645\u0627\u0646\u062F',
    );
    expect(normalizePersianContent('\u06A9\u0650\u062A\u0627\u0628 \u0627\u0650').text).toBe(
      '\u06A9\u062A\u0627\u0628 \u0627',
    );
    // U+0653–U+0655 are *combining* hamza and madda: a decomposed letter legitimately holds them, so
    // they are never deleted — which is exactly why the vowel-mark range stops at U+0652. Where
    // Unicode can compose them with the letter, NFKC does, and that is a canonical form rather than a
    // change of text: `ا` + hamza above *is* `آ`.
    expect([normalizePersianContent('\u0627\u0653').text.codePointAt(0)]).toEqual([0x0622]);
    expect([normalizePersianContent('\u0627\u0654').text.codePointAt(0)]).toEqual([0x0623]);
    expect([normalizePersianContent('\u0627\u0655').text.codePointAt(0)]).toEqual([0x0625]);
    // A letter with no precomposed form keeps the mark, rather than losing it.
    for (const combining of ['\u0653', '\u0654', '\u0655']) {
      expect(normalizePersianContent(`\u06A9${combining}`).text).toBe(`\u06A9${combining}`);
    }
  });

  it('keeps the identity function and the content pipeline apart, on purpose', () => {
    // `normalizePersianText` answers "are these the same string?" and folds every digit to do it; the
    // pipeline answers "is this written the way Persian is written?" over mixed content and leaves a
    // technical figure alone. Running the first one over a price to "tidy" a screen would corrupt it.
    expect(normalizePersianText('XAUUSD 3345.20')).toBe(
      'XAUUSD \u06F3\u06F3\u06F4\u06F5.\u06F2\u06F0',
    );
    expect(normalizePersianContent('XAUUSD 3345.20').text).toBe('XAUUSD 3345.20');
  });

  it('leaves English and technical text exactly as it was', () => {
    for (const sample of UNTOUCHED) {
      const report = normalizePersianContent(sample);
      expect(report.text, `${sample} was rewritten`).toBe(sample);
      expect(report.changes, `${sample} produced changes`).toEqual([]);
      expect(report.appliedRules, `${sample} ran a rule`).toEqual([]);
    }
  });
});

describe('Task 2 — spacing, ZWNJ and punctuation', () => {
  it('collapses horizontal runs and trims line ends, and never touches structure', () => {
    const block =
      '\u0642\u06CC\u0645\u062A  \u0648\u0631\u0648\u062F   \n    \u0633\u0648\u062F  \u062E\u0627\u0644\u0635\n\n\u067E\u0627\u06CC\u0627\u0646';
    const report = normalizePersianContent(block);
    // Two spaces become one, trailing whitespace goes, and the blank line and the indentation — the
    // things a pasted block depends on — are still exactly where they were.
    expect(report.text).toBe(
      '\u0642\u06CC\u0645\u062A \u0648\u0631\u0648\u062F\n    \u0633\u0648\u062F \u062E\u0627\u0644\u0635\n\n\u067E\u0627\u06CC\u0627\u0646',
    );
    expect(report.text.split('\n').length).toBe(block.split('\n').length);
  });

  it('keeps a mark attached to its word and spaced from the next one', () => {
    const report = normalizePersianContent(
      '\u0642\u06CC\u0645\u062A \u060C \u0648\u0631\u0648\u062F  .  \u0633\u0648\u062F',
    );
    expect(report.text).toBe(
      '\u0642\u06CC\u0645\u062A\u060C \u0648\u0631\u0648\u062F. \u0633\u0648\u062F',
    );
  });

  it('folds punctuation only where the nearer letter is Persian', () => {
    expect(
      normalizePersianContent('\u067E\u0631\u0633\u0634? \u062E\u0648\u0628\u06CC\u061F').text,
    ).toBe('\u067E\u0631\u0633\u0634\u061F \u062E\u0648\u0628\u06CC\u061F');
    // Beside Latin text the ASCII mark is not a mistake, and the pipeline says so.
    for (const sample of ['quote, said the shell', 'a, b; c?', 'BTC/USDT, daily']) {
      expect(normalizePersianContent(sample).text).toBe(sample);
    }
  });

  it('makes the percent sign follow its figure, which is what CLDR does', () => {
    // Two scripts, two signs — measured against `Intl` in the locale suite, not decided here.
    expect(new Intl.NumberFormat('fa-IR', { style: 'percent' }).format(0.25)).toContain('\u066A');
    expect(new Intl.NumberFormat('fa-IR-u-nu-latn', { style: 'percent' }).format(0.25)).toContain(
      '%',
    );
    expect(
      normalizePersianContent('\u0631\u0634\u062F \u06F2\u066B\u06F5% \u0628\u0648\u062F').text,
    ).toBe('\u0631\u0634\u062F \u06F2\u066B\u06F5\u066A \u0628\u0648\u062F');
    // A figure written in Latin digits keeps the sign that goes with them.
    expect(normalizePersianContent('\u0631\u0634\u062F 2.5% \u0628\u0648\u062F').text).toBe(
      '\u0631\u0634\u062F 2.5% \u0628\u0648\u062F',
    );
  });

  it('keeps every ZWNJ between letters and removes the ones that join nothing', () => {
    const goes = '\u0645\u06CC\u200C\u0631\u0648\u062F';
    expect(normalizePersianContent(goes).text).toBe(goes);
    expect(normalizePersianContent('\u0645\u06CC\u200C\u200C\u200C\u0631\u0648\u062F').text).toBe(
      goes,
    );
    expect(normalizePersianContent('\u200C\u0645\u06CC\u200C \u0631\u0648\u062F\u200C').text).toBe(
      '\u0645\u06CC \u0631\u0648\u062F',
    );
  });

  it('protects figures, URLs, paths and identifiers as spans', () => {
    const spans = FIGURE_PATTERN;
    expect('3345.20'.match(spans)?.[0]).toBe('3345.20');
    expect('\u06F1\u066C\u06F2\u06F3\u06F4\u066B\u06F5'.match(spans)?.[0]).toBe(
      '\u06F1\u066C\u06F2\u06F3\u06F4\u066B\u06F5',
    );
    for (const sample of [
      'https://a.example/x?q=1',
      'BTC/USDT',
      'index.ts',
      'v1.2.3',
      '/usr/local/bin',
      'a@b.example',
    ]) {
      const report = normalizePersianContent(
        `\u0642\u06CC\u0645\u062A  ${sample} \u0627\u0633\u062A`,
      );
      // The double space is prose and gets fixed; the token comes through untouched.
      expect(report.text).toBe(`\u0642\u06CC\u0645\u062A ${sample} \u0627\u0633\u062A`);
    }
  });

  it('reports a missing half-space, and refuses to write it', () => {
    const report = normalizePersianContent(
      '\u0645\u06CC \u0631\u0648\u062F \u0648 \u06A9\u062A\u0627\u0628 \u0647\u0627',
    );
    // Untouched: whether the space is a prefix, a plural or a word of its own is a lexical question,
    // and the honest answer is to hand it to a reviewer rather than guess.
    expect(report.text).toBe(
      '\u0645\u06CC \u0631\u0648\u062F \u0648 \u06A9\u062A\u0627\u0628 \u0647\u0627',
    );
    expect(report.findings.length).toBe(2);
    for (const finding of report.findings) {
      expect(finding.rule).toBe('zwnj.attach-candidate');
      expect(finding.key).toBe('rule.zwnj-placement');
      // The index and the match agree, so a review surface can highlight what it was told about.
      expect(report.text.slice(finding.index, finding.index + finding.match.length)).toBe(
        finding.match,
      );
      expect(finding.suggestion).toContain('\u200C');
    }
  });

  it('reports a figure wearing Persian digits beside a technical token', () => {
    const findings = persianFindings('XAUUSD \u06F3\u06F3\u06F4\u06F5 \u0628\u0648\u062F');
    expect(findings.map((finding) => finding.rule)).toContain(
      'digit.persian-digits-in-technical-run',
    );
    expect(findings[0]?.suggestion).toBe('3345');
    // And nothing in Persian prose is reported as a technical figure.
    expect(
      persianFindings('\u0642\u06CC\u0645\u062A \u06F3\u06F3\u06F4\u06F5 \u0628\u0648\u062F'),
    ).toEqual([]);
  });

  it('handles a realistic mixed paragraph', () => {
    const broken =
      'XAUUSD  \u062F\u0631 \u062A\u0627\u06CC\u0645 \u0641\u0631\u06CC\u0645 \u06F1 \u0633\u0627\u0639\u062A\u0647 , 3345.20 \u0631\u0627 \u0634\u06A9\u0633\u062A ?';
    const report = normalizePersianContent(broken);
    expect(report.text).toBe(
      'XAUUSD \u062F\u0631 \u062A\u0627\u06CC\u0645 \u0641\u0631\u06CC\u0645 \u06F1 \u0633\u0627\u0639\u062A\u0647\u060C 3345.20 \u0631\u0627 \u0634\u06A9\u0633\u062A\u061F',
    );
    // A paragraph that was already right is left alone and says so.
    const alreadyRight =
      'XAUUSD \u062F\u0631 \u062A\u0627\u06CC\u0645\u200C\u0641\u0631\u06CC\u0645 \u06F1 \u0633\u0627\u0639\u062A\u0647\u060C 3345.20 \u0631\u0627 \u0634\u06A9\u0633\u062A \u0648 R \u0622\u0646 2.60 \u0628\u0648\u062F.';
    expect(normalizePersianContent(alreadyRight)).toMatchObject({
      text: alreadyRight,
      changes: [],
      appliedRules: [],
    });
  });
});

describe('Task 3 — corrections are deterministic, testable, versionable and governed', () => {
  it('is deterministic: the same text and the same knowledge give the same report', () => {
    for (const sample of MIXED_SAMPLES) {
      const first = normalizePersianContent(sample, { memory: seededLanguageMemory() });
      const second = normalizePersianContent(sample, { memory: seededLanguageMemory() });
      expect(second).toEqual(first);
    }
  });

  it('is idempotent: a second pass over its own output changes nothing', () => {
    for (const sample of MIXED_SAMPLES) {
      const once = normalizePersianContent(sample);
      const twice = normalizePersianContent(once.text);
      expect(twice.text, `${sample} is not idempotent`).toBe(once.text);
      expect(twice.changes, `${sample} was changed twice`).toEqual([]);
      expect(isNormalizedPersian(once.text)).toBe(true);
    }
  });

  it('does not run a rule the store has not trusted', () => {
    const doubled = '\u0642\u06CC\u0645\u062A  \u0648\u0631\u0648\u062F';
    const empty = LanguageMemory.of([]);
    const report = normalizePersianContent(doubled, { memory: empty });
    expect(report.text).toBe(doubled);
    expect(report.skippedRules).toContain('spacing.collapse-horizontal-runs');
    expect(report.appliedRules).toEqual([]);
  });

  it('ignores model output, and starts obeying a reviewer', () => {
    const doubled = '\u0642\u06CC\u0645\u062A  \u0648\u0631\u0648\u062F';
    const memory = LanguageMemory.of([]);
    const proposed = memory.propose(
      reviewed({ origin: 'agent-proposal', reference: 'model: session-42' }),
    );
    expect(proposed.outcome).toBe('pending');

    // An agent's proposal is recorded and changes nothing.
    expect(normalizePersianContent(doubled, { memory }).text).toBe(doubled);

    // A reviewer accepting it is what turns the rule on, and the reviewer owns the provenance.
    const promoted = memory.review('rule.persian-spacing', {
      decision: 'accept',
      origin: 'human-review',
      reference: 'review: phase-7.5.2.1',
      at: AT,
      expectedVersion: 0,
    });
    expect(promoted?.status).toBe('trusted');
    const report = normalizePersianContent(doubled, { memory });
    expect(report.text).toBe('\u0642\u06CC\u0645\u062A \u0648\u0631\u0648\u062F');
    expect(report.appliedRules).toContain('spacing.collapse-horizontal-runs');
  });

  it('stops running a rule when its knowledge is deprecated', () => {
    const doubled = '\u0642\u06CC\u0645\u062A  \u0648\u0631\u0648\u062F';
    const memory = seededLanguageMemory();
    expect(normalizePersianContent(doubled, { memory }).text).toBe(
      '\u0642\u06CC\u0645\u062A \u0648\u0631\u0648\u062F',
    );
    memory.deprecate('rule.persian-spacing', {
      origin: 'human-review',
      reference: 'retired: the spacing rules moved to a copy-editing step',
      at: AT,
      expectedVersion: 1,
    });
    // The code is unchanged, the knowledge is not trusted, and the rule is off — which is the whole
    // point of the rule being authorised by the store rather than by its presence in the catalogue.
    const after = normalizePersianContent(doubled, { memory });
    expect(after.text).toBe(doubled);
    expect(after.skippedRules).toContain('spacing.collapse-horizontal-runs');
    // The other rules that share the key go with it, and the ones that do not are untouched.
    expect(after.skippedRules).toContain('spacing.trim-line-trailing');
    expect(after.skippedRules).not.toContain('character.farsi-yeh');
  });

  it('protects a string a reviewed exception names', () => {
    // The seeded store, because an exception is a *narrowing* of knowledge that already exists: the
    // rule still has to be authorised by its own entry.
    const memory = seededLanguageMemory();
    const protected_ = '\u06A9\u062A\u0627\u0628  \u0647\u0627';
    memory.propose(
      reviewed({
        key: 'exception.spacing.collapse-horizontal-runs',
        kind: 'exception',
        value: 'The two spaces in this heading are a layout decision, not a typo.',
        examples: [protected_],
        reference: 'review: phase-7.5.2.1',
      }),
    );
    expect(protectedLiterals(memory)).toEqual([protected_]);

    const text = `${protected_}  \u0648 \u0633\u0648\u062F`;
    const report = normalizePersianContent(text, { memory });
    // Inside the exception the two spaces survive; outside it, the rule still works.
    expect(report.text).toBe(`${protected_} \u0648 \u0633\u0648\u062F`);
    expect(report.protectedLiterals).toContain(protected_);
  });

  it('can be narrowed to one rule, or asked to leave one out', () => {
    const doubled = '\u0642\u06CC\u0645\u062A  \u0648\u0631\u0648\u062F';
    expect(normalizePersianContent(doubled, { only: ['punctuation.persian-marks'] }).text).toBe(
      doubled,
    );
    expect(
      normalizePersianContent(doubled, { except: ['spacing.collapse-horizontal-runs'] }).text,
    ).toBe(doubled);
    // A caller can also protect a string without the store knowing about it.
    expect(normalizePersianContent(doubled, { protect: [doubled] }).text).toBe(doubled);
  });

  it('is RTL-safe: isolates, ZWNJ and signed figures survive it', () => {
    const figure = latinRun('XAUUSD 3345.20');
    expect(normalizePersianContent(figure).text).toBe(figure);
    expect(normalizePersianContent(figure).text).toContain(BIDI_CONTROLS.leftToRightIsolate);

    // A Persian sentence with an isolated signed figure: the isolate controls are not letters, so the
    // figure's neighbours are decided by the words around the isolate, and the sign stays where the
    // `.num` rule put it.
    const sentence = `\u0642\u06CC\u0645\u062A \u0648\u0631\u0648\u062F ${latinRun('-1.00R')} \u0628\u0648\u062F`;
    expect(normalizePersianContent(sentence).text).toBe(sentence);

    // And the pipeline never introduces a control character of its own: everything it writes is
    // either text it replaced or a space it was told to insert.
    for (const sample of MIXED_SAMPLES) {
      for (const change of normalizePersianContent(sample).changes) {
        expect(change.after).not.toMatch(/[\u2066-\u2069\u202A-\u202E]/u);
      }
    }
  });
});
