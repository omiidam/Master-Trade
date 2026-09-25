/**
 * The language preference — Phase 7.5.3.1, Task 3.
 *
 * One setting, three values, and a decision about where it lives.
 *
 * **`auto` is a value, not the absence of one.** Detection is worth having on its own, so "I have not
 * chosen" has to be expressible — otherwise a person who never opens Settings has silently chosen
 * English, and a person who clears their choice cannot get back to automatic. The phase's "override
 * automatic language detection when explicitly selected" needs both halves: something explicit to
 * override *with*, and something automatic to be overridden.
 *
 * **It is kept out of the language knowledge store on purpose.** `LanguageMemory` holds cited knowledge
 * about *Persian* — orthography, terminology, the rules a reviewer accepted — and it is shared, versioned
 * and reviewed through a provenance path. A person's own setting is none of those things: it is not a
 * claim about the language, it has no reviewer, and writing it into the store would put per-user state
 * into a knowledge base whose whole value is that every entry can be cited. So the preference lives where
 * a client-side setting belongs and is *exposed to* the language system rather than stored inside it —
 * `resolveLanguage` reads it as an argument, and nothing in the language layer writes it.
 *
 * **Where it is persisted, and what happens when it cannot be.** The architecture has no settings table
 * and no user-settings API yet, so the supported mechanism is the platform's own key–value storage
 * (`localStorage`, available identically in the desktop webview and in a browser). Storage access can
 * genuinely fail — a hardened browser profile, a storage-disabled origin, a throw from a quota policy —
 * so every read and write goes through here, a failure degrades to `auto` rather than throwing, and
 * `readLanguagePreference` reports whether it could persist so the interface can say so instead of
 * pretending the choice was remembered. When the product grows a settings API, this file is the one
 * place that changes; nothing else knows how the value is kept.
 */

/**
 * What a person has chosen.
 *
 * `auto` first because it is the default and the recommended answer: writing Persian and getting Persian
 * back should not require a setting, and a product that demands one has made its detection useless.
 */
export const LANGUAGE_PREFERENCES = ['auto', 'fa', 'en'] as const;
export type LanguagePreference = (typeof LANGUAGE_PREFERENCES)[number];

/** The default, and the only value a first run can honestly have. */
export const DEFAULT_LANGUAGE_PREFERENCE: LanguagePreference = 'auto';

/**
 * The storage key.
 *
 * Namespaced with the product name and dotted like a config path, so it is identifiable in a storage
 * inspector and cannot collide with a key another tool on the same origin chose.
 */
export const LANGUAGE_PREFERENCE_KEY = 'master-trade.language.preference';

/** How each option is written in the interface, in one place so a control and its test agree. */
export const LANGUAGE_PREFERENCE_LABELS: Readonly<Record<LanguagePreference, string>> = {
  auto: 'Automatic',
  fa: 'Persian (فارسی)',
  en: 'English',
};

/**
 * The slice of storage this module needs, and nothing more.
 *
 * Declared structurally rather than as `Storage` so the two facts that matter are testable without a
 * browser: a store that throws and a store that does not. `Storage` also carries `length`, `key()` and
 * `removeItem()`, none of which this setting has any business calling.
 */
export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * The platform's storage, or nothing.
 *
 * `globalThis` is probed rather than `window`, because the same code runs in the desktop webview, in a
 * test process with no DOM at all, and in any worker with `localStorage` present and throwing. A missing
 * global is a normal answer here, not an error.
 */
export function preferenceStorage(): PreferenceStorage | null {
  try {
    const candidate = (globalThis as { localStorage?: PreferenceStorage }).localStorage;
    return candidate === undefined ? null : candidate;
  } catch {
    // Some environments throw on the *read* of the property itself, which is why the probe is wrapped.
    return null;
  }
}

/** True when this preference is one of the three, whatever was found in storage. */
export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return typeof value === 'string' && (LANGUAGE_PREFERENCES as readonly string[]).includes(value);
}

/**
 * Read a stored value, or the default.
 *
 * The default is also the answer for anything unrecognised — a value written by a newer build, or by
 * hand — because a setting that cannot be understood must not become a fourth state the product acts on.
 */
export function parseLanguagePreference(raw: unknown): LanguagePreference {
  return isLanguagePreference(raw) ? raw : DEFAULT_LANGUAGE_PREFERENCE;
}

/** What was found in storage, and whether storage could be read at all. */
export interface LanguagePreferenceReading {
  readonly preference: LanguagePreference;
  /** True when a real store answered; false when there was none, or it threw. */
  readonly storable: boolean;
  /** The stored value, when it was one this build understands. */
  readonly stored: LanguagePreference | null;
}

/** Read the preference, saying whether the answer came from somewhere it could be written back to. */
export function readLanguagePreference(
  storage: PreferenceStorage | null = preferenceStorage(),
): LanguagePreferenceReading {
  if (storage === null)
    return { preference: DEFAULT_LANGUAGE_PREFERENCE, storable: false, stored: null };
  try {
    const raw = storage.getItem(LANGUAGE_PREFERENCE_KEY);
    return {
      preference: parseLanguagePreference(raw),
      storable: true,
      stored: isLanguagePreference(raw) ? raw : null,
    };
  } catch {
    return { preference: DEFAULT_LANGUAGE_PREFERENCE, storable: false, stored: null };
  }
}

/**
 * Write the preference.
 *
 * The return value is the point: a caller that cannot persist the choice can say so rather than showing a
 * selected state that will be gone at the next launch. `auto` is written rather than removed, so
 * "automatic" is a decision this product can see was made.
 */
export function writeLanguagePreference(
  preference: LanguagePreference,
  storage: PreferenceStorage | null = preferenceStorage(),
): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(LANGUAGE_PREFERENCE_KEY, preference);
    return true;
  } catch {
    return false;
  }
}
