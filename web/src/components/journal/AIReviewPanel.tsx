import {
  BotMessageSquare,
  CircleSlash,
  Clock,
  Loader2,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '../Badge';
import { Button } from '../Button';
import { cn } from '../../lib/cn';
import { AI_REVIEW_NOTICE, AI_REVIEW_STATE_LABEL, AI_REVIEW_STATE_ORDER } from '../../mock/journal';
import type { AiReviewState } from '../../mock/journal';

const ICONS: Record<AiReviewState, ReactNode> = {
  'not-available': <CircleSlash size={15} aria-hidden />,
  pending: <Clock size={15} aria-hidden />,
  processing: <Loader2 size={15} aria-hidden className="animate-spin" />,
  completed: <BotMessageSquare size={15} aria-hidden />,
  failed: <TriangleAlert size={15} aria-hidden />,
};

const TONE: Record<AiReviewState, 'outline' | 'info' | 'ai' | 'success' | 'danger'> = {
  'not-available': 'outline',
  pending: 'info',
  processing: 'ai',
  completed: 'success',
  failed: 'danger',
};

const EXPLANATION: Record<AiReviewState, string> = {
  'not-available':
    'No review provider is connected to the journal. The panel exists so the surface is designed before the capability arrives.',
  pending:
    'The review request is queued and has not been sent to a provider. Nothing is in flight yet.',
  processing:
    'A provider is generating a review. Progress is reported by the job queue, and is never animated here to look busier than it is.',
  completed:
    'The layout a completed review will take. Every field is empty by construction — no model output exists in this phase.',
  failed:
    'The request failed. The panel reports the typed reason and offers a retry, because a failed review must not look like an empty one.',
};

const COMPLETED_SECTIONS = [
  {
    heading: 'Process adherence',
    body: 'Where the record shows the plan was followed, and where it does not. Fields are filled from the checklist and the record, not from the review.',
  },
  {
    heading: 'Risk and sizing',
    body: 'Planned versus committed risk, with the divergence flagged. The numbers come from the record; a review may explain them but never produces them.',
  },
  {
    heading: 'What to examine next',
    body: 'Open questions for the trader, each tied to a specific record. A review proposes study, never a rule change and never a live decision.',
  },
];

export interface AIReviewPanelProps {
  state: AiReviewState;
  /** The record the panel refers to, shown in the header. */
  tradeRef?: string;
  /** Retry is offered only when retrying could help. */
  onRetry?: () => void;
  className?: string;
}

/**
 * The AI review surface.
 *
 * The rules this panel is built to hold:
 *   - the model never writes a number here — the figures come from the record;
 *   - a review is never a recommendation, and never activates a rule;
 *   - five states are designed up front, because "the review failed" must not look
 *     the same as "there is no review", and neither may look like a quiet success;
 *   - the completed state is a **labelled layout example**. No provider is
 *     connected in this phase, so there is no review text to show and none is
 *     fabricated to make the panel look finished.
 */
export function AIReviewPanel({ state, tradeRef, onRetry, className }: AIReviewPanelProps) {
  return (
    <section
      aria-label="Review assistance"
      className={cn(
        'rounded-[var(--radius-panel)] border border-border bg-surface p-4 shadow-panel',
        className,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <span
            aria-hidden
            className={cn('mt-0.5', state === 'failed' ? 'text-danger' : 'text-ai')}
          >
            {ICONS[state]}
          </span>
          <div>
            <h3 className="text-title font-semibold text-text">Review assistance</h3>
            <p className="mt-0.5 text-caption text-text-muted">
              {tradeRef ? `${tradeRef} · ` : ''}
              {EXPLANATION[state]}
            </p>
          </div>
        </div>
        <Badge tone={TONE[state]} dot>
          {AI_REVIEW_STATE_LABEL[state]}
        </Badge>
      </header>

      <div className="mt-3">
        {state === 'not-available' ? (
          <p className="rounded-[var(--radius-control)] border border-dashed border-border-strong bg-surface-sunken/60 px-3 py-3 text-caption text-text-muted">
            {AI_REVIEW_NOTICE}
          </p>
        ) : state === 'pending' ? (
          <p className="text-caption text-text-muted">
            Queued. A pending review is the absence of a review, and it is labelled that way rather
            than shown as an empty result.
          </p>
        ) : state === 'processing' ? (
          <div className="space-y-2">
            <div className="h-1.5 w-full overflow-hidden rounded-[var(--radius-pill)] bg-surface-sunken">
              <span className="block h-full w-1/3 animate-pulse rounded-[var(--radius-pill)] bg-ai/60" />
            </div>
            <p className="text-caption text-text-faint">
              The bar is indeterminate on purpose: there is no progress to report until a job
              reports one.
            </p>
          </div>
        ) : state === 'completed' ? (
          <div className="space-y-3">
            <p className="flex items-start gap-2 rounded-[var(--radius-control)] border border-[#3d2c12] bg-warning-soft px-3 py-2 text-caption text-warning">
              <TriangleAlert size={13} aria-hidden className="mt-0.5 shrink-0" />
              Layout example. No model provider is connected in this phase, so every field below is
              empty by construction — this is the shape a review will take, not a review.
            </p>
            <ul className="space-y-3">
              {COMPLETED_SECTIONS.map((section) => (
                <li
                  key={section.heading}
                  className="rounded-[var(--radius-control)] border border-border bg-surface-sunken p-3"
                >
                  <p className="text-body font-medium text-text">{section.heading}</p>
                  <p className="mt-0.5 text-caption text-text-muted">{section.body}</p>
                  <p className="mt-2 text-caption text-text-faint italic">
                    awaiting a connected provider — no generated text is stored
                  </p>
                </li>
              ))}
            </ul>
            <p className="text-caption text-text-faint">
              Structured summaries only: a review explains the record. It cannot execute a tool,
              change a rule or place anything.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="num inline-block rounded-[var(--radius-control)] border border-[#3d1c20] bg-danger-soft px-2 py-0.5 text-caption text-danger">
              JOURNAL_REVIEW_PROVIDER_UNAVAILABLE
            </p>
            <p className="text-caption text-text-muted">
              The typed reason is shown instead of a raw provider payload. Retrying is offered only
              because a provider outage is the kind of failure that can resolve.
            </p>
            {onRetry ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={onRetry}
                label="Retry the review request"
                leadingIcon={<RefreshCw size={13} aria-hidden />}
              >
                Retry review
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * All five states, side by side, so the design is reviewable before the capability
 * exists. The gallery is a design exhibit, not a control panel: selecting a state
 * changes which panel is shown, and none of them is presented as a real review.
 */
export function AIReviewStateGallery({
  value,
  onValueChange,
  tradeRef,
  className,
}: {
  value: AiReviewState;
  onValueChange: (state: AiReviewState) => void;
  tradeRef?: string;
  className?: string;
}) {
  return (
    <section className={cn('space-y-3', className)} aria-label="Review states">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-caption font-semibold text-text-muted uppercase">Review states</p>
        <div
          role="group"
          aria-label="Review state to preview"
          className="inline-flex flex-wrap items-center gap-0.5 rounded-[var(--radius-control)] border border-border bg-surface-sunken p-0.5"
        >
          {AI_REVIEW_STATE_ORDER.map((state) => (
            <button
              key={state}
              type="button"
              aria-pressed={state === value}
              onClick={() => onValueChange(state)}
              className={cn(
                'rounded-[calc(var(--radius-control)-2px)] px-2.5 py-1 text-caption font-medium',
                state === value
                  ? 'bg-surface-raised text-text shadow-panel'
                  : 'text-text-muted hover:text-text',
              )}
            >
              {AI_REVIEW_STATE_LABEL[state]}
            </button>
          ))}
        </div>
      </div>
      <AIReviewPanel state={value} {...(tradeRef ? { tradeRef } : {})} />
    </section>
  );
}
