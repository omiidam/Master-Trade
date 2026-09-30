import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

/**
 * The contextual page header: one shared place for a page's context, identity and actions.
 *
 * It sits inside the workspace column, under the shell's chrome (top bar, rail) and above the
 * page's content — the second row of the hierarchy "application shell → page context → page
 * content". It owns no page logic and draws only what it is given, and **every field is
 * optional**: a header with no title, no description, no breadcrumb and no actions draws nothing
 * at all, so a page never renders a row it has nothing to say in.
 *
 * The title is optional *on purpose* (Phase 8.5.2.1). The section's identity is already stated
 * twice above the content — the top bar's `<h1>` and the trail's last crumb — and a page whose
 * title only restates that identity is a third repetition, not information. When a page does have
 * a genuinely distinct name (a real subpage), it hands `title` and gets the page's `<h2>`: the
 * shell's top bar owns the document's `<h1>`, so a page heading is always an `<h2>`, never a
 * second competing one. A page that hands no title draws no heading — the page's own sections
 * (the `Section` component's `<h2>`s) carry the document outline instead, which is what an outline
 * should describe: the content's chapters, not a name the chrome already said.
 *
 * A description is a different judgement: it is information, not identity, and the slot stays for
 * a page that has something to say the chrome does not. The fourteen sections hand none (Phase
 * 8.5.2.1): their explanation lives once, in the top bar's subtitle, and a paragraph under the
 * trail was the same sentence twice. Feature-level descriptions — a card's, a metric's, an error
 * state's — are a different thing and are untouched. Spacing above and below is the workspace column's own
 * rhythm (`gap-5`): the header declares no vertical padding of its own, which is what keeps the
 * header and the page's first card one grid apart rather than two, and what lets a titleless
 * header close the row up naturally instead of leaving a gap where a heading used to be.
 *
 * The `breadcrumb` slot is rendered *as it is given*, at the top of the row and subordinate to
 * everything under it — the list's name belongs to the breadcrumb itself (`Breadcrumb` renders the
 * labelled `<ol>`), so this component adds no wrapper and no second landmark around it.
 *
 * The layout is a logical-property flex row that wraps, so long Persian text takes a second line
 * and the actions drop beneath it rather than overflowing the column; there is no fixed height
 * anywhere in it to break against text it did not expect.
 */
/** The fields the contextual header draws — every one optional, drawn only when given. */
export interface PageHeaderProps {
  /** Only for a genuinely distinct page name — never a restatement of the section identity. */
  title?: string;
  description?: string;
  breadcrumb?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  breadcrumb,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        {breadcrumb}
        {title ? (
          <h2 className="text-heading font-semibold tracking-tight text-text">{title}</h2>
        ) : null}
        {description ? (
          <p className={cn('max-w-3xl text-caption text-text-muted', title && 'mt-0.5')}>
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
