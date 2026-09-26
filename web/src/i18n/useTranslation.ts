/**
 * The React-facing half of the i18n layer — Phase 7.5.3.3, Task 1.
 *
 * Two hooks, and both of them are about *subscription* rather than about lookup: `msg()` already answers
 * "what does this say in the current language", and what React needs is a reason to render again when the
 * answer changes.
 *
 *   - `useUiLocale()` subscribes to the setting and returns the interface language. The shell calls it once,
 *     which is what makes a language change re-render the application.
 *   - `useTextDirection()` resolves the writing direction from the control and the language, for the few
 *     components whose *behaviour* is direction-shaped rather than merely styled by it — a chevron that
 *     means "next" points along the reading direction, and that choice is made in JavaScript.
 *   - `useTranslation()` returns the same locale plus a `t` bound to it, for a component that needs to be
 *     explicit — a memoised component, or one that renders a list of keys it was handed.
 *
 * None of them writes anything the person did not: the store is the single source of truth, and `active.ts`
 * listens to it.
 */

import { useEffect, useMemo } from 'react';
import { useUiStore } from '../store/ui.js';
import { directionOf, type DirectionPreference, type TextDirection } from './direction.js';
import { LOCALE_HTML_TAGS, uiLocaleOf, type UiLocale } from './locales.js';
import { translate, type MessageKey, type MessageParams } from './translate.js';

/** The interface language the current setting asks for. */
export function useUiLocale(): UiLocale {
  return useUiStore((state) => uiLocaleOf(state.languagePreference));
}

/**
 * The direction the interface is being written in — Phase 7.5.3.4.4.
 *
 * Resolved, not stored: the control's value is a *preference* (`auto` follows the language) and this is what
 * it resolves to right now, which is what a component with a direction-shaped decision needs. Reading it
 * through the store rather than from `document.documentElement.dir` is deliberate — the attribute is the
 * effect, this is the decision, and a component that read the DOM would not re-render when the control
 * moved.
 */
export function useTextDirection(): TextDirection {
  const preference = useUiStore((state) => state.direction);
  const locale = useUiLocale();
  return directionOf(preference, locale);
}

/**
 * Put the interface's locale on the document, and hand the shell the reason to re-render.
 *
 * The shell calls this once, and it owns **both** document attributes: `lang` is what makes the document
 * say which language it is in (what a screen reader reads, and what the `:lang(fa)` rule in `global.css`
 * matches to swap the type stack to Vazirmatn) and `dir` is the writing direction, which is derived from
 * the same setting. Two hooks writing `<html>` is how the two disagree, so there is one.
 *
 * Subscribing to the setting here is also what makes the *whole tree* re-render when either choice changes:
 * `msg()` reads a module-level value, so without a component above the pages re-rendering, a language switch
 * would appear to do nothing until the next navigation — and a direction change would leave every chevron
 * pointing the old way, because those are chosen in React rather than by the cascade.
 */
export function useDocumentLanguage(): UiLocale {
  const locale = useUiLocale();
  const direction = useTextDirection();
  useEffect(() => {
    // Reached through `globalThis` so the module is also loadable where there is no document — the browser is
    // the only place this runs, but the same module is imported by the suites that run in Node.
    const browsing = globalThis as { document?: { documentElement: { lang: string } } };
    if (browsing.document) browsing.document.documentElement.lang = LOCALE_HTML_TAGS[locale];
  }, [locale]);
  useEffect(() => {
    const browsing = globalThis as { document?: { documentElement: { dir: string } } };
    if (browsing.document) browsing.document.documentElement.dir = direction;
  }, [direction]);
  return locale;
}

/**
 * The document's locale attributes, applied outside React.
 *
 * Called once before the first render (`main.tsx`) so that a Persian reader does not see a left-to-right
 * frame and then a mirror of it: the effects above run after React's first paint, which is late enough to be
 * visible on a cold load. It reads the same setting and applies the same rule, so the two can only disagree
 * if the rule itself changes — and there is one rule.
 */
export function applyDocumentLocale(locale: UiLocale, preference: DirectionPreference): void {
  const browsing = globalThis as {
    document?: { documentElement: { lang: string; dir: string } };
  };
  if (!browsing.document) return;
  browsing.document.documentElement.lang = LOCALE_HTML_TAGS[locale];
  browsing.document.documentElement.dir = directionOf(preference, locale);
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
