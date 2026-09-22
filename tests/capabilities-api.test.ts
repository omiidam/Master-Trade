/**
 * The capability surface and the decision routes, end to end through the real server.
 *
 * The claims this suite defends — each one a refusal that nothing else would notice:
 *
 *   1. **The catalogue is the server's, resolved per request.** Every `state` comes back computed
 *      from the caller's own stored context, and the client sends nothing that could change one.
 *   2. **A capability request reaches the registry before it reaches a model.** An undeclared id is
 *      refused at resolution — with the deny-by-default reason, not a validation error — and no
 *      model is consulted. That is the difference between "nobody declared it" and "the schema did
 *      not like it", and it is the whole point of a registry.
 *   3. **A capability that is declared and unbuilt says so, and never asks for inputs it could not
 *      use.** `UNAVAILABLE` outranks a missing input.
 *   4. **Readiness describes inputs, and a blocked input set is a refusal with reasons.** Nothing
 *      is computed from a record the gate refused, and no row is appended for an evaluation that
 *      did not happen.
 *   5. **A refusal is a complete result.** The stage, the code, the reasons and the next actions all
 *      travel as fields, so a client renders them without parsing a sentence.
 *   6. **The evaluation is append-only and stores no figures.** Asking twice leaves two rows and one
 *      recomputed report, so a corrected price cannot leave a stale total behind.
 *   7. **No route names a subject.** There is no user id in any path or body here, so reading
 *      another account's decisions is unrepresentable.
 *   8. **Nothing can trade.** No capability is declared for an order, a broker or an execution, and
 *      every declared engine capability is one the tool registry actually holds.
 *   9. **The logs carry counts and codes.** No symbol, price, rationale or figure reaches a line.
 */

import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { MemoryLogSink } from '../packages/shared/src/core/logging.js';
import { resolveConfig } from '../src/core/config.js';
import { createRepositories, migrate, openSqlite, sqliteDriverInfo } from '../src/db/index.js';
import { createServer } from '../src/server/index.js';
import type { ServerDeps } from '../src/server/index.js';
import { CAPABILITY_CATALOGUE } from '../packages/shared/src/capabilities/registry.js';
import { defaultToolRegistry } from '../packages/trading-engine/src/index.js';

const driver = sqliteDriverInfo();
const withDatabase = driver.available ? it : it.skip;

const NOW = Date.parse('2026-09-21T12:00:00.000Z');
const iso = (offsetDays = 0): string => new Date(NOW + offsetDays * 86_400_000).toISOString();
const AUTH = (token: string) => ({ authorization: `Bearer ${token}` });
/** The catalogue, used for the counts this suite asserts against. */
const DECLARED_IDS = CAPABILITY_CATALOGUE.map((entry) => entry.id);
/** The agent turn route. Named once, so a path change fails in one place. */
const AGENT_TURN = '/v1/agent/messages';

interface Harness {
  repositories: ReturnType<typeof createRepositories>;
  server: ReturnType<typeof createServer>;
  sink: MemoryLogSink;
  close(): Promise<void>;
}

async function harness(): Promise<Harness> {
  const directory = mkdtempSync(join(tmpdir(), 'mt-capabilities-'));
  const db = openSqlite({ file: join(directory, 'capabilities.sqlite') });
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

async function session(
  h: Harness,
  userId: string,
  roles: ('student' | 'observer' | 'coach' | 'owner')[] = ['student'],
) {
  return h.server.sessions.issue({ userId, roles });
}

/** An executed decision with both ends of the measurement on the record. */
function completeDecision() {
  const provenance = {
    source: 'user' as const,
    ref: 'test',
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
  };
}

/* ------------------------------------------------------------------ */
/* The catalogue                                                       */
/* ------------------------------------------------------------------ */

describe('the capability catalogue route', () => {
  withDatabase('serves every declared capability with a resolved state', async () => {
    const h = await harness();
    try {
      const user = await h.repositories.identity.createUser({ displayName: 'L', timezone: 'UTC' });
      const auth = await session(h, user.id);

      const response = await h.server.app.inject({
        method: 'GET',
        url: '/v1/capabilities',
        headers: AUTH(auth.token),
      });

      expect(response.statusCode).toBe(200);
      const data = response.json().data;

      expect(data.capabilities).toHaveLength(CAPABILITY_CATALOGUE.length);
      expect(data.capabilities.map((entry: { id: string }) => entry.id)).toEqual(DECLARED_IDS);
      // Every state is one of the declared five, and none of them is computed by the client.
      for (const capability of data.capabilities) {
        expect([
          'READY',
          'READY_WITH_LIMITATIONS',
          'REQUIRES_CLARIFICATION',
          'BLOCKED',
          'UNAVAILABLE',
        ]).toContain(capability.state);
        expect(capability.stateReason.length).toBeGreaterThan(20);
        expect(capability.claims.length).toBeGreaterThan(0);
      }
      // The pipeline and the modules are served, so the diagram cannot drift from the behaviour.
      expect(data.stages.map((stage: { id: string }) => stage.id)).toEqual([
        'resolution',
        'validation',
        'quality',
        'readiness',
        'permission',
        'entitlement',
        'engine',
        'evidence',
        'explanation',
        'result',
        'audit',
      ]);
      expect(data.modules.length).toBeGreaterThan(0);
      for (const module of data.modules) {
        expect(module.composedBy.length).toBeGreaterThan(0);
        expect(module.role.length).toBeGreaterThan(60);
      }
      // One verdict per declared analysis type, from this account's own context.
      expect(data.readiness.length).toBeGreaterThan(0);
    } finally {
      await h.close();
    }
  });

  withDatabase(
    'reports an unimplemented capability as unavailable, not as an input gap',
    async () => {
      const h = await harness();
      try {
        const user = await h.repositories.identity.createUser({
          displayName: 'L',
          timezone: 'UTC',
        });
        const auth = await session(h, user.id);

        // An account with nothing declared: the *inputs* are the reason for most verdicts, and the
        // unbuilt capabilities must not be reported as though supplying an input would help.
        const response = await h.server.app.inject({
          method: 'GET',
          url: '/v1/capabilities',
          headers: AUTH(auth.token),
        });
        const data = response.json().data;

        const structure = data.capabilities.find(
          (entry: { id: string }) => entry.id === 'market.structure',
        );
        expect(structure.availability).toBe('coming-soon');
        expect(structure.state).toBe('UNAVAILABLE');
        expect(structure.stateReason).toMatch(/not implemented/);

        const composition = data.capabilities.find(
          (entry: { id: string }) => entry.id === 'portfolio.composition',
        );
        expect(composition.availability).toBe('available');
        // Nothing declared, so the composition capability asks for the composition.
        expect(composition.state).toBe('REQUIRES_CLARIFICATION');
      } finally {
        await h.close();
      }
    },
  );

  it('declares no capability for an order, a broker or an execution', () => {
    const forbidden = /order|broker|execut|withdraw|transfer|live/i;
    for (const capability of CAPABILITY_CATALOGUE) {
      expect(capability.id).not.toMatch(forbidden);
      expect(capability.operation ?? '').not.toMatch(forbidden);
    }
  });

  it('binds every declared engine to a tool the registry actually holds', () => {
    // The registry keeps `engineCapability` as a string so `packages/shared` does not have to
    // depend on the engine that depends on it. This is the check that makes the string true.
    const held = new Set(
      defaultToolRegistry()
        .list()
        .flatMap((tool) => tool.descriptor.capabilities as readonly string[]),
    );
    for (const capability of CAPABILITY_CATALOGUE) {
      if (capability.engineCapability === null) continue;
      expect(held.has(capability.engineCapability), capability.id).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Orchestration through the agent                                     */
/* ------------------------------------------------------------------ */

describe('a capability request through the agent route', () => {
  withDatabase(
    'refuses an undeclared capability at resolution, without consulting a model',
    async () => {
      const h = await harness();
      try {
        const user = await h.repositories.identity.createUser({
          displayName: 'L',
          timezone: 'UTC',
        });
        const auth = await session(h, user.id);

        const response = await h.server.app.inject({
          method: 'POST',
          url: AGENT_TURN,
          headers: AUTH(auth.token),
          payload: { message: 'Place an order', capabilityId: 'orders.place' },
        });

        expect(response.statusCode).toBe(200);
        const data = response.json().data;
        expect(data.status).toBe('blocked');
        // No engine was consulted, and the response says so rather than naming a model.
        expect(data.model).toBe('none');
        expect(data.statements).toEqual([]);
        expect(data.capability.state).toBe('UNAVAILABLE');
        expect(data.capability.refusedBy).toBe('undeclared-capability');
        expect(data.capability.capabilityId).toBe('orders.place');
        // A refusal is a complete result: the reason and the shape both travel.
        expect(data.capability.limitations.length).toBeGreaterThan(0);
        expect(data.capability.usage).toBeNull();
        expect(data.reply).toMatch(/deny-by-default/);
      } finally {
        await h.close();
      }
    },
  );

  withDatabase('refuses a declared but unbuilt capability before asking for inputs', async () => {
    const h = await harness();
    try {
      const user = await h.repositories.identity.createUser({ displayName: 'L', timezone: 'UTC' });
      const auth = await session(h, user.id);

      const response = await h.server.app.inject({
        method: 'POST',
        url: AGENT_TURN,
        headers: AUTH(auth.token),
        payload: { message: 'Read the structure', capabilityId: 'market.structure' },
      });

      const data = response.json().data;
      expect(data.status).toBe('blocked');
      expect(data.capability.availability).toBe('coming-soon');
      expect(data.capability.state).toBe('UNAVAILABLE');
      expect(data.capability.refusedBy).toBe('capability-coming-soon');
      // The distinction the registry exists for: no question is asked about inputs that could not
      // be used, so no clarification action is offered.
      expect(data.capability.nextActions).toEqual([]);
    } finally {
      await h.close();
    }
  });

  withDatabase(
    'runs a capability whose inputs are satisfied, and attaches the result',
    async () => {
      const h = await harness();
      try {
        const user = await h.repositories.identity.createUser({
          displayName: 'L',
          timezone: 'UTC',
        });
        const auth = await session(h, user.id);

        // An explanation has no required inputs, so it is ready on an empty context and runs.
        const response = await h.server.app.inject({
          method: 'POST',
          url: AGENT_TURN,
          headers: AUTH(auth.token),
          payload: { message: 'Explain R multiples', capabilityId: 'education.explain' },
        });

        const data = response.json().data;
        // The reason travels in the message, so a refusal here reports *why* rather than only that the
        // turn was blocked.
        expect(
          data.status,
          JSON.stringify({ refusedBy: data.capability?.refusedBy, reply: data.reply }),
        ).toBe('completed');
        expect(data.capability.state).not.toBe('BLOCKED');
        expect(data.capability.availability).toBe('available');
        expect(data.capability.refusedBy).toBeNull();
        // The engine is named, and it is a capability the tool registry holds.
        expect(data.capability.modules).toContain('agent-core');
        expect(data.capability.note).toMatch(/deterministic/);
      } finally {
        await h.close();
      }
    },
  );

  withDatabase('refuses a gated capability whose required input is absent', async () => {
    const h = await harness();
    try {
      const user = await h.repositories.identity.createUser({ displayName: 'L', timezone: 'UTC' });
      const auth = await session(h, user.id);

      // Composition requires the holdings, which this account has never declared.
      const response = await h.server.app.inject({
        method: 'POST',
        url: AGENT_TURN,
        headers: AUTH(auth.token),
        payload: { message: 'Value my portfolio', capabilityId: 'portfolio.composition' },
      });

      const data = response.json().data;
      expect(data.status).toBe('blocked');
      expect(data.capability.state).toBe('REQUIRES_CLARIFICATION');
      expect(data.capability.refusedBy).toBe('clarification-required');
      expect(
        data.capability.nextActions.some(
          (action: { kind: string }) => action.kind === 'answer-question',
        ),
      ).toBe(true);
      expect(
        data.capability.nextActions.map((action: { field: string | null }) => action.field),
      ).toContain('holdings');
      // Nothing was computed from a refused input set.
      expect(data.capability.calculations).toEqual([]);
    } finally {
      await h.close();
    }
  });
});

/* ------------------------------------------------------------------ */
/* Decisions                                                           */
/* ------------------------------------------------------------------ */

describe('the decision routes', () => {
  withDatabase('records a decision, then evaluates it from its own prices', async () => {
    const h = await harness();
    try {
      const user = await h.repositories.identity.createUser({ displayName: 'L', timezone: 'UTC' });
      const auth = await session(h, user.id);

      // Recording is a create: the id is the server's, and the response returns it.
      const write = await h.server.app.inject({
        method: 'POST',
        url: '/v1/decisions',
        headers: AUTH(auth.token),
        payload: completeDecision(),
      });
      expect(write.statusCode).toBe(200);
      const decisionId = write.json().data.decision.id as string;
      expect(decisionId).toMatch(/^dec_/);
      expect(write.json().data.evaluations).toEqual([]);

      const evaluate = await h.server.app.inject({
        method: 'POST',
        url: `/v1/decisions/${decisionId}/evaluate`,
        headers: AUTH(auth.token),
        payload: { reason: 'requested' },
      });
      expect(evaluate.statusCode).toBe(200);
      const data = evaluate.json().data;

      // The report is computed, and every figure names what it is.
      expect(data.report).not.toBeNull();
      expect(data.report.outcome).toBe('realised');
      expect(data.report.figures.length).toBeGreaterThan(0);
      for (const figure of data.report.figures) {
        expect(figure.basis.length).toBeGreaterThan(0);
        expect(['realised', 'unrealised', 'hypothetical', 'simulated', 'incomplete']).toContain(
          figure.outcome,
        );
      }
      // The comparison the module exists for, with the expectation the user themselves stated.
      expect(data.report.expectedVersusActual.expectedReturnPercent).toBe(8);
      expect(data.report.expectedVersusActual.actualReturnPercent).toBeCloseTo(6, 6);

      // The history is append-only and it stores no figures.
      expect(data.evaluations).toHaveLength(1);
      expect(Object.keys(data.evaluations[0])).not.toContain('report');
      expect(data.evaluations[0].decisionVersion).toBe(1);

      const second = await h.server.app.inject({
        method: 'POST',
        url: `/v1/decisions/${decisionId}/evaluate`,
        headers: AUTH(auth.token),
        payload: { reason: 'reassessment' },
      });
      expect(second.json().data.evaluations).toHaveLength(2);

      // Amending addresses the id the server minted, and an id that never existed is a 404 rather
      // than an insert.
      const amend = await h.server.app.inject({
        method: 'PUT',
        url: `/v1/decisions/${decisionId}`,
        headers: AUTH(auth.token),
        payload: { ...completeDecision(), rationale: 'Amended reasoning.' },
      });
      expect(amend.statusCode).toBe(200);
      expect(amend.json().data.decision.id).toBe(decisionId);
      expect(amend.json().data.decision.rationale).toBe('Amended reasoning.');

      const nowhere = await h.server.app.inject({
        method: 'PUT',
        url: '/v1/decisions/dec_never_existed',
        headers: AUTH(auth.token),
        payload: completeDecision(),
      });
      expect(nowhere.statusCode).toBe(404);
    } finally {
      await h.close();
    }
  });

  withDatabase('refuses to evaluate an incomplete record, and appends no row', async () => {
    const h = await harness();
    try {
      const user = await h.repositories.identity.createUser({ displayName: 'L', timezone: 'UTC' });
      const auth = await session(h, user.id);

      // An executed decision with no exit price and no mark: there is no outcome half at all.
      const incomplete = {
        ...completeDecision(),
        exitPrice: null,
      };
      const write = await h.server.app.inject({
        method: 'POST',
        url: '/v1/decisions',
        headers: AUTH(auth.token),
        payload: incomplete,
      });
      expect(write.statusCode).toBe(200);
      const incompleteId = write.json().data.decision.id as string;

      const evaluate = await h.server.app.inject({
        method: 'POST',
        url: `/v1/decisions/${incompleteId}/evaluate`,
        headers: AUTH(auth.token),
        payload: {},
      });
      expect(evaluate.statusCode).toBe(200);
      const data = evaluate.json().data;

      expect(data.report).toBeNull();
      expect(data.readiness.readiness).toBe('INCOMPLETE_OUTCOME_DATA');
      expect(data.readiness.limitations.length).toBeGreaterThan(0);
      // Nothing was measured, so nothing is recorded as having been measured.
      expect(data.evaluations).toEqual([]);
    } finally {
      await h.close();
    }
  });

  withDatabase('lists only the caller’s own decisions', async () => {
    const h = await harness();
    try {
      const first = await h.repositories.identity.createUser({ displayName: 'A', timezone: 'UTC' });
      const second = await h.repositories.identity.createUser({
        displayName: 'B',
        timezone: 'UTC',
      });
      const firstAuth = await session(h, first.id);
      const secondAuth = await session(h, second.id);

      const created = await h.server.app.inject({
        method: 'POST',
        url: '/v1/decisions',
        headers: AUTH(firstAuth.token),
        payload: completeDecision(),
      });
      const firstId = created.json().data.decision.id as string;

      const mine = await h.server.app.inject({
        method: 'GET',
        url: '/v1/decisions',
        headers: AUTH(firstAuth.token),
      });
      expect(mine.json().data.total).toBe(1);

      // The second account sees nothing, and asking for the first account's record by id is a 404
      // rather than a leak: there is no parameter that could name another account.
      const theirs = await h.server.app.inject({
        method: 'GET',
        url: '/v1/decisions',
        headers: AUTH(secondAuth.token),
      });
      expect(theirs.json().data.total).toBe(0);

      const stolen = await h.server.app.inject({
        method: 'GET',
        url: `/v1/decisions/${firstId}`,
        headers: AUTH(secondAuth.token),
      });
      expect(stolen.statusCode).toBe(404);
    } finally {
      await h.close();
    }
  });

  withDatabase('carries counts and codes into the log, never a figure', async () => {
    const h = await harness();
    try {
      const user = await h.repositories.identity.createUser({ displayName: 'L', timezone: 'UTC' });
      const auth = await session(h, user.id);

      const created = await h.server.app.inject({
        method: 'POST',
        url: '/v1/decisions',
        headers: AUTH(auth.token),
        payload: completeDecision(),
      });
      const logId = created.json().data.decision.id as string;
      await h.server.app.inject({
        method: 'POST',
        url: `/v1/decisions/${logId}/evaluate`,
        headers: AUTH(auth.token),
        payload: {},
      });
      await h.server.app.inject({
        method: 'GET',
        url: '/v1/capabilities',
        headers: AUTH(auth.token),
      });
      await h.server.app.inject({
        method: 'POST',
        url: AGENT_TURN,
        headers: AUTH(auth.token),
        payload: { message: 'Place an order', capabilityId: 'orders.place' },
      });

      const written = JSON.stringify(h.sink.records);
      // The symbol, the rationale and the prices are the user's; none of them reaches a line.
      expect(written).not.toContain('AAPL');
      expect(written).not.toContain('Breakout retest');
      expect(written).not.toContain('106');
      // What does reach it: the ids, the counts and the codes a reviewer needs.
      expect(written).toContain('decision evaluated');
      expect(written).toContain('capabilities read');
      expect(written).toContain('capability.resolve');
    } finally {
      await h.close();
    }
  });
});
