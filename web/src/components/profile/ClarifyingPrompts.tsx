import { MessageCircleQuestion } from 'lucide-react';
import type { ClarifyingPrompt, ContextIssue } from '@shared/profile/model';
import { Badge } from '../Badge';
import { Card, CardContent, CardDescription, CardHeader, CardTile, CardTitle } from '../Card';
import { EmptyState } from '../EmptyState';

/**
 * What the system still needs, and why it is asking.
 *
 * The reason is shown per prompt, because "missing" and "this may be out of date" are
 * different requests: the first asks for a fact, the second asks whether a fact still
 * holds. Rendering both as "incomplete profile" would make the page look like it had
 * forgotten an answer the user already gave.
 */

const REASON_LABEL: Record<ClarifyingPrompt['reason'], string> = {
  missing: 'Not provided',
  assumed: 'Assumed, not stated',
  stale: 'May be out of date',
};

const REASON_TONE = {
  missing: 'neutral',
  assumed: 'outline',
  stale: 'warning',
} as const;

export interface ClarifyingPromptsProps {
  prompts: readonly ClarifyingPrompt[];
  /** Non-critical findings to surface rather than resolve. */
  questions?: readonly ContextIssue[];
  /** Opens the editor focused on a field, when the caller can do that. */
  onAnswer?: (key: ClarifyingPrompt['key']) => void;
}

export function ClarifyingPrompts({ prompts, questions = [], onAnswer }: ClarifyingPromptsProps) {
  const empty = prompts.length === 0 && questions.length === 0;

  return (
    <Card>
      <CardHeader divider>
        <CardTitle>What I still need from you</CardTitle>
        <CardDescription>
          These are asked rather than defaulted. If you would rather not answer, the analysis stays
          limited and says which input it is missing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {empty ? (
          <EmptyState
            icon={<MessageCircleQuestion size={18} aria-hidden />}
            title="Nothing outstanding"
            description="Every required field has a value you gave us, and none has aged out yet."
          />
        ) : (
          <>
            <ul className="space-y-2">
              {prompts.map((prompt) => (
                <CardTile
                  as="li"
                  key={`${prompt.key}-${prompt.reason}`}
                  className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="text-body text-text">{prompt.question}</p>
                    <p className="text-caption text-text-faint">{prompt.label}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={REASON_TONE[prompt.reason]}>{REASON_LABEL[prompt.reason]}</Badge>
                    {onAnswer ? (
                      <button
                        type="button"
                        onClick={() => onAnswer(prompt.key)}
                        className="text-caption font-medium text-primary underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        Answer
                      </button>
                    ) : null}
                  </div>
                </CardTile>
              ))}
            </ul>

            {questions.length > 0 ? (
              <CardTile className="space-y-2">
                <p className="text-caption font-medium text-warning">
                  Declarations that do not fit together
                </p>
                <ul className="space-y-1">
                  {questions.map((issue) => (
                    <li
                      key={`${issue.key}-${issue.problem}`}
                      className="text-caption text-text-muted"
                    >
                      {issue.problem}
                    </li>
                  ))}
                </ul>
                <p className="text-caption text-text-faint">
                  These are surfaced as questions, not resolved by choosing one side for you.
                </p>
              </CardTile>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
