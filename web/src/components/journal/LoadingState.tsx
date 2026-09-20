import { Skeleton, SkeletonCard } from '../Skeleton';
import { cn } from '../../lib/cn';

export interface LoadingStateProps {
  /** What is being read. Stated so a spinner never becomes the whole message. */
  label?: string;
  description?: string;
  rows?: number;
  /** `chart` matches the height of a chart panel so the layout does not jump. */
  shape?: 'list' | 'chart' | 'table';
  className?: string;
}

/**
 * Journal loading placeholder.
 *
 * The shape mirrors what is coming — a list, a chart panel or a table — because a
 * placeholder that does not match the content makes the layout jump when the data
 * lands, and it is the layout jump that makes an interface feel broken.
 */
export function LoadingState({
  label = 'Reading the journal',
  description = 'Records are being read from the journal store.',
  rows = 3,
  shape = 'list',
  className,
}: LoadingStateProps) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className={cn(
        'rounded-[var(--radius-panel)] border border-border bg-surface p-4 shadow-panel',
        className,
      )}
    >
      <p className="text-body font-medium text-text">{label}</p>
      <p className="mt-0.5 text-caption text-text-muted">{description}</p>
      <div className="mt-3">
        {shape === 'chart' ? (
          <Skeleton shape="block" className="h-[248px]" />
        ) : shape === 'table' ? (
          <div className="space-y-2">
            {Array.from({ length: rows }, (_, index) => (
              <div key={index} className="grid grid-cols-4 gap-3">
                <Skeleton shape="text" width="70%" />
                <Skeleton shape="text" width="55%" />
                <Skeleton shape="text" width="80%" />
                <Skeleton shape="text" width="40%" />
              </div>
            ))}
          </div>
        ) : (
          <SkeletonCard rows={rows} />
        )}
      </div>
    </div>
  );
}
