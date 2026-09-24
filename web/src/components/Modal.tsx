import * as RadixDialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { DURATION, EASE, PANEL_IN } from '../design/motion';
import { cn } from '../lib/cn';
import { Button } from './Button';

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' } as const;

/**
 * Modal built on Radix Dialog: focus trapping, escape handling, scroll locking
 * and `aria-modal` semantics come from the primitive; animation is Framer Motion
 * and is skipped when the user prefers reduced motion.
 *
 * Three things make this belong to the workstation rather than to a generic web app:
 *
 *   - the scrim is not a flat dim. `--color-overlay` darkens the page and `.overlay-veil` lays a
 *     faint brand wash across the top, so a dialog opens *inside* the terminal instead of on top of
 *     a plain grey sheet;
 *   - the panel is elevation level 2 as the ladder defines it — the raised surface, the popover
 *     shadow, the panel gradient lighting its top and the lit `.edge-highlight` line. It is the
 *     same depth language as a card, one step up;
 *   - it carries no glow. Glow is the accent's emphasis and the destructive action's warning; a
 *     dialog is neither, and a glowing dialog would make the one accent surface on a screen
 *     ambiguous.
 *
 * Sizing is fluid from the narrowest phone (`w-[92vw]`, a body that scrolls within the viewport)
 * upward: no width is written for a device, and the scroll region is capped in viewport units so a
 * long form never becomes taller than the screen it is on.
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
}: ModalProps) {
  const reduceMotion = useReducedMotion();
  const panel = reduceMotion
    ? {}
    : {
        initial: PANEL_IN.initial,
        animate: PANEL_IN.animate,
        exit: PANEL_IN.exit,
        transition: PANEL_IN.transition,
      };

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <RadixDialog.Portal forceMount>
            <RadixDialog.Overlay asChild forceMount>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : DURATION.fast, ease: EASE.standard }}
                className="fixed inset-0 z-[var(--z-overlay)] bg-overlay overlay-veil backdrop-blur-sm"
              />
            </RadixDialog.Overlay>
            <RadixDialog.Content asChild forceMount>
              <motion.div
                {...panel}
                className={cn(
                  'fixed left-1/2 top-[8vh] z-[var(--z-modal)] w-[92vw] -translate-x-1/2 sm:top-[12vh]',
                  'rounded-[var(--radius-panel)] border border-border-strong',
                  'bg-surface-raised shadow-popover panel-gradient edge-highlight',
                  'focus:outline-none',
                  SIZES[size],
                )}
              >
                <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
                  <div className="min-w-0">
                    <RadixDialog.Title className="text-title font-semibold text-text">
                      {title}
                    </RadixDialog.Title>
                    {description ? (
                      <RadixDialog.Description className="mt-1 text-caption text-text-muted">
                        {description}
                      </RadixDialog.Description>
                    ) : null}
                  </div>
                  <RadixDialog.Close asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      label="Close dialog"
                      aria-label="Close dialog"
                    >
                      <X size={16} aria-hidden />
                    </Button>
                  </RadixDialog.Close>
                </header>
                <div className="max-h-[55vh] overflow-y-auto px-5 py-4 sm:max-h-[62vh]">
                  {children}
                </div>
                {footer ? (
                  <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">
                    {footer}
                  </footer>
                ) : null}
              </motion.div>
            </RadixDialog.Content>
          </RadixDialog.Portal>
        ) : null}
      </AnimatePresence>
    </RadixDialog.Root>
  );
}
