import type { HTMLAttributes, ReactNode } from 'react';
import type { EpistemicKind } from '@shared/types';
import type { DataProvenance } from '@shared/marketdata/provider';
import { cn } from '../lib/cn';
import { Tooltip } from './Tooltip';
import { liveLabels } from '../i18n/index.js';
import { msg } from '../i18n/index.js';

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

/**
 * How a badge wraps, which is not the same question for the two shapes.
 *
 * A `pill` holds a *label* — words — so it breaks between them and only falls back to breaking a word
 * when one cannot fit: `break-word`.
 *
 * A `tag` holds an *identifier* — a code such as `JOURNAL_STORE_UNAVAILABLE` — and an identifier has no
 * spaces to break at. `break-word` is not enough for it, and the reason is a CSS detail worth writing
 * down: it lets a word break when the line cannot fit it, but it does **not** lower the run's
 * *min-content* width. A flex item's `min-width: auto` measures itself against exactly that, so the
 * identifier stayed a floor — for the badge, and through the cap below for the box it sat in:
 * `max-w-full` held the badge at its container's width while the text inside it kept its own, and the
 * text spilled out of the badge. Measured on this component at a 150px row, the token overflowed its
 * own box by 46px and never wrapped at all.
 *
 * `overflow-wrap: anywhere` is the one value that also lowers min-content, so the flex item can shrink
 * and the identifier breaks across lines instead of escaping the box. It is scoped to the tag shape on
 * purpose: lowering a *pill's* min-content would let a row of labels squeeze a pill until it broke a
 * word it had no need to break.
 */
const WRAPPING: Record<BadgeShape, string> = {
  pill: 'break-words',
  tag: 'wrap-anywhere',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  shape?: BadgeShape;
  icon?: ReactNode;
  dot?: boolean;
  /**
   * Whether the label may take a second line. True everywhere by default.
   *
   * False is for a badge that is a *cell* in a dense table, where a wrapped chip is a chip that has
   * lost its shape and — worse — a row whose height depends on which vocabulary word a record
   * happens to carry. Measured on the journal's trade history before this existed: nine rows at 63px
   * and one at 83, because the Persian words for *rule broken* needed three lines where the Persian
   * word for *compliant* needed one. (Both are looked up in the catalogue, which is the only place
   * this product's Persian lives — which is also why this comment describes them instead of
   * quoting them.)
   */
  wrap?: boolean;
}

export function Badge({
  tone = 'neutral',
  shape = 'pill',
  icon,
  dot,
  wrap = true,
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 border',
        SHAPES[shape],
        // A badge must fit the box it is in, whatever its label is. `whitespace-nowrap` made the
        // label an unbreakable run, so one long one (a source id such as
        // "risk.positionSize (not yet connected)") became a *minimum width* for every ancestor:
        // the row could not wrap it, the card could not shrink past it, and a page column that
        // sized its track from content carried that minimum to the document. Wrapping the label
        // keeps a pill on one line wherever it fits and lets it take two lines where it does not,
        // instead of widening the page — and `WRAPPING` above is the half of that which has to
        // differ between a label and an identifier, because only one of the two has spaces.
        'text-caption font-medium leading-5',
        wrap ? cn('whitespace-normal', WRAPPING[shape]) : 'whitespace-nowrap',
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

const EPISTEMIC_EXPLANATION: Record<EpistemicKind, string> = liveLabels({
  fact: 'ui.epistemic.fact',
  analysis: 'ui.epistemic.analysis',
  hypothesis: 'ui.epistemic.hypothesis',
  uncertainty: 'ui.epistemic.uncertainty',
});

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
  get synthetic(): string {
    return msg('memory.kind.synthetic');
  },
  get historical(): string {
    return msg('badge.historical');
  },
  get live(): string {
    return msg('badge.liveNotEnabled');
  },
};

/** Market data always states what it is; synthetic never reads as real. */
export function ProvenanceBadge({ provenance }: { provenance: DataProvenance }) {
  return (
    <Badge tone={PROVENANCE_TONE[provenance]} dot>
      {PROVENANCE_TEXT[provenance]}
    </Badge>
  );
}
