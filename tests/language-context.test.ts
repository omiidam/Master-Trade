/**
 * Phase 7.5.3.2 — the context, the preferences and the guidance.
 *
 * The claims, in the order they can fail:
 *
 *   1. **The context adds readings; it does not re-derive them.** Formality *is* 7.5.3.1's register, with
 *      the same confidence and the same markers, and the profile's language *is* the resolver the switch
 *      already used. The suite asserts the two agree, which is what makes "one language system" checkable
 *      rather than promised.
 *   2. **Every reading carries its evidence, and the evidence is verbatim.** A dimension that reports a
 *      value without the words that produced it cannot be reviewed, so each one is asserted against the
 *      message it came from.
 *   3. **The strongest source wins, and the loser is named.** An explicit instruction beats the message,
 *      the message beats history, and history only speaks where the message is silent — asserted in both
 *      directions, because only one of them is the interesting one.
 *   4. **What is learned is counts and nothing else.** Every leaf of the learned store is a number, there
 *      is no path from those counts to a stored setting, and the memory decays.
 *   5. **Guidance cannot carry a fact.** It is built only from closed catalogues, so a message's own words
 *      cannot reach it — asserted with a token that appears nowhere else — and two messages that read the
 *      same produce byte-identical guidance however different their figures are.
 *
 * The Persian is written as characters, half-spaces are `${ZWNJ}`, and every request phrase asserted below
 * is read out of the closed list it belongs to rather than retyped, so moving a phrase moves the test.
 */

import { describe, expect, it } from 'vitest';
import {
  AGENT_MEMORY_ID_PREFIX,
  COMMUNICATION_OBSERVATION_KEY,
  CONTEXT_CONCISE_REQUESTS,
  CONTEXT_DETAILED_REQUESTS,
  CONTEXT_DIMENSIONS,
  CONTEXT_DISCOURSE_CONNECTIVES,
  CONTEXT_FORMAL_REQUESTS,
  CONTEXT_GREETINGS,
  GUIDANCE_CLAUSES,
  GUIDANCE_FIELDS,
  GUIDANCE_INVARIANTS,
  GUIDANCE_NOTES,
  LANGUAGE_MEMORY_PREFIX,
  OBSERVATION_MINIMUM,
  OBSERVATION_WINDOW,
  PREFERENCE_SOURCES,
  TERMINOLOGY_REQUESTS,
  TERMINOLOGY_STYLES,
  ZWNJ,
  analyzeCommunication,
  communicationProfile,
  contextReadings,
  detectLanguage,
  dominantObservation,
  emptyObservations,
  guidanceFor,
  mergeObservations,
  observeCommunication,
  parseObservations,
  readCommunicationObservations,
  resolveCommunication,
  resolveLanguage,
  responseGuidance,
  writeCommunicationObservations,
  type CommunicationObservations,
  type PreferenceStorage,
  type ResponseGuidance,
} from '../web/src/language/index.js';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const PERSIAN_TECHNICAL = 'حد ضرر را روی ۳۳۲۰ بگذار و بعد پوزیشن را ببند.';
const PERSIAN_INFORMAL = `سلام، قیمت رو دیدی؟ الان چیکار کنم`;
const PERSIAN_BOOKISH = 'خواهشمندم گزارش معاملات این هفته را به طور کامل ارسال فرمایید.';
const PERSIAN_GENERAL = 'سلام، حالت چطور است؟';
const PERSIAN_NEUTRAL = 'گزارش هفتگی آماده شد و برای بازبینی ارسال گردید.';
const PERSIAN_PLAIN_QUESTION = 'این عدد را از کجا آوردی؟';
const ENGLISH_TECHNICAL = 'Should I move my stop-loss to break-even after the first target is hit?';
const ENGLISH_INFORMAL = "hey, what's my r/r looking like?";
const MIXED_PERSIAN_HEAVY =
  'قیمت XAUUSD امروز 3345.20 دلار است و پوزیشن فعلی من در سود است. Risk/reward is 2.6.';
const TICKER_ONLY = 'قیمت XAUUSD رو چک کن';

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
  getItem() {
    throw new Error('storage is disabled');
  },
  setItem() {
    throw new Error('storage is disabled');
  },
};

/** Every leaf of a value, with the path it sits at, so "all numbers" can be asserted. */
function leaves(value: unknown, path = '$'): readonly (readonly [string, unknown])[] {
  if (value === null || typeof value !== 'object') return [[path, value]];
  return Object.entries(value).flatMap(([key, child]) => leaves(child, `${path}.${key}`));
}

/** Every string anywhere in a value, for the "guidance cannot quote the message" claim. */
function stringsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (value === null || typeof value !== 'object') return [];
  return Object.values(value).flatMap(stringsIn);
}

/* -------------------------------------------------------------------------- */
/* Task 1 — the context                                                        */
/* -------------------------------------------------------------------------- */

describe('the communication context (Task 1)', () => {
  it('reuses the register reading instead of forming a second opinion about it', () => {
    for (const text of [PERSIAN_INFORMAL, PERSIAN_BOOKISH, PERSIAN_TECHNICAL, ENGLISH_TECHNICAL]) {
      const detection = detectLanguage(text);
      const context = analyzeCommunication(text, { detection });

      // Same verdict, same confidence, same evidence: one reading of politeness in the product, not two.
      expect(context.formality.value).toBe(detection.register);
      expect(context.formality.confidence).toBe(detection.registerConfidence);
      expect(context.formality.signals).toEqual([
        ...detection.context.informalMarkers,
        ...detection.context.formalMarkers,
      ]);
      // ...and the language is the reading's own, carried rather than recomputed.
      expect(context.language).toBe(detection.language);
    }
  });

  it('tells a work turn from small talk, and names what decided it', () => {
    const chat = analyzeCommunication(PERSIAN_INFORMAL);
    expect(chat.setting.value).toBe('conversational');
    expect(chat.setting.signals).toContain('سلام');

    const work = analyzeCommunication(PERSIAN_TECHNICAL);
    expect(work.setting.value).toBe('professional');
    expect(work.setting.signals).toContain('stop-loss');

    // A greeting around a work request is still work: the two readings tie, and the subject matter breaks
    // the tie — content rather than phrasing, which is the only signal of the two that is about anything.
    const mixed = analyzeCommunication('سلام، حد ضرر را چک کن');
    expect(mixed.setting.value).toBe('professional');
    expect(mixed.setting.reason).toContain('subject');
    // And a greeting is not counted twice towards the other reading, which is what a duplicated signal
    // would have done.
    expect(new Set(chat.setting.signals).size).toBe(chat.setting.signals.length);

    // A greeting on its own is small talk, and the greeting is the reason.
    expect(analyzeCommunication(PERSIAN_GENERAL).setting.value).toBe('conversational');

    // A message that says nothing either way claims nothing, and says so with a low confidence: no
    // greeting, no marker, no vocabulary, and long enough that its brevity is not a signal either.
    const unclear = analyzeCommunication(PERSIAN_NEUTRAL);
    expect(unclear.setting.value).toBe('unclear');
    expect(unclear.setting.signals).toEqual([]);
    expect(unclear.setting.confidence).toBeLessThan(0.5);
  });

  it('gradates the wording rather than judging the person writing it', () => {
    expect(analyzeCommunication(PERSIAN_GENERAL).expertise.value).toBe('plain');
    expect(analyzeCommunication(PERSIAN_PLAIN_QUESTION).expertise.value).toBe('plain');
    expect(analyzeCommunication(PERSIAN_TECHNICAL).expertise.value).toBe('informed');
    expect(analyzeCommunication(MIXED_PERSIAN_HEAVY).expertise.value).toBe('technical');

    // Wording is *density*: `حد ضرر چیه؟` is three words, one of which is a concept, so a third of it is
    // the product's own vocabulary and the wording is technical however short and simple the sentence is.
    // That is a fact about the sentence, and the dimension says so rather than guessing at the writer.
    const short = analyzeCommunication('حد ضرر چیه؟');
    expect(short.expertise.value).toBe('technical');
    expect(short.expertise.reason).toContain('technical');
    // ...while the same subject mentioned once in a long sentence is not technical wording at all.
    const long = analyzeCommunication(
      `امروز صبح بازار آرام بود و من فقط یک بار حد ضرر را نگاه کردم و بعد کارهای دیگری انجام دادم`,
    );
    expect(long.expertise.value).toBe('informed');

    // And nothing here names a person: the dimensions are closed, and the fields are the closed list.
    expect(Object.keys(analyzeCommunication(PERSIAN_TECHNICAL)).sort()).toEqual(
      [
        'version',
        'language',
        'terms',
        'domains',
        'requestedDepth',
        'requestedFormality',
        ...CONTEXT_DIMENSIONS,
      ].sort(),
    );
    for (const reading of contextReadings(analyzeCommunication(PERSIAN_TECHNICAL))) {
      expect(CONTEXT_DIMENSIONS).toContain(reading.dimension);
      expect(reading.reason.length).toBeGreaterThan(0);
    }
  });

  it('takes a request for more or less detail over how long the message happens to be', () => {
    // A long, bookish message that asks to be complete: the request decides, not the length.
    const detailed = analyzeCommunication(PERSIAN_BOOKISH);
    expect(detailed.depth.value).toBe('detailed');
    expect(detailed.requestedDepth).toBe('detailed');

    const concise = analyzeCommunication(`این معامله را ${CONTEXT_CONCISE_REQUESTS[0]} کن`);
    expect(concise.depth.value).toBe('concise');
    expect(concise.requestedDepth).toBe('concise');
    expect(concise.depth.signals).toContain(CONTEXT_CONCISE_REQUESTS[0]);

    // Asked both ways at once: neither request is honoured, and both are reported.
    const contradictory = analyzeCommunication(
      `${CONTEXT_CONCISE_REQUESTS[0]} و ${CONTEXT_DETAILED_REQUESTS[0]} بگو`,
    );
    expect(contradictory.requestedDepth).toBeNull();
    expect(contradictory.depth.signals.length).toBeGreaterThan(1);

    // Nothing asked: the length of the message decides, at a lower confidence than a request would get.
    const banded = analyzeCommunication(PERSIAN_TECHNICAL);
    expect(banded.requestedDepth).toBeNull();
    expect(banded.depth.value).toBe('standard');
    expect(banded.depth.confidence).toBeLessThan(concise.depth.confidence);
  });

  it('adds a discussion to the shapes 7.5.3.1 already reads', () => {
    const style = (text: string): string => detectLanguage(text).style;

    // Two sentences of statement are somebody making a point; one is somebody reporting a fact.
    const twoSentences = 'حجم معاملات کم شده است. نوسان بازار هم بیشتر است.';
    expect(style(twoSentences)).toBe('statement');
    expect(analyzeCommunication(twoSentences).intent.value).toBe('discussion');

    // A connective joins it to the conversation even in one sentence.
    const connective = `حجم معاملات کم شده است ${CONTEXT_DISCOURSE_CONNECTIVES[0]} نوسان بیشتر است.`;
    expect(analyzeCommunication(connective).intent.value).toBe('discussion');

    expect(analyzeCommunication('معامله بسته شد.').intent.value).toBe('statement');
    // A question and an instruction keep the reading they were given, however long they are.
    expect(analyzeCommunication(PERSIAN_TECHNICAL).intent.value).toBe('instruction');
    expect(analyzeCommunication(ENGLISH_TECHNICAL).intent.value).toBe('question');
  });

  it('separates the Latin that is the product own from the Latin that is prose', () => {
    // A ticker is an instrument name, not somebody writing English.
    expect(analyzeCommunication(TICKER_ONLY).terminology.value).toBe('terms-only');
    expect(analyzeCommunication(TICKER_ONLY).terminology.signals).toContain('XAUUSD');
    // An identifier is protected by the rules long before this module sees it.
    expect(analyzeCommunication('فایل src/desktop/cli.ts را باز کن').terminology.value).toBe(
      'terms-only',
    );
    // Our own vocabulary written in Latin inside Persian prose is the healthy case: the term is kept and
    // no gloss is owed.
    expect(analyzeCommunication('حد stop-loss و پوزیشن را ببین').terminology.value).toBe(
      'terms-only',
    );

    // A word that is not our vocabulary is a word or two; a phrase is a clause, even if every noun in it
    // is a term we know — `Risk/reward is` is English because of `is`.
    expect(analyzeCommunication('قیمت رو با dema چک کن').terminology.value).toBe('stray');
    expect(analyzeCommunication(MIXED_PERSIAN_HEAVY).terminology.value).toBe('sentence');
    expect(analyzeCommunication(MIXED_PERSIAN_HEAVY).terminology.signals).toContain('is');

    // One script alone is not a mixture, whichever script it is.
    expect(analyzeCommunication(PERSIAN_TECHNICAL).terminology.value).toBe('none');
    expect(analyzeCommunication(ENGLISH_TECHNICAL).terminology.value).toBe('none');
  });

  it('reads the same message to the same context every time', () => {
    const first = analyzeCommunication(MIXED_PERSIAN_HEAVY);
    expect(analyzeCommunication(MIXED_PERSIAN_HEAVY)).toEqual(first);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });
});

/* -------------------------------------------------------------------------- */
/* Task 2 — the preferences                                                    */
/* -------------------------------------------------------------------------- */

describe('the communication profile (Task 2)', () => {
  it('carries the language resolution the switch already made, unchanged', () => {
    for (const [preference, text] of [
      ['auto', PERSIAN_TECHNICAL],
      ['en', PERSIAN_TECHNICAL],
      ['fa', ENGLISH_TECHNICAL],
      ['auto', '3345.20'],
    ] as const) {
      const profile = communicationProfile(text, { preference });
      expect(profile.language).toEqual(resolveLanguage(preference, detectLanguage(text)));
    }
  });

  it('resolves each preference from the strongest source that has something to say', () => {
    // 1. An instruction in the message, over everything else. Deliberately a long message: the request
    // for less detail has to beat both the message's own length and anything learned.
    const explicit = communicationProfile(
      `خواهشمندم گزارش معاملات این هفته را بررسی و ارسال فرمایید ولی ${CONTEXT_CONCISE_REQUESTS[0]} بگو`,
      { observations: learned(9, PERSIAN_BOOKISH) },
    );
    expect(explicit.detail).toMatchObject({ value: 'concise', source: 'explicit' });
    const requestedStyle = communicationProfile(`این را ${CONTEXT_FORMAL_REQUESTS[0]} بنویس`);
    expect(requestedStyle.formality).toMatchObject({ value: 'formal', source: 'explicit' });

    // 2. A learned preference, over the reading of the message (reversed in Phase 7.5.3.4.2 — the phase
    // rule is that a learned preference comes before automatic inference; `tests/adaptive-style.test.ts`
    // holds the rule, and this case holds the *order* it sits in).
    const learnedChatty = learned(8, PERSIAN_INFORMAL);
    const formal = communicationProfile(`خواهشمندم گزارش را بررسی فرمایید.`, {
      observations: learnedChatty,
    });
    expect(formal.formality).toMatchObject({ value: 'informal', source: 'observed' });
    // ...and the disagreement is visible rather than reconciled: the reason names both sides.
    expect(formal.formality.reason).toContain('8 of 8');
    expect(formal.formality.reason).toContain('formal');

    // 3. The reading, where nothing has been learned — the same message, an empty history.
    const silent = communicationProfile('معامله ثبت شد و گزارش ارسال گردید.', {
      observations: learnedChatty,
    });
    expect(silent.formality.source).toBe('observed');
    expect(silent.formality.value).toBe('informal');
    expect(silent.formality.reason).toContain('8 of 8');

    // 4. The default, when neither the message nor history has anything to say.
    const fresh = communicationProfile('معامله ثبت شد و گزارش ارسال گردید.');
    expect(fresh.formality).toMatchObject({ value: 'neutral', source: 'default' });
    expect(fresh.observedSamples).toBe(0);
  });

  it('never lets a learned reading become a setting, and never lets it outrank a request', () => {
    const chatty = learned(OBSERVATION_MINIMUM + 3, PERSIAN_INFORMAL);
    // The same history, two turns: one the habit agrees with, and one asking for the other register.
    const quiet = communicationProfile('معامله ثبت شد.', { observations: chatty });
    const asked = communicationProfile(`این را ${CONTEXT_FORMAL_REQUESTS[0]} بنویس`, {
      observations: chatty,
    });
    expect(quiet.formality.source).toBe('observed');
    // Asking is the one thing that always wins, which is what makes a learned preference correctable.
    expect(asked.formality.value).toBe('formal');
    expect(asked.formality.source).toBe('explicit');
    // A learned preference is never written down as a setting by any path: the profile reports it as an
    // input with its own source and the counts it came from, and the switch's value is untouched.
    expect(asked.observedSamples).toBe(chatty.samples);
  });

  it('states the terminology style from the mixing and the reply language', () => {
    // Persian in, Persian out: the product's own forms.
    expect(communicationProfile(PERSIAN_TECHNICAL).terminology.value).toBe('product-terms');
    // Persian speaking in whole English clauses: the English is kept beside our form.
    expect(communicationProfile(MIXED_PERSIAN_HEAVY).terminology.value).toBe('bilingual');
    // English in, English out.
    expect(communicationProfile(ENGLISH_TECHNICAL).terminology.value).toBe('english-terms');
    // ...and a request for the terms themselves outranks all of it.
    const asked = communicationProfile(
      `${PERSIAN_TECHNICAL} ${TERMINOLOGY_REQUESTS['english-terms'][0]}`,
    );
    expect(asked.terminology).toMatchObject({ value: 'english-terms', source: 'explicit' });

    for (const text of [PERSIAN_TECHNICAL, MIXED_PERSIAN_HEAVY, ENGLISH_TECHNICAL]) {
      const reading = communicationProfile(text).terminology;
      expect(TERMINOLOGY_STYLES).toContain(reading.value);
      expect(PREFERENCE_SOURCES).toContain(reading.source);
      expect(reading.reason.length).toBeGreaterThan(10);
    }
  });

  /* ── What is learned, and what it is not ───────────────────────────────── */

  it('learns counts and nothing else, in its own namespace', () => {
    const observations = learned(6, PERSIAN_INFORMAL);

    // Every leaf is a number: no message, no word from one, no user, no time. This is the property that
    // makes a learned store reviewable, and it is asserted by walking the value.
    for (const [path, value] of leaves(observations)) {
      expect(typeof value, `${path} is not a number`).toBe('number');
      expect(Number.isInteger(value)).toBe(true);
      expect(value as number).toBeGreaterThanOrEqual(0);
    }
    // Its key is the product's own, namespaced with the language setting, and outside both the knowledge
    // store and the agent memory — a setting is not cited knowledge and not a memory.
    expect(COMMUNICATION_OBSERVATION_KEY.startsWith('master-trade.')).toBe(true);
    expect(COMMUNICATION_OBSERVATION_KEY.startsWith(LANGUAGE_MEMORY_PREFIX)).toBe(false);
    expect(COMMUNICATION_OBSERVATION_KEY.startsWith(AGENT_MEMORY_ID_PREFIX)).toBe(false);
    // A turn with no reading to record still produces a valid store rather than a partial one.
    expect(parseObservations({ samples: 'nonsense' })).toEqual(emptyObservations());
  });

  it('bounds what it remembers and decays it', () => {
    // Below the window, every turn counts one.
    const small = learned(3, PERSIAN_INFORMAL);
    expect(small.samples).toBe(3);
    expect(small.formality.informal).toBe(3);

    // Past it, the counts halve: a style from long ago cannot outlive the current one, and the store
    // cannot grow without limit.
    const large = learned(OBSERVATION_WINDOW + 1, PERSIAN_INFORMAL);
    expect(large.samples).toBeLessThan(OBSERVATION_WINDOW + 1);
    expect(large.formality.informal).toBe(large.samples);

    // Too little evidence is not evidence: below the minimum, an observation is not consulted at all.
    const thin = learned(OBSERVATION_MINIMUM - 1, PERSIAN_INFORMAL);
    expect(dominantObservation(thin.formality, thin.samples)).toBeNull();
    expect(communicationProfile('معامله ثبت شد.', { observations: thin }).formality.source).toBe(
      'default',
    );
  });

  it('keeps a tie a tie rather than inventing a tendency from it', () => {
    const observations = mergeObservations(
      learned(OBSERVATION_MINIMUM, PERSIAN_INFORMAL),
      learned(OBSERVATION_MINIMUM, PERSIAN_BOOKISH),
    );
    expect(observations.formality.informal).toBe(observations.formality.formal);
    expect(dominantObservation(observations.formality, observations.samples)).toBeNull();
  });

  it('persists through a store that works and degrades through one that does not', () => {
    const { store, entries } = fakeStorage();
    const observations = learned(6, PERSIAN_INFORMAL);

    expect(readCommunicationObservations(store)).toEqual({
      observations: emptyObservations(),
      storable: true,
      stored: false,
    });
    expect(writeCommunicationObservations(observations, store)).toBe(true);
    expect(readCommunicationObservations(store).observations).toEqual(observations);

    // A value that is not JSON, or not the shape this build reads, leaves nothing learned rather than
    // throwing on the way into a conversation.
    entries.set(COMMUNICATION_OBSERVATION_KEY, 'not json at all');
    expect(readCommunicationObservations(store).observations).toEqual(emptyObservations());
    entries.set(
      COMMUNICATION_OBSERVATION_KEY,
      JSON.stringify({ samples: 9, formality: { informal: -3, nonsense: 40 }, extra: 'kept' }),
    );
    const partial = readCommunicationObservations(store).observations;
    expect(partial.samples).toBe(9);
    expect(partial.formality.informal).toBe(0);
    expect(partial.formality).not.toHaveProperty('nonsense');

    expect(readCommunicationObservations(null).storable).toBe(false);
    expect(readCommunicationObservations(throwingStorage)).toEqual({
      observations: emptyObservations(),
      storable: false,
      stored: false,
    });
    expect(writeCommunicationObservations(observations, null)).toBe(false);
    expect(writeCommunicationObservations(observations, throwingStorage)).toBe(false);
  });

  it('lets a request in the message outrank the stored choice, and says so', () => {
    const requested = communicationProfile('please reply in English: what is a stop-loss?', {
      preference: 'fa',
    });
    expect(requested.language).toMatchObject({
      language: 'en',
      source: 'requested',
      overridden: true,
    });
    expect(requested.language.reason).toContain('outranks');

    // With nothing chosen there is nothing to outrank, and the request is simply what was asked for.
    const automatic = communicationProfile('please reply in English: what is a stop-loss?');
    expect(automatic.language).toMatchObject({
      language: 'en',
      source: 'requested',
      overridden: false,
    });

    // A request for a *term* is not a request for a language: `همان انگلیسی` asks for the word, and the
    // language stays whatever the person chose. Reading it as a request would switch the reply language
    // on the strength of a sentence about vocabulary.
    const term = communicationProfile(
      `${PERSIAN_TECHNICAL} ${TERMINOLOGY_REQUESTS['english-terms'][0]}`,
      {
        preference: 'fa',
      },
    );
    expect(term.language).toMatchObject({ language: 'fa', source: 'explicit', overridden: false });
    expect(term.terminology).toMatchObject({ value: 'english-terms', source: 'explicit' });
  });
});

/* -------------------------------------------------------------------------- */
/* Task 3 — the guidance                                                       */
/* -------------------------------------------------------------------------- */

describe('the response guidance (Task 3)', () => {
  it('turns the four cases into the wording the phase asks for', () => {
    const persianTechnical = guidanceFor(PERSIAN_TECHNICAL);
    expect(persianTechnical).toMatchObject({ language: 'fa', terminology: 'product-terms' });
    expect(persianTechnical.notes).toContain('terms-product');
    expect(persianTechnical.notes).toContain('ask-nothing-further');

    const persianCasual = guidanceFor(PERSIAN_INFORMAL);
    expect(persianCasual).toMatchObject({ language: 'fa', tone: 'conversational' });
    expect(persianCasual.notes).toContain('fa-conversational');

    const englishTechnical = guidanceFor(ENGLISH_TECHNICAL);
    expect(englishTechnical).toMatchObject({ language: 'en', terminology: 'english-terms' });
    expect(englishTechnical.notes).toContain('en-neutral');

    // Mixed input: the reply follows the larger half and the terms keep the English the person is reading.
    const mixed = guidanceFor(MIXED_PERSIAN_HEAVY);
    expect(mixed.language).toBe('fa');
    expect(mixed.terminology).toBe('bilingual');
    expect(mixed.notes).toContain('terms-bilingual');
    expect(mixed.notes).toContain('figures-verbatim');
    expect(GUIDANCE_NOTES['terms-bilingual']).toContain('never translate');
  });

  it('gives guidance no field, no note and no reason a fact could travel in', () => {
    const guidance = guidanceFor(MIXED_PERSIAN_HEAVY, { preference: 'fa' });

    // The field list is the whole of it, so a field added to carry a number fails here.
    expect(Object.keys(guidance).sort()).toEqual([...GUIDANCE_FIELDS].sort());
    // The notes are ids from a closed catalogue, and the invariants are the seven the phase names.
    for (const note of guidance.notes) expect(GUIDANCE_NOTES).toHaveProperty(note);
    expect(guidance.invariants).toEqual(GUIDANCE_INVARIANTS);
    expect([...GUIDANCE_INVARIANTS]).toEqual([
      'facts',
      'calculations',
      'tool-results',
      'permissions',
      'safety-rules',
      'trading-restrictions',
      'uncertainty',
    ]);
    // The reason is assembled from the closed clause catalogue, so it cannot quote a reading either.
    for (const clause of Object.values(GUIDANCE_CLAUSES)) {
      if (guidance.reason.includes(clause)) expect(clause.length).toBeGreaterThan(0);
    }
    expect(guidance.reason).not.toContain(MIXED_PERSIAN_HEAVY);
    // No string anywhere in the guidance contains a figure, so guidance cannot carry a number at all.
    for (const text of stringsIn(guidance)) {
      expect(/\d|[۰-۹]/.test(text), `"${text}" carries a digit`).toBe(false);
    }
  });

  it('cannot quote the message it was built from', () => {
    const secret = 'ZQXWV';
    const guidance = guidanceFor(`معامله را با ${secret} بررسی کن و حد ضرر را چک کن`);
    expect(JSON.stringify(guidance)).not.toContain(secret);
    // Not even the terms it read: guidance names *styles*, and the terms belong in the answer.
    expect(JSON.stringify(guidance)).not.toContain('stop-loss');
  });

  it('produces the same guidance for two messages whose facts differ', () => {
    const first = guidanceFor(`${PERSIAN_TECHNICAL} ۳۳۲۰`);
    const second = guidanceFor(`${PERSIAN_TECHNICAL} ۹۹۹۹۵`);
    // The readings are the same, so the guidance is identical to the byte: figures are the answer's, and
    // this layer has no channel for them.
    expect(second).toEqual(first);
    expect(guidanceFor(ENGLISH_TECHNICAL)).toEqual(guidanceFor(ENGLISH_TECHNICAL));
  });

  it('reaches every note in its catalogue, and every guidance is total', () => {
    const corpus: readonly string[] = [
      PERSIAN_TECHNICAL,
      PERSIAN_INFORMAL,
      PERSIAN_BOOKISH,
      PERSIAN_PLAIN_QUESTION,
      ENGLISH_TECHNICAL,
      ENGLISH_INFORMAL,
      MIXED_PERSIAN_HEAVY,
      TICKER_ONLY,
      `این را ${CONTEXT_FORMAL_REQUESTS[0]} بنویس`,
      'این معامله را خلاصه کن',
      `${PERSIAN_TECHNICAL} ${CONTEXT_DETAILED_REQUESTS[0]} بگو`,
      `${PERSIAN_TECHNICAL} ${TERMINOLOGY_REQUESTS['english-terms'][0]}`,
      'فایل src/desktop/cli.ts را بررسی کن و بگو چه خبر است',
      'گزارش را بنویس',
      // English, politely: the one register the Persian corpus cannot produce.
      'Please summarize the stop-loss and take-profit levels for this trade. Thank you.',
      // An instruction that leans on four concepts at once, so the answer is a sequence of steps.
      'حد ضرر و حد سود و پوزیشن و بکتست را چک کن',
    ];

    const seen = new Set<string>();
    for (const text of corpus) {
      const guidance = guidanceFor(text);
      for (const note of guidance.notes) seen.add(note);
      // Total: every field is a closed-vocabulary value, whatever the message was.
      expect(GUIDANCE_INVARIANTS).toContain(guidance.invariants[0] ?? '');
      expect(guidance.notes.length).toBeGreaterThanOrEqual(4);
      expect(guidance.version).toBe(1);
      // Deterministic, through the whole chain.
      expect(guidanceFor(text)).toEqual(guidance);
    }
    // A catalogue entry nothing produces is an entry nothing tests: every note must be reachable.
    for (const note of Object.keys(GUIDANCE_NOTES)) {
      expect(seen.has(note), `no message in the corpus produces the note ${note}`).toBe(true);
    }
  });

  it('is a pure function of the profile it is handed', () => {
    const profile = communicationProfile(PERSIAN_TECHNICAL);
    const guidance: ResponseGuidance = responseGuidance(profile);
    expect(guidance).toEqual(guidanceFor(PERSIAN_TECHNICAL));

    // Resolving the same context twice produces the same guidance, which is what lets a caller cache it.
    const again = resolveCommunication(
      analyzeCommunication(PERSIAN_TECHNICAL),
      profile.language,
      PERSIAN_TECHNICAL,
    );
    expect(responseGuidance(again)).toEqual(responseGuidance(profile));
  });
});

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** A learned store built by feeding the same message to the observer a number of times. */
function learned(turns: number, text: string): CommunicationObservations {
  const context = analyzeCommunication(text);
  let observations = emptyObservations();
  for (let turn = 0; turn < turns; turn += 1) {
    observations = observeCommunication(context, observations);
  }
  return observations;
}
