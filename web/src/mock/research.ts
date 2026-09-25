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

import type { Provenance } from '@shared/core/provenance';
import { liveLabels, msg } from '../i18n/index.js';

export type ExperimentStatus =
  'planned' | 'running' | 'complete' | 'awaiting-approval' | 'abandoned';

export const EXPERIMENT_STATUS_LABEL: Record<ExperimentStatus, string> = liveLabels({
  planned: 'research.experimentStatus.planned',
  running: 'research.experimentStatus.running',
  complete: 'research.experimentStatus.complete',
  'awaiting-approval': 'research.experimentStatus.awaiting-approval',
  abandoned: 'research.experimentStatus.abandoned',
});

export type ExperimentVerdict = 'promising' | 'inconclusive' | 'rejected' | 'pending';

export const EXPERIMENT_VERDICT_LABEL: Record<ExperimentVerdict, string> = liveLabels({
  promising: 'research.experimentVerdict.promising',
  inconclusive: 'research.experimentVerdict.inconclusive',
  rejected: 'research.experimentVerdict.rejected',
  pending: 'research.experimentVerdict.pending',
});

export function previewNotice(): string {
  return msg('research.previewNotice');
}

export function methodNote(): string {
  return msg('research.methodNote');
}

export function confidenceCaveat(): string {
  return msg('research.confidenceCaveat');
}

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
    get title(): string {
      return msg('research.riskFirstChecklistBeforeEntry');
    },
    get hypothesis(): string {
      return msg('research.writingTheRiskBudgetAndInvalidationLevelBefore');
    },
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
      get note(): string {
        return msg('memory.syntheticNotRealMarketData');
      },
    },
    get findings(): string[] {
      return [
        msg('research.checklistComplianceIsTheVariableThatMovedNot'),
        msg('research.a465WinRateWithPositiveAverageR'),
        msg('research.confidenceOf62IsBelowTheBarThis'),
      ];
    },
    approvalRef: null,
    startedAt: '2026-09-05T09:00:00Z',
    updatedAt: '2026-09-16T18:40:00Z',
  },
  {
    id: 'exp-02',
    get title(): string {
      return msg('research.skipTheFirst15MinutesOfTheSession');
    },
    get hypothesis(): string {
      return msg('research.openingVolatilityMakesSizingErrorsMoreLikelySo');
    },
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
      get note(): string {
        return msg('memory.syntheticNotRealMarketData');
      },
    },
    get findings(): string[] {
      return [
        msg('research.bucketSizesAreUnequalSoTheComparisonIs'),
        msg('research.at96TradesTheIntervalAroundAverageR'),
      ];
    },
    approvalRef: null,
    startedAt: '2026-09-12T08:00:00Z',
    updatedAt: '2026-09-18T07:30:00Z',
  },
  {
    id: 'exp-03',
    get title(): string {
      return msg('research.widerInvalidationLevelWithProportionallySmallerSize');
    },
    get hypothesis(): string {
      return msg('research.wideningTheInvalidationLevelWhileHoldingTheRisk');
    },
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
      get note(): string {
        return msg('memory.syntheticNotRealMarketData');
      },
    },
    get findings(): string[] {
      return [
        msg('research.lossPerTradeIsUnchangedByConstructionOnly'),
        msg('research.confidenceIsTheHighestOnRecordAndStill'),
        msg('research.waitingOnAHumanDecisionTheRule'),
      ];
    },
    approvalRef: 'appr_preview_01',
    startedAt: '2026-09-06T09:00:00Z',
    updatedAt: '2026-09-17T16:20:00Z',
  },
  {
    id: 'exp-04',
    get title(): string {
      return msg('research.gapContinuationAfterEarnings');
    },
    get hypothesis(): string {
      return msg('research.postEarningsGapsThatHoldTheirOpeningRangeContinue');
    },
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
      get note(): string {
        return msg('research.backlogItemNoEvidenceAttachedYet');
      },
    },
    get findings(): string[] {
      return [msg('research.cannotBeEvaluatedUntilTheDataSetIncludes')];
    },
    approvalRef: null,
    startedAt: '2026-09-18T20:10:00Z',
    updatedAt: '2026-09-18T20:10:00Z',
  },
  {
    id: 'exp-05',
    get title(): string {
      return msg('research.meanReversionAtTheRangeEdgeAbandoned');
    },
    get hypothesis(): string {
      return msg('research.fadingTheRangeEdgeWithATightInvalidation');
    },
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
      get note(): string {
        return msg('memory.syntheticNotRealMarketData');
      },
    },
    get findings(): string[] {
      return [
        msg('research.aHighWinRateWithANegativeAverage'),
        msg('research.abandonedWithItsReasonRecordedTheSampleWas'),
      ];
    },
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
    get detail(): string {
      return msg('research.hypothesisWrittenBeforeAnyDataWasReviewed');
    },
    sampleSize: null,
  },
  {
    id: 'rel-02',
    experimentId: 'exp-01',
    kind: 'evaluation-attached',
    at: '2026-09-14T11:10:00Z',
    actor: 'job.backtest.run',
    get detail(): string {
      return msg('research.deterministicEvaluationOverTheSyntheticSetEvidenceAp');
    },
    sampleSize: 240,
  },
  {
    id: 'rel-03',
    experimentId: 'exp-01',
    kind: 'status-change',
    at: '2026-09-16T18:40:00Z',
    actor: 'user.omiid',
    get detail(): string {
      return msg('research.markedCompleteWithAnInconclusiveToPromisingVerdictAn');
    },
    sampleSize: 240,
  },
  {
    id: 'rel-04',
    experimentId: 'exp-02',
    kind: 'evaluation-attached',
    at: '2026-09-18T07:30:00Z',
    actor: 'job.backtest.run',
    get detail(): string {
      return msg('research.partialEvaluationAt96TradesStillRunning');
    },
    sampleSize: 96,
  },
  {
    id: 'rel-05',
    experimentId: 'exp-03',
    kind: 'approval-requested',
    at: '2026-09-17T16:25:00Z',
    actor: 'user.omiid',
    get detail(): string {
      return msg('research.approvalRequestedBeforeAnyActivationTheRuleStays');
    },
    sampleSize: 180,
  },
  {
    id: 'rel-06',
    experimentId: 'exp-05',
    kind: 'abandoned',
    at: '2026-09-08T14:00:00Z',
    actor: 'user.omiid',
    get detail(): string {
      return msg('research.abandonedAt38TradesRecordedAsARejection');
    },
    sampleSize: 38,
  },
  {
    id: 'rel-07',
    experimentId: 'exp-04',
    kind: 'created',
    at: '2026-09-18T20:10:00Z',
    actor: 'user.omiid',
    get detail(): string {
      return msg('research.backlogBlockedOnAnEventCalendarAndDelistingAware');
    },
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
    get title(): string {
      return msg('research.riskFirstChecklistEvaluationSummary');
    },
    get summary(): string {
      return msg('research.aDeterministicReplayOf240PracticeSetupsSuggests');
    },
    sections: [
      {
        get heading(): string {
          return msg('research.method');
        },
        get body(): string {
          return msg('research.eachSetupWasReplayedWithAFixedRisk');
        },
      },
      {
        get heading(): string {
          return msg('research.metrics');
        },
        get body(): string {
          return msg('research.sample240WinRate465Average');
        },
      },
      {
        get heading(): string {
          return msg('research.caveats');
        },
        get body(): string {
          return msg('research.theDataSetIsSyntheticSoTheNumbers');
        },
      },
      {
        get heading(): string {
          return msg('research.decisionRequired');
        },
        get body(): string {
          return msg('research.continuingIsAStudyDecisionNotATrading');
        },
      },
    ],
    generatedAt: '2026-09-16T18:45:00Z',
    provenance: {
      source: 'tool',
      ref: 'evaluation.report',
      trust: 'verified',
      recordedAt: '2026-09-16T18:45:00Z',
      get note(): string {
        return msg('research.assembledFromStoredEvaluationRowsNoModelText');
      },
    },
    get limitation(): string {
      return msg('research.syntheticDataAndABelowBarConfidenceIntervalThis');
    },
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
