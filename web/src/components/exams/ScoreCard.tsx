import { TrendingDown, TrendingUp } from 'lucide-react';
import { formatPercent, formatTimestamp } from '../../lib/format';
import { Badge } from '../Badge';
import { Card, CardContent, CardFooter, CardHeader, CardTile, CardTitle } from '../Card';
import { Sparkline } from '../charts/Sparkline';
import { msg } from '../../i18n/index.js';

export interface ScorePointInput {
  at: string;
  score: number;
}

export interface ScoreCardProps {
  title: string;
  /** Best score across attempts, or null when never scored. */
  bestScore: number | null;
  passScore: number;
  attempts: number;
  /** Oldest first; feeds the trend and the delta. */
  evolution: readonly ScorePointInput[];
  /** Mean score across graded attempts, or null. */
  meanScore?: number | null;
  footnote?: string;
  className?: string;
}

/**
 * Score summary for one assessment.
 *
 * Pass/fail is shown against the exam's own threshold rather than an invented
 * grade band, and the trend is drawn from real attempt order — a single attempt
 * produces no trend line rather than a flat one implying stability.
 */
export function ScoreCard({
  title,
  bestScore,
  passScore,
  attempts,
  evolution,
  meanScore,
  footnote,
  className,
}: ScoreCardProps) {
  const passed = bestScore !== null && bestScore >= passScore;
  const values = evolution.map((point) => point.score);
  const first = values[0];
  const last = values[values.length - 1];
  const hasTrend = values.length >= 2 && first !== undefined && last !== undefined;
  const delta = hasTrend ? last - first : null;

  return (
    <Card surface="metric" className={className}>
      <CardHeader divider>
        <div>
          <CardTitle className="text-body">{title}</CardTitle>
          <p className="mt-1 text-caption text-text-muted">
            {attempts} {attempts === 1 ? 'attempt' : 'attempts'} {msg('exams.passAt2')}{' '}
            {formatPercent(passScore, 0)}
          </p>
        </div>
        <Badge tone={bestScore === null ? 'outline' : passed ? 'primary' : 'danger'}>
          {bestScore === null ? 'Not scored' : passed ? 'Passed' : 'Below pass'}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <span className="num text-display text-text">
              {bestScore === null ? '—' : formatPercent(bestScore, 0)}
            </span>
            <p className="mt-1 text-caption text-text-faint">{msg('exams.bestScore')}</p>
          </div>
          <div className="text-end">
            <span className="num text-body text-text-muted">
              {meanScore === null || meanScore === undefined ? '—' : formatPercent(meanScore, 1)}
            </span>
            <p className="text-caption text-text-faint">{msg('exams.meanOfGradedAttempts')}</p>
          </div>
        </div>

        {hasTrend ? (
          <CardTile className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-caption text-text-muted">
              {delta !== null && delta >= 0 ? (
                <span className="text-primary">
                  <TrendingUp size={14} aria-hidden />
                </span>
              ) : (
                <span className="text-warning">
                  <TrendingDown size={14} aria-hidden />
                </span>
              )}
              <span className="inline-flex items-baseline gap-1">
                {/*
                  The delta is a *signed figure*, so it is separated from the phrase beside it and
                  isolated in `.num`. A leading `+` is a neutral to the bidi algorithm: left inside
                  the sentence it resolves against the paragraph, and in a right-to-left one it is
                  painted on the far side of its own digits — `+33%` drawing as `33%+`, a different
                  number wearing the same characters. The phrase keeps the page's own flow, which is
                  why the two are two elements and not one string.
                */}
                <span className="num">
                  {delta !== null && delta >= 0 ? '+' : ''}
                  {delta === null ? '—' : formatPercent(delta, 0)}
                </span>
                <span>{msg('exams.acrossAttempts')}</span>
              </span>
            </div>
            <Sparkline values={values} width={96} height={22} tone={passed ? 'primary' : 'info'} />
          </CardTile>
        ) : (
          <p className="text-caption text-text-faint">
            {values.length === 0
              ? 'No graded attempt yet, so there is no trend to draw.'
              : 'One graded attempt: a trend needs a second point.'}
          </p>
        )}
      </CardContent>

      <CardFooter className="text-caption text-text-faint">
        <span>
          {evolution.length === 0
            ? 'Nothing to compare'
            : `Latest graded attempt ${formatTimestamp(evolution[evolution.length - 1]?.at ?? '')}`}
        </span>
        <span>{footnote}</span>
      </CardFooter>
    </Card>
  );
}
