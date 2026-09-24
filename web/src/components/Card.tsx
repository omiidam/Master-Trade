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
 * ## What is *not* here
 *
 * There is no `variant="metric"` and no `variant="form"`. Density and emphasis already express both:
 * a metric card is a compact card with a figure in it, and a form is a panel with fields in it.
 * A variant is only worth adding when it changes the *surface* — when it puts the light somewhere
 * new — because that is the only thing a card cannot say with its content.
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
  content: string;
  footer: string;
}

const DENSITY: Record<CardDensity, DensityScale> = {
  compact: { header: 'px-3 pt-3', content: 'px-3 py-3', footer: 'px-3 py-2' },
  cozy: { header: 'px-4 pt-4', content: 'px-4 py-4', footer: 'px-4 py-3' },
  spacious: { header: 'px-5 pt-5', content: 'px-5 py-5', footer: 'px-5 py-4' },
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

export interface CardProps extends HTMLAttributes<HTMLElement> {
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
 * The surface, and the choice of where its light comes from.
 *
 * Composed in one expression rather than stacked as independent class strings: `cn` is a plain join
 * and does not resolve conflicts, so two utilities touching `background-image` would leave the
 * winner to stylesheet order. Picking the face is therefore a branch, not an addition.
 */
function face(tone: CardTone, variant: CardVariant, wash: boolean, emphasis: CardEmphasis): string {
  // A washed card's fill replaces the neutral one rather than joining it: `bg-surface` and
  // `bg-danger-soft` are the same property, so the winner would be whichever the stylesheet
  // happened to order last.
  if (wash && emphasis !== 'none') {
    const fill = EMPHASIS_WASH[emphasis];
    if (tone === 'sunken') return cn(fill, 'shadow-control-inset');
    if (variant === 'accent') return cn(fill, 'shadow-panel', FLOOD);
    return cn(fill, 'shadow-panel panel-gradient edge-highlight');
  }
  if (tone === 'sunken') return TONES.sunken;
  if (variant === 'accent') {
    return cn(tone === 'raised' ? 'bg-surface-raised' : 'bg-surface', 'shadow-panel', FLOOD);
  }
  return TONES[tone];
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
  tone = 'default',
  emphasis = 'none',
  wash,
  density = 'cozy',
  variant = 'plain',
  interactive,
  className,
  ...rest
}: CardProps) {
  // The panel shadow comes with the plain face; only the emphasis can add one on top, because a
  // glowing card is still a raised card.
  const shadow = emphasis === 'accent' ? 'shadow-glow' : '';
  return (
    <CardDensityContext.Provider value={density}>
      <Element
        data-density={density}
        className={cn(
          'relative rounded-[var(--radius-panel)] border',
          EMPHASIS_BORDER[emphasis],
          face(tone, variant, wash === true, emphasis),
          shadow,
          interactive && INTERACTIVE,
          interactive && emphasis === 'none' && 'hover:border-border-strong',
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
        className={cn('flex items-start justify-between gap-3', DENSITY[density].header, className)}
        {...rest}
      >
        {children}
        {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
      </div>
      {divider ? <CardDivider /> : null}
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
