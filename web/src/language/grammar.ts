/**
 * Persian grammar rules — Phase 7.5.2.3.
 *
 * The scope, stated first because the temptation is real: this is **not** a grammar engine. It is the
 * handful of Persian sentence facts that this product's own copy and the agent's answers actually get
 * wrong, each one written down as a rule with a citation, a version and a refusal to guess.
 *
 * Two kinds of rule live here, and the difference is the honesty of the whole file:
 *
 *   - **Mechanical** (`enforcement: 'correct'`) — a pattern whose answer is a fact about the characters.
 *     A Latin word glued to a Persian one, an ezafe written as a separate word: the fix is the same
 *     every time and a caller can apply it. These are safe because they *replace*, and the replacement
 *     is printed in the report.
 *   - **Pattern** (`enforcement: 'report'`) — a shape that is usually wrong and never certainly wrong.
 *     `۳ معاملات` is wrong; `خوبها` may be a noun. The rule says what it saw and what the product writes
 *     instead, and a human decides. Nothing here is statistical: there is no model, no probability and
 *     no scoring, and `docs/persian-language.md` says so out loud rather than letting a "suggestion"
 *     imply a trained classifier.
 *
 * Six families, and each answers one of the phase's questions — sentence structure (the object marker
 * and its verb), verb forms and agreement (a plural subject with a singular verb, a plural pronoun with
 * a singular copula), singular/plural usage (a numeral takes a singular noun), the ezafe, adjective
 * agreement, and the mixed Persian + English technical sentence that this product is full of.
 */

import { ZWNJ } from './fa.js';
import type { LanguageRule, RuleEdit, RuleInput } from './rules.js';

/** The Persian letters, which is what decides where a word ends. */
const PERSIAN_LETTERS = '\\u0621-\\u063A\\u0641-\\u064A\\u066E-\\u06D3\\u06D5\\u06FA-\\u06FF';
const LATIN_LETTERS = 'A-Za-z';

/** The suffixes a Latin technical token takes instead of a space: `ETFها`, not `ETF ها`. */
const ATTACHED_SUFFIXES = ['ها', 'های', 'تر', 'ترین'] as const;

/** The marks that end a clause, for the rules that ask what comes next. */
const MARKS = '\\u060C\\u061B\\u061F.!?';

/** Matches every edit a rule wants, skipping the ones that touch a span it must not edit. */
function collect(
  input: RuleInput,
  pattern: RegExp,
  build: (match: RegExpMatchArray) => RuleEdit | undefined,
): RuleEdit[] {
  const edits: RuleEdit[] = [];
  for (const match of input.text.matchAll(pattern)) {
    if (match.index === undefined) continue;
    const edit = build(match);
    if (edit === undefined) continue;
    if (input.protects(edit.start) || input.protects(Math.max(edit.start, edit.end - 1))) continue;
    edits.push(edit);
  }
  return edits;
}

/** The singular of a broken plural this product uses, when one is known. */
const BROKEN_PLURALS: Readonly<Record<string, string>> = {
  معاملات: 'معامله',
  نکات: 'نکته',
  سوالات: 'سوال',
};

/** How each singular verb is written when its subject is plural. */
const PLURAL_VERBS: Readonly<Record<string, string>> = {
  است: 'هستند',
  نیست: 'نیستند',
  بود: 'بودند',
  شد: 'شدند',
  می‌شود: 'می‌شوند',
  شود: 'شوند',
  دارد: 'دارند',
  می‌کند: 'می‌کنند',
  کرد: 'کردند',
};

/** The third person plural, which two spellings of `آنها` and `ایشان` all conjugate the same way. */
const THIRD_PERSON_PLURAL: Readonly<Record<string, string>> = {
  است: 'هستند',
  بود: 'بودند',
  شد: 'شدند',
  می‌شود: 'می‌شوند',
  نیست: 'نیستند',
};

/**
 * The plural pronouns, and how each one conjugates, so a wrong copula has exactly one right answer.
 *
 * `آنها` is a key *and* `آنها` is, and that is not redundancy. The half-space form is what this
 * product writes; the closed-up form is what a keyboard produces when the half-space is dropped, and
 * the spelling layer reports that. A grammar rule that could only see one of the two would silently
 * miss the agreement mistake in the other, which is the half of the problem that matters more.
 */
const PLURAL_PRONOUNS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  ما: { است: 'هستیم', بود: 'بودیم', شد: 'شدیم', می‌شود: 'می‌شویم', نیست: 'نیستیم' },
  شما: { است: 'هستید', بود: 'بودید', شد: 'شدید', می‌شود: 'می‌شوید', نیست: 'نیستید' },
  [`آن${ZWNJ}ها`]: THIRD_PERSON_PLURAL,
  آنها: THIRD_PERSON_PLURAL,
  ایشان: THIRD_PERSON_PLURAL,
};

/**
 * The subjects the pronoun rule states exactly, so the agreement rule leaves them to it.
 *
 * Derived from the pronoun list rather than written a second time: `آنها` and `ایشان` end in `ها`, so
 * the ending-based rule would otherwise report the same span the pronoun rule reports, and one mistake
 * would read as two. One list, two rules, no drift.
 */
const PRONOUN_SUBJECTS: readonly string[] = Object.keys(PLURAL_PRONOUNS);

/** Adjectives Persian does not pluralise: `خوبها` is either a noun or a mistake, and a human decides. */
const INVARIANT_ADJECTIVES = ['خوب', 'بد', 'بزرگ', 'کوچک', 'مهم', 'ساده', 'جدید', 'قدیمی'] as const;

/**
 * The grammar rules, in the order they run.
 *
 * Order matters in one place and the comments say where: the mixed-script boundary runs before
 * everything else, so a Persian suffix is attached to its Latin token before anything looks at words.
 */
export const GRAMMAR_RULES: readonly LanguageRule[] = [
  {
    id: 'grammar.mixed-script-boundary',
    version: 1,
    key: 'rule.grammar-mixed-script',
    kind: 'grammar',
    describe:
      'A Latin technical token and a Persian word are separated by a space, or by a half-space when the Persian part is a suffix that belongs to it.',
    enforcement: 'correct',
    protectedKinds: ['technical', 'exception'],
    value:
      'In mixed Persian and English text, a technical token is a word of its own: `XAUUSD را` with a space, and `ETFها` with a half-space when the suffix attaches to it. Two scripts written without a boundary read as one word.',
    notes:
      'The suffix list is closed on purpose — `ها`, `های`, `تر`, `ترین` are the endings that bind to the token in front of them, and everything else is a separate word. It is the same list Phase 7.5.2.1 uses when it reports a missing half-space, so the two cannot disagree. Digits are never touched: `3345R` is a figure, not two words.',
    examples: ['XAUUSD را', 'ETFها', 'قیمت XAUUSD'],
    confidence: 0.95,
    origin: 'human-review',
    correct: (input) => {
      const edits: RuleEdit[] = [];
      // A Latin token against a Persian word. The suffix decides which separator it gets.
      for (const match of input.text.matchAll(
        new RegExp(`[${LATIN_LETTERS}](?=[${PERSIAN_LETTERS}])`, 'gu'),
      )) {
        if (match.index === undefined) continue;
        const at = match.index + 1;
        if (input.protects(at)) continue;
        const rest = input.text.slice(at);
        const attaches = ATTACHED_SUFFIXES.some((suffix) => rest.startsWith(suffix));
        edits.push({ start: at, end: at, after: attaches ? ZWNJ : ' ' });
      }
      // The other direction: a Persian word against a Latin token.
      for (const match of input.text.matchAll(
        new RegExp(`[${PERSIAN_LETTERS}](?=[${LATIN_LETTERS}])`, 'gu'),
      )) {
        if (match.index === undefined) continue;
        const at = match.index + 1;
        if (input.protects(at)) continue;
        edits.push({ start: at, end: at, after: ' ' });
      }
      return edits;
    },
  },
  {
    id: 'grammar.ezafe-yeh',
    version: 1,
    key: 'rule.grammar-ezafe',
    kind: 'grammar',
    describe:
      'A `ی` written as a separate word after a vowel-final word is attached with a half-space.',
    enforcement: 'correct',
    protectedKinds: ['technical', 'exception'],
    value:
      'The ezafe and the possessive `ی` attach to the word they follow: `خانهی من`, never `خانه ی من`. Where the previous word ends in a vowel — `ه`, `و` or `ا` — the attachment is a half-space (U+200C).',
    notes:
      'Narrow by design, and the narrowing is the rule: the attachment only fires when the word *before* the space ends in a vowel, which is where the `ی` has something to join. `حرف ی` is left alone, because nothing there says the `ی` is an ezafe — a normalizer that rewrote every standalone `ی` would eventually rewrite a letter being named. The conjunction `و` is excluded too, and for the same reason: it is one letter that happens to be a vowel, so `و ی` would otherwise become `وی` — the word for *and* glued to whatever follows it. The excluded case is a word of one letter that ends in a vowel, which is the only shape in Persian that is a conjunction rather than a noun an ezafe can attach to.',
    examples: ['خانهی من', 'پای من', 'کتابهای من'],
    confidence: 0.85,
    origin: 'human-review',
    correct: (input) =>
      collect(
        input,
        new RegExp(`([${PERSIAN_LETTERS}]+)[ \\t]+ی(?=[ \\t${MARKS}]|$)`, 'gu'),
        (match) => {
          const before = match[1] ?? '';
          if (!/[هوا]$/.test(before)) return undefined;
          if (before.length === 1) return undefined;
          const start = (match.index ?? 0) + before.length;
          return { start, end: start + (match[0].length - before.length), after: `${ZWNJ}ی` };
        },
      ),
  },
  {
    id: 'grammar.plural-after-numeral',
    version: 1,
    key: 'rule.grammar-number-agreement',
    kind: 'grammar',
    describe:
      'A numeral followed by a plural noun is reported: Persian writes a numeral with the singular.',
    enforcement: 'report',
    protectedKinds: ['technical', 'numeric', 'exception'],
    value:
      'A numeral takes a singular noun: `۳ معامله`, not `۳ معاملات`, and `۵ نکته`, not `۵ نکات`.',
    notes:
      'Reported rather than corrected because the singular of a broken plural is not derivable — `معاملات` needs the table in this file (`معاملات`, `نکات`, `سوالات`), and a plural this project has never seen would need one it does not have. The `ها` ending *is* derivable, so there the suggestion is the word with the ending removed — the half-space form included, because `کتاب‌ها` is how a plural is actually written and a rule that only saw the closed-up spelling would miss most of the cases it exists for. The cost of that derivability is named rather than hidden: `ها` is also the *end of* some singular words (`تنها`), so a numeral in front of one of those is reported too. That is why this rule reports instead of rewriting.',
    examples: ['۳ معامله', '۵ نکته', '۲ آزمون'],
    confidence: 0.9,
    origin: 'human-review',
    detect: (input) => {
      const findings = [];
      const pattern = new RegExp(
        `(?<=[\\s\\u06F0-\\u06F9])([0-9\\u06F0-\\u06F9]+)[ \\t]+([${PERSIAN_LETTERS}]+${ZWNJ}?(?:ها|های))(?![\u200C${PERSIAN_LETTERS}])`,
        'gu',
      );
      for (const match of input.text.matchAll(pattern)) {
        if (match.index === undefined) continue;
        const word = match[2] ?? '';
        // The *noun* is what the rule is about, so the noun is what it asks about being protected. The
        // numeral in front of it is its own `numeric` span, and asking after that would mean this rule
        // could never fire on the one thing it exists for.
        if (input.protects(match.index + match[0].length - word.length)) continue;
        findings.push({
          rule: 'grammar.plural-after-numeral',
          key: 'rule.grammar-number-agreement',
          index: match.index,
          match: `${match[1]} ${word}`,
          suggestion: `${match[1]} ${word.replace(new RegExp(`${ZWNJ}?های?$`), '')}`,
          reason:
            'A numeral takes a singular noun in Persian. A plural written after a number is understood and is not what this product writes.',
        });
      }
      // The broken plurals this product actually uses, which no suffix rule can derive.
      for (const [plural, singular] of Object.entries(BROKEN_PLURALS)) {
        const pattern_ = new RegExp(
          `([0-9\\u06F0-\\u06F9]+)[ \\t]+(${plural})(?![\u200C${PERSIAN_LETTERS}])`,
          'gu',
        );
        for (const match of input.text.matchAll(pattern_)) {
          if (match.index === undefined) continue;
          // The same rule as above: the noun carries the decision, so the noun is what is asked about.
          if (input.protects(match.index + match[0].length - plural.length)) continue;
          findings.push({
            rule: 'grammar.plural-after-numeral',
            key: 'rule.grammar-number-agreement',
            index: match.index,
            match: match[0],
            suggestion: `${match[1]} ${singular}`,
            reason: `\`${plural}\` is a plural, and a numeral takes the singular \`${singular}\`.`,
          });
        }
      }
      return findings;
    },
  },
  {
    id: 'grammar.verb-number-agreement',
    version: 1,
    key: 'rule.grammar-verb-agreement',
    kind: 'grammar',
    describe: 'A plural subject followed by a singular verb is reported with the plural form.',
    enforcement: 'report',
    protectedKinds: ['technical', 'numeric', 'exception'],
    value:
      'A plural subject takes a plural verb: `معاملات خوب بودند`, not `معاملات خوب بود`; `پوزیشنها بسته شدند`, not `شد`.',
    notes:
      'The subject is recognised by the `ها`/`های` ending and by nothing else, except for the plural pronouns, which the rule below states exactly and this one leaves to it. `ان` and `ات` are deliberately absent: `تهران` ends in `ان` and is singular, and telling a plural from a word that merely ends in those letters needs a lexicon this project does not have. Reporting a correct sentence as wrong is worse than missing a wrong one. The verb may be one word away, because `پوزیشن‌ها بسته شد` is the ordinary sentence and a rule that could only see subject-then-verb would miss it; one word is also the largest gap that is not a guess about clause structure.',
    examples: ['معاملات خوب بودند', 'پوزیشن‌ها بسته شدند'],
    confidence: 0.85,
    origin: 'human-review',
    detect: (input) => {
      const findings = [];
      const verbs = Object.keys(PLURAL_VERBS).join('|');
      // At most *one* word between the subject and its verb, and the bound is the design: `پوزیشن‌ها
      // بسته شد` is the ordinary sentence and a rule that could not see it would be useless, while an
      // unbounded gap would let the pattern run across a clause boundary and suggest a verb for the
      // wrong subject. One word is the largest gap that is still a guess a reviewer would accept.
      const pattern = new RegExp(
        `([${PERSIAN_LETTERS}]+${ZWNJ}?(?:ها|های))((?:[ \\t]+[${PERSIAN_LETTERS}${ZWNJ}]+)?)[ \\t]+(${verbs})(?![${PERSIAN_LETTERS}])`,
        'gu',
      );
      for (const match of input.text.matchAll(pattern)) {
        if (match.index === undefined) continue;
        const verb = match[3] ?? '';
        // `آنها` and `ایشان` end in `ها`, but they are pronouns and the pronoun rule has a closed list on
        // both sides of them. Reporting the same span twice would make one mistake look like two.
        if (PRONOUN_SUBJECTS.includes(match[1] ?? '')) continue;
        if (input.protects(match.index)) continue;
        findings.push({
          rule: 'grammar.verb-number-agreement',
          key: 'rule.grammar-verb-agreement',
          index: match.index,
          match: match[0],
          suggestion: `${match[1]}${match[2] ?? ''} ${PLURAL_VERBS[verb]}`,
          reason: `\`${match[1]}\` is plural, so the verb is \`${PLURAL_VERBS[verb]}\` rather than \`${verb}\`.`,
        });
      }
      return findings;
    },
  },
  {
    id: 'grammar.pronoun-agreement',
    version: 1,
    key: 'rule.grammar-pronoun-agreement',
    kind: 'grammar',
    describe:
      'A plural pronoun followed by a singular copula is reported with the right conjugation.',
    enforcement: 'report',
    protectedKinds: ['technical', 'numeric', 'exception'],
    // The form this product writes is spelled with the half-space the rest of the layer writes it with,
    // so the sentence that documents the rule and the sentence the rule produces are the same sentence.
    value:
      'A plural pronoun conjugates its own verb: `ما هستیم`, `شما هستید`, `آن' +
      ZWNJ +
      'ها هستند` — never `ما است` or `آن' +
      ZWNJ +
      'ها بود`.',
    notes:
      'The pronouns and their conjugations are both closed lists, so this rule has no false positives by construction; it is reported rather than corrected because a caller may prefer to rewrite the sentence instead of the verb. Both spellings of `آن' +
      ZWNJ +
      'ها` are keys, because the closed-up spelling is common enough that a rule which only knew the half-space form would quietly do nothing about half the text it was written for.',
    examples: ['ما هستیم', 'شما بودید', `آن${ZWNJ}ها شدند`],
    confidence: 0.95,
    origin: 'human-review',
    detect: (input) => {
      const findings = [];
      const pronouns = Object.keys(PLURAL_PRONOUNS).join('|');
      const pattern = new RegExp(
        `(${pronouns})[ \\t]+([${PERSIAN_LETTERS}]+)(?![${PERSIAN_LETTERS}])`,
        'gu',
      );
      for (const match of input.text.matchAll(pattern)) {
        if (match.index === undefined) continue;
        const pronoun = match[1] ?? '';
        const verb = match[2] ?? '';
        const expected = PLURAL_PRONOUNS[pronoun]?.[verb];
        if (expected === undefined) continue;
        if (input.protects(match.index)) continue;
        findings.push({
          rule: 'grammar.pronoun-agreement',
          key: 'rule.grammar-pronoun-agreement',
          index: match.index,
          match: match[0],
          suggestion: `${pronoun} ${expected}`,
          reason: `\`${pronoun}\` is plural, so the verb is \`${expected}\` rather than \`${verb}\`.`,
        });
      }
      return findings;
    },
  },
  {
    id: 'grammar.object-marker-before-verb',
    version: 1,
    key: 'rule.grammar-object-marker',
    kind: 'grammar',
    describe:
      'The object marker `را` with no verb after it is reported: a clause ends with its verb.',
    enforcement: 'report',
    protectedKinds: ['technical', 'numeric', 'exception'],
    value:
      'Persian is verb-final: the object marker `را` belongs to a clause whose verb comes after it, so `این معامله را` is a sentence waiting for its verb.',
    notes:
      'A shape rather than a parse: the rule fires only when nothing at all follows the marker before the clause ends, which is the one case that needs no knowledge of what the rest of the sentence is doing. A heading or a fragment is still a legitimate use, so it reports.',
    examples: ['این معامله را بستم.'],
    confidence: 0.8,
    origin: 'human-review',
    detect: (input) => {
      const findings = [];
      // The marker is a *word*, so the rule requires a word in front of it and a space between: without
      // that, `چرا؟` ("why?") would be reported for ending in the same two letters. The `m` flag is the
      // rest of it — a clause ends at a newline as often as at the end of the text, and a rule that only
      // saw the last line of a paragraph would be a rule that mostly did nothing.
      for (const match of input.text.matchAll(
        new RegExp(`(?<=[${PERSIAN_LETTERS}][ \\t])را(?=[ \\t]*[${MARKS}]|[ \\t]*$)`, 'gmu'),
      )) {
        if (match.index === undefined) continue;
        if (input.protects(match.index)) continue;
        findings.push({
          rule: 'grammar.object-marker-before-verb',
          key: 'rule.grammar-object-marker',
          index: match.index,
          match: match[0],
          suggestion: 'را … فعل',
          reason:
            'The clause has no verb after its object marker; Persian ends the clause with the verb.',
        });
      }
      return findings;
    },
  },
  {
    id: 'grammar.adjective-invariant',
    version: 1,
    key: 'rule.grammar-adjective-agreement',
    kind: 'grammar',
    describe:
      'An adjective carrying a plural ending is reported: Persian adjectives do not pluralise.',
    enforcement: 'report',
    protectedKinds: ['technical', 'numeric', 'exception'],
    value:
      'Persian adjectives do not pluralise: `معاملات خوب`, not `معاملات خوبها`. An adjective stays bare whatever the noun does.',
    notes:
      'The adjectives are a closed list, and the rule reports rather than corrects for a reason it states in its own example: `خوبها` is also a legitimate *noun* ("the good ones"), so the ending is not by itself a mistake. A reviewer, who can see whether the word modifies a noun, is the one who decides.',
    examples: ['معاملات خوب', 'خوبها'],
    confidence: 0.75,
    origin: 'human-review',
    detect: (input) => {
      const findings = [];
      const adjectives = INVARIANT_ADJECTIVES.join('|');
      for (const match of input.text.matchAll(
        new RegExp(`(${adjectives})${ZWNJ}?(ها|های)(?![\u200C${PERSIAN_LETTERS}])`, 'gu'),
      )) {
        if (match.index === undefined) continue;
        if (input.protects(match.index)) continue;
        findings.push({
          rule: 'grammar.adjective-invariant',
          key: 'rule.grammar-adjective-agreement',
          index: match.index,
          match: match[0],
          suggestion: match[1] ?? '',
          reason:
            'Persian adjectives do not take a plural ending; if the word is being used as a noun it is fine, which is why this is a suggestion rather than a fix.',
        });
      }
      return findings;
    },
  },
];
