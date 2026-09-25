/**
 * The React-facing half of the i18n layer — Phase 7.5.3.3, Task 1.
 *
 * Two hooks, and both of them are about *subscription* rather than about lookup: `msg()` already answers
 * "what does this say in the current language", and what React needs is a reason to render again when the
 * answer changes.
 *
 *   - `useUiLocale()` subscribes to the setting and returns the interface language. The shell calls it once,
 *     which is what makes a language change re-render the application.
 *   - `useTranslation()` returns the same locale plus a `t` bound to it, for a component that needs to be
 *     explicit — a memoised component, or one that renders a list of keys it was handed.
 *
 * Neither hook writes anything: the store is the single source of truth, and `active.ts` listens to it.
 */

import { useEffect, useMemo } from 'react';
import { useUiStore } from '../store/ui.js';
import { LOCALE_HTML_TAGS, uiLocaleOf, type UiLocale } from './locales.js';
import { translate, type MessageKey, type MessageParams } from './translate.js';

/** The interface language the current setting asks for. */
export function useUiLocale(): UiLocale {
  return useUiStore((state) => uiLocaleOf(state.languagePreference));
}

/**
 * Put the interface language on `<html lang>`, and hand the shell the reason to re-render.
 *
 * The shell calls this once, and it does two jobs that have to happen together. Setting `lang` is what makes
 * the document say which language it is in, which is what a screen reader reads and what the `:lang(fa)`
 * rule in `global.css` matches to swap the type stack to Vazirmatn. Subscribing to the setting here is what
 * makes the *whole tree* re-render when the choice changes — `msg()` reads a module-level value, so without
 * a component above the pages re-rendering, a switch would appear to do nothing until the next navigation.
 *
 * `dir` is deliberately not touched: the writing direction is the person's own control, on the same page as
 * this one, and it already works independently of the language.
 */
export function useDocumentLanguage(): UiLocale {
  const locale = useUiLocale();
  useEffect(() => {
    // Reached through `globalThis` so the module is also loadable where there is no document — the browser is
    // the only place this runs, but the same module is imported by the suites that run in Node.
    const browsing = globalThis as { document?: { documentElement: { lang: string } } };
    if (browsing.document) browsing.document.documentElement.lang = LOCALE_HTML_TAGS[locale];
  }, [locale]);
  return locale;
}

export interface Translation {
  readonly locale: UiLocale;
  readonly t: (key: MessageKey, params?: MessageParams) => string;
}

export function useTranslation(): Translation {
  const locale = useUiLocale();
  return useMemo(
    () => ({
      locale,
      t: (key: MessageKey, params?: MessageParams) => translate(locale, key, params),
    }),
    [locale],
  );
}
