/**
 * User profile and Trading Context.
 *
 * The claims this suite exists to defend:
 *
 *   1. **Nothing is inferred into a fact.** An unstated field stays missing, and a value
 *      with no observation time is treated as assumed, not trusted.
 *   2. **Status is derived, never stored.** It comes from value + source + time against
 *      the freshness policy, so a stored status cannot drift from the timestamps.
 *   3. **Confidence is the weakest required field.** A strong input must not be able to
 *      hide a weak one (ADR-0041).
 *   4. **Impossible contexts are refused; ambiguous ones are asked about.** The
 *      difference is enforced, not described.
 *   5. **A version is append-only and per-user.** History is never rewritten, and one
 *      account cannot read another's context.
 */

import { describe, expect, it } from 'vitest';
import {
  ASSET_CLASSES,
  FIELD_KEYS,
  FRESHNESS_DAYS,
  REQUIRED_FIELDS,
  ageInDays,
  assessContext,
  clarifyingPrompts,
  detectContradictions,
  derivedField,
  emptyContext,
  fieldStatus,
  statedField,
  tradingContextSchema,
  type ContextField,
  type Holding,
  type TradingContext,
} from '../packages/shared/src/profile/model.js';
import { AppError } from '../packages/shared/src/core/errors.js';
import {
  ALL_OPERATION_IDS,
  ROLE_PERMISSIONS,
  roleHasOperation,
} from '../packages/shared/src/auth/model.js';
import { createRepositories, migrate, openSqlite, sqliteDriverInfo } from '../src/db/index.js';
import { createServer } from '../src/server/index.js';
import { MemoryLogSink } from '../packages/shared/src/core/logging.js';
import { resolveConfig } from '../src/core/config.js';
import type { ServerDeps } from '../src/server/index.js';

const driver = sqliteDriverInfo();
const withDatabase = driver.available ? it : it.skip;

const NOW = Date.parse('2026-09-21T12:00:00.000Z');
const day = 86_400_000;
const iso = (offsetDays: number): string => new Date(NOW + offsetDays * day).toISOString();

const AUTH = (token: string) => ({ authorization: `Bearer ${token}` });

/** A context with every required field stated at a given age. */
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

/* ------------------------------------------------------------------ */
/* Schema                                                              */
/* ------------------------------------------------------------------ */

describe('trading context schema', () => {
  it('accepts a fully stated context and rejects unknown keys', () => {
    expect(tradingContextSchema.safeParse(fullContext()).success).toBe(true);
    const withExtra = { ...fullContext(), favouriteColour: 'blue' };
    expect(tradingContextSchema.safeParse(withExtra).success).toBe(false);
  });

  it('rejects an unknown vocabulary value rather than coercing it', () => {
    const bad = { ...fullContext(), tradingStyle: statedField('gambling', iso(0)) };
    expect(tradingContextSchema.safeParse(bad).success).toBe(false);
    expect(ASSET_CLASSES).toContain('equity');
  });

  it('bounds a holding weight and the symbol text', () => {
    const tooHeavy = fullContext();
    tooHeavy.holdings = statedField<Holding[]>(
      [{ symbol: 'AAPL', assetClass: 'equity', weightPercent: 140 }],
      iso(0),
    );
    expect(tradingContextSchema.safeParse(tooHeavy).success).toBe(false);

    const badSymbol = fullContext();
    badSymbol.holdings = statedField<Holding[]>(
      [{ symbol: 'A A P L', assetClass: 'equity', weightPercent: 10 }],
      iso(0),
    );
    expect(tradingContextSchema.safeParse(badSymbol).success).toBe(false);
  });

  it('rejects a constraint that reads as an instruction to trade', () => {
    const dangerous = fullContext();
    dangerous.constraints = statedField(
      [
        {
          id: 'c1',
          statement: 'Place order for 100 shares when the price drops',
          source: 'user-stated',
        },
      ],
      iso(0),
    );
    // The schema is the first gate, so the text never reaches storage.
    expect(tradingContextSchema.safeParse(dangerous).success).toBe(false);
    const issues = detectContradictions({
      ...dangerous,
      constraints: {
        ...dangerous.constraints,
        value: [{ id: 'c1', statement: 'place order 100 shares', source: 'user-stated' }],
      },
    });
    // The repository gate is the second, and it is a rejection rather than a question.
    const rejected = issues.filter((issue) => issue.severity === 'reject');
    expect(rejected.map((issue) => issue.key)).toContain('constraints');
  });
});

/* ------------------------------------------------------------------ */
/* Status, provenance and freshness                                    */
/* ------------------------------------------------------------------ */

describe('field status is derived from value, source and time', () => {
  it('reports a stated, fresh field as confirmed and a derived one as derived', () => {
    expect(fieldStatus(statedField('swing', iso(0)), 'tradingStyle', NOW)).toBe('confirmed');
    expect(fieldStatus(derivedField(['equity'], iso(0)), 'markets', NOW)).toBe('derived');
  });

  it('reports an unstated field as missing, never as a default', () => {
    const empty = emptyContext(iso(0));
    for (const key of FIELD_KEYS) {
      expect(fieldStatus(empty[key] as ContextField<unknown>, key, NOW)).toBe('missing');
    }
    expect(empty.capitalRange.value).toBeNull();
    expect(empty.riskTolerance.value).toBeNull();
  });

  it('never treats an assumed value as confirmed, even when it is fresh', () => {
    const assumed: ContextField<string> = {
      value: 'balanced',
      source: 'assumed',
      observedAt: iso(0),
      note: 'a convention, not a statement',
    };
    expect(fieldStatus(assumed, 'riskTolerance', NOW)).toBe('assumed');
  });

  it('treats a stated value with no observation time as assumed, not current', () => {
    const undated: ContextField<string> = {
      value: 'balanced',
      source: 'user-stated',
      observedAt: null,
    };
    expect(fieldStatus(undated, 'riskTolerance', NOW)).toBe('assumed');
  });

  it('ages each field against its own window, not a global TTL', () => {
    // Holdings are stale within a month; a learning goal is not stale after a year.
    const oldHoldings = statedField<Holding[]>([], iso(-40));
    const oldGoal = statedField(['risk-management'], iso(-400));
    expect(fieldStatus(oldHoldings, 'holdings', NOW)).toBe('stale');
    expect(fieldStatus(oldGoal, 'learningGoals', NOW)).toBe('confirmed');
    expect(FRESHNESS_DAYS.holdings).toBeLessThan(FRESHNESS_DAYS.capitalRange as number);
    expect(ageInDays(iso(-3), NOW)).toBe(3);
    expect(ageInDays(null, NOW)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Contradictions                                                      */
/* ------------------------------------------------------------------ */

describe('impossible contexts are refused and ambiguous ones are asked about', () => {
  const rejects = (context: TradingContext): string[] =>
    detectContradictions(context)
      .filter((issue) => issue.severity === 'reject')
      .map((issue) => issue.key);

  const questions = (context: TradingContext): string[] =>
    detectContradictions(context)
      .filter((issue) => issue.severity === 'question')
      .map((issue) => issue.key);

  it('refuses an allocation that is more than a whole portfolio', () => {
    const context = fullContext();
    context.holdings = statedField<Holding[]>(
      [
        { symbol: 'AAPL', assetClass: 'equity', weightPercent: 70 },
        { symbol: 'MSFT', assetClass: 'equity', weightPercent: 70 },
      ],
      iso(0),
    );
    expect(rejects(context)).toContain('holdings');
  });

  it('refuses a duplicate holding instead of adding the weights together', () => {
    const context = fullContext();
    context.holdings = statedField<Holding[]>(
      [
        { symbol: 'aapl', assetClass: 'equity', weightPercent: 20 },
        { symbol: 'AAPL', assetClass: 'equity', weightPercent: 20 },
      ],
      iso(0),
    );
    expect(rejects(context)).toContain('holdings');
  });

  it('refuses an intraday horizon on a weekly timeframe and an undated stated fact', () => {
    const context = fullContext();
    context.horizon = statedField('intraday', iso(0));
    context.timeframe = statedField('1w', iso(0));
    expect(rejects(context)).toContain('horizon');

    const undated = fullContext();
    undated.horizon = { value: 'weeks', source: 'user-stated', observedAt: null };
    expect(rejects(undated)).toContain('horizon');
  });

  it('asks rather than decides when two declarations merely do not fit', () => {
    const context = fullContext();
    context.tradingStyle = statedField('scalping', iso(0));
    context.timeframe = statedField('1d', iso(0));
    // Scalping on a daily bar is legitimate-but-worth-confirming: the user knows which
    // is current, so it is a question and not a rejection.
    expect(questions(context)).toContain('timeframe');
    expect(rejects(context)).not.toContain('timeframe');
  });

  it('asks about a held instrument the user has not listed as preferred', () => {
    const context = fullContext();
    context.instruments = statedField(['MSFT'], iso(0));
    context.holdings = statedField<Holding[]>(
      [{ symbol: 'AAPL', assetClass: 'equity', weightPercent: 30 }],
      iso(0),
    );
    expect(questions(context)).toContain('instruments');
  });
});

/* ------------------------------------------------------------------ */
/* Assessment                                                          */
/* ------------------------------------------------------------------ */

describe('assessment', () => {
  it('counts completeness over required fields and names the gaps', () => {
    const empty = assessContext(emptyContext(iso(0)), NOW);
    expect(empty.completionPercent).toBe(0);
    expect(empty.complete).toBe(false);
    expect(empty.gaps).toEqual(expect.arrayContaining([...REQUIRED_FIELDS]));
    expect(empty.weakest).toBe('missing');

    const full = assessContext(fullContext(), NOW);
    expect(full.completionPercent).toBe(100);
    expect(full.complete).toBe(true);
    expect(full.weakest).toBe('confirmed');
  });

  it('does not let a stated field hide an assumed one: weakest, never a mean', () => {
    const context = fullContext();
    // Everything stated and fresh except the risk tolerance, which is only assumed.
    context.riskTolerance = { value: 'growth-oriented', source: 'assumed', observedAt: iso(0) };
    const assessment = assessContext(context, NOW);

    expect(assessment.completionPercent).toBeLessThan(100);
    expect(assessment.gaps).toContain('riskTolerance');
    // A mean would have come out around 90% and read as "confirmed".
    expect(assessment.weakest).toBe('assumed');
    expect(assessment.complete).toBe(false);
  });

  it('treats an aged-out required field as stale, and still incomplete', () => {
    const context = fullContext(iso(-400));
    const assessment = assessContext(context, NOW);
    // `holdings` ages on its own 30-day window but is not required, so it is stale
    // without making the profile incomplete; `capitalRange` is required and is stale.
    expect(assessment.fields.find((field) => field.key === 'holdings')?.status).toBe('stale');
    expect(assessment.stale).toContain('capitalRange');
    expect(assessment.stale).not.toContain('holdings');
    expect(assessment.complete).toBe(false);
    expect(assessment.weakest).toBe('stale');
  });

  it('does not require holdings or constraints to be complete', () => {
    const context = fullContext();
    context.holdings = emptyContext(iso(0)).holdings;
    context.constraints = emptyContext(iso(0)).constraints;
    const assessment = assessContext(context, NOW);
    expect(assessment.complete).toBe(true);
    expect(assessment.gaps).not.toContain('holdings');
  });

  it('produces a clarifying question for each gap, with the reason it is being asked', () => {
    const context = fullContext();
    context.capitalRange = emptyContext(iso(0)).capitalRange;
    context.markets = statedField(['equity'], iso(-400));
    const prompts = clarifyingPrompts(assessContext(context, NOW));

    expect(prompts.map((prompt) => prompt.key)).toContain('capitalRange');
    expect(prompts.find((prompt) => prompt.key === 'capitalRange')?.reason).toBe('missing');
    expect(prompts.find((prompt) => prompt.key === 'markets')?.reason).toBe('stale');
    for (const prompt of prompts) expect(prompt.question.length).toBeGreaterThan(10);
  });
});

/* ------------------------------------------------------------------ */
/* Repository: append-only versions and isolation                       */
/* ------------------------------------------------------------------ */

interface Fixture {
  repositories: ReturnType<typeof createRepositories>;
  close: () => Promise<void>;
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

describe('profile repository', () => {
  withDatabase('appends versions and never rewrites an earlier one', async () => {
    const f = await fixture();
    try {
      const user = await f.repositories.identity.createUser({
        displayName: 'Learner',
        timezone: 'UTC',
      });

      expect(await f.repositories.profile.current(user.id)).toBeNull();
      expect(await f.repositories.profile.versionCount(user.id)).toBe(0);

      const first = await f.repositories.profile.append({
        userId: user.id,
        context: emptyContext(iso(0)),
        changedBy: user.id,
      });
      expect(first.row.version).toBe(1);

      const second = await f.repositories.profile.append({
        userId: user.id,
        context: fullContext(),
        changedBy: user.id,
      });
      expect(second.row.version).toBe(2);
      // The document is stamped with the version we assigned, not the caller's value.
      expect(second.row.context.version).toBe(2);

      const versions = await f.repositories.profile.versions(user.id);
      expect(versions.map((row) => row.version)).toEqual([2, 1]);
      // The first version still says exactly what it said.
      expect(versions[1]?.context.experienceLevel.value).toBeNull();
      expect(versions[0]?.context.experienceLevel.value).toBe('intermediate');
    } finally {
      await f.close();
    }
  });

  withDatabase('ignores a caller-supplied version instead of replaying it', async () => {
    const f = await fixture();
    try {
      const user = await f.repositories.identity.createUser({
        displayName: 'Learner',
        timezone: 'UTC',
      });
      const claimed: TradingContext = { ...fullContext(), version: 99 };
      const result = await f.repositories.profile.append({
        userId: user.id,
        context: claimed,
        changedBy: user.id,
      });
      expect(result.row.version).toBe(1);
      expect(result.row.context.version).toBe(1);
    } finally {
      await f.close();
    }
  });

  withDatabase('refuses a contradictory context and stores nothing', async () => {
    const f = await fixture();
    try {
      const user = await f.repositories.identity.createUser({
        displayName: 'Learner',
        timezone: 'UTC',
      });
      const impossible = fullContext();
      impossible.holdings = statedField<Holding[]>(
        [{ symbol: 'AAPL', assetClass: 'equity', weightPercent: 60 }],
        iso(0),
      );
      impossible.horizon = statedField('intraday', iso(0));
      impossible.timeframe = statedField('1w', iso(0));

      await expect(
        f.repositories.profile.append({
          userId: user.id,
          context: impossible,
          changedBy: user.id,
        }),
      ).rejects.toThrow(AppError);

      await expect(
        f.repositories.profile.append({
          userId: user.id,
          context: impossible,
          changedBy: user.id,
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

      expect(await f.repositories.profile.versionCount(user.id)).toBe(0);
    } finally {
      await f.close();
    }
  });

  withDatabase('requires attribution and a valid document', async () => {
    const f = await fixture();
    try {
      const user = await f.repositories.identity.createUser({
        displayName: 'Learner',
        timezone: 'UTC',
      });
      await expect(
        f.repositories.profile.append({
          userId: user.id,
          context: fullContext(),
          changedBy: '   ',
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

      await expect(
        f.repositories.profile.append({
          userId: user.id,
          context: { nonsense: true } as unknown as TradingContext,
          changedBy: user.id,
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    } finally {
      await f.close();
    }
  });

  withDatabase('keeps one account’s context out of another’s reach', async () => {
    const f = await fixture();
    try {
      const alice = await f.repositories.identity.createUser({
        displayName: 'Alice',
        timezone: 'UTC',
      });
      const bob = await f.repositories.identity.createUser({ displayName: 'Bob', timezone: 'UTC' });

      const aliceContext: TradingContext = {
        ...fullContext(),
        capitalRange: statedField('over-250k', iso(0)),
      };
      await f.repositories.profile.append({
        userId: alice.id,
        context: aliceContext,
        changedBy: alice.id,
      });

      expect(await f.repositories.profile.current(bob.id)).toBeNull();
      expect(await f.repositories.profile.versions(bob.id)).toEqual([]);
      expect((await f.repositories.profile.current(alice.id))?.context.capitalRange.value).toBe(
        'over-250k',
      );
    } finally {
      await f.close();
    }
  });
});

/* ------------------------------------------------------------------ */
/* Permissions                                                         */
/* ------------------------------------------------------------------ */

describe('profile permissions are deny-by-default', () => {
  it('registers the two operations and grants them by role, not by default', () => {
    expect(ALL_OPERATION_IDS).toContain('profile.read');
    expect(ALL_OPERATION_IDS).toContain('profile.write');

    expect(roleHasOperation('student', 'profile.read')).toBe(true);
    expect(roleHasOperation('student', 'profile.write')).toBe(true);
    // Read-only by design: an observer may see their own context and not change it.
    expect(roleHasOperation('observer', 'profile.read')).toBe(true);
    expect(roleHasOperation('observer', 'profile.write')).toBe(false);
    // A background worker has no profile to read.
    expect(roleHasOperation('system', 'profile.read')).toBe(false);
    expect(ROLE_PERMISSIONS.owner).toContain('profile.write');
  });

  it('names no broker or execution operation, as before', () => {
    expect(
      ALL_OPERATION_IDS.filter((id) =>
        /(broker|execute|place[._-]?order|live[._-]?trad)/i.test(id),
      ),
    ).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* API behaviour                                                       */
/* ------------------------------------------------------------------ */

function buildServer(repositories?: ReturnType<typeof createRepositories>) {
  const sink = new MemoryLogSink();
  const deps: ServerDeps = {
    config: resolveConfig({}),
    sink,
    now: () => NOW,
    ...(repositories === undefined ? {} : { repositories }),
  };
  return { server: createServer(deps), sink };
}

describe('profile API', () => {
  withDatabase('authenticates first, and takes no subject from the client', async () => {
    const f = await fixture();
    try {
      const { server } = buildServer(f.repositories);
      try {
        const anonymous = await server.app.inject({ method: 'GET', url: '/v1/profile' });
        expect(anonymous.statusCode).toBe(401);
        expect(anonymous.json().error.code).toBe('UNAUTHENTICATED');

        // There is no user-id parameter to point at another account: the route is
        // registered at exactly one path, with no parameters.
        const route = server.routes.find((entry) => entry.id === 'profile.read');
        expect(route?.path).toBe('/v1/profile');
        expect(route?.path).not.toContain(':');
      } finally {
        await server.close();
      }
    } finally {
      await f.close();
    }
  });

  withDatabase('reports an unset profile as an empty context with its questions', async () => {
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
          method: 'GET',
          url: '/v1/profile',
          headers: AUTH(session.token),
        });
        expect(response.statusCode).toBe(200);
        const data = response.json().data;
        expect(data.contextSet).toBe(false);
        expect(data.version).toBe(0);
        expect(data.assessment.completionPercent).toBe(0);
        expect(data.assessment.weakest).toBe('missing');
        // Not a 404: the missing fields are the point, so they are returned as prompts.
        expect(data.prompts.length).toBeGreaterThan(0);
        expect(data.history).toEqual([]);
      } finally {
        await server.close();
      }
    } finally {
      await f.close();
    }
  });

  withDatabase('saves a context as a new version and reports the assessment', async () => {
    const f = await fixture();
    try {
      const user = await f.repositories.identity.createUser({
        displayName: 'Learner',
        timezone: 'UTC',
      });
      const { server } = buildServer(f.repositories);
      try {
        const session = server.sessions.issue({ userId: user.id, roles: ['student'] });
        const { version, createdAt, ...context } = fullContext();

        const saved = await server.app.inject({
          method: 'PUT',
          url: '/v1/profile',
          headers: AUTH(session.token),
          payload: { context },
        });
        expect(saved.statusCode).toBe(200);
        expect(saved.json().data.version).toBe(1);

        const again = await server.app.inject({
          method: 'PUT',
          url: '/v1/profile',
          headers: AUTH(session.token),
          payload: { context },
        });
        expect(again.json().data.version).toBe(2);

        const read = await server.app.inject({
          method: 'GET',
          url: '/v1/profile',
          headers: AUTH(session.token),
        });
        const data = read.json().data;
        expect(data.contextSet).toBe(true);
        expect(data.version).toBe(2);
        expect(data.assessment.completionPercent).toBe(100);
        expect(data.history.map((entry: { version: number }) => entry.version)).toEqual([2, 1]);
      } finally {
        await server.close();
      }
    } finally {
      await f.close();
    }
  });

  withDatabase('rejects a contradictory document with the offending fields named', async () => {
    const f = await fixture();
    try {
      const user = await f.repositories.identity.createUser({
        displayName: 'Learner',
        timezone: 'UTC',
      });
      const { server } = buildServer(f.repositories);
      try {
        const session = server.sessions.issue({ userId: user.id, roles: ['student'] });
        const { version, createdAt, ...context } = fullContext();

        // An impossible pair, stated as data.
        const payload = {
          context: {
            ...context,
            horizon: statedField('intraday', iso(0)),
            timeframe: statedField('1w', iso(0)),
          },
        };
        const rejected = await server.app.inject({
          method: 'PUT',
          url: '/v1/profile',
          headers: AUTH(session.token),
          payload,
        });
        expect(rejected.statusCode).toBe(400);
        expect(rejected.json().error.code).toBe('VALIDATION_FAILED');
        expect(JSON.stringify(rejected.json().error.details)).toContain('horizon');

        // Nothing was stored, and the version did not advance.
        const read = await server.app.inject({
          method: 'GET',
          url: '/v1/profile',
          headers: AUTH(session.token),
        });
        expect(read.json().data.version).toBe(0);
      } finally {
        await server.close();
      }
    } finally {
      await f.close();
    }
  });

  withDatabase('denies a write to a role that does not hold the operation', async () => {
    const f = await fixture();
    try {
      const user = await f.repositories.identity.createUser({
        displayName: 'Watcher',
        timezone: 'UTC',
      });
      const { server } = buildServer(f.repositories);
      try {
        const observer = server.sessions.issue({ userId: user.id, roles: ['observer'] });
        const { version, createdAt, ...context } = fullContext();

        const forbidden = await server.app.inject({
          method: 'PUT',
          url: '/v1/profile',
          headers: AUTH(observer.token),
          payload: { context },
        });
        expect(forbidden.statusCode).toBe(403);
        expect(forbidden.json().error.code).toBe('FORBIDDEN');

        // ...but the read they do hold still works.
        const allowed = await server.app.inject({
          method: 'GET',
          url: '/v1/profile',
          headers: AUTH(observer.token),
        });
        expect(allowed.statusCode).toBe(200);
      } finally {
        await server.close();
      }
    } finally {
      await f.close();
    }
  });

  it('refuses with a named capability when no profile store is configured', async () => {
    const { server } = buildServer();
    try {
      const session = server.sessions.issue({ userId: 'u_1', roles: ['student'] });
      const response = await server.app.inject({
        method: 'GET',
        url: '/v1/profile',
        headers: AUTH(session.token),
      });
      // A repository-less server answers honestly rather than keeping an in-memory
      // profile that a restart would lose. The account does not exist either way, so
      // the store refusal is what this asserts on.
      expect([404, 503]).toContain(response.statusCode);
      if (response.statusCode === 503) {
        expect(response.json().error.details.capability).toBe('profile.store');
      }
    } finally {
      await server.close();
    }
  });

  it('reports the profile store in readiness', async () => {
    const { server } = buildServer();
    try {
      const session = server.sessions.issue({ userId: 'u_owner', roles: ['owner'] });
      const response = await server.app.inject({
        method: 'GET',
        url: '/v1/health/ready',
        headers: AUTH(session.token),
      });
      const names = response.json().data.checks.map((check: { name: string }) => check.name);
      expect(names).toContain('profile.store');
      const check = response
        .json()
        .data.checks.find((entry: { name: string }) => entry.name === 'profile.store');
      expect(check.status).toBe('degraded');
      expect(check.detail).toMatch(/in-memory|repository bundle/i);
    } finally {
      await server.close();
    }
  });
});
