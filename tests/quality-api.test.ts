/**
 * The input-quality route, the gate's effect on the agent, and what must not be logged.
 *
 * The claims this suite exists to defend, beyond the domain suite's own:
 *
 *   1. **The subject is the principal.** There is no user-id parameter anywhere on the
 *      route, so assessing another account is not merely forbidden — it is unrepresentable.
 *   2. **An empty context is a real answer.** A user who declared nothing gets an
 *      assessment of an empty context, not a 404 and not an error.
 *   3. **A refusal precedes the model.** When the gate refuses, the turn is blocked, no
 *      model text exists, and the decision is echoed — so "the LLM cannot override
 *      deterministic validation" holds for the reason that there is no inference to argue
 *      with, not because the model is trusted to agree.
 *   4. **A gate that cannot be evaluated is a refusal, not a pass.** A server with no
 *      store must not answer an analysis request as though it had gated it.
 *   5. **The log carries no inputs.** Every field of a declaration can be personal, so the
 *      log record is checked for the values the fixture actually declared.
 *   6. **Deny-by-default.** The operation is granted by role; a role without it is refused.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALL_OPERATION_IDS,
  ROLE_PERMISSIONS,
  roleHasOperation,
} from '../packages/shared/src/auth/model.js';
import { MemoryLogSink } from '../packages/shared/src/core/logging.js';
import { resolveConfig } from '../src/core/config.js';
import { createRepositories, migrate, openSqlite, sqliteDriverInfo } from '../src/db/index.js';
import { createServer } from '../src/server/index.js';
import { decideReadiness } from '../src/server/handlers/quality.js';
import { AgentService, refusalFor } from '../src/agent/service.js';
import type { ServerDeps } from '../src/server/index.js';
import {
  emptyContext,
  statedField,
  type Holding,
  type TradingContext,
} from '../packages/shared/src/profile/model.js';
import {
  ANALYSIS_TYPES,
  assessAnalysisReadiness,
  type AnalysisType,
} from '../packages/shared/src/quality/readiness.js';
import { NO_MARKET_DATA } from '../packages/shared/src/quality/model.js';

const driver = sqliteDriverInfo();
const withDatabase = driver.available ? it : it.skip;

const NOW = Date.parse('2026-09-21T12:00:00.000Z');
const day = 86_400_000;
const iso = (offsetDays: number): string => new Date(NOW + offsetDays * day).toISOString();
const AUTH = (token: string) => ({ authorization: `Bearer ${token}` });

/**
 * What must never appear in a log or in the assessment itself.
 *
 * Note what is **not** here. A value from a closed vocabulary — `growth-oriented`, a
 * timeframe, a market — is a token, not prose, and the assessment reproduces it on
 * purpose: it is the system's own word, chosen from a set the system defines. What is
 * withheld is text the user wrote and per-position detail they supplied, which is the
 * distinction the representation rules draw.
 */
const SECRETS = {
  /** Free prose: counted, never reproduced. */
  constraint: 'Never hold through an earnings release',
  /** Per-position detail: aggregated into a count and a total weight, never listed. */
  holding: 'TSLA',
} as const;

/** Every required field stated and current — the "sufficient" baseline. */
function fullContext(observedAt = iso(0)): TradingContext {
  return {
    ...emptyContext(observedAt),
    experienceLevel: statedField('intermediate', observedAt),
    markets: statedField(['equity'], observedAt),
    instruments: statedField(['TSLA'], observedAt),
    tradingStyle: statedField('swing', observedAt),
    timeframe: statedField('4h', observedAt),
    learningGoals: statedField(['market-structure'], observedAt),
    capitalRange: statedField('over-250k', observedAt),
    riskTolerance: statedField('growth-oriented', observedAt),
    horizon: statedField('weeks', observedAt),
    holdings: statedField<Holding[]>(
      [{ symbol: 'TSLA', assetClass: 'equity', weightPercent: 40 }],
      observedAt,
    ),
    constraints: statedField(
      [{ id: 'c1', statement: 'Never hold through an earnings release', source: 'user-stated' }],
      observedAt,
    ),
  };
}

interface Fixture {
  repositories: ReturnType<typeof createRepositories>;
  close: () => void;
}

async function fixture(): Promise<Fixture> {
  const db = openSqlite({ file: ':memory:' });
  await migrate(db);
  let counter = 0;
  const repositories = createRepositories(db, {
    now: () => NOW,
    newId: (kind) => `${kind}_${(counter += 1)}`,
  });
  return { repositories, close: () => db.close() };
}

function buildServer(
  repositories?: ReturnType<typeof createRepositories>,
  extra: Partial<ServerDeps> = {},
) {
  const sink = new MemoryLogSink();
  const deps: ServerDeps = {
    config: resolveConfig({}),
    sink,
    now: () => NOW,
    ...(repositories === undefined ? {} : { repositories }),
    ...extra,
  };
  return { server: createServer(deps), sink };
}

/* ------------------------------------------------------------------ */
/* Permissions                                                         */
/* ------------------------------------------------------------------ */

describe('quality.assess is deny-by-default', () => {
  it('registers the operation and grants it by role, not by default', () => {
    expect(ALL_OPERATION_IDS).toContain('quality.assess');
    expect(roleHasOperation('student', 'quality.assess')).toBe(true);
    expect(roleHasOperation('observer', 'quality.assess')).toBe(true);
    expect(roleHasOperation('coach', 'quality.assess')).toBe(true);
    expect(ROLE_PERMISSIONS.owner).toContain('quality.assess');
    // A background worker has no declared context to assess.
    expect(roleHasOperation('system', 'quality.assess')).toBe(false);
  });

  it('names no execution operation, as before', () => {
    expect(
      ALL_OPERATION_IDS.filter((id) =>
        /(broker|execute|place[._-]?order|live[._-]?trad)/i.test(id),
      ),
    ).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* The route                                                           */
/* ------------------------------------------------------------------ */

describe('the input-quality route', () => {
  withDatabase('authenticates before the handler runs, and takes no subject', async () => {
    const f = await fixture();
    try {
      const { server } = buildServer(f.repositories);
      try {
        const anonymous = await server.app.inject({
          method: 'POST',
          url: '/v1/quality/assess',
          payload: {},
        });
        expect(anonymous.statusCode).toBe(401);
        expect(anonymous.json().error.code).toBe('UNAUTHENTICATED');

        const route = server.routes.find((entry) => entry.id === 'quality.assess');
        expect(route?.path).toBe('/v1/quality/assess');
        expect(route?.path).not.toContain(':');
        expect(route?.operation).toBe('quality.assess');
      } finally {
        await server.close();
      }
    } finally {
      await f.close();
    }
  });

  withDatabase('assesses an empty context as empty rather than as an error', async () => {
    const f = await fixture();
    try {
      const user = await f.repositories.identity.createUser({
        displayName: 'Learner',
        timezone: 'UTC',
      });
      const { server } = buildServer(f.repositories);
      try {
        const session = server.sessions.issue({ userId: user.id, roles: ['student'] });
        const response = await server.app.inject({
          method: 'POST',
          url: '/v1/quality/assess',
          headers: AUTH(session.token),
          payload: {},
        });
        expect(response.statusCode).toBe(200);
        const data = response.json().data;
        expect(data.contextSet).toBe(false);
        expect(data.contextVersion).toBe(0);
        // Not a 404: the absent fields are the finding, so they are reported as such.
        expect(data.report.counts.usable).toBe(0);
        expect(data.report.gaps.length).toBeGreaterThan(0);
        expect(data.decisions).toHaveLength(ANALYSIS_TYPES.length);
        // Nothing to read from, so nothing is ready.
        expect(
          data.decisions.filter(
            (decision: { readiness: string }) => decision.readiness === 'READY_FOR_ANALYSIS',
          ),
        ).toEqual([]);
      } finally {
        await server.close();
      }
    } finally {
      await f.close();
    }
  });

  withDatabase(
    'reports a planned capability as a gap in the product, not in the inputs',
    async () => {
      const f = await fixture();
      try {
        const user = await f.repositories.identity.createUser({
          displayName: 'Learner',
          timezone: 'UTC',
        });
        await f.repositories.profile.append({
          userId: user.id,
          context: fullContext(),
          changedBy: user.id,
        });
        const { server } = buildServer(f.repositories);
        try {
          const session = server.sessions.issue({ userId: user.id, roles: ['student'] });
          const response = await server.app.inject({
            method: 'POST',
            url: '/v1/quality/assess',
            headers: AUTH(session.token),
            payload: { analysisType: 'portfolio.risk' },
          });
          expect(response.statusCode).toBe(200);
          const [decision] = response.json().data.decisions;
          // The inputs are sufficient; what is missing is the capability itself, and the
          // decision says that rather than blaming the declaration.
          expect(decision.readiness).toBe('READY_FOR_ANALYSIS');
          expect(decision.capability).toBe('planned');
          expect(decision.requestedType).toBe('portfolio.risk');
          expect(typeof decision.capabilityNote).toBe('string');
        } finally {
          await server.close();
        }
      } finally {
        await f.close();
      }
    },
  );

  withDatabase('refuses a request whose premises have no analysis to belong to', async () => {
    const f = await fixture();
    try {
      const user = await f.repositories.identity.createUser({
        displayName: 'Learner',
        timezone: 'UTC',
      });
      const { server } = buildServer(f.repositories);
      try {
        const session = server.sessions.issue({ userId: user.id, roles: ['student'] });
        const response = await server.app.inject({
          method: 'POST',
          url: '/v1/quality/assess',
          headers: AUTH(session.token),
          // `premises` names fields of one analysis, so naming none is a schema error.
          payload: { premises: ['riskTolerance'] },
        });
        expect(response.statusCode).toBe(400);
      } finally {
        await server.close();
      }
    } finally {
      await f.close();
    }
  });

  withDatabase(
    'cannot assess without a store, and says so instead of blaming the user',
    async () => {
      const { server } = buildServer(undefined);
      try {
        // A session is enough to reach the handler; the store is what is missing.
        const session = server.sessions.issue({ userId: 'user_none', roles: ['owner'] });
        const response = await server.app.inject({
          method: 'POST',
          url: '/v1/quality/assess',
          headers: AUTH(session.token),
          payload: {},
        });
        expect(response.statusCode).toBe(503);
        const body = response.json().error;
        expect(body.code).toBe('PROVIDER_UNAVAILABLE');
        expect(body.details.capability).toBe('profile.store');
      } finally {
        await server.close();
      }
    },
  );
});

/* ------------------------------------------------------------------ */
/* Redaction                                                           */
/* ------------------------------------------------------------------ */

describe('the assessment is safe to log', () => {
  withDatabase('records counts and codes, and none of the declared values', async () => {
    const f = await fixture();
    try {
      const user = await f.repositories.identity.createUser({
        displayName: 'Learner',
        timezone: 'UTC',
      });
      await f.repositories.profile.append({
        userId: user.id,
        context: fullContext(),
        changedBy: user.id,
      });
      const { server, sink } = buildServer(f.repositories);
      try {
        const session = server.sessions.issue({ userId: user.id, roles: ['student'] });
        const response = await server.app.inject({
          method: 'POST',
          url: '/v1/quality/assess',
          headers: AUTH(session.token),
          payload: { analysisType: 'education.explain', premises: ['riskTolerance'] },
        });
        expect(response.statusCode).toBe(200);

        const record = sink.records.find((entry) => entry.event === 'quality.assess');
        expect(record, 'the assessment did not log at all').toBeDefined();

        const serialised = JSON.stringify(sink.records);
        for (const [name, value] of Object.entries(SECRETS)) {
          expect(serialised, `${name} reached the log`).not.toContain(value);
        }
        // What it does carry: the version, the counts and the decision codes.
        expect(record?.data?.contextVersion).toBe(1);
        expect(Array.isArray(record?.data?.readiness)).toBe(true);
        expect(record?.data?.decidedBy).toContain('all-requirements-met');
      } finally {
        await server.close();
      }
    } finally {
      await f.close();
    }
  });

  withDatabase('never returns a value the user wrote, only a representation', async () => {
    const f = await fixture();
    try {
      const user = await f.repositories.identity.createUser({
        displayName: 'Learner',
        timezone: 'UTC',
      });
      await f.repositories.profile.append({
        userId: user.id,
        context: fullContext(),
        changedBy: user.id,
      });
      const { server } = buildServer(f.repositories);
      try {
        const session = server.sessions.issue({ userId: user.id, roles: ['student'] });
        const response = await server.app.inject({
          method: 'POST',
          url: '/v1/quality/assess',
          headers: AUTH(session.token),
          payload: {},
        });
        const body = JSON.stringify(response.json().data);
        // Free prose is counted, never reproduced.
        expect(body).not.toContain(SECRETS.constraint);
        // Per-position detail is aggregated, never listed.
        expect(body).not.toContain(SECRETS.holding);
        // The constraint field is withheld with a reason, which is the point.
        const constraints = response
          .json()
          .data.report.fields.find((field: { field: string }) => field.field === 'constraints');
        expect(constraints.representation.kind).toBe('withheld');
        expect(constraints.representation.reason).toBe('free-text');
      } finally {
        await server.close();
      }
    } finally {
      await f.close();
    }
  });
});

/* ------------------------------------------------------------------ */
/* The gate in front of the model                                      */
/* ------------------------------------------------------------------ */

describe('the agent cannot override the gate', () => {
  it('refuses before any model runs when the gate blocks', () => {
    // A market-structure reading needs bars. There are none, and a bar series cannot be
    // assumed into existence, so this is the gate's hardest outcome.
    const decision = assessAnalysisReadiness({
      analysisType: 'market.structure',
      context: fullContext(),
      marketData: NO_MARKET_DATA,
      now: NOW,
    });
    expect(decision.readiness).toBe('BLOCKED');

    const service = new AgentService();
    const turn = service.run('what is the structure here?', { readiness: decision });

    expect(turn.status).toBe('blocked');
    expect(turn.statements).toEqual([]);
    expect(turn.toolResultCount).toBe(0);
    expect(turn.epistemicKind).toBe('uncertainty');
    expect(turn.readiness?.readiness).toBe('BLOCKED');
    // No model text: the reply is the refusal, and nothing else exists to be overridden.
    expect(turn.reason).toBe(turn.reply);
  });

  it('refuses a declared-but-unimplemented capability on those grounds, not on the inputs', () => {
    // Every declared capability except one is `planned`, and that is checked first:
    // the inputs were assessed and were fine, so blaming them would be a false finding.
    const decision = assessAnalysisReadiness({
      analysisType: 'portfolio.risk',
      context: emptyContext(iso(0)),
      marketData: NO_MARKET_DATA,
      now: NOW,
    });
    expect(decision.capability).toBe('planned');
    expect(decision.readiness).toBe('REQUIRES_CLARIFICATION');

    const turn = new AgentService().run('how much risk am I taking?', { readiness: decision });
    expect(turn.status).toBe('blocked');
    expect(turn.reply).toMatch(/declared capability that is not implemented yet/i);
    // The questions still travel with the decision, so the surface can show them.
    expect(decision.clarifications.length).toBeGreaterThan(0);
  });

  it('has a distinct refusal for each point on the ladder', () => {
    const blocked = assessAnalysisReadiness({
      analysisType: 'market.structure',
      context: fullContext(),
      marketData: NO_MARKET_DATA,
      now: NOW,
    });
    expect(blocked.readiness).toBe('BLOCKED');

    const clarifications = assessAnalysisReadiness({
      analysisType: 'portfolio.risk',
      context: emptyContext(iso(0)),
      marketData: NO_MARKET_DATA,
      now: NOW,
    });

    // The capability flag decides first; with it out of the way the input verdict speaks.
    const available = { ...blocked, capability: 'available' as const };
    expect(refusalFor(available)).toMatch(/The analysis was not produced\./);
    expect(refusalFor(available)).toMatch(/No bars are available/);

    const needsAnswers = { ...clarifications, capability: 'available' as const };
    expect(refusalFor(needsAnswers)).toMatch(/would rest on inputs that are not there/i);
    // The questions are part of the refusal: a bare "no" would be useless.
    expect(refusalFor(needsAnswers)).toContain(clarifications.clarifications[0]!.question);

    const ready = {
      ...blocked,
      capability: 'available' as const,
      readiness: 'READY_FOR_ANALYSIS' as const,
    };
    expect(refusalFor(ready)).toBeNull();
    expect(refusalFor(null)).toMatch(/no readiness decision was supplied/i);
  });

  it('refuses an analysis request that supplied no decision at all', () => {
    const service = new AgentService();
    const turn = service.run('explain risk', { readiness: null });
    expect(turn.status).toBe('blocked');
    expect(turn.reply).toMatch(/no readiness decision was supplied/i);
  });

  it('still answers a request that names no analysis', () => {
    const service = new AgentService();
    const turn = service.run('What is a stop loss?');
    expect(turn.status).toBe('completed');
    expect(turn.statements.length).toBeGreaterThan(0);
  });

  it('carries a permitted verdict into the turn instead of dropping it', () => {
    // A declared, satisfiable analysis: the turn runs, and the verdict must still travel.
    const decided = assessAnalysisReadiness({
      analysisType: 'education.explain',
      context: fullContext(),
      marketData: NO_MARKET_DATA,
      now: NOW,
    });
    expect(decided.readiness).toBe('READY_FOR_ANALYSIS');

    const turn = new AgentService().run('explain position sizing', { readiness: decided });
    expect(turn.status).toBe('completed');
    // This was a real defect on the synchronous path: the turn succeeded and reported
    // `readiness: null`, so a `READY_WITH_LIMITATIONS` verdict lost its limitations.
    expect(turn.readiness?.readiness).toBe('READY_FOR_ANALYSIS');
  });

  it('reports the limitations of a limited verdict alongside the answer', () => {
    const decided = assessAnalysisReadiness({
      analysisType: 'education.explain',
      context: emptyContext(iso(0)),
      marketData: NO_MARKET_DATA,
      now: NOW,
    });
    expect(decided.readiness).toBe('READY_WITH_LIMITATIONS');

    const turn = new AgentService().run('explain position sizing', { readiness: decided });
    expect(turn.status).toBe('completed');
    expect(turn.readiness?.limitations.length).toBeGreaterThan(0);
  });
});

describe('the gate the route evaluates is the same one the agent acts on', () => {
  withDatabase('hands the agent the stored context’s verdict, not a client claim', async () => {
    const f = await fixture();
    try {
      const user = await f.repositories.identity.createUser({
        displayName: 'Learner',
        timezone: 'UTC',
      });
      const { server } = buildServer(f.repositories);
      try {
        const session = server.sessions.issue({ userId: user.id, roles: ['student'] });
        const ask = (payload: Record<string, unknown>) =>
          server.app.inject({
            method: 'POST',
            url: '/v1/agent/messages',
            headers: AUTH(session.token),
            payload,
          });

        // Nothing declared yet: the answer is allowed, and it is labelled as limited.
        const before = await ask({
          message: 'explain position sizing',
          analysisType: 'education.explain',
        });
        expect(before.statusCode).toBe(200);
        const beforeData = before.json().data;
        expect(beforeData.readiness.readiness).toBe('READY_WITH_LIMITATIONS');
        expect(beforeData.readiness.limitations.length).toBeGreaterThan(0);

        // An analysis that needs bars is refused outright: no provider is registered.
        const gated = await ask({
          message: 'what is the structure here?',
          analysisType: 'market.structure',
        });
        expect(gated.statusCode).toBe(200);
        expect(gated.json().data.status).toBe('blocked');
        expect(gated.json().data.readiness.readiness).toBe('BLOCKED');

        // Declaring the context changes the same request's verdict — which is only
        // possible because the gate read the store rather than trusting the caller.
        await f.repositories.profile.append({
          userId: user.id,
          context: fullContext(),
          changedBy: user.id,
        });
        const after = await ask({
          message: 'explain position sizing',
          analysisType: 'education.explain',
        });
        expect(after.statusCode).toBe(200);
        expect(after.json().data.readiness.readiness).toBe('READY_FOR_ANALYSIS');
      } finally {
        await server.close();
      }
    } finally {
      await f.close();
    }
  });

  it('derives the route’s verdict from the same function, so the two cannot disagree', () => {
    // One helper, imported by the server assembly and by this suite: a second
    // implementation is how the API and the agent would come to give different answers.
    const source = readFileSync(join(process.cwd(), 'src', 'server', 'app.ts'), 'utf8');
    expect(source).toMatch(/from '\.\/handlers\/quality\.js'/);
    expect(source).toMatch(/decideReadiness/);
    expect(source).toMatch(/loadContext/);

    const decision = decideReadiness(
      { context: fullContext(), marketData: NO_MARKET_DATA, now: NOW },
      { analysisType: 'education.explain' },
    );
    expect(decision).toHaveLength(1);
    expect(decision[0]?.requestedType).toBe('education.explain');
  });

  it('covers every declared analysis type with a decision', () => {
    const decisions = decideReadiness({
      context: emptyContext(iso(0)),
      marketData: NO_MARKET_DATA,
      now: NOW,
    });
    expect(decisions.map((entry) => entry.requestedType).sort()).toEqual(
      [...(ANALYSIS_TYPES as readonly AnalysisType[])].sort(),
    );
  });
});
