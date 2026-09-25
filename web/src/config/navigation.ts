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

export function findNavSection(id: AppPageId): NavSection {
  const section = NAV_SECTIONS.find((item) => item.id === id);
  if (!section) throw new Error(`Unknown navigation section: ${id}`);
  return section;
}

/** Shown in the topbar: the user must never mistake preview data for real data. */
export function previewNotice(): string {
  return msg('shell.previewNotice');
}

/** The name of the primary navigation landmark, in the interface language. */
export function navAriaLabel(): string {
  return msg('shell.navPrimary');
}
