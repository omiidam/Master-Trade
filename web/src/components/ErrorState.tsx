import type { ReactNode } from 'react';
import { Alert, type AlertTone } from './Alert';

export type ErrorSeverity = 'info' | 'warning' | 'error';

/**
 * Severity is the caller's word; tone is the feedback system's.
 *
 * They line up one-to-one today and the mapping is still written out, so that adding a tone cannot
 * silently reclassify every failure already on screen.
 */
const SEVERITY_TONE: Record<ErrorSeverity, AlertTone> = {
  info: 'info',
  warning: 'warning',
  error: 'error',
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
 * Failure surface.
 *
 * Phase 7.2 turned this into the failure *tone* of the one feedback primitive rather than a second
 * red panel: it, `RealtimeNotification` and every toast now render the same component, so the six
 * states cannot drift apart into six slightly different implementations. What is left here is the
 * part that is genuinely about failure — the naming, the severity vocabulary and the rule that a
 * failure reports its typed backend code instead of a raw provider payload.
 *
 * It never offers a "retry trade"-style control either; it renders only UI actions the caller
 * supplies.
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
    <Alert
      tone={SEVERITY_TONE[severity]}
      title={title}
      {...(description === undefined ? {} : { description })}
      {...(code === undefined ? {} : { code })}
      {...(action === undefined ? {} : { actions: action })}
      {...(className === undefined ? {} : { className })}
    />
  );
}
