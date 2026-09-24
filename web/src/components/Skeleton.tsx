import { cn } from '../lib/cn';

export type SkeletonShape = 'text' | 'block' | 'circle';

export interface SkeletonProps {
  shape?: SkeletonShape;
  className?: string;
  width?: string;
}

/**
 * Loading placeholder. The pulse animation is disabled globally under
 * `prefers-reduced-motion` (see web/src/styles/global.css), so no per-component
 * media query is needed.
 */
export function Skeleton({ shape = 'text', className, width }: SkeletonProps) {
  return (
    <span
      aria-hidden
      style={width ? { width } : undefined}
      className={cn(
        'surface-sheen block animate-pulse',
        shape === 'text' && 'h-3 rounded-[var(--radius-control)]',
        shape === 'block' && 'h-24 rounded-[var(--radius-panel)]',
        shape === 'circle' && 'h-8 w-8 rounded-full',
        className,
      )}
    />
  );
}

/** Card-shaped skeleton used while a page panel is "loading". */
export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 rounded-[var(--radius-panel)] border border-border bg-surface p-4">
      <Skeleton shape="text" width="40%" />
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} shape="text" width={`${90 - index * 12}%`} />
      ))}
    </div>
  );
}
