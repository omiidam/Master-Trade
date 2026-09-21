/**
 * Portfolio arithmetic — the deterministic core.
 *
 * This module is the one the product vision (§2.5) and ADR-0042 asked for by name:
 * *pure functions, no network, no clock, no database handle, no model*. That constraint
 * is not a style preference — it is enforced by `tests/monorepo-boundary.test.ts`, which
 * refuses an import of the LLM layer, the agent, the database, the HTTP server, the
 * realtime hub or a `node:*` builtin from anywhere inside `packages/trading-engine`.
 * A future change that tried to let a model influence a portfolio figure would have to
 * cross a boundary the test refuses, rather than quietly adding an import.
 *
 * Three rules shape everything below.
 *
 * **It consumes a reading, not a document.** The Phase 5.5 model's
 * `assessPortfolioDocument` does every check that needs no knowledge of the portfolio
 * as a whole — is this quantity a number, is this currency recognised, is this symbol
 * duplicated — and this module does arithmetic over the result. So there is exactly one
 * implementation of "is this usable", and the numbers and the findings cannot disagree
 * about which positions were read.
 *
 * **A share of the whole requires the whole.** Weights, concentration and the
 * Herfindahl index are produced only when *every* position in the document is usable
 * and priced. Every partially-valued portfolio still gets each position's own market
 * value and the subtotal those cover — but no shares, and a named gap instead. This is
 * the single most important property in the module: a weight computed over the priced
 * subset of a portfolio is a wrong number that looks exactly like a right one.
 *
 * **No cross-currency total.** Each position's value is in its own currency. Totals are
 * produced per currency, and a single `marketValue` only when the priced positions all
 * sit in the base currency. There is no rate source wired, so a combined figure would
 * be an invented one.
 *
 * What is deliberately absent: any target, any recommendation, any forecast, and any
 * comparison of a position's weight against a threshold the product chose. The two
 * thresholds below are concentrations at which the *observation* is worth making — they
 * are reported as "above the level this product marks", never as "too much".
 */

import {
  PORTFOLIO_PRICE_MAX_AGE_HOURS,
  assessPortfolioDocument,
  round,
  type AllocationBucket,
  type Portfolio,
  type PortfolioAssumption,
  type PortfolioCurrency,
  type PortfolioDocumentAssessment,
  type PortfolioGap,
  type PortfolioInsight,
  type PortfolioInsightSeverity,
  type PortfolioMetrics,
  type PositionMetrics,
  type PositionState,
  type WeightSet,
} from '../../shared/src/portfolio/model.js';
import {
  PORTFOLIO_ASSET_CLASS_LABEL,
  type AssetClass,
  type InsightSource,
} from '../../shared/src/portfolio/model.js';
import type { TradingContext } from '../../shared/src/profile/model.js';
import { err, ok, type Tool, type ToolResult } from './framework.js';

/* ------------------------------------------------------------------ */
/* Thresholds — declared, with their meaning                           */
/* ------------------------------------------------------------------ */

/**
 * The largest single share at which the concentration observation is made.
 *
 * Twenty-five percent means four positions of equal size, which is the point at which
 * "how concentrated is this" starts having an interesting answer. The number is a
 * **reporting** threshold, not a limit and not a target: nothing below says a position
 * should be smaller, because that would be an instruction rather than a measurement
 * (ADR-0042 §3).
 */
export const CONCENTRATION_WATCH_PERCENT = 25;

/** A single position at or above this share is reported as elevated. Fifty means half. */
export const CONCENTRATION_ELEVATED_PERCENT = 50;

/**
 * Herfindahl–Hirschman index bands, over fractional shares.
 *
 * 0.15 is roughly seven equal positions; 0.25 is exactly four. Stating the bands in
 * "how many equal positions would look like this" is what makes them reviewable — an
 * index with no interpretation is a number nobody can argue with.
 */
export const HHI_WATCH = 0.15;
export const HHI_ELEVATED = 0.25;

/**
 * The largest share that may sit beside a short declared horizon without the pairing
 * being reported.
 *
 * Forty percent, and the observation it produces is deliberately modest: the engine
 * states that a short horizon and a concentrated composition were declared together and
 * that the product does not decide which one governs (ADR-0042 §2). It does not suggest
 * that either is wrong.
 */
export const SHORT_HORIZON_CONCENTRATION_PERCENT = 40;

/** Horizon bands the product treats as short for that observation. */
const SHORT_HORIZONS = new Set(['intraday', 'days']);

/* ------------------------------------------------------------------ */
/* Position arithmetic                                                 */
/* ------------------------------------------------------------------ */

function metricsFor(
  state: PositionState,
  computedShare: (value: number) => number | null,
): PositionMetrics {
  const quantity = state.quantity;
  const price = state.price;
  const entry = state.averageEntryPrice;

  const marketValue =
    state.usable && quantity !== null && price !== null ? round(quantity * price, 'money') : null;
  const costBasis =
    state.usable && quantity !== null && entry !== null ? round(quantity * entry, 'money') : null;
  const unrealisedPnl =
    marketValue !== null && costBasis !== null ? round(marketValue - costBasis, 'money') : null;
  const unrealisedReturnPercent =
    unrealisedPnl !== null && costBasis !== null && costBasis !== 0
      ? round((unrealisedPnl / costBasis) * 100, 'percent')
      : null;

  return {
    id: state.id,
    symbol: state.symbol,
    assetClass: state.assetClass,
    currency: state.currency,
    quantity,
    price,
    priceAgeHours: state.priceAgeHours,
    marketValue,
    costBasis,
    unrealisedPnl,
    unrealisedReturnPercent,
    declaredWeightPercent: state.weightPercent,
    computedWeightPercent: marketValue === null ? null : computedShare(marketValue),
    basis: marketValue === null ? null : 'quantity-x-price',
    findings: state.findings,
  };
}

/* ------------------------------------------------------------------ */
/* Weight sets and concentration                                       */
/* ------------------------------------------------------------------ */

/**
 * Build one weight set over one population.
 *
 * `population` is the positions included, each with the share it carries on this basis.
 * The set states its own coverage, so a reader never has to infer how much of the
 * document it accounts for — a property a single blended figure could not have.
 */
/** A position with the share it carries on one basis. The weight set's input. */
interface Weighted {
  id: string;
  symbol: string;
  assetClass: AssetClass;
  currency: PortfolioCurrency;
  share: number;
}

export function weightSetOf(
  population: readonly Weighted[],
  basis: WeightSet['basis'],
  coveragePercent: number,
): WeightSet | null {
  if (population.length === 0) return null;

  const totalPercent = round(
    population.reduce((sum, entry) => sum + entry.share, 0),
    'percent',
  );
  const sorted = [...population].sort((a, b) => b.share - a.share);
  const shareOf = (count: number): number =>
    round(
      sorted.slice(0, count).reduce((sum, entry) => sum + entry.share, 0),
      'percent',
    );

  const hhi = sorted.reduce((sum, entry) => sum + (entry.share / 100) ** 2, 0);
  const roundedHhi = round(hhi, 'concentration');

  return {
    basis,
    positions: population.length,
    coveragePercent: round(coveragePercent, 'percent'),
    totalPercent,
    top1Percent: shareOf(1),
    top3Percent: shareOf(3),
    top5Percent: shareOf(5),
    hhi: roundedHhi,
    // `1 / HHI` has no meaning at zero, and a population of one position is as
    // concentrated as a portfolio can be, so the degenerate case is stated rather than
    // divided by.
    effectivePositions: roundedHhi === 0 ? population.length : round(1 / roundedHhi, 'percent'),
    byAssetClass: bucketsOf(
      population,
      (entry) => entry.assetClass,
      (key) => PORTFOLIO_ASSET_CLASS_LABEL[key as AssetClass],
    ),
    byCurrency: bucketsOf(
      population,
      (entry) => entry.currency,
      (key) => key,
    ),
    largest: sorted.slice(0, 5).map((entry) => ({
      id: entry.id,
      symbol: entry.symbol,
      assetClass: entry.assetClass,
      weightPercent: round(entry.share, 'percent'),
    })),
  };
}

/**
 * Group a population into labelled buckets, largest first.
 *
 * Ties are broken by key so the order is total: two runs on the same document produce
 * the buckets in the same sequence, which is what makes an insight's metrics comparable
 * between runs.
 */
function bucketsOf<T extends { share: number }>(
  population: readonly T[],
  keyOf: (entry: T) => string,
  labelOf: (key: string) => string,
): AllocationBucket[] {
  const buckets = new Map<string, AllocationBucket>();
  for (const entry of population) {
    const key = keyOf(entry);
    const share = entry.share;
    const existing = buckets.get(key);
    if (existing === undefined) {
      buckets.set(key, {
        key,
        label: labelOf(key),
        weightPercent: round(share, 'percent'),
        positions: 1,
      });
      continue;
    }
    existing.weightPercent = round(existing.weightPercent + share, 'percent');
    existing.positions += 1;
  }
  return [...buckets.values()].sort(
    (a, b) => b.weightPercent - a.weightPercent || a.key.localeCompare(b.key),
  );
}

/* ------------------------------------------------------------------ */
/* The metrics                                                         */
/* ------------------------------------------------------------------ */

const METRICS_NOTE =
  'Every figure here is arithmetic over the document you declared, rounded by one declared rule. Nothing is projected forward, nothing is converted between currencies, and no language model was involved.';

export interface PortfolioAnalysis {
  assessment: PortfolioDocumentAssessment;
  metrics: PortfolioMetrics;
  insights: readonly PortfolioInsight[];
}

/**
 * Value a portfolio.
 *
 * Pure and total. The same document and clock always produce the same metrics, in the
 * same order, to the last decimal — which is what makes a portfolio figure reproducible
 * from a snapshot and therefore reviewable.
 */
export function computePortfolioMetrics(
  portfolio: Portfolio,
  now: number,
  /** A reading already taken, so a caller that has one does not take it twice. */
  precomputed?: PortfolioDocumentAssessment,
): PortfolioMetrics {
  const assessment = precomputed ?? assessPortfolioDocument(portfolio, now);
  const states = assessment.positions;

  // A share of the whole requires the whole, and "the whole" means every position in the
  // document: one that could not be read is still part of what the user described, so a
  // weight computed without it is a share of something else.
  const valuationComplete =
    states.length > 0 &&
    states.every((state) => state.usable && state.quantity !== null && state.price !== null);
  const priced = states.filter(
    (state) => state.usable && state.quantity !== null && state.price !== null,
  );
  const pricedTotal = round(
    priced.reduce((sum, state) => sum + (state.quantity as number) * (state.price as number), 0),
    'money',
  );

  /*
   * A share of the whole requires a whole that can be added up, which means **one** currency.
   *
   * `valuationComplete` answers "could every position be valued", and it is currency-blind on
   * purpose: each position's own market value is correct in its own currency. But a *share* is a
   * ratio, and a ratio over 2,400 made of 1,200 USD and 1,200 EUR divides money by money that is
   * not the same money. `assessment.singleCurrency` is the separate fact that decides whether a
   * population can exist at all, exactly as `totals.marketValue` is refused for the same reason
   * — and the gap `mixed-currency` names it so the absence is not silent. Found by a test: the
   * totals refused the conversion while the weights quietly performed it.
   */
  const summable = valuationComplete && assessment.singleCurrency;

  const computedShare = (value: number): number | null => {
    if (!summable || pricedTotal === 0) return null;
    return round((value / pricedTotal) * 100, 'percent');
  };

  const positions: PositionMetrics[] = states.map((state) => metricsFor(state, computedShare));

  const costed = positions.filter((entry) => entry.costBasis !== null);
  const pnlPositions = positions.filter(
    (entry) => entry.marketValue !== null && entry.costBasis !== null,
  );
  const costBasisComplete =
    priced.length > 0 &&
    positions.every((entry) => entry.marketValue === null || entry.costBasis !== null);
  const unrealisedComplete = valuationComplete && costBasisComplete;

  // Money is grouped by currency and only then summed — and only when there is one
  // group to sum.
  const moneyGroups = new Map<PortfolioCurrency, { marketValue: number; positions: number }>();
  for (const entry of priced) {
    const value = (entry.quantity as number) * (entry.price as number);
    const existing = moneyGroups.get(entry.currency);
    if (existing === undefined) {
      moneyGroups.set(entry.currency, { marketValue: value, positions: 1 });
      continue;
    }
    existing.marketValue += value;
    existing.positions += 1;
  }
  const byCurrency = [...moneyGroups.entries()]
    .map(([currency, group]) => ({
      currency,
      marketValue: round(group.marketValue, 'money'),
      positions: group.positions,
    }))
    // Base currency first, then by size, then by key so the order is total. The base
    // currency leads because it is the one the user thinks in, and a mixed portfolio
    // whose own currency sat second in the list would read as though it were marginal.
    .sort(
      (a, b) =>
        Number(b.currency === portfolio.baseCurrency) -
          Number(a.currency === portfolio.baseCurrency) ||
        b.marketValue - a.marketValue ||
        a.currency.localeCompare(b.currency),
    );

  const singleMoneyCurrency = byCurrency.length <= 1;
  const marketValue = singleMoneyCurrency
    ? priced.length === 0
      ? null
      : round(
          priced.reduce(
            (sum, state) => sum + (state.quantity as number) * (state.price as number),
            0,
          ),
          'money',
        )
    : null;
  const costBasisValues = costed.map((entry) => entry.costBasis as number);
  const costBasis =
    singleMoneyCurrency && costBasisValues.length > 0
      ? round(
          costBasisValues.reduce((sum, value) => sum + value, 0),
          'money',
        )
      : null;
  const pnlValues = pnlPositions.map((entry) => entry.unrealisedPnl as number);
  const unrealisedPnl =
    singleMoneyCurrency && pnlValues.length > 0
      ? round(
          pnlValues.reduce((sum, value) => sum + value, 0),
          'money',
        )
      : null;
  const combinedCost = pnlPositions.reduce((sum, entry) => sum + (entry.costBasis as number), 0);
  const unrealisedReturnPercent =
    unrealisedPnl !== null && combinedCost > 0
      ? round((unrealisedPnl / combinedCost) * 100, 'percent')
      : null;

  // Two populations, each stating its own coverage. Never one blended set.
  const declaredPopulation: Weighted[] = states
    .filter((state) => state.usable && state.weightPercent !== null)
    .map((state) => ({
      id: state.id,
      symbol: state.symbol,
      assetClass: state.assetClass,
      currency: state.currency,
      share: state.weightPercent as number,
    }));
  const declaredWeightTotal = declaredPopulation.reduce((sum, entry) => sum + entry.share, 0);

  const marketPopulation: Weighted[] = summable
    ? positions.map((entry) => ({
        id: entry.id,
        symbol: entry.symbol,
        assetClass: entry.assetClass,
        currency: entry.currency,
        share: computedShare(entry.marketValue as number) as number,
      }))
    : [];

  const byDeclaredWeight = weightSetOf(declaredPopulation, 'declared-weight', declaredWeightTotal);
  const byMarketValue = weightSetOf(marketPopulation, 'market-value', 100);

  const gaps = gapsFor({
    assessment,
    valuationComplete,
    pricedCount: priced.length,
    costBasisComplete,
    pnlCount: pnlPositions.length,
    singleMoneyCurrency,
  });

  const assumptions = assumptionsFor(assessment, valuationComplete, singleMoneyCurrency);

  return {
    baseCurrency: portfolio.baseCurrency,
    positions,
    valuationComplete,
    costBasisComplete,
    unrealisedComplete,
    totals: {
      marketValue,
      costBasis,
      unrealisedPnl,
      unrealisedReturnPercent,
      byCurrency,
      pricedPositions: priced.length,
      costedPositions: costed.length,
      pnlPositions: pnlPositions.length,
    },
    weights: { byMarketValue: byMarketValue ?? null, byDeclaredWeight: byDeclaredWeight ?? null },
    coverage: assessment.coverage,
    assumptions,
    gaps,
    observedAt: new Date(now).toISOString(),
    note: METRICS_NOTE,
  };
}

/**
 * The figures that could not be produced.
 *
 * Separate from the document's findings on purpose. A finding says *what is wrong with
 * the input*; a gap says *which figure is missing as a result, and what would close it*.
 * The two are related but not the same, and a surface needs both: the finding to explain
 * the input, the gap to explain the absence.
 */
function gapsFor(input: {
  assessment: PortfolioDocumentAssessment;
  valuationComplete: boolean;
  pricedCount: number;
  costBasisComplete: boolean;
  pnlCount: number;
  singleMoneyCurrency: boolean;
}): PortfolioGap[] {
  const gaps: PortfolioGap[] = [];
  const { assessment } = input;

  if (assessment.positions.length === 0) {
    gaps.push({
      code: 'no-positions',
      detail: 'The portfolio declares no positions, so no figure exists to compute.',
      remedies: ['Declare the positions the portfolio holds.'],
    });
  } else if (!input.valuationComplete) {
    gaps.push({
      code: 'incomplete-valuation',
      detail: `${input.pricedCount} of ${assessment.positions.length} position(s) can be priced, so no share of the whole portfolio is computed and no concentration figure exists.`,
      remedies: [
        'Supply a current price for every position, with the time it was observed.',
        'Or describe the composition by declared share instead, which needs no price at all.',
      ],
    });
  }

  if (input.pnlCount === 0 && assessment.positions.length > 0) {
    gaps.push({
      code: 'no-cost-basis',
      detail:
        'No position has both a quantity and an average entry price, so no unrealised profit figure exists.',
      remedies: ['Declare the average entry price for the positions you hold.'],
    });
  } else if (!input.costBasisComplete && input.pnlCount > 0) {
    gaps.push({
      code: 'cost-basis-missing',
      detail:
        'A priced position has no cost basis, so the unrealised figure covers only the positions that have one.',
      remedies: ['Declare the missing average entry prices.'],
    });
  }

  if (!input.singleMoneyCurrency) {
    gaps.push({
      code: 'mixed-currency',
      detail:
        'The priced positions do not all sit in the base currency, and no rate source is wired, so each currency is reported as its own group and no combined total is produced.',
      remedies: [
        'Read the total per currency rather than as one number.',
        'Or declare the portfolio in the currency you want reported.',
      ],
    });
  }

  return gaps;
}

/**
 * What the numbers rest on, as data.
 *
 * Gathered rather than written per figure, and exported through the metrics so a surface
 * cannot show a number without the beliefs behind it. ADR-0042 §4 makes this a
 * requirement rather than a nicety: method, window and limitations travel with the
 * numbers so they cannot be detached from them.
 */
function assumptionsFor(
  assessment: PortfolioDocumentAssessment,
  valuationComplete: boolean,
  singleMoneyCurrency: boolean,
): PortfolioAssumption[] {
  const assumptions: PortfolioAssumption[] = [
    {
      id: 'declared-composition',
      statement:
        'The composition is exactly as declared. The product has no broker connection and cannot observe a holding it was not told about.',
      origin: 'user-declared',
    },
  ];
  if (assessment.positions.length > 0) {
    assumptions.push({
      id: 'price-is-latest-known',
      statement: `A price is treated as current for ${PORTFOLIO_PRICE_MAX_AGE_HOURS} hours after it was observed, which spans a market weekend. Every price in the result carries its own age.`,
      origin: 'engine',
    });
  }
  if (valuationComplete) {
    assumptions.push({
      id: 'valuation-is-complete',
      statement:
        'Every position could be priced, so a share of the portfolio is computed over the whole document rather than a subset.',
      origin: 'engine',
    });
  }
  if (singleMoneyCurrency && assessment.positions.length > 0) {
    assumptions.push({
      id: 'no-currency-conversion',
      statement:
        'No currency was converted. Figures are in the currency they were declared in, and a combined total exists only where there was one currency to combine.',
      origin: 'engine',
    });
  }
  return assumptions;
}

/* ------------------------------------------------------------------ */
/* Insights                                                            */
/* ------------------------------------------------------------------ */

export interface InsightInput {
  metrics: PortfolioMetrics;
  assessment: PortfolioDocumentAssessment;
  /** The declared context, when there is one. An insight that needs it is not produced without it. */
  context?: TradingContext | null;
}

function severityFrom(value: number, watch: number, elevated: number): PortfolioInsightSeverity {
  if (value >= elevated) return 'elevated';
  if (value >= watch) return 'watch';
  return 'observation';
}

function source(kind: InsightSource['kind'], ref: string): InsightSource {
  return { kind, ref };
}

function percent(value: number): string {
  return `${value.toFixed(2)}%`;
}

/**
 * Derive the observations the product is allowed to make.
 *
 * Every insight is written here in the system's own words and carries its metrics, its
 * sources, its assumptions, its confidence and its limitations. None of them is a
 * recommendation: an insight says what was measured and what the measurement rests on,
 * and the loudest it can be is `elevated`. What this function cannot do is state that
 * anything *should* change, because there is no field for it and no phrasing that would
 * fit one.
 *
 * An insight is produced only when its subject actually exists. A portfolio with no
 * positions produces a single observation about that, not eight empty ones — an insight
 * with nothing behind it is noise, and noise is what teaches people to ignore the ones
 * that matter.
 */
export function derivePortfolioInsights(input: InsightInput): PortfolioInsight[] {
  const { metrics, assessment } = input;
  const observedAt = metrics.observedAt;
  const insights: PortfolioInsight[] = [];

  if (assessment.positions.length === 0) {
    return [
      {
        id: 'missing-information',
        type: 'missing-information',
        severity: 'observation',
        title: 'No composition has been declared yet',
        explanation:
          'The portfolio holds nothing, so there is no composition to measure, no exposure to characterise and no figure to check. Nothing has been inferred in its place.',
        metrics: [{ label: 'Positions declared', value: '0' }],
        sources: [source('portfolio', 'declared-composition')],
        assumptions: ['The portfolio is exactly as declared.'],
        confidence: 'missing',
        observedAt,
        limitations: [
          'Nothing can be measured until the composition is declared.',
          'The product never infers a holding from what you have written elsewhere.',
        ],
      },
    ];
  }

  const declared = metrics.weights.byDeclaredWeight;
  const valued = metrics.weights.byMarketValue;

  /* Data quality — what the figures rest on. */
  const unpriced = assessment.positions.filter((state) => state.price === null).length;
  const stale = assessment.positions.filter(
    (state) => state.priceAgeHours !== null && state.priceAgeHours > PORTFOLIO_PRICE_MAX_AGE_HOURS,
  ).length;
  const unverified = assessment.positions.filter(
    (state) => state.priceTrust !== null && state.priceTrust === 'unverified',
  ).length;
  const withoutCost = metrics.positions.filter(
    (entry) => entry.marketValue !== null && entry.costBasis === null,
  ).length;

  insights.push({
    id: 'data-quality',
    type: 'data-quality',
    severity:
      unpriced > 0 || !metrics.valuationComplete
        ? 'elevated'
        : stale > 0 || unverified > 0 || withoutCost > 0
          ? 'watch'
          : 'observation',
    title:
      metrics.valuationComplete && stale === 0 && unverified === 0
        ? 'Every position could be priced from verified data'
        : 'Some figures rest on prices that are missing, old or unverified',
    explanation:
      'Each figure below states what it was computed from. Where a price is absent, its market value is absent rather than estimated; where a price is old or carries unverified provenance, the figure is reported with that fact attached.',
    metrics: [
      { label: 'Positions', value: String(assessment.positions.length) },
      { label: 'Priced', value: String(assessment.coverage.priced) },
      { label: 'No price', value: String(unpriced) },
      { label: `Older than ${PORTFOLIO_PRICE_MAX_AGE_HOURS}h`, value: String(stale) },
      { label: 'Unverified provenance', value: String(unverified) },
      { label: 'No cost basis', value: String(withoutCost) },
    ],
    sources: [
      source('portfolio', 'declared-composition'),
      source('market-data', 'position-prices'),
    ],
    assumptions: metrics.assumptions
      .filter((entry) => entry.id === 'price-is-latest-known')
      .map((entry) => entry.statement),
    confidence: metrics.valuationComplete ? 'confirmed' : 'missing',
    observedAt,
    limitations: [
      'A price the product was not given does not exist for it, and is never carried forward from an earlier observation.',
      'Provenance is reported as declared: the product does not independently verify a price it was handed.',
    ],
  });

  /* Allocation — how the composition breaks down. */
  const allocation = valued ?? declared;
  if (allocation !== null) {
    const basis =
      allocation.basis === 'market-value'
        ? 'market value, so every position was priceable'
        : 'declared shares, which need no price';
    insights.push({
      id: 'allocation',
      type: 'allocation',
      severity: 'observation',
      title: 'How the composition breaks down by category',
      explanation: `The shares below are computed on ${basis}. Each category states how many positions it holds, so a category that is one position cannot be read as a diversified basket.`,
      metrics: allocation.byAssetClass.map((bucket) => ({
        label: `${bucket.label} (${bucket.positions} position${bucket.positions === 1 ? '' : 's'})`,
        value: percent(bucket.weightPercent),
      })),
      sources: [source('portfolio', 'declared-composition')],
      assumptions: metrics.assumptions.map((entry) => entry.statement),
      confidence: allocation.basis === 'market-value' ? 'derived' : 'confirmed',
      observedAt,
      limitations: [
        `This breakdown covers ${percent(allocation.totalPercent)} of the document, which is the share this population accounts for.`,
        'The description is of the composition you declared and nothing else.',
      ],
    });
  }

  /* Concentration — the one figure that genuinely needs the whole. */
  const concentrationSet = valued ?? declared;
  if (concentrationSet !== null && concentrationSet.positions > 1) {
    insights.push({
      id: 'concentration',
      type: 'concentration',
      severity: severityFrom(
        concentrationSet.top1Percent,
        CONCENTRATION_WATCH_PERCENT,
        CONCENTRATION_ELEVATED_PERCENT,
      ),
      title: 'How much of the composition sits in a single position',
      explanation: `The largest position accounts for ${percent(concentrationSet.top1Percent)} of ${valued !== null ? 'the market value of the portfolio' : 'the shares you declared'}. The next two largest together would bring that to ${percent(concentrationSet.top3Percent)}. This is a measurement of what you described, reported against the level this product marks rather than against a limit anyone set.`,
      metrics: [
        { label: 'Largest position', value: percent(concentrationSet.top1Percent) },
        { label: 'Three largest', value: percent(concentrationSet.top3Percent) },
        { label: 'Five largest', value: percent(concentrationSet.top5Percent) },
        {
          label: `Marked at ${CONCENTRATION_WATCH_PERCENT}%`,
          value: concentrationSet.top1Percent >= CONCENTRATION_WATCH_PERCENT ? 'above' : 'below',
        },
      ],
      sources: [source('portfolio', 'declared-composition')],
      assumptions: metrics.assumptions.map((entry) => entry.statement),
      confidence: concentrationSet.basis === 'market-value' ? 'derived' : 'confirmed',
      observedAt,
      limitations: [
        'Concentration is a property of the composition, not a statement about its outcome. Two positions in one category can be far more related than their shares suggest.',
        'The product holds no correlation data for this build, so it cannot say how much two holdings move together.',
      ],
    });

    insights.push({
      id: 'diversification',
      type: 'diversification',
      severity: 'observation',
      title: 'How many independent positions the composition effectively holds',
      explanation: `An equally-sized portfolio that was this concentrated would hold about ${concentrationSet.effectivePositions.toFixed(1)} positions. That number is computed from the Herfindahl index over the positions below, and it counts positions rather than what they are exposed to.`,
      metrics: [
        { label: 'Positions declared', value: String(concentrationSet.positions) },
        { label: 'Effectively', value: concentrationSet.effectivePositions.toFixed(1) },
        { label: 'Index', value: concentrationSet.hhi.toFixed(4) },
      ],
      sources: [source('portfolio', 'declared-composition')],
      assumptions: metrics.assumptions.map((entry) => entry.statement),
      confidence: 'derived',
      observedAt,
      limitations: [
        'The index counts positions, not exposures: two positions in the same category count as two.',
        'A position that is itself a fund or an index would count as one here, and the product cannot see inside it.',
      ],
    });
  }

  /* Exposure — by currency, and by category where the value is known. */
  if (allocation !== null) {
    const multiCurrency = allocation.byCurrency.length > 1;
    insights.push({
      id: 'risk-exposure',
      type: 'risk-exposure',
      severity: 'observation',
      title: multiCurrency
        ? 'Where the composition is exposed by currency'
        : 'Where the composition is exposed by category',
      explanation: multiCurrency
        ? 'The positions are declared in more than one currency. The product reports each currency as its own group rather than converting between them, because no rate source is wired and a converted total would be an invented one.'
        : `The composition is declared in a single currency, ${metrics.baseCurrency}. The categories below are the exposure the description carries, in the order they dominate it.`,
      metrics: (multiCurrency ? allocation.byCurrency : allocation.byAssetClass).map((bucket) => ({
        label: `${bucket.label} (${bucket.positions} position${bucket.positions === 1 ? '' : 's'})`,
        value: percent(bucket.weightPercent),
      })),
      sources: [source('portfolio', 'declared-composition')],
      assumptions: metrics.assumptions.map((entry) => entry.statement),
      confidence: 'confirmed',
      observedAt,
      limitations: [
        'An exposure bucket is a property of the label you declared, not of what the holding does.',
        'The product reports the exposure; it does not judge whether it is appropriate for anyone.',
      ],
    });
  }

  /* Horizon — the pairing, reported and not resolved. */
  const horizon = input.context?.horizon?.value ?? null;
  if (
    horizon !== null &&
    SHORT_HORIZONS.has(horizon) &&
    concentrationSet !== null &&
    concentrationSet.top1Percent >= SHORT_HORIZON_CONCENTRATION_PERCENT
  ) {
    insights.push({
      id: 'horizon-mismatch',
      type: 'horizon-mismatch',
      severity: 'watch',
      title: 'A short stated horizon and a concentrated composition',
      explanation: `You declared a horizon of ${horizon} and a composition whose largest position is ${percent(concentrationSet.top1Percent)}. The product reports both declarations together. It does not decide which of them governs, and it does not say that either is wrong to have made.`,
      metrics: [
        { label: 'Declared horizon', value: horizon },
        { label: 'Largest position', value: percent(concentrationSet.top1Percent) },
        {
          label: `Reported at ${SHORT_HORIZON_CONCENTRATION_PERCENT}%`,
          value: 'above',
        },
      ],
      sources: [source('portfolio', 'declared-composition'), source('context', 'horizon')],
      assumptions: [
        'The horizon is the one you declared and has not been interpreted on your behalf.',
        ...metrics.assumptions.map((entry) => entry.statement),
      ],
      confidence: 'derived',
      observedAt,
      limitations: [
        'The observation is that two declarations sit together, not that they conflict. Settling that is yours to do.',
        'The product does not know when a position was opened, so it cannot tell how long it has been held.',
      ],
    });
  }

  /* Liquidity — what the product cannot say. */
  insights.push({
    id: 'liquidity',
    type: 'liquidity',
    severity: 'observation',
    title: 'Liquidity cannot be assessed from what is declared',
    explanation:
      'How quickly a position could be exited depends on the traded volume of the instrument and the size of the order relative to it. The product holds no volume data and no order book, and a portfolio description carries no size in currency terms beyond what a price makes visible, so nothing here is a statement about liquidity.',
    metrics: [
      { label: 'Positions declared', value: String(assessment.positions.length) },
      { label: 'Volume data', value: 'not available' },
    ],
    sources: [source('portfolio', 'declared-composition')],
    assumptions: [],
    confidence: 'missing',
    observedAt,
    limitations: [
      'No liquidity figure is produced, because none can be computed honestly from a declared composition.',
      'A category label is not a liquidity statement: an index is not liquid or illiquid on its own, only its instruments are.',
    ],
  });

  /* Missing information — what would close the gaps. */
  if (metrics.gaps.length > 0) {
    insights.push({
      id: 'missing-information',
      type: 'missing-information',
      severity: metrics.valuationComplete ? 'observation' : 'watch',
      title: 'What would have to be declared before a missing figure could exist',
      explanation:
        'Each figure the product could not produce is listed with the condition that would close it. None of them has been filled with a default, and none has been estimated from the positions beside it.',
      metrics: metrics.gaps.map((gap) => ({ label: gap.code, value: gap.detail })),
      sources: [source('portfolio', 'declared-composition')],
      assumptions: [],
      confidence: 'missing',
      observedAt,
      limitations: [
        'A gap is a refusal to compute, not a problem to work around: a figure produced from a default here would be one nobody could check.',
        ...metrics.gaps.map((gap) => gap.remedies.join(' ')),
      ],
    });
  }

  return insights;
}

/* ------------------------------------------------------------------ */
/* The one entry point                                                 */
/* ------------------------------------------------------------------ */

/**
 * Analyse a portfolio: the reading, the arithmetic and the observations, computed
 * together so they cannot disagree.
 *
 * The three are returned as one value because a caller that assembled them separately
 * would be able to pair a reading with metrics from a different document — and the
 * finding-versus-figure mismatch that would follow is the kind of bug that is invisible
 * until someone relies on it.
 */
export function analysePortfolio(input: {
  portfolio: Portfolio;
  now: number;
  context?: TradingContext | null;
}): PortfolioAnalysis {
  const assessment = assessPortfolioDocument(input.portfolio, input.now);
  const metrics = computePortfolioMetrics(input.portfolio, input.now, assessment);
  const insights = derivePortfolioInsights({
    metrics,
    assessment,
    ...(input.context === undefined ? {} : { context: input.context }),
  });
  return { assessment, metrics, insights };
}

/* ------------------------------------------------------------------ */
/* The tool — how the model may reach this arithmetic                   */
/* ------------------------------------------------------------------ */

/**
 * The tool input.
 *
 * `now` is an **input**, not a clock read, and that is what keeps the tool deterministic
 * in the sense the package requires: the same document and the same instant always
 * produce the same result, and a test can pin the instant instead of waiting for one.
 */
export interface PortfolioComposeInput {
  portfolio: Portfolio;
  now: number;
  context?: TradingContext | null;
}

/**
 * The tool.
 *
 * It exists so the *model* can reach portfolio arithmetic without performing any of it:
 * the agent may ask for a composition to be computed, and what comes back is a report of
 * what deterministic code produced. The capability is `portfolio.calculate`, which the
 * permission table grants to `model` explicitly — deny-by-default means it would
 * otherwise be refused, and a refusal here is the correct behaviour rather than a
 * permission the registry should have improvised.
 *
 * `epistemicKind` is `analysis` rather than `fact`, deliberately: the metrics inside are
 * arithmetic over a declared document, but the envelope also carries **observations**
 * derived from them, and labelling the whole thing a fact would overstate the part of it
 * that interprets. A consumer that wants the facts reads `metrics`; the label describes
 * the envelope honestly.
 */
export const portfolioComposeTool: Tool<PortfolioComposeInput, ToolResult<PortfolioAnalysis>> = {
  descriptor: {
    name: 'portfolio.compose',
    category: 'portfolio',
    capabilities: ['portfolio.calculate'],
    semantics: { epistemicKind: 'analysis', hasSideEffects: false },
    description:
      'Value a declared portfolio deterministically: composition, cost basis, unrealised profit, concentration and exposure, with the gaps named rather than filled.',
    version: '1.0.0',
  },
  run(input): ToolResult<PortfolioAnalysis> {
    if (input === null || typeof input !== 'object' || input.portfolio === undefined) {
      return err('portfolio must be supplied');
    }
    if (!Array.isArray(input.portfolio.positions)) {
      return err('portfolio.positions must be an array');
    }
    if (typeof input.now !== 'number' || !Number.isFinite(input.now)) {
      return err('now must be a finite instant in milliseconds');
    }
    return ok(
      analysePortfolio({
        portfolio: input.portfolio,
        now: input.now,
        ...(input.context === undefined ? {} : { context: input.context }),
      }),
    );
  },
};
