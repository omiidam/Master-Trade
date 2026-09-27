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
import { NAV_MODEL, navAriaLabel } from '../config/navigation';
import type { NavGroupModel, NavIconName, NavSection } from '../config/navigation';
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
 * One navigation entry — the rail's and the drawer's, in one place.
 *
 * There is exactly one of these, and that is the point: a destination is drawn once, so the rail and
 * the off-canvas drawer cannot drift apart in where they point or in how they say they are current.
 * `collapsed` is the only thing that differs between them — a label-less entry keeps its accessible
 * name, gains the tooltip that stands in for the label it lost, and centres its icon; everything
 * else about it is the same control.
 *
 * It is a real `<button>` rather than a link, and deliberately: the workspace has no router and no
 * address for a page, so a link would promise a URL, a new tab and a middle-click target that do not
 * exist. A button is what is actually there — reachable by Tab, activated by Enter or Space, and
 * named for a screen reader. `aria-current` is the one thing this control has to *know* (rather than
 * inherit from where it sits), which is why it is derived here from the store's page: the entry and
 * the workspace read the same field, so the rail cannot announce a page the workspace is not showing.
 *
 * It is also *one box* in both presentations. The icon sits in a fixed square slot, so the row's
 * height is that slot or the label's line, whichever is taller — the same either way. Collapsing the
 * rail narrows the entries and takes their labels away; it does not re-flow them, so the icon a
 * reader is aiming at stays where it was.
 *
 * The states an entry has, and the two it deliberately does not:
 *
 *   - **default** — muted text, faint icon.
 *   - **hover** — the raised surface at 60%, the text lifted to full.
 *   - **focus** — the product's own ring, inherited from the global `:focus-visible` outline. This
 *     control never removes it; the drawer *panel* is the one surface in this file that does, and it
 *     may, because a dialog is not a control (`frontend-integration.test.ts` records that exception).
 *   - **current** — the raised surface, a panel shadow, a primary-tinted icon and, where there is room
 *     for one, a dot beside the label: the page being read is never signalled by colour alone.
 *
 *   - no **disabled**, because all fourteen pages exist and are reachable. A greyed-out entry would
 *     state something the product does not, so the state is a decision waiting for a reason rather
 *     than a class waiting for a reason to be used.
 *   - no separate **selected**: the page being read *is* the selection, which is what
 *     `aria-current="page"` already says. A second highlight would have to mean something else, and
 *     nothing in the workspace means anything else.
 *
 * `data-nav-id` is the entry's semantic identifier: the section id, which the interface language
 * never changes. A surface that has to name a destination without drawing it — a test, or the
 * breadcrumb a later phase might add — can ask for `portfolio` rather than for the English word or the
 * Persian one it is currently wearing.
 */
function NavItem({
  section,
  collapsed,
  railSide,
}: {
  section: NavSection;
  collapsed: boolean;
  railSide: RailSide;
}) {
  const page = useUiStore((state) => state.page);
  const setPage = useUiStore((state) => state.setPage);
  const active = page === section.id;

  const button = (
    <button
      type="button"
      data-nav-id={section.id}
      onClick={() => setPage(section.id)}
      aria-current={active ? 'page' : undefined}
      {...(collapsed ? { 'aria-label': msg(section.labelKey) } : {})}
      className={cn(
        'group flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2',
        'text-start text-body transition-colors duration-[var(--duration-fast)]',
        active
          ? 'bg-surface-raised text-text shadow-panel'
          : 'text-text-muted hover:bg-surface-raised/60 hover:text-text',
        // Collapsed, the slot is all that is left to centre. The padding stays symmetric, so the
        // icon's centre is the row's centre rather than a number tuned for an icon-only rail.
        collapsed && 'justify-center',
      )}
    >
      <span
        className={cn(
          'grid size-[22px] shrink-0 place-items-center',
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
    <li>
      {collapsed ? (
        <Tooltip content={entryTooltip(section)} side={railSide}>
          {button}
        </Tooltip>
      ) : (
        button
      )}
    </li>
  );
}

/**
 * What the collapsed rail says when the label is gone: the entry's name, and what it opens.
 *
 * The collapsed rail is the only presentation that needs telling. When there is room, the label is
 * drawn beside the icon and a popover repeating it would be noise — which is why the drawer, which
 * always has room, draws no tooltips at all. Both lines come from the same catalogue the page itself
 * reads, so a tooltip cannot promise something the destination does not hold.
 */
function entryTooltip(section: NavSection): ReactNode {
  return (
    <>
      <span className="block">{msg(section.labelKey)}</span>
      <span className="mt-0.5 block text-text-muted">{msg(section.descriptionKey)}</span>
    </>
  );
}

/**
 * One group of entries, under the heading the rail has room for when it is expanded.
 *
 * Collapsed, the heading has no room to be read, so it becomes a rule instead of vanishing: the
 * grouping is still drawn, and it is still the same grouping. A group that declares no entries draws
 * nothing at all — one line of defence against a heading over empty space.
 */
function NavGroup({
  group,
  collapsed,
  railSide,
}: {
  group: NavGroupModel;
  collapsed: boolean;
  railSide: RailSide;
}) {
  if (group.items.length === 0) return null;

  return (
    <div
      className="mb-3"
      // The grouping is exposed to assistive technology in *both* presentations, and its name comes
      // from the catalogue rather than from the drawn heading — which is what lets it survive the
      // collapsed rail, where the heading has no room and becomes a rule instead. `data-nav-group`
      // is the same grouping as a value: `workspace`, `learning`, `system`.
      role="group"
      aria-label={msg(group.labelKey)}
      data-nav-group={group.id}
    >
      {collapsed ? (
        <div aria-hidden className="mx-2 my-2 border-t border-border" />
      ) : (
        <p className="px-2 py-1.5 text-caption font-semibold tracking-wide text-text-faint uppercase">
          {msg(group.labelKey)}
        </p>
      )}
      <ul className="space-y-0.5">
        {group.items.map((section) => (
          <NavItem key={section.id} section={section} collapsed={collapsed} railSide={railSide} />
        ))}
      </ul>
    </div>
  );
}

/**
 * The navigation — one list, rendered in two places.
 *
 * The rail and the off-canvas drawer are the same navigation, so they share this rather than each
 * keeping a copy that can drift. `collapsed` is the only difference: the rail hides labels and the
 * drawer never does.
 *
 * It draws `NAV_MODEL`, so which entry belongs under which heading — and the order the headings
 * themselves appear in — is decided in the configuration, not here. This component's whole job is
 * the landmark and the spacing.
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
  return (
    <nav
      aria-label={navAriaLabel()}
      {...(id ? { id } : {})}
      className="flex-1 overflow-y-auto px-2 pb-4"
    >
      {NAV_MODEL.map((group) => (
        <NavGroup key={group.id} group={group} collapsed={collapsed} railSide={railSide} />
      ))}
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
 * The reveal is a Framer Motion clip rather than a `translate-x` utility, so it mirrors by the
 * *direction*, not by a class: the drawer opens from the inline-start edge and closes back into it,
 * in either language — and, because the panel itself never moves, its box stays inside the layout
 * viewport even in the mirrored case, where "off-canvas" would otherwise mean "past the right edge".
 * Under `prefers-reduced-motion` it fades instead of revealing.
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

  /**
   * How the drawer goes out of sight: it is *clipped*, not pushed past the edge it is anchored to.
   *
   * The panel is `fixed` to the inline-start edge, which is the left in a left-to-right interface and
   * the right in a right-to-left one — and in the mirrored case that edge is the *right* one, the edge a
   * layout viewport measures its overflow against. Carrying the panel off-canvas by its own width would
   * therefore put every box inside it past that edge for the length of the animation, which is a real
   * defect rather than a flourish: a phone in Persian shows it, and a phone in English hides the very
   * same mistake, because `-100%` moves the panel away from the edge being measured.
   *
   * So the panel never moves. Its box is the edge it belongs to, and the reveal is a clip that opens
   * from that edge — the same gesture, mirrored the same way, and unable to widen the page while it
   * runs. The clip overshoots the box by a fifth of the panel's own size so the shadow is never the
   * thing being cut off.
   */
  const revealed = 'inset(-20% -20% -20% -20%)';
  const concealed =
    direction === 'rtl' ? 'inset(-20% -20% -20% 100%)' : 'inset(-20% 100% -20% -20%)';

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
            initial={reduceMotion ? false : { clipPath: concealed }}
            animate={{ clipPath: revealed }}
            exit={reduceMotion ? { opacity: 0 } : { clipPath: concealed }}
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
