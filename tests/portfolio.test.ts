/**
 * Portfolio Intelligence — the domain reading and the arithmetic.
 *
 * The claims this suite exists to defend:
 *
 *   1. nothing is invented — a missing price produces `null`, never a carried-forward
 *      figure, and a figure that needs it is `null` too;
 *   2. a share of the whole requires the whole, so a partially-valued portfolio gets no
 *      weights and no concentration, and a named gap instead;
 *   3. two descriptions are never blended — declared weights and market values are two
 *      populations, each stating its own coverage;
 *   4. no currency is converted, so a mixed document has groups and no combined total;
 *   5. the same document and the same instant always produce the same result, to the
 *      last decimal and in the same order;
 *   6. no user-written text reaches a finding or an insight, which is what makes both
 *      safe to log and display verbatim;
 *   7. the portfolio reading can only **narrow** the Phase 5.3 verdict, never widen it.
 */

import { describe, expect, it } from 'vitest';
import {
  MAX_POSITIONS,
  PORTFOLIO_ISSUE_CODES,
  PORTFOLIO_PRICE_MAX_AGE_HOURS,
  assessPortfolioDocument,
  emptyPortfolio,
  round,
  type Portfolio,
  type PortfolioPosition,
  type PortfolioPrice,
} from '../packages/shared/src/portfolio/model.js';
import {
  PORTFOLIO_SCOPES,
  actionFor,
  assessPortfolioReadiness,
  assertPortfolioIssueRules,
  worseReadiness,
} from '../packages/shared/src/portfolio/readiness.js';
import {
  CONCENTRATION_ELEVATED_PERCENT,
  CONCENTRATION_WATCH_PERCENT,
  analysePortfolio,
  computePortfolioMetrics,
  derivePortfolioInsights,
} from '../packages/trading-engine/src/portfolio.js';
import { NO_MARKET_DATA } from '../packages/shared/src/quality/model.js';
import { assessAnalysisReadiness } from '../packages/shared/src/quality/readiness.js';
import {
  emptyContext,
  statedField,
  type TradingContext,
} from '../packages/shared/src/profile/model.js';

const NOW = Date.parse('2026-03-02T12:00:00.000Z');
const AT = (offsetHours = 0): string => new Date(NOW - offsetHours * 3_600_000).toISOString();

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function price(value: number, options: { ageHours?: number; trust?: string } = {}): PortfolioPrice {
  return {
    value,
    currency: 'USD',
    observedAt: AT(options.ageHours ?? 1),
    provenance: {
      source: 'market-data',
      ref: 'fixture/series',
      trust: (options.trust ?? 'verified') as PortfolioPrice['provenance']['trust'],
      recordedAt: AT(options.ageHours ?? 1),
    },
  };
}

function position(overrides: Partial<PortfolioPosition> & { id: string }): PortfolioPosition {
  return {
    symbol: overrides.id.toUpperCase(),
    assetClass: 'equity',
    currency: 'USD',
    quantity: { value: null, source: 'assumed', observedAt: null },
    averageEntryPrice: { value: null, source: 'assumed', observedAt: null },
    price: null,
    weightPercent: null,
    ...overrides,
  };
}

/** A position described the way a fully-informed user describes one. */
function valued(
  id: string,
  quantity: number,
  entry: number,
  current: number,
  extra: Partial<PortfolioPosition> = {},
): PortfolioPosition {
  return position({
    id,
    quantity: { value: quantity, source: 'user-stated', observedAt: AT(48) },
    averageEntryPrice: { value: entry, source: 'user-stated', observedAt: AT(48) },
    price: price(current),
    ...extra,
  });
}

/** A position described by share alone — no quantity, no price. */
function weighted(
  id: string,
  weightPercent: number,
  extra: Partial<PortfolioPosition> = {},
): PortfolioPosition {
  return position({ id, weightPercent, ...extra });
}

function portfolio(positions: readonly PortfolioPosition[]): Portfolio {
  return { ...emptyPortfolio('p1', AT(1)), positions };
}

function baseDecision(analysisType: string, context: TradingContext) {
  return assessAnalysisReadiness({ analysisType, context, marketData: NO_MARKET_DATA, now: NOW });
}

/** A context where every `portfolio.composition` requirement is met. */
function completeContext(): TradingContext {
  return {
    ...emptyContext(AT(1)),
    holdings: statedField(
      [{ symbol: 'AAPL', assetClass: 'equity' as const, weightPercent: 60 }],
      AT(1),
    ),
    markets: statedField(['equity' as const], AT(1)),
    capitalRange: statedField('under-1k' as const, AT(1)),
    constraints: statedField(
      [{ id: 'c1', statement: 'No leverage at any point', source: 'user-stated' as const }],
      AT(1),
    ),
    riskTolerance: statedField('balanced' as const, AT(1)),
    horizon: statedField('years' as const, AT(1)),
  };
}

/* ------------------------------------------------------------------ */
/* Reading the document                                                */
/* ------------------------------------------------------------------ */

describe('portfolio document reading', () => {
  it('reports an empty portfolio as described by nothing, and infers nothing', () => {
    const assessment = assessPortfolioDocument(portfolio([]), NOW);
    expect(assessment.described).toBe(false);
    expect(assessment.usable).toBe(0);
    expect(assessment.positions).toEqual([]);
    expect(assessment.findings.map((found) => found.code)).toContain('no-positions');
    expect(assessment.coverage).toMatchObject({ positions: 0, priced: 0, weighted: 0, costed: 0 });
    expect(assessment.declaredWeightSumPercent).toBeNull();
  });

  it('reads a weight-only description as complete on its own terms', () => {
    const assessment = assessPortfolioDocument(
      portfolio([weighted('a', 60), weighted('b', 40)]),
      NOW,
    );
    expect(assessment.usable).toBe(2);
    // No price is needed for a share, so no price finding is raised at all.
    expect(assessment.findings.map((found) => found.code)).not.toContain('price-missing');
    expect(assessment.findings.map((found) => found.code)).not.toContain('no-basis');
    expect(assessment.declaredWeightSumPercent).toBe(100);
  });

  it('treats a duplicated symbol as unusable rather than choosing a row', () => {
    const assessment = assessPortfolioDocument(
      portfolio([valued('aapl', 10, 100, 120), valued('aapl', 5, 90, 120)]),
      NOW,
    );
    const found = assessment.findings.find((entry) => entry.code === 'duplicate-symbol');
    expect(found?.severity).toBe('conflicting');
    expect(found?.count).toBe(2);
    expect(assessment.usable).toBe(0);
    expect(assessment.positions.every((state) => !state.usable)).toBe(true);
  });

  it('refuses a malformed quantity rather than reading it as a smaller one', () => {
    const assessment = assessPortfolioDocument(
      portfolio([
        position({
          id: 'bad',
          quantity: { value: -5, source: 'user-stated', observedAt: AT(1) },
          price: price(10),
        }),
      ]),
      NOW,
    );
    const found = assessment.findings.find((entry) => entry.code === 'invalid-quantity');
    expect(found?.severity).toBe('blocking');
    expect(assessment.usable).toBe(0);
    expect(assessment.positions[0]?.quantity).toBeNull();
  });

  it('leaves a position with an unrecognised currency out entirely', () => {
    const assessment = assessPortfolioDocument(
      portfolio([
        { ...weighted('x', 50), currency: 'XYZ' as PortfolioPosition['currency'] },
        weighted('y', 50),
      ]),
      NOW,
    );
    const found = assessment.findings.find((entry) => entry.code === 'unsupported-currency');
    expect(found?.severity).toBe('blocking');
    expect(assessment.usable).toBe(1);
    expect(assessment.positions[0]?.usable).toBe(false);
  });

  it('reports a mixed-currency document as conflicting and groups rather than sums', () => {
    const assessment = assessPortfolioDocument(
      portfolio([valued('a', 10, 100, 120), { ...valued('b', 10, 100, 120), currency: 'EUR' }]),
      NOW,
    );
    expect(assessment.singleCurrency).toBe(false);
    expect(assessment.currencies).toEqual(['USD', 'EUR']);
    expect(assessment.findings.find((entry) => entry.code === 'mixed-currency')?.severity).toBe(
      'conflicting',
    );
  });

  it('separates a stale price from an undated one and from an unverified one', () => {
    const stale = assessPortfolioDocument(
      portfolio([valued('a', 1, 1, 1, { price: price(10, { ageHours: 100 }) })]),
      NOW,
    );
    expect(stale.findings.find((entry) => entry.code === 'price-stale')?.severity).toBe('stale');

    const undated = assessPortfolioDocument(
      portfolio([
        valued('a', 1, 1, 1, {
          price: { ...price(10), observedAt: 'not-a-date' },
        }),
      ]),
      NOW,
    );
    expect(undated.findings.map((entry) => entry.code)).toContain('price-undated');

    const unverified = assessPortfolioDocument(
      portfolio([valued('a', 1, 1, 1, { price: price(10, { trust: 'unverified' }) })]),
      NOW,
    );
    expect(unverified.findings.find((entry) => entry.code === 'price-unverified')?.severity).toBe(
      'unverified',
    );
  });

  it('reports declared weights that do not add up as conflicting', () => {
    const assessment = assessPortfolioDocument(
      portfolio([weighted('a', 30), weighted('b', 40)]),
      NOW,
    );
    expect(assessment.declaredWeightSumPercent).toBe(70);
    expect(assessment.findings.find((entry) => entry.code === 'weight-not-whole')?.severity).toBe(
      'conflicting',
    );
  });

  it('does not call a single declared share a portfolio that fails to add up', () => {
    const assessment = assessPortfolioDocument(portfolio([weighted('a', 40)]), NOW);
    expect(assessment.findings.map((entry) => entry.code)).not.toContain('weight-not-whole');
  });

  it('bounds a document rather than reading an unbounded one', () => {
    const many = Array.from({ length: MAX_POSITIONS + 5 }, (_, index) => weighted(`p${index}`, 1));
    const assessment = assessPortfolioDocument(portfolio(many), NOW);
    expect(assessment.truncated).toBe(true);
    expect(assessment.positions).toHaveLength(MAX_POSITIONS);
    expect(assessment.findings.find((entry) => entry.code === 'too-many-positions')?.count).toBe(
      MAX_POSITIONS + 5,
    );
  });

  it('carries no user-written text into a finding', () => {
    const secret = 'my brother in law works at the exchange';
    const assessment = assessPortfolioDocument(
      portfolio([weighted('a', 100, { note: secret })]),
      NOW,
    );
    expect(JSON.stringify(assessment)).not.toContain(secret);
  });

  it('produces the same findings, in the same order, for the same document and instant', () => {
    const document = portfolio([
      weighted('a', 30),
      position({
        id: 'b',
        quantity: { value: -1, source: 'user-stated', observedAt: AT(1) },
      }),
      position({ id: 'c', symbol: 'C' }),
      valued('d', 1, 1, 1, { price: price(1, { ageHours: 200 }) }),
    ]);
    const first = assessPortfolioDocument(document, NOW);
    const second = assessPortfolioDocument(document, NOW);
    expect(second).toEqual(first);
    const order = first.findings.map((entry) => entry.code);
    expect(order).toEqual(
      [...order].sort(
        (a, b) => PORTFOLIO_ISSUE_CODES.indexOf(a) - PORTFOLIO_ISSUE_CODES.indexOf(b),
      ),
    );
  });
});

/* ------------------------------------------------------------------ */
/* The arithmetic                                                      */
/* ------------------------------------------------------------------ */

describe('deterministic portfolio arithmetic', () => {
  it('computes market value, cost basis and unrealised profit from quantity and price', () => {
    const metrics = computePortfolioMetrics(portfolio([valued('a', 10, 100, 120)]), NOW);
    const entry = metrics.positions[0]!;
    expect(entry.marketValue).toBe(1200);
    expect(entry.costBasis).toBe(1000);
    expect(entry.unrealisedPnl).toBe(200);
    expect(entry.unrealisedReturnPercent).toBe(20);
    expect(entry.basis).toBe('quantity-x-price');
    expect(metrics.valuationComplete).toBe(true);
    expect(metrics.totals.marketValue).toBe(1200);
  });

  it('never derives a market value from a declared weight', () => {
    const metrics = computePortfolioMetrics(portfolio([weighted('a', 60), weighted('b', 40)]), NOW);
    expect(metrics.positions.every((entry) => entry.marketValue === null)).toBe(true);
    expect(metrics.totals.marketValue).toBeNull();
    expect(metrics.valuationComplete).toBe(false);
    // The shares still describe the composition, and that is the population that exists.
    expect(metrics.weights.byDeclaredWeight?.totalPercent).toBe(100);
    expect(metrics.weights.byMarketValue).toBeNull();
  });

  it('produces no weights at all when part of the portfolio cannot be priced', () => {
    const metrics = computePortfolioMetrics(
      portfolio([
        valued('a', 10, 100, 120),
        position({
          id: 'b',
          symbol: 'B',
          quantity: { value: 5, source: 'user-stated', observedAt: AT(1) },
        }),
      ]),
      NOW,
    );
    expect(metrics.valuationComplete).toBe(false);
    expect(metrics.weights.byMarketValue).toBeNull();
    // Each priced position's own value is still correct and is still reported.
    expect(metrics.positions[0]?.marketValue).toBe(1200);
    expect(metrics.totals.marketValue).toBe(1200);
    expect(metrics.gaps.map((gap) => gap.code)).toContain('incomplete-valuation');
  });

  it('produces no weights when a position is unusable for any reason', () => {
    const metrics = computePortfolioMetrics(
      portfolio([valued('a', 10, 100, 120), valued('a', 10, 100, 120)]),
      NOW,
    );
    expect(metrics.valuationComplete).toBe(false);
    expect(metrics.weights.byMarketValue).toBeNull();
  });

  it('completes the valuation and the weight set when every position is priced', () => {
    const metrics = computePortfolioMetrics(
      portfolio([
        valued('a', 10, 100, 200),
        valued('b', 10, 100, 100),
        valued('c', 10, 100, 100),
        valued('d', 10, 100, 100),
      ]),
      NOW,
    );
    const set = metrics.weights.byMarketValue;
    expect(set).not.toBeNull();
    expect(set?.totalPercent).toBe(100);
    expect(set?.coveragePercent).toBe(100);
    expect(set?.top1Percent).toBe(40);
    expect(set?.top3Percent).toBe(80);
    // Four equal-ish shares: 40/20/20/20 → HHI 0.16+3(0.04) = 0.28.
    expect(set?.hhi).toBe(0.28);
    expect(set?.effectivePositions).toBe(3.57);
    expect(metrics.positions[0]?.computedWeightPercent).toBe(40);
  });

  it('reports the effective position count of four equal shares as four', () => {
    const metrics = computePortfolioMetrics(
      portfolio([
        valued('a', 1, 1, 100),
        valued('b', 1, 1, 100),
        valued('c', 1, 1, 100),
        valued('d', 1, 1, 100),
      ]),
      NOW,
    );
    expect(metrics.weights.byMarketValue?.hhi).toBe(0.25);
    expect(metrics.weights.byMarketValue?.effectivePositions).toBe(4);
  });

  it('rounds by one declared rule: money and percent to two, concentration to four', () => {
    expect(round(1234.5678, 'money')).toBe(1234.57);
    expect(round((1 / 3) * 100, 'percent')).toBe(33.33);
    expect(round(0.1234567, 'concentration')).toBe(0.1235);
  });

  it('rounds a half away from zero, so a loss and a gain of the same size agree', () => {
    // The naive implementation gives 1.01 and -1.00 for these two, because a binary
    // 1.005 lands below the boundary and `Math.round` sends halves toward +Infinity.
    expect(round(1.005, 'money')).toBe(1.01);
    expect(round(-1.005, 'money')).toBe(-1.01);
    expect(round(2.675, 'money')).toBe(2.68);
    expect(round(-2.675, 'money')).toBe(-2.68);
    for (const value of [1.005, 2.675, 0.125, 10.045]) {
      expect(round(-value, 'money'), `${value} rounds asymmetrically`).toBe(-round(value, 'money'));
    }
  });

  it('leaves a zero and an exact figure alone', () => {
    expect(round(0, 'money')).toBe(0);
    expect(round(100, 'money')).toBe(100);
    expect(Object.is(round(-0, 'money'), 0)).toBe(true);
  });

  it('agrees with itself across two runs', () => {
    const document = portfolio([valued('a', 3.3, 11.11, 22.22), weighted('b', 40)]);
    expect(computePortfolioMetrics(document, NOW)).toEqual(computePortfolioMetrics(document, NOW));
  });

  it('groups money by currency and refuses a combined total', () => {
    const metrics = computePortfolioMetrics(
      portfolio([
        valued('a', 10, 100, 120, { currency: 'USD' }),
        valued('b', 10, 100, 120, { currency: 'EUR' }),
      ]),
      NOW,
    );
    expect(metrics.totals.marketValue).toBeNull();
    expect(metrics.totals.byCurrency).toEqual([
      { currency: 'USD', marketValue: 1200, positions: 1 },
      { currency: 'EUR', marketValue: 1200, positions: 1 },
    ]);
    expect(metrics.gaps.map((gap) => gap.code)).toContain('mixed-currency');
    // And no *share* is formed either. A ratio over two currencies divides money by money
    // that is not the same money, so the same rule that refuses the total has to refuse the
    // population — an earlier build refused the first and quietly performed the second.
    expect(metrics.weights.byMarketValue).toBeNull();
    for (const position of metrics.positions) {
      expect(position.computedWeightPercent).toBeNull();
      // Each position's own value is still correct, in its own currency.
      expect(position.marketValue).toBe(1200);
    }
  });

  it('sums a single-currency portfolio and states the group it came from', () => {
    const metrics = computePortfolioMetrics(
      portfolio([valued('a', 10, 100, 120), valued('b', 5, 100, 120)]),
      NOW,
    );
    expect(metrics.totals.marketValue).toBe(1800);
    expect(metrics.totals.byCurrency).toEqual([
      { currency: 'USD', marketValue: 1800, positions: 2 },
    ]);
  });

  it('reports a named gap when no position carries a cost basis', () => {
    const metrics = computePortfolioMetrics(
      portfolio([
        position({
          id: 'a',
          quantity: { value: 5, source: 'user-stated', observedAt: AT(1) },
          price: price(10),
        }),
      ]),
      NOW,
    );
    expect(metrics.totals.unrealisedPnl).toBeNull();
    expect(metrics.gaps.map((gap) => gap.code)).toContain('no-cost-basis');
    expect(metrics.gaps.every((gap) => gap.remedies.length > 0)).toBe(true);
  });

  it('reports a partial P/L as partial rather than as the portfolio figure', () => {
    const metrics = computePortfolioMetrics(
      portfolio([
        valued('a', 10, 100, 120),
        position({
          id: 'b',
          symbol: 'B',
          quantity: { value: 10, source: 'user-stated', observedAt: AT(1) },
          price: price(50),
        }),
      ]),
      NOW,
    );
    expect(metrics.totals.pnlPositions).toBe(1);
    expect(metrics.unrealisedComplete).toBe(false);
    expect(metrics.gaps.map((gap) => gap.code)).toContain('cost-basis-missing');
  });

  it('counts a zero position as nothing rather than as a loss', () => {
    const metrics = computePortfolioMetrics(
      portfolio([
        position({
          id: 'a',
          quantity: { value: 0, source: 'user-stated', observedAt: AT(1) },
          price: price(10),
        }),
      ]),
      NOW,
    );
    // A quantity of zero is not a finite positive number, so the position is malformed.
    expect(metrics.positions[0]?.quantity).toBeNull();
    expect(metrics.positions[0]?.marketValue).toBeNull();
    expect(metrics.totals.marketValue).toBeNull();
  });

  it('carries its assumptions as data, not as prose', () => {
    const metrics = computePortfolioMetrics(portfolio([valued('a', 1, 1, 1)]), NOW);
    expect(metrics.assumptions.length).toBeGreaterThan(0);
    for (const assumption of metrics.assumptions) {
      expect(assumption.id.length).toBeGreaterThan(0);
      expect(assumption.statement.length).toBeGreaterThan(20);
      expect(['user-declared', 'context', 'engine']).toContain(assumption.origin);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Insights                                                            */
/* ------------------------------------------------------------------ */

describe('portfolio insights', () => {
  it('says exactly one thing about an empty portfolio', () => {
    const document = portfolio([]);
    const assessment = assessPortfolioDocument(document, NOW);
    const insights = derivePortfolioInsights({
      metrics: computePortfolioMetrics(document, NOW, assessment),
      assessment,
    });
    expect(insights).toHaveLength(1);
    expect(insights[0]?.type).toBe('missing-information');
    expect(insights[0]?.confidence).toBe('missing');
  });

  it('gives every insight its metrics, its sources and its limitations', () => {
    const document = portfolio([valued('a', 10, 100, 200), valued('b', 10, 100, 100)]);
    const assessment = assessPortfolioDocument(document, NOW);
    const insights = derivePortfolioInsights({
      metrics: computePortfolioMetrics(document, NOW, assessment),
      assessment,
    });
    expect(insights.length).toBeGreaterThan(3);
    const ids = insights.map((insight) => insight.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const insight of insights) {
      expect(insight.title.length).toBeGreaterThan(10);
      expect(insight.explanation.length).toBeGreaterThan(40);
      expect(insight.sources.length).toBeGreaterThan(0);
      expect(insight.limitations.length).toBeGreaterThan(0);
      expect(insight.observedAt).toBe(new Date(NOW).toISOString());
      expect(['observation', 'watch', 'elevated']).toContain(insight.severity);
    }
  });

  it('escalates a concentration observation by its declared bands', () => {
    const severityOf = (weights: number[]): string => {
      const document = portfolio(weights.map((value, index) => weighted(`p${index}`, value)));
      const assessment = assessPortfolioDocument(document, NOW);
      const insights = derivePortfolioInsights({
        metrics: computePortfolioMetrics(document, NOW, assessment),
        assessment,
      });
      return insights.find((insight) => insight.type === 'concentration')?.severity ?? 'absent';
    };
    expect(severityOf([20, 20, 20, 20, 20])).toBe('observation');
    expect(severityOf([30, 30, 20, 20])).toBe('watch');
    expect(severityOf([60, 20, 20])).toBe('elevated');
    expect(CONCENTRATION_WATCH_PERCENT).toBe(25);
    expect(CONCENTRATION_ELEVATED_PERCENT).toBe(50);
  });

  it('reports a short horizon and a concentrated composition together, and resolves nothing', () => {
    const document = portfolio([
      valued('a', 10, 100, 200),
      valued('b', 10, 100, 100),
      valued('c', 10, 100, 100),
    ]);
    const assessment = assessPortfolioDocument(document, NOW);
    const metrics = computePortfolioMetrics(document, NOW, assessment);

    const withoutContext = derivePortfolioInsights({ metrics, assessment });
    expect(withoutContext.some((insight) => insight.type === 'horizon-mismatch')).toBe(false);

    const longHorizon = { ...emptyContext(AT(1)), horizon: statedField('years' as const, AT(1)) };
    expect(
      derivePortfolioInsights({ metrics, assessment, context: longHorizon }).some(
        (insight) => insight.type === 'horizon-mismatch',
      ),
    ).toBe(false);

    const shortHorizon = { ...emptyContext(AT(1)), horizon: statedField('days' as const, AT(1)) };
    const insights = derivePortfolioInsights({ metrics, assessment, context: shortHorizon });
    const mismatch = insights.find((insight) => insight.type === 'horizon-mismatch');
    expect(mismatch?.severity).toBe('watch');
    expect(mismatch?.explanation).toMatch(/does not decide/);
    expect(mismatch?.sources.map((source) => source.kind)).toContain('context');
  });

  it('states that liquidity cannot be assessed rather than estimating it', () => {
    const document = portfolio([valued('a', 1, 1, 1)]);
    const assessment = assessPortfolioDocument(document, NOW);
    const insights = derivePortfolioInsights({
      metrics: computePortfolioMetrics(document, NOW, assessment),
      assessment,
    });
    const liquidity = insights.find((insight) => insight.type === 'liquidity');
    expect(liquidity?.confidence).toBe('missing');
    expect(liquidity?.metrics.some((metric) => metric.value === 'not available')).toBe(true);
  });

  it('never phrases an insight as an instruction', () => {
    const document = portfolio([valued('a', 10, 100, 200), weighted('b', 30)]);
    const assessment = assessPortfolioDocument(document, NOW);
    const insights = derivePortfolioInsights({
      metrics: computePortfolioMetrics(document, NOW, assessment),
      assessment,
      context: { ...emptyContext(AT(1)), horizon: statedField('intraday' as const, AT(1)) },
    });
    const text = JSON.stringify(insights).toLowerCase();
    for (const forbidden of [
      'you should',
      'we recommend',
      'recommend ',
      'buy ',
      'sell ',
      'reduce your',
      'consider selling',
    ]) {
      expect(text, `an insight reads as advice: ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('carries no user-written text into an insight', () => {
    const secret = 'inherited from my grandfather in 1998';
    const document = portfolio([weighted('a', 100, { note: secret })]);
    const assessment = assessPortfolioDocument(document, NOW);
    const insights = derivePortfolioInsights({
      metrics: computePortfolioMetrics(document, NOW, assessment),
      assessment,
    });
    expect(JSON.stringify(insights)).not.toContain(secret);
  });

  it('returns the reading, the arithmetic and the observations together', () => {
    const result = analysePortfolio({
      portfolio: portfolio([valued('a', 10, 100, 120)]),
      now: NOW,
    });
    expect(result.assessment.positions).toHaveLength(1);
    expect(result.metrics.totals.marketValue).toBe(1200);
    expect(result.insights.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/* The readiness gate                                                  */
/* ------------------------------------------------------------------ */

describe('portfolio readiness', () => {
  it('declares an action for every issue code, in both scopes', () => {
    expect(() => assertPortfolioIssueRules()).not.toThrow();
    const allowed = ['clarify', 'limit', 'block', 'not-applicable'];
    for (const code of PORTFOLIO_ISSUE_CODES) {
      expect(allowed).toContain(actionFor(code, 'portfolio.composition'));
      expect(allowed).toContain(actionFor(code, 'portfolio.risk'));
    }
  });

  it('does not call a complete composition limited because it holds no cost basis', () => {
    // The asymmetry that justifies the table: a composition is a description of what is
    // held, so a missing entry price costs it nothing; a risk read is narrower for it.
    for (const code of ['entry-price-missing', 'cost-basis-missing', 'no-cost-basis'] as const) {
      expect(actionFor(code, 'portfolio.composition')).toBe('not-applicable');
      expect(actionFor(code, 'portfolio.risk')).toBe('limit');
    }
  });

  it('orders readiness, with blocked at the top', () => {
    expect(worseReadiness('READY_FOR_ANALYSIS', 'READY_WITH_LIMITATIONS')).toBe(
      'READY_WITH_LIMITATIONS',
    );
    expect(worseReadiness('BLOCKED', 'READY_FOR_ANALYSIS')).toBe('BLOCKED');
    expect(worseReadiness('REQUIRES_CLARIFICATION', 'READY_WITH_LIMITATIONS')).toBe(
      'REQUIRES_CLARIFICATION',
    );
  });

  it('lets a clean document and a satisfied context reach ready', () => {
    const context = completeContext();
    const decision = assessPortfolioReadiness({
      scope: 'portfolio.composition',
      base: baseDecision('portfolio.composition', context),
      portfolio: portfolio([weighted('a', 60), weighted('b', 40)]),
      now: NOW,
    });
    expect(decision.base.readiness).toBe('READY_FOR_ANALYSIS');
    expect(decision.readiness).toBe('READY_FOR_ANALYSIS');
    expect(decision.decidedBy).toBe('both-readings-clean');
  });

  it('never widens a base refusal, whatever the document says', () => {
    // The base gate refuses because nothing has been declared at all.
    const decision = assessPortfolioReadiness({
      scope: 'portfolio.composition',
      base: baseDecision('portfolio.composition', emptyContext(AT(1))),
      portfolio: portfolio([valued('a', 10, 100, 120)]),
      now: NOW,
    });
    expect(decision.base.readiness).toBe('REQUIRES_CLARIFICATION');
    expect(decision.readiness).toBe('REQUIRES_CLARIFICATION');
    expect(decision.decidedBy).toBe(`base:${decision.base.decidedBy}`);
  });

  it('treats a missing price as a limitation for a composition and a question for a risk read', () => {
    const context = completeContext();
    const document = portfolio([weighted('a', 60), weighted('b', 40)]);

    const composition = assessPortfolioReadiness({
      scope: 'portfolio.composition',
      base: baseDecision('portfolio.composition', context),
      portfolio: document,
      now: NOW,
    });
    expect(composition.readiness).toBe('READY_FOR_ANALYSIS');

    const shortOfPrices = portfolio([
      weighted('a', 60),
      position({
        id: 'b',
        symbol: 'B',
        quantity: { value: 5, source: 'user-stated', observedAt: AT(1) },
      }),
    ]);
    const risk = assessPortfolioReadiness({
      scope: 'portfolio.risk',
      base: baseDecision('portfolio.risk', context),
      portfolio: shortOfPrices,
      now: NOW,
    });
    expect(['REQUIRES_CLARIFICATION', 'BLOCKED']).toContain(risk.readiness);
    expect(risk.clarifications.length).toBeGreaterThan(0);
  });

  it('blocks on a malformed value instead of asking a question about it', () => {
    const decision = assessPortfolioReadiness({
      scope: 'portfolio.composition',
      base: baseDecision('portfolio.composition', completeContext()),
      portfolio: portfolio([
        position({
          id: 'bad',
          quantity: { value: -1, source: 'user-stated', observedAt: AT(1) },
          price: price(10),
        }),
      ]),
      now: NOW,
    });
    expect(decision.readiness).toBe('BLOCKED');
    expect(decision.decidedBy).toBe('portfolio:invalid-quantity');
  });

  it('asks rather than choosing when a symbol is declared twice', () => {
    const decision = assessPortfolioReadiness({
      scope: 'portfolio.composition',
      base: baseDecision('portfolio.composition', completeContext()),
      portfolio: portfolio([weighted('aapl', 50), weighted('aapl', 50)]),
      now: NOW,
    });
    expect(decision.readiness).toBe('REQUIRES_CLARIFICATION');
    const question = decision.clarifications.find(
      (entry) => entry.reason === 'conflicting' && entry.question.includes('twice'),
    );
    expect(question).toBeDefined();
    expect(question?.blocking).toBe(true);
  });

  it('says the capability is planned rather than available', () => {
    for (const scope of PORTFOLIO_SCOPES) {
      const decision = assessPortfolioReadiness({
        scope,
        base: baseDecision(scope, completeContext()),
        portfolio: portfolio([weighted('a', 100)]),
        now: NOW,
      });
      expect(decision.capability).toBe('planned');
      expect(decision.scope).toBe(scope);
    }
  });

  it('keeps the base verdict and the document reading both visible', () => {
    const decision = assessPortfolioReadiness({
      scope: 'portfolio.composition',
      base: baseDecision('portfolio.composition', completeContext()),
      portfolio: portfolio([weighted('a', 60), weighted('b', 40)]),
      now: NOW,
    });
    expect(decision.base).toBeDefined();
    expect(decision.document.described).toBe(true);
    expect(decision.note).toMatch(/only narrow/);
  });

  it('names a stale price as stale in its clarifications', () => {
    const decision = assessPortfolioReadiness({
      scope: 'portfolio.risk',
      base: baseDecision('portfolio.risk', completeContext()),
      portfolio: portfolio([
        valued('a', 10, 100, 120, {
          price: price(120, { ageHours: PORTFOLIO_PRICE_MAX_AGE_HOURS + 1 }),
        }),
      ]),
      now: NOW,
    });
    expect(decision.clarifications.some((entry) => entry.reason === 'stale')).toBe(true);
  });
});
