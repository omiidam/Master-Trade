/**
 * Quick navigation: the search behind the palette — Phase 8.2.3.
 *
 * The workspace has fourteen destinations and one way to reach them: the rail, which is a *list* a
 * reader reads and walks. That is the right primary navigation, and it is not a way to *find*
 * something — a reader who knows they want Portfolio and cannot see the word has to read eleven
 * entries to be sure it is not there. This module is the other way in: one query, over the same
 * fourteen entries, in the same order, from the same declaration.
 *
 * What a query can be found by
 * ----------------------------
 * The palette is a *command* surface, so it answers to more than the printed word:
 *
 *   - the **label** the rail draws, in the language the interface is currently in — what the reader
 *     can see and name;
 *   - the **identifier** (`portfolio`, `lab`, …), which is the entry's semantic route metadata: the
 *     one name for a destination the interface language never changes, and the name a reader who
 *     thinks in the product's own vocabulary will type;
 *   - the **description**, which is the sentence that says what the destination holds — so "cost
 *     basis" finds the Portfolio without naming it;
 *   - the **group** heading it sits under, so "learning" finds the two study surfaces.
 *
 * Two rules keep the answers predictable. Nothing is invented: the index is built from `NAV_MODEL`,
 * so there is no second list of destinations to drift out of step with the rail (and no target that
 * is not a real page). And the order is *stated*, not left to the sort: a better match comes first,
 * and two equally good matches come back in the order the rail draws them, in every language.
 *
 * This module holds no React and no components, so the suite can call it directly.
 */

import { NAV_MODEL, type NavGroupModel, type NavSection } from '../config/navigation.js';
import { translate, type UiLocale } from '../i18n/index.js';

/** Which of an entry's fields a query was found in. */
export type QuickNavField = 'label' | 'identifier' | 'description' | 'group';

/** One entry a query selects, and the field that selected it. */
export interface QuickNavMatch {
  readonly section: NavSection;
  readonly group: NavGroupModel;
  readonly field: QuickNavField;
}

/**
 * Fold text for comparison.
 *
 * Case is the obvious half. The other half is the joiners: a Persian word is written with zero-width
 * characters joining its letters, and a reader typing that same word may not produce them, so both
 * sides of the comparison lose their zero-width characters and the two spellings become one query.
 * `NFKC` folds the presentation
 * forms some platforms produce for the same letters, and the lower-casing is deliberately not
 * locale-aware: none of the languages this build speaks has locale-specific casing, and a
 * locale-aware fold would make the same query mean different things on two machines.
 */
function fold(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .trim();
}

/** One entry with each field it can be found by, folded once. */
interface IndexedEntry {
  readonly section: NavSection;
  readonly group: NavGroupModel;
  readonly label: string;
  readonly identifier: string;
  readonly description: string;
  readonly groupLabel: string;
}

/**
 * The index, read from the one navigation model.
 *
 * Built per call rather than cached: fourteen entries of four catalogue lookups is cheaper than the
 * bookkeeping that would keep a cache honest when the language changes underneath it.
 */
function index(locale: UiLocale): readonly IndexedEntry[] {
  const entries: IndexedEntry[] = [];
  for (const group of NAV_MODEL) {
    for (const section of group.items) {
      entries.push({
        section,
        group,
        label: fold(translate(locale, section.labelKey)),
        identifier: fold(section.id),
        description: fold(translate(locale, section.descriptionKey)),
        groupLabel: fold(translate(locale, group.labelKey)),
      });
    }
  }
  return entries;
}

/**
 * How good an answer is, lowest first.
 *
 * The ladder is the whole of the ranking, and it is written down because "the right result was third"
 * is a defect nobody can see. A name that *starts* with the query beats a name that merely contains
 * it (typing `ex` should put Exams above nothing, and `la` should not be beaten by a description that
 * mentions "allocation"); the printed word beats the semantics, which beat the prose, which beats the
 * place an entry lives — because each step away from the label is a step away from what the reader
 * was looking at when they asked.
 */
const RANKS: Readonly<Record<QuickNavField, number>> = {
  label: 0,
  identifier: 1,
  description: 2,
  group: 3,
};

/** Where the query was found in one entry, or `null` when it was not. */
function rankField(entry: IndexedEntry, query: string): QuickNavField | null {
  if (entry.label.startsWith(query)) return 'label';
  if (entry.label.includes(query)) return 'label';
  if (entry.identifier.includes(query)) return 'identifier';
  if (entry.description.includes(query)) return 'description';
  if (entry.groupLabel.includes(query)) return 'group';
  return null;
}

/**
 * The destinations a query selects, best answer first, each at most once.
 *
 * An empty query selects everything, which is what makes the palette a *directory* as well as a
 * search: opening it with nothing typed shows the whole workspace, in the rail's own order, so the
 * list itself is the discovery. It is not a "show all" special case — an empty needle is a substring
 * of every label, so it falls out of the same rule as any other query.
 */
export function searchQuickNav(query: string, locale: UiLocale): readonly QuickNavMatch[] {
  const needle = fold(query);
  const found: { entry: IndexedEntry; field: QuickNavField; rank: number; order: number }[] = [];

  index(locale).forEach((entry, order) => {
    // An empty query matches the label by definition — `''.startsWith('')` — so the whole directory
    // comes back through the ordinary path rather than through a branch that could disagree with it.
    const field = needle === '' ? 'label' : rankField(entry, needle);
    if (field === null) return;
    found.push({ entry, field, rank: RANKS[field], order });
  });

  return (
    found
      // The tie-break is the rail's order, stated rather than inherited from the sort's stability, so
      // two equal answers are ordered the same way in every engine and every language.
      .sort((left, right) => left.rank - right.rank || left.order - right.order)
      .map(({ entry, field }) => ({ section: entry.section, group: entry.group, field }))
  );
}

/**
 * How the shortcut is written on this platform.
 *
 * A hint that names the wrong key is worse than no hint: an Apple keyboard has no `Ctrl`, and a
 * Windows one has no `⌘`. Read from the user agent rather than from a build flag, because this is a
 * browser surface — and guarded, because the same module is imported by suites that run in Node.
 */
export function quickNavShortcut(): string {
  const agent = (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent ?? '';
  return /Mac|iPhone|iPad|iPod/i.test(agent) ? '\u2318K' : 'Ctrl+K';
}

/**
 * The shortcut in the notation assistive technology reads.
 *
 * `aria-keyshortcuts` is the machine-readable half of the printed hint above: a screen-reader user is
 * told which keys open this control rather than having to find a `<kbd>` and guess.
 */
export const QUICK_NAV_KEYS = 'Control+K Meta+K';
