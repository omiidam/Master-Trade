import type { ReactNode } from 'react';
import type { MessageKey } from '../i18n/index.js';
import { cn } from '../lib/cn';
import { BreadcrumbTrail } from './Breadcrumb';
import { PageHeader } from './PageHeader';
import { navTrail, type NavCrumb } from '../config/navigation.js';
import { useUiStore } from '../store/ui';
import { SHELL_COLUMN } from './shellLayout';

/**
 * Workspace layout: the page header plus a content grid.
 *
 * `density` comes from the UI store so the whole workstation can tighten up for
 * users who prefer more rows on screen; pages render their own sections inside.
 *
 * The column's width is `SHELL_COLUMN` rather than a literal here, because it is not this component's
 * number: the top bar above it and the footer below it are held to the same edge (Phase 8.3.1).
 *
 * The header row is the shared `PageHeader` (Phase 8.5.1), and its breadcrumb slot carries the
 * contextual trail (Phase 8.5.2): derived once from the navigation model for the page the store
 * says the reader is on, so every page that renders this frame inherits the same trail for free.
 * A page that wants a *deeper* trail for a detail view hands `Workspace` — or `PageHeader`
 * directly — its own `trail`, and the derived default is set aside, not merged: the current place
 * stays the last word, and the group context stays out of the way of a page that knows a longer
 * story. A page that hands the slot its own `breadcrumb` node draws exactly that.
 */
export function Workspace({
  title,
  description,
  actions,
  breadcrumb,
  trail,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
  /** A page's own, deeper trail; the default derives from the current section. */
  trail?: readonly NavCrumb[];
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(SHELL_COLUMN, 'flex flex-col gap-5', className)}>
      <PageHeader
        title={title}
        description={description}
        actions={actions}
        breadcrumb={breadcrumb ?? <WorkspaceBreadcrumb override={trail} />}
      />
      {children}
    </div>
  );
}

/**
 * The frame's default trail, derived from the page the reader is actually on.
 *
 * Read from the store here rather than passed down by pages, because the trail is a fact about
 * *where the shell is* — the same fact the rail's `aria-current` states — and a fact stated in one
 * place cannot drift out of step with the sidebar. A page that passes its own `trail` sets this
 * aside entirely rather than extending it, so a detail page's longer story is the page's decision
 * and the shell's default never surprises it.
 */
function WorkspaceBreadcrumb({ override }: { override?: readonly NavCrumb[] }) {
  const page = useUiStore((state) => state.page);
  const items = override ?? navTrail(page);
  return (
    <BreadcrumbTrail
      trail={items.map((crumb) => ({ ...crumb, labelKey: crumb.labelKey as MessageKey }))}
    />
  );
}

/** Responsive card grid used by every page; keeps spacing consistent. */
export function Grid({
  columns = 3,
  children,
  className,
}: {
  columns?: 2 | 3 | 4;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid gap-4',
        columns === 2 && 'grid-cols-1 lg:grid-cols-2',
        columns === 3 && 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3',
        columns === 4 && 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4',
        className,
      )}
    >
      {children}
    </div>
  );
}
