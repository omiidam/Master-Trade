import { AlertTriangle, ArrowUpRight } from 'lucide-react';
import { cn } from '../../lib/cn';
import { formatPercent, formatTimestamp } from '../../lib/format';
import { Badge } from '../Badge';
import { Button } from '../Button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../Card';
import { EmptyState } from '../EmptyState';

export interface MistakePatternInput {
  id: string;
  topic: string;
  occurrences: number;
  /** Share of all incorrect answers, 0..1. */
  share: number;
  note: string;
  lastSeenAt: string;
  lessonId: string;
}

export interface MistakeAnalysisCardProps {
  patterns: readonly MistakePatternInput[];
  /** Total incorrect answers the shares are taken against. */
  incorrectAnswers?: number;
  className?: string;
}

/**
 * Where the marks were lost, grouped by cause.
 *
 * Grouping by *pattern* rather than by question is the point: a list of wrong
 * answers tells you nothing, while "five misses, all rounding the size up" names
 * the lesson to rework. Shares are shown against the number of incorrect answers
 * so the denominator is never hidden.
 */
export function MistakeAnalysisCard({
  patterns,
  incorrectAnswers,
  className,
}: MistakeAnalysisCardProps) {
  const widest = patterns.reduce((max, pattern) => Math.max(max, pattern.share), 0);

  return (
    <Card className={className}>
      <CardHeader divider>
        <div>
          <CardTitle className="text-body">Mistake analysis</CardTitle>
          <CardDescription>
            {patterns.length === 0
              ? 'No incorrect answers recorded'
              : `${patterns.length} recurring ${patterns.length === 1 ? 'pattern' : 'patterns'}${
                  incorrectAnswers === undefined
                    ? ''
                    : ` across ${incorrectAnswers} incorrect answers`
                }`}
          </CardDescription>
        </div>
        <Badge tone="warning" icon={<AlertTriangle size={12} aria-hidden />}>
          review
        </Badge>
      </CardHeader>

      <CardContent>
        {patterns.length === 0 ? (
          <EmptyState
            title="Nothing missed yet"
            description="Mistake patterns appear once a graded attempt has incorrect answers. An ungraded attempt produces no analysis."
            hint="Empty is stated, not hidden."
          />
        ) : (
          <ul className="space-y-3">
            {patterns.map((pattern) => (
              <li key={pattern.id} className="space-y-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-body text-text">{pattern.topic}</p>
                  <span className="num text-caption text-text-muted">
                    {pattern.occurrences} misses · {formatPercent(pattern.share * 100, 0)} of misses
                  </span>
                </div>
                <div
                  role="img"
                  aria-label={`${formatPercent(pattern.share * 100, 0)} of incorrect answers`}
                  className="h-1.5 w-full overflow-hidden rounded-[var(--radius-pill)] bg-surface-sunken"
                >
                  <div
                    className={cn(
                      'h-full rounded-[var(--radius-pill)]',
                      pattern.share >= widest * 0.75 ? 'bg-warning' : 'bg-info',
                    )}
                    style={{ width: `${Math.round((pattern.share / (widest || 1)) * 100)}%` }}
                  />
                </div>
                <p className="text-caption text-text-muted">{pattern.note}</p>
                <p className="text-caption text-text-faint">
                  Points back to <span className="num">{pattern.lessonId}</span> · last seen{' '}
                  {formatTimestamp(pattern.lastSeenAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <CardFooter className="text-caption text-text-faint">
        <span>Patterns come from stored attempt results, never from a model summary.</span>
        <Button
          size="sm"
          variant="ghost"
          disabled
          trailingIcon={<ArrowUpRight size={13} aria-hidden />}
        >
          Open review plan
        </Button>
      </CardFooter>
    </Card>
  );
}
