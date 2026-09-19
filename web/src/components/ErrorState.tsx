import type { ReactNode } from 'react';
import { AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { cn } from '../lib/cn';

export type ErrorSeverity = 'info' | 'warning' | 'error';

const ICONS: Record<ErrorSeverity, ReactNode> = {
  info: <Info size={16} aria-hidden />,
  warning: <AlertTriangle size={16} aria-hidden />,
  error: <AlertCircle size={16} aria-hidden />,
};

const TONES: Record<ErrorSeverity, string> = {
  info: 'border-[#1b2c49] bg-info-soft text-info',
  warning: 'border-[#3d2c12] bg-warning-soft text-warning',
  error: 'border-[#3d1c20] bg-danger-soft text-danger',
};

export interface ErrorStateProps {
  title: string;
  description?: string;
  /** Backend error code when known (src/core/errors.ts), shown as evidence. */
  code?: string;
  severity?: ErrorSeverity;
  action?: ReactNode;
  className?: string;
}

/**
 * Failure surface. It reports the typed error code instead of a raw provider
 * payload, and it never offers a "retry trade"-style control — only UI actions
 * the caller supplies.
 */
export function ErrorState({
  title,
  description,
  code,
  severity = 'error',
  action,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn('rounded-[var(--radius-panel)] border px-4 py-3', TONES[severity], className)}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0">{ICONS[severity]}</span>
        <div className="min-w-0 flex-1">
          <p className="text-body font-medium">{title}</p>
          {description ? <p className="mt-0.5 text-caption opacity-90">{description}</p> : null}
          {code ? (
            <p className="num mt-2 inline-block rounded-[var(--radius-control)] border border-current/30 px-2 py-0.5 text-caption">
              {code}
            </p>
          ) : null}
          {action ? <div className="mt-3">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}
