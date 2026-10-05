/**
 * Learning streak — the habit figure.
 *
 * A streak of zero is not a failure and not a number worth drawing: it is the absence of a record,
 * so the plate states that instead of putting a bold `0` in the largest type on the page. The
 * flame is decorative (`aria-hidden`) — the count and the unit are the figure, and a screen reader
 * should not announce an icon that means "days in a row" twice.
 *
 * The definition sits in the footer and nowhere else. It used to be passed as both the description
 * and the note, which printed the same sentence twice in one card — and, because the other two
 * plates carry no definition at all, it was also what made this plate's header a line taller than
 * theirs and pushed its figure down the strip. Every plate in the strip now puts its one
 * explanatory line in the same band: the header states the *subject* when there is one (only the
 * exam plate has one, and only once it is populated), and the footer states the caveat.
 */

import { Flame } from 'lucide-react';
import { EmptyState } from '../EmptyState';
import { MetricPlate } from './MetricPlate';
import { SectionLink } from './SectionLink';
import { msg } from '../../i18n/index.js';

export interface StreakSectionProps {
  /** Consecutive days with recorded activity, as the server counted them. */
  days: number;
  /** Opens Activity, which is where the days behind this count are recorded. */
  onOpenActivity: () => void;
}

export function StreakSection({ days, onOpenActivity }: StreakSectionProps) {
  return (
    <MetricPlate
      label={msg('data.reviewStreak')}
      badge={
        <span className="text-text-faint" aria-hidden>
          <Flame size={16} />
        </span>
      }
      value={
        days === 0 ? undefined : (
          <span className="text-metric text-text">
            <span className="num">{days}</span>{' '}
            <span className="text-caption text-text-muted">{msg('data.days')}</span>
          </span>
        )
      }
      empty={
        <EmptyState
          icon={<Flame size={20} aria-hidden />}
          title={msg('dashboard.nothingYet')}
          description={msg('dashboard.streakZero')}
        />
      }
      note={msg('dashboard.streakDays')}
      interactive
      action={<SectionLink label={msg('dashboard.openActivity')} onOpen={onOpenActivity} />}
    />
  );
}
