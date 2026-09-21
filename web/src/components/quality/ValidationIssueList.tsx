import { SEVERITY_ORDER, type QualityIssue } from '@shared/quality/model';
import { DataQualityBadge } from './DataQualityBadge';
import { dimensionLabel, inputLabel, issueCodeLabel } from './labels';

/**
 * Every finding, in the order that matters, with its evidence.
 *
 * The list is what makes a classification checkable. `INSUFFICIENT` is a verdict; the
 * rows under it are *why*, each naming one input, one code and one dimension — so a
 * reader can disagree with a finding instead of having to take a verdict on trust.
 *
 * Ordering is severity-first, using the model's own `SEVERITY_ORDER`, and it is stable
 * within a severity (the catalog order, which the caller supplies). Nothing is filtered
 * out: `advisory` findings are shown too, because a surface that hides the mild findings
 * teaches the reader to trust the strong ones more than they should.
 *
 * No row can carry a value the user wrote. `detail` is the system's own sentence, and the
 * input is named by its label — that property is why this list is safe to show and to log.
 */

export interface ValidationIssueListProps {
  issues: readonly QualityIssue[];
  /** What to say when there is nothing to report. */
  emptyMessage?: string;
  className?: string;
}

/** Highest severity first, then the order the server sent. */
export function orderIssues(issues: readonly QualityIssue[]): QualityIssue[] {
  return [...issues]
    .map((issue, index) => ({ issue, index }))
    .sort((a, b) => {
      const bySeverity = SEVERITY_ORDER[b.issue.severity] - SEVERITY_ORDER[a.issue.severity];
      return bySeverity !== 0 ? bySeverity : a.index - b.index;
    })
    .map((entry) => entry.issue);
}

export function ValidationIssueList({ issues, emptyMessage, className }: ValidationIssueListProps) {
  if (issues.length === 0) {
    return (
      <p className={className ?? 'text-body-sm text-text-muted'}>
        {emptyMessage ?? 'No findings. Every input considered is present, well-formed and current.'}
      </p>
    );
  }

  return (
    <ul className={className ?? 'space-y-2'} aria-label="Validation findings" role="list">
      {orderIssues(issues).map((issue, index) => (
        <li
          key={`${issue.field}:${issue.code}:${index}`}
          className="flex flex-col gap-1 rounded-[var(--radius-control)] border border-border bg-surface-sunken px-3 py-2"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <DataQualityBadge kind="severity" value={issue.severity} />
            <span className="text-body-sm font-medium text-text">{inputLabel(issue.field)}</span>
            <span className="text-caption text-text-faint">
              · {dimensionLabel(issue.dimension)}
            </span>
          </div>
          <p className="text-body-sm text-text-muted">{issue.detail}</p>
          <p className="text-caption text-text-faint">
            <span className="font-mono">{issue.code}</span> — {issueCodeLabel(issue.code)}
          </p>
        </li>
      ))}
    </ul>
  );
}
