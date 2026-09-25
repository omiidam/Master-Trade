import { FIELD_LABELS, type FieldKey } from '@shared/profile/model';
import type { InputRef, QualityDimension } from '@shared/quality/model';
import { liveLabels } from '../../i18n/index.js';

/**
 * Names for the things an assessment talks about.
 *
 * An assessment refers to inputs by key (`InputRef`) and to the quality dimensions by
 * name, and neither carries a display label — deliberately, because the backend never
 * needs one. The words therefore live in one place here rather than being re-invented
 * in each component, so a claim and the thing it is about cannot end up printed under
 * two different names.
 *
 * Field names come from the profile model's own `FIELD_LABELS`: the profile surface and
 * the quality surface are describing the same fields, and one of them drifting would be
 * a bug the user sees as two different vocabularies for one declaration.
 */

/** A label for any input a finding can name. */
export function inputLabel(ref: InputRef): string {
  if (ref === 'marketData') return 'Market data';
  return FIELD_LABELS[ref as FieldKey] ?? String(ref);
}

const DIMENSION_LABEL: Readonly<Record<QualityDimension, string>> = liveLabels({
  completeness: 'quality.dimension.completeness',
  validity: 'quality.dimension.validity',
  consistency: 'quality.dimension.consistency',
  reliability: 'quality.dimension.reliability',
  freshness: 'quality.dimension.freshness',
  relevance: 'quality.dimension.relevance',
  confidence: 'quality.dimension.confidence',
  provenance: 'quality.dimension.provenance',
});

export function dimensionLabel(dimension: QualityDimension): string {
  return DIMENSION_LABEL[dimension] ?? String(dimension);
}

/** Stable, human-readable names for the technical codes a finding carries. */
const CODE_LABEL: Readonly<Record<string, string>> = liveLabels({
  'missing-required': 'quality.code.missing-required',
  'missing-helpful': 'quality.code.missing-helpful',
  'unavailable-input': 'quality.code.unavailable-input',
  'not-a-number': 'quality.code.not-a-number',
  'non-finite-number': 'quality.code.non-finite-number',
  'negative-value': 'quality.code.negative-value',
  'out-of-range': 'quality.code.out-of-range',
  'unknown-token': 'quality.code.unknown-token',
  'malformed-symbol': 'quality.code.malformed-symbol',
  'empty-list': 'quality.code.empty-list',
  'duplicate-entry': 'quality.code.duplicate-entry',
  'constraint-is-instruction': 'quality.code.constraint-is-instruction',
  'unsupported-market': 'quality.code.unsupported-market',
  'unsupported-timeframe': 'quality.code.unsupported-timeframe',
  'conflicting-declarations': 'quality.code.conflicting-declarations',
  'allocation-exceeds-portfolio': 'quality.code.allocation-exceeds-portfolio',
  'risk-horizon-tension': 'quality.code.risk-horizon-tension',
  'stale-value': 'quality.code.stale-value',
  'assumed-value': 'quality.code.assumed-value',
  'undated-claim': 'quality.code.undated-claim',
  'missing-provenance': 'quality.code.missing-provenance',
  'untrusted-provenance': 'quality.code.untrusted-provenance',
});

/**
 * The finding's own wording for its code.
 *
 * Falls back to the raw code, never to a paraphrase: an unrecognised code is evidence
 * that the two sides have drifted, and hiding it behind a friendly phrase would hide
 * exactly that.
 */
export function issueCodeLabel(code: string): string {
  return CODE_LABEL[code] ?? code;
}

/** Why a clarification is being asked, in the vocabulary of the answer. */
const REASON_LABEL: Readonly<Record<string, string>> = liveLabels({
  missing: 'quality.reason.missing',
  stale: 'quality.reason.stale',
  conflicting: 'quality.reason.conflicting',
  assumed: 'quality.reason.assumed',
  'refused-to-say': 'quality.reason.refused-to-say',
});

export function clarificationReasonLabel(reason: string): string {
  return REASON_LABEL[reason] ?? reason;
}
