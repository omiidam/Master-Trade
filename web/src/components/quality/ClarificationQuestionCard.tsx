import { HelpCircle } from 'lucide-react';
import type { ClarificationQuestion } from '@shared/quality/readiness';
import { Badge } from '../Badge';
import { Button } from '../Button';
import { Card } from '../Card';
import { cn } from '../../lib/cn';
import { clarificationReasonLabel, inputLabel } from './labels';

/**
 * One question the system is asking instead of guessing.
 *
 * The card exists because the alternative — filling the gap with something plausible —
 * is the failure mode the whole phase is built to prevent. So the wording comes from the
 * server's contract, not from this file: the backend decides which gap is worth asking
 * about and how to ask, and a UI that re-worded the question could ask for something the
 * requirement does not actually need.
 *
 * `blocking` is rendered explicitly. It is the difference between "answer this and the
 * answer gets sharper" and "answer this or there is no answer", and a user deciding
 * whether to answer now needs to know which one they are looking at.
 */

export interface ClarificationQuestionCardProps {
  question: ClarificationQuestion;
  /** Position in a list, shown so a long set stays countable. */
  index?: number;
  /** Total in the set, so "3 of 7" is readable. */
  total?: number;
  /** Offered when the surface knows where the field can be edited. */
  onAnswer?: () => void;
  /** Label for the answer affordance. Defaults to a wording that promises nothing. */
  answerLabel?: string;
  className?: string;
}

export function ClarificationQuestionCard({
  question,
  index,
  total,
  onAnswer,
  answerLabel = 'Provide this in preferences',
  className,
}: ClarificationQuestionCardProps) {
  const position =
    index === undefined ? null : total === undefined ? `${index}.` : `${index} of ${total}`;

  return (
    <Card
      as="article"
      tone="sunken"
      className={cn('space-y-2 p-3', className)}
      aria-label={`Clarification required: ${inputLabel(question.field)}`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <HelpCircle size={14} aria-hidden className="text-text-muted" />
        {position === null ? null : (
          <span className="text-caption text-text-faint">{position}</span>
        )}
        <span className="text-body-sm font-medium text-text">{question.label}</span>
        <Badge tone="neutral">{clarificationReasonLabel(question.reason)}</Badge>
        {question.blocking ? (
          <Badge tone="danger">Blocking</Badge>
        ) : (
          <Badge tone="outline">Would sharpen the answer</Badge>
        )}
      </div>

      <p className="text-body-sm text-text-muted">{question.question}</p>

      {onAnswer === undefined ? null : (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={onAnswer}
            aria-label={`${answerLabel} for ${inputLabel(question.field)}`}
          >
            {answerLabel}
          </Button>
        </div>
      )}
    </Card>
  );
}
