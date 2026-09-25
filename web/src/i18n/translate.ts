/**
 * Message lookup — Phase 7.5.3.3, Task 1.
 *
 * The whole mechanism, in one function and three rules about what happens when it fails.
 *
 * **Keys, not sentences.** Every string the product says is addressed by an id (`page.dashboard.title`),
 * and the components hold the id rather than the copy. That is what "no hardcoded translated strings inside
 * individual components" means mechanically: a component that has no English sentence in it cannot be
 * half-translated, and the suite enforces the other direction too — no `.tsx` file in the application may
 * contain a Persian character, so the copy can only live in a catalogue.
 *
 * **The fallback chain is `locale → English → the key itself`**, and none of the three can throw. A missing
 * Persian string shows the English one, which is a defect a reader can see and report; a key that exists in
 * neither catalogue shows its own id, which is a defect a developer sees immediately instead of reading a
 * blank screen. The Persian catalogue is typed `Record<MessageKey, string>`, so a *missing* entry is a
 * compile error rather than a runtime fallback — the fallback exists for values added after a build, which
 * is the only case a compiler cannot catch.
 *
 * **Substitution is named, not positional.** `{count}` is filled from a parameter record, and a placeholder
 * with no parameter is left exactly as written rather than becoming `undefined`: a UI that prints
 * `{count} trades` is obviously broken, while one that prints `undefined trades` looks like a data bug in
 * the wrong layer.
 */

import { EN_MESSAGES, type MessageKey } from './messages.en.js';
import { FA_MESSAGES } from './messages.fa.js';
import { DEFAULT_UI_LOCALE, type UiLocale } from './locales.js';

export type { MessageKey };

/** The values a message may be interpolated with. Numbers are stringified; nothing else is accepted. */
export type MessageParams = Readonly<Record<string, string | number>>;

/** Every catalogue this build can render, keyed by its locale. */
const CATALOGUES: Readonly<Record<UiLocale, Readonly<Partial<Record<MessageKey, string>>>>> = {
  en: EN_MESSAGES,
  fa: FA_MESSAGES,
};

/** Every key this build knows, in catalogue order. */
export const MESSAGE_KEYS = Object.keys(EN_MESSAGES) as MessageKey[];

/** Whether a value is one of this build's keys. Used by the suite and by anything parsing a key. */
export function isMessageKey(value: unknown): value is MessageKey {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(EN_MESSAGES, value);
}

/** Fill `{name}` placeholders from a parameter record, leaving unknown ones untouched. */
export function interpolate(template: string, params: MessageParams): string {
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : String(value);
  });
}

/**
 * The text of one message in one language.
 *
 * Total by construction: every path returns a string, and the worst case is the key itself.
 */
export function translate(locale: UiLocale, key: MessageKey, params?: MessageParams): string {
  const value = CATALOGUES[locale][key] ?? EN_MESSAGES[key] ?? key;
  return params === undefined ? value : interpolate(value, params);
}

/**
 * The keys a locale cannot render, which is empty for every locale this build ships.
 *
 * Exported so the completeness case in the suite is a measurement rather than an assertion about the
 * compiler: the type system already refuses a catalogue that misses a key, and this answers the question
 * for a locale that arrived as data.
 */
export function untranslatedKeys(locale: UiLocale): MessageKey[] {
  if (locale === DEFAULT_UI_LOCALE) return [];
  return MESSAGE_KEYS.filter((key) => CATALOGUES[locale][key] === undefined);
}

/**
 * The keys whose value is the English text itself.
 *
 * A copy of the English string is how an untranslated entry hides: the interface looks translated, and one
 * screen in twenty is in the wrong language. The suite runs this over the Persian catalogue and allows only
 * names that are the same in both languages, so the rule is checked rather than trusted.
 */
export function identicalToEnglish(locale: UiLocale): MessageKey[] {
  if (locale === DEFAULT_UI_LOCALE) return [];
  return MESSAGE_KEYS.filter((key) => CATALOGUES[locale][key] === EN_MESSAGES[key]);
}
