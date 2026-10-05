/**
 * Recent errors — what the record says went wrong, newest first.
 *
 * A third distinct form: a short timeline. Each row is a well with the topic, how often it
 * recurred and when it was last seen, because a mistake pattern is only actionable with its
 * frequency and its date — "order blocks" is a topic, "order blocks, 4 misses, last seen
 * Tuesday" is a study session. The count badge in the header reports how many patterns the card
 * is showing out of the server's list, so the section never implies the list is complete.
 *
 * The density is stated so the timeline shares its inner rhythm with the ranked list beside it.
 */

import { CircleAlert } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTile,
  CardTitle,
} from '../Card';
import { Badge } from '../Badge';
import { EmptyState } from '../EmptyState';
import { SectionLink } from './SectionLink';
import { formatTimestamp } from '../../lib/format';
import { msg } from '../../i18n/index.js';
import type { DashboardErrorView } from '@shared/frontend/viewModels';

export interface RecentErrorsSectionProps {
  /** The most recent mistake patterns, as the server selected them. */
  errors: readonly DashboardErrorView[];
  /** Opens the mistake review this timeline is three rows of. */
  onOpenExams: () => void;
}

export function RecentErrorsSection({ errors, onOpenExams }: RecentErrorsSectionProps) {
  return (
    <Card
      surface="data"
      density="cozy"
      finish="glass"
      interactive
      className="flex flex-col focus-within:border-border-strong"
    >
      <CardHeader
        divider
        actions={
          <Badge tone="warning">
            <span className="num">{errors.length}</span> {msg('dashboard.patterns')}
          </Badge>
        }
      >
        <div>
          <CardTitle className="text-body">{msg('dashboard.recentErrors')}</CardTitle>
          <CardDescription>{msg('exams.patternsComeFromStoredAttemptResults')}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col [&>*]:grow">
        {errors.length === 0 ? (
          <EmptyState
            icon={<CircleAlert size={20} aria-hidden />}
            title={msg('exams.nothingMissedYet')}
            description={msg('dashboard.noErrorsRecorded')}
            hint={msg('dashboardPage.emptyIsAValidStateItIs')}
          />
        ) : (
          <ol className="space-y-2">
            {errors.map((error) => (
              <CardTile as="li" key={error.id} className="space-y-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-body text-text">{error.topic}</p>
                  <span className="num shrink-0 text-caption text-text-muted">
                    {error.occurrences} {msg('exams.misses')}
                  </span>
                </div>
                <p className="text-caption text-text-faint">
                  {msg('exams.lastSeen')}{' '}
                  <span className="num">{formatTimestamp(error.lastSeenAt)}</span>
                </p>
              </CardTile>
            ))}
          </ol>
        )}
      </CardContent>
      <CardFooter className="text-caption text-text-faint">
        <span>{msg('dashboard.theThreeMostRecent')}</span>
        <SectionLink label={msg('dashboard.openMistakeReview')} onOpen={onOpenExams} />
      </CardFooter>
    </Card>
  );
}
