/**
 * Decision vocabulary, in one place.
 *
 * Every label and every meaning is re-exported from the shared contract rather than written here.
 * That is not tidiness: a surface that invents its own wording for `hypothetical` will eventually
 * invent its own meaning for it, and the meaning of that word is the difference between a scenario
 * and a result. The only thing this file adds is **presentation** — which tone a state wears — and
 * the tones are chosen so that nothing about an outcome reads as praise or blame.
 *
 * That last point is the one to keep: a realised gain is not `success` and a realised loss is not
 * `danger`, because both are measurements, and colouring one green would be the product expressing
 * an opinion about somebody's trading. Gains and losses are distinguished by **sign**, which is
 * information, not by judgement, which is not ours to give.
 */

import type { BadgeTone } from '../Badge';
import {
  DECISION_EVALUATION_REASON_LABEL,
  DECISION_KIND_LABEL,
  DECISION_OBSERVATION_SEVERITY_LABEL,
  DECISION_OBSERVATION_TYPE_LABEL,
  DECISION_STATUS_LABEL,
  DECISION_TYPE_LABEL,
  EVALUATION_OUTCOME_LABEL,
  EVALUATION_OUTCOME_MEANING,
  type DecisionKind,
  type DecisionObservationSeverity,
  type EvaluationOutcome,
} from '@shared/decisions/model';
import {
  EVALUATION_READINESS_LABEL,
  EVALUATION_READINESS_MEANING,
  type EvaluationReadiness,
} from '@shared/decisions/readiness';
import { READINESS_LABEL, type Readiness } from '@shared/quality/readiness';

export {
  DECISION_EVALUATION_REASON_LABEL,
  DECISION_KIND_LABEL,
  DECISION_OBSERVATION_SEVERITY_LABEL,
  DECISION_OBSERVATION_TYPE_LABEL,
  DECISION_STATUS_LABEL,
  DECISION_TYPE_LABEL,
  EVALUATION_OUTCOME_LABEL,
  EVALUATION_OUTCOME_MEANING,
  EVALUATION_READINESS_LABEL,
  EVALUATION_READINESS_MEANING,
  READINESS_LABEL,
};

/**
 * How an outcome is presented.
 *
 * `hypothetical` and `simulated` are deliberately `warning` rather than `neutral`: they are the two
 * labels most easily read as performance, and the tone is there to stop that reading rather than to
 * alarm anybody. `incomplete` is `outline` — an absence, not a problem.
 */
export const OUTCOME_TONE: Readonly<Record<EvaluationOutcome, BadgeTone>> = {
  realised: 'info',
  unrealised: 'primary',
  hypothetical: 'warning',
  simulated: 'warning',
  incomplete: 'outline',
};

/** How a decision's kind is presented. A scenario is not a trade, and says so. */
export const KIND_TONE: Readonly<Record<DecisionKind, BadgeTone>> = {
  executed: 'info',
  planned: 'neutral',
  hypothetical: 'warning',
};

/** How the composed readiness verdict is presented. */
export const EVALUATION_READINESS_TONE: Readonly<Record<EvaluationReadiness, BadgeTone>> = {
  READY_FOR_EVALUATION: 'success',
  READY_WITH_LIMITATIONS: 'warning',
  INCOMPLETE_OUTCOME_DATA: 'outline',
  REQUIRES_CLARIFICATION: 'warning',
  BLOCKED: 'danger',
};

/** How the base gate's verdict is presented, when both layers are shown side by side. */
export const BASE_READINESS_TONE: Readonly<Record<Readiness, BadgeTone>> = {
  READY_FOR_ANALYSIS: 'success',
  READY_WITH_LIMITATIONS: 'warning',
  REQUIRES_CLARIFICATION: 'warning',
  BLOCKED: 'danger',
};

export const OBSERVATION_TONE: Readonly<Record<DecisionObservationSeverity, BadgeTone>> = {
  observation: 'neutral',
  watch: 'warning',
  elevated: 'warning',
};

/**
 * Whether a formatted figure is a gain, a loss or neither.
 *
 * Read from the engine's own formatted value rather than recomputed, because the string is the
 * engine's answer and this must not become a second arithmetic. `+` and `-` are what the engine
 * emits, so the sign is the whole test.
 */
export function figureSign(value: string | null): 'gain' | 'loss' | 'flat' {
  if (value === null) return 'flat';
  if (value.startsWith('+')) return 'gain';
  if (value.startsWith('-')) return 'loss';
  return 'flat';
}

/**
 * A class for a figure, by sign.
 *
 * Note what is *not* here: no tone for "good". A negative R multiple is red because it is a loss, and
 * a positive one is green because it is a gain — never because either was a good or bad decision.
 */
export function figureClass(value: string | null): string {
  switch (figureSign(value)) {
    case 'gain':
      return 'text-success';
    case 'loss':
      return 'text-danger';
    case 'flat':
      return 'text-text-muted';
  }
}

/** Confidence in an observation, in the contract's own vocabulary. */
export const CONFIDENCE_LABEL: Readonly<Record<string, string>> = {
  confirmed: 'Confirmed',
  derived: 'Derived',
  assumed: 'Assumed',
  missing: 'Missing',
};

export const CONFIDENCE_TONE: Readonly<Record<string, BadgeTone>> = {
  confirmed: 'success',
  derived: 'info',
  assumed: 'warning',
  missing: 'outline',
};
