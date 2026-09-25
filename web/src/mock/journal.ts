import { liveLabels, msg } from '../i18n/index.js';
/**
 * Trading journal — vocabulary, labels and illustrative aggregates.
 *
 * The journal records what the trader *actually did*: the setup they took, the
 * risk they committed, whether they followed their own rules, the mistake they
 * made and the lesson they took from it. It is deliberately not a performance
 * marketing surface: sample size is reported next to every rate, and an
 * unrecorded trade is shown as unrecorded rather than scored as a zero.
 *
 * What this file deliberately does NOT do:
 *   - it computes nothing. Every headline statistic and every series below is an
 *     illustrative constant. Real analytics belong to the deterministic engine
 *     (`packages/trading-engine`), which is not wired to the journal yet;
 *   - it claims no edge. Rates are reported with their sample and are labelled
 *     `synthetic` wherever they are rendered with a provenance strip;
 *   - it never presents a trade outcome as a recommendation. A recorded result is
 *     history, not a signal.
 *
 * The trade records themselves live in `mock/journalTrades.ts`; this module holds
 * the shared vocabulary so the two can be imported without a value cycle.
 */

export function previewNotice(): string {
  return msg('journal.previewNotice');
}

export function methodNote(): string {
  return msg('journal.methodNote');
}

export function statNote(): string {
  return msg('journal.statNote');
}

export function attachmentNote(): string {
  return msg('journal.attachmentNote');
}

export function aiReviewNotice(): string {
  return msg('journal.aiReviewNotice');
}

/* Vocabulary ------------------------------------------------------------- */

export type TradeMarket = 'futures' | 'forex' | 'equities' | 'crypto';

export const MARKET_LABEL: Record<TradeMarket, string> = liveLabels({
  futures: 'journal.market.futures',
  forex: 'journal.market.forex',
  equities: 'journal.market.equities',
  crypto: 'journal.market.crypto',
});

export type TradeDirection = 'long' | 'short';

export const DIRECTION_LABEL: Record<TradeDirection, string> = liveLabels({
  long: 'journal.direction.long',
  short: 'journal.direction.short',
});

export type TradingSession = 'asia' | 'london' | 'overlap' | 'new-york';

export const SESSION_LABEL: Record<TradingSession, string> = liveLabels({
  asia: 'journal.session.asia',
  london: 'journal.session.london',
  overlap: 'journal.session.overlap',
  'new-york': 'journal.session.new-york',
});

export type TradeStatus = 'closed' | 'open' | 'incomplete' | 'archived';

export const STATUS_LABEL: Record<TradeStatus, string> = liveLabels({
  closed: 'journal.status.closed',
  open: 'journal.status.open',
  incomplete: 'journal.status.incomplete',
  archived: 'journal.status.archived',
});

/** `pending` is the only honest result for a trade that has not been scored. */
export type TradeResult = 'win' | 'loss' | 'breakeven' | 'pending';

export const RESULT_LABEL: Record<TradeResult, string> = liveLabels({
  win: 'journal.result.win',
  loss: 'journal.result.loss',
  breakeven: 'journal.result.breakeven',
  pending: 'journal.result.pending',
});

export type RuleCompliance = 'compliant' | 'partial' | 'violation' | 'not-assessed';

export const COMPLIANCE_LABEL: Record<RuleCompliance, string> = liveLabels({
  compliant: 'journal.compliance.compliant',
  partial: 'journal.compliance.partial',
  violation: 'journal.compliance.violation',
  'not-assessed': 'journal.compliance.not-assessed',
});

export const COMPLIANCE_EXPLANATION: Record<RuleCompliance, string> = liveLabels({
  compliant: 'journal.compliance2.compliant',
  partial: 'journal.compliance2.partial',
  violation: 'journal.compliance2.violation',
  'not-assessed': 'journal.compliance2.not-assessed',
});

export type ReviewState = 'not-required' | 'required' | 'reviewed';

export const REVIEW_STATE_LABEL: Record<ReviewState, string> = liveLabels({
  'not-required': 'journal.reviewState.not-required',
  required: 'journal.reviewState.required',
  reviewed: 'journal.reviewState.reviewed',
});

export type AiReviewState = 'not-available' | 'pending' | 'processing' | 'completed' | 'failed';

export const AI_REVIEW_STATE_LABEL: Record<AiReviewState, string> = liveLabels({
  'not-available': 'journal.aiReviewState.not-available',
  pending: 'journal.aiReviewState.pending',
  processing: 'journal.aiReviewState.processing',
  completed: 'journal.aiReviewState.completed',
  failed: 'journal.aiReviewState.failed',
});

/** Ordered so the state gallery reads as a lifecycle, not an arbitrary list. */
export const AI_REVIEW_STATE_ORDER: readonly AiReviewState[] = [
  'not-available',
  'pending',
  'processing',
  'completed',
  'failed',
];

export type EmotionalState =
  | 'calm'
  | 'focused'
  | 'confident'
  | 'anxious'
  | 'fearful'
  | 'greedy'
  | 'impulsive'
  | 'hesitant'
  | 'frustrated'
  | 'detached';

export const EMOTIONAL_STATE_LABEL: Record<EmotionalState, string> = liveLabels({
  calm: 'journal.emotionalState.calm',
  focused: 'journal.emotionalState.focused',
  confident: 'journal.emotionalState.confident',
  anxious: 'journal.emotionalState.anxious',
  fearful: 'journal.emotionalState.fearful',
  greedy: 'journal.emotionalState.greedy',
  impulsive: 'journal.emotionalState.impulsive',
  hesitant: 'journal.emotionalState.hesitant',
  frustrated: 'journal.emotionalState.frustrated',
  detached: 'journal.emotionalState.detached',
});

/** Emotional states that are read as a warning rather than a neutral label. */
export const EMOTIONAL_STATE_CAUTION: Record<EmotionalState, boolean> = {
  calm: false,
  focused: false,
  confident: false,
  anxious: true,
  fearful: true,
  greedy: true,
  impulsive: true,
  hesitant: true,
  frustrated: true,
  detached: false,
};

export const TRADE_TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1D'] as const;
export type TradeTimeframe = (typeof TRADE_TIMEFRAMES)[number];

/* Setups ---------------------------------------------------------------- */

export type SetupFamily = 'continuation' | 'reversal' | 'range';

export const SETUP_FAMILY_LABEL: Record<SetupFamily, string> = liveLabels({
  continuation: 'journal.setupFamily.continuation',
  reversal: 'journal.setupFamily.reversal',
  range: 'journal.setupFamily.range',
});

export interface TradeSetup {
  id: string;
  label: string;
  family: SetupFamily;
  /** What must be true before this setup is valid. */
  premise: string;
}

export const TRADE_SETUPS: readonly TradeSetup[] = [
  {
    id: 'breakout-retest',
    get label(): string {
      return msg('journal.breakoutRetest');
    },
    family: 'continuation',
    get premise(): string {
      return msg('journal.aLevelBreaksPriceReturnsToItAnd');
    },
  },
  {
    id: 'trend-pullback',
    get label(): string {
      return msg('journal.trendPullback');
    },
    family: 'continuation',
    get premise(): string {
      return msg('journal.anEstablishedTrendPullsIntoAZoneOf');
    },
  },
  {
    id: 'failed-breakout',
    get label(): string {
      return msg('journal.failedBreakout');
    },
    family: 'reversal',
    get premise(): string {
      return msg('journal.aBreakoutAttemptFailsAndPriceReEntersThe');
    },
  },
  {
    id: 'liquidity-sweep',
    get label(): string {
      return msg('journal.liquiditySweep');
    },
    family: 'reversal',
    get premise(): string {
      return msg('journal.anObviousHighOrLowIsTakenAnd');
    },
  },
  {
    id: 'range-reversal',
    get label(): string {
      return msg('journal.rangeReversal');
    },
    family: 'range',
    get premise(): string {
      return msg('journal.priceReachesTheEdgeOfADefinedRange');
    },
  },
  {
    id: 'gap-continuation',
    get label(): string {
      return msg('journal.gapContinuation');
    },
    family: 'continuation',
    get premise(): string {
      return msg('journal.aGapHoldsItsOpeningRangeInsteadOf');
    },
  },
];

export function setupById(id: string): TradeSetup | undefined {
  return TRADE_SETUPS.find((setup) => setup.id === id);
}

export function setupLabel(id: string): string {
  return setupById(id)?.label ?? id;
}

/* Rule checklist -------------------------------------------------------- */

export interface ChecklistItem {
  id: string;
  label: string;
}

/**
 * The pre-trade checklist. These are the rules the journal scores compliance
 * against; they are policy data, so they live here rather than in a component.
 */
export const JOURNAL_RULE_CHECKLIST: readonly ChecklistItem[] = [
  {
    id: 'bias',
    get label(): string {
      return msg('journal.higherTimeframeBiasWrittenBeforeEntry');
    },
  },
  {
    id: 'level',
    get label(): string {
      return msg('journal.tradeIsTakenFromAPreMarkedLevel');
    },
  },
  {
    id: 'invalidation',
    get label(): string {
      return msg('journal.invalidationLevelWrittenDownBeforeEntry');
    },
  },
  {
    id: 'risk',
    get label(): string {
      return msg('journal.riskIsWithinTheDailyBudget');
    },
  },
  {
    id: 'size',
    get label(): string {
      return msg('journal.positionSizeMatchesTheWrittenRisk');
    },
  },
  {
    id: 'session',
    get label(): string {
      return msg('journal.theSetupIsValidForThisTradingSession');
    },
  },
  {
    id: 'news',
    get label(): string {
      return msg('journal.noHighImpactEventInsideTheHoldingWindow');
    },
  },
  {
    id: 'reward',
    get label(): string {
      return msg('journal.plannedRewardIsAtLeastTwiceTheRisk');
    },
  },
];

/* Trade record shape ---------------------------------------------------- */

/** The plan as written before entry. Values are the trader's, not the system's. */
export interface TradeLevels {
  entry: number;
  stopLoss: number;
  takeProfit: number;
  /** Account risk committed to the trade, in currency. */
  riskAmount: number;
  /** Planned reward-to-risk multiple. */
  plannedRr: number;
  positionSize: number;
}

/** What actually happened. `null` fields mean "not recorded", never zero. */
export interface TradeOutcome {
  entry: number | null;
  exit: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  riskAmount: number | null;
  /** Realised multiple of the risked amount. `null` until the trade is scored. */
  actualR: number | null;
  fees: number;
}

export interface TradeContext {
  higherTimeframeBias: string;
  marketStructure: string;
  liquidityContext: string;
  keyZone: string;
  entryConfirmation: string;
  confluences: readonly string[];
  volatility: string;
  newsExposure: string;
}

export interface TradeRationale {
  thesis: string;
  entryRationale: string;
  invalidation: string;
  management: string;
  exitPlan: string;
  checklist: readonly string[];
  compliance: RuleCompliance;
  complianceNote: string;
}

export interface TradePsychology {
  beforeEntry: EmotionalState;
  duringTrade: EmotionalState;
  afterExit: EmotionalState;
  /** 0..10 self-assessment; recorded at the time, not reconstructed later. */
  confidence: number;
  fear: number;
  greed: number;
  fomo: number;
  hesitation: number;
  impulsiveness: number;
  discipline: number;
}

export interface TradeReview {
  mistakes: readonly string[];
  wentWell: readonly string[];
  improvements: readonly string[];
  lesson: string;
  adjustment: string;
  notes: string;
}

export type AttachmentKind = 'entry' | 'exit' | 'markup' | 'analysis';

export const ATTACHMENT_KIND_LABEL: Record<AttachmentKind, string> = liveLabels({
  entry: 'journal.attachmentKind.entry',
  exit: 'journal.attachmentKind.exit',
  markup: 'journal.attachmentKind.markup',
  analysis: 'journal.attachmentKind.analysis',
});

export interface TradeAttachment {
  id: string;
  kind: AttachmentKind;
  label: string;
  capturedAt: string;
}

export interface JournalTrade {
  id: string;
  /** Human-facing reference, e.g. `TR-041`. */
  ref: string;
  symbol: string;
  market: TradeMarket;
  direction: TradeDirection;
  status: TradeStatus;
  result: TradeResult;
  setupId: string;
  session: TradingSession;
  timeframe: TradeTimeframe;
  openedAt: string;
  closedAt: string | null;
  /** Planned levels — always recorded. */
  plan: TradeLevels;
  /** Actual outcome — `null` while the trade is still incomplete. */
  actual: TradeOutcome | null;
  compliance: RuleCompliance;
  reviewState: ReviewState;
  aiReviewState: AiReviewState;
  tags: readonly string[];
  screenshots: readonly TradeAttachment[];
  /** Rich sections are optional: a trade with no write-up says so. */
  context?: TradeContext;
  rationale?: TradeRationale;
  psychology?: TradePsychology;
  review?: TradeReview;
  updatedAt: string;
}

/* Trade timeline -------------------------------------------------------- */

export type TradeEventKind =
  'recorded' | 'entry' | 'management' | 'exit' | 'review' | 'edit' | 'assessment';

export const TRADE_EVENT_LABEL: Record<TradeEventKind, string> = liveLabels({
  recorded: 'journal.tradeEvent.recorded',
  entry: 'journal.tradeEvent.entry',
  management: 'journal.tradeEvent.management',
  exit: 'journal.tradeEvent.exit',
  review: 'journal.tradeEvent.review',
  edit: 'journal.tradeEvent.edit',
  assessment: 'journal.tradeEvent.assessment',
});

export interface TradeEvent {
  id: string;
  tradeId: string;
  kind: TradeEventKind;
  at: string;
  actor: string;
  detail: string;
}

/* Filters ---------------------------------------------------------------- */

export const TRADE_RANGES = [
  'today',
  'this-week',
  'this-month',
  'last-30',
  'last-90',
  'custom',
] as const;

export type TradeRange = (typeof TRADE_RANGES)[number];

export const TRADE_RANGE_LABEL: Record<TradeRange, string> = liveLabels({
  today: 'journal.tradeRange.today',
  'this-week': 'journal.tradeRange.this-week',
  'this-month': 'journal.tradeRange.this-month',
  'last-30': 'journal.tradeRange.last-30',
  'last-90': 'journal.tradeRange.last-90',
  custom: 'journal.tradeRange.custom',
});

/**
 * The date the preview treats as "now". A fixed constant, so a range filter and
 * its result are the same on every render and in every test — a preview that
 * shifts with the wall clock cannot be reviewed.
 */
export const JOURNAL_REPORT_DATE = '2026-09-20T12:00:00Z';

const RANGE_DAYS: Record<Exclude<TradeRange, 'custom'>, number> = {
  today: 1,
  'this-week': 7,
  'this-month': 30,
  'last-30': 30,
  'last-90': 90,
};

/** An inclusive ISO window for a preset range, anchored to the report date. */
export function rangeWindow(range: TradeRange): { from: string; to: string } {
  if (range === 'custom') return { from: '', to: '' };
  const to = new Date(JOURNAL_REPORT_DATE).getTime();
  const from = to - RANGE_DAYS[range] * 24 * 60 * 60 * 1000;
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
}

/**
 * Locale-independent day, so a scope caption reads the same in a test, in a
 * screenshot and on another machine. `en-GB` is fixed rather than taken from the
 * host locale, and the day is read in UTC because a date input yields `YYYY-MM-DD`.
 */
const RANGE_DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

function formatRangeDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return RANGE_DATE_FORMAT.format(date);
}

/**
 * How a range should be described to the reader.
 *
 * A preset is its own label. A custom range spells out its window instead of
 * repeating "Custom range", because a scope line that does not state the dates
 * makes the figures underneath it unauditable. An unset bound is reported as
 * open rather than being quietly treated as the report date.
 */
export function describeRange(range: TradeRange, from = '', rangeTo = ''): string {
  if (range !== 'custom') return TRADE_RANGE_LABEL[range];
  if (from === '' && rangeTo === '') return 'Custom range — no dates set, open ended';
  const start = from === '' ? 'history start' : formatRangeDate(from);
  const end = rangeTo === '' ? 'open end' : formatRangeDate(rangeTo);
  return `Custom range — ${start} to ${end}`;
}

export interface TradeFilters {
  search: string;
  range: TradeRange;
  /** Used only when `range` is `custom`; empty means "open ended". */
  rangeFrom: string;
  rangeTo: string;
  market: TradeMarket | 'all';
  direction: TradeDirection | 'all';
  session: TradingSession | 'all';
  setupId: string | 'all';
  result: TradeResult | 'all';
  compliance: RuleCompliance | 'all';
  status: TradeStatus | 'all';
}

export const EMPTY_TRADE_FILTERS: TradeFilters = {
  search: '',
  range: 'last-90',
  rangeFrom: '',
  rangeTo: '',
  market: 'all',
  direction: 'all',
  session: 'all',
  setupId: 'all',
  result: 'all',
  compliance: 'all',
  status: 'all',
};

/** How many filters are actually narrowing the table (for the filter chip). */
export function countActiveFilters(filters: TradeFilters): number {
  return (
    (filters.search.trim() === '' ? 0 : 1) +
    (filters.range === 'last-90' ? 0 : 1) +
    (filters.market === 'all' ? 0 : 1) +
    (filters.direction === 'all' ? 0 : 1) +
    (filters.session === 'all' ? 0 : 1) +
    (filters.setupId === 'all' ? 0 : 1) +
    (filters.result === 'all' ? 0 : 1) +
    (filters.compliance === 'all' ? 0 : 1) +
    (filters.status === 'all' ? 0 : 1)
  );
}

/** Half-open date test on the record's own timestamps. No trading value is derived. */
export function withinRange(openedAt: string, filters: TradeFilters): boolean {
  const at = new Date(openedAt).getTime();
  if (Number.isNaN(at)) return true;
  if (filters.range === 'custom') {
    if (filters.rangeFrom !== '' && at < new Date(filters.rangeFrom).getTime()) return false;
    if (filters.rangeTo !== '') {
      const to = new Date(filters.rangeTo).getTime() + 24 * 60 * 60 * 1000;
      if (at > to) return false;
    }
    return true;
  }
  const window = rangeWindow(filters.range);
  return at >= new Date(window.from).getTime() && at <= new Date(window.to).getTime();
}

/**
 * Plain list filtering over an explicit row set. This is selection, not
 * analysis: no trading or risk figure is derived here.
 */
export function filterTrades(
  trades: readonly JournalTrade[],
  filters: TradeFilters,
): readonly JournalTrade[] {
  const needle = filters.search.trim().toLowerCase();
  return trades.filter((trade) => {
    if (!withinRange(trade.openedAt, filters)) return false;
    if (filters.market !== 'all' && trade.market !== filters.market) return false;
    if (filters.direction !== 'all' && trade.direction !== filters.direction) return false;
    if (filters.session !== 'all' && trade.session !== filters.session) return false;
    if (filters.setupId !== 'all' && trade.setupId !== filters.setupId) return false;
    if (filters.result !== 'all' && trade.result !== filters.result) return false;
    if (filters.compliance !== 'all' && trade.compliance !== filters.compliance) return false;
    if (filters.status !== 'all' && trade.status !== filters.status) return false;
    if (needle === '') return true;
    return (
      trade.symbol.toLowerCase().includes(needle) ||
      trade.ref.toLowerCase().includes(needle) ||
      trade.id.toLowerCase().includes(needle) ||
      setupLabel(trade.setupId).toLowerCase().includes(needle) ||
      trade.tags.some((tag) => tag.toLowerCase().includes(needle))
    );
  });
}

export type TradeSortKey =
  'openedAt' | 'symbol' | 'setupId' | 'session' | 'plannedRr' | 'actualR' | 'result' | 'compliance';

export type SortDirection = 'asc' | 'desc';

/** Sort key accessor used by the table header; no value is transformed. */
export function sortValue(trade: JournalTrade, key: TradeSortKey): string | number | null {
  switch (key) {
    case 'openedAt':
      return trade.openedAt;
    case 'symbol':
      return trade.symbol;
    case 'setupId':
      return setupLabel(trade.setupId);
    case 'session':
      return SESSION_LABEL[trade.session];
    case 'plannedRr':
      return trade.plan.plannedRr;
    case 'actualR':
      return trade.actual?.actualR ?? null;
    case 'result':
      return trade.result;
    case 'compliance':
      return trade.compliance;
  }
}

/** Unscored trades sort last regardless of direction, so they never hide a result. */
export function sortTrades(
  trades: readonly JournalTrade[],
  key: TradeSortKey,
  direction: SortDirection,
): readonly JournalTrade[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...trades].sort((a, b) => {
    const left = sortValue(a, key);
    const right = sortValue(b, key);
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    if (left === right) return 0;
    return left > right ? sign : -sign;
  });
}

export interface TradeStateCounts {
  total: number;
  scored: number;
  byStatus: Record<TradeStatus, number>;
  byResult: Record<TradeResult, number>;
  byCompliance: Record<RuleCompliance, number>;
  byReviewState: Record<ReviewState, number>;
  withReview: number;
  withoutWriteUp: number;
}

function tally<T extends string>(keys: readonly T[], values: readonly T[]): Record<T, number> {
  const record = {} as Record<T, number>;
  for (const key of keys) record[key] = 0;
  for (const value of values) record[value] += 1;
  return record;
}

export const TRADE_STATUSES: readonly TradeStatus[] = ['closed', 'open', 'incomplete', 'archived'];
export const TRADE_RESULTS: readonly TradeResult[] = ['win', 'loss', 'breakeven', 'pending'];
export const RULE_COMPLIANCES: readonly RuleCompliance[] = [
  'compliant',
  'partial',
  'violation',
  'not-assessed',
];
export const REVIEW_STATES: readonly ReviewState[] = ['not-required', 'required', 'reviewed'];

/**
 * Counts only. This exists so filter menus can show how many rows a choice would
 * match, and so an empty result can say *why* it is empty.
 */
export function summariseTradeStates(trades: readonly JournalTrade[]): TradeStateCounts {
  return {
    total: trades.length,
    scored: trades.filter((trade) => trade.actual?.actualR != null).length,
    byStatus: tally(
      TRADE_STATUSES,
      trades.map((trade) => trade.status),
    ),
    byResult: tally(
      TRADE_RESULTS,
      trades.map((trade) => trade.result),
    ),
    byCompliance: tally(
      RULE_COMPLIANCES,
      trades.map((trade) => trade.compliance),
    ),
    byReviewState: tally(
      REVIEW_STATES,
      trades.map((trade) => trade.reviewState),
    ),
    withReview: trades.filter((trade) => trade.review !== undefined).length,
    withoutWriteUp: trades.filter((trade) => trade.context === undefined).length,
  };
}

/* Overview statistics --------------------------------------------------- */

export type StatTone = 'positive' | 'negative' | 'neutral' | 'warning';

export interface JournalStat {
  id: string;
  label: string;
  value: string;
  /** Unit or qualifier rendered next to the value. */
  unit?: string;
  /** The comparison this figure is read against — never omitted. */
  comparison: string;
  /** Sample or scope the figure was taken over, so a rate has its denominator. */
  basis: string;
  tone: StatTone;
  hint?: string;
}

/**
 * Ten headline figures, laid out by hand. They are ordered the way the journal
 * should be read: exposure and risk first, then outcome quality, then adherence.
 */
export const mockJournalStats: readonly JournalStat[] = [
  {
    id: 'total-trades',
    get label(): string {
      return msg('journal.totalTrades');
    },
    value: '16',
    unit: 'trades',
    get comparison(): string {
      return msg('journal.14Scored2StillOpen');
    },
    get basis(): string {
      return msg('journal.allRecordsInTheCurrentView');
    },
    tone: 'neutral',
    get hint(): string {
      return msg('journal.theDenominatorForEveryOtherFigureOnThis');
    },
  },
  {
    id: 'win-rate',
    get label(): string {
      return msg('journal.winRate');
    },
    value: '50.0',
    unit: '%',
    get comparison(): string {
      return msg('journal.42PtsVsPrevious14');
    },
    get basis(): string {
      return msg('journal.7WinsIn14ScoredTrades');
    },
    tone: 'positive',
    get hint(): string {
      return msg('journal.aRateIsOnlyMeaningfulWithItsSample');
    },
  },
  {
    id: 'average-r',
    get label(): string {
      return msg('journal.averageRMultiple');
    },
    value: '+0.69',
    unit: 'R',
    get comparison(): string {
      return msg('journal.021RVsPrevious14');
    },
    get basis(): string {
      return msg('journal.14ScoredTrades');
    },
    tone: 'positive',
  },
  {
    id: 'profit-factor',
    get label(): string {
      return msg('journal.profitFactor');
    },
    value: '2.67',
    get comparison(): string {
      return msg('journal.044VsPrevious14');
    },
    get basis(): string {
      return msg('journal.grossWin1543RGrossLoss577R');
    },
    tone: 'positive',
  },
  {
    id: 'expectancy',
    get label(): string {
      return msg('data.expectancy');
    },
    value: '+0.69',
    unit: 'R / trade',
    get comparison(): string {
      return msg('journal.aboveThe025RStudyThreshold');
    },
    get basis(): string {
      return msg('journal.14ScoredTrades');
    },
    tone: 'positive',
    get hint(): string {
      return msg('journal.theOneFigureThatSurvivesASmallSample');
    },
  },
  {
    id: 'max-drawdown',
    get label(): string {
      return msg('journal.maximumDrawdown');
    },
    value: '−1.6',
    unit: 'R',
    get comparison(): string {
      return msg('journal.worstPeakToTroughOnTheRCurve');
    },
    get basis(): string {
      return msg('journal.rCurveAcross14ScoredTrades');
    },
    tone: 'warning',
  },
  {
    id: 'net-performance',
    get label(): string {
      return msg('journal.netPerformance');
    },
    value: '+9.63',
    unit: 'R',
    get comparison(): string {
      return msg('journal.sameAsTheLastPointOnTheEquity');
    },
    get basis(): string {
      return msg('journal.sumOfScoredRNetOfTheCurve');
    },
    tone: 'positive',
  },
  {
    id: 'average-risk',
    get label(): string {
      return msg('journal.averageRiskPerTrade');
    },
    value: '861',
    unit: 'per trade',
    get comparison(): string {
      return msg('journal.statedInAccountCurrency');
    },
    get basis(): string {
      return msg('journal.16RecordsPlannedRisk');
    },
    tone: 'neutral',
    get hint(): string {
      return msg('journal.riskConsistencyMattersMoreThanAnySingleResult');
    },
  },
  {
    id: 'rule-compliance',
    get label(): string {
      return msg('journal.ruleCompliance');
    },
    value: '61.5',
    unit: '%',
    get comparison(): string {
      return msg('journal.8CompliantOf13Assessed');
    },
    get basis(): string {
      return msg('journal.3TradesNotAssessedYet');
    },
    tone: 'warning',
    get hint(): string {
      return msg('journal.the3UnassessedTradesAreExcludedRatherThan');
    },
  },
  {
    id: 'average-rr',
    get label(): string {
      return msg('journal.averageRewardToRisk');
    },
    value: '2.5',
    unit: ': 1',
    get comparison(): string {
      return msg('journal.plannedBeforeEntry');
    },
    get basis(): string {
      return msg('journal.plannedLevelsOf16Records');
    },
    tone: 'neutral',
    get hint(): string {
      return msg('journal.plannedNotAchievedRealisedRIsReportedSeparately');
    },
  },
];

/* Chart series ---------------------------------------------------------- */

export interface JournalSeriesPoint {
  label: string;
  value: number;
}

export interface JournalSeries {
  id: string;
  title: string;
  description: string;
  /** Rendered as a line/area, or as bars when true. */
  bars?: boolean;
  points: readonly JournalSeriesPoint[];
  /** Format applied to the value in tooltips and axis labels. */
  unit: string;
}

/** Cumulative R after each scored trade, in chronological order. */
export const mockEquityCurve: JournalSeries = {
  id: 'equity-curve',
  get title(): string {
    return msg('journal.equityCurve');
  },
  get description(): string {
    return msg('journal.cumulativeRAfterEachScoredTradeOldestFirst');
  },
  points: [
    { label: 'TR-028', value: -1.2 },
    { label: 'TR-029', value: 0.7 },
    { label: 'TR-030', value: 0.6 },
    { label: 'TR-031', value: 3.0 },
    { label: 'TR-032', value: 2.1 },
    { label: 'TR-033', value: 3.5 },
    { label: 'TR-034', value: 6.6 },
    { label: 'TR-035', value: 5.0 },
    { label: 'TR-036', value: 7.2 },
    { label: 'TR-037', value: 7.23 },
    { label: 'TR-038', value: 6.23 },
    { label: 'TR-039', value: 8.03 },
    { label: 'TR-040', value: 7.03 },
    { label: 'TR-041', value: 9.63 },
  ],
  unit: 'R',
};

/** Running distance below the high-water mark of the R curve. Never positive. */
export const mockDrawdownCurve: JournalSeries = {
  id: 'drawdown',
  get title(): string {
    return msg('journal.drawdown');
  },
  get description(): string {
    return msg('journal.distanceBelowTheHighWaterMarkOfTheR');
  },
  points: [
    { label: 'TR-028', value: -1.2 },
    { label: 'TR-029', value: 0 },
    { label: 'TR-030', value: -0.1 },
    { label: 'TR-031', value: 0 },
    { label: 'TR-032', value: -0.9 },
    { label: 'TR-033', value: 0 },
    { label: 'TR-034', value: 0 },
    { label: 'TR-035', value: -1.6 },
    { label: 'TR-036', value: 0 },
    { label: 'TR-037', value: 0 },
    { label: 'TR-038', value: -1.0 },
    { label: 'TR-039', value: 0 },
    { label: 'TR-040', value: -1.0 },
    { label: 'TR-041', value: 0 },
  ],
  unit: 'R',
};

export const mockCumulativeR: JournalSeries = {
  id: 'cumulative-r',
  get title(): string {
    return msg('journal.cumulativeRPerformance');
  },
  get description(): string {
    return msg('journal.theSameCurveAsEquityReadAsOne');
  },
  points: [
    { label: 'TR-028', value: -1.2 },
    { label: 'TR-029', value: 1.9 },
    { label: 'TR-030', value: -0.1 },
    { label: 'TR-031', value: 2.4 },
    { label: 'TR-032', value: -0.9 },
    { label: 'TR-033', value: 1.4 },
    { label: 'TR-034', value: 3.1 },
    { label: 'TR-035', value: -1.6 },
    { label: 'TR-036', value: 2.2 },
    { label: 'TR-037', value: 0.03 },
    { label: 'TR-038', value: -1.0 },
    { label: 'TR-039', value: 1.8 },
    { label: 'TR-040', value: -1.0 },
    { label: 'TR-041', value: 2.6 },
  ],
  unit: 'R',
};

export const mockExpectancyOverTime: JournalSeries = {
  id: 'expectancy',
  get title(): string {
    return msg('journal.expectancyOverTime');
  },
  get description(): string {
    return msg('journal.runningAverageRAsEachNewScoredTrade');
  },
  points: [
    { label: '5', value: 0.2 },
    { label: '6', value: 0.35 },
    { label: '7', value: 0.5 },
    { label: '8', value: 0.42 },
    { label: '9', value: 0.55 },
    { label: '10', value: 0.61 },
    { label: '11', value: 0.58 },
    { label: '12', value: 0.64 },
    { label: '13', value: 0.66 },
    { label: '14', value: 0.69 },
  ],
  unit: 'R',
};

export const mockRiskConsistency: JournalSeries = {
  id: 'risk-consistency',
  get title(): string {
    return msg('journal.riskConsistency');
  },
  get description(): string {
    return msg('journal.plannedRiskPerTradeAgainstTheAccountBudget');
  },
  points: [
    { label: 'TR-028', value: 900 },
    { label: 'TR-029', value: 1350 },
    { label: 'TR-030', value: 410 },
    { label: 'TR-031', value: 650 },
    { label: 'TR-032', value: 560 },
    { label: 'TR-033', value: 720 },
    { label: 'TR-034', value: 920 },
    { label: 'TR-035', value: 1500 },
    { label: 'TR-036', value: 780 },
    { label: 'TR-037', value: 575 },
    { label: 'TR-038', value: 620 },
    { label: 'TR-039', value: 650 },
    { label: 'TR-040', value: 1425 },
    { label: 'TR-041', value: 1800 },
  ],
  unit: 'currency',
};

export const mockWinLossDistribution: JournalSeries = {
  id: 'win-loss',
  get title(): string {
    return msg('journal.winLossDistribution');
  },
  get description(): string {
    return msg('journal.everyRecordAccountedForIncludingTheTwoThat');
  },
  bars: true,
  points: [
    {
      get label(): string {
        return msg('journal.wins2');
      },
      value: 7,
    },
    {
      get label(): string {
        return msg('journal.losses2');
      },
      value: 5,
    },
    {
      get label(): string {
        return msg('journal.result.breakeven');
      },
      value: 2,
    },
    {
      get label(): string {
        return msg('journal.status.open');
      },
      value: 1,
    },
    {
      get label(): string {
        return msg('journal.status.incomplete');
      },
      value: 1,
    },
  ],
  unit: 'trades',
};

export const mockAverageWinLoss: JournalSeries = {
  id: 'average-win-loss',
  get title(): string {
    return msg('journal.averageWinVsAverageLoss');
  },
  get description(): string {
    return msg('journal.theRatioThatMakesABelow50WinRate');
  },
  bars: true,
  points: [
    {
      get label(): string {
        return msg('journal.averageWin');
      },
      value: 2.2,
    },
    {
      get label(): string {
        return msg('journal.averageLoss');
      },
      value: -1.15,
    },
  ],
  unit: 'R',
};

export const mockTradeDuration: JournalSeries = {
  id: 'trade-duration',
  get title(): string {
    return msg('journal.tradeDuration');
  },
  get description(): string {
    return msg('journal.holdingTimeAcrossThe14ScoredTrades');
  },
  bars: true,
  points: [
    { label: '< 15m', value: 3 },
    { label: '15–45m', value: 5 },
    { label: '45m–2h', value: 4 },
    { label: '> 2h', value: 2 },
  ],
  unit: 'trades',
};

/* Performance breakdowns ------------------------------------------------- */

export interface BreakdownRow {
  id: string;
  label: string;
  /** Number of scored trades in this bucket, always shown. */
  sample: number;
  winRatePct: number;
  averageR: number;
  plannedRr: number;
}

export const mockPlannedVsActual: readonly BreakdownRow[] = [
  {
    id: 'breakout-retest',
    get label(): string {
      return msg('journal.breakoutRetest');
    },
    sample: 2,
    winRatePct: 50.0,
    averageR: 0.5,
    plannedRr: 2.5,
  },
  {
    id: 'failed-breakout',
    get label(): string {
      return msg('journal.failedBreakout');
    },
    sample: 2,
    winRatePct: 50.0,
    averageR: 0.2,
    plannedRr: 2.5,
  },
  {
    id: 'trend-pullback',
    get label(): string {
      return msg('journal.trendPullback');
    },
    sample: 3,
    winRatePct: 100.0,
    averageR: 1.97,
    plannedRr: 2.5,
  },
  {
    id: 'range-reversal',
    get label(): string {
      return msg('journal.rangeReversal');
    },
    sample: 2,
    winRatePct: 0.0,
    averageR: -0.95,
    plannedRr: 2.5,
  },
  {
    id: 'gap-continuation',
    get label(): string {
      return msg('journal.gapContinuation');
    },
    sample: 2,
    winRatePct: 0.0,
    averageR: -0.04,
    plannedRr: 2.5,
  },
  {
    id: 'liquidity-sweep',
    get label(): string {
      return msg('journal.liquiditySweep');
    },
    sample: 3,
    winRatePct: 66.7,
    averageR: 1.43,
    plannedRr: 2.5,
  },
];

export const mockSetupPerformance: readonly BreakdownRow[] = mockPlannedVsActual;

export const mockSessionPerformance: readonly BreakdownRow[] = [
  {
    id: 'new-york',
    get label(): string {
      return msg('journal.session.new-york');
    },
    sample: 5,
    winRatePct: 40.0,
    averageR: 0.59,
    plannedRr: 2.5,
  },
  {
    id: 'london',
    get label(): string {
      return msg('journal.session.london');
    },
    sample: 5,
    winRatePct: 80.0,
    averageR: 1.56,
    plannedRr: 2.5,
  },
  {
    id: 'overlap',
    get label(): string {
      return msg('journal.session.overlap');
    },
    sample: 2,
    winRatePct: 50.0,
    averageR: 0.4,
    plannedRr: 2.5,
  },
  {
    id: 'asia',
    get label(): string {
      return msg('journal.session.asia');
    },
    sample: 2,
    winRatePct: 0.0,
    averageR: -0.95,
    plannedRr: 2.5,
  },
];

export const mockDirectionPerformance: readonly BreakdownRow[] = [
  {
    id: 'long',
    get label(): string {
      return msg('journal.direction.long');
    },
    sample: 10,
    winRatePct: 50.0,
    averageR: 0.46,
    plannedRr: 2.5,
  },
  {
    id: 'short',
    get label(): string {
      return msg('journal.direction.short');
    },
    sample: 4,
    winRatePct: 75.0,
    averageR: 1.25,
    plannedRr: 2.5,
  },
];

export const mockRuleComplianceBreakdown: readonly JournalSeriesPoint[] = [
  {
    get label(): string {
      return msg('journal.compliance.compliant');
    },
    value: 8,
  },
  {
    get label(): string {
      return msg('journal.compliance.partial');
    },
    value: 3,
  },
  {
    get label(): string {
      return msg('journal.compliance.violation');
    },
    value: 2,
  },
  {
    get label(): string {
      return msg('journal.compliance.not-assessed');
    },
    value: 3,
  },
];

export interface MistakeFrequency {
  id: string;
  label: string;
  occurrences: number;
  /** Share of the recorded mistake occurrences, 0..1. */
  share: number;
  lesson: string;
}

export const mockMistakeFrequency: readonly MistakeFrequency[] = [
  {
    id: 'no-written-invalidation',
    get label(): string {
      return msg('journal.noInvalidationLevelWritten');
    },
    occurrences: 5,
    share: 5 / 22,
    get lesson(): string {
      return msg('journal.writeTheLevelBeforeTheEntryNotAfter');
    },
  },
  {
    id: 'early-entry',
    get label(): string {
      return msg('journal.enteredBeforeTheLevelWasReached');
    },
    occurrences: 6,
    share: 6 / 22,
    get lesson(): string {
      return msg('journal.theRetestIsTheTradeAnticipatingItIs');
    },
  },
  {
    id: 'size-too-large',
    get label(): string {
      return msg('journal.positionLargerThanTheWrittenRisk');
    },
    occurrences: 4,
    share: 4 / 22,
    get lesson(): string {
      return msg('journal.sizeIsDerivedFromTheStopDistanceNever');
    },
  },
  {
    id: 'moved-stop',
    get label(): string {
      return msg('journal.stopMovedAwayFromThePlan');
    },
    occurrences: 3,
    share: 3 / 22,
    get lesson(): string {
      return msg('journal.wideningTheStopChangesTheRiskSoIt');
    },
  },
  {
    id: 'late-exit',
    get label(): string {
      return msg('journal.heldPastTheExitPlan');
    },
    occurrences: 2,
    share: 2 / 22,
    get lesson(): string {
      return msg('journal.theExitPlanIsPartOfThePlan');
    },
  },
  {
    id: 'traded-into-news',
    get label(): string {
      return msg('journal.heldThroughAScheduledEvent');
    },
    occurrences: 2,
    share: 2 / 22,
    get lesson(): string {
      return msg('journal.eventRiskIsEitherSizedForOrAvoided');
    },
  },
];

export interface StreakSummary {
  maxWinStreak: number;
  maxLossStreak: number;
  currentKind: 'win' | 'loss' | 'none';
  currentLength: number;
}

export const mockStreaks: StreakSummary = {
  maxWinStreak: 2,
  maxLossStreak: 1,
  currentKind: 'win',
  currentLength: 1,
};

/* Calendar --------------------------------------------------------------- */

export type CalendarDayState = 'win' | 'loss' | 'breakeven' | 'mixed' | 'open' | 'flat';

export const CALENDAR_DAY_STATE_LABEL: Record<CalendarDayState, string> = liveLabels({
  win: 'journal.calendarDayState.win',
  loss: 'journal.calendarDayState.loss',
  breakeven: 'journal.calendarDayState.breakeven',
  mixed: 'journal.calendarDayState.mixed',
  open: 'journal.calendarDayState.open',
  flat: 'journal.calendarDayState.flat',
});

export interface JournalCalendarDay {
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  tradeCount: number;
  /** Net R for the day; `null` when nothing on the day was scored. */
  netR: number | null;
  state: CalendarDayState;
  /** Total planned risk committed on the day, in currency. */
  riskTotal: number;
  compliance: RuleCompliance;
  mainSetupId: string;
  /** 1..10 self-reported emotional read across the day's trades. */
  emotionalScore: number;
  mistakes: readonly string[];
  lesson: string;
  notes: string;
}

/**
 * September 2026. Days with no entry are rendered as an explicit `flat` day
 * rather than as a blank cell, so "no trades" and "not loaded" cannot look alike.
 */
export const mockCalendarDays: readonly JournalCalendarDay[] = [
  {
    date: '2026-09-01',
    tradeCount: 2,
    netR: null,
    state: 'open',
    riskTotal: 1520,
    compliance: 'partial',
    mainSetupId: 'failed-breakout',
    emotionalScore: 6,
    get mistakes(): string[] {
      return [msg('journal.oneRecordStillHasNoExit')];
    },
    get lesson(): string {
      return msg('journal.anUnclosedRecordCannotBeReviewedSoIt');
    },
    get notes(): string {
      return msg('journal.twoPositionsCarriedOverOneWasLeftIncomplete');
    },
  },
  {
    date: '2026-09-03',
    tradeCount: 1,
    netR: -1.2,
    state: 'loss',
    riskTotal: 900,
    compliance: 'not-assessed',
    mainSetupId: 'liquidity-sweep',
    emotionalScore: 5,
    get mistakes(): string[] {
      return [msg('journal.complianceNotAssessed')];
    },
    get lesson(): string {
      return msg('journal.theSweepWasRealTheEntryWasEarly');
    },
    notes: '',
  },
  {
    date: '2026-09-05',
    tradeCount: 1,
    netR: 1.9,
    state: 'win',
    riskTotal: 1350,
    compliance: 'compliant',
    mainSetupId: 'trend-pullback',
    emotionalScore: 7,
    mistakes: [],
    get lesson(): string {
      return msg('journal.waitingForThePullbackIntoTheZoneGave');
    },
    get notes(): string {
      return msg('journal.checklistFullyFollowed');
    },
  },
  {
    date: '2026-09-08',
    tradeCount: 1,
    netR: -0.1,
    state: 'breakeven',
    riskTotal: 410,
    compliance: 'partial',
    mainSetupId: 'gap-continuation',
    emotionalScore: 6,
    get mistakes(): string[] {
      return [msg('journal.exitManagementDrifted')];
    },
    get lesson(): string {
      return msg('journal.aFlatResultAfterAFullStopDistance');
    },
    notes: '',
  },
  {
    date: '2026-09-09',
    tradeCount: 1,
    netR: 2.4,
    state: 'win',
    riskTotal: 650,
    compliance: 'compliant',
    mainSetupId: 'liquidity-sweep',
    emotionalScore: 8,
    mistakes: [],
    get lesson(): string {
      return msg('journal.reclaimInsideTheSameImpulseIsTheConfirmation');
    },
    notes: '',
  },
  {
    date: '2026-09-10',
    tradeCount: 1,
    netR: -0.9,
    state: 'loss',
    riskTotal: 560,
    compliance: 'violation',
    mainSetupId: 'range-reversal',
    emotionalScore: 4,
    get mistakes(): string[] {
      return [
        msg('journal.tradedTheEdgeWithoutARejection'),
        msg('journal.sizedAboveTheWrittenRisk'),
      ];
    },
    get lesson(): string {
      return msg('journal.theRangeEdgeIsALocationNotA');
    },
    get notes(): string {
      return msg('journal.markedAsARuleBreakOnPurpose');
    },
  },
  {
    date: '2026-09-11',
    tradeCount: 1,
    netR: 1.4,
    state: 'win',
    riskTotal: 720,
    compliance: 'compliant',
    mainSetupId: 'failed-breakout',
    emotionalScore: 7,
    mistakes: [],
    get lesson(): string {
      return msg('journal.theFailedPushIntoTheHighWasThe');
    },
    notes: '',
  },
  {
    date: '2026-09-14',
    tradeCount: 1,
    netR: 3.1,
    state: 'win',
    riskTotal: 920,
    compliance: 'compliant',
    mainSetupId: 'liquidity-sweep',
    emotionalScore: 8,
    mistakes: [],
    get lesson(): string {
      return msg('journal.heldTheRunnerToThePlannedLevelInstead');
    },
    notes: '',
  },
  {
    date: '2026-09-15',
    tradeCount: 1,
    netR: -1.6,
    state: 'loss',
    riskTotal: 1500,
    compliance: 'violation',
    mainSetupId: 'breakout-retest',
    emotionalScore: 5,
    get mistakes(): string[] {
      return [msg('journal.stopMovedAwayFromThePlan'), msg('journal.riskExceededTheDailyBudget')];
    },
    get lesson(): string {
      return msg('journal.aWidenedStopIsASecondDecisionThat');
    },
    get notes(): string {
      return msg('journal.theLargestSingleLossOnRecordAndThe');
    },
  },
  {
    date: '2026-09-16',
    tradeCount: 1,
    netR: 2.2,
    state: 'win',
    riskTotal: 780,
    compliance: 'partial',
    mainSetupId: 'trend-pullback',
    emotionalScore: 7,
    get mistakes(): string[] {
      return [msg('journal.entryWasSlightlyEarlyAgainstTheChecklist')];
    },
    get lesson(): string {
      return msg('journal.theChecklistItemThatWasSkippedWasThe');
    },
    notes: '',
  },
  {
    date: '2026-09-17',
    tradeCount: 1,
    netR: 0.03,
    state: 'breakeven',
    riskTotal: 575,
    compliance: 'compliant',
    mainSetupId: 'gap-continuation',
    emotionalScore: 7,
    mistakes: [],
    get lesson(): string {
      return msg('journal.protectingASmallGainIsAValidDecision');
    },
    notes: '',
  },
  {
    date: '2026-09-18',
    tradeCount: 2,
    netR: 0.8,
    state: 'mixed',
    riskTotal: 1270,
    compliance: 'partial',
    mainSetupId: 'range-reversal',
    emotionalScore: 6,
    get mistakes(): string[] {
      return [msg('journal.tradedTheEdgeWithoutARejection')];
    },
    get lesson(): string {
      return msg('journal.theSameSetupProducedALossAndA');
    },
    notes: '',
  },
  {
    date: '2026-09-19',
    tradeCount: 2,
    netR: 1.6,
    state: 'mixed',
    riskTotal: 3225,
    compliance: 'compliant',
    mainSetupId: 'failed-breakout',
    emotionalScore: 7,
    mistakes: [],
    get lesson(): string {
      return msg('journal.theLosingTradeWasACleanPlanExecuted');
    },
    get notes(): string {
      return msg('journal.bestPairOfTheMonthOnProcessNot');
    },
  },
];

/** Every day of September 2026, including the days with no trades. */
export const mockCalendarMonth = { year: 2026, month: 9 } as const;

export function calendarDayByDate(date: string): JournalCalendarDay | undefined {
  return mockCalendarDays.find((day) => day.date === date);
}
