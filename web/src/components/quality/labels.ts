import { FIELD_LABELS, type FieldKey } from '@shared/profile/model';
import type { InputRef, QualityDimension } from '@shared/quality/model';

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

const DIMENSION_LABEL: Readonly<Record<QualityDimension, string>> = {
  completeness: 'Completeness',
  validity: 'Validity',
  consistency: 'Consistency',
  reliability: 'Reliability',
  freshness: 'Freshness',
  relevance: 'Relevance',
  confidence: 'Confidence',
  provenance: 'Provenance',
};

export function dimensionLabel(dimension: QualityDimension): string {
  return DIMENSION_LABEL[dimension] ?? String(dimension);
}

/** Stable, human-readable names for the technical codes a finding carries. */
const CODE_LABEL: Readonly<Record<string, string>> = {
  'missing-required': 'Required and not provided',
  'missing-helpful': 'Would sharpen the analysis',
  'unavailable-input': 'Input not available',
  'not-a-number': 'Not a number',
  'non-finite-number': 'Not a finite number',
  'negative-value': 'Negative value',
  'out-of-range': 'Outside its range',
  'unknown-token': 'Not one of the supported values',
  'malformed-symbol': 'Malformed symbol',
  'empty-list': 'Empty list',
  'duplicate-entry': 'Repeated entry',
  'constraint-is-instruction': 'Written as an instruction rather than a constraint',
  'unsupported-market': 'Market the system cannot work in',
  'unsupported-timeframe': 'Timeframe the system cannot work in',
  'conflicting-declarations': 'Two declarations that cannot both hold',
  'allocation-exceeds-portfolio': 'Allocation exceeds a whole portfolio',
  'risk-horizon-tension': 'Risk and horizon point different ways',
  'stale-value': 'Aged past its freshness window',
  'assumed-value': 'Not provided — treated as an assumption',
  'undated-claim': 'Stated with no observation time',
  'missing-provenance': 'No provenance recorded',
  'untrusted-provenance': 'Provenance cannot be verified',
};

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
const REASON_LABEL: Readonly<Record<string, string>> = {
  missing: 'not provided yet',
  stale: 'out of date',
  conflicting: 'conflicts with another answer',
  assumed: 'currently an assumption',
  'refused-to-say': 'you chose not to say',
};

export function clarificationReasonLabel(reason: string): string {
  return REASON_LABEL[reason] ?? reason;
}
