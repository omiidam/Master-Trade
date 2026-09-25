/**
 * The knowledge this phase ships.
 *
 * Deliberately small, and deliberately *only* the knowledge whose authority is external to this
 * project. Every entry below is either a fact of the Unicode character database (which character
 * Persian yeh is, which block the Persian digits live in, that ZWNJ is a layout control rather than
 * a space) or a decision made and recorded in `docs/persian-language.md` during this phase.
 *
 * What is *not* here is as deliberate: there is no terminology and there is no Persian UI copy. A
 * glossary of trading terms in Persian is a translation decision with a named reviewer, and Phase
 * 7.5.1 is the layer those entries will be written into, not the phase that invents them. Seeding
 * an unreviewed glossary would be exactly the failure this store exists to prevent — knowledge
 * whose provenance is a guess, carrying a `trusted` badge.
 *
 * The orthographic entries carry a `mapping` where the rule is character-level, and
 * `tests/persian-language.test.ts` checks the normalizer in `fa.ts` against every one of them. So
 * the store's prose and the code's behaviour are one fact stated twice, not two facts that drift.
 */

import { LanguageMemory } from './memory.js';
import type { LanguageProposal } from './model.js';

/** The instant this phase's knowledge was recorded. Fixed, so a seeded store is reproducible. */
const RECORDED_AT = '2026-09-25T00:00:00.000Z';

/** The Unicode charts and standard annexes the character-level rules are cited from. */
const UNICODE_ARABIC = 'https://www.unicode.org/charts/PDF/U0600.pdf';
const UNICODE_FORMAT_CONTROLS = 'https://www.unicode.org/versions/latest/ch23.pdf';

/** The design record for the decisions that are this product's rather than Unicode's. */
const PHASE_RECORD = 'docs/persian-language.md';

export const SEED_LANGUAGE_KNOWLEDGE: readonly LanguageProposal[] = [
  {
    key: 'orthography.farsi-yeh',
    kind: 'orthography',
    value: 'Persian writes the yeh as U+06CC. The Arabic yeh U+064A is folded to it.',
    origin: 'upstream-standard',
    reference: UNICODE_ARABIC,
    recordedAt: RECORDED_AT,
    baseVersion: 0,
    confidence: 1,
    mapping: { from: '\u064A', to: '\u06CC' },
    examples: ['\u064A \u2192 \u06CC'],
    notes:
      'The two are different letters in Unicode and look identical in most fonts, which is why an Arabic keyboard produces text that is byte-wise wrong and visually perfect.',
  },
  {
    key: 'orthography.farsi-keheh',
    kind: 'orthography',
    value: 'Persian writes the kaf as U+06A9. The Arabic kaf U+0643 is folded to it.',
    origin: 'upstream-standard',
    reference: UNICODE_ARABIC,
    recordedAt: RECORDED_AT,
    baseVersion: 0,
    confidence: 1,
    mapping: { from: '\u0643', to: '\u06A9' },
    examples: ['\u0643 \u2192 \u06A9'],
    notes: 'Same failure mode as the yeh: identical on screen, different in the code point.',
  },
  {
    key: 'orthography.persian-digits',
    kind: 'orthography',
    value:
      'Persian digits are U+06F0–U+06F9, the Extended Arabic-Indic digits. Text that is Persian carries these rather than U+0030–U+0039.',
    origin: 'upstream-standard',
    reference: UNICODE_ARABIC,
    recordedAt: RECORDED_AT,
    baseVersion: 0,
    confidence: 1,
    mapping: { from: '\u06F0', to: '\u06F0' },
    examples: ['\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9'],
    notes: 'Latin digits are a separate decision — see `rule.technical-figures-stay-latin`.',
  },
  {
    key: 'orthography.arabic-indic-digits',
    kind: 'orthography',
    value:
      'The Arabic-Indic digits U+0660–U+0669 are folded to the Persian set U+06F0–U+06F9, because Persian does not use them.',
    origin: 'upstream-standard',
    reference: UNICODE_ARABIC,
    recordedAt: RECORDED_AT,
    baseVersion: 0,
    confidence: 1,
    mapping: { from: '\u0660', to: '\u06F0' },
    examples: ['\u0660\u0661\u0662 \u2192 \u06F0\u06F1\u06F2'],
    notes: 'This is a *digit* fold for identity; it never rewrites a technical figure.',
  },
  {
    key: 'orthography.tatweel-removed',
    kind: 'orthography',
    value: 'TATWEEL U+0640 is a connection lengthener with no orthographic content. It is removed.',
    origin: 'upstream-standard',
    reference: UNICODE_ARABIC,
    recordedAt: RECORDED_AT,
    baseVersion: 0,
    confidence: 1,
    mapping: { from: '\u0640', to: null },
    examples: ['\u0645\u0640\u0627\u0646\u0640\u062F \u2192 \u0645\u0627\u0646\u062F'],
    notes: 'It exists to stretch a joining letter for justification and carries no word meaning.',
  },
  {
    key: 'orthography.harakat-removed',
    kind: 'orthography',
    value:
      'The Arabic vowel marks (U+064B–U+0652) and the superscript alef U+0670 are removed: Persian orthography does not write them.',
    origin: 'human-review',
    reference: PHASE_RECORD,
    recordedAt: RECORDED_AT,
    baseVersion: 0,
    confidence: 0.9,
    mapping: { from: '\u064B', to: null },
    examples: ['\u06A9\u0650\u062A\u0627\u0628 \u2192 \u06A9\u062A\u0627\u0628'],
    notes:
      'A review decision rather than a Unicode rule, so it names its range and its edges: U+0653–U+0655 are *combining* hamza and madda, which a decomposed Persian letter can legitimately be built from, so they are left alone. Removing them would change a letter rather than a vowel mark. The range is stated here so the normalizer and this rule cannot disagree.',
  },
  {
    key: 'orthography.zwnj-preserved',
    kind: 'orthography',
    value:
      'The zero-width non-joiner U+200C is preserved. It is a layout control that carries orthographic meaning in Persian, not a stray character.',
    origin: 'upstream-standard',
    reference: UNICODE_FORMAT_CONTROLS,
    recordedAt: RECORDED_AT,
    baseVersion: 0,
    confidence: 1,
    mapping: null,
    examples: ['\u0645\u06CC\u200C\u0631\u0648\u062F (goes) vs \u0645\u06CC\u0631\u0648\u062F'],
    notes:
      'The two examples differ by one invisible character and mean different things. A normalizer that stripped it would silently change words, which is why it is stated as a rule rather than left to a code reviewer to notice.',
  },
  {
    key: 'rule.technical-figures-stay-latin',
    kind: 'rule',
    value:
      'A technical figure keeps Latin digits and the monospaced face. Persian digits belong to prose, not to a price, a timestamp, an R multiple or an instrument symbol.',
    origin: 'human-review',
    reference: PHASE_RECORD,
    recordedAt: RECORDED_AT,
    baseVersion: 0,
    confidence: 1,
    mapping: null,
    examples: [
      'XAUUSD 3345.20',
      '\u06F2\u06F0\u06F2\u06F6-\u06F0\u06F9-\u06F1\u06F9 is a date in prose',
    ],
    notes:
      'The trading-terminal convention, and the honest one: a reader copying a price expects the characters they type. `.num` already states the left-to-right half of this in `global.css`; this entry states the digit half.',
  },
  {
    key: 'rule.persian-punctuation',
    kind: 'rule',
    value:
      'Persian punctuation is U+060C \u060C U+061B \u061B U+061F \u061F and the percent sign U+066A \u066A. Prose uses these; a technical figure keeps its ASCII separators.',
    origin: 'human-review',
    reference: PHASE_RECORD,
    recordedAt: RECORDED_AT,
    baseVersion: 0,
    confidence: 1,
    mapping: null,
    examples: ['\u06F2\u066B\u06F5\u066A'],
    notes:
      'The code points are Unicode\u2019s and CLDR emits the percent sign in `fa-IR` percent formatting; what the product decides is *where* to apply them, which is prose and not figures.',
  },
];

/** A memory holding the seeded knowledge, applied through the ordinary proposal path. */
export function seededLanguageMemory(): LanguageMemory {
  const memory = LanguageMemory.of([]);
  for (const proposal of SEED_LANGUAGE_KNOWLEDGE) {
    memory.propose(proposal);
  }
  return memory;
}
