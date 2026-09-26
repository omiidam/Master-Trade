import { AlertCircle, AlertTriangle, CheckCircle2, Info, ShieldAlert, X } from 'lucide-react';
import type { AriaRole, ReactNode } from 'react';
import { ALERT_TONE_ROLE, type AlertTone } from '../design/components';
import { cn } from '../lib/cn';
import { Badge } from './Badge';
import { IconButton } from './Button';

export type { AlertTone };

/**
 * The panel, per tone.
 *
 * Every tone is a tinted *well* with an edge of the same family, so tone reads from three cues at
 * once (fill, border, icon) without colouring the prose — the title stays `--color-text` and the
 * body `--color-text-muted`, which is what keeps a red panel as readable as a neutral one. A
 * coloured-on-coloured alert is the usual way this component goes wrong.
 */
const TONES: Record<AlertTone, string> = {
  neutral: 'border-border bg-surface-raised',
  info: 'border-info-border bg-info-soft',
  success: 'border-success-border bg-success-soft',
  warning: 'border-warning-border bg-warning-soft',
  error: 'border-danger-border bg-danger-soft',
  destructive: 'border-danger-strong bg-danger-soft',
};

/**
 * The one tone that carries a shadow of its own.
 *
 * Kept out of `TONES` for a mechanical reason: `box-shadow` is a single property, so a tone's glow
 * and the floating shadow a toast needs cannot both be classes on the element — the loser would be
 * decided by stylesheet order rather than by intent. One map, one branch, no conflict.
 */
const TONE_SHADOW: Record<AlertTone, string> = {
  neutral: '',
  info: '',
  success: '',
  warning: '',
  error: '',
  destructive: 'shadow-glow-danger',
};

const ICON_TONES: Record<AlertTone, string> = {
  neutral: 'text-text-muted',
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-danger',
  destructive: 'text-danger',
};

const ICONS: Record<AlertTone, ReactNode> = {
  neutral: <Info size={15} aria-hidden />,
  info: <Info size={15} aria-hidden />,
  success: <CheckCircle2 size={15} aria-hidden />,
  warning: <AlertTriangle size={15} aria-hidden />,
  error: <AlertCircle size={15} aria-hidden />,
  destructive: <ShieldAlert size={15} aria-hidden />,
};

/**
 * Which tones interrupt.
 *
 * The answer is a table in `design/components.ts` rather than a condition here, so the rule that
 * "information does not interrupt" can be read and checked without rendering anything.
 */
export function alertRole(tone: AlertTone): AriaRole {
  return ALERT_TONE_ROLE[tone];
}

export interface AlertProps {
  tone?: AlertTone;
  title: string;
  /** Prose, or a composed fragment when the message carries a timestamp or a second line. */
  description?: ReactNode;
  /** A typed backend code, shown as evidence rather than restated in prose. */
  code?: string;
  /** Sits beside the title: a provenance or origin label, never a tone restated. */
  meta?: ReactNode;
  actions?: ReactNode;
  onDismiss?: () => void;
  /** Lifts the panel off the page for a surface that genuinely floats — a toast. */
  floating?: boolean;
  className?: string;
  /** Accessible name for the dismiss control. */
  dismissLabel?: string;
}

/**
 * The feedback panel: one component for the six tones, used inline, as a banner and inside a
 * toast.
 *
 * It is deliberately *not* a notification system — it takes strings and nodes and renders them.
 * The reason is the one rule that governs every feedback surface here: this component never
 * receives a raw provider payload, an exception or a request body, and it never invents a message
 * from one. A caller that wants to show a failure passes the typed code, which is what stops a
 * secret, a stack trace or a prompt from reaching the screen through an error path.
 */
export function Alert({
  tone = 'neutral',
  title,
  description,
  code,
  meta,
  actions,
  onDismiss,
  floating,
  className,
  dismissLabel = 'Dismiss this message',
}: AlertProps) {
  return (
    <div
      role={alertRole(tone)}
      className={cn(
        'relative rounded-[var(--radius-panel)] border px-4 py-3 panel-gradient edge-highlight',
        TONES[tone],
        TONE_SHADOW[tone] || (floating ? 'shadow-popover' : ''),
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {/* A recessed well rather than a coloured circle: the icon is lit through a hole in the
            panel, which keeps the tone in the border and the icon instead of in everything. */}
        <span
          className={cn(
            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center',
            'rounded-[var(--radius-inset)] border border-border/60 bg-overlay',
            ICON_TONES[tone],
          )}
        >
          {ICONS[tone]}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p dir="auto" className="text-body font-medium text-text">
              {title}
            </p>
            {meta}
          </div>
          {description ? (
            <div dir="auto" className="mt-0.5 text-caption text-text-muted">
              {description}
            </div>
          ) : null}
          {code ? (
            <Badge shape="tag" tone="outline" className="num mt-2">
              {code}
            </Badge>
          ) : null}
          {actions ? <div className="mt-3 flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
        {onDismiss ? (
          <IconButton size="sm" variant="ghost" label={dismissLabel} onClick={onDismiss}>
            <X size={13} aria-hidden />
          </IconButton>
        ) : null}
      </div>
    </div>
  );
}
