/**
 * Assessment battery, dimensions 5–8: reading, instruction following, context, idioms.
 *
 * Reading comprehension is measured as a **proxy**: the layer reads scripts, technical spans and a
 * closed lexicon, and has no semantic model. Cases that need meaning (a synonym, an idiom) are expected
 * to fail, and their failure is the honest reading of the capability as it stands.
 */

import {
  analyzeCommunication,
  detectLanguage,
  resolveLanguage,
} from '../../web/src/language/index.js';
import { objective, type AssessmentCase } from './harness.js';

const stringify = (value: unknown): string => JSON.stringify(value);

export const CASES_B: readonly AssessmentCase[] = [
  /* ── 5. Reading comprehension ───────────────────────────────────────────── */
  {
    id: 'FA-030',
    dimension: 'reading-comprehension',
    kind: 'objective',
    title: 'A Persian sentence is read as Persian with a Persian letter census',
    source: 'Product script census (detect.ts)',
    check: () => {
      const reading = detectLanguage('حد ضرر را روی ۳۳۲۰ بگذار');
      return objective(
        reading.language === 'fa' &&
          reading.context.persianLetters > 0 &&
          reading.context.latinLetters === 0,
        stringify({ language: reading.language, letters: reading.context.persianLetters }),
      );
    },
  },
  {
    id: 'FA-031',
    dimension: 'reading-comprehension',
    kind: 'objective',
    title: 'An English sentence is read as English',
    source: 'Product script census (detect.ts)',
    check: () => {
      const reading = detectLanguage('Where should I move my stop loss?');
      return objective(reading.language === 'en', stringify(reading.language));
    },
  },
  {
    id: 'FA-032',
    dimension: 'reading-comprehension',
    kind: 'objective',
    title: 'A mixed Persian + Latin message is read as mixed',
    source: 'Product script census (detect.ts): mixed is a first-class answer',
    check: () => {
      const reading = detectLanguage('قیمت XAUUSD امروز بالاست و Risk/reward is 2.6.');
      return objective(reading.language === 'mixed', stringify(reading.language));
    },
  },
  {
    id: 'FA-033',
    dimension: 'reading-comprehension',
    kind: 'objective',
    title: 'A digits-only message is unknown with zero confidence (digits are not evidence)',
    source: 'Product script census (detect.ts)',
    check: () => {
      const reading = detectLanguage('3345.20');
      return objective(
        reading.language === 'unknown' && reading.confidence === 0,
        stringify({ language: reading.language, confidence: reading.confidence }),
      );
    },
  },
  {
    id: 'FA-034',
    dimension: 'reading-comprehension',
    kind: 'objective',
    title: 'The product concept in a Persian sentence is identified from the lexicon',
    source: 'Product terminology lexicon (terminology.ts), read through detect.ts',
    check: () => {
      const reading = detectLanguage('حد ضرر را روی ۳۳۲۰ بگذار');
      return objective(
        reading.context.terms.includes('stop-loss'),
        stringify(reading.context.terms),
      );
    },
  },
  {
    id: 'FA-035',
    dimension: 'reading-comprehension',
    kind: 'objective',
    title: 'Several concepts and their domains are read from one sentence',
    source: 'Product terminology lexicon (terminology.ts)',
    check: () => {
      const reading = detectLanguage('حد سود و پوزیشن را ببند');
      const terms = reading.context.terms;
      const ok =
        terms.includes('take-profit') &&
        terms.includes('position') &&
        reading.context.domains.includes('trading');
      return objective(ok, stringify({ terms, domains: reading.context.domains }));
    },
  },
  {
    id: 'FA-036',
    dimension: 'reading-comprehension',
    kind: 'objective',
    title: 'A Persian synonym not in the lexicon (`طلا` for gold/XAUUSD) is understood',
    source: 'Diagnostic: the layer has closed vocabulary and no semantic model',
    check: () => {
      const reading = detectLanguage('قیمت طلا چنده؟');
      const ok = reading.context.terms.includes('instrument');
      return objective(
        ok,
        stringify({ terms: reading.context.terms, domains: reading.context.domains }),
      );
    },
  },

  /* ── 6. Instruction following in Persian ────────────────────────────────── */
  {
    id: 'FA-037',
    dimension: 'instruction-following',
    kind: 'objective',
    title: '`به انگلیسی جواب بده` is read as an explicit request for English',
    source: 'Product explicit-request vocabulary (detect.ts REQUESTS)',
    check: () => {
      const reading = detectLanguage('به انگلیسی جواب بده: what is a stop loss?');
      return objective(
        reading.request?.language === 'en' && reading.request.confidence === 1,
        stringify(reading.request),
      );
    },
  },
  {
    id: 'FA-038',
    dimension: 'instruction-following',
    kind: 'objective',
    title: '`لطفاً فارسی جواب بده` is read as an explicit request for Persian',
    source: 'Product explicit-request vocabulary (detect.ts REQUESTS)',
    check: () => {
      const reading = detectLanguage('لطفاً فارسی جواب بده: what is a stop loss?');
      return objective(reading.request?.language === 'fa', stringify(reading.request));
    },
  },
  {
    id: 'FA-039',
    dimension: 'instruction-following',
    kind: 'objective',
    title: 'An English request (`in english please`) is recognized',
    source: 'Product explicit-request vocabulary (detect.ts REQUESTS)',
    check: () => {
      const reading = detectLanguage('in english please');
      return objective(reading.request?.language === 'en', stringify(reading.request));
    },
  },
  {
    id: 'FA-040',
    dimension: 'instruction-following',
    kind: 'objective',
    title: 'A request in the message outranks what the message looks like',
    source: 'Product precedence rule (resolveLanguage): request → setting → learned → reading',
    check: () => {
      const reply = resolveLanguage('auto', detectLanguage('به انگلیسی جواب بده'));
      return objective(reply.language === 'en' && reply.source === 'requested', stringify(reply));
    },
  },
  {
    id: 'FA-041',
    dimension: 'instruction-following',
    kind: 'objective',
    title: 'An explicit choice outranks the message and records the override',
    source: 'Product precedence rule (resolveLanguage)',
    check: () => {
      const reply = resolveLanguage('en', detectLanguage('حد ضرر را ببند'));
      return objective(
        reply.language === 'en' && reply.source === 'explicit' && reply.overridden === true,
        stringify(reply),
      );
    },
  },
  {
    id: 'FA-042',
    dimension: 'instruction-following',
    kind: 'objective',
    title: 'With no request and no choice, the message decides',
    source: 'Product precedence rule (resolveLanguage)',
    check: () => {
      const reply = resolveLanguage('auto', detectLanguage('حد ضرر را ببند'));
      return objective(
        reply.language === 'fa' && reply.source === 'detected' && reply.overridden === false,
        stringify(reply),
      );
    },
  },
  {
    id: 'FA-043',
    dimension: 'instruction-following',
    kind: 'objective',
    title: 'A statement about Persian (`فارسی سخته`) is not read as a request for Persian',
    source:
      'Product explicit-request guard (a request must name a language and an act of answering)',
    check: () => {
      const reading = detectLanguage('فارسی سخته');
      return objective(reading.request === null, stringify(reading.request));
    },
  },

  /* ── 7. Context & communication style ───────────────────────────────────── */
  {
    id: 'FA-044',
    dimension: 'context-style',
    kind: 'objective',
    title: 'A greeting around a work request reads as work (`professional`), not small talk',
    source: 'Product context reader (context.ts): the subject breaks the conversational/work tie',
    check: () => {
      const context = analyzeCommunication('سلام، حد ضرر را چک کن');
      return objective(
        context.setting.value === 'professional' && context.intent.value === 'instruction',
        stringify({ setting: context.setting.value, intent: context.intent.value }),
      );
    },
  },
  {
    id: 'FA-045',
    dimension: 'context-style',
    kind: 'objective',
    title: 'An informal request reads as conversational and informal',
    source: 'Product context reader (context.ts) over the register reading',
    check: () => {
      const context = analyzeCommunication('میشه این معامله رو یه بار دیگه بررسی کنی؟');
      return objective(
        context.setting.value === 'conversational' && context.formality.value === 'informal',
        stringify({ setting: context.setting.value, formality: context.formality.value }),
      );
    },
  },
  {
    id: 'FA-046',
    dimension: 'context-style',
    kind: 'objective',
    title: 'The context formality is the same value as the detection register (no second opinion)',
    source: 'context.ts carries detect.ts’s register rather than recomputing it',
    check: () => {
      const text = 'لطفاً این معامله را بررسی نمایید';
      const context = analyzeCommunication(text);
      const reading = detectLanguage(text);
      return objective(
        context.formality.value === reading.register,
        stringify({ context: context.formality.value, reading: reading.register }),
      );
    },
  },
  {
    id: 'FA-047',
    dimension: 'context-style',
    kind: 'objective',
    title: 'A short message with no request for detail reads as concise',
    source: 'Product context reader (context.ts depth band)',
    check: () => {
      const context = analyzeCommunication('حد ضرر ۳۳۲۰ است');
      return objective(context.depth.value === 'concise', stringify(context.depth.value));
    },
  },
  {
    id: 'FA-048',
    dimension: 'context-style',
    kind: 'objective',
    title: 'A work turn naming a concept reads as work with informed wording',
    source: 'Product context reader (context.ts): setting from signals, expertise from density',
    check: () => {
      const context = analyzeCommunication('حد سود را روی ۳۳۵۰ بگذار');
      return objective(
        context.setting.value === 'professional' && context.expertise.value === 'informed',
        stringify({ setting: context.setting.value, expertise: context.expertise.value }),
      );
    },
  },
  {
    id: 'FA-049',
    dimension: 'context-style',
    kind: 'objective',
    title: 'A question is read as a question',
    source: 'Product context reader (context.ts intent) over the detection style',
    check: () => {
      const context = analyzeCommunication('حد ضرر چیه؟');
      return objective(context.intent.value === 'question', stringify(context.intent.value));
    },
  },
  {
    id: 'FA-050',
    dimension: 'context-style',
    kind: 'objective',
    title: 'A Persian sentence whose only Latin is a ticker reads as terms-only mixing',
    source: 'Product context reader (context.ts): terms-only is the healthy mixed shape',
    check: () => {
      const context = analyzeCommunication('قیمت XAUUSD امروز بالاست');
      return objective(
        context.terminology.value === 'terms-only',
        stringify(context.terminology.value),
      );
    },
  },

  /* ── 8. Idioms, expressions, and taarof ─────────────────────────────────── */
  {
    id: 'FA-051',
    dimension: 'idioms-taarof',
    kind: 'objective',
    title: 'The greeting `سلام` reads as conversational small talk',
    source: 'Product greetings list (context.ts CONTEXT_GREETINGS)',
    check: () => {
      const context = analyzeCommunication('سلام');
      return objective(
        context.setting.value === 'conversational',
        stringify(context.setting.value),
      );
    },
  },
  {
    id: 'FA-052',
    dimension: 'idioms-taarof',
    kind: 'objective',
    title: 'The courtesy word `ممنون` reads as a conversational signal',
    source: 'Product greetings list (context.ts)',
    check: () => {
      const context = analyzeCommunication('ممنون از راهنماییت');
      return objective(
        context.setting.value === 'conversational' && context.setting.signals.includes('ممنون'),
        stringify({ setting: context.setting.value, signals: context.setting.signals }),
      );
    },
  },
  {
    id: 'FA-053',
    dimension: 'idioms-taarof',
    kind: 'objective',
    title: 'Formal taarof forms (`بفرمایید`, `خواهشمندم`) read as the formal register',
    source: 'Product formal marker list (detect.ts FORMAL_FA)',
    check: () => {
      const a = detectLanguage('بفرمایید').register;
      const b = detectLanguage('خواهشمندم بررسی شود').register;
      return objective(a === 'formal' && b === 'formal', stringify({ a, b }));
    },
  },
  {
    id: 'FA-054',
    dimension: 'idioms-taarof',
    kind: 'objective',
    title: 'The taarof idiom `قربونت برم` is recognized as an informal expression',
    source: 'Diagnostic: idiom coverage is a closed list, not a semantic reading',
    check: () => {
      const reading = detectLanguage('قربونت برم');
      // The real signal is the register, not the short-turn conversational default a two-word
      // message gets for free; an idiom the layer knows would be read as informal.
      return objective(reading.register === 'informal', stringify(reading.register));
    },
  },
  {
    id: 'FA-055',
    dimension: 'idioms-taarof',
    kind: 'objective',
    title: 'The idiom `دستت درد نکنه` is recognized as a courtesy expression',
    source: 'Diagnostic: idiom coverage is a closed list, not a semantic reading',
    check: () => {
      const reading = detectLanguage('دستت درد نکنه');
      return objective(reading.register === 'informal', stringify(reading.register));
    },
  },
  {
    id: 'FA-056',
    dimension: 'idioms-taarof',
    kind: 'objective',
    title: 'The greeting `سلام علیکم` is recognized',
    source: 'Product greetings list (context.ts)',
    check: () => {
      const context = analyzeCommunication('سلام علیکم');
      return objective(
        context.setting.value === 'conversational',
        stringify(context.setting.value),
      );
    },
  },
  {
    id: 'FA-057',
    dimension: 'idioms-taarof',
    kind: 'objective',
    title: 'A polite formal request (`لطفاً … نمایید`) reads as formal',
    source: 'Product formal marker list (detect.ts)',
    check: () => {
      const reading = detectLanguage('لطفاً این گزارش را ارسال نمایید');
      return objective(reading.register === 'formal', stringify(reading.register));
    },
  },
];
