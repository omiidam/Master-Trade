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
  label: string;
  description: string;
  icon: NavIconName;
  group: NavGroupId;
}

export const NAV_GROUPS: ReadonlyArray<{ id: NavGroupId; label: string }> = [
  { id: 'workspace', label: 'Workspace' },
  { id: 'learning', label: 'Learning' },
  { id: 'system', label: 'System' },
];

/**
 * Order here matches the product page list; the sidebar renders by `group`, so
 * display order and declaration order stay independent.
 */
export const NAV_SECTIONS: readonly NavSection[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    description: 'Training progress, study metrics and read-only charts',
    icon: 'gauge',
    group: 'workspace',
  },
  {
    id: 'agent',
    label: 'AI Workspace',
    description: 'Ask questions; every answer carries its evidence and uncertainty label',
    icon: 'sparkles',
    group: 'workspace',
  },
  {
    id: 'memory',
    label: 'Memory',
    description: 'What the agent may use, with a source and a trust state for every claim',
    icon: 'brain',
    group: 'workspace',
  },
  {
    id: 'research',
    label: 'Research',
    description: 'Experiments that test a proposed rule against evidence; adoption needs approval',
    icon: 'microscope',
    group: 'workspace',
  },
  {
    id: 'journal',
    label: 'Journal',
    description:
      'Record what you actually did: setups, risk, rule compliance, mistakes and the lesson taken from each trade',
    icon: 'journal',
    group: 'workspace',
  },
  {
    id: 'portfolio',
    label: 'Portfolio',
    description:
      'Declare what you hold and read the deterministic valuation: allocation, cost basis, concentration and exposure, with every gap named rather than filled',
    icon: 'pie-chart',
    group: 'workspace',
  },
  {
    id: 'academy',
    label: 'Academy',
    description: 'Curriculum and lessons across six months',
    icon: 'graduation',
    group: 'learning',
  },
  {
    id: 'exams',
    label: 'Exams',
    description: 'Assessments, rubric scoring and mistake review',
    icon: 'clipboard',
    group: 'learning',
  },
  {
    id: 'lab',
    label: 'Trading Lab',
    description: 'Review practice setups and deterministic risk math (read-only)',
    icon: 'flask',
    group: 'workspace',
  },
  {
    id: 'activity',
    label: 'Activity',
    description:
      'The live event stream and the background-task queue, with their provenance and their failures',
    icon: 'activity',
    group: 'system',
  },
  {
    id: 'usage',
    label: 'Usage',
    description:
      'Your plan, credit allowance and what each capability costs — with the refusals stated rather than hidden',
    icon: 'coins',
    group: 'system',
  },
  {
    id: 'profile',
    label: 'Profile',
    description:
      'What you have declared about your trading, with a source and a freshness state for every field',
    icon: 'user',
    group: 'system',
  },
  {
    id: 'settings',
    label: 'Settings',
    description: 'Appearance, direction, providers and safety status',
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
export const PREVIEW_NOTICE = 'Interface preview — mock data only, no backend or AI connected.';

export const NAV_ARIA_LABEL = 'Primary';
