import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/cn';
import { Tooltip } from './Tooltip';

/**
 * A menu that hangs from the control that opened it, and stays in the window.
 *
 * The problem this exists for
 * ---------------------------
 * The journal's trade history opened its row menu as an `absolute` panel inside its own row. That
 * is the natural way to write it and it is wrong for one reason, which is a CSS rule rather than an
 * oversight: **`overflow-x: auto` computes `overflow-y` to `auto` as well.** The table's own scroll
 * container therefore clips *vertically* too, and a panel that hangs below its row is cut off at
 * the container's bottom edge — worse, the container grows a scrollbar and the menu appears to sit
 * *inside* the table it is covering. Measured on the journal's trade history at 1440×900, with a
 * panel of 222px hanging from the menu button on the last row of the page: it reached **178px past
 * the bottom of its own scroll container**, of its 222px only **44px** was visible, and the
 * container — which has no vertical content at all — reported a `scrollHeight` of 741 against a
 * `clientHeight` of 563. That is the defect this replaces, and it is entirely a fact about the
 * box the menu was drawn in rather than about the menu.
 *
 * The alternative — loosening the scroll container's overflow — is not available. The table has a
 * minimum readable width on purpose, and the sideways scroll *inside its own box* is the honest
 * answer on a phone (see `Table`); `overflow-y: visible` beside `overflow-x: auto` is not a thing
 * the browser will lay out, and `overflow: clip` would take the scroller away with it.
 *
 * So the panel is rendered outside that box instead:
 *
 *   1. **It is portalled to `document.body`.** That is what escapes the scroll container's clip —
 *      and it also escapes any ancestor that becomes a containing block for a positioned
 *      descendant, which in this product means the card behind the table (positioned for its own
 *      shine) and any transformed wrapper a motion component leaves behind. Nothing about the
 *      table's own layout is touched, so the row, the columns and the scroller are exactly what
 *      they were before the menu opened.
 *   2. **It is positioned `fixed` from the trigger's own box**, measured after it is in the DOM and
 *      before the browser paints, so the panel never appears at a guess and then jumps.
 *   3. **It is placed inside the usable viewport, twice over.** Horizontally it hangs from the
 *      trigger's *end* edge — the right edge in a left-to-right interface, the left in a
 *      right-to-left one, which is the edge the three-dot button is against — and is then pulled
 *      inside the window's margin if that edge would take it off screen. Vertically it opens
 *      *downwards* where there is room and *upwards* where there is not, so the last row of a table
 *      needs no special case.
 *   4. **It follows the row it belongs to, and closes when that row leaves the window.** The anchor
 *      is a row inside a scrolling table, so a scroll or a resize moves it — and a `fixed` panel
 *      left where it was would be pointing at nothing. Dismissing on the first scroll is the
 *      obvious answer and it is wrong in a way a user sees as a broken button: a scroll event that
 *      belongs to the interaction *before* the press can land a few milliseconds after the panel
 *      opens (measured: the menu opened and was gone again before the next frame, on the last row of
 *      this table), so the menu a reader just asked for disappears. Following the row is both the
 *      calmer behaviour and the more accurate one: `place` is re-run from the row's live box on
 *      every scroll, exactly as a popover tracks its anchor, and the panel dismisses itself only
 *      once the row has genuinely left the window and there is nothing left to point at.
 *
 * What it deliberately is not: a general-purpose popover. It is a menu of commands with a
 * transparent surface behind it, and it carries no focus trap, no typeahead and no submenu, because
 * nothing in this product needs one.
 */

/** Air between the trigger and the panel, and the panel and the window's edge. */
const TRIGGER_GAP = 6;
const VIEWPORT_MARGIN = 8;

/** Keep a value inside a range that may legitimately be empty (`min` wins if it is). */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export interface AnchoredMenuProps {
  /** Whether the panel is open. The trigger owns this state; this component renders it. */
  open: boolean;
  /** The element the panel hangs from — the control that was pressed. */
  anchor: HTMLElement | null;
  onClose: () => void;
  /** The accessible name of the transparent surface that closes the menu. */
  closeLabel: string;
  children: ReactNode;
  className?: string;
}

export function AnchoredMenu({
  open,
  anchor,
  onClose,
  closeLabel,
  children,
  className,
}: AnchoredMenuProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [placement, setPlacement] = useState<{ top: number; left: number } | null>(null);

  // The close callback is read through a ref so that the listeners below are added once per open
  // rather than once per render of the row that owns the menu.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  /*
   * A layout effect rather than an effect, and that is the whole anti-flicker story: it runs after
   * the panel is in the DOM and before the browser paints, so the measurement is of a real box and
   * the placement it produces is the first thing ever drawn. Until it has run the panel is hidden
   * rather than painted at a default corner.
   */
  useLayoutEffect(() => {
    if (!open) {
      setPlacement(null);
      return;
    }
    if (!anchor || !anchor.isConnected) return;

    const place = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const trigger = anchor.getBoundingClientRect();
      const { width, height } = panel.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;

      // The panel hangs from the trigger's end edge. `direction` is resolved rather than assumed,
      // because the same table is read left-to-right and right-to-left in this product.
      const mirrored = getComputedStyle(anchor).direction === 'rtl';
      const left = mirrored ? trigger.left : trigger.right - width;

      // Below by default; above when below would leave the window. Measured from the panel's own
      // height, so this holds for a menu of four commands and a menu of seven alike.
      const below = trigger.bottom + TRIGGER_GAP;
      const top =
        below + height > viewportHeight - VIEWPORT_MARGIN
          ? trigger.top - height - TRIGGER_GAP
          : below;

      const next = {
        top: Math.round(clamp(top, VIEWPORT_MARGIN, viewportHeight - height - VIEWPORT_MARGIN)),
        left: Math.round(clamp(left, VIEWPORT_MARGIN, viewportWidth - width - VIEWPORT_MARGIN)),
      };
      // Bail out when nothing moved: this effect may run on any render of the row, and a fresh
      // object every time would be a render loop.
      setPlacement((current) =>
        current && current.top === next.top && current.left === next.left ? current : next,
      );
    };

    place();

    /*
     * The row moves, so the panel is re-placed from its live box — and the menu is dismissed only
     * once there is no row left on screen to hang from. Closing on the first scroll would be simpler
     * and is wrong: a scroll event from the interaction before the press can arrive after the panel
     * has opened, and the reader's menu would flash and vanish.
     */
    const follow = () => {
      const box = anchor.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;
      const onScreen =
        box.right > 0 && box.left < viewportWidth && box.bottom > 0 && box.top < viewportHeight;
      if (!onScreen) {
        closeRef.current();
        return;
      }
      place();
    };
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);
    return () => {
      window.removeEventListener('scroll', follow, true);
      window.removeEventListener('resize', follow);
    };
  }, [open, anchor]);

  if (!open) return null;

  return createPortal(
    <>
      {/* The surface that closes the menu. A button rather than a document listener, so the click
          that dismisses is a click on a control with a name, and the keyboard can reach it. */}
      <button
        type="button"
        aria-label={closeLabel}
        className="fixed inset-0 z-[var(--z-overlay)] cursor-default"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="menu"
        style={
          placement === null
            ? { visibility: 'hidden' }
            : { top: `${placement.top}px`, left: `${placement.left}px` }
        }
        className={cn(
          'fixed z-[var(--z-modal)] w-52 overflow-hidden rounded-[var(--radius-control)]',
          'border border-border-strong bg-bg-elevated py-1 shadow-popover',
          className,
        )}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}

export interface MenuItemProps {
  icon: ReactNode;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  /** Why the item cannot be chosen. Shown as the item's tooltip, and only when it is disabled. */
  disabledReason?: string;
  tone?: 'default' | 'danger';
}

export function MenuItem({
  icon,
  label,
  onSelect,
  disabled = false,
  disabledReason,
  tone = 'default',
}: MenuItemProps) {
  const button = (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-1.5 text-start text-caption',
        'transition-colors duration-[var(--duration-fast)] disabled:opacity-40',
        tone === 'danger'
          ? 'text-danger hover:bg-danger-soft'
          : 'text-text-muted hover:bg-surface-raised hover:text-text',
      )}
    >
      <span aria-hidden className="shrink-0">
        {icon}
      </span>
      {label}
    </button>
  );
  return disabled && disabledReason !== undefined ? (
    <Tooltip content={disabledReason}>{button}</Tooltip>
  ) : (
    button
  );
}
