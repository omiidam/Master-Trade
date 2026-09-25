import type { ContextAssessment } from '@shared/profile/model';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../Card';
import { ContextStatusBadge, STATUS_LABEL } from './ContextStatusBadge';
import { cn } from '../../lib/cn';
import { msg } from '../../i18n/index.js';

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
      <CardHeader divider>
        <CardTitle>{msg('profile.contextCompleteness')}</CardTitle>
        <CardDescription>{msg('profile.shareOfTheFieldsTheAnalysis')}</CardDescription>
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
              {required.length - gaps.length - stale.length} {msg('exams.of')} {required.length}{' '}
              {msg('profile.requiredFields')}
            </span>
          </div>
          <div
            className="h-1.5 w-full overflow-hidden rounded-[var(--radius-pill)] bg-surface-sunken"
            role="progressbar"
            aria-valuenow={completionPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={msg('profile.contextCompleteness')}
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
            <dt className="text-caption text-text-muted">{msg('profile.weakestRequiredField')}</dt>
            <dd className="flex items-center gap-2">
              <ContextStatusBadge status={weakest} />
              <span className="text-body text-text">{STATUS_LABEL[weakest]}</span>
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-caption text-text-muted">{msg('profile.missing')}</dt>
            <dd className="text-body text-text">{gaps.length}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-caption text-text-muted">{msg('profile.mayBeOutdated')}</dt>
            <dd className="text-body text-text">{stale.length}</dd>
          </div>
        </dl>

        {complete ? (
          <p className="text-body text-text-muted">
            {msg('profile.everyRequiredFieldIsCurrentThe')}
          </p>
        ) : (
          <p className="text-body text-text-muted">
            {msg('profile.untilTheseAreAnsweredCapabilitiesThat')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
