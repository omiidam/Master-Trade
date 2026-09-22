/**
 * Input quality and the readiness gate.
 *
 * The claims this suite exists to defend:
 *
 *   1. **Nothing is invented.** A missing value stays missing, and the only
 *      substitution the gate accepts is one the user declared.
 *   2. **The classification names the most severe condition**, and all seven are
 *      reachable — a label that can never be produced is a label nobody tested.
 *   3. **The verdict is explained**, and the explanation is derived from an
 *      enumerated vocabulary rather than from free text.
 *   4. **No user prose, and no per-position detail, reaches an assessment.** An
 *      assessment is designed to be logged verbatim, so this is a property of the
 *      data shape, not a discipline.
 *   5. **It is deterministic.** The same inputs and the same clock produce the same
 *      decision, which is what makes it reproducible from a log.
 */

import { describe, expect, it } from 'vitest';
import {
  INPUT_VALIDATION_RULES,
  NO_MARKET_DATA,
  QUALITY_DIMENSIONS,
  analyseQualityInputs,
  evaluateInputs,
  isUsableValue,
  representInput,
  validateField,
  type MarketDataInput,
} from '../packages/shared/src/quality/model.js';
import {
  ANALYSIS_REQUIREMENTS,
  ANALYSIS_TYPES,
  CLASSIFICATION_ORDER,
  READINESS_MEANING,
  assessAnalysisReadiness,
  classify,
  describeDecisionCode,
  requirementFor,
} from '../packages/shared/src/quality/readiness.js';
import {
  FIELD_KEYS,
  emptyContext,
  statedField,
  type FieldKey,
  type Holding,
  type TradingContext,
} from '../packages/shared/src/profile/model.js';
import { CAPABILITY_CATALOGUE } from '../packages/shared/src/capabilities/registry.js';

const NOW = Date.parse('2026-09-21T12:00:00.000Z');
const day = 86_400_000;
const iso = (offsetDays: number): string => new Date(NOW + offsetDays * day).toISOString();

/** A context with everything the risk capability needs, stated and fresh. */
function fullContext(observedAt = iso(0)): TradingContext {
  return {
    ...emptyContext(observedAt),
    experienceLevel: statedField('intermediate', observedAt),
    markets: statedField(['equity'], observedAt),
    instruments: statedField(['AAPL', 'MSFT'], observedAt),
    tradingStyle: statedField('swing', observedAt),
    timeframe: statedField('4h', observedAt),
    learningGoals: statedField(['risk-management'], observedAt),
    capitalRange: statedField('10k-50k', observedAt),
    riskTolerance: statedField('balanced', observedAt),
    horizon: statedField('weeks', observedAt),
    holdings: statedField<Holding[]>(
      [
        { symbol: 'AAPL', assetClass: 'equity', weightPercent: 40 },
        { symbol: 'MSFT', assetClass: 'equity', weightPercent: 25 },
      ],
      observedAt,
    ),
    constraints: statedField(
      [{ id: 'c1', statement: 'No leverage', source: 'user-stated' }],
      observedAt,
    ),
  };
}

/**
 * The same context, with two declared markets.
 *
 * `market.structure` consumes `instruments`, and a single declared market alongside
 * several instruments is a *question* in the profile model ("confirm every instrument
 * belongs to that market"). That is correct behaviour and it would otherwise mask what
 * these tests are about, so the structure cases declare two markets.
 */
function structureContext(observedAt = iso(0)): TradingContext {
  return { ...fullContext(observedAt), markets: statedField(['equity', 'fx'], observedAt) };
}

/** A usable historical series: recent, long enough, and reported as passing. */
function goodMarketData(overrides: Partial<MarketDataInput> = {}): MarketDataInput {
  return {
    available: true,
    provenance: 'historical',
    barCount: 400,
    qualityPassed: true,
    lastBarAt: new Date(NOW - 3_600_000).toISOString(),
    source: 'test-provider',
    detail: 'A 400-bar historical series from test-provider.',
    ...overrides,
  };
}

function assess(
  analysisType: string,
  context: TradingContext,
  marketData: MarketDataInput = NO_MARKET_DATA,
  premises: readonly FieldKey[] = [],
) {
  return assessAnalysisReadiness({ analysisType, context, marketData, premises, now: NOW });
}

/* ------------------------------------------------------------------ */
/* Redaction                                                           */
/* ------------------------------------------------------------------ */

describe('representations never carry what an assessment must not', () => {
  it('withholds free text and per-position detail', () => {
    const secret = 'Account IBAN DE89 3704 0044 0532 0130 00, never above 10%';
    const constraints = representInput('constraints', [
      { id: 'c1', statement: secret, source: 'user-stated' },
    ]);
    expect(constraints).toEqual({ kind: 'withheld', reason: 'free-text', count: 1 });

    const holdings = representInput('holdings', [
      { symbol: 'AAPL', assetClass: 'equity', weightPercent: 60 },
      { symbol: 'MSFT', assetClass: 'equity', weightPercent: 30 },
    ]);
    // The aggregate the allocation rule is about, and nothing per row.
    expect(holdings).toEqual({ kind: 'allocation', count: 2, totalWeightPercent: 90 });
    expect(JSON.stringify(holdings)).not.toContain('AAPL');
  });

  it('never reproduces a user statement anywhere in an assessment', () => {
    const secret = 'IBAN DE89 3704 0044 0532 0130 00';
    const context: TradingContext = {
      ...fullContext(),
      constraints: statedField(
        [{ id: 'c1', statement: `Keep cash for ${secret}`, source: 'user-stated' }],
        iso(0),
      ),
      instruments: statedField(['SECRETSYM'], iso(0)),
    };
    const decision = assess('market.structure', structureContext(), goodMarketData());
    const serialised = JSON.stringify(decision);

    expect(serialised).not.toContain(secret);
    expect(serialised).not.toContain('DE89');
    expect(serialised).not.toContain('SECRETSYM');

    // A decision reports only the inputs its capability consumes, so the constraint is
    // read from the context-level report instead — which is the whole context.
    const report = analyseQualityInputs({
      context,
      marketData: NO_MARKET_DATA,
      now: NOW,
    });
    const constraints = report.fields.find((field) => field.field === 'constraints');
    // The count is still reported, so the redaction costs no information.
    expect(constraints?.representation).toEqual({
      kind: 'withheld',
      reason: 'free-text',
      count: 1,
    });
  });

  it('keeps the issue vocabulary closed and the details free of values', () => {
    const context: TradingContext = {
      ...fullContext(),
      holdings: statedField<Holding[]>(
        [
          { symbol: 'AAPL', assetClass: 'equity', weightPercent: 70 },
          { symbol: 'AAPL', assetClass: 'equity', weightPercent: 70 },
        ],
        iso(0),
      ),
    };
    const decision = assess('portfolio.risk', context);
    const codes = new Set(decision.issues.map((found) => found.code));
    for (const code of codes) expect(code).toMatch(/^[a-z][a-z-]+$/);
    // The duplicate is named, and the weights are cited as numbers, never as a row.
    const duplicate = decision.issues.find((found) => found.code === 'duplicate-entry');
    expect(duplicate?.field).toBe('holdings');
    expect(duplicate?.detail).not.toMatch(/weightPercent/);
  });
});

/* ------------------------------------------------------------------ */
/* Field validation                                                    */
/* ------------------------------------------------------------------ */

describe('deterministic field validation', () => {
  it('states its rules once, in code and in text', () => {
    expect(INPUT_VALIDATION_RULES.length).toBeGreaterThan(5);
    for (const rule of INPUT_VALIDATION_RULES) expect(rule.length).toBeGreaterThan(20);
  });

  it('reports an unstated field as unchecked rather than valid', () => {
    const result = validateField('capitalRange', null);
    expect(result.validation).toBe('unchecked');
    expect(result.issues).toEqual([]);
  });

  it('catches a non-finite, negative or out-of-range number', () => {
    const cases: [unknown, string][] = [
      [[{ symbol: 'AAPL', assetClass: 'equity', weightPercent: 'x' }], 'not-a-number'],
      [
        [{ symbol: 'AAPL', assetClass: 'equity', weightPercent: Number.POSITIVE_INFINITY }],
        'non-finite-number',
      ],
      [[{ symbol: 'AAPL', assetClass: 'equity', weightPercent: -5 }], 'negative-value'],
      [[{ symbol: 'AAPL', assetClass: 'equity', weightPercent: 150 }], 'out-of-range'],
    ];
    for (const [value, code] of cases) {
      const result = validateField('holdings', value);
      expect(result.issues.map((found) => found.code)).toContain(code);
      expect(result.validation).toBe('invalid');
    }
  });

  it('refuses an empty list, a malformed symbol and a duplicate holding', () => {
    expect(validateField('markets', []).issues.map((i) => i.code)).toContain('empty-list');
    expect(validateField('instruments', ['']).issues.map((i) => i.code)).toContain(
      'malformed-symbol',
    );
    expect(validateField('instruments', ['A B']).issues.map((i) => i.code)).toContain(
      'malformed-symbol',
    );
    expect(
      validateField('holdings', [
        { symbol: 'AAPL', assetClass: 'equity', weightPercent: 10 },
        { symbol: 'aapl', assetClass: 'equity', weightPercent: 10 },
      ]).issues.map((i) => i.code),
    ).toContain('duplicate-entry');
  });

  it('cannot be talked out of an unsupported market or timeframe', () => {
    expect(validateField('markets', ['equity', 'weather']).issues.map((i) => i.code)).toContain(
      'unsupported-market',
    );
    expect(validateField('timeframe', '3s').issues.map((i) => i.code)).toContain(
      'unsupported-timeframe',
    );
  });

  it('counts an instruction-shaped constraint without quoting it', () => {
    const result = validateField('constraints', [
      { id: 'c1', statement: 'Place order 100 shares when the price drops', source: 'user-stated' },
    ]);
    const found = result.issues.find((issue) => issue.code === 'constraint-is-instruction');
    expect(found?.severity).toBe('blocking');
    expect(found?.detail).toContain('1 constraint');
    expect(found?.detail).not.toContain('100 shares');
  });

  it('distinguishes an impossible allocation from a malformed one', () => {
    const over = validateField('holdings', [
      { symbol: 'AAPL', assetClass: 'equity', weightPercent: 70 },
      { symbol: 'MSFT', assetClass: 'equity', weightPercent: 70 },
    ]);
    // Each weight is a valid weight; together they cannot both hold. A different
    // finding, with a different remedy, so a different code and severity.
    const allocation = over.issues.find((issue) => issue.code === 'allocation-exceeds-portfolio');
    expect(allocation?.severity).toBe('conflicting');
    expect(allocation?.dimension).toBe('consistency');

    const malformed = validateField('holdings', [
      { symbol: 'AAPL', assetClass: 'equity', weightPercent: -1 },
    ]);
    expect(malformed.issues.some((issue) => issue.severity === 'blocking')).toBe(true);
  });

  it('treats "prefer not to say" as an answer that cannot be an input', () => {
    expect(isUsableValue('riskTolerance', 'unspecified')).toBe(false);
    expect(isUsableValue('capitalRange', 'prefer-not-to-say')).toBe(false);
    expect(isUsableValue('riskTolerance', 'balanced')).toBe(true);
    expect(isUsableValue('markets', ['equity'])).toBe(true);
    expect(isUsableValue('markets', null)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* The assessment                                                      */
/* ------------------------------------------------------------------ */

describe('assessment', () => {
  it('marks a fully stated, fresh, consistent context as sufficient', () => {
    const report = analyseQualityInputs({
      context: structureContext(),
      marketData: NO_MARKET_DATA,
      now: NOW,
    });
    const required = report.fields.filter((field) => field.required);
    expect(required.every((field) => field.usable)).toBe(true);
    expect(report.conflicts).toEqual([]);
    // Every required field carries provenance, because every one was dated.
    expect(required.every((field) => field.provenance !== null)).toBe(true);
  });

  it('never defaults a missing field', () => {
    const report = analyseQualityInputs({
      context: emptyContext(iso(0)),
      marketData: NO_MARKET_DATA,
      now: NOW,
    });
    for (const field of report.fields) {
      if (field.field === 'marketData') continue;
      expect(field.usable).toBe(false);
      expect(field.representation).toEqual({ kind: 'absent' });
      expect(field.confidence).toBe('missing');
    }
    expect(report.gaps).toEqual(expect.arrayContaining([...FIELD_KEYS]));
  });

  it('treats an undated claim as an assumption, not a fact', () => {
    const context = fullContext();
    context.riskTolerance = { value: 'balanced', source: 'user-stated', observedAt: null };
    const inputs = evaluateInputs({ context, marketData: NO_MARKET_DATA, now: NOW });
    const risk = inputs.find((input) => input.field === 'riskTolerance');

    expect(risk?.confidence).toBe('assumed');
    expect(risk?.freshness).toBe('undated');
    expect(risk?.provenance).toBeNull();
    // The value is well formed — `usable` says so. What disqualifies it as a *fact* is
    // the missing observation time, and that is `confidence`. The two are separate on
    // purpose: conflating them is how an undated claim becomes a fact.
    expect(risk?.usable).toBe(true);
    expect(risk?.usable && risk.confidence === 'assumed').toBe(true);
  });

  it('ages each field against its own window', () => {
    // 40 days: holdings are stale, a learning goal is not.
    const context = fullContext(iso(-40));
    const inputs = evaluateInputs({ context, marketData: NO_MARKET_DATA, now: NOW });
    expect(inputs.find((input) => input.field === 'holdings')?.freshness).toBe('stale');
    expect(inputs.find((input) => input.field === 'learningGoals')?.freshness).toBe('current');
  });

  it('maps the profile model’s contradictions into the quality vocabulary', () => {
    const context: TradingContext = {
      ...fullContext(),
      tradingStyle: statedField('scalping', iso(0)),
      timeframe: statedField('1d', iso(0)),
    };
    const report = analyseQualityInputs({ context, marketData: NO_MARKET_DATA, now: NOW });
    expect(report.conflicts.length).toBeGreaterThan(0);
    expect(report.conflicts.every((found) => found.dimension === 'consistency')).toBe(true);
  });

  it('adds the risk/horizon tension at this layer, as a question', () => {
    const context: TradingContext = {
      ...fullContext(),
      riskTolerance: statedField('growth-oriented', iso(0)),
      horizon: statedField('intraday', iso(0)),
    };
    const report = analyseQualityInputs({ context, marketData: NO_MARKET_DATA, now: NOW });
    const tension = report.conflicts.find((found) => found.code === 'risk-horizon-tension');
    // Conflicting, never blocking: both declarations are valid, and only the user
    // knows which is current.
    expect(tension?.severity).toBe('conflicting');
    expect(tension?.field).toBe('riskTolerance');
  });

  it('reports every dimension, with the confidence roll-up carrying no codes', () => {
    const report = analyseQualityInputs({
      context: emptyContext(iso(0)),
      marketData: NO_MARKET_DATA,
      now: NOW,
    });
    expect(report.dimensions.map((entry) => entry.dimension)).toEqual([...QUALITY_DIMENSIONS]);
    for (const entry of report.dimensions) expect(entry.question.length).toBeGreaterThan(20);

    // Confidence is a minimum over the required fields, so an empty context fails it;
    // it has no codes of its own because it is a function of the other dimensions.
    const confidence = report.dimensions.find((entry) => entry.dimension === 'confidence');
    expect(confidence?.verdict).toBe('failed');
    expect(confidence?.codes).toEqual([]);
    // Relevance is a property of a particular analysis, so a context report says so.
    expect(report.dimensions.find((entry) => entry.dimension === 'relevance')?.verdict).toBe(
      'not-applicable',
    );
  });
});

/* ------------------------------------------------------------------ */
/* Classification precedence                                           */
/* ------------------------------------------------------------------ */

describe('classification', () => {
  it('has a stated precedence and reaches all seven labels', () => {
    expect(CLASSIFICATION_ORDER).toHaveLength(7);
    const produced = new Set([
      classify({
        invalid: 1,
        conflicting: 0,
        missingRequired: false,
        stale: 0,
        unverified: false,
        advisory: false,
        helpfulMissing: false,
      }),
      classify({
        invalid: 0,
        conflicting: 1,
        missingRequired: true,
        stale: 1,
        unverified: true,
        advisory: true,
        helpfulMissing: true,
      }),
      classify({
        invalid: 0,
        conflicting: 0,
        missingRequired: true,
        stale: 1,
        unverified: true,
        advisory: true,
        helpfulMissing: true,
      }),
      classify({
        invalid: 0,
        conflicting: 0,
        missingRequired: false,
        stale: 1,
        unverified: true,
        advisory: true,
        helpfulMissing: true,
      }),
      classify({
        invalid: 0,
        conflicting: 0,
        missingRequired: false,
        stale: 0,
        unverified: true,
        advisory: true,
        helpfulMissing: true,
      }),
      classify({
        invalid: 0,
        conflicting: 0,
        missingRequired: false,
        stale: 0,
        unverified: false,
        advisory: true,
        helpfulMissing: true,
      }),
      classify({
        invalid: 0,
        conflicting: 0,
        missingRequired: false,
        stale: 0,
        unverified: false,
        advisory: false,
        helpfulMissing: false,
      }),
    ]);
    expect([...produced].sort()).toEqual([...CLASSIFICATION_ORDER].sort());
  });

  it('classifies the worst condition present, not the average', () => {
    const context: TradingContext = {
      ...fullContext(),
      holdings: statedField<Holding[]>(
        [{ symbol: 'AAPL', assetClass: 'equity', weightPercent: 140 }],
        iso(-400),
      ),
      riskTolerance: emptyContext(iso(0)).riskTolerance,
    };
    const decision = assess('portfolio.risk', context);
    // The allocation is malformed *and* stale, and a required field is absent. The
    // label names the one that has to be dealt with first.
    expect(decision.classification).toBe('INVALID');
    expect(decision.readiness).toBe('BLOCKED');
  });
});

/* ------------------------------------------------------------------ */
/* The gate                                                            */
/* ------------------------------------------------------------------ */

describe('the readiness gate', () => {
  it('is ready when every declared requirement is met', () => {
    const decision = assess('portfolio.risk', fullContext(), goodMarketData());
    expect(decision.readiness).toBe('READY_FOR_ANALYSIS');
    expect(decision.outputMode).toBe('full-analysis');
    expect(decision.classification).toBe('SUFFICIENT');
    expect(decision.decidedBy).toBe('all-requirements-met');
    expect(decision.clarifications).toEqual([]);
    expect(decision.assumptions).toEqual([]);
    expect(decision.capability).toBe('planned');
    expect(decision.capabilityNote).toMatch(/not implemented/);
  });

  it('asks rather than guesses when a required input is absent', () => {
    const context = fullContext();
    context.holdings = emptyContext(iso(0)).holdings;
    const decision = assess('portfolio.risk', context);

    expect(decision.readiness).toBe('REQUIRES_CLARIFICATION');
    expect(decision.outputMode).toBe('clarification');
    expect(decision.classification).toBe('INSUFFICIENT');
    expect(decision.decidedBy).toBe('missing-required-input:holdings');
    expect(decision.clarifications.map((question) => question.field)).toContain('holdings');

    // And it says what it will not do about it.
    const refusal = decision.assumptions.find((entry) => entry.field === 'holdings');
    expect(refusal?.origin).toBe('system');
    expect(refusal?.permitted).toBe(false);
    expect(refusal?.reason).toMatch(/reads as authority/);
  });

  it('refuses rather than assuming a risk tolerance', () => {
    const context = fullContext();
    context.riskTolerance = emptyContext(iso(0)).riskTolerance;
    const decision = assess('portfolio.risk', context);

    expect(decision.readiness).toBe('REQUIRES_CLARIFICATION');
    const question = decision.clarifications.find((entry) => entry.field === 'riskTolerance');
    expect(question?.reason).toBe('missing');
    expect(question?.blocking).toBe(true);
    expect(decision.assumptions.some((entry) => entry.field === 'riskTolerance')).toBe(true);
  });

  it('honours a declared refusal to say instead of overriding it', () => {
    const context = fullContext();
    context.riskTolerance = statedField('unspecified', iso(0));
    const decision = assess('portfolio.risk', context);

    expect(decision.readiness).toBe('REQUIRES_CLARIFICATION');
    const question = decision.clarifications.find((entry) => entry.field === 'riskTolerance');
    expect(question?.reason).toBe('refused-to-say');
    expect(question?.question).toMatch(/respected/);
  });

  it('blocks a required input that has aged past its window', () => {
    const context = fullContext();
    // Fresh tolerance and horizon, a six-week-old allocation: a risk figure from it
    // would be meaningless rather than merely imprecise.
    context.riskTolerance = statedField('balanced', iso(0));
    context.horizon = statedField('weeks', iso(0));
    context.holdings = statedField<Holding[]>(
      [{ symbol: 'AAPL', assetClass: 'equity', weightPercent: 40 }],
      iso(-42),
    );
    const decision = assess('portfolio.risk', context);

    expect(decision.classification).toBe('STALE');
    expect(decision.readiness).toBe('BLOCKED');
    expect(decision.decidedBy).toBe('stale-required-input:holdings');
    expect(decision.clarifications.find((entry) => entry.field === 'holdings')?.reason).toBe(
      'stale',
    );
  });

  it('proceeds with limitations and says what they are', () => {
    const context = fullContext();
    context.capitalRange = emptyContext(iso(0)).capitalRange;
    const decision = assess('portfolio.risk', context);

    expect(decision.readiness).toBe('READY_WITH_LIMITATIONS');
    expect(decision.outputMode).toBe('limited-analysis');
    expect(decision.classification).toBe('PARTIALLY_SUFFICIENT');
    expect(decision.limitations.join(' ')).toMatch(/narrower/);
  });

  it('labels a hypothetical when — and only when — the user declared the substitution', () => {
    const context = fullContext();
    context.holdings = emptyContext(iso(0)).holdings;

    const withoutPremise = assess('portfolio.risk', context);
    expect(withoutPremise.readiness).toBe('REQUIRES_CLARIFICATION');
    expect(withoutPremise.outputMode).toBe('clarification');

    const withPremise = assess('portfolio.risk', context, NO_MARKET_DATA, ['holdings']);
    expect(withPremise.readiness).toBe('READY_WITH_LIMITATIONS');
    expect(withPremise.outputMode).toBe('labelled-hypothetical');
    expect(withPremise.decidedBy).toBe('premise-substitution:holdings');
    const notice = withPremise.assumptions.find((entry) => entry.field === 'holdings');
    expect(notice?.origin).toBe('user-premise');
    expect(notice?.permitted).toBe(true);
  });

  it('refuses an analysis type it has never declared', () => {
    const decision = assess('portfolio.guaranteed-returns', fullContext(), goodMarketData());
    expect(decision.analysisType).toBeNull();
    expect(decision.capability).toBeNull();
    expect(decision.classification).toBeNull();
    expect(decision.readiness).toBe('BLOCKED');
    expect(decision.outputMode).toBe('refusal');
    expect(decision.decidedBy).toBe('unsupported-analysis-type');
    // No assessment was performed, so none is reported.
    expect(decision.inputs).toEqual([]);
    expect(decision.dimensions).toEqual([]);
    expect(decision.counts.inputsConsidered).toBe(0);
  });

  it('reads market data against the requirement, not against a global default', () => {
    const context = structureContext();

    const unavailable = assess('market.structure', context, NO_MARKET_DATA);
    expect(unavailable.readiness).toBe('BLOCKED');
    expect(unavailable.decidedBy).toBe('market-data-unavailable');
    // And it is explicit that a question cannot close this gap.
    expect(unavailable.assumptions.find((entry) => entry.field === 'marketData')?.reason).toMatch(
      /does not invent market data/,
    );

    const tooShort = assess(
      'market.structure',
      context,
      goodMarketData({ barCount: 20, detail: 'A 20-bar series.' }),
    );
    expect(tooShort.classification).toBe('PARTIALLY_SUFFICIENT');
    expect(tooShort.readiness).toBe('READY_WITH_LIMITATIONS');
    expect(tooShort.decidedBy).toBe('market-data-below-minimum-bars');
    expect(tooShort.dimensions.find((entry) => entry.dimension === 'relevance')?.verdict).toBe(
      'impaired',
    );
    expect(tooShort.limitations.join(' ')).toMatch(/20 bars/);
  });

  it('classifies a series nobody can vouch for as unverified, and refuses to read it', () => {
    // Bars exist, and nothing says what they are: no label, or no quality report.
    const decision = assess(
      'market.structure',
      structureContext(),
      goodMarketData({ qualityPassed: null }),
    );

    // Usable, nothing required is missing, and we cannot weigh it.
    expect(decision.classification).toBe('UNVERIFIED');
    expect(decision.readiness).toBe('BLOCKED');
    expect(decision.decidedBy).toBe('unverified-market-data');
    expect(decision.dimensions.find((entry) => entry.dimension === 'provenance')?.verdict).toBe(
      'impaired',
    );
  });

  it('treats an assumption as a limitation and an impossible document as invalid', () => {
    // A value marked assumed: legitimate, and not something to build on.
    const assumed = fullContext();
    assumed.experienceLevel = { value: 'intermediate', source: 'assumed', observedAt: iso(0) };
    const limitation = assess('education.explain', assumed);
    expect(limitation.classification).toBe('PARTIALLY_SUFFICIENT');
    expect(limitation.readiness).toBe('READY_WITH_LIMITATIONS');
    expect(limitation.dimensions.find((entry) => entry.dimension === 'reliability')?.verdict).toBe(
      'impaired',
    );

    // A value marked user-stated with no observation time is a different thing
    // entirely: the profile model refuses to store one, so seeing it means the document
    // arrived from somewhere else, and nothing is computed from it.
    const undated = fullContext();
    undated.riskTolerance = { value: 'balanced', source: 'user-stated', observedAt: null };
    const invalid = assess('portfolio.risk', undated);
    expect(invalid.classification).toBe('INVALID');
    expect(invalid.readiness).toBe('BLOCKED');
    expect(invalid.decidedBy).toBe('invalid-input:riskTolerance');

    // The same value on an input the capability only *helps* itself with is a
    // limitation instead: the analysis is unaffected, only narrowed.
    const dated = fullContext();
    dated.capitalRange = { value: '10k-50k', source: 'user-stated', observedAt: null };
    const narrowed = assess('portfolio.risk', dated);
    expect(narrowed.readiness).toBe('READY_WITH_LIMITATIONS');
    expect(narrowed.decidedBy).toBe('invalid-optional-input:capitalRange');
  });

  it('refuses a provenance label the analysis may not work from', () => {
    const decision = assess(
      'market.structure',
      fullContext(),
      goodMarketData({ provenance: 'live' }),
    );
    expect(decision.readiness).toBe('BLOCKED');
    expect(decision.decidedBy).toBe('market-data-provenance-not-permitted');
  });

  it('labels synthetic bars as a training result rather than a measurement', () => {
    const decision = assess(
      'market.structure',
      structureContext(),
      goodMarketData({ provenance: 'synthetic' }),
    );
    // Usable, and never presentable as a measurement: a limitation, not a refusal.
    expect(decision.readiness).toBe('READY_WITH_LIMITATIONS');
    expect(decision.outputMode).toBe('limited-analysis');
    expect(decision.classification).toBe('PARTIALLY_SUFFICIENT');
    expect(decision.limitations.join(' ')).toMatch(/training result/);
  });

  it('reads a sound historical series as sufficient', () => {
    const decision = assess('market.structure', structureContext(), goodMarketData());
    expect(decision.classification).toBe('SUFFICIENT');
    expect(decision.readiness).toBe('READY_FOR_ANALYSIS');
  });

  it('reports what can still be analysed instead of only what is missing', () => {
    const context = fullContext();
    context.holdings = emptyContext(iso(0)).holdings;
    const decision = assess('portfolio.risk', context);
    expect(decision.analysable.length).toBeGreaterThan(0);
    expect(decision.analysable.join(' ')).toMatch(/risk and holding-period concepts/);
  });

  it('is deterministic', () => {
    const first = assess('portfolio.risk', fullContext(), goodMarketData());
    const second = assess('portfolio.risk', fullContext(), goodMarketData());
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('explains its own decision code', () => {
    for (const code of [
      'all-requirements-met',
      'unsupported-analysis-type',
      'missing-required-input:holdings',
      'stale-required-input:holdings',
      'market-data-unavailable',
      'premise-substitution:holdings',
    ]) {
      const text = describeDecisionCode(code);
      expect(text).not.toBe(code);
      expect(text.length).toBeGreaterThan(20);
    }
  });
});

/* ------------------------------------------------------------------ */
/* The registry                                                        */
/* ------------------------------------------------------------------ */

describe('the analysis requirement registry', () => {
  it('declares requirements for every type, and nothing for a type it does not have', () => {
    expect(ANALYSIS_REQUIREMENTS.map((entry) => entry.type)).toEqual([...ANALYSIS_TYPES]);
    for (const entry of ANALYSIS_REQUIREMENTS) {
      expect(requirementFor(entry.type)).toBe(entry);
      expect(entry.inputs.length).toBeGreaterThan(0);
      expect(entry.note.length).toBeGreaterThan(20);
      for (const input of entry.inputs) {
        expect(FIELD_KEYS).toContain(input.field);
        expect(input.why.length).toBeGreaterThan(20);
      }
    }
    expect(requirementFor('nope')).toBeNull();
  });

  it('never lets an input the answer is a function of be assumable', () => {
    // The rule, checked across the registry rather than per capability: a required
    // input may not be substituted, because the substitute would be a different
    // answer rather than a weaker one.
    for (const entry of ANALYSIS_REQUIREMENTS) {
      for (const input of entry.inputs) {
        if (input.necessity === 'required') {
          expect(input.assumable.permitted, `${entry.type}.${input.field}`).toBe(false);
        }
      }
      if (entry.marketData?.necessity === 'required') {
        expect(entry.marketData.permittedProvenance).not.toContain('live');
      }
    }
  });

  it('marks a capability available only where something implements it', () => {
    // Phase 5.7 corrected this set. Phase 5.5 built composition and left the flag reading
    // `planned`, which made the agent path refuse a capability the product already had; the
    // capability registry now *requires* this flag and its own availability to agree, and this
    // pin is the second half of that rule — an exact set, so a capability that quietly became
    // "available" without an implementation fails here.
    const available = ANALYSIS_REQUIREMENTS.filter((entry) => entry.capability === 'available');
    expect(available.map((entry) => entry.type)).toEqual([
      'education.explain',
      'portfolio.composition',
      'decision.evaluation',
    ]);

    // And every available type has a registry entry that agrees about existing, with a named
    // engine wherever the capability produces figures.
    for (const entry of available) {
      const capability = CAPABILITY_CATALOGUE.find(
        (candidate) => candidate.analysisType === entry.type,
      );
      expect(capability, entry.type).toBeDefined();
      expect(capability?.availability, entry.type).toBe('available');
      if (capability?.producesFigures) {
        expect(capability.engineCapability, entry.type).not.toBeNull();
      }
    }
  });

  it('ships the meaning of every readiness outcome with the decision', () => {
    for (const [outcome, meaning] of Object.entries(READINESS_MEANING)) {
      expect(meaning.length).toBeGreaterThan(30);
      expect(outcome).toMatch(/^[A-Z_]+$/);
    }
  });
});
