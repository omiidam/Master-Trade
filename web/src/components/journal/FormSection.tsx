import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Badge } from '../Badge';
import { cn } from '../../lib/cn';

export interface FormSectionProps {
  /** Position in the form, rendered as a step number. */
  step: number;
  title: string;
  description?: string;
  /** Value shown when the section is collapsed, so context is not lost. */
  summary?: string;
  /** Count of problems inside the section, surfaced even while collapsed. */
  issues?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  className?: string;
}

/**
 * A collapsible step in the trade form.
 *
 * The Add Trade form has more fields than anyone should face at once, so the
 * sections are staged and only one needs to be open. Two things stay visible while
 * a section is closed: a one-line summary of what is already filled in, and the
 * number of validation problems inside it — a hidden error is a lost submission.
 */
export function FormSection({
  step,
  title,
  description,
  summary,
  issues = 0,
  open,
  onOpenChange,
  children,
  className,
}: FormSectionProps) {
  return (
    <section
      className={cn(
        'rounded-[var(--radius-panel)] border bg-surface shadow-panel',
        issues > 0 ? 'border-danger-border' : 'border-border',
        className,
      )}
    >
      <h3>
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          aria-expanded={open}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${title}`}
          className={cn(
            'flex w-full items-center gap-3 px-4 py-3 text-start',
            'transition-colors duration-[var(--duration-fast)] hover:bg-surface-raised/50',
            open && 'border-b border-border',
          )}
        >
          <span
            aria-hidden
            className={cn(
              'num grid h-6 w-6 shrink-0 place-items-center rounded-full border text-caption',
              issues > 0
                ? 'border-danger-border bg-danger-soft text-danger'
                : 'border-border bg-surface-sunken text-text-muted',
            )}
          >
            {step}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="text-body font-semibold text-text">{title}</span>
              {issues > 0 ? (
                <Badge tone="danger">
                  {issues} {issues === 1 ? 'issue' : 'issues'}
                </Badge>
              ) : null}
            </span>
            {summary && !open ? (
              <span className="mt-0.5 block truncate text-caption text-text-muted">{summary}</span>
            ) : description ? (
              <span className="mt-0.5 block text-caption text-text-muted">{description}</span>
            ) : null}
          </span>
          <span
            aria-hidden
            className={cn(
              'shrink-0 text-text-faint transition-transform duration-[var(--duration-fast)]',
              open && 'rotate-180',
            )}
          >
            <ChevronDown size={16} />
          </span>
        </button>
      </h3>
      {open ? <div className="px-4 py-4">{children}</div> : null}
    </section>
  );
}
