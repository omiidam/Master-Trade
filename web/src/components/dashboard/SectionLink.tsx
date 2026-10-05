/**
 * The one way out of a dashboard card.
 *
 * Every card on this page answers a question the reader asked somewhere else — the level belongs to the
 * curriculum, the score and the mistakes belong to the assessments, the course and the weak areas belong to
 * the Academy — so each one carries a control that opens the section that holds the record. This component is
 * that control, once, for three reasons:
 *
 *   - **The label says what the reader will find there, not just where it is.** Three of these cards open
 *     the assessments, so a button that only read "Exams" three times on one page would give the reader no
 *     way to tell which press goes where. Each section therefore words its own control around its own claim
 *     — "Open the assessment history", "Open mistake review" — and the control is the one place that wording
 *     appears, so the seven of them stay comparable.
 *   - **The glyph is `ForwardIcon`, not a chevron.** A chevron that means "onward" points at the inline end
 *     of the line, and the inline end moves when the writing direction does — the same reason `Directional.tsx`
 *     exists. This one is direction-safe in both languages rather than correct in one.
 *   - **It is a real `<button>` in the footer rather than a click target on the card.** A card that holds its
 *     own controls cannot itself be one without nesting interactive elements, which is both invalid markup and
 *     a keyboard trap. So the card answers with a control a reader can see, focus and press.
 *
 * The card's own `interactive` treatment carries the hover, and the focus ring is the product's global
 * `:focus-visible`, so this component adds no state of its own to keep in step with anything.
 */

import { Button } from '../Button';
import { ForwardIcon } from '../Directional';

export interface SectionLinkProps {
  /** What the control says, already resolved in the interface language. */
  label: string;
  /** Opens that section. */
  onOpen: () => void;
}

export function SectionLink({ label, onOpen }: SectionLinkProps) {
  return (
    // No `label` prop: the button has visible words on it, so its accessible name is those words. An
    // `aria-label` here would silently override them, and the two could drift apart.
    <Button size="sm" variant="ghost" trailingIcon={<ForwardIcon size={14} />} onClick={onOpen}>
      {label}
    </Button>
  );
}
