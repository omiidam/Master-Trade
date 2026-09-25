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
import { TREND_INK, type TrendDirection } from '../Trend';
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
import { liveLabels } from '../../i18n/index.js';

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
 * The decisions module's own vocabulary, mapped onto the product's one direction vocabulary.
 *
 * `figureSign` stays here because it reads a *contract string* — the engine's formatted figure — and
 * that really is this module's business. The *ink*, though, is not: a gain is the same green
 * everywhere in the product, so the colours are read from `TREND_INK` rather than written again. A
 * second copy of "gain is success" is how the journal's figures and the decision engine's figures
 * end up different colours for the same fact.
 *
 * Note what is *not* here either: no tone for "good". A negative R multiple is red because it is a
 * loss and a positive one green because it is a gain — never because either was a good or a bad
 * decision.
 */
const FIGURE_INK: Record<ReturnType<typeof figureSign>, string> = {
  gain: TREND_INK.up,
  loss: TREND_INK.down,
  flat: TREND_INK.flat,
};

export function figureClass(value: string | null): string {
  return FIGURE_INK[figureSign(value)];
}

/**
 * The mark for a formatted figure: the same arrow `Trend` would draw, for the surfaces that hold the
 * engine's string rather than a number.
 *
 * The sign is already printed in the figure itself, so this is the second cue rather than the only
 * one — but a column of gains and losses is read by shape long before it is read by digit.
 */
export function figureMark(value: string | null): TrendDirection {
  switch (figureSign(value)) {
    case 'gain':
      return 'up';
    case 'loss':
      return 'down';
    case 'flat':
      return 'flat';
  }
}

/** Confidence in an observation, in the contract's own vocabulary. */
export const CONFIDENCE_LABEL: Readonly<Record<string, string>> = liveLabels({
  confirmed: 'decisions.confidence.confirmed',
  derived: 'decisions.confidence.derived',
  assumed: 'decisions.confidence.assumed',
  missing: 'decisions.confidence.missing',
});

export const CONFIDENCE_TONE: Readonly<Record<string, BadgeTone>> = {
  confirmed: 'success',
  derived: 'info',
  assumed: 'warning',
  missing: 'outline',
};
