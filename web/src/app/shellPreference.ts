/**
 * The rail's collapsed state, remembered — Phase 8.1.3.
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
