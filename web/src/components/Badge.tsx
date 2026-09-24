import type { HTMLAttributes, ReactNode } from 'react';
import type { EpistemicKind } from '@shared/types';
import type { DataProvenance } from '@shared/marketdata/provider';
import { cn } from '../lib/cn';
import { Tooltip } from './Tooltip';

export type BadgeTone =
  'neutral' | 'primary' | 'info' | 'success' | 'warning' | 'danger' | 'ai' | 'outline';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-raised text-text-muted border-border',
  primary: 'bg-primary-soft text-primary border-primary-border',
  info: 'bg-info-soft text-info border-info-border',
  // `success` has a fill of its own, so an "ok" pill and a brand pill are two different objects
  // rather than the same teal with two text colours.
  success: 'bg-success-soft text-success border-success-border',
  warning: 'bg-warning-soft text-warning border-warning-border',
  danger: 'bg-danger-soft text-danger border-danger-border',
  ai: 'bg-ai-soft text-ai border-ai-border',
  outline: 'bg-transparent text-text-muted border-border-strong',
};

/**
 * Two shapes, two jobs.
 *
 * A `pill` is a *label* — a state, a tone, a verdict, sitting beside prose. A `tag` is an
 * *identifier* — a code, an id, a key — and it is deliberately squarer and tighter, so a strip of
 * them reads as a machine's output rather than as sentences.
 */
export type BadgeShape = 'pill' | 'tag';

const SHAPES: Record<BadgeShape, string> = {
  pill: 'rounded-[var(--radius-pill)] px-2 py-0.5',
  tag: 'rounded-[var(--radius-mark)] px-1.5 py-0.5',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  shape?: BadgeShape;
  icon?: ReactNode;
  dot?: boolean;
}

export function Badge({
  tone = 'neutral',
  shape = 'pill',
  icon,
  dot,
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 border',
        SHAPES[shape],
        // A pill must fit the box it is in, whatever its label is. `whitespace-nowrap` made the
        // label an unbreakable run, so one long one (a source id such as
        // "risk.positionSize (not yet connected)") became a *minimum width* for every ancestor:
        // the row could not wrap it, the card could not shrink past it, and a page column that
        // sized its track from content carried that minimum to the document. Wrapping the label
        // (and breaking a token that cannot fit) keeps a pill on one line wherever it fits and
        // lets it take two lines where it does not, instead of widening the page.
        'text-caption font-medium leading-5 whitespace-normal break-words',
        TONES[tone],
        className,
      )}
      {...rest}
    >
      {dot ? <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {icon}
      {children}
    </span>
  );
}

const EPISTEMIC_TONE: Record<EpistemicKind, BadgeTone> = {
  fact: 'info',
  analysis: 'primary',
  hypothesis: 'warning',
  uncertainty: 'ai',
};

const EPISTEMIC_EXPLANATION: Record<EpistemicKind, string> = {
  fact: 'Taken from a verified source or a deterministic tool result.',
  analysis: 'Interpretation built on the stated sources.',
  hypothesis: 'A testable claim that has not been verified.',
  uncertainty: 'Known limits, missing evidence or an unresolved question.',
};

/**
 * Every agent statement carries its epistemic label — the UI side of the
 * fact / analysis / hypothesis / uncertainty policy (docs/architecture.md § 7).
 */
export function EpistemicBadge({ kind }: { kind: EpistemicKind }) {
  return (
    <Tooltip content={EPISTEMIC_EXPLANATION[kind]}>
      <Badge tone={EPISTEMIC_TONE[kind]} dot>
        {kind}
      </Badge>
    </Tooltip>
  );
}

const PROVENANCE_TONE: Record<DataProvenance, BadgeTone> = {
  synthetic: 'warning',
  historical: 'info',
  live: 'danger',
};

const PROVENANCE_TEXT: Record<DataProvenance, string> = {
  synthetic: 'Synthetic',
  historical: 'Historical',
  live: 'Live (not enabled)',
};

/** Market data always states what it is; synthetic never reads as real. */
export function ProvenanceBadge({ provenance }: { provenance: DataProvenance }) {
  return (
    <Badge tone={PROVENANCE_TONE[provenance]} dot>
      {PROVENANCE_TEXT[provenance]}
    </Badge>
  );
}
