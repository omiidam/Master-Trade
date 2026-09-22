/**
 * The product foundation, end to end — the five flows Phase 5.9 names.
 *
 * Every other suite in `tests/` proves one phase correct in isolation. This one proves the
 * *joins*, which is what a per-phase suite structurally cannot see: that a value written through
 * the profile route is the value the quality gate reads, that the gate's verdict is the one the
 * capability pipeline stops on, that a blocked turn leaves the credit ledger where it found it,
 * and that no response anywhere reports a figure a deterministic engine did not compute.
 *
 * The five flows, and the property each one is here to defend:
 *
 *   A. **User context → validation → quality → readiness.** The classification is the *same*
 *      one the agent will act on, an impossible document is refused before it is stored, and an
 *      incomplete one is narrowed rather than guessed at.
 *   B. **Portfolio declaration → engine → structured result.** Every number came from the
 *      engine, and a gap is named rather than filled with a zero.
 *   C. **Decision → readiness → evaluation → report.** Both ends of a measurement are required
 *      for a measurement, and half an outcome produces no figures and no evaluation row.
 *   D. **Request → capability → readiness → permission → entitlement → engine → result.** Each
 *      gate is reached, a refusal names the stage that produced it, and a refused turn is not
 *      charged.
 *   E. **Memory → provenance → trust → context.** Trust is stored with a verifier, a model
 *      cannot raise it, and unverified material reaches the model labelled as uncertainty.
 *
 * Two rules run through all five, and they are why the flows go through the real routes rather
 * than calling the pure functions the other suites already cover:
 *
 *   1. **Nothing is fabricated.** A missing price, an unstated field, an absent outcome and an
 *      unimplemented capability each produce a stated gap. No default is substituted, and no
 *      `null` becomes a zero — a zero is a measurement and a refusal is not.
 *   2. **The client is never the source of a result.** Every figure, verdict, balance and
 *      classification in these responses was computed on the server from stored state.
 */

import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { MemoryLogSink } from '../packages/shared/src/core/logging.js';
import {
  TRUST_ORDER,
  contextKindForTrust,
  promoteTrust,
  toolProvenance,
} from '../packages/shared/src/core/provenance.js';
import { PolicyViolationError } from '../packages/shared/src/core/errors.js';
import { resolveConfig } from '../src/core/config.js';
import { createRepositories, migrate, openSqlite, sqliteDriverInfo } from '../src/db/index.js';
import { createServer } from '../src/server/index.js';
import type { ServerDeps } from '../src/server/index.js';
import { assembleContext, section, sectionsFromMemory } from '../src/agent/context.js';
import { InMemoryVectorMemory } from '../src/vector/memory.js';
import { provenance } from '../packages/shared/src/core/provenance.js';
import { buildTurnMessages } from '../src/llm/prompt.js';
import { loadInstructions, renderInstructions } from '../src/instructions/loader.js';
import {
  emptyContext,
  statedField,
  type Holding,
  type TradingContext,
} from '../packages/shared/src/profile/model.js';
import { CAPABILITY_CATALOGUE } from '../packages/shared/src/capabilities/registry.js';
import { EVALUATION_READINESS_RANK } from '../packages/shared/src/decisions/readiness.js';

const driver = sqliteDriverInfo();
const withDatabase = driver.available ? it : it.skip;

/** The rendered safety/operating instruction set, which every prompt must carry. */
const INSTRUCTIONS = renderInstructions(loadInstructions());

const NOW = Date.parse('2026-09-21T12:00:00.000Z');
const day = 86_400_000;
const hour = 3_600_000;
const iso = (offsetDays = 0): string => new Date(NOW + offsetDays * day).toISOString();
const AUTH = (token: string) => ({ authorization: `Bearer ${token}` });

interface Harness {
  repositories: ReturnType<typeof createRepositories>;
  server: ReturnType<typeof createServer>;
  sink: MemoryLogSink;
  close(): Promise<void>;
}

/**
 * A server over a real, migrated database.
 *
 * The flows cross the profile, quality, portfolio, decision, capability and usage repositories,
 * so a stubbed store would let the joins pass while the wiring between them was wrong — which is
 * exactly the class of defect this suite exists to catch.
 */
async function harness(): Promise<Harness> {
  const directory = mkdtempSync(join(tmpdir(), 'mt-flows-'));
  const db = openSqlite({ file: join(directory, 'flows.sqlite') });
  await migrate(db);
  const repositories = createRepositories(db, { now: () => NOW });
  const sink = new MemoryLogSink();
  const deps: ServerDeps = {
    config: resolveConfig({}),
    sink,
    now: () => NOW,
    repositories,
  };
  return {
    repositories,
    server: createServer(deps),
    sink,
    close: async () => {
      await db.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

type Role = 'student' | 'observer' | 'coach' | 'owner';

/**
 * A real account with a real session.
 *
 * The user is created through the identity repository rather than by inventing an id, so the
 * ownership rows these flows depend on are the ones the product would write. A session whose
 * principal does not exist is not the situation any of these flows describes.
 */
async function session(h: Harness, displayName: string, roles: Role[] = ['student']) {
  const user = await h.repositories.identity.createUser({ displayName, timezone: 'UTC' });
  return h.server.sessions.issue({ userId: user.id, roles });
}

/** A context with every required field stated, at a given age. */
function fullContext(observedAt = iso(0)): TradingContext {
  return {
    ...emptyContext(observedAt),
    experienceLevel: statedField('intermediate', observedAt),
    markets: statedField(['equity'], observedAt),
    instruments: statedField(['AAPL'], observedAt),
    tradingStyle: statedField('swing', observedAt),
    timeframe: statedField('4h', observedAt),
    learningGoals: statedField(['risk-management'], observedAt),
    capitalRange: statedField('10k-50k', observedAt),
    riskTolerance: statedField('balanced', observedAt),
    horizon: statedField('weeks', observedAt),
    holdings: statedField<Holding[]>(
      [{ symbol: 'AAPL', assetClass: 'equity', weightPercent: 40 }],
      observedAt,
    ),
    constraints: statedField(
      [{ id: 'c1', statement: 'No leverage', source: 'user-stated' }],
      observedAt,
    ),
  };
}

/** A declaration body: the version and creation time are the route's to decide. */
function contextBody(context: TradingContext) {
  const { version, createdAt, ...body } = context;
  return { context: body };
}

/** A position as a client declares one: quantity, cost basis and, optionally, a price. */
function position(
  symbol: string,
  options: { quantity?: number; entry?: number; price?: number | null; ageHours?: number } = {},
) {
  const observedAt = new Date(NOW - (options.ageHours ?? 1) * hour).toISOString();
  const price = options.price ?? null;
  return {
    symbol,
    assetClass: 'equity' as const,
    currency: 'USD' as const,
    quantity: { value: options.quantity ?? 10, source: 'user-stated' as const, observedAt: null },
    averageEntryPrice: {
      value: options.entry ?? 100,
      source: 'user-stated' as const,
      observedAt: null,
    },
    price:
      price === null
        ? null
        : {
            value: price,
            currency: 'USD' as const,
            observedAt,
            provenance: {
              source: 'market-data' as const,
              ref: 'fixture/series',
              trust: 'verified' as const,
              recordedAt: observedAt,
            },
          },
    weightPercent: null,
  };
}

function portfolioBody(positions: ReturnType<typeof position>[]) {
  return { name: 'Core', baseCurrency: 'USD' as const, cashWeightPercent: null, positions };
}

/** An executed decision with both ends of the measurement on the record. */
function decision(overrides: Record<string, unknown> = {}) {
  const provenance = {
    source: 'user' as const,
    ref: 'flow-test',
    trust: 'verified' as const,
    recordedAt: iso(-2),
  };
  return {
    type: 'buy' as const,
    kind: 'executed' as const,
    decidedAt: iso(-40),
    portfolioId: null,
    symbol: 'AAPL',
    assetClass: 'equity' as const,
    currency: 'USD' as const,
    rationale: 'Breakout retest with the trend.',
    expectation: {
      returnPercent: 8,
      rMultiple: 2,
      invalidation: 'Close back inside the range',
      statement: 'Expecting continuation.',
      source: 'user-stated' as const,
      observedAt: iso(-40),
    },
    risk: {
      plannedRiskPercent: 2,
      stopPrice: 98,
      targetPrice: 116,
      source: 'user-stated' as const,
      observedAt: iso(-40),
    },
    entryPrice: { value: 100, currency: 'USD' as const, observedAt: iso(-40), provenance },
    exitPrice: { value: 106, currency: 'USD' as const, observedAt: iso(-1), provenance },
    markPrice: null,
    marketContext: ['Trend up on the daily'],
    assumptions: [],
    period: { startAt: iso(-40), endAt: iso(-1) },
    tags: ['breakout'],
    recordedAt: iso(-40),
    updatedAt: iso(-40),
    ...overrides,
  };
}

async function declareContext(h: Harness, token: string, context: TradingContext) {
  return h.server.app.inject({
    method: 'PUT',
    url: '/v1/profile',
    headers: AUTH(token),
    payload: contextBody(context),
  });
}

async function assess(h: Harness, token: string, analysisType: string) {
  return h.server.app.inject({
    method: 'POST',
    url: '/v1/quality/assess',
    headers: AUTH(token),
    payload: { analysisType },
  });
}

/* ------------------------------------------------------------------ */
/* Flow A — user context → trading context → validation → quality      */
/* ------------------------------------------------------------------ */

describe('flow A: user context to readiness', () => {
  withDatabase('a complete declaration is ready, and the verdict names its rule', async () => {
    const h = await harness();
    try {
      const auth = await session(h, 'A complete');
      const saved = await declareContext(h, auth.token, fullContext());
      expect(saved.statusCode).toBe(200);

      const assessed = await assess(h, auth.token, 'education.explain');
      expect(assessed.statusCode).toBe(200);
      const body = assessed.json().data;

      // The assessment is computed from what was stored, not from what was sent.
      expect(body.contextSet).toBe(true);
      expect(body.contextVersion).toBe(saved.json().data.version);

      const decision = body.decisions[0];
      expect(decision.requestedType).toBe('education.explain');
      expect(decision.classification).toBe('SUFFICIENT');
      expect(decision.readiness).toBe('READY_FOR_ANALYSIS');
      expect(decision.outputMode).toBe('full-analysis');
      // A classification names the rule that produced it, so the verdict is reproducible.
      expect(decision.decidedBy).toMatch(/\S+/);
      expect(decision.counts.missing).toBe(0);
    } finally {
      await h.close();
    }
  });

  withDatabase('an incomplete declaration narrows the answer instead of guessing', async () => {
    const h = await harness();
    try {
      const auth = await session(h, 'A empty');
      // Nothing declared is a real answer about an empty context, not a 404.
      const body = (await assess(h, auth.token, 'education.explain')).json().data;
      expect(body.contextSet).toBe(false);
      expect(body.contextVersion).toBe(0);

      const decision = body.decisions[0];
      expect(decision.classification).toBe('PARTIALLY_SUFFICIENT');
      expect(decision.readiness).toBe('READY_WITH_LIMITATIONS');
      expect(decision.outputMode).toBe('limited-analysis');
      expect(decision.counts.missing).toBeGreaterThan(0);
      // The limitations are stated, so an answer is read against what it could not use.
      expect(decision.limitations.length).toBeGreaterThan(0);
      // The assumptions the answer *would* need are declared so they are visible rather than
      // silently made — and a system assumption is listed as not permitted to stand in, which
      // is the difference between narrowing an answer and inventing one.
      expect(decision.assumptions.length).toBeGreaterThan(0);
      for (const assumption of decision.assumptions) {
        expect(assumption.statement).toMatch(/\S+/);
        expect(assumption.reason).toMatch(/\S+/);
        if (assumption.origin === 'system') expect(assumption.permitted).toBe(false);
      }
    } finally {
      await h.close();
    }
  });

  withDatabase(
    'a capability that needs the inputs asks for them rather than auditing',
    async () => {
      const h = await harness();
      try {
        const auth = await session(h, 'A needs inputs');
        const decision = (await assess(h, auth.token, 'portfolio.composition')).json().data
          .decisions[0];

        // Composition cannot be described from nothing, so the verdict is insufficient and the
        // system asks — with structured questions, so a surface renders them without parsing prose.
        expect(decision.classification).toBe('INSUFFICIENT');
        expect(decision.readiness).toBe('REQUIRES_CLARIFICATION');
        expect(decision.outputMode).toBe('clarification');
        expect(decision.counts.missing).toBeGreaterThan(0);
        expect(decision.clarifications.length).toBeGreaterThan(0);
        expect(decision.clarifications[0]).toMatchObject({ field: expect.any(String) });
      } finally {
        await h.close();
      }
    },
  );

  withDatabase('a risk/horizon tension conflicts rather than being quietly resolved', async () => {
    const h = await harness();
    try {
      const auth = await session(h, 'A conflict');
      // Growth-oriented tolerance declared with an intraday horizon: the two pull apart. The
      // tension is read for the scope that consumes both, which is the risk scope.
      const contested: TradingContext = {
        ...fullContext(),
        riskTolerance: statedField('growth-oriented', iso(0)),
        horizon: statedField('intraday', iso(0)),
      };
      // A `question`-severity finding is a real conflict the user resolves, so the write succeeds.
      expect((await declareContext(h, auth.token, contested)).statusCode).toBe(200);

      const decision = (await assess(h, auth.token, 'portfolio.risk')).json().data.decisions[0];

      expect(decision.classification).toBe('CONFLICTING');
      expect(decision.counts.conflicting).toBeGreaterThan(0);
      expect(
        decision.issues.some((found: { code: string }) => found.code === 'risk-horizon-tension'),
      ).toBe(true);
      // The user is asked which declaration is current; the system does not pick one.
      expect(decision.outputMode).toBe('clarification');
      expect(decision.readiness).not.toBe('READY_FOR_ANALYSIS');
    } finally {
      await h.close();
    }
  });

  withDatabase('an impossible document is refused, and nothing about it is stored', async () => {
    const h = await harness();
    try {
      const auth = await session(h, 'A impossible');
      const impossible: TradingContext = {
        ...fullContext(),
        holdings: statedField<Holding[]>(
          [
            { symbol: 'AAPL', assetClass: 'equity', weightPercent: 80 },
            { symbol: 'MSFT', assetClass: 'equity', weightPercent: 80 },
          ],
          iso(0),
        ),
      };

      const rejected = await declareContext(h, auth.token, impossible);
      expect(rejected.statusCode).toBe(400);
      expect(rejected.json().error.code).toBe('VALIDATION_FAILED');
      expect(JSON.stringify(rejected.json().error.details)).toContain('holdings');

      // The version did not advance, so no reading can be computed from a bad document.
      const read = await h.server.app.inject({
        method: 'GET',
        url: '/v1/profile',
        headers: AUTH(auth.token),
      });
      expect(read.json().data.version).toBe(0);
      expect(read.json().data.contextSet).toBe(false);
    } finally {
      await h.close();
    }
  });

  withDatabase('stale declarations are classified stale, not silently refreshed', async () => {
    const h = await harness();
    try {
      const auth = await session(h, 'A stale');
      // Old enough that every field is past the freshness policy.
      await declareContext(h, auth.token, fullContext(iso(-400)));

      const decision = (await assess(h, auth.token, 'education.explain')).json().data.decisions[0];

      expect(decision.classification).toBe('STALE');
      // Staleness is reported because it changes the answer, not because it is an error.
      expect(decision.readiness).not.toBe('READY_FOR_ANALYSIS');
      expect(decision.limitations.length).toBeGreaterThan(0);
    } finally {
      await h.close();
    }
  });

  withDatabase('the gate the route reports is the gate the agent acts on', async () => {
    const h = await harness();
    try {
      const auth = await session(h, 'A one gate');
      await declareContext(h, auth.token, fullContext(iso(-400)));

      const routeVerdict = (await assess(h, auth.token, 'education.explain')).json().data
        .decisions[0];

      // The same request through the agent route must stop on the same verdict. Two gates that
      // disagreed would be a system where the panel says "ready" and the turn says "blocked".
      const turn = await h.server.app.inject({
        method: 'POST',
        url: '/v1/agent/messages',
        headers: AUTH(auth.token),
        payload: { message: 'Explain support and resistance.', analysisType: 'education.explain' },
      });
      expect(turn.statusCode).toBe(200);
      const turnVerdict = turn.json().data.readiness;

      expect(turnVerdict.classification).toBe(routeVerdict.classification);
      expect(turnVerdict.readiness).toBe(routeVerdict.readiness);
      expect(turnVerdict.decidedBy).toBe(routeVerdict.decidedBy);
    } finally {
      await h.close();
    }
  });
});

/* ------------------------------------------------------------------ */
/* Flow B — portfolio data → engine → structured result                */
/* ------------------------------------------------------------------ */

describe('flow B: portfolio declaration to structured result', () => {
  withDatabase('a declared composition is valued by the engine, not by the caller', async () => {
    const h = await harness();
    try {
      const auth = await session(h, 'B valued');
      const declared = await h.server.app.inject({
        method: 'PUT',
        url: '/v1/portfolio',
        headers: AUTH(auth.token),
        payload: portfolioBody([position('AAPL', { quantity: 10, entry: 100, price: 120 })]),
      });
      expect(declared.statusCode).toBe(200);
      const body = declared.json().data;

      expect(body.declared).toBe(true);
      // 10 shares at 120 — the engine's arithmetic, complete because both inputs exist.
      expect(body.metrics.totals.marketValue).toBe(1200);
      expect(body.metrics.totals.costBasis).toBe(1000);
      expect(body.metrics.totals.unrealisedPnl).toBe(200);
      expect(body.metrics.valuationComplete).toBe(true);

      // Both scopes get a verdict, so the surface never derives one of its own.
      expect(body.readiness.map((entry: { scope: string }) => entry.scope).sort()).toEqual([
        'portfolio.composition',
        'portfolio.risk',
      ]);
    } finally {
      await h.close();
    }
  });

  withDatabase('a position with no price is a named gap, never a zero', async () => {
    const h = await harness();
    try {
      const auth = await session(h, 'B gap');
      const body = (
        await h.server.app.inject({
          method: 'PUT',
          url: '/v1/portfolio',
          headers: AUTH(auth.token),
          payload: portfolioBody([
            position('AAPL', { quantity: 10, entry: 100, price: 120 }),
            position('MSFT', { quantity: 5, entry: 200, price: null }),
          ]),
        })
      ).json().data;

      // The unpriced position contributes nothing, and nothing is estimated for it.
      expect(body.metrics.totals.marketValue).toBe(1200);
      expect(body.metrics.valuationComplete).toBe(false);
      expect(body.metrics.gaps.map((gap: { code: string }) => gap.code)).toContain(
        'incomplete-valuation',
      );
      // The gap is stated at the document layer too, and surfaced as an observation.
      expect(body.assessment.findings.map((item: { code: string }) => item.code)).toContain(
        'price-missing',
      );
      expect(body.insights.some((item: { type: string }) => item.type === 'data-quality')).toBe(
        true,
      );
    } finally {
      await h.close();
    }
  });

  withDatabase('concentration is observed from the computed weights', async () => {
    const h = await harness();
    try {
      const auth = await session(h, 'B concentration');
      // One position is ~91% of the value, which is past the elevated band.
      const body = (
        await h.server.app.inject({
          method: 'PUT',
          url: '/v1/portfolio',
          headers: AUTH(auth.token),
          payload: portfolioBody([
            position('AAPL', { quantity: 100, entry: 100, price: 120 }),
            position('MSFT', { quantity: 10, entry: 100, price: 120 }),
          ]),
        })
      ).json().data;

      const concentration = body.insights.find(
        (item: { type: string }) => item.type === 'concentration',
      );
      expect(concentration).toBeDefined();
      // Escalated by the declared band rather than described in prose.
      expect(concentration.severity).toBe('elevated');
      // And every insight carries the metrics and sources it rests on.
      expect(concentration.sources.length).toBeGreaterThan(0);
      expect(concentration.metrics.length).toBeGreaterThan(0);
    } finally {
      await h.close();
    }
  });

  withDatabase('an impossible declaration is refused before it is stored', async () => {
    const h = await harness();
    try {
      const auth = await session(h, 'B impossible');
      const rejected = await h.server.app.inject({
        method: 'PUT',
        url: '/v1/portfolio',
        headers: AUTH(auth.token),
        payload: portfolioBody([position('AAPL', { quantity: -10, entry: 100, price: 120 })]),
      });
      expect(rejected.statusCode).toBe(400);
      expect(rejected.json().error.code).toBe('VALIDATION_FAILED');

      // Nothing was declared as a result of the failure.
      const read = await h.server.app.inject({
        method: 'GET',
        url: '/v1/portfolio',
        headers: AUTH(auth.token),
      });
      expect(read.json().data.declared).toBe(false);
      expect(read.json().data.version).toBe(0);
    } finally {
      await h.close();
    }
  });

  withDatabase('a stale price is reported against the freshness policy', async () => {
    const h = await harness();
    try {
      const auth = await session(h, 'B stale price');
      const body = (
        await h.server.app.inject({
          method: 'PUT',
          url: '/v1/portfolio',
          headers: AUTH(auth.token),
          payload: portfolioBody([
            position('AAPL', { quantity: 10, entry: 100, price: 120, ageHours: 24 * 30 }),
          ]),
        })
      ).json().data;

      expect(
        body.assessment.findings.some((item: { code: string }) => /stale/i.test(item.code)),
      ).toBe(true);
      // A stale price still has a value, and the reading says which observation it came from.
      expect(body.metrics.totals.marketValue).toBe(1200);
      expect(body.metrics.observedAt).toMatch(/^\d{4}-/);
    } finally {
      await h.close();
    }
  });

  withDatabase('one account cannot read another account’s composition', async () => {
    const h = await harness();
    try {
      const mine = await session(h, 'B mine');
      const theirs = await session(h, 'B theirs');
      await h.server.app.inject({
        method: 'PUT',
        url: '/v1/portfolio',
        headers: AUTH(mine.token),
        payload: portfolioBody([position('AAPL', { quantity: 10, entry: 100, price: 120 })]),
      });

      const other = await h.server.app.inject({
        method: 'GET',
        url: '/v1/portfolio',
        headers: AUTH(theirs.token),
      });
      expect(other.json().data.declared).toBe(false);
      // No figures exist for an undeclared portfolio — not a zeroed set.
      expect(other.json().data.metrics.totals.marketValue).toBeNull();
    } finally {
      await h.close();
    }
  });
});

/* ------------------------------------------------------------------ */
/* Flow C — decision context → readiness → evaluation → report         */
/* ------------------------------------------------------------------ */

describe('flow C: decision context to evaluation report', () => {
  withDatabase('a decision with both ends recorded evaluates to a report', async () => {
    const h = await harness();
    try {
      const auth = await session(h, 'C complete');
      await declareContext(h, auth.token, fullContext());

      const recorded = await h.server.app.inject({
        method: 'POST',
        url: '/v1/decisions',
        headers: AUTH(auth.token),
        payload: decision(),
      });
      expect(recorded.statusCode).toBe(200);
      const decisionId = recorded.json().data.decision.id as string;

      const evaluated = await h.server.app.inject({
        method: 'POST',
        url: `/v1/decisions/${decisionId}/evaluate`,
        headers: AUTH(auth.token),
        payload: {},
      });
      expect(evaluated.statusCode).toBe(200);
      const data = evaluated.json().data;

      // The reading is at least "ready with limitations", and it names the rule that limited it
      // rather than presenting a caveated result as an unconditional one.
      const readiness = data.readiness.readiness as keyof typeof EVALUATION_READINESS_RANK;
      expect(EVALUATION_READINESS_RANK[readiness]).toBeLessThan(
        EVALUATION_READINESS_RANK.REQUIRES_CLARIFICATION,
      );
      expect(data.readiness.decidedBy).toMatch(/^decision:/);

      // The report carries computed figures and the engine's own outcome.
      expect(data.report).not.toBeNull();
      expect(data.report.figures.length).toBeGreaterThan(0);
      expect(data.report.expectedVersusActual).toBeDefined();
      expect(data.report.outcome).toBe('realised');

      // An evaluation is an attempt, and the attempts are kept against the version read.
      expect(data.evaluations.length).toBe(1);
      expect(data.evaluations[0].decisionVersion).toBe(1);
      expect(data.evaluations[0].outcome).toBe('realised');
    } finally {
      await h.close();
    }
  });

  withDatabase('half an outcome is incomplete, and no row is written for it', async () => {
    const h = await harness();
    try {
      const auth = await session(h, 'C half');
      await declareContext(h, auth.token, fullContext());

      // Executed, but with no exit price and no mark: there is no outcome half at all.
      const recorded = await h.server.app.inject({
        method: 'POST',
        url: '/v1/decisions',
        headers: AUTH(auth.token),
        payload: decision({ exitPrice: null, markPrice: null }),
      });
      const decisionId = recorded.json().data.decision.id as string;

      const data = (
        await h.server.app.inject({
          method: 'POST',
          url: `/v1/decisions/${decisionId}/evaluate`,
          headers: AUTH(auth.token),
          payload: {},
        })
      ).json().data;

      expect(data.readiness.readiness).toBe('INCOMPLETE_OUTCOME_DATA');
      // A partial record produces no figures rather than zeroed ones — a zero is a measurement.
      expect(data.report).toBeNull();
      expect(data.readiness.limitations.length).toBeGreaterThan(0);
      // And no evaluation row is appended for an evaluation that did not happen.
      expect(data.evaluations).toEqual([]);
    } finally {
      await h.close();
    }
  });

  withDatabase(
    'a record with no observable outcome refuses with a reason, not a zero',
    async () => {
      const h = await harness();
      try {
        const auth = await session(h, 'C hypothetical');
        await declareContext(h, auth.token, fullContext());

        // A hypothetical decision with neither an entry nor a mark has no observable outcome.
        const recorded = await h.server.app.inject({
          method: 'POST',
          url: '/v1/decisions',
          headers: AUTH(auth.token),
          payload: decision({
            kind: 'hypothetical',
            entryPrice: null,
            exitPrice: null,
            markPrice: null,
          }),
        });
        const decisionId = recorded.json().data.decision.id as string;

        const data = (
          await h.server.app.inject({
            method: 'POST',
            url: `/v1/decisions/${decisionId}/evaluate`,
            headers: AUTH(auth.token),
            payload: {},
          })
        ).json().data;

        expect(['INCOMPLETE_OUTCOME_DATA', 'BLOCKED', 'REQUIRES_CLARIFICATION']).toContain(
          data.readiness.readiness,
        );
        expect(data.readiness.readiness).not.toBe('READY_FOR_EVALUATION');
        expect(data.readiness.decidedBy).toMatch(/\S+/);
        // A hypothetical is never presented as an observed performance.
        expect(data.report?.outcome).not.toBe('realised');
      } finally {
        await h.close();
      }
    },
  );

  withDatabase('a role that may evaluate another’s decision still cannot read it', async () => {
    const h = await harness();
    try {
      const owner = await session(h, 'C owner');
      const observer = await session(h, 'C observer', ['observer']);
      const recorded = await h.server.app.inject({
        method: 'POST',
        url: '/v1/decisions',
        headers: AUTH(owner.token),
        payload: decision(),
      });
      const decisionId = recorded.json().data.decision.id as string;

      // Recording is a write, and the read-only role has no grant for it.
      const denied = await h.server.app.inject({
        method: 'POST',
        url: '/v1/decisions',
        headers: AUTH(observer.token),
        payload: decision(),
      });
      expect(denied.statusCode).toBe(403);
      expect(denied.json().error.code).toBe('FORBIDDEN');

      // Evaluating changes nothing and places no order, but the decision is not the observer's,
      // so it is addressed as absent rather than as forbidden — an isolation that cannot leak.
      const evaluated = await h.server.app.inject({
        method: 'POST',
        url: `/v1/decisions/${decisionId}/evaluate`,
        headers: AUTH(observer.token),
        payload: {},
      });
      expect(evaluated.statusCode).toBe(404);
    } finally {
      await h.close();
    }
  });
});

/* ------------------------------------------------------------------ */
/* Flow D — request → capability → gates → structured result           */
/* ------------------------------------------------------------------ */

describe('flow D: request to structured capability result', () => {
  withDatabase('an undeclared capability is refused at resolution, deny-by-default', async () => {
    const h = await harness();
    try {
      const auth = await session(h, 'D unknown');
      const turn = await h.server.app.inject({
        method: 'POST',
        url: '/v1/agent/messages',
        headers: AUTH(auth.token),
        payload: { message: 'Do the thing.', capabilityId: 'orders.place' },
      });
      expect(turn.statusCode).toBe(200);
      const body = turn.json().data;

      // A refusal is a complete result: the stage, the code and the state all travel as fields.
      expect(body.status).toBe('blocked');
      expect(body.capability.state).toBe('UNAVAILABLE');
      expect(body.capability.refusedBy).toMatch(/declared|resolv/i);
      // No engine ran, so nothing was computed.
      expect(body.capability.calculations).toEqual([]);
      expect(body.capability.insights).toEqual([]);
    } finally {
      await h.close();
    }
  });

  withDatabase('a declared-but-unbuilt capability says so and asks for nothing', async () => {
    const h = await harness();
    try {
      const auth = await session(h, 'D planned');
      const body = (
        await h.server.app.inject({
          method: 'POST',
          url: '/v1/agent/messages',
          headers: AUTH(auth.token),
          payload: { message: 'Backtest this.', capabilityId: 'backtest.run' },
        })
      ).json().data;

      expect(body.status).toBe('blocked');
      expect(body.capability.state).toBe('UNAVAILABLE');
      expect(body.capability.availability).toBe('coming-soon');
      // Availability outranks a missing input: asking for inputs it could not use would be a lie.
      expect(body.capability.refusedBy).toBe('capability-coming-soon');
      expect(body.capability.nextActions).toEqual([]);
    } finally {
      await h.close();
    }
  });

  withDatabase('a role without the operation never reaches the pipeline at all', async () => {
    const h = await harness();
    try {
      const observer = await session(h, 'D observer', ['observer']);
      const turn = await h.server.app.inject({
        method: 'POST',
        url: '/v1/agent/messages',
        headers: AUTH(observer.token),
        payload: { message: 'Explain this.', capabilityId: 'education.explain' },
      });

      // The route's own operation gate refuses before the registry is consulted, so the strongest
      // claim holds: a role without the grant cannot reach the pipeline, a model or an engine.
      expect(turn.statusCode).toBe(403);
      const error = turn.json().error;
      expect(error.code).toBe('FORBIDDEN');
      expect(error.message).toMatch(/agent\.chat/);
      // No capability result exists to render, and none was computed.
      expect(turn.json().data).toBeUndefined();
      expect(JSON.stringify(turn.json())).not.toMatch(/calculations|insights|evidence/);
    } finally {
      await h.close();
    }
  });

  withDatabase(
    'an available capability runs, and only the engine produces its figures',
    async () => {
      const h = await harness();
      try {
        const auth = await session(h, 'D runs');
        await declareContext(h, auth.token, fullContext());

        const body = (
          await h.server.app.inject({
            method: 'POST',
            url: '/v1/agent/messages',
            headers: AUTH(auth.token),
            payload: {
              message: 'Explain support and resistance.',
              capabilityId: 'education.explain',
            },
          })
        ).json().data;

        expect(body.status).toBe('completed');
        expect(body.capability.state).toBe('READY');
        expect(body.capability.capabilityId).toBe('education.explain');
        // Every calculation names the engine that produced it, so prose cannot be the source.
        for (const calculation of body.capability.calculations) {
          expect(calculation.engine).toMatch(/\S+/);
        }
        // The result carries contract text, so a client never writes its own explanation.
        expect(body.capability.note).toMatch(/deterministic/i);
      } finally {
        await h.close();
      }
    },
  );

  withDatabase('a capability whose inputs are absent asks, and computes nothing', async () => {
    const h = await harness();
    try {
      const auth = await session(h, 'D clarify');
      const body = (
        await h.server.app.inject({
          method: 'POST',
          url: '/v1/agent/messages',
          headers: AUTH(auth.token),
          payload: {
            message: 'How is my portfolio put together?',
            capabilityId: 'portfolio.composition',
          },
        })
      ).json().data;

      expect(body.status).toBe('blocked');
      expect(body.capability.state).toBe('REQUIRES_CLARIFICATION');
      expect(body.capability.calculations).toEqual([]);
      expect(
        body.capability.nextActions.some(
          (action: { kind: string }) => action.kind === 'answer-question',
        ),
      ).toBe(true);
    } finally {
      await h.close();
    }
  });

  withDatabase('a refused turn leaves the ledger where it found it', async () => {
    const h = await harness();
    try {
      const auth = await session(h, 'D credits');
      const before = (
        await h.server.app.inject({ method: 'GET', url: '/v1/usage', headers: AUTH(auth.token) })
      ).json().data.balance;

      const body = (
        await h.server.app.inject({
          method: 'POST',
          url: '/v1/agent/messages',
          headers: AUTH(auth.token),
          payload: {
            message: 'How is my portfolio put together?',
            capabilityId: 'portfolio.composition',
          },
        })
      ).json().data;
      expect(body.capability.state).toBe('REQUIRES_CLARIFICATION');

      // The turn cost nothing, and it says so as data rather than leaving a client to infer it.
      expect(body.usage.charged).toBe(false);
      expect(body.usage.credits).toBe(0);

      const after = (
        await h.server.app.inject({ method: 'GET', url: '/v1/usage', headers: AUTH(auth.token) })
      ).json().data.balance;
      expect(after).toBe(before);

      // The ledger is still the whole story: the claim was returned, so the net for this attempt
      // is zero, and the attempt is recorded as released rather than as a spend.
      const history = (
        await h.server.app.inject({
          method: 'GET',
          url: '/v1/usage/history',
          headers: AUTH(auth.token),
        })
      ).json().data;
      const attemptMovements = history.movements.filter(
        (movement: { correlationId: string | null }) =>
          movement.correlationId === body.correlationId,
      );
      expect(attemptMovements.length).toBeGreaterThan(0);
      const net = attemptMovements.reduce(
        (sum: number, movement: { delta: number }) => sum + movement.delta,
        0,
      );
      expect(net).toBe(0);
      // Only the plan allowance remains as a settled movement; nothing was consumed.
      expect(
        history.movements.filter(
          (movement: { kind: string; status: string }) =>
            movement.kind === 'consume' && movement.status === 'settled',
        ),
      ).toEqual([]);
      expect(
        history.attempts.some((attempt: { status: string }) => attempt.status === 'released'),
      ).toBe(true);
    } finally {
      await h.close();
    }
  });

  withDatabase('the catalogue is the server’s, and every entry states its own rules', async () => {
    const h = await harness();
    try {
      const auth = await session(h, 'D catalogue');
      const body = (
        await h.server.app.inject({
          method: 'GET',
          url: '/v1/capabilities',
          headers: AUTH(auth.token),
        })
      ).json().data;

      // The catalogue is served as data rather than restated by a client.
      expect(body.capabilities.map((entry: { id: string }) => entry.id).sort()).toEqual(
        [...CAPABILITY_CATALOGUE.map((entry) => entry.id)].sort(),
      );
      // Readiness for the caller's own context, with no capability in mind yet.
      expect(body.readiness.length).toBeGreaterThan(0);
      for (const stage of body.stages) {
        expect(stage.meaning).toMatch(/\S+/);
      }
    } finally {
      await h.close();
    }
  });

  withDatabase('no capability anywhere declares an order, a broker or an execution', async () => {
    const h = await harness();
    try {
      const auth = await session(h, 'D no trade');
      const body = (
        await h.server.app.inject({
          method: 'GET',
          url: '/v1/capabilities',
          headers: AUTH(auth.token),
        })
      ).json().data;

      // The identifiers a client would act on, checked field by field: a description may mention
      // a broker in order to say there is none, but nothing an execution could be keyed on may.
      const forbidden = /order|broker|execute|live/i;
      for (const capability of body.capabilities) {
        expect(capability.id, capability.id).not.toMatch(forbidden);
        expect(String(capability.operation ?? ''), capability.id).not.toMatch(forbidden);
        expect(String(capability.feature ?? ''), capability.id).not.toMatch(forbidden);
      }
      // And the pipeline the server reports holds no stage that could trade.
      const stageIds = body.stages.map((stage: { id: string }) => stage.id);
      expect(stageIds.join(' ')).not.toMatch(forbidden);
      expect(stageIds.length).toBeGreaterThan(0);
    } finally {
      await h.close();
    }
  });
});

/* ------------------------------------------------------------------ */
/* Flow E — memory → validation → provenance → trust → usage           */
/* ------------------------------------------------------------------ */

describe('flow E: memory provenance and trust', () => {
  withDatabase('a record is unverified unless a human verified it', async () => {
    const h = await harness();
    try {
      const user = await h.repositories.identity.createUser({
        displayName: 'E memory',
        timezone: 'UTC',
      });
      const record = await h.repositories.memory.create({
        userId: user.id,
        type: 'lesson-note',
        text: 'Stop placement follows structure, not a fixed distance.',
        provenance: { source: 'lesson', ref: 'risk-basics' },
        epistemicKind: 'analysis',
        createdBy: 'system',
      });
      expect(record.trust).toBe('unverified');

      // Automation cannot promote its own output. The repository refuses at the write.
      await expect(
        h.repositories.memory.create({
          userId: user.id,
          type: 'lesson-note',
          text: 'The model says this is true.',
          provenance: { source: 'model', ref: 'turn_1' },
          epistemicKind: 'hypothesis',
          trust: 'verified',
          createdBy: 'model',
        }),
      ).rejects.toThrow(PolicyViolationError);
    } finally {
      await h.close();
    }
  });

  withDatabase('a model verifier cannot raise trust, and a human can', async () => {
    // The join between the record's stored trust and the rule that governs it.
    expect(contextKindForTrust('unverified')).toBe('uncertainty');
    expect(contextKindForTrust('verified')).toBe('analysis');
    expect(contextKindForTrust('authoritative')).toBe('fact');

    // Lowering is always allowed; raising needs a non-model verifier.
    expect(promoteTrust('verified', 'unverified', { kind: 'human', id: 'u_1' })).toBe('verified');
    expect(promoteTrust('unverified', 'verified', { kind: 'human', id: 'u_1' })).toBe('verified');
    // Authoritative is a human's alone: a tool result cannot become a fact by being trusted.
    expect(() => promoteTrust('verified', 'authoritative', { kind: 'tool', id: 't_1' })).toThrow(
      PolicyViolationError,
    );
    expect(TRUST_ORDER.unverified).toBeLessThan(TRUST_ORDER.verified);
    expect(TRUST_ORDER.verified).toBeLessThan(TRUST_ORDER.authoritative);
  });

  withDatabase('unverified memory reaches the model labelled, never as a fact', async () => {
    const h = await harness();
    try {
      // The retrieval store, not a hand-built section: the label the model reads is the one the
      // recall path computes, so this exercises the join rather than restating the mapping.
      const store = new InMemoryVectorMemory();
      const record = await store.upsert({
        type: 'trade-review',
        text: 'Overtraded after a loss.',
        metadata: {
          subject: 'risk-management',
          tags: ['review'],
          createdBy: 'user_1',
          epistemicKind: 'fact',
        },
        // Written down by a person, and still not verified by one.
        provenance: provenance({ source: 'human', ref: 'journal/week-3', trust: 'unverified' }),
        actorId: 'user_1',
      });
      expect(record.trust).toBe('unverified');

      const ranked = await store.query({ text: record.text, minScore: 0 });
      expect(ranked).toHaveLength(1);

      const assembled = assembleContext([
        section({
          id: 'instructions',
          source: 'instructions',
          priority: 100,
          content: INSTRUCTIONS,
        }),
        ...sectionsFromMemory(ranked),
      ]);
      const messages = buildTurnMessages({
        instructions: INSTRUCTIONS,
        sections: assembled.sections,
        userInput: 'What should I avoid?',
      });
      const rendered = messages.map((message) => message.content).join('\n');

      // The section carries its trust, and the label the model reads is the trust's kind — so
      // unverified material cannot arrive as a fact, and it arrives with its provenance.
      const memorySection = assembled.sections.find((item) => item.source === 'memory');
      expect(memorySection?.trust).toBe('unverified');
      expect(memorySection?.label).toBe('uncertainty');
      expect(memorySection?.provenance?.ref).toBe('journal/week-3');
      expect(rendered).toContain('[UNCERTAINTY]');
      expect(rendered).toContain('trust=unverified');
      expect(rendered).toContain('provenance=human:journal/week-3');
      // And the same record retrieved under a trust floor does not come back at all.
      expect(await store.query({ text: record.text, minTrust: 'verified', minScore: 0 })).toEqual(
        [],
      );
    } finally {
      await h.close();
    }
  });

  withDatabase('one account cannot read another’s memory', async () => {
    const h = await harness();
    try {
      const mine = await h.repositories.identity.createUser({
        displayName: 'E mine',
        timezone: 'UTC',
      });
      const other = await h.repositories.identity.createUser({
        displayName: 'E other',
        timezone: 'UTC',
      });
      await h.repositories.memory.create({
        userId: mine.id,
        type: 'lesson-note',
        text: 'Private note.',
        provenance: { source: 'lesson', ref: 'x' },
        epistemicKind: 'analysis',
        createdBy: mine.id,
      });

      expect(await h.repositories.memory.listForUser(other.id)).toEqual([]);
      expect(await h.repositories.memory.listForUser(mine.id)).toHaveLength(1);
    } finally {
      await h.close();
    }
  });

  withDatabase(
    'a high-impact capability declares that unverified memory may not be cited',
    async () => {
      // The registry rule the capability pipeline relies on, asserted against the catalogue itself:
      // a capability whose reading could move money may cite only verified memory, and it must
      // carry a provenance requirement rather than working from unlabelled data.
      const highImpact = CAPABILITY_CATALOGUE.filter((entry) => entry.riskLevel === 'high-impact');
      expect(highImpact.length).toBeGreaterThan(0);
      for (const capability of highImpact) {
        expect(capability.memoryPolicy, capability.id).toBe('cite-verified-only');
        expect(capability.provenance.requiresProvenance, capability.id).toBe(true);
        expect(capability.provenance.statement, capability.id).toMatch(/\S/);
      }
      // And nothing at all is allowed to cite unverified memory silently.
      for (const capability of CAPABILITY_CATALOGUE) {
        expect(capability.memoryPolicy, capability.id).not.toBe('cite-any');
      }
    },
  );
});
