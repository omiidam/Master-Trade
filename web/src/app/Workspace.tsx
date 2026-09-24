import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

/**
 * Workspace layout: the page header plus a content grid.
 *
 * `density` comes from the UI store so the whole workstation can tighten up for
 * users who prefer more rows on screen; pages render their own sections inside.
 */
export function Workspace({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mx-auto flex w-full max-w-[1400px] flex-col gap-5', className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-heading font-semibold tracking-tight text-text">{title}</h2>
          {description ? (
            <p className="mt-0.5 max-w-3xl text-caption text-text-muted">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
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
