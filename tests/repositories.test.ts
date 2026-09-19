import { describe, expect, it } from 'vitest';
import {
  createRepositories,
  migrate,
  openSqlite,
  sqliteDriverInfo,
  type Repositories,
} from '../src/db/index.js';
import { PolicyViolationError } from '../src/core/errors.js';
import { hashToken } from '../src/auth/sessions.js';

const driver = sqliteDriverInfo();
const withDatabase = driver.available ? it : it.skip;

const FIXED_NOW = Date.parse('2026-09-19T12:00:00.000Z');

interface Fixture {
  repositories: Repositories;
  close: () => Promise<void>;
}

/** A migrated in-memory database with a fixed clock and deterministic ids. */
async function fixture(): Promise<Fixture> {
  const db = openSqlite({ file: ':memory:' });
  await migrate(db);
  let counter = 0;
  const repositories = createRepositories(db, {
    now: () => FIXED_NOW,
    newId: (kind) => `${kind}_${(counter += 1)}`,
  });
  return { repositories, close: () => db.close() };
}

async function seeded(): Promise<Fixture & { userId: string }> {
  const f = await fixture();
  const user = await f.repositories.identity.createUser({
    displayName: 'Learner',
    timezone: 'UTC',
  });
  return { ...f, userId: user.id };
}

describe('identity repository', () => {
  withDatabase('creates accounts, stores hash-only credentials and manages sessions', async () => {
    const { repositories, close, userId } = await seeded();
    try {
      const user = await repositories.identity.findUser(userId);
      expect(user?.display_name).toBe('Learner');
      expect(user?.experience_level).toBe('beginner');

      await repositories.identity.saveCredential(userId, {
        algorithm: 'argon2id',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$hash-value-here',
      });
      const credential = await repositories.identity.credentialForUser(userId);
      expect(credential?.algorithm).toBe('argon2id');
      // Replacing is an update, not a second row.
      await repositories.identity.saveCredential(userId, {
        algorithm: 'scrypt',
        passwordHash: '$scrypt$n=16384,r=8,p=1$another-hash',
      });
      const stored = await repositories.identity.credentialForUser(userId);
      expect(stored?.algorithm).toBe('scrypt');
      expect(await repositories.identity.listUsers()).toHaveLength(1);

      const tokenHash = hashToken('mt_s_token_one');
      const session = await repositories.identity.saveSession({
        userId,
        roles: ['student'],
        tokenHash,
        ttlMinutes: 60,
      });
      expect(session.roles).toEqual(['student']);
      expect(session.expires_at).toBe(new Date(FIXED_NOW + 60 * 60_000).toISOString());
      expect(await repositories.identity.sessionByTokenHash(tokenHash)).not.toBeNull();
      expect(await repositories.identity.sessionSummary()).toEqual({ active: 1, total: 1 });

      expect(await repositories.identity.revokeSession(session.id)).toBe(true);
      expect(await repositories.identity.sessionSummary()).toEqual({ active: 0, total: 1 });
      // Revoked twice is a no-op, not an error.
      expect(await repositories.identity.revokeSession(session.id)).toBe(false);
      expect(await repositories.identity.purgeExpiredSessions()).toBe(1);
      expect(await repositories.identity.sessionSummary()).toEqual({ active: 0, total: 0 });
    } finally {
      await close();
    }
  });

  withDatabase('refuses a raw session token and a role-less session', async () => {
    const { repositories, close, userId } = await seeded();
    try {
      await expect(
        repositories.identity.saveSession({
          userId,
          roles: ['student'],
          tokenHash: 'mt_s_raw_token_that_must_never_be_stored',
          ttlMinutes: 60,
        }),
      ).rejects.toThrow(PolicyViolationError);

      await expect(
        repositories.identity.saveSession({
          userId,
          roles: [],
          tokenHash: hashToken('x'),
          ttlMinutes: 60,
        }),
      ).rejects.toThrow(/no roles/);
    } finally {
      await close();
    }
  });
});

describe('academy repository', () => {
  withDatabase('authors content and derives progress from evidence', async () => {
    const { repositories, close, userId } = await seeded();
    try {
      const curriculum = await repositories.academy.createCurriculum({
        title: 'Foundations',
        version: '1.0.0',
      });
      const lesson = await repositories.academy.upsertLesson(curriculum.id, {
        slug: 'risk-basics',
        title: 'Risk basics',
        orderIndex: 1,
        content: { blocks: ['reading'] },
        prerequisites: [],
      });
      const edited = await repositories.academy.upsertLesson(curriculum.id, {
        slug: 'risk-basics',
        title: 'Risk basics (revised)',
        orderIndex: 1,
        content: { blocks: ['reading', 'exercise'] },
      });
      expect(edited.id).toBe(lesson.id);
      expect(edited.title).toBe('Risk basics (revised)');
      expect(await repositories.academy.lessonsOf(curriculum.id)).toHaveLength(1);

      await repositories.academy.recordProgress({
        userId,
        lessonId: lesson.id,
        status: 'in_progress',
      });
      await repositories.academy.recordProgress({
        userId,
        lessonId: lesson.id,
        status: 'completed',
        score: 70,
      });
      await expect(
        repositories.academy.recordProgress({
          userId,
          lessonId: lesson.id,
          status: 'mastered',
          score: 60,
        }),
      ).rejects.toThrow(/mastery requires a score/);

      const mastered = await repositories.academy.recordProgress({
        userId,
        lessonId: lesson.id,
        status: 'mastered',
        score: 92,
      });
      expect(mastered.completed_at).not.toBeNull();
      expect(await repositories.academy.progressSummary(userId)).toMatchObject({
        mastered: 1,
        completed: 0,
      });

      const exam = await repositories.academy.createExam({
        lessonId: lesson.id,
        title: 'Risk check',
        rubric: { questions: 5 },
        passScore: 70,
      });
      await repositories.academy.recordAttempt({
        examId: exam.id,
        userId,
        answers: { q1: 'a' },
        grading: { q1: 1 },
        score: 60,
        passed: false,
      });
      await repositories.academy.recordAttempt({
        examId: exam.id,
        userId,
        answers: { q1: 'b' },
        grading: { q1: 1 },
        score: 85,
        passed: true,
      });
      // Two attempts, best score kept: a retake never hides the first try.
      expect(await repositories.academy.attemptsFor(userId, exam.id)).toHaveLength(2);
      expect(await repositories.academy.bestScores(userId)).toEqual([
        { examId: exam.id, best: 85, attempts: 2 },
      ]);
    } finally {
      await close();
    }
  });
});

describe('agent repository', () => {
  withDatabase('stores turns with their label, sources and instruction version', async () => {
    const { repositories, close, userId } = await seeded();
    try {
      const conversation = await repositories.agent.createConversation({ userId, title: 'Risk' });
      await repositories.agent.appendMessage({
        conversationId: conversation.id,
        role: 'user',
        epistemicKind: 'fact',
        content: 'How do I size a position?',
        instructionsVersion: 'core@1.4.0',
        correlationId: 'corr_1',
      });
      const answer = await repositories.agent.appendMessage({
        conversationId: conversation.id,
        role: 'agent',
        epistemicKind: 'analysis',
        content: 'Use the deterministic risk tool.',
        sources: ['risk.positionSize'],
        toolCalls: [{ tool: 'risk.positionSize', version: '1.0.0' }],
        instructionsVersion: 'core@1.4.0',
        correlationId: 'corr_1',
      });
      expect(answer.sources).toEqual(['risk.positionSize']);
      expect(answer.tool_calls).toEqual([{ tool: 'risk.positionSize', version: '1.0.0' }]);
      expect(await repositories.agent.messages(conversation.id)).toHaveLength(2);
      expect(await repositories.agent.messagesByCorrelation('corr_1')).toHaveLength(2);

      await expect(
        repositories.agent.appendMessage({
          conversationId: conversation.id,
          role: 'agent',
          epistemicKind: 'analysis',
          content: 'no version recorded',
          instructionsVersion: '',
          correlationId: 'corr_2',
        }),
      ).rejects.toThrow(/instruction version/);

      expect(await repositories.agent.deleteConversation(conversation.id)).toBe(true);
      expect(await repositories.agent.messageCount(conversation.id)).toBe(0);
    } finally {
      await close();
    }
  });
});

describe('memory repository', () => {
  withDatabase('keeps provenance, versions history and never self-promotes trust', async () => {
    const { repositories, close, userId } = await seeded();
    try {
      const record = await repositories.memory.create({
        userId,
        type: 'lesson-note',
        text: 'Stop placement follows structure, not a fixed distance.',
        provenance: { source: 'lesson', ref: 'risk-basics' },
        epistemicKind: 'analysis',
        createdBy: 'system',
      });
      expect(record.trust).toBe('unverified');
      expect(record.version).toBe(1);

      await expect(
        repositories.memory.create({
          userId,
          type: 'lesson-note',
          text: 'The model says this is true.',
          provenance: { source: 'model', ref: 'turn_1' },
          epistemicKind: 'hypothesis',
          trust: 'verified',
          createdBy: 'model',
        }),
      ).rejects.toThrow(PolicyViolationError);

      const revised = await repositories.memory.revise(record.id, {
        text: 'Stop placement follows structure or the invalidation level.',
        changedBy: userId,
      });
      expect(revised.version).toBe(2);
      const history = await repositories.memory.history(record.id);
      expect(history.map((entry) => entry.history_index)).toEqual([1, 2]);
      expect(history[1]?.version).toBe(2);
      expect((history[1]?.metadata as { action: string }).action).toBe('revise');

      await expect(
        repositories.memory.setTrust(record.id, 'authoritative', { changedBy: userId }),
      ).rejects.toThrow(/human verifier/);

      const verified = await repositories.memory.setTrust(record.id, 'verified', {
        verifiedBy: userId,
        changedBy: userId,
        note: 'Reviewed',
      });
      expect(verified.trust).toBe('verified');
      expect(verified.verified_by).toBe(userId);
      await expect(
        repositories.memory.setTrust(record.id, 'unverified', { changedBy: userId }),
      ).rejects.toThrow(/cannot be demoted/);

      await repositories.memory.putEmbedding(record.id, {
        model: 'hash-32',
        vector: [0.1, 0.2, 0.3],
      });
      await repositories.memory.putEmbedding(record.id, {
        model: 'hash-32',
        vector: [0.4, 0.5, 0.6],
      });
      const embeddings = await repositories.memory.embeddingsFor(record.id, 'hash-32');
      expect(embeddings).toHaveLength(1);
      expect(embeddings[0]?.dimensions).toBe(3);
      expect(embeddings[0]?.vector).toEqual([0.4, 0.5, 0.6]);

      const other = await repositories.memory.create({
        userId,
        type: 'mistake',
        text: 'Overtraded after a loss.',
        provenance: { source: 'journal', ref: 'week-3' },
        epistemicKind: 'fact',
        createdBy: userId,
      });
      const missing = await repositories.memory.recordsMissingEmbedding('hash-32');
      expect(missing.map((row) => row.id)).toEqual([other.id]);
      expect(await repositories.memory.listByTrust(['verified'])).toHaveLength(1);

      const tombstoned = await repositories.memory.tombstone(record.id, {
        changedBy: userId,
        reason: 'superseded',
      });
      expect(tombstoned.deleted_at).not.toBeNull();
      expect(await repositories.memory.listForUser(userId)).toHaveLength(1);
      expect(await repositories.memory.listForUser(userId, { includeDeleted: true })).toHaveLength(
        2,
      );
      // History survives the tombstone: that is the point of keeping it.
      expect(await repositories.memory.history(record.id)).toHaveLength(4);
      expect(await repositories.memory.counts()).toMatchObject({ records: 2, live: 1 });
      await expect(
        repositories.memory.revise(record.id, { text: 'edited', changedBy: userId }),
      ).rejects.toThrow(/tombstoned/);
    } finally {
      await close();
    }
  });
});

describe('governance repository', () => {
  withDatabase('cannot activate a rule without a human approval', async () => {
    const { repositories, close, userId } = await seeded();
    try {
      const proposer = await repositories.identity.createUser({
        displayName: 'Proposer',
        timezone: 'UTC',
      });
      const rule = await repositories.governance.propose({
        proposedBy: userId,
        ruleText: 'Only trade after a pullback to prior support.',
        hypothesis: 'Fewer false breakouts.',
      });
      await repositories.governance.attachEvaluation({
        ruleId: rule.id,
        method: 'backtest',
        metrics: { expectancyR: 0.4 },
        verdict: 'supports',
        sampleSize: 120,
      });
      const evaluating = await repositories.governance.rule(rule.id);
      expect(evaluating?.status).toBe('evaluating');
      expect(await repositories.governance.evaluationsFor(rule.id)).toHaveLength(1);

      await expect(repositories.governance.setStatus(rule.id, 'active')).rejects.toThrow(
        /requires a recorded human approval/,
      );

      const approval = await repositories.governance.submitApproval({
        operation: 'rule.activate',
        subjectRef: rule.id,
        requestedBy: userId,
        rationale: 'Evidence attached.',
        evidence: { evaluation: 'supports' },
      });
      // Self-approval is refused in the repository…
      await expect(
        repositories.governance.decideApproval(approval.id, { decidedBy: userId, approved: true }),
      ).rejects.toThrow(/may not approve their own request/);
      // …and an unrelated operation cannot be wrapped in an approval request.
      await expect(
        repositories.governance.submitApproval({
          operation: 'lesson.read',
          subjectRef: rule.id,
          requestedBy: userId,
          rationale: 'not gated',
        }),
      ).rejects.toThrow(/not approval-gated/);

      const rejected = await repositories.governance.submitApproval({
        operation: 'rule.activate',
        subjectRef: rule.id,
        requestedBy: userId,
        rationale: 'Second attempt.',
      });
      await repositories.governance.decideApproval(rejected.id, {
        decidedBy: proposer.id,
        approved: false,
        note: 'Not enough evidence',
      });
      await expect(
        repositories.governance.activateRule(rule.id, { approvalId: rejected.id }),
      ).rejects.toThrow(/rejected approval/);

      const decided = await repositories.governance.submitApproval({
        operation: 'rule.activate',
        subjectRef: rule.id,
        requestedBy: userId,
        rationale: 'Ready for review.',
      });
      await repositories.governance.decideApproval(decided.id, {
        decidedBy: proposer.id,
        approved: true,
      });
      // A decided approval cannot be decided twice.
      await expect(
        repositories.governance.decideApproval(decided.id, {
          decidedBy: proposer.id,
          approved: false,
        }),
      ).rejects.toThrow(/already approved/);

      // An approval for another subject does not activate this rule.
      const other = await repositories.governance.propose({
        proposedBy: userId,
        ruleText: 'Other rule',
        hypothesis: 'Other hypothesis',
      });
      const otherApproval = await repositories.governance.submitApproval({
        operation: 'rule.activate',
        subjectRef: other.id,
        requestedBy: userId,
        rationale: 'For the other rule.',
      });
      await repositories.governance.decideApproval(otherApproval.id, {
        decidedBy: proposer.id,
        approved: true,
      });
      await expect(
        repositories.governance.activateRule(rule.id, { approvalId: otherApproval.id }),
      ).rejects.toThrow(/not rule/);

      const activated = await repositories.governance.activateRule(rule.id, {
        approvalId: decided.id,
      });
      expect(activated.status).toBe('active');
      expect(activated.activation_approval_id).toBe(decided.id);
      expect(activated.activated_at).not.toBeNull();
      // Activating twice is idempotent.
      expect(
        (await repositories.governance.activateRule(rule.id, { approvalId: decided.id })).id,
      ).toBe(rule.id);
    } finally {
      await close();
    }
  });

  withDatabase('computes expiry instead of mutating it, and refuses a missing rule', async () => {
    const { repositories, close, userId } = await seeded();
    try {
      const approval = await repositories.governance.submitApproval({
        operation: 'rule.activate',
        subjectRef: 'rule_missing',
        requestedBy: userId,
        rationale: 'expiring',
        ttlMs: 1_000,
      });
      // Still pending just before expiry, expired just after — nothing wrote a row.
      expect((await repositories.governance.approval(approval.id, FIXED_NOW + 500))?.status).toBe(
        'pending',
      );
      expect((await repositories.governance.approval(approval.id, FIXED_NOW + 5_000))?.status).toBe(
        'expired',
      );
      expect(await repositories.governance.pendingApprovals()).toHaveLength(1);
      await expect(
        repositories.governance.activateRule('rule_missing', { approvalId: approval.id }),
      ).rejects.toThrow(/was not found/);
    } finally {
      await close();
    }
  });
});

describe('audit repository', () => {
  withDatabase('is append-only, redacts payloads and answers by correlation id', async () => {
    const { repositories, close, userId } = await seeded();
    try {
      const first = await repositories.audit.append({
        correlationId: 'corr_audit_1',
        actor: userId,
        event: 'rule.activated',
        severity: 'critical',
        payload: { ruleId: 'rule_1', approvalId: 'appr_1', authorization: 'Bearer mt_s_secret' },
      });
      expect((first.payload as { ruleId: string }).ruleId).toBe('rule_1');
      // A credential in a payload is redacted before it is stored.
      expect(JSON.stringify(first.payload)).not.toContain('mt_s_secret');

      await repositories.audit.append({
        correlationId: 'corr_audit_1',
        actor: 'system',
        event: 'memory.trust.changed',
        payload: { recordId: 'mem_1' },
      });
      expect(await repositories.audit.byCorrelation('corr_audit_1')).toHaveLength(2);
      expect(await repositories.audit.byEvent('rule.activated')).toHaveLength(1);
      expect(await repositories.audit.countBySeverity()).toMatchObject({ info: 1, critical: 1 });
      expect(await repositories.audit.missingCriticalEvents()).not.toContain('rule.activated');

      await expect(
        repositories.audit.append({ correlationId: '  ', actor: null, event: 'x' }),
      ).rejects.toThrow(/correlation id/);

      // Append-only by construction: there is no way to change or remove a record.
      const surface = Object.getOwnPropertyNames(Object.getPrototypeOf(repositories.audit));
      expect(surface).not.toContain('update');
      expect(surface).not.toContain('delete');
      expect(surface).not.toContain('remove');
      expect(surface).not.toContain('upsert');
    } finally {
      await close();
    }
  });
});

describe('platform repository', () => {
  withDatabase('holds preferences and never a secret', async () => {
    const { repositories, close } = await seeded();
    try {
      await repositories.platform.putSetting({ key: 'ui.direction', value: 'rtl' });
      await repositories.platform.putSetting({
        userId: 'usr_1',
        key: 'ui.density',
        value: 'compact',
      });
      expect(await repositories.platform.getSetting('ui.direction')).toBe('rtl');
      expect(await repositories.platform.getSetting('ui.density', 'usr_1')).toBe('compact');
      await repositories.platform.putSetting({ key: 'ui.direction', value: 'ltr' });
      expect(await repositories.platform.getSetting('ui.direction')).toBe('ltr');
      await expect(
        repositories.platform.putSetting({ key: 'llm.api_key', value: 'sk-1' }),
      ).rejects.toThrow(/not secrets/);
    } finally {
      await close();
    }
  });

  withDatabase(
    'tracks file metadata with a content hash and enforces quota arithmetic',
    async () => {
      const { repositories, close, userId } = await seeded();
      try {
        const file = await repositories.platform.recordFile({
          ownerId: userId,
          category: 'dataset',
          filename: 'bars.csv',
          mimeType: 'text/csv',
          sizeBytes: 2_048,
          sha256: 'a'.repeat(64),
        });
        expect(await repositories.platform.fileById(file.id))?.toMatchObject({ size_bytes: 2_048 });
        expect(await repositories.platform.bytesForOwner(userId)).toBe(2_048);
        await expect(
          repositories.platform.recordFile({
            ownerId: userId,
            category: 'dataset',
            filename: 'bad.csv',
            mimeType: 'text/csv',
            sizeBytes: 10,
            sha256: 'not-a-hash',
          }),
        ).rejects.toThrow(/sha256/);
        await expect(
          repositories.platform.recordFile({
            ownerId: userId,
            category: 'dataset',
            filename: 'empty.csv',
            mimeType: 'text/csv',
            sizeBytes: 0,
            sha256: 'b'.repeat(64),
          }),
        ).rejects.toThrow(/empty file/);
        expect(await repositories.platform.deleteFile(file.id)).toBe(true);
        expect(await repositories.platform.bytesForOwner(userId)).toBe(0);
      } finally {
        await close();
      }
    },
  );

  withDatabase(
    'runs a durable queue: idempotent enqueue, atomic claim, backoff, dead-letter',
    async () => {
      const { repositories, close } = await seeded();
      try {
        const first = await repositories.platform.enqueueJob({
          kind: 'embedding.generate',
          idempotencyKey: 'embed:mem_1:hash-32',
          payload: { recordId: 'mem_1' },
        });
        expect(first.created).toBe(true);
        const again = await repositories.platform.enqueueJob({
          kind: 'embedding.generate',
          idempotencyKey: 'embed:mem_1:hash-32',
          payload: { recordId: 'mem_1' },
        });
        expect(again.created).toBe(false);
        expect(again.job.id).toBe(first.job.id);

        const claimed = await repositories.platform.claimJob();
        expect(claimed?.id).toBe(first.job.id);
        expect(claimed?.status).toBe('running');
        expect(claimed?.attempts).toBe(1);
        expect(claimed?.lease_until).not.toBeNull();
        // A second worker finds nothing: the claim was atomic.
        expect(await repositories.platform.claimJob()).toBeNull();

        // Backoff pushes the retry into the future: with the clock held still, the
        // job is not immediately available again (that is the point of the delay).
        const failed = await repositories.platform.failJob(first.job.id, {
          error: 'provider timeout',
        });
        expect(failed.status).toBe('queued');
        expect(failed.error).toBe('provider timeout');
        expect(Date.parse(failed.available_at)).toBeGreaterThan(FIXED_NOW);
        expect(await repositories.platform.claimJob()).toBeNull();

        // Exhaust the attempt budget: the third failure is terminal.
        await repositories.platform.failJob(first.job.id, { error: 'retry now', backoffMs: 0 });
        const retried = await repositories.platform.claimJob();
        expect(retried?.attempts).toBe(2);
        await repositories.platform.failJob(first.job.id, { error: 'again', backoffMs: 0 });
        const thirdAttempt = await repositories.platform.claimJob();
        expect(thirdAttempt?.attempts).toBe(3);
        const dead = await repositories.platform.failJob(first.job.id, { error: 'third failure' });
        expect(dead.status).toBe('dead-letter');
        expect(await repositories.platform.claimJob()).toBeNull();

        // A crashed worker: the lease expires and the job returns to the queue.
        const crashed = await repositories.platform.enqueueJob({ kind: 'marketData.ingest' });
        const taken = await repositories.platform.claimJob({ leaseMs: -1_000 });
        expect(taken?.id).toBe(crashed.job.id);
        const reclaimed = await repositories.platform.reclaimExpired();
        expect(reclaimed.map((job) => job.id)).toEqual([crashed.job.id]);
        expect(reclaimed[0]?.status).toBe('queued');

        expect(await repositories.platform.cancelJob(crashed.job.id)).toMatchObject({
          status: 'cancelled',
        });
        await expect(repositories.platform.cancelJob(first.job.id)).rejects.toThrow(
          /cannot be cancelled/,
        );

        const summary = await repositories.platform.queueSummary();
        expect(summary['dead-letter']).toBe(1);
        expect(summary.cancelled).toBe(1);

        await repositories.platform
          .completeJob(crashed.job.id, { rows: 10 })
          .catch(() => undefined);
        const scratch = await repositories.platform.putScratch({
          jobId: crashed.job.id,
          payload: { cursor: 42 },
          ttlMs: 1_000,
        });
        expect(scratch.expires_at).toBe(new Date(FIXED_NOW + 1_000).toISOString());
        expect(await repositories.platform.purgeScratch()).toBe(0);
        expect(await repositories.platform.scratchFor(crashed.job.id)).toHaveLength(1);
      } finally {
        await close();
      }
    },
  );
});

describe('market data repository', () => {
  withDatabase('stores provenance-tagged bars idempotently and never live data', async () => {
    const { repositories, close } = await fixture();
    try {
      const bar = (time: string, close = 100) => ({
        symbol: 'AAPL',
        timeframe: '1d',
        provenance: 'synthetic' as const,
        source: 'synthetic-generator',
        time,
        open: close,
        high: close + 2,
        low: close - 2,
        close,
        volume: 1_000,
      });
      const stored = await repositories.marketData.saveBars([
        bar('2026-09-17T00:00:00.000Z', 100),
        bar('2026-09-18T00:00:00.000Z', 102),
      ]);
      expect(stored).toBe(2);
      // Re-ingesting the same range stores nothing new.
      expect(await repositories.marketData.saveBars([bar('2026-09-18T00:00:00.000Z', 102)])).toBe(
        0,
      );

      const series = await repositories.marketData.series({
        symbol: 'AAPL',
        timeframe: '1d',
        provenance: 'synthetic',
      });
      expect(series.map((row) => row.time)).toEqual([
        '2026-09-17T00:00:00.000Z',
        '2026-09-18T00:00:00.000Z',
      ]);
      expect(
        await repositories.marketData.lastBarTime({
          symbol: 'AAPL',
          timeframe: '1d',
          provenance: 'synthetic',
          source: 'synthetic-generator',
        }),
      ).toBe('2026-09-18T00:00:00.000Z');
      expect(await repositories.marketData.sourcesFor('AAPL', '1d')).toEqual([
        'synthetic-generator (synthetic)',
      ]);

      await expect(
        repositories.marketData.saveBars([
          { ...bar('2026-09-19T00:00:00.000Z'), provenance: 'live' as never },
        ]),
      ).rejects.toThrow(PolicyViolationError);
      await expect(
        repositories.marketData.saveBars([{ ...bar('2026-09-19T00:00:00.000Z'), high: 1, low: 5 }]),
      ).rejects.toThrow(/high below its low/);
    } finally {
      await close();
    }
  });
});

describe('repositories together', () => {
  withDatabase('share one clock and one database, and close cleanly', async () => {
    const f = await seeded();
    const statuses = await f.repositories.platform.queueSummary();
    expect(statuses.queued).toBe(0);
    await f.close();
    // After close, the connection is gone rather than silently reused.
    await expect(f.repositories.platform.queueSummary()).rejects.toThrow();
  });
});
