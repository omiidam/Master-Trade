/**
 * Trading journal trade records.
 *
 * Sixteen illustrative records covering every state the journal must render:
 * win, loss, breakeven, open and incomplete; closed and archived; compliant,
 * partial, rule-broken and not-assessed; reviewed, review-required and
 * review-not-required; and records with a full write-up next to records with
 * none at all.
 *
 * Every number is a hand-written constant. Two things are deliberate:
 *   - the levels are internally coherent, so a reader (or a test) can check that a
 *     long has its stop below its entry, that a win has positive R, and that a
 *     breakeven stays inside a rounding band;
 *   - an unrecorded value is `null`, never `0`. A trade with no exit has no
 *     result, and the interface says so instead of printing a zero.
 *
 * The vocabulary, labels and headline statistics live in `mock/journal.ts`; this
 * module holds the rows, so neither file imports the other's values.
 */

import type { AttachmentKind, JournalTrade, TradeAttachment, TradeEvent } from './journal.js';
import { msg } from '../i18n/index.js';

function shots(
  ref: string,
  openedAt: string,
  closedAt: string | null,
  kinds: readonly AttachmentKind[],
): TradeAttachment[] {
  return kinds.map((kind, index) => ({
    id: `${ref.toLowerCase()}-shot-${index + 1}`,
    kind,
    label: `${ref} · ${kind}`,
    capturedAt: kind === 'exit' && closedAt !== null ? closedAt : openedAt,
  }));
}

export const mockTrades: readonly JournalTrade[] = [
  {
    id: 'jn-041',
    ref: 'TR-041',
    symbol: 'ES',
    market: 'futures',
    direction: 'long',
    status: 'closed',
    result: 'win',
    setupId: 'breakout-retest',
    session: 'new-york',
    timeframe: '5m',
    openedAt: '2026-09-19T15:35:00Z',
    closedAt: '2026-09-19T16:12:00Z',
    plan: {
      entry: 5842.25,
      stopLoss: 5833.25,
      takeProfit: 5865.25,
      riskAmount: 1800,
      plannedRr: 2.5,
      positionSize: 4,
    },
    actual: {
      entry: 5842.25,
      exit: 5865.65,
      stopLoss: 5833.25,
      takeProfit: 5865.25,
      riskAmount: 1800,
      actualR: 2.6,
      fees: 12.4,
    },
    compliance: 'compliant',
    reviewState: 'reviewed',
    aiReviewState: 'not-available',
    get tags(): string[] {
      return [
        msg('journalTrades.aSetup'),
        msg('journalTrades.runnerHeld'),
        msg('journalTrades.sessionOpen'),
      ];
    },
    screenshots: shots('TR-041', '2026-09-19T15:35:00Z', '2026-09-19T16:12:00Z', [
      'entry',
      'exit',
      'markup',
    ]),
    context: {
      get higherTimeframeBias(): string {
        return msg('journalTrades.dailyAboveThePriorWeekHighBiasLong');
      },
      get marketStructure(): string {
        return msg('journalTrades.higherHighsAndHigherLowsThroughTheEuropean');
      },
      get liquidityContext(): string {
        return msg('journalTrades.equalHighsAt5858TakenBeforeTheRetest');
      },
      keyZone: '5840–5844 (prior session high, retested twice).',
      get entryConfirmation(): string {
        return msg('journalTrades.lowerTimeframeHigherLowInsideTheZoneThenA');
      },
      get confluences(): string[] {
        return [
          msg('journalTrades.dailyBias'),
          msg('journalTrades.levelRetestedTwice'),
          msg('journalTrades.volumeExpansionOnTheBreak'),
        ];
      },
      get volatility(): string {
        return msg('journalTrades.aboveAverageTheDayRangeWas14The');
      },
      get newsExposure(): string {
        return msg('journalTrades.noScheduledReleaseInsideTheHoldingWindow');
      },
    },
    rationale: {
      get thesis(): string {
        return msg('journalTrades.aLevelThatProducedTwoFailedPushesIs');
      },
      get entryRationale(): string {
        return msg('journalTrades.theRetestHeldWithAHigherLowSo');
      },
      get invalidation(): string {
        return msg('journalTrades.aCloseBackInside58405844WithoutARejection');
      },
      get management(): string {
        return msg('journalTrades.moveTheStopToBreakevenOnlyAfter1R');
      },
      get exitPlan(): string {
        return msg('journalTrades.trimHalfAt2RTrailTheRemainderUnder');
      },
      checklist: ['bias', 'level', 'invalidation', 'risk', 'size', 'session', 'news', 'reward'],
      compliance: 'compliant',
      get complianceNote(): string {
        return msg('journalTrades.allEightChecklistItemsWereSatisfiedBeforeEntry');
      },
    },
    psychology: {
      beforeEntry: 'focused',
      duringTrade: 'calm',
      afterExit: 'confident',
      confidence: 8,
      fear: 2,
      greed: 3,
      fomo: 1,
      hesitation: 2,
      impulsiveness: 1,
      discipline: 9,
    },
    review: {
      mistakes: [],
      get wentWell(): string[] {
        return [
          msg('journalTrades.waitedForTheRetestInsteadOfTheBreak'),
          msg('journalTrades.heldTheRunnerToThePlannedLevelRather'),
        ];
      },
      get improvements(): string[] {
        return [msg('journalTrades.logTheTrimDecisionAtTheTimeRather')];
      },
      get lesson(): string {
        return msg('journalTrades.theRetestIsTheTradeTheBreakIs');
      },
      get adjustment(): string {
        return msg('journalTrades.keepTheTwoStepEntryRuleForEveryBreakoutRetest');
      },
      get notes(): string {
        return msg('journalTrades.bestExecutionOnRecordForThisSetup');
      },
    },
    updatedAt: '2026-09-19T16:40:00Z',
  },
  {
    id: 'jn-040',
    ref: 'TR-040',
    symbol: 'NQ',
    market: 'futures',
    direction: 'short',
    status: 'closed',
    result: 'loss',
    setupId: 'failed-breakout',
    session: 'new-york',
    timeframe: '5m',
    openedAt: '2026-09-19T10:20:00Z',
    closedAt: '2026-09-19T11:05:00Z',
    plan: {
      entry: 21245.5,
      stopLoss: 21302.0,
      takeProfit: 21104.25,
      riskAmount: 1425,
      plannedRr: 2.5,
      positionSize: 3,
    },
    actual: {
      entry: 21245.5,
      exit: 21302.0,
      stopLoss: 21302.0,
      takeProfit: 21104.25,
      riskAmount: 1425,
      actualR: -1.0,
      fees: 10.2,
    },
    compliance: 'compliant',
    reviewState: 'reviewed',
    aiReviewState: 'not-available',
    get tags(): string[] {
      return [msg('journalTrades.stoppedOut'), msg('journalTrades.cleanLoss')];
    },
    screenshots: shots('TR-040', '2026-09-19T10:20:00Z', '2026-09-19T11:05:00Z', ['entry', 'exit']),
    context: {
      get higherTimeframeBias(): string {
        return msg('journalTrades.neutralPriceInsideThePriorDayRange');
      },
      get marketStructure(): string {
        return msg('journalTrades.rangeWithAClearUpperBoundaryAt21310');
      },
      get liquidityContext(): string {
        return msg('journalTrades.stopsRestingAboveTheOvernightHighAt21290');
      },
      keyZone: '21290–21310 (overnight high and range boundary).',
      get entryConfirmation(): string {
        return msg('journalTrades.rejectionWickIntoTheBoundaryThenALower');
      },
      get confluences(): string[] {
        return [msg('journalTrades.rangeBoundary'), msg('journalTrades.overnightHigh')];
      },
      get volatility(): string {
        return msg('journalTrades.average');
      },
      get newsExposure(): string {
        return msg('journalTrades.noneScheduled');
      },
    },
    rationale: {
      get thesis(): string {
        return msg('journalTrades.thePushIntoTheOvernightHighWouldFail');
      },
      get entryRationale(): string {
        return msg('journalTrades.entryTakenOnTheFirstLowerCloseAfter');
      },
      get invalidation(): string {
        return msg('journalTrades.aCloseAbove21310InvalidatesTheRangeRead');
      },
      get management(): string {
        return msg('journalTrades.noAdjustmentPlannedTheStopWasTheThesis');
      },
      get exitPlan(): string {
        return msg('journalTrades.targetTheRangeMidThenReassess');
      },
      checklist: ['bias', 'level', 'invalidation', 'risk', 'size', 'session', 'news', 'reward'],
      compliance: 'compliant',
      get complianceNote(): string {
        return msg('journalTrades.aLosingTradeThatFollowedEveryRuleCompliance');
      },
    },
    psychology: {
      beforeEntry: 'focused',
      duringTrade: 'calm',
      afterExit: 'frustrated',
      confidence: 6,
      fear: 3,
      greed: 2,
      fomo: 2,
      hesitation: 3,
      impulsiveness: 2,
      discipline: 8,
    },
    review: {
      mistakes: [],
      get wentWell(): string[] {
        return [
          msg('journalTrades.theStopWasNotTouchedWidenedOrCancelled'),
          msg('journalTrades.theLossStayedInsideBudget'),
        ];
      },
      get improvements(): string[] {
        return [msg('journalTrades.noteThatTheBoundaryHadBeenTestedThree')];
      },
      get lesson(): string {
        return msg('journalTrades.aBoundaryTestedRepeatedlyIsThinnerThanIt');
      },
      get adjustment(): string {
        return msg('journalTrades.countHowManyTimesALevelWasTested');
      },
      notes: '',
    },
    updatedAt: '2026-09-19T11:30:00Z',
  },
  {
    id: 'jn-039',
    ref: 'TR-039',
    symbol: 'EURUSD',
    market: 'forex',
    direction: 'long',
    status: 'closed',
    result: 'win',
    setupId: 'trend-pullback',
    session: 'london',
    timeframe: '15m',
    openedAt: '2026-09-18T09:10:00Z',
    closedAt: '2026-09-18T10:40:00Z',
    plan: {
      entry: 1.1085,
      stopLoss: 1.1064,
      takeProfit: 1.11375,
      riskAmount: 650,
      plannedRr: 2.5,
      positionSize: 3,
    },
    actual: {
      entry: 1.1085,
      exit: 1.11228,
      stopLoss: 1.1064,
      takeProfit: 1.11375,
      riskAmount: 650,
      actualR: 1.8,
      fees: 4.1,
    },
    compliance: 'compliant',
    reviewState: 'reviewed',
    aiReviewState: 'not-available',
    get tags(): string[] {
      return [msg('journalTrades.trendDay'), msg('journalTrades.pullbackIntoDemand')];
    },
    screenshots: shots('TR-039', '2026-09-18T09:10:00Z', '2026-09-18T10:40:00Z', [
      'entry',
      'exit',
      'analysis',
    ]),
    context: {
      get higherTimeframeBias(): string {
        return msg('journalTrades.fourHourUptrendIntactAbove11050');
      },
      get marketStructure(): string {
        return msg('journalTrades.cleanHigherLowsOnTheFifteenMinuteChart');
      },
      get liquidityContext(): string {
        return msg('journalTrades.sellSideLiquidityBelowTheLondonOpenLowWas');
      },
      keyZone: '1.1082–1.1090 (prior breakout shelf).',
      get entryConfirmation(): string {
        return msg('journalTrades.bullishEngulfingCloseBackAboveTheShelf');
      },
      get confluences(): string[] {
        return [
          msg('journalTrades.fourHourTrend'),
          msg('journalTrades.shelfRetest'),
          msg('journalTrades.londonSession'),
        ];
      },
      get volatility(): string {
        return msg('journalTrades.belowAverageTheRangeWasNarrow');
      },
      get newsExposure(): string {
        return msg('journalTrades.noReleaseUntilTheAfternoon');
      },
    },
    rationale: {
      get thesis(): string {
        return msg('journalTrades.aTrendThatPullsIntoAPriorBreakout');
      },
      get entryRationale(): string {
        return msg('journalTrades.theStopSatUnderTheShelfWhichIs');
      },
      get invalidation(): string {
        return msg('journalTrades.aFifteenMinuteCloseBelow11060');
      },
      get management(): string {
        return msg('journalTrades.halfOffAt15RStopToBreakevenAfter');
      },
      get exitPlan(): string {
        return msg('journalTrades.fullExitAt25ROrOnTheFirst');
      },
      checklist: ['bias', 'level', 'invalidation', 'risk', 'size', 'session', 'news', 'reward'],
      compliance: 'compliant',
      get complianceNote(): string {
        return msg('journalTrades.checklistCompleteTheExitCameInSlightlyUnder');
      },
    },
    psychology: {
      beforeEntry: 'calm',
      duringTrade: 'calm',
      afterExit: 'confident',
      confidence: 7,
      fear: 2,
      greed: 2,
      fomo: 1,
      hesitation: 2,
      impulsiveness: 1,
      discipline: 9,
    },
    review: {
      mistakes: [],
      get wentWell(): string[] {
        return [
          msg('journalTrades.entryCameFromTheShelfNotFromThe'),
          msg('journalTrades.halfWasTrimmedAt15RAsPlanned'),
        ];
      },
      get improvements(): string[] {
        return [msg('journalTrades.theRunnerWasClosedALittleEarlyAgainst')];
      },
      get lesson(): string {
        return msg('journalTrades.trimmingIsAPlanClosingTheRestIs');
      },
      get adjustment(): string {
        return msg('journalTrades.setTheRunnerExitAtTheLevelNot');
      },
      notes: '',
    },
    updatedAt: '2026-09-18T11:00:00Z',
  },
  {
    id: 'jn-038',
    ref: 'TR-038',
    symbol: 'BTCUSD',
    market: 'crypto',
    direction: 'long',
    status: 'closed',
    result: 'loss',
    setupId: 'range-reversal',
    session: 'asia',
    timeframe: '1h',
    openedAt: '2026-09-18T03:40:00Z',
    closedAt: '2026-09-18T06:05:00Z',
    plan: {
      entry: 63420,
      stopLoss: 62920,
      takeProfit: 64670,
      riskAmount: 620,
      plannedRr: 2.5,
      positionSize: 0.4,
    },
    actual: {
      entry: 63420,
      exit: 62920,
      stopLoss: 62920,
      takeProfit: 64670,
      riskAmount: 620,
      actualR: -1.0,
      fees: 28.5,
    },
    compliance: 'partial',
    reviewState: 'required',
    aiReviewState: 'not-available',
    get tags(): string[] {
      return [msg('journalTrades.rangeEdge'), msg('journalTrades.asiaSession')];
    },
    screenshots: shots('TR-038', '2026-09-18T03:40:00Z', '2026-09-18T06:05:00Z', ['entry', 'exit']),
    context: {
      get higherTimeframeBias(): string {
        return msg('journalTrades.neutralPriceInsideAThreeDayRange');
      },
      get marketStructure(): string {
        return msg('journalTrades.lowerHighsIntoTheRangeLow');
      },
      get liquidityContext(): string {
        return msg('journalTrades.rangeLowSatDirectlyBeneathAVisibleSupport');
      },
      keyZone: '62900–63200 (range low).',
      get entryConfirmation(): string {
        return msg('journalTrades.noneRecordedBeforeEntryTheLevelWas');
      },
      get confluences(): string[] {
        return [msg('journalTrades.rangeLow')];
      },
      get volatility(): string {
        return msg('journalTrades.low');
      },
      get newsExposure(): string {
        return msg('journalTrades.notCheckedBeforeEntry');
      },
    },
    rationale: {
      get thesis(): string {
        return msg('journalTrades.theRangeLowWouldHoldForAThird');
      },
      get entryRationale(): string {
        return msg('journalTrades.entryTakenOnApproachRatherThanOnA');
      },
      get invalidation(): string {
        return msg('journalTrades.aOneHourCloseBelow62900');
      },
      get management(): string {
        return msg('journalTrades.notWrittenBeforeEntry');
      },
      get exitPlan(): string {
        return msg('journalTrades.rangeMid');
      },
      checklist: ['bias', 'level', 'risk', 'session', 'reward'],
      compliance: 'partial',
      get complianceNote(): string {
        return msg('journalTrades.threeChecklistItemsWereSkippedNoWrittenInvalidation');
      },
    },
    review: {
      get mistakes(): string[] {
        return [
          msg('journalTrades.enteredOnApproachWithoutARejection'),
          msg('journalTrades.skippedTheInvalidationChecklistItem'),
        ];
      },
      get wentWell(): string[] {
        return [msg('journalTrades.theStopWasHonouredExactlyAsPlanned')];
      },
      get improvements(): string[] {
        return [msg('journalTrades.writeTheInvalidationBeforeLookingAtSize')];
      },
      get lesson(): string {
        return msg('journalTrades.theLevelIsALocationWithoutARejection');
      },
      get adjustment(): string {
        return msg('journalTrades.requireARejectionCloseBeforeAnyRangeEdgeEntry');
      },
      notes: '',
    },
    updatedAt: '2026-09-18T07:10:00Z',
  },
  {
    id: 'jn-037',
    ref: 'TR-037',
    symbol: 'AAPL',
    market: 'equities',
    direction: 'long',
    status: 'closed',
    result: 'breakeven',
    setupId: 'gap-continuation',
    session: 'new-york',
    timeframe: '5m',
    openedAt: '2026-09-17T14:20:00Z',
    closedAt: '2026-09-17T15:02:00Z',
    plan: {
      entry: 228.4,
      stopLoss: 226.1,
      takeProfit: 233.0,
      riskAmount: 575,
      plannedRr: 2.0,
      positionSize: 250,
    },
    actual: {
      entry: 228.4,
      exit: 228.46,
      stopLoss: 226.1,
      takeProfit: 233.0,
      riskAmount: 575,
      actualR: 0.03,
      fees: 3.2,
    },
    compliance: 'compliant',
    reviewState: 'not-required',
    aiReviewState: 'not-available',
    get tags(): string[] {
      return [msg('journalTrades.managedExit'), msg('journalTrades.flatClose')];
    },
    screenshots: shots('TR-037', '2026-09-17T14:20:00Z', '2026-09-17T15:02:00Z', ['entry']),
    updatedAt: '2026-09-17T15:30:00Z',
  },
  {
    id: 'jn-036',
    ref: 'TR-036',
    symbol: 'GBPJPY',
    market: 'forex',
    direction: 'short',
    status: 'closed',
    result: 'win',
    setupId: 'trend-pullback',
    session: 'london',
    timeframe: '15m',
    openedAt: '2026-09-16T09:25:00Z',
    closedAt: '2026-09-16T11:15:00Z',
    plan: {
      entry: 189.42,
      stopLoss: 189.98,
      takeProfit: 188.02,
      riskAmount: 780,
      plannedRr: 2.5,
      positionSize: 1.5,
    },
    actual: {
      entry: 189.42,
      exit: 188.19,
      stopLoss: 189.98,
      takeProfit: 188.02,
      riskAmount: 780,
      actualR: 2.2,
      fees: 6.8,
    },
    compliance: 'partial',
    reviewState: 'reviewed',
    aiReviewState: 'not-available',
    get tags(): string[] {
      return [msg('journalTrades.earlyEntry')];
    },
    screenshots: shots('TR-036', '2026-09-16T09:25:00Z', '2026-09-16T11:15:00Z', [
      'entry',
      'exit',
      'markup',
    ]),
    context: {
      get higherTimeframeBias(): string {
        return msg('journalTrades.dailyDowntrendRalliesSoldIntoThePriorDay');
      },
      get marketStructure(): string {
        return msg('journalTrades.lowerHighsAndLowerLowsAcrossTheLondon');
      },
      get liquidityContext(): string {
        return msg('journalTrades.buySideLiquidityAboveTheAsianSessionHighWas');
      },
      keyZone: '189.60–189.90 (prior day high shelf).',
      get entryConfirmation(): string {
        return msg('journalTrades.bearishRejectionFromTheShelfButEnteredBefore');
      },
      get confluences(): string[] {
        return [
          msg('journalTrades.dailyDowntrend'),
          msg('journalTrades.shelf'),
          msg('journalTrades.asianHighSwept'),
        ];
      },
      get volatility(): string {
        return msg('journalTrades.highThePairWasMovingOnARate');
      },
      get newsExposure(): string {
        return msg('journalTrades.noReleaseDuringTheHoldingWindowButElevated');
      },
    },
    rationale: {
      get thesis(): string {
        return msg('journalTrades.counterTrendRalliesIntoAPriorHighOfferA');
      },
      get entryRationale(): string {
        return msg('journalTrades.entryWasTakenOneCandleBeforeTheRejection');
      },
      get invalidation(): string {
        return msg('journalTrades.aFifteenMinuteCloseAbove19005');
      },
      get management(): string {
        return msg('journalTrades.stopToBreakevenAt1R');
      },
      get exitPlan(): string {
        return msg('journalTrades.fullExitAt25ROrOnTheFirst2');
      },
      checklist: ['bias', 'level', 'invalidation', 'risk', 'size', 'session', 'news'],
      compliance: 'partial',
      get complianceNote(): string {
        return msg('journalTrades.theRewardItemAndTheConfirmationRequirementWere');
      },
    },
    psychology: {
      beforeEntry: 'confident',
      duringTrade: 'anxious',
      afterExit: 'calm',
      confidence: 7,
      fear: 5,
      greed: 3,
      fomo: 4,
      hesitation: 2,
      impulsiveness: 5,
      discipline: 6,
    },
    review: {
      get mistakes(): string[] {
        return [msg('journalTrades.enteredBeforeTheRejectionClose')];
      },
      get wentWell(): string[] {
        return [msg('journalTrades.sizingRespectedTheWrittenRiskDespiteTheEarly')];
      },
      get improvements(): string[] {
        return [msg('journalTrades.waitForTheConfirmingCloseEvenWhenThe')];
      },
      get lesson(): string {
        return msg('journalTrades.beingEarlyIsNotTheSameAsBeing');
      },
      get adjustment(): string {
        return msg('journalTrades.noEntryWithoutTheConfirmationCandleRegardlessOf');
      },
      get notes(): string {
        return msg('journalTrades.recordedAsPartialComplianceEvenThoughTheTrade');
      },
    },
    updatedAt: '2026-09-16T11:45:00Z',
  },
  {
    id: 'jn-035',
    ref: 'TR-035',
    symbol: 'ES',
    market: 'futures',
    direction: 'long',
    status: 'closed',
    result: 'loss',
    setupId: 'breakout-retest',
    session: 'overlap',
    timeframe: '5m',
    openedAt: '2026-09-15T12:10:00Z',
    closedAt: '2026-09-15T13:48:00Z',
    plan: {
      entry: 5810.5,
      stopLoss: 5800.25,
      takeProfit: 5836.13,
      riskAmount: 1500,
      plannedRr: 2.5,
      positionSize: 6,
    },
    actual: {
      entry: 5810.5,
      exit: 5794.1,
      stopLoss: 5800.25,
      takeProfit: 5836.13,
      riskAmount: 1500,
      actualR: -1.6,
      fees: 11.8,
    },
    compliance: 'violation',
    reviewState: 'reviewed',
    aiReviewState: 'not-available',
    get tags(): string[] {
      return [msg('journalTrades.stopMoved'), 'over-risk', msg('journalTrades.ruleBreak')];
    },
    screenshots: shots('TR-035', '2026-09-15T12:10:00Z', '2026-09-15T13:48:00Z', [
      'entry',
      'exit',
      'markup',
      'analysis',
    ]),
    context: {
      get higherTimeframeBias(): string {
        return msg('journalTrades.dailyBullishButTheOverlapSessionWasChoppy');
      },
      get marketStructure(): string {
        return msg('journalTrades.failedToMakeAHigherHighAfterThe');
      },
      get liquidityContext(): string {
        return msg('journalTrades.stopsWereClusteredJustBelowTheRetestLow');
      },
      keyZone: '5808–5814 (breakout shelf).',
      get entryConfirmation(): string {
        return msg('journalTrades.weakTheRetestHeldForTwoCandlesOnly');
      },
      get confluences(): string[] {
        return [msg('journalTrades.dailyBias')];
      },
      get volatility(): string {
        return msg('journalTrades.elevatedIntoTheOverlap');
      },
      get newsExposure(): string {
        return msg('journalTrades.aMidSessionReleaseWasIgnored');
      },
    },
    rationale: {
      get thesis(): string {
        return msg('journalTrades.theBreakoutShelfWouldHoldAndContinueWith');
      },
      get entryRationale(): string {
        return msg('journalTrades.retestHeldForTwoCandlesWhichWasTreated');
      },
      get invalidation(): string {
        return msg('journalTrades.aCloseBelow5800ShouldHaveEndedThe');
      },
      get management(): string {
        return msg('journalTrades.plannedStopToBreakevenAt1RActualThe');
      },
      get exitPlan(): string {
        return msg('journalTrades.exitAt25ROrOnInvalidation');
      },
      checklist: ['bias', 'level', 'risk', 'session'],
      compliance: 'violation',
      get complianceNote(): string {
        return msg('journalTrades.theInvalidationCloseHappenedAndTheStopWas');
      },
    },
    psychology: {
      beforeEntry: 'confident',
      duringTrade: 'greedy',
      afterExit: 'frustrated',
      confidence: 8,
      fear: 3,
      greed: 8,
      fomo: 5,
      hesitation: 1,
      impulsiveness: 7,
      discipline: 2,
    },
    review: {
      get mistakes(): string[] {
        return [
          msg('journalTrades.movedTheStopAwayFromThePlan'),
          msg('journalTrades.riskedPastTheDailyBudget'),
          msg('journalTrades.ignoredAScheduledRelease'),
        ];
      },
      get wentWell(): string[] {
        return [msg('journalTrades.theTradeWasReviewedTheSameDayAnd')];
      },
      get improvements(): string[] {
        return [msg('journalTrades.hardStopThePlatformAtTheDailyRiskLimit')];
      },
      get lesson(): string {
        return msg('journalTrades.wideningAStopIsANewTradeWith');
      },
      get adjustment(): string {
        return msg('journalTrades.whenTheInvalidationClosePrintsTheTradeIs');
      },
      get notes(): string {
        return msg('journalTrades.theMostInstructiveRecordInTheJournalAnd');
      },
    },
    updatedAt: '2026-09-15T14:20:00Z',
  },
  {
    id: 'jn-034',
    ref: 'TR-034',
    symbol: 'XAUUSD',
    market: 'forex',
    direction: 'long',
    status: 'closed',
    result: 'win',
    setupId: 'liquidity-sweep',
    session: 'london',
    timeframe: '15m',
    openedAt: '2026-09-14T07:55:00Z',
    closedAt: '2026-09-14T09:30:00Z',
    plan: {
      entry: 2638.5,
      stopLoss: 2627.0,
      takeProfit: 2667.25,
      riskAmount: 920,
      plannedRr: 2.5,
      positionSize: 0.8,
    },
    actual: {
      entry: 2638.5,
      exit: 2674.15,
      stopLoss: 2627.0,
      takeProfit: 2667.25,
      riskAmount: 920,
      actualR: 3.1,
      fees: 9.6,
    },
    compliance: 'compliant',
    reviewState: 'reviewed',
    aiReviewState: 'not-available',
    get tags(): string[] {
      return ['sweep', 'reclaim', msg('journalTrades.runnerHeld')];
    },
    screenshots: shots('TR-034', '2026-09-14T07:55:00Z', '2026-09-14T09:30:00Z', [
      'entry',
      'exit',
      'markup',
    ]),
    context: {
      get higherTimeframeBias(): string {
        return msg('journalTrades.dailyUptrendPriceAboveThePriorWeekClose');
      },
      get marketStructure(): string {
        return msg('journalTrades.higherLowsOnTheFourHourChart');
      },
      get liquidityContext(): string {
        return msg('journalTrades.sellSideStopsBelowTheLondonOpenLowWere');
      },
      keyZone: '2634–2640 (prior day low and weekly open).',
      get entryConfirmation(): string {
        return msg('journalTrades.reclaimOfThePriorDayLowWithinThe');
      },
      get confluences(): string[] {
        return [
          msg('journalTrades.weeklyOpen'),
          msg('journalTrades.sweepOfTheSessionLow'),
          msg('journalTrades.dailyTrend'),
        ];
      },
      get volatility(): string {
        return msg('journalTrades.highExpandingAfterTheSweep');
      },
      get newsExposure(): string {
        return msg('journalTrades.aCentralBankSpeakerAfterTheHoldingWindow');
      },
    },
    rationale: {
      get thesis(): string {
        return msg('journalTrades.whenASessionLowIsSweptAndReclaimed');
      },
      get entryRationale(): string {
        return msg('journalTrades.entryOnTheHigherLowAfterTheReclaim');
      },
      get invalidation(): string {
        return msg('journalTrades.aFifteenMinuteCloseBelowTheSweepLow');
      },
      get management(): string {
        return msg('journalTrades.stopToBreakevenAt1RTrailUnderEach');
      },
      get exitPlan(): string {
        return msg('journalTrades.trimAt25RTrailTheRemainder');
      },
      checklist: ['bias', 'level', 'invalidation', 'risk', 'size', 'session', 'news', 'reward'],
      compliance: 'compliant',
      get complianceNote(): string {
        return msg('journalTrades.checklistCompleteTheRunnerWasAllowedPastThe');
      },
    },
    psychology: {
      beforeEntry: 'focused',
      duringTrade: 'calm',
      afterExit: 'confident',
      confidence: 8,
      fear: 2,
      greed: 4,
      fomo: 1,
      hesitation: 2,
      impulsiveness: 2,
      discipline: 9,
    },
    review: {
      mistakes: [],
      get wentWell(): string[] {
        return [
          msg('journalTrades.waitedForTheReclaimRatherThanTheSweep'),
          msg('journalTrades.theRunnerWasManagedByRule'),
        ];
      },
      get improvements(): string[] {
        return [msg('journalTrades.recordTheTrailingRuleThatWasActuallyUsed')];
      },
      get lesson(): string {
        return msg('journalTrades.theSweepSuppliesTheFuelTheReclaimIs');
      },
      get adjustment(): string {
        return msg('journalTrades.keepTheSweepAndReclaimRequirementForEverySessionLowE');
      },
      notes: '',
    },
    updatedAt: '2026-09-14T10:00:00Z',
  },
  {
    id: 'jn-033',
    ref: 'TR-033',
    symbol: 'NQ',
    market: 'futures',
    direction: 'short',
    status: 'closed',
    result: 'win',
    setupId: 'failed-breakout',
    session: 'new-york',
    timeframe: '5m',
    openedAt: '2026-09-11T15:20:00Z',
    closedAt: '2026-09-11T16:04:00Z',
    plan: {
      entry: 21380,
      stopLoss: 21452,
      takeProfit: 21200,
      riskAmount: 720,
      plannedRr: 2.5,
      positionSize: 1,
    },
    actual: {
      entry: 21380,
      exit: 21279.2,
      stopLoss: 21452,
      takeProfit: 21200,
      riskAmount: 720,
      actualR: 1.4,
      fees: 10.2,
    },
    compliance: 'compliant',
    reviewState: 'not-required',
    aiReviewState: 'not-available',
    get tags(): string[] {
      return [msg('journalTrades.failedPush'), msg('journalTrades.rangeHigh')];
    },
    screenshots: shots('TR-033', '2026-09-11T15:20:00Z', '2026-09-11T16:04:00Z', ['entry', 'exit']),
    updatedAt: '2026-09-11T16:30:00Z',
  },
  {
    id: 'jn-032',
    ref: 'TR-032',
    symbol: 'ETHUSD',
    market: 'crypto',
    direction: 'long',
    status: 'closed',
    result: 'loss',
    setupId: 'range-reversal',
    session: 'asia',
    timeframe: '1h',
    openedAt: '2026-09-10T02:15:00Z',
    closedAt: '2026-09-10T04:40:00Z',
    plan: {
      entry: 2480,
      stopLoss: 2452,
      takeProfit: 2550,
      riskAmount: 560,
      plannedRr: 2.5,
      positionSize: 5,
    },
    actual: {
      entry: 2480,
      exit: 2454.8,
      stopLoss: 2452,
      takeProfit: 2550,
      riskAmount: 560,
      actualR: -0.9,
      fees: 22.4,
    },
    compliance: 'violation',
    reviewState: 'required',
    aiReviewState: 'not-available',
    get tags(): string[] {
      return [msg('journalTrades.rangeEdge'), 'over-risk', msg('journalTrades.ruleBreak')];
    },
    screenshots: shots('TR-032', '2026-09-10T02:15:00Z', '2026-09-10T04:40:00Z', ['entry']),
    updatedAt: '2026-09-10T05:20:00Z',
  },
  {
    id: 'jn-031',
    ref: 'TR-031',
    symbol: 'EURUSD',
    market: 'forex',
    direction: 'short',
    status: 'closed',
    result: 'win',
    setupId: 'liquidity-sweep',
    session: 'overlap',
    timeframe: '15m',
    openedAt: '2026-09-09T11:55:00Z',
    closedAt: '2026-09-09T13:20:00Z',
    plan: {
      entry: 1.1162,
      stopLoss: 1.1183,
      takeProfit: 1.11095,
      riskAmount: 650,
      plannedRr: 2.5,
      positionSize: 3,
    },
    actual: {
      entry: 1.1162,
      exit: 1.11116,
      stopLoss: 1.1183,
      takeProfit: 1.11095,
      riskAmount: 650,
      actualR: 2.4,
      fees: 4.1,
    },
    compliance: 'compliant',
    reviewState: 'reviewed',
    aiReviewState: 'not-available',
    tags: ['sweep', 'reclaim'],
    screenshots: shots('TR-031', '2026-09-09T11:55:00Z', '2026-09-09T13:20:00Z', ['entry', 'exit']),
    updatedAt: '2026-09-09T13:45:00Z',
  },
  {
    id: 'jn-030',
    ref: 'TR-030',
    symbol: 'NVDA',
    market: 'equities',
    direction: 'long',
    status: 'archived',
    result: 'breakeven',
    setupId: 'gap-continuation',
    session: 'new-york',
    timeframe: '5m',
    openedAt: '2026-09-08T14:05:00Z',
    closedAt: '2026-09-08T15:12:00Z',
    plan: {
      entry: 128.6,
      stopLoss: 126.55,
      takeProfit: 133.73,
      riskAmount: 410,
      plannedRr: 2.5,
      positionSize: 200,
    },
    actual: {
      entry: 128.6,
      exit: 128.4,
      stopLoss: 126.55,
      takeProfit: 133.73,
      riskAmount: 410,
      actualR: -0.1,
      fees: 3.5,
    },
    compliance: 'partial',
    reviewState: 'reviewed',
    aiReviewState: 'not-available',
    get tags(): string[] {
      return ['archived', msg('journalTrades.flatClose')];
    },
    screenshots: shots('TR-030', '2026-09-08T14:05:00Z', '2026-09-08T15:12:00Z', ['entry', 'exit']),
    updatedAt: '2026-09-08T15:40:00Z',
  },
  {
    id: 'jn-029',
    ref: 'TR-029',
    symbol: 'ES',
    market: 'futures',
    direction: 'long',
    status: 'closed',
    result: 'win',
    setupId: 'trend-pullback',
    session: 'london',
    timeframe: '5m',
    openedAt: '2026-09-05T08:30:00Z',
    closedAt: '2026-09-05T10:10:00Z',
    plan: {
      entry: 5795.75,
      stopLoss: 5787.75,
      takeProfit: 5815.75,
      riskAmount: 1350,
      plannedRr: 2.5,
      positionSize: 3,
    },
    actual: {
      entry: 5795.75,
      exit: 5810.95,
      stopLoss: 5787.75,
      takeProfit: 5815.75,
      riskAmount: 1350,
      actualR: 1.9,
      fees: 11.8,
    },
    compliance: 'compliant',
    reviewState: 'reviewed',
    aiReviewState: 'not-available',
    get tags(): string[] {
      return [msg('journalTrades.trendDay'), 'pullback'];
    },
    screenshots: shots('TR-029', '2026-09-05T08:30:00Z', '2026-09-05T10:10:00Z', ['entry', 'exit']),
    updatedAt: '2026-09-05T10:35:00Z',
  },
  {
    id: 'jn-028',
    ref: 'TR-028',
    symbol: 'XAUUSD',
    market: 'forex',
    direction: 'long',
    status: 'closed',
    result: 'loss',
    setupId: 'liquidity-sweep',
    session: 'london',
    timeframe: '15m',
    openedAt: '2026-09-03T08:10:00Z',
    closedAt: '2026-09-03T09:05:00Z',
    plan: {
      entry: 2612,
      stopLoss: 2601.5,
      takeProfit: 2638.25,
      riskAmount: 900,
      plannedRr: 2.5,
      positionSize: 0.8,
    },
    actual: {
      entry: 2612,
      exit: 2599.4,
      stopLoss: 2601.5,
      takeProfit: 2638.25,
      riskAmount: 900,
      actualR: -1.2,
      fees: 9.4,
    },
    compliance: 'not-assessed',
    reviewState: 'required',
    aiReviewState: 'not-available',
    get tags(): string[] {
      return ['sweep', msg('journalTrades.noReclaim')];
    },
    screenshots: shots('TR-028', '2026-09-03T08:10:00Z', '2026-09-03T09:05:00Z', ['entry', 'exit']),
    context: {
      get higherTimeframeBias(): string {
        return msg('journalTrades.dailyUptrendButTheFourHourChartWasRolling');
      },
      get marketStructure(): string {
        return msg('journalTrades.lowerHighsIntoTheLondonOpen');
      },
      get liquidityContext(): string {
        return msg('journalTrades.stopsTakenBelowThePriorDayLow');
      },
      keyZone: '2604–2612 (prior day low).',
      get entryConfirmation(): string {
        return msg('journalTrades.treatedTheSweepAsConfirmationNoReclaimPrinted');
      },
      get confluences(): string[] {
        return [msg('journalTrades.priorDayLow')];
      },
      get volatility(): string {
        return msg('journalTrades.aboveAverage');
      },
      get newsExposure(): string {
        return msg('journalTrades.noReleaseInsideTheWindow');
      },
    },
    rationale: {
      get thesis(): string {
        return msg('journalTrades.thePriorDayLowWouldBeSweptAnd');
      },
      get entryRationale(): string {
        return msg('journalTrades.entryWasTakenOnTheSweepItselfRather');
      },
      get invalidation(): string {
        return msg('journalTrades.aFifteenMinuteCloseBackBelowTheSweepLow');
      },
      get management(): string {
        return msg('journalTrades.notWrittenBeforeEntry');
      },
      get exitPlan(): string {
        return msg('journalTrades.fullExitAt25R');
      },
      checklist: ['bias', 'level', 'invalidation', 'risk', 'size', 'news'],
      compliance: 'not-assessed',
      get complianceNote(): string {
        return msg('journalTrades.twoChecklistItemsAreUnrecordedSoComplianceCannot');
      },
    },
    updatedAt: '2026-09-03T09:40:00Z',
  },
  {
    id: 'jn-027',
    ref: 'TR-027',
    symbol: 'NQ',
    market: 'futures',
    direction: 'long',
    status: 'open',
    result: 'pending',
    setupId: 'breakout-retest',
    session: 'new-york',
    timeframe: '5m',
    openedAt: '2026-09-01T13:45:00Z',
    closedAt: null,
    plan: {
      entry: 21460,
      stopLoss: 21400,
      takeProfit: 21610,
      riskAmount: 960,
      plannedRr: 2.5,
      positionSize: 1,
    },
    actual: {
      entry: 21460,
      exit: null,
      stopLoss: 21400,
      takeProfit: 21610,
      riskAmount: 960,
      actualR: null,
      fees: 0,
    },
    compliance: 'not-assessed',
    reviewState: 'not-required',
    aiReviewState: 'not-available',
    get tags(): string[] {
      return [msg('journalTrades.positionOpen')];
    },
    screenshots: shots('TR-027', '2026-09-01T13:45:00Z', null, ['entry']),
    updatedAt: '2026-09-01T13:45:00Z',
  },
  {
    id: 'jn-026',
    ref: 'TR-026',
    symbol: 'BTCUSD',
    market: 'crypto',
    direction: 'short',
    status: 'incomplete',
    result: 'pending',
    setupId: 'failed-breakout',
    session: 'asia',
    timeframe: '1h',
    openedAt: '2026-09-01T01:20:00Z',
    closedAt: null,
    plan: {
      entry: 64850,
      stopLoss: 65320,
      takeProfit: 63675,
      riskAmount: 560,
      plannedRr: 2.5,
      positionSize: 0.35,
    },
    actual: {
      entry: 64850,
      exit: null,
      stopLoss: 65320,
      takeProfit: 63675,
      riskAmount: 560,
      actualR: null,
      fees: 12,
    },
    compliance: 'partial',
    reviewState: 'required',
    aiReviewState: 'not-available',
    get tags(): string[] {
      return [msg('journalTrades.needsExit'), msg('journalTrades.recordIncomplete')];
    },
    screenshots: shots('TR-026', '2026-09-01T01:20:00Z', null, ['entry', 'markup']),
    updatedAt: '2026-09-01T01:20:00Z',
  },
];

export function findTrade(ref: string): JournalTrade | undefined {
  return mockTrades.find((trade) => trade.ref === ref || trade.id === ref);
}

/**
 * The trade's own history, derived only from timestamps the record actually
 * carries. No event is invented: a trade with no close has no exit event, and a
 * trade with no write-up has no review event.
 */
export function buildTradeTimeline(trade: JournalTrade): TradeEvent[] {
  const events: TradeEvent[] = [
    {
      id: `${trade.id}-recorded`,
      tradeId: trade.id,
      kind: 'recorded',
      at: trade.openedAt,
      actor: 'you',
      detail: `Plan written: ${trade.direction} ${trade.symbol} from ${trade.plan.entry}, invalidation ${trade.plan.stopLoss}, planned ${trade.plan.plannedRr.toFixed(1)}:1.`,
    },
  ];

  if (trade.actual?.entry != null) {
    events.push({
      id: `${trade.id}-entry`,
      tradeId: trade.id,
      kind: 'entry',
      at: trade.openedAt,
      actor: msg('journalTrades.executionRecord'),
      detail: `Filled at ${trade.actual.entry}. Risk recorded as ${trade.actual.riskAmount ?? trade.plan.riskAmount}.`,
    });
  }

  if (trade.closedAt !== null && trade.actual?.exit != null) {
    events.push({
      id: `${trade.id}-exit`,
      tradeId: trade.id,
      kind: 'exit',
      at: trade.closedAt,
      actor: msg('journalTrades.executionRecord'),
      detail:
        trade.actual.actualR === null
          ? `Closed at ${trade.actual.exit}; not scored yet.`
          : `Closed at ${trade.actual.exit} — ${trade.actual.actualR > 0 ? '+' : ''}${trade.actual.actualR.toFixed(2)}R.`,
    });
  }

  if (trade.rationale !== undefined) {
    events.push({
      id: `${trade.id}-assessment`,
      tradeId: trade.id,
      kind: 'assessment',
      at: trade.updatedAt,
      actor: 'you',
      detail: trade.rationale.complianceNote,
    });
  }

  if (trade.review !== undefined) {
    events.push({
      id: `${trade.id}-review`,
      tradeId: trade.id,
      kind: 'review',
      at: trade.updatedAt,
      actor: 'you',
      detail: trade.review.lesson,
    });
  }

  return events;
}

/** Timeline events for every record, oldest first — the Reviews section reads this. */
export const mockTradeEvents: readonly TradeEvent[] = [...mockTrades]
  .sort((a, b) => (a.openedAt < b.openedAt ? -1 : 1))
  .flatMap((trade) => buildTradeTimeline(trade));
