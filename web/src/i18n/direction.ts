/**
 * Writing direction — Phase 7.5.3.4.4.
 *
 * Three values, and the third one is the point. A setting that could only be `ltr` or `rtl` would make
 * choosing Persian leave the interface mirrored the wrong way until somebody found a second control, which
 * is a translation that renders as a broken layout — the phase's own failure mode. So direction has the same
 * shape the language does: **a default that follows the language, and an explicit value that overrides it.**
 *
 * ```
 *   auto → the interface locale decides: Persian is right-to-left, English is left-to-right
 *   ltr  → pinned left-to-right, whatever the language is
 *   rtl  → pinned right-to-left, whatever the language is
 * ```
 *
 * The automatic answer is derived from the resolved *locale* rather than from the setting's name, which is
 * the difference between this and a table of three cases: `uiLocaleOf` already knows which language the
 * interface is being read in, so a third RTL language needs a line in `locales.ts` and nothing here. The
 * inversion is deliberate too — the pinned values are the ones a person chose, and the automatic one is
 * what remains, so nothing in this module has to know *why* a language flows the way it does.
 *
 * **What direction decides, and what it must not.** Flow decides what: inline start and end, the side a
 * list marker sits on, which way a chevron points when it means "next", the order two columns fall in. It
 * does not decide typeface (`:lang(fa)` does, and `global.css` says why), it does not decide whether a
 * *figure* is read left-to-right (`.num` isolates one, because `−1.00R` mirrored is a different number), and
 * it does not decide which way a chart runs: a financial time series is read left to right in every language
 * this product speaks, from the oldest candle to the newest, and the charts say so for themselves. `dir`
 * flips the *interface*; it is not a global mirror, and the suite holds each of those exceptions by name.
 */

import type { UiLocale } from './locales.js';

/**
 * What a person can choose, and what a first run has.
 *
 * `auto` first because it is the honest default: the interface is written in a language, and that language
 * already has a direction. A product that asks a Persian reader to find a mirroring control before the
 * interface is readable has mistranslated the layout, not the words.
 */
export const DIRECTION_PREFERENCES = ['auto', 'ltr', 'rtl'] as const;
export type DirectionPreference = (typeof DIRECTION_PREFERENCES)[number];

/** The direction a document is actually written in. Two values: this is not a preference. */
export const TEXT_DIRECTIONS = ['ltr', 'rtl'] as const;
export type TextDirection = (typeof TEXT_DIRECTIONS)[number];

/** The default for somebody who has chosen nothing. */
export const DEFAULT_DIRECTION_PREFERENCE: DirectionPreference = 'auto';

/**
 * Which locales are written right-to-left.
 *
 * Stated as a rule about the locale rather than as a case in the resolution so that a Persian-only
 * interface stays a decision about *this* product while the direction stays a decision about the language:
 * a third RTL language is a line here and nothing else.
 */
const RTL_LOCALES: readonly UiLocale[] = ['fa'];

/** True when the interface language is written right-to-left. */
export function isRtlLocale(locale: UiLocale): boolean {
  return RTL_LOCALES.includes(locale);
}

/**
 * The direction to write in: the pinned choice, or the language's own.
 *
 * Total and pure — every pair of a preference and a locale produces a direction — so a caller that has only
 * one of the two still gets an answer rather than a branch.
 */
export function directionOf(preference: DirectionPreference, locale: UiLocale): TextDirection {
  if (preference !== 'auto') return preference;
  return isRtlLocale(locale) ? 'rtl' : 'ltr';
}
