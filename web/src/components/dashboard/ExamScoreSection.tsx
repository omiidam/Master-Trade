/**
 * Latest exam score — the evaluation figure.
 *
 * The one plate whose status is a verdict, so it carries the badge the other two do not: passed or
 * failed, from the server's own `passed` flag rather than from a threshold re-tested here. The
 * exam's title is the plate's description, which is what makes "91%" mean something — a score with
 * no subject is a number, not a result.
 */

import { GraduationCap } from 'lucide-react';
import { Badge } from '../Badge';
import { EmptyState } from '../EmptyState';
import { MetricPlate } from './MetricPlate';
import { SectionLink } from './SectionLink';
import { formatPercent, formatTimestamp } from '../../lib/format';
import { msg } from '../../i18n/index.js';
import type { DashboardExamView } from '@shared/frontend/viewModels';

export interface ExamScoreSectionProps {
  /** The most recent graded exam, or `null` when nothing has been graded yet. */
  exam: DashboardExamView | null;
  onOpenExams: () => void;
}

export function ExamScoreSection({ exam, onOpenExams }: ExamScoreSectionProps) {
  return (
    <MetricPlate
      label={msg('dashboard.latestExamScore')}
      description={exam?.examTitle}
      badge={
        exam === null ? null : (
          <Badge tone={exam.passed ? 'primary' : 'danger'}>
            {exam.passed ? msg('dashboard.attemptPassed') : msg('dashboard.attemptFailed')}
          </Badge>
        )
      }
      value={
        exam === null ? undefined : (
          <span className="num text-metric text-text">{formatPercent(exam.scorePercent, 1)}</span>
        )
      }
      detail={
        exam === null ? undefined : (
          <>
            <span className="num">{exam.attemptCount}</span> {msg('dashboard.attempts')} ·{' '}
            <span className="num">{formatTimestamp(exam.attemptedAt)}</span>
          </>
        )
      }
      empty={
        <EmptyState
          icon={<GraduationCap size={20} aria-hidden />}
          title={msg('dashboard.noExamScoredYet')}
          description={msg('dashboardPage.completedLessonsAndGradedExamsWillAppearHere')}
        />
      }
      note={msg('dashboard.rubricScoredNeverModelJudged')}
      interactive
      action={<SectionLink label={msg('dashboard.openExams')} onOpen={onOpenExams} />}
    />
  );
}
