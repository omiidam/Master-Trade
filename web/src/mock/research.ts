/**
 * Research module mock data.
 *
 * "Research" in this product means *evaluating a proposed rule against evidence*,
 * which is why every experiment here has a method, a sample size, an explicit
 * caveat and a verdict — and why one of them ends in a human approval step
 * rather than in activation. It is the interface for the backend's
 * `rule_evaluations` rows plus the approval workflow.
 *
 * What this file deliberately does NOT do:
 *   - it computes nothing. Every metric is an illustrative constant; the real
 *     numbers come from the deterministic backtest engine behind the
 *     approval-gated `backtest.run` operation, which is not built yet;
 *   - it claims no edge. Each experiment carries `metricsSource`, and anything
 *     that is not a real result is labelled `synthetic` and rendered with the
 *     provenance strip;
 *   - it never shows an experiment as active-by-itself: activation requires a
 *     recorded human approval (`approvalRef`), and the interface says so.
 */

import type { Provenance } from '../../../src/core/provenance.js';

export type ExperimentStatus =
  'planned' | 'running' | 'complete' | 'awaiting-approval' | 'abandoned';

export const EXPERIMENT_STATUS_LABEL: Record<ExperimentStatus, string> = {
  planned: 'Planned',
  running: 'Running',
  complete: 'Complete',
  'awaiting-approval': 'Awaiting approval',
  abandoned: 'Abandoned',
};

export type ExperimentVerdict = 'promising' | 'inconclusive' | 'rejected' | 'pending';

export const EXPERIMENT_VERDICT_LABEL: Record<ExperimentVerdict, string> = {
  promising: 'Promising',
  inconclusive: 'Inconclusive',
  rejected: 'Rejected',
  pending: 'No verdict yet',
};

export const RESEARCH_PREVIEW_NOTICE =
  'Illustrative research data. The deterministic backtest engine is not built in this phase, so every metric below is a layout example with synthetic provenance — not a measured result.';

export const RESEARCH_METHOD_NOTE =
  'Metrics are produced by deterministic code over a fixed data set, never by the model. A rule cannot become active until an evaluation exists and a human has approved it.';

export const CONFIDENCE_CAVEAT =
  'Confidence is a statement about the sample, not about the future. A result below the minimum sample size is a reason to keep testing, not a reason to trade it.';

export interface ExperimentMetrics {
  /** Number of trades in the evaluation set. */
  sampleSize: number;
  /** Percentage of winning trades, 0..100. */
  winRatePct: number;
  /** Mean outcome in risk units. */
  averageR: number;
  /** Worst peak-to-trough excursion in risk units (negative). */
  maxDrawdownR: number;
  /** Confidence in the measured result, 0..100. */
  confidencePct: number;
}

export interface ResearchExperiment {
  id: string;
  title: string;
  hypothesis: string;
  method: string;
  status: ExperimentStatus;
  verdict: ExperimentVerdict;
  /** Proposed rule this experiment evaluates (a `trading_rules.id` in the backend). */
  ruleRef: string;
  /** `synthetic` when the metrics are illustrative, `none` when there are none yet. */
  metricsSource: 'synthetic' | 'none';
  metrics: ExperimentMetrics | null;
  provenance: Provenance;
  findings: readonly string[];
  /** Set when the experiment is waiting for a recorded human decision. */
  approvalRef: string | null;
  startedAt: string;
  updatedAt: string;
}

export const mockExperiments: readonly ResearchExperiment[] = [
  {
    id: 'exp-01',
    title: 'Risk-first checklist before entry',
    hypothesis:
      'Writing the risk budget and invalidation level before considering reward reduces avoidable sizing errors.',
    method:
      'Replay 240 practice setups; score each against the month 2 checklist; compare error rate with and without a written invalidation level.',
    status: 'complete',
    verdict: 'promising',
    ruleRef: 'rule_risk_first',
    metricsSource: 'synthetic',
    metrics: {
      sampleSize: 240,
      winRatePct: 46.5,
      averageR: 0.32,
      maxDrawdownR: -8.4,
      confidencePct: 62,
    },
    provenance: {
      source: 'synthetic',
      ref: 'synthetic-generator',
      trust: 'verified',
      recordedAt: '2026-09-16T18:40:00Z',
      note: 'synthetic — not real market data',
    },
    findings: [
      'Checklist compliance is the variable that moved, not market conditions.',
      'A 46.5% win rate with positive average R is consistent with the risk-first lesson; it is not evidence of an edge.',
      'Confidence of 62% is below the bar this project set for promoting anything.',
    ],
    approvalRef: null,
    startedAt: '2026-09-05T09:00:00Z',
    updatedAt: '2026-09-16T18:40:00Z',
  },
  {
    id: 'exp-02',
    title: 'Skip the first 15 minutes of the session',
    hypothesis:
      'Opening volatility makes sizing errors more likely, so waiting 15 minutes lowers average R variance.',
    method: 'Same 240 setups, split by time of entry; compare average R and drawdown per bucket.',
    status: 'running',
    verdict: 'pending',
    ruleRef: 'rule_session_delay',
    metricsSource: 'synthetic',
    metrics: {
      sampleSize: 96,
      winRatePct: 44.8,
      averageR: 0.14,
      maxDrawdownR: -6.1,
      confidencePct: 28,
    },
    provenance: {
      source: 'synthetic',
      ref: 'synthetic-generator',
      trust: 'verified',
      recordedAt: '2026-09-18T07:30:00Z',
      note: 'synthetic — not real market data',
    },
    findings: [
      'Bucket sizes are unequal, so the comparison is not yet fair.',
      'At 96 trades the interval around average R still contains zero.',
    ],
    approvalRef: null,
    startedAt: '2026-09-12T08:00:00Z',
    updatedAt: '2026-09-18T07:30:00Z',
  },
  {
    id: 'exp-03',
    title: 'Wider invalidation level with proportionally smaller size',
    hypothesis:
      'Widening the invalidation level while holding the risk budget constant reduces noise-driven exits without increasing loss per trade.',
    method:
      'Paired evaluation on the same setups: identical risk budget, two invalidation distances.',
    status: 'awaiting-approval',
    verdict: 'promising',
    ruleRef: 'rule_wider_stop',
    metricsSource: 'synthetic',
    metrics: {
      sampleSize: 180,
      winRatePct: 51.2,
      averageR: 0.41,
      maxDrawdownR: -7.2,
      confidencePct: 74,
    },
    provenance: {
      source: 'synthetic',
      ref: 'synthetic-generator',
      trust: 'verified',
      recordedAt: '2026-09-17T16:20:00Z',
      note: 'synthetic — not real market data',
    },
    findings: [
      'Loss per trade is unchanged by construction; only the exit distribution moved.',
      'Confidence is the highest on record, and still not a licence to skip review.',
      'Waiting on a human decision — the rule stays inactive until one is recorded.',
    ],
    approvalRef: 'appr_preview_01',
    startedAt: '2026-09-06T09:00:00Z',
    updatedAt: '2026-09-17T16:20:00Z',
  },
  {
    id: 'exp-04',
    title: 'Gap continuation after earnings',
    hypothesis:
      'Post-earnings gaps that hold their opening range continue more often than they fade.',
    method:
      'Not started: needs an event calendar and a larger synthetic data set to be honest about survivorship.',
    status: 'planned',
    verdict: 'pending',
    ruleRef: 'rule_gap_continuation',
    metricsSource: 'none',
    metrics: null,
    provenance: {
      source: 'human',
      ref: 'user.omiid',
      trust: 'unverified',
      recordedAt: '2026-09-18T20:10:00Z',
      note: 'Backlog item; no evidence attached yet.',
    },
    findings: ['Cannot be evaluated until the data set includes delisted and halted symbols.'],
    approvalRef: null,
    startedAt: '2026-09-18T20:10:00Z',
    updatedAt: '2026-09-18T20:10:00Z',
  },
  {
    id: 'exp-05',
    title: 'Mean reversion at the range edge (abandoned)',
    hypothesis: 'Fading the range edge with a tight invalidation level has positive expectancy.',
    method:
      'A 38-trade sample was collected, then the experiment was abandoned rather than extended.',
    status: 'abandoned',
    verdict: 'rejected',
    ruleRef: 'rule_range_fade',
    metricsSource: 'synthetic',
    metrics: {
      sampleSize: 38,
      winRatePct: 57.9,
      averageR: -0.05,
      maxDrawdownR: -11.8,
      confidencePct: 9,
    },
    provenance: {
      source: 'synthetic',
      ref: 'synthetic-generator',
      trust: 'verified',
      recordedAt: '2026-09-08T14:00:00Z',
      note: 'synthetic — not real market data',
    },
    findings: [
      'A high win rate with a negative average R is the textbook shape of a hidden tail risk.',
      'Abandoned with its reason recorded: the sample was too small to rescue by tuning.',
    ],
    approvalRef: null,
    startedAt: '2026-08-28T09:00:00Z',
    updatedAt: '2026-09-08T14:00:00Z',
  },
];

export type ExperimentEventKind =
  'created' | 'evaluation-attached' | 'status-change' | 'approval-requested' | 'abandoned';

export interface ExperimentTimelineEntry {
  id: string;
  experimentId: string;
  kind: ExperimentEventKind;
  at: string;
  actor: string;
  detail: string;
  /** Sample size at this point, when the event recorded an evaluation. */
  sampleSize: number | null;
}

export const mockExperimentTimeline: readonly ExperimentTimelineEntry[] = [
  {
    id: 'rel-01',
    experimentId: 'exp-01',
    kind: 'created',
    at: '2026-09-05T09:00:00Z',
    actor: 'user.omiid',
    detail: 'Hypothesis written before any data was reviewed.',
    sampleSize: null,
  },
  {
    id: 'rel-02',
    experimentId: 'exp-01',
    kind: 'evaluation-attached',
    at: '2026-09-14T11:10:00Z',
    actor: 'job.backtest.run',
    detail: 'Deterministic evaluation over the synthetic set; evidence appended, never edited.',
    sampleSize: 240,
  },
  {
    id: 'rel-03',
    experimentId: 'exp-01',
    kind: 'status-change',
    at: '2026-09-16T18:40:00Z',
    actor: 'user.omiid',
    detail:
      'Marked complete with an inconclusive-to-promising verdict and the confidence caveat attached.',
    sampleSize: 240,
  },
  {
    id: 'rel-04',
    experimentId: 'exp-02',
    kind: 'evaluation-attached',
    at: '2026-09-18T07:30:00Z',
    actor: 'job.backtest.run',
    detail: 'Partial evaluation at 96 trades; still running.',
    sampleSize: 96,
  },
  {
    id: 'rel-05',
    experimentId: 'exp-03',
    kind: 'approval-requested',
    at: '2026-09-17T16:25:00Z',
    actor: 'user.omiid',
    detail:
      'Approval requested before any activation; the rule stays inactive until a decision is recorded.',
    sampleSize: 180,
  },
  {
    id: 'rel-06',
    experimentId: 'exp-05',
    kind: 'abandoned',
    at: '2026-09-08T14:00:00Z',
    actor: 'user.omiid',
    detail: 'Abandoned at 38 trades. Recorded as a rejection, not quietly deleted.',
    sampleSize: 38,
  },
  {
    id: 'rel-07',
    experimentId: 'exp-04',
    kind: 'created',
    at: '2026-09-18T20:10:00Z',
    actor: 'user.omiid',
    detail: 'Backlog: blocked on an event calendar and delisting-aware data.',
    sampleSize: null,
  },
];

export interface ResearchReportSection {
  heading: string;
  body: string;
}

export interface ResearchReport {
  id: string;
  experimentId: string;
  title: string;
  summary: string;
  sections: readonly ResearchReportSection[];
  generatedAt: string;
  provenance: Provenance;
  /** Always present: what a reader must not conclude from this report. */
  limitation: string;
}

export const mockReports: readonly ResearchReport[] = [
  {
    id: 'rep-01',
    experimentId: 'exp-01',
    title: 'Risk-first checklist — evaluation summary',
    summary:
      'A deterministic replay of 240 practice setups suggests the written invalidation level is the variable that changes sizing outcomes. The result is illustrative and the confidence is below the promotion bar.',
    sections: [
      {
        heading: 'Method',
        body: 'Each setup was replayed with a fixed risk budget. Half carried a written invalidation level before entry, half did not. Sizing errors were counted by rule, not judged by eye.',
      },
      {
        heading: 'Metrics',
        body: 'Sample 240 · win rate 46.5% · average R 0.32 · maximum drawdown −8.4R · confidence 62%. Win rate is reported because it is easy to misread: expectancy, not win rate, is what the evaluation is about.',
      },
      {
        heading: 'Caveats',
        body: 'The data set is synthetic, so the numbers describe the generator as much as the checklist. Confidence of 62% is below the bar for promoting a rule. Nothing here has been out-of-sample tested.',
      },
      {
        heading: 'Decision required',
        body: 'Continuing is a study decision, not a trading one. If the checklist is formally adopted, that is a rule change and requires a recorded human approval before it can be active.',
      },
    ],
    generatedAt: '2026-09-16T18:45:00Z',
    provenance: {
      source: 'tool',
      ref: 'evaluation.report',
      trust: 'verified',
      recordedAt: '2026-09-16T18:45:00Z',
      note: 'Assembled from stored evaluation rows; no model text is included.',
    },
    limitation:
      'Synthetic data and a below-bar confidence interval. This report is a reason to design a better test, not a reason to change behaviour.',
  },
];

export interface ResearchProgressSummary {
  active: number;
  awaitingApproval: number;
  complete: number;
  planned: number;
  abandoned: number;
  /** Total trades across evaluations that produced metrics. */
  evaluatedTrades: number;
  /** Experiments with a verdict of promising but not yet approved. */
  pendingDecisions: number;
}

/** Derived from the mock rows only; no statistics are computed here. */
export function summariseResearch(
  experiments: readonly ResearchExperiment[] = mockExperiments,
): ResearchProgressSummary {
  return {
    active: experiments.filter((experiment) => experiment.status === 'running').length,
    awaitingApproval: experiments.filter((experiment) => experiment.status === 'awaiting-approval')
      .length,
    complete: experiments.filter((experiment) => experiment.status === 'complete').length,
    planned: experiments.filter((experiment) => experiment.status === 'planned').length,
    abandoned: experiments.filter((experiment) => experiment.status === 'abandoned').length,
    evaluatedTrades: experiments.reduce(
      (sum, experiment) => sum + (experiment.metrics?.sampleSize ?? 0),
      0,
    ),
    pendingDecisions: experiments.filter(
      (experiment) => experiment.status === 'awaiting-approval' && experiment.approvalRef !== null,
    ).length,
  };
}
