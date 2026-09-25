/**
 * Phase 7.5.3.1 — detection, the profile, and the language switch.
 *
 * The claims, in the order they can fail:
 *
 *   1. **Detection is a census, not a model.** Every verdict is re-derivable from the message and a
 *      closed list, and the suite asserts the *evidence* alongside the verdict — so a change that made
 *      the verdict right for the wrong reason fails here. Persian, English, the mixed message this
 *      product actually receives, the technical sentence, the spoken register, and Finglish each get a
 *      case, including the ones where the honest answer is a low confidence or none at all.
 *   2. **The profile is a value a later stage can hold.** Versioned, closed-vocabulary, serialisable,
 *      deterministic, and exactly the fields the phase allows — nothing that describes a *person*.
 *   3. **Reading changes nothing.** The message is never rewritten, and every string the profile reports
 *      as evidence is a verbatim substring of what was typed.
 *   4. **The choice wins over the reading, and survives a restart.** The precedence rule is asserted on
 *      its own; the setting is asserted through a store that works, a store that throws, and no store at
 *      all; and the switch in the interface store is asserted to adopt what was stored and to write what
 *      was chosen.
 *
 * The Persian is written as characters — a suite for a language layer has to be reviewable by whoever
 * reviews the language — and every half-space is written `${ZWNJ}` rather than pasted, because an
 * invisible character in a string literal is a bug nobody can see in a diff.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_LANGUAGE_PREFERENCE,
  LANGUAGE_KINDS,
  LANGUAGE_MEMORY_PREFIX,
  LANGUAGE_PREFERENCE_KEY,
  LANGUAGE_PREFERENCE_LABELS,
  LANGUAGE_PREFERENCES,
  LANGUAGE_PROFILE_FIELDS,
  LANGUAGE_PROFILE_VERSION,
  LANGUAGE_REGISTERS,
  LANGUAGE_STYLES,
  LANGUAGE_VERBOSITIES,
  LANGUAGE_WORDINGS,
  ZWNJ,
  detectLanguage,
  languageProfile,
  normalizePersianContent,
  parseLanguagePreference,
  readLanguagePreference,
  resolveLanguage,
  storedProfileOptions,
  writeLanguagePreference,
  type LanguageKind,
  type PreferenceStorage,
} from '../web/src/language/index.js';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

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

/** A store that answers nothing, the way a hardened browser profile does. */
const throwingStorage: PreferenceStorage = {
  getItem() {
    throw new Error('storage is disabled');
  },
  setItem() {
    throw new Error('storage is disabled');
  },
};

const PERSIAN_PROSE = 'قیمت ورود ۳۳۴۵ دلار است و حد ضرر روی ۳۳۲۰ قرار دارد.';
const PERSIAN_TECHNICAL = 'حد ضرر و حد سود و پوزیشن و بکتست را بررسی کن';
const PERSIAN_INFORMAL = `قیمت رو دیدی؟ می${ZWNJ}شه بگی چرا اینطوری شد؟ الان می${ZWNJ}دونی چیکار کنم`;
const PERSIAN_BOOKISH = `گزارش معاملات شما تهیه شده است و می${ZWNJ}باشد جهت بررسی خدمت شما ارسال گردد.`;
const MIXED_FA_HEAVY =
  'قیمت XAUUSD امروز 3345.20 دلار است و پوزیشن فعلی من در سود است. Risk/reward is 2.6.';
const MIXED_EN_HEAVY = 'The XAUUSD position است and the حد ضرر was hit عند 3320';
const ENGLISH = 'Should I move my stop-loss to break-even after the first target is hit?';
const FINGLISH = 'salam, mishe gheymat ro begi? mikham beforusham';

/** Every field name anywhere in a value, nested objects included. */
function fieldNames(value: unknown, found: string[] = []): string[] {
  if (value === null || typeof value !== 'object') return found;
  for (const [key, child] of Object.entries(value)) {
    found.push(key);
    fieldNames(child, found);
  }
  return found;
}

/**
 * The words a profile is not allowed to name a field after.
 *
 * Compared per *segment* — `nativeLanguage` splits into `native` and `language` — because a substring
 * test cannot tell `language` from `age`, and a check with false positives is a check that gets
 * weakened the first time it fires.
 */
const FORBIDDEN_FIELD_SEGMENTS = new Set([
  'name',
  'age',
  'gender',
  'sex',
  'location',
  'country',
  'nationality',
  'religion',
  'native',
  'ethnicity',
  'ethnic',
  'income',
  'employer',
  'occupation',
  'marital',
  'education',
  'birthday',
]);

/** A field name split at its camelCase, snake_case and kebab-case boundaries. */
function fieldSegments(field: string): string[] {
  return field
    .split(/[^A-Za-z0-9]+|(?=[A-Z])/u)
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.toLowerCase());
}

/* -------------------------------------------------------------------------- */
/* Task 1 — detection                                                          */
/* -------------------------------------------------------------------------- */

describe('language detection (Task 1)', () => {
  it('reads Persian prose as Persian, and counts the letters it decided from', () => {
    const detection = detectLanguage(PERSIAN_PROSE);

    expect(detection.language).toBe('fa');
    expect(detection.confidence).toBe(1);
    // The evidence, not just the verdict: a whole sentence of one script is the confident case.
    expect(detection.context.persianLetters).toBeGreaterThan(20);
    expect(detection.context.latinLetters).toBe(0);
    // Persian digits are counted and *not* used as evidence, so they are reported rather than folded in.
    expect(detection.context.persianDigits).toBe(8);
    expect(detection.wording).toBe('technical');
    expect(detection.context.terms).toContain('stop-loss');
    expect(detection.context.domains).toContain('trading');
  });

  it('reads English as English, and a figure with no letters as no language at all', () => {
    const english = detectLanguage(ENGLISH);
    expect(english.language).toBe('en');
    expect(english.confidence).toBe(1);
    expect(english.context.persianLetters).toBe(0);
    expect(english.style).toBe('question');

    // A price is not a language. Digits read the same in every language, so counting them would move a
    // verdict without carrying information.
    for (const letters of ['3345.20', '۳۳۴۵', '', '؟!!', '   ']) {
      const detection = detectLanguage(letters);
      expect(detection.language, `"${letters}" was read as ${detection.language}`).toBe('unknown');
      expect(detection.confidence).toBe(0);
    }
  });

  it('calls a message carrying both scripts mixed rather than picking one and being wrong', () => {
    const persian = detectLanguage(MIXED_FA_HEAVY);
    expect(persian.language).toBe('mixed');
    expect(persian.context.persianLetters).toBeGreaterThan(persian.context.latinLetters);
    // The English half is still counted: a mix is a fact about the message, not a leftover.
    expect(persian.context.latinLetters).toBeGreaterThan(0);
    // A balanced mix is a stronger claim than a lopsided one, and the confidence says so.
    expect(persian.confidence).toBeGreaterThan(detectLanguage(MIXED_EN_HEAVY).confidence);

    const english = detectLanguage(MIXED_EN_HEAVY);
    expect(english.language).toBe('mixed');
    expect(english.context.latinLetters).toBeGreaterThan(english.context.persianLetters);
  });

  it('recognises the product own terminology, and calls general wording general', () => {
    const technical = detectLanguage(PERSIAN_TECHNICAL);
    expect(technical.wording).toBe('technical');
    expect(technical.context.terms).toContain('stop-loss');
    expect(technical.context.terms).toContain('take-profit');
    expect(technical.context.terms).toContain('position');

    const general = detectLanguage('سلام، حالت چطور است؟');
    expect(general.wording).toBe('general');
    expect(general.context.terms).toEqual([]);
    expect(general.context.domains).toEqual([]);
  });

  it('separates the spoken register from the written one, and stays neutral without evidence', () => {
    const informal = detectLanguage(PERSIAN_INFORMAL);
    expect(informal.register).toBe('informal');
    expect(informal.context.informalMarkers).toContain('رو');
    expect(informal.context.formalMarkers).toEqual([]);

    const formal = detectLanguage(PERSIAN_BOOKISH);
    expect(formal.register).toBe('formal');
    expect(formal.context.formalMarkers.length).toBeGreaterThan(0);

    // No marker at all is neutral rather than a coin toss, and a short message says so with a low
    // confidence instead of a confident guess.
    const neutral = detectLanguage(PERSIAN_PROSE);
    expect(neutral.register).toBe('neutral');
    expect(neutral.context.informalMarkers).toEqual([]);
    expect(neutral.context.formalMarkers).toEqual([]);
  });

  it('tells a question from an instruction from a statement', () => {
    expect(detectLanguage('چرا امروز بازار اینطور است؟').style).toBe('question');
    expect(detectLanguage('چرا بازار ریخت؟').style).toBe('question');
    // A Persian instruction closes with its verb, so the opening word says nothing and the last one
    // says everything.
    expect(detectLanguage('این معامله را خلاصه کن').style).toBe('instruction');
    expect(detectLanguage('یک بکتست از این راهبرد بگیر').style).toBe('instruction');
    expect(detectLanguage('Summarize this trade.').style).toBe('instruction');
    expect(detectLanguage('معامله بسته شد.').style).toBe('statement');
    // A chat message is not a paragraph: a question mark anywhere in it is somebody asking.
    expect(detectLanguage(`قیمت رو دیدی؟ الان چیکار کنم`).style).toBe('question');
    // Both at once is reported as both, rather than one of them chosen by the order of the checks.
    expect(detectLanguage('please reply in Persian: what is a stop-loss?').style).toBe('mixed');
  });

  it('bands verbosity by how much was written', () => {
    expect(detectLanguage('سلام').verbosity).toBe('terse');
    expect(detectLanguage(ENGLISH).verbosity).toBe('standard');
    expect(
      detectLanguage(
        `${PERSIAN_PROSE} ${PERSIAN_BOOKISH} ${PERSIAN_TECHNICAL} و همچنین بررسی کامل روند و ${PERSIAN_PROSE}`,
      ).verbosity,
    ).toBe('detailed');
  });

  it('reads Finglish as Persian in Latin letters, and refuses to guess from one word', () => {
    const finglish = detectLanguage(FINGLISH);
    expect(finglish.language).toBe('finglish');
    // Persian typed in a keyboard with no Persian on it is *Persian*, and the profile says so.
    expect(resolveLanguage('auto', finglish).language).toBe('fa');

    // One marker is not a verdict: `salam` alone is five Latin letters.
    expect(detectLanguage('salam').language).toBe('en');
    // English text reaches for its own stopwords immediately, and a word that could be either is not
    // allowed to outvote them.
    expect(detectLanguage('salam, the price').language).toBe('en');
  });

  it('hears an explicit language request, and only when the message really is one', () => {
    const requested: readonly (readonly [string, LanguageKind])[] = [
      ['please reply in Persian: what is a stop-loss?', 'fa'],
      ['لطفا به فارسی جواب بده', 'fa'],
      [`می${ZWNJ}شه این را به انگلیسی توضیح بدی؟`, 'en'],
      ['به انگلیسی', 'en'],
      ['answer in English please', 'en'],
    ];
    for (const [text, expected] of requested) {
      const request = detectLanguage(text).request;
      expect(request?.language, `"${text}" asked for ${String(request?.language)}`).toBe(expected);
      // The phrase is quoted back as it was written, so a reviewer can check the reading.
      expect(text).toContain(request?.phrase ?? '\u0000');
      expect(request?.confidence).toBeGreaterThan(0.9);
    }

    // A message about a language is not a request for one. This is the case a keyword search gets wrong.
    expect(detectLanguage('زبان فارسی سخته').request).toBeNull();
    expect(detectLanguage(ENGLISH).request).toBeNull();
  });

  it('infers nothing about the person, and carries no field that could', () => {
    const profile = languageProfile(MIXED_FA_HEAVY);

    // A field that describes *who somebody is* fails here rather than shipping as a quiet addition.
    for (const field of fieldNames(profile)) {
      for (const segment of fieldSegments(field)) {
        expect(
          FORBIDDEN_FIELD_SEGMENTS.has(segment),
          `the profile carries a field named ${field}`,
        ).toBe(false);
      }
    }
    // And the closed list is the whole of it, so an addition is a deliberate edit to this list too.
    expect(Object.keys(profile).sort()).toEqual([...LANGUAGE_PROFILE_FIELDS].sort());
  });

  it('reads a message without altering it', () => {
    // Deliberately messy: a doubled space, a Latin comma written in Persian text and a Latin question
    // mark. The normalizer would change all three, and detection must not.
    const messy = `می${ZWNJ}شه   قیمت XAUUSD رو بگی, الان?`;
    const detection = detectLanguage(messy);
    const corrected = normalizePersianContent(messy).text;
    expect(corrected).not.toBe(messy);

    const evidence = [
      ...detection.context.informalMarkers,
      ...detection.context.formalMarkers,
      ...(detection.request === null ? [] : [detection.request.phrase]),
    ];
    expect(evidence.length).toBeGreaterThan(0);
    // Every string the reading reports is a substring of what was typed, verbatim.
    for (const form of evidence) expect(messy).toContain(form);
    // And the corrected paragraph appears nowhere in the reading — there is no field it could travel in.
    expect(JSON.stringify(detection)).not.toContain(corrected);
  });
});

/* -------------------------------------------------------------------------- */
/* Task 2 — the profile                                                        */
/* -------------------------------------------------------------------------- */

describe('the linguistic profile (Task 2)', () => {
  it('carries its version, the choice and the reply under one value', () => {
    const profile = languageProfile(PERSIAN_PROSE);

    expect(profile.profileVersion).toBe(LANGUAGE_PROFILE_VERSION);
    expect(profile.preference).toBe(DEFAULT_LANGUAGE_PREFERENCE);
    expect(profile.language).toBe('fa');
    expect(profile.reply.language).toBe('fa');
    expect(profile.reply.source).toBe('detected');
    expect(profile.reply.overridden).toBe(false);
    // The vocabulary a consumer reads is closed, so an unknown value cannot arrive from a later stage.
    expect(LANGUAGE_KINDS).toContain(profile.language);
    expect(LANGUAGE_REGISTERS).toContain(profile.register);
    expect(LANGUAGE_WORDINGS).toContain(profile.wording);
    expect(LANGUAGE_STYLES).toContain(profile.style);
    expect(LANGUAGE_VERBOSITIES).toContain(profile.verbosity);
  });

  it('lets an explicit choice win, and records that it did', () => {
    const persian = detectLanguage(PERSIAN_PROSE);
    const english = detectLanguage(ENGLISH);

    // An English question with Persian chosen: the reply is Persian, and the disagreement is recorded
    // rather than silently reconciled.
    const overridden = resolveLanguage('fa', english);
    expect(overridden).toMatchObject({ language: 'fa', source: 'explicit', overridden: true });

    // Agreement is not an override.
    expect(resolveLanguage('fa', persian)).toMatchObject({
      language: 'fa',
      source: 'explicit',
      overridden: false,
    });
    expect(resolveLanguage('en', persian)).toMatchObject({
      language: 'en',
      source: 'explicit',
      overridden: true,
    });
    // Nothing detected is not a disagreement: there was no reading to disagree with.
    expect(resolveLanguage('fa', detectLanguage('3345.20')).overridden).toBe(false);
    // Finglish is Persian, so a Persian reader's choice agrees with it rather than overriding it.
    expect(resolveLanguage('fa', detectLanguage(FINGLISH)).overridden).toBe(false);
    expect(languageProfile(ENGLISH, { preference: 'fa' }).reply.language).toBe('fa');
  });

  it('follows the larger half of a mixed message, and the product language when there is nothing to read', () => {
    expect(languageProfile(MIXED_FA_HEAVY).reply.language).toBe('fa');
    expect(languageProfile(MIXED_EN_HEAVY).reply.language).toBe('en');

    // A reply is never `mixed` and never `unknown`: a product has to answer in something.
    for (const text of [MIXED_FA_HEAVY, MIXED_EN_HEAVY, '', '3345.20', FINGLISH]) {
      const { reply } = languageProfile(text);
      expect(['fa', 'en']).toContain(reply.language);
    }
    const nothing = languageProfile('3345.20');
    expect(nothing.reply.source).toBe('default');
    expect(nothing.reply.reason).not.toBe('');
  });

  it('is deterministic and serialisable, so a later stage can store and compare it', () => {
    const first = languageProfile(MIXED_FA_HEAVY, { preference: 'fa' });
    const second = languageProfile(MIXED_FA_HEAVY, { preference: 'fa' });
    expect(second).toEqual(first);
    // Derived knowledge that survives a round trip is knowledge a caller can persist or cache.
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });

  it('exposes the stored choice to the language system, through the one seam', () => {
    const { store } = fakeStorage({ [LANGUAGE_PREFERENCE_KEY]: 'fa' });

    // A stage that has never heard of storage, a store or a switch still honours the setting.
    const profile = languageProfile(ENGLISH, storedProfileOptions(store));
    expect(profile.preference).toBe('fa');
    expect(profile.reply).toMatchObject({ language: 'fa', source: 'explicit', overridden: true });

    // No storage, no choice: automatic, and the message decides.
    expect(storedProfileOptions(null).preference).toBe('auto');
  });
});

/* -------------------------------------------------------------------------- */
/* Task 3 — the preference and the switch                                      */
/* -------------------------------------------------------------------------- */

describe('the language preference (Task 3)', () => {
  it('keeps its own namespaced key, outside the knowledge store namespace', () => {
    expect(LANGUAGE_PREFERENCE_KEY.startsWith('master-trade.')).toBe(true);
    // The learning store's keys are cited knowledge, reviewed and versioned. A person's own setting is
    // not that, and it is not allowed to appear as one.
    expect(LANGUAGE_PREFERENCE_KEY.startsWith(LANGUAGE_MEMORY_PREFIX)).toBe(false);
  });

  it('offers automatic, Persian and English, each with a label to render', () => {
    expect(LANGUAGE_PREFERENCES).toEqual(['auto', 'fa', 'en']);
    expect(DEFAULT_LANGUAGE_PREFERENCE).toBe('auto');
    for (const option of LANGUAGE_PREFERENCES) {
      expect(LANGUAGE_PREFERENCE_LABELS[option].length).toBeGreaterThan(0);
    }
    expect(LANGUAGE_PREFERENCE_LABELS.fa).toContain('فارسی');
  });

  it('treats anything it cannot understand as automatic rather than as a fourth state', () => {
    expect(parseLanguagePreference('fa')).toBe('fa');
    expect(parseLanguagePreference('en')).toBe('en');
    for (const raw of ['nonsense', '', null, undefined, 7, {}, 'AUTO']) {
      expect(parseLanguagePreference(raw), `${String(raw)} became something else`).toBe('auto');
    }
  });

  it('round-trips through a store, and says whether it could write', () => {
    const { store, entries } = fakeStorage();

    expect(readLanguagePreference(store)).toEqual({
      preference: 'auto',
      storable: true,
      stored: null,
    });
    expect(writeLanguagePreference('fa', store)).toBe(true);
    expect(entries.get(LANGUAGE_PREFERENCE_KEY)).toBe('fa');
    expect(readLanguagePreference(store).preference).toBe('fa');

    // `auto` is written rather than removed, so "automatic" is a decision the product can see was made.
    expect(writeLanguagePreference('auto', store)).toBe(true);
    expect(entries.has(LANGUAGE_PREFERENCE_KEY)).toBe(true);
    expect(readLanguagePreference(store).preference).toBe('auto');

    // A value a newer build wrote is not understood, and not acted on either.
    entries.set(LANGUAGE_PREFERENCE_KEY, 'he');
    expect(readLanguagePreference(store)).toEqual({
      preference: 'auto',
      storable: true,
      stored: null,
    });
  });

  it('degrades instead of throwing when storage is missing or hostile', () => {
    expect(readLanguagePreference(null)).toEqual({
      preference: 'auto',
      storable: false,
      stored: null,
    });
    expect(readLanguagePreference(throwingStorage)).toEqual({
      preference: 'auto',
      storable: false,
      stored: null,
    });
    // A failed write is reported, so the interface can say the choice will not be remembered rather than
    // showing a selected state that disappears at the next launch.
    expect(writeLanguagePreference('fa', null)).toBe(false);
    expect(writeLanguagePreference('fa', throwingStorage)).toBe(false);
  });
});

describe('the switch, wired to the interface store', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('adopts the stored choice at creation, and writes every later one', async () => {
    const { store, entries } = fakeStorage({ [LANGUAGE_PREFERENCE_KEY]: 'fa' });
    // Storage is probed at store creation, which is what makes the first paint carry the remembered
    // choice instead of flashing `auto` and then correcting itself.
    vi.stubGlobal('localStorage', store);
    vi.resetModules();

    const { useUiStore } = await import('../web/src/store/ui.js');
    expect(useUiStore.getState().languagePreference).toBe('fa');
    expect(useUiStore.getState().languageStorable).toBe(true);

    useUiStore.getState().setLanguagePreference('en');
    expect(useUiStore.getState().languagePreference).toBe('en');
    expect(entries.get(LANGUAGE_PREFERENCE_KEY)).toBe('en');

    // And what the store now says is what the language system will read for the next message.
    expect(storedProfileOptions(store).preference).toBe('en');
  });

  it('shows an unwritable choice as unwritable rather than as remembered', async () => {
    vi.stubGlobal('localStorage', throwingStorage);
    vi.resetModules();

    const { useUiStore } = await import('../web/src/store/ui.js');
    // A hostile store is not a crash at boot: the product opens with automatic and says so.
    expect(useUiStore.getState().languagePreference).toBe('auto');
    expect(useUiStore.getState().languageStorable).toBe(false);

    useUiStore.getState().setLanguagePreference('fa');
    expect(useUiStore.getState().languagePreference).toBe('fa');
    expect(useUiStore.getState().languageStorable).toBe(false);
  });
});
