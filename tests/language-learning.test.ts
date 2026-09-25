/**
 * Phase 7.5.3.4.3 — the statements a person makes about their own wording.
 *
 * The layer already knew two things about somebody (`preference.ts`: the setting; `communication.ts`: the
 * counts). This phase adds the third — what a person *said* — and the suite is organised around the seven
 * behaviours the phase names, because each of them is a rule about the relationship between the three
 * rather than about any one of them:
 *
 *   1. **an explicit correction** — stated once, read at once, and it outranks what the message looks like;
 *   2. **a learned preference** — the counts still decide when nobody has said anything, which is the
 *      behaviour this phase must not break;
 *   3. **a repeated preference** — one verdict about an answer is recorded and *not* read; the same verdict
 *      three times crosses the bar, and the same correction twice is one statement made twice;
 *   4. **conflicting preferences** — nothing is overwritten, the newer statement wins, and the reason says
 *      which one it passed over;
 *   5. **persistence and reload** — a stored statement produces the same resolution it produced before the
 *      reload, and a value this build cannot read degrades to "they have said nothing";
 *   6. **rejection of unverified changes** — a malformed statement is refused with a reason, and a
 *      terminology statement is *referred* to the place where terms are reviewed, because a per-person
 *      preference may not rename a concept;
 *   7. **reuse of learned behaviour** — the correction reaches the answer, through the same control the
 *      response stage already reads, and it changes wording and never meaning.
 */

import { describe, expect, it } from 'vitest';
import {
  CONSULT_CONFIDENCE,
  CORRECTION_CONFIDENCE,
  CORRECTION_DIMENSIONS,
  CORRECTION_FIELDS,
  CORRECTION_SOURCES,
  CORRECTION_SURFACES,
  CORRECTION_VALUES,
  GUIDANCE_CLAUSES,
  GUIDANCE_NOTES,
  LANGUAGE_CORRECTION_KEY,
  LANGUAGE_MEMORY_PREFIX,
  MAX_CORRECTIONS,
  RESPONSE_FEEDBACK,
  RESPONSE_FEEDBACKS,
  clearCorrections,
  communicationProfile,
  consultedCorrection,
  emptyCorrections,
  emptyObservations,
  observeCommunication,
  parseCorrections,
  readCorrections,
  recordCorrection,
  recordFeedback,
  responseControl,
  statedPreference,
  writeCorrections,
  type CommunicationObservations,
  type CorrectionStore,
  type PreferenceStorage,
} from '../web/src/language/index.js';
import { RESPONSE_LANGUAGE_DIRECTIVE, withResponseDirectives } from '../src/llm/prompt.js';
import { loadInstructions, renderInstructions } from '../src/instructions/loader.js';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const AT = '2026-09-25T09:00:00.000Z';
const LATER = '2026-09-26T09:00:00.000Z';

/** A Persian statement with nothing asked in it, so the readings have nothing to claim. */
const PERSIAN = 'گزارش معاملات این هفته در دسترس است.';
const ENGLISH = 'The weekly report is available in the journal.';
const PERSIAN_INFORMAL = 'سلام، قیمت رو دیدی؟ الان چیکار کنم';

const INSTRUCTIONS = renderInstructions(loadInstructions());

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

/** A store that throws on every call, which is a real answer rather than an error. */
const throwingStorage: PreferenceStorage = {
  getItem: () => {
    throw new Error('storage is unavailable');
  },
  setItem: () => {
    throw new Error('storage is unavailable');
  },
};

function correction(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    dimension: 'detail',
    value: 'concise',
    source: 'correction',
    surface: 'workspace',
    recordedAt: AT,
    ...overrides,
  };
}

/** A history of turns, recorded the way the counts store records them. */
function learned(turns: number, text: string): CommunicationObservations {
  const profile = communicationProfile(text);
  let observations = emptyObservations();
  for (let turn = 0; turn < turns; turn += 1) {
    observations = observeCommunication(profile.context, observations);
  }
  return observations;
}

/** Record a statement and return the store, failing loudly when it was not recorded. */
function recorded(input: Record<string, unknown>, store = emptyCorrections()): CorrectionStore {
  const decision = recordCorrection(input, store);
  expect(decision.outcome, decision.reason).not.toBe('refused');
  return decision.store;
}

/* -------------------------------------------------------------------------- */
/* 1. An explicit correction                                                   */
/* -------------------------------------------------------------------------- */

describe('an explicit correction (Task 1)', () => {
  it('is recorded with its source, its surface and a confidence, and is read at once', () => {
    const decision = recordCorrection(correction());
    expect(decision.outcome).toBe('recorded');
    expect(decision.entry).toMatchObject({
      dimension: 'detail',
      value: 'concise',
      source: 'correction',
      surface: 'workspace',
      recordedAt: AT,
      confirmations: 1,
    });
    // Confidence is computed from the source, never asserted by the caller: a stated correction is sure
    // enough to be read on its own.
    expect(decision.entry?.confidence).toBe(CORRECTION_CONFIDENCE.correction);
    expect(decision.entry?.confidence).toBeGreaterThanOrEqual(CONSULT_CONFIDENCE);
    // The store's own version moves by one, so a snapshot says how many decisions produced it.
    expect(decision.store.version).toBe(1);
    expect(decision.store.corrections).toHaveLength(1);
  });

  it('decides the answer instead of what the message looks like', () => {
    const store = recorded(correction());
    const profile = communicationProfile(PERSIAN, { corrections: store });

    expect(profile.detail).toMatchObject({ value: 'concise', source: 'corrected' });
    // The reason is a sentence about a person rather than about a message, and it says what happened.
    expect(profile.detail.reason).toContain('asked for concise');
    expect(profile.detail.reason).not.toContain('The message asks');

    // And the resolution it feeds is the one the response stage reads.
    const control = responseControl(PERSIAN, { corrections: store });
    expect(control.guidance.detail).toBe('concise');
    expect(control.style.notes).toContain('detail-concise');
    expect(control.style.notes).not.toContain('detail-standard');
  });

  it('outranks the reading of the message, and says which of the two it passed over', () => {
    // A long turn reads as asking for detail; the person asked for the opposite.
    const store = recorded(correction());
    const profile = communicationProfile(`${PERSIAN} ${PERSIAN} ${PERSIAN}`, {
      corrections: store,
    });
    expect(profile.detail).toMatchObject({ value: 'concise', source: 'corrected' });
  });

  it('is the last word only below the setting the person can see', () => {
    // Both are statements, and the visible control is the one that wins — with the other one named, so the
    // pair of claims is never reconciled in silence.
    const store = recorded(correction({ dimension: 'language', value: 'fa' }));
    const chosen = responseControl(ENGLISH, { preference: 'en', corrections: store });
    expect(chosen.reply).toMatchObject({ language: 'en', source: 'explicit' });
    expect(chosen.reply.reason).toContain('had also asked to be answered in Persian');

    // Where the control is silent, the statement decides.
    const automatic = responseControl(ENGLISH, { preference: 'auto', corrections: store });
    expect(automatic.reply).toMatchObject({ language: 'fa', source: 'corrected' });
    expect(automatic.reply.reason).toContain('asked to be answered in Persian');
  });
});

/* -------------------------------------------------------------------------- */
/* 2. A learned preference                                                     */
/* -------------------------------------------------------------------------- */

describe('a learned preference (Task 2)', () => {
  it('still decides when nobody has said anything', () => {
    const observations = learned(7, PERSIAN_INFORMAL);
    const profile = communicationProfile(PERSIAN, { observations });
    expect(profile.formality).toMatchObject({ value: 'informal', source: 'observed' });

    // The same store with nothing stated: the counts are what decide, exactly as they did before this
    // phase existed. Learning a statement must not be a way of turning the counts off.
    const stated = communicationProfile(PERSIAN, {
      observations,
      corrections: emptyCorrections(),
    });
    expect(stated.formality.source).toBe('observed');
  });

  it('is outranked by a statement, because a count is an inference and a statement is not', () => {
    const observations = learned(9, PERSIAN_INFORMAL);
    const store = recorded(correction({ dimension: 'formality', value: 'formal' }));

    const both = communicationProfile(PERSIAN, { observations, corrections: store });
    expect(both.formality).toMatchObject({ value: 'formal', source: 'corrected' });
    expect(both.observedSamples).toBe(9);
    expect(both.formality.reason).toContain('asked for formal');

    // With nothing stated the same history reads informal, which is what makes the test above a test.
    expect(communicationProfile(PERSIAN, { observations }).formality.value).toBe('informal');
  });
});

/* -------------------------------------------------------------------------- */
/* 3. A repeated preference                                                    */
/* -------------------------------------------------------------------------- */

describe('a repeated preference (Task 3)', () => {
  it('does not let one verdict become a preference', () => {
    const decision = recordFeedback('too-long', { surface: 'review', recordedAt: AT });
    expect(decision.outcome).toBe('recorded');
    expect(decision.entry?.confidence).toBe(CORRECTION_CONFIDENCE.feedback);
    expect(decision.entry?.confidence).toBeLessThan(CONSULT_CONFIDENCE);
    expect(decision.reason).toContain('not read until');

    // Recorded and not read: the store knows it, the resolution does not use it.
    expect(consultedCorrection(decision.store, 'detail')).toBeNull();
    const profile = communicationProfile(PERSIAN, { corrections: decision.store });
    expect(profile.detail.source).not.toBe('corrected');
  });

  it('crosses the bar when the same verdict is repeated, and only then', () => {
    let store = emptyCorrections();
    const steps: (number | undefined)[] = [];
    for (let verdict = 0; verdict < 3; verdict += 1) {
      const decision = recordFeedback('too-long', { surface: 'review', recordedAt: AT }, store);
      // Each repetition of the same verdict confirms the one entry rather than adding a second: one
      // person saying the same thing three times is not three people agreeing.
      expect(decision.outcome).toBe(verdict === 0 ? 'recorded' : 'confirmed');
      store = decision.store;
      steps.push(consultedCorrection(store, 'detail')?.confidence);
    }
    expect(store.corrections).toHaveLength(1);
    expect(steps[0]).toBeUndefined();
    expect(steps[1]).toBeUndefined();
    expect(steps[2]).toBeGreaterThanOrEqual(CONSULT_CONFIDENCE);

    // And now it decides the answer.
    const profile = communicationProfile(PERSIAN, { corrections: store });
    expect(profile.detail).toMatchObject({ value: 'concise', source: 'corrected' });
    expect(profile.detail.reason).toContain('said three times');
  });

  it('treats a statement made twice as one statement made twice', () => {
    const once = recordCorrection(correction());
    const twice = recordCorrection(correction({ recordedAt: LATER }), once.store);
    expect(twice.outcome).toBe('confirmed');
    expect(twice.store.corrections).toHaveLength(1);
    expect(twice.entry).toMatchObject({ confirmations: 2, recordedAt: LATER });
    expect(twice.entry?.confidence).toBeCloseTo(CORRECTION_CONFIDENCE.correction + 0.1, 5);
    expect(twice.reason).toContain('said 2 time(s)');
  });
});

/* -------------------------------------------------------------------------- */
/* 4. Conflicting preferences                                                  */
/* -------------------------------------------------------------------------- */

describe('conflicting preferences (Task 4)', () => {
  it('keeps both statements, follows the newer one, and says so', () => {
    const first = recorded(correction({ value: 'detailed' }));
    const second = recorded(correction({ value: 'concise', recordedAt: LATER }), first);

    // Nothing was overwritten: the earlier statement is still in the store.
    expect(second.corrections.map((entry) => entry.value)).toEqual(['detailed', 'concise']);
    const stated = statedPreference(second, 'detail');
    expect(stated).toMatchObject({ value: 'concise', disagreedWith: 'detailed' });

    const profile = communicationProfile(PERSIAN, { corrections: second });
    expect(profile.detail.value).toBe('concise');
    expect(profile.detail.reason).toContain('asked for detailed before this');
    expect(profile.detail.reason).toContain('the later statement is the one that stands');
  });

  it('does not let a weaker newer statement overturn a stronger older one', () => {
    // A stated correction, and then a single verdict against it. The verdict is newer and weaker, so the
    // statement stands — which is the rule that makes confidence do any work at all.
    const stated = recorded(correction({ value: 'detailed' }));
    const verdict = recordFeedback('too-long', { surface: 'review', recordedAt: LATER }, stated);
    expect(verdict.outcome).toBe('recorded');
    expect(communicationProfile(PERSIAN, { corrections: verdict.store }).detail).toMatchObject({
      value: 'detailed',
      source: 'corrected',
    });

    // Repeated until it crosses the bar, the newer verdict does win — and the older statement is still
    // there to be reported.
    let store = verdict.store;
    for (let repeat = 0; repeat < 2; repeat += 1) {
      store = recordFeedback('too-long', { surface: 'review', recordedAt: LATER }, store).store;
    }
    expect(consultedCorrection(store, 'detail')?.value).toBe('concise');
    expect(communicationProfile(PERSIAN, { corrections: store }).detail).toMatchObject({
      value: 'concise',
      source: 'corrected',
    });
    expect(statedPreference(store, 'detail')?.disagreedWith).toBe('detailed');
  });

  it('learns nothing from two verdicts that cancel each other out', () => {
    const tooLong = recordFeedback('too-long', { surface: 'review', recordedAt: AT });
    const tooShort = recordFeedback(
      'too-short',
      { surface: 'review', recordedAt: LATER },
      tooLong.store,
    );
    expect(tooShort.outcome).toBe('recorded');
    // Both are recorded and neither is read: a person who says "too long" and then "too short" has said
    // nothing the product can act on, and inventing a preference out of it would be exactly the mistake.
    expect(tooShort.store.corrections).toHaveLength(2);
    expect(consultedCorrection(tooShort.store, 'detail')).toBeNull();
    expect(communicationProfile(PERSIAN, { corrections: tooShort.store }).detail.source).not.toBe(
      'corrected',
    );
  });
});

/* -------------------------------------------------------------------------- */
/* 5. Persistence and reload                                                   */
/* -------------------------------------------------------------------------- */

describe('persistence and reload (Task 5)', () => {
  it('round-trips through a store and produces the same resolution after a reload', () => {
    const { store, entries } = fakeStorage();
    const written = recorded(
      correction(),
      recorded(correction({ dimension: 'language', value: 'fa' })),
    );
    expect(writeCorrections(written, store)).toBe(true);
    expect(entries.get(LANGUAGE_CORRECTION_KEY)).toContain('"concise"');

    const reloaded = readCorrections(store);
    expect(reloaded).toEqual({ store: written, storable: true, stored: true });
    expect(responseControl(ENGLISH, { corrections: reloaded.store })).toEqual(
      responseControl(ENGLISH, { corrections: written }),
    );
  });

  it('degrades to "nothing stated" rather than to an error', () => {
    for (const raw of ['{', 'null', '"a string"', '{"corrections":"not a list"}', '']) {
      const { store } = fakeStorage({ [LANGUAGE_CORRECTION_KEY]: raw });
      const read = readCorrections(store);
      expect(read.store, raw).toEqual(emptyCorrections());
      expect(communicationProfile(PERSIAN, { corrections: read.store }).detail.source).not.toBe(
        'corrected',
      );
    }
    expect(readCorrections(null).storable).toBe(false);
    expect(readCorrections(throwingStorage)).toEqual({
      store: emptyCorrections(),
      storable: false,
      stored: false,
    });
    expect(writeCorrections(emptyCorrections(), throwingStorage)).toBe(false);
  });

  it('keeps what this build understands and drops what it does not', () => {
    const kept = recorded(correction());
    const parsed = parseCorrections({
      version: 4,
      corrections: [
        ...kept.corrections,
        // An entry from a build that had a dimension this one does not.
        { ...correction(), dimension: 'verbosity', value: 'terse' },
        // A value the resolution could not honour, even in a known dimension.
        { ...correction(), value: 'epic' },
        // Something that is not an entry at all.
        'concise',
      ],
    });
    expect(parsed.version).toBe(4);
    expect(parsed.corrections).toHaveLength(1);
    expect(parsed.corrections[0]?.value).toBe('concise');
  });

  it('bounds what it will read, at a number no real use can reach', () => {
    // The vocabulary is the bound on writing: every statement this product can hold is one of these.
    const possible = CORRECTION_DIMENSIONS.filter(
      (dimension) => dimension !== 'terminology',
    ).flatMap((dimension) => CORRECTION_VALUES[dimension]);
    expect(possible).toHaveLength(8);
    expect(possible.length).toBeLessThan(MAX_CORRECTIONS);

    // So a write can never reach the cap: every statement this product can hold is recorded below, and the
    // store stops at eight entries.
    let store = emptyCorrections();
    for (const dimension of CORRECTION_DIMENSIONS) {
      for (const value of CORRECTION_VALUES[dimension]) {
        store = recorded(correction({ dimension, value, recordedAt: AT }), store);
      }
    }
    expect(store.corrections).toHaveLength(possible.length);

    // The cap is a reader's guard: a stored value with more entries than this build would ever have
    // written is read as its newest `MAX_CORRECTIONS` entries rather than refused or grown.
    const one = store.corrections[0];
    expect(one).toBeDefined();
    const overfull = parseCorrections({
      version: 99,
      corrections: Array.from({ length: MAX_CORRECTIONS + 5 }, (_entry, index) => ({
        ...one,
        recordedAt: `2026-09-${String((index % 28) + 1).padStart(2, '0')}T09:00:00.000Z`,
      })),
    });
    expect(overfull.corrections).toHaveLength(MAX_CORRECTIONS);
    expect(overfull.version).toBe(99);
  });

  it('can be forgotten, which is not the same as choosing automatic', () => {
    const { store, entries } = fakeStorage();
    const written = recorded(correction());
    expect(writeCorrections(written, store)).toBe(true);
    expect(clearCorrections(store)).toBe(true);
    expect(entries.get(LANGUAGE_CORRECTION_KEY)).toBe(JSON.stringify(emptyCorrections()));
    expect(readCorrections(store).store).toEqual(emptyCorrections());
    expect(clearCorrections(null)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* 6. Rejection of unverified changes                                          */
/* -------------------------------------------------------------------------- */

describe('rejection of unverified changes (Task 6)', () => {
  it('refuses a statement it cannot honour, and stores nothing', () => {
    const cases: Record<string, unknown>[] = [
      correction({ dimension: 'verbosity' }),
      correction({ value: 'epic' }),
      correction({ source: 'agent-proposal' }),
      correction({ surface: 'somewhere-else' }),
      correction({ recordedAt: 'yesterday' }),
      correction({ value: '' }),
      // A caller trying to write down what somebody said, rather than which of our values they want.
      correction({ message: 'Please keep it short' }),
      correction({ confidence: 1 }),
      correction({ confirmations: 12 }),
    ];
    for (const input of cases) {
      const decision = recordCorrection(input);
      expect(decision.outcome, JSON.stringify(input)).toBe('refused');
      expect(decision.store).toEqual(emptyCorrections());
      expect(decision.entry).toBeNull();
      expect(decision.reason.length).toBeGreaterThan(0);
    }
    // The vocabularies are the ones the resolution can honour, so a refusal above is never arbitrary.
    expect(CORRECTION_VALUES.formality).toEqual(['formal', 'informal', 'neutral']);
    expect(CORRECTION_VALUES.detail).toEqual(['concise', 'standard', 'detailed']);
    expect(CORRECTION_VALUES.language).toEqual(['fa', 'en']);
    expect(CORRECTION_SOURCES).toEqual(['correction', 'feedback']);
    expect(CORRECTION_SURFACES).toEqual(['workspace', 'settings', 'review']);
  });

  it('refers a terminology statement to the place terms are reviewed', () => {
    const decision = recordCorrection(correction({ dimension: 'terminology', value: 'ریسک' }));
    expect(decision.outcome).toBe('referred');
    expect(decision.store).toEqual(emptyCorrections());
    expect(decision.reason).toContain('reviewed knowledge');
    expect(decision.reason).toContain('candidate path');
    // And no surface can talk it into being a preference: the refusal is about the dimension.
    for (const surface of CORRECTION_SURFACES) {
      expect(recordCorrection(correction({ dimension: 'terminology', surface })).outcome).toBe(
        'referred',
      );
    }
  });

  it('stores no field a message, a person or a credential could sit in', () => {
    const entry = recordCorrection(correction()).entry;
    expect(entry).not.toBeNull();
    const fields = Object.keys(entry ?? {}).sort();
    expect(fields).toEqual([...CORRECTION_FIELDS].sort());
    for (const field of fields) {
      expect(field, `${field} reads like a secret`).not.toMatch(
        /secret|token|credential|password|keypair|message|text|content/i,
      );
      expect(field, `${field} reads like a person`).not.toMatch(/user|name|email|country|native/i);
    }
    // Every value is a closed value, a number or a timestamp: there is nowhere for a sentence to go.
    expect(Object.keys(CORRECTION_DIMENSIONS)).toHaveLength(CORRECTION_DIMENSIONS.length);
    expect(CORRECTION_DIMENSIONS).toContain(entry?.dimension);
    expect(CORRECTION_VALUES[entry?.dimension ?? 'detail']).toContain(entry?.value);
    expect(Number.isInteger(entry?.confirmations)).toBe(true);
    expect(Number.isFinite(entry?.confidence)).toBe(true);
    expect(Number.isNaN(Date.parse(String(entry?.recordedAt)))).toBe(false);
  });

  it('keeps its own key, outside the knowledge store and the Agent Memory', () => {
    expect(LANGUAGE_CORRECTION_KEY.startsWith('master-trade.language.')).toBe(true);
    // The reviewed store's entries are addressed as `lang:…` and an agent's recollection as `mem_…`;
    // a statement about wording is neither.
    expect(LANGUAGE_CORRECTION_KEY.startsWith(LANGUAGE_MEMORY_PREFIX)).toBe(false);
    expect(LANGUAGE_CORRECTION_KEY.startsWith('mem_')).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* 7. Reuse of learned language behaviour                                      */
/* -------------------------------------------------------------------------- */

describe('reuse of learned language behaviour (Task 7)', () => {
  it('reaches the answer through the control the response stage already reads', () => {
    const store = recorded(
      correction({ dimension: 'language', value: 'fa' }),
      recorded(correction({ dimension: 'formality', value: 'formal' })),
    );
    const control = responseControl(ENGLISH, { corrections: store });

    // The language and the register both come from what the person said, and the guidance says which
    // source decided it — with a clause of its own, so an inferred decision is never described as no
    // decision at all.
    expect(control.reply).toMatchObject({ language: 'fa', source: 'corrected' });
    expect(control.guidance.language).toBe('fa');
    expect(control.guidance.tone).toBe('formal');
    expect(control.guidance.reason).toContain(GUIDANCE_CLAUSES['corrected-preference']);
    expect(control.guidance.reason).not.toContain(GUIDANCE_CLAUSES['default-language']);
    expect(control.style.notes).toContain('fa-formal');

    // And the pipeline is told, in the same fields it was already told in and in the order it reads them:
    // the language directive first, the style block after it.
    const directives = withResponseDirectives(INSTRUCTIONS, {
      responseLanguage: control.reply.language,
      responseStyle: control.style,
    });
    expect(directives).toContain(RESPONSE_LANGUAGE_DIRECTIVE.fa);
    expect(directives).toContain(GUIDANCE_NOTES['fa-formal']);
    expect(directives.indexOf(RESPONSE_LANGUAGE_DIRECTIVE.fa)).toBeLessThan(
      directives.indexOf('RESPONSE STYLE'),
    );
    // The invariants travel with it, so the correction can change the wording and nothing else.
    for (const invariant of ['facts', 'calculations', 'permissions', 'uncertainty']) {
      expect(directives).toContain(invariant);
    }
    // The corrections changed the *instructions* and nothing about the message they will be applied to.
    expect(directives).toContain(INSTRUCTIONS);
  });

  it('is a value the caller can read without touching the store', () => {
    // `statedPreference` is the whole seam: a resolution needs a value, a confidence and the fact that
    // something else was asked for once — and it needs no idea how any of that is persisted.
    const store = recorded(correction({ value: 'detailed' }));
    expect(statedPreference(store, 'detail')).toEqual({
      value: 'detailed',
      confidence: CORRECTION_CONFIDENCE.correction,
      confirmations: 1,
      recordedAt: AT,
      disagreedWith: null,
    });
    expect(statedPreference(store, 'formality')).toBeNull();
    expect(statedPreference(null, 'detail')).toBeNull();
    expect(statedPreference(emptyCorrections(), 'detail')).toBeNull();
    // A caller may ask a stricter question than the default and never a looser one.
    expect(statedPreference(store, 'detail', 0.95)).toBeNull();
  });

  it('says every verdict it can act on, and maps each one to a dimension the resolution has', () => {
    for (const verdict of RESPONSE_FEEDBACKS) {
      const mapped = RESPONSE_FEEDBACK[verdict];
      expect(CORRECTION_DIMENSIONS).toContain(mapped.dimension);
      expect(CORRECTION_VALUES[mapped.dimension]).toContain(mapped.value);
    }
    expect(RESPONSE_FEEDBACKS).toHaveLength(6);
    expect(
      recordFeedback('too-vague' as never, { surface: 'review', recordedAt: AT }).outcome,
    ).toBe('refused');
  });
});
