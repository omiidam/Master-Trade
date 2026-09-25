/**
 * The UI locales — Phase 7.5.3.3, Task 1.
 *
 * One list, and one function, and the function is the important half.
 *
 * **The interface language is derived from the setting, and from nothing else.** Phase 7.5.3.1 built a
 * three-way control — `auto`, `fa`, `en` — that decides what language the *agent* answers in, and stored it
 * with the product's one setting key. This sub-phase gives that same choice a second effect: an explicit
 * `fa` is also an instruction about the *interface*, and `auto` is not (a person who has chosen nothing has
 * not asked for a Persian interface, and automatic detection must never decide one — that is the rule the
 * phase states, and it is why `uiLocaleOf` maps `auto` to English rather than to the detected language).
 *
 * So there is no second setting, no second key and no second store: `uiLocaleOf` is a pure function of the
 * value 7.5.3.1 already persists, and the language switch in Settings therefore drives both the agent's
 * replies and the visible interface with the one control the person already has.
 *
 * Adding a language is: a word in `UI_LOCALES`, a range in `LOCALE_HTML_TAGS`, an endonym, a catalogue
 * module, and one line in `uiLocaleOf`. Nothing else in the application has to know.
 */

import type { LanguagePreference } from '../language/preference.js';

/** The languages the interface can be read in. Order is the order a switcher shows them. */
export const UI_LOCALES = ['en', 'fa'] as const;
export type UiLocale = (typeof UI_LOCALES)[number];

/**
 * What a first run shows.
 *
 * English, because the product's own copy is written in it and because `auto` must not silently produce a
 * Persian interface: a person who has expressed no preference gets the language this product is authored
 * in, and one click gets them the other one.
 */
export const DEFAULT_UI_LOCALE: UiLocale = 'en';

/** Each language named in itself, which is the only honest label for a language switcher. */
export const LOCALE_ENDONYMS: Readonly<Record<UiLocale, string>> = {
  en: 'English',
  fa: 'فارسی',
};

/**
 * What goes on `<html lang>`, which is what a screen reader and the font stack read.
 *
 * `fa-IR` rather than `fa` because the orthography this product writes is the Iranian one, and because
 * Phase 7.5.1's locale is `fa-IR` — the `:lang(fa)` rules in `global.css` that switch the type stack to
 * Vazirmatn match a region subtag, so choosing Persian on the switch is also what makes the Persian face
 * load.
 */
export const LOCALE_HTML_TAGS: Readonly<Record<UiLocale, string>> = {
  en: 'en',
  fa: 'fa-IR',
};

/** The interface language a stored preference asks for. `auto` and `en` both mean English. */
export function uiLocaleOf(preference: LanguagePreference): UiLocale {
  return preference === 'fa' ? 'fa' : DEFAULT_UI_LOCALE;
}

/** True when a value is a locale this build can render. Used where a value arrives from outside. */
export function isUiLocale(value: unknown): value is UiLocale {
  return typeof value === 'string' && (UI_LOCALES as readonly string[]).includes(value);
}
