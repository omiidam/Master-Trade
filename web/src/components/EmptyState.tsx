import type { ReactNode } from 'react';
import { Card } from './Card';
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
 *
 * The plate is the card system's well with the *dashed* edge kept as the one difference: a dashed
 * rim reads as "nothing is here yet", which is a property of the state and not of the surface, so
 * it is a class on the shared well rather than a second definition of it. `border-dashed` sets the
 * line's style, which is a different property from the width and the colour the tile already owns.
 */
export function EmptyState({ icon, title, description, action, hint, className }: EmptyStateProps) {
  return (
    <Card
      tone="sunken"
      className={cn(
        'flex flex-col items-center justify-center gap-2 border-dashed px-6 py-10 text-center',
        className,
      )}
    >
      {icon ? <div className="mb-1 text-text-faint">{icon}</div> : null}
      <p className="text-body font-medium text-text">{title}</p>
      {description ? <p className="max-w-md text-caption text-text-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
      {hint ? <p className="mt-2 text-caption text-text-faint">{hint}</p> : null}
    </Card>
  );
}
