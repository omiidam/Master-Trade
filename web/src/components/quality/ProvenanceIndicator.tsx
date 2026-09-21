import type { ProvenanceRef } from '@shared/quality/model';
import { Badge } from '../Badge';
import { Tooltip } from '../Tooltip';

/**
 * Where one input came from, in the smallest form that is still checkable.
 *
 * Two properties matter more than the styling:
 *
 *   1. **Absence is shown, not skipped.** `provenance === null` is a finding — the
 *      contract raises `missing-provenance` for it — so a row with nothing to point at
 *      says so in the same place a row with a source shows one. A blank cell would read
 *      as "fine".
 *   2. **A reference is a pointer, not a copy.** Only the source kind, the reference and
 *      the trust level are rendered. The value itself is never reproduced here, which is
 *      what keeps the assessment safe to display and to log.
 */

const SOURCE_LABEL: Readonly<Record<ProvenanceRef['source'], string>> = {
  user: 'You',
  derived: 'Derived',
  system: 'System',
  'market-data': 'Market data',
};

const TRUST_TONE: Readonly<Record<ProvenanceRef['trust'], 'success' | 'warning' | 'outline'>> = {
  authoritative: 'success',
  verified: 'success',
  unverified: 'warning',
};

const TRUST_MEANING: Readonly<Record<ProvenanceRef['trust'], string>> = {
  authoritative: 'An authoritative source: the system read it directly rather than being told.',
  verified: 'Confirmed against a source the system can point at.',
  unverified: 'Nothing confirms this beyond the claim itself, so it cannot be weighed fully.',
};

export interface ProvenanceIndicatorProps {
  provenance: ProvenanceRef | null;
  /** What the missing-provenance case should say about this particular field. */
  missingDetail?: string;
  className?: string;
}

export function ProvenanceIndicator({
  provenance,
  missingDetail,
  className,
}: ProvenanceIndicatorProps) {
  if (provenance === null) {
    return (
      <Tooltip
        content={
          missingDetail ??
          'No provenance was recorded for this input, so its reliability cannot be assessed. The assessment reports this rather than assuming it is sound.'
        }
      >
        <Badge tone="outline" className={className}>
          No provenance recorded
        </Badge>
      </Tooltip>
    );
  }

  return (
    <span className={className ?? 'inline-flex flex-wrap items-center gap-1.5'}>
      <Badge tone="neutral">{SOURCE_LABEL[provenance.source]}</Badge>
      <Tooltip content={`Where this came from: ${provenance.ref}`}>
        <Badge tone="outline" className="max-w-[18rem] truncate font-mono text-caption">
          {provenance.ref}
        </Badge>
      </Tooltip>
      <Tooltip content={TRUST_MEANING[provenance.trust]}>
        <Badge tone={TRUST_TONE[provenance.trust]}>{provenance.trust}</Badge>
      </Tooltip>
      <span className="text-caption text-text-faint">
        recorded {new Date(provenance.recordedAt).toLocaleString()}
      </span>
    </span>
  );
}

/** The same pointer, applied to a whole evaluated input with its label. */
export function InputProvenanceCell({
  label,
  provenance,
}: {
  label: string;
  provenance: ProvenanceRef | null;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-caption text-text-muted">{label}</span>
      <ProvenanceIndicator provenance={provenance} />
    </div>
  );
}
