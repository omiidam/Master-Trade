import * as RadixTabs from '@radix-ui/react-tabs';
import { motion, useReducedMotion } from 'framer-motion';
import { useId, type ReactNode } from 'react';
import { EASE } from '../../design/motion';
import { cn } from '../../lib/cn';

export interface JournalTabItem {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Count shown next to the label, e.g. trades needing a review. */
  count?: number;
  /** One line describing the section; used as the trigger's accessible hint. */
  description?: string;
}

export interface JournalTabsProps {
  items: readonly JournalTabItem[];
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  'aria-label'?: string;
  className?: string;
}

/**
 * The journal's internal navigation.
 *
 * Journal is a single sidebar entry, so everything inside it is reached from here:
 * a horizontally scrollable segmented control with a moving active indicator. It is
 * built on Radix Tabs so arrow-key navigation, `aria-selected` and the
 * tabpanel relationship are handled by the primitive rather than re-implemented.
 *
 * The strip scrolls rather than wrapping on narrow viewports: seven sections that
 * reflow into three rows stop reading as one navigation.
 */
export function JournalTabs({
  items,
  value,
  onValueChange,
  children,
  className,
  'aria-label': ariaLabel,
}: JournalTabsProps) {
  const reduceMotion = useReducedMotion();
  const indicatorId = useId();

  return (
    <RadixTabs.Root
      value={value}
      onValueChange={onValueChange}
      className={cn('flex flex-col gap-4', className)}
    >
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <RadixTabs.List
          aria-label={ariaLabel}
          className="inline-flex min-w-full items-center gap-1 rounded-[var(--radius-control)] border border-border bg-surface-sunken p-1"
        >
          {items.map((item) => {
            const active = item.id === value;
            return (
              <RadixTabs.Trigger
                key={item.id}
                value={item.id}
                {...(item.description ? { title: item.description } : {})}
                className={cn(
                  'relative inline-flex shrink-0 items-center gap-2 rounded-[calc(var(--radius-control)-2px)] px-3 py-1.5',
                  'text-caption font-medium whitespace-nowrap transition-colors duration-[var(--duration-fast)]',
                  'focus-visible:outline-none',
                  active ? 'text-text' : 'text-text-muted hover:text-text',
                )}
              >
                {active ? (
                  reduceMotion ? (
                    <span
                      aria-hidden
                      className="absolute inset-0 rounded-[calc(var(--radius-control)-2px)] bg-surface-raised shadow-panel"
                    />
                  ) : (
                    <motion.span
                      aria-hidden
                      layoutId={indicatorId}
                      transition={{ duration: 0.18, ease: EASE.standard }}
                      className="absolute inset-0 rounded-[calc(var(--radius-control)-2px)] bg-surface-raised shadow-panel"
                    />
                  )
                ) : null}
                <span className="relative z-10 inline-flex items-center gap-2">
                  {item.icon}
                  {item.label}
                  {item.count === undefined ? null : (
                    <span
                      className={cn(
                        'num inline-flex h-4 min-w-4 items-center justify-center rounded-[var(--radius-pill)] px-1 text-caption',
                        active
                          ? 'bg-primary-soft text-primary'
                          : 'bg-surface-raised text-text-faint',
                      )}
                    >
                      {item.count}
                    </span>
                  )}
                </span>
              </RadixTabs.Trigger>
            );
          })}
        </RadixTabs.List>
      </div>
      {children}
    </RadixTabs.Root>
  );
}

/** One section's content. Focusable so keyboard users land inside the panel. */
export function JournalTabPanel({
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
      tabIndex={0}
      className={cn('space-y-4 focus-visible:outline-none', className)}
    >
      {children}
    </RadixTabs.Content>
  );
}
