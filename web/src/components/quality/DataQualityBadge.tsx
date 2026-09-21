import {
  DIMENSION_VERDICT_LABEL,
  SEVERITY_LABEL,
  type QualitySeverity,
} from '@shared/quality/model';
import {
  CLASSIFICATION_LABEL,
  CLASSIFICATION_MEANING,
  OUTPUT_MODE_LABEL,
  READINESS_LABEL,
  READINESS_MEANING,
} from '@shared/quality/readiness';
import type { BadgeProps, BadgeTone } from '../Badge';
import { Badge } from '../Badge';
import { Tooltip } from '../Tooltip';

/**
 * One badge for every quality vocabulary the assessment speaks.
 *
 * The vocabularies are closed sets in the contract (`QualitySeverity`,
 * `DimensionVerdict`, `QualityClassification`, `Readiness`, `OutputMode`), so this
 * component is a lookup rather than a formatter. Three rules it keeps:
 *
 *   1. **The contract's own words.** Where the shared model exports a label map —
 *      severity, classification, readiness, output mode — that is the map used here.
 *      A second vocabulary in the UI would eventually describe a different state.
 *   2. **An unknown token renders as itself.** A value this build does not know is
 *      shown raw, never prettified into something it might not be. That is the same
 *      rule the profile surface follows for its own statuses.
 *   3. **`kind` is required.** `stale` means one thing about freshness and another
 *      about severity, so a badge cannot be constructed without saying which set the
 *      value belongs to.
 */

export type QualityBadgeKind =
  | 'severity'
  | 'verdict'
  | 'classification'
  | 'readiness'
  | 'freshness'
  | 'confidence'
  | 'validation'
  | 'outputMode';

interface Presentation {
  readonly label: string;
  readonly tone: BadgeTone;
  readonly meaning: string;
}

/**
 * Freshness, confidence and validation vocabulary.
 *
 * These three have no exported label map in the shared model — the gate compares
 * them, it does not translate them — so their presentation lives here, beside the
 * other presentation. Anything the model *does* name is imported instead.
 */
const FRESHNESS: Readonly<Record<string, Presentation>> = {
  current: {
    label: 'Current',
    tone: 'success',
    meaning: 'Inside the freshness window for this kind of input.',
  },
  stale: {
    label: 'Out of date',
    tone: 'warning',
    meaning: 'It was usable and has aged past the window for this kind of input.',
  },
  undated: {
    label: 'Undated',
    tone: 'outline',
    meaning:
      'No observation time, so it cannot be assessed for recency and is treated as an assumption.',
  },
  absent: {
    label: 'Absent',
    tone: 'neutral',
    meaning: 'Nothing is stored for this input.',
  },
};

const CONFIDENCE: Readonly<Record<string, Presentation>> = {
  confirmed: {
    label: 'Confirmed',
    tone: 'success',
    meaning: 'You gave this value, and it is inside its freshness window.',
  },
  derived: {
    label: 'Derived',
    tone: 'info',
    meaning: 'Computed from values you gave, by deterministic code rather than by a model.',
  },
  assumed: {
    label: 'Assumed',
    tone: 'outline',
    meaning: 'Not provided. It is never treated as a fact and never pre-filled.',
  },
  untrusted: {
    label: 'Unverified',
    tone: 'warning',
    meaning: 'Present, but its provenance is not recorded well enough to weigh it.',
  },
  missing: {
    label: 'Missing',
    tone: 'danger',
    meaning: 'Nothing is stored for this input, and an analysis that needs it cannot run.',
  },
};

const VALIDATION: Readonly<Record<string, Presentation>> = {
  valid: {
    label: 'Valid',
    tone: 'success',
    meaning: 'The value is a well-formed value of its declared kind.',
  },
  invalid: {
    label: 'Invalid',
    tone: 'danger',
    meaning: 'Not a usable value of its declared kind, so it has to be corrected.',
  },
  unchecked: {
    label: 'Unchecked',
    tone: 'neutral',
    meaning: 'Nothing was present to check.',
  },
};

/** Severity and dimension verdicts, in the model's words, with tones added here. */
const SEVERITY_TONE: Readonly<Record<QualitySeverity, BadgeTone>> = {
  blocking: 'danger',
  conflicting: 'danger',
  missing: 'warning',
  stale: 'warning',
  unverified: 'outline',
  advisory: 'neutral',
};

const VERDICT_TONE: Readonly<Record<string, BadgeTone>> = {
  ok: 'success',
  impaired: 'warning',
  failed: 'danger',
  'not-applicable': 'neutral',
};

const CLASSIFICATION_TONE: Readonly<Record<string, BadgeTone>> = {
  SUFFICIENT: 'success',
  PARTIALLY_SUFFICIENT: 'info',
  INSUFFICIENT: 'warning',
  INVALID: 'danger',
  STALE: 'warning',
  CONFLICTING: 'danger',
  UNVERIFIED: 'outline',
};

const READINESS_TONE: Readonly<Record<string, BadgeTone>> = {
  READY_FOR_ANALYSIS: 'success',
  READY_WITH_LIMITATIONS: 'info',
  REQUIRES_CLARIFICATION: 'warning',
  BLOCKED: 'danger',
};

const OUTPUT_MODE_TONE: Readonly<Record<string, BadgeTone>> = {
  'full-analysis': 'success',
  'limited-analysis': 'info',
  'labelled-hypothetical': 'warning',
  clarification: 'warning',
  refusal: 'danger',
};

/**
 * Which label map and tone map a kind uses.
 *
 * The label maps come from `@shared/quality/*`; only the tone is a UI decision.
 * `meaning` falls back to the label map's own sentence where the contract ships one.
 */
const KINDS: Readonly<
  Record<
    QualityBadgeKind,
    { labels: Readonly<Record<string, string>>; tones: Readonly<Record<string, BadgeTone>> }
  >
> = {
  severity: { labels: SEVERITY_LABEL, tones: SEVERITY_TONE },
  verdict: { labels: DIMENSION_VERDICT_LABEL, tones: VERDICT_TONE },
  classification: { labels: CLASSIFICATION_LABEL, tones: CLASSIFICATION_TONE },
  readiness: { labels: READINESS_LABEL, tones: READINESS_TONE },
  outputMode: { labels: OUTPUT_MODE_LABEL, tones: OUTPUT_MODE_TONE },
  freshness: { labels: {}, tones: {} },
  confidence: { labels: {}, tones: {} },
  validation: { labels: {}, tones: {} },
};

/** The three kinds whose words this file owns. */
const LOCAL: Readonly<
  Record<'freshness' | 'confidence' | 'validation', Readonly<Record<string, Presentation>>>
> = {
  freshness: FRESHNESS,
  confidence: CONFIDENCE,
  validation: VALIDATION,
};

/** What the badge will show, exported so a caller can mirror it without guessing. */
export function qualityBadgePresentation(kind: QualityBadgeKind, value: string): Presentation {
  const local = (LOCAL as Readonly<Record<string, Readonly<Record<string, Presentation>>>>)[kind];
  if (local !== undefined) {
    return (
      local[value] ?? {
        label: value,
        tone: 'neutral',
        meaning: 'This build does not know this token, so it is shown exactly as it was sent.',
      }
    );
  }
  const set = KINDS[kind];
  const label = set.labels[value];
  if (label === undefined) {
    return {
      label: value,
      tone: 'neutral',
      meaning: 'This build does not know this token, so it is shown exactly as it was sent.',
    };
  }
  return {
    label,
    tone: set.tones[value] ?? 'neutral',
    meaning:
      (CLASSIFICATION_MEANING as Readonly<Record<string, string>>)[value] ??
      (READINESS_MEANING as Readonly<Record<string, string>>)[value] ??
      label,
  };
}

export interface DataQualityBadgeProps extends Omit<BadgeProps, 'tone' | 'children'> {
  kind: QualityBadgeKind;
  value: string;
  /** Extra sentence from the contract, appended to the meaning in the tooltip. */
  detail?: string;
}

export function DataQualityBadge({ kind, value, detail, ...rest }: DataQualityBadgeProps) {
  const shown = qualityBadgePresentation(kind, value);
  return (
    <Tooltip content={detail === undefined ? shown.meaning : `${shown.meaning} ${detail}`}>
      <Badge tone={shown.tone} {...rest}>
        {shown.label}
      </Badge>
    </Tooltip>
  );
}
