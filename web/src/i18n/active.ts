/**
 * The active locale, and the `msg()` every component calls — Phase 7.5.3.3, Task 1.
 *
 * Why a module-level function rather than a hook in every component
 * ----------------------------------------------------------------
 * The idiomatic React answer is `const { t } = useTranslation()` at the top of each component, and this
 * application has ~90 components that render copy. Threading a hook through all of them is plumbing that
 * has to be repeated, remembered and reviewed at every new call site, and the failure mode of forgetting
 * it is a component that silently keeps the old language.
 *
 * So the locale lives here, the subscription below keeps it current, and a component calls `msg('key')`
 * with nothing else to remember. Reactivity is provided in exactly one place: the store's own subscription
 * updates this value *before* React re-renders, and the shell subscribes to the locale so the whole tree
 * re-renders and reads the new value. The one thing that would break it is a memoised component that skips
 * the re-render, which is why the suite fails if any file in the application imports `memo` — a memoised
 * component must call `useTranslation()` instead, and the test says so.
 *
 * Why the subscription is set up at import
 * ----------------------------------------
 * A `useEffect` would run after paint, so the first frame after a language change would render the previous
 * language — a visible flash of the wrong language on every switch. Reading the store at import and
 * subscribing to it means the value is already correct by the time React renders, and `msg()` is therefore
 * safe to call outside React too (in a test, in a toast raised from a store action).
 */

import { useUiStore } from '../store/ui.js';
import { DEFAULT_UI_LOCALE, uiLocaleOf, type UiLocale } from './locales.js';
import { translate, type MessageKey, type MessageParams } from './translate.js';

let activeLocale: UiLocale = DEFAULT_UI_LOCALE;

/** Set the locale `msg()` reads. The subscription below is the only caller in the application. */
export function setActiveLocale(locale: UiLocale): void {
  activeLocale = locale;
}

/** The locale `msg()` would use right now. */
export function activeUiLocale(): UiLocale {
  return activeLocale;
}

/**
 * One message, in the language the person chose.
 *
 * `msg` rather than `t` deliberately: `t` is a name map callbacks use, and a component whose prop is called
 * `t` would shadow the translation function in a way that is invisible at a glance.
 */
export function msg(key: MessageKey, params?: MessageParams): string {
  return translate(activeLocale, key, params);
}

// The setting is the product's one language preference (Phase 7.5.3.1); the interface language is a
// function of it, so the switch keeps working and nothing new is persisted.
setActiveLocale(uiLocaleOf(useUiStore.getState().languagePreference));
useUiStore.subscribe((state) => setActiveLocale(uiLocaleOf(state.languagePreference)));
