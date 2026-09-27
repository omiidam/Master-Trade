import {
  Activity,
  Blocks,
  BrainCircuit,
  ClipboardCheck,
  Coins,
  FlaskConical,
  Gauge,
  GraduationCap,
  Microscope,
  NotebookPen,
  PieChart,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { NAV_GROUPS, NAV_SECTIONS, navAriaLabel } from '../config/navigation';
import type { NavIconName } from '../config/navigation';
import { Badge } from '../components/Badge';
import { BrandLockup } from '../components/brand';
import { PanelStartIcon } from '../components/Directional';
import { Button, IconButton } from '../components/Button';
import { Tooltip } from '../components/Tooltip';
import { cn } from '../lib/cn';
import { DURATION, EASE } from '../design/motion';
import { useUiStore } from '../store/ui';
import { CardTile } from '../components/Card';
import { msg, useTextDirection } from '../i18n/index.js';
import { useShellLayout } from './useShellLayout';

const ICONS: Record<NavIconName, ReactNode> = {
  gauge: <Gauge size={17} aria-hidden />,
  coins: <Coins size={17} aria-hidden />,
  'pie-chart': <PieChart size={17} aria-hidden />,
  blocks: <Blocks size={17} aria-hidden />,
  sparkles: <Sparkles size={17} aria-hidden />,
  brain: <BrainCircuit size={17} aria-hidden />,
  microscope: <Microscope size={17} aria-hidden />,
  journal: <NotebookPen size={17} aria-hidden />,
  graduation: <GraduationCap size={17} aria-hidden />,
  clipboard: <ClipboardCheck size={17} aria-hidden />,
  flask: <FlaskConical size={17} aria-hidden />,
  settings: <SettingsIcon size={17} aria-hidden />,
  user: <UserRound size={17} aria-hidden />,
  shield: <ShieldCheck size={17} aria-hidden />,
  activity: <Activity size={17} aria-hidden />,
  bell: <Activity size={17} aria-hidden />,
};

/** Which side the rail's tooltips open on, from the direction rather than from a literal. */
type RailSide = 'left' | 'right';

/**
 * The navigation groups — one list, rendered in two places.
 *
 * The rail and the off-canvas drawer are the same navigation, so they share this rather than each
 * keeping a copy that can drift. `collapsed` is the only difference: the rail hides labels and the
 * drawer never does.
 */
function SidebarNav({
  collapsed,
  railSide,
  id,
}: {
  collapsed: boolean;
  railSide: RailSide;
  id?: string;
}) {
  const page = useUiStore((state) => state.page);
  const setPage = useUiStore((state) => state.setPage);

  return (
    <nav
      aria-label={navAriaLabel()}
      {...(id ? { id } : {})}
      className="flex-1 overflow-y-auto px-2 pb-4"
    >
      {NAV_GROUPS.map((group) => {
        const items = NAV_SECTIONS.filter((section) => section.group === group.id);
        if (items.length === 0) return null;
        return (
          <div key={group.id} className="mb-3">
            {collapsed ? (
              <div aria-hidden className="mx-2 my-2 border-t border-border" />
            ) : (
              <p className="px-2 py-1.5 text-caption font-semibold tracking-wide text-text-faint uppercase">
                {msg(group.labelKey)}
              </p>
            )}
            <ul className="space-y-0.5">
              {items.map((section) => {
                const active = page === section.id;
                const button = (
                  <button
                    type="button"
                    onClick={() => setPage(section.id)}
                    aria-current={active ? 'page' : undefined}
                    {...(collapsed ? { 'aria-label': msg(section.labelKey) } : {})}
                    className={cn(
                      'group flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2',
                      'text-start text-body transition-colors duration-[var(--duration-fast)]',
                      active
                        ? 'bg-surface-raised text-text shadow-panel'
                        : 'text-text-muted hover:bg-surface-raised/60 hover:text-text',
                      collapsed && 'justify-center px-0',
                    )}
                  >
                    <span
                      className={cn(
                        'shrink-0',
                        active ? 'text-primary' : 'text-text-faint group-hover:text-text-muted',
                      )}
                    >
                      {ICONS[section.icon]}
                    </span>
                    {collapsed ? null : <span className="truncate">{msg(section.labelKey)}</span>}
                    {collapsed || !active ? null : (
                      <span aria-hidden className="ms-auto h-1.5 w-1.5 rounded-full bg-primary" />
                    )}
                  </button>
                );
                return (
                  <li key={section.id}>
                    {collapsed ? (
                      <Tooltip content={msg(section.labelKey)} side={railSide}>
                        {button}
                      </Tooltip>
                    ) : (
                      button
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

/** The permanent safety statement, in the rail and in the drawer alike. */
function SidebarSafety({ collapsed, railSide }: { collapsed: boolean; railSide: RailSide }) {
  const openSafety = useUiStore((state) => state.setSafetyDialogOpen);

  return (
    <div className="border-t border-border px-3 py-3">
      {collapsed ? (
        <Tooltip
          content={msg('sidebar.safetyLiveTradingAndBrokerExecutionDisabledBy')}
          side={railSide}
        >
          <Button
            variant="ghost"
            size="icon"
            label={msg('sidebar.safetyStatus')}
            onClick={() => openSafety(true)}
          >
            <ShieldCheck size={16} aria-hidden />
          </Button>
        </Tooltip>
      ) : (
        <CardTile space="roomy">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-caption text-text-muted">
              <ShieldCheck size={14} aria-hidden className="text-primary" />
              {msg('shell.safety')}
            </span>
            <Badge tone="primary">{msg('shell.training')}</Badge>
          </div>
          <dl className="mt-2 space-y-1 text-caption text-text-faint">
            <div className="flex items-center justify-between gap-2">
              <dt>{msg('shell.liveTrading')}</dt>
              <dd className="num text-text-muted">{msg('shell.disabled')}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt>{msg('shell.brokerExecution')}</dt>
              <dd className="num text-text-muted">{msg('shell.disabled')}</dd>
            </div>
          </dl>
          <Button variant="ghost" size="sm" className="mt-2 px-0" onClick={() => openSafety(true)}>
            {msg('shell.safetyDetails')}
          </Button>
        </CardTile>
      )}
    </div>
  );
}

/**
 * The rail: the workstation's own navigation, in the flow beside the content.
 *
 * It is sticky and viewport-tall, so the navigation stays put while the workspace scrolls; its
 * width is the one thing the reader controls, and it is the only part of the shell that moves when
 * that preference flips.
 */
function SidebarRail({ collapsed, canCollapse }: { collapsed: boolean; canCollapse: boolean }) {
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const direction = useTextDirection();
  const railSide: RailSide = direction === 'rtl' ? 'left' : 'right';

  return (
    <aside
      className={cn(
        'sticky top-0 flex h-screen flex-col border-e border-border bg-bg-elevated/80 backdrop-blur',
        'transition-[width] duration-[var(--duration-base)] ease-[var(--ease-standard)]',
        collapsed ? 'w-[76px]' : 'w-[264px]',
      )}
    >
      <div className="flex items-center gap-2.5 px-3 py-4">
        {/* The real mark, at the rail's own size. Collapsed it stands alone (with its
            accessible name); expanded the wordmark sits beside it, which is the only
            place the product's name needs to be announced once. */}
        <BrandLockup markSize={36} markOnly={collapsed} />
        {canCollapse ? (
          <IconButton
            label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            variant="ghost"
            size="icon"
            className="ms-auto"
            onClick={toggleSidebar}
          >
            <PanelStartIcon size={16} />
          </IconButton>
        ) : null}
      </div>

      <SidebarNav collapsed={collapsed} railSide={railSide} />
      <SidebarSafety collapsed={collapsed} railSide={railSide} />
    </aside>
  );
}

/**
 * The off-canvas navigation, for the widths that cannot afford a rail.
 *
 * A phone is a third of a phone's width given to a rail, so on mobile the navigation leaves the
 * flow entirely: it is *closed* until asked for, opened from the top bar's trigger, and closed by
 * the reader's own gestures — the close control, the scrim, Escape, or simply choosing a
 * destination (the store closes it on `setPage`).
 *
 * It is a modal surface rather than a panel that happens to be off screen, and it carries the
 * behaviour that word implies:
 *
 *   - `role="dialog"` + `aria-modal`, so assistive technology treats the page behind it as inert;
 *   - focus moves into it on open and returns to whatever opened it on close;
 *   - Tab is cycled inside it, and Escape closes it from anywhere inside;
 *   - the scrim is a real button with a name, so it is reachable and announced — not a bare `div`
 *     with a handler, which no keyboard can reach.
 *
 * The slide is a Framer Motion transform rather than a `translate-x` utility, so it mirrors by the
 * *direction*, not by a class: the drawer arrives from the inline-start edge and leaves the same
 * way, in either language. Under `prefers-reduced-motion` it fades instead of sliding.
 */
function SidebarDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const reduceMotion = useReducedMotion();
  const direction = useTextDirection();
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const railSide: RailSide = direction === 'rtl' ? 'left' : 'right';

  // Move focus into the drawer when it opens, and hand it back to the trigger when it closes.
  useEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    returnFocusRef.current = active instanceof HTMLElement ? active : null;
    const frame = requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      returnFocusRef.current?.focus();
    };
  }, [open]);

  // Escape closes, wherever the focus is inside the drawer.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  // Tab cycles inside the drawer: a modal surface that lets focus wander onto the page behind it is
  // modal in name only.
  const trapFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  // Where the panel starts and leaves: off the inline-start edge, which is the left in a
  // left-to-right interface and the right in a right-to-left one.
  const offscreen = direction === 'rtl' ? '100%' : '-100%';

  return (
    <>
      <AnimatePresence>
        {open ? (
          <motion.button
            key="scrim"
            type="button"
            aria-label={msg('sidebar.closeNavigation')}
            onClick={() => onOpenChange(false)}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : DURATION.fast, ease: EASE.standard }}
            className="fixed inset-0 z-[var(--z-overlay)] cursor-default bg-overlay backdrop-blur-sm"
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {open ? (
          <motion.div
            key="panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={msg('sidebar.navigationMenu')}
            tabIndex={-1}
            onKeyDown={trapFocus}
            initial={reduceMotion ? false : { x: offscreen }}
            animate={{ x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { x: offscreen }}
            transition={{ duration: reduceMotion ? 0 : DURATION.base, ease: EASE.emphasis }}
            className={cn(
              'fixed inset-y-0 start-0 z-[var(--z-modal)] flex w-[280px] max-w-[85vw] flex-col',
              'border-e border-border bg-bg-elevated shadow-popover',
              'focus:outline-none',
            )}
          >
            <div className="flex items-center gap-2.5 px-3 py-4">
              <BrandLockup markSize={36} />
              <IconButton
                label={msg('sidebar.closeNavigation')}
                variant="ghost"
                size="icon"
                className="ms-auto"
                onClick={() => onOpenChange(false)}
              >
                <X size={16} aria-hidden />
              </IconButton>
            </div>

            <SidebarNav collapsed={false} railSide={railSide} id="shell-navigation" />
            <SidebarSafety collapsed={false} railSide={railSide} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

/**
 * The navigation surface, in whichever form the current width can afford.
 *
 * Desktop and laptop get the rail the reader controls; tablet gets the icon rail it cannot; mobile
 * gets the off-canvas drawer. The decision is the shell layout model's, not this component's, so
 * there is exactly one place that turns a viewport width into a behaviour.
 */
export function Sidebar() {
  const layout = useShellLayout();
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen);

  if (layout.isDrawer) {
    return <SidebarDrawer open={sidebarOpen} onOpenChange={setSidebarOpen} />;
  }

  return <SidebarRail collapsed={layout.rail === 'collapsed'} canCollapse={layout.canCollapse} />;
}
