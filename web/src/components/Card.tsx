import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

/**
 * What the card is cut into: a panel on the page, a nested panel, or a recessed well.
 *
 * The three are surface *layers*, not three shadows. A well (`sunken`) is the inverse of a panel:
 * it is darker than what surrounds it and lit along its bottom edge instead of its top, which is
 * why it takes the inset stack and drops the lit edge rather than keeping a panel's face.
 */
export type CardTone = 'default' | 'raised' | 'sunken';

const TONES: Record<CardTone, string> = {
  default: 'bg-surface shadow-panel panel-gradient edge-highlight',
  raised: 'bg-surface-raised shadow-panel panel-gradient edge-highlight',
  sunken: 'bg-surface-sunken shadow-control-inset',
};

export type CardEmphasis = 'none' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'ai';

/**
 * Which card on a screen is the one being asked about, said in the border rather than in a badge.
 *
 * `accent` is the only emphasis that carries the accent glow, and it is meant for the single card a
 * screen is organised around — the "your next step" panel, the selected plan. Everything else
 * states its tone with an edge and leaves the glow alone, because a grid of four glowing panels
 * has no emphasis at all. (Elevation level 3, `--shadow-glow`, is exactly this: *one* accent
 * surface that asks to be acted on.)
 */
const EMPHASIS_BORDER: Record<CardEmphasis, string> = {
  none: 'border-border',
  accent: 'border-primary-border',
  success: 'border-success-border',
  warning: 'border-warning-border',
  danger: 'border-danger-border',
  info: 'border-info-border',
  ai: 'border-ai-border',
};

const INTERACTIVE =
  'transition-[border-color,box-shadow,transform] duration-[var(--duration-fast)] ' +
  'ease-[var(--ease-standard)] hover:-translate-y-px hover:shadow-popover';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** `raised` nests a panel inside another surface; `sunken` recesses it (ids, code, tables). */
  tone?: CardTone;
  /** Marks this as the card the screen is organised around. */
  emphasis?: CardEmphasis;
  interactive?: boolean;
}

/**
 * The base surface.
 *
 * Three things together make a card read as a plate in a dark interface rather than a white box on
 * a grey page, and all three are tokens: the panel gradient lights its top so stacked surfaces
 * separate, `--shadow-panel`'s hairline white line sharpens that edge, and the `.edge-highlight`
 * pseudo-element draws a 1px highlight that fades out before the corners. Nothing here is a value
 * written at the call site, so the whole depth language moves together.
 *
 * The emphasis, the surface and the shadow are chosen in one place rather than layered as separate
 * packs: `cn` does not resolve conflicts, so two utilities touching the same property would leave
 * the winner to stylesheet order.
 */
export function Card({
  tone = 'default',
  emphasis = 'none',
  interactive,
  className,
  ...rest
}: CardProps) {
  const shadow = emphasis === 'accent' ? 'shadow-glow' : tone === 'sunken' ? '' : 'shadow-panel';
  return (
    <div
      className={cn(
        'relative rounded-[var(--radius-panel)] border',
        EMPHASIS_BORDER[emphasis],
        TONES[tone],
        shadow,
        interactive && INTERACTIVE,
        interactive && emphasis === 'none' && 'hover:border-border-strong',
        className,
      )}
      {...rest}
    />
  );
}

export function CardHeader({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-4 pt-4', className)} {...rest} />
  );
}

export function CardTitle({ className, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-title font-semibold text-text', className)} {...rest} />;
}

export function CardDescription({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('mt-1 text-caption text-text-muted', className)} {...rest} />;
}

export function CardContent({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-4 py-4', className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 border-t border-border px-4 py-3',
        className,
      )}
      {...rest}
    />
  );
}

/** Small section wrapper used inside pages to group cards under a heading. */
export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('space-y-3', className)} aria-label={title}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-title font-semibold text-text">{title}</h2>
          {description ? <p className="text-caption text-text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
