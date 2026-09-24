import { ChevronDown } from 'lucide-react';
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { useId } from 'react';
import { CardTile } from './Card';
import { cn } from '../lib/cn';

/**
 * The field face: a well recessed into the surface rather than a box drawn on it.
 *
 * The recess is `--shadow-control-inset` (a dark inner top plus a hairline of light along the
 * bottom edge), which is what makes an input read as *cut into* the panel instead of floating on
 * it — the visual opposite of a button, and the reason the two are recognisable at a glance in the
 * same form. Focusing swaps the well for a raised face (`focus:bg-surface`) so the active field
 * lifts toward the user, and the page-wide `:focus-visible` ring supplies the second, stronger
 * cue. `focus:outline-none` was removed deliberately: a field is entered by keyboard, so it must
 * keep the ring every other control gets.
 */
const FIELD =
  'w-full rounded-[var(--radius-control)] border border-border bg-surface-sunken text-text ' +
  'shadow-control-inset placeholder:text-text-faint hover:border-border-strong ' +
  'focus:border-primary focus:bg-surface ' +
  'transition-[background-color,border-color,box-shadow] duration-[var(--duration-fast)] ' +
  'ease-[var(--ease-standard)] disabled:cursor-not-allowed disabled:opacity-50';

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(FIELD, 'h-9 px-3 text-body', className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(FIELD, 'min-h-20 resize-y px-3 py-2 text-body leading-relaxed', className)}
      {...rest}
    />
  );
}

export type SelectDensity = 'sm' | 'md';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /**
   * `sm` is the caption-sized control dense filter rows use; `md` matches `Input`.
   *
   * Named `density` rather than `size` because `size` is already an HTML select attribute (the
   * visible row count of a multiple select) and shadowing it would make the wrapper accept a
   * number where a size step is meant.
   */
  density?: SelectDensity;
}

const SELECT_DENSITIES: Record<SelectDensity, string> = {
  sm: 'h-8 ps-2 text-caption',
  md: 'h-9 ps-3 text-body',
};

/**
 * The shared select.
 *
 * It exists because the same twelve-class string was copy-pasted into three screens (the journal
 * filters, the holdings editor and the profile editor), and by then the copies had already drifted
 * apart — one had hover feedback and two did not, and one used a caption size the others did not
 * share. A select is a form control like any other, so it wears the field face and differs from
 * `Input` in exactly one way: the native arrow is suppressed (`appearance-none`) and replaced with
 * a chevron we control, so the control keeps this interface's typography instead of the platform's.
 *
 * It renders a real `<select>`, so keyboard behaviour, the option list and form semantics are the
 * platform's, untouched.
 */
export function Select({ className, children, density = 'md', ...rest }: SelectProps) {
  return (
    // `className` sizes the *control*, which is the wrapper: the inner `<select>` is always
    // `w-full`, so a caller says `max-w-40` once and the arrow keeps its place inside it. Every
    // form attribute (id, describedby, invalid) still lands on the real `<select>`.
    <div className={cn('relative', className)}>
      <select className={cn(FIELD, 'appearance-none pe-8', SELECT_DENSITIES[density])} {...rest}>
        {children}
      </select>
      <ChevronDown
        aria-hidden
        size={14}
        className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 text-text-faint"
      />
    </div>
  );
}

export interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  children: (props: {
    id: string;
    'aria-describedby': string | undefined;
    /** Set only when there is an error: a control is never marked invalid by default. */
    'aria-invalid': true | undefined;
  }) => ReactNode;
  className?: string;
}

/**
 * Label + hint + error wiring. The render-prop form exists so the input, its
 * label, its `aria-describedby` and its invalid state are impossible to mismatch.
 *
 * `aria-invalid` is part of the wiring rather than left to each caller: a message
 * that is announced as a description without the field being marked invalid tells a
 * screen-reader user what went wrong without telling them where.
 */
export function Field({ label, hint, error, children, className }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-caption font-medium text-text-muted">
        {label}
      </label>
      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
      })}
      {error ? (
        <p id={`${id}-error`} className="text-caption font-medium text-danger">
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
    <CardTile>
      <p className="text-caption text-text-muted">{label}</p>
      <p className="num mt-0.5 text-body text-text">{value}</p>
      {hint ? <p className="mt-0.5 text-caption text-text-faint">{hint}</p> : null}
    </CardTile>
  );
}
