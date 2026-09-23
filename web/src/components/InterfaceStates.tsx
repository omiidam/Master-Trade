import type { ReactNode } from 'react';
import { AlertCircle, Inbox, Loader } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Section } from './Card';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { SkeletonCard } from './Skeleton';
import { Reveal } from './Reveal';

export type InterfaceStateId = 'loading' | 'empty' | 'error';

export interface InterfaceStatesPanelProps {
  /** Only the states this surface actually has — never all three by default. */
  states: readonly InterfaceStateId[];
  title?: string;
  description?: string;
  loadingTitle?: string;
  loadingDescription?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  errorTitle?: string;
  errorDescription?: string;
  /**
   * The typed backend code this error surface would show, when one exists. Shown as
   * evidence rather than invented prose, and omitted when the failure has no code.
   */
  errorCode?: string;
  hint?: string;
  className?: string;
}

const LABEL: Record<InterfaceStateId, string> = {
  loading: 'Loading',
  empty: 'Empty',
  error: 'Error',
};

/** One line per state, so the exhibit is readable at a glance. */
const CAPTION: Record<InterfaceStateId, string> = {
  loading: 'Before data arrives; the layout is already the right shape.',
  empty: 'A successful read that found nothing.',
  error: 'A read that failed, with its typed reason.',
};

const ICON: Record<InterfaceStateId, ReactNode> = {
  loading: <Loader size={13} aria-hidden />,
  empty: <Inbox size={13} aria-hidden />,
  error: <AlertCircle size={13} aria-hidden />,
};

/**
 * The three states a data surface owes the user, exhibited in place.
 *
 * A prototype is where these get argued about, so this component renders them
 * rather than describing them: the loading placeholder is the real skeleton, the
 * empty state is the real empty state and the error state is the real error state —
 * the same components the wired version will use. What it never does is put a fake
 * number behind any of them: the shapes are empty by construction.
 */
export function InterfaceStatesPanel({
  states,
  title = 'Interface states',
  description = 'How this surface behaves before data arrives, when there is nothing to show, and when the read fails.',
  loadingTitle = 'Reading…',
  loadingDescription = 'Skeletons match the shape of the content that is coming, so the layout does not jump.',
  emptyTitle = 'Nothing here yet',
  emptyDescription = 'An empty surface says why it is empty — “not loaded” and “nothing exists” must not look the same.',
  errorTitle = 'The read failed',
  errorDescription = 'The failure is reported with its typed code, and the retry control is offered only when retrying can help.',
  errorCode,
  hint,
  className,
}: InterfaceStatesPanelProps) {
  return (
    <Section title={title} description={description} className={className}>
      {/* `grid-cols-1` is the zero-minimum base track: without it the implicit `auto`
          track below `lg` cannot shrink past its item's min-content. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {states.map((state, index) => (
          <Reveal key={state} index={index}>
            <Card tone="sunken" className="h-full">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <span className="text-text-faint">{ICON[state]}</span>
                  <CardTitle className="text-body">{LABEL[state]}</CardTitle>
                </div>
                <CardDescription>{CAPTION[state]}</CardDescription>
              </CardHeader>
              <CardContent>
                {state === 'loading' ? (
                  <div className="space-y-3">
                    <p className="sr-only">{loadingTitle}</p>
                    <SkeletonCard rows={2} />
                    <p className="text-caption text-text-muted">{loadingDescription}</p>
                  </div>
                ) : state === 'empty' ? (
                  <EmptyState title={emptyTitle} description={emptyDescription} />
                ) : (
                  <ErrorState
                    severity="error"
                    title={errorTitle}
                    description={errorDescription}
                    {...(errorCode === undefined ? {} : { code: errorCode })}
                  />
                )}
              </CardContent>
            </Card>
          </Reveal>
        ))}
      </div>
      {hint ? <p className="text-caption text-text-faint">{hint}</p> : null}
    </Section>
  );
}
