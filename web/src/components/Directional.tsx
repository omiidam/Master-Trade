/**
 * Glyphs whose *meaning* is a position in the flow — Phase 7.5.3.4.4.
 *
 * Most icons are immune to direction: a bell is a bell, a chevron pointing down discloses the same thing in
 * every language, and a chart's axes are read left to right whoever is looking at them. A few are not. **A
 * chevron that means \"the next one\" points to the end of the line, and the end of the line moves when the
 * writing direction does** — so in a mirrored interface a `ChevronRight` that still points right stops
 * meaning \"next\" and starts meaning \"back\", which is worse than an untranslated word.
 *
 * The mechanism is a named component rather than a CSS transform, and that is the whole design decision.
 * `scaleX(-1)` would mirror the glyph without mirroring the meaning and would be invisible to every test in
 * this repository; naming the intent (`BackIcon`, `ForwardIcon`) means the *call site* says which of the two
 * things it is, and a reviewer can disagree with it. It is also why these read the resolved direction through
 * the store rather than from `document.documentElement.dir`: the attribute is the effect, and a component that
 * read it would not re-render when the control moved.
 *
 * What deliberately does **not** live here, and why:
 *
 *   - **A paper plane is a metaphor, not an arrow.** `Send` is a glyph for despatch; its diagonal is not the
 *     reading direction, and mirroring it changes the product's own artwork for no gain in meaning.
 *   - **An upward arrow is a fact about the market.** The journal's long/short badge and the trend mark say
 *     *long* and *up*, and a mirrored arrow would say the opposite of what the figure beside it says.
 *   - **Light does not mirror.** Every gradient in `global.css` is lit from above and the composer's gleam
 *     sits in one corner; a mirror is about the flow of text, not about where the light comes from. That is
 *     stated where the gradients are, next to the tokens it applies to.
 */

import { ChevronLeft, ChevronRight, PanelLeft, PanelRight } from 'lucide-react';
import { useTextDirection } from '../i18n/index.js';

export interface DirectionalIconProps {
  /** The glyph's size in pixels. Defaults to the size the flow affordances use. */
  size?: number;
  className?: string;
}

/**
 * Points at the previous item: toward the *start* of the line.
 *
 * Left in a left-to-right interface, right in a right-to-left one — the direction, not the side.
 */
export function BackIcon({ size = 14, className }: DirectionalIconProps) {
  const direction = useTextDirection();
  const Glyph = direction === 'rtl' ? ChevronRight : ChevronLeft;
  return <Glyph size={size} aria-hidden className={className} />;
}

/**
 * Points at the next item, and at anything that continues the line.
 *
 * The same glyph serves the pagers and the small marker some panels put before a line of text, because they
 * mean the same spatial thing: *keep reading this way*. In a left-to-right interface that is rightwards; in a
 * right-to-left one it is leftwards, which puts it on the inside of the paragraph's start edge either way.
 */
export function ForwardIcon({ size = 14, className }: DirectionalIconProps) {
  const direction = useTextDirection();
  const Glyph = direction === 'rtl' ? ChevronLeft : ChevronRight;
  return <Glyph size={size} aria-hidden className={className} />;
}

/**
 * The navigation rail, drawn on the side it is actually on.
 *
 * The sidebar is the first flex child of the shell, so it follows the flow: it sits at the *inline start*
 * edge, which is the left in a left-to-right interface and the right in a right-to-left one. A collapsed
 * rail drawn on the wrong side is a control that describes a layout the person is not looking at.
 */
export function PanelStartIcon({ size = 16, className }: DirectionalIconProps) {
  const direction = useTextDirection();
  const Glyph = direction === 'rtl' ? PanelRight : PanelLeft;
  return <Glyph size={size} aria-hidden className={className} />;
}
