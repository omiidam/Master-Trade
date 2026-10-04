import { msg } from '../i18n/index.js'; /**
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
  /** The attribute the theme is selected by, on the document element. */
  attribute: string;
  notes: string;
}

/**
 * The themes, and the only two.
 *
 * Both are the *same* token names: `[data-theme='light']` in `global.css` redeclares every colour
 * `@theme` declares and nothing more, which is what makes them interchangeable through one API
 * rather than two. A component written today against `--color-surface` renders correctly in both
 * without naming either, and a component written tomorrow inherits both for free.
 *
 * The selector is an *attribute*, not a class, for the reason the language preference is keyed off
 * `:lang(fa)` rather than `[dir='rtl']`: the theme is a stated fact about the surface, and an
 * attribute is the thing a stylesheet, a test and a support conversation can all point at.
 */
export const THEMES: readonly ThemeDefinition[] = [
  {
    id: 'master-trade-dark',
    name: 'Workstation Dark',
    mode: 'dark',
    attribute: 'dark',
    get notes() {
      return msg('tokens.premiumDarkFintechThemeLightThemeDeferredTokens');
    },
  },
  {
    id: 'master-trade-light',
    name: 'Workstation Light',
    mode: 'light',
    attribute: 'light',
    get notes() {
      return msg('tokens.premiumDarkFintechThemeLightThemeDeferredTokens');
    },
  },
];

/** The theme the product opens in. */
export const DEFAULT_THEME_ID = 'master-trade-dark';

/**
 * The neutral ladder, in the order a reader meets it.
 *
 * Settings shows these as live swatches rather than the palette's old five accent chips, because
 * after Phase 9 the accent chips would have been five greys in a row and the neutral ladder is the
 * honest answer to "what colours is this?". The list is read from the stylesheet at render time
 * through `var(--…)`, so it follows the active theme without knowing which one is active.
 */
export const THEME_LADDER: readonly string[] = [
  '--color-bg',
  '--color-surface',
  '--color-surface-raised',
  '--color-border',
  '--color-text-muted',
  '--color-text',
] as const;

/** What the palette is, in one sentence, for the reader rather than for a reviewer. */
export const THEME_NOTES = (() => {
  try {
    return msg('tokens.premiumDarkFintechThemeLightThemeDeferredTokens');
  } catch {
    return 'Grayscale only: every surface, ink and state is a step on one lightness axis.';
  }
})();

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
    get summary(): string {
      return msg('tokens.semanticSurfacesTextBordersStateColoursAndTheir');
    },
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
    get summary(): string {
      return msg('tokens.interfaceAndNumericFontStacksTheWeightedType');
    },
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
    get summary(): string {
      return msg('tokens.theResponsiveLadderPhoneLandscapeTabletDesktopWide');
    },
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
    get summary(): string {
      return msg('tokens.radiiByTheKindOfSurfaceMarkInset');
    },
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
    get summary(): string {
      return msg('tokens.durationsAndEasingsComponentsMustHonorPrefersReduced');
    },
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
    get summary(): string {
      return msg('tokens.layeringForShellChromeDropdownsModalsToastsAnd');
    },
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
  {
    token: 'sm',
    rem: 40,
    px: 640,
    get device(): string {
      return msg('tokens.phoneLandscape');
    },
  },
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
    get usage(): string {
      return msg('tokens.wellsAndInsetsCodeLogTailsEmptyPanes');
    },
  },
  {
    level: 1,
    name: 'panel',
    shadow: '--shadow-panel',
    surface: '--color-surface',
    get usage(): string {
      return msg('tokens.theDefaultCard');
    },
  },
  {
    level: 2,
    name: 'overlay',
    shadow: '--shadow-popover',
    surface: '--color-surface-raised',
    get usage(): string {
      return msg('tokens.menusPopoversAndTheModalPanel');
    },
  },
  {
    level: 3,
    name: 'emphasis',
    shadow: '--shadow-glow',
    surface: '--color-primary-soft',
    get usage(): string {
      return msg('tokens.theOneAccentSurfaceOnAScreenThat');
    },
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
 * Every colour the stylesheet may declare, for the grayscale contract to check.
 *
 * **This is the list that makes "grayscale only" a fact rather than an intention.** The old
 * `NEUTRAL_AXIS` named ten neutral tokens and left the six accent families, their wells and their
 * rims entirely unchecked — a brand cyan and a danger red both passed, because the contract was
 * only ever about the *background*. This list names every `--color-*` declaration in `@theme`, so
 * the suite walks the whole palette and fails on the first one that acquires a hue.
 *
 * The one thing deliberately absent is the *values*: they live in `web/src/styles/global.css` and
 * are read from there, which is the point of a single source of truth — this file cannot assert a
 * palette is grey if it is not the file that declares the palette.
 */
export const THEME_COLOR_TOKENS: readonly string[] = [
  // Surfaces.
  '--color-bg',
  '--color-bg-elevated',
  '--color-surface',
  '--color-surface-raised',
  '--color-surface-sunken',
  // Edges and ink.
  '--color-border',
  '--color-border-strong',
  '--color-text',
  '--color-text-muted',
  '--color-text-faint',
  // The brand, and each of its well and rim.
  '--color-primary',
  '--color-primary-strong',
  '--color-primary-fg',
  '--color-primary-soft',
  '--color-primary-soft-hover',
  '--color-primary-border',
  // The five states, and each of their wells and rims.
  '--color-info',
  '--color-info-soft',
  '--color-info-border',
  '--color-success',
  '--color-success-soft',
  '--color-success-border',
  '--color-warning',
  '--color-warning-soft',
  '--color-warning-border',
  '--color-danger',
  '--color-danger-strong',
  '--color-danger-fg',
  '--color-danger-soft',
  '--color-danger-border',
  '--color-ai',
  '--color-ai-soft',
  '--color-ai-border',
  '--color-focus',
] as const;

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
  /**
   * Where this family's ink sits on the lightness axis, 0 (black) to 1 (white) — and the reason
   * this field replaced the `hue` and `relationship` it used to carry.
   *
   * A hue is the one thing a grayscale palette cannot have: a 0%-saturation grey has no hue to
   * record, so `hue: 190` on `#e8e8e8` would be a number about nothing, and a test that re-derived
   * it from the stylesheet would be checking that a fiction stayed fictional. What *is* real, and
   * what now has to carry the load hue used to, is the position on the single remaining axis: the
   * suite reads this, reads the stylesheet, and holds the two together — which is what keeps a
   * state from quietly collapsing onto its neighbour now that colour can no longer tell them apart.
   */
  lightness: number;
}

export const ACCENT_FAMILIES: readonly AccentFamily[] = [
  {
    role: 'brand',
    base: '--color-primary',
    soft: '--color-primary-soft',
    border: '--color-primary-border',
    // The brightest ink on the axis. In a coloured palette the brand was the loudest hue; here it
    // is simply the top of the value scale, and a filled primary control is a near-white block.
    lightness: 0.91,
  },
  {
    role: 'information',
    base: '--color-info',
    soft: '--color-info-soft',
    border: '--color-info-border',
    lightness: 0.72,
  },
  {
    role: 'reasoning',
    base: '--color-ai',
    soft: '--color-ai-soft',
    border: '--color-ai-border',
    lightness: 0.81,
  },
  {
    role: 'confirmation',
    base: '--color-success',
    soft: '--color-success-soft',
    border: '--color-success-border',
    // The old comment here was about moving confirmation *seven* degrees off the brand, so that
    // one hue could not wear two names. That defect cannot recur by hue, and the suite below now
    // prevents it the only way that still means something: no two state inks may sit within
    // `MIN_LIGHTNESS_SEPARATION` of one another.
    lightness: 0.62,
  },
  {
    role: 'caution',
    base: '--color-warning',
    soft: '--color-warning-soft',
    border: '--color-warning-border',
    lightness: 0.59,
  },
  {
    role: 'loss',
    base: '--color-danger',
    soft: '--color-danger-soft',
    border: '--color-danger-border',
    // Darker than the caution above it, and *not* because dark means bad: it is the one state that
    // owns a filled destructive surface, and a dark fill is what lets `--color-danger-fg` be a
    // light label. The ordering is a typographic decision, and it is stated here so that the next
    // person to reach for a red does not mistake it for a semantic ranking.
    lightness: 0.64,
  },
];

/**
 * The grayscale contract: how close to grey a theme colour is allowed to be, in *both* themes.
 *
 * This replaces the hue-band axis the palette used to be held to, and it is a strictly stronger
 * rule rather than a looser one. The old contract said the neutrals shared a narrow hue band; it
 * said nothing at all about the six accent families, which were free to be any colour on the
 * wheel. This one covers **every** colour token the stylesheet declares — neutrals, states,
 * aliases and all — and forbids hue on any of them.
 *
 * The ceiling is 3% saturation rather than 0, and the reason is one of the brief's own values:
 * `#111212`, the named primary background, is *one 255th* of blue away from neutral — 17, 18, 18 —
 * which HSL puts at 2.9% only because it is measured on such a dark value. Rather than round the
 * brief's number out of the record, the contract is set where the brief's own palette already sits.
 * It is still tight enough that the rule has teeth: `#3a4447`, the secondary surface the brief
 * also names, measured 10% and was therefore rewritten as `#404040`, and anything a reader could
 * actually see as a colour is far outside 3%.
 */
export const MAX_THEME_SATURATION = 3;

/**
 * How far apart two state inks have to be, in relative luminance, to be told apart.
 *
 * This is the successor to `MIN_HUE_SEPARATION`, and it exists because losing hue transfers a job
 * to it. Twenty degrees of hue gap used to mean "these two are different colours"; twenty thousandths
 * of relative luminance now has to mean "these two are different greys". The suite holds every
 * family against every other, so two states cannot collapse into the same block of the palette
 * just because nothing coloured them apart any more.
 */
export const MIN_LIGHTNESS_SEPARATION = 0.02;

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
    get means(): string {
      return msg('tokens.aGainAPassAThingThatWent');
    },
  },
  {
    state: 'negative',
    ink: '--color-danger',
    fill: '--color-danger-soft',
    edge: '--color-danger-border',
    get means(): string {
      return msg('tokens.aLossAFailAThingThatDid');
    },
  },
  {
    state: 'neutral',
    ink: '--color-text',
    get means(): string {
      return msg('tokens.aFigureWithNoDirectionACountA');
    },
  },
  {
    state: 'warning',
    ink: '--color-warning',
    fill: '--color-warning-soft',
    edge: '--color-warning-border',
    get means(): string {
      return msg('tokens.attentionIsDueAndNoOutcomeHasBeen');
    },
  },
  {
    state: 'information',
    ink: '--color-info',
    fill: '--color-info-soft',
    edge: '--color-info-border',
    get means(): string {
      return msg('tokens.contextProvenanceScopeAStatedLimitation');
    },
  },
  {
    state: 'error',
    ink: '--color-danger',
    fill: '--color-danger-soft',
    edge: '--color-danger-border',
    get means(): string {
      return msg('tokens.somethingThatWasAskedForCouldNotBe');
    },
  },
  {
    state: 'active',
    ink: '--color-primary',
    get means(): string {
      return msg('tokens.theThingCurrentlyInViewOrTheOne');
    },
  },
  {
    state: 'inactive',
    ink: '--color-text-muted',
    get means(): string {
      return msg('tokens.presentAndReadableButNotTheCurrentThing');
    },
  },
  {
    state: 'selected',
    ink: '--color-primary',
    fill: '--color-primary-soft',
    edge: '--color-primary-border',
    get means(): string {
      return msg('tokens.theOptionTheReaderHasChosen');
    },
  },
  {
    state: 'unselected',
    ink: '--color-text-muted',
    edge: '--color-border',
    get means(): string {
      return msg('tokens.anOptionThatIsOfferedAndNotChosen');
    },
  },
  {
    state: 'unavailable',
    ink: '--color-text-faint',
    edge: '--color-border',
    get means(): string {
      return msg('tokens.notOfferedInThisStateByPermissionOr');
    },
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
  {
    get subject(): string {
      return msg('tokens.bodyTextOnThePage');
    },
    ink: '--color-text',
    ground: '--color-bg',
    min: 7,
  },
  {
    get subject(): string {
      return msg('tokens.bodyTextOnACard');
    },
    ink: '--color-text',
    ground: '--color-surface',
    min: 7,
  },
  {
    get subject(): string {
      return msg('tokens.bodyTextOnARaisedCard');
    },
    ink: '--color-text',
    ground: '--color-surface-raised',
    min: 7,
  },
  {
    get subject(): string {
      return msg('tokens.secondaryText');
    },
    ink: '--color-text-muted',
    ground: '--color-surface',
    min: 4.5,
  },
  {
    get subject(): string {
      return msg('tokens.secondaryTextOnARaisedCard');
    },
    ink: '--color-text-muted',
    ground: '--color-surface-raised',
    min: 4.5,
  },
  {
    get subject(): string {
      return msg('tokens.annotationText');
    },
    ink: '--color-text-faint',
    ground: '--color-surface',
    min: 4.5,
  },
  {
    get subject(): string {
      return msg('tokens.annotationTextOnARaisedCard');
    },
    ink: '--color-text-faint',
    ground: '--color-surface-raised',
    min: 4.5,
  },
  {
    get subject(): string {
      return msg('tokens.annotationTextInAWell');
    },
    ink: '--color-text-faint',
    ground: '--color-surface-sunken',
    min: 4.5,
  },
  {
    get subject(): string {
      return msg('tokens.brandTextOnACard');
    },
    ink: '--color-primary',
    ground: '--color-surface',
    min: 4.5,
  },
  {
    get subject(): string {
      return msg('tokens.inkOnAFilledAccentControl');
    },
    ink: '--color-primary-fg',
    ground: '--color-primary-strong',
    min: 4.5,
  },
  {
    get subject(): string {
      return msg('tokens.inkOnAFilledDestructiveControl');
    },
    ink: '--color-danger-fg',
    ground: '--color-danger-strong',
    min: 4.5,
  },
  {
    get subject(): string {
      return msg('tokens.unavailableText');
    },
    ink: '--color-text-faint',
    ground: '--color-surface-raised',
    min: 3,
  },
  {
    get subject(): string {
      return msg('tokens.theFocusRing');
    },
    ink: '--color-focus',
    ground: '--color-surface',
    min: 3,
  },
  {
    get subject(): string {
      return msg('tokens.aCardEdge');
    },
    ink: '--color-border',
    ground: '--color-surface',
    min: 1.15,
  },
  {
    get subject(): string {
      return msg('tokens.aStrongEdge');
    },
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
