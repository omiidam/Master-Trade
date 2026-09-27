/**
 * Assessment battery, dimensions 1–4: normalization, spelling, grammar, naturalness.
 *
 * Every expected value comes from an authority outside this battery — Unicode, CLDR, or the product's
 * own reviewed catalogue — and is stated in the case's `source`. The cases run the exported Agent
 * interface directly; none of them writes anything.
 */

import {
  detectLanguage,
  evaluatePersianNaturalness,
  languageQa,
  normalizePersianText,
  stripZwnj,
  toPersianDigits,
  trimZwnjEdges,
  ZWNJ,
  type NaturalnessContext,
} from '../../web/src/language/index.js';
import { objective, rubric, type AssessmentCase } from './harness.js';

const stringify = (value: unknown): string => JSON.stringify(value);

/** The quality text of a QA report, which is what the deterministic corrections produce. */
const qaText = (input: string): string => languageQa(input).text;
/** The rule ids the QA pipeline reported, across every family. */
const qaRules = (input: string): string[] => languageQa(input).suggestions.map((s) => s.rule);
/** A suggestion for a rule, when the pipeline raised one. */
const suggestion = (input: string, rule: string) =>
  languageQa(input).suggestions.find((s) => s.rule === rule);

const FORMAL: NaturalnessContext = { tone: 'formal', terminology: 'product-terms', mixing: 'none' };
const NEUTRAL: NaturalnessContext = {
  tone: 'neutral',
  terminology: 'product-terms',
  mixing: 'none',
};

export const CASES_A: readonly AssessmentCase[] = [
  /* ── 1. Normalization & orthography ─────────────────────────────────────── */
  {
    id: 'FA-001',
    dimension: 'normalization-orthography',
    kind: 'objective',
    title: 'Arabic yeh (U+064A) folds to the Farsi yeh (U+06CC)',
    source: 'Unicode Arabic block; ParsBench normalization track (methodology)',
    check: () => {
      const out = normalizePersianText('مديريت ريسک');
      return objective(out === 'مدیریت ریسک', stringify(out));
    },
  },
  {
    id: 'FA-002',
    dimension: 'normalization-orthography',
    kind: 'objective',
    title: 'Alef maksura (U+0649) folds to the Farsi yeh (U+06CC)',
    source: 'Unicode Arabic block',
    check: () => {
      const out = normalizePersianText('مصطفي');
      return objective(out === 'مصطفی', stringify(out));
    },
  },
  {
    id: 'FA-003',
    dimension: 'normalization-orthography',
    kind: 'objective',
    title: 'Arabic kaf (U+0643) and its two variants fold to the keheh (U+06A9)',
    source: 'Unicode Arabic block; product entry orthography.kaf-variants',
    check: () => {
      const out = normalizePersianText('كتاب \u06AAوچک \u06ABار');
      return objective(out === 'کتاب کوچک کار', stringify(out));
    },
  },
  {
    id: 'FA-004',
    dimension: 'normalization-orthography',
    kind: 'objective',
    title: 'Vowel marks are removed; combining hamza/madda are preserved',
    source:
      'Product entry orthography.harakat-removed (U+064B–U+0652, U+0670 removed; U+0653–U+0655 kept)',
    check: () => {
      const vowel = normalizePersianText('مَثَل');
      // NFKC composes the decomposed hamza onto its base letter before the mark ranges are read, so
      // the letter must survive as the precomposed hamza rather than being dropped by the vowel sweep.
      const combining = normalizePersianText('ا\u0654');
      const hamzaKept = combining === '\u0623' || combining === 'ا\u0654';
      return objective(vowel === 'مثل' && hamzaKept, stringify({ vowel, combining }));
    },
  },
  {
    id: 'FA-005',
    dimension: 'normalization-orthography',
    kind: 'objective',
    title: 'Arabic-Indic digits (U+0660–U+0669) fold to Persian digits (U+06F0–U+06F9)',
    source: 'Unicode Extended Arabic-Indic digits',
    check: () => {
      const out = normalizePersianText('٣٣٤٥');
      return objective(out === toPersianDigits('3345'), stringify(out));
    },
  },
  {
    id: 'FA-006',
    dimension: 'normalization-orthography',
    kind: 'objective',
    title: 'Normalization is idempotent over mixed Persian/technical text',
    source: 'Identity-pass contract in fa.ts',
    check: () => {
      const once = normalizePersianText('قيمت XAUUSD را ٣٣٤٥.٢٠ ببين');
      const twice = normalizePersianText(once);
      return objective(once === twice, stringify({ once, twice }));
    },
  },
  {
    id: 'FA-007',
    dimension: 'normalization-orthography',
    kind: 'objective',
    title: 'ZWNJ is preserved by default; only edge/space-adjacent ones are trimmed',
    source: 'Unicode format controls; fa.ts ZWNJ contract',
    check: () => {
      const interior = `می${ZWNJ}رود`;
      const kept = normalizePersianText(interior) === interior;
      const trimmed = trimZwnjEdges(`${ZWNJ}می${ZWNJ} رود${ZWNJ}`) === 'می رود';
      const stripped = stripZwnj(interior) === 'میرود';
      return objective(kept && trimmed && stripped, stringify({ kept, trimmed, stripped }));
    },
  },

  /* ── 2. Spelling & punctuation ──────────────────────────────────────────── */
  {
    id: 'FA-008',
    dimension: 'spelling-punctuation',
    kind: 'objective',
    title: 'The compound `بجای` is corrected to `به جای`',
    source: 'Product spelling catalogue (spelling.compound.bajaye)',
    check: () => {
      const out = qaText('بجای این کار صبر کن');
      return objective(out === 'به جای این کار صبر کن', stringify(out));
    },
  },
  {
    id: 'FA-009',
    dimension: 'spelling-punctuation',
    kind: 'objective',
    title: 'The compound `بطور` is corrected to `به طور`',
    source: 'Product spelling catalogue (spelling.compound.batour)',
    check: () => {
      const out = qaText('بطور کلی صبر کن');
      return objective(out === 'به طور کلی صبر کن', stringify(out));
    },
  },
  {
    id: 'FA-010',
    dimension: 'spelling-punctuation',
    kind: 'objective',
    title: 'The closed-up pronoun `آنها` takes the half-space form `آنها`',
    source: 'Product spelling catalogue (spelling.compound.anha)',
    check: () => {
      const out = qaText('آنها رفتند');
      return objective(out === `آن${ZWNJ}ها رفتند`, stringify(out));
    },
  },
  {
    id: 'FA-011',
    dimension: 'spelling-punctuation',
    kind: 'objective',
    title: 'A candidate compound (`هیچ کدام`) is recorded but does not rewrite text',
    source: 'Product spelling catalogue; the entry is an agent-proposal parked as pending',
    check: () => {
      const report = languageQa('هیچ کدام درست نیست');
      return objective(
        report.text === 'هیچ کدام درست نیست' &&
          report.skippedRules.includes('spelling.compound.hich-kodam'),
        stringify({ text: report.text, skipped: report.skippedRules }),
      );
    },
  },
  {
    id: 'FA-012',
    dimension: 'spelling-punctuation',
    kind: 'objective',
    title: 'Repeated marks collapse to one, whichever script the copies came from',
    source: 'Product spelling catalogue (spelling.repeated-mark)',
    check: () => {
      const out = qaText('خوب است,, نه؟؟');
      return objective(out === 'خوب است، نه؟', stringify(out));
    },
  },
  {
    id: 'FA-013',
    dimension: 'spelling-punctuation',
    kind: 'objective',
    title: 'ASCII punctuation in Persian prose folds to the Persian marks',
    source: 'Unicode code points; product entry rule.persian-punctuation',
    check: () => {
      const out = qaText('قیمت بالا رفت، سود کردیم');
      const comma = out.includes('،');
      const ascii = !/,/.test(out);
      return objective(comma && ascii, stringify(out));
    },
  },
  {
    id: 'FA-014',
    dimension: 'spelling-punctuation',
    kind: 'rubric',
    title: 'A spoken register form (`میشه`) is reported, not silently rewritten',
    source: 'Product spelling catalogue (spelling.register), reported rather than corrected',
    check: () => {
      const found = suggestion('میشه این کار را بکنیم', 'spelling.register');
      const reported = found !== undefined;
      const suggestionText = found?.suggestion ?? '';
      const leftInPlace = languageQa('میشه این کار را بکنیم').text.includes('میشه');
      // Full marks: reported with the written form AND not rewritten. Partial: reported only.
      if (reported && suggestionText === 'می‌شود' && leftInPlace)
        return rubric(1, stringify(found));
      if (reported) return rubric(0.5, stringify(found));
      return rubric(0, stringify({ reported }));
    },
  },

  /* ── 3. Grammar & sentence structure ────────────────────────────────────── */
  {
    id: 'FA-015',
    dimension: 'grammar-structure',
    kind: 'objective',
    title: 'A Latin token against a Persian word gains a boundary (`XAUUSDرا` → `XAUUSD را`)',
    source: 'Product grammar catalogue (grammar.mixed-script-boundary)',
    check: () => {
      const out = qaText('بازار XAUUSDرا دیدم');
      return objective(out === 'بازار XAUUSD را دیدم', stringify(out));
    },
  },
  {
    id: 'FA-016',
    dimension: 'grammar-structure',
    kind: 'objective',
    title: 'A Persian suffix binds to its Latin token with a half-space (`ETFها` → `ETFها`)',
    source: 'Product grammar catalogue (grammar.mixed-script-boundary), suffix list ها/های/تر/ترین',
    check: () => {
      const out = qaText('ETFها را بخر');
      return objective(out.startsWith(`ETF${ZWNJ}ها`), stringify(out));
    },
  },
  {
    id: 'FA-017',
    dimension: 'grammar-structure',
    kind: 'objective',
    title: 'A numeral takes a singular noun (`۳ معاملات` → `۳ معامله`)',
    source: 'Product grammar catalogue (grammar.plural-after-numeral)',
    check: () => {
      const found = suggestion('۳ معاملات بستم', 'grammar.plural-after-numeral');
      return objective(found?.suggestion === '۳ معامله', stringify(found));
    },
  },
  {
    id: 'FA-018',
    dimension: 'grammar-structure',
    kind: 'objective',
    title: 'A plural pronoun takes a plural copula (`آنها است` → `آنها هستند`)',
    source: 'Product grammar catalogue (grammar.pronoun-agreement)',
    check: () => {
      const found = suggestion('آنها است درست', 'grammar.pronoun-agreement');
      return objective(found?.suggestion === 'آنها هستند', stringify(found));
    },
  },
  {
    id: 'FA-019',
    dimension: 'grammar-structure',
    kind: 'objective',
    title:
      'The ezafe written as a separate word attaches with a half-space (`خانه ی من` → `خانه‌ی من`)',
    source: 'Product grammar catalogue (grammar.ezafe-yeh)',
    check: () => {
      const out = qaText('خانه ی من');
      return objective(out === `خانه${ZWNJ}ی من`, stringify(out));
    },
  },
  {
    id: 'FA-020',
    dimension: 'grammar-structure',
    kind: 'objective',
    title: 'The ezafe rule is narrow: `حرف ی` is left alone (no false positive)',
    source: 'Product grammar catalogue (grammar.ezafe-yeh), documented refusal',
    check: () => {
      const out = qaText('حرف ی');
      return objective(
        out === 'حرف ی' && !qaRules('حرف ی').includes('grammar.ezafe-yeh'),
        stringify(out),
      );
    },
  },
  {
    id: 'FA-021',
    dimension: 'grammar-structure',
    kind: 'objective',
    title: 'An object marker with no verb after it is reported (`این معامله را.`)',
    source: 'Product grammar catalogue (grammar.object-marker-before-verb)',
    check: () => {
      const found = suggestion('این معامله را.', 'grammar.object-marker-before-verb');
      return objective(found !== undefined, stringify(found));
    },
  },
  {
    id: 'FA-022',
    dimension: 'grammar-structure',
    kind: 'objective',
    title: 'A correct sentence with a plural noun inside the predicate is not falsely flagged',
    source: 'Naturalness/evaluation documented limitation, tested here as a no-false-positive case',
    check: () => {
      const rules = qaRules('نمودار خالی واقعیتی درباره دادهها است');
      const flagged = rules.includes('grammar.verb-number-agreement');
      return objective(!flagged, stringify({ rules }));
    },
  },

  /* ── 4. Natural Iranian Persian ─────────────────────────────────────────── */
  {
    id: 'FA-023',
    dimension: 'natural-persian',
    kind: 'objective',
    title: 'A clean, natural answer produces no naturalness verdict',
    source: 'Product naturalness reader at a formal/product-terms/none context',
    check: () => {
      const report = evaluatePersianNaturalness(
        'حد ضرر را رعایت کنید و حجم معامله را کم کنید.',
        FORMAL,
      );
      return objective(report.verdicts.length === 0, stringify(report.verdicts));
    },
  },
  {
    id: 'FA-024',
    dimension: 'natural-persian',
    kind: 'objective',
    title: 'An English phrase inside a Persian answer is flagged as a run',
    source: 'Product naturalness check (naturalness.english-run)',
    check: () => {
      const report = evaluatePersianNaturalness('این stop loss است', NEUTRAL);
      const flagged = report.verdicts.some((v) => v.check === 'naturalness.english-run');
      return objective(flagged, stringify(report.verdicts.map((v) => v.check)));
    },
  },
  {
    id: 'FA-025',
    dimension: 'natural-persian',
    kind: 'objective',
    title: 'Informal Persian is read as informal, with its markers reported',
    source: 'Product register reading (detect.ts), from REGISTER_FORMS and closed markers',
    check: () => {
      const reading = detectLanguage('میشه این معامله رو یه بار دیگه بررسی کنی؟');
      return objective(
        reading.register === 'informal' && reading.context.informalMarkers.length > 0,
        stringify({ register: reading.register, markers: reading.context.informalMarkers }),
      );
    },
  },
  {
    id: 'FA-026',
    dimension: 'natural-persian',
    kind: 'objective',
    title: 'Formal Persian is read as formal',
    source: 'Product register reading (detect.ts), from the formal marker list',
    check: () => {
      const reading = detectLanguage('لطفاً این معامله را بررسی نمایید');
      return objective(reading.register === 'formal', stringify(reading.register));
    },
  },
  {
    id: 'FA-027',
    dimension: 'natural-persian',
    kind: 'objective',
    title: 'An unmarked message claims no register (neutral, not a guess)',
    source: 'Product register reading (detect.ts): a tie is neutral',
    check: () => {
      const reading = detectLanguage('حد ضرر روی ۳۳۲۰ است');
      return objective(
        reading.register === 'neutral' && reading.registerConfidence < 0.2,
        stringify({ register: reading.register, confidence: reading.registerConfidence }),
      );
    },
  },
  {
    id: 'FA-028',
    dimension: 'natural-persian',
    kind: 'objective',
    title: 'A sentence repeated verbatim is flagged as a naturalness shape',
    source: 'Product naturalness check (naturalness.repeated-sentence)',
    check: () => {
      const report = evaluatePersianNaturalness(
        'این معامله خوب است. این معامله خوب است. این معامله خوب است.',
        NEUTRAL,
      );
      const flagged = report.verdicts.some((v) => v.check === 'naturalness.repeated-sentence');
      return objective(flagged, stringify(report.verdicts.map((v) => v.check)));
    },
  },
  {
    id: 'FA-029',
    dimension: 'natural-persian',
    kind: 'rubric',
    title: 'An informal answer in a formal context is flagged (register mismatch)',
    source: 'Naturalness at a formal context; the documented registers are the product’s own',
    check: () => {
      const report = evaluatePersianNaturalness('میشه این کار را انجام بدی', FORMAL);
      // Full marks: flagged by the naturalness reader. Partial: the quality reader saw it only.
      if (report.verdicts.length > 0)
        return rubric(1, stringify(report.verdicts.map((v) => v.check)));
      if (report.quality.findings.length > 0)
        return rubric(0.5, stringify(report.quality.findings.map((f) => f.check)));
      return rubric(0, stringify({ verdicts: [], findings: [] }));
    },
  },
];
