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
                className="fixed inset-0 z-[var(--z-overlay)] bg-black/70 backdrop-blur-sm"
              />
            </RadixDialog.Overlay>
            <RadixDialog.Content asChild forceMount>
              <motion.div
                {...panel}
                className={cn(
                  'fixed left-1/2 top-[12vh] z-[var(--z-modal)] w-[92vw] -translate-x-1/2',
                  'rounded-[var(--radius-panel)] border border-border-strong bg-surface shadow-popover',
                  'focus:outline-none',
                  SIZES[size],
                )}
              >
                <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
                  <div>
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
                <div className="max-h-[62vh] overflow-y-auto px-5 py-4">{children}</div>
                {footer ? (
                  <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
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
