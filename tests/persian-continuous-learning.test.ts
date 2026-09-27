/**
 * Phase 7.5.3.5.4 — Persian continuous learning and the corpus that keeps a fixed error fixed.
 *
 * The claims, in the order they can fail:
 *
 *   1. **Nothing is learned from one example.** A detector's finding is recorded, is not knowledge, and
 *      cannot be decided on until the same finding has been seen in `LEARNING_THRESHOLDS.evidence.detector`
 *      *distinct* texts — and a repetition inside one text is not a second text. A person's own correction is
 *      ready on its own, supersedes the machine's reading of the same form, and is the only thing that
 *      reopens a candidate a reviewer turned down.
 *   2. **A decision writes knowledge only through the store's own path.** An accepted form enters as an
 *      `exception` entry — the same mechanism the pipeline's protected-literal set reads, verified here by
 *      the form actually going quiet — and a confirmed defect is recorded as a worked example plus a case.
 *      An `agent-proposal` can only ever leave a proposal, and accepting later writes the case; no rule,
 *      orthography entry or seeded value is ever touched, and the suite compares the store before and after.
 *   3. **A fixed error cannot come back quietly.** Every confirmed defect produces a case, the corpus is
 *      re-read on every run, and the reading discriminates: a case whose rule stops reporting it fails, and
 *      so does a corpus that both accepts a form and requires a rule to report it.
 *   4. **It is a ledger, not a second memory.** The loop reaches the knowledge store and the reading layers
 *      and nothing else — no Agent Memory, no response guidance, no interface — it stores no field a message,
 *      a person or a credential could occupy, and a stored ledger round-trips or degrades entry by entry.
 *   5. **A wrong answer is still worse than a missing one.** Prose that is merely informal, a Latin term the
 *      context asked for in English, a person's own wording and a clean technical answer produce no candidate
 *      at all; a note is raised as a note rather than as a complaint.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CASE_FIELDS,
  CORROBORATION_STEP,
  LANGUAGE_LEARNING_KEY,
  LANGUAGE_QUALITY_CHECKS,
  LEARNING_ACTIONS,
  LEARNING_CONFIDENCE,
  LEARNING_EXPECTATIONS,
  LEARNING_FAMILIES,
  LEARNING_LIMITS,
  LEARNING_OUTCOMES,
  LEARNING_SOURCES,
  LEARNING_STATES,
  LEARNING_SURFACES,
  LEARNING_THRESHOLDS,
  NATURALNESS_CHECKS,
  OBSERVATION_FIELDS,
  TERMINOLOGY_CHECK,
  USER_CORRECTION_CHECK,
  correctionFromUser,
  decideObservation,
  emptyLearningStore,
  evaluatePersianNaturalness,
  learningFamilyOf,
  learningObservationId,
  observePersianText,
  parseLearningStore,
  protectedLiterals,
  readLearningStore,
  readyObservations,
  recordObservations,
  regressionCheck,
  rejectObservation,
  writeLearningStore,
  type LanguageRegressionCase,
  type LearningCandidate,
  type LearningStore,
  type NaturalnessContext,
  type PreferenceStorage,
} from '../web/src/language/index.js';
import { FA_MESSAGES } from '../web/src/i18n/index.js';
import { LanguageMemory } from '../web/src/language/memory.js';
import { seededLanguageMemory } from '../web/src/language/seed.js';
import * as continuousLearning from '../web/src/language/continuousLearning.js';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const AT = '2026-09-26T09:00:00.000Z';
const LATER = '2026-09-27T09:00:00.000Z';

/** The contexts an answer is judged in, from the product's own vocabulary. */
const FORMAL: NaturalnessContext = { tone: 'formal', terminology: 'product-terms', mixing: 'none' };
const CONVERSATIONAL: NaturalnessContext = {
  tone: 'conversational',
  terminology: 'product-terms',
  mixing: 'none',
};
const ENGLISH_TERMS: NaturalnessContext = {
  tone: 'neutral',
  terminology: 'english-terms',
  mixing: 'terms-only',
};

/**
 * Three answers, each wrong in the same way: every one of them writes the Arabic yeh where this product
 * writes the Farsi one. Three *texts* is the point — the corroboration rule counts evidence, and one text
 * written three times is one text.
 */
const ARABIC_YEH = [
  'مديريت ريسک مهم‌تر از پيش‌بيني بازار است.',
  'اگر مديريت سرمايه نداشته باشي، زيان مي‌بيني.',
  'اين گزارش درباره‌ی زيان‌هاي معاملات است.',
] as const;

const YEH = 'ي';
const FARSI_YEH = 'ی';

/** The rule that reads it, as the reading layers name it. */
const REPERTOIRE = 'quality.spelling.arabic-repertoire';

/** A sentence that is only wrong in its frame, so the layer offers no replacement for the form. */
const FRAME_TEXT = 'این تنظیمات حائز اهمیت است.';
const FRAME = 'حائز اهمیت';

/** Persian prose with nothing to report, formal and conversational. */
const CLEAN_FORMAL = 'حد ضرر را رعایت کنید و حجم معامله را کم کنید.';
const CLEAN_CONVERSATIONAL = 'میشه این معامله رو یه بار دیگه بررسی کنی؟';
const CLEAN_ENGLISH = 'The stop loss protects this trade.';

/** A Latin token in a sentence whose context asked for the product's own Persian forms. */
const LATIN_TOKEN_TEXT = 'اندیکاتور ATR روی طلا کار می‌کند.';

/** The module under test, and the same module without its prose — which is where these words may appear. */
const SOURCE = readFileSync(join('web', 'src', 'language', 'continuousLearning.ts'), 'utf8');
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function candidatesOf(
  text: string,
  evidence: string,
  context: NaturalnessContext = FORMAL,
): readonly LearningCandidate[] {
  return observePersianText({ text, context, evidence, observedAt: AT, surface: 'answer' });
}

/** The candidates of one text, recorded, with the store that results. */
function record(
  text: string,
  evidence: string,
  store: LearningStore = emptyLearningStore(),
  context: NaturalnessContext = FORMAL,
): LearningStore {
  return recordObservations(candidatesOf(text, evidence, context), store).store;
}

/** The ledger after the same finding has been seen in `texts.length` distinct texts. */
function afterTexts(texts: readonly string[], context: NaturalnessContext = FORMAL): LearningStore {
  let store = emptyLearningStore();
  texts.forEach((text, index) => {
    store = record(text, `answer-${index}`, store, context);
  });
  return store;
}

/** The one observation about a family and a form, asserted to be exactly one. */
function soleObservation(store: LearningStore, family: string, form: string) {
  const found = store.observations.filter(
    (observation) => observation.family === family && observation.form === form,
  );
  expect(found, `${family} «${form}»`).toHaveLength(1);
  return found[0] as LearningStore['observations'][number];
}

/** A store that is a `Map`, so a test can inspect exactly what was written. */
function fakeStorage(initial: Readonly<Record<string, string>> = {}): {
  store: PreferenceStorage;
  entries: Map<string, string>;
} {
  const entries = new Map(Object.entries(initial));
  return {
    entries,
    store: {
      getItem: (key) => entries.get(key) ?? null,
      setItem: (key, value) => {
        entries.set(key, value);
      },
    },
  };
}

const throwingStorage: PreferenceStorage = {
  getItem: () => {
    throw new Error('storage is unavailable');
  },
  setItem: () => {
    throw new Error('storage is unavailable');
  },
};

/* -------------------------------------------------------------------------- */
/* 1. Nothing is learned from one example                                      */
/* -------------------------------------------------------------------------- */

describe('a candidate has to be corroborated before it is knowledge', () => {
  it('records a finding and refuses to decide on it, because one text is not evidence', () => {
    const first = recordObservations(candidatesOf(ARABIC_YEH[0], 'answer-a'));
    const decisions = first.decisions.filter((decision) => decision.outcome !== 'refused');
    expect(decisions).toHaveLength(1);
    const observation = decisions[0]?.observation;
    expect(observation?.confidence).toBe(LEARNING_CONFIDENCE.detector);
    expect(observation?.readings).toBe(1);
    expect(observation?.evidence).toEqual(['answer-a']);
    expect(observation?.state).toBe('observed');
    expect(decisions[0]?.reason).toContain('is not knowledge until');

    const refused = decideObservation(observation?.id ?? '', first.store, seededLanguageMemory(), {
      verdict: 'form-is-wrong',
      origin: 'human-review',
      reference: 'review-1',
      at: AT,
      probe: ARABIC_YEH[0],
    });
    // The decision is an answer rather than an exception, it writes nothing, and it says the number.
    expect(refused.action).toBe('not-ready');
    expect(refused.store).toEqual(first.store);
    expect(refused.entry).toBeNull();
    expect(refused.case).toBeNull();
    expect(refused.reason).toContain(`${LEARNING_THRESHOLDS.evidence.detector} sightings`);
  });

  it('counts texts, not occurrences: three sightings of one answer are one piece of evidence', () => {
    let store = record(ARABIC_YEH[0], 'answer-a');
    for (let round = 0; round < 2; round += 1) {
      const again = recordObservations(candidatesOf(ARABIC_YEH[0], 'answer-a'), store);
      store = again.store;
      expect(again.decisions[0]?.reason).toContain('already counted');
    }
    const observation = soleObservation(store, 'spelling', YEH);
    // Seen three times, and only ever by one text: the confidence does not move and nothing is ready.
    expect(observation.readings).toBe(3);
    expect(observation.evidence).toEqual(['answer-a']);
    expect(observation.confidence).toBe(LEARNING_CONFIDENCE.detector);
    expect(observation.state).toBe('observed');
    expect(readyObservations(store)).toEqual([]);
  });

  it('crosses the bar on the third text, and says so in numbers', () => {
    const store = afterTexts(ARABIC_YEH);
    const observation = soleObservation(store, 'spelling', YEH);
    expect(observation.evidence).toEqual(['answer-0', 'answer-1', 'answer-2']);
    expect(observation.confidence).toBe(
      Number((LEARNING_CONFIDENCE.detector + 2 * CORROBORATION_STEP).toFixed(2)),
    );
    expect(observation.confidence).toBe(LEARNING_THRESHOLDS.confidence);
    expect(observation.state).toBe('ready');
    expect(readyObservations(store).map((candidate) => candidate.id)).toEqual([observation.id]);
  });

  it('asks a note for more corroboration than a complaint, and a person for none', () => {
    // A repeated word is a `style` verdict — a note, not a defect — so it is recorded at `note` weight.
    const note = record(
      'مدیریت ریسک مهم است. مدیریت ریسک یعنی مدیریت ضرر و مدیریت صبح.',
      'answer-a',
    );
    const noteObservation = note.observations.find(
      (observation) => observation.family === 'naturalness',
    );
    expect(noteObservation?.source).toBe('note');
    expect(noteObservation?.confidence).toBe(LEARNING_CONFIDENCE.note);
    expect(noteObservation?.state).toBe('observed');
    // Four texts, not three: `LEARNING_THRESHOLDS.evidence.note`.
    let store = note;
    for (let index = 1; index < LEARNING_THRESHOLDS.evidence.note; index += 1) {
      store = record(
        'مدیریت ریسک مهم است. مدیریت ریسک یعنی مدیریت ضرر و مدیریت صبح.',
        `answer-${index}`,
        store,
      );
    }
    expect(soleObservation(store, 'naturalness', 'مدیریت').state).toBe('ready');

    // A person's correction is a statement rather than a reading, so it is ready on one sighting.
    const user = recordObservations([
      correctionFromUser({
        family: 'spelling',
        form: YEH,
        correction: FARSI_YEH,
        reason: 'this product writes the Farsi yeh',
        evidence: 'person-1',
        observedAt: AT,
        surface: 'review',
        context: FORMAL,
      }),
    ]);
    const observation = user.decisions[0]?.observation;
    expect(observation?.confidence).toBe(LEARNING_CONFIDENCE['user-correction']);
    expect(observation?.state).toBe('ready');
    expect(user.decisions[0]?.reason).toContain('read on its own');
  });
});

describe("a person's correction outranks the detector's reading", () => {
  it('supersedes the reading of the same form, and no detector sighting can undo it', () => {
    let store = record(ARABIC_YEH[0], 'answer-a');
    const before = soleObservation(store, 'spelling', YEH);
    expect(before.source).toBe('detector');

    const superseded = recordObservations(
      [
        correctionFromUser({
          family: 'spelling',
          form: YEH,
          correction: FARSI_YEH,
          reason: 'the product writes the Farsi yeh here',
          evidence: 'person-1',
          observedAt: AT,
          surface: 'review',
          context: FORMAL,
        }),
      ],
      store,
    );
    store = superseded.store;
    expect(superseded.decisions[0]?.outcome).toBe('superseded');
    // One observation, not two: the identity is the family and the form, so a person and a rule disagreeing
    // about one form is one decision rather than two candidates for a reviewer to choose between.
    expect(store.observations.filter((observation) => observation.form === YEH)).toHaveLength(1);
    const after = soleObservation(store, 'spelling', YEH);
    expect(after.source).toBe('user-correction');
    expect(after.reason).toBe('the product writes the Farsi yeh here');
    // The rule stays named: it is what a case will hold, and a decision about a form is not a decision to
    // stop reading it.
    expect(after.check).toBe(REPERTOIRE);
    expect(after.readings).toBe(before.readings + 1);

    // A later detector sighting adds evidence and cannot take the correction back.
    const later = recordObservations(candidatesOf(ARABIC_YEH[1], 'answer-b'), store);
    expect(later.decisions[0]?.outcome).toBe('confirmed');
    const confirmed = soleObservation(later.store, 'spelling', YEH);
    expect(confirmed.source).toBe('user-correction');
    expect(confirmed.reason).toBe('the product writes the Farsi yeh here');
  });

  it('keeps a rejection, and lets only a person reopen it', () => {
    let store = record(ARABIC_YEH[0], 'answer-a');
    const id = soleObservation(store, 'spelling', YEH).id;
    const rejected = rejectObservation(id, store, {
      at: LATER,
      reference: 'this form is intended in a quotation',
    });
    expect(rejected.outcome).toBe('recorded');
    expect(rejected.store.version).toBe(store.version + 1);
    store = rejected.store;
    expect(soleObservation(store, 'spelling', YEH).state).toBe('rejected');
    expect(soleObservation(store, 'spelling', YEH).rejected).toEqual({
      at: LATER,
      reference: 'this form is intended in a quotation',
    });
    expect(readyObservations(store)).toEqual([]);

    // A rule seeing it again does not reopen a question a person has answered; it is counted and left.
    const again = recordObservations(candidatesOf(ARABIC_YEH[1], 'answer-b'), store);
    expect(again.decisions[0]?.outcome).toBe('kept-rejected');
    expect(again.decisions[0]?.reason).toContain('the decision stands');
    store = again.store;
    expect(soleObservation(store, 'spelling', YEH).state).toBe('rejected');

    const reopened = recordObservations(
      [
        correctionFromUser({
          family: 'spelling',
          form: YEH,
          correction: FARSI_YEH,
          reason: 'this was a mistake after all',
          evidence: 'person-1',
          observedAt: LATER,
          surface: 'review',
          context: FORMAL,
        }),
      ],
      store,
    );
    expect(reopened.decisions[0]?.outcome).toBe('reopened');
    expect(reopened.decisions[0]?.observation?.state).toBe('ready');
    expect(reopened.decisions[0]?.reason).toContain('reopens');
  });

  it('refuses a candidate nothing could read again, and one that proposes itself', () => {
    const bad = recordObservations([
      {
        ...(candidatesOf(ARABIC_YEH[0], 'answer-a')[0] as LearningCandidate),
        check: 'made.up-check',
      },
    ]);
    expect(bad.decisions[0]?.outcome).toBe('refused');
    expect(bad.decisions[0]?.reason).toContain('not a check this build has');

    const same = recordObservations([
      correctionFromUser({
        family: 'spelling',
        form: YEH,
        correction: YEH,
        reason: 'no change at all',
        evidence: 'person-1',
        observedAt: AT,
        surface: 'review',
        context: FORMAL,
      }),
    ]);
    expect(same.decisions[0]?.outcome).toBe('refused');
    expect(same.decisions[0]?.reason).toContain('already the form');

    const malformed = recordObservations([{ family: 'spelling', form: YEH } as LearningCandidate]);
    expect(malformed.decisions[0]?.outcome).toBe('refused');
    expect(malformed.decisions[0]?.reason).toContain('not usable');

    const nonCanonical = recordObservations([
      correctionFromUser({
        family: 'spelling',
        form: YEH,
        correction: 'كتاب',
        reason: 'an Arabic kaf is not what this product writes',
        evidence: 'person-1',
        observedAt: AT,
        surface: 'review',
        context: FORMalContext(),
      }),
    ]);
    expect(nonCanonical.decisions[0]?.outcome).toBe('refused');
    expect(nonCanonical.decisions[0]?.reason).toContain('canonical');
  });
});

/** A second formal context, so the non-canonical case reads as a caller's own construction. */
function FORMalContext(): NaturalnessContext {
  return { ...FORMAL };
}

/* -------------------------------------------------------------------------- */
/* 2. A decision, and what it writes                                           */
/* -------------------------------------------------------------------------- */

describe('accepting a form, and confirming a defect', () => {
  it('accepts a form through the exception mechanism the pipeline already reads', () => {
    const store = afterTexts([FRAME_TEXT, FRAME_TEXT, FRAME_TEXT]);
    const observation = soleObservation(store, 'naturalness', FRAME);
    expect(observation.correction).toBeNull();

    const memory = seededLanguageMemory();
    const approved = decideObservation(observation.id, store, memory, {
      verdict: 'form-is-right',
      origin: 'human-review',
      reference: 'a written register, not a translation',
      at: AT,
    });
    expect(approved.action).toBe('accepted');
    expect(approved.entry?.key).toMatch(/^exception\.language-qa\.naturalness-literal-frame-/);
    expect(approved.entry?.kind).toBe('exception');
    expect(approved.entry?.status).toBe('trusted');
    expect(approved.entry?.examples).toEqual([FRAME]);
    expect(approved.case?.expected).toBe('accepted');
    expect(approved.case?.check).toBe('naturalness.literal-frame');
    // The probe defaulted to the form, because an accepted form is its own smallest demonstration.
    expect(approved.case?.probe).toBe(FRAME);

    // The product's effect, asserted the way a caller sees it: with the store's exceptions passed in as
    // protected literals, the rule that reported the form is quiet — and without them it is not, so the
    // assertion is about the entry rather than about the text.
    expect(protectedLiterals(memory)).toContain(FRAME);
    expect(evaluatePersianNaturalness(FRAME_TEXT, FORMAL).problems).not.toEqual([]);
    const spared = evaluatePersianNaturalness(FRAME_TEXT, FORMAL, {
      protectedLiterals: protectedLiterals(memory),
    });
    expect(spared.verdicts).toEqual([]);
    expect(regressionCheck(approved.store.cases).failures).toEqual([]);
  });

  it('confirms a defect as a worked example plus a case that holds the rule to it', () => {
    const store = afterTexts(ARABIC_YEH);
    const observation = soleObservation(store, 'spelling', YEH);
    const memory = seededLanguageMemory();
    const accepted = decideObservation(observation.id, store, memory, {
      verdict: 'form-is-wrong',
      origin: 'human-review',
      reference: 'the orthography entry this product already ships',
      at: AT,
      probe: ARABIC_YEH[0],
    });
    expect(accepted.action).toBe('accepted');
    expect(accepted.entry?.key).toMatch(/^example\.learning\.spelling-arabic-repertoire-/);
    expect(accepted.entry?.kind).toBe('example');
    expect(accepted.entry?.value).toBe(FARSI_YEH);
    expect(accepted.entry?.examples).toEqual([YEH]);
    expect(accepted.entry?.provenance.origin).toBe('human-review');
    expect(accepted.case?.expected).toBe('reported');
    expect(accepted.case?.probe).toBe(ARABIC_YEH[0]);
    expect(accepted.case?.reference).toBe(accepted.entry?.key);
    // The observation is accepted, so the same candidate cannot be decided twice.
    expect(soleObservation(accepted.store, 'spelling', YEH).state).toBe('accepted');
    const twice = decideObservation(observation.id, accepted.store, memory, {
      verdict: 'form-is-wrong',
      origin: 'human-review',
      reference: 'again',
      at: LATER,
      probe: ARABIC_YEH[0],
    });
    expect(twice.action).toBe('refused');
    expect(twice.reason).toContain('already produced knowledge');
  });

  it('lets a reviewer write the replacement a shape check could not offer', () => {
    const store = afterTexts([FRAME_TEXT, FRAME_TEXT, FRAME_TEXT]);
    const observation = soleObservation(store, 'naturalness', FRAME);
    const memory = seededLanguageMemory();
    // Without one, the decision has nothing to record: a wording judgement has to say what to write.
    const silent = decideObservation(observation.id, store, memory, {
      verdict: 'form-is-wrong',
      origin: 'human-review',
      reference: 'review-1',
      at: AT,
      probe: FRAME_TEXT,
    });
    expect(silent.action).toBe('refused');
    expect(silent.reason).toContain('has to say what to write');

    const said = decideObservation(observation.id, store, memory, {
      verdict: 'form-is-wrong',
      origin: 'human-review',
      reference: 'review-1',
      at: AT,
      probe: FRAME_TEXT,
      correction: 'مهم است',
    });
    expect(said.action).toBe('accepted');
    expect(said.entry?.value).toBe('مهم است');
    expect(said.case?.correction).toBe('مهم است');
    expect(said.case?.expected).toBe('reported');
  });

  it('leaves every seeded trusted rule exactly as it was', () => {
    const before = seededLanguageMemory();
    const snapshot = JSON.stringify(before.list());
    const store = afterTexts(ARABIC_YEH);
    const observation = soleObservation(store, 'spelling', YEH);
    decideObservation(observation.id, store, before, {
      verdict: 'form-is-wrong',
      origin: 'human-review',
      reference: 'review-1',
      at: AT,
      probe: ARABIC_YEH[0],
    });
    // The new entry is an addition; nothing that was trusted was rewritten, re-versioned or deprecated.
    const after = before
      .list()
      .filter((entry) => !entry.key.startsWith('example.learning.'))
      .map((entry) => entry.key);
    const original = JSON.parse(snapshot) as { key: string }[];
    expect(after).toEqual(original.map((entry) => entry.key));
    expect(
      JSON.stringify(before.list().filter((entry) => !entry.key.startsWith('example.learning.'))),
    ).toBe(snapshot);
  });

  it('records an unreviewed reading as a proposal, and writes the case only when a person accepts', () => {
    const store = afterTexts(ARABIC_YEH);
    const observation = soleObservation(store, 'spelling', YEH);
    const memory = seededLanguageMemory();

    const proposed = decideObservation(observation.id, store, memory, {
      verdict: 'form-is-wrong',
      origin: 'agent-proposal',
      reference: 'the evaluation loop',
      at: AT,
      probe: ARABIC_YEH[0],
    });
    expect(proposed.action).toBe('pending');
    expect(proposed.entry?.status).toBe('proposed');
    expect(proposed.case).toBeNull();
    expect(proposed.store).toEqual(store);
    // And it is waiting rather than applied, which is the store's own decision and not this loop's.
    expect(memory.get(proposed.entry?.key ?? '')).toBeUndefined();
    expect(memory.pending(proposed.entry?.key ?? '')?.version).toBe(proposed.entry?.version);

    // A reviewer with a trusted origin decides it, and the case appears with the acceptance.
    const decided = decideObservation(observation.id, store, memory, {
      verdict: 'form-is-wrong',
      origin: 'human-review',
      reference: 'reviewed in the language review',
      at: LATER,
      probe: ARABIC_YEH[0],
    });
    expect(decided.action).toBe('accepted');
    expect(decided.entry?.status).toBe('trusted');
    expect(decided.case?.confirmedAt).toBe(LATER);
  });

  it('refers a terminology question to the lexicon path, and writes no term here', () => {
    const store = afterTexts(
      [LATIN_TOKEN_TEXT, LATIN_TOKEN_TEXT, LATIN_TOKEN_TEXT, LATIN_TOKEN_TEXT],
      FORMAL,
    );
    const observation = soleObservation(store, 'terminology', 'ATR');
    expect(observation.check).toBe(TERMINOLOGY_CHECK);
    expect(observation.correction).toBeNull();

    const memory = seededLanguageMemory();
    const knowledge = memory.list().length;
    const referred = decideObservation(observation.id, store, memory, {
      verdict: 'form-is-right',
      origin: 'human-review',
      reference: 'review-1',
      at: AT,
      probe: LATIN_TOKEN_TEXT,
    });
    expect(referred.action).toBe('referred');
    expect(referred.reason).toContain('reviewTermCandidate');
    expect(referred.entry).toBeNull();
    expect(referred.store).toEqual(store);
    // The ledger is not a lexicon: nothing was added to the knowledge store by a referral.
    expect(memory.list().length).toBe(knowledge);
  });

  it('refers a shape no rule reads, rather than claiming a case it cannot run', () => {
    // A person says this is wrong, and nothing in this build reports it in the probe they gave.
    const unknown = 'این جمله شکل ناشناخته‌ای دارد که هیچ قاعده‌ای نمی‌خواند.';
    const store = recordObservations([
      correctionFromUser({
        family: 'grammar',
        form: 'شکل ناشناخته‌ای',
        correction: 'شکل شناخته‌شده‌ای',
        reason: 'a person reports a shape no rule reads',
        evidence: 'person-1',
        observedAt: AT,
        surface: 'review',
        context: FORMAL,
      }),
    ]).store;
    const observation = soleObservation(store, 'grammar', 'شکل ناشناخته‌ای');
    const referred = decideObservation(observation.id, store, seededLanguageMemory(), {
      verdict: 'form-is-wrong',
      origin: 'human-review',
      reference: 'review-1',
      at: AT,
      probe: unknown,
    });
    expect(referred.action).toBe('referred');
    expect(referred.reason).toContain('no rule in this build reports');
    // Nothing was written and the observation is still ready, so the decision can be made once a rule exists.
    expect(referred.store).toEqual(store);
    expect(soleObservation(referred.store, 'grammar', 'شکل ناشناخته‌ای').state).toBe('ready');
    expect(referred.case).toBeNull();
  });

  it('refuses a probe that does not exhibit the finding, and one no call brought at all', () => {
    const store = afterTexts(ARABIC_YEH);
    const observation = soleObservation(store, 'spelling', YEH);
    const memory = seededLanguageMemory();
    const missing = decideObservation(observation.id, store, memory, {
      verdict: 'form-is-wrong',
      origin: 'human-review',
      reference: 'review-1',
      at: AT,
    });
    expect(missing.action).toBe('refused');
    expect(missing.reason).toContain('brought none');

    const withoutForm = decideObservation(observation.id, store, memory, {
      verdict: 'form-is-wrong',
      origin: 'human-review',
      reference: 'review-1',
      at: AT,
      probe: CLEAN_FORMAL,
    });
    expect(withoutForm.action).toBe('refused');
    expect(withoutForm.reason).toContain('does not contain');

    const tooLong = decideObservation(observation.id, store, memory, {
      verdict: 'form-is-wrong',
      origin: 'human-review',
      reference: 'review-1',
      at: AT,
      probe: `${ARABIC_YEH[0].repeat(20)}`,
    });
    expect(tooLong.action).toBe('refused');
    expect(tooLong.reason).toContain('at most');

    const unknown = decideObservation('spelling|nothing', store, memory, {
      verdict: 'form-is-wrong',
      origin: 'human-review',
      reference: 'review-1',
      at: AT,
      probe: ARABIC_YEH[0],
    });
    expect(unknown.action).toBe('refused');
    expect(unknown.reason).toContain('not an observation');
  });

  it('takes a user-supplied replacement only when it is one this product could write', () => {
    const store = afterTexts([FRAME_TEXT, FRAME_TEXT, FRAME_TEXT]);
    const observation = soleObservation(store, 'naturalness', FRAME);
    const memory = seededLanguageMemory();
    const nonCanonical = decideObservation(observation.id, store, memory, {
      verdict: 'form-is-wrong',
      origin: 'human-review',
      reference: 'review-1',
      at: AT,
      probe: FRAME_TEXT,
      correction: ' كتاب',
    });
    expect(nonCanonical.action).toBe('refused');
    expect(nonCanonical.reason).toContain('canonical');

    const same = decideObservation(observation.id, store, memory, {
      verdict: 'form-is-wrong',
      origin: 'human-review',
      reference: 'review-1',
      at: AT,
      probe: FRAME_TEXT,
      correction: FRAME,
    });
    expect(same.action).toBe('refused');
    expect(same.reason).toContain('already the form');
  });
});

/* -------------------------------------------------------------------------- */
/* 3. The corpus                                                               */
/* -------------------------------------------------------------------------- */

describe('the corpus keeps a fixed error fixed', () => {
  /** The corpus a confirmed defect and an accepted form produce. */
  function corpus(): { cases: readonly LanguageRegressionCase[]; store: LearningStore } {
    const defect = afterTexts(ARABIC_YEH);
    const confirmed = decideObservation(
      soleObservation(defect, 'spelling', YEH).id,
      defect,
      seededLanguageMemory(),
      {
        verdict: 'form-is-wrong',
        origin: 'human-review',
        reference: 'review-1',
        at: AT,
        probe: ARABIC_YEH[0],
      },
    );
    const frame = afterTexts([FRAME_TEXT, FRAME_TEXT, FRAME_TEXT]);
    const approved = decideObservation(
      soleObservation(frame, 'naturalness', FRAME).id,
      frame,
      seededLanguageMemory(),
      { verdict: 'form-is-right', origin: 'human-review', reference: 'review-2', at: AT },
    );
    const store: LearningStore = {
      ...confirmed.store,
      cases: [...confirmed.store.cases, ...approved.store.cases],
    };
    return { cases: store.cases, store };
  }

  it('reads every confirmed case and reports no failure', () => {
    const { cases } = corpus();
    expect(cases).toHaveLength(2);
    const report = regressionCheck(cases);
    expect(report.total).toBe(2);
    expect(report.failures).toEqual([]);
    expect(report.readings.every((reading) => reading.ok)).toBe(true);
    // An accepted case says the rule stays silent; a confirmed defect says it still reports.
    expect(report.readings.map((reading) => reading.expected).sort()).toEqual([
      'accepted',
      'reported',
    ]);
  });

  it('fails a case whose rule has stopped reporting it, and says what that means', () => {
    const { cases } = corpus();
    const defect = cases.find((entry) => entry.expected === 'reported') as LanguageRegressionCase;
    // The regression this corpus exists for: the six characters the product fixed come back, or the rule
    // that read them is retired. Either way the case fails and the message names what was lost.
    const lost: LanguageRegressionCase = { ...defect, check: 'quality.spelling.compound' };
    const report = regressionCheck([lost]);
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]?.ok).toBe(false);
    expect(report.failures[0]?.actual).toBe('reported');
    // Named once, however many times the rule reports the form inside the probe.
    expect(report.failures[0]?.reportedBy).toEqual([REPERTOIRE]);
    expect(report.failures[0]?.reason).toContain('has come back');

    // The other half of the same regression: a probe where nothing reports the form any more — here
    // because the form is inside a code span, which every rule is told to leave alone.
    const gone = regressionCheck([{ ...defect, probe: `این یک کد است: \`${YEH}\` داخل متن.` }]);
    expect(gone.failures).toHaveLength(1);
    expect(gone.failures[0]?.actual).toBe('accepted');
    expect(gone.failures[0]?.reason).toContain('has come back');
  });

  it('fails a corpus that both accepts a form and requires a rule to report it', () => {
    const { cases } = corpus();
    const defect = cases.find((entry) => entry.expected === 'reported') as LanguageRegressionCase;
    const accepted = cases.find((entry) => entry.expected === 'accepted') as LanguageRegressionCase;
    const report = regressionCheck([defect, { ...accepted, form: YEH, probe: `${YEH} ${FRAME}` }]);
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]?.id).toBe(defect.id);
    expect(report.failures[0]?.reason).toContain('the product writes one thing');
  });

  it('is not vacuous: the rule reports the form until the product accepts it', () => {
    const { cases } = corpus();
    const accepted = cases.find((entry) => entry.expected === 'accepted') as LanguageRegressionCase;
    // Read without the corpus's own protection, the rule complains — which is what makes "the rule stays
    // silent" a fact about the acceptance rather than about a check that never fires.
    const bare = evaluatePersianNaturalness(accepted.probe, accepted.context);
    expect(bare.problems.map((problem) => problem.check)).toContain(accepted.check);
    const report = regressionCheck([accepted]);
    expect(report.failures).toEqual([]);
  });

  it('names every case after the decision that made it, so a failure is traceable', () => {
    const { cases } = corpus();
    for (const entry of cases) {
      expect(entry.reference).toMatch(/^(exception\.language-qa\.|example\.learning\.)/);
      expect(entry.probe).toContain(entry.form);
      expect(entry.correction.length).toBeGreaterThan(0);
      expect(entry.context.tone).toBe('formal');
      expect(entry.confirmedAt).toBe(AT);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 4. The ledger, not a second memory                                          */
/* -------------------------------------------------------------------------- */

describe('the ledger is storage, and it is the language layer’s own', () => {
  /** The value imports of one file, resolved to the file they name. */
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

  it('reaches the knowledge store and the reading layers, and nothing else', () => {
    // The layering as a shape rather than a promise: this module reaches `memory.ts` (it is the update
    // path, so it must) and never the Agent Memory, the response stage, the guidance, the interface or a
    // person's own statements. That is the boundary "keep language knowledge separate" is made of.
    const reachable = new Set<string>();
    const queue = ['web/src/language/continuousLearning.ts'];
    while (queue.length > 0) {
      const file = queue.pop() as string;
      if (reachable.has(file)) continue;
      reachable.add(file);
      queue.push(...valueImports(file));
    }
    expect([...reachable].sort()).toEqual([
      'web/src/language/context.ts',
      'web/src/language/continuousLearning.ts',
      'web/src/language/detect.ts',
      'web/src/language/evaluation.ts',
      'web/src/language/fa.ts',
      'web/src/language/grammar.ts',
      'web/src/language/languageQa.ts',
      'web/src/language/memory.ts',
      'web/src/language/model.ts',
      'web/src/language/naturalness.ts',
      'web/src/language/normalize.ts',
      'web/src/language/preference.ts',
      'web/src/language/rules.ts',
      'web/src/language/seed.ts',
      'web/src/language/spelling.ts',
      'web/src/language/terminology.ts',
    ]);
  });

  it('exports a ledger and its own decisions, and nothing that writes a rule or an answer', () => {
    expect(Object.keys(continuousLearning).sort()).toEqual([
      'CASE_FIELDS',
      'CORROBORATION_STEP',
      'LANGUAGE_LEARNING_KEY',
      'LEARNING_ACTIONS',
      'LEARNING_CONFIDENCE',
      'LEARNING_EXPECTATIONS',
      'LEARNING_FAMILIES',
      'LEARNING_LIMITS',
      'LEARNING_OUTCOMES',
      'LEARNING_SOURCES',
      'LEARNING_STATES',
      'LEARNING_SURFACES',
      'LEARNING_THRESHOLDS',
      'OBSERVATION_FIELDS',
      'TERMINOLOGY_CHECK',
      'USER_CORRECTION_CHECK',
      'correctionFromUser',
      'decideObservation',
      'emptyLearningStore',
      'learningFamilyOf',
      'learningObservationId',
      'observePersianText',
      'parseLearningStore',
      'readLearningStore',
      'readPersianAnswer',
      'readyObservations',
      'recordObservations',
      'regressionCheck',
      'rejectObservation',
      'writeLearningStore',
    ]);
    // No exported function rewrites text, and the module never names the Agent Memory or a credential.
    expect(CODE).not.toMatch(/applyCorrection|rewrite|mem_|secret|apiKey|credential/);
  });

  it('stores no field a message, a person or a secret could sit in', () => {
    const store = afterTexts(ARABIC_YEH);
    const observation = soleObservation(store, 'spelling', YEH);
    expect(Object.keys(observation).sort()).toEqual([...OBSERVATION_FIELDS].sort());
    const defect = decideObservation(observation.id, store, seededLanguageMemory(), {
      verdict: 'form-is-wrong',
      origin: 'human-review',
      reference: 'review-1',
      at: AT,
      probe: ARABIC_YEH[0],
    });
    const entry = defect.case as LanguageRegressionCase;
    expect(Object.keys(entry).sort()).toEqual([...CASE_FIELDS].sort());
    // The value a stored ledger holds is a count of where a finding was seen, never the text it was seen in.
    expect(observation.evidence).toEqual(['answer-0', 'answer-1', 'answer-2']);
    expect(JSON.stringify(observation)).not.toContain(ARABIC_YEH[0]);
    // And the key is in the language layer's own namespace, outside both other stores.
    expect(LANGUAGE_LEARNING_KEY).toMatch(/^master-trade\.language\./);
    expect(LANGUAGE_LEARNING_KEY).not.toMatch(/^mem_/);
  });

  it('round-trips through storage, and degrades entry by entry when it cannot', () => {
    let store = afterTexts(ARABIC_YEH);
    const rejected = rejectObservation(soleObservation(store, 'spelling', YEH).id, store, {
      at: LATER,
      reference: 'a quotation, and the writer’s own script',
    });
    store = rejected.store;

    const { store: storage, entries } = fakeStorage();
    expect(writeLearningStore(store, storage)).toBe(true);
    expect(entries.has(LANGUAGE_LEARNING_KEY)).toBe(true);
    const read = readLearningStore(storage);
    expect(read.storable).toBe(true);
    expect(read.stored).toBe(true);
    expect(read.store).toEqual(store);

    // A store another build wrote: the entries this build understands survive, the rest are dropped, and
    // the result is still a complete ledger rather than a half-loaded one.
    const mixed = {
      version: 4,
      observations: [store.observations[0], { id: 'broken' }, null],
      cases: [{ id: 'broken' }, ...store.cases],
    };
    const parsed = parseLearningStore(mixed);
    expect(parsed.version).toBe(4);
    expect(parsed.observations).toHaveLength(1);
    expect(parsed.cases).toEqual(store.cases);

    expect(readLearningStore(fakeStorage().store).stored).toBe(false);
    expect(readLearningStore(throwingStorage).storable).toBe(false);
    expect(writeLearningStore(store, throwingStorage)).toBe(false);
    expect(parseLearningStore('not a ledger')).toEqual(emptyLearningStore());
    expect(readLearningStore(null).store).toEqual(emptyLearningStore());
  });

  it('keeps a decision a person made across a round trip', () => {
    const store = afterTexts(ARABIC_YEH);
    const id = soleObservation(store, 'spelling', YEH).id;
    const rejected = rejectObservation(id, store, { at: LATER, reference: 'intended here' }).store;
    const { store: storage } = fakeStorage();
    writeLearningStore(rejected, storage);
    const read = readLearningStore(storage).store;
    const observation = read.observations[0];
    expect(observation?.state).toBe('rejected');
    expect(observation?.rejected).toEqual({ at: LATER, reference: 'intended here' });
    // And a rejected candidate stays unready when the ledger comes back.
    expect(readyObservations(read)).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* 5. The false positives, which are the bigger half                           */
/* -------------------------------------------------------------------------- */

describe('what it recognises rather than raises', () => {
  it('raises nothing about Persian prose that is merely informal, or clean, or already decided', () => {
    expect(candidatesOf(CLEAN_FORMAL, 'answer-a')).toEqual([]);
    expect(candidatesOf(CLEAN_CONVERSATIONAL, 'answer-b', CONVERSATIONAL)).toEqual([]);
    expect(candidatesOf(CLEAN_ENGLISH, 'answer-c', ENGLISH_TERMS)).toEqual([]);
    // A Latin token whose English was asked for is the instruction being followed, not a candidate.
    expect(candidatesOf(LATIN_TOKEN_TEXT, 'answer-d', ENGLISH_TERMS)).toEqual([]);
    // And an exception in force spares a form the layer would otherwise raise.
    const spared = observePersianText({
      text: FRAME_TEXT,
      context: FORMAL,
      evidence: 'answer-e',
      observedAt: AT,
      surface: 'copy',
      protectedLiterals: [FRAME],
    });
    expect(spared).toEqual([]);
  });

  it('raises a note as a note, and never as a complaint', () => {
    const note = candidatesOf('میشه این معامله رو بررسی کنی؟', 'answer-a')[0] as LearningCandidate;
    expect(note.source).toBe('note');
    expect(note.family).toBe('context');
    // A note starts below the bar, so three texts are not enough for it — `evidence.note` is four.
    const store = afterTexts([
      'میشه این معامله رو بررسی کنی؟',
      'میشه این معامله رو بررسی کنی؟',
      'میشه این معامله رو بررسی کنی؟',
    ]);
    expect(store.observations[0]?.state).toBe('observed');
  });

  it('names the family of every check in both catalogues, and refuses a family for anything else', () => {
    // Total by construction, so a new axis or check cannot arrive ungrouped: the table is a record over the
    // two catalogues' own fields, and this is the assertion that it covers them.
    for (const check of LANGUAGE_QUALITY_CHECKS) {
      expect(learningFamilyOf(`quality.${check.id}`), check.id).not.toBeNull();
      expect(learningFamilyOf(check.id)).not.toBeNull();
    }
    for (const check of NATURALNESS_CHECKS) {
      expect(learningFamilyOf(check.id), check.id).not.toBeNull();
    }
    expect(learningFamilyOf('made.up-check')).toBeNull();
    expect(learningFamilyOf(USER_CORRECTION_CHECK)).toBeNull();
    expect(learningFamilyOf(TERMINOLOGY_CHECK)).toBeNull();
    // The nine families the phase names, and no tenth.
    expect(LEARNING_FAMILIES).toEqual([
      'grammar',
      'spelling',
      'punctuation',
      'zwnj-spacing',
      'wording',
      'terminology',
      'naturalness',
      'script',
      'context',
    ]);
  });

  it('identifies a candidate by its family and its form, and by nothing else', () => {
    const candidate = candidatesOf(ARABIC_YEH[0], 'answer-a')[0] as LearningCandidate;
    expect(learningObservationId(candidate)).toBe(`spelling|${YEH}`);
    expect(learningObservationId({ ...candidate, family: 'punctuation', form: '،' })).toBe(
      'punctuation|،',
    );
  });

  it('says what it cannot judge, rather than letting its silence read as approval', () => {
    expect(LEARNING_LIMITS.length).toBeGreaterThanOrEqual(7);
    expect(LEARNING_LIMITS.join(' ')).toContain('a candidate seen in one text');
    // The limit this phase's own verification produced, named rather than discovered again: what the loop
    // found in the product's own copy was the reading layers' false positives, not a defect.
    expect(LEARNING_LIMITS.join(' ')).toContain('grammar.verb-number-agreement');
    expect(LEARNING_ACTIONS).toEqual(['accepted', 'pending', 'referred', 'not-ready', 'refused']);
    expect(LEARNING_STATES).toEqual(['observed', 'ready', 'accepted', 'rejected']);
    expect(LEARNING_OUTCOMES).toContain('superseded');
    expect(LEARNING_SOURCES).toEqual(['note', 'detector', 'user-correction']);
    expect(LEARNING_SURFACES).toEqual(['answer', 'copy', 'review']);
    expect(LEARNING_EXPECTATIONS).toEqual(['reported', 'accepted']);
    expect(LEARNING_THRESHOLDS.evidence['user-correction']).toBe(1);
  });

  it('takes a rejection for a reading the layer itself does not trust, and keeps it', () => {
    // `naturalness.ts` names two rules as not good enough alone, and one heading-shaped finding of the
    // third: `grammar.verb-number-agreement` recognises its subject by a `ها` ending, so the copy's
    // `پیشرفت توسط صف کارها گزارش می‌شود` — whose subject is singular — is reported; and
    // `grammar.pronoun-agreement` reads a possessive `شما` as the subject. This is what a reviewer's
    // rejection is for, and it is the loop's answer to a rule that is systematically wrong about a shape.
    const text = 'نمودار خالی واقعیتی درباره داده‌ها است، نه بازار بی‌حرکت.';
    let store = afterTexts([text, text, text]);
    const observation = soleObservation(store, 'grammar', 'داده‌ها است');
    expect(observation.state).toBe('ready');
    expect(observation.correction).toBe('داده‌ها هستند');

    const memory = seededLanguageMemory();
    const before = memory.list().length;
    store = rejectObservation(observation.id, store, {
      at: LATER,
      reference: 'the subject is `نمودار خالی`; `داده‌ها` is inside the predicate',
    }).store;
    expect(soleObservation(store, 'grammar', 'داده‌ها است').state).toBe('rejected');
    // A rejection is the decision not to change knowledge, so it writes none.
    expect(memory.list().length).toBe(before);

    // And the product does not re-raise it, however many further texts it is seen in.
    const again = recordObservations(candidatesOf(text, 'answer-z'), store);
    expect(again.decisions.map((decision) => decision.outcome)).not.toContain('ready');
    for (const decision of again.decisions) expect(decision.observation?.state).not.toBe('ready');
  });

  it('finds nothing in the product’s own Persian copy that its own limits do not already name', () => {
    // The corpus rather than a sentence chosen to make the loop look right: every Persian value in the
    // interface catalogue. The ledger's view of it is a claim about the *reading layers*, so it is stated
    // as one — a candidate from a rule the layers name as not good enough alone, or a note, and nothing else.
    const values = Object.values(FA_MESSAGES);
    expect(values.length, 'the catalogue scan found nothing to read').toBeGreaterThan(1000);
    const named = new Set([
      'quality.grammar.verb-number-agreement',
      'quality.grammar.pronoun-agreement',
      'quality.punctuation.missing-question-mark',
    ]);
    const offenders: string[] = [];
    const fired = new Set<string>();
    let detector = 0;
    values.forEach((value, index) => {
      for (const candidate of candidatesOf(value, `copy-${index}`)) {
        if (candidate.source !== 'detector') continue;
        detector += 1;
        fired.add(candidate.check);
        if (!named.has(candidate.check)) offenders.push(`${candidate.check} «${candidate.form}»`);
      }
    });
    expect(offenders, 'a defect this product writes itself').toEqual([]);
    expect([...fired].sort()).toEqual([...named].sort());
    expect(detector).toBeGreaterThanOrEqual(20);
  });

  it('reports the same candidates twice for the same text, and one per form', () => {
    const first = candidatesOf(ARABIC_YEH[0], 'answer-a');
    const second = candidatesOf(ARABIC_YEH[0], 'answer-a');
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    // One candidate for the form, however many times the rule reports it inside the text.
    expect(first).toHaveLength(1);
    expect(first[0]?.form).toBe(YEH);
    expect(first[0]?.correction).toBe(FARSI_YEH);
  });

  it('is not a second reading layer: it holds no check, no lexicon and no rule of its own', () => {
    // Everything it raises comes from a verdict, and every verdict it raises carries the catalogue's own id.
    const store = afterTexts(ARABIC_YEH);
    const checks = store.observations.map((observation) => observation.check);
    expect(checks.every((check) => check === REPERTOIRE)).toBe(true);
    expect(CODE).not.toMatch(/const [A-Z_]+_CHECKS|new RegExp\(/);
    // The store it writes through is the caller's, and it is never constructed here.
    expect(CODE).not.toMatch(/seededLanguageMemory|new LanguageMemory/);
    const memory = LanguageMemory.of([]);
    expect(memory.list()).toEqual([]);
  });
});
