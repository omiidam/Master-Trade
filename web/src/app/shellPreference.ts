/**
 * The shell's own standing preferences, remembered — Phase 8.1.3, Phase 8.3.3.
 *
 * The shell has offered the reader a collapse control since Phase 3.2, and the docs have called the
 * result "the reader's saved preference" ever since. It was not saved: `sidebarCollapsed` lived in the
 * UI store, which is memory, so the choice survived every walk around the product and evaporated on
 * the first reload — the one moment a *standing* choice is expected to still be standing. This module
 * is the missing half of that sentence.
 *
 * The rules are the language preference's rules, because it is the same kind of value (see
 * `web/src/language/preference.ts`): one key, namespaced so it is identifiable in a storage inspector;
 * a read that cannot throw; and a write that *reports* whether it landed.
 *
 * **The probe below is a deliberate repetition, not an oversight.** The first version imported the
 * language preference's `preferenceStorage`, and the language layer's own suite refused it — twice, and
 * correctly. That layer is held to an exact boundary: exactly three files outside it may reach exactly
 * one of its modules (the *setting*, so the switch can be a switch), and nothing inside it may reach
 * out. A platform probe is neither of those, so it stays here rather than being smuggled through a
 * boundary that exists to be argued about. Six lines of duplicated `try`/`catch` is the cheaper price.
 *
 * What this file does **not** own is the meaning of the setting. `railModeFor` in `shellLayout.ts`
 * decides whether a mode honours it at all — a tablet overrides the reader because a 264px rail does
 * not fit — and that stays where it is.
 *
 * **Phase 8.3.3 found the other half of the same sentence.** The shell has two standing preferences
 * and only one of them was remembered: the rail's state survived a reload while the workspace's
 * *density* — the Comfortable/Compact choice two cards down on the same Settings screen, which is
 * what decides the workspace's vertical rhythm — silently reverted every time. A reader who tightened
 * the workspace so more rows fit on a laptop screen got the airy one back at the next launch, and the
 * next, with nothing on screen saying why. It is written down here now, by exactly these rules,
 * because a preference is either remembered in one place or it is not remembered at all.
 */

/** The storage key, namespaced like the language preference's. */
export const SIDEBAR_COLLAPSED_KEY = 'master-trade.shell.sidebarCollapsed';

/** What the rail did when the reader collapsed it, and what it means when written. */
const COLLAPSED = 'true';

/**
 * The slice of storage this setting needs, and nothing more.
 *
 * Declared structurally rather than as `Storage` so the two facts that matter are testable without a
 * browser — a store that throws and a store that does not — and so a test can drive the read and write
 * paths with an object of its own.
 */
export interface ShellStorage {
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
export function shellStorage(): ShellStorage | null {
  try {
    const candidate = (globalThis as { localStorage?: ShellStorage }).localStorage;
    return candidate === undefined ? null : candidate;
  } catch {
    // Some environments throw on the *read* of the property itself, which is why the probe is wrapped.
    return null;
  }
}

/**
 * Whether the rail starts collapsed.
 *
 * Only the value this build writes is honoured; an open rail is the product's default, so that is also
 * the answer for anything unrecognised — a value written by a newer build, or by hand — because a
 * setting that cannot be understood must not become a state the shell acts on.
 */
export function readSidebarCollapsed(storage: ShellStorage | null = shellStorage()): boolean {
  if (storage === null) return false;
  try {
    return storage.getItem(SIDEBAR_COLLAPSED_KEY) === COLLAPSED;
  } catch {
    return false;
  }
}

/**
 * Write the choice, and report whether it landed.
 *
 * `false` means it will not outlive the page — a hardened profile, a storage-disabled origin, a quota
 * policy. The rail's control does not stop to say so (a status message per press of a collapse button
 * would be noise), but the answer is the contract: the caller can tell the difference between a choice
 * remembered and a choice shown, which is the distinction the language preference was built around.
 */
export function writeSidebarCollapsed(
  collapsed: boolean,
  storage: ShellStorage | null = shellStorage(),
): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? COLLAPSED : 'false');
    return true;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* How much air the workspace gives each row (Phase 8.3.3)                     */
/* -------------------------------------------------------------------------- */

/** The density key, alongside the rail's. */
export const DENSITY_KEY = 'master-trade.shell.density';

/**
 * The two densities, named here because this module is what writes them down.
 *
 * The store re-exports this union rather than declaring a second one, so the vocabulary the reader
 * chooses from and the vocabulary storage accepts cannot drift apart — a second literal union is a
 * second validation, and the two would disagree the first time one of them gained a value.
 */
export type ShellDensity = 'comfortable' | 'compact';

/** What the workspace is when nobody has chosen — and when a choice cannot be understood. */
const COMFORTABLE: ShellDensity = 'comfortable';

/**
 * The reader's density, or the product's default.
 *
 * The rail's rule, unchanged: only the value this build writes is honoured, and anything else — a
 * value written by a newer build, a truncated write, something put there by hand — is the default
 * rather than a state the shell acts on.
 */
export function readDensity(storage: ShellStorage | null = shellStorage()): ShellDensity {
  if (storage === null) return COMFORTABLE;
  try {
    return storage.getItem(DENSITY_KEY) === 'compact' ? 'compact' : COMFORTABLE;
  } catch {
    return COMFORTABLE;
  }
}

/**
 * Write the choice, and report whether it landed, for the same reason the rail's write does.
 *
 * The Settings control does not stop to say so, which is the decision Phase 8.1.3 already made for the
 * rail: a status line per press of a two-state button is noise, and the *verdict* is the contract — a
 * caller that needs to tell a remembered choice from a shown one can ask for it.
 */
export function writeDensity(
  density: ShellDensity,
  storage: ShellStorage | null = shellStorage(),
): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(DENSITY_KEY, density);
    return true;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Which of the two themes the reader is looking at (Phase 9)                  */
/* -------------------------------------------------------------------------- */

/** The theme key, alongside the rail's and the density's. */
export const THEME_KEY = 'master-trade.shell.theme';

/**
 * The themes, named here because this module is what writes them down.
 *
 * Exactly the density rule, applied to the theme: the vocabulary the reader chooses from and the
 * vocabulary storage accepts are one union, declared once, so they cannot drift apart. The values
 * are the `data-theme` attribute values, because that attribute is what the stylesheet actually
 * selects on — storing the pretty `THEMES` id instead would mean translating in both directions.
 */
export type ShellTheme = 'dark' | 'light';

/** What the reader sees when nobody has chosen — and when a choice cannot be understood. */
const DARK: ShellTheme = 'dark';

/**
 * The reader's theme, or the product's default.
 *
 * The same rule as the rail and the density: only a value this build writes is honoured, and
 * anything else is the default rather than a state the shell acts on. Storage is untrusted input
 * here for the same reason it is everywhere else in this file — it is shared with extensions, it
 * survives across builds that may not know this key, and a half-written value must not become a
 * theme the product cannot render.
 */
export function readTheme(storage: ShellStorage | null = shellStorage()): ShellTheme {
  if (storage === null) return DARK;
  try {
    return storage.getItem(THEME_KEY) === 'light' ? 'light' : DARK;
  } catch {
    return DARK;
  }
}

/** Write the choice, and report whether it landed, for the same reason the other two do. */
export function writeTheme(
  theme: ShellTheme,
  storage: ShellStorage | null = shellStorage(),
): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(THEME_KEY, theme);
    return true;
  } catch {
    return false;
  }
}
