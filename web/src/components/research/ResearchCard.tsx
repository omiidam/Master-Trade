import { Lightbulb, ShieldCheck, Sigma } from 'lucide-react';
import { cn } from '../../lib/cn';
import { formatPercent, formatRelative } from '../../lib/format';
import { Badge, type BadgeTone } from '../Badge';
import { Button } from '../Button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../Card';
import { Tooltip } from '../Tooltip';
import {
  EXPERIMENT_STATUS_LABEL,
  EXPERIMENT_VERDICT_LABEL,
  type ExperimentStatus,
  type ExperimentVerdict,
} from '../../mock/research';

const STATUS_TONE: Record<ExperimentStatus, BadgeTone> = {
  planned: 'outline',
  running: 'info',
  complete: 'neutral',
  'awaiting-approval': 'warning',
  abandoned: 'outline',
};

const VERDICT_TONE: Record<ExperimentVerdict, BadgeTone> = {
  promising: 'primary',
  inconclusive: 'warning',
  rejected: 'danger',
  pending: 'outline',
};

export interface ResearchExperimentInput {
  id: string;
  title: string;
  hypothesis: string;
  method: string;
  status: ExperimentStatus;
  verdict: ExperimentVerdict;
  ruleRef: string;
  metrics: { sampleSize: number; averageR: number; confidencePct: number } | null;
  approvalRef: string | null;
  updatedAt: string;
}

export interface ResearchCardProps {
  experiment: ResearchExperimentInput;
  onOpen?: (experimentId: string) => void;
  className?: string;
}

/**
 * One experiment.
 *
 * The hypothesis is shown verbatim and above the numbers, so the reader judges
 * whether the measurement actually tests the claim. An experiment awaiting a
 * decision says so on the card — an "active rule" badge in this product would be
 * a lie, because activation requires a recorded human approval.
 */
export function ResearchCard({ experiment, onOpen, className }: ResearchCardProps) {
  const awaiting = experiment.status === 'awaiting-approval';

  return (
    <Card
      interactive={onOpen !== undefined}
      className={cn(experiment.status === 'abandoned' && 'opacity-75', className)}
    >
      <CardHeader>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[experiment.status]} dot={experiment.status === 'running'}>
              {EXPERIMENT_STATUS_LABEL[experiment.status]}
            </Badge>
            <Badge tone={VERDICT_TONE[experiment.verdict]}>
              {EXPERIMENT_VERDICT_LABEL[experiment.verdict]}
            </Badge>
          </div>
          <CardTitle className="mt-2 text-body">{experiment.title}</CardTitle>
          <CardDescription>
            <span className="num">{experiment.ruleRef}</span> · updated{' '}
            {formatRelative(experiment.updatedAt)}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="rounded-[var(--radius-control)] border border-border bg-surface-sunken px-3 py-2">
          <p className="flex items-center gap-1.5 text-caption font-medium text-text-muted">
            <Lightbulb size={12} aria-hidden />
            Hypothesis
          </p>
          <p className="mt-1 text-caption text-text">{experiment.hypothesis}</p>
        </div>

        <p className="text-caption text-text-muted">{experiment.method}</p>

        {experiment.metrics ? (
          <dl className="grid grid-cols-3 gap-2 text-caption">
            <div className="rounded-[var(--radius-control)] border border-border px-2.5 py-2">
              <dt className="flex items-center gap-1 text-text-faint">
                <Sigma size={12} aria-hidden />
                Sample
              </dt>
              <dd className="num mt-0.5 text-text">{experiment.metrics.sampleSize}</dd>
            </div>
            <div className="rounded-[var(--radius-control)] border border-border px-2.5 py-2">
              <dt className="text-text-faint">Avg R</dt>
              <dd
                className={cn(
                  'num mt-0.5',
                  experiment.metrics.averageR >= 0 ? 'text-text' : 'text-danger',
                )}
              >
                {experiment.metrics.averageR > 0 ? '+' : ''}
                {experiment.metrics.averageR.toFixed(2)}
              </dd>
            </div>
            <div className="rounded-[var(--radius-control)] border border-border px-2.5 py-2">
              <dt className="text-text-faint">Confidence</dt>
              <dd className="num mt-0.5 text-text">
                {formatPercent(experiment.metrics.confidencePct, 0)}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-caption text-text-faint">
            No evaluation attached yet, so no metrics are shown.
          </p>
        )}

        {awaiting ? (
          <p className="flex items-start gap-1.5 text-caption text-warning">
            <ShieldCheck size={13} aria-hidden className="mt-0.5 shrink-0" />
            Waiting on a recorded human decision
            {experiment.approvalRef ? (
              <span className="num text-text-muted">({experiment.approvalRef})</span>
            ) : null}
            . The rule stays inactive until then.
          </p>
        ) : null}
      </CardContent>

      <CardFooter className="text-caption text-text-faint">
        <span>
          {experiment.verdict === 'pending'
            ? 'No verdict recorded'
            : `Verdict: ${EXPERIMENT_VERDICT_LABEL[experiment.verdict]}`}
        </span>
        {onOpen === undefined ? (
          <Tooltip content="No research service is connected in this phase, so this action is inert.">
            <span>
              <Button size="sm" variant="ghost" disabled>
                Open experiment
              </Button>
            </span>
          </Tooltip>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => onOpen(experiment.id)}>
            Open experiment
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
