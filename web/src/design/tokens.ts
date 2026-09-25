/**
 * Design token manifest — the single list of theme variables this UI may use.
 *
 * The values live in `web/src/styles/global.css` (Tailwind v4 `@theme`). This
 * file is the inventory: `tests/frontend-shell.test.ts` and
 * `tests/frontend-design-foundations.test.ts` assert every variable declared
 * here is actually declared in the theme, so a component cannot rely on a token
 * the theme does not define.
 *
 * Kept dependency-free on purpose: it is imported by tests, by the app and by
 * nothing else.
 *
 * Phase 7.1 turned this from a list of colour names into the design foundation:
 * every family a screen is allowed to reach for — colour, type, spacing,
 * breakpoints, radius, elevation, gradients — is named here and declared there,
 * and the ladders below (`TYPE_SCALE`, `SPACING_SCALE`, `BREAKPOINTS`,
 * `ELEVATION`) record the *order* as well as the members, so "one step larger"
 * is a fact the suite can check rather than a judgement a reviewer has to make.
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

/**
 * The families, in the order the stylesheet declares them.
 *
 * The order is part of the contract: the suite asserts this list equals
 * `TOKEN_GROUPS.map((group) => group.group)`, so a family cannot be added to one
 * and forgotten in the other.
 */
export const REQUIRED_TOKEN_GROUPS = [
  'color',
  'typography',
  'spacing',
  'breakpoint',
  'radius',
  'shadow',
  'gradient',
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
      'Semantic surfaces, text, borders, state colours and their borders (plus provenance/epistemic colours).',
    variables: [
      '--color-bg',
      '--color-bg-elevated',
      '--color-surface',
      '--color-surface-raised',
      '--color-surface-sunken',
      '--color-overlay',
      '--color-border',
      '--color-border-strong',
      '--color-text',
      '--color-text-muted',
      '--color-text-faint',
      '--color-primary',
      '--color-primary-strong',
      '--color-primary-fg',
      '--color-primary-soft',
      '--color-primary-soft-hover',
      '--color-info',
      '--color-info-soft',
      '--color-success',
      '--color-success-soft',
      '--color-warning',
      '--color-warning-soft',
      '--color-danger',
      '--color-danger-strong',
      '--color-danger-fg',
      '--color-danger-soft',
      '--color-ai',
      '--color-ai-soft',
      '--color-primary-border',
      '--color-success-border',
      '--color-info-border',
      '--color-warning-border',
      '--color-danger-border',
      '--color-ai-border',
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
    summary:
      'Interface and numeric font stacks, the weighted type scale, and the weight ladder it draws on.',
    variables: [
      '--font-sans',
      '--font-mono',
      // The Persian/Arabic stack (Phase 7.5.1). A family of its own rather than a fallback in
      // `--font-sans`, and applied by `:lang(fa)` rather than by direction — see the stylesheet.
      '--font-fa',
      '--font-weight-normal',
      '--font-weight-medium',
      '--font-weight-semibold',
      '--font-weight-bold',
      '--text-micro',
      '--text-caption',
      '--text-body',
      '--text-title',
      '--text-figure',
      '--text-subheading',
      '--text-heading',
      '--text-metric',
      '--text-display',
    ],
  },
  {
    group: 'spacing',
    summary:
      'The named spacing scale every layout gap, pad and inset is chosen from. Deliberately ' +
      'not in Tailwind’s `--spacing-*` namespace, which redefines size utilities.',
    variables: [
      '--space-hairline',
      '--space-tight',
      '--space-snug',
      '--space-inline',
      '--space-block',
      '--space-group',
      '--space-panel',
      '--space-section',
      '--space-frame',
      '--space-band',
    ],
  },
  {
    group: 'breakpoint',
    summary:
      'The responsive ladder: phone landscape, tablet, desktop, wide and ultrawide, in that order.',
    variables: [
      '--breakpoint-sm',
      '--breakpoint-md',
      '--breakpoint-lg',
      '--breakpoint-xl',
      '--breakpoint-2xl',
    ],
  },
  {
    group: 'radius',
    summary:
      'Radii by the kind of surface: mark, inset tile, control, selectable tile, panel, pill.',
    variables: [
      '--radius-mark',
      '--radius-inset',
      '--radius-control',
      '--radius-tile',
      '--radius-panel',
      '--radius-pill',
    ],
  },
  {
    group: 'shadow',
    summary:
      'Surface elevation, the reserved glow roles, and the control-depth shadows a pressable ' +
      'control rests on.',
    variables: [
      '--shadow-panel',
      '--shadow-plate',
      '--shadow-frame',
      '--shadow-popover',
      '--shadow-glow',
      '--shadow-glow-control',
      '--shadow-glow-danger',
      '--shadow-control',
      '--shadow-control-inset',
      '--shadow-control-raised',
    ],
  },
  {
    group: 'gradient',
    summary:
      'The panel sheen, the corner light and the lit lintel, the loading sweep, the three control ' +
      'faces, the lit edge and its under-lit inverse, the overlay veil, the composer frame and the ' +
      'agent card’s under-light. Structural, never decorative.',
    variables: [
      '--gradient-panel',
      '--gradient-corner',
      '--gradient-lintel',
      '--gradient-sheen',
      '--gradient-control',
      '--gradient-accent',
      '--gradient-danger-fill',
      '--gradient-edge',
      '--gradient-edge-under',
      '--gradient-veil',
      '--gradient-ring',
      '--gradient-specular',
      '--gradient-agent-glow',
      '--gradient-agent-ring',
      '--gradient-agent-sheen',
    ],
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
    summary: 'Layering for shell chrome, dropdowns, modals, toasts and tooltips.',
    variables: ['--z-shell', '--z-overlay', '--z-modal', '--z-toast', '--z-tooltip'],
  },
];

/** Every token variable the UI may reference, flattened. */
export const ALL_TOKEN_VARIABLES: readonly string[] = TOKEN_GROUPS.flatMap(
  (group) => group.variables,
);

/**
 * A step in the type scale.
 *
 * `weighted` marks the figure steps: the ones that pair a line height and a weight with the size,
 * because a figure must not wrap and must not drift. The unweighted steps are running text and
 * deliberately inherit the body's 1.55 — see the comment in `global.css`.
 */
export interface TypeStep {
  token: string;
  /** The CSS variable holding the size. */
  size: string;
  rem: number;
  weighted: boolean;
  /** What the product renders at this step. */
  role: string;
}

/** The type scale, smallest first. */
export const TYPE_SCALE: readonly TypeStep[] = [
  { token: 'micro', size: '--text-micro', rem: 0.625, weighted: false, role: 'dense annotations' },
  { token: 'caption', size: '--text-caption', rem: 0.6875, weighted: false, role: 'labels, hints' },
  { token: 'body', size: '--text-body', rem: 0.875, weighted: false, role: 'running text' },
  { token: 'title', size: '--text-title', rem: 1.0625, weighted: false, role: 'card titles' },
  { token: 'figure', size: '--text-figure', rem: 1.125, weighted: true, role: 'panel figures' },
  {
    token: 'subheading',
    size: '--text-subheading',
    rem: 1.25,
    weighted: true,
    role: 'section figures',
  },
  {
    token: 'heading',
    size: '--text-heading',
    rem: 1.375,
    weighted: false,
    role: 'the page header',
  },
  { token: 'metric', size: '--text-metric', rem: 1.5, weighted: true, role: 'stat figures' },
  {
    token: 'display',
    size: '--text-display',
    rem: 1.75,
    weighted: true,
    role: 'the largest figure',
  },
];

/**
 * The spacing scale, smallest first.
 *
 * Named by role, and declared as `--space-*` rather than `--spacing-*`. That is not a preference:
 * Tailwind turns every named `--spacing-*` entry into a utility and reads the namespace as an
 * input to every sizing family, so a step called `3xl` redefines `max-w-3xl`, and a step called
 * `block` overwrites the `inline-block` *display* utility. Both mistakes were made and caught by
 * the phone-width lay-out suite; `tests/frontend-design-foundations.test.ts` now keeps the
 * `--spacing-*` namespace empty.
 */
export interface SpacingStep {
  token: string;
  rem: number;
  role: string;
}

export const SPACING_SCALE: readonly SpacingStep[] = [
  { token: 'hairline', rem: 0.125, role: 'the thinnest separation: a mark from its label' },
  { token: 'tight', rem: 0.25, role: 'inside a control, between an icon and its text' },
  { token: 'snug', rem: 0.5, role: 'between related items in one row' },
  { token: 'inline', rem: 0.75, role: 'the default horizontal gap' },
  { token: 'block', rem: 1, role: 'the default vertical gap' },
  { token: 'group', rem: 1.5, role: 'between groups inside a panel' },
  { token: 'panel', rem: 2, role: 'panel padding and the outer inset of a surface' },
  { token: 'section', rem: 3, role: 'between page sections' },
  { token: 'frame', rem: 4, role: 'the page frame’s outer rhythm' },
  { token: 'band', rem: 6, role: 'a full-width band or an empty-state well' },
];

/**
 * The namespace the spacing scale must stay out of.
 *
 * Tailwind resolves a *named* size against `--spacing-*` in every sizing family — including the
 * logical `inline-*` one, where a name like `block` silently becomes a width on the static
 * `inline-block` display utility. The suite asserts the namespace holds no named entries.
 */
export const TAILWIND_SPACING_NAMESPACE = '--spacing';

/** The namespace the product's own scale lives in, which Tailwind leaves alone. */
export const SPACING_NAMESPACE = '--space';

/**
 * The responsive ladder.
 *
 * `device` is the product decision, not a Tailwind default: these three widths are the ones the
 * screens are designed at, and a fourth (`wide`) is where the shell stops growing.
 */
export interface Breakpoint {
  token: string;
  rem: number;
  px: number;
  device: string;
}

export const BREAKPOINTS: readonly Breakpoint[] = [
  { token: 'sm', rem: 40, px: 640, device: 'phone landscape' },
  { token: 'md', rem: 48, px: 768, device: 'tablet' },
  { token: 'lg', rem: 64, px: 1024, device: 'desktop' },
  { token: 'xl', rem: 80, px: 1280, device: 'wide' },
  { token: '2xl', rem: 96, px: 1536, device: 'ultrawide' },
];

/**
 * The depth ladder.
 *
 * Each level names the shadow that carries it and the surface it is meant to sit on, so "which
 * shadow for this?" has one answer instead of a per-component judgement. Level 0 is the page
 * itself, which has no shadow at all — a level, not an omission.
 */
export interface ElevationLevel {
  level: 0 | 1 | 2 | 3;
  name: string;
  /** `null` at level 0, where the surface is flush with the page. */
  shadow: string | null;
  surface: string;
  /** What the product puts here. */
  usage: string;
}

export const ELEVATION: readonly ElevationLevel[] = [
  {
    level: 0,
    name: 'flat',
    shadow: null,
    surface: '--color-surface-sunken',
    usage: 'wells and insets: code, log tails, empty panes',
  },
  {
    level: 1,
    name: 'panel',
    shadow: '--shadow-panel',
    surface: '--color-surface',
    usage: 'the default card',
  },
  {
    level: 2,
    name: 'overlay',
    shadow: '--shadow-popover',
    surface: '--color-surface-raised',
    usage: 'menus, popovers and the modal panel',
  },
  {
    level: 3,
    name: 'emphasis',
    shadow: '--shadow-glow',
    surface: '--color-primary-soft',
    usage: 'the one accent surface on a screen that asks to be acted on',
  },
];

/**
 * The glow roles, and what each is allowed to light.
 *
 * Reserved deliberately, and by *role* rather than by count: glow is the strongest emphasis the
 * theme has, so every glow must answer "which decision is this highlighting?". Phase 7.1 allowed
 * the brand accent and the primary control. Phase 7.2 adds exactly one — the destructive action —
 * because "this cannot be undone" is a different decision from "do this", and a filled red control
 * with the same shadow as a filled green one reads as the same weight. There is no fourth role,
 * and `GLOW_ROLES` is what the suite reads, so a decorative glow cannot be added quietly.
 */
export const GLOW_TOKENS = {
  accent: '--shadow-glow',
  control: '--shadow-glow-control',
  danger: '--shadow-glow-danger',
} as const;

/** The glow roles as a list, so a test can assert the reservation has no stray members. */
export const GLOW_ROLES: readonly string[] = Object.keys(GLOW_TOKENS);

/**
 * Control depth: how a pressable surface sits in the plane, as opposed to how a panel stacks.
 *
 * `resting` is the shadow under a control at rest, `litEdge` is the inset highlight that lights
 * its top edge, and `raised` is the same control picked up (hover, or the top of a press). Kept
 * separate from `ELEVATION` on purpose: a button on a card is not a third surface, and folding
 * these into the elevation ladder would make "level 4" mean something different from level 1–3.
 */
export const CONTROL_DEPTH = {
  resting: '--shadow-control',
  litEdge: '--shadow-control-inset',
  raised: '--shadow-control-raised',
} as const;

/**
 * The three control faces: the gradient behind each, and the utility that carries it.
 *
 * A control face is a background *gradient* rather than a flat fill, because a flat fill is what
 * makes an interface read as a generic dashboard — light from above is what makes a surface look
 * like something you press. The utility name is the contract: a component asks for
 * `control-accent`, never for a gradient, and the suite asserts every gradient here is the
 * `background-image` of its utility.
 */
export interface ControlFace {
  /** Which control this face belongs to. */
  role: string;
  gradient: string;
  utility: string;
}

export const CONTROL_FACES: readonly ControlFace[] = [
  { role: 'neutral', gradient: '--gradient-control', utility: 'control-sheen' },
  { role: 'accent', gradient: '--gradient-accent', utility: 'control-accent' },
  { role: 'danger', gradient: '--gradient-danger-fill', utility: 'control-danger' },
];

/* ------------------------------------------------------------------------ */
/* Phase 7.2.2 — colour harmony                                             */
/* ------------------------------------------------------------------------ */

/**
 * The neutral axis.
 *
 * Every surface, border and text step in the product is the same material: a blue-black whose hue
 * does not move, with lightness doing all the work. That is what makes depth read as distance from
 * the viewer rather than as a second colour creeping in — and it is a claim the suite can check,
 * because a hue that drifts is exactly how a palette becomes "a collection of colours" one edit at
 * a time. The saturation ceiling is what makes these neutrals rather than a tinted theme: at or
 * under 46% and this dark, none of them reads as a hue of its own.
 */
export const NEUTRAL_AXIS = {
  hue: [210, 222] as const,
  saturation: [10, 46] as const,
  tokens: [
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
  ],
} as const;

/**
 * A colour family: a base, the well and edge that go with it, and where it sits on the wheel.
 *
 * The `relationship` is the harmony decision, stated as the geometry the suite measures: the
 * distance from `BRAND_HUE`, so a declared relationship is a fact about the stylesheet rather than
 * a word in a comment.
 *
 *   brand          the accent the product commits with — the wheel's origin
 *   analogous      within 90 degrees of it: a neighbouring hue with a second job
 *   complementary  past 90 degrees: a hue that carries an outcome, so an outcome can never be
 *                  mistaken for the brand
 *
 * `role` carries the meaning, `relationship` carries the angle, and the two are separate on purpose:
 * a state can be analogous and still be unmistakable, which is exactly what confirmation is now.
 */
export interface AccentFamily {
  /** What the family is for, in one word the interface would use. */
  role: string;
  base: string;
  soft?: string;
  border?: string;
  relationship: 'brand' | 'analogous' | 'complementary';
  /** The hue the family is built on; the suite re-derives it from the stylesheet and compares. */
  hue: number;
}

export const ACCENT_FAMILIES: readonly AccentFamily[] = [
  {
    role: 'brand',
    base: '--color-primary',
    soft: '--color-primary-soft',
    border: '--color-primary-border',
    relationship: 'brand',
    hue: 190,
  },
  {
    role: 'information',
    base: '--color-info',
    soft: '--color-info-soft',
    border: '--color-info-border',
    relationship: 'analogous',
    hue: 215,
  },
  {
    role: 'reasoning',
    base: '--color-ai',
    soft: '--color-ai-soft',
    border: '--color-ai-border',
    relationship: 'analogous',
    hue: 258,
  },
  {
    role: 'confirmation',
    base: '--color-success',
    soft: '--color-success-soft',
    border: '--color-success-border',
    // Analogous rather than opposite, and that is the whole 7.2.2 story: confirmation used to sit
    // *seven* degrees from the brand, which made one hue wear two names. It is a neighbouring green
    // now, moved far enough round the wheel to read as its own colour while staying in the brand's
    // family — the `relationship` states the geometry, `role` states the job.
    relationship: 'analogous',
    hue: 152,
  },
  {
    role: 'caution',
    base: '--color-warning',
    soft: '--color-warning-soft',
    border: '--color-warning-border',
    relationship: 'complementary',
    hue: 38,
  },
  {
    role: 'loss',
    base: '--color-danger',
    soft: '--color-danger-soft',
    border: '--color-danger-border',
    relationship: 'complementary',
    hue: 2,
  },
];

/**
 * The brand's hue, and how far a semantic colour has to stay from it.
 *
 * Phase 7.2.2 moved the brand here because it was *seven* degrees from `--color-success` — two names
 * for one green, which is the failure mode this number exists to prevent. Twenty degrees is the
 * floor at which a state and the accent stop being confusable at a glance; the closest pair today
 * is information at twenty-five.
 */
export const BRAND_HUE = 190;
export const MIN_HUE_SEPARATION = 20;

/**
 * How the interface states a condition, and what each state is allowed to mean.
 *
 * One row per state, naming the token that carries it — so "which green is a gain?" has an answer
 * in a file rather than in whichever component happened to be written first. `fill` and `edge` are
 * present only where the state owns a surface of its own: a state that is only ever text does not
 * get to invent a panel.
 *
 * Colour is never the *only* signal. Every state here is also carried by a word, an icon or a sign,
 * which is why the rows are named after meanings (a gain, a caution) rather than after hues.
 */
export interface SemanticUsage {
  state: string;
  /** The token for the state's text, icon or mark. */
  ink: string;
  /** The recessed surface the state is stated on, where it has one. */
  fill?: string;
  /** The edge that pairs with the fill. */
  edge?: string;
  means: string;
}

export const SEMANTIC_USAGE: readonly SemanticUsage[] = [
  {
    state: 'positive',
    ink: '--color-success',
    fill: '--color-success-soft',
    edge: '--color-success-border',
    means: 'a gain, a pass, a thing that went the way it was meant to',
  },
  {
    state: 'negative',
    ink: '--color-danger',
    fill: '--color-danger-soft',
    edge: '--color-danger-border',
    means: 'a loss, a fail, a thing that did not',
  },
  {
    state: 'neutral',
    ink: '--color-text',
    means: 'a figure with no direction: a count, a size, a duration',
  },
  {
    state: 'warning',
    ink: '--color-warning',
    fill: '--color-warning-soft',
    edge: '--color-warning-border',
    means: 'attention is due, and no outcome has been recorded yet',
  },
  {
    state: 'information',
    ink: '--color-info',
    fill: '--color-info-soft',
    edge: '--color-info-border',
    means: 'context: provenance, scope, a stated limitation',
  },
  {
    state: 'error',
    ink: '--color-danger',
    fill: '--color-danger-soft',
    edge: '--color-danger-border',
    means: 'something that was asked for could not be done',
  },
  {
    state: 'active',
    ink: '--color-primary',
    means: 'the thing currently in view, or the one being acted on',
  },
  {
    state: 'inactive',
    ink: '--color-text-muted',
    means: 'present and readable, but not the current thing',
  },
  {
    state: 'selected',
    ink: '--color-primary',
    fill: '--color-primary-soft',
    edge: '--color-primary-border',
    means: 'the option the reader has chosen',
  },
  {
    state: 'unselected',
    ink: '--color-text-muted',
    edge: '--color-border',
    means: 'an option that is offered and not chosen',
  },
  {
    state: 'unavailable',
    ink: '--color-text-faint',
    edge: '--color-border',
    means: 'not offered in this state, by permission or by plan — not broken',
  },
];

/**
 * The legibility contract, as pairs and floors.
 *
 * Phase 7.1 asserted the ladders were *ordered*, which is necessary and not sufficient: a ladder can
 * be in the right order and every step on it unreadable. This is the other half — the contrast each
 * pair of tokens has to clear, so "the palette is legible" is a measurement rather than a claim.
 *
 * The floors are WCAG 2.1 AA: 4.5:1 for text, 3:1 for large text and for a non-text indicator (a
 * focus ring, a status edge). Two entries deliberately sit above AA — the interface's body text
 * clears AAA at 7:1, because a dark terminal is looked at for hours — and one sits below it on
 * purpose: disabled content is exempt from AA because it is not read, only recognised as
 * unavailable, and the floor there is that it stays *visible* against its ground.
 */
export interface ContrastRule {
  subject: string;
  ink: string;
  ground: string;
  min: number;
}

export const CONTRAST_RULES: readonly ContrastRule[] = [
  { subject: 'body text on the page', ink: '--color-text', ground: '--color-bg', min: 7 },
  { subject: 'body text on a card', ink: '--color-text', ground: '--color-surface', min: 7 },
  {
    subject: 'body text on a raised card',
    ink: '--color-text',
    ground: '--color-surface-raised',
    min: 7,
  },
  { subject: 'secondary text', ink: '--color-text-muted', ground: '--color-surface', min: 4.5 },
  {
    subject: 'secondary text on a raised card',
    ink: '--color-text-muted',
    ground: '--color-surface-raised',
    min: 4.5,
  },
  { subject: 'annotation text', ink: '--color-text-faint', ground: '--color-surface', min: 4.5 },
  {
    subject: 'annotation text on a raised card',
    ink: '--color-text-faint',
    ground: '--color-surface-raised',
    min: 4.5,
  },
  {
    subject: 'annotation text in a well',
    ink: '--color-text-faint',
    ground: '--color-surface-sunken',
    min: 4.5,
  },
  { subject: 'brand text on a card', ink: '--color-primary', ground: '--color-surface', min: 4.5 },
  {
    subject: 'ink on a filled accent control',
    ink: '--color-primary-fg',
    ground: '--color-primary-strong',
    min: 4.5,
  },
  {
    subject: 'ink on a filled destructive control',
    ink: '--color-danger-fg',
    ground: '--color-danger-strong',
    min: 4.5,
  },
  {
    subject: 'unavailable text',
    ink: '--color-text-faint',
    ground: '--color-surface-raised',
    min: 3,
  },
  { subject: 'the focus ring', ink: '--color-focus', ground: '--color-surface', min: 3 },
  {
    subject: 'a card edge',
    ink: '--color-border',
    ground: '--color-surface',
    min: 1.15,
  },
  {
    subject: 'a strong edge',
    ink: '--color-border-strong',
    ground: '--color-surface',
    min: 1.4,
  },
];

/**
 * The state inks, each measured against the well it is stated on.
 *
 * Derived from `SEMANTIC_USAGE` rather than written out again, so a state that gains a fill is
 * measured the moment it gains one — the suite reads this list, not a second copy of it.
 */
export const STATE_ON_FILL_RULES: readonly ContrastRule[] = SEMANTIC_USAGE.filter(
  (usage): usage is SemanticUsage & { fill: string } => usage.fill !== undefined,
).map((usage) => ({
  subject: `${usage.state} on its own well`,
  ink: usage.ink,
  ground: usage.fill,
  min: 4.5,
}));
