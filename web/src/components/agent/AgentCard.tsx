import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../lib/cn';

/**
 * The tone of a row's circular mark.
 *
 * `accent` is the default and the filled one — a small disc of the brand accent with a dark glyph,
 * which is the row cue this component exists for. The other three are tinted wells, so a row that
 * carries a *state* (an evaluated rule, an approval waiting, a step in a sequence) can say so
 * without a second badge.
 *
 * Three tones and no more, because each one is spent somewhere on the workspace: the accent disc
 * confirms, `info` reports attached evidence, `warning` waits on a person, and `neutral` numbers a
 * step. A tone with no row to mark would be a colour the reader has to learn and never sees used.
 */
export type AgentBadgeTone = 'accent' | 'info' | 'warning' | 'neutral';

const BADGE_TONES: Record<AgentBadgeTone, string> = {
  accent: 'bg-primary text-primary-fg',
  info: 'bg-info-soft text-info',
  warning: 'bg-warning-soft text-warning',
  neutral: 'bg-surface-raised text-text-faint',
};

/** The circular mark at the head of an agent-card row. */
export function AgentBadge({
  tone = 'accent',
  children,
  className,
}: {
  tone?: AgentBadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid h-4 w-4 shrink-0 place-items-center rounded-full',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * The check the design uses for a statement that holds.
 *
 * Marked `aria-hidden` inside the badge: the tick is punctuation for the sentence beside it, and a
 * screen reader announcing "check, Instructions, versioned, never dropped" for every row of every
 * card is noise. The sentence is the content.
 */
export function AgentCheck({ tone = 'accent' }: { tone?: AgentBadgeTone }) {
  return (
    <AgentBadge tone={tone}>
      <Check size={10} strokeWidth={3} />
    </AgentBadge>
  );
}

/**
 * The rows.
 *
 * `ordered` is not decoration: the tool-request path is a *sequence*, and a list of steps drawn
 * with check marks would say each one had already happened. The list element is chosen once here so
 * a caller cannot get the semantics wrong by reaching for the wrong tag.
 */
export function AgentCardList({
  ordered = false,
  children,
  className,
}: {
  ordered?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const Component = ordered ? 'ol' : 'ul';
  return <Component className={cn('flex flex-col gap-2', className)}>{children}</Component>;
}

export function AgentCardItem({
  badge,
  children,
  className,
}: {
  /** Usually an `AgentCheck` or an `AgentBadge`; a bare row omits it. */
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <li className={cn('flex items-start gap-2 text-caption text-text', className)}>
      {badge ? <span className="shrink-0">{badge}</span> : null}
      <span className="min-w-0">{children}</span>
    </li>
  );
}

export interface AgentCardProps {
  title: string;
  description?: string;
  /** The card's glyph, right-aligned in the header. */
  icon?: ReactNode;
  /**
   * The closing action, drawn as the full-width pill.
   *
   * Optional because not every card has one, and a card with no action must not grow an empty slot
   * that reads as a missing button — which is the same reason `blockedReason` exists on the
   * composer rather than a disabled control with nothing to say.
   */
  action?: ReactNode;
  /**
   * `active` sweeps a light along the ring.
   *
   * Reserved for the one card on a screen that is waiting for the reader — here, the proposals
   * that need an approval. Two of them would be two answers to "where do I look", which is one
   * answer too many.
   */
  ring?: 'static' | 'active';
  children: ReactNode;
  className?: string;
}

/**
 * The agent card.
 *
 * It is a surface of its own rather than a `Card` with options, because it is *under-lit*: where a
 * panel is lifted from above by `--gradient-panel` and closed by `.edge-highlight`, this card glows
 * up from its feet — its ring is brightest along the bottom, its surface carries two accent pools
 * in the lower corners, and its own lit edge runs along the underside. Same accent, read upside
 * down, which is what makes the agent's cards a family you can recognise in a screenshot.
 *
 * The ring is padding rather than a border. A 1px stroke is a flat colour, and the whole point of
 * this surface is a *gradient* edge that is lit at one end and plain at the other —
 * `border-image` cannot follow `border-radius`, so the frame is the element's own background
 * showing through the 1px band the inner panel does not cover.
 */
export function AgentCard({
  title,
  description,
  icon,
  action,
  ring = 'static',
  children,
  className,
}: AgentCardProps) {
  return (
    <article
      className={cn(
        'agent-ring relative rounded-[var(--radius-panel)] p-px shadow-panel',
        ring === 'active' && 'agent-ring-active',
        className,
      )}
    >
      <div className="agent-glow relative flex flex-col gap-4 rounded-[calc(var(--radius-panel)-1px)] bg-surface p-4">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-title font-semibold text-text">{title}</h3>
            {description ? (
              <p className="mt-1 text-caption text-text-muted">{description}</p>
            ) : null}
          </div>
          {icon ? (
            <span aria-hidden className="shrink-0 text-text-faint">
              {icon}
            </span>
          ) : null}
        </header>

        {/* The divider the design puts between the title block and the rows. A rule, not a border on
            the list, so it spans the same width whether or not a row is present. */}
        <hr className="h-px border-0 bg-border" />

        {children}

        {action ? <div className="min-w-0">{action}</div> : null}
      </div>
    </article>
  );
}
