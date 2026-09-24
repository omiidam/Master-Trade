import { EyeOff, Lock, ScrollText } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../Badge';
import { Button } from '../Button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../Card';
import { Tooltip } from '../Tooltip';
import { AnswerOption, type AnswerInputKind, type PostSubmitReview } from './AnswerOption';

const KIND_LABEL: Record<AnswerInputKind, string> = {
  'single-choice': 'Single choice',
  'multi-choice': 'Multiple choice',
  numeric: 'Numeric',
  written: 'Written',
};

export interface QuestionPanelChoice {
  id: string;
  label: string;
}

export interface QuestionPanelProps {
  /** Position of this question in the attempt, 1-based. */
  index: number;
  total: number;
  prompt: string;
  kind: AnswerInputKind;
  choices?: readonly QuestionPanelChoice[];
  /** Rubric the grader scores against — displayed so grading is inspectable. */
  rubricRef: string;
  points: number;
  answerKeyWithheld?: boolean;
  /** Selected choice ids on the in-flight attempt. */
  selected?: readonly string[];
  onSelect?: (id: string) => void;
  /** Review verdicts from a *graded* attempt; only ever passed post-submission. */
  reviews?: Record<string, PostSubmitReview>;
  /**
   * False by default: without a running exam service the controls are present as
   * layout but inert, and the panel says so instead of pretending to grade.
   */
  interactive?: boolean;
  className?: string;
}

/**
 * One question of an assessment.
 *
 * Two things are deliberate. The rubric reference is on screen, because "why was
 * this marked wrong" has to be answerable without the model. And the answer key
 * is withheld: this component never receives the correct option, so the key
 * cannot leak through the UI or the network payload before submission.
 */
export function QuestionPanel({
  index,
  total,
  prompt,
  kind,
  choices = [],
  rubricRef,
  points,
  answerKeyWithheld = true,
  selected = [],
  onSelect,
  reviews,
  interactive = false,
  className,
}: QuestionPanelProps) {
  const [selection, setSelection] = useState<readonly string[]>(selected);
  const active = onSelect === undefined ? selection : selected;

  const choose = (id: string) => {
    if (onSelect) {
      onSelect(id);
      return;
    }
    setSelection((current) => {
      if (kind === 'multi-choice') {
        return current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      }
      return [id];
    });
  };

  return (
    <Card surface="action" className={className}>
      <CardHeader divider>
        <div>
          <CardTitle className="text-body">
            Question {index} of {total}
          </CardTitle>
          <p className="mt-1 text-caption text-text-muted">
            {KIND_LABEL[kind]} · {points} {points === 1 ? 'point' : 'points'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="outline">{KIND_LABEL[kind]}</Badge>
          {answerKeyWithheld ? (
            <Tooltip content="The answer key never reaches the client before submission; grading happens server-side against the rubric.">
              <Badge tone="warning" icon={<EyeOff size={12} aria-hidden />}>
                key withheld
              </Badge>
            </Tooltip>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <p className="text-body text-text">{prompt}</p>

        <div className="space-y-2">
          {choices.length === 0 ? (
            <AnswerOption
              id="answer"
              kind={kind}
              name={`question-${index}`}
              state={active.length > 0 ? 'selected' : 'idle'}
              {...(reviews?.answer === undefined ? {} : { review: reviews.answer })}
              onSelect={interactive || onSelect ? choose : undefined}
            />
          ) : (
            choices.map((choice) => (
              <AnswerOption
                key={choice.id}
                id={choice.id}
                kind={kind}
                name={`question-${index}`}
                label={choice.label}
                state={active.includes(choice.id) ? 'selected' : 'idle'}
                {...(reviews?.[choice.id] === undefined ? {} : { review: reviews[choice.id] })}
                onSelect={interactive || onSelect ? choose : undefined}
              />
            ))
          )}
        </div>

        <p className="flex items-center gap-1.5 text-caption text-text-faint">
          <ScrollText size={12} aria-hidden />
          Graded against <span className="num">{rubricRef}</span>
        </p>
      </CardContent>

      <CardFooter>
        <span className="inline-flex items-center gap-1.5 text-caption text-text-faint">
          <Lock size={12} aria-hidden />
          {interactive
            ? 'Answers are submitted to the grader, never to the model.'
            : 'Preview only — no attempt is recorded and no answer is graded in this phase.'}
        </span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" disabled>
            Previous
          </Button>
          <Button size="sm" variant="secondary" disabled>
            Next question
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
