/**
 * Portfolio Intelligence — the domain model.
 *
 * This module answers one question: **what has the user told us they hold, and what
 * can honestly be computed from it?** It is the layer the product vision (§3.2) and
 * ADR-0042 asked for: a portfolio is *described*, never inferred, and every figure
 * that comes out of it carries the evidence it rests on.
 *
 * It is pure. No clock of its own, no database, no network, no model — every
 * function takes `now` and a document and returns a value. The arithmetic itself
 * lives in `packages/trading-engine` (a package whose determinism a test enforces);
 * this module owns the *shape*, the *vocabulary* and the *findings*, so the API, the
 * engine and the Portfolio surface cannot disagree about what a gate means.
 *
 * Five rules, and they are the whole point of the phase:
 *
 *   1. **Nothing is invented.** A price we do not have is `null`, and a figure that
 *      needs it is `null` too. There is no "assume the last close", no default
 *      currency conversion and no sector mapping guessed from a ticker.
 *   2. **Two descriptions, never blended.** A portfolio can be described by
 *      **weights** ("30% equities") or by **quantity and price** ("10 shares at
 *      180"). Those are two different populations of positions, and a concentration
 *      figure computed over a mixture of them would be a number nobody could check.
 *      So the engine produces **two weight sets**, each stating how many positions
 *      it covers. It never averages them together.
 *   3. **A share requires the whole.** A position's share of a portfolio is only
 *      meaningful when the whole portfolio is priceable. Partial valuation still
 *      reports each position's own market value and the subtotal those cover — and
 *      produces no weights, no concentration and a named gap instead.
 *   4. **Absent, invalid, stale and conflicting are four different findings.** They
 *      have four different remedies, so they are four different severities and four
 *      different codes. Collapsing them into "no data" is how a system ends up
 *      treating a typo and a missing fact the same way.
 *   5. **Every verdict is explained, and none of it is user text.** A finding carries
 *      a code, a severity, a scope and a system-written sentence. A quantised figure
 *      is rounded by one declared rule (`PORTFOLIO_ROUNDING`), so two runs on the
 *      same document produce the same numbers to the last decimal.
 *
 * What this module deliberately does **not** contain: a recommendation, a target
 * allocation, a "should", a forecast, or a personalised instruction of any kind.
 * ADR-0042 fixes that boundary, and it is structural rather than a wording choice —
 * nothing below has a field a recommendation could be stored in.
 */

import { z } from 'zod';
import {
  ASSET_CLASSES,
  SYMBOL_PATTERN,
  MAX_SYMBOL_LENGTH,
  type AssetClass,
  type ContextField,
} from '../profile/model.js';
import type { ProvenanceRef, QualitySeverity } from '../quality/model.js';

/**
 * An asset class, re-exported.
 *
 * A portfolio's positions carry the same vocabulary the profile's declared holdings do,
 * so a consumer of this module never has to reach for a second import to name one — and
 * there is exactly one list, not a third copy that drifts.
 */
export type { AssetClass } from '../profile/model.js';

/* ------------------------------------------------------------------ */
/* Bounds and vocabularies                                             */
/* ------------------------------------------------------------------ */

/**
 * The currencies the product recognises.
 *
 * Closed on purpose. "Any ISO code" would mean a surface could store a currency
 * nothing can combine or label, and the failure would arrive as a wrong total rather
 * than as a refusal. An unrecognised code is a `blocking` finding, which is a
 * different outcome from an unsupported one: the product can say *why*.
 */
export const PORTFOLIO_CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'CHF',
  'AUD',
  'CAD',
  'SEK',
  'NOK',
  'DKK',
  'PLN',
  'TRY',
  'BRL',
  'INR',
  'ZAR',
  'CNY',
  'HKD',
  'SGD',
  'NZD',
  'MXN',
] as const;

export type PortfolioCurrency = (typeof PORTFOLIO_CURRENCIES)[number];

/** How a currency is written on a surface. Contract vocabulary, not UI copy. */
export const PORTFOLIO_CURRENCY_LABEL: Readonly<Record<PortfolioCurrency, string>> = {
  USD: 'US dollar',
  EUR: 'Euro',
  GBP: 'Pound sterling',
  JPY: 'Japanese yen',
  CHF: 'Swiss franc',
  AUD: 'Australian dollar',
  CAD: 'Canadian dollar',
  SEK: 'Swedish krona',
  NOK: 'Norwegian krone',
  DKK: 'Danish krone',
  PLN: 'Polish zloty',
  TRY: 'Turkish lira',
  BRL: 'Brazilian real',
  INR: 'Indian rupee',
  ZAR: 'South African rand',
  CNY: 'Chinese yuan',
  HKD: 'Hong Kong dollar',
  SGD: 'Singapore dollar',
  NZD: 'New Zealand dollar',
  MXN: 'Mexican peso',
};

/**
 * How an asset class is written on a surface.
 *
 * Declared here rather than derived from the profile's own list, because this is the
 * label an **exposure bucket** carries and a surface renders it verbatim: an
 * `assetClass` token that reached a screen untranslated would be a token where a
 * person expects a word.
 */
export const PORTFOLIO_ASSET_CLASS_LABEL: Readonly<Record<AssetClass, string>> = {
  equity: 'Equities',
  fx: 'Foreign exchange',
  crypto: 'Crypto assets',
  commodity: 'Commodities',
  index: 'Indices',
};

export function isPortfolioCurrency(value: string): value is PortfolioCurrency {
  return (PORTFOLIO_CURRENCIES as readonly string[]).includes(value);
}

/**
 * The fallback base currency, used only when a document declares none.
 *
 * It is not a conversion target: nothing in this module converts between currencies,
 * because no rate source is wired (see `docs/portfolio-intelligence.md` §9). A
 * mixed-currency portfolio is reported as groups, never as one number.
 */
export const DEFAULT_BASE_CURRENCY: PortfolioCurrency = 'USD';

/** A hard bound on a document a client may declare. */
export const MAX_POSITIONS = 200;

/** Units of a holding. Bounded, and required to be positive and finite. */
export const MAX_QUANTITY = 1_000_000_000;

/** A price or a per-unit cost. Bounded, positive and finite. */
export const MAX_PRICE = 10_000_000;

export const MIN_POSITION_WEIGHT_PERCENT = 0.01;
export const MAX_POSITION_WEIGHT_PERCENT = 100;

/** How far the declared weights may miss 100% before it is a contradiction. */
export const WEIGHT_SUM_TOLERANCE_PERCENT = 0.5;

export const MAX_PORTFOLIO_NAME_LENGTH = 80;
export const MAX_POSITION_NOTE_LENGTH = 280;

/**
 * How long a price stays current.
 *
 * Seventy-two hours rather than twenty-four, and the reason is a real one: markets
 * close. A Friday close read on Sunday evening is three days old and is the most
 * recent price that exists — a shorter window would label every Monday-morning
 * analysis `stale` for a reason the user cannot do anything about, and a warning that
 * cannot be acted on is noise that teaches people to ignore warnings.
 */
export const PORTFOLIO_PRICE_MAX_AGE_HOURS = 72;

/**
 * The one rounding rule, stated once.
 *
 * Money to two decimals, percentages to two, and concentrations to four because the
 * Herfindahl index of a ten-position portfolio lives in the third and fourth decimal
 * and rounding it to two would flatten every case into the same number.
 */
export const PORTFOLIO_ROUNDING = {
  moneyDecimals: 2,
  percentDecimals: 2,
  concentrationDecimals: 4,
  note: 'Money and percentages are rounded to two decimals, concentration to four. Every figure in a result was rounded by this rule, so two runs on the same document agree to the last decimal.',
} as const;

/* ------------------------------------------------------------------ */
/* Documents — what the user declared                                  */
/* ------------------------------------------------------------------ */

/**
 * A price, with the evidence behind it.
 *
 * `value` is never optional and never defaulted: a position either has a price with
 * provenance or it has `null`. The provenance is mandatory rather than best-effort,
 * because a price with no source is a number the system cannot weigh — and the
 * engine has a finding (`price-unverified`) for exactly that case.
 */
export interface PortfolioPrice {
  value: number;
  currency: PortfolioCurrency;
  observedAt: string;
  provenance: ProvenanceRef;
}

/**
 * One position.
 *
 * The three ways a position can carry a size are all optional and all independent,
 * because a user may know some and not others:
 *
 *   - `quantity` + `averageEntryPrice` → a cost basis, and with a `price`, a P/L;
 *   - `price` + `quantity` → a market value;
 *   - `weightPercent` alone → a share of the portfolio, and nothing else.
 *
 * `quantity` and `averageEntryPrice` are `ContextField`s rather than plain numbers so
 * they carry the same source-and-observation-time discipline as every other declared
 * fact in the product: a value with no observation time is an assumption, and the
 * engine treats it as one.
 */
export interface PortfolioPosition {
  id: string;
  symbol: string;
  assetClass: AssetClass;
  currency: PortfolioCurrency;
  quantity: ContextField<number>;
  averageEntryPrice: ContextField<number>;
  price: PortfolioPrice | null;
  weightPercent: number | null;
  note?: string;
}

/**
 * The portfolio document.
 *
 * `baseCurrency` is the currency the user thinks in. It decides which currency's
 * group is the headline, and nothing else — there is no conversion.
 */
export interface Portfolio {
  id: string;
  name: string;
  baseCurrency: PortfolioCurrency;
  /** Cash the user described as a share, when they described it at all. */
  cashWeightPercent: number | null;
  positions: readonly PortfolioPosition[];
  createdAt: string;
  updatedAt: string;
}

/**
 * An append-only snapshot.
 *
 * The document is stored whole rather than as a diff, for the same reason a
 * `messages` row is never rewritten: the composition an analysis was computed from
 * has to stay recoverable exactly as it was, or the analysis cannot be reviewed.
 */
export interface PortfolioSnapshot {
  id: string;
  portfolioId: string;
  version: number;
  capturedAt: string;
  /** Why the snapshot exists. A closed set, so the timeline can be read at a glance. */
  reason: PortfolioSnapshotReason;
  document: Portfolio;
}

export const PORTFOLIO_SNAPSHOT_REASONS = [
  'created',
  'edited',
  'reassessment',
  'imported',
] as const;

export type PortfolioSnapshotReason = (typeof PORTFOLIO_SNAPSHOT_REASONS)[number];

export const PORTFOLIO_SNAPSHOT_REASON_LABEL: Readonly<Record<PortfolioSnapshotReason, string>> = {
  created: 'First declaration',
  edited: 'Positions changed',
  reassessment: 'Re-declared for a new assessment',
  imported: 'Imported from a statement',
};

/* ------------------------------------------------------------------ */
/* Findings — the closed vocabulary                                    */
/* ------------------------------------------------------------------ */

/**
 * Every way a portfolio document can fall short.
 *
 * A closed set, and the `detail` on a finding is written by the code that raises it
 * in the system's own words. That is the same property the input-quality layer has,
 * and for the same reason: a finding must be loggable and displayable without a
 * redaction pass, so nothing a user typed can travel in one.
 */
export const PORTFOLIO_ISSUE_CODES = [
  // Shape of the document
  'no-positions',
  'too-many-positions',
  'duplicate-symbol',
  // Values that cannot be used at all
  'invalid-quantity',
  'invalid-weight',
  'invalid-price',
  'invalid-entry-price',
  'unsupported-currency',
  // Declarations that do not fit together
  'mixed-currency',
  'weight-not-whole',
  // An unstated size
  'no-basis',
  // The evidence behind a price
  'price-missing',
  'price-stale',
  'price-undated',
  'price-unverified',
  // Cost basis and what needs it
  'entry-price-missing',
  'cost-basis-missing',
  'no-cost-basis',
  // What a partial document costs
  'incomplete-valuation',
] as const;

export type PortfolioIssueCode = (typeof PORTFOLIO_ISSUE_CODES)[number];

/** Which part of a document a finding concerns. Never a user field name. */
export type PortfolioScope = 'portfolio' | 'positions' | 'prices' | 'weights';

/** The severity each code always carries. Declared once, so nothing re-derives it. */
export const PORTFOLIO_ISSUE_SEVERITY: Readonly<Record<PortfolioIssueCode, QualitySeverity>> = {
  'no-positions': 'missing',
  'too-many-positions': 'advisory',
  'duplicate-symbol': 'conflicting',
  'invalid-quantity': 'blocking',
  'invalid-weight': 'blocking',
  'invalid-price': 'blocking',
  'invalid-entry-price': 'blocking',
  'unsupported-currency': 'blocking',
  'mixed-currency': 'conflicting',
  'weight-not-whole': 'conflicting',
  'no-basis': 'missing',
  'price-missing': 'missing',
  'price-stale': 'stale',
  'price-undated': 'unverified',
  'price-unverified': 'unverified',
  'entry-price-missing': 'missing',
  'cost-basis-missing': 'missing',
  'no-cost-basis': 'missing',
  'incomplete-valuation': 'missing',
};

/** What each code means, in the product's own words. Contract text, not UI copy. */
export const PORTFOLIO_ISSUE_MEANING: Readonly<Record<PortfolioIssueCode, string>> = {
  'no-positions': 'The portfolio holds nothing, so there is no composition to describe.',
  'too-many-positions':
    'The document holds more positions than the product will read in one pass, so it is read up to the limit.',
  'duplicate-symbol': 'The same symbol appears more than once, so its size is ambiguous.',
  'invalid-quantity': 'A quantity is not a finite positive number, so the position has no size.',
  'invalid-weight': 'A declared weight is outside the range a percentage can hold.',
  'invalid-price': 'A price is not a finite positive number, so it cannot be used.',
  'invalid-entry-price': 'An average entry price is not a finite positive number.',
  'unsupported-currency': 'A currency is not one the product recognises.',
  'mixed-currency':
    'Positions are declared in more than one currency, and no rate source is wired to combine them.',
  'weight-not-whole':
    'The declared weights do not add up to a whole portfolio, so they do not describe one.',
  'no-basis': 'A position declares no weight, no quantity and no price, so it contributes nothing.',
  'price-missing': 'No current price is available for a position, so its market value is unknown.',
  'price-stale': 'A price is older than the window the product treats as current.',
  'price-undated': 'A price arrived with no observation time, so its age cannot be established.',
  'price-unverified': 'A price arrived with no trustworthy provenance, so nothing says what it is.',
  'entry-price-missing': 'No average entry price is declared, so no cost basis exists.',
  'cost-basis-missing':
    'A position is priced but has no cost basis, so unrealised profit cannot be computed for it.',
  'no-cost-basis': 'No position has a cost basis, so no unrealised profit figure exists.',
  'incomplete-valuation':
    'Some positions cannot be priced, so no share of the whole portfolio can be computed.',
};

export const PORTFOLIO_SCOPE_LABEL: Readonly<Record<PortfolioScope, string>> = {
  portfolio: 'Portfolio',
  positions: 'Positions',
  prices: 'Prices',
  weights: 'Weights',
};

/** One finding. `detail` is system-worded and never carries user text. */
export interface PortfolioFinding {
  code: PortfolioIssueCode;
  severity: QualitySeverity;
  scope: PortfolioScope;
  detail: string;
  /** How many positions it concerns, when it concerns positions. */
  count: number | null;
}

export function finding(
  code: PortfolioIssueCode,
  scope: PortfolioScope,
  detail: string,
  count: number | null = null,
): PortfolioFinding {
  return { code, severity: PORTFOLIO_ISSUE_SEVERITY[code], scope, detail, count };
}

/** Which part of a document each code concerns, when it concerns positions. */
const COUNTED_SCOPE: Readonly<Record<PortfolioIssueCode, PortfolioScope>> = {
  'no-positions': 'portfolio',
  'too-many-positions': 'positions',
  'duplicate-symbol': 'positions',
  'invalid-quantity': 'positions',
  'invalid-weight': 'weights',
  'invalid-price': 'prices',
  'invalid-entry-price': 'positions',
  'unsupported-currency': 'positions',
  'mixed-currency': 'portfolio',
  'weight-not-whole': 'weights',
  'no-basis': 'positions',
  'price-missing': 'prices',
  'price-stale': 'prices',
  'price-undated': 'prices',
  'price-unverified': 'prices',
  'entry-price-missing': 'positions',
  'cost-basis-missing': 'positions',
  'no-cost-basis': 'positions',
  'incomplete-valuation': 'positions',
};

/**
 * The sentence for a counted finding.
 *
 * The meaning comes from `PORTFOLIO_ISSUE_MEANING`, so the documentation, the surface
 * and this function cannot describe a code differently — and the count is appended
 * rather than woven in, which keeps the sentence stable whatever the number is.
 */
function countedDetail(code: PortfolioIssueCode, count: number): string {
  const meaning = PORTFOLIO_ISSUE_MEANING[code];
  if (count <= 1) return meaning;
  return `${meaning} ${count} positions are affected.`;
}

/**
 * The identity part of a position's reading.
 *
 * Shared by the two exit paths — an unrecognised currency, and the ordinary one — so
 * the same position cannot be described two different ways depending on which path it
 * left by. Every value starts at "nothing usable"; a caller fills in what it read.
 */
function stateOf(
  position: PortfolioPosition,
  rest: { duplicated: boolean; findings: readonly PortfolioIssueCode[] },
): PositionState {
  return {
    id: position.id,
    symbol: position.symbol,
    assetClass: position.assetClass,
    currency: position.currency,
    usable: false,
    duplicated: rest.duplicated,
    quantity: null,
    averageEntryPrice: null,
    price: null,
    priceCurrency: null,
    priceAgeHours: null,
    priceTrust: null,
    weightPercent: null,
    findings: rest.findings,
  };
}

/* ------------------------------------------------------------------ */
/* Assessment of the document                                          */
/* ------------------------------------------------------------------ */

/**
 * One position, as the assessment read it.
 *
 * The assessment is the **reading**: everything that needs no knowledge of the
 * portfolio as a whole happens exactly once, here. That matters because the
alternative — validating once in the assessment and again in the engine — is two
 * implementations of "is this usable", and they would disagree the first time either
 * was changed. The engine receives these states and does arithmetic over them; it never
 * re-reads the raw document, and it never re-checks a value.
 *
 * Every `null` here means "not usable", and the reason is always available from
 * `findings` — an absent value, a malformed one and an untrustworthy one are three
 * different codes, so a caller never has to guess which it was.
 */
export interface PositionState {
  id: string;
  symbol: string;
  assetClass: AssetClass;
  currency: PortfolioCurrency;
  /** False when nothing about this position can be used in any calculation. */
  usable: boolean;
  /** True when the symbol appears more than once in the document. */
  duplicated: boolean;
  /** Validated. `null` when absent *and* when malformed — `findings` says which. */
  quantity: number | null;
  averageEntryPrice: number | null;
  price: number | null;
  priceCurrency: PortfolioCurrency | null;
  priceAgeHours: number | null;
  priceTrust: 'unverified' | 'verified' | 'authoritative' | null;
  weightPercent: number | null;
  /** The codes that concern this position, in declaration order. */
  findings: readonly PortfolioIssueCode[];
}

/** What a calculation could actually use, counted rather than scored. */
export interface PortfolioCoverage {
  /** Positions in the document, after the bound is applied. */
  positions: number;
  /** Positions with a usable current price *and* a usable quantity. */
  priced: number;
  /** Positions with a usable declared weight. */
  weighted: number;
  /** Positions with a usable quantity and entry price, so a cost basis exists. */
  costed: number;
  /** Share of the declared weight that the priced positions account for. */
  pricedShareOfDeclaredWeightPercent: number | null;
  /** Share of the declared weight that the costed positions account for. */
  costedShareOfDeclaredWeightPercent: number | null;
}

export interface PortfolioDocumentAssessment {
  /** False when the document holds nothing. */
  described: boolean;
  /** Bounded: a longer document is read up to `MAX_POSITIONS`. */
  truncated: boolean;
  /** Positions a calculation may use at all — i.e. not malformed. */
  usable: number;
  /** The per-position reading. The engine's only input. */
  positions: readonly PositionState[];
  baseCurrency: PortfolioCurrency;
  /** Every recognised currency the document mentions, base first. */
  currencies: readonly PortfolioCurrency[];
  singleCurrency: boolean;
  declaredWeightSumPercent: number | null;
  /** Newest and oldest price observation, so freshness is stated as a range. */
  newestPriceAt: string | null;
  oldestPriceAt: string | null;
  coverage: PortfolioCoverage;
  findings: readonly PortfolioFinding[];
  /** The worst severity present, or `null` when the document is clean. */
  worst: QualitySeverity | null;
  note: string;
}

const ASSESSMENT_NOTE =
  'These findings are computed from the document you declared. Nothing here is inferred, and no language model can change it.';

function isFinitePositive(value: unknown, max: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= max;
}

/** The value of a declared number field, or `null` when nothing was declared. */
function declaredValue(field: ContextField<number>): number | null {
  return typeof field.value === 'number' && field.value !== null ? field.value : null;
}

/** How old an observation is, in hours. `null` when it carries no time. */
export function priceAgeHours(observedAt: string | null, now: number): number | null {
  if (observedAt === null) return null;
  const at = Date.parse(observedAt);
  if (!Number.isFinite(at)) return null;
  return Math.max(0, (now - at) / 3_600_000);
}

/**
 * Read a portfolio document.
 *
 * Pure and total: every code path returns an assessment, and the same document and
 * clock always produce the same one. It performs **no arithmetic about value** — it
 * reports what could be used and what could not. Valuation is the engine's job.
 */
export function assessPortfolioDocument(
  portfolio: Portfolio,
  now: number,
): PortfolioDocumentAssessment {
  const findings: PortfolioFinding[] = [];
  const declared = portfolio.positions ?? [];
  const truncated = declared.length > MAX_POSITIONS;
  const positions = truncated ? declared.slice(0, MAX_POSITIONS) : declared;

  /**
   * Two buckets, one output.
   *
   * A portfolio-level finding carries a bespoke sentence and its own count; a
   * position-level one is counted and worded from the closed set's meaning. Both are
   * emitted by one loop in the closed set's declaration order, so the same document
   * always produces the same list in the same order — a property that makes a
   * difference when an assessment is diffed between two runs.
   */
  const bespoke = new Map<
    PortfolioIssueCode,
    { detail: string; count: number | null; scope: PortfolioScope }
  >();
  const occurrences = new Map<PortfolioIssueCode, number>();
  const note = (code: PortfolioIssueCode): void => {
    occurrences.set(code, (occurrences.get(code) ?? 0) + 1);
  };

  if (truncated) {
    bespoke.set('too-many-positions', {
      detail: `The document declares ${declared.length} positions; ${MAX_POSITIONS} were read and the rest were not.`,
      count: declared.length,
      scope: 'positions',
    });
  }

  if (positions.length === 0) {
    bespoke.set('no-positions', {
      detail: PORTFOLIO_ISSUE_MEANING['no-positions'],
      count: 0,
      scope: 'portfolio',
    });
  }

  // Recognised currencies, base first so a surface shows the headline group first.
  const seen = new Set<string>([portfolio.baseCurrency]);
  const positionCurrencies: PortfolioCurrency[] = [];
  for (const position of positions) {
    if (isPortfolioCurrency(position.currency)) {
      seen.add(position.currency);
      positionCurrencies.push(position.currency);
    }
  }
  const currencies = [...seen] as PortfolioCurrency[];
  // `seen` is seeded with the base currency, which the schema and the column's CHECK
  // constraint already pin; a document whose base is unrecognised anyway reports it
  // rather than dropping it silently.
  const singleCurrency = currencies.length <= 1;

  if (!isPortfolioCurrency(portfolio.baseCurrency)) {
    bespoke.set('unsupported-currency', {
      detail:
        'The base currency is not one the product recognises, so no figure has a unit and nothing below is computed.',
      count: null,
      scope: 'portfolio',
    });
  }

  const foreign = new Set(positionCurrencies.filter((code) => code !== portfolio.baseCurrency));
  if (foreign.size > 0 && positions.length > 0) {
    bespoke.set('mixed-currency', {
      detail: `Positions are declared in ${foreign.size + 1} currencies including the base. No rate source is wired, so each currency is reported as its own group and no combined total is produced.`,
      count: foreign.size,
      scope: 'portfolio',
    });
  }

  // Duplicate symbols. A symbol appearing twice is not a style problem: its size is
  // ambiguous, and the system will not choose which of the two rows is the position.
  const bySymbol = new Map<string, number>();
  for (const position of positions) {
    const key = position.symbol.trim().toUpperCase();
    bySymbol.set(key, (bySymbol.get(key) ?? 0) + 1);
  }

  let priced = 0;
  let weighted = 0;
  let costed = 0;
  let usable = 0;
  let pricedDeclaredWeight = 0;
  let costedDeclaredWeight = 0;
  let declaredWeightSum = 0;
  let declaredWeightBearing = 0;
  const priceAges: number[] = [];
  /** The per-position reading. The engine's only input, built once, here. */
  const states: PositionState[] = [];

  for (const position of positions) {
    const codes: PortfolioIssueCode[] = [];
    const duplicated = (bySymbol.get(position.symbol.trim().toUpperCase()) ?? 0) > 1;
    if (duplicated) codes.push('duplicate-symbol');

    // A currency the product does not recognise stops the position here: its value has
    // no unit, so there is nothing to compute even with a quantity and a price. The
    // state is still recorded, so a surface can show the row and say why it was left
    // out instead of silently dropping it.
    if (!isPortfolioCurrency(position.currency)) {
      codes.push('unsupported-currency');
      note('unsupported-currency');
      states.push({
        ...stateOf(position, { duplicated, findings: codes }),
        usable: false,
      });
      continue;
    }

    const rawQuantity = declaredValue(position.quantity);
    const rawEntry = declaredValue(position.averageEntryPrice);
    const quantity =
      rawQuantity !== null && isFinitePositive(rawQuantity, MAX_QUANTITY) ? rawQuantity : null;
    const averageEntryPrice =
      rawEntry !== null && isFinitePositive(rawEntry, MAX_PRICE) ? rawEntry : null;
    if (rawQuantity !== null && quantity === null) codes.push('invalid-quantity');
    if (rawEntry !== null && averageEntryPrice === null) codes.push('invalid-entry-price');

    const rawWeight = position.weightPercent;
    const weightOk =
      rawWeight === null ||
      (Number.isFinite(rawWeight) &&
        rawWeight >= MIN_POSITION_WEIGHT_PERCENT &&
        rawWeight <= MAX_POSITION_WEIGHT_PERCENT);
    if (!weightOk) codes.push('invalid-weight');
    const weightPercent = weightOk && rawWeight !== null ? rawWeight : null;

    let price: number | null = null;
    let priceCurrency: PortfolioCurrency | null = null;
    let priceAge: number | null = null;
    let priceTrust: PositionState['priceTrust'] = null;
    if (position.price !== null) {
      const candidate = position.price;
      const usablePrice =
        isFinitePositive(candidate.value, MAX_PRICE) &&
        isPortfolioCurrency(candidate.currency) &&
        (candidate.currency === position.currency || candidate.currency === portfolio.baseCurrency);
      if (!usablePrice) {
        codes.push('invalid-price');
      } else {
        price = candidate.value;
        priceCurrency = candidate.currency;
        priceTrust = candidate.provenance?.trust ?? 'unverified';
        priceAge = priceAgeHours(candidate.observedAt, now);
        if (priceAge === null) codes.push('price-undated');
        if (priceTrust !== 'verified' && priceTrust !== 'authoritative') {
          codes.push('price-unverified');
        }
      }
    }

    // A malformed value is not a value, so a malformed position is unusable as a whole:
    // the engine is never handed a half-read position and left to decide what to do
    // with it. A duplicated symbol is unusable for a different reason — its size is
    // ambiguous — and the two are kept apart so a surface can say which it is.
    const malformed = codes.some(
      (code) =>
        code === 'invalid-quantity' ||
        code === 'invalid-entry-price' ||
        code === 'invalid-price' ||
        code === 'invalid-weight',
    );
    const positionUsable = !malformed && !duplicated;

    if (position.price === null && quantity !== null) codes.push('price-missing');
    if (quantity !== null && averageEntryPrice === null && rawEntry === null) {
      codes.push('entry-price-missing');
    }
    // No size of any kind: the position contributes nothing, and nothing may be
    // inferred about it from the positions beside it.
    if (quantity === null && price === null && weightPercent === null) codes.push('no-basis');

    // The declared weights are summed over every position that stated a valid one,
    // including positions unusable for another reason: "do the shares add up" is a
    // question about the declaration as written, not about what could be computed.
    if (weightPercent !== null) {
      declaredWeightSum += weightPercent;
      declaredWeightBearing += 1;
      if (positionUsable && quantity !== null && price !== null) {
        pricedDeclaredWeight += weightPercent;
      }
      if (positionUsable && quantity !== null && averageEntryPrice !== null) {
        costedDeclaredWeight += weightPercent;
      }
    }

    if (positionUsable) {
      usable += 1;
      if (quantity !== null && price !== null) priced += 1;
      if (weightPercent !== null) weighted += 1;
      if (quantity !== null && averageEntryPrice !== null) costed += 1;
      if (priceAge !== null) priceAges.push(priceAge);
    }

    for (const code of codes) note(code);
    states.push({
      ...stateOf(position, { duplicated, findings: codes }),
      usable: positionUsable,
      quantity,
      averageEntryPrice,
      price,
      priceCurrency,
      priceAgeHours: priceAge,
      priceTrust,
      weightPercent,
    });
  }

  // Staleness is judged once, over the prices that carry a time.
  const staleCount = priceAges.filter((age) => age > PORTFOLIO_PRICE_MAX_AGE_HOURS).length;
  if (staleCount > 0) {
    bespoke.set('price-stale', {
      detail: `${staleCount} price(s) are older than the ${PORTFOLIO_PRICE_MAX_AGE_HOURS}-hour window the product treats as current, so they are reported as outdated rather than reused silently.`,
      count: staleCount,
      scope: 'prices',
    });
  }

  // More than one weight-bearing position, so "do they add up" is a real question. A
  // single position at 40% is not an error; it is a portfolio with one position in it.
  if (declaredWeightBearing > 1) {
    const off = Math.abs(declaredWeightSum - 100);
    if (off > WEIGHT_SUM_TOLERANCE_PERCENT) {
      bespoke.set('weight-not-whole', {
        detail: `The declared weights add up to ${declaredWeightSum.toFixed(PORTFOLIO_ROUNDING.percentDecimals)}% rather than a whole portfolio, so they do not describe one.`,
        count: declaredWeightBearing,
        scope: 'weights',
      });
    }
  }

  if (usable > 0 && priced > 0 && priced < usable) {
    bespoke.set('incomplete-valuation', {
      detail: `${priced} of ${usable} position(s) can be priced. A share of the whole portfolio requires all of them, so no weight set is computed from market value.`,
      count: usable - priced,
      scope: 'positions',
    });
  }

  if (usable > 0 && costed === 0) {
    bespoke.set('no-cost-basis', {
      detail: PORTFOLIO_ISSUE_MEANING['no-cost-basis'],
      count: null,
      scope: 'positions',
    });
  } else if (priced > 0 && costed < priced) {
    bespoke.set('cost-basis-missing', {
      detail: PORTFOLIO_ISSUE_MEANING['cost-basis-missing'],
      count: priced - costed,
      scope: 'positions',
    });
  }

  // One loop, in the closed set's own declaration order: the same document always
  // produces the same list in the same order, which is what makes two assessments
  // comparable at all.
  for (const code of PORTFOLIO_ISSUE_CODES) {
    const custom = bespoke.get(code);
    if (custom !== undefined) {
      findings.push(finding(code, custom.scope, custom.detail, custom.count));
      continue;
    }
    const count = occurrences.get(code);
    if (count === undefined) continue;
    findings.push(finding(code, COUNTED_SCOPE[code], countedDetail(code, count), count));
  }

  const severityOrder: Record<QualitySeverity, number> = {
    blocking: 5,
    conflicting: 4,
    missing: 3,
    stale: 2,
    unverified: 1,
    advisory: 0,
  };
  const worst = findings.reduce<QualitySeverity | null>((accumulator, found) => {
    if (accumulator === null) return found.severity;
    return severityOrder[found.severity] > severityOrder[accumulator]
      ? found.severity
      : accumulator;
  }, null);

  const oldestAge = priceAges.length > 0 ? Math.max(...priceAges) : null;
  const newestAge = priceAges.length > 0 ? Math.min(...priceAges) : null;

  return {
    described: positions.length > 0,
    truncated,
    usable,
    positions: states,
    baseCurrency: portfolio.baseCurrency,
    currencies,
    singleCurrency,
    declaredWeightSumPercent:
      declaredWeightBearing > 0 ? round(declaredWeightSum, 'percent') : null,
    newestPriceAt: newestAge === null ? null : new Date(now - newestAge * 3_600_000).toISOString(),
    oldestPriceAt: oldestAge === null ? null : new Date(now - oldestAge * 3_600_000).toISOString(),
    coverage: {
      positions: positions.length,
      priced,
      weighted,
      costed,
      pricedShareOfDeclaredWeightPercent:
        declaredWeightBearing > 0 && priced > 0 ? round(pricedDeclaredWeight, 'percent') : null,
      costedShareOfDeclaredWeightPercent:
        declaredWeightBearing > 0 && costed > 0 ? round(costedDeclaredWeight, 'percent') : null,
    },
    findings,
    worst,
    note: ASSESSMENT_NOTE,
  };
}

/* ------------------------------------------------------------------ */
/* Rounding — one rule, used by the engine and the surface              */
/* ------------------------------------------------------------------ */

export type RoundingKind = 'money' | 'percent' | 'concentration';

/**
 * Round by the declared rule.
 *
 * Exported so the engine and any consumer round identically: a surface that re-rounded
 * a value it was given would eventually show a figure that does not match the one the
 * calculation produced, and the difference would look like a bug in the arithmetic.
 *
 * Two things are deliberate, and both are corrections to how JavaScript rounds by
 * default.
 *
 * **Half away from zero, not half toward `+Infinity`.** `Math.round(-0.5)` is `-0`, so a
 * naive implementation rounds a half-cent *up* for a gain and *down* for a loss — the
 * same magnitude, two different answers, decided by a sign. On a profit figure that is
 * not a rounding convention, it is a bug: a portfolio could show a small gain where an
 * identical loss rounds to nothing. The sign is therefore taken off, the magnitude
 * rounded, and the sign put back.
 *
 * **A decimal error is not a digit.** `1.005` has no exact binary form, so `1.005 * 100`
 * is `100.49999999999999` and rounds to `100` — a half-cent down, and inconsistently, so
 * whether it happens depends on the value rather than on the rule. Nudging the scaled
 * figure by a few units in the last place of its own magnitude restores the decimal the
 * caller wrote. The nudge is ~4 ULPs, which is twelve orders of magnitude below any
 * amount of money this product can represent, so nothing that is not already within a
 * rounding error of a boundary can be moved by it.
 */
export function round(value: number, kind: RoundingKind): number {
  if (!Number.isFinite(value)) return value;
  const decimals =
    kind === 'money'
      ? PORTFOLIO_ROUNDING.moneyDecimals
      : kind === 'percent'
        ? PORTFOLIO_ROUNDING.percentDecimals
        : PORTFOLIO_ROUNDING.concentrationDecimals;
  const factor = 10 ** decimals;
  const scaled = value * factor;
  const nudged = scaled + Math.sign(scaled) * Math.abs(scaled) * Number.EPSILON * 4;
  const magnitude = Math.round(Math.abs(nudged));
  const result = (Math.sign(nudged) * magnitude) / factor;
  // A negative zero is not an amount. `Math.sign(-0)` is `-0`, so a rounded-down zero
  // arrives as `-0`, which survives equality checks against itself and prints as `-0` in
  // some formatters — one more way for a figure to look like something it is not.
  return result === 0 ? 0 : result;
}

/* ------------------------------------------------------------------ */
/* Engine output — the contract the surface renders                    */
/* ------------------------------------------------------------------ */

/** Which figure a value was derived from. `null` when it does not exist. */
export type ValuationBasis = 'quantity-x-price';

export interface PositionMetrics {
  id: string;
  symbol: string;
  assetClass: AssetClass;
  currency: PortfolioCurrency;
  quantity: number | null;
  price: number | null;
  /** Age of the price in hours at the moment of the calculation. */
  priceAgeHours: number | null;
  /** `quantity × price`, or `null`. Never a figure derived from a weight. */
  marketValue: number | null;
  /** `quantity × averageEntryPrice`, or `null`. */
  costBasis: number | null;
  /** `marketValue − costBasis`, or `null` when either side is missing. */
  unrealisedPnl: number | null;
  unrealisedReturnPercent: number | null;
  /** What the user declared, when they declared one. */
  declaredWeightPercent: number | null;
  /** The share of a fully-valued portfolio. `null` unless the whole is known. */
  computedWeightPercent: number | null;
  /** The basis of `marketValue`, so a figure cannot be read without its source. */
  basis: ValuationBasis | null;
  /** Codes from the document assessment that concern this position. */
  findings: readonly PortfolioIssueCode[];
}

export interface AllocationBucket {
  key: string;
  label: string;
  weightPercent: number;
  positions: number;
}

export interface PositionShare {
  id: string;
  symbol: string;
  assetClass: AssetClass;
  weightPercent: number;
}

/**
 * One population of weights.
 *
 * `basis` names what the shares are shares *of*, and `positions` and `coveragePercent`
 * state how much of the document the population covers. There is deliberately no
 * combined set: a concentration figure over a mixture of declared weights and market
 * values is a number no one could check.
 */
export interface WeightSet {
  basis: 'declared-weight' | 'market-value';
  positions: number;
  /** The share of the document this population accounts for, as a percentage. */
  coveragePercent: number;
  /**
   * The sum of the shares in this set, in percent.
   *
   * Always a percentage, never money: the money lives in `PortfolioMetrics.totals`.
   * It is 100 for a complete population, and less when the declared weights do not
   * add up — which is exactly the fact a reader needs in order to trust the shares.
   */
  totalPercent: number;
  /** The largest single share, in percent. */
  top1Percent: number;
  top3Percent: number;
  top5Percent: number;
  /** Herfindahl–Hirschman index over the fractional shares, 0–1. */
  hhi: number;
  /** `1 / HHI`: how many equal-sized positions would be this concentrated. */
  effectivePositions: number;
  byAssetClass: readonly AllocationBucket[];
  byCurrency: readonly AllocationBucket[];
  largest: readonly PositionShare[];
}

/** A belief the numbers rest on, carried as data rather than as prose. */
export interface PortfolioAssumption {
  id: string;
  statement: string;
  origin: 'user-declared' | 'context' | 'engine';
}

/** A figure that could not be produced, and what would change that. */
export interface PortfolioGap {
  code: PortfolioIssueCode;
  detail: string;
  /** What would close it. Phrased as a condition, never as an instruction to trade. */
  remedies: readonly string[];
}

export interface PortfolioMetrics {
  baseCurrency: PortfolioCurrency;
  positions: readonly PositionMetrics[];
  /** Every usable position had a quantity and a price. */
  valuationComplete: boolean;
  /** Every priced position also had a cost basis. */
  costBasisComplete: boolean;
  /** True when every priced position also has a cost basis. */
  unrealisedComplete: boolean;
  totals: {
    /**
     * The sum over the priced positions, **in the base currency** — and `null` when
     * the priced positions do not all sit in one currency.
     *
     * `null` rather than a converted figure, because no rate source is wired: the
     * groups that *can* be summed are in `byCurrency`, and a single total across
     * currencies would be a number with no meaning the system could defend.
     */
    marketValue: number | null;
    costBasis: number | null;
    unrealisedPnl: number | null;
    unrealisedReturnPercent: number | null;
    /** Money by currency, so a mixed document is grouped rather than summed. */
    byCurrency: readonly { currency: PortfolioCurrency; marketValue: number; positions: number }[];
    pricedPositions: number;
    costedPositions: number;
    /** Positions that have both a market value and a cost basis, so a P/L exists. */
    pnlPositions: number;
  };
  weights: {
    byMarketValue: WeightSet | null;
    byDeclaredWeight: WeightSet | null;
  };
  coverage: PortfolioCoverage;
  assumptions: readonly PortfolioAssumption[];
  gaps: readonly PortfolioGap[];
  observedAt: string;
  note: string;
}

/* ------------------------------------------------------------------ */
/* Insights                                                            */
/* ------------------------------------------------------------------ */

/** The eight observations the product is allowed to make. Closed set. */
export const PORTFOLIO_INSIGHT_TYPES = [
  'allocation',
  'concentration',
  'diversification',
  'risk-exposure',
  'data-quality',
  'horizon-mismatch',
  'liquidity',
  'missing-information',
] as const;

export type PortfolioInsightType = (typeof PORTFOLIO_INSIGHT_TYPES)[number];

export const PORTFOLIO_INSIGHT_TYPE_LABEL: Readonly<Record<PortfolioInsightType, string>> = {
  allocation: 'Allocation',
  concentration: 'Concentration',
  diversification: 'Diversification',
  'risk-exposure': 'Risk exposure',
  'data-quality': 'Data quality',
  'horizon-mismatch': 'Horizon',
  liquidity: 'Liquidity',
  'missing-information': 'Missing information',
};

export const PORTFOLIO_INSIGHT_TYPE_MEANING: Readonly<Record<PortfolioInsightType, string>> = {
  allocation: 'How the composition breaks down, measured from what you declared.',
  concentration: 'How much of the composition sits in a single position or group.',
  diversification: 'How many independent positions the composition actually holds.',
  'risk-exposure': 'Where the composition concentrates by category and by currency.',
  'data-quality': 'Which of the figures rest on prices that are missing, old or unverified.',
  'horizon-mismatch': 'Whether the stated horizon and the described composition fit together.',
  liquidity: 'What the product can and cannot say about how quickly a position could be exited.',
  'missing-information': 'What would have to be declared before a figure could be produced.',
};

/**
 * How loudly an observation is made.
 *
 * Three levels rather than a score, and none of them is an error: an insight is an
 * observation about a composition, so the loudest it can be is `elevated`. A refusal
 * is a readiness decision and lives there, not here.
 */
export const PORTFOLIO_INSIGHT_SEVERITIES = ['observation', 'watch', 'elevated'] as const;
export type PortfolioInsightSeverity = (typeof PORTFOLIO_INSIGHT_SEVERITIES)[number];

export const PORTFOLIO_INSIGHT_SEVERITY_LABEL: Readonly<Record<PortfolioInsightSeverity, string>> =
  {
    observation: 'Observation',
    watch: 'Worth watching',
    elevated: 'Elevated',
  };

export const PORTFOLIO_INSIGHT_SEVERITY_ORDER: Readonly<Record<PortfolioInsightSeverity, number>> =
  {
    observation: 0,
    watch: 1,
    elevated: 2,
  };

export interface InsightSource {
  kind: 'portfolio' | 'context' | 'market-data';
  ref: string;
}

/**
 * One insight.
 *
 * Every field is required, including the ones a hurried implementation would leave
 * out. `assumptions`, `sources` and `limitations` are not decoration: they are what a
 * reader needs to weigh the observation, and an insight without them would be a claim
 * presented as a fact. `title` and `explanation` are written by the engine in its own
 * words — no user text and no model text reaches this structure, which is why it can
 * be rendered and logged verbatim.
 */
export interface PortfolioInsight {
  id: string;
  type: PortfolioInsightType;
  severity: PortfolioInsightSeverity;
  title: string;
  explanation: string;
  metrics: readonly { label: string; value: string }[];
  sources: readonly InsightSource[];
  assumptions: readonly string[];
  confidence: 'confirmed' | 'derived' | 'assumed' | 'missing';
  observedAt: string;
  limitations: readonly string[];
}

/* ------------------------------------------------------------------ */
/* Schemas                                                             */
/* ------------------------------------------------------------------ */

const isoDate = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'must be an ISO-8601 date' });

const currencySchema = z.enum(PORTFOLIO_CURRENCIES);

const sourceSchema = z.enum(['user-stated', 'derived', 'assumed']);

/**
 * A declared number.
 *
 * `value` may be `null` — "the user has not told us" is a state the product has to be
 * able to store. A present value is bounded here so the engine never sees an
 * unbounded one, and `source` is required so nothing can be stored without saying
 * where it came from.
 */
function declaredNumberSchema(max: number) {
  return z.strictObject({
    value: z.number().finite().positive().max(max).nullable(),
    source: sourceSchema,
    observedAt: isoDate.nullable(),
    note: z.string().max(MAX_POSITION_NOTE_LENGTH).optional(),
  });
}

export const portfolioPriceSchema = z.strictObject({
  value: z.number().finite().positive().max(MAX_PRICE),
  currency: currencySchema,
  observedAt: isoDate,
  provenance: z.strictObject({
    source: z.enum(['user', 'derived', 'system', 'market-data']),
    ref: z.string().min(1).max(64),
    trust: z.enum(['unverified', 'verified', 'authoritative']),
    recordedAt: isoDate,
  }),
});

export const portfolioPositionSchema = z.strictObject({
  id: z.string().min(1).max(64),
  symbol: z.string().min(1).max(MAX_SYMBOL_LENGTH).regex(SYMBOL_PATTERN, 'invalid symbol'),
  assetClass: z.enum(ASSET_CLASSES),
  currency: currencySchema,
  quantity: declaredNumberSchema(MAX_QUANTITY),
  averageEntryPrice: declaredNumberSchema(MAX_PRICE),
  price: portfolioPriceSchema.nullable(),
  weightPercent: z
    .number()
    .finite()
    .min(MIN_POSITION_WEIGHT_PERCENT)
    .max(MAX_POSITION_WEIGHT_PERCENT)
    .nullable(),
  note: z.string().max(MAX_POSITION_NOTE_LENGTH).optional(),
});

export const portfolioDocumentSchema = z.strictObject({
  name: z.string().min(1).max(MAX_PORTFOLIO_NAME_LENGTH),
  baseCurrency: currencySchema,
  cashWeightPercent: z.number().finite().min(0).max(MAX_POSITION_WEIGHT_PERCENT).nullable(),
  positions: z.array(portfolioPositionSchema).max(MAX_POSITIONS),
});

export type PortfolioDocumentInput = z.infer<typeof portfolioDocumentSchema>;

/**
 * A position as a *client* declares it: the stored schema minus the `id`.
 *
 * The id is an implementation detail of the row, not something a person typing in a
 * holding has an opinion about — and accepting one would let a client name a row that
 * belongs to somebody else. The server mints it, and the omission is the reason a
 * stored position's identity is never client-controlled.
 */
export const portfolioPositionInputSchema = portfolioPositionSchema.omit({ id: true });

/** The body of a declaration: the stored document minus the position ids. */
export const portfolioDocumentInputSchema = portfolioDocumentSchema
  .omit({ positions: true })
  .extend({ positions: z.array(portfolioPositionInputSchema).max(MAX_POSITIONS) });

export type PortfolioDocumentBody = z.infer<typeof portfolioDocumentInputSchema>;

/** An empty document, so a first declaration is an update rather than a special case. */
export function emptyPortfolio(id: string, at: string): Portfolio {
  return {
    id,
    name: 'My portfolio',
    baseCurrency: DEFAULT_BASE_CURRENCY,
    cashWeightPercent: null,
    positions: [],
    createdAt: at,
    updatedAt: at,
  };
}
