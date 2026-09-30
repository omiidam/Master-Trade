import { msg, type MessageKey } from '../i18n/index.js';
import { cn } from '../lib/cn';
import { ForwardIcon } from '../components/Directional';

/**
 * The breadcrumb: one shared drawing of a contextual trail.
 *
 * It renders the trail it is *handed* (`NavCrumb[]`, derived for the fourteen sections by
 * `navTrail` in the navigation model) and knows nothing about pages, groups or stores — the data
 * layer stays outside, and the component stays a list with opinions only about order, separators
 * and subordination.
 *
 * **What it deliberately is not: a navigation landmark.** The shell already has one — the rail,
 * named `shell.navPrimary` — and this product's architecture holds that exactly one element claims
 * where the reader is (`aria-current="page"`, asserted document-wide by the suite). The trail adds
 * no destination the rail doesn't already offer — today it offers none at all, because the shell is
 * path-less by decision (Phase 8.2.4) — so a second landmark would be a redundant one, and a
 * second currency claim would be a lie the rail has to argue with. The trail is therefore a
 * *labelled ordered list*: semantic, readable top-to-bottom by assistive technology, named from
 * the catalogue, but context rather than a wayfinder. The day a crumb carries a real destination,
 * it renders as a named button — a control that moves the reader — without ever becoming the
 * shell's second navigation.
 *
 * Direction follows the document the way every glyph in the product does: the separator is
 * `ForwardIcon`, the named "next" chevron that points at the end of the line — end-of-line moves
 * when the writing direction does, so no CSS transform and no physical `left`/`right` appear here.
 * The separator is `aria-hidden`, because the list already carries the order; a spoken "chevron"
 * between every pair is noise, not structure.
 */
export function Breadcrumb({
  items,
  onNavigate,
  label,
  className,
}: {
  /** The trail, outermost context first, the current place last. */
  items: readonly { id: string; label: string; navigable: boolean }[];
  /** Called with the crumb's `id` when a navigable crumb is activated. */
  onNavigate?: (id: string) => void;
  /** The list's accessible name; defaults to the catalogue's own. */
  label?: string;
  className?: string;
}) {
  const current = items[items.length - 1];
  if (!current) return null;

  return (
    <ol
      aria-label={label ?? msg('shell.breadcrumbNav')}
      className={cn(
        // `min-w-0` is what lets a long Persian group name shrink inside the header's flex row
        // instead of pushing it wider than the column; the list then wraps rather than overflows.
        'flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-caption text-text-faint',
        className,
      )}
    >
      {items.map((item, index) => {
        const isCurrent = item.id === current.id;
        const name = (
          <span className={cn(isCurrent && 'font-medium text-text-muted')}>{item.label}</span>
        );
        return (
          <li key={item.id} className="flex min-w-0 items-center gap-1.5">
            {isCurrent ? (
              // The last crumb is where the reader is: text, emphasized, never a link to the
              // current page and never a second `aria-current` — the rail's entry is the one
              // announcement of position this document makes.
              name
            ) : item.navigable && onNavigate ? (
              <button
                type="button"
                onClick={() => onNavigate(item.id)}
                className="rounded-[var(--radius-control)] text-text-faint transition-colors duration-[var(--duration-fast)] hover:text-text-muted"
              >
                {name}
              </button>
            ) : (
              name
            )}
            {index < items.length - 1 ? (
              <span aria-hidden className="text-text-faint/60">
                <ForwardIcon size={11} />
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Render a trail through the catalogue, from the `NavCrumb[]` the navigation model derives.
 *
 * Kept beside the component so a caller never imports `msg` for crumbs: the trail's keys become
 * words in the interface language, and the trail's shape stays the model's decision.
 */
export function BreadcrumbTrail({
  trail,
  onNavigate,
  className,
}: {
  trail: readonly { id: string; labelKey: MessageKey; navigable: boolean }[];
  onNavigate?: (id: string) => void;
  className?: string;
}) {
  return (
    <Breadcrumb
      items={trail.map((crumb) => ({
        id: crumb.id,
        label: msg(crumb.labelKey),
        navigable: crumb.navigable,
      }))}
      onNavigate={onNavigate}
      className={className}
    />
  );
}
