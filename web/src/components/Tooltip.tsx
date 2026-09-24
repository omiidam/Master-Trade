import * as RadixTooltip from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

/**
 * Radix Tooltip (ADR-0012 chose Radix primitives for behaviour: focus handling,
 * escape/scroll dismissal and ARIA wiring come from the library, styling from us).
 */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <RadixTooltip.Provider delayDuration={220} skipDelayDuration={300}>
      {children}
    </RadixTooltip.Provider>
  );
}

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  className?: string;
}

export function Tooltip({
  content,
  children,
  side = 'top',
  align = 'center',
  className,
}: TooltipProps) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            // A tooltip is a raised surface like any other, so it wears the same three- token
            // depth: the raised surface, the panel gradient that lights its top, and the lit
            // edge. It is the smallest surface in the product and still belongs to the system.
            'relative z-[var(--z-tooltip)] max-w-64 rounded-[var(--radius-control)]',
            'border border-border-strong panel-gradient edge-highlight',
            'bg-surface-raised px-2.5 py-1.5 text-caption text-text shadow-popover',
            'select-none',
            className,
          )}
        >
          {content}
          <RadixTooltip.Arrow className="fill-[var(--color-border-strong)]" />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
