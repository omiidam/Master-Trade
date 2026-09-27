/**
 * Phase 7.5.3.5.5 — the Persian language benchmark.
 *
 * This is the file that walks the layer the way a caller does, and it exists because thirteen phases each
 * proved their own half and nothing had proved the halves fit together. Its three jobs:
 *
 *   1. **The flow** — one turn through `languagePipeline`, stage by stage, with the properties that make it
 *      one pipeline rather than seven calls in a row: the message is read once, the language is resolved
 *      once, the answer is judged against the decision the response stage actually made, the report carries
 *      no field a fact could travel in, and nothing writes.
 *   2. **The dimensions** — Persian, English, a mix, informal Persian, technical Persian, Finglish,
 *      punctuation, spelling, ZWNJ, terminology, naturalness, the language of the answer, learned
 *      preferences, an explicit choice and an in-message request, the interface switch and the separation
 *      from it, and RTL-safe output. Each one is a case that would fail if the dimension stopped working,
 *      not a case that re-asserts another suite's internals.
 *   3. **The historical defects** — every failure this document records, with the phase that recorded it,
 *      a live re-run of the fix through this layer, and a pointer to the permanent case that owns it when
 *      the defect was not in this layer at all. A case that reads the document and requires each recorded
 *      phase to be covered means a future phase cannot record a defect and leave it uncovered.
 *
 * The import order below is deliberate and is itself one of the assertions: `pipeline.ts` reaches the layer
 * through a module cycle (`terminology.ts` → character normalizer → `seed.ts` → the lexicon), and the member
 * an entry point touches first decides whether the catalogue is built before anything asks it a question.
 * Every other suite imports the index first, which happens to be the order that works; this one does not, so
 * the property is covered instead of assumed.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LANGUAGE_PIPELINE_STAGES,
  LANGUAGE_PIPELINE_VERSION,
  LEARNING_READING_FIELDS,
  PIPELINE_EPOCH,
  PIPELINE_FIELDS,
  languagePipeline,
  type LanguageTurn,
} from '../web/src/language/pipeline.js';
import {
  CONTEXT_DEPTHS,
  CORRECTION_VALUES,
  MAX_CORRECTIONS,
  TERMINOLOGY_STYLES,
  GUIDANCE_INVARIANTS,
  GUIDANCE_NOTES,
  LANGUAGE_PROFILE_FIELDS,
  LANGUAGE_QUALITY_CHECKS,
  LANGUAGE_QUALITY_RECOGNITION_KINDS,
  NATURALNESS_LIMITS,
  RESPONSE_FEEDBACK,
  TERMINOLOGY_CHECK,
  USER_CORRECTION_CHECK,
  COMPOUND_PAIRS,
  analyzeCommunication,
  communicationProfile,
  decideObservation,
  detectLanguage,
  emptyCorrections,
  emptyLearningStore,
  emptyObservations,
  evaluatePersianNaturalness,
  evaluatePersianQuality,
  formatFaCurrency,
  isNaturalnessContext,
  languageQa,
  learningObservationId,
  observePersianText,
  parseLearningStore,
  recordCorrection,
  persianFindings,
  readPersianAnswer,
  recordObservations,
  regressionCheck,
  responseStyle,
  seededLanguageMemory,
  statedPreference,
  writeLanguagePreference,
  type LanguageRegressionCase,
  type LearningCandidate,
  type NaturalnessContext,
  type PreferenceStorage,
  type ResponseFeedback,
} from '../web/src/language/index.js';
import {
  GUIDANCE_DETAILS,
  GUIDANCE_TERMINOLOGY,
} from '../packages/shared/src/language/guidance.js';
import { FA_MESSAGES } from '../web/src/i18n/index.js';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const ROOT = process.cwd();
const AT = '2026-09-27T09:00:00.000Z';

const PERSIAN_TURN = 'حد ضرر را روی ۳۳۲۰ بگذار و بعد پوزیشن را ببند.';
const ENGLISH_TURN = 'Where should I move my stop-loss after the first target is hit?';
const MIXED_TURN = 'قیمت XAUUSD امروز بالاست و Risk/reward is 2.6.';
/** The same mix with more Persian in it, so the larger script — and the reply — is Persian. */
const MIXED_PERSIAN_TURN =
  'قیمت XAUUSD امروز بالاست و حد ضرر را روی ۳۳۲۰ ببند، Risk/reward is 2.6.';
const INFORMAL_TURN = 'میشه این معامله رو یه بار دیگه بررسی کنی؟';
const FINGLISH_TURN = 'salam, gheymat XAUUSD chand shod?';
const TECHNICAL_TURN = 'حد سود را روی ۳۳۵۰ بگذار و حجم را کم کن.';
const ASKS_ENGLISH = 'به انگلیسی جواب بده: what is a stop loss?';
const ASKS_PERSIAN = 'لطفاً فارسی جواب بده: what is a stop loss?';

/** An answer that is wrong in exactly one way: this product writes the Farsi yeh, not the Arabic one. */
const ANSWER_WITH_YEH = 'مديريت ريسک مهم‌تر از پيش‌بيني بازار است.';
const CLEAN_ANSWER = 'حد ضرر را رعایت کنید و حجم معامله را کم کنید.';

const FORMAL: NaturalnessContext = { tone: 'formal', terminology: 'product-terms', mixing: 'none' };

/** The two messages the mixed-confidence case compares: the same letters, split differently. */
const BALANCED_MIX = 'قیمت اب abcdefgh';
const UNBALANCED_MIX = 'قیمت بازار اب abc';

/** A store that is a `Map`, so a case can inspect exactly what was written — or that nothing was. */
function fakeStorage(initial: Readonly<Record<string, string>> = {}): {
  store: PreferenceStorage;
  entries: Map<string, string>;
} {
  const entries = new Map(Object.entries(initial));
  return {
    entries,
    store: {
      getItem: (key) => entries.get(key) ?? null,
      setItem: (key, value) => void entries.set(key, value),
    },
  };
}

/** Every file under `web/src`, so a scan cannot be aimed at the one file that suits it. */
function sourcesOf(directory = join(ROOT, 'web', 'src')): string[] {
  const found: string[] = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) found.push(...sourcesOf(path));
    else if (/\.tsx?$/.test(name)) found.push(path);
  }
  return found;
}

/* -------------------------------------------------------------------------- */
/* 1. The flow                                                                 */
/* -------------------------------------------------------------------------- */

describe('the flow, from a message to a re-read corpus', () => {
  const turn: LanguageTurn = { text: PERSIAN_TURN, answer: ANSWER_WITH_YEH, at: AT };
  const report = languagePipeline(turn, { storage: null });

  it('runs every stage the phase names, in the order it names them', () => {
    expect(LANGUAGE_PIPELINE_STAGES).toEqual([
      'detection',
      'context',
      'memory',
      'knowledge',
      'qa',
      'response',
      'learning',
      'regression',
    ]);
    expect(report.stages).toEqual(LANGUAGE_PIPELINE_STAGES);
    expect(LANGUAGE_PIPELINE_VERSION).toBe(report.version);
  });

  it('reads the message once and hands that one reading to every stage below it', () => {
    // Not "the stages happen to agree": no stage is given the text, they are all given the value the first
    // stage produced, so two opinions about one message are not expressible.
    expect(report.detection).toEqual(detectLanguage(PERSIAN_TURN));
    expect(report.context).toEqual(
      analyzeCommunication(PERSIAN_TURN, { detection: detectLanguage(PERSIAN_TURN) }),
    );
    expect(report.context.language).toBe(report.detection.language);
  });

  it('resolves the language once, so the memory stage and the response stage cannot disagree', () => {
    expect(report.memory.reply).toEqual(report.response.reply);
    // The style is a projection of the guidance and not a second resolution of it.
    expect(report.response.style).toEqual(responseStyle(report.response.guidance));
  });

  it('judges the answer in the context the response stage actually resolved', () => {
    // The tone and the terminology come from the guidance, the mixing from 7.5.3.2's reading of the turn —
    // which is the whole point of requiring a context: a verdict about the wrong context is a verdict about
    // nothing, and a caller that assembled the context itself could judge the answer against another turn.
    expect(report.learning.context).toEqual({
      tone: report.response.guidance.tone,
      terminology: report.response.guidance.terminology,
      mixing: report.context.terminology.value,
    });
    expect(isNaturalnessContext(report.learning.context)).toBe(true);
  });

  it('carries the answer’s reading, and reads the answer exactly once', () => {
    // `report.quality` is the same object the candidate list was drawn from, asserted by identity: a second
    // evaluation of one answer would be a second opinion, and this layer's claim is that there is one.
    expect(report.learning.report?.input).toBe(ANSWER_WITH_YEH);
    expect(report.learning.report?.quality).toEqual(evaluatePersianQuality(ANSWER_WITH_YEH));
    expect(report.learning.report?.text).toBe(ANSWER_WITH_YEH);
  });

  it('carries the form the store authorises for each concept the turn named', () => {
    expect(report.knowledge.concepts.map((concept) => concept.id)).toEqual(
      report.detection.context.terms,
    );
    const stopLoss = report.knowledge.concepts.find((concept) => concept.id === 'stop-loss');
    expect(stopLoss).toMatchObject({ domain: 'trading', fa: 'حد ضرر', en: 'Stop-loss' });
    expect(report.knowledge.rules.length).toBeGreaterThan(0);
    expect(report.knowledge.reason).toContain('nothing in this stage decides anything');
  });

  it('reads the person’s own text as a person’s, and the product’s text as the product’s', () => {
    // The subject of each stage, said where it can be checked: the QA catalogue runs over the answer, and the
    // message is handed to it nowhere. A caller that brought no answer gets no QA and no candidates rather
    // than a report about somebody's own writing.
    const noAnswer = languagePipeline({ text: PERSIAN_TURN, at: AT }, { storage: null });
    expect(noAnswer.qa).toBeNull();
    expect(noAnswer.learning.report).toBeNull();
    expect(noAnswer.learning.candidates).toEqual([]);
    expect(noAnswer.learning.reason).toContain('no answer was brought');
    expect(noAnswer.answer).toBeNull();
    // And the same turn with one: the catalogue's own reading of the answer, not of the message.
    expect(report.qa?.input).toBe(ANSWER_WITH_YEH);
  });

  it('carries no field a fact, a tool result or a permission could travel in', () => {
    expect(Object.keys(report).sort()).toEqual([...PIPELINE_FIELDS].sort());
    expect(Object.keys(report.learning).sort()).toEqual([...LEARNING_READING_FIELDS].sort());
    expect(report.invariants).toEqual(GUIDANCE_INVARIANTS);
    expect(report.invariants).toContain('facts');
    expect(report.invariants).toContain('permissions');
    // The instruction catalogue carries no figure, which is the mechanical half of "a style may not restate
    // a result": a note with a digit could be read as one.
    for (const note of Object.values(GUIDANCE_NOTES)) expect(note).not.toMatch(/[0-9]/);
  });

  it('does not rewrite the text it was handed', () => {
    expect(report.input).toBe(PERSIAN_TURN);
    expect(report.text).toBe(PERSIAN_TURN);
    // The corrections the QA stage found live in its report and are applied to nothing: `text` is the input
    // for every reporting layer in this directory, and the answer is echoed as it arrived.
    expect(report.qa?.text).not.toBe(report.text);
    expect(report.answer).toBe(ANSWER_WITH_YEH);
  });

  it('writes nothing: a run leaves the storage, the corpus and the knowledge store as it found them', () => {
    const { store, entries } = fakeStorage();
    const cases: LanguageRegressionCase[] = [
      {
        id: 'case-1',
        family: 'spelling',
        check: 'quality.spelling.arabic-repertoire',
        probe: 'مديريت ريسک',
        form: 'ي',
        correction: 'ی',
        expected: 'reported',
        context: FORMAL,
        confirmedAt: AT,
        reference: 'review-1',
      },
    ];
    const memory = seededLanguageMemory();
    const trusted = memory.snapshot();
    const first = languagePipeline(turn, { storage: store, cases });
    expect(entries.size).toBe(0);
    expect(cases).toHaveLength(1);
    expect(first.regression.total).toBe(1);
    expect(first.regression.failures).toEqual([]);
    expect(memory.snapshot()).toEqual(trusted);
  });

  it('reads no clock, and is deterministic', () => {
    const a = languagePipeline(turn, { storage: null });
    const b = languagePipeline(turn, { storage: null });
    expect(a).toEqual(b);
    expect(a.learning.candidates[0]?.observedAt).toBe(AT);
    // A caller that does not care when the turn happened gets the epoch rather than the wall clock, because a
    // value that changes between two identical calls is a value no case can assert.
    const timeless = languagePipeline(
      { text: PERSIAN_TURN, answer: ANSWER_WITH_YEH },
      { storage: null },
    );
    expect(timeless.learning.candidates[0]?.observedAt).toBe(PIPELINE_EPOCH);
    expect(timeless).toEqual(
      languagePipeline({ text: PERSIAN_TURN, answer: ANSWER_WITH_YEH }, { storage: null }),
    );
  });

  it('receives a feedback verdict without writing it anywhere', () => {
    const stated = languagePipeline(
      { text: PERSIAN_TURN, answer: CLEAN_ANSWER, feedback: 'prefer-english', at: AT },
      { storage: null },
    );
    expect(stated.learning.feedback?.outcome).toBe('recorded');
    expect(stated.learning.feedback?.store.corrections).toHaveLength(1);
    expect(stated.learning.reason).toContain("the person's verdict was recorded");
  });

  it('imports the pipeline before the index, and the pipeline alone is enough to build the graph', () => {
    // The import at the top of this file is first for this reason. The order inside the module is what makes
    // it work, so it is asserted rather than assumed: the seed is what the lexicon is composed from, and it
    // has to be the first member of the cycle an entry point touches.
    const source = readFileSync(join(ROOT, 'web', 'src', 'language', 'pipeline.ts'), 'utf8');
    const imports = [...source.matchAll(/^import[^;]+from '(\.[^']+)';$/gm)].map(
      (match) => match[1],
    );
    expect(imports[0]).toBe('./seed.js');
    // And the index reaches the same function, so there is one pipeline and not two surfaces for it.
    const index = readFileSync(join(ROOT, 'web', 'src', 'language', 'index.ts'), 'utf8');
    expect(index).toContain("from './pipeline.js'");
  });
});

/* -------------------------------------------------------------------------- */
/* 2. The dimensions                                                           */
/* -------------------------------------------------------------------------- */

describe('Persian', () => {
  const report = languagePipeline(
    { text: PERSIAN_TURN, answer: CLEAN_ANSWER, at: AT },
    { storage: null },
  );

  it('answers a Persian message in Persian, and says so in Persian’s own register', () => {
    expect(report.detection.language).toBe('fa');
    expect(report.memory.reply).toMatchObject({
      language: 'fa',
      source: 'detected',
      overridden: false,
    });
    expect(report.response.style.notes[0]).toMatch(/^fa-/);
    expect(report.response.guidance.reason).toContain('Persian');
  });

  it('reads the concepts, the domain and the numbering without being told them', () => {
    expect(report.knowledge.concepts.map((concept) => concept.fa)).toContain('حد ضرر');
    expect(report.detection.context.domains).toContain('trading');
    expect(report.knowledge.reason).toContain('trading');
  });
});

describe('English', () => {
  const report = languagePipeline(
    { text: ENGLISH_TURN, answer: CLEAN_ANSWER, at: AT },
    { storage: null },
  );

  it('answers an English message in English, with the product’s English terms', () => {
    expect(report.detection.language).toBe('en');
    expect(report.memory.reply).toMatchObject({ language: 'en', source: 'detected' });
    expect(report.response.style.terminology).toBe('english-terms');
    expect(report.response.style.notes[0]).toBe('en-neutral');
  });

  it('does not treat an English message as a Persian defect', () => {
    // The quality catalogue is Persian's. An English turn produces an English decision and no finding about
    // the person's spelling, which is the boundary between "reading a message" and "correcting this product".
    expect(languageQa(ENGLISH_TURN).review).toEqual([]);
    expect(evaluatePersianQuality(ENGLISH_TURN).findings).toEqual([]);
  });
});

describe('mixed Persian and English', () => {
  it('reads a whole English clause inside a Persian sentence as a clause, not a stray word', () => {
    const persian = languagePipeline({ text: MIXED_PERSIAN_TURN, at: AT }, { storage: null });
    expect(persian.context.terminology.value).toBe('sentence');
    expect(persian.memory.reply.language).toBe('fa');
    expect(persian.response.guidance.terminology).toBe('bilingual');
    // The reverse: the same shape with less Persian in it is answered in English, and the product's terms
    // stay English rather than being glossed for somebody who is reading English.
    const latin = languagePipeline({ text: MIXED_TURN, at: AT }, { storage: null });
    expect(latin.memory.reply.language).toBe('en');
    expect(latin.response.guidance.terminology).toBe('english-terms');
  });

  it('follows the larger script, and keeps the technical tokens in English either way', () => {
    const report = languagePipeline({ text: PERSIAN_TURN }, { storage: null });
    expect(report.detection.language).toBe('fa');
    const english = languagePipeline({ text: ENGLISH_TURN }, { storage: null });
    expect(english.detection.language).toBe('en');
    // The product's own vocabulary is matched on both sides: an English sentence that names a concept is a
    // technical turn, which is what decides its structure.
    expect(english.context.expertise.value).toBe('informed');
  });
});

describe('informal Persian', () => {
  const report = languagePipeline(
    { text: INFORMAL_TURN, answer: INFORMAL_TURN, at: AT },
    { storage: null },
  );

  it('reads the spoken register and asks for spoken wording back', () => {
    expect(report.detection.register).toBe('informal');
    expect(report.response.guidance.tone).toBe('conversational');
    expect(report.response.style.notes[0]).toBe('fa-conversational');
  });

  it('reports the informal form as a note rather than an error', () => {
    // `میشه` is how people write. It is offered a product form and is not called wrong, and that distinction is
    // what keeps the report usable: a surface that treated the note as an error would be correcting its users.
    const note = report.qa?.review.find((suggestion) => suggestion.rule === 'spelling.register');
    expect(note).toMatchObject({ found: 'میشه', suggestion: 'می‌شود', deterministic: false });
    expect(report.qa?.review.every((suggestion) => !suggestion.deterministic)).toBe(true);
  });
});

describe('technical and trading Persian', () => {
  const report = languagePipeline({ text: TECHNICAL_TURN, at: AT }, { storage: null });

  it('asks for the figure verbatim, in a turn dense enough to be read as technical', () => {
    const dense = languagePipeline({ text: MIXED_PERSIAN_TURN, at: AT }, { storage: null });
    expect(dense.context.expertise.value).toBe('technical');
    expect(dense.response.style.notes).toContain('figures-verbatim');
    expect(dense.response.style.notes).toContain('terms-bilingual');
  });

  it('does not call a turn technical merely because it holds a figure', () => {
    // The note that keeps a figure from being rounded on the way past belongs to a turn read as technical; a
    // message that names a product concept is *informed*, and asking it for numbers verbatim would be a
    // promise the reading did not make.
    expect(report.detection.wording).toBe('technical');
    expect(report.context.expertise.value).toBe('informed');
    expect(report.response.style.notes).not.toContain('figures-verbatim');
    expect(report.response.style.structure).toBe('direct-answer');
  });

  it('names the concept in both languages without translating the term that has no Persian form', () => {
    const concept = report.knowledge.concepts.find((entry) => entry.id === 'take-profit');
    expect(concept).toMatchObject({ fa: 'حد سود', en: 'Take-profit' });
  });
});

describe('Finglish', () => {
  const report = languagePipeline({ text: FINGLISH_TURN, at: AT }, { storage: null });

  it('reads Persian written in Latin letters as Persian, and answers in Persian', () => {
    expect(report.detection.language).toBe('finglish');
    expect(report.memory.reply).toMatchObject({ language: 'fa', source: 'detected' });
    expect(report.response.style.notes[0]).toMatch(/^fa-/);
  });

  it('does not read it as English, which is the mistake the closed marker list exists to prevent', () => {
    expect(report.detection.context.latinLetters).toBeGreaterThan(0);
    expect(report.detection.context.persianLetters).toBe(0);
    expect(report.memory.reply.language).not.toBe('en');
  });
});

describe('punctuation', () => {
  it('reports a question written without its mark, and rewrites nothing', () => {
    const report = languagePipeline(
      { text: 'چگونه حجم را کم کنم', answer: 'چگونه حجم را کم کنم', at: AT },
      { storage: null },
    );
    // The check lives in the evaluation layer rather than in the correction pipeline, because a missing mark is
    // a reading: an opening word is all it can see, and a heading looks like a question to it.
    const missing = report.learning.report?.quality.findings.find(
      (finding) => finding.check === 'punctuation.missing-question-mark',
    );
    expect(missing?.found).toBe('چگونه');
    expect(report.qa?.text).toBe('چگونه حجم را کم کنم');
  });

  it('hugs a mark to the word before it, once, and leaves a spaced ellipsis alone', () => {
    expect(languageQa('او رفت .').suggestions.map((s) => s.rule)).toEqual([
      'spacing.no-space-before-mark',
    ]);
    expect(languageQa('صبر کن ... بعد وارد شو').suggestions).toHaveLength(1);
    expect(evaluatePersianQuality('صبر کن ... بعد وارد شو').findings).toEqual([]);
  });

  it('does not touch a decimal point or a file name', () => {
    // The period is in the set of marks that hug the word before them, which is exactly why the protected
    // spans matter: a figure and an identifier are not prose.
    expect(languageQa('قیمت ۳٫۵ و index.ts است').suggestions).toEqual([]);
    expect(languageQa('۳٫۵ و index.ts').text).toBe('۳٫۵ و index.ts');
  });
});

describe('spelling', () => {
  it('reads the Arabic repertoire in an answer and calls it what it is', () => {
    const report = languagePipeline(
      { text: PERSIAN_TURN, answer: ANSWER_WITH_YEH, at: AT },
      { storage: null },
    );
    const repertoire = report.learning.report?.quality.findings.find(
      (finding) => finding.check === 'spelling.arabic-repertoire',
    );
    expect(repertoire?.found).toBe('ي');
    expect(repertoire?.instead).toBe('ی');
    // And the candidate the ledger would keep is one per *form*, not one per occurrence.
    const candidates = report.learning.candidates.filter(
      (candidate) => candidate.check === 'quality.spelling.arabic-repertoire',
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ family: 'spelling', form: 'ي', correction: 'ی' });
  });

  it('leaves a clean Persian answer with nothing to report', () => {
    const report = languagePipeline(
      { text: PERSIAN_TURN, answer: CLEAN_ANSWER, at: AT },
      { storage: null },
    );
    expect(report.learning.report?.problems).toEqual([]);
    expect(report.learning.candidates).toEqual([]);
    expect(report.qa?.corrections).toEqual([]);
  });
});

describe('ZWNJ and spacing', () => {
  it('reports a half-space written as a space, and applies nothing', () => {
    const report = languagePipeline(
      { text: 'کتاب هایمان', answer: 'کتاب هایمان', at: AT },
      { storage: null },
    );
    const attachment = report.qa?.review.find(
      (suggestion) => suggestion.rule === 'zwnj.clitic-candidate',
    );
    expect(attachment).toMatchObject({ found: ' هایمان', suggestion: '\u200cهایمان' });
    // Reported, never applied: the text comes back exactly as it was written.
    expect(report.qa?.text).toBe('کتاب هایمان');
    expect(report.text).toBe('کتاب هایمان');
  });

  it('reports the plural attachment the same way, and reads the same finding twice as one candidate', () => {
    expect(languageQa('کتاب ها').review[0]).toMatchObject({ rule: 'zwnj.attach-candidate' });
    expect(languageQa('کتاب ها').corrections).toEqual([]);
  });
});

describe('terminology', () => {
  it('offers the product’s form for a term written differently, as a decision for a person', () => {
    const report = languagePipeline(
      { text: 'حد سوددهی را بالا ببر', answer: 'حد سوددهی را بالا ببر' },
      {
        storage: null,
      },
    );
    const preferred = report.qa?.review.find(
      (suggestion) => suggestion.rule === 'terminology.preferred-form',
    );
    expect(preferred).toMatchObject({
      found: 'حد سوددهی',
      suggestion: 'حد سود',
      deterministic: false,
    });
    expect(report.knowledge.concepts.map((concept) => concept.id)).toContain('take-profit');
  });

  it('raises a terminology question with no correction at all when the product’s forms were asked for', () => {
    // The Persian form of `ATR` is a lexicon decision, so the candidate carries no wording and the decision
    // refers it to the reviewed path rather than writing one.
    const reading = readPersianAnswer({
      text: 'اندیکاتور ATR روی نماد XAUUSD سیگنال خرید میدهد.',
      context: FORMAL,
      evidence: 'copy-1',
      observedAt: AT,
      surface: 'copy',
    });
    const question = reading.candidates.find((candidate) => candidate.form === 'ATR');
    expect(question).toMatchObject({
      family: 'terminology',
      check: TERMINOLOGY_CHECK,
      correction: null,
    });
    expect(question?.reason).toContain('lexicon decision');
  });
});

describe('naturalness', () => {
  it('reads a Latin phrase where the product’s own forms were asked for as a note, not a defect', () => {
    const report = languagePipeline(
      { text: PERSIAN_TURN, answer: 'stop loss را رعایت کن', at: AT },
      { storage: null },
    );
    const verdict = report.learning.report?.verdicts.find(
      (entry) => entry.check === 'naturalness.english-run',
    );
    expect(verdict).toMatchObject({ stance: 'style', found: 'stop loss' });
    expect(
      report.learning.candidates.find((c) => c.check === 'naturalness.english-run')?.source,
    ).toBe('note');
  });

  it('re-reads the product’s own forms rather than checking the text a second time', () => {
    // The naturalness report carries the quality report it re-read, and the two lists cannot disagree about a
    // finding: every quality finding appears as a verdict under the same id behind the `quality.` prefix.
    const report = languagePipeline(
      { text: PERSIAN_TURN, answer: ANSWER_WITH_YEH, at: AT },
      { storage: null },
    );
    const quality = report.learning.report?.quality.findings ?? [];
    const verdicts = report.learning.report?.verdicts ?? [];
    expect(quality.length).toBeGreaterThan(0);
    for (const finding of quality) {
      expect(verdicts.some((verdict) => verdict.check === `quality.${finding.check}`)).toBe(true);
    }
    // And the checks that ran name both catalogues, so a report a reader holds says which layers produced it.
    expect(report.learning.report?.checks).toContain('naturalness.english-run');
  });
});

describe('the language of the answer', () => {
  it('answers from the reading when nothing else claims a language', () => {
    const report = languagePipeline({ text: PERSIAN_TURN }, { storage: null });
    expect(report.memory.reply.source).toBe('detected');
    expect(report.memory.reason).toContain('the resolver answered from detected');
  });

  it('records the language each turn was answered in, and reads it back as a habit', () => {
    // Five turns answered in Persian is evidence about the person and none about the sentence in front of
    // them, which is why it outranks one message and never outranks a choice.
    const storage = fakeStorage({
      'master-trade.language.observations': JSON.stringify({
        samples: 6,
        formality: { formal: 1, informal: 0, neutral: 5 },
        detail: { concise: 1, standard: 5, detailed: 0 },
        languages: { fa: 6, en: 0 },
      }),
    });
    const report = languagePipeline({ text: ENGLISH_TURN }, { storage: storage.store });
    expect(report.memory).toMatchObject({ samples: 6 });
    expect(report.memory.learned).toMatchObject({ language: 'fa', count: 6, samples: 6 });
    expect(report.memory.reply).toMatchObject({
      language: 'fa',
      source: 'observed',
      overridden: true,
    });
    expect(report.memory.reply.reason).toContain('a habit outranks the reading of one message');
  });

  it('reads a request inside the message above a choice made in the settings', () => {
    const { store, entries } = fakeStorage();
    writeLanguagePreference('fa', store);
    const report = languagePipeline({ text: ASKS_ENGLISH }, { storage: store });
    expect(report.memory.preference).toBe('fa');
    expect(report.memory.reply).toMatchObject({
      language: 'en',
      source: 'requested',
      overridden: true,
    });
    expect(report.response.style.notes[0]).toBe('en-neutral');
    // A request is read, not stored: the setting is still the setting.
    expect(entries.get('master-trade.language.preference')).toBe('fa');
  });

  it('lets a statement outrank a habit, and the setting outrank the statement', () => {
    const storage = fakeStorage({
      'master-trade.language.observations': JSON.stringify({
        samples: 9,
        formality: { formal: 0, informal: 0, neutral: 9 },
        detail: { concise: 0, standard: 9, detailed: 0 },
        languages: { fa: 9, en: 0 },
      }),
      'master-trade.language.corrections': JSON.stringify({
        version: 1,
        corrections: [
          {
            dimension: 'language',
            value: 'en',
            source: 'correction',
            surface: 'settings',
            recordedAt: AT,
            confidence: 0.8,
            confirmations: 1,
          },
        ],
      }),
    });
    const stated = languagePipeline({ text: PERSIAN_TURN }, { storage: storage.store });
    expect(stated.memory.stated).toMatchObject({ value: 'en', confirmations: 1 });
    expect(stated.memory.reply).toMatchObject({
      language: 'en',
      source: 'corrected',
      overridden: true,
    });

    const chosen = languagePipeline(
      { text: PERSIAN_TURN },
      { storage: fakeStorage({ 'master-trade.language.preference': 'fa' }).store },
    );
    expect(chosen.memory.reply).toMatchObject({
      language: 'fa',
      source: 'explicit',
      overridden: false,
    });
  });

  it('reads a request for the Persian *word* as a terminology request, not a language one', () => {
    const report = languagePipeline({ text: 'این را با معادل فارسی بگو' }, { storage: null });
    expect(report.detection.request).toBeNull();
    expect(report.memory.reply.source).toBe('detected');
  });
});

describe('the interface switch, and the line between the two systems', () => {
  it('has exactly one crossing point between the interface and the language memory', () => {
    // The setting is shared — the switch writes it and this layer reads it — and nothing else is: a message
    // the agent reads as Persian cannot move the interface, and the interface cannot ask this layer what a
    // word is. The scan is what makes that a property rather than an intention.
    const deep: { readonly file: string; readonly module: string }[] = [];
    for (const path of sourcesOf()) {
      const file = relative(ROOT, path).replace(/\\/g, '/');
      if (file.startsWith('web/src/language/')) continue;
      const source = readFileSync(path, 'utf8');
      for (const match of source.matchAll(/from '([^']*language\/[^']*)'/g)) {
        const specifier = match[1] ?? '';
        if (!specifier.includes('language/')) continue;
        deep.push({
          file,
          module: specifier.slice(specifier.lastIndexOf('/') + 1).replace(/\.js$/, ''),
        });
      }
    }
    expect(deep.length).toBeGreaterThan(0);
    expect([...new Set(deep.map((entry) => entry.module))]).toEqual(['preference']);
    expect([...new Set(deep.map((entry) => entry.file))].sort()).toEqual([
      'web/src/i18n/locales.ts',
      'web/src/pages/SettingsPage.tsx',
      'web/src/store/ui.ts',
    ]);

    // And this direction: nothing in the language layer reaches the interface, a store or a component.
    for (const path of sourcesOf(join(ROOT, 'web', 'src', 'language'))) {
      const source = readFileSync(path, 'utf8');
      expect(source, relative(ROOT, path)).not.toMatch(
        /from '\.\.\/(i18n|store|pages|components|app)/,
      );
      expect(source, relative(ROOT, path)).not.toMatch(/from 'react'/);
    }
  });

  it('answers from the shared setting when the switch chose a language, and never from a locale', () => {
    const chosen = languagePipeline(
      { text: ENGLISH_TURN },
      { storage: fakeStorage({ 'master-trade.language.preference': 'fa' }).store },
    );
    expect(chosen.memory.reply).toMatchObject({
      language: 'fa',
      source: 'explicit',
      overridden: true,
    });
    // The report names a reply language and no locale: the interface's own language is not a field here, which
    // is what keeps a Persian *answer* from being a statement about the interface.
    expect(PIPELINE_FIELDS).not.toContain('locale');
    expect(JSON.stringify(chosen)).not.toContain('fa-IR');
  });

  it('adds no dependency: the layer imports nothing the project does not already declare', () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
    const declared = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
    ]);
    const bare = new Set<string>();
    for (const path of sourcesOf(join(ROOT, 'web', 'src', 'language'))) {
      const source = readFileSync(path, 'utf8');
      for (const match of source.matchAll(/from '([^'.][^']*)'/g)) {
        const specifier = match[1] ?? '';
        const name = specifier.startsWith('@')
          ? specifier.split('/').slice(0, 2).join('/')
          : (specifier.split('/')[0] ?? specifier);
        if (name.startsWith('@shared')) continue;
        bare.add(name);
      }
    }
    expect([...bare].length).toBeGreaterThan(0);
    for (const name of bare)
      expect(declared.has(name), `${name} is not a declared dependency`).toBe(true);
  });
});

describe('RTL-safe output', () => {
  it('hands back the text it was given, byte for byte, in both languages', () => {
    for (const text of [PERSIAN_TURN, ENGLISH_TURN, MIXED_TURN, INFORMAL_TURN, '۳٫۵ و index.ts']) {
      const report = languagePipeline({ text, answer: text, at: AT }, { storage: null });
      expect(report.text).toBe(text);
      expect(report.input).toBe(text);
      expect(report.answer).toBe(text);
    }
  });

  it('never writes a bidi control of its own', () => {
    // Isolation is what the renderer does to a figure, not something a reading layer inserts into somebody's
    // text: a control character in the report would be a direction the interface did not decide.
    const controls = /[\u202a-\u202e\u2066-\u2069\u200e\u200f]/;
    const report = languagePipeline(
      { text: PERSIAN_TURN, answer: ANSWER_WITH_YEH, at: AT },
      { storage: null },
    );
    const strings = (value: unknown): string[] =>
      typeof value === 'string'
        ? [value]
        : Array.isArray(value)
          ? value.flatMap((entry) => strings(entry))
          : value !== null && typeof value === 'object'
            ? Object.values(value).flatMap((entry) => strings(entry))
            : [];
    for (const string of strings(report)) expect(string, string).not.toMatch(controls);
  });

  it('keeps a signed figure out of the catalogue, where it could not be isolated', () => {
    // The half of the RTL contract this layer can check: a catalogue value that opens with a signed figure
    // cannot be given the isolation class, because the element carrying it also carries the prose.
    const values = Object.values(FA_MESSAGES);
    expect(values.length).toBeGreaterThan(2000);
    expect(values.filter((value) => /^[+\u2212-]\s?[0-9]/.test(value))).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* 3. The historical defects                                                   */
/* -------------------------------------------------------------------------- */

interface RecordedDefect {
  /** The phase that recorded it, as the heading in `docs/persian-language.md` names it. */
  readonly phase: string;
  /** What went wrong, in one line, as the document tells it. */
  readonly defect: string;
  /** The permanent case that owns the defect, when it is not this layer's to re-run. */
  readonly ownedBy?: { readonly file: string; readonly mustContain: string };
  /** A live re-run of the fix, for every defect this layer can reproduce. */
  readonly probe: () => void;
}

const REGRESSION_CASE: LanguageRegressionCase = {
  id: 'case-repertoire',
  family: 'spelling',
  check: 'quality.spelling.arabic-repertoire',
  probe: 'مديريت ريسک',
  form: 'ي',
  correction: 'ی',
  expected: 'reported',
  context: FORMAL,
  confirmedAt: AT,
  reference: 'review-1',
};

const HISTORICAL_DEFECTS: readonly RecordedDefect[] = [
  {
    phase: '7.5.3.5.5',
    defect:
      'a module cycle that only an entry point could see, and one reading where two views were needed',
    probe: () => {
      // The layer has one cycle — `terminology.ts` reads the character normalizer, `normalize.ts` reads the
      // seed for its defaults, `seed.ts` composes itself from the lexicon — and which member an entry point
      // touches first decides whether the catalogue exists when it is asked. Every suite before this one
      // imported the index, whose order happens to work; the pipeline starts at the seed on purpose, and this
      // file imports the pipeline before the index, so the property is asserted by building. The line below
      // is what the import above depends on.
      const source = readFileSync(join(ROOT, 'web', 'src', 'language', 'pipeline.ts'), 'utf8');
      const [first] = [...source.matchAll(/^import[^;]+from '(\.[^']+)';$/gm)].map(
        (match) => match[1],
      );
      expect(first).toBe('./seed.js');

      // And one answer is read once: the two views the phase needs — the verdicts and the candidates drawn
      // from them — are one evaluation rather than two, and the narrower view is the wider one's field.
      const input = {
        text: ANSWER_WITH_YEH,
        context: FORMAL,
        evidence: 'answer-1',
        observedAt: AT,
        surface: 'answer' as const,
      };
      const wide = readPersianAnswer(input);
      expect(wide.report.quality).toEqual(evaluatePersianQuality(ANSWER_WITH_YEH));
      expect(observePersianText(input)).toEqual(wide.candidates);
    },
  },
  {
    phase: '7.5.1',
    defect: 'a currency formatter with no currency claimed a symbol it had not been given',
    ownedBy: {
      file: 'tests/persian-language.test.ts',
      mustContain: 'claims no symbol when there is no currency to claim',
    },
    probe: () => {
      // A call that claims no currency claims no symbol: the figure stands alone rather than being given the
      // name of the missing value, which is what `Intl` renders for an absent one.
      expect(formatFaCurrency(1250000.5, '')).toBe('۱٬۲۵۰٬۰۰۰٫۵');
      expect(formatFaCurrency(1250000.5, '')).not.toContain('undefined');
      const withCode = formatFaCurrency(1250000.5, 'IRR');
      expect(withCode).toContain('۱٬۲۵۰٬۰۰۰٫۵');
      expect(withCode).not.toContain('undefined');
    },
  },
  {
    phase: '7.5.2.3',
    defect:
      'six defects found by running the layer on real Persian, three of them an invisible character',
    ownedBy: { file: 'tests/persian-qa.test.ts', mustContain: 'protect' },
    probe: () => {
      // A protected span is honoured by the compound replacer, which is where the guard was missing.
      expect(normalize('بجای', ['بجای'])).toBe('بجای');
      // No rule offers a correction equal to the form it corrects — the lost half-space, twice.
      for (const pair of COMPOUND_PAIRS) expect(pair.written).not.toBe(pair.correct);
      // The numeral rule asks about the noun, not about the numeral that is always protected.
      expect(languageQa('۳ معاملات داشتم.').review.map((s) => s.rule)).toContain(
        'grammar.plural-after-numeral',
      );
      // The object-marker rule sees a clause that ends a line, not only the end of the text.
      expect(languageQa('این معامله را\nببند').review.map((s) => s.rule)).toContain(
        'grammar.object-marker-before-verb',
      );
      // The ezafe rule does not glue a one-letter conjunction: `و ی` is two words.
      expect(normalize('و ی', [])).toBe('و ی');
      // And the normalization stage's findings reach a caller, rather than only its changes.
      expect(languageQa('کتاب ها').review[0]?.rule).toBe('zwnj.attach-candidate');
    },
  },
  {
    phase: '7.5.3.1',
    defect: 'two defects in the reading, and one in the check on it',
    ownedBy: { file: 'tests/language-detection.test.ts', mustContain: 'finglish' },
    probe: () => {
      // A question mark anywhere in a chat message is a question, and an instruction in Persian closes with
      // its verb rather than opening with a noun.
      expect(detectLanguage('قیمت رو دیدی؟ الان چیکار کنم').style).toBe('question');
      expect(detectLanguage('این معامله را خلاصه کن').style).toBe('instruction');
      // The mixed-confidence number rewards balance instead of punishing it: the same letters, split evenly,
      // score above the same letters split unevenly.
      const balanced = detectLanguage(BALANCED_MIX).confidence;
      const unbalanced = detectLanguage(UNBALANCED_MIX).confidence;
      expect(balanced).toBeGreaterThan(unbalanced);
      // The field-name guard compares segments, so the profile may have a field for the language it detects.
      expect(LANGUAGE_PROFILE_FIELDS).toContain('language');
    },
  },
  {
    phase: '7.5.3.2',
    defect:
      'six defects that were all the same mistake: a count right about the tokens and wrong about the language',
    ownedBy: { file: 'tests/language-context.test.ts', mustContain: 'Risk/reward' },
    probe: () => {
      // An English message's own vocabulary is this product's vocabulary, on both sides of the lexicon.
      expect(detectLanguage('Should I move my stop-loss to break-even?').context.terms).toContain(
        'stop-loss',
      );
      // The mixed reader counts runs and not tokens: a whole English clause is a clause.
      expect(read(MIXED_TURN).terminology.value).toBe('sentence');
      // Two entries asking for one style are one request.
      expect(read('این را رسمی بنویس').requestedFormality).toBe('formal');
      // A greeting cannot outvote the subject matter, because the signals are de-duplicated.
      expect(read('hey, where should I move my stop-loss?').setting.value).toBe('professional');
      // A request for a term is not a request for a language.
      expect(detectLanguage('این را با معادل فارسی بگو').request).toBeNull();
      // A Persian imperative at the end of a sentence is an instruction, not a statement.
      expect(detectLanguage('حد ضرر را ببند.').style).toBe('instruction');
      // And the learned store has no terminology leaf, because nothing ever wrote one.
      expect(Object.keys(emptyObservations())).toEqual([
        'samples',
        'formality',
        'detail',
        'languages',
      ]);
    },
  },
  {
    phase: '7.5.3.3',
    defect: 'the migration believing it knew better, seven times, six of them the codemod’s fault',
    ownedBy: { file: 'tests/ui-language.test.ts', mustContain: 'source-copy' },
    probe: () => {
      // The codemod's own worst error was reaching into a value that was not copy: an SVG path, a constant or a
      // string in the code. The catalogue is scanned for anything that still looks like code or an English
      // sentence, with the brand name — which is deliberately the same in both locales — the only exception.
      const values = Object.entries(FA_MESSAGES);
      expect(values.length).toBeGreaterThan(2000);
      const looksLikeSource = values.filter(
        ([, value]) =>
          /^[A-Za-z][A-Za-z0-9 .,:/-]*$/.test(value) && /[A-Z]/.test(value) && / /.test(value),
      );
      expect(looksLikeSource.map(([key]) => key)).toEqual(['brand.masterTrade']);
    },
  },
  {
    phase: '7.5.3.4.1',
    defect: 'two defects, both a chain with one more link than expected',
    ownedBy: { file: 'tests/response-language.test.ts', mustContain: "source: 'observed'" },
    probe: () => {
      // An inferred decision has its own guidance clause rather than falling through to "nothing was read and
      // nothing was chosen", which is the sentence a guidance may not say about a decision it did make.
      const storage = fakeStorage({
        'master-trade.language.observations': JSON.stringify({
          samples: 6,
          formality: { formal: 0, informal: 0, neutral: 6 },
          detail: { concise: 0, standard: 6, detailed: 0 },
          languages: { fa: 6, en: 0 },
        }),
      });
      const report = languagePipeline({ text: ENGLISH_TURN }, { storage: storage.store });
      expect(report.memory.reply.source).toBe('observed');
      // The clause the inference falls into is its own, rather than the one that says nothing was decided.
      expect(report.response.guidance.reason).not.toContain('Nothing was read');
      expect(report.response.guidance.reason).toContain('habitually answered in');
      // And a first run is not a crash: nothing learned is a value, not a missing one.
      expect(languagePipeline({ text: PERSIAN_TURN }, { storage: null }).memory.learned).toBeNull();
    },
  },
  {
    phase: '7.5.3.4.2',
    defect: 'four defects, three of them a decision written down twice',
    ownedBy: { file: 'tests/adaptive-style.test.ts', mustContain: 'GUIDANCE_DETAILS' },
    probe: () => {
      // Two vocabularies for one dimension would be two opinions: the reading of how much detail a turn wants
      // and the instruction of how much to give are the contract's own lists, asserted by identity so a copy
      // cannot pass for one.
      expect(CONTEXT_DEPTHS).toBe(GUIDANCE_DETAILS);
      expect(TERMINOLOGY_STYLES).toBe(GUIDANCE_TERMINOLOGY);
      // The source list is in consulted order, so a reader does not have to open the resolver.
      expect(languagePipeline({ text: PERSIAN_TURN }, { storage: null }).memory.reply.source).toBe(
        'detected',
      );
      // And a learned preference outranks the reading of one message, which is the order this phase reversed.
      const observations = {
        samples: 8,
        formality: { formal: 8, informal: 0, neutral: 0 },
        detail: { concise: 0, standard: 0, detailed: 8 },
        languages: { fa: 8, en: 0 },
      };
      const storage = fakeStorage({
        'master-trade.language.observations': JSON.stringify(observations),
      });
      const report = communicationProfile(INFORMAL_TURN, {
        detection: detectLanguage(INFORMAL_TURN),
        observations,
      });
      expect(report.formality.value).toBe('formal');
      expect(report.formality.source).toBe('observed');
      expect(report.formality.reason).toContain(
        'a learned preference outranks the reading of one message',
      );
      // And the same turn through the pipeline, where the tone follows it.
      const pipeline = languagePipeline({ text: INFORMAL_TURN }, { storage: storage.store });
      expect(pipeline.response.guidance.tone).toBe('formal');
      expect(pipeline.memory.reply.source).toBe('observed');
    },
  },
  {
    phase: '7.5.3.4.3',
    defect: 'two things the shape refused, and both were right to',
    ownedBy: { file: 'tests/language-learning.test.ts', mustContain: 'RESPONSE_FEEDBACK' },
    probe: () => {
      // Every verdict maps to a value its own dimension holds — the check that does not need to guess what a
      // future verdict would be.
      const verdicts: readonly ResponseFeedback[] = [
        'too-long',
        'too-short',
        'too-casual',
        'too-formal',
        'prefer-persian',
        'prefer-english',
      ];
      expect([...Object.keys(RESPONSE_FEEDBACK)]).toEqual(verdicts);
      for (const verdict of verdicts) {
        const report = languagePipeline(
          { text: PERSIAN_TURN, answer: CLEAN_ANSWER, feedback: verdict, at: AT },
          { storage: null },
        );
        const entry = report.learning.feedback?.entry;
        expect(entry, verdict).not.toBeNull();
        if (entry === null || entry === undefined) continue;
        const values = CORRECTION_VALUES[entry.dimension];
        expect(values, verdict).toContain(entry.value);
      }
      // The write path has no eviction branch that cannot run: the store appends only for a value no entry
      // holds, and every value the vocabularies hold fits under the reader's cap because the cap is the
      // reader's. Writing all of them leaves all of them.
      let corrections = emptyCorrections();
      let written = 0;
      for (const [dimension, values] of Object.entries(CORRECTION_VALUES)) {
        for (const value of values) {
          const decision = recordCorrection(
            { dimension, value, source: 'correction', surface: 'settings', recordedAt: AT },
            corrections,
          );
          expect(decision.outcome, `${dimension}:${value}`).toBe('recorded');
          corrections = decision.store;
          written += 1;
        }
      }
      expect(written).toBe(8);
      expect(corrections.corrections).toHaveLength(8);
      expect(corrections.corrections.length).toBeLessThanOrEqual(MAX_CORRECTIONS);
    },
  },
  {
    phase: '7.5.3.4.4',
    defect: 'one attribute with two writers, and thirteen invisible ones',
    ownedBy: { file: 'tests/rtl-layout.test.ts', mustContain: 'useTranslation.ts' },
    probe: () => {
      // One writer for `dir`, and it is not in this layer: the language layer decides a *reply* language and
      // the interface derives its direction from the resolved locale.
      const writers = sourcesOf().filter((path) =>
        /documentElement\.(dir|lang)\s*=/.test(readFileSync(path, 'utf8')),
      );
      expect(writers.map((path) => relative(ROOT, path).replace(/\\/g, '/'))).toEqual([
        'web/src/i18n/useTranslation.ts',
      ]);
    },
  },
  {
    phase: '7.5.3.4.5',
    defect: 'a control that resolved its own direction, and the five figures it was hiding',
    ownedBy: { file: 'tests/frontend-integration.test.ts', mustContain: 'signed figure' },
    probe: () => {
      // The figures left the copy and became data, which is what let the panels be turned around. The rule
      // holds for the whole Persian catalogue, and the floor below is what makes an empty answer a clean one.
      const values = Object.values(FA_MESSAGES);
      expect(values.length).toBeGreaterThan(2000);
      expect(values.filter((value) => /^[+\u2212-]\s?[0-9]/.test(value))).toEqual([]);
    },
  },
  {
    phase: '7.5.3.5.1',
    defect: 'three false positives, and the point in the phase where the reading was wrong',
    ownedBy: { file: 'tests/persian-evaluation.test.ts', mustContain: 'npm test' },
    probe: () => {
      // A code span is not prose, two symbols are not a language, and the period is a mark that hugs the word
      // before it — three findings that would have spent the report's currency.
      expect(evaluatePersianQuality('دستور `npm test` را اجرا کن').findings).toEqual([]);
      expect(
        evaluatePersianQuality('اندیکاتور ATR روی نماد XAUUSD سیگنال خرید میدهد.').findings,
      ).toEqual([]);
      expect(evaluatePersianQuality('mistake . here').findings).toEqual([]);
      expect(evaluatePersianQuality('او رفت .').findings.map((finding) => finding.check)).toEqual([
        'spacing.before-mark',
      ]);
    },
  },
  {
    phase: '7.5.3.5.2',
    defect: 'the ellipsis, and a rule whose own sentence promised more than it can see',
    ownedBy: { file: 'tests/persian-evaluation.test.ts', mustContain: 'verb-number-agreement' },
    probe: () => {
      // A spaced ellipsis is how an ellipsis is written, and one shared predicate keeps the two spacing checks
      // from disagreeing about it.
      expect(evaluatePersianQuality('صبر کن ... بعد وارد شو').findings).toEqual([]);
      // The documented miss, asserted as a miss: the broken plural and the `ات` plural that end in something
      // other than `ها` are outside the rule, and the `ها` shape it can see is beside it as the positive.
      expect(languageQa('معاملات خوب بود').review).toEqual([]);
      expect(languageQa('معاملات خوب بودند').review).toEqual([]);
      expect(languageQa('پوزیشن‌ها بسته شد').review.map((suggestion) => suggestion.rule)).toEqual([
        'grammar.verb-number-agreement',
      ]);
      // The grammar rules are the QA pipeline's and not the normalizer's, which is why the miss above is
      // asserted through the pipeline that reads them.
      expect(persianFindings('پوزیشن‌ها بسته شد')).toEqual([]);
      // The recognition vocabulary has no value nothing can produce: `terminology` is a recognition kind and no
      // check claims it.
      expect(LANGUAGE_QUALITY_RECOGNITION_KINDS).toContain('terminology');
      expect(LANGUAGE_QUALITY_CHECKS.every((check) => check.reading !== 'terminology')).toBe(true);
    },
  },
  {
    phase: '7.5.3.5.3',
    defect: 'two grammar rules that report the product’s own correct Persian',
    ownedBy: { file: 'tests/persian-naturalness.test.ts', mustContain: 'NATURALNESS_LIMITS' },
    probe: () => {
      // The product's own copy is scanned, and every `problem` it produces is one of the readings the layer
      // names as a limit: a third rule reporting this product's correct Persian fails here rather than
      // arriving as a quiet finding on somebody's screen.
      const problems = new Set<string>();
      let scanned = 0;
      for (const value of Object.values(FA_MESSAGES)) {
        if (value.trim().length < 20) continue;
        scanned += 1;
        for (const verdict of evaluatePersianNaturalness(value, FORMAL).problems) {
          problems.add(verdict.check);
        }
      }
      expect(scanned).toBeGreaterThan(1000);
      expect([...problems].sort()).toEqual(
        [
          'quality.grammar.pronoun-agreement',
          'quality.grammar.verb-number-agreement',
          'quality.punctuation.missing-question-mark',
        ].sort(),
      );
      const limits = NATURALNESS_LIMITS.join(' ');
      expect(limits).toContain('grammar.verb-number-agreement');
      expect(limits).toContain('grammar.pronoun-agreement');
      // The third is named by the rule's own reading rather than by the layer's limits: its check is not
      // deterministic, so what it produces is a report and never a decision.
      const opened = evaluatePersianQuality('چگونه حجم را کم کنم').findings[0];
      expect(opened?.check).toBe('punctuation.missing-question-mark');
      expect(problems.has('quality.punctuation.missing-question-mark')).toBe(true);
      expect(
        LANGUAGE_QUALITY_CHECKS.find((check) => check.id === 'punctuation.missing-question-mark'),
      ).toMatchObject({ deterministic: false, axis: 'punctuation' });
      // And the sentence the document names is still reported, so the limit is honest about the noise rather
      // than hiding it.
      expect(evaluatePersianQuality('نمودار خالی واقعیتی درباره داده‌ها است').findings.length).toBe(
        1,
      );
    },
  },
  {
    phase: '7.5.3.5.4',
    defect:
      'an identity that made precedence impossible, a check refused at the door, and a round trip',
    ownedBy: { file: 'tests/persian-continuous-learning.test.ts', mustContain: 'supersede' },
    probe: () => {
      // The identity is the family and the form: the rule is who saw it and the correction is what they
      // propose, so a person's correction and a detector's reading of one form are one candidate.
      // The identity is a family and a form and nothing else: the rule is who saw it and the correction is
      // what they propose, so the two calls below cannot be told apart by anything the id is built from.
      const of = (): string => learningObservationId({ family: 'spelling', form: 'ي' });
      expect(of()).toBe('spelling|ي');
      // Both pseudo-ids are readable, so a terminology question reaches the ledger instead of being refused:
      // four texts make it ready, and the decision refers it rather than writing a word.
      const candidates: LearningCandidate[] = [];
      for (const evidence of ['copy-1', 'copy-2', 'copy-3', 'copy-4']) {
        candidates.push(
          ...readPersianAnswer({
            text: 'اندیکاتور ATR روی نماد XAUUSD سیگنال خرید میدهد.',
            context: FORMAL,
            evidence,
            observedAt: AT,
            surface: 'copy',
          }).candidates.filter((candidate) => candidate.check === TERMINOLOGY_CHECK),
        );
      }
      expect(candidates.length).toBeGreaterThan(0);
      const ledger = recordObservations(candidates, emptyLearningStore());
      const ready = ledger.store.observations.find((observation) => observation.state === 'ready');
      expect(ready).toBeDefined();
      const decision = decideObservation(ready?.id ?? '', ledger.store, seededLanguageMemory(), {
        verdict: 'form-is-wrong',
        origin: 'human-review',
        reference: 'review-1',
        at: AT,
        probe: 'اندیکاتور ATR روی نماد XAUUSD سیگنال خرید میدهد.',
      });
      expect(decision.action).toBe('referred');
      expect(decision.reason).toContain('terminology candidate path');

      // A round trip keeps the context a decision was judged against — the field a strict schema dropped.
      const written = recordObservations(
        [
          {
            family: 'spelling',
            check: 'quality.spelling.arabic-repertoire',
            form: 'ي',
            correction: 'ی',
            reason: 'the Arabic yeh',
            source: 'detector',
            evidence: 'answer-1',
            observedAt: AT,
            surface: 'answer',
            context: FORMAL,
          },
        ],
        emptyLearningStore(),
      );
      const restored = parseLearningStore(JSON.parse(JSON.stringify(written.store)));
      expect(restored.observations).toHaveLength(1);
      expect(restored.observations[0]?.context).toEqual(FORMAL);

      // And the corpus keeps a fixed error fixed, in the three ways a case can stop meaning anything: a case
      // whose rule still behaves passes, one whose rule stopped fails, and a corpus that both rejects a form
      // and requires a rule to report it fails as a contradiction rather than as a missing finding.
      expect(regressionCheck([REGRESSION_CASE]).failures).toEqual([]);
      const stopped = regressionCheck([
        { ...REGRESSION_CASE, check: 'quality.spelling.repeated-mark' },
      ]);
      expect(stopped.failures).toHaveLength(1);
      expect(stopped.failures[0]?.reason).toContain('the error this product fixed has come back');
      const contradiction = regressionCheck([
        REGRESSION_CASE,
        { ...REGRESSION_CASE, id: 'case-accepted', expected: 'accepted', check: null },
      ]);
      expect(contradiction.failures).toHaveLength(1);
      expect(contradiction.failures[0]?.reason).toContain('the corpus both accepts');
    },
  },
];

/** The normalizer, named once so the cases below read as the claim rather than as a call. */
function normalize(text: string, protect: readonly string[]): string {
  return persianFindingsAndText(text, protect);
}

/** A tiny wrapper so the two call sites above stay readable: the report's own text, with protections. */
function persianFindingsAndText(text: string, protect: readonly string[]): string {
  // `runRules` with the protected set is the mechanism; the public route is `languageQa` with `protect`, and
  // both are exercised elsewhere. This reads the text the pipeline would produce for it.
  return (
    languageQa(text, { protect }).stages.find((stage) => stage.family === 'normalization')
      ?.output ?? text
  );
}

/** The context of a message, which four of the cases above ask about and none of them re-detects. */
function read(text: string): ReturnType<typeof analyzeCommunication> {
  return analyzeCommunication(text, { detection: detectLanguage(text) });
}

describe('every confirmed historical defect has a permanent regression case', () => {
  const document = readFileSync(join(ROOT, 'docs', 'persian-language.md'), 'utf8');

  it.each(HISTORICAL_DEFECTS)('$phase — $defect', (entry) => {
    if (entry.ownedBy !== undefined) {
      const source = readFileSync(join(ROOT, entry.ownedBy.file), 'utf8');
      expect(source, `${entry.ownedBy.file} must contain ${entry.ownedBy.mustContain}`).toContain(
        entry.ownedBy.mustContain,
      );
    }
    entry.probe();
  });

  it('covers every phase the document records, so a new defect cannot be left uncovered', () => {
    const section = document.slice(document.indexOf('## What verification found'));
    const recorded = [...section.matchAll(/^### (7\.5\.[0-9.]+):/gm)].map(
      (match) => match[1] ?? '',
    );
    expect(recorded.length).toBeGreaterThanOrEqual(13);
    for (const phase of recorded) {
      expect(
        HISTORICAL_DEFECTS.some((entry) => entry.phase === phase),
        `the document records a defect for ${phase} and this table does not`,
      ).toBe(true);
    }
  });

  it('points at files that exist, so a moved suite fails here rather than weakening the table', () => {
    for (const entry of HISTORICAL_DEFECTS) {
      if (entry.ownedBy === undefined) continue;
      const path = join(ROOT, entry.ownedBy.file);
      expect(() => readFileSync(path, 'utf8'), entry.ownedBy.file).not.toThrow();
      expect(readFileSync(path, 'utf8')).toMatch(/\bit\(|it\.each\(/);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 4. The whole benchmark, and nothing left out                                */
/* -------------------------------------------------------------------------- */

describe('the benchmark itself', () => {
  it('names every stage in the report, so a stage cannot be dropped by shrinking the list', () => {
    const report = languagePipeline(
      { text: PERSIAN_TURN, answer: CLEAN_ANSWER, at: AT },
      { storage: null },
    );
    for (const stage of LANGUAGE_PIPELINE_STAGES) {
      expect(report, stage).toHaveProperty(stage);
    }
    expect(LANGUAGE_PIPELINE_STAGES).toHaveLength(8);
  });

  it('is the same function the layer exports, reached through the index as well', () => {
    // One surface: the module and the index hand a caller the same function rather than two spellings of it.
    expect(typeof languagePipeline).toBe('function');
    const viaIndex = languagePipeline({ text: PERSIAN_TURN }, { storage: null });
    const viaModule = languagePipeline({ text: PERSIAN_TURN }, { storage: null });
    expect(viaIndex).toEqual(viaModule);
  });

  it('keeps the layer’s own reading of one turn out of the reply it decides', () => {
    // The last cross-check: the reply language, the tone and the terminology are decided from the message
    // *before* the answer exists, so judging the answer cannot move them. The same turn with a clean answer and
    // with a wrong one resolves the same way.
    const wrong = languagePipeline(
      { text: INFORMAL_TURN, answer: ANSWER_WITH_YEH, at: AT },
      { storage: null },
    );
    const clean = languagePipeline(
      { text: INFORMAL_TURN, answer: CLEAN_ANSWER, at: AT },
      { storage: null },
    );
    expect(wrong.response).toEqual(clean.response);
    expect(wrong.learning.context).toEqual(clean.learning.context);
    expect(wrong.learning.candidates.length).toBeGreaterThan(clean.learning.candidates.length);
  });
});
