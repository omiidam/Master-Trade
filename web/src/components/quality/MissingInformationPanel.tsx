import { CheckCircle2, CircleHelp } from 'lucide-react';
import type { InputRef } from '@shared/quality/model';
import type { ClarificationQuestion } from '@shared/quality/readiness';
import { Badge } from '../Badge';
import { Button } from '../Button';
import { ClarificationQuestionCard } from './ClarificationQuestionCard';
import { inputLabel } from './labels';

/**
 * What is not known, and what would close the gap.
 *
 * Two lists, kept apart because they are not the same thing:
 *
 *   - **gaps** are inputs that are not usable at all — absent, invalid, or declared as a
 *     refusal to say;
 *   - **clarifications** are the questions worth asking, which the server decides, and
 *     which may cover a gap, an outdated value or a contradiction.
 *
 * Empty is a real state and gets a real rendering. A panel that renders nothing when
 * everything is present leaves the reader unable to tell "nothing is missing" from "this
 * panel failed to load", which on a quality surface is the difference between trust and
 * a wrong one.
 *
 * The gap list is not clickable on its own: the surface that owns the declaration decides
 * where editing happens, and a component that invented a route would be guessing.
 */

export interface MissingInformationPanelProps {
  gaps: readonly InputRef[];
  clarifications: readonly ClarificationQuestion[];
  /** Called when the reader wants to close the gap. Omitted when there is nowhere to go. */
  onAnswer?: () => void;
  answerLabel?: string;
  /** Shown above the lists; the caller supplies the caveat about not inferring. */
  note?: string;
  className?: string;
}

export function MissingInformationPanel({
  gaps,
  clarifications,
  onAnswer,
  answerLabel = 'Provide this in preferences',
  note = 'Nothing is inferred to fill a gap. An input you have not given stays empty, and the analysis that needed it stays limited or is refused.',
  className,
}: MissingInformationPanelProps) {
  if (gaps.length === 0 && clarifications.length === 0) {
    return (
      <section
        className={className ?? 'rounded-[var(--radius-card)] border border-border p-4'}
        aria-label="Missing information"
      >
        <div className="flex items-center gap-2">
          <CheckCircle2 size={16} aria-hidden className="text-success" />
          <h3 className="text-body-sm font-medium text-text">Nothing required is missing</h3>
        </div>
        <p className="mt-1 text-body-sm text-text-muted">
          Every input the system can currently ask about is present and usable. This is not a
          statement that the answer will be complete — only that it will not be missing a declared
          requirement.
        </p>
      </section>
    );
  }

  return (
    <section className={className ?? 'space-y-3'} aria-label="Missing information">
      <div className="flex flex-wrap items-center gap-2">
        <CircleHelp size={16} aria-hidden className="text-text-muted" />
        <h3 className="text-body-sm font-medium text-text">What is not known yet</h3>
        {gaps.length > 0 ? <Badge tone="warning">{gaps.length} input(s) missing</Badge> : null}
        {clarifications.length > 0 ? (
          <Badge tone="outline">{clarifications.length} question(s)</Badge>
        ) : null}
      </div>

      {gaps.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" role="list" aria-label="Inputs that are missing">
          {gaps.map((gap) => (
            <li key={gap}>
              <Badge tone="warning">{inputLabel(gap)}</Badge>
            </li>
          ))}
        </ul>
      ) : null}

      {clarifications.length > 0 ? (
        <div className="space-y-2">
          {clarifications.map((question, index) => (
            <ClarificationQuestionCard
              key={`${question.field}:${question.reason}`}
              question={question}
              index={index + 1}
              total={clarifications.length}
              answerLabel={answerLabel}
              {...(onAnswer === undefined ? {} : { onAnswer })}
            />
          ))}
        </div>
      ) : null}

      <p className="text-caption text-text-faint">{note}</p>

      {onAnswer === undefined ? null : (
        <Button size="sm" variant="secondary" onClick={onAnswer} aria-label={answerLabel}>
          {answerLabel}
        </Button>
      )}
    </section>
  );
}
