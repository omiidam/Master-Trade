import { Clock, HelpCircle, Lock, Play, RotateCcw, Target } from 'lucide-react';
import { cn } from '../../lib/cn';
import { formatPercent } from '../../lib/format';
import { Badge, type BadgeTone } from '../Badge';
import { Button } from '../Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTile,
  CardTitle,
} from '../Card';
import { Tooltip } from '../Tooltip';
import { ProgressIndicator } from './ProgressIndicator';
import { EXAM_STATE_LABEL, type ExamDefinition, type ExamRunState } from '../../mock/exams';
import { msg, liveLabels } from '../../i18n/index.js';

const STATE_TONE: Record<ExamRunState, BadgeTone> = {
  available: 'neutral',
  'in-progress': 'info',
  completed: 'primary',
  failed: 'danger',
  locked: 'outline',
};

/** Label for the state-appropriate action; every one is inert in this phase. */
const ACTION_LABEL: Record<ExamRunState, string> = liveLabels({
  available: 'exams.action.available',
  'in-progress': 'exams.action.in-progress',
  completed: 'exams.action.completed',
  failed: 'exams.action.failed',
  locked: 'exams.action.locked',
});

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
    <Card surface="metric" interactive className={cn(locked && 'opacity-70', className)}>
      <CardHeader divider>
        <div className="min-w-0">
          <CardTitle className="text-body">{exam.title}</CardTitle>
          <CardDescription>
            {categoryLabel ? `${categoryLabel} · ` : ''}
            {msg('exams.passAt')} {formatPercent(exam.passScore, 0)} · {exam.attempts}{' '}
            {exam.attempts === 1 ? 'attempt' : 'attempts'}
          </CardDescription>
        </div>
        <Badge tone={STATE_TONE[exam.state]} dot={exam.state !== 'locked'}>
          {EXAM_STATE_LABEL[exam.state]}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-3">
        <p className="text-caption text-text-muted">{exam.summary}</p>

        {/* Mobile-first: three labelled facts stack on a phone and become a row on a
            tablet, where there is room for them side by side without shrinking the
            label to the point of wrapping mid-word. */}
        <dl className="grid grid-cols-1 gap-2 text-caption sm:grid-cols-3">
          <CardTile space="tight">
            <dt className="flex items-center gap-1 text-text-faint">
              <HelpCircle size={12} aria-hidden />
              {msg('exams.questions')}
            </dt>
            <dd className="num mt-0.5 text-text">{exam.questionCount}</dd>
          </CardTile>
          <CardTile space="tight">
            <dt className="flex items-center gap-1 text-text-faint">
              <Clock size={12} aria-hidden />
              {msg('exams.time')}
            </dt>
            <dd className="num mt-0.5 text-text">
              {exam.durationMinutes}
              {msg('exams.m')}
            </dd>
          </CardTile>
          <CardTile space="tight">
            <dt className="flex items-center gap-1 text-text-faint">
              <Target size={12} aria-hidden />
              {msg('exams.best')}
            </dt>
            <dd className={cn('num mt-0.5', belowPass ? 'text-danger' : 'text-text')}>
              {exam.bestScore === null ? '—' : formatPercent(exam.bestScore, 0)}
            </dd>
          </CardTile>
        </dl>

        {progress ? (
          <ProgressIndicator
            value={progress.value}
            max={progress.max}
            label={msg('examCard.attemptProgress')}
            tone="info"
            threshold={exam.passScore}
            showValue={false}
          />
        ) : null}

        {locked ? (
          <p className="flex items-center gap-1.5 text-caption text-text-faint">
            <Lock size={12} aria-hidden />
            {msg('exams.unlocksWhen')} {exam.prerequisites.join(', ')} {msg('exams.isComplete')}
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
          <Tooltip content={msg('examCard.noExamServiceIsConnectedInThisPhase')}>
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
