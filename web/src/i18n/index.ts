/**
 * The UI language layer — one import surface.
 *
 * Two things, kept apart on purpose:
 *
 *   - **The setting** is Phase 7.5.3.1's language preference, in `web/src/language/preference.ts`. This layer
 *     reads it and never writes it, so the interface language is controlled by the explicit selection the
 *     person made and by nothing else — no detection, no learned preference, no agent memory.
 *   - **The copy** is four modules here: `locales.ts` (which languages exist and how a preference maps to
 *     one), `messages.en.ts` (the English source of truth, and the key type), `messages.fa.ts` (the Persian
 *     catalogue, exhaustively typed), and `translate.ts` (lookup, interpolation, fallback). `live.ts`
 *     builds the label maps that follow the interface language from those keys.
 *
 * `active.ts` binds the two together for the components — one subscription, one module-level `msg()` — and
 * `useTranslation.ts` is the React-facing pair of hooks.
 *
 * Nothing in this layer knows anything about the *agent's* language. The two share a control and nothing
 * else: `docs/ui-language.md` states the boundary, and the suite asserts it — no module under `web/src/i18n`
 * may import the language knowledge store, and no module under `web/src/language` may import this one except
 * `preference.ts`, which owns the setting both of them read.
 */

export {
  DEFAULT_UI_LOCALE,
  LOCALE_ENDONYMS,
  LOCALE_HTML_TAGS,
  UI_LOCALES,
  isUiLocale,
  uiLocaleOf,
} from './locales.js';
export type { UiLocale } from './locales.js';

export {
  MESSAGE_KEYS,
  identicalToEnglish,
  interpolate,
  isMessageKey,
  translate,
  untranslatedKeys,
} from './translate.js';
export type { MessageKey, MessageParams } from './translate.js';

export { EN_MESSAGES } from './messages.en.js';
export { FA_MESSAGES } from './messages.fa.js';

export { activeUiLocale, msg, setActiveLocale } from './active.js';

export { liveLabels } from './live.js';

export { useDocumentLanguage, useTranslation, useUiLocale } from './useTranslation.js';
export type { Translation } from './useTranslation.js';
