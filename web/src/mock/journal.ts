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

export const JOURNAL_PREVIEW_NOTICE =
  'Interface preview — illustrative journal data. No journal store is connected in this phase, so the trades, screenshots and statistics below are layout examples, not your records and not measured performance.';

export const JOURNAL_METHOD_NOTE =
  'The journal is a record, not a scoreboard. A rate without its sample size is a rumour, so sample size is shown beside every rate, and an unrecorded trade stays unrecorded.';

export const JOURNAL_STAT_NOTE =
  'Every headline figure is an illustrative constant laid out by hand. Real values will come from deterministic journal analytics in the trading engine, never from the model.';

export const JOURNAL_ATTACHMENT_NOTE =
  'Attachment metadata only — no image files are stored in this phase, so each preview is a placeholder drawn from the record.';

export const AI_REVIEW_NOTICE =
  'No model provider is connected to the journal in this phase. These panels show the states the review surface must handle; none of them contains a real review, and the completed state is a labelled layout example.';

/* Vocabulary ------------------------------------------------------------- */

export type TradeMarket = 'futures' | 'forex' | 'equities' | 'crypto';

export const MARKET_LABEL: Record<TradeMarket, string> = {
  futures: 'Futures',
  forex: 'Forex',
  equities: 'Equities',
  crypto: 'Crypto',
};

export type TradeDirection = 'long' | 'short';

export const DIRECTION_LABEL: Record<TradeDirection, string> = {
  long: 'Long',
  short: 'Short',
};

export type TradingSession = 'asia' | 'london' | 'overlap' | 'new-york';

export const SESSION_LABEL: Record<TradingSession, string> = {
  asia: 'Asia',
  london: 'London',
  overlap: 'London / New York overlap',
  'new-york': 'New York',
};

export type TradeStatus = 'closed' | 'open' | 'incomplete' | 'archived';

export const STATUS_LABEL: Record<TradeStatus, string> = {
  closed: 'Closed',
  open: 'Open',
  incomplete: 'Incomplete',
  archived: 'Archived',
};

/** `pending` is the only honest result for a trade that has not been scored. */
export type TradeResult = 'win' | 'loss' | 'breakeven' | 'pending';

export const RESULT_LABEL: Record<TradeResult, string> = {
  win: 'Win',
  loss: 'Loss',
  breakeven: 'Breakeven',
  pending: 'Not scored',
};

export type RuleCompliance = 'compliant' | 'partial' | 'violation' | 'not-assessed';

export const COMPLIANCE_LABEL: Record<RuleCompliance, string> = {
  compliant: 'Compliant',
  partial: 'Partial',
  violation: 'Rule broken',
  'not-assessed': 'Not assessed',
};

export const COMPLIANCE_EXPLANATION: Record<RuleCompliance, string> = {
  compliant: 'Every rule on the pre-trade checklist was followed.',
  partial: 'Some rules were followed; at least one was not.',
  violation: 'A rule was broken deliberately or the plan was overridden mid-trade.',
  'not-assessed': 'The trade has not been reviewed against the checklist yet.',
};

export type ReviewState = 'not-required' | 'required' | 'reviewed';

export const REVIEW_STATE_LABEL: Record<ReviewState, string> = {
  'not-required': 'Review not required',
  required: 'Review required',
  reviewed: 'Reviewed',
};

export type AiReviewState = 'not-available' | 'pending' | 'processing' | 'completed' | 'failed';

export const AI_REVIEW_STATE_LABEL: Record<AiReviewState, string> = {
  'not-available': 'Not available',
  pending: 'Pending',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
};

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

export const EMOTIONAL_STATE_LABEL: Record<EmotionalState, string> = {
  calm: 'Calm',
  focused: 'Focused',
  confident: 'Confident',
  anxious: 'Anxious',
  fearful: 'Fearful',
  greedy: 'Greedy',
  impulsive: 'Impulsive',
  hesitant: 'Hesitant',
  frustrated: 'Frustrated',
  detached: 'Detached',
};

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

export const SETUP_FAMILY_LABEL: Record<SetupFamily, string> = {
  continuation: 'Continuation',
  reversal: 'Reversal',
  range: 'Range',
};

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
    label: 'Breakout retest',
    family: 'continuation',
    premise: 'A level breaks, price returns to it, and the retest holds before continuation.',
  },
  {
    id: 'trend-pullback',
    label: 'Trend pullback',
    family: 'continuation',
    premise: 'An established trend pulls into a zone of prior demand without breaking structure.',
  },
  {
    id: 'failed-breakout',
    label: 'Failed breakout',
    family: 'reversal',
    premise: 'A breakout attempt fails and price re-enters the range it left.',
  },
  {
    id: 'liquidity-sweep',
    label: 'Liquidity sweep',
    family: 'reversal',
    premise: 'An obvious high or low is taken and reclaimed within the same impulse.',
  },
  {
    id: 'range-reversal',
    label: 'Range reversal',
    family: 'range',
    premise: 'Price reaches the edge of a defined range and rejects it.',
  },
  {
    id: 'gap-continuation',
    label: 'Gap continuation',
    family: 'continuation',
    premise: 'A gap holds its opening range instead of filling.',
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
  { id: 'bias', label: 'Higher-timeframe bias written before entry' },
  { id: 'level', label: 'Trade is taken from a pre-marked level' },
  { id: 'invalidation', label: 'Invalidation level written down before entry' },
  { id: 'risk', label: 'Risk is within the daily budget' },
  { id: 'size', label: 'Position size matches the written risk' },
  { id: 'session', label: 'The setup is valid for this trading session' },
  { id: 'news', label: 'No high-impact event inside the holding window' },
  { id: 'reward', label: 'Planned reward is at least twice the risk' },
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

export const ATTACHMENT_KIND_LABEL: Record<AttachmentKind, string> = {
  entry: 'Entry screenshot',
  exit: 'Exit screenshot',
  markup: 'Chart markup',
  analysis: 'Analysis image',
};

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

export const TRADE_EVENT_LABEL: Record<TradeEventKind, string> = {
  recorded: 'Trade recorded',
  entry: 'Entry filled',
  management: 'Plan adjusted',
  exit: 'Position closed',
  review: 'Review written',
  edit: 'Record edited',
  assessment: 'Compliance assessed',
};

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

export const TRADE_RANGE_LABEL: Record<TradeRange, string> = {
  today: 'Today',
  'this-week': 'This week',
  'this-month': 'This month',
  'last-30': 'Last 30 days',
  'last-90': 'Last 90 days',
  custom: 'Custom range',
};

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
    label: 'Total trades',
    value: '16',
    unit: 'trades',
    comparison: '14 scored · 2 still open',
    basis: 'All records in the current view',
    tone: 'neutral',
    hint: 'The denominator for every other figure on this page.',
  },
  {
    id: 'win-rate',
    label: 'Win rate',
    value: '50.0',
    unit: '%',
    comparison: '+4.2 pts vs previous 14',
    basis: '7 wins in 14 scored trades',
    tone: 'positive',
    hint: 'A rate is only meaningful with its sample attached.',
  },
  {
    id: 'average-r',
    label: 'Average R multiple',
    value: '+0.69',
    unit: 'R',
    comparison: '+0.21R vs previous 14',
    basis: '14 scored trades',
    tone: 'positive',
  },
  {
    id: 'profit-factor',
    label: 'Profit factor',
    value: '2.67',
    comparison: '+0.44 vs previous 14',
    basis: 'Gross win 15.43R ÷ gross loss 5.77R',
    tone: 'positive',
  },
  {
    id: 'expectancy',
    label: 'Expectancy',
    value: '+0.69',
    unit: 'R / trade',
    comparison: 'Above the 0.25R study threshold',
    basis: '14 scored trades',
    tone: 'positive',
    hint: 'The one figure that survives a small sample best — and it still needs one.',
  },
  {
    id: 'max-drawdown',
    label: 'Maximum drawdown',
    value: '−1.6',
    unit: 'R',
    comparison: 'Worst peak-to-trough on the R curve',
    basis: 'R curve across 14 scored trades',
    tone: 'warning',
  },
  {
    id: 'net-performance',
    label: 'Net performance',
    value: '+9.63',
    unit: 'R',
    comparison: 'Same as the last point on the equity curve',
    basis: 'Sum of scored R, net of the curve',
    tone: 'positive',
  },
  {
    id: 'average-risk',
    label: 'Average risk per trade',
    value: '861',
    unit: 'per trade',
    comparison: 'Stated in account currency',
    basis: '16 records, planned risk',
    tone: 'neutral',
    hint: 'Risk consistency matters more than any single result.',
  },
  {
    id: 'rule-compliance',
    label: 'Rule compliance',
    value: '61.5',
    unit: '%',
    comparison: '8 compliant of 13 assessed',
    basis: '3 trades not assessed yet',
    tone: 'warning',
    hint: 'The 3 unassessed trades are excluded rather than counted as compliant.',
  },
  {
    id: 'average-rr',
    label: 'Average reward-to-risk',
    value: '2.5',
    unit: ': 1',
    comparison: 'Planned, before entry',
    basis: 'Planned levels of 16 records',
    tone: 'neutral',
    hint: 'Planned, not achieved: realised R is reported separately.',
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
  title: 'Equity curve',
  description: 'Cumulative R after each scored trade, oldest first.',
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
  title: 'Drawdown',
  description: 'Distance below the high-water mark of the R curve. Zero means a new high.',
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
  title: 'Cumulative R performance',
  description:
    'The same curve as equity, read as one number per trade rather than a running total.',
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
  title: 'Expectancy over time',
  description:
    'Running average R as each new scored trade lands — shown to move, and to be ignored early.',
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
  title: 'Risk consistency',
  description: 'Planned risk per trade against the account budget. Flat is the goal, not high.',
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
  title: 'Win / loss distribution',
  description: 'Every record accounted for, including the two that are not scored yet.',
  bars: true,
  points: [
    { label: 'Wins', value: 7 },
    { label: 'Losses', value: 5 },
    { label: 'Breakeven', value: 2 },
    { label: 'Open', value: 1 },
    { label: 'Incomplete', value: 1 },
  ],
  unit: 'trades',
};

export const mockAverageWinLoss: JournalSeries = {
  id: 'average-win-loss',
  title: 'Average win vs average loss',
  description: 'The ratio that makes a below-50% win rate survivable.',
  bars: true,
  points: [
    { label: 'Average win', value: 2.2 },
    { label: 'Average loss', value: -1.15 },
  ],
  unit: 'R',
};

export const mockTradeDuration: JournalSeries = {
  id: 'trade-duration',
  title: 'Trade duration',
  description: 'Holding time across the 14 scored trades.',
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
    label: 'Breakout retest',
    sample: 2,
    winRatePct: 50.0,
    averageR: 0.5,
    plannedRr: 2.5,
  },
  {
    id: 'failed-breakout',
    label: 'Failed breakout',
    sample: 2,
    winRatePct: 50.0,
    averageR: 0.2,
    plannedRr: 2.5,
  },
  {
    id: 'trend-pullback',
    label: 'Trend pullback',
    sample: 3,
    winRatePct: 100.0,
    averageR: 1.97,
    plannedRr: 2.5,
  },
  {
    id: 'range-reversal',
    label: 'Range reversal',
    sample: 2,
    winRatePct: 0.0,
    averageR: -0.95,
    plannedRr: 2.5,
  },
  {
    id: 'gap-continuation',
    label: 'Gap continuation',
    sample: 2,
    winRatePct: 0.0,
    averageR: -0.04,
    plannedRr: 2.5,
  },
  {
    id: 'liquidity-sweep',
    label: 'Liquidity sweep',
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
    label: 'New York',
    sample: 5,
    winRatePct: 40.0,
    averageR: 0.59,
    plannedRr: 2.5,
  },
  { id: 'london', label: 'London', sample: 5, winRatePct: 80.0, averageR: 1.56, plannedRr: 2.5 },
  {
    id: 'overlap',
    label: 'London / New York overlap',
    sample: 2,
    winRatePct: 50.0,
    averageR: 0.4,
    plannedRr: 2.5,
  },
  { id: 'asia', label: 'Asia', sample: 2, winRatePct: 0.0, averageR: -0.95, plannedRr: 2.5 },
];

export const mockDirectionPerformance: readonly BreakdownRow[] = [
  { id: 'long', label: 'Long', sample: 10, winRatePct: 50.0, averageR: 0.46, plannedRr: 2.5 },
  { id: 'short', label: 'Short', sample: 4, winRatePct: 75.0, averageR: 1.25, plannedRr: 2.5 },
];

export const mockRuleComplianceBreakdown: readonly JournalSeriesPoint[] = [
  { label: 'Compliant', value: 8 },
  { label: 'Partial', value: 3 },
  { label: 'Rule broken', value: 2 },
  { label: 'Not assessed', value: 3 },
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
    label: 'No invalidation level written',
    occurrences: 5,
    share: 5 / 22,
    lesson: 'Write the level before the entry, not after the drawdown.',
  },
  {
    id: 'early-entry',
    label: 'Entered before the level was reached',
    occurrences: 6,
    share: 6 / 22,
    lesson: 'The retest is the trade. Anticipating it is a different, worse trade.',
  },
  {
    id: 'size-too-large',
    label: 'Position larger than the written risk',
    occurrences: 4,
    share: 4 / 22,
    lesson: 'Size is derived from the stop distance, never from conviction.',
  },
  {
    id: 'moved-stop',
    label: 'Stop moved away from the plan',
    occurrences: 3,
    share: 3 / 22,
    lesson: 'Widening the stop changes the risk, so it changes the trade.',
  },
  {
    id: 'late-exit',
    label: 'Held past the exit plan',
    occurrences: 2,
    share: 2 / 22,
    lesson: 'The exit plan is part of the plan.',
  },
  {
    id: 'traded-into-news',
    label: 'Held through a scheduled event',
    occurrences: 2,
    share: 2 / 22,
    lesson: 'Event risk is either sized for or avoided.',
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

export const CALENDAR_DAY_STATE_LABEL: Record<CalendarDayState, string> = {
  win: 'Winning day',
  loss: 'Losing day',
  breakeven: 'Flat day',
  mixed: 'Mixed day',
  open: 'Open position',
  flat: 'No trades',
};

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
    mistakes: ['One record still has no exit'],
    lesson: 'An unclosed record cannot be reviewed, so it cannot teach anything yet.',
    notes: 'Two positions carried over; one was left incomplete at the end of the session.',
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
    mistakes: ['Compliance not assessed'],
    lesson: 'The sweep was real; the entry was early.',
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
    lesson: 'Waiting for the pullback into the zone gave a stop that made sense.',
    notes: 'Checklist fully followed.',
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
    mistakes: ['Exit management drifted'],
    lesson: 'A flat result after a full stop distance is a managed loss, not a wasted trade.',
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
    lesson: 'Reclaim inside the same impulse is the confirmation.',
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
    mistakes: ['Traded the edge without a rejection', 'Sized above the written risk'],
    lesson: 'The range edge is a location, not a signal.',
    notes: 'Marked as a rule break on purpose.',
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
    lesson: 'The failed push into the high was the whole trade.',
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
    lesson: 'Held the runner to the planned level instead of the first reaction.',
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
    mistakes: ['Stop moved away from the plan', 'Risk exceeded the daily budget'],
    lesson: 'A widened stop is a second decision that was never planned.',
    notes: 'The largest single loss on record, and the most instructive.',
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
    mistakes: ['Entry was slightly early against the checklist'],
    lesson: 'The checklist item that was skipped was the one that would have improved the price.',
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
    lesson: 'Protecting a small gain is a valid decision, and it is not a loss.',
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
    mistakes: ['Traded the edge without a rejection'],
    lesson:
      'The same setup produced a loss and a win on the same day; the process differed, not the setup.',
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
    lesson: 'The losing trade was a clean plan executed correctly. It still counts as compliant.',
    notes: 'Best pair of the month on process, not on outcome.',
  },
];

/** Every day of September 2026, including the days with no trades. */
export const mockCalendarMonth = { year: 2026, month: 9 } as const;

export function calendarDayByDate(date: string): JournalCalendarDay | undefined {
  return mockCalendarDays.find((day) => day.date === date);
}
