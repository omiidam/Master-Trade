import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

/**
 * The page's contextual actions: one shared row, and the only place a page's controls are laid out.
 *
 * It is the `actions` slot of the contextual header (Phase 8.5.1), drawn as its own component since
 * Phase 8.5.3 so the row's behaviour is stated once rather than being re-decided by each page that
 * has something to put in it. The pages hand *children* — buttons, badges, a connection state — and
 * this decides how they sit: in logical order, at the inline-end of the header row, wrapping onto
 * their own line when there is no room rather than pushing the page sideways.
 *
 * What it deliberately does not do: it introduces no control, no variant and no icon. The controls
 * come from the design system as they always have (`Button`'s `primary`/`secondary`/`subtle`
 * variants and its sizes, `IconButton` for an icon-only control, `Badge` for status), so a page's
 * hierarchy is chosen by the page and only the *arrangement* is shared. The row is also the reason
 * the mobile behaviour needs no separate implementation: `flex-wrap` with `min-w-0` is what makes
 * four Persian-labelled controls stack instead of overflow, and there is no fixed width, height or
 * breakpoint here for a later change to break against.
 *
 * Rules the row exists to hold, all of them inherited from the design system rather than invented
 * here: a control carries an accessible name (its own text, or `label` on an icon-only control); a
 * status chip is a `Badge`, not a button, and stays the least prominent thing in the row; status
 * and action are visually distinguishable, so a page reads as one commitment plus context rather
 * than a row of equally loud buttons. Actions that the top bar already offers are not repeated
 * here — this row is for operations that belong to *this* page.
 */
export function PageActions({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      // A hook for the browser suite: the one place a page's actions are rendered, so a case can
      // find the row rather than guessing at a div by its class list (the shell already does this
      // for the rail's entries with `data-nav-id`).
      data-page-actions
      className={cn('flex min-w-0 flex-wrap items-center gap-2', className)}
    >
      {children}
    </div>
  );
}
