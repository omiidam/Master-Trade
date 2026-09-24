import * as RadixTabs from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';
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
 */
export function Tabs({
  items,
  value,
  onValueChange,
  children,
  className,
  'aria-label': ariaLabel,
}: TabsProps) {
  return (
    <RadixTabs.Root
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
      <RadixTabs.List
        aria-label={ariaLabel}
        className="flex w-full min-w-0 flex-nowrap items-center gap-1 overflow-x-auto overscroll-x-contain rounded-[var(--radius-control)] border border-border bg-surface-sunken p-1 shadow-control-inset"
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
    <RadixTabs.Content
      value={value}
      className={cn('focus-visible:outline-none', className)}
      tabIndex={0}
    >
      {children}
    </RadixTabs.Content>
  );
}
