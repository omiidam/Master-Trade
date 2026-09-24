import { Check } from 'lucide-react';
import { cn } from '../../lib/cn';
import type { ChecklistItem } from '../../mock/journal';

export interface ChecklistFieldProps {
  label: string;
  hint?: string;
  items: readonly ChecklistItem[];
  selected: readonly string[];
  onToggle: (id: string) => void;
  className?: string;
}

/**
 * The pre-trade rule checklist.
 *
 * The count of marked items is always shown next to the list, and the checklist is
 * never pre-ticked: a rule the trader did not consciously confirm is not confirmed.
 * An empty checklist is a blank, and the form's validation says so rather than
 * treating zero items as a pass.
 */
export function ChecklistField({
  label,
  hint,
  items,
  selected,
  onToggle,
  className,
}: ChecklistFieldProps) {
  return (
    <fieldset className={cn('space-y-2', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <legend className="text-caption font-medium text-text-muted">{label}</legend>
        <span className="num text-caption text-text-faint">
          {selected.length} / {items.length} marked
        </span>
      </div>
      {hint ? <p className="text-caption text-text-faint">{hint}</p> : null}
      <ul className="grid gap-1.5 md:grid-cols-2">
        {items.map((item) => {
          const checked = selected.includes(item.id);
          return (
            <li key={item.id}>
              <label
                className={cn(
                  'flex cursor-pointer items-start gap-2 rounded-[var(--radius-control)] border px-2.5 py-2',
                  'transition-colors duration-[var(--duration-fast)]',
                  checked
                    ? 'border-primary-border bg-primary-soft'
                    : 'border-border bg-surface-sunken hover:border-border-strong',
                )}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  onChange={() => onToggle(item.id)}
                />
                <span
                  aria-hidden
                  className={cn(
                    'mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-[4px] border',
                    checked ? 'border-primary bg-primary text-primary-fg' : 'border-border-strong',
                  )}
                >
                  {checked ? <Check size={11} /> : null}
                </span>
                <span className={cn('text-caption', checked ? 'text-text' : 'text-text-muted')}>
                  {item.label}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
