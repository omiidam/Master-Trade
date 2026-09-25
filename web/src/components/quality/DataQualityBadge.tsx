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
import { msg } from '../../i18n/index.js';

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
    get label(): string {
      return msg('usage.current');
    },
    tone: 'success',
    get meaning(): string {
      return msg('dataQualityBadge.insideTheFreshnessWindowForThisKindOf');
    },
  },
  stale: {
    get label(): string {
      return msg('analysisReadinessPanel.outOfDate');
    },
    tone: 'warning',
    get meaning(): string {
      return msg('dataQualityBadge.itWasUsableAndHasAgedPastThe');
    },
  },
  undated: {
    get label(): string {
      return msg('dataQualityBadge.undated');
    },
    tone: 'outline',
    get meaning(): string {
      return msg('dataQualityBadge.noObservationTimeSoItCannotBeAssessed');
    },
  },
  absent: {
    get label(): string {
      return msg('dataQualityBadge.absent');
    },
    tone: 'neutral',
    get meaning(): string {
      return msg('dataQualityBadge.nothingIsStoredForThisInput');
    },
  },
};

const CONFIDENCE: Readonly<Record<string, Presentation>> = {
  confirmed: {
    get label(): string {
      return msg('decisions.confidence.confirmed');
    },
    tone: 'success',
    get meaning(): string {
      return msg('dataQualityBadge.youGaveThisValueAndItIsInside');
    },
  },
  derived: {
    get label(): string {
      return msg('decisions.confidence.derived');
    },
    tone: 'info',
    get meaning(): string {
      return msg('dataQualityBadge.computedFromValuesYouGaveByDeterministicCode');
    },
  },
  assumed: {
    get label(): string {
      return msg('decisions.confidence.assumed');
    },
    tone: 'outline',
    get meaning(): string {
      return msg('dataQualityBadge.notProvidedItIsNeverTreatedAsA');
    },
  },
  untrusted: {
    get label(): string {
      return msg('memory.memoryStatus.unverified');
    },
    tone: 'warning',
    get meaning(): string {
      return msg('dataQualityBadge.presentButItsProvenanceIsNotRecordedWell');
    },
  },
  missing: {
    get label(): string {
      return msg('decisions.confidence.missing');
    },
    tone: 'danger',
    get meaning(): string {
      return msg('dataQualityBadge.nothingIsStoredForThisInputAndAn');
    },
  },
};

const VALIDATION: Readonly<Record<string, Presentation>> = {
  valid: {
    get label(): string {
      return msg('dataQualityBadge.valid');
    },
    tone: 'success',
    get meaning(): string {
      return msg('dataQualityBadge.theValueIsAWellFormedValueOfIts');
    },
  },
  invalid: {
    get label(): string {
      return msg('analysisReadinessPanel.invalid');
    },
    tone: 'danger',
    get meaning(): string {
      return msg('dataQualityBadge.notAUsableValueOfItsDeclaredKind');
    },
  },
  unchecked: {
    get label(): string {
      return msg('dataQualityBadge.unchecked');
    },
    tone: 'neutral',
    get meaning(): string {
      return msg('dataQualityBadge.nothingWasPresentToCheck');
    },
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
        meaning: msg('dataQualityBadge.thisBuildDoesNotKnowThisTokenSo'),
      }
    );
  }
  const set = KINDS[kind];
  const label = set.labels[value];
  if (label === undefined) {
    return {
      label: value,
      tone: 'neutral',
      meaning: msg('dataQualityBadge.thisBuildDoesNotKnowThisTokenSo'),
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
