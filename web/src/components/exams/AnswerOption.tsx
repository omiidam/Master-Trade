import { Check, Minus, X } from 'lucide-react';
import { useId } from 'react';
import { cn } from '../../lib/cn';
import { msg } from '../../i18n/index.js';

export type AnswerInputKind = 'single-choice' | 'multi-choice' | 'numeric' | 'written';

/** Selection state. Correctness is *not* part of it — see `PostSubmitReview`. */
export type AnswerOptionState = 'idle' | 'selected' | 'read-only';

/**
 * Correctness is only known after the server grades the attempt, which is why it
 * is a separate prop with the server's explanation attached rather than part of
 * the option's own state.
 */
export interface PostSubmitReview {
  verdict: 'correct' | 'incorrect' | 'partial';
  explanation: string;
}

export interface AnswerOptionProps {
  id: string;
  /** Radio (single), checkbox (multi), or a text/number input for the open kinds. */
  kind?: AnswerInputKind;
  name: string;
  label?: string;
  state?: AnswerOptionState;
  /** Kept disabled until a submission is graded; the preview never enables it. */
  review?: PostSubmitReview;
  onSelect?: (id: string) => void;
  className?: string;
}

const REVIEW_ICON = {
  correct: <Check size={14} aria-hidden />,
  incorrect: <X size={14} aria-hidden />,
  partial: <Minus size={14} aria-hidden />,
} as const;

const REVIEW_TONE = {
  correct: 'border-success-border bg-primary-soft text-primary',
  incorrect: 'border-danger-border bg-danger-soft text-danger',
  partial: 'border-warning-border bg-warning-soft text-warning',
} as const;

const REVIEW_LABEL = {
  get correct(): string {
    return msg('answerOption.correct');
  },
  get incorrect(): string {
    return msg('answerOption.incorrect');
  },
  get partial(): string {
    return msg('answerOption.partiallyCorrect');
  },
} as const;

/**
 * One answer affordance.
 *
 * It renders a real labelled input so keyboard and screen-reader behaviour is the
 * browser's, not ours. Open-ended kinds render an input rather than fake choices:
 * a numeric question with invented multiple options would misrepresent how the
 * exam is actually taken.
 */
export function AnswerOption({
  id,
  kind = 'single-choice',
  name,
  label,
  state = 'idle',
  review,
  onSelect,
  className,
}: AnswerOptionProps) {
  const inputId = useId();
  const isOpen = kind === 'numeric' || kind === 'written';
  const readOnly = state === 'read-only';
  const selected = state === 'selected';

  return (
    <div className={cn('space-y-1.5', className)}>
      <label
        htmlFor={inputId}
        className={cn(
          'flex cursor-pointer items-start gap-3 rounded-[var(--radius-control)] border px-3 py-2.5',
          'transition-colors duration-[var(--duration-fast)]',
          selected ? 'border-primary bg-primary-soft/40' : 'border-border bg-surface-sunken',
          readOnly && 'cursor-default opacity-80',
        )}
      >
        <input
          id={inputId}
          type={kind === 'multi-choice' ? 'checkbox' : kind === 'written' ? 'text' : 'radio'}
          name={name}
          value={id}
          checked={selected}
          disabled={readOnly}
          readOnly={isOpen}
          onChange={onSelect ? () => onSelect(id) : undefined}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-primary)]"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-body text-text">
            {label ?? (kind === 'numeric' ? 'Your answer' : 'Your answer')}
          </span>
          {isOpen ? (
            <span className="mt-0.5 block text-caption text-text-faint">
              {kind === 'numeric'
                ? 'Numeric answer — graded against the rubric, tolerance stated in the question.'
                : 'Free-text answer — scored against the rubric by the grader, not by the model.'}
            </span>
          ) : null}
        </span>
        {review ? (
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-pill)] border px-2 py-0.5 text-caption',
              REVIEW_TONE[review.verdict],
            )}
          >
            {REVIEW_ICON[review.verdict]}
            {REVIEW_LABEL[review.verdict]}
          </span>
        ) : null}
      </label>
      {review ? <p className="ps-7 text-caption text-text-muted">{review.explanation}</p> : null}
    </div>
  );
}
