/**
 * Portfolio decisions and their evaluation — the domain.
 *
 * A decision record is a claim about what was done, and an evaluation is a reading of what
 * happened. This module exists to keep those two apart, because the failure mode it is built
 * against is a *hypothetical* result being read as a real one: a scenario that came out well, a
 * plan that was never executed, and a trade that happened all describe themselves with the same
 * numbers, and only the record's own classification distinguishes them.
 *
 * Six rules the shapes here enforce:
 *
 *   1. **A kind is not a type.** `type` says what the decision was about (buy, hold, rebalance…);
 *      `kind` says whether it *happened* (`executed`), was `planned`, or was `hypothetical`. A
 *      hypothetical decision can never be evaluated as realised, whatever its prices look like.
 *   2. **Outcomes are classified, never inferred from a sign.** `realised`, `unrealised`,
 *      `hypothetical`, `simulated` and `incomplete` are five answers, and the engine returns one
 *      of them per figure — because \"up 8%\" means different things in each.
 *   3. **An absent value is an absence, not a zero.** Every figure that depends on a price, a risk
 *      parameter or an exit is `null` when its input is missing, and a finding names which input.
 *   4. **A finding has a closed code.** Twenty-odd codes distinguish \"no exit price\" from \"a
 *      price with no observation time\" from \"the decision claims to have been executed but has
 *      no execution price\". `detail` is written by the code that raises it, so no user text can
 *      enter an assessment.
 *   5. **An assumption says who made it.** A premise the user declared, one the context implies
 *      and one the engine substituted are three different things, and only the first may be
 *      labelled hypothetical.
 *   6. **No claim about the future.** There is no field for an expected profit, a target price or
 *      a confidence that an outcome will occur. `expectation` is what the user *said they
 *      expected* when they wrote the decision down, and it is compared against what happened; it
 *      is not a prediction the system makes.
 */

import { z } from 'zod';
import { SEVERITY_ORDER, type ProvenanceRef, type QualitySeverity } from '../quality/model.js';
import type { AssetClass, FactSource } from '../profile/model.js';
import { ASSET_CLASSES, MAX_SYMBOL_LENGTH, SYMBOL_PATTERN } from '../profile/model.js';
import { PORTFOLIO_CURRENCIES, type PortfolioCurrency } from '../portfolio/model.js';

/* ------------------------------------------------------------------ */
/* Closed vocabularies                                                 */
/* ------------------------------------------------------------------ */

/** What the decision was about. */
export const DECISION_TYPES = [
  'buy',
  'sell',
  'hold',
  'rebalance',
  'allocation-change',
  'risk-adjustment',
  'hypothetical-scenario',
] as const;
export type DecisionType = (typeof DECISION_TYPES)[number];

export const DECISION_TYPE_LABEL: Readonly<Record<DecisionType, string>> = {
  buy: 'Buy',
  sell: 'Sell',
  hold: 'Hold',
  rebalance: 'Rebalance',
  'allocation-change': 'Allocation change',
  'risk-adjustment': 'Risk adjustment',
  'hypothetical-scenario': 'Hypothetical scenario',
};

export const DECISION_TYPE_MEANING: Readonly<Record<DecisionType, string>> = {
  buy: 'Adding exposure to a position.',
  sell: 'Reducing or closing exposure to a position.',
  hold: 'Deciding to do nothing, which is a decision with an outcome like any other.',
  rebalance: 'Returning a composition toward declared shares.',
  'allocation-change': 'Changing the shares themselves rather than restoring them.',
  'risk-adjustment': 'Changing the risk a composition carries.',
  'hypothetical-scenario':
    'A scenario the user asked about rather than a decision they made. It can be evaluated as a scenario and never as performance.',
};

/**
 * Whether the decision happened.
 *
 * This is the field the whole module turns on. `executed` claims the decision was carried out
 * and requires an execution price; `planned` is a decision that has not been acted on;
 * `hypothetical` is a scenario. A `hypothetical` decision is evaluated against the prices the
 * user supplied as *observations* and its figures are labelled hypothetical, never realised —
 * whatever the arithmetic produces.
 */
export const DECISION_KINDS = ['executed', 'planned', 'hypothetical'] as const;
export type DecisionKind = (typeof DECISION_KINDS)[number];

export const DECISION_KIND_LABEL: Readonly<Record<DecisionKind, string>> = {
  executed: 'Executed',
  planned: 'Planned',
  hypothetical: 'Hypothetical',
};

export const DECISION_KIND_MEANING: Readonly<Record<DecisionKind, string>> = {
  executed: 'You recorded this as having been carried out, so its prices are execution prices.',
  planned:
    'A decision you have not acted on. Any figures computed for it are prospective, not performance.',
  hypothetical:
    'A scenario you asked about. Nothing here happened, and no figure may be read as a result.',
};

/**
 * Why an evaluation exists.
 *
 * A closed vocabulary rather than free text, so a history reads as a sequence of intentions —
 * \"I asked for one\", \"I refreshed it after correcting a price\", \"I came back to it later\" —
 * instead of a list of timestamps nobody can interpret.
 */
export const DECISION_EVALUATION_REASONS = ['requested', 'refresh', 'reassessment'] as const;
export type DecisionEvaluationReason = (typeof DECISION_EVALUATION_REASONS)[number];

export const DECISION_EVALUATION_REASON_LABEL: Readonly<Record<DecisionEvaluationReason, string>> =
  {
    requested: 'Asked for',
    refresh: 'Re-run after a correction',
    reassessment: 'Revisited later',
  };

/** How far a decision got, as a state rather than a percentage. */
export const DECISION_STATUSES = ['recorded', 'evaluated', 'incomplete', 'blocked'] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

export const DECISION_STATUS_LABEL: Readonly<Record<DecisionStatus, string>> = {
  recorded: 'Recorded, not yet evaluated',
  evaluated: 'Evaluated',
  incomplete: 'Evaluated in part — the outcome data is incomplete',
  blocked: 'Cannot be evaluated',
};

/**
 * What a figure actually is.
 *
 * Five answers, and the engine returns one per figure. `realised` requires an executed decision
 * with a dated entry and exit; `unrealised` is a position still open, marked against a current
 * price; `hypothetical` is a scenario; `simulated` is a figure from a model rather than from
 * observation — and no such figure is produced in this build, so the value exists to be refused
 * rather than to be used.
 */
export const EVALUATION_OUTCOMES = [
  'realised',
  'unrealised',
  'hypothetical',
  'simulated',
  'incomplete',
] as const;
export type EvaluationOutcome = (typeof EVALUATION_OUTCOMES)[number];

export const EVALUATION_OUTCOME_LABEL: Readonly<Record<EvaluationOutcome, string>> = {
  realised: 'Realised',
  unrealised: 'Unrealised',
  hypothetical: 'Hypothetical',
  simulated: 'Simulated',
  incomplete: 'Incomplete',
};

export const EVALUATION_OUTCOME_MEANING: Readonly<Record<EvaluationOutcome, string>> = {
  realised: 'Both ends of the trade are dated execution prices, and the decision was executed.',
  unrealised: 'The position is still open, marked against the latest declared price.',
  hypothetical: 'A scenario. Nothing was executed, so nothing here is performance.',
  simulated: 'Produced by a model rather than observed. Not produced by this build.',
  incomplete: 'A required input is missing, so no figure of this kind exists.',
};

/* ------------------------------------------------------------------ */
/* Findings                                                            */
/* ------------------------------------------------------------------ */

/**
 * Every way a decision can be incomplete, contradictory or unusable. Closed.
 *
 * The list is deliberately separated by *cost*: a code that blocks (`invalid-entry-price`,
 * `kind-executed-without-price`), one that makes an answer narrower (`no-exit-price`,
 * `no-risk-parameter`, `stale-entry-price`), and one that merely has to be said
 * (`long-horizon-vs-short-evaluation`, `no-market-context`).
 */
export const DECISION_ISSUE_CODES = [
  // Shape of the record
  'no-decision-scope',
  'unknown-symbol',
  'no-timestamp',
  'decided-in-future',
  // What the decision claims
  'kind-executed-without-price',
  'kind-hypothetical-with-execution',
  'no-rationale',
  'no-expectation',
  // Prices and their evidence
  'invalid-entry-price',
  'invalid-exit-price',
  'entry-price-missing',
  'exit-price-missing',
  'price-undated',
  'price-stale',
  'price-unverified',
  // Risk parameters
  'no-risk-parameter',
  'invalid-risk-parameter',
  'stop-outside-entry',
  'target-outside-entry',
  // The period being evaluated
  'period-not-elapsed',
  'period-invalid',
  'period-too-short',
  'horizon-mismatch',
  // Outcome data
  'outcome-missing',
  'outcome-stale',
  'outcome-unverified',
  // Currency
  'mixed-currency',
  'unsupported-currency',
  // Context
  'no-market-context',
  'conflicting-records',
] as const;
export type DecisionIssueCode = (typeof DECISION_ISSUE_CODES)[number];

/**
 * Severity, on the quality layer's own scale rather than a second one.
 *
 * The scale already distinguishes the states a finding can be in — `blocking` for a value that
 * is not a value, `conflicting` for two declarations that cannot both hold, `missing`, `stale`,
 * `unverified` and `advisory` — so inventing a parallel vocabulary here would be a second set of
 * words describing the same six things, and the two would eventually disagree.
 */
export const DECISION_ISSUE_SEVERITY: Readonly<Record<DecisionIssueCode, QualitySeverity>> = {
  'no-decision-scope': 'blocking',
  'unknown-symbol': 'blocking',
  'no-timestamp': 'blocking',
  'decided-in-future': 'blocking',
  'kind-executed-without-price': 'blocking',
  'kind-hypothetical-with-execution': 'conflicting',
  'no-rationale': 'advisory',
  'no-expectation': 'advisory',
  'invalid-entry-price': 'blocking',
  'invalid-exit-price': 'blocking',
  'entry-price-missing': 'blocking',
  'exit-price-missing': 'missing',
  'price-undated': 'unverified',
  'price-stale': 'stale',
  'price-unverified': 'unverified',
  'no-risk-parameter': 'missing',
  'invalid-risk-parameter': 'blocking',
  'stop-outside-entry': 'conflicting',
  'target-outside-entry': 'conflicting',
  'period-not-elapsed': 'advisory',
  'period-invalid': 'blocking',
  'period-too-short': 'advisory',
  'horizon-mismatch': 'advisory',
  'outcome-missing': 'missing',
  'outcome-stale': 'stale',
  'outcome-unverified': 'unverified',
  'mixed-currency': 'conflicting',
  'unsupported-currency': 'blocking',
  'no-market-context': 'advisory',
  'conflicting-records': 'conflicting',
};

export const DECISION_ISSUE_MEANING: Readonly<Record<DecisionIssueCode, string>> = {
  'no-decision-scope':
    'The decision names neither a portfolio nor a symbol, so there is nothing to evaluate it against.',
  'unknown-symbol': 'The symbol is not one this product recognises.',
  'no-timestamp': 'The decision carries no instant, so no period can be measured from it.',
  'decided-in-future':
    'The decision is dated after the observation time, so it cannot have an outcome yet.',
  'kind-executed-without-price':
    'The decision is recorded as executed but carries no execution price. An executed decision without a price cannot be evaluated, and inventing one would fabricate the result.',
  'kind-hypothetical-with-execution':
    'The decision is marked hypothetical but carries an execution price. Those are two different claims, and one of them is wrong.',
  'no-rationale': 'No reason was recorded, so there is nothing to evaluate the decision against.',
  'no-expectation': 'No expectation was recorded, so there is nothing to compare the outcome with.',
  'invalid-entry-price': 'The entry price is not a positive finite number.',
  'invalid-exit-price': 'The exit price is not a positive finite number.',
  'entry-price-missing': 'There is no entry price, so no performance figure can exist.',
  'exit-price-missing':
    'There is no exit price, so the outcome is unrealised — the position is still open as far as this record shows.',
  'price-undated': 'A price carries no observation time, so its age cannot be established.',
  'price-stale': 'A price is older than the window this product treats as current.',
  'price-unverified': 'A price has no provenance this product can weigh.',
  'no-risk-parameter':
    'No planned risk was recorded, so no R-multiple exists. A return can still be computed.',
  'invalid-risk-parameter': 'The planned risk is not a positive finite percentage of the position.',
  'stop-outside-entry': 'The stop is on the same side of the entry as the direction of the trade.',
  'target-outside-entry':
    'The target is on the same side of the entry as the direction of the trade.',
  'period-not-elapsed':
    'The decision is less old than the period being evaluated, so the period is unfinished.',
  'period-invalid': 'The evaluation period runs backwards, or its end precedes the decision.',
  'period-too-short':
    'The evaluation window is shorter than a month. A short window measures luck as much as method, and this product does not rank a decision on one.',
  'horizon-mismatch':
    'The stated horizon and the evaluation window disagree, so the window cannot speak to the horizon.',
  'outcome-missing': 'No outcome data was supplied, so nothing can be said about what happened.',
  'outcome-stale': 'The outcome price is older than the window this product treats as current.',
  'outcome-unverified': 'The outcome price has no provenance this product can weigh.',
  'mixed-currency':
    'The decision and its outcome are denominated in different currencies, and no rate source is wired.',
  'unsupported-currency': 'The currency is not one this product recognises.',
  'no-market-context':
    'No market conditions were recorded, so the outcome cannot be read in context.',
  'conflicting-records': 'Two records describe the same decision and disagree.',
};

/** Where in the record a finding sits, so a surface can group them. */
export const DECISION_SCOPES = ['record', 'prices', 'risk', 'period', 'outcome'] as const;
export type DecisionScope = (typeof DECISION_SCOPES)[number];

export const DECISION_SCOPE_LABEL: Readonly<Record<DecisionScope, string>> = {
  record: 'The record itself',
  prices: 'Prices and their evidence',
  risk: 'Risk parameters',
  period: 'The evaluation period',
  outcome: 'Outcome data',
};

/** Thresholds the layer reports against. Reporting levels, never limits or targets. */
export const DECISION_PRICE_MAX_AGE_HOURS = 72;
/** Below this, a window measures luck as much as method — so it is reported, not ranked. */
export const MIN_MEANINGFUL_EVALUATION_DAYS = 30;
/** A price beyond this range is treated as malformed rather than as a very large one. */
export const MAX_DECISION_PRICE = 100_000_000;
/** Planned risk, as a percentage of the position. Above half is not a risk parameter. */
export const MAX_PLANNED_RISK_PERCENT = 50;

/* ------------------------------------------------------------------ */
/* Records                                                             */
/* ------------------------------------------------------------------ */

export interface Finding {
  code: DecisionIssueCode;
  severity: QualitySeverity;
  scope: DecisionScope;
  detail: string;
  /** Present when the finding concerns one field; absent for a record-level finding. */
  field?: string;
}

/**
 * What the user said they expected, in their own terms.
 *
 * Every field is optional and several are independent: a user may expect a return without an R
 * multiple, or an R multiple without a price target. None of it is a prediction the system makes
 * or endorses — it is the yardstick the decision is later measured against, and leaving it empty
 * is allowed and reported rather than filled in.
 */
export interface DecisionExpectation {
  /** The return the user said they expected, in percent of the position. */
  returnPercent: number | null;
  /** The R multiple the user said they expected. Requires a planned risk to be meaningful. */
  rMultiple: number | null;
  /** What would falsify the decision, in the user's words. */
  invalidation: string | null;
  /** The outcome the user said they expected, in their own words. */
  statement: string | null;
  source: FactSource;
  observedAt: string | null;
}

export interface DecisionPrice {
  value: number;
  currency: PortfolioCurrency;
  observedAt: string;
  provenance: ProvenanceRef;
}

export interface DecisionRiskParameters {
  /** Planned loss at the stop, as a percentage of the position. Required for an R multiple. */
  plannedRiskPercent: number | null;
  /** Where the decision would be abandoned, as a price. */
  stopPrice: number | null;
  /** Where the decision was expected to be taken off, as a price. */
  targetPrice: number | null;
  source: FactSource;
  observedAt: string | null;
}

export interface DecisionPeriod {
  startAt: string;
  /** Absent while the evaluation window is still open. */
  endAt: string | null;
}

/** A decision, as it is recorded. Nothing in here is computed. */
export interface DecisionRecord {
  id: string;
  type: DecisionType;
  kind: DecisionKind;
  decidedAt: string;
  /** Exactly one of these names the scope of the decision. */
  portfolioId: string | null;
  symbol: string | null;
  assetClass: AssetClass | null;
  currency: PortfolioCurrency;
  /** The user's own words. Stored and returned; never copied into a finding or a log. */
  rationale: string | null;
  expectation: DecisionExpectation;
  risk: DecisionRiskParameters;
  entryPrice: DecisionPrice | null;
  exitPrice: DecisionPrice | null;
  /** What was true in the market when the decision was made, as declared facts. */
  marketContext: readonly string[];
  assumptions: readonly DecisionAssumption[];
  period: DecisionPeriod;
  /** The observation time of the *outcome*, when the caller has one. */
  markPrice: DecisionPrice | null;
  tags: readonly string[];
  recordedAt: string;
  updatedAt: string;
}

/**
 * A belief the evaluation rests on.
 *
 * `origin` is the load-bearing field: a premise the user stated may be labelled hypothetical,
 * one the context implies is reported, and one the engine substituted is **refused** rather than
 * applied. There is no path from a system-made assumption to a realised figure.
 */
export interface DecisionAssumption {
  id: string;
  statement: string;
  origin: 'user-declared' | 'context' | 'engine';
}

/* ------------------------------------------------------------------ */
/* Assessment                                                          */
/* ------------------------------------------------------------------ */

/** What each field of a decision turned out to be usable for. */
export interface DecisionFieldState {
  field: string;
  /** `null` when absent, when malformed, or when not usable — `findings` says which. */
  value: number | null;
  usable: boolean;
  source: FactSource | null;
  observedAt: string | null;
  ageHours: number | null;
  findings: readonly DecisionIssueCode[];
}

export interface DecisionCoverage {
  /** Fields the schema required. */
  required: number;
  present: number;
  /** Fields a *performance* figure needs: an entry price, and either an exit or a mark. */
  pricedFields: number;
  pricedFieldsPresent: number;
  /** Fields an R multiple needs: a planned risk, a stop, and prices. */
  riskFields: number;
  riskFieldsPresent: number;
}

export interface DecisionAssessment {
  /** True when the record can support *some* figure. */
  evaluable: boolean;
  /** Which of the five outcomes a figure from this record would be. */
  outcome: EvaluationOutcome;
  coverage: DecisionCoverage;
  fields: readonly DecisionFieldState[];
  findings: readonly Finding[];
  worst: QualitySeverity | null;
  /** The window actually available, which may be shorter than the one requested. */
  windowDays: number | null;
  currencies: readonly PortfolioCurrency[];
  singleCurrency: boolean;
  note: string;
}

/* ------------------------------------------------------------------ */
/* Engine output — the contract the surface renders                    */
/* ------------------------------------------------------------------ */

/**
 * One measured figure, with what it is and what it rests on.
 *
 * `outcome` travels with every figure rather than sitting on the report, because a report can
 * contain more than one kind: an executed decision whose exit price is missing has a realised
 * entry and an *unrealised* result, and a single label for the whole document would have to lie
 * about one of them.
 */
export interface DecisionFigure {
  label: string;
  /** Formatted by the engine, so the surface formats nothing. `null` when it does not exist. */
  value: string | null;
  /** The unit the value is in, in words: `percent`, `R`, `currency`, `days`. */
  unit: string;
  outcome: EvaluationOutcome;
  /** What the number is measured against, in the engine's own words. */
  basis: string;
  findings: readonly DecisionIssueCode[];
}

/** The comparison the module exists for, and its honesty conditions. */
export interface ExpectedVersusActual {
  expectedReturnPercent: number | null;
  actualReturnPercent: number | null;
  differencePercent: number | null;
  expectedRMultiple: number | null;
  actualRMultiple: number | null;
  /** True only when both sides exist *and* the actual side is a realised or unrealised figure. */
  comparable: boolean;
  /** Why a comparison cannot be made, when it cannot. */
  reason: string | null;
}

export const DECISION_OBSERVATION_TYPES = [
  'performance',
  'risk',
  'data-quality',
  'consistency',
  'allocation-impact',
  'horizon-alignment',
  'missing-information',
] as const;
export type DecisionObservationType = (typeof DECISION_OBSERVATION_TYPES)[number];

export const DECISION_OBSERVATION_TYPE_LABEL: Readonly<Record<DecisionObservationType, string>> = {
  performance: 'Performance',
  risk: 'Risk',
  'data-quality': 'Data quality',
  consistency: 'Consistency',
  'allocation-impact': 'Allocation impact',
  'horizon-alignment': 'Horizon',
  'missing-information': 'Missing information',
};

export const DECISION_OBSERVATION_TYPE_MEANING: Readonly<Record<DecisionObservationType, string>> =
  {
    performance: 'What happened, measured from the prices on the record.',
    risk: 'What the outcome implies about the risk that was taken, where a risk parameter exists.',
    'data-quality': 'Which of the figures rest on prices that are missing, old or unverified.',
    consistency: 'Whether the decision followed the plan the user recorded for it.',
    'allocation-impact': 'What changed in the composition as a result, when the record names one.',
    'horizon-alignment': 'Whether the window measured can speak to the horizon that was stated.',
    'missing-information': 'What would have to be recorded before a figure could exist.',
  };

export const DECISION_OBSERVATION_SEVERITIES = ['observation', 'watch', 'elevated'] as const;
export type DecisionObservationSeverity = (typeof DECISION_OBSERVATION_SEVERITIES)[number];

export const DECISION_OBSERVATION_SEVERITY_LABEL: Readonly<
  Record<DecisionObservationSeverity, string>
> = {
  observation: 'Observation',
  watch: 'Worth watching',
  elevated: 'Elevated',
};

export const DECISION_OBSERVATION_SEVERITY_ORDER: Readonly<
  Record<DecisionObservationSeverity, number>
> = {
  observation: 0,
  watch: 1,
  elevated: 2,
};

export interface ObservationSource {
  kind: 'decision' | 'portfolio' | 'market-data' | 'context';
  ref: string;
}

/**
 * One observation about a decision's outcome.
 *
 * Every field is required, including the ones a hurried implementation would drop. `confidence`
 * is the one that matters most: `confirmed` means both ends came from dated prices on the record,
 * `assumed` means a premise had to be carried, and `missing` means the observation exists only to
 * say what is absent.
 */
export interface DecisionObservation {
  id: string;
  type: DecisionObservationType;
  severity: DecisionObservationSeverity;
  title: string;
  explanation: string;
  metrics: readonly { label: string; value: string }[];
  sources: readonly ObservationSource[];
  assumptions: readonly string[];
  confidence: 'confirmed' | 'derived' | 'assumed' | 'missing';
  outcome: EvaluationOutcome;
  observedAt: string;
  limitations: readonly string[];
}

export interface DecisionEvaluationReport {
  decisionId: string;
  type: DecisionType;
  kind: DecisionKind;
  outcome: EvaluationOutcome;
  assessment: DecisionAssessment;
  figures: readonly DecisionFigure[];
  expectedVersusActual: ExpectedVersusActual;
  observations: readonly DecisionObservation[];
  window: { startAt: string; endAt: string; days: number | null; elapsing: boolean };
  assumptions: readonly DecisionAssumption[];
  limitations: readonly string[];
  evaluatedAt: string;
  note: string;
}

/* ------------------------------------------------------------------ */
/* Schemas                                                             */
/* ------------------------------------------------------------------ */

const isoDate = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'must be an ISO-8601 date' });

const currencySchema = z.enum(PORTFOLIO_CURRENCIES);
const sourceSchema = z.enum(['user-stated', 'derived', 'assumed']);

const optionalPrice = z.number().finite().positive().max(MAX_DECISION_PRICE).nullable();
const optionalPercent = z.number().finite().min(-100_000).max(100_000).nullable();

const provenanceSchema = z.strictObject({
  source: z.enum(['user', 'derived', 'system', 'market-data']),
  ref: z.string().min(1).max(64),
  trust: z.enum(['unverified', 'verified', 'authoritative']),
  recordedAt: isoDate,
});

const priceSchema = z.strictObject({
  value: z.number().finite().positive().max(MAX_DECISION_PRICE),
  currency: currencySchema,
  observedAt: isoDate,
  provenance: provenanceSchema,
});

/**
 * The body of a declaration, and the shape the engine reads.
 *
 * Strict, for the same reason the portfolio document is: a key the schema ignored would be a user
 * believing they had recorded something the engine never read. Note what is **absent**: there is
 * no field for a computed return, a status, an evaluation or a score. Those are the engine's, and
 * a client that could send one would be a client reporting its own results.
 */
export const decisionRecordSchema = z.strictObject({
  type: z.enum(DECISION_TYPES),
  kind: z.enum(DECISION_KINDS),
  decidedAt: isoDate,
  portfolioId: z.string().min(1).max(64).nullable(),
  symbol: z
    .string()
    .min(1)
    .max(MAX_SYMBOL_LENGTH)
    .regex(SYMBOL_PATTERN, 'invalid symbol')
    .nullable(),
  assetClass: z.enum(ASSET_CLASSES).nullable(),
  currency: currencySchema,
  rationale: z.string().trim().min(1).max(2_000).nullable(),
  expectation: z.strictObject({
    returnPercent: optionalPercent,
    rMultiple: z.number().finite().min(-1_000).max(1_000).nullable(),
    invalidation: z.string().trim().min(1).max(1_000).nullable(),
    statement: z.string().trim().min(1).max(1_000).nullable(),
    source: sourceSchema,
    observedAt: isoDate.nullable(),
  }),
  risk: z.strictObject({
    plannedRiskPercent: z.number().finite().positive().max(MAX_PLANNED_RISK_PERCENT).nullable(),
    stopPrice: optionalPrice,
    targetPrice: optionalPrice,
    source: sourceSchema,
    observedAt: isoDate.nullable(),
  }),
  entryPrice: priceSchema.nullable(),
  exitPrice: priceSchema.nullable(),
  markPrice: priceSchema.nullable(),
  marketContext: z.array(z.string().trim().min(1).max(200)).max(12),
  assumptions: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(64),
        statement: z.string().trim().min(1).max(300),
        origin: z.enum(['user-declared', 'context', 'engine']),
      }),
    )
    .max(10),
  period: z.strictObject({ startAt: isoDate, endAt: isoDate.nullable() }),
  tags: z.array(z.string().trim().min(1).max(40)).max(12),
  recordedAt: isoDate,
  updatedAt: isoDate,
});

export type DecisionRecordInput = z.infer<typeof decisionRecordSchema>;

/* ------------------------------------------------------------------ */
/* The reading                                                         */
/* ------------------------------------------------------------------ */

const ASSESSMENT_NOTE =
  'This reading is computed from the record itself: which fields could be used, and which could not, with a named reason for each. Nothing here is inferred, and no language model can change it.';

/** Age of an instant in hours, or `null` when there is no instant to age. */
export function ageHours(observedAt: string | null, now: number): number | null {
  if (observedAt === null) return null;
  const at = Date.parse(observedAt);
  if (!Number.isFinite(at)) return null;
  return Math.max(0, (now - at) / 3_600_000);
}

const DAY = 86_400_000;

function usablePrice(price: DecisionPrice | null, field: string): DecisionFieldState {
  if (price === null) {
    return {
      field,
      value: null,
      usable: false,
      source: null,
      observedAt: null,
      ageHours: null,
      findings: [],
    };
  }
  const value = Number.isFinite(price.value) && price.value > 0 ? price.value : null;
  return {
    field,
    value,
    usable: value !== null,
    source: price.provenance.source === 'market-data' ? 'derived' : 'user-stated',
    observedAt: price.observedAt,
    ageHours: null,
    findings: value === null ? ['invalid-entry-price'] : [],
  };
}

/**
 * Read a decision record.
 *
 * Pure and total: every path returns an assessment, and the same record and clock always produce
 * the same one. It performs **no arithmetic about performance** — that is the engine's job. What
 * it decides is what could be used at all, and what the outcome of a figure from this record
 * would be, which is the question a report must answer before it prints a single number.
 */
export function assessDecision(decision: DecisionRecord, now: number): DecisionAssessment {
  const findings: Finding[] = [];
  const add = (
    code: DecisionIssueCode,
    scope: DecisionScope,
    detail: string,
    field?: string,
  ): void => {
    findings.push({
      code,
      severity: DECISION_ISSUE_SEVERITY[code],
      scope,
      detail,
      ...(field === undefined ? {} : { field }),
    });
  };

  /* ---- the record's own shape ---- */
  if (decision.portfolioId === null && decision.symbol === null) {
    add(
      'no-decision-scope',
      'record',
      'The record names neither a portfolio nor a symbol, so there is nothing to evaluate it against.',
    );
  }
  if (decision.symbol !== null && !SYMBOL_PATTERN.test(decision.symbol)) {
    add(
      'unknown-symbol',
      'record',
      `"${decision.symbol}" is not a symbol this product recognises.`,
      'symbol',
    );
  }
  const decidedAt = Date.parse(decision.decidedAt);
  if (!Number.isFinite(decidedAt)) {
    add('no-timestamp', 'record', 'The decision carries no usable instant.', 'decidedAt');
  } else if (decidedAt > now) {
    add(
      'decided-in-future',
      'record',
      'The decision is dated after the observation time, so it cannot have an outcome yet.',
      'decidedAt',
    );
  }
  if (decision.rationale === null) {
    add('no-rationale', 'record', 'No reason was recorded for the decision.', 'rationale');
  }
  if (decision.expectation.statement === null && decision.expectation.returnPercent === null) {
    add(
      'no-expectation',
      'record',
      'Nothing was recorded about what the decision expected, so there is nothing to compare the outcome with.',
      'expectation',
    );
  }

  /* ---- what the record claims about itself ---- */
  if (decision.kind === 'executed' && decision.entryPrice === null) {
    add(
      'kind-executed-without-price',
      'record',
      'The record claims the decision was executed but carries no price. An executed decision without a price cannot be evaluated, and inventing one would fabricate the result.',
      'entryPrice',
    );
  }
  if (decision.kind === 'hypothetical' && decision.exitPrice !== null) {
    // An execution price on a scenario is a contradiction, not a detail: the record would
    // otherwise be able to describe a scenario as though it had been carried out.
    add(
      'kind-hypothetical-with-execution',
      'record',
      'The record is marked hypothetical but carries an exit price. Those are two different claims, and one of them is wrong.',
      'exitPrice',
    );
  }

  /* ---- prices and their evidence ---- */
  const fields: DecisionFieldState[] = [];
  const entry = usablePrice(decision.entryPrice, 'entryPrice');
  const exit = usablePrice(decision.exitPrice, 'exitPrice');
  const mark = usablePrice(decision.markPrice, 'markPrice');
  for (const state of [entry, exit, mark]) {
    const price =
      state.field === 'entryPrice'
        ? decision.entryPrice
        : state.field === 'exitPrice'
          ? decision.exitPrice
          : decision.markPrice;
    const age = price === null ? null : ageHours(price.observedAt, now);
    fields.push({ ...state, ageHours: age });
  }

  if (decision.entryPrice === null) {
    add(
      'entry-price-missing',
      'prices',
      'There is no entry price, so no performance figure can exist.',
      'entryPrice',
    );
  } else if (!entry.usable) {
    add(
      'invalid-entry-price',
      'prices',
      'The entry price is not a positive finite number.',
      'entryPrice',
    );
  }
  if (decision.exitPrice === null) {
    add(
      'exit-price-missing',
      'prices',
      'There is no exit price, so the outcome is unrealised: the position is still open as far as this record shows.',
      'exitPrice',
    );
  } else if (!exit.usable) {
    add(
      'invalid-exit-price',
      'prices',
      'The exit price is not a positive finite number.',
      'exitPrice',
    );
  }

  for (const state of fields) {
    if (state.observedAt === null) continue;
    if (state.ageHours === null) {
      add(
        'price-undated',
        'prices',
        `${state.field} carries an observation time that cannot be read, so its age is unknown.`,
        state.field,
      );
      continue;
    }
    if (state.ageHours > DECISION_PRICE_MAX_AGE_HOURS) {
      add(
        'price-stale',
        'prices',
        `${state.field} was observed ${Math.round(state.ageHours)} hours ago, beyond the ${DECISION_PRICE_MAX_AGE_HOURS}-hour window this product treats as current.`,
        state.field,
      );
    }
  }
  for (const price of [decision.entryPrice, decision.exitPrice, decision.markPrice]) {
    if (price === null) continue;
    if (price.provenance.trust === 'unverified') {
      add(
        'price-unverified',
        'prices',
        'A price on this record was entered by hand, so its provenance cannot be verified by the platform.',
      );
      break;
    }
  }

  /* ---- currency ---- */
  const currencies = new Set<PortfolioCurrency>([decision.currency]);
  for (const price of [decision.entryPrice, decision.exitPrice, decision.markPrice]) {
    if (price === null) continue;
    if (!(PORTFOLIO_CURRENCIES as readonly string[]).includes(price.currency)) {
      add(
        'unsupported-currency',
        'record',
        `"${String(price.currency)}" is not a currency this product recognises.`,
        'currency',
      );
      continue;
    }
    currencies.add(price.currency);
  }
  const singleCurrency = currencies.size <= 1;
  if (!singleCurrency) {
    add(
      'mixed-currency',
      'prices',
      `This record mentions ${[...currencies].join(', ')}, and no rate source is wired, so a single figure across them would be meaningless.`,
      'currency',
    );
  }

  /* ---- risk parameters ---- */
  const risk = decision.risk;
  const riskFieldsPresent = [
    risk.plannedRiskPercent !== null &&
      risk.plannedRiskPercent > 0 &&
      risk.plannedRiskPercent <= MAX_PLANNED_RISK_PERCENT,
    risk.stopPrice !== null,
  ].filter(Boolean).length;
  if (risk.plannedRiskPercent === null) {
    add(
      'no-risk-parameter',
      'risk',
      'No planned risk was recorded, so no R-multiple exists. A return can still be computed.',
      'risk.plannedRiskPercent',
    );
  } else if (
    !Number.isFinite(risk.plannedRiskPercent) ||
    risk.plannedRiskPercent <= 0 ||
    risk.plannedRiskPercent > MAX_PLANNED_RISK_PERCENT
  ) {
    add(
      'invalid-risk-parameter',
      'risk',
      `The planned risk must be a percentage above zero and at most ${MAX_PLANNED_RISK_PERCENT}.`,
      'risk.plannedRiskPercent',
    );
  }

  const entryValue = entry.value;
  const direction = decision.type === 'sell' ? -1 : 1;
  if (risk.stopPrice !== null && entryValue !== null) {
    const malformed = direction === 1 ? risk.stopPrice >= entryValue : risk.stopPrice <= entryValue;
    if (malformed) {
      add(
        'stop-outside-entry',
        'risk',
        'The stop sits on the same side of the entry as the direction of the decision, so it is not a stop.',
        'risk.stopPrice',
      );
    }
  }
  if (risk.targetPrice !== null && entryValue !== null) {
    const malformed =
      direction === 1 ? risk.targetPrice <= entryValue : risk.targetPrice >= entryValue;
    if (malformed) {
      add(
        'target-outside-entry',
        'risk',
        'The target sits on the same side of the entry as the direction of the decision.',
        'risk.targetPrice',
      );
    }
  }

  /* ---- the period ---- */
  const periodStart = Date.parse(decision.period.startAt);
  const periodEnd = decision.period.endAt === null ? now : Date.parse(decision.period.endAt);
  let windowDays: number | null = null;
  if (!Number.isFinite(periodStart) || !Number.isFinite(periodEnd)) {
    add(
      'period-invalid',
      'period',
      'The evaluation period could not be read as two instants.',
      'period',
    );
  } else if (periodEnd < periodStart) {
    add(
      'period-invalid',
      'period',
      'The evaluation period ends before it starts, so there is no window to measure.',
      'period',
    );
  } else {
    windowDays = (periodEnd - periodStart) / DAY;
    if (decision.period.endAt === null) {
      const elapsedYears = windowDays / 365;
      if (elapsedYears >= 100) {
        add(
          'period-invalid',
          'period',
          'The evaluation period has not started: its beginning is more than a century away.',
          'period.startAt',
        );
      }
    }
    if (Number.isFinite(decidedAt) && periodEnd < decidedAt) {
      add(
        'period-not-elapsed',
        'period',
        'The period ends before the decision was made, so nothing had happened yet.',
        'period.endAt',
      );
    }
    if (windowDays >= 0 && windowDays < MIN_MEANINGFUL_EVALUATION_DAYS) {
      add(
        'period-too-short',
        'period',
        `The window measured is ${windowDays.toFixed(1)} days, shorter than the ${MIN_MEANINGFUL_EVALUATION_DAYS}-day window this product treats as able to say anything about method rather than luck.`,
        'period',
      );
    }
  }

  /* ---- the outcome ---- */
  const hasExit = exit.usable;
  const hasMark = mark.usable;
  if (decision.kind === 'executed' && !hasExit && !hasMark) {
    add(
      'outcome-missing',
      'outcome',
      'No exit price and no current mark were recorded, so nothing can be said about what happened.',
      'exitPrice',
    );
  }
  if (decision.kind !== 'executed' && !hasMark && decision.kind === 'planned') {
    add(
      'outcome-missing',
      'outcome',
      'A planned decision has no outcome until it is executed or marked. Anything computed here is prospective.',
      'markPrice',
    );
  }

  if (decision.marketContext.length === 0) {
    add(
      'no-market-context',
      'record',
      'No market conditions were recorded, so the outcome cannot be read in context.',
      'marketContext',
    );
  }

  /* ---- what kind of figure this record can support ---- */
  const blocking = findings.some((finding) => finding.severity === 'blocking');
  const outcome: EvaluationOutcome =
    decision.kind === 'hypothetical'
      ? 'hypothetical'
      : blocking || entryValue === null
        ? 'incomplete'
        : decision.kind === 'planned'
          ? 'incomplete'
          : hasExit
            ? 'realised'
            : hasMark
              ? 'unrealised'
              : 'incomplete';

  const coverage: DecisionCoverage = {
    required: 4,
    present: [decision.type, decision.kind, decision.decidedAt, decision.currency].filter(
      (value) => value !== null && value !== undefined,
    ).length,
    pricedFields: 2,
    pricedFieldsPresent: [entry.usable, hasExit || hasMark].filter(Boolean).length,
    riskFields: 2,
    riskFieldsPresent,
  };

  // The worst severity present, using the quality layer's own ordering rather than a second
  // one written here: a classification level must mean the same thing on both surfaces.
  const worst = findings.reduce<QualitySeverity | null>(
    (acc, finding) =>
      acc === null || SEVERITY_ORDER[finding.severity] > SEVERITY_ORDER[acc]
        ? finding.severity
        : acc,
    null,
  );

  return {
    evaluable: !blocking && entryValue !== null,
    outcome,
    coverage,
    fields,
    findings,
    worst,
    windowDays,
    currencies: [...currencies],
    singleCurrency,
    note: ASSESSMENT_NOTE,
  };
}

/** A decision with nothing declared: the honest starting point, and never a default record. */
export function emptyDecision(id: string, at: string): DecisionRecord {
  return {
    id,
    type: 'hold',
    kind: 'planned',
    decidedAt: at,
    portfolioId: null,
    symbol: null,
    assetClass: null,
    currency: 'USD',
    rationale: null,
    expectation: {
      returnPercent: null,
      rMultiple: null,
      invalidation: null,
      statement: null,
      source: 'user-stated',
      observedAt: null,
    },
    risk: {
      plannedRiskPercent: null,
      stopPrice: null,
      targetPrice: null,
      source: 'user-stated',
      observedAt: null,
    },
    entryPrice: null,
    exitPrice: null,
    marketContext: [],
    assumptions: [],
    period: { startAt: at, endAt: null },
    markPrice: null,
    tags: [],
    recordedAt: at,
    updatedAt: at,
  };
}
