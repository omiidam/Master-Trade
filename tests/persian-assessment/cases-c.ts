/**
 * Assessment battery, dimensions 9–12: numbers/dates/currency, RTL, technical terminology,
 * context adaptation and consistency.
 */

import {
  BIDI_CONTROLS,
  PERSIAN_PUNCTUATION,
  detectLanguage,
  formatFaCurrency,
  formatFaDate,
  formatFaNumber,
  formatFaPercentPoints,
  isolateBidi,
  languagePipeline,
  languageQa,
  latinRun,
  lexiconTerms,
  normalizePersianContent,
  normalizePersianText,
  persianRun,
  responseControl,
  toLatinDigits,
  toPersianDigits,
} from '../../web/src/language/index.js';
import { objective, type AssessmentCase } from './harness.js';

const stringify = (value: unknown): string => JSON.stringify(value);

export const CASES_C: readonly AssessmentCase[] = [
  /* ── 9. Numbers, dates, currency, ZWNJ, mixed ───────────────────────────── */
  {
    id: 'FA-058',
    dimension: 'numbers-dates-currency',
    kind: 'objective',
    title: 'Digits map to the Persian set and back',
    source: 'Unicode Extended Arabic-Indic digits (U+06F0–U+06F9)',
    check: () => {
      const fa = toPersianDigits('3345');
      const back = toLatinDigits(fa);
      return objective(fa === '۳۳۴۵' && back === '3345', stringify({ fa, back }));
    },
  },
  {
    id: 'FA-059',
    dimension: 'numbers-dates-currency',
    kind: 'objective',
    title: 'A Persian number uses the CLDR grouping and decimal separators',
    source: 'CLDR via Intl.NumberFormat("fa-IR")',
    check: () => {
      const out = formatFaNumber(1234567.89);
      return objective(out === '۱٬۲۳۴٬۵۶۷٫۸۹', stringify(out));
    },
  },
  {
    id: 'FA-060',
    dimension: 'numbers-dates-currency',
    kind: 'objective',
    title: 'A technical figure keeps Latin digits with CLDR grouping (`-u-nu-latn`)',
    source: 'CLDR via Intl.NumberFormat("fa-IR-u-nu-latn")',
    check: () => {
      const out = formatFaNumber(1234567.89, { digits: 'latin' });
      return objective(out === '1,234,567.89', stringify(out));
    },
  },
  {
    id: 'FA-061',
    dimension: 'numbers-dates-currency',
    kind: 'objective',
    title: 'Currency is formatted in its own symbol (`ریال`) with a grouped figure',
    source: 'CLDR via Intl.NumberFormat("fa-IR", currency, narrowSymbol)',
    check: () => {
      const out = formatFaCurrency(1250000.5, 'IRR');
      return objective(out.includes('ریال') && out.includes('۱٬۲۵۰٬۰۰۰'), stringify(out));
    },
  },
  {
    id: 'FA-062',
    dimension: 'numbers-dates-currency',
    kind: 'objective',
    title: 'A Gregorian date is rendered in the Persian (Solar Hijri) calendar',
    source: 'CLDR, `ca-persian` made explicit',
    check: () => {
      const out = formatFaDate('2026-09-27');
      return objective(out === '۱۴۰۵/۷/۵', stringify(out));
    },
  },
  {
    id: 'FA-063',
    dimension: 'numbers-dates-currency',
    kind: 'objective',
    title: 'A percent figure uses the Persian percent sign',
    source: 'CLDR via Intl.NumberFormat("fa-IR", style: percent)',
    check: () => {
      const out = formatFaPercentPoints(2.45);
      return objective(out === '۲٫۵٪', stringify(out));
    },
  },
  {
    id: 'FA-064',
    dimension: 'numbers-dates-currency',
    kind: 'objective',
    title: 'Both non-Latin digit sets fold to ASCII, and separators are left as written',
    source: 'Unicode; fa.ts toLatinDigits contract',
    check: () => {
      const out = toLatinDigits('۳۳٤٥');
      return objective(out === '3345', stringify(out));
    },
  },
  {
    id: 'FA-065',
    dimension: 'numbers-dates-currency',
    kind: 'objective',
    title: 'A technical figure inside mixed text is not rewritten by the content pipeline',
    source: 'Product normalization contract (normalize.ts): a figure with a separator is technical',
    check: () => {
      const out = normalizePersianContent('XAUUSD 3345.20');
      return objective(out.text === 'XAUUSD 3345.20' && out.changes.length === 0, stringify(out));
    },
  },

  /* ── 10. RTL / text-layout-sensitive ────────────────────────────────────── */
  {
    id: 'FA-066',
    dimension: 'rtl-layout',
    kind: 'objective',
    title: 'A Latin run is isolated with LRI … PDI',
    source: 'Unicode UAX #9 isolates',
    check: () => {
      const out = latinRun('XAUUSD');
      return objective(
        out === `${BIDI_CONTROLS.leftToRightIsolate}XAUUSD${BIDI_CONTROLS.popDirectionalIsolate}`,
        stringify(out),
      );
    },
  },
  {
    id: 'FA-067',
    dimension: 'rtl-layout',
    kind: 'objective',
    title: 'A Persian run is isolated with RLI … PDI',
    source: 'Unicode UAX #9 isolates',
    check: () => {
      const out = persianRun('متن');
      return objective(
        out === `${BIDI_CONTROLS.rightToLeftIsolate}متن${BIDI_CONTROLS.popDirectionalIsolate}`,
        stringify(out),
      );
    },
  },
  {
    id: 'FA-068',
    dimension: 'rtl-layout',
    kind: 'objective',
    title: 'An unknown-direction run uses the first-strong isolate (FSI … PDI)',
    source: 'Unicode UAX #9 isolates (FSI)',
    check: () => {
      const out = isolateBidi('X', 'auto');
      return objective(
        out === `${BIDI_CONTROLS.firstStrongIsolate}X${BIDI_CONTROLS.popDirectionalIsolate}`,
        stringify(out),
      );
    },
  },
  {
    id: 'FA-069',
    dimension: 'rtl-layout',
    kind: 'objective',
    title: 'The bidi control code points are exactly the UAX #9 isolates',
    source: 'Unicode: LRI U+2066, RLI U+2067, FSI U+2068, PDI U+2069',
    check: () => {
      const ok =
        BIDI_CONTROLS.leftToRightIsolate === '\u2066' &&
        BIDI_CONTROLS.rightToLeftIsolate === '\u2067' &&
        BIDI_CONTROLS.firstStrongIsolate === '\u2068' &&
        BIDI_CONTROLS.popDirectionalIsolate === '\u2069';
      return objective(ok, stringify(BIDI_CONTROLS));
    },
  },
  {
    id: 'FA-070',
    dimension: 'rtl-layout',
    kind: 'objective',
    title: 'A signed figure is isolatable as a left-to-right run inside Persian prose',
    source: 'Unicode UAX #9; the product’s technical-figure rule',
    check: () => {
      const out = isolateBidi('-1.00R');
      return objective(out.startsWith('\u2066') && out.endsWith('\u2069'), stringify(out));
    },
  },
  {
    id: 'FA-071',
    dimension: 'rtl-layout',
    kind: 'objective',
    title: 'The Persian punctuation constants are the exact Unicode code points',
    source: 'Unicode: comma U+060C, semicolon U+061B, question mark U+061F, percent U+066A',
    check: () => {
      const ok =
        PERSIAN_PUNCTUATION.comma === '\u060C' &&
        PERSIAN_PUNCTUATION.semicolon === '\u061B' &&
        PERSIAN_PUNCTUATION.questionMark === '\u061F' &&
        PERSIAN_PUNCTUATION.percent === '\u066A';
      return objective(ok, stringify(PERSIAN_PUNCTUATION));
    },
  },
  {
    id: 'FA-072',
    dimension: 'rtl-layout',
    kind: 'objective',
    title: 'Normalization does not inject or reorder bidi controls',
    source: 'fa.ts: normalization is an identity pass and touches no isolate',
    check: () => {
      const input = 'قیمت XAUUSD بالاست';
      const out = normalizePersianText(input);
      const noControls = !/[\u2066-\u2069\u202A-\u202E]/.test(out);
      const lettersKept =
        [...out].filter((c) => !/[\u2066-\u2069]/.test(c)).length === [...input].length;
      return objective(noControls && lettersKept, stringify(out));
    },
  },

  /* ── 11. Technical Persian with English terminology ─────────────────────── */
  {
    id: 'FA-073',
    dimension: 'technical-terminology',
    kind: 'objective',
    title: 'A non-preferred term (`ترید`) is reported against the preferred `معامله`',
    source: 'Product terminology lexicon (term.trading.trade)',
    check: () => {
      const found = languageQa('این ترید خوب بود').suggestions.find(
        (s) => s.rule === 'terminology.preferred-form',
      );
      return objective(found?.suggestion === 'معامله', stringify(found ?? null));
    },
  },
  {
    id: 'FA-074',
    dimension: 'technical-terminology',
    kind: 'objective',
    title: 'A loanword (`استاپ لاس`) is reported against the product’s `حد ضرر`',
    source: 'Product terminology lexicon (term.trading.stop-loss)',
    check: () => {
      const found = languageQa('استاپ لاس را بگذار').suggestions.find(
        (s) => s.rule === 'terminology.preferred-form',
      );
      return objective(found?.suggestion === 'حد ضرر', stringify(found ?? null));
    },
  },
  {
    id: 'FA-075',
    dimension: 'technical-terminology',
    kind: 'objective',
    title: 'An English product term reads as technical (not general) wording',
    source: 'Product terminology lexicon; detect.ts reads the English column too',
    check: () => {
      const reading = detectLanguage('the stop-loss');
      return objective(reading.wording === 'technical', stringify(reading.wording));
    },
  },
  {
    id: 'FA-076',
    dimension: 'technical-terminology',
    kind: 'objective',
    title: 'The lexicon holds the reviewed terminology (at least 57 terms)',
    source: 'Product terminology catalogue (terminology.ts)',
    check: () => {
      const terms = lexiconTerms();
      return objective(terms.length >= 57, stringify(terms.length));
    },
  },
  {
    id: 'FA-077',
    dimension: 'technical-terminology',
    kind: 'objective',
    title: 'Every preferred Persian term is already in canonical form',
    source: 'Unicode + the product normalizer (no Arabic yeh/kaf, no stray ZWNJ)',
    check: () => {
      const bad = lexiconTerms().filter(
        (term) => normalizePersianText(term.preferredFa) !== term.preferredFa,
      );
      return objective(bad.length === 0, stringify(bad.map((t) => t.preferredFa)));
    },
  },
  {
    id: 'FA-078',
    dimension: 'technical-terminology',
    kind: 'objective',
    title: 'No two terms share the same preferred Persian form',
    source: 'Product terminology catalogue: preferred forms are unique',
    check: () => {
      const forms = lexiconTerms().map((term) => term.preferredFa);
      const unique = new Set(forms);
      return objective(
        unique.size === forms.length,
        stringify({ total: forms.length, unique: unique.size }),
      );
    },
  },
  {
    id: 'FA-079',
    dimension: 'technical-terminology',
    kind: 'objective',
    title: 'A code/technical span is protected from the content pipeline',
    source: 'Product normalization contract (normalize.ts protected spans)',
    check: () => {
      const out = normalizePersianContent('BTC/USDT');
      return objective(out.text === 'BTC/USDT' && out.changes.length === 0, stringify(out.text));
    },
  },

  /* ── 12. Context-aware adaptation & language consistency ────────────────── */
  {
    id: 'FA-080',
    dimension: 'context-adaptation-consistency',
    kind: 'objective',
    title: 'A Persian message resolves to a Persian reply',
    source: 'Product response control (response.ts) over resolveLanguage',
    check: () => {
      const control = responseControl('حد ضرر را روی ۳۳۲۰ بگذار');
      return objective(control.reply.language === 'fa', stringify(control.reply));
    },
  },
  {
    id: 'FA-081',
    dimension: 'context-adaptation-consistency',
    kind: 'objective',
    title: 'An English message resolves to an English reply',
    source: 'Product response control (response.ts)',
    check: () => {
      const control = responseControl('Where should I move my stop loss?');
      return objective(control.reply.language === 'en', stringify(control.reply));
    },
  },
  {
    id: 'FA-082',
    dimension: 'context-adaptation-consistency',
    kind: 'objective',
    title: 'An in-message request overrides the detected language in the response control',
    source: 'Product response control (response.ts) precedence',
    check: () => {
      const control = responseControl('به انگلیسی جواب بده');
      return objective(
        control.reply.language === 'en' && control.reply.source === 'requested',
        stringify(control.reply),
      );
    },
  },
  {
    id: 'FA-083',
    dimension: 'context-adaptation-consistency',
    kind: 'objective',
    title: 'A stored explicit choice survives into the response control',
    source: 'Product response control; preference resolution',
    check: () => {
      const control = responseControl('حد ضرر را ببند', { preference: 'en' });
      return objective(control.reply.language === 'en', stringify(control.reply));
    },
  },
  {
    id: 'FA-084',
    dimension: 'context-adaptation-consistency',
    kind: 'objective',
    title: 'A mixed message resolves the way the dominant script decides (documented rule)',
    source: 'Product resolver: the larger script decides a mixed message',
    check: () => {
      const control = responseControl('قیمت XAUUSD امروز بالاست و Risk/reward is 2.6.');
      return objective(control.reply.language === 'en', stringify(control.reply));
    },
  },
  {
    id: 'FA-085',
    dimension: 'context-adaptation-consistency',
    kind: 'objective',
    title: 'The pipeline resolves one language, agreed by the memory and response stages',
    source: 'Product pipeline (pipeline.ts): one resolution carried across stages',
    check: () => {
      const run = languagePipeline(
        { text: 'لطفاً فارسی جواب بده', at: '2026-09-27T09:00:00.000Z' },
        { storage: null },
      );
      return objective(
        run.response.reply.language === 'fa' &&
          run.memory.reply.language === run.response.reply.language,
        stringify({ response: run.response.reply.language, memory: run.memory.reply.language }),
      );
    },
  },
  {
    id: 'FA-086',
    dimension: 'context-adaptation-consistency',
    kind: 'objective',
    title: 'Every response carries the invariant list that constrains an answer',
    source: 'Product guidance invariants (guidance.ts): facts, safety-rules, uncertainty, …',
    check: () => {
      const control = responseControl('حد ضرر را ببند');
      const invariants = control.guidance.invariants;
      const required = ['facts', 'safety-rules', 'trading-restrictions', 'uncertainty'];
      const ok = required.every((id) => invariants.includes(id as never));
      return objective(ok, stringify(invariants));
    },
  },
];
