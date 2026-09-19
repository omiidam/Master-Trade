import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { useId } from 'react';
import { cn } from '../lib/cn';

const BASE =
  'w-full rounded-[var(--radius-control)] border border-border bg-surface-sunken px-3 text-text ' +
  'placeholder:text-text-faint transition-colors duration-[var(--duration-fast)] ' +
  'hover:border-border-strong focus:border-primary focus:outline-none disabled:opacity-50';

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(BASE, 'h-9', className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea className={cn(BASE, 'min-h-20 resize-y py-2 leading-relaxed', className)} {...rest} />
  );
}

export interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  children: (props: { id: string; 'aria-describedby': string | undefined }) => ReactNode;
  className?: string;
}

/**
 * Label + hint + error wiring. The render-prop form exists so the input, its
 * label and its `aria-describedby` are impossible to mismatch.
 */
export function Field({ label, hint, error, children, className }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-caption font-medium text-text-muted">
        {label}
      </label>
      {children({ id, 'aria-describedby': describedBy })}
      {error ? (
        <p id={`${id}-error`} className="text-caption text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-caption text-text-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Read-only value display used for configuration and status readouts. */
export function ReadOnlyValue({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-[var(--radius-control)] border border-border bg-surface-sunken px-3 py-2">
      <p className="text-caption text-text-muted">{label}</p>
      <p className="num mt-0.5 text-body text-text">{value}</p>
      {hint ? <p className="mt-0.5 text-caption text-text-faint">{hint}</p> : null}
    </div>
  );
}
