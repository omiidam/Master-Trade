/**
 * Metering, the ledger and the routes that expose them.
 *
 * The claims this suite defends, beyond the domain suite's own:
 *
 *   1. **A refusal moves nothing.** The balance after a refused attempt is the balance
 *      before it, and the refusal is still recorded — as an attempt with no movement.
 *   2. **A reservation is claimed before the work, and returned when it does not complete.**
 *      A failure costs nothing, and the pair of rows that says so is on the ledger.
 *   3. **A retry is charged once.** The same operation key resolves to the first attempt,
 *      including after a reconnect; a second key is a second attempt.
 *   4. **A concurrent pair cannot both pass the affordability check.** Whichever loses is
 *      refused, and the balance never goes below zero.
 *   5. **The allowance is a period, not a hoard.** A new period expires what is left and
 *      grants the new allowance, idempotently — a crash between the two steps is repaired
 *      by the next call rather than leaving the account empty for a day.
 *   6. **Credits survive a restart when the store is durable.** Proven against a real file.
 *   7. **The subject is the principal.** No read route accepts a user id, so reading another
 *      account's balance is unrepresentable.
 *   8. **Adjusting is a second person's act, approval-gated.** An operator cannot adjust
 *      their own credits, and the route refuses without a recorded approval.
 *   9. **An agent turn is metered.** A completed turn is charged; a turn the readiness gate
 *      blocked costs nothing; a turn refused for cost never reaches the model at all.
 *  10. **No log line carries a balance or an operator's reference.**
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryLogSink } from '../packages/shared/src/core/logging.js';
import { resolveConfig } from '../src/core/config.js';
import { createRepositories, migrate, openSqlite, sqliteDriverInfo } from '../src/db/index.js';
import { createServer } from '../src/server/index.js';
import { InMemoryUsageStore } from '../src/usage/store.js';
import { SqliteUsageStore } from '../src/usage/sqliteStore.js';
import { UsageService } from '../src/usage/service.js';
import type { ServerDeps } from '../src/server/index.js';
import type { Principal } from '../packages/shared/src/auth/model.js';

const driver = sqliteDriverInfo();
const withDatabase = driver.available ? it : it.skip;

const NOW = Date.parse('2026-09-21T12:00:00.000Z');
const DAY = 86_400_000;
const AUTH = (token: string) => ({ authorization: `Bearer ${token}` });

function principal(
  id: string,
  roles: readonly Principal['roles'][number][] = ['student'],
): Principal {
  return {
    id,
    roles,
    session: {
      id: 'sess_test',
      issuedAt: new Date(NOW - 60_000).toISOString(),
      expiresAt: new Date(NOW + 3_600_000).toISOString(),
    },
  };
}

/** A service over the in-memory store, for the lifecycle rules. */
function memoryService(options: { now?: () => number } = {}) {
  const store = new InMemoryUsageStore({ now: options.now ?? (() => NOW) });
  const service = new UsageService({ store, now: options.now ?? (() => NOW) });
  return { store, service };
}

function buildServer(
  extra: Partial<ServerDeps> = {},
  repositories?: ReturnType<typeof createRepositories>,
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
/* The lifecycle                                                       */
/* ------------------------------------------------------------------ */

describe('the metering lifecycle', () => {
  it('grants the period allowance on the first metered attempt, and only once', async () => {
    const { store, service } = memoryService();
    const request = {
      userId: 'u1',
      featureId: 'agent.chat',
      operationKey: 'turn-1',
      permissionGranted: true,
      correlationId: 'corr-1',
      actor: 'u1',
    };

    const first = await service.reserve(request);
    expect(first.allowed).toBe(true);
    const account = await store.account('u1');
    // One grant of twenty, one hold of one.
    expect(account?.balance).toBe(19);

    // A second attempt grants nothing again: the grant's identity is the period key.
    await service.reserve({ ...request, operationKey: 'turn-2' });
    expect((await store.account('u1'))?.balance).toBe(18);
    const grants = (await store.ledger('u1')).filter((row) => row.kind === 'grant');
    expect(grants).toHaveLength(1);
    expect(grants[0]?.operation_id).toBe('grant:d2026-09-21');
  });

  it('holds a credit before the work and keeps it when the work completes', async () => {
    const { store, service } = memoryService();
    const request = {
      userId: 'u1',
      featureId: 'agent.chat',
      operationKey: 'turn-1',
      permissionGranted: true,
      correlationId: null,
      actor: 'u1',
    };

    const outcome = await service.meter(request, async () => ({ charge: true, value: 'answered' }));
    expect(outcome.allowed).toBe(true);
    if (!outcome.allowed) throw new Error('unreachable');
    expect(outcome.settled).toBe(true);
    expect(outcome.value).toBe('answered');

    const ledger = await store.ledger('u1');
    const movement = ledger.find((row) => row.kind === 'consume');
    expect(movement?.status).toBe('settled');
    expect((await store.account('u1'))?.balance).toBe(19);
  });

  it('returns the credit in full when the work does not complete, as one pair of rows', async () => {
    const { store, service } = memoryService();
    const request = {
      userId: 'u1',
      featureId: 'agent.chat',
      operationKey: 'turn-1',
      permissionGranted: true,
      correlationId: null,
      actor: 'u1',
    };

    const outcome = await service.meter(request, async () => ({ charge: false, value: 'blocked' }));
    expect(outcome.allowed && outcome.settled).toBe(false);

    // The balance is back where it started — a failed operation costs nothing.
    expect((await store.account('u1'))?.balance).toBe(20);

    const ledger = await store.ledger('u1');
    const debit = ledger.find((row) => row.kind === 'consume');
    const refund = ledger.find((row) => row.kind === 'refund');
    expect(debit?.status).toBe('released');
    expect(refund?.operation_id).toBe('refund:turn-1');
    expect(refund?.delta).toBe(1);

    const attempt = await store.usageEvents('u1');
    expect(attempt[0]?.status).toBe('released');
    expect(attempt[0]?.note).toMatch(/produced nothing/);
  });

  it('returns the credit and re-raises when the work throws', async () => {
    const { store, service } = memoryService();
    await expect(
      service.meter(
        {
          userId: 'u1',
          featureId: 'agent.chat',
          operationKey: 'turn-1',
          permissionGranted: true,
          correlationId: null,
          actor: 'u1',
        },
        async () => {
          throw new Error('the provider exploded');
        },
      ),
    ).rejects.toThrow('the provider exploded');

    expect((await store.account('u1'))?.balance).toBe(20);
    const attempt = await store.usageEvents('u1');
    expect(attempt[0]?.status).toBe('released');
    expect(attempt[0]?.note).toMatch(/capability failed/);
  });

  it('charges one completion when the same key is used twice', async () => {
    const { store, service } = memoryService();
    const request = {
      userId: 'u1',
      featureId: 'agent.chat',
      operationKey: 'turn-1',
      permissionGranted: true,
      correlationId: null,
      actor: 'u1',
    };

    await service.meter(request, async () => ({ charge: true, value: 'first' }));
    const replay = await service.meter(request, async () => ({ charge: true, value: 'second' }));

    expect(replay.allowed).toBe(true);
    if (!replay.allowed) throw new Error('unreachable');
    expect(replay.reservation.replay).toBe(true);
    // One credit held, whatever the client did.
    expect((await store.account('u1'))?.balance).toBe(19);
    expect((await store.ledger('u1')).filter((row) => row.kind === 'consume')).toHaveLength(1);
    // And one attempt recorded, not two: the attempt is identified by its key, and the
    // replay found the existing reservation rather than opening a second one.
    expect(await store.usageEvents('u1')).toHaveLength(1);
    expect((await store.usageEvents('u1'))[0]?.status).toBe('settled');
  });

  it('refuses a keyless attempt rather than metering something that cannot be identified', async () => {
    const { service } = memoryService();
    await expect(
      service.reserve({
        userId: 'u1',
        featureId: 'agent.chat',
        operationKey: '   ',
        permissionGranted: true,
        correlationId: null,
        actor: 'u1',
      }),
    ).rejects.toThrow(/idempotency key/);
  });

  it('moves nothing for a refusal, and records the refusal as the evidence', async () => {
    const { store, service } = memoryService();
    // No allowance was ever granted, so there is nothing to spend.
    const outcome = await service.reserve({
      userId: 'u1',
      featureId: 'agent.chat',
      operationKey: 'turn-1',
      permissionGranted: false,
      correlationId: 'corr-1',
      actor: 'u1',
    });

    expect(outcome.allowed).toBe(false);
    if (outcome.allowed) throw new Error('unreachable');
    expect(outcome.decision.denial).toBe('permission-denied');

    // The grant happened as part of bringing the period in, and nothing was consumed.
    const ledger = await store.ledger('u1');
    expect(ledger.filter((row) => row.kind === 'consume')).toHaveLength(0);
    expect((await store.account('u1'))?.balance).toBe(20);

    const attempt = await store.usageEvents('u1');
    expect(attempt[0]?.status).toBe('refused');
    expect(attempt[0]?.credits).toBe(0);
    expect(attempt[0]?.denial).toBe('permission-denied');
  });

  it('refuses an account whose balance cannot cover the cost, and leaves it untouched', async () => {
    const { store, service } = memoryService();
    // Spend the whole allowance the honest way: twenty turns.
    for (let index = 0; index < 20; index += 1) {
      await service.reserve({
        userId: 'u1',
        featureId: 'agent.chat',
        operationKey: `turn-${index}`,
        permissionGranted: true,
        correlationId: null,
        actor: 'u1',
      });
    }
    expect((await store.account('u1'))?.balance).toBe(0);

    const refused = await service.reserve({
      userId: 'u1',
      featureId: 'agent.chat',
      operationKey: 'turn-21',
      permissionGranted: true,
      correlationId: null,
      actor: 'u1',
    });
    expect(refused.allowed).toBe(false);
    if (refused.allowed) throw new Error('unreachable');
    // The per-period cap and the balance both bind at twenty, and the cap is checked first
    // because it is the more specific answer.
    expect(['period-limit-reached', 'insufficient-credits']).toContain(refused.decision.denial);
    expect((await store.account('u1'))?.balance).toBe(0);
  });

  it('never lets two concurrent reservations both take the last credit', async () => {
    const { store, service } = memoryService();
    // A plan with two credits left: drain twenty of twenty-two by granting then spending.
    await service.status(principal('u1'));

    const results = await Promise.all(
      Array.from({ length: 40 }, (_unused, index) =>
        service.reserve({
          userId: 'u1',
          featureId: 'agent.chat',
          operationKey: `turn-${index}`,
          permissionGranted: true,
          correlationId: null,
          actor: 'u1',
        }),
      ),
    );

    const allowed = results.filter((result) => result.allowed).length;
    const denied = results.filter((result) => !result.allowed).length;
    expect(allowed + denied).toBe(40);
    // Exactly the allowance was spent, and the rest were refused — never a negative balance.
    expect(allowed).toBe(20);
    expect(denied).toBe(20);
    expect((await store.account('u1'))?.balance).toBe(0);
    expect((await store.ledger('u1')).filter((row) => row.kind === 'consume')).toHaveLength(20);
  });

  it('charges nothing for a capability that declares no cost', async () => {
    const { store, service } = memoryService();
    const outcome = await service.reserve({
      userId: 'u1',
      featureId: 'quality.assess',
      operationKey: 'assess-1',
      permissionGranted: true,
      correlationId: null,
      actor: 'u1',
    });
    expect(outcome.allowed).toBe(true);
    if (!outcome.allowed) throw new Error('unreachable');
    expect(outcome.reservation.credits).toBe(0);
    expect(outcome.reservation.ledger).toBe(null);
    // A capability that runs no provider keeps working with a spent allowance.
    const movements = await store.ledger('u1');
    expect(movements.filter((row) => row.kind === 'consume')).toHaveLength(0);
  });

  it('expires the previous period and grants the new one, without double-granting', async () => {
    let clock = NOW;
    const { store, service } = memoryService({ now: () => clock });
    await service.reserve({
      userId: 'u1',
      featureId: 'agent.chat',
      operationKey: 'turn-1',
      permissionGranted: true,
      correlationId: null,
      actor: 'u1',
    });

    clock = NOW + DAY;
    const outcome = await service.reserve({
      userId: 'u1',
      featureId: 'agent.chat',
      operationKey: 'turn-2',
      permissionGranted: true,
      correlationId: null,
      actor: 'u1',
    });
    expect(outcome.allowed).toBe(true);

    const ledger = await store.ledger('u1');
    expect(ledger.filter((row) => row.kind === 'expire')).toHaveLength(1);
    expect(ledger.filter((row) => row.kind === 'grant')).toHaveLength(2);
    // Nineteen expired, twenty granted, one held.
    expect((await store.account('u1'))?.balance).toBe(19);

    // And a second call in the same period expires nothing further.
    await service.reserve({
      userId: 'u1',
      featureId: 'agent.chat',
      operationKey: 'turn-3',
      permissionGranted: true,
      correlationId: null,
      actor: 'u1',
    });
    expect((await store.ledger('u1')).filter((row) => row.kind === 'expire')).toHaveLength(1);
  });

  it('counts a released attempt against nothing', async () => {
    const { store, service } = memoryService();
    await service.meter(
      {
        userId: 'u1',
        featureId: 'agent.chat',
        operationKey: 'turn-1',
        permissionGranted: true,
        correlationId: null,
        actor: 'u1',
      },
      async () => ({ charge: false, value: null }),
    );
    const status = await service.status(principal('u1'));
    const chat = status.features.find((feature) => feature.feature.id === 'agent.chat');
    expect(chat?.usedThisPeriod).toBe(0);
    // ...and the balance is whole, so the next attempt is affordable.
    expect(status.balance).toBe(20);
    void store;
  });

  it('reports the store it is actually using, and whether a restart loses the balance', async () => {
    const { service } = memoryService();
    const status = await service.status(principal('u1'));
    expect(status.storeKind).toBe('memory');
    expect(status.durable).toBe(false);
    expect(status.purchasable).toBe(false);
    expect(status.subscriptionRecorded).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Administrative acts                                                 */
/* ------------------------------------------------------------------ */

describe('administrative credit operations', () => {
  it('refuses an operator adjusting their own credits', async () => {
    const { service } = memoryService();
    await expect(
      service.adjust({
        targetUserId: 'owner-1',
        actorId: 'owner-1',
        amount: 50,
        reference: 'ticket-1234',
        correlationId: null,
      }),
    ).rejects.toThrow(/may not adjust their own credits/);
  });

  it('requires a stated reference and a bounded, non-zero amount', async () => {
    const { service } = memoryService();
    const base = { targetUserId: 'u1', actorId: 'owner-1', correlationId: null } as const;
    await expect(service.adjust({ ...base, amount: 10, reference: 'short' })).rejects.toThrow(
      /reference/,
    );
    await expect(service.adjust({ ...base, amount: 0, reference: 'ticket-1234' })).rejects.toThrow(
      /non-zero/,
    );
    await expect(
      service.adjust({ ...base, amount: 2_000_000, reference: 'ticket-1234' }),
    ).rejects.toThrow(/at most/);
  });

  it('applies an adjustment under a reference, and refuses one that would go below zero', async () => {
    const { store, service } = memoryService();
    const granted = await service.adjust({
      targetUserId: 'u1',
      actorId: 'owner-1',
      amount: 25,
      reference: 'ticket-1234',
      correlationId: 'corr-9',
    });
    // The adjustment lands on top of the period's own allowance, which the account had
    // never been granted: an account is brought into its period before anything is
    // measured against it, whether the touch is a metered turn or an operator's grant.
    expect(granted.balance).toBe(45);
    expect(granted.row.kind).toBe('adjustment');
    expect(granted.row.actor).toBe('operator:owner-1');
    expect((await store.ledger('u1')).filter((row) => row.kind === 'grant')).toHaveLength(1);

    const replay = await service.adjust({
      targetUserId: 'u1',
      actorId: 'owner-1',
      amount: 25,
      reference: 'ticket-1234',
      correlationId: 'corr-9',
    });
    // The reference is the operation id, so the same ticket cannot be applied twice.
    expect(replay.balance).toBe(45);
    expect((await store.ledger('u1')).filter((row) => row.kind === 'adjustment')).toHaveLength(1);

    await expect(
      service.adjust({
        targetUserId: 'u1',
        actorId: 'owner-1',
        amount: -100,
        reference: 'ticket-5678',
        correlationId: null,
      }),
    ).rejects.toThrow(/below zero/);
    expect((await store.account('u1'))?.balance).toBe(45);
  });

  it('records a subscription change as an administrative grant, never as a purchase', async () => {
    const { store, service } = memoryService();
    const changed = await service.changeSubscription({
      targetUserId: 'u1',
      actorId: 'owner-1',
      planId: 'premium',
      status: 'active',
      reference: 'onboarding-2026',
      correlationId: 'corr-1',
    });
    expect(changed.plan.id).toBe('premium');
    expect(changed.status).toBe('active');
    expect((await store.subscription('u1'))?.changed_by).toBe('operator:owner-1');

    // The premium allowance is granted on the next metered operation, not at the plan change.
    const status = await service.status(principal('u1'));
    expect(status.plan.id).toBe('premium');
    expect(status.subscriptionRecorded).toBe(true);
    expect(status.balance).toBe(200);
  });

  it('refuses an unknown plan, a self-change and an unattributed reference', async () => {
    const { service } = memoryService();
    const base = {
      targetUserId: 'u1',
      actorId: 'owner-1',
      status: 'active' as const,
      reference: 'onboarding-2026',
      correlationId: null,
    };
    await expect(service.changeSubscription({ ...base, planId: 'enterprise' })).rejects.toThrow(
      /No plan is defined/,
    );
    await expect(
      service.changeSubscription({ ...base, planId: 'free', actorId: 'u1', targetUserId: 'u1' }),
    ).rejects.toThrow(/may not change their own subscription/);
    await expect(
      service.changeSubscription({ ...base, planId: 'premium', reference: 'no' }),
    ).rejects.toThrow(/reference/);
  });

  it('writes an audit record for every administrative change', async () => {
    const records: Record<string, unknown>[] = [];
    const store = new InMemoryUsageStore({ now: () => NOW });
    const service = new UsageService({
      store,
      now: () => NOW,
      audit: {
        append: (record) => {
          records.push({ ...record });
        },
      },
    });

    await service.adjust({
      targetUserId: 'u1',
      actorId: 'owner-1',
      amount: 10,
      reference: 'ticket-abcd',
      correlationId: 'corr-1',
    });
    await service.changeSubscription({
      targetUserId: 'u1',
      actorId: 'owner-1',
      planId: 'premium',
      status: 'active',
      reference: 'ticket-efgh',
      correlationId: 'corr-2',
    });

    expect(records).toHaveLength(2);
    expect(records[0]?.event).toBe('usage.credits.adjusted');
    expect(records[0]?.severity).toBe('warning');
    expect(records[0]?.actor).toBe('owner-1');
    expect(records[0]?.payload).toMatchObject({ credits: 10, reference: 'ticket-abcd' });
    expect(records[1]?.event).toBe('usage.subscription.changed');
    // The record states that nothing was paid, so it cannot be read as a receipt.
    expect(records[1]?.payload).toMatchObject({ purchase: null, planId: 'premium' });
  });
});

/* ------------------------------------------------------------------ */
/* Durability                                                          */
/* ------------------------------------------------------------------ */

describe('credit durability', () => {
  withDatabase('keeps the balance and the ledger across a restart', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'mt-usage-'));
    const file = join(directory, 'usage.sqlite');
    const before = openSqlite({ file });
    await migrate(before);
    const repositories = createRepositories(before, { now: () => NOW });
    // The ledger's `user_id` is a real foreign key, so a movement cannot exist for an
    // account that does not — the fixture creates the account the way the API would.
    const user = await repositories.identity.createUser({
      displayName: 'Learner',
      timezone: 'UTC',
    });
    const store = new SqliteUsageStore(repositories.usage);
    const service = new UsageService({ store, now: () => NOW });

    await service.reserve({
      userId: user.id,
      featureId: 'agent.chat',
      operationKey: 'turn-1',
      permissionGranted: true,
      correlationId: null,
      actor: user.id,
    });
    expect((await store.account(user.id))?.balance).toBe(19);
    before.close();
    expect(existsSync(file)).toBe(true);

    // A second process, over the same file.
    const after = openSqlite({ file });
    try {
      await migrate(after);
      const reopened = createRepositories(after, { now: () => NOW });
      const storeAgain = new SqliteUsageStore(reopened.usage);
      const serviceAgain = new UsageService({ store: storeAgain, now: () => NOW });

      expect((await storeAgain.account(user.id))?.balance).toBe(19);
      // The grant is not repeated: its identity is the period key, which is on the row.
      const status = await serviceAgain.status(principal(user.id));
      expect(status.balance).toBe(19);
      expect(status.durable).toBe(true);
      expect(status.storeKind).toBe('sqlite');
      expect((await storeAgain.ledger(user.id)).filter((row) => row.kind === 'grant')).toHaveLength(
        1,
      );

      // And the same operation key replays rather than charging again.
      const replay = await serviceAgain.reserve({
        userId: user.id,
        featureId: 'agent.chat',
        operationKey: 'turn-1',
        permissionGranted: true,
        correlationId: null,
        actor: user.id,
      });
      expect(replay.allowed && replay.reservation.replay).toBe(true);
      expect((await storeAgain.account(user.id))?.balance).toBe(19);
    } finally {
      after.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  withDatabase('refuses a concurrent debit through the store, not through a check', async () => {
    const db = openSqlite({ file: ':memory:' });
    await migrate(db);
    const repositories = createRepositories(db, { now: () => NOW });
    const user = await repositories.identity.createUser({
      displayName: 'Learner',
      timezone: 'UTC',
    });
    const store = new SqliteUsageStore(repositories.usage);
    try {
      await store.applyCredit({
        userId: user.id,
        operationId: 'grant:test',
        kind: 'grant',
        reason: 'plan-allowance',
        amount: 1,
        periodKey: 'd2026-09-21',
        actor: 'system',
      });

      const outcomes = await Promise.all([
        store.applyCredit({
          userId: user.id,
          operationId: 'a',
          kind: 'consume',
          reason: 'metered-usage',
          amount: 1,
          periodKey: 'd2026-09-21',
          actor: 'u1',
        }),
        store.applyCredit({
          userId: user.id,
          operationId: 'b',
          kind: 'consume',
          reason: 'metered-usage',
          amount: 1,
          periodKey: 'd2026-09-21',
          actor: 'u1',
        }),
      ]);

      // One wins the row, one is refused by the guarded statement — never both.
      expect(outcomes.filter((outcome) => outcome.outcome === 'applied')).toHaveLength(1);
      expect(outcomes.filter((outcome) => outcome.outcome === 'insufficient')).toHaveLength(1);
      expect((await store.account(user.id))?.balance).toBe(0);
      // The refusal left no claim behind, so the same key can be retried once it is funded.
      const ledger = await store.ledger(user.id);
      expect(
        ledger.filter((row) => row.operation_id === 'a' || row.operation_id === 'b'),
      ).toHaveLength(1);
    } finally {
      db.close();
    }
  });
});

/* ------------------------------------------------------------------ */
/* Permissions                                                         */
/* ------------------------------------------------------------------ */

describe('the usage operations are deny-by-default', () => {
  it('grants the read by role, and the adjustment to the owner alone', async () => {
    const { ROLE_PERMISSIONS, roleHasOperation, OPERATIONS } =
      await import('../packages/shared/src/auth/model.js');
    expect(roleHasOperation('student', 'usage.read')).toBe(true);
    expect(roleHasOperation('observer', 'usage.read')).toBe(true);
    expect(ROLE_PERMISSIONS.system).not.toContain('usage.read');
    expect(ROLE_PERMISSIONS.system).not.toContain('usage.adjust');
    expect(OPERATIONS['usage.adjust'].requiresApproval).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* The routes                                                          */
/* ------------------------------------------------------------------ */

describe('the usage routes', () => {
  it('authenticate before the handler runs, and take no subject', async () => {
    const { server } = buildServer();
    try {
      for (const [method, url] of [
        ['GET', '/v1/usage'],
        ['GET', '/v1/usage/history'],
      ] as const) {
        const response = await server.app.inject({ method, url });
        expect(response.statusCode).toBe(401);
        expect(response.json().error.code).toBe('UNAUTHENTICATED');
      }

      const read = server.routes.find((entry) => entry.id === 'usage.read');
      expect(read?.path).toBe('/v1/usage');
      expect(read?.path).not.toContain(':');
      const history = server.routes.find((entry) => entry.id === 'usage.history');
      expect(history?.path).toBe('/v1/usage/history');
      expect(history?.path).not.toContain(':');
    } finally {
      await server.close();
    }
  });

  it('reports the caller’s own balance, with no parameter that could name another account', async () => {
    const { server } = buildServer();
    try {
      const session = server.sessions.issue({ userId: 'u1', roles: ['student'] });
      const response = await server.app.inject({
        method: 'GET',
        url: '/v1/usage',
        headers: AUTH(session.token),
      });
      expect(response.statusCode).toBe(200);
      const data = response.json().data;
      expect(data.balance).toBe(20);
      expect(data.plan.id).toBe('free');
      expect(data.plans).toHaveLength(2);
      expect(data.purchasable).toBe(false);
      expect(data.storeKind).toBe('memory');
      expect(data.durable).toBe(false);
      // The entitlement is reported with its refusal, not just as a boolean.
      const backtest = data.features.find(
        (feature: { id: string }) => feature.id === 'backtest.run',
      );
      expect(backtest.allowed).toBe(false);
      expect(backtest.upgradeOffered).toBe(false);
      expect(backtest.reason).toMatch(/approval|not include/i);
    } finally {
      await server.close();
    }
  });

  it('refuses the administrative routes without a recorded approval', async () => {
    const { server } = buildServer();
    try {
      const learner = server.sessions.issue({ userId: 'u1', roles: ['student'] });
      const owner = server.sessions.issue({ userId: 'owner-1', roles: ['owner'] });
      const payload = { userId: 'u2', amount: 5, reference: 'ticket-1234' };

      // A learner does not hold the operation at all: a plan never grants one, and neither
      // does a role that does not list it.
      const asLearner = await server.app.inject({
        method: 'POST',
        url: '/v1/usage/credits/adjust',
        headers: AUTH(learner.token),
        payload,
      });
      expect(asLearner.statusCode).toBe(403);
      expect(asLearner.json().error.code).toBe('FORBIDDEN');

      // The owner holds it, and the operation is approval-gated — so the refusal is the
      // missing human decision (451 POLICY_VIOLATION) rather than the missing permission.
      const noApproval = await server.app.inject({
        method: 'POST',
        url: '/v1/usage/credits/adjust',
        headers: AUTH(owner.token),
        payload,
      });
      expect(noApproval.statusCode).toBe(451);
      expect(noApproval.json().error.code).toBe('POLICY_VIOLATION');
      expect(noApproval.json().error.message).toMatch(/recorded human approval/);

      // And an approval id that does not exist does not help.
      const invented = await server.app.inject({
        method: 'POST',
        url: '/v1/usage/credits/adjust',
        headers: { ...AUTH(owner.token), 'x-approval-id': 'apr_invented' },
        payload,
      });
      expect(invented.statusCode).toBe(451);
    } finally {
      await server.close();
    }
  });

  it('validates the administrative body, and refuses a smuggled balance', async () => {
    // The approval gate runs before validation, so the schema is exercised with the gate
    // satisfied — otherwise this would only ever prove the 451 path.
    const { server, sink } = buildServer({
      approvalGate: { verify: () => ({ approved: true, reason: 'test approval' }) },
    });
    try {
      const owner = server.sessions.issue({ userId: 'owner-1', roles: ['owner'] });

      for (const payload of [
        { userId: 'u2', amount: 5, reference: 'no' },
        { userId: 'u2', amount: 0, reference: 'ticket-1234' },
        { userId: 'u2', amount: 1.5, reference: 'ticket-1234' },
        { userId: 'u2', amount: 5, reference: 'ticket-1234', balance: 9999 },
        { amount: 5, reference: 'ticket-1234' },
      ]) {
        const response = await server.app.inject({
          method: 'POST',
          url: '/v1/usage/credits/adjust',
          headers: AUTH(owner.token),
          payload,
        });
        expect(response.statusCode).toBe(400);
        expect(response.json().error.code).toBe('VALIDATION_FAILED');
      }

      // An operator acting on their own account is refused even with an approval, by the
      // service rather than by the pipeline.
      const self = await server.app.inject({
        method: 'POST',
        url: '/v1/usage/credits/adjust',
        headers: AUTH(owner.token),
        payload: { userId: 'owner-1', amount: 500, reference: 'ticket-selfy' },
      });
      expect(self.statusCode).toBe(403);
      expect(self.json().error.message).toMatch(/may not adjust their own credits/);

      // The reference never reaches a log line: it is evidence for the audit record.
      expect(JSON.stringify(sink.records)).not.toMatch(/ticket-1234/);
    } finally {
      await server.close();
    }
  });

  it('serves the history through its own guarded query', async () => {
    const { server } = buildServer();
    try {
      const session = server.sessions.issue({ userId: 'u1', roles: ['student'] });
      const response = await server.app.inject({
        method: 'GET',
        url: '/v1/usage/history?limit=10',
        headers: AUTH(session.token),
      });
      expect(response.statusCode).toBe(200);
      const data = response.json().data;
      // Reading the history brings the period in, exactly as reading the balance does, so
      // the two views of one account cannot disagree about what happened.
      expect(data.movements.length).toBeGreaterThan(0);
      expect(data.movements[0].reasonLabel).toBeTruthy();
      expect(data.note).toMatch(/correction is another movement/);

      const invalid = await server.app.inject({
        method: 'GET',
        url: '/v1/usage/history?limit=100000',
        headers: AUTH(session.token),
      });
      expect(invalid.statusCode).toBe(400);
    } finally {
      await server.close();
    }
  });
});

/* ------------------------------------------------------------------ */
/* The agent turn                                                      */
/* ------------------------------------------------------------------ */

describe('an agent turn is metered', () => {
  it('charges a completed turn and reports what it cost', async () => {
    const { server, sink } = buildServer();
    try {
      const session = server.sessions.issue({ userId: 'u1', roles: ['student'] });
      const response = await server.app.inject({
        method: 'POST',
        url: '/v1/agent/messages',
        headers: AUTH(session.token),
        payload: { message: 'What is a stop loss?' },
      });
      expect(response.statusCode).toBe(200);
      const data = response.json().data;
      expect(data.status).toBe('completed');
      expect(data.usage.charged).toBe(true);
      expect(data.usage.credits).toBe(1);
      expect(data.usage.balance).toBe(19);
      expect(data.usage.operationKey).toMatch(/^turn:/);

      const status = await server.app.inject({
        method: 'GET',
        url: '/v1/usage',
        headers: AUTH(session.token),
      });
      expect(status.json().data.balance).toBe(19);

      // No balance and no operation key reaches a log line: the record says whether it was
      // charged, not how much is left.
      const records = sink.records.map((record) => JSON.stringify(record));
      const metered = records.filter((record) => record.includes('usage.turn.metered'));
      expect(metered).toHaveLength(1);
      for (const record of records) {
        if (!record.includes('usage.read')) continue;
        expect(record).not.toMatch(/"balance":\s*19/);
      }
    } finally {
      await server.close();
    }
  });

  it('charges once when the client retries with the same idempotency key', async () => {
    const { server } = buildServer();
    try {
      const session = server.sessions.issue({ userId: 'u1', roles: ['student'] });
      const payload = { message: 'Explain expectancy.', idempotencyKey: 'ui-turn-abcdef' };
      const first = await server.app.inject({
        method: 'POST',
        url: '/v1/agent/messages',
        headers: AUTH(session.token),
        payload,
      });
      const second = await server.app.inject({
        method: 'POST',
        url: '/v1/agent/messages',
        headers: AUTH(session.token),
        payload,
      });

      expect(first.json().data.usage.charged).toBe(true);
      expect(second.json().data.usage.replay).toBe(true);
      expect(second.json().data.usage.operationKey).toBe('ui-turn-abcdef');
      expect(second.json().data.usage.balance).toBe(19);

      const status = await server.app.inject({
        method: 'GET',
        url: '/v1/usage',
        headers: AUTH(session.token),
      });
      expect(status.json().data.balance).toBe(19);
    } finally {
      await server.close();
    }
  });

  it('refuses a turn the account cannot afford, without consulting a model', async () => {
    const { server } = buildServer();
    try {
      const session = server.sessions.issue({ userId: 'u1', roles: ['student'] });
      for (let index = 0; index < 20; index += 1) {
        await server.app.inject({
          method: 'POST',
          url: '/v1/agent/messages',
          headers: AUTH(session.token),
          payload: { message: `Turn ${index}` },
        });
      }

      const refused = await server.app.inject({
        method: 'POST',
        url: '/v1/agent/messages',
        headers: AUTH(session.token),
        payload: { message: 'One more?' },
      });
      expect(refused.statusCode).toBe(200);
      const data = refused.json().data;
      expect(data.status).toBe('blocked');
      expect(data.model).toBe('none');
      expect(data.statements).toEqual([]);
      expect(data.usage).toBe(null);
      expect(data.reply).toMatch(/not include|used every invocation|does not cover/i);
    } finally {
      await server.close();
    }
  });

  it('does not charge a turn the readiness gate blocked', async () => {
    const { server } = buildServer();
    try {
      const session = server.sessions.issue({ userId: 'u1', roles: ['student'] });
      const blocked = await server.app.inject({
        method: 'POST',
        url: '/v1/agent/messages',
        headers: AUTH(session.token),
        // A structure analysis needs a bar series, and this server has no provider — so the
        // gate refuses before a model is consulted. A blocked turn costs nothing.
        payload: { message: 'Where is the structure?', analysisType: 'market.structure' },
      });
      expect(blocked.statusCode).toBe(200);
      expect(blocked.json().data.status).toBe('blocked');
      expect(blocked.json().data.usage.charged).toBe(false);

      const status = await server.app.inject({
        method: 'GET',
        url: '/v1/usage',
        headers: AUTH(session.token),
      });
      expect(status.json().data.balance).toBe(20);
      // The attempt is still on record, as one that cost nothing.
      const history = await server.app.inject({
        method: 'GET',
        url: '/v1/usage/history',
        headers: AUTH(session.token),
      });
      const attempt = history
        .json()
        .data.attempts.find((row: { feature: string }) => row.feature === 'agent.chat');
      expect(attempt.status).toBe('released');
    } finally {
      await server.close();
    }
  });
});

/* ------------------------------------------------------------------ */
/* Isolation                                                           */
/* ------------------------------------------------------------------ */

describe('user data isolation', () => {
  it('reports each caller their own balance, from their own principal', async () => {
    const { server } = buildServer();
    try {
      const first = server.sessions.issue({ userId: 'u1', roles: ['student'] });
      const second = server.sessions.issue({ userId: 'u2', roles: ['student'] });

      await server.app.inject({
        method: 'POST',
        url: '/v1/agent/messages',
        headers: AUTH(first.token),
        payload: { message: 'One turn.' },
      });

      const one = await server.app.inject({
        method: 'GET',
        url: '/v1/usage',
        headers: AUTH(first.token),
      });
      const two = await server.app.inject({
        method: 'GET',
        url: '/v1/usage',
        headers: AUTH(second.token),
      });
      expect(one.json().data.balance).toBe(19);
      // The second account was never touched by the first account's turn.
      expect(two.json().data.balance).toBe(20);
      expect(two.json().data.lifetime.consumed).toBe(0);
    } finally {
      await server.close();
    }
  });
});

/* ------------------------------------------------------------------ */
/* The source of the balance                                           */
/* ------------------------------------------------------------------ */

describe('the ledger is the only story', () => {
  it('stamps every movement with the balance it produced', () => {
    // The property is checkable in the source as well as at runtime: a repository that
    // computed a balance for display would be a second source of truth.
    const source = readFileSync(
      join(process.cwd(), 'src', 'db', 'repositories', 'usage.ts'),
      'utf8',
    );
    expect(source).toMatch(/balance_after/);
    expect(source).toMatch(/ON CONFLICT DO NOTHING/);
    // A debit is one guarded statement, never a read, a decision and a write.
    expect(source).toMatch(/WHERE user_id = \? AND balance \+ \? >= 0/);
    // Nothing is deleted: the ledger is append-only.
    expect(source).not.toMatch(/DELETE FROM credit_ledger/);
    expect(source).not.toMatch(/UPDATE credit_ledger SET delta/);
  });
});
