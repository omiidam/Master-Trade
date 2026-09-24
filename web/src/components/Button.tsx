import { Slot } from '@radix-ui/react-slot';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

export type ButtonVariant =
  /** The one committing action on a surface. Filled, brand-lit, glowing. */
  | 'primary'
  /** The default. A raised neutral face: reads as pressable without claiming priority. */
  | 'secondary'
  /** No face at all until hovered — for dense rows and icon actions. */
  | 'ghost'
  /** The primary accent at rest: a tinted utility control next to a filled one. */
  | 'subtle'
  /** Destructive. The only *filled* red, and the only control allowed a red glow. */
  | 'danger'
  /** Status controls. Soft faces, so a status never outranks the action beside it. */
  | 'success'
  | 'warning'
  | 'info';

export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

/**
 * The control's silhouette.
 *
 * A `pill` is a *commitment* shape rather than a size: it is used where a control is the only thing
 * in its own row and closing a surface — the full-width action at the foot of an agent card. It
 * lives here rather than as a `rounded-[…]` written at that call site so the two shapes cannot
 * drift, and so the radius comes from the ladder either way.
 */
export type ButtonShape = 'default' | 'pill';

/*
 * The control face.
 *
 * Two ideas carry the whole set, and both come from the depth tokens rather than from values
 * written here:
 *
 *   1. **A control is lit from above.** `control-sheen` and `control-accent` are top-lit gradients,
 *      so a control reads as a machined face rather than a filled rectangle. Every variant that
 *      has a face uses one; the two that do not (`ghost`) are means of *removing* one.
 *   2. **Filled means commit, soft means status.** `primary` and `danger` are the two filled
 *      faces — green for "do this", red for "this cannot be undone" — and they are the only two
 *      that glow. Status variants (`success`/`warning`/`info`) get a tinted well instead, so a
 *      status control sitting next to a primary action never competes with it, and the six states
 *      stay distinguishable without five saturated buttons on one screen.
 *
 * Shadows are single stacks, not a lift plus an edge: `box-shadow` is one property, so a control
 * cannot carry two shadow utilities at once (`--shadow-control` already contains its lit inset).
 * Hover uses brightness and a 1px lift rather than swapping the shadow, which is why the accent
 * glow survives the hover state instead of being replaced by it.
 */
const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'control-accent border-primary-strong bg-primary text-primary-fg shadow-glow-control ' +
    'hover:-translate-y-px hover:brightness-110 active:translate-y-px active:shadow-control',
  secondary:
    'control-sheen border-border bg-surface-raised text-text shadow-control ' +
    'hover:-translate-y-px hover:border-border-strong hover:shadow-control-raised hover:brightness-110 ' +
    'active:translate-y-px active:shadow-control',
  ghost:
    'border-transparent bg-transparent text-text-muted hover:bg-surface-raised hover:text-text',
  subtle:
    'control-sheen border-primary-border bg-primary-soft text-primary ' +
    'hover:border-primary hover:bg-primary-soft-hover',
  danger:
    'control-danger border-danger-strong bg-danger text-danger-fg shadow-control ' +
    'hover:shadow-glow-danger hover:brightness-105 active:shadow-control',
  success:
    'control-sheen border-success-border bg-success-soft text-success ' +
    'hover:border-success hover:brightness-110',
  warning:
    'control-sheen border-warning-border bg-warning-soft text-warning ' +
    'hover:border-warning hover:brightness-110',
  info:
    'control-sheen border-info-border bg-info-soft text-info ' +
    'hover:border-info hover:brightness-110',
};

/**
 * The gap belongs to the size, not to the base: `cn` is a plain join with no conflict resolution,
 * so a size-level gap and a base-level gap would both be emitted and the winner would be decided
 * by stylesheet order rather than by intent.
 */
const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-2.5 text-caption',
  md: 'h-9 gap-2 px-3.5 text-body',
  lg: 'h-11 gap-2 px-5 text-body',
  icon: 'h-9 w-9 px-0',
};

const SHAPES: Record<ButtonShape, string> = {
  default: 'rounded-[var(--radius-control)]',
  pill: 'rounded-[var(--radius-pill)]',
};

/** Shared by every variant, and conflict-free with all of them. */
const BASE =
  'relative inline-flex select-none items-center justify-center whitespace-nowrap border font-medium ' +
  'transition-[background-color,border-color,color,box-shadow,filter,transform] ' +
  'duration-[var(--duration-fast)] ease-[var(--ease-standard)] ' +
  'disabled:pointer-events-none disabled:opacity-50';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  shape?: ButtonShape;
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
  shape = 'default',
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
        BASE,
        SHAPES[shape],
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
