import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  hint?: string;
  className?: string;
}

/**
 * Empty state. Its job is honesty: an empty pane must say *why* it is empty,
 * because "no data" and "not connected yet" look identical otherwise.
 */
export function EmptyState({ icon, title, description, action, hint, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-[var(--radius-panel)] border border-dashed',
        'border-border-strong bg-surface-sunken/60 px-6 py-10 text-center',
        className,
      )}
    >
      {icon ? <div className="mb-1 text-text-faint">{icon}</div> : null}
      <p className="text-body font-medium text-text">{title}</p>
      {description ? <p className="max-w-md text-caption text-text-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
      {hint ? <p className="mt-2 text-caption text-text-faint">{hint}</p> : null}
    </div>
  );
}
