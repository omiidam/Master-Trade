import { CheckCircle2, TriangleAlert } from 'lucide-react';
import { Tooltip } from '../Tooltip';
import { cn } from '../../lib/cn';

export interface MistakeTagProps {
  label: string;
  /** Occurrences across the journal, when the tag summarises a pattern. */
  occurrences?: number;
  /** The corrective note attached to the pattern. */
  lesson?: string;
  /** A clean trade renders a "nothing went wrong" tag instead of an empty list. */
  positive?: boolean;
  className?: string;
}

/**
 * A mistake is a label you can count, not a feeling. Tags are the same strings the
 * frequency panel aggregates, so a tag on a trade and a bar on the analytics panel
 * are the same fact.
 */
export function MistakeTag({
  label,
  occurrences,
  lesson,
  positive = false,
  className,
}: MistakeTagProps) {
  const Icon = positive ? CheckCircle2 : TriangleAlert;
  return (
    <Tooltip
      content={
        lesson ?? (positive ? 'Recorded as done well.' : 'Recorded as a mistake on this trade.')
      }
    >
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border px-2 py-0.5 text-caption leading-5',
          positive
            ? 'border-[#14453a] bg-primary-soft text-success'
            : 'border-[#3d2c12] bg-warning-soft text-warning',
          className,
        )}
      >
        <Icon size={11} aria-hidden />
        {label}
        {occurrences === undefined ? null : (
          <span className="num text-text-faint">×{occurrences}</span>
        )}
      </span>
    </Tooltip>
  );
}
