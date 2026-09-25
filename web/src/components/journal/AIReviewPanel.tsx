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
import { Card, CardContent, CardDescription, CardHeader, CardTile, CardTitle } from '../Card';
import { cn } from '../../lib/cn';
import { aiReviewNotice, AI_REVIEW_STATE_LABEL, AI_REVIEW_STATE_ORDER } from '../../mock/journal';
import type { AiReviewState } from '../../mock/journal';
import { msg } from '../../i18n/index.js';

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
  get ['not-available'](): string {
    return msg('aIReviewPanel.noReviewProviderIsConnectedToTheJournal');
  },
  get pending(): string {
    return msg('aIReviewPanel.theReviewRequestIsQueuedAndHasNot');
  },
  get processing(): string {
    return msg('aIReviewPanel.aProviderIsGeneratingAReviewProgressIs');
  },
  get completed(): string {
    return msg('aIReviewPanel.theLayoutACompletedReviewWillTakeEvery');
  },
  get failed(): string {
    return msg('aIReviewPanel.theRequestFailedThePanelReportsTheTyped');
  },
};

const COMPLETED_SECTIONS = [
  {
    get heading(): string {
      return msg('aIReviewPanel.processAdherence');
    },
    get body(): string {
      return msg('aIReviewPanel.whereTheRecordShowsThePlanWasFollowed');
    },
  },
  {
    get heading(): string {
      return msg('aIReviewPanel.riskAndSizing');
    },
    get body(): string {
      return msg('aIReviewPanel.plannedVersusCommittedRiskWithTheDivergenceFlagged');
    },
  },
  {
    get heading(): string {
      return msg('aIReviewPanel.whatToExamineNext');
    },
    get body(): string {
      return msg('aIReviewPanel.openQuestionsForTheTraderEachTiedTo');
    },
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
    <Card as="section" aria-label={msg('journal.reviewAssistance')} className={className}>
      <CardHeader
        divider
        actions={
          <Badge tone={TONE[state]} dot>
            {AI_REVIEW_STATE_LABEL[state]}
          </Badge>
        }
      >
        <div className="flex min-w-0 items-start gap-2">
          <span
            aria-hidden
            className={cn('mt-0.5', state === 'failed' ? 'text-danger' : 'text-ai')}
          >
            {ICONS[state]}
          </span>
          <div className="min-w-0">
            <CardTitle>{msg('journal.reviewAssistance')}</CardTitle>
            <CardDescription>
              {tradeRef ? `${tradeRef} · ` : ''}
              {EXPLANATION[state]}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {state === 'not-available' ? (
          <CardTile as="p" space="roomy" className="border-dashed text-caption text-text-muted">
            {aiReviewNotice()}
          </CardTile>
        ) : state === 'pending' ? (
          <p className="text-caption text-text-muted">{msg('journal.queuedAPendingReviewIsThe')}</p>
        ) : state === 'processing' ? (
          <div className="space-y-2">
            <div className="h-1.5 w-full overflow-hidden rounded-[var(--radius-pill)] bg-surface-sunken">
              <span className="block h-full w-1/3 animate-pulse rounded-[var(--radius-pill)] bg-ai/60" />
            </div>
            <p className="text-caption text-text-faint">
              {msg('journal.theBarIsIndeterminateOnPurpose')}
            </p>
          </div>
        ) : state === 'completed' ? (
          <div className="space-y-3">
            <p className="flex items-start gap-2 rounded-[var(--radius-control)] border border-warning-border bg-warning-soft px-3 py-2 text-caption text-warning">
              <TriangleAlert size={13} aria-hidden className="mt-0.5 shrink-0" />
              {msg('journal.layoutExampleNoModelProviderIs')}
            </p>
            <ul className="space-y-3">
              {COMPLETED_SECTIONS.map((section) => (
                <li key={section.heading}>
                  <CardTile space="roomy">
                    <p className="text-body font-medium text-text">{section.heading}</p>
                    <p className="mt-0.5 text-caption text-text-muted">{section.body}</p>
                    <p className="mt-2 text-caption text-text-faint italic">
                      {msg('journal.awaitingAConnectedProviderNoGenerated')}
                    </p>
                  </CardTile>
                </li>
              ))}
            </ul>
            <p className="text-caption text-text-faint">
              {msg('journal.structuredSummariesOnlyAReviewExplains')}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="num inline-block rounded-[var(--radius-control)] border border-danger-border bg-danger-soft px-2 py-0.5 text-caption text-danger">
              JOURNAL_REVIEW_PROVIDER_UNAVAILABLE
            </p>
            <p className="text-caption text-text-muted">
              {msg('journal.theTypedReasonIsShownInstead')}
            </p>
            {onRetry ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={onRetry}
                label={msg('aIReviewPanel.retryTheReviewRequest')}
                leadingIcon={<RefreshCw size={13} aria-hidden />}
              >
                {msg('journal.retryReview')}
              </Button>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
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
    <section className={cn('space-y-3', className)} aria-label={msg('journal.reviewStates')}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-caption font-semibold text-text-muted uppercase">
          {msg('journal.reviewStates')}
        </p>
        <CardTile
          space="none"
          role="group"
          aria-label={msg('journal.reviewStateToPreview')}
          className="inline-flex flex-wrap items-center gap-0.5 p-0.5"
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
        </CardTile>
      </div>
      <AIReviewPanel state={value} {...(tradeRef ? { tradeRef } : {})} />
    </section>
  );
}
