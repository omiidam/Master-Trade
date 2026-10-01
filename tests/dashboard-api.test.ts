/**
 * The dashboard API (Phase 9.2).
 *
 * What this suite defends:
 *
 *   1. **The pipeline is not optional.** The route answers 401 before a handler runs,
 *      the same as every other catalogue route.
 *   2. **Ownership is structural.** The route takes no identifier: reading another
 *      account's learning record is not expressible, and one account's progress,
 *      attempts and mistakes never reach another's payload.
 *   3. **Empty is a payload, not an error.** An account with no history gets a stable
 *      `ready` answer whose optional sections are null or empty — never a 404 and
 *      never a fabricated zero.
 *   4. **Mastery is the server's derivation.** The mean of best scores per domain is
 *      computed from stored rows by the handler; the client renders it and computes
 *      nothing.
 */

import { describe, expect, it } from 'vitest';
import {
  ALL_OPERATION_IDS,
  ROLE_PERMISSIONS,
  roleHasOperation,
} from '../packages/shared/src/auth/model.js';
import { API_ROUTES } from '../packages/shared/src/api/contracts.js';
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

async function fixture(): Promise<{
  repositories: ReturnType<typeof createRepositories>;
  close: () => void;
}> {
  const db = openSqlite({ file: ':memory:' });
  await migrate(db);
  const repositories = createRepositories(db, { now: () => NOW });
  return { repositories, close: () => db.close() };
}

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

/** Seed one curriculum, two lessons, two exams, and one account's history. */
async function seedCurriculum(
  repositories: ReturnType<typeof createRepositories>,
): Promise<{ curriculumId: string; structureLessonId: string; riskLessonId: string }> {
  const curriculum = await repositories.academy.createCurriculum({
    title: 'Market Structure',
    version: '1',
  });
  const structure = await repositories.academy.upsertLesson(curriculum.id, {
    slug: 'structure-basics',
    title: 'Structure basics',
    orderIndex: 0,
    content: {},
  });
  const risk = await repositories.academy.upsertLesson(curriculum.id, {
    slug: 'risk-first',
    title: 'Risk first',
    orderIndex: 1,
    content: {},
  });
  const structureExam = await repositories.academy.createExam({
    lessonId: structure.id,
    title: 'Structure exam',
    rubric: {},
  });
  const riskExam = await repositories.academy.createExam({
    lessonId: risk.id,
    title: 'Risk exam',
    rubric: {},
  });
  return { curriculumId: curriculum.id, structureLessonId: structure.id, riskLessonId: risk.id };
}

describe('dashboard permissions are deny-by-default', () => {
  it('registers one read operation and grants it by role, never by default', () => {
    expect(ALL_OPERATION_IDS).toContain('dashboard.read');
    expect(roleHasOperation('student', 'dashboard.read')).toBe(true);
    // Reading one's own dashboard is a read, so an observer holds it too.
    expect(roleHasOperation('observer', 'dashboard.read')).toBe(true);
    // A background worker has no dashboard.
    expect(roleHasOperation('system', 'dashboard.read')).toBe(false);
    expect(ROLE_PERMISSIONS.owner).toContain('dashboard.read');
  });

  it('registers exactly one route, a GET with no identifier in its path', () => {
    const routes = API_ROUTES.filter((route) => route.id === 'dashboard.read');
    expect(routes).toHaveLength(1);
    expect(routes[0]?.method).toBe('GET');
    expect(routes[0]?.path).toBe('/v1/dashboard');
    expect(routes[0]?.path).not.toContain(':');
    expect(routes[0]?.auth).toBe('required');
  });
});

describe('dashboard API', () => {
  withDatabase('authenticates first, and takes no subject from the client', async () => {
    const f = await fixture();
    try {
      const { server } = buildServer(f.repositories);
      try {
        const anonymous = await server.app.inject({ method: 'GET', url: '/v1/dashboard' });
        expect(anonymous.statusCode).toBe(401);
        expect(anonymous.json().error.code).toBe('UNAUTHENTICATED');

        const route = server.routes.find((entry) => entry.id === 'dashboard.read');
        expect(route?.path).toBe('/v1/dashboard');
        expect(route?.path).not.toContain(':');
      } finally {
        await server.close();
      }
    } finally {
      f.close();
    }
  });

  withDatabase('answers an account with no history with a stable empty payload', async () => {
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
          url: '/v1/dashboard',
          headers: AUTH(session.token),
        });
        expect(response.statusCode).toBe(200);
        const metrics = response.json().data.metrics;
        // Empty is stated, section by section — never a fabricated zero and never an error.
        expect(metrics.agentLevel).toBeNull();
        expect(metrics.knowledgeMastery).toEqual([]);
        expect(metrics.course.course).toBeNull();
        expect(metrics.course.lesson).toBeNull();
        expect(metrics.examScore).toBeNull();
        expect(metrics.weakAreas).toEqual([]);
        expect(metrics.recentErrors).toEqual([]);
        expect(metrics.learningStreakDays).toBe(0);
        expect(response.json().data.capability).toBe('read-only');
      } finally {
        await server.close();
      }
    } finally {
      f.close();
    }
  });

  withDatabase('derives mastery as the mean of best scores, per domain', async () => {
    const f = await fixture();
    try {
      const user = await f.repositories.identity.createUser({
        displayName: 'Learner',
        timezone: 'UTC',
      });
      const { structureLessonId } = await seedCurriculum(f.repositories);
      const exams = await f.repositories.academy.allExams();
      const structureExam = exams.find((exam) => exam.lesson_id === structureLessonId);
      expect(structureExam).toBeDefined();

      // Two attempts on one exam: the best (91) is the mastery input, not the latest.
      await f.repositories.academy.recordAttempt({
        examId: structureExam!.id,
        userId: user.id,
        answers: {},
        grading: {},
        score: 74,
        passed: false,
      });
      await f.repositories.academy.recordAttempt({
        examId: structureExam!.id,
        userId: user.id,
        answers: {},
        grading: {},
        score: 91,
        passed: true,
      });
      // And one in-progress lesson, so the level exists and the lesson is named.
      await f.repositories.academy.recordProgress({
        userId: user.id,
        lessonId: structureLessonId,
        status: 'in_progress',
      });

      const { server } = buildServer(f.repositories);
      try {
        const session = server.sessions.issue({ userId: user.id, roles: ['student'] });
        const response = await server.app.inject({
          method: 'GET',
          url: '/v1/dashboard',
          headers: AUTH(session.token),
        });
        expect(response.statusCode).toBe(200);
        const metrics = response.json().data.metrics;
        expect(metrics.agentLevel).toBe('Level 1');
        expect(metrics.knowledgeMastery).toHaveLength(1);
        expect(metrics.knowledgeMastery[0]?.masteryPercent).toBe(91);
        expect(metrics.knowledgeMastery[0]?.attemptCount).toBe(1);
        expect(metrics.weakAreas).toEqual(metrics.knowledgeMastery.slice(0, 2));
        // The lesson in progress is the one the progress row names, as its own fact.
        expect(metrics.course.lesson?.title).toBe('Structure basics');
        // The exam score is the latest attempt's own score and its pass state.
        expect(metrics.examScore?.scorePercent).toBe(91);
        expect(metrics.examScore?.passed).toBe(true);
        expect(metrics.examScore?.attemptCount).toBe(2);
        // The streak counts the two attempt days, both today.
        expect(metrics.learningStreakDays).toBe(1);
      } finally {
        await server.close();
      }
    } finally {
      f.close();
    }
  });

  withDatabase('keeps one account’s learning record out of another’s payload', async () => {
    const f = await fixture();
    try {
      const alice = await f.repositories.identity.createUser({
        displayName: 'Alice',
        timezone: 'UTC',
      });
      const bob = await f.repositories.identity.createUser({
        displayName: 'Bob',
        timezone: 'UTC',
      });
      const { structureLessonId } = await seedCurriculum(f.repositories);
      const exams = await f.repositories.academy.allExams();
      const structureExam = exams.find((exam) => exam.lesson_id === structureLessonId);
      await f.repositories.academy.recordProgress({
        userId: alice.id,
        lessonId: structureLessonId,
        status: 'completed',
        score: 90,
      });
      await f.repositories.academy.recordAttempt({
        examId: structureExam!.id,
        userId: alice.id,
        answers: {},
        grading: {},
        score: 90,
        passed: true,
      });
      await f.repositories.memory.create({
        userId: alice.id,
        type: 'mistake',
        text: 'Rounded the unit count up instead of down',
        provenance: { source: 'exam', ref: structureExam!.id },
        epistemicKind: 'fact',
        createdBy: alice.id,
      });

      const { server } = buildServer(f.repositories);
      try {
        const bobSession = server.sessions.issue({ userId: bob.id, roles: ['student'] });
        const response = await server.app.inject({
          method: 'GET',
          url: '/v1/dashboard',
          headers: AUTH(bobSession.token),
        });
        expect(response.statusCode).toBe(200);
        const metrics = response.json().data.metrics;
        // Bob's payload is Bob's emptiness, stated — none of Alice's rows reach it.
        expect(metrics.agentLevel).toBeNull();
        expect(metrics.knowledgeMastery).toEqual([]);
        expect(metrics.recentErrors).toEqual([]);
        expect(metrics.examScore).toBeNull();
      } finally {
        await server.close();
      }
    } finally {
      f.close();
    }
  });

  withDatabase('surfaces the caller’s own mistake records as recent errors', async () => {
    const f = await fixture();
    try {
      const user = await f.repositories.identity.createUser({
        displayName: 'Learner',
        timezone: 'UTC',
      });
      await f.repositories.memory.create({
        userId: user.id,
        type: 'mistake',
        text: 'Placed the invalidation level inside normal noise',
        provenance: { source: 'exam', ref: 'e-1' },
        epistemicKind: 'fact',
        createdBy: user.id,
      });
      await f.repositories.memory.create({
        userId: user.id,
        type: 'strength',
        text: 'Risk-first framing held on every record',
        provenance: { source: 'journal', ref: 'j-1' },
        epistemicKind: 'fact',
        createdBy: user.id,
      });

      const { server } = buildServer(f.repositories);
      try {
        const session = server.sessions.issue({ userId: user.id, roles: ['student'] });
        const response = await server.app.inject({
          method: 'GET',
          url: '/v1/dashboard',
          headers: AUTH(session.token),
        });
        expect(response.statusCode).toBe(200);
        const metrics = response.json().data.metrics;
        // Only the mistake records are errors; the strength is not one.
        expect(metrics.recentErrors).toHaveLength(1);
        expect(metrics.recentErrors[0]?.topic).toBe(
          'Placed the invalidation level inside normal noise',
        );
      } finally {
        await server.close();
      }
    } finally {
      f.close();
    }
  });
});
