/**
 * What a surface says, read back from its source — Phase 7.5.3.3.
 *
 * Several suites here make claims about the *copy* a surface renders: that the honesty notice sits beside the
 * brand, that a refusal is never sold as an upgrade, that an absent figure is not drawn as a zero. Before the
 * interface was translatable, those tests could read the sentence straight out of the component file. A
 * component now names a message key instead, so the assertion has to resolve the keys the file mentions
 * through the catalogue.
 *
 * Resolving rather than matching the key is the point: a suite that asserted `msg('usage.noUsageToShow')` is
 * present would pass with any wording behind that key, including wording that sells a refusal. These two
 * helpers keep every suite asserting over what the interface *says*.
 *
 * Only keys this build knows are resolved, so a file that mentions an id, a class name or a symbol is not
 * disturbed by them.
 */

import { EN_MESSAGES, isMessageKey, type MessageKey } from '../../web/src/i18n/index.js';

/** Every message key the source names, in the order it first appears. */
export function messageKeysIn(source: string): MessageKey[] {
  const keys: MessageKey[] = [];
  for (const match of source.matchAll(/'([^'\n]+)'/g)) {
    const key = match[1];
    if (isMessageKey(key) && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

/** Everything the source says, in English, in the order it first appears. */
export function copyIn(source: string): string[] {
  return messageKeysIn(source).map((key) => EN_MESSAGES[key]);
}

/** Everything the source says, in English, as one block of text. */
export function copyOf(source: string): string {
  return copyIn(source).join('\n');
}
