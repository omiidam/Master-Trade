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
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, type ReactNode } from 'react';
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
import { COMPACT_SHELL_QUERY } from './shellLayout';
import { QUICK_NAV_KEYS, quickNavShortcut } from './navSearch';

/**
 * The glyph each destination is drawn with.
 *
 * Exported because a destination has *one* icon, not one per surface: the rail draws these and so does
 * the quick-navigation palette, and a second map would be the place the two started to disagree about
 * what Research looks like.
 */
export const NAV_ICONS: Record<NavIconName, ReactNode> = {
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
 * What counts as a stop inside the off-canvas drawer, for the wrap in `SidebarDrawer` below.
 *
 * Native controls, and an explicit `tabindex` that is not `-1` — the second half is what keeps a
 * programmatically focusable container out of a list whose whole job is to describe the tab order,
 * and the drawer's own panel is exactly that (`tabIndex={-1}`, focused on open).
 */
const FOCUSABLE_IN_DIALOG =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
        {NAV_ICONS[section.icon]}
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

/**
 * The way into the quick-navigation palette, drawn above the navigation.
 *
 * It sits *beside* the navigation rather than inside it, and that is the whole reason it is its own
 * component: `<nav>` is the list of fourteen destinations, and a search field among them would be a
 * fifteenth thing to tab past on the way to a page, a fifteenth entry for every suite that counts what
 * the navigation offers, and — the part that actually matters — a row that looks like a destination
 * and is not one. The rail above it is what the reader reads; this is what the reader *asks*.
 *
 * It carries the shortcut in both presentations, because a keyboard route nobody can see is a route
 * only the person who wrote it knows: expanded it sits at the end of the row like the field it stands
 * in for, and collapsed the tooltip says the same thing the label would have. The two rows are the
 * same box as the entries below them — the same padding, the same 22px glyph slot — so the rail still
 * reads as one column rather than as a control that arrived from somewhere else.
 */
function QuickNavTrigger({ collapsed, railSide }: { collapsed: boolean; railSide: RailSide }) {
  const quickNavOpen = useUiStore((state) => state.quickNavOpen);
  const setQuickNavOpen = useUiStore((state) => state.setQuickNavOpen);
  const shortcut = quickNavShortcut();

  const button = (
    <button
      type="button"
      // Told the truth about what it does: this opens a dialog, and a screen reader can say so
      // without the dialog having to be in the document first.
      aria-haspopup="dialog"
      aria-expanded={quickNavOpen}
      aria-keyshortcuts={QUICK_NAV_KEYS}
      {...(collapsed ? { 'aria-label': msg('shell.quickNav') } : {})}
      onClick={() => setQuickNavOpen(true)}
      className={cn(
        'group flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2',
        'text-start text-body text-text-muted transition-colors duration-[var(--duration-fast)]',
        'hover:bg-surface-raised/60 hover:text-text',
        collapsed && 'justify-center',
      )}
    >
      <span className="grid size-[22px] shrink-0 place-items-center text-text-faint group-hover:text-text-muted">
        <Search size={16} aria-hidden />
      </span>
      {collapsed ? null : <span className="truncate">{msg('shell.quickNav')}</span>}
      {collapsed ? null : (
        // `leading-none` is not decoration: the chip's line box is what would otherwise decide this
        // row's height, and one pixel taller than the 22px glyph slot beside it is one pixel taller
        // than every entry below it.
        <kbd className="num ms-auto shrink-0 rounded-[var(--radius-control)] border border-border px-1.5 py-0.5 text-caption leading-none text-text-faint">
          {shortcut}
        </kbd>
      )}
    </button>
  );

  return (
    <div className="px-2 pb-1">
      {collapsed ? (
        // The label went with the width, so the tooltip says what the row is *and* how to ask for it
        // from the keyboard — which is the one thing an icon-only rail cannot show.
        <Tooltip
          content={
            <>
              <span className="block">{msg('shell.quickNav')}</span>
              <span className="mt-0.5 block text-text-muted">{shortcut}</span>
            </>
          }
          side={railSide}
        >
          {button}
        </Tooltip>
      ) : (
        button
      )}
    </div>
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
function SidebarRail({ collapsed }: { collapsed: boolean }) {
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
        {/* Always rendered, and *offered* only where the window can honour the choice.

            It used to be mounted only when `canCollapse` was true, and that made the control's
            existence depend on a JavaScript boolean the shell can only learn from a media query —
            which the browser is free to answer late. Measured in this product: resizing from a
            tablet back to a laptop, `resize` ran immediately while the matching `matchMedia`
            `change` arrived ~410ms later, and for that whole window the shell believed it was
            still a tablet. The rail was already at the width that honours the reader's choice
            while offering no way to change it, so a window that could expand the rail had no
            expand control until an unrelated, arbitrarily-timed event landed.

            The boundary belongs to CSS now, and it is the model's own: `max-[1099px]` is one pixel
            below `SHELL_WIDTHS.tablet` (1100), which is where `canCollapseRail` stops being true.
            `display: none` is not a softer "hidden" — it takes the control out of the layout and
            out of the accessibility tree, so a phone or a tablet is still offered nothing, which
            is the rule this rail has always kept.

            The click is guarded as well as the appearance, because those are two different claims:
            hiding says the reader is not offered a choice this window cannot honour, and the guard
            is what stops a press from *spending* the standing preference anyway. A rail that only
            hid the control would let any other path through — a keyboard activation, a scripted
            click — rewrite a choice the window had no room to honour.

            The guard asks the *same query the CSS asked*, read live, at the moment of the press.
            It deliberately does not use `canCollapse` from the hook: that value is the one that
            arrives late, and refusing a press because of it would trade a missing control for a
            control that silently does nothing. `matchMedia(...).matches` is read from the viewport
            as it is now, so the decision and the appearance cannot disagree. */}
        <IconButton
          // The shell's own control names itself in the interface language, like every other
          // control around it. It was the last accessible name in the chrome written in English
          // whatever the interface was being read in, which left the one control that changes the
          // shape of the shell as the only thing in a Persian screen a reader could not read.
          label={msg(collapsed ? 'sidebar.expandSidebar' : 'sidebar.collapseSidebar')}
          variant="ghost"
          size="icon"
          // One pixel below `SHELL_WIDTHS.tablet`, which is `COMPACT_SHELL_QUERY` — the same
          // boundary the press below is guarded on, and the width at which the rail stops being
          // the reader's to change.
          className="ms-auto max-[1099px]:hidden"
          onClick={() => {
            if (!window.matchMedia(COMPACT_SHELL_QUERY).matches) toggleSidebar();
          }}
        >
          <PanelStartIcon size={16} />
        </IconButton>
      </div>

      <QuickNavTrigger collapsed={collapsed} railSide={railSide} />
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
 *   - Tab is cycled inside it from anywhere, and Escape closes it from anywhere inside;
 *   - the scrim is a real button with a name, so it is announced and a pointer has a target that says
 *     what it does — but it is not a tab stop: it is the whole viewport, so a ring drawn on it lands
 *     outside the window. The keyboard's three ways out are the close control, Escape, and choosing a
 *     destination.
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

  /**
   * Escape closes the drawer, and Tab cycles inside it — both read from the document.
   *
   * The two together are one decision, and it is a measured correction rather than a preference. A
   * handler on the panel only sees a key press while the focus is already inside the panel, and the
   * drawer is opened *with the focus on the panel itself* (`tabIndex={-1}`). `Shift+Tab` from a
   * container is not a move to its own last control: it is a move to the previous tabbable thing in
   * the document — which is the scrim, and after that the skip link behind the dialog. So two presses
   * of `Shift+Tab` walked the keyboard out of a surface that declares `aria-modal`, onto a
   * full-viewport control that cannot paint a focus ring anywhere a reader could see it, and then
   * onto the page behind. `frontend-shell-layout.test.ts` records the shell's side of this; the
   * browser case is the one that drives it with real keys.
   *
   * So the question is asked of the focus itself rather than of the first and last control: wherever
   * the focus is, if it is not inside the panel, the next press wraps to the end of the panel it is
   * trying to leave. Walking forward past the last control and backward past the first still wrap,
   * exactly as they did.
   */
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(FOCUSABLE_IN_DIALOG);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const current = document.activeElement;
      // `contains` is true of the panel *itself*, and the panel is where the drawer opens — so "inside"
      // means a control of the panel's, measured by excluding it. Without the exclusion the first
      // `Shift+Tab` after opening is not a wrap at all: the panel counts as an interior position and the
      // press is left to the browser, which is how it reached the page behind in the first place.
      const inside = current instanceof HTMLElement && current !== panel && panel.contains(current);
      const leaving = event.shiftKey ? current === first || !inside : current === last || !inside;
      if (!leaving) return;
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

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
            // Named, so it is a control rather than a div with a handler — and *not* a tab stop,
            // which is the honest box for it: it is the whole viewport, so the ring measured on it at
            // 390×844 was drawn 4px outside the window at the top and the bottom, and a keyboard user
            // arrived at a stop that showed them nothing.
            tabIndex={-1}
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

            <QuickNavTrigger collapsed={false} railSide={railSide} />
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

  return <SidebarRail collapsed={layout.rail === 'collapsed'} />;
}
