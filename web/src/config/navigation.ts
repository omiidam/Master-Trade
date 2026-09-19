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
 * API adapter lands. `lab` has no backend capability yet — it is a training
 * surface, not a trading surface, and must stay read-only.
 */

export const APP_PAGE_IDS = ['dashboard', 'agent', 'academy', 'lab', 'settings'] as const;

export type AppPageId = (typeof APP_PAGE_IDS)[number];

export type NavIconName =
  'gauge' | 'sparkles' | 'graduation' | 'flask' | 'settings' | 'shield' | 'activity' | 'bell';

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
    id: 'academy',
    label: 'Academy',
    description: 'Curriculum, lessons and examinations across six months',
    icon: 'graduation',
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
