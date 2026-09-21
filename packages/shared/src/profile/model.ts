/**
 * User profile and Trading Context — the domain model.
 *
 * This module is the single definition of what a user has *declared* about
 * themselves. It is deliberately pure: no database, no network, no clock of its
 * own. Everything here is a value and a function of values, so the rules that
 * matter (what is missing, what is stale, what is assumed, what contradicts what)
 * are unit-testable without a server or a driver.
 *
 * It sits on the shared surface because both sides need the same answers: the API
 * rejects contradictions with it, and the Profile surface explains gaps with it.
 * Two implementations of "is this stale?" would eventually disagree, and the
 * version a user sees would then be the wrong one.
 *
 * Three rules, and they are the whole point of the phase:
 *
 *   1. **Nothing is inferred into a fact.** A field carries the source it came
 *      from — `user-stated`, `derived` or `assumed`. A field the user has not
 *      given is `null` with source `assumed` at best, and `missing` when it has
 *      no value at all. We never fill a blank with a convention.
 *   2. **Status is derived, never stored.** `fieldStatus()` computes
 *      missing / assumed / confirmed / stale from the value, the source and the
 *      timestamp. A stored status is a second source of truth that drifts from
 *      the timestamps the moment one is updated without the other.
 *   3. **Confidence is the weakest required field.** Not a mean. A well-sourced
 *      market series cannot raise the confidence of an assumed risk tolerance
 *      (ADR-0041).
 *
 * What this module deliberately does **not** contain: any calculation of position
 * size, exposure, correlation or return, and any recommendation. Those belong to
 * the deterministic engines, and this is a description of inputs, not a source of
 * outputs.
 */

import { z } from 'zod';

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

export const EXPERIENCE_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

/** Mirrors the market-data `AssetClass`, so a preferred market and a bar agree. */
export const ASSET_CLASSES = ['equity', 'fx', 'crypto', 'commodity', 'index'] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

export const TRADING_STYLES = ['scalping', 'day-trading', 'swing', 'position'] as const;
export type TradingStyle = (typeof TRADING_STYLES)[number];

export const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'] as const;
export type ProfileTimeframe = (typeof TIMEFRAMES)[number];

export const LEARNING_GOALS = [
  'risk-management',
  'chart-reading',
  'strategy-development',
  'psychology-discipline',
  'journaling-review',
  'market-structure',
] as const;
export type LearningGoal = (typeof LEARNING_GOALS)[number];

/**
 * A **user-declared** band. The system never assigns one, and `unspecified` is a
 * first-class answer rather than a missing value to be guessed at.
 */
export const RISK_TOLERANCE_BANDS = [
  'capital-preservation',
  'balanced',
  'growth-oriented',
  'unspecified',
] as const;
export type RiskToleranceBand = (typeof RISK_TOLERANCE_BANDS)[number];

export const HORIZON_BANDS = ['intraday', 'days', 'weeks', 'months', 'years'] as const;
export type HorizonBand = (typeof HORIZON_BANDS)[number];

/**
 * Capital is a **band, never an amount**. The product has no reason to hold an
 * exact figure, and a range cannot be mistaken for a balance we could trade.
 */
export const CAPITAL_RANGES = [
  'under-1k',
  '1k-10k',
  '10k-50k',
  '50k-250k',
  'over-250k',
  'prefer-not-to-say',
] as const;
export type CapitalRange = (typeof CAPITAL_RANGES)[number];

/** Where a value came from. `derived` means computed from other user input. */
export const FACT_SOURCES = ['user-stated', 'derived', 'assumed'] as const;
export type FactSource = (typeof FACT_SOURCES)[number];

/**
 * The four states the Agent must be able to tell apart (Phase 5.1 §4.2).
 * Derived from a field, never stored on one.
 */
export const CONTEXT_STATUSES = ['confirmed', 'derived', 'assumed', 'stale', 'missing'] as const;
export type ContextStatus = (typeof CONTEXT_STATUSES)[number];

/* ------------------------------------------------------------------ */
/* Bounds — a profile is user input, so every list is bounded            */
/* ------------------------------------------------------------------ */

export const MAX_INSTRUMENTS = 40;
export const MAX_HOLDINGS = 50;
export const MAX_CONSTRAINTS = 20;
export const MAX_SYMBOL_LENGTH = 24;
export const MAX_CONSTRAINT_LENGTH = 280;
export const MAX_NOTE_LENGTH = 500;

/** Weights are percentages so a holding never needs a quantity or a price. */
export const MIN_WEIGHT_PERCENT = 0.01;
export const MAX_WEIGHT_PERCENT = 100;
export const WEIGHT_SUM_TOLERANCE = 0.5;

/* ------------------------------------------------------------------ */
/* Statements the system must refuse                                   */
/* ------------------------------------------------------------------ */

/**
 * A declared preference is *input*, and an input is not a command. A profile
 * constraint that reads like an execution instruction ("buy 100 shares when…")
 * is refused rather than stored, because storing it would put order-shaped text
 * into a field the Agent reads.
 *
 * This mirrors `HARDLINE_OPERATION_PATTERN` and `HARDLINE_JOB_PATTERN`: the same
 * words are refused in operation ids, job kinds and here — with one deliberate
 * difference. Those two patterns match an *identifier* (`place-order`, `live_trading`),
 * so their separators are `[._-]`. A constraint is **prose**, and `"place order 100
 * shares"` is the same instruction written the way a person writes it. The
 * separator class here therefore includes whitespace: matching only the
 * identifier spelling would pass exactly the sentences this check exists for.
 */
export const HARDLINE_CONSTRAINT_PATTERN =
  /(place[\s._-]?order|buy[\s._-]?\d|sell[\s._-]?\d|execute|broker|live[\s._-]?trad|withdraw|deposit)/i;

/* ------------------------------------------------------------------ */
/* Field shape                                                         */
/* ------------------------------------------------------------------ */

/**
 * One declared field. `value === null` means "the user has not told us", which is
 * a legitimate and important state — not an error and not something to fill.
 */
export interface ContextField<T> {
  value: T | null;
  source: FactSource;
  /** ISO-8601, when the fact was observed. Required for anything user-stated. */
  observedAt: string | null;
  note?: string;
}

/**
 * A holding is **allocation only**: a symbol and its share of the portfolio.
 * There is deliberately no quantity, no cost basis, no entry price and no
 * account identifier — nothing that would turn a description of a portfolio into
 * a financial record we would then have to protect.
 */
export interface Holding {
  symbol: string;
  assetClass: AssetClass;
  weightPercent: number;
}

/** A declared preference or boundary the user has stated. */
export interface Constraint {
  id: string;
  statement: string;
  source: FactSource;
}

/**
 * The versioned Trading Context: everything the Agent may treat as given.
 *
 * It is append-only by construction. `version` increases with every edit and a
 * previous version is never rewritten, so the context the Agent answered from is
 * always recoverable (Phase 5.1 §3.3 depends on this).
 */
export interface TradingContext {
  version: number;
  experienceLevel: ContextField<ExperienceLevel>;
  markets: ContextField<AssetClass[]>;
  instruments: ContextField<string[]>;
  tradingStyle: ContextField<TradingStyle>;
  timeframe: ContextField<ProfileTimeframe>;
  learningGoals: ContextField<LearningGoal[]>;
  capitalRange: ContextField<CapitalRange>;
  riskTolerance: ContextField<RiskToleranceBand>;
  horizon: ContextField<HorizonBand>;
  holdings: ContextField<Holding[]>;
  constraints: ContextField<Constraint[]>;
  createdAt: string;
}

/** The profile record itself: account-level declarations plus the current context. */
export interface UserProfile {
  userId: string;
  displayName: string;
  timezone: string;
  /** Set once at sign-up and editable; the context mirrors it as a field. */
  experienceLevel: ExperienceLevel;
  createdAt: string;
  updatedAt: string;
  context: TradingContext;
}

/* ------------------------------------------------------------------ */
/* Schemas                                                             */
/* ------------------------------------------------------------------ */

const isoDate = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'must be an ISO-8601 date' });

const sourceSchema = z.enum(FACT_SOURCES);
const noteSchema = z.string().max(MAX_NOTE_LENGTH).optional();

function contextFieldSchema<T extends z.ZodTypeAny>(value: T) {
  return z.strictObject({
    value: value.nullable(),
    source: sourceSchema,
    observedAt: isoDate.nullable(),
    note: noteSchema,
  });
}

export const SYMBOL_PATTERN = /^[A-Za-z0-9.:/_-]+$/;

export const holdingSchema = z.strictObject({
  symbol: z.string().min(1).max(MAX_SYMBOL_LENGTH).regex(SYMBOL_PATTERN, 'invalid symbol'),
  assetClass: z.enum(ASSET_CLASSES),
  weightPercent: z.number().min(MIN_WEIGHT_PERCENT).max(MAX_WEIGHT_PERCENT),
});

export const constraintSchema = z.strictObject({
  id: z.string().min(1).max(64),
  statement: z
    .string()
    .min(1)
    .max(MAX_CONSTRAINT_LENGTH)
    .refine((value) => !HARDLINE_CONSTRAINT_PATTERN.test(value), {
      message:
        'must be a preference, not an instruction to execute a trade; Master Trade does not place orders',
    }),
  source: sourceSchema,
});

export const tradingContextSchema = z.strictObject({
  version: z.number().int().min(1),
  experienceLevel: contextFieldSchema(z.enum(EXPERIENCE_LEVELS)),
  markets: contextFieldSchema(z.array(z.enum(ASSET_CLASSES))),
  instruments: contextFieldSchema(
    z.array(z.string().min(1).max(MAX_SYMBOL_LENGTH).regex(SYMBOL_PATTERN, 'invalid symbol')),
  ),
  tradingStyle: contextFieldSchema(z.enum(TRADING_STYLES)),
  timeframe: contextFieldSchema(z.enum(TIMEFRAMES)),
  learningGoals: contextFieldSchema(z.array(z.enum(LEARNING_GOALS))),
  capitalRange: contextFieldSchema(z.enum(CAPITAL_RANGES)),
  riskTolerance: contextFieldSchema(z.enum(RISK_TOLERANCE_BANDS)),
  horizon: contextFieldSchema(z.enum(HORIZON_BANDS)),
  holdings: contextFieldSchema(z.array(holdingSchema)),
  constraints: contextFieldSchema(z.array(constraintSchema)),
  createdAt: isoDate,
});

/* ------------------------------------------------------------------ */
/* Freshness                                                           */
/* ------------------------------------------------------------------ */

/**
 * How long each field stays current. A property of the **kind** of input, not a
 * global TTL: a holdings allocation is stale within a week, a learning goal is
 * not stale for months.
 *
 * `null` means the field does not age in a way the product should act on.
 */
export const FRESHNESS_DAYS: Readonly<Record<FieldKey, number | null>> = {
  experienceLevel: null,
  markets: 365,
  instruments: 90,
  tradingStyle: null,
  timeframe: 180,
  learningGoals: null,
  capitalRange: 180,
  riskTolerance: 180,
  horizon: 365,
  holdings: 30,
  constraints: null,
};

export const FIELD_KEYS = [
  'experienceLevel',
  'markets',
  'instruments',
  'tradingStyle',
  'timeframe',
  'learningGoals',
  'capitalRange',
  'riskTolerance',
  'horizon',
  'holdings',
  'constraints',
] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];

/**
 * Fields a **complete** profile must have. `holdings` is absent on purpose: a
 * user may decline to describe a portfolio, and that must not mark them
 * incomplete. `constraints` is similarly optional.
 */
export const REQUIRED_FIELDS: readonly FieldKey[] = [
  'experienceLevel',
  'markets',
  'tradingStyle',
  'timeframe',
  'learningGoals',
  'capitalRange',
  'riskTolerance',
  'horizon',
];

export const FIELD_LABELS: Readonly<Record<FieldKey, string>> = {
  experienceLevel: 'Experience level',
  markets: 'Preferred markets',
  instruments: 'Preferred instruments',
  tradingStyle: 'Trading style',
  timeframe: 'Primary timeframe',
  learningGoals: 'Learning goals',
  capitalRange: 'Capital range',
  riskTolerance: 'Risk tolerance',
  horizon: 'Horizon',
  holdings: 'Existing holdings',
  constraints: 'Constraints and preferences',
};

const MS_PER_DAY = 86_400_000;

/** Age in whole days, or `null` when there is no observation time. */
export function ageInDays(observedAt: string | null, now: number): number | null {
  if (observedAt === null) return null;
  const parsed = Date.parse(observedAt);
  if (Number.isNaN(parsed)) return null;
  return Math.max(0, Math.floor((now - parsed) / MS_PER_DAY));
}

/**
 * The status of one field. This is the function the Agent asks, and there is only
 * one of it.
 *
 * A value with `source: 'assumed'` is **never** `confirmed`, even when it is
 * fresh, and a `user-stated` value with no timestamp is treated as `assumed`
 * rather than trusted — an undated claim cannot be assessed for recency, and
 * assuming it is current is exactly the silent-default the phase forbids.
 */
export function fieldStatus<T>(field: ContextField<T>, key: FieldKey, now: number): ContextStatus {
  if (field.value === null) return 'missing';
  if (field.source === 'assumed') return 'assumed';
  if (field.observedAt === null) return 'assumed';
  const limit = FRESHNESS_DAYS[key];
  const age = ageInDays(field.observedAt, now);
  if (limit !== null && age !== null && age > limit) return 'stale';
  return field.source === 'derived' ? 'derived' : 'confirmed';
}

/* ------------------------------------------------------------------ */
/* Contradictions                                                      */
/* ------------------------------------------------------------------ */

export interface ContextIssue {
  /** `reject` is a validation failure; `question` is surfaced as a prompt. */
  severity: 'reject' | 'question';
  key: FieldKey;
  problem: string;
}

/**
 * Internal inconsistencies, found by logic rather than by judgement.
 *
 * `reject` issues are impossible states and the API refuses them. `question`
 * issues are legitimate-but-worth-confirming combinations the product must
 * **ask about** rather than silently resolve (ADR-0041 §5, ADR-0042 §2). Nothing
 * here says a choice is unwise — only that two declarations do not fit together,
 * and the user is the one who knows which is current.
 */
export function detectContradictions(context: TradingContext): ContextIssue[] {
  const issues: ContextIssue[] = [];

  /* ---- holdings: an impossible allocation ---- */
  const holdings = context.holdings.value ?? [];
  const total = holdings.reduce((sum, holding) => sum + holding.weightPercent, 0);
  if (holdings.length > 0 && total > MAX_WEIGHT_PERCENT + WEIGHT_SUM_TOLERANCE) {
    issues.push({
      severity: 'reject',
      key: 'holdings',
      problem: `holding weights total ${round2(total)}%, which is more than a whole portfolio`,
    });
  }
  const seen = new Set<string>();
  for (const holding of holdings) {
    const symbol = holding.symbol.toUpperCase();
    if (seen.has(symbol)) {
      issues.push({
        severity: 'reject',
        key: 'holdings',
        problem: `duplicate holding for ${holding.symbol}; combine the weights into one row`,
      });
    }
    seen.add(symbol);
  }

  /* ---- a declared instrument that is not in a declared market ---- */
  const markets = context.markets.value;
  const instruments = context.instruments.value ?? [];
  if (markets !== null && markets.length > 0 && instruments.length > 0 && markets.length === 1) {
    // Only a prompt: a symbol's asset class is not derivable from its text, so we
    // ask instead of asserting a mismatch.
    issues.push({
      severity: 'question',
      key: 'instruments',
      problem: `you listed one preferred market (${markets[0]}) and ${instruments.length} instruments — confirm every instrument belongs to that market`,
    });
  }

  /* ---- style and timeframe that cannot coexist ---- */
  const style = context.tradingStyle.value;
  const timeframe = context.timeframe.value;
  if (style === 'scalping' && (timeframe === '1d' || timeframe === '1w')) {
    issues.push({
      severity: 'question',
      key: 'timeframe',
      problem: `scalping is usually worked below a daily bar, but the primary timeframe is ${timeframe} — which one is current?`,
    });
  }
  if (style === 'position' && (timeframe === '1m' || timeframe === '5m')) {
    issues.push({
      severity: 'question',
      key: 'timeframe',
      problem: `position trading is usually worked above an intraday bar, but the primary timeframe is ${timeframe} — which one is current?`,
    });
  }

  /* ---- horizon and timeframe that cannot coexist ---- */
  const horizon = context.horizon.value;
  if (horizon === 'intraday' && (timeframe === '1d' || timeframe === '1w')) {
    issues.push({
      severity: 'reject',
      key: 'horizon',
      problem: `an intraday horizon cannot be worked on a ${timeframe} primary timeframe`,
    });
  }
  if (horizon === 'years' && (timeframe === '1m' || timeframe === '5m')) {
    issues.push({
      severity: 'question',
      key: 'horizon',
      problem: `a multi-year horizon with a ${timeframe} primary timeframe — confirm the horizon is current`,
    });
  }

  /* ---- a held instrument the user has not listed as preferred ---- */
  if (holdings.length > 0 && instruments.length > 0) {
    const listed = new Set(instruments.map((symbol) => symbol.toUpperCase()));
    const unlisted = holdings
      .map((holding) => holding.symbol.toUpperCase())
      .filter((symbol) => !listed.has(symbol));
    if (unlisted.length > 0) {
      issues.push({
        severity: 'question',
        key: 'instruments',
        problem: `${unlisted.length} held instrument(s) are not in your preferred list: ${unlisted.slice(0, 5).join(', ')}`,
      });
    }
  }

  /* ---- constraints that are instructions ---- */
  for (const constraint of context.constraints.value ?? []) {
    if (HARDLINE_CONSTRAINT_PATTERN.test(constraint.statement)) {
      issues.push({
        severity: 'reject',
        key: 'constraints',
        problem: `constraint "${constraint.statement.slice(0, 60)}" reads as an instruction to trade; Master Trade does not place orders`,
      });
    }
  }

  /* ---- a stated fact with no observation time ---- */
  for (const key of FIELD_KEYS) {
    const field = context[key] as ContextField<unknown>;
    if (field.value !== null && field.source === 'user-stated' && field.observedAt === null) {
      issues.push({
        severity: 'reject',
        key,
        problem: `${FIELD_LABELS[key]} is marked user-stated but has no observation time`,
      });
    }
  }

  return issues;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/* ------------------------------------------------------------------ */
/* Assessment                                                          */
/* ------------------------------------------------------------------ */

export interface FieldAssessment {
  key: FieldKey;
  label: string;
  status: ContextStatus;
  source: FactSource;
  ageDays: number | null;
  required: boolean;
}

export interface ContextAssessment {
  fields: readonly FieldAssessment[];
  /** Percentage of *required* fields that carry a usable value. */
  completionPercent: number;
  complete: boolean;
  /** Required fields with no value, or whose value is only an assumption. */
  gaps: readonly FieldKey[];
  /** Required fields whose value has aged out of its freshness window. */
  stale: readonly FieldKey[];
  issues: readonly ContextIssue[];
  /**
   * The weakest required field's status. Never an average — a strong input must
   * not be able to hide a weak one (ADR-0041).
   */
  weakest: ContextStatus;
}

const STATUS_RANK: Readonly<Record<ContextStatus, number>> = {
  confirmed: 5,
  derived: 4,
  stale: 3,
  assumed: 2,
  missing: 1,
};

/** Evaluate every field and summarise the context. Pure, and the only summariser. */
export function assessContext(context: TradingContext, now: number): ContextAssessment {
  const fields: FieldAssessment[] = FIELD_KEYS.map((key) => {
    const field = context[key] as ContextField<unknown>;
    return {
      key,
      label: FIELD_LABELS[key],
      status: fieldStatus(field, key, now),
      source: field.source,
      ageDays: ageInDays(field.observedAt, now),
      required: REQUIRED_FIELDS.includes(key),
    };
  });

  const required = fields.filter((field) => field.required);
  const usable = required.filter(
    (field) => field.status !== 'missing' && field.status !== 'assumed',
  );
  const gaps = required
    .filter((field) => field.status === 'missing' || field.status === 'assumed')
    .map((field) => field.key);
  const stale = required.filter((field) => field.status === 'stale').map((field) => field.key);

  const weakest = required.reduce<ContextStatus>(
    (worst, field) => (STATUS_RANK[field.status] < STATUS_RANK[worst] ? field.status : worst),
    'confirmed',
  );

  return {
    fields,
    completionPercent:
      required.length === 0 ? 100 : Math.round((usable.length / required.length) * 100),
    complete: gaps.length === 0 && stale.length === 0,
    gaps,
    stale,
    issues: detectContradictions(context),
    weakest,
  };
}

/**
 * Profile-level completion, including the account fields the context mirrors.
 * Reported as a percentage plus the named gaps, never as a score alone — a number
 * without its missing list cannot be acted on.
 */
export function profileCompletion(profile: UserProfile, now: number): ContextAssessment {
  return assessContext(profile.context, now);
}

/* ------------------------------------------------------------------ */
/* Questions                                                           */
/* ------------------------------------------------------------------ */

/**
 * The clarifying question for a field (ADR-0041 L2).
 *
 * Kept beside the vocabulary so a new field cannot be added without a question:
 * the map is exhaustive over `FieldKey`, so TypeScript fails the build if one is
 * missing.
 */
export const FIELD_QUESTIONS: Readonly<Record<FieldKey, string>> = {
  experienceLevel: 'How much trading experience would you say you have?',
  markets: 'Which markets do you mainly work in?',
  instruments: 'Which instruments do you watch most often?',
  tradingStyle: 'How would you describe your trading style?',
  timeframe: 'Which timeframe do you primarily work from?',
  learningGoals: 'What would you most like to get better at?',
  capitalRange: 'Which band does your trading capital fall into?',
  riskTolerance: 'Which of these describes how much drawdown you are prepared to accept?',
  horizon: 'Over what horizon do you usually hold a position?',
  holdings: 'Would you like to describe your current allocation, by percentage?',
  constraints: 'Are there constraints or preferences I should respect?',
};

/**
 * The prompts for an assessment: what to ask about, and why it is being asked.
 * `stale` and `assumed` read differently from `missing` — they say *why* an
 * answer is being re-requested, so the question does not look like a memory
 * failure.
 */
export interface ClarifyingPrompt {
  key: FieldKey;
  label: string;
  question: string;
  reason: 'missing' | 'assumed' | 'stale';
}

export function clarifyingPrompts(assessment: ContextAssessment): ClarifyingPrompt[] {
  const prompts: ClarifyingPrompt[] = [];
  for (const field of assessment.fields) {
    if (!field.required) continue;
    if (field.status === 'missing' || field.status === 'assumed') {
      prompts.push({
        key: field.key,
        label: field.label,
        question: FIELD_QUESTIONS[field.key],
        reason: field.status,
      });
    } else if (field.status === 'stale') {
      prompts.push({
        key: field.key,
        label: field.label,
        question: `Is this still current: ${field.label.toLowerCase()}?`,
        reason: 'stale',
      });
    }
  }
  return prompts;
}

/* ------------------------------------------------------------------ */
/* Defaults                                                            */
/* ------------------------------------------------------------------ */

/**
 * An empty declared field. `source` is `assumed` and `value` is `null`: an empty
 * profile is not a set of defaults, it is a list of questions.
 */
export function emptyField<T>(): ContextField<T> {
  return { value: null, source: 'assumed', observedAt: null };
}

/**
 * A field the user has just given us. The timestamp is supplied by the caller —
 * never taken from a clock in this module — so a test can place a fact in the
 * past and verify that it ages out.
 */
export function statedField<T>(value: T, observedAt: string, note?: string): ContextField<T> {
  return note === undefined
    ? { value, source: 'user-stated', observedAt }
    : { value, source: 'user-stated', observedAt, note };
}

export function derivedField<T>(value: T, observedAt: string): ContextField<T> {
  return { value, source: 'derived', observedAt };
}

/** A context with every field empty, at version 1. */
export function emptyContext(createdAt: string): TradingContext {
  return {
    version: 1,
    experienceLevel: emptyField(),
    markets: emptyField(),
    instruments: emptyField(),
    tradingStyle: emptyField(),
    timeframe: emptyField(),
    learningGoals: emptyField(),
    capitalRange: emptyField(),
    riskTolerance: emptyField(),
    horizon: emptyField(),
    holdings: emptyField(),
    constraints: emptyField(),
    createdAt,
  };
}
