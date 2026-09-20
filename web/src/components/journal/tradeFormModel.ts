/**
 * Trade form shape and validation.
 *
 * Dependency-free on purpose: no React, no component imports. The journal's data
 * entry rules are policy, not presentation, and they are the part of the form that
 * has to be argued with — so they live where they can be read and tested directly.
 *
 * Two kinds of rule are enforced:
 *   1. **presence** — a record without a symbol, a setup or an invalidation level
 *      cannot be reviewed later, so it is refused at entry;
 *   2. **coherence** — the levels must agree with the direction. A long whose
 *      invalidation sits above its entry, or a short whose target sits above it,
 *      is not a style preference; it is a data-entry error that would poison every
 *      statistic derived from the record afterwards.
 *
 * Nothing here computes a trading value. The form records what was entered and
 * checks that the record is internally possible.
 */

import type {
  AttachmentKind,
  EmotionalState,
  RuleCompliance,
  TradeDirection,
  TradeMarket,
  TradeStatus,
  TradeTimeframe,
  TradingSession,
} from '../../mock/journal.js';

export interface TradeFormValues {
  symbol: string;
  market: TradeMarket;
  direction: TradeDirection;
  status: TradeStatus;
  date: string;
  entryTime: string;
  exitTime: string;
  session: TradingSession;
  timeframe: TradeTimeframe;
  setupId: string;
  entryPrice: string;
  exitPrice: string;
  stopLoss: string;
  takeProfit: string;
  positionSize: string;
  commission: string;
  fees: string;
  plannedRisk: string;
  plannedRr: string;
  actualR: string;
  higherTimeframeBias: string;
  marketStructure: string;
  liquidityContext: string;
  keyZone: string;
  entryConfirmation: string;
  confluences: string;
  volatility: string;
  newsExposure: string;
  thesis: string;
  entryRationale: string;
  invalidation: string;
  management: string;
  exitPlan: string;
  compliance: RuleCompliance;
  checklist: string[];
  beforeEntry: EmotionalState;
  duringTrade: EmotionalState;
  afterExit: EmotionalState;
  confidence: number;
  fear: number;
  greed: number;
  fomo: number;
  hesitation: number;
  impulsiveness: number;
  discipline: number;
  mistakes: string;
  wentWell: string;
  improvements: string;
  lesson: string;
  adjustment: string;
  tags: string;
  notes: string;
  attachments: AttachmentKind[];
}

export type TradeFormSectionId =
  'information' | 'risk' | 'context' | 'plan' | 'psychology' | 'review' | 'attachments';

export type TradeFormErrors = Partial<Record<TradeFormSectionId, readonly string[]>>;

/**
 * An empty record with a neutral default state.
 *
 * Nothing is pre-filled from a previous trade and no checklist item is pre-ticked:
 * a rule the trader did not consciously confirm is not confirmed, and a form that
 * arrives half-answered invites a submission nobody read.
 */
export const EMPTY_TRADE_FORM: TradeFormValues = {
  symbol: '',
  market: 'futures',
  direction: 'long',
  status: 'closed',
  date: '2026-09-20',
  entryTime: '09:30',
  exitTime: '',
  session: 'london',
  timeframe: '5m',
  setupId: '',
  entryPrice: '',
  exitPrice: '',
  stopLoss: '',
  takeProfit: '',
  positionSize: '',
  commission: '',
  fees: '',
  plannedRisk: '',
  plannedRr: '',
  actualR: '',
  higherTimeframeBias: '',
  marketStructure: '',
  liquidityContext: '',
  keyZone: '',
  entryConfirmation: '',
  confluences: '',
  volatility: '',
  newsExposure: '',
  thesis: '',
  entryRationale: '',
  invalidation: '',
  management: '',
  exitPlan: '',
  compliance: 'not-assessed',
  checklist: [],
  beforeEntry: 'focused',
  duringTrade: 'calm',
  afterExit: 'detached',
  confidence: 5,
  fear: 3,
  greed: 3,
  fomo: 2,
  hesitation: 3,
  impulsiveness: 2,
  discipline: 7,
  mistakes: '',
  wentWell: '',
  improvements: '',
  lesson: '',
  adjustment: '',
  tags: '',
  notes: '',
  attachments: [],
};

export function positiveNumber(value: string): boolean {
  const parsed = Number(value);
  return value.trim() !== '' && Number.isFinite(parsed) && parsed > 0;
}

export function validateTradeForm(values: TradeFormValues): TradeFormErrors {
  const errors: TradeFormErrors = {};

  const information: string[] = [];
  if (values.symbol.trim().length < 2) information.push('Symbol is required.');
  if (values.setupId.trim() === '') {
    information.push('Choose the setup this trade was taken from.');
  }
  if (values.date.trim() === '') information.push('A trade date is required.');
  if (information.length > 0) errors.information = information;

  const risk: string[] = [];
  if (!positiveNumber(values.entryPrice)) risk.push('Entry price must be greater than zero.');
  if (!positiveNumber(values.stopLoss)) {
    risk.push('Invalidation level must be greater than zero.');
  }
  if (!positiveNumber(values.takeProfit)) risk.push('Target must be greater than zero.');
  if (!positiveNumber(values.positionSize)) {
    risk.push('Position size must be greater than zero.');
  }
  if (!positiveNumber(values.plannedRisk)) risk.push('Planned risk must be greater than zero.');

  if (
    positiveNumber(values.entryPrice) &&
    positiveNumber(values.stopLoss) &&
    positiveNumber(values.takeProfit)
  ) {
    const entry = Number(values.entryPrice);
    const stop = Number(values.stopLoss);
    const target = Number(values.takeProfit);
    if (values.direction === 'long' && !(stop < entry && entry < target)) {
      risk.push('A long needs invalidation below the entry and the target above it.');
    }
    if (values.direction === 'short' && !(target < entry && entry < stop)) {
      risk.push('A short needs the target below the entry and the invalidation above it.');
    }
  }
  if (risk.length > 0) errors.risk = risk;

  const plan: string[] = [];
  if (values.invalidation.trim().length < 10) {
    plan.push('Write what would invalidate the setup before approving this record.');
  }
  if (values.thesis.trim().length === 0) plan.push('A trade thesis is required.');
  if (values.checklist.length === 0) {
    plan.push(
      'Mark the checklist items that were satisfied; an unmarked checklist is not a review.',
    );
  }
  if (plan.length > 0) errors.plan = plan;

  return errors;
}

export function countFormErrors(errors: TradeFormErrors): number {
  return Object.values(errors).reduce((sum, list) => sum + (list?.length ?? 0), 0);
}
