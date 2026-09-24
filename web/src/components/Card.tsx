import { createContext, useContext, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../lib/cn';

/**
 * The card system.
 *
 * One surface, and a small closed set of ways it may differ — because the alternative, which is what
 * the tree looked like before Phase 7.2.2, is thirty cards that each restated the border, the fill
 * and the shadow and then drifted: a metric card with `p-4`, a panel with `p-3.5`, an inset tile
 * with `px-3 py-2` in fifty-seven places. Those are not variants, they are a copy of the system per
 * card.
 *
 * Four knobs, each answering a different question, and no combination of them is arbitrary:
 *
 *   tone      which **layer** is this?          a panel on the page, a panel inside a panel, a well
 *   variant   where does the light come from?   the ceiling (a panel) or the floor (a feature)
 *   emphasis  which card is the screen about?   stated in the border, never in a badge
 *   density   how much air does it get?         compact, cozy, spacious
 *
 * and one word, `surface`, that *names* a combination of those four rather than adding a fifth.
 *
 * ## What is *not* here
 *
 * There is no `variant="metric"` and no `variant="form"`. Density and emphasis already express both:
 * a metric card is a compact card with a figure in it, and a form is a panel with fields in it.
 * A variant is only worth adding when it changes the *surface* — when it puts the light somewhere
 * new — because that is the only thing a card cannot say with its content. That is the whole reason
 * `surface` exists and the whole reason it is not a knob: it does not add a property, it says which
 * combination of the four a kind of card is, so that "this is a metric card" means the same thing on
 * every screen instead of wherever the last page left it.
 */

/**
 * What the card is cut into: a panel on the page, a nested panel, or a recessed well.
 *
 * The three are surface *layers*, not three shadows. A well (`sunken`) is the inverse of a panel:
 * it is darker than what surrounds it and lit along its bottom edge instead of its top, which is
 * why it takes the inset stack and drops the lit edge rather than keeping a panel's face.
 */
export type CardTone = 'default' | 'raised' | 'sunken';

/**
 * Where the light on this surface comes from.
 *
 * `plain` is the product's default and every panel in it: lit from above, a highlight along the top
 * edge. `accent` is the under-lit surface — the accent pooled along the bottom of the card, the
 * light reading as coming off the floor — and it is the one treatment reserved for the card a
 * screen is asking you to act on. It is the same language the agent cards speak; what makes a card
 * read as *featured* is that the light moved, not that it got brighter.
 */
export type CardVariant = 'plain' | 'accent';

const TONES: Record<CardTone, string> = {
  default: 'bg-surface shadow-panel panel-gradient edge-highlight',
  raised: 'bg-surface-raised shadow-panel panel-gradient edge-highlight',
  sunken: 'bg-surface-sunken shadow-control-inset',
};

/**
 * The under-lit face.
 *
 * Deliberately a *replacement* for `panel-gradient edge-highlight`, not an addition to it: both are
 * `background-image`, so a card carrying both would show whichever one the stylesheet happened to
 * order last. `agent-glow` already contains its own floor lift, and `edge-under` draws the lit line
 * along the bottom instead of the top.
 */
const FLOOD = 'agent-glow edge-under';

/**
 * How much air a card gets.
 *
 * The steps exist because card *purpose* correlates with card density: a metric card that will be
 * read in a glance wants `compact`, an informational panel `cozy`, and the one card a screen is
 * built around `spacious`. The defaults are the values the product already used, so choosing a
 * density is a decision and not a restatement.
 */
export type CardDensity = 'compact' | 'cozy' | 'spacious';

interface DensityScale {
  header: string;
  /**
   * The band the header's rule sits in.
   *
   * The rule needs a step *above* it and the body's own top padding gives it one below, which is
   * what makes the reference's rhythm — title, a breath, the hairline, a breath, the contents —
   * come out even. It is a padding on a wrapper rather than a margin on the `hr` because `cn` is a
   * plain join: an `hr` carrying both the divider's own `m-0` and a caller's `mt-4` would leave the
   * winner to stylesheet order, and "the rule is 16px under the title" is not a fact that should
   * depend on which utility Tailwind happened to emit last.
   */
  rule: string;
  content: string;
  footer: string;
}

const DENSITY: Record<CardDensity, DensityScale> = {
  compact: { header: 'px-3 pt-3', rule: 'px-3 pt-3', content: 'px-3 py-3', footer: 'px-3 py-2' },
  cozy: { header: 'px-4 pt-4', rule: 'px-4 pt-4', content: 'px-4 py-4', footer: 'px-4 py-3' },
  spacious: {
    header: 'px-5 pt-5',
    rule: 'px-5 pt-5',
    content: 'px-5 py-5',
    footer: 'px-5 py-4',
  },
};

/**
 * The parts read the density from the card they are in.
 *
 * A context rather than a prop on every part, because the alternative is a card that says
 * `density="compact"` once and then has to say `px-3 py-3` on all three of its parts — which is how
 * the same number ends up written twice and drifting. A part may still override with its own
 * `className`; the density is the *default*, not a cage.
 */
const CardDensityContext = createContext<CardDensity>('cozy');

function useCardDensity(): CardDensity {
  return useContext(CardDensityContext);
}

export type CardEmphasis = 'none' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'ai';

/**
 * Which card on a screen is the one being asked about, said in the border rather than in a badge.
 *
 * `accent` is the only emphasis that carries the accent glow, and it is meant for the single card a
 * screen is organised around — the "your next step" panel, the selected plan. Everything else
 * states its tone with an edge and leaves the glow alone, because a grid of four glowing panels
 * has no emphasis at all. (Elevation level 3, `--shadow-glow`, is exactly this: *one* accent
 * surface that asks to be acted on.)
 */
const EMPHASIS_BORDER: Record<CardEmphasis, string> = {
  none: 'border-border',
  accent: 'border-primary-border',
  success: 'border-success-border',
  warning: 'border-warning-border',
  danger: 'border-danger-border',
  info: 'border-info-border',
  ai: 'border-ai-border',
};

/**
 * The same tones as fills, for a card that has to *be* the state rather than point at it.
 *
 * `emphasis` alone states a tone on the edge, which is right for a card in a grid of cards — the
 * fill belongs to the panel. But a refusal, a retry, an upgrade prompt is the state: it was a
 * `border-danger-border bg-danger-soft` literal in several places, and the two halves always moved
 * together because a warning fill without its edge is just a muddy panel. `wash` is that pair,
 * asked for once.
 */
const EMPHASIS_WASH: Record<CardEmphasis, string> = {
  none: '',
  accent: 'bg-primary-soft',
  success: 'bg-success-soft',
  warning: 'bg-warning-soft',
  danger: 'bg-danger-soft',
  info: 'bg-info-soft',
  ai: 'bg-ai-soft',
};

const INTERACTIVE =
  'transition-[border-color,box-shadow,transform] duration-[var(--duration-fast)] ' +
  'ease-[var(--ease-standard)] hover:-translate-y-px hover:shadow-popover';

/**
 * The face each surface is cut with, and the line around it.
 *
 * `CARD_SURFACES` says which combination of the four knobs a kind of card is; this says what that
 * combination *looks like* on the surface — where the light comes from, how deep the card sits and
 * how hard its edge is. The two are separate because the four knobs cannot express the third
 * question: a metric card and an informational card can share a tone and a variant and still need
 * to look like different objects, and before this they did not.
 *
 * Six cards, six faces, and the differences are the ones that carry meaning:
 *
 *   `featured`  under-lit (`agent-glow edge-under`) + the accent glow — the light moved.
 *   `metric`    a raised plate, lit from its top-left corner, on a full cast, with a harder edge.
 *   `data`      a *frame*: no gradient and no top hairline at all, closed by an inner hairline on
 *               all four sides and a softer cast. A dataset card is a window onto a body, so it
 *               does not get a face of its own — the well or the plot inside it is the light.
 *   `info`      the product's default panel: the top sheen and the top hairline.
 *   `action`    a lintel — an accent tint along the top edge — because the card exists to be acted
 *               on, and the pill at the bottom is the loud half of the same statement.
 *   `utility`   a recessed plate: darker than its surroundings, lit along its bottom.
 *
 * The borders move with the faces for the same reason: `metric` and `action` are objects you could
 * pick up, so they get the harder line; `data` keeps the plain edge and lets its inner hairline
 * define the window; and `featured` says so in the accent. `utility` keeps `border-border` rather
 * than dropping to transparent, which is what a recess would do if depth were the only signal —
 * the product's own wells (`CardTile`) carry the line as well, and the reference's inner sections
 * are bordered too.
 */
const SURFACE_FACE: Record<CardSurface, string> = {
  featured: cn('bg-surface shadow-panel', FLOOD),
  metric: 'bg-surface-raised shadow-plate face-corner',
  data: 'bg-surface shadow-frame',
  info: TONES.default,
  action: 'bg-surface shadow-panel face-lintel',
  utility: TONES.sunken,
};

const SURFACE_BORDER: Record<CardSurface, string> = {
  featured: 'border-primary-border',
  metric: 'border-border-strong',
  data: 'border-border',
  info: 'border-border',
  action: 'border-border-strong',
  utility: 'border-border',
};

/**
 * What a card is *for*, as one word.
 *
 * Six of them, and they are deliberately not six more knobs: each is a **name for a combination of
 * tone, variant, emphasis and density**, so a card can say what it is without becoming a second way
 * to describe a face. The reason to name them is that the four knobs are free and every call site
 * took the defaults — which is how a screen of eight cards became eight copies of one plate, with
 * whatever variety existed added by hand, one page at a time.
 *
 * The name is the *intent*; the combination is what that intent is worth:
 *
 *   - **`featured`** — the one card the screen is organised around. The only kind that moves the
 *     light (`variant="accent"`) and the only one allowed the accent glow, which is the rule
 *     `emphasis` already carried: a grid of four glowing panels has no emphasis at all.
 *   - **`metric`** — one figure, read at a glance. A raised plate at compact density, so a row of
 *     them separates from the page and reads as figures rather than as prose. Its *state* is still
 *     allowed to override `emphasis` at the call site, because a negative figure's red edge
 *     belongs to the figure.
 *   - **`data`** — a chart, table or stream. The default frame with tight air: what distinguishes
 *     a dataset from prose is its *body* — a well, a plot, full-bleed rows — and the card's job is
 *     to get out of the way of it.
 *   - **`info`** — prose, principles, policy. The product's default panel, and what a card with no
 *     surface gets, so a panel that needs no annotation needs no surface either.
 *   - **`action`** — a card whose job ends in one control. It gets the most air, because the reader
 *     is about to do something and the reference closes such a card with a full-width pill.
 *   - **`utility`** — a readout or a control cluster. A *recessed* plate, and the only kind that
 *     takes `tone="sunken"`. Deliberately restricted to cards that hold no well of their own: a
 *     recess inside a recess is not a depth, it is a smudge.
 *
 * Explicit props still win, one at a time: `surface="metric"` with an `emphasis` is a metric card
 * whose figure is in a state, which is a real card rather than a contradiction.
 */
export type CardSurface = 'featured' | 'metric' | 'data' | 'info' | 'action' | 'utility';

interface SurfacePreset {
  tone: CardTone;
  variant: CardVariant;
  emphasis: CardEmphasis;
  density: CardDensity;
}

/**
 * The six combinations, in one place so they can be read — and tested — as a set.
 *
 * Pairwise distinct on purpose: two that resolved to the same four values would be one kind of card
 * wearing two names, and a call site asking for the second would be asking for nothing.
 */
export const CARD_SURFACES: Record<CardSurface, SurfacePreset> = {
  featured: { tone: 'default', variant: 'accent', emphasis: 'accent', density: 'spacious' },
  metric: { tone: 'raised', variant: 'plain', emphasis: 'none', density: 'compact' },
  data: { tone: 'default', variant: 'plain', emphasis: 'none', density: 'compact' },
  info: { tone: 'default', variant: 'plain', emphasis: 'none', density: 'cozy' },
  action: { tone: 'default', variant: 'plain', emphasis: 'none', density: 'spacious' },
  utility: { tone: 'sunken', variant: 'plain', emphasis: 'none', density: 'compact' },
};

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /**
   * What this card is for. Optional: a card with no surface is an informational panel.
   *
   * Named `surface` rather than `role` because `role` is an ARIA attribute that `Card` forwards to
   * the DOM — a card really can be `<Card role="region">` — and taking that name for a visual
   * axis would have traded one ambiguity for a worse one.
   *
   * Passed as one word rather than four props so the kinds of card in the product are an enumerable
   * list rather than a habit, and so that \"this is a metric card\" cannot quietly come to mean
   * something different on the next screen.
   */
  surface?: CardSurface;
  /**
   * The element to render as. `div` by default.
   *
   * Not polymorphism for its own sake: a card that carries an `aria-label` is a landmark, and
   * `<section aria-label="Trade history">` is how the journal already exposes one, while a chart is a
   * `<figure>` for the same reason and a notice that stands on its own is an `<article>`. A shared
   * surface that could only be a `div` would force those panels to choose between the system's
   * surface and their own semantics, so the system took the four elements the product needs.
   */
  as?: 'div' | 'section' | 'figure' | 'article';
  /** `raised` nests a panel inside another surface; `sunken` recesses it (ids, code, tables). */
  tone?: CardTone;
  /** Marks this as the card the screen is organised around. */
  emphasis?: CardEmphasis;
  /**
   * Fill the card with `emphasis`'s wash as well as edging it.
   *
   * Only meaningful with an `emphasis` other than `none`, and it does not change the card's box or
   * its shadow — a state card is still a raised card, and painting it is not the same as promoting
   * it. The accent glow stays reserved for `emphasis="accent"` either way.
   */
  wash?: boolean;
  /** How much air the parts inside get. */
  density?: CardDensity;
  /** `accent` lights the card from below instead of above. Reserved for a screen's one feature. */
  variant?: CardVariant;
  interactive?: boolean;
}

/**
 * The face of a card that was not given a surface — or that overrode the one it was given.
 *
 * Composed in one expression rather than stacked as independent class strings: `cn` is a plain join
 * and does not resolve conflicts, so two utilities touching `background-image` would leave the
 * winner to stylesheet order. Picking the face is therefore a branch, not an addition.
 */
function plainFace(tone: CardTone, variant: CardVariant): string {
  if (tone === 'sunken') return TONES.sunken;
  if (variant === 'accent') {
    return cn(tone === 'raised' ? 'bg-surface-raised' : 'bg-surface', 'shadow-panel', FLOOD);
  }
  return TONES[tone];
}

/**
 * The face of a card that *is* its state rather than one that points at it.
 *
 * A washed card's fill replaces the neutral one rather than joining it: `bg-surface` and
 * `bg-danger-soft` are the same property, so the winner would be whichever the stylesheet happened
 * to order last.
 */
function washFace(tone: CardTone, variant: CardVariant, emphasis: CardEmphasis): string {
  const fill = EMPHASIS_WASH[emphasis];
  if (tone === 'sunken') return cn(fill, 'shadow-control-inset');
  if (variant === 'accent') return cn(fill, 'shadow-panel', FLOOD);
  return cn(fill, 'shadow-panel panel-gradient edge-highlight');
}

/**
 * The base surface.
 *
 * Three things together make a card read as a plate in a dark interface rather than a white box on
 * a grey page, and all three are tokens: the panel gradient lights its top so stacked surfaces
 * separate, `--shadow-panel`'s hairline white line sharpens that edge, and the `.edge-highlight`
 * pseudo-element draws a 1px highlight that fades out before the corners. Nothing here is a value
 * written at the call site, so the whole depth language moves together.
 */
export function Card({
  as: Element = 'div',
  surface,
  tone,
  emphasis,
  wash,
  density,
  variant,
  interactive,
  className,
  ...rest
}: CardProps) {
  // The surface is the floor and an explicit prop is the override, resolved one knob at a time: a
  // metric card whose figure is a loss keeps `surface="metric"` and states `emphasis="danger"`,
  // and a card with no surface at all falls through to the defaults it always had.
  const preset: SurfacePreset | undefined =
    surface === undefined ? undefined : CARD_SURFACES[surface];
  const resolvedTone = tone ?? preset?.tone ?? 'default';
  const resolvedVariant = variant ?? preset?.variant ?? 'plain';
  const resolvedEmphasis = emphasis ?? preset?.emphasis ?? 'none';
  const resolvedDensity = density ?? preset?.density ?? 'cozy';
  // The panel shadow comes with the plain face; only the emphasis can add one on top, because a
  // glowing card is still a raised card.
  const shadow = resolvedEmphasis === 'accent' ? 'shadow-glow' : '';
  // The bespoke face belongs to the surface, but only while the surface is still the thing choosing
  // where the light comes from: an explicit `tone` or `variant` is a caller saying it wants a
  // different placement, and the generic faces are the answer to that. So an override drops the
  // face and keeps everything the surface also decided — its density, and its emphasis.
  const bespoke = surface !== undefined && tone === undefined && variant === undefined;
  const faceClass =
    wash === true && resolvedEmphasis !== 'none'
      ? washFace(resolvedTone, resolvedVariant, resolvedEmphasis)
      : bespoke
        ? SURFACE_FACE[surface]
        : plainFace(resolvedTone, resolvedVariant);
  // Branchwise rather than as two `border-*` utilities in one join: both set `border-color`, so the
  // winner would be whichever Tailwind emitted last. A stated tone outranks the surface's own edge,
  // because a card in a state keeps the state's colour on its border.
  const borderClass =
    resolvedEmphasis !== 'none'
      ? EMPHASIS_BORDER[resolvedEmphasis]
      : bespoke
        ? SURFACE_BORDER[surface]
        : 'border-border';
  return (
    <CardDensityContext.Provider value={resolvedDensity}>
      <Element
        data-density={resolvedDensity}
        {...(surface === undefined ? {} : { 'data-surface': surface })}
        className={cn(
          // `relative` contains the shine; `min-w-0` is the other half of not growing the page. A
          // card is routinely a grid or flex item, and an item's automatic minimum size is its
          // *min-content* width — which, for a card holding a table in a scroll container, is the
          // table's own minimum. Without this, a card in a `grid-cols-2` track pushes the grid wider
          // than the viewport and the whole page gains a sideways scroll, while the table inside the
          // card is perfectly able to scroll within its own box. A card never sets the page's width.
          'relative min-w-0 rounded-[var(--radius-panel)] border',
          borderClass,
          faceClass,
          shadow,
          interactive && INTERACTIVE,
          interactive && resolvedEmphasis === 'none' && 'hover:border-border-strong',
          className,
        )}
        {...rest}
      />
    </CardDensityContext.Provider>
  );
}

/**
 * The head of a card: a title block, and whatever belongs level with it.
 *
 * `actions` is a real prop rather than a convention, because the convention was that every caller
 * hand-rolled the same `flex items-start justify-between` wrapper and half of them forgot the
 * `shrink-0` that keeps a long title from squeezing the button beside it. `divider` draws the
 * hairline rule between the head and the body — the reference's `hr.line`, and the one structural
 * detail that separates a card's *name* from its *contents* without a second surface.
 *
 * **`divider` is the default anatomy of a card in this product, not an option.** A card that names
 * itself and then shows something is the shape the reference draws, and it is the shape every
 * category of the drawer now uses; it is a prop rather than unconditional because a handful of
 * cards genuinely have no body to separate — a header-only panel, a container whose children are
 * the content — and drawing a rule across the bottom of one of those would be a line pointing at
 * nothing.
 */
export interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  /** Buttons or badges level with the title. They never shrink; the title does. */
  actions?: ReactNode;
  /** Draw the hairline rule under the header. */
  divider?: boolean;
}

export function CardHeader({ actions, divider, className, children, ...rest }: CardHeaderProps) {
  const density = useCardDensity();
  return (
    <>
      <div
        className={cn(
          // `flex-wrap` is what keeps a titled card with actions from overflowing at 390px: the
          // actions are the controls beside the title, so without a wrap the row would simply be
          // wider than the card. The headers this replaced nearly all wrote `flex-wrap` by hand —
          // it just was not part of the system, so half of them forgot it.
          'flex flex-wrap items-start justify-between gap-3',
          DENSITY[density].header,
          className,
        )}
        {...rest}
      >
        {children}
        {/* Wrapping the row is necessary and was not sufficient: a group of badges is wider than a
            390px card on its own, so `shrink-0` here moved the overflow rather than removing it — the
            group kept its 282px content width on its own line and pushed the page 32px sideways. The
            group therefore shrinks *and* wraps. A control is still never squeezed: a child's own
            automatic minimum size is its min-content width, which for a button is its label. */}
        {actions ? (
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">{actions}</div>
        ) : null}
      </div>
      {divider ? (
        <div className={DENSITY[density].rule}>
          <CardDivider />
        </div>
      ) : null}
    </>
  );
}

export function CardTitle({ className, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-title font-semibold text-text', className)} {...rest} />;
}

export function CardDescription({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('mt-1 text-caption text-text-muted', className)} {...rest} />;
}

export function CardContent({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  const density = useCardDensity();
  return <div className={cn(DENSITY[density].content, className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  const density = useCardDensity();
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 border-t border-border',
        DENSITY[density].footer,
        className,
      )}
      {...rest}
    />
  );
}

/**
 * The hairline rule inside a card.
 *
 * A themed break, not a decorative line: it is the same `--color-border` the card's own edge uses,
 * so a card reads as one material cut twice. It carries no margin of its own, so a header can place
 * it flush under its padding and a body can place it between two groups.
 */
export function CardDivider({ className, ...rest }: HTMLAttributes<HTMLHRElement>) {
  return <hr className={cn('m-0 h-px w-full border-0 bg-border', className)} {...rest} />;
}

/**
 * How much air a tile gets.
 *
 * Three steps, because a tile's padding is the same kind of decision as a card's density and the
 * tree had drifted to seven near-identical values for it — `px-3 py-2`, `px-2.5 py-2`, `px-3 py-3`,
 * `p-3`, `px-3 py-2.5`, `px-2.5 py-1.5`, `px-2`. A scale is what keeps that from happening again;
 * the odd values were folded to their nearest step rather than carried as they were.
 *
 * `none` is the fourth answer and not a gap in the scale: a well that *frames* something (a
 * screenshot) or holds a control rail (a segmented toggle) has no padding of its own, and the
 * padding it does carry belongs to the control inside it. It emits nothing rather than `p-0`, so
 * the call site's own spacing stays the only padding on the element.
 */
export type CardTileSpace = 'none' | 'tight' | 'default' | 'roomy';

const TILE_SPACE: Record<CardTileSpace, string> = {
  none: '',
  tight: 'px-2.5 py-1.5',
  default: 'px-3 py-2',
  roomy: 'px-3 py-3',
};

/**
 * The two directions a tile can sit in the plane it is on.
 *
 * `sunken` is the well and the common case. `raised` is the small plate that stands *on* a panel —
 * a fact in a row of facts, a dimension cell — and it was the other half of the same drift:
 * `rounded-[var(--radius-inset)] border border-border bg-surface-raised` written by hand beside
 * `rounded-[var(--radius-tile)] border border-border bg-surface-raised` for the same kind of thing.
 * One step of the radius ladder, one fill, chosen once.
 */
export type CardTileTone = 'sunken' | 'raised';

const TILE_TONE: Record<CardTileTone, string> = {
  sunken: 'bg-surface-sunken shadow-control-inset',
  raised: 'bg-surface-raised shadow-control',
};

/**
 * A nested surface: an id, a code block, a stat, a sub-panel.
 *
 * This is the single most-copied string the product had — `rounded-[var(--radius-control)] border
 * border-border bg-surface-sunken px-3 py-2`, by hand, in fifty-odd places. It is a well, so it
 * takes the inset shadow rather than a lit edge (`tone="sunken"` on a full card, at tile scale), and
 * it exists as a component so that "how deep is a tile" is answered once.
 *
 * The spacing is a prop rather than a `className` because `cn` is a plain join: a caller writing
 * `className="py-3"` next to the tile's own `py-2` leaves two utilities on the same property and the
 * winner to the stylesheet's ordering. `space` decides and emits one of them.
 */
export interface CardTileProps extends HTMLAttributes<HTMLElement> {
  /**
   * The elements a tile actually is in this product.
   *
   * A `div` for a stack, a `p` when the well *is* a sentence, an `li` when it is an item of a list
   * that has to keep its semantics, a `fieldset` for a group of inputs and a `section` for a named
   * group inside a larger panel. Five and no more, because a tile that could be anything is a
   * div with a licence.
   */
  as?: 'div' | 'p' | 'li' | 'section' | 'fieldset';
  space?: CardTileSpace;
  tone?: CardTileTone;
}

export function CardTile({
  as: Element = 'div',
  space = 'default',
  tone = 'sunken',
  className,
  ...rest
}: CardTileProps) {
  return (
    <Element
      className={cn(
        'rounded-[var(--radius-control)] border border-border',
        TILE_TONE[tone],
        TILE_SPACE[space],
        className,
      )}
      {...rest}
    />
  );
}

/*
 * A tick list and a marked row were built here first and then removed, and the reason is worth
 * keeping: the product already has that family — `AgentCardList` and `AgentCardItem` in
 * `components/agent`, built in Phase 7.2.1 for the agent surface's rows, with the mark, the
 * `ordered` choice and the `aria-hidden` tick already decided. A second list component in the card
 * system would have been two components for one job, which is the duplication this phase exists to
 * end. They were unused by every page, so they went rather than being kept "for later".
 */

/** Small section wrapper used inside pages to group cards under a heading. */
export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('space-y-3', className)} aria-label={title}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-title font-semibold text-text">{title}</h2>
          {description ? <p className="text-caption text-text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
