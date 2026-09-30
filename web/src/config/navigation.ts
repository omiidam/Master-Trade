import { msg, type MessageKey } from '../i18n/index.js';
/**
 * Application shell navigation.
 *
 * Dependency-free data (no React, no icons import) so it can be validated in the
 * backend test suite: `tests/frontend-shell.test.ts` runs
 * `assertNoExecutionControls()` over every label and description here, and the
 * backend UI invariant (`src/frontend/viewModels.ts`) forbids order placement,
 * execution or broker affordances. The sidebar maps `icon` names to components.
 *
 * Phase note: the backend NAV_ITEMS sections (`conversation`, `academy`,
 * `dashboard`, `notifications`, `logs`, `settings`) map onto these ids once the
 * API adapter lands; `activity` is the Phase 3.7 surface for `logs` +
 * `notifications` (the event stream and the background-task queue). `memory`,
 * `exams`, `research`, `lab` and `journal` have no backend capability yet — they
 * are study surfaces, not trading surfaces, and every one of them is read-only.
 *
 * `journal` is deliberately ONE navigation entry. Its sections (overview, trade
 * history, add trade, trade details, analytics, calendar, reviews) are internal
 * tabs, so the sidebar never grows a sub-tree for it.
 */

export const APP_PAGE_IDS = [
  'dashboard',
  'agent',
  'memory',
  'research',
  'journal',
  'portfolio',
  'evaluation',
  'academy',
  'exams',
  'lab',
  'activity',
  'usage',
  'profile',
  'settings',
] as const;

export type AppPageId = (typeof APP_PAGE_IDS)[number];

export type NavIconName =
  | 'gauge'
  | 'coins'
  | 'pie-chart'
  | 'blocks'
  | 'sparkles'
  | 'brain'
  | 'microscope'
  | 'journal'
  | 'graduation'
  | 'clipboard'
  | 'flask'
  | 'settings'
  | 'user'
  | 'shield'
  | 'activity'
  | 'bell';

export type NavGroupId = 'workspace' | 'learning' | 'system';

export interface NavSection {
  id: AppPageId;
  /** The key its name is read from — the interface language decides the words, not this file. */
  labelKey: MessageKey;
  descriptionKey: MessageKey;
  icon: NavIconName;
  group: NavGroupId;
}

export const NAV_GROUPS: ReadonlyArray<{ id: NavGroupId; labelKey: MessageKey }> = [
  { id: 'workspace', labelKey: 'shell.group.workspace' },
  { id: 'learning', labelKey: 'shell.group.learning' },
  { id: 'system', labelKey: 'shell.group.system' },
];

/**
 * Order here matches the product page list; the sidebar renders by `group`, so
 * display order and declaration order stay independent.
 */
export const NAV_SECTIONS: readonly NavSection[] = [
  {
    id: 'dashboard',
    labelKey: 'shell.nav.dashboard.label',
    descriptionKey: 'shell.nav.dashboard.description',
    icon: 'gauge',
    group: 'workspace',
  },
  {
    id: 'agent',
    labelKey: 'shell.nav.agent.label',
    descriptionKey: 'shell.nav.agent.description',
    icon: 'sparkles',
    group: 'workspace',
  },
  {
    id: 'memory',
    labelKey: 'shell.nav.memory.label',
    descriptionKey: 'shell.nav.memory.description',
    icon: 'brain',
    group: 'workspace',
  },
  {
    id: 'research',
    labelKey: 'shell.nav.research.label',
    descriptionKey: 'shell.nav.research.description',
    icon: 'microscope',
    group: 'workspace',
  },
  {
    id: 'journal',
    labelKey: 'shell.nav.journal.label',
    descriptionKey: 'shell.nav.journal.description',
    icon: 'journal',
    group: 'workspace',
  },
  {
    id: 'portfolio',
    labelKey: 'shell.nav.portfolio.label',
    descriptionKey: 'shell.nav.portfolio.description',
    icon: 'pie-chart',
    group: 'workspace',
  },
  {
    id: 'evaluation',
    labelKey: 'shell.nav.evaluation.label',
    descriptionKey: 'shell.nav.evaluation.description',
    icon: 'blocks',
    group: 'workspace',
  },
  {
    id: 'academy',
    labelKey: 'shell.nav.academy.label',
    descriptionKey: 'shell.nav.academy.description',
    icon: 'graduation',
    group: 'learning',
  },
  {
    id: 'exams',
    labelKey: 'shell.nav.exams.label',
    descriptionKey: 'shell.nav.exams.description',
    icon: 'clipboard',
    group: 'learning',
  },
  {
    id: 'lab',
    labelKey: 'shell.nav.lab.label',
    descriptionKey: 'shell.nav.lab.description',
    icon: 'flask',
    group: 'workspace',
  },
  {
    id: 'activity',
    labelKey: 'shell.nav.activity.label',
    descriptionKey: 'shell.nav.activity.description',
    icon: 'activity',
    group: 'system',
  },
  {
    id: 'usage',
    labelKey: 'shell.nav.usage.label',
    descriptionKey: 'shell.nav.usage.description',
    icon: 'coins',
    group: 'system',
  },
  {
    id: 'profile',
    labelKey: 'shell.nav.profile.label',
    descriptionKey: 'shell.nav.profile.description',
    icon: 'user',
    group: 'system',
  },
  {
    id: 'settings',
    labelKey: 'shell.nav.settings.label',
    descriptionKey: 'shell.nav.settings.description',
    icon: 'settings',
    group: 'system',
  },
];

/**
 * One section of the navigation as it is drawn: a declared group and the entries that belong to it.
 */
export interface NavGroupModel {
  readonly id: NavGroupId;
  readonly labelKey: MessageKey;
  readonly items: readonly NavSection[];
}

/**
 * The navigation in *display* order — the groups above, each carrying its own entries.
 *
 * This is the one place that decides which entries sit under which heading and in what order the
 * headings themselves appear, and every surface that draws the navigation renders this rather than
 * filtering `NAV_SECTIONS` for itself. It also keeps the two orders that legitimately differ from
 * colliding: `NAV_SECTIONS` is held to product-page order (`NAV_SECTIONS.map(id) === APP_PAGE_IDS`,
 * asserted in `tests/frontend-shell.test.ts`), which is why `lab` is declared after `exams` and
 * still belongs to the workspace group — the declaration order is the product's, and this is the
 * reader's.
 *
 * Stable identity, computed once: it is derived from two frozen declarations, so drawing it does
 * not allocate a new tree on every render.
 */
export const NAV_MODEL: readonly NavGroupModel[] = NAV_GROUPS.map((group) => ({
  id: group.id,
  labelKey: group.labelKey,
  items: NAV_SECTIONS.filter((section) => section.group === group.id),
}));

export function findNavSection(id: AppPageId): NavSection {
  const section = NAV_SECTIONS.find((item) => item.id === id);
  if (!section) throw new Error(`Unknown navigation section: ${id}`);
  return section;
}

/** One crumb of a page's contextual trail — the position, never the route. */
export interface NavCrumb {
  /**
   * A string, deliberately wider than the section and group ids: a *deeper* trail's crumbs are
   * not places the navigation model knows about (a recommendation, a study, a lesson), so their
   * identity is the caller's to name. The model's own crumbs still carry real ids.
   */
  readonly id: string;
  /** The key the crumb's name is read from — the interface language decides the words. */
  readonly labelKey: MessageKey;
  /**
   * Whether a real destination sits behind the crumb.
   *
   * The shell is path-less by decision (Phase 8.2.4): sections are states, not addresses, and the
   * only real hierarchy today is the sidebar's own group → section — a heading, not a place. So a
   * group crumb is context (navigable: false), and a section crumb is where the reader *is* rather
   * than a link to follow. A future detail page — Portfolio → Recommendation → Detail — hands the
   * trail its own crumb with a real destination behind it, and this flag is what lets the
   * breadcrumb render that one as navigable without turning every label into a button.
   */
  readonly navigable: boolean;
}

/**
 * The contextual trail a section sits at the end of, from the navigation model itself.
 *
 * One home, on purpose: the trail is *derived* from the group the section already belongs to, so
 * there is no second hierarchy to keep in step with the sidebar, and no page carries its own
 * breadcrumb data. The section crumb is last, the group crumb before it — the same order the rail
 * draws them in, read from the same declaration. A deeper trail (Section → Subsection → Detail)
 * composes this with the extra crumbs *prepended before* the section's, so the group stays the
 * outermost context and the current place stays the last word.
 */
export function navTrail(id: AppPageId): readonly NavCrumb[] {
  const section = findNavSection(id);
  const group = NAV_GROUPS.find((item) => item.id === section.group);
  if (!group) throw new Error(`Unknown navigation group: ${section.group}`);
  return [
    { id: group.id, labelKey: group.labelKey, navigable: false },
    { id: section.id, labelKey: section.labelKey, navigable: false },
  ];
}

/**
 * Extend a section's trail with a deeper context, for the detail pages a later phase adds.
 *
 * The extension goes *after* the section crumb, because the section is the parent the reader came
 * from — `Portfolio → Recommendation → Detail` reads outward-in, the same direction the trail
 * already reads. Nothing here creates a page or a route: the caller hands the crumbs, and the
 * function only guarantees the section's own context stays ahead of them.
 */
export function extendNavTrail(id: AppPageId, deeper: readonly NavCrumb[]): readonly NavCrumb[] {
  return [...navTrail(id), ...deeper];
}

/** Shown in the topbar: the user must never mistake preview data for real data. */
export function previewNotice(): string {
  return msg('shell.previewNotice');
}

/** The name of the primary navigation landmark, in the interface language. */
export function navAriaLabel(): string {
  return msg('shell.navPrimary');
}
