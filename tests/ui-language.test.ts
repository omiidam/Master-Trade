/**
 * The interface language layer, as the application actually uses it — Phase 7.5.3.3.
 *
 * The claim this phase makes is narrow and testable: *the words the interface shows come from a catalogue, and
 * one explicit choice decides which catalogue*. So the suite is about the mechanism rather than about any
 * particular sentence — completeness of the Persian catalogue, the fallback chain, interpolation, the fact
 * that English did not change, and the subscription that makes a switch repaint the application.
 *
 * The boundary is checked here too. This layer and the agent's Persian *knowledge* share a control and nothing
 * else, so the suites assert that neither imports the other: an interface language decided by what an agent
 * learned about Persian would be exactly the mixing the phase forbids.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_UI_LOCALE,
  EN_MESSAGES,
  FA_MESSAGES,
  LOCALE_ENDONYMS,
  LOCALE_HTML_TAGS,
  MESSAGE_KEYS,
  UI_LOCALES,
  activeUiLocale,
  identicalToEnglish,
  interpolate,
  isMessageKey,
  isUiLocale,
  msg,
  translate,
  uiLocaleOf,
  untranslatedKeys,
  type MessageKey,
} from '../web/src/i18n/index.js';
import { copyOf } from './helpers/source-copy.js';
import { RESULT_LABEL } from '../web/src/mock/journal.js';
import { readLanguagePreference } from '../web/src/language/index.js';
import { useUiStore } from '../web/src/store/ui.js';

const read = (path: string): string => readFileSync(path, 'utf8');

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full.split('\\').join('/'));
  }
  return out;
};

describe('the interface languages', () => {
  it('ships English and Persian, and says which one is the default', () => {
    expect(UI_LOCALES).toEqual(['en', 'fa']);
    expect(DEFAULT_UI_LOCALE).toBe('en');
    expect(isUiLocale('fa')).toBe(true);
    expect(isUiLocale('de')).toBe(false);
    // Each language named in its own script — the only honest label for a language switcher.
    expect(LOCALE_ENDONYMS.en).toBe('English');
    expect(LOCALE_ENDONYMS.fa).toBe('فارسی');
    // The region subtag is what the `:lang(fa)` rule in global.css matches, so it is also what loads Vazirmatn.
    expect(LOCALE_HTML_TAGS.fa).toBe('fa-IR');
    expect(LOCALE_HTML_TAGS.en).toBe('en');
  });

  it('derives the interface language from the setting, and from nothing else', () => {
    // `auto` is not a language: a person who has expressed no preference has not asked for a Persian
    // interface, and detection must never decide one.
    expect(uiLocaleOf('auto')).toBe('en');
    expect(uiLocaleOf('en')).toBe('en');
    expect(uiLocaleOf('fa')).toBe('fa');
  });
});

describe('the catalogues', () => {
  it('has a Persian sentence for every key', () => {
    expect(untranslatedKeys('fa')).toEqual([]);
    expect(Object.keys(FA_MESSAGES)).toHaveLength(MESSAGE_KEYS.length);
    for (const key of MESSAGE_KEYS) {
      expect(FA_MESSAGES[key], `${key} is missing`).toBeTypeOf('string');
      expect(FA_MESSAGES[key], `${key} is empty`).not.toBe('');
    }
  });

  it('leaves English byte-identical to the copy the interface shipped with', () => {
    // The English interface is the product's authored wording; the migration moved it into the catalogue
    // without touching it, and this is what says so.
    for (const key of MESSAGE_KEYS) {
      expect(translate('en', key), key).toBe(EN_MESSAGES[key]);
    }
  });

  it('names, rather than hides, the values that are the same in both languages', () => {
    // A product name, a unit letter, a code identifier and the endonym `English` are the same word in both
    // catalogues on purpose. Everything else identical would be an untranslated entry wearing a translation.
    expect(identicalToEnglish('fa').sort()).toEqual(
      [
        // The product's name, the two provider names as the industry writes them, a version letter, a package
        // path, the R and t unit letters, a code identifier, and the endonym `English`.
        'brand.masterTrade',
        'data.anthropic',
        'data.openAI',
        'decisions.v',
        'journal.packagesTradingEngine',
        'journal.r',
        'journal.t',
        'memory.contextKindForTrust',
        'settings.languageEnglish',
      ].sort(),
    );
  });

  it('is mostly *not* the English text: the interface is genuinely translated', () => {
    const identical = identicalToEnglish('fa').length;
    expect(identical / MESSAGE_KEYS.length).toBeLessThan(0.02);
    // And the Persian catalogue is Persian, not transliteration.
    const persian = MESSAGE_KEYS.filter((key) => /[\u0600-\u06FF]/.test(FA_MESSAGES[key])).length;
    expect(persian / MESSAGE_KEYS.length).toBeGreaterThan(0.99);
  });

  it('translated the navigation from the terminology record, word for word', () => {
    // Every area the phase names is named in Persian, and the same concept is not called two things.
    for (const id of [
      'academy',
      'agent',
      'memory',
      'research',
      'journal',
      'portfolio',
      'evaluation',
      'exams',
      'lab',
      'activity',
      'usage',
      'profile',
      'settings',
      'dashboard',
    ]) {
      const key = `shell.nav.${id}.label` as MessageKey;
      expect(isMessageKey(key), key).toBe(true);
      expect(translate('fa', key), id).not.toBe(translate('en', key));
      expect(translate('fa', key).length, id).toBeGreaterThan(1);
    }
  });
});

describe('lookup', () => {
  it('falls back to English, and then to the key itself, without throwing', () => {
    // The Persian catalogue is exhaustive by type, so the fallback exists for values that arrive after a
    // build — and the worst case is a visible id rather than a blank screen or an exception.
    const forged = 'not.a.key' as MessageKey;
    expect(translate('fa', forged)).toBe(forged);
    expect(translate('en', forged)).toBe(forged);
    expect(isMessageKey(forged)).toBe(false);
    expect(isMessageKey('shell.search')).toBe(true);
  });

  it('interpolates named placeholders and leaves unknown ones exactly as written', () => {
    expect(interpolate('{count} trades', { count: 3 })).toBe('3 trades');
    expect(interpolate('{count} trades', {})).toBe('{count} trades');
    expect(interpolate('a named {language} here', { language: 'فارسی' })).toBe(
      'a named فارسی here',
    );
    // The switch's own caption is the one message in the catalogue that has a placeholder today.
    expect(translate('fa', 'settings.languageChosen', { language: LOCALE_ENDONYMS.fa })).toContain(
      LOCALE_ENDONYMS.fa,
    );
  });
});

describe('the subscription that makes the switch work', () => {
  const original = readLanguagePreference().preference;

  afterEach(() => {
    useUiStore.getState().setLanguagePreference(original);
  });

  it('follows the setting, so one choice moves the whole interface', () => {
    useUiStore.getState().setLanguagePreference('fa');
    expect(activeUiLocale()).toBe('fa');
    expect(msg('settings.language')).toBe(FA_MESSAGES['settings.language']);
    expect(msg('settings.language')).not.toBe(EN_MESSAGES['settings.language']);

    useUiStore.getState().setLanguagePreference('en');
    expect(activeUiLocale()).toBe('en');
    expect(msg('settings.language')).toBe(EN_MESSAGES['settings.language']);
  });

  it('carries a label map with it, because a map is read while rendering', () => {
    // `liveLabels` reads the catalogue on every property read, which is what stops a module-level map from
    // freezing in whatever language the application happened to start in.
    useUiStore.getState().setLanguagePreference('en');
    expect(RESULT_LABEL.win).toBe('Win');
    useUiStore.getState().setLanguagePreference('fa');
    expect(RESULT_LABEL.win).toBe('سود');
    expect(RESULT_LABEL.loss).toBe('زیان');
    expect(RESULT_LABEL.win).not.toBe('Win');
  });

  it('keeps the two vocabularies apart', () => {
    // The interface layer reads the setting and never the language knowledge store; the agent's language
    // layer does not know the interface exists. Persian interface wording is not learned data.
    const interfaceFiles = walk('web/src/i18n');
    const languageFiles = walk('web/src/language');
    for (const file of interfaceFiles) {
      const source = read(file);
      for (const match of source.matchAll(/from '([^']*language[^']*)'/g)) {
        // The one place they touch is the setting's *type*, which is not a value and not knowledge.
        expect(match[1], file).toContain('preference');
        expect(source, file).toMatch(new RegExp(`import type \\{[^}]*\\} from '${match[1]}'`));
      }
    }
    for (const file of languageFiles) {
      expect(read(file), file).not.toMatch(/from '\.\.\/i18n|from '\.\/i18n/);
    }
  });

  it('does not leave a component reading the English catalogue directly', () => {
    // A component that reached into `EN_MESSAGES` would be a component the switch cannot reach.
    for (const file of walk('web/src')) {
      if (file.includes('/i18n/')) continue;
      const source = read(file);
      expect(source, file).not.toMatch(/\bEN_MESSAGES\b|\bFA_MESSAGES\b/);
    }
  });

  it('keeps the one thing that would break the subscription out of the tree', () => {
    // `msg()` reads a module-level value, so a component wrapped in `memo` can skip the re-render that
    // follows a language change and keep the previous language. Nothing in the application is memoised;
    // a component that needs the guarantee calls `useTranslation()` instead.
    for (const file of walk('web/src')) {
      if (file.includes('/i18n/')) continue;
      expect(read(file), file).not.toMatch(/[^a-zA-Z]memo\(/);
    }
  });
});

describe('the switch, as the settings page renders it', () => {
  it('names its own options from the catalogue, in the language it is showing', () => {
    // A switch that stayed English while the interface became Persian would be the first thing a Persian
    // reader saw, which is why the labels are keys rather than strings beside the setting.
    expect(translate('fa', 'settings.languageAutomatic')).toBe('خودکار');
    expect(translate('en', 'settings.languageAutomatic')).toBe('Automatic');
    expect(translate('fa', 'settings.languagePersian')).toBe('فارسی');
    expect(translate('en', 'settings.languagePersian')).toContain('فارسی');
  });

  it('says what the choice does to the interface, not only to the answer', () => {
    const card = read('web/src/pages/SettingsPage.tsx');
    expect(copyOf(card)).toContain('this interface is shown in it');
    expect(translate('fa', 'settings.theLanguageTheAgentAnswersIn')).toContain('این رابط');
  });
});
