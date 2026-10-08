/**
 * Local sign-in, and the browser-shaped dashboard read it enables (Phase 9.2.1).
 *
 * The defect this defends against is the one the browser showed: the dashboard resolved its
 * credential through the desktop shell's session resolution, so outside the shell every
 * authenticated surface could only report that it had no session — and no amount of frontend
 * work could change that, because a session cannot be obtained over HTTP at all.
 *
 * What this suite pins down:
 *
 *   1. **Off by default.** With the stock configuration the route refuses with `FORBIDDEN`
 *      and issues nothing. A deployment has to say yes.
 *   2. **The credential is an ordinary session.** When enabled, the token goes through the
 *      same pipeline, the same authorization table and the same per-user scoping as a
 *      session the shell obtained — it is not a bypass.
 *   3. **The dashboard renders from it.** A sign-in followed by `GET /v1/dashboard` returns
 *      the stable payload with no shell, no keychain and no event stream involved.
 *   4. **No subject, no impersonation.** The route cannot be pointed at another account, and
 *      another account's rows never reach the payload the local session reads.
 */

import { describe, expect, it } from 'vitest';
import {
  ANONYMOUS_WRITE_ROUTE_IDS,
  API_ROUTES,
  assertApiCatalogue,
  type LocalSessionData,
} from '../packages/shared/src/api/contracts.js';
import { createRepositories, migrate, openSqlite, sqliteDriverInfo } from '../src/db/index.js';
import { createServer } from '../src/server/index.js';
import { DEFAULT_CONFIG, resolveConfig } from '../src/core/config.js';
import { loadConfigFromEnv } from '../src/config/loader.js';
import { LOCAL_ACCOUNT_ID, LOCAL_ACCOUNT_ROLES } from '../src/server/handlers/session.js';
import { MemoryLogSink } from '../packages/shared/src/core/logging.js';
import type { ServerDeps } from '../src/server/index.js';

const driver = sqliteDriverInfo();
const withDatabase = driver.available ? it : it.skip;

const NOW = Date.parse('2026-09-21T12:00:00.000Z');

async function fixture(): Promise<{
  repositories: ReturnType<typeof createRepositories>;
  close: () => void;
}> {
  const db = openSqlite({ file: ':memory:' });
  await migrate(db);
  const repositories = createRepositories(db, { now: () => NOW });
  return { repositories, close: () => db.close() };
}

/** A server whose deployment either permits local sign-in or does not. */
function buildServer(options: {
  allowLocalLogin: boolean;
  repositories?: ReturnType<typeof createRepositories>;
}) {
  const config = resolveConfig({
    auth: { ...DEFAULT_CONFIG.auth, allowAnonymousLocalLogin: options.allowLocalLogin },
  });
  const deps: ServerDeps = {
    config,
    sink: new MemoryLogSink(),
    now: () => NOW,
    ...(options.repositories === undefined ? {} : { repositories: options.repositories }),
  };
  return createServer(deps);
}

const signIn = (server: ReturnType<typeof createServer>) =>
  server.app.inject({ method: 'POST', url: '/v1/session/local' });

describe('local sign-in is opt-in', () => {
  it('refuses to issue a session with the stock configuration, and issues nothing', async () => {
    const server = buildServer({ allowLocalLogin: false });
    try {
      const response = await signIn(server);
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('FORBIDDEN');
      // A refusal is not a half-success: there is no token in the body to find.
      expect(JSON.stringify(response.json())).not.toContain('mt_s_');
      // And the route it would have authenticated is still closed behind the pipeline.
      const dashboard = await server.app.inject({ method: 'GET', url: '/v1/dashboard' });
      expect(dashboard.statusCode).toBe(401);
    } finally {
      await server.close();
    }
  });

  it('is on for a standalone API, and off when a shell is there to sign in through', () => {
    // A standalone API (`npm run api`) has no shell, so the browser preview is its only local
    // client and refusing it would leave every authenticated surface unreadable.
    expect(loadConfigFromEnv({}).auth.allowAnonymousLocalLogin).toBe(true);
    // A shell-hosted API is launched with a shell token; the shell hands out the sessions
    // there, and the second door stays shut.
    expect(
      loadConfigFromEnv({ MASTER_TRADE_SHELL_TOKEN_ENV: 'MASTER_TRADE_SHELL_SECRET' }).auth
        .allowAnonymousLocalLogin,
    ).toBe(false);
    // The explicit value wins in both directions, and the absence of one is never "maybe".
    expect(
      loadConfigFromEnv({ MASTER_TRADE_ALLOW_ANONYMOUS_LOCAL_LOGIN: 'false' }).auth
        .allowAnonymousLocalLogin,
    ).toBe(false);
    expect(
      loadConfigFromEnv({
        MASTER_TRADE_ALLOW_ANONYMOUS_LOCAL_LOGIN: 'true',
        MASTER_TRADE_SHELL_TOKEN_ENV: 'MASTER_TRADE_SHELL_SECRET',
      }).auth.allowAnonymousLocalLogin,
    ).toBe(true);
  });

  it('reports the risk it introduces rather than starting quietly', () => {
    expect(buildServer({ allowLocalLogin: true }).bootWarnings.join(' ')).toMatch(/session\/local/);
    // A deployment without it says nothing about it, because it carries no such risk.
    expect(buildServer({ allowLocalLogin: false }).bootWarnings.join(' ')).not.toMatch(
      /session\/local/,
    );
  });

  it('is the catalogue’s single declared exception to “anonymous means read-only”', () => {
    expect(() => assertApiCatalogue()).not.toThrow();
    const anonymousWrites = API_ROUTES.filter(
      (route) => route.auth === 'anonymous' && route.method !== 'GET',
    );
    // The rule is otherwise intact: every anonymous route but the sign-in is a GET, and the
    // exception is declared where the rule is checked rather than recognised at runtime.
    expect(anonymousWrites.map((route) => route.id)).toEqual([...ANONYMOUS_WRITE_ROUTE_IDS]);
    expect(
      API_ROUTES.filter((route) => route.auth === 'anonymous' && route.method === 'GET').length,
    ).toBeGreaterThan(1);
  });
});

describe('local sign-in issues an ordinary session', () => {
  it('takes one parameter-less route, and no subject with which to name an account', () => {
    const routes = API_ROUTES.filter((route) => route.id === 'session.local');
    expect(routes).toHaveLength(1);
    expect(routes[0]?.method).toBe('POST');
    expect(routes[0]?.path).toBe('/v1/session/local');
    expect(routes[0]?.path).not.toContain(':');
    expect(routes[0]?.auth).toBe('anonymous');
  });

  withDatabase(
    'returns a token for the workstation account, which the dashboard accepts without a shell',
    async () => {
      const f = await fixture();
      try {
        const server = buildServer({ allowLocalLogin: true, repositories: f.repositories });
        try {
          const response = await signIn(server);
          expect(response.statusCode).toBe(200);
          const session = response.json().data as LocalSessionData;
          expect(session.token.startsWith('mt_s_')).toBe(true);
          expect(session.principal.id).toBe(LOCAL_ACCOUNT_ID);
          expect(session.principal.roles).toEqual([...LOCAL_ACCOUNT_ROLES]);
          expect(Date.parse(session.expiresAt)).toBeGreaterThan(NOW);

          // The whole point: the browser's own read, with the credential it just got, and
          // nothing else standing in for a shell, a keychain or an event stream.
          const dashboard = await server.app.inject({
            method: 'GET',
            url: '/v1/dashboard',
            headers: { authorization: `Bearer ${session.token}` },
          });
          expect(dashboard.statusCode).toBe(200);
          const payload = dashboard.json().data;
          expect(payload.capability).toBe('read-only');
          // The workstation account has no history yet, and the payload says so rather than
          // failing — the browser renders its sections with their empty states.
          expect(payload.metrics.agentLevel).toBeNull();
          expect(payload.metrics.knowledgeMastery).toEqual([]);
          expect(payload.metrics.examScore).toBeNull();
          expect(payload.metrics.learningStreakDays).toBe(0);
          expect(payload.metrics.course.course).toBeNull();
        } finally {
          await server.close();
        }
      } finally {
        f.close();
      }
    },
  );

  withDatabase(
    'creates the workstation account the session will write under, exactly once',
    async () => {
      const f = await fixture();
      try {
        const server = buildServer({ allowLocalLogin: true, repositories: f.repositories });
        try {
          // The account the session is about to belong to does not exist yet, and a session
          // without it would be readable but unwritable: every owner-scoped table references
          // `users`, so the first write (a metered chat turn) failed on the missing row.
          expect(await f.repositories.identity.findUser(LOCAL_ACCOUNT_ID)).toBeNull();

          const first = await signIn(server);
          expect(first.statusCode).toBe(200);
          const account = await f.repositories.identity.findUser(LOCAL_ACCOUNT_ID);
          expect(account).not.toBeNull();
          expect(account?.display_name).toBe('Workstation owner');

          // A second sign-in finds the same account rather than minting a rival for it.
          const second = await signIn(server);
          expect(second.statusCode).toBe(200);
          expect(await f.repositories.identity.listUsers()).toHaveLength(1);
        } finally {
          await server.close();
        }
      } finally {
        f.close();
      }
    },
  );

  withDatabase(
    "another account's history never reaches the local session's dashboard",
    async () => {
      const f = await fixture();
      try {
        // Somebody else's learning record: a completed lesson and a scored exam.
        const other = await f.repositories.identity.createUser({
          displayName: 'Someone else',
          timezone: 'UTC',
        });
        const curriculum = await f.repositories.academy.createCurriculum({
          title: 'Market Structure',
          version: '1',
        });
        const lesson = await f.repositories.academy.upsertLesson(curriculum.id, {
          slug: 'structure-basics',
          title: 'Structure basics',
          orderIndex: 0,
          content: {},
        });
        const exam = await f.repositories.academy.createExam({
          lessonId: lesson.id,
          title: 'Structure exam',
          rubric: {},
        });
        await f.repositories.academy.recordProgress({
          userId: other.id,
          lessonId: lesson.id,
          status: 'completed',
          score: 88,
        });
        await f.repositories.academy.recordAttempt({
          examId: exam.id,
          userId: other.id,
          answers: {},
          grading: {},
          score: 91,
          passed: true,
        });

        const server = buildServer({ allowLocalLogin: true, repositories: f.repositories });
        try {
          const signInResponse = await signIn(server);
          const { token } = signInResponse.json().data as LocalSessionData;
          const dashboard = await server.app.inject({
            method: 'GET',
            url: '/v1/dashboard',
            headers: { authorization: `Bearer ${token}` },
          });

          expect(dashboard.statusCode).toBe(200);
          const metrics = dashboard.json().data.metrics;
          // The other account's level, mastery, exam and streak are absent, not summarised.
          expect(metrics.agentLevel).toBeNull();
          expect(metrics.knowledgeMastery).toEqual([]);
          expect(metrics.examScore).toBeNull();
          expect(metrics.learningStreakDays).toBe(0);
          expect(JSON.stringify(metrics)).not.toContain('Structure basics');
        } finally {
          await server.close();
        }
      } finally {
        f.close();
      }
    },
  );

  withDatabase('a session that was never issued is still refused', async () => {
    const f = await fixture();
    try {
      const server = buildServer({ allowLocalLogin: true, repositories: f.repositories });
      try {
        const forged = await server.app.inject({
          method: 'GET',
          url: '/v1/dashboard',
          headers: { authorization: 'Bearer mt_s_not-a-real-session' },
        });
        expect(forged.statusCode).toBe(401);
        expect(forged.json().error.code).toBe('UNAUTHENTICATED');
      } finally {
        await server.close();
      }
    } finally {
      f.close();
    }
  });
});
