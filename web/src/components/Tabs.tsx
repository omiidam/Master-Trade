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
      <RadixTabs.List
        aria-label={ariaLabel}
        className="flex items-center gap-1 rounded-[var(--radius-control)] border border-border bg-surface-sunken p-1"
      >
        {items.map((item) => (
          <RadixTabs.Trigger
            key={item.id}
            value={item.id}
            className={cn(
              'inline-flex items-center gap-2 rounded-[calc(var(--radius-control)-2px)] px-3 py-1.5',
              'text-caption font-medium text-text-muted transition-colors',
              'hover:text-text data-[state=active]:bg-surface-raised data-[state=active]:text-text',
              'data-[state=active]:shadow-panel',
            )}
          >
            {item.icon}
            {item.label}
            {item.badge}
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
