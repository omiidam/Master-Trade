/**
 * Persian spelling and language quality — Phase 7.5.2.3.
 *
 * Three families, and the reason each one is shaped the way it is:
 *
 *   1. **Compounds written as one word** (`بجای`, `بطور`, `هیچکس`). These are the commonest spelling
 *      slips in Persian, and they are the one family here that is *corrected* rather than reported —
 *      because a compound is a fixed string, so the fix is the same every time and can be printed.
 *      Each pair is its own rule with its own store key, which is what makes them separately
 *      acceptable and separately retirable: a reviewer who dislikes one of them does not have to turn
 *      off the family.
 *   2. **Register** (`میشه` for `میشود`). Spoken forms are not spelling errors — a product that writes
 *      dialogue should keep them — so the rule reports and a person decides. The list is short and
 *      closed for the same reason the grammar rules' lists are: a register check that guesses is a
 *      register check that insults a writer.
 *   3. **Punctuation** (`,,` after a copy-paste, `؟؟` after an emphatic question). Mechanical: a
 *      repeated mark is one mark. An ellipsis is deliberately *not* in this rule — `...` is a style
 *      choice and collapsing it would silently rewrite a deliberate pause.
 *
 * What is not here, and why. Phase 7.5.2.1 already owns spacing, spacing around marks, the ASCII to
 * Persian mark fold, ZWNJ hygiene and every character-level fold, and this file does not repeat a line
 * of it. Terminology mistakes are Phase 7.5.2.2's `terminologyFindings`, which the language QA pipeline
 * calls rather than reimplements. And no spell *checker* is added: DadmaTools is a Python pipeline, and
 * a statistical spellchecker over Persian free text is the kind of thing that must not be sold as a
 * deterministic rule — see the record in `docs/persian-language.md`.
 */

import { ZWNJ } from './fa.js';
import { standaloneMatches, type LanguageRule, type RuleEdit, type RuleInput } from './rules.js';

/**
 * A compound that this product writes as two words (or with a half-space), and the slip it replaces.
 *
 * `exact` pairs are matched as whole words — never inside a longer one — which is why `درصورت` is
 * corrected inside `درصورت` and not inside `درصورتیکه`.
 */
interface CompoundPair {
  /** The form this product does not write. */
  readonly written: string;
  /** The form it does write. */
  readonly correct: string;
  /** A short slug for the key, so each pair is separately addressable. */
  readonly slug: string;
  readonly why: string;
  /** A pair that ships as a *candidate* — recorded, visible, and inert until a reviewer accepts it. */
  readonly proposed?: boolean;
}

/**
 * The pairs, each one a decision with a citation.
 *
 * The last entry is deliberately a candidate rather than a decision: it is proposed from
 * `agent-proposal`, which the store parks as `pending` — so the rule exists, appears in every QA
 * report as a skipped rule, and changes nothing until a person accepts it. That is this phase's
 * learnable path demonstrated with the machinery Phase 7.5.1 already built, and `tests/persian-qa.test.ts`
 * walks it end to end.
 */
export const COMPOUND_PAIRS: readonly CompoundPair[] = [
  {
    written: 'بجای',
    correct: 'به جای',
    slug: 'bajaye',
    why: '`به` is a separate word from the noun it governs; writing them as one is the commonest compound slip in Persian input.',
  },
  {
    written: 'بطور',
    correct: 'به طور',
    slug: 'batour',
    why: 'Same construction as `به جای`; the adverbial `به طور` is two words.',
  },
  {
    written: 'درصورت',
    correct: 'در صورت',
    slug: 'darsoorat',
    why: '`در` is a preposition, not a prefix.',
  },
  {
    written: 'بمرور',
    correct: 'به مرور',
    slug: 'bemarour',
    why: 'Same construction again; `به مرور زمان` is a phrase, not a word.',
  },
  {
    written: 'بندرت',
    correct: 'به ندرت',
    slug: 'benedrat',
    why: 'Same construction; the frequency it names is a noun of its own.',
  },
  {
    written: 'هیچکس',
    correct: `هیچ${ZWNJ}کس`,
    slug: 'hichkas',
    why: 'A compound that takes a half-space rather than a space: the two parts are one word in pronunciation and two in writing.',
  },
  {
    written: 'آنها',
    correct: `آن${ZWNJ}ها`,
    slug: 'anha',
    why: 'The plural pronoun takes a half-space; the closed-up form is understood and is not what this product writes.',
  },
  {
    written: 'هیچ کدام',
    correct: `هیچ${ZWNJ}کدام`,
    slug: 'hich-kodam',
    why: 'The same half-space compound as the two closed-up pairs above. Proposed rather than decided: a reviewer should agree before the product starts rewriting it.',
    proposed: true,
  },
];

/**
 * A spoken form and the written one it stands for. Reported, never applied.
 *
 * Exported for the same reason `COMPOUND_PAIRS` is: the written column is the product's own spelling
 * decision, so a test and a review surface should read it here rather than retype it — a retyped
 * half-space is a half-space that eventually differs.
 */
export const REGISTER_FORMS: readonly (readonly [string, string])[] = [
  ['میشه', `می${ZWNJ}شود`],
  ['نمیشه', `نمی${ZWNJ}شود`],
  ['میتونم', `می${ZWNJ}توانم`],
  ['نمیتونم', `نمی${ZWNJ}توانم`],
  ['تونستم', 'توانستم'],
  ['داره', 'دارد'],
  ['خوبه', 'خوب است'],
  ['آره', 'بله'],
  ['چیه', 'چیست'],
];

/**
 * The marks that can be doubled, and what a doubled one collapses to.
 *
 * Each pair is a set of characters that mean the same mark in two scripts — the Persian mark and its
 * ASCII lookalike — because that is what a copy-paste between applications usually leaves behind.
 */
const MARK_GROUPS: readonly (readonly [string, string])[] = [
  ['\u060C,', '\u060C'],
  ['\u061B;', '\u061B'],
  ['\u061F?', '\u061F'],
  ['!', '!'],
  ['\u066A%', '\u066A'],
];

/**
 * Replace a fixed form wherever it appears as a whole word, and nowhere a rule must not write.
 *
 * Both guards are load-bearing. The span check is what lets a reviewer approve a form for a context —
 * `approveForm` writes an `exception` entry, and `exception` is exactly the span kind this rule
 * declares it will not edit — so without it an approval would be recorded and then ignored. And two
 * forms that are already equal are not a correction; reporting one would put a "fix" that changes
 * nothing into every report that meets the word.
 */
function replacePair(input: RuleInput, pair: CompoundPair): RuleEdit[] {
  if (pair.correct === pair.written) return [];
  return standaloneMatches(input.text, pair.written)
    .filter((start) => !input.protects(start) && !input.protects(start + pair.written.length - 1))
    .map((start) => ({
      start,
      end: start + pair.written.length,
      after: pair.correct,
    }));
}

/** The rules, derived from the data above so a pair is written down once. */
export const SPELLING_RULES: readonly LanguageRule[] = [
  ...COMPOUND_PAIRS.map((pair): LanguageRule => ({
    id: `spelling.compound.${pair.slug}`,
    version: 1,
    key: `spelling.compound.${pair.slug}`,
    kind: 'spelling',
    describe: `\`${pair.written}\` is written \`${pair.correct}\`.`,
    enforcement: 'correct',
    protectedKinds: ['technical', 'exception'],
    value: `This product writes \`${pair.correct}\` rather than \`${pair.written}\`.`,
    notes: `${pair.why}${
      pair.proposed === true
        ? ' This pair arrived as a candidate: it is recorded as `pending` and does nothing until a reviewer accepts it.'
        : ''
    } The pair is matched as a whole word, so it is never rewritten inside a longer one.`,
    examples: [pair.correct, pair.written],
    confidence: pair.proposed === true ? 0.7 : 0.95,
    origin: pair.proposed === true ? 'agent-proposal' : 'human-review',
    correct: (input) => replacePair(input, pair),
  })),
  {
    id: 'spelling.register',
    version: 1,
    key: 'rule.spelling-register',
    kind: 'spelling',
    describe: 'A spoken form in written copy is reported with the form the product writes.',
    enforcement: 'report',
    protectedKinds: ['technical', 'exception'],
    // The written forms are quoted from the table above rather than typed again, so a correction here
    // and the prose that documents it cannot drift apart.
    value:
      'Written copy uses the written verb forms: ' +
      REGISTER_FORMS.slice(0, 3)
        .map(([, written]) => written)
        .join(', ') +
      ' — the spoken forms belong to dialogue, and to nothing this product renders.',
    notes:
      'Reported, because a spoken form is a register choice rather than a spelling mistake, and the product may one day render a note a user wrote. The list is closed and short: a register check without a corpus behind it should not claim to know every colloquialism. The written column carries the half-space after `می` and `نمی`, because the suggestion is the form the product renders and there is no point reporting a slip and then offering a second one. The spoken column is listed as the colloquialism is commonly typed — closed up — so one typed with a half-space is not matched; that limit is stated here rather than hidden, and closing it would need a corpus this phase does not have.',
    examples: REGISTER_FORMS.slice(0, 3).map(([, written]) => written),
    confidence: 0.85,
    origin: 'human-review',
    detect: (input) => {
      const findings = [];
      for (const [spoken, written] of REGISTER_FORMS) {
        for (const start of standaloneMatches(input.text, spoken)) {
          if (input.protects(start)) continue;
          findings.push({
            rule: 'spelling.register',
            key: 'rule.spelling-register',
            index: start,
            match: spoken,
            suggestion: written,
            reason: `\`${spoken}\` is the spoken form; written copy uses \`${written}\`.`,
          });
        }
      }
      return findings.sort((left, right) => left.index - right.index);
    },
  },
  {
    id: 'spelling.repeated-mark',
    version: 1,
    key: 'rule.spelling-punctuation',
    kind: 'spelling',
    describe:
      'A repeated punctuation mark collapses to one, whichever script the copies came from.',
    enforcement: 'correct',
    protectedKinds: ['technical', 'numeric', 'exception'],
    value:
      'A mark is written once: `،` rather than `،,` or `,,`, `؟` rather than `؟؟`, `!` rather than `!!`.',
    notes:
      'The class mixes the two scripts on purpose, because the mistake is usually a copy-paste that leaves an ASCII mark beside a Persian one. A full stop is not in the list: `...` is a deliberate ellipsis and collapsing it would rewrite a pause rather than a slip.',
    examples: ['،', '؟', '!'],
    confidence: 0.95,
    origin: 'human-review',
    correct: (input) => {
      const edits: RuleEdit[] = [];
      for (const [characters, replacement] of MARK_GROUPS) {
        for (const match of input.text.matchAll(new RegExp(`[${characters}]{2,}`, 'gu'))) {
          if (match.index === undefined) continue;
          const start = match.index;
          const end = start + match[0].length;
          if (input.protects(start) || input.protects(end - 1)) continue;
          // What is left after the collapse is always the Persian mark, so two ASCII copies of a comma
          // become one Persian comma rather than surviving as `,,`.
          edits.push({ start, end, after: replacement });
        }
      }
      return edits;
    },
  },
];
