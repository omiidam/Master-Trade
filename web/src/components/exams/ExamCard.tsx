import { Clock, HelpCircle, Lock, Play, RotateCcw, Target } from 'lucide-react';
import { cn } from '../../lib/cn';
import { formatPercent } from '../../lib/format';
import { Badge, type BadgeTone } from '../Badge';
import { Button } from '../Button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../Card';
import { Tooltip } from '../Tooltip';
import { ProgressIndicator } from './ProgressIndicator';
import { EXAM_STATE_LABEL, type ExamDefinition, type ExamRunState } from '../../mock/exams';

const STATE_TONE: Record<ExamRunState, BadgeTone> = {
  available: 'neutral',
  'in-progress': 'info',
  completed: 'primary',
  failed: 'danger',
  locked: 'outline',
};

/** Label for the state-appropriate action; every one is inert in this phase. */
const ACTION_LABEL: Record<ExamRunState, string> = {
  available: 'Start assessment',
  'in-progress': 'Resume attempt',
  completed: 'Review answers',
  failed: 'Retry assessment',
  locked: 'Locked',
};

export interface ExamCardProps {
  exam: ExamDefinition;
  /** Category label, resolved by the page so this component stays data-agnostic. */
  categoryLabel?: string;
  /** Answered/total, when an attempt is in flight. */
  progress?: { value: number; max: number };
  /** Only invoked by a connected exam service; absent in the preview. */
  onAction?: (examId: string) => void;
  className?: string;
}

/**
 * Assessment summary card.
 *
 * The action reflects the exam's state rather than offering a single generic
 * button, and it is disabled with an explanation when no exam service is
 * connected — a button that looks clickable but does nothing teaches users to
 * distrust the interface.
 */
export function ExamCard({ exam, categoryLabel, progress, onAction, className }: ExamCardProps) {
  const locked = exam.state === 'locked';
  const passed = exam.state === 'completed';
  const belowPass = exam.bestScore !== null && exam.bestScore < exam.passScore;

  return (
    <Card interactive className={cn(locked && 'opacity-70', className)}>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="text-body">{exam.title}</CardTitle>
          <CardDescription>
            {categoryLabel ? `${categoryLabel} · ` : ''}
            Pass at {formatPercent(exam.passScore, 0)} · {exam.attempts}{' '}
            {exam.attempts === 1 ? 'attempt' : 'attempts'}
          </CardDescription>
        </div>
        <Badge tone={STATE_TONE[exam.state]} dot={exam.state !== 'locked'}>
          {EXAM_STATE_LABEL[exam.state]}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-3">
        <p className="text-caption text-text-muted">{exam.summary}</p>

        <dl className="grid grid-cols-3 gap-2 text-caption">
          <div className="rounded-[var(--radius-control)] border border-border bg-surface-sunken px-2.5 py-2">
            <dt className="flex items-center gap-1 text-text-faint">
              <HelpCircle size={12} aria-hidden />
              Questions
            </dt>
            <dd className="num mt-0.5 text-text">{exam.questionCount}</dd>
          </div>
          <div className="rounded-[var(--radius-control)] border border-border bg-surface-sunken px-2.5 py-2">
            <dt className="flex items-center gap-1 text-text-faint">
              <Clock size={12} aria-hidden />
              Time
            </dt>
            <dd className="num mt-0.5 text-text">{exam.durationMinutes}m</dd>
          </div>
          <div className="rounded-[var(--radius-control)] border border-border bg-surface-sunken px-2.5 py-2">
            <dt className="flex items-center gap-1 text-text-faint">
              <Target size={12} aria-hidden />
              Best
            </dt>
            <dd className={cn('num mt-0.5', belowPass ? 'text-danger' : 'text-text')}>
              {exam.bestScore === null ? '—' : formatPercent(exam.bestScore, 0)}
            </dd>
          </div>
        </dl>

        {progress ? (
          <ProgressIndicator
            value={progress.value}
            max={progress.max}
            label="Attempt progress"
            tone="info"
            threshold={exam.passScore}
            showValue={false}
          />
        ) : null}

        {locked ? (
          <p className="flex items-center gap-1.5 text-caption text-text-faint">
            <Lock size={12} aria-hidden />
            Unlocks when {exam.prerequisites.join(', ')} is complete.
          </p>
        ) : null}
      </CardContent>

      <CardFooter>
        <span className="text-caption text-text-faint">
          {passed
            ? 'Every attempt is kept for longitudinal tracking.'
            : belowPass
              ? 'Below the pass score; the rubric shows which answers missed.'
              : exam.lastAttemptAt === null
                ? 'Never attempted.'
                : 'No score recorded yet.'}
        </span>
        {onAction === undefined ? (
          <Tooltip content="No exam service is connected in this phase, so this action is inert.">
            <span>
              <Button
                size="sm"
                variant={locked ? 'ghost' : 'secondary'}
                disabled
                leadingIcon={
                  locked ? (
                    <Lock size={13} aria-hidden />
                  ) : exam.state === 'failed' ? (
                    <RotateCcw size={13} aria-hidden />
                  ) : (
                    <Play size={13} aria-hidden />
                  )
                }
              >
                {ACTION_LABEL[exam.state]}
              </Button>
            </span>
          </Tooltip>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => onAction(exam.id)} disabled={locked}>
            {ACTION_LABEL[exam.state]}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
