import * as RadixDialog from '@radix-ui/react-dialog';
import { Minimize2, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '../Button';
import { cn } from '../../lib/cn';

export interface FullscreenChartViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Rendered above the chart: timeframe and series controls. */
  toolbar?: ReactNode;
  /** Accessible name for the close control; defaults to the chart wording. */
  closeLabel?: string;
  /** Footer line explaining how to leave the overlay. */
  footnote?: string;
  children: ReactNode;
}

/**
 * Fullscreen chart surface.
 *
 * Every journal chart can be expanded, because a decision read off a 240px panel
 * is a decision made on too little information. The overlay is built on Radix
 * Dialog so focus trapping, scroll locking and **Escape to close** come from the
 * primitive rather than from a hand-rolled key listener, and the close control is
 * a visible button as well as a key — a viewer that can only be dismissed with the
 * keyboard is a trap for a mouse user, and vice versa.
 *
 * It is the same chart component rendered twice, never a second implementation:
 * an expanded chart that draws itself differently from the inline one is worse
 * than no expansion at all.
 */
export function FullscreenChartViewer({
  open,
  onOpenChange,
  title,
  description,
  toolbar,
  closeLabel = 'Close fullscreen chart',
  footnote = 'Press Escape or use Close to return to the inline chart.',
  children,
}: FullscreenChartViewerProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      {open ? (
        <RadixDialog.Portal>
          <RadixDialog.Overlay className="fixed inset-0 z-[var(--z-overlay)] bg-black/80 backdrop-blur-sm" />
          <RadixDialog.Content
            className={cn(
              'fixed inset-3 z-[var(--z-modal)] flex flex-col overflow-hidden',
              'rounded-[var(--radius-panel)] border border-border-strong bg-bg shadow-popover',
              'focus:outline-none',
            )}
          >
            <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div className="min-w-0">
                <RadixDialog.Title className="text-title font-semibold text-text">
                  {title}
                </RadixDialog.Title>
                {description ? (
                  <RadixDialog.Description className="mt-0.5 text-caption text-text-muted">
                    {description}
                  </RadixDialog.Description>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {toolbar}
                <RadixDialog.Close asChild>
                  <Button
                    variant="secondary"
                    size="sm"
                    label={closeLabel}
                    leadingIcon={<X size={14} aria-hidden />}
                  >
                    Close
                  </Button>
                </RadixDialog.Close>
              </div>
            </header>
            <div className="min-h-0 flex-1 overflow-auto px-4 py-4">{children}</div>
            <footer className="flex shrink-0 items-center gap-2 border-t border-border px-4 py-2 text-caption text-text-faint">
              <Minimize2 size={12} aria-hidden />
              {footnote}
            </footer>
          </RadixDialog.Content>
        </RadixDialog.Portal>
      ) : null}
    </RadixDialog.Root>
  );
}
