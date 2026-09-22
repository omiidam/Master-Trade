/**
 * Decision evaluation — the deterministic core.
 *
 * This module is the one the phase brief asked for by name: *"all financial calculations must be
 * deterministic and independent of LLM-generated text."* That constraint is enforced, not
 * intended: `tests/monorepo-boundary.test.ts` refuses an import of the LLM layer, the agent, the
 * database, the HTTP server or a `node:*` builtin from anywhere inside `packages/trading-engine`,
 * and every function here is pure in `(record, now)`.
 *
 * Four decisions shape it, and each is a place where the obvious alternative would have made the
 * product dishonest:
 *
 *   1. **An outcome label travels with every figure, not with the report.** A report can contain
 *      more than one kind at once: an executed trade whose exit price is missing has a realised
 *      entry and an *unrealised* result. One label for the whole document would have to misdescribe
 *      one of them.
 *   2. **A hypothetical scenario is labelled hypothetical, whatever the arithmetic says.** There is
 *      no branch in this file that turns a scenario into performance, so there is nothing to
 *      argue with downstream.
 *   3. **A comparison is only made when both sides exist and the outcome is a real one.** The
 *      expected-versus-actual panel is the module's reason to exist and the most dangerous thing
 *      it produces: "you expected 8% and got 6.1%" is useful, and "you expected 8% and the
 *      scenario produced 6.1%" would be a fabrication dressed as a result.
 *   4. **A figure that cannot exist is absent, and the reason is named.** No drawdown without a
 *      series, no R multiple without a planned risk, nothing at all without an entry price — and
 *      every one of those absences arrives as a finding rather than as a zero.
 */

import type { TradingContext } from '../../shared/src/profile/model.js';
import { err, ok, type Tool, type ToolResult } from './framework.js';
import {
  DECISION_OBSERVATION_SEVERITY_LABEL,
  MAX_PLANNED_RISK_PERCENT,
  MIN_MEANINGFUL_EVALUATION_DAYS,
  ageHours,
  assessDecision,
  type DecisionAssessment,
  type DecisionFigure,
  type DecisionAssumption,
  type DecisionEvaluationReport,
  type DecisionIssueCode,
  type DecisionObservation,
  type DecisionObservationSeverity,
  type DecisionRecord,
  type EvaluationOutcome,
  type ExpectedVersusActual,
} from '../../shared/src/decisions/model.js';

/* ------------------------------------------------------------------ */
/* Rounding                                                            */
/* ------------------------------------------------------------------ */

/**
 * Half-up on the absolute value, at a fixed number of decimals.
 *
 * The same rule the portfolio engine uses, and for the same reason a test found there:
 * `Math.round` on a scaled decimal rounds 1.005 *down* and rounds halves toward +∞, so a loss of
 * 1.005 and a gain of 1.005 would not round the same way. A performance figure that rounds
 * asymmetrically is a figure nobody can reproduce from the same inputs.
 */
export function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  const scaled = value * factor;
  const magnitude = Math.abs(scaled);
  const bumped = Math.floor(magnitude + 0.5 + Number.EPSILON * magnitude);
  return (Math.sign(scaled) * bumped) / factor;
}

/* ------------------------------------------------------------------ */
/* Input                                                              */
/* ------------------------------------------------------------------ */

/**
 * A price observation on a path, for a drawdown.
 *
 * Supplied by the caller, never fetched: this package has no network and no clock. When no path
 * is supplied, no drawdown figure exists and a finding says so — which is the honest state of a
 * deployment with no market-data provider.
 */
export interface PathPoint {
  at: string;
  value: number;
}

export interface EvaluationInput {
  decision: DecisionRecord;
  now: number;
  /**
   * The observed path of the position's value, when the caller has one.
   *
   * Absent is the normal case in this build, and it is *not* the same as flat: a drawdown over no
   * observations does not exist, and reporting 0% would claim the path never moved.
   */
  path?: readonly PathPoint[] | undefined;
  /** The declared trading context, for the horizon comparison only. */
  context?: TradingContext | null | undefined;
}

/* ------------------------------------------------------------------ */
/* The direction-adjusted return                                       */
/* ------------------------------------------------------------------ */

/** `+1` for a decision that profits when the price rises, `-1` when it profits from a fall. */
export function directionOf(decision: DecisionRecord): 1 | -1 {
  return decision.type === 'sell' ? -1 : 1;
}

interface Basis {
  entry: number;
  /** The other end of the measurement: an exit price, or a current mark. */
  other: number;
  /** `true` when the second end is an exit rather than a mark. */
  exited: boolean;
}

function basisOf(decision: DecisionRecord, assessment: DecisionAssessment): Basis | null {
  const usable = (field: string): number | null => {
    const state = assessment.fields.find((entry) => entry.field === field);
    return state !== undefined && state.usable ? state.value : null;
  };
  const entry = usable('entryPrice');
  if (entry === null || entry === 0) return null;
  const exit = usable('exitPrice');
  if (exit !== null) return { entry, other: exit, exited: true };
  const mark = usable('markPrice');
  if (mark !== null && decision.kind !== 'executed') {
    return { entry, other: mark, exited: false };
  }
  if (mark !== null && decision.kind === 'executed') {
    // An executed decision with no exit and a current mark is *unrealised*: the position is
    // still open as far as the record shows, and that is a different figure from a realised
    // one, so the label follows the data rather than the claim.
    return { entry, other: mark, exited: false };
  }
  return null;
}

/** The outcome a figure computed from this basis actually is. */
function outcomeFor(decision: DecisionRecord, basis: Basis): EvaluationOutcome {
  if (decision.kind === 'hypothetical') return 'hypothetical';
  if (decision.kind === 'planned') return 'incomplete';
  return basis.exited ? 'realised' : 'unrealised';
}

/* ------------------------------------------------------------------ */
/* Metrics                                                             */
/* ------------------------------------------------------------------ */

export interface DecisionMetrics {
  outcome: EvaluationOutcome;
  entryPrice: number | null;
  otherPrice: number | null;
  /** Absolute change per unit, in the record's currency. */
  absoluteChange: number | null;
  /** Direction-adjusted change, in percent of the entry price. */
  returnPercent: number | null;
  /** `returnPercent / plannedRiskPercent`, or `null` without a planned risk. */
  rMultiple: number | null;
  plannedRiskPercent: number | null;
  holdingDays: number | null;
  /** Maximum peak-to-trough fall over the supplied path, in percent. Never produced without one. */
  maxDrawdownPercent: number | null;
  /** The same drawdown as a price, so a reader can see where it happened. */
  maxDrawdownFrom: number | null;
  maxDrawdownAt: string | null;
  /** How many observations the drawdown rests on. */
  pathPoints: number;
  figures: readonly DecisionFigure[];
  expectedVersusActual: ExpectedVersusActual;
  assumptions: readonly string[];
  limitations: readonly string[];
}

function figure(
  label: string,
  value: string | null,
  unit: string,
  outcome: EvaluationOutcome,
  basis: string,
  findings: readonly DecisionIssueCode[] = [],
): DecisionFigure {
  return { label, value, unit, outcome, basis, findings };
}

function percent(value: number | null): string | null {
  return value === null ? null : `${value.toFixed(2)}%`;
}

function money(value: number | null, currency: string): string | null {
  if (value === null) return null;
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)} ${currency}`;
}

function rMultiple(value: number | null): string | null {
  if (value === null) return null;
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}R`;
}

/**
 * Maximum peak-to-trough decline over an observed path, in percent.
 *
 * The path must be non-empty and every point must be a finite positive value; anything else means
 * there is no path to measure, and the caller is told that rather than a zero being returned.
 */
export function maxDrawdown(path: readonly PathPoint[]): {
  percent: number;
  from: number;
  at: string;
  points: number;
} | null {
  if (path.length < 2) return null;
  let peak = path[0]!.value;
  let peakAt = path[0]!.at;
  let worst = 0;
  let worstFrom = peak;
  let worstAt = path[0]!.at;
  for (const point of path) {
    if (!Number.isFinite(point.value) || point.value <= 0) return null;
    if (point.value > peak) {
      peak = point.value;
      peakAt = point.at;
      continue;
    }
    const decline = ((peak - point.value) / peak) * 100;
    if (decline > worst) {
      worst = decline;
      worstFrom = peak;
      worstAt = point.at;
    }
  }
  if (worst === 0) {
    // The path never fell below a running high. That is a reading of zero decline *from the peak*,
    // so the peak — not the first observation — is what it is measured from.
    return { percent: 0, from: peak, at: peakAt, points: path.length };
  }
  return { percent: round(worst, 4), from: worstFrom, at: worstAt, points: path.length };
}

/**
 * Value a decision.
 *
 * Pure and total: the same record, path and clock always produce the same metrics in the same
 * order, which is what makes a report reviewable. It takes a precomputed assessment when the
 * caller already has one, so the reading a surface shows and the reading the arithmetic used
 * cannot be two different readings of one record.
 */
export function computeDecisionMetrics(
  input: EvaluationInput,
  precomputed?: DecisionAssessment,
): DecisionMetrics {
  const { decision, now } = input;
  const assessment = precomputed ?? assessDecision(decision, now);
  const basis = basisOf(decision, assessment);
  const outcome = basis === null ? 'incomplete' : outcomeFor(decision, basis);
  const direction = directionOf(decision);
  const findings = assessment.findings.map((finding) => finding.code);

  const absoluteChange = basis === null ? null : round((basis.other - basis.entry) * direction, 4);
  const returnPercent =
    basis === null ? null : round(((basis.other - basis.entry) / basis.entry) * 100 * direction, 4);

  const plannedRiskPercent =
    decision.risk.plannedRiskPercent !== null &&
    Number.isFinite(decision.risk.plannedRiskPercent) &&
    decision.risk.plannedRiskPercent > 0 &&
    decision.risk.plannedRiskPercent <= MAX_PLANNED_RISK_PERCENT
      ? decision.risk.plannedRiskPercent
      : null;

  const rMultipleValue =
    returnPercent === null || plannedRiskPercent === null
      ? null
      : round(returnPercent / plannedRiskPercent, 4);

  const decidedAt = Date.parse(decision.decidedAt);
  const endAt = decision.period.endAt === null ? now : Date.parse(decision.period.endAt);
  const holdingDays =
    Number.isFinite(decidedAt) && Number.isFinite(endAt)
      ? round((endAt - decidedAt) / 86_400_000, 4)
      : null;

  const drawdown = input.path === undefined ? null : maxDrawdown(input.path);

  /* ---- what the figures rest on ---- */
  const assumptions: string[] = decision.assumptions
    .filter((assumption) => assumption.origin !== 'engine')
    .map((assumption) => assumption.statement);
  const limitations: string[] = [];
  if (decision.kind === 'hypothetical') {
    limitations.push(
      'This is a scenario, not a trade. Every figure below is hypothetical and describes what the arithmetic would have produced, not what happened.',
    );
  }
  if (outcome === 'unrealised') {
    limitations.push(
      'The position is open as far as this record shows, so the result is a mark rather than a completed outcome and will move with the price.',
    );
  }
  if (plannedRiskPercent === null) {
    limitations.push(
      'No planned risk was recorded, so there is no R multiple. A return exists; a risk-adjusted one does not.',
    );
  }
  if (drawdown === null) {
    limitations.push(
      'No price path was supplied, so no drawdown exists. A drawdown over no observations is not zero — it is unknown.',
    );
  }
  if (assessment.windowDays !== null && assessment.windowDays < MIN_MEANINGFUL_EVALUATION_DAYS) {
    limitations.push(
      `The window measured is ${assessment.windowDays.toFixed(1)} days. Over a window this short, an outcome says more about timing than about the decision.`,
    );
  }
  if (!assessment.singleCurrency) {
    limitations.push(
      'The record mentions more than one currency and no rate source is wired, so no figure here is comparable across them.',
    );
  }

  /* ---- the figures ---- */
  const figures: DecisionFigure[] = [
    figure(
      'Entry price',
      basis === null ? null : `${basis.entry.toFixed(4)} ${decision.currency}`,
      'currency',
      'realised',
      'The price at which the decision was taken, as recorded.',
      assessment.findings.filter((finding) => finding.field === 'entryPrice').map((f) => f.code),
    ),
    figure(
      basis !== null && basis.exited ? 'Exit price' : 'Mark price',
      basis === null ? null : `${basis.other.toFixed(4)} ${decision.currency}`,
      'currency',
      outcome === 'incomplete' ? 'incomplete' : outcome,
      basis !== null && basis.exited
        ? 'The price at which the decision was closed, as recorded.'
        : 'The latest price declared for the outcome. The position is open, so this is a mark.',
      basis === null ? findings.filter((code) => code.includes('price')) : [],
    ),
    figure(
      'Absolute change',
      money(absoluteChange, decision.currency),
      'currency',
      outcome,
      'Per unit: the distance between the two prices, in the direction of the decision.',
    ),
    figure(
      'Return',
      percent(returnPercent),
      'percent',
      outcome,
      'The absolute change as a proportion of the entry price, signed so that a gain is positive in either direction.',
      returnPercent === null ? findings.filter((code) => code.includes('price')) : [],
    ),
    figure(
      'R multiple',
      rMultiple(rMultipleValue),
      'R',
      rMultipleValue === null ? 'incomplete' : outcome,
      `The return divided by the planned risk that was recorded (${plannedRiskPercent === null ? 'none' : `${plannedRiskPercent}%`}).`,
      rMultipleValue === null ? ['no-risk-parameter'] : [],
    ),
    figure(
      'Window',
      holdingDays === null ? null : `${holdingDays.toFixed(2)} days`,
      'days',
      holdingDays === null ? 'incomplete' : 'realised',
      'From the decision to the end of the evaluation window, or to now while it is open.',
    ),
    figure(
      'Maximum drawdown',
      drawdown === null ? null : `${drawdown.percent.toFixed(2)}%`,
      'percent',
      drawdown === null ? 'incomplete' : outcome,
      'The largest peak-to-trough fall over the observed path that was supplied.',
      drawdown === null ? ['outcome-missing'] : [],
    ),
  ];

  /* ---- the comparison ---- */
  const expectedReturnPercent = decision.expectation.returnPercent;
  const expectedRMultiple = decision.expectation.rMultiple;
  const comparableOutcome = outcome === 'realised' || outcome === 'unrealised';
  const comparable =
    comparableOutcome &&
    (expectedReturnPercent !== null || expectedRMultiple !== null) &&
    (returnPercent !== null || rMultipleValue !== null);

  const reason = comparable
    ? null
    : outcome === 'hypothetical'
      ? 'This is a hypothetical scenario, so there is no actual outcome to compare an expectation with.'
      : outcome === 'incomplete'
        ? 'One end of the measurement is missing, so there is no actual figure to compare with.'
        : expectedReturnPercent === null && expectedRMultiple === null
          ? 'No expectation was recorded, so there is nothing to compare the outcome with. The outcome is still reported.'
          : 'Neither a return nor an R multiple could be computed from this record.';

  const expectedVersusActual: ExpectedVersusActual = {
    expectedReturnPercent,
    actualReturnPercent: returnPercent,
    differencePercent:
      expectedReturnPercent === null || returnPercent === null
        ? null
        : round(returnPercent - expectedReturnPercent, 4),
    expectedRMultiple,
    actualRMultiple: rMultipleValue,
    comparable,
    reason,
  };

  return {
    outcome,
    entryPrice: basis === null ? null : basis.entry,
    otherPrice: basis === null ? null : basis.other,
    absoluteChange,
    returnPercent,
    rMultiple: rMultipleValue,
    plannedRiskPercent,
    holdingDays,
    maxDrawdownPercent: drawdown === null ? null : drawdown.percent,
    maxDrawdownFrom: drawdown === null ? null : drawdown.from,
    maxDrawdownAt: drawdown === null ? null : drawdown.at,
    pathPoints: drawdown === null ? (input.path?.length ?? 0) : drawdown.points,
    figures,
    expectedVersusActual,
    assumptions,
    limitations,
  };
}

/* ------------------------------------------------------------------ */
/* Observations                                                        */
/* ------------------------------------------------------------------ */

function severityOf(rank: number): DecisionObservationSeverity {
  return rank >= 2 ? 'elevated' : rank === 1 ? 'watch' : 'observation';
}

function observation(input: {
  id: string;
  type: DecisionObservation['type'];
  severity: DecisionObservationSeverity;
  title: string;
  explanation: string;
  metrics: readonly { label: string; value: string }[];
  assumptions?: readonly string[];
  confidence: DecisionObservation['confidence'];
  outcome: EvaluationOutcome;
  observedAt: string;
  limitations?: readonly string[];
  sources?: readonly DecisionObservation['sources'][number][];
}): DecisionObservation {
  return {
    id: input.id,
    type: input.type,
    severity: input.severity,
    title: input.title,
    explanation: input.explanation,
    metrics: input.metrics,
    sources: input.sources ?? [{ kind: 'decision', ref: input.id }],
    assumptions: input.assumptions ?? [],
    confidence: input.confidence,
    outcome: input.outcome,
    observedAt: input.observedAt,
    limitations: input.limitations ?? [],
  };
}

/**
 * Derive the observations.
 *
 * Seven types, and each one is written from the metrics rather than from the record's prose: the
 * engine's own words are the only text in an observation, which is why an observation can be
 * rendered and logged verbatim. Nothing here ranks a decision, scores a user or predicts
 * anything — the loudest a severity can be is `elevated`, and the observations that would come
 * closest to a judgement (a losing outcome, a short window) are deliberately `observation` and
 * `watch`.
 */
export function deriveDecisionObservations(input: {
  decision: DecisionRecord;
  metrics: DecisionMetrics;
  assessment: DecisionAssessment;
  /** The clock, passed in like every other instant in this package. Never read from here. */
  now: number;
  context?: TradingContext | null;
}): DecisionObservation[] {
  const { decision, metrics, assessment } = input;
  const observedAt = new Date(input.now).toISOString();
  const observations: DecisionObservation[] = [];

  /* ---- performance ---- */
  if (metrics.returnPercent !== null) {
    const label =
      metrics.outcome === 'realised'
        ? 'The outcome as recorded'
        : metrics.outcome === 'unrealised'
          ? 'The outcome so far, marked rather than closed'
          : 'The outcome of the scenario as it was described';
    observations.push(
      observation({
        id: 'performance',
        type: 'performance',
        severity: severityOf(0),
        title: 'What the record produced',
        explanation: `${label}: the entry was ${metrics.entryPrice?.toFixed(4)} and the other end of the measurement was ${metrics.otherPrice?.toFixed(4)}, a change of ${metrics.returnPercent.toFixed(2)}% in the direction of the decision. This is a measurement of the prices on this record. It is not a statement about whether the decision was a good one, because it says nothing about the size of the position or about anything else that was happening at the time.`,
        metrics: [
          { label: 'Return', value: `${metrics.returnPercent.toFixed(2)}%` },
          ...(metrics.absoluteChange === null
            ? []
            : [{ label: 'Change per unit', value: `${metrics.absoluteChange.toFixed(4)}` }]),
          ...(metrics.holdingDays === null
            ? []
            : [{ label: 'Window', value: `${metrics.holdingDays.toFixed(2)} days` }]),
        ],
        confidence: metrics.outcome === 'hypothetical' ? 'assumed' : 'confirmed',
        outcome: metrics.outcome,
        observedAt,
        limitations: metrics.limitations,
      }),
    );
  } else {
    observations.push(
      observation({
        id: 'performance-absent',
        type: 'missing-information',
        severity: 'watch',
        title: 'No performance figure exists',
        explanation:
          'The record does not contain the two ends a return needs, so no return, no R multiple and no comparison were produced. Nothing was estimated in their place: a figure here would have been indistinguishable from a measured one.',
        metrics: [],
        confidence: 'missing',
        outcome: 'incomplete',
        observedAt,
        limitations: metrics.limitations,
      }),
    );
  }

  /* ---- risk ---- */
  if (metrics.rMultiple !== null) {
    const favourable = metrics.rMultiple > 0;
    observations.push(
      observation({
        id: 'risk',
        type: 'risk',
        severity: severityOf(0),
        title: 'What the outcome is worth in units of the risk taken',
        explanation: `Measured against the planned risk that was recorded (${String(metrics.plannedRiskPercent)}%), the outcome is ${metrics.rMultiple.toFixed(2)}R. An R multiple expresses a result in the units of the loss the decision was prepared to take, which is why it is comparable between decisions of different sizes and why it says nothing about whether the risk itself was sensible.${favourable ? '' : ' A negative R means the decision lost money; that is a measurement of this outcome and not a verdict on the method behind it.'}`,
        metrics: [
          { label: 'R multiple', value: `${metrics.rMultiple.toFixed(2)}R` },
          { label: 'Planned risk', value: `${String(metrics.plannedRiskPercent)}%` },
          ...(metrics.returnPercent === null
            ? []
            : [{ label: 'Return', value: `${metrics.returnPercent.toFixed(2)}%` }]),
        ],
        confidence: metrics.outcome === 'hypothetical' ? 'assumed' : 'derived',
        outcome: metrics.outcome,
        observedAt,
        limitations: [
          'An R multiple is a ratio to a number the user declared. It is only as meaningful as that declaration.',
        ],
      }),
    );
  }

  if (metrics.maxDrawdownPercent !== null) {
    observations.push(
      observation({
        id: 'drawdown',
        type: 'risk',
        severity: severityOf(0),
        title: 'The worst fall along the path that was observed',
        explanation: `Over the ${metrics.pathPoints} observations supplied, the largest peak-to-trough fall was ${metrics.maxDrawdownPercent.toFixed(2)}%, from ${metrics.maxDrawdownFrom?.toFixed(4)} to its trough. A drawdown measures the path rather than the endpoints, which is the one thing a return cannot tell you: two decisions can have the same return and very different journeys.`,
        metrics: [
          { label: 'Maximum drawdown', value: `${metrics.maxDrawdownPercent.toFixed(2)}%` },
          { label: 'Observations', value: String(metrics.pathPoints) },
        ],
        confidence: 'derived',
        outcome: metrics.outcome,
        observedAt,
        limitations: [
          'The drawdown rests on the observations supplied and on nothing between them. A path sampled sparsely can miss a deeper fall.',
        ],
      }),
    );
  }

  /* ---- horizon alignment ---- */
  const horizon = input.context?.horizon?.value ?? null;
  if (assessment.windowDays !== null) {
    const short = assessment.windowDays < MIN_MEANINGFUL_EVALUATION_DAYS;
    observations.push(
      observation({
        id: 'horizon',
        type: 'horizon-alignment',
        severity: severityOf(short ? 1 : 0),
        title: 'Whether the window measured can speak to the horizon stated',
        explanation: short
          ? `The window measured is ${assessment.windowDays.toFixed(1)} days. Over a window this short an outcome reflects timing as much as method, so it cannot be read as evidence about a decision intended to run for longer.`
          : `The window measured is ${assessment.windowDays.toFixed(1)} days, long enough for the outcome to be read as something other than a coincidence of timing.${horizon === null ? ' No horizon was declared in your context, so no comparison with one was made.' : ` Your declared horizon is ${String(horizon)}.`}`,
        metrics: [
          { label: 'Window', value: `${assessment.windowDays.toFixed(1)} days` },
          ...(horizon === null ? [] : [{ label: 'Declared horizon', value: String(horizon) }]),
        ],
        confidence: horizon === null ? 'missing' : 'derived',
        outcome: metrics.outcome,
        observedAt,
        limitations:
          horizon === null
            ? [
                'No horizon is declared in your trading context, so this observation compares the window with nothing.',
              ]
            : [],
      }),
    );
  }

  /* ---- consistency with the plan the record states ---- */
  if (decision.expectation.invalidation !== null || decision.rationale !== null) {
    observations.push(
      observation({
        id: 'consistency',
        type: 'consistency',
        severity: severityOf(0),
        title: 'What the record says the decision was, and whether it held',
        explanation: `The record states a reason${decision.expectation.invalidation === null ? '' : ' and a condition that would have invalidated the decision'}. Whether that condition was met cannot be determined from prices alone, and this product will not claim it was: consistency is checkable against your own account of what you did, which is the journal's job and not this one. What can be said is that the record was written down at all, which is what makes it reviewable later.`,
        metrics:
          decision.expectation.invalidation === null
            ? []
            : [{ label: 'Invalidation recorded', value: 'yes' }],
        confidence: 'assumed',
        outcome: metrics.outcome,
        observedAt,
        limitations: [
          'A plan compliance claim needs the user’s own review. The engine has prices, not intentions.',
        ],
      }),
    );
  }

  /* ---- allocation impact ---- */
  if (decision.portfolioId !== null) {
    observations.push(
      observation({
        id: 'allocation-impact',
        type: 'allocation-impact',
        severity: severityOf(0),
        title: 'What this decision changed in the composition',
        explanation:
          'The decision names a portfolio. No portfolio version was supplied with this evaluation, so no before-and-after allocation was computed. The evaluation reports what it measured rather than reconstructing a composition it was not given.',
        metrics: [],
        confidence: 'missing',
        outcome: 'incomplete',
        observedAt,
        sources: [{ kind: 'portfolio', ref: decision.portfolioId }],
        limitations: ['Supply the portfolio version to measure the allocation change.'],
      }),
    );
  }

  /* ---- data quality ---- */
  const qualityFindings = assessment.findings.filter(
    (finding) =>
      finding.code === 'price-stale' ||
      finding.code === 'price-undated' ||
      finding.code === 'price-unverified' ||
      finding.code === 'outcome-stale' ||
      finding.code === 'outcome-unverified' ||
      finding.code === 'exit-price-missing',
  );
  if (qualityFindings.length > 0) {
    observations.push(
      observation({
        id: 'data-quality',
        type: 'data-quality',
        severity: severityOf(
          qualityFindings.some((finding) => finding.severity === 'missing') ? 1 : 0,
        ),
        title: 'Which of these figures rest on weaker data',
        explanation: `Every figure above was computed from the prices on the record, and ${qualityFindings.length} finding(s) concern those prices. A price entered by hand is not verified by the platform, and a price older than the window this product treats as current is reported rather than refreshed quietly.`,
        metrics: qualityFindings.map((finding) => ({
          label: finding.code,
          value: finding.field ?? 'record',
        })),
        confidence: 'confirmed',
        outcome: metrics.outcome,
        observedAt,
      }),
    );
  }

  return observations;
}

/**
 * One figure's assumption list, so the report and the figures cannot disagree.
 *
 * Kept as a function rather than duplicated in the two call sites above: an assumption that
 * appeared on the report but not beside the figure it applied to would be the exact failure this
 * layer exists to prevent.
 */
export function assumptionLabels(input: {
  metrics: DecisionMetrics;
  severity: DecisionObservationSeverity;
  outcome: EvaluationOutcome;
}): readonly string[] {
  return [
    ...input.metrics.assumptions,
    DECISION_OBSERVATION_SEVERITY_LABEL[input.severity],
    input.outcome,
  ];
}

/**
 * The evaluation as the surface renders it: one document, composed deterministically.
 *
 * The engine has produced the assessment, the metrics and the observations since Phase 5.6, and
 * the declared contract (`DecisionEvaluationReport`) was never composed — which is the shape of a
 * report that a client would have had to assemble for itself, and therefore the shape of a client
 * that could label a figure differently from the engine that produced it. Composing it here keeps
 * the window, the assumptions and the limitations beside the figures they qualify.
 *
 * Two rules it inherits rather than re-decides:
 *
 *   - **an assumption the engine made is never applied**, so `origin` is `user-declared` or
 *     `context` and never `engine`: the engine's own assumptions arrive as findings, which is what
 *     `assessDecision` already does with them;
 *   - **the window is the record's, not the request's.** A report says what window it actually
 *     measured and whether that window is still open, because a comparison against a window that
 *     has not finished measuring is the commonest way a short-term number gets read as a verdict.
 */
export function buildDecisionReport(input: EvaluationInput): DecisionEvaluationReport {
  const { assessment, metrics, observations } = evaluateDecision(input);
  const decision = input.decision;

  const start = Date.parse(decision.period.startAt);
  const closed = decision.period.endAt !== null;
  const end = closed ? Date.parse(decision.period.endAt!) : input.now;
  const days =
    Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, (end - start) / 86_400_000) : null;

  // The engine's own assumptions are *applied* ones by construction (it refuses rather than
  // substitutes), so they are attributed to the context they came from and never to the engine.
  const applied: DecisionAssumption[] = metrics.assumptions.map((statement, index) => ({
    id: `metric-${index + 1}`,
    statement,
    origin: 'context' as const,
  }));
  const declared = decision.assumptions.filter((entry) => entry.origin !== 'engine');

  const limitations = [
    ...new Set([...metrics.limitations, ...(assessment.note ? [assessment.note] : [])]),
  ];

  return {
    decisionId: decision.id,
    type: decision.type,
    kind: decision.kind,
    outcome: metrics.outcome,
    assessment,
    figures: metrics.figures,
    expectedVersusActual: metrics.expectedVersusActual,
    observations,
    window: {
      startAt: decision.period.startAt,
      endAt:
        decision.period.endAt !== null ? decision.period.endAt : new Date(input.now).toISOString(),
      days: days === null ? null : round(days, 2),
      elapsing: !closed,
    },
    assumptions: [...declared, ...applied],
    limitations,
    evaluatedAt: new Date(input.now).toISOString(),
    note: 'Every figure here was computed from the prices on the record, and each one is labelled with what it is: realised, unrealised, hypothetical or incomplete. The window is the one the record declares, and a window that is still elapsing is reported as such. Nothing about what happens next is predicted, and no decision is graded as correct.',
  };
}

/** The whole evaluation, in one pure call, for the API and the tool path to share. */
export function evaluateDecision(input: EvaluationInput): {
  assessment: DecisionAssessment;
  metrics: DecisionMetrics;
  observations: DecisionObservation[];
} {
  const assessment = assessDecision(input.decision, input.now);
  const metrics = computeDecisionMetrics(input, assessment);
  const observations = deriveDecisionObservations({
    decision: input.decision,
    metrics,
    assessment,
    now: input.now,
    ...(input.context === undefined ? {} : { context: input.context }),
  });
  return { assessment, metrics, observations };
}

/* ------------------------------------------------------------------ */
/* The tool                                                            */
/* ------------------------------------------------------------------ */

/**
 * The tool's input.
 *
 * `path` is optional and is the only input that could carry a series: when no caller supplies
 * one, no drawdown figure exists and a finding says so. That is the honest state of a deployment
 * with no market-data provider, and it is deliberately not the same as a flat 0%.
 */
export interface DecisionEvaluateInput {
  decision: DecisionRecord;
  now: number;
  path?: readonly PathPoint[] | undefined;
  context?: TradingContext | null | undefined;
}

/** The tool's output, which is what the report layer composes a document from. */
export interface DecisionEvaluation {
  assessment: DecisionAssessment;
  metrics: DecisionMetrics;
  observations: DecisionObservation[];
}

/**
 * `decision.evaluate` — the deterministic evaluation, reachable through the permission-checked
 * tool path like every other calculation.
 *
 * Registered rather than called directly for the same reason `portfolio.compose` is: a number the
 * model may talk about has to be reachable through a tool whose capability is declared in the
 * permission table, or that table becomes decorative. The tool checks its own input because the
 * registry hands it whatever a caller produced, and the checks are the same ones the arithmetic
 * needs — a malformed record must fail loudly here rather than be silently coerced into a figure.
 */
export const decisionEvaluateTool: Tool<DecisionEvaluateInput, ToolResult<DecisionEvaluation>> = {
  descriptor: {
    name: 'decision.evaluate',
    category: 'deterministic-calc',
    capabilities: ['decision.evaluate'],
    semantics: { epistemicKind: 'analysis', hasSideEffects: false },
    description:
      'Measure a recorded decision deterministically: the return, drawdown and R multiple its own prices support, each labelled realised, unrealised, hypothetical or incomplete, with every missing input named rather than filled.',
    version: '1.0.0',
  },
  run(input): ToolResult<DecisionEvaluation> {
    if (input === null || typeof input !== 'object' || input.decision === undefined) {
      return err('decision must be supplied');
    }
    if (typeof input.now !== 'number' || !Number.isFinite(input.now)) {
      return err('now must be a finite instant in milliseconds');
    }
    if (input.path !== undefined) {
      if (!Array.isArray(input.path)) return err('path must be an array of observations');
      for (const point of input.path) {
        if (
          point === null ||
          typeof point !== 'object' ||
          typeof point.at !== 'string' ||
          typeof point.value !== 'number' ||
          !Number.isFinite(point.value) ||
          point.value <= 0
        ) {
          return err('every path point needs an instant and a finite positive value');
        }
      }
    }
    return ok(
      evaluateDecision({
        decision: input.decision,
        now: input.now,
        ...(input.path === undefined ? {} : { path: input.path }),
        ...(input.context === undefined ? {} : { context: input.context }),
      }),
    );
  },
};
