import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, type ReactNode } from 'react';
import { BrandMark } from '../components/brand';
import { FADE_UP } from '../design/motion';
import { useUiStore } from '../store/ui';
import { QuickNav } from './QuickNav';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { SHELL_GUTTER } from './shellLayout';
import { useShellLayout } from './useShellLayout';
import { useDocumentTheme } from './useDocumentTheme';
import { usePageHistory } from './usePageHistory';
import { msg, useDocumentLanguage } from '../i18n/index.js';
import { cn } from '../lib/cn';
import { SectionOrigin } from './contentSurface';

/**
 * Application shell: sidebar + topbar + scrollable workspace.
 *
 * The shell owns no domain state. It is RTL-ready because every spacing rule is
 * a logical property (`ms-*`, `ps-*`, `border-e`), so flipping `dir` on <html>
 * mirrors the layout without a second stylesheet.
 *
 * What "scrollable" means is stated in one place — `contentSurface.tsx`: the window is the one
 * surface, the rail and the bar are chrome around it, and a section begins at its own origin.
 */
export function AppShell({ children }: { children: ReactNode }) {
  // One subscription to the interface language, at the top of the tree: it puts the language on `<html lang>`
  // and it is what re-renders every page and every component that reads `msg()` when the switch moves.
  useDocumentLanguage();
  // The reader's theme, on the document element, for the same reason the language is above: the
  // attribute is what the stylesheet selects on, so one call repaints the whole product and nothing
  // in the tree has to know which theme is active.
  useDocumentTheme();
  // The browser's Back and Forward walk the fourteen sections the reader has visited, and the shell
  // follows them. It is called here, once, for the same reason the language is: a second connection
  // would record every move twice and apply one traversal twice.
  usePageHistory();
  const page = useUiStore((state) => state.page);
  const density = useUiStore((state) => state.density);
  const reduceMotion = useReducedMotion();
  // The off-canvas drawer exists only in the mobile mode. A drawer left open while the window grows
  // would be a state the rail has no way to show, so leaving mobile closes it rather than leaving it
  // to reappear the next time the window narrows.
  const layout = useShellLayout();
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen);
  useEffect(() => {
    if (layout.mode !== 'mobile' && sidebarOpen) setSidebarOpen(false);
  }, [layout.mode, sidebarOpen, setSidebarOpen]);

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
        {/* The region's inset is the window's (`SHELL_GUTTER`) and only its vertical rhythm answers
            to `density` — so tightening the workspace for a reader moves nothing sideways, and the
            page below begins at the same edge as the title above it.

            The rhythm is deliberately asymmetric (Phase 8.5.2.1): the top padding is the breathing
            space between the top bar and the page's context row — one spacing step tighter than
            before, because the section's name is drawn once up there and the context row under it
            is context, not a second title — while the bottom padding keeps the old step, so the
            distance to the footer is unchanged. The gap between the context row and the page's
            content is the workspace column's own (`gap-5`), and is not touched by this. */}
        <main
          id="workspace-main"
          tabIndex={-1}
          className={cn('flex-1', SHELL_GUTTER, density === 'compact' ? 'pt-3 pb-4' : 'pt-4 pb-5')}
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
              {/* A section is presented from its own beginning, inside the keyed surface so the
                  reset lands with the new section rather than on the one still leaving. */}
              <SectionOrigin />
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
        <footer
          className={cn(
            'flex items-center gap-2 border-t border-border py-3 text-caption text-text-faint',
            SHELL_GUTTER,
          )}
        >
          {/* The footer is a public surface of the product, so it carries the mark —
              decorative here, because the sentence beside it already names Master Trade. */}
          <BrandMark size={18} />
          <span>{msg('shell.masterTradeTrainingWorkstationLiveTrading')}</span>
        </footer>
      </div>
      {/* The quick-navigation palette: not a region of the shell but a surface over it, so it is
          mounted once here and draws nothing until it is asked for. It is the only part of the
          shell that exists on every page while belonging to none of them. */}
      <QuickNav />
    </div>
  );
}
