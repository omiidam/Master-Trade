import {
  Activity,
  BrainCircuit,
  ClipboardCheck,
  FlaskConical,
  Gauge,
  GraduationCap,
  Microscope,
  NotebookPen,
  PanelLeft,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { NAV_ARIA_LABEL, NAV_GROUPS, NAV_SECTIONS } from '../config/navigation';
import type { NavIconName } from '../config/navigation';
import { Badge } from '../components/Badge';
import { Button, IconButton } from '../components/Button';
import { Tooltip } from '../components/Tooltip';
import { cn } from '../lib/cn';
import { COMPACT_SHELL_QUERY, useMediaQuery } from '../lib/useMediaQuery';
import { useUiStore } from '../store/ui';

const ICONS: Record<NavIconName, ReactNode> = {
  gauge: <Gauge size={17} aria-hidden />,
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

export function Sidebar() {
  const page = useUiStore((state) => state.page);
  const setPage = useUiStore((state) => state.setPage);
  const userCollapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const openSafety = useUiStore((state) => state.setSafetyDialogOpen);
  // Desktop-first: below the breakpoint the rail collapses to icons so the
  // workspace keeps its width, regardless of the user's saved preference.
  const compactShell = useMediaQuery(COMPACT_SHELL_QUERY);
  const collapsed = userCollapsed || compactShell;

  return (
    <aside
      className={cn(
        'sticky top-0 flex h-screen flex-col border-e border-border bg-bg-elevated/80 backdrop-blur',
        'transition-[width] duration-[var(--duration-base)] ease-[var(--ease-standard)]',
        collapsed ? 'w-[76px]' : 'w-[264px]',
      )}
    >
      <div className="flex items-center gap-2.5 px-3 py-4">
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-control)] bg-[linear-gradient(140deg,var(--color-primary),var(--color-info))] text-primary-fg shadow-glow"
        >
          <span className="text-body font-bold">M</span>
        </span>
        {collapsed ? null : (
          <div className="min-w-0">
            <p className="truncate text-body font-semibold text-text">Master Trade</p>
            <p className="truncate text-caption text-text-faint">Training workstation</p>
          </div>
        )}
        {compactShell ? null : (
          <IconButton
            label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            variant="ghost"
            size="icon"
            className="ms-auto"
            onClick={toggleSidebar}
          >
            <PanelLeft size={16} aria-hidden />
          </IconButton>
        )}
      </div>

      <nav aria-label={NAV_ARIA_LABEL} className="flex-1 overflow-y-auto px-2 pb-4">
        {NAV_GROUPS.map((group) => {
          const items = NAV_SECTIONS.filter((section) => section.group === group.id);
          if (items.length === 0) return null;
          return (
            <div key={group.id} className="mb-3">
              {collapsed ? (
                <div aria-hidden className="mx-2 my-2 border-t border-border" />
              ) : (
                <p className="px-2 py-1.5 text-caption font-semibold tracking-wide text-text-faint uppercase">
                  {group.label}
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
                      {...(collapsed ? { 'aria-label': section.label } : {})}
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
                      {collapsed ? null : <span className="truncate">{section.label}</span>}
                      {collapsed || !active ? null : (
                        <span aria-hidden className="ms-auto h-1.5 w-1.5 rounded-full bg-primary" />
                      )}
                    </button>
                  );
                  return (
                    <li key={section.id}>
                      {collapsed ? (
                        <Tooltip content={section.label} side="right">
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

      <div className="border-t border-border px-3 py-3">
        {collapsed ? (
          <Tooltip
            content="Safety: live trading and broker execution disabled by design"
            side="right"
          >
            <Button
              variant="ghost"
              size="icon"
              label="Safety status"
              onClick={() => openSafety(true)}
            >
              <ShieldCheck size={16} aria-hidden />
            </Button>
          </Tooltip>
        ) : (
          <div className="rounded-[var(--radius-control)] border border-border bg-surface-sunken p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-caption text-text-muted">
                <ShieldCheck size={14} aria-hidden className="text-primary" />
                Safety
              </span>
              <Badge tone="primary">Training</Badge>
            </div>
            <dl className="mt-2 space-y-1 text-caption text-text-faint">
              <div className="flex items-center justify-between gap-2">
                <dt>Live trading</dt>
                <dd className="num text-text-muted">disabled</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt>Broker execution</dt>
                <dd className="num text-text-muted">disabled</dd>
              </div>
            </dl>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 px-0"
              onClick={() => openSafety(true)}
            >
              Safety details
            </Button>
          </div>
        )}
      </div>
    </aside>
  );
}
