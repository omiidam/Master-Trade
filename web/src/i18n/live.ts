/**
 * Label maps that follow the interface language — Phase 7.5.3.3, Task 1.
 *
 * The application names its states in about twenty module-level maps — `RESULT_LABEL`, `SESSION_LABEL`,
 * `EXPERIMENT_VERDICT_LABEL` — and every one of them is read while rendering: a badge, a table cell, a
 * filter chip. A map is not a message, but the values in it are, so they belong in the catalogue.
 *
 * The problem is *when* the lookup happens. `const RESULT_LABEL = { win: msg('…') }` is evaluated once, when
 * the module is imported, so the map would freeze in whatever language the application happened to start
 * in — the one failure mode of module-level text that a snapshot of the catalogue cannot see. A `msg()`
 * at every one of the ~120 read sites would fix it and would also mean every one of those sites has to
 * remember to translate.
 *
 * So the map is built from keys, and each property reads the catalogue when it is read. `RESULT_LABEL.win`
 * still returns a string and still returns `'Win'` in English; it just asks again in Persian, and the read
 * sites did not have to change at all.
 *
 * The values are getter-only on purpose: a label map is derived from the catalogue, so writing to one would
 * have to mean writing to the catalogue, and that is not what a label map is for.
 */

import { msg } from './active.js';
import type { MessageKey } from './translate.js';

/**
 * A label map whose values are read in the active language every time they are read.
 *
 * `keys` is the map's own vocabulary mapped onto catalogue keys, and the returned object has exactly the
 * same shape as the plain record it replaces — including `Object.keys`, which is how the interface builds
 * its filter lists.
 */
export function liveLabels<T extends string>(
  keys: Readonly<Record<T, MessageKey>>,
): Record<T, string> {
  const labels = {} as Record<T, string>;
  for (const key of Object.keys(keys) as T[]) {
    Object.defineProperty(labels, key, {
      enumerable: true,
      get: () => msg(keys[key]),
    });
  }
  return labels;
}
