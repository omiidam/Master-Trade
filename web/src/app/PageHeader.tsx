import type { ReactNode } from 'react';
import { msg } from '../i18n/index.js';
import { cn } from '../lib/cn';

/**
 * The contextual page header: one shared place for a page's identity and context.
 *
 * It sits inside the workspace column, under the shell's chrome (top bar, rail) and above the
 * page's content — the second row of the hierarchy "application shell → page context → page
 * content". It owns no page logic and draws only what it is given: the title is the one required
 * field, and the description, breadcrumb and actions slots stay absent until a page hands them
 * something, so a page that has no context for its name draws nothing extra around it.
 *
 * The heading level is the page's `<h2>` — the shell's top bar owns the document's `<h1>` — so a
 * page renders one identity heading, not a second competing one. Spacing above and below is the
 * workspace column's own rhythm (`gap-5`): the header declares no vertical padding of its own,
 * which is what keeps a page's header and its first card one grid apart rather than two.
 *
 * The layout is a logical-property flex row that wraps, so a long Persian title takes a second
 * line and the actions drop beneath the title rather than overflowing the column; there is no
 * fixed height anywhere in it to break against text it did not expect.
 */
export function PageHeader({
  title,
  description,
  breadcrumb,
  actions,
  className,
}: {
  title: string;
  description?: string;
  breadcrumb?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        {breadcrumb ? (
          <nav
            aria-label={msg('shell.pageBreadcrumb')}
            className="mb-1 flex flex-wrap items-center gap-2 text-caption text-text-faint"
          >
            {breadcrumb}
          </nav>
        ) : null}
        <h2 className="text-heading font-semibold tracking-tight text-text">{title}</h2>
        {description ? (
          <p className="mt-0.5 max-w-3xl text-caption text-text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
