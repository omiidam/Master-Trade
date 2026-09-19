/**
 * Design token manifest — the single list of theme variables this UI may use.
 *
 * The values live in `web/src/styles/global.css` (Tailwind v4 `@theme`). This
 * file is the inventory: `tests/frontend-shell.test.ts` asserts every variable
 * declared here is actually declared in the theme, so a component cannot rely on
 * a token the theme does not define.
 *
 * Kept dependency-free on purpose: it is imported by tests, by the app and by
 * nothing else.
 */

export interface ThemeDefinition {
  id: string;
  name: string;
  mode: 'dark' | 'light';
  /** The product is a desktop workstation: no light theme in this phase. */
  notes: string;
}

export const THEME: ThemeDefinition = {
  id: 'master-trade-dark',
  name: 'Workstation Dark',
  mode: 'dark',
  notes:
    'Premium dark fintech theme. Light theme deferred; tokens are semantic so it can be added without touching components.',
};

export const REQUIRED_TOKEN_GROUPS = [
  'color',
  'typography',
  'radius',
  'shadow',
  'motion',
  'zIndex',
] as const;

export type TokenGroupId = (typeof REQUIRED_TOKEN_GROUPS)[number];

export interface TokenGroup {
  group: TokenGroupId;
  summary: string;
  /** CSS custom properties that must exist in web/src/styles/global.css. */
  variables: readonly string[];
}

export const TOKEN_GROUPS: readonly TokenGroup[] = [
  {
    group: 'color',
    summary:
      'Semantic surfaces, text, borders and state colors (plus provenance/epistemic colors).',
    variables: [
      '--color-bg',
      '--color-bg-elevated',
      '--color-surface',
      '--color-surface-raised',
      '--color-surface-sunken',
      '--color-border',
      '--color-border-strong',
      '--color-text',
      '--color-text-muted',
      '--color-text-faint',
      '--color-primary',
      '--color-primary-strong',
      '--color-primary-fg',
      '--color-primary-soft',
      '--color-info',
      '--color-info-soft',
      '--color-success',
      '--color-warning',
      '--color-warning-soft',
      '--color-danger',
      '--color-danger-soft',
      '--color-ai',
      '--color-ai-soft',
      '--color-fact',
      '--color-analysis',
      '--color-hypothesis',
      '--color-uncertainty',
      '--color-provenance-synthetic',
      '--color-provenance-historical',
      '--color-provenance-live',
      '--color-focus',
    ],
  },
  {
    group: 'typography',
    summary: 'Interface and numeric font stacks plus the type scale.',
    variables: ['--font-sans', '--font-mono', '--text-caption', '--text-body', '--text-title'],
  },
  {
    group: 'radius',
    summary: 'Control, panel and pill radii.',
    variables: ['--radius-control', '--radius-panel', '--radius-pill'],
  },
  {
    group: 'shadow',
    summary: 'Panel, popover and accent-glow elevation.',
    variables: ['--shadow-panel', '--shadow-popover', '--shadow-glow'],
  },
  {
    group: 'motion',
    summary: 'Durations and easings; components must honor prefers-reduced-motion.',
    variables: [
      '--duration-fast',
      '--duration-base',
      '--duration-slow',
      '--ease-standard',
      '--ease-emphasis',
    ],
  },
  {
    group: 'zIndex',
    summary: 'Layering for shell chrome, dropdowns, modals and tooltips.',
    variables: ['--z-shell', '--z-overlay', '--z-modal', '--z-tooltip'],
  },
];

/** Every token variable the UI may reference, flattened. */
export const ALL_TOKEN_VARIABLES: readonly string[] = TOKEN_GROUPS.flatMap(
  (group) => group.variables,
);
