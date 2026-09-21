import type { EvaluatedInput, InputFreshness } from '@shared/quality/model';
import { DataQualityBadge } from './DataQualityBadge';

/**
 * How old one input is, and what that means for using it.
 *
 * Freshness is **not** a global time-to-live: the window belongs to the kind of input,
 * so the contract computes the status and this component only reports it. The age is
 * shown next to the status on purpose — "out of date" without a number is an opinion,
 * and "out of date, 41 days" is a fact the user can act on.
 *
 * When a value carries no observation time it is not silently treated as fresh. That
 * is the whole reason the `undated` state exists, and it is labelled here in the same
 * words the gate uses.
 */

/** `11 days`, `1 day`, `today` — coarse on purpose; the exact instant is shown too. */
export function describeAge(ageDays: number | null): string {
  if (ageDays === null) return 'no observation time';
  if (ageDays === 0) return 'observed today';
  if (ageDays === 1) return 'observed 1 day ago';
  return `observed ${ageDays} days ago`;
}

export interface DataFreshnessIndicatorProps {
  freshness: InputFreshness;
  /** ISO timestamp, or `null` when the value carries none. */
  observedAt?: string | null;
  /**
   * Age in whole days. Passed rather than derived so the UI cannot disagree with the
   * assessment about what "now" was.
   */
  ageDays?: number | null;
  /** The input this describes, when the indicator stands alone rather than in a row. */
  label?: string;
  /** Shown instead of the age when the input is absent. */
  absentDetail?: string;
  className?: string;
}

export function DataFreshnessIndicator({
  freshness,
  observedAt = null,
  ageDays = null,
  label,
  absentDetail,
  className,
}: DataFreshnessIndicatorProps) {
  if (freshness === 'absent') {
    return (
      <span className={className}>
        <DataQualityBadge
          kind="freshness"
          value="absent"
          {...(absentDetail === undefined ? {} : { detail: absentDetail })}
        />
      </span>
    );
  }

  return (
    <span className={className ?? 'inline-flex items-center gap-2'}>
      <DataQualityBadge kind="freshness" value={freshness} />
      <span className="text-caption text-text-muted">
        {label === undefined ? '' : `${label} · `}
        {describeAge(ageDays)}
        {observedAt === null ? '' : ` · ${new Date(observedAt).toLocaleString()}`}
      </span>
    </span>
  );
}

/** Convenience wrapper so a row can pass the evaluated input straight through. */
export function InputFreshnessCell({ input }: { input: EvaluatedInput }) {
  return (
    <DataFreshnessIndicator
      freshness={input.freshness}
      observedAt={input.observedAt}
      ageDays={input.ageDays}
    />
  );
}
