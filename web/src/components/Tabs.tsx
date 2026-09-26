import * as RadixTabs from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';
import { useTextDirection } from '../i18n/index.js';
import { cn } from '../lib/cn';

export interface TabItem {
  id: string;
  label: string;
  icon?: ReactNode;
  badge?: ReactNode;
}

export interface TabsProps {
  items: readonly TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  'aria-label'?: string;
  className?: string;
}

/**
 * Keyboard-navigable tabs (arrow keys, home/end) via Radix; the active tab is
 * marked with `data-state` so styling and tests can read it without guessing.
 *
 * This is the product's **only** tab strip. The journal carried a second one — its own rail, its own
 * trigger, its own panel — because it wanted a sliding active indicator; the duplicate drifted, and
 * the way it drifted was that it suppressed the focus ring while the shared trigger kept it, so the
 * journal was the one screen where tabbing the strip showed nothing. A second implementation of a
 * control is not variety, it is a place for the two to disagree, so the journal now uses this one and
 * its own is gone.
 */
export function Tabs({
  items,
  value,
  onValueChange,
  children,
  className,
  'aria-label': ariaLabel,
}: TabsProps) {
  /*
   * The strip's writing direction, stated rather than left to the default.
   *
   * Radix resolves a tab group's direction from its own `dir` prop, from a `DirectionProvider` above it, or —
   * with neither — from the literal `'ltr'`, and it stamps the answer on the element it renders. Every panel
   * is a child of that element, so an unstated direction did not merely leave the strip unmirrored: it put a
   * left-to-right island inside a right-to-left page. Measured on the built bundle in Persian, the strip
   * listed its tabs from the left rather than the right, the first tab sat where the last one belongs, and
   * every heading, paragraph and card *inside* every panel was aligned to the left of its box —
   * `direction: ltr`, inherited. The strip was the visible half of it; the panels were the larger half.
   *
   * The value comes from the same hook the shell's own direction-shaped components read, so the strip agrees
   * with `<html dir>` by construction rather than by coincidence: the control's preference, resolved against
   * the interface language — right-to-left for Persian, and `ltr` under an explicit left-to-right pin, so a
   * pin over Persian still lays the strip the way the page around it is laid out.
   *
   * This is the one place it belongs. `Tabs` is the product's only tab strip, so one prop here is what makes
   * thirteen pages — and every tab group in all nine of the shell's categories — follow their page instead of
   * disagreeing with it. The other horizontal groups (the segmented controls, the filters, the navigation)
   * are plain elements and already inherit the flow; a Radix primitive is the one kind that does not, because
   * it has to be told.
   */
  const direction = useTextDirection();

  return (
    <RadixTabs.Root
      dir={direction}
      value={value}
      onValueChange={onValueChange}
      className={cn('flex flex-col gap-4', className)}
    >
      {/*
        A tab strip is the one control whose width is set by its *content*, not by the
        layout: the labels are fixed and the count grows with the page. Left as a plain
        flex row it therefore became the widest thing on the page, and on a phone the
        document itself scrolled sideways — which is how five screens (Memory, Research,
        Exams, Activity, Settings) failed the Phase 5.10 browser matrix.

        Scrolling is the fix rather than wrapping. Wrapping would turn a one-line control
        into a two-row block of pills at unpredictable widths, changing the design on the
        screens that need it most; a horizontal scroll keeps the strip one row and keeps
        every tab reachable. `w-full` bounds the scroller and `min-w-0` lets it shrink
        inside its parent, and the triggers stop shrinking so a long label cannot squash
        its neighbours down to initials.
      */}
      {/* The strip is a *rail*: a recessed well (inset stack) with the active tab standing on it
          as a raised control. That inversion — sunken track, raised selection — is what makes the
          current tab unmistakable without a heavy fill. */}
      {/* `relative` is load-bearing rather than cosmetic: the rail is a scroll container, and an
          `sr-only` descendant (`position: absolute`) would otherwise take the nearest positioned
          ancestor outside it as its containing block and escape the rail's clip, widening the
          document instead of scrolling inside the rail. */}
      <RadixTabs.List
        aria-label={ariaLabel}
        className="relative flex w-full min-w-0 flex-nowrap items-center gap-1 overflow-x-auto overscroll-x-contain rounded-[var(--radius-control)] border border-border bg-surface-sunken p-1 shadow-control-inset"
      >
        {items.map((item) => (
          <RadixTabs.Trigger
            key={item.id}
            value={item.id}
            className={cn(
              'group relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap',
              'rounded-[calc(var(--radius-control)-2px)] px-3 py-1.5',
              'text-caption font-medium text-text-muted',
              'transition-[background-color,color,box-shadow] duration-[var(--duration-fast)]',
              'ease-[var(--ease-standard)]',
              'hover:bg-surface-raised/60 hover:text-text',
              'data-[state=active]:bg-surface-raised data-[state=active]:text-text',
              'data-[state=active]:shadow-control',
            )}
          >
            {/*
             * The lit face and the accent rail are separate always-present layers toggled by
             * opacity, rather than gradients applied conditionally: `control-sheen` is a plain
             * class, not a Tailwind utility, so it cannot take a `data-[state=active]:` variant.
             * The face paints *behind* the label; the rail paints over the bottom edge, which is
             * the one accent mark this control gets.
             */}
            <span
              aria-hidden
              className="control-sheen pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-[var(--duration-fast)] group-data-[state=active]:opacity-100"
            />
            <span className="relative inline-flex items-center gap-2">
              {item.icon}
              {item.label}
              {item.badge}
            </span>
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-2 bottom-0 h-px rounded-full bg-primary opacity-0 transition-opacity duration-[var(--duration-fast)] group-data-[state=active]:opacity-100"
            />
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {children}
    </RadixTabs.Root>
  );
}

/**
 * One tab's content.
 *
 * Focusable, so a keyboard user lands *inside* the panel they just opened and can scroll it — which
 * is why it must also be visible when it has focus. It used to suppress the ring with
 * `focus-visible:outline-none` and draw nothing in its place, so the one control a keyboard user
 * reaches after the strip was the one control that gave no sign it was there. The product's global
 * `:focus-visible` ring is now left to do its job; the ring is drawn outside the box and so cannot
 * move anything.
 */
export function TabPanel({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <RadixTabs.Content value={value} className={className} tabIndex={0}>
      {children}
    </RadixTabs.Content>
  );
}
