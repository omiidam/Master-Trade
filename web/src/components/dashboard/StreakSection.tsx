/**
 * Learning streak — the habit figure.
 *
 * A streak of zero is not a failure and not a number worth drawing: it is the absence of a record,
 * so the plate states that instead of putting a bold `0` in the largest type on the page. The
 * flame is decorative (`aria-hidden`) — the count and the unit are the figure, and a screen reader
 * should not announce an icon that means "days in a row" twice.
 */

import { Flame } from 'lucide-react';
import { EmptyState } from '../EmptyState';
import { MetricPlate } from './MetricPlate';
import { msg } from '../../i18n/index.js';

export interface StreakSectionProps {
  /** Consecutive days with recorded activity, as the server counted them. */
  days: number;
}

export function StreakSection({ days }: StreakSectionProps) {
  return (
    <MetricPlate
      label={msg('data.reviewStreak')}
      description={msg('dashboard.streakDays')}
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
    />
  );
}
