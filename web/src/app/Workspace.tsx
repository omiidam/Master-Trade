import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { PageHeader } from './PageHeader';
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
 * The header row is the shared `PageHeader` (Phase 8.5.1): one implementation of the contextual
 * page header, drawn here so every page that renders this frame inherits it. `Workspace` keeps
 * passing the same three fields it always has, so pages change nothing — and a page that needs a
 * context row richer than these fields composes `PageHeader` itself rather than growing a second
 * header implementation.
 */
export function Workspace({
  title,
  description,
  actions,
  breadcrumb,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(SHELL_COLUMN, 'flex flex-col gap-5', className)}>
      <PageHeader
        title={title}
        description={description}
        actions={actions}
        breadcrumb={breadcrumb}
      />
      {children}
    </div>
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
