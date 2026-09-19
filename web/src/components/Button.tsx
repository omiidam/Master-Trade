import { Slot } from '@radix-ui/react-slot';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'subtle' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-primary-fg hover:bg-primary-strong shadow-[0_10px_30px_-16px_rgba(53,214,164,0.7)]',
  secondary: 'bg-surface-raised text-text border border-border hover:border-border-strong',
  ghost: 'bg-transparent text-text-muted hover:text-text hover:bg-surface-raised',
  subtle: 'bg-primary-soft text-primary hover:bg-[#123329] border border-transparent',
  danger: 'bg-danger-soft text-danger border border-[#3d1c20] hover:border-danger',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-2.5 text-caption gap-1.5',
  md: 'h-9 px-3.5 text-body gap-2',
  lg: 'h-11 px-5 text-body gap-2',
  icon: 'h-9 w-9 justify-center',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Render the child element instead of a <button> (e.g. an anchor). */
  asChild?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  fullWidth?: boolean;
  /** Accessible name for icon-only buttons. */
  label?: string;
}

/**
 * A plain, presentational button. It carries no domain meaning: the UI must
 * never render an order, execution or broker affordance, and the navigation
 * vocabulary is validated by tests rather than trusted to component authors.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  asChild = false,
  leadingIcon,
  trailingIcon,
  fullWidth,
  label,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const Component = asChild ? Slot : 'button';
  return (
    <Component
      {...(label ? { 'aria-label': label } : {})}
      className={cn(
        'inline-flex items-center rounded-[var(--radius-control)] font-medium',
        'transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
        'disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...(asChild ? {} : { type })}
      {...rest}
    >
      {leadingIcon ? <span className="shrink-0">{leadingIcon}</span> : null}
      {children}
      {trailingIcon ? <span className="shrink-0">{trailingIcon}</span> : null}
    </Component>
  );
}

/** Square icon-only button with an accessible label supplied by the caller. */
export function IconButton({
  label,
  className,
  size = 'icon',
  ...rest
}: Omit<ButtonProps, 'children' | 'aria-label'> & { label: string; children?: ReactNode }) {
  return (
    <Button {...rest} size={size} aria-label={label} className={cn('px-0', className)}>
      {rest.children}
    </Button>
  );
}
