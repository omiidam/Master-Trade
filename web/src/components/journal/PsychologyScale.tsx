import { cn } from '../../lib/cn';
import { useId } from 'react';

export interface PsychologyScaleProps {
  label: string;
  /** 0..10 self-assessment. */
  value: number;
  onChange: (value: number) => void;
  /** States that are read as a caution signal when high. */
  caution?: boolean;
  className?: string;
}

/**
 * A 0..10 self-reported scale.
 *
 * The scale is a reading, not a verdict, so the component never colours a high
 * value as success or failure by itself. `caution` only marks the direction that is
 * worth noticing — high impulsiveness is worth noticing, high discipline is not —
 * and the numeric value is always visible next to the slider, so the bar is never
 * the only evidence of what was recorded.
 */
export function PsychologyScale({
  label,
  value,
  onChange,
  caution = false,
  className,
}: PsychologyScaleProps) {
  const id = useId();
  const highlighted = caution && value >= 7;
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-caption font-medium text-text-muted">
          {label}
        </label>
        <span className={cn('num text-caption', highlighted ? 'text-warning' : 'text-text')}>
          {value}/10
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={10}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-valuetext={`${value} out of 10`}
        className={cn(
          'h-1.5 w-full cursor-pointer appearance-none rounded-[var(--radius-pill)] bg-surface-sunken',
          'accent-[var(--color-primary)]',
          highlighted && 'accent-[var(--color-warning)]',
        )}
      />
      <div className="flex justify-between text-caption text-text-faint">
        <span>none</span>
        <span>{caution ? 'extreme' : 'complete'}</span>
      </div>
    </div>
  );
}
