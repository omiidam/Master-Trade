/**
 * The portfolio routes, the stored composition and the boundary around them.
 *
 * The claims this suite defends, beyond the domain and engine suites' own:
 *
 *   1. **The client sends a declaration, never a figure.** Every value in the response was
 *      computed on the server, and a body carrying one is refused rather than ignored.
 *   2. **No route names a subject.** There is no user id in a path or a body, so reading or
 *      writing another account's portfolio is unrepresentable rather than merely forbidden —
 *      and two sessions prove it by seeing their own compositions.
 *   3. **Nothing declared is a state.** An account that has never declared a portfolio gets a
 *      real reading with `declared: false` and readiness that asks for the composition, not an
 *      empty portfolio presented as an answer.
 *   4. **A declaration replaces a composition, and appends a version.** The previous version
 *      stays recoverable, and a redeclaration that failed halfway cannot be observed.
 *   5. **Gaps are named, never filled.** A position with no price produces no market value and
 *      no share of the whole; nothing is estimated and no `null` becomes a zero.
 *   6. **A mixed-currency document is grouped, not converted.** No rate source is wired, so a
 *      single total across currencies is refused rather than invented.
 *   7. **The write is not granted to every role.** An observer reads a portfolio and cannot
 *      declare one.
 *   8. **The log carries no holding.** No symbol, quantity or amount reaches a log line.
 *   9. **Composition is metered and costs nothing.** The entitlement is still resolved and the
 *      attempt is still recorded, because the balance is not the only reason a capability can
 *      be refused.
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

const driver = sqliteDriverInfo();
const withDatabase = driver.available ? it : it.skip;

const NOW = Date.parse('2026-09-21T12:00:00.000Z');
const AUTH = (token: string) => ({ authorization: `Bearer ${token}` });

interface Harness {
  repositories: ReturnType<typeof createRepositories>;
  server: ReturnType<typeof createServer>;
  sink: MemoryLogSink;
  close(): Promise<void>;
}

/** A server over a real, migrated database — the only way to exercise the routes for real. */
async function harness(): Promise<Harness> {
  const directory = mkdtempSync(join(tmpdir(), 'mt-portfolio-'));
  const db = openSqlite({ file: join(directory, 'portfolio.sqlite') });
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

/** A position with a quantity, a price and an entry price: the fully usable case. */
function priced(symbol: string, options: { currency?: string } = {}) {
  const observedAt = new Date(NOW - 3_600_000).toISOString();
  return {
    symbol,
    assetClass: 'equity',
    currency: options.currency ?? 'USD',
    quantity: { value: 10, source: 'user-stated', observedAt: null },
    averageEntryPrice: { value: 100, source: 'user-stated', observedAt: null },
    price: {
      value: 120,
      currency: options.currency ?? 'USD',
      observedAt,
      provenance: {
        source: 'user',
        ref: 'test',
        trust: 'unverified',
        recordedAt: observedAt,
      },
    },
    weightPercent: null,
  };
}

async function session(
  h: Harness,
  userId: string,
  roles: ('student' | 'observer' | 'coach' | 'owner')[] = ['student'],
) {
  return h.server.sessions.issue({ userId, roles });
}

/* ------------------------------------------------------------------ */
/* Reading an undeclared portfolio                                     */
/* ------------------------------------------------------------------ */

describe('reading a portfolio that was never declared', () => {
  withDatabase(
    'answers with declared: false and readiness that asks for the composition',
    async () => {
      const h = await harness();
      try {
        const user = await h.repositories.identity.createUser({
          displayName: 'L',
          timezone: 'UTC',
        });
        const auth = await session(h, user.id);
        const response = await h.server.app.inject({
          method: 'GET',
          url: '/v1/portfolio',
          headers: AUTH(auth.token),
        });

        expect(response.statusCode).toBe(200);
        const body = response.json().data;
        expect(body.declared).toBe(false);
        expect(body.version).toBe(0);
        // No positions, and — the part that matters — no metrics invented for them.
        expect(body.portfolio.positions).toHaveLength(0);
        expect(body.metrics.positions).toHaveLength(0);
        expect(body.metrics.totals.marketValue).toBeNull();
        expect(body.metrics.coverage.priced).toBe(0);
        expect(body.snapshots).toHaveLength(0);

        // Readiness is a real verdict about an empty document, not an absence of one.
        const scopes = body.readiness.map((decision: { scope: string }) => decision.scope);
        expect(scopes).toEqual(['portfolio.composition', 'portfolio.risk']);
        for (const decision of body.readiness) {
          expect(['REQUIRES_CLARIFICATION', 'BLOCKED']).toContain(decision.readiness);
          expect(decision.findings.map((found: { code: string }) => found.code)).toContain(
            'no-positions',
          );
        }
      } finally {
        await h.close();
      }
    },
  );
});

/* ------------------------------------------------------------------ */
/* Declaring                                                           */
/* ------------------------------------------------------------------ */

describe('declaring a composition', () => {
  withDatabase('stores the document, computes every figure, and appends a version', async () => {
    const h = await harness();
    try {
      const user = await h.repositories.identity.createUser({ displayName: 'L', timezone: 'UTC' });
      const auth = await session(h, user.id);

      const first = await h.server.app.inject({
        method: 'PUT',
        url: '/v1/portfolio',
        headers: AUTH(auth.token),
        payload: {
          name: 'Long-term',
          baseCurrency: 'USD',
          cashWeightPercent: null,
          positions: [priced('VOO'), priced('VTI')],
        },
      });

      expect(first.statusCode).toBe(200);
      const body = first.json().data;
      expect(body.declared).toBe(true);
      expect(body.version).toBe(1);
      expect(body.portfolio.name).toBe('Long-term');

      // The arithmetic is the server's: 10 × 120 twice = 2400, cost 10 × 100 twice = 2000.
      expect(body.metrics.totals.marketValue).toBeCloseTo(2400, 6);
      expect(body.metrics.totals.costBasis).toBeCloseTo(2000, 6);
      expect(body.metrics.totals.unrealisedPnl).toBeCloseTo(400, 6);
      expect(body.metrics.valuationComplete).toBe(true);
      // Ids are minted here, so a client cannot name a row it does not own.
      for (const position of body.portfolio.positions) {
        expect(typeof position.id).toBe('string');
        expect(position.id.length).toBeGreaterThan(0);
      }
      // Two equal positions: half each, and an HHI of exactly two equal positions.
      const set = body.metrics.weights.byMarketValue;
      expect(set.totalPercent).toBeCloseTo(100, 6);
      expect(set.top1Percent).toBeCloseTo(50, 6);
      expect(set.effectivePositions).toBeCloseTo(2, 6);

      // A second declaration is version 2, and the first is still on the timeline.
      const second = await h.server.app.inject({
        method: 'PUT',
        url: '/v1/portfolio',
        headers: AUTH(auth.token),
        payload: {
          name: 'Long-term',
          baseCurrency: 'USD',
          cashWeightPercent: null,
          positions: [priced('VOO')],
        },
      });
      const secondBody = second.json().data;
      expect(secondBody.version).toBe(2);
      expect(secondBody.portfolio.positions).toHaveLength(1);
      expect(secondBody.snapshots).toHaveLength(2);
      expect(secondBody.snapshots[0].version).toBe(2);

      // A redeclaration replaces the composition; it never patches rows.
      const read = await h.server.app.inject({
        method: 'GET',
        url: '/v1/portfolio',
        headers: AUTH(auth.token),
      });
      expect(read.json().data.portfolio.positions).toHaveLength(1);
      expect(read.json().data.metrics.totals.marketValue).toBeCloseTo(1200, 6);
    } finally {
      await h.close();
    }
  });

  withDatabase('refuses a body that carries a figure the client does not own', async () => {
    const h = await harness();
    try {
      const user = await h.repositories.identity.createUser({ displayName: 'L', timezone: 'UTC' });
      const auth = await session(h, user.id);

      for (const extra of [{ marketValue: 999_999 }, { version: 42 }, { userId: 'someone-else' }]) {
        const response = await h.server.app.inject({
          method: 'PUT',
          url: '/v1/portfolio',
          headers: AUTH(auth.token),
          payload: {
            name: 'x',
            baseCurrency: 'USD',
            cashWeightPercent: null,
            positions: [],
            ...extra,
          },
        });
        // Strict schemas: an unknown key is a validation error, not a field that is quietly
        // dropped while the user believes they recorded it.
        expect(response.statusCode).toBe(400);
        expect('userId' in extra ? response.json().error.message : '').not.toContain(
          'someone-else',
        );
      }

      // Nothing was stored by any of the three attempts.
      const read = await h.server.app.inject({
        method: 'GET',
        url: '/v1/portfolio',
        headers: AUTH(auth.token),
      });
      expect(read.json().data.declared).toBe(false);
    } finally {
      await h.close();
    }
  });

  withDatabase('refuses a symbol declared twice, because its size would be ambiguous', async () => {
    const h = await harness();
    try {
      const user = await h.repositories.identity.createUser({ displayName: 'L', timezone: 'UTC' });
      const auth = await session(h, user.id);

      const response = await h.server.app.inject({
        method: 'PUT',
        url: '/v1/portfolio',
        headers: AUTH(auth.token),
        payload: {
          name: 'x',
          baseCurrency: 'USD',
          cashWeightPercent: null,
          positions: [priced('VOO'), priced('voo')],
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_FAILED');
    } finally {
      await h.close();
    }
  });

  withDatabase('rejects an unsupported currency rather than storing it', async () => {
    const h = await harness();
    try {
      const user = await h.repositories.identity.createUser({ displayName: 'L', timezone: 'UTC' });
      const auth = await session(h, user.id);

      const response = await h.server.app.inject({
        method: 'PUT',
        url: '/v1/portfolio',
        headers: AUTH(auth.token),
        payload: {
          name: 'x',
          baseCurrency: 'USD',
          cashWeightPercent: null,
          positions: [priced('VOO', { currency: 'XYZ' })],
        },
      });

      expect(response.statusCode).toBe(400);
    } finally {
      await h.close();
    }
  });
});

/* ------------------------------------------------------------------ */
/* Gaps                                                                */
/* ------------------------------------------------------------------ */

describe('gaps the engine will not fill', () => {
  withDatabase('produces no value and no share for a position with no price', async () => {
    const h = await harness();
    try {
      const user = await h.repositories.identity.createUser({ displayName: 'L', timezone: 'UTC' });
      const auth = await session(h, user.id);

      const response = await h.server.app.inject({
        method: 'PUT',
        url: '/v1/portfolio',
        headers: AUTH(auth.token),
        payload: {
          name: 'Partial',
          baseCurrency: 'USD',
          cashWeightPercent: null,
          positions: [
            {
              symbol: 'VOO',
              assetClass: 'equity',
              currency: 'USD',
              quantity: { value: 5, source: 'user-stated', observedAt: null },
              averageEntryPrice: { value: 100, source: 'user-stated', observedAt: null },
              // No price at all.
              price: null,
              weightPercent: 60,
            },
          ],
        },
      });

      const body = response.json().data;
      const position = body.metrics.positions[0];
      expect(position.marketValue).toBeNull();
      expect(position.unrealisedPnl).toBeNull();
      // No total exists either: a value computed from one position that cannot be valued is a
      // total of a portfolio that does not exist.
      expect(body.metrics.totals.marketValue).toBeNull();
      expect(body.metrics.valuationComplete).toBe(false);
      // The declared share is still usable, so a population of declared weights exists.
      expect(body.metrics.weights.byDeclaredWeight).not.toBeNull();
      expect(body.metrics.weights.byMarketValue).toBeNull();
      // And the absence is named, with what would close it: the finding says *why* the price
      // could not be used, and the gap says which figure therefore does not exist.
      const findings = body.assessment.findings.map((found: { code: string }) => found.code);
      expect(findings).toContain('price-missing');
      const codes = body.metrics.gaps.map((gap: { code: string }) => gap.code);
      expect(codes).toContain('incomplete-valuation');
      expect(body.assessment.worst).not.toBeNull();

      // The risk scope is gated on the price; the composition scope is not, because a
      // composition can be described completely without one.
      const composition = body.readiness.find(
        (decision: { scope: string }) => decision.scope === 'portfolio.composition',
      );
      const risk = body.readiness.find(
        (decision: { scope: string }) => decision.scope === 'portfolio.risk',
      );
      expect(composition.readiness).not.toBe('BLOCKED');
      expect(['REQUIRES_CLARIFICATION', 'BLOCKED']).toContain(risk.readiness);
    } finally {
      await h.close();
    }
  });

  withDatabase('groups a mixed-currency document instead of converting it', async () => {
    const h = await harness();
    try {
      const user = await h.repositories.identity.createUser({ displayName: 'L', timezone: 'UTC' });
      const auth = await session(h, user.id);

      const response = await h.server.app.inject({
        method: 'PUT',
        url: '/v1/portfolio',
        headers: AUTH(auth.token),
        payload: {
          name: 'Mixed',
          baseCurrency: 'USD',
          cashWeightPercent: null,
          positions: [priced('VOO', { currency: 'USD' }), priced('CSPX', { currency: 'EUR' })],
        },
      });

      const body = response.json().data;
      expect(body.metrics.totals.marketValue).toBeNull();
      const currencies = body.metrics.totals.byCurrency.map(
        (group: { currency: string }) => group.currency,
      );
      expect([...currencies].sort()).toEqual(['EUR', 'USD']);
      expect(body.metrics.weights.byMarketValue).toBeNull();
    } finally {
      await h.close();
    }
  });
});

/* ------------------------------------------------------------------ */
/* Isolation and permissions                                           */
/* ------------------------------------------------------------------ */

describe('isolation and role boundaries', () => {
  withDatabase('shows each account only its own composition', async () => {
    const h = await harness();
    try {
      const first = await h.repositories.identity.createUser({
        displayName: 'A',
        timezone: 'UTC',
      });
      const second = await h.repositories.identity.createUser({
        displayName: 'B',
        timezone: 'UTC',
      });
      const authA = await session(h, first.id);
      const authB = await session(h, second.id);

      await h.server.app.inject({
        method: 'PUT',
        url: '/v1/portfolio',
        headers: AUTH(authA.token),
        payload: {
          name: 'A only',
          baseCurrency: 'USD',
          cashWeightPercent: null,
          positions: [priced('VOO')],
        },
      });

      const asB = await h.server.app.inject({
        method: 'GET',
        url: '/v1/portfolio',
        headers: AUTH(authB.token),
      });
      expect(asB.json().data.declared).toBe(false);
      expect(asB.json().data.portfolio.positions).toHaveLength(0);

      // And there is no query parameter that could ask for somebody else's.
      const probed = await h.server.app.inject({
        method: 'GET',
        url: '/v1/portfolio?userId=usr_other',
        headers: AUTH(authB.token),
      });
      expect(probed.statusCode).toBe(400);
    } finally {
      await h.close();
    }
  });

  withDatabase('lets an observer read and refuses a declaration', async () => {
    const h = await harness();
    try {
      const user = await h.repositories.identity.createUser({ displayName: 'O', timezone: 'UTC' });
      const auth = await session(h, user.id, ['observer']);

      const read = await h.server.app.inject({
        method: 'GET',
        url: '/v1/portfolio',
        headers: AUTH(auth.token),
      });
      expect(read.statusCode).toBe(200);

      const write = await h.server.app.inject({
        method: 'PUT',
        url: '/v1/portfolio',
        headers: AUTH(auth.token),
        payload: { name: 'x', baseCurrency: 'USD', cashWeightPercent: null, positions: [] },
      });
      // Deny-by-default: the role table has no `portfolio.write` for an observer.
      expect(write.statusCode).toBe(403);
      expect(write.json().error.code).toBe('FORBIDDEN');
    } finally {
      await h.close();
    }
  });

  withDatabase('refuses an unauthenticated read', async () => {
    const h = await harness();
    try {
      const response = await h.server.app.inject({ method: 'GET', url: '/v1/portfolio' });
      expect(response.statusCode).toBe(401);
    } finally {
      await h.close();
    }
  });

  withDatabase(
    'refuses a server with no portfolio store rather than reporting an empty one',
    async () => {
      const sink = new MemoryLogSink();
      const server = createServer({ config: resolveConfig({}), sink, now: () => NOW });
      const auth = server.sessions.issue({ userId: 'u1', roles: ['student'] });
      const response = await server.app.inject({
        method: 'GET',
        url: '/v1/portfolio',
        headers: AUTH(auth.token),
      });
      expect(response.statusCode).toBe(503);
      expect(response.json().error.code).toBe('PROVIDER_UNAVAILABLE');
    },
  );
});

/* ------------------------------------------------------------------ */
/* Logging and metering                                                */
/* ------------------------------------------------------------------ */

describe('what the log and the ledger record', () => {
  withDatabase('logs counts and codes, never a symbol, a quantity or an amount', async () => {
    const h = await harness();
    try {
      const user = await h.repositories.identity.createUser({ displayName: 'L', timezone: 'UTC' });
      const auth = await session(h, user.id);

      await h.server.app.inject({
        method: 'PUT',
        url: '/v1/portfolio',
        headers: AUTH(auth.token),
        payload: {
          name: 'Secret name',
          baseCurrency: 'USD',
          cashWeightPercent: null,
          positions: [priced('VOO')],
        },
      });
      await h.server.app.inject({
        method: 'GET',
        url: '/v1/portfolio',
        headers: AUTH(auth.token),
      });

      const text = h.sink.records.map((record) => JSON.stringify(record)).join('\n');

      // A holding can be somebody's entire financial position, so none of it is logged.
      //
      // The three string checks read the whole frame, which is safe because a symbol, a name and a
      // source label cannot occur inside a timestamp. The price cannot be checked that way: it is
      // the bare number 120, and the frame contains ISO timestamps with millisecond precision and
      // `durationMs` values — so a substring match made this assertion depend on whether a
      // millisecond happened to be `.120Z`. It fired exactly that way on 2026-09-23. The price is
      // therefore compared as a number, over the log payloads, with the timing fields excluded
      // because a duration is not portfolio data.
      expect(text).not.toContain('VOO');
      expect(text).not.toContain('Secret name');
      expect(text).not.toContain('user-stated');

      const portfolioValues: unknown[] = [];
      const collect = (value: unknown, key = ''): void => {
        if (key === 'durationMs' || key === 'time') return;
        if (Array.isArray(value)) {
          value.forEach((entry) => collect(entry));
          return;
        }
        if (value && typeof value === 'object') {
          for (const [name, entry] of Object.entries(value)) collect(entry, name);
          return;
        }
        portfolioValues.push(value);
      };
      for (const record of h.sink.records) collect(record.data);

      // Fields the log payload carries, as numbers, are what a leak would look like.
      expect(portfolioValues).not.toContain(120); // the price
      expect(portfolioValues).not.toContain(10); // the quantity
      expect(portfolioValues).not.toContain(100); // the average entry price
      // Counts and codes are logged, which is what makes the line useful at all.
      expect(text).toContain('portfolio.read');
      expect(text).toContain('portfolio.write');
      expect(text).toContain('positions');
    } finally {
      await h.close();
    }
  });

  withDatabase('records the composition attempt in the usage history, at no cost', async () => {
    const h = await harness();
    try {
      const user = await h.repositories.identity.createUser({ displayName: 'L', timezone: 'UTC' });
      const auth = await session(h, user.id);

      await h.server.app.inject({
        method: 'GET',
        url: '/v1/portfolio',
        headers: AUTH(auth.token),
      });

      const events = await h.repositories.usage.usageEvents(user.id, { limit: 20 });
      const attempt = events.find((row) => row.feature === 'portfolio.composition');
      expect(attempt).toBeDefined();
      // Free by construction, and recorded anyway: the attempt is what makes "the platform ran
      // this and it cost nothing" checkable rather than asserted.
      expect(attempt?.credits).toBe(0);
      expect(attempt?.status).toBe('settled');
      // Resolving the entitlement is what grants the period allowance, so the balance is the
      // free plan's twenty credits and not one credit less: a zero-cost attempt moves nothing.
      expect(await h.repositories.usage.balance(user.id)).toBe(20);
      // The note is a summary the platform writes for itself, and it is bounded: a catalogue
      // string longer than the column's own check must not be able to fail the write.
      expect((attempt?.note ?? '').length).toBeLessThanOrEqual(240);
    } finally {
      await h.close();
    }
  });
});
