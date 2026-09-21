import type { ContextAssessment } from '@shared/profile/model';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../Card';
import { ContextStatusBadge, STATUS_LABEL } from './ContextStatusBadge';
import { cn } from '../../lib/cn';

/**
 * Completeness, shown as a proportion **and** its named gaps.
 *
 * The percentage is never rendered alone. "60% complete" is not actionable and invites
 * the reader to assume the missing 40% is unimportant; the list of what is missing is
 * the part a person can act on.
 *
 * The `weakest` status is displayed as well, because it is what actually governs: a
 * context that is complete but resting on assumed values is not a strong context, and
 * the meter must not average that away (ADR-0041).
 */
export function CompletenessMeter({ assessment }: { assessment: ContextAssessment }) {
  const { completionPercent, complete, gaps, stale, weakest } = assessment;
  const required = assessment.fields.filter((field) => field.required);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Context completeness</CardTitle>
        <CardDescription>
          Share of the fields the analysis capabilities require that carry a value you have actually
          given us. Missing fields are asked about, never filled in.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span
              className="text-heading-2 font-semibold text-text"
              data-testid="completion-percent"
            >
              {completionPercent}%
            </span>
            <span className="text-caption text-text-muted">
              {required.length - gaps.length - stale.length} of {required.length} required fields
            </span>
          </div>
          <div
            className="h-1.5 w-full overflow-hidden rounded-[var(--radius-pill)] bg-surface-sunken"
            role="progressbar"
            aria-valuenow={completionPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Context completeness"
          >
            <div
              className={cn(
                'h-full transition-[width] duration-[var(--duration-base)]',
                complete ? 'bg-success' : 'bg-primary',
              )}
              style={{ width: `${completionPercent}%` }}
            />
          </div>
        </div>

        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <dt className="text-caption text-text-muted">Weakest required field</dt>
            <dd className="flex items-center gap-2">
              <ContextStatusBadge status={weakest} />
              <span className="text-body-sm text-text">{STATUS_LABEL[weakest]}</span>
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-caption text-text-muted">Missing</dt>
            <dd className="text-body-sm text-text">{gaps.length}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-caption text-text-muted">May be outdated</dt>
            <dd className="text-body-sm text-text">{stale.length}</dd>
          </div>
        </dl>

        {complete ? (
          <p className="text-body-sm text-text-muted">
            Every required field is current. The analysis capabilities can answer the questions
            these inputs support.
          </p>
        ) : (
          <p className="text-body-sm text-text-muted">
            Until these are answered, capabilities that require them produce limited analysis or
            decline to be precise rather than substituting a default.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
