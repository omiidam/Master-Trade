import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { BrandMark } from '../components/brand';
import { FADE_UP } from '../design/motion';
import { useUiStore } from '../store/ui';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { msg, useDocumentLanguage } from '../i18n/index.js';

/**
 * Application shell: sidebar + topbar + scrollable workspace.
 *
 * The shell owns no domain state. It is RTL-ready because every spacing rule is
 * a logical property (`ms-*`, `ps-*`, `border-e`), so flipping `dir` on <html>
 * mirrors the layout without a second stylesheet.
 */
export function AppShell({ children }: { children: ReactNode }) {
  // One subscription to the interface language, at the top of the tree: it puts the language on `<html lang>`
  // and it is what re-renders every page and every component that reads `msg()` when the switch moves.
  useDocumentLanguage();
  const page = useUiStore((state) => state.page);
  const density = useUiStore((state) => state.density);
  const reduceMotion = useReducedMotion();

  return (
    <div className="flex min-h-screen">
      <a
        href="#workspace-main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[var(--z-modal)] focus:m-3 focus:rounded-[var(--radius-control)] focus:bg-surface-raised focus:px-3 focus:py-2 focus:text-body focus:text-text"
      >
        {msg('shell.skipToWorkspaceContent')}
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main
          id="workspace-main"
          tabIndex={-1}
          className={density === 'compact' ? 'flex-1 px-4 py-4' : 'flex-1 px-5 py-5'}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={page}
              {...(reduceMotion
                ? {}
                : {
                    initial: FADE_UP.initial,
                    animate: FADE_UP.animate,
                    transition: FADE_UP.transition,
                  })}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
        <footer className="flex items-center gap-2 border-t border-border px-5 py-3 text-caption text-text-faint">
          {/* The footer is a public surface of the product, so it carries the mark —
              decorative here, because the sentence beside it already names Master Trade. */}
          <BrandMark size={18} />
          <span>{msg('shell.masterTradeTrainingWorkstationLiveTrading')}</span>
        </footer>
      </div>
    </div>
  );
}
