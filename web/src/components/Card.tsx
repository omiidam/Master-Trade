import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** `raised` lifts the surface; `sunken` recesses it (ids, code, tables). */
  tone?: 'default' | 'raised' | 'sunken';
  interactive?: boolean;
}

export function Card({ tone = 'default', interactive, className, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'relative rounded-[var(--radius-panel)] border border-border shadow-panel panel-gradient',
        tone === 'default' && 'bg-surface',
        tone === 'raised' && 'bg-surface-raised',
        tone === 'sunken' && 'bg-surface-sunken',
        interactive &&
          'transition-colors duration-[var(--duration-fast)] hover:border-border-strong',
        className,
      )}
      {...rest}
    />
  );
}

export function CardHeader({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-start justify-between gap-3 border-border px-4 pt-4', className)}
      {...rest}
    />
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
