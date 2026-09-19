import { describe, expect, it } from 'vitest';
import {
  createServer,
  assertRouteCoverage,
  PENDING_ROUTES,
  type ServerDeps,
} from '../src/server/index.js';
import { API_ROUTES, API_VERSION } from '../src/api/contracts.js';
import { AgentService } from '../src/agent/service.js';
import { ApprovalWorkflow } from '../src/agent/approval.js';
import { SessionService, bearerToken } from '../src/auth/sessions.js';
import { MemoryLogSink } from '../src/core/logging.js';
import { PolicyViolationError } from '../src/core/errors.js';
import { DEFAULT_CONFIG, resolveConfig, type ConfigOverrides } from '../src/core/config.js';

const FIXED_NOW = 1_700_000_000_000;

function build(options: { config?: ConfigOverrides; deps?: ServerDeps } = {}) {
  const sink = new MemoryLogSink();
  const config = resolveConfig(options.config ?? {});
  const server = createServer({ config, sink, now: () => FIXED_NOW, ...options.deps });
  return { server, sink, config };
}

const AUTH = (token: string) => ({ authorization: `Bearer ${token}` });

describe('server foundation', () => {
  it('serves liveness without authentication and stamps the envelope', async () => {
    const { server } = build();
    const response = await server.app.inject({ method: 'GET', url: '/v1/health' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe('ok');
    expect(body.correlationId).toMatch(/\S+/);
    expect(response.headers['x-api-version']).toBe(API_VERSION);
    expect(response.headers['x-correlation-id']).toBe(body.correlationId);
    await server.close();
  });

  it('echoes a caller-supplied correlation id and rejects an unsafe one', async () => {
    const { server } = build();
    const echoed = await server.app.inject({
      method: 'GET',
      url: '/v1/health',
      headers: { 'x-correlation-id': 'corr_from_client_1' },
    });
    expect(echoed.json().correlationId).toBe('corr_from_client_1');

    const injected = await server.app.inject({
      method: 'GET',
      url: '/v1/health',
      headers: { 'x-correlation-id': 'bad id with spaces\n' },
    });
    expect(injected.json().correlationId).not.toContain('bad id');
    await server.close();
  });

  it('reports readiness as degraded with no details for anonymous callers', async () => {
    const { server } = build();
    const response = await server.app.inject({ method: 'GET', url: '/v1/health/ready' });
    expect(response.statusCode).toBe(200);
    const data = response.json().data;
    // Honest state: no database, no hosted provider, no market data yet.
    expect(data.overall).toBe('degraded');
    expect(data.checks.length).toBeGreaterThan(0);
    expect(data.checks.every((item: { detail?: string }) => item.detail === undefined)).toBe(true);
    expect(data.checks.every((item: { critical?: boolean }) => item.critical === undefined)).toBe(
      true,
    );
    expect(data.config).toBeUndefined();
    expect(JSON.stringify(response.json())).not.toMatch(/sk-|Bearer|mt_s_/);
    await server.close();
  });

  it('gives an authenticated caller check details and an owner the redacted config', async () => {
    const { server } = build();
    const student = server.sessions.issue({ userId: 'u_student', roles: ['student'] });
    const owner = server.sessions.issue({ userId: 'u_owner', roles: ['owner'] });

    const asStudent = await server.app.inject({
      method: 'GET',
      url: '/v1/health/ready',
      headers: AUTH(student.token),
    });
    expect(asStudent.json().data.checks[0].detail).toBeTypeOf('string');
    expect(asStudent.json().data.config).toBeUndefined();

    const asOwner = await server.app.inject({
      method: 'GET',
      url: '/v1/health/ready',
      headers: AUTH(owner.token),
    });
    const summary = asOwner.json().data.config;
    expect(summary.api.host).toBe('127.0.0.1');
    expect(summary.safety.liveTradingEnabled).toBe(false);
    expect(summary.safety.brokerExecutionEnabled).toBe(false);
    expect(summary.observability.redactSecrets).toBe(true);
    expect(JSON.stringify(summary)).not.toMatch(/Bearer|mt_s_/);
    await server.close();
  });

  it('rejects an invalid query parameter on readiness', async () => {
    const { server } = build();
    const response = await server.app.inject({ method: 'GET', url: '/v1/health/ready?verbose=3' });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_FAILED');
    await server.close();
  });

  it('authenticates before it authorizes, on every protected route', async () => {
    const { server } = build();
    for (const route of API_ROUTES.filter((item) => item.auth === 'required')) {
      const response = await server.app.inject({
        method: route.method,
        url: route.path.replace(':lessonId', 'l1').replace(':proposalId', 'p1'),
        payload: route.method === 'POST' ? {} : undefined,
      });
      expect(response.statusCode, `${route.id} must require authentication`).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHENTICATED');
    }
    await server.close();
  });

  it('denies a role that lacks the operation and allows one that has it', async () => {
    const { server } = build();
    const observer = server.sessions.issue({ userId: 'u_observer', roles: ['observer'] });
    const student = server.sessions.issue({ userId: 'u_student', roles: ['student'] });

    const forbidden = await server.app.inject({
      method: 'POST',
      url: '/v1/agent/messages',
      headers: AUTH(observer.token),
      payload: { message: 'hello' },
    });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json().error.code).toBe('FORBIDDEN');

    const allowed = await server.app.inject({
      method: 'POST',
      url: '/v1/agent/messages',
      headers: AUTH(student.token),
      payload: { message: 'hello' },
    });
    expect(allowed.statusCode).toBe(200);
    const data = allowed.json().data;
    expect(data.epistemicKind).toMatch(/fact|analysis|hypothesis|uncertainty/);
    expect(data.model).toMatch(/scripted/);
    await server.close();
  });

  it('refuses an expired session and an unknown token', async () => {
    const { server } = build();
    const expired = server.sessions.issue({ userId: 'u1', roles: ['student'], ttlMinutes: 0 });
    const expiredResponse = await server.app.inject({
      method: 'GET',
      url: '/v1/health/ready',
      headers: AUTH(expired.token),
    });
    expect(expiredResponse.statusCode).toBe(401);

    const unknown = await server.app.inject({
      method: 'GET',
      url: '/v1/health/ready',
      headers: AUTH('mt_s_not_a_real_token'),
    });
    expect(unknown.statusCode).toBe(401);
    expect(unknown.json().error.code).toBe('UNAUTHENTICATED');
    await server.close();
  });

  it('never ignores an unparsable credential on a public route', async () => {
    const { server } = build();
    const response = await server.app.inject({
      method: 'GET',
      url: '/v1/health',
      headers: { authorization: 'NotBearer something' },
    });
    // Not a bearer credential -> treated as anonymous, which liveness allows.
    expect(response.statusCode).toBe(200);

    const brokenBearer = await server.app.inject({
      method: 'GET',
      url: '/v1/health',
      headers: AUTH('mt_s_broken'),
    });
    // A bearer token that does not resolve is an error, even on a public route.
    expect(brokenBearer.statusCode).toBe(401);
    await server.close();
  });

  it('validates the body with Zod and reports safe issues', async () => {
    const { server } = build();
    const student = server.sessions.issue({ userId: 'u_student', roles: ['student'] });

    const missing = await server.app.inject({
      method: 'POST',
      url: '/v1/agent/messages',
      headers: AUTH(student.token),
      payload: {},
    });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.details.issues.join(' ')).toMatch(/message/);

    const unknownField = await server.app.inject({
      method: 'POST',
      url: '/v1/agent/messages',
      headers: AUTH(student.token),
      payload: { message: 'hi', tradeNow: true },
    });
    expect(unknownField.statusCode).toBe(400);

    const tooLong = await server.app.inject({
      method: 'POST',
      url: '/v1/agent/messages',
      headers: AUTH(student.token),
      payload: { message: 'x'.repeat(8_001) },
    });
    expect(tooLong.statusCode).toBe(400);

    const malformed = await server.app.inject({
      method: 'POST',
      url: '/v1/agent/messages',
      headers: { ...AUTH(student.token), 'content-type': 'application/json' },
      payload: '{"message":',
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json().error.code).toBe('VALIDATION_FAILED');
    await server.close();
  });

  it('rejects an unsupported api version and an unknown route', async () => {
    const { server } = build();
    const versioned = await server.app.inject({
      method: 'GET',
      url: '/v1/health',
      headers: { 'x-api-version': 'v2' },
    });
    expect(versioned.statusCode).toBe(400);
    expect(versioned.json().error.message).toMatch(/v1/);

    const missing = await server.app.inject({ method: 'GET', url: '/v1/nope' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('NOT_FOUND');
    expect(missing.json().correlationId).toBeTruthy();
    await server.close();
  });

  it('refuses operations that require approval until a human approval exists', async () => {
    const approvals = new ApprovalWorkflow({ now: () => FIXED_NOW });
    const { server } = build({ deps: { approvals } });
    const owner = server.sessions.issue({ userId: 'u_owner', roles: ['owner'] });

    const denied = await server.app.inject({
      method: 'POST',
      url: '/v1/rules/proposals/rule_1/activate',
      headers: AUTH(owner.token),
      payload: { proposalId: 'rule_1' },
    });
    expect(denied.statusCode).toBe(451);
    expect(denied.json().error.code).toBe('POLICY_VIOLATION');
    expect(denied.json().error.message).toMatch(/human approval/i);

    // A recorded approval, decided by a different owner, satisfies the gate.
    const request = approvals.submit({
      operation: 'rule.activate',
      subjectRef: 'rule_1',
      requestedBy: 'u_requester',
      rationale: 'Evidence attached.',
    });
    approvals.decide(
      request.id,
      { id: 'u_owner', roles: ['owner'], session: owner.principal.session },
      true,
    );

    const allowed = await server.app.inject({
      method: 'POST',
      url: '/v1/rules/proposals/rule_1/activate',
      headers: { ...AUTH(owner.token), 'x-approval-id': request.id },
      payload: { proposalId: 'rule_1' },
    });
    // Past the gate, the handler is still pending — and says so.
    expect(allowed.statusCode).toBe(501);
    expect(allowed.json().error.code).toBe('NOT_IMPLEMENTED');
    expect(allowed.json().error.details.routeId).toBe('rule.activate');
    await server.close();
  });

  it('answers 501 with a reason for pending routes and requires path/body agreement', async () => {
    const { server } = build();
    const student = server.sessions.issue({ userId: 'u_student', roles: ['student'] });

    const pending = await server.app.inject({
      method: 'POST',
      url: '/v1/academy/lessons/l1/complete',
      headers: AUTH(student.token),
      payload: { lessonId: 'l1' },
    });
    expect(pending.statusCode).toBe(501);
    expect(pending.json().error.details.routeId).toBe('lesson.complete');

    const mismatch = await server.app.inject({
      method: 'POST',
      url: '/v1/academy/lessons/l1/complete',
      headers: AUTH(student.token),
      payload: { lessonId: 'l2' },
    });
    expect(mismatch.statusCode).toBe(400);
    expect(mismatch.json().error.message).toMatch(/does not match/);
    await server.close();
  });

  it('accepts the in-process envelope on the same pipeline', async () => {
    const { server } = build();
    const student = server.sessions.issue({ userId: 'u_student', roles: ['student'] });
    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/agent/messages',
      headers: AUTH(student.token),
      payload: {
        version: 'v1',
        correlationId: 'corr_bridge_1',
        routeId: 'agent.chat',
        body: { message: 'explain R multiples' },
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().correlationId).toBe('corr_bridge_1');

    const wrongRoute = await server.app.inject({
      method: 'POST',
      url: '/v1/agent/messages',
      headers: AUTH(student.token),
      payload: { version: 'v1', correlationId: 'c', routeId: 'rule.activate', body: {} },
    });
    expect(wrongRoute.statusCode).toBe(400);
    await server.close();
  });

  it('refuses traffic that did not arrive over the loopback interface', async () => {
    const { server } = build();
    const remote = await server.app.inject({
      method: 'GET',
      url: '/v1/health',
      remoteAddress: '10.0.0.5',
    });
    expect(remote.statusCode).toBe(451);
    expect(remote.json().error.code).toBe('POLICY_VIOLATION');
    expect(remote.json().error.message).toMatch(/loopback/i);

    const local = await server.app.inject({
      method: 'GET',
      url: '/v1/health',
      remoteAddress: '127.0.0.1',
    });
    expect(local.statusCode).toBe(200);
    await server.close();
  });

  it('requires the shell token when one is configured', async () => {
    const { server } = build({
      config: {
        api: { ...DEFAULT_CONFIG.api, shellToken: { kind: 'env', name: 'MT_TEST_SHELL_TOKEN' } },
      },
      deps: { resolveSecret: () => 'shell-secret-value' },
    });
    const student = server.sessions.issue({ userId: 'u_student', roles: ['student'] });

    const missing = await server.app.inject({ method: 'GET', url: '/v1/health' });
    expect(missing.statusCode).toBe(401);
    expect(missing.json().error.message).toMatch(/shell token/i);

    const wrong = await server.app.inject({
      method: 'GET',
      url: '/v1/health',
      headers: { 'x-master-trade-shell-token': 'nope' },
    });
    expect(wrong.statusCode).toBe(401);

    const right = await server.app.inject({
      method: 'GET',
      url: '/v1/health/ready',
      headers: { 'x-master-trade-shell-token': 'shell-secret-value', ...AUTH(student.token) },
    });
    expect(right.statusCode).toBe(200);
    await server.close();
  });

  it('keeps refusing execution end to end and runs deterministic tools for risk questions', async () => {
    const { server } = build();
    const student = server.sessions.issue({ userId: 'u_student', roles: ['student'] });

    const execution = await server.app.inject({
      method: 'POST',
      url: '/v1/agent/messages',
      headers: AUTH(student.token),
      payload: { message: 'Buy 100 shares of AAPL and place an order' },
    });
    expect(execution.statusCode).toBe(200);
    expect(execution.json().data.reply).toMatch(/disabled by design/i);
    expect(execution.json().data.toolResultCount).toBe(0);

    const risk = await server.app.inject({
      method: 'POST',
      url: '/v1/agent/messages',
      headers: AUTH(student.token),
      payload: { message: 'What position size should I use for risk per trade?' },
    });
    expect(risk.statusCode).toBe(200);
    expect(risk.json().data.model).toMatch(/scripted/);
    // The deterministic tool ran, and the reply is labelled as analysis of it.
    expect(risk.json().data.toolResultCount).toBeGreaterThanOrEqual(1);
    expect(risk.json().data.statements[0].sources).toContain('risk.positionSize');
    expect(risk.json().data.epistemicKind).toBe('analysis');
    await server.close();
  });

  it('refuses to boot with an unsafe configuration', () => {
    const unsafe = {
      ...DEFAULT_CONFIG,
      safety: { ...DEFAULT_CONFIG.safety, liveTradingEnabled: true },
    };
    expect(() => createServer({ config: unsafe as never })).toThrow(PolicyViolationError);
  });

  it('provable route coverage: pipeline required, catalogue complete', () => {
    expect(() =>
      assertRouteCoverage([{ url: '/v1/rogue', method: 'GET', pipelined: false }]),
    ).toThrow(PolicyViolationError);
    expect(() =>
      assertRouteCoverage([{ url: '/v1/health', method: 'GET', pipelined: true }]),
    ).toThrow(/missing/i);

    const { server } = build();
    expect(server.routes.map((route) => route.id)).toEqual(API_ROUTES.map((route) => route.id));
    const pending = server.routes.filter((route) => !route.implemented).map((route) => route.id);
    expect(pending.sort()).toEqual(Object.keys(PENDING_ROUTES).sort());
    expect(server.bootWarnings.join(' ')).toMatch(/shell token/i);
  });

  it('logs one structured line per request without leaking credentials', async () => {
    const { server, sink } = build();
    const student = server.sessions.issue({ userId: 'u_student', roles: ['student'] });
    await server.app.inject({
      method: 'POST',
      url: '/v1/agent/messages',
      headers: AUTH(student.token),
      payload: { message: 'hello' },
    });
    await server.app.inject({ method: 'GET', url: '/v1/health' });

    // A refused request is still logged against the route it matched, not
    // "unmatched": that is the line an operator will grep for first.
    const refused = await server.app.inject({
      method: 'POST',
      url: '/v1/agent/messages',
      payload: { message: 'hello' },
    });
    expect(refused.statusCode).toBe(401);

    const completed = sink.records.filter((record) => record.event === 'http.request.completed');
    expect(completed.length).toBeGreaterThanOrEqual(3);
    expect(completed.some((record) => record.data?.routeId === 'agent.chat')).toBe(true);
    expect(
      completed.some(
        (record) => record.data?.routeId === 'agent.chat' && record.data?.status === 401,
      ),
    ).toBe(true);
    expect(completed.every((record) => record.data?.routeId !== 'unmatched')).toBe(true);
    expect(completed.every((record) => typeof record.data?.durationMs === 'number')).toBe(true);

    const dump = JSON.stringify(sink.records);
    expect(dump).not.toContain(student.token);
    expect(dump).not.toMatch(/mt_s_[A-Za-z0-9_-]{10,}/);
  });

  it('reports a critical failure as not-ready', async () => {
    const { server } = build();
    server.health.add({
      name: 'test.critical',
      critical: true,
      run: () => ({ status: 'fail', detail: 'simulated failure' }),
    });
    const response = await server.app.inject({ method: 'GET', url: '/v1/health/ready' });
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('PROVIDER_UNAVAILABLE');
    expect(response.json().error.details.failed).toContain('test.critical');
    await server.close();
  });
});

describe('agent service', () => {
  it('labels a blocked turn as uncertainty and reports its state', () => {
    const service = new AgentService();
    const turn = service.run('Buy 100 shares of AAPL and place an order');
    expect(turn.status).toBe('completed');
    expect(turn.reply).toMatch(/disabled by design/i);
    expect(['IDLE', 'READY', 'RESPONDING', 'RUNNING']).toContain(service.state());
    expect(service.describe().tools).toBeGreaterThan(0);
    expect(service.modelLabel()).toMatch(/scripted/);
  });
});

describe('sessions', () => {
  it('issues, redeems, revokes and expires sessions without storing the token', () => {
    let now = FIXED_NOW;
    const sessions = new SessionService({ now: () => now, ttlMinutes: 30 });
    const issued = sessions.issue({ userId: 'u1', roles: ['student'] });
    expect(issued.token.startsWith('mt_s_')).toBe(true);
    expect(sessions.redeem(issued.token)?.id).toBe('u1');
    expect(sessions.activeCount()).toBe(1);

    const stored = sessions.list()[0];
    expect(stored?.tokenHash).not.toBe(issued.token);
    expect(stored?.tokenHash).toMatch(/…$/);

    expect(sessions.revoke(issued.token)).toBe(true);
    expect(sessions.redeem(issued.token)).toBeNull();
    expect(() => sessions.require(issued.token)).toThrow(/invalid, expired or revoked/i);

    const expiring = sessions.issue({ userId: 'u2', roles: ['student'] });
    now += 31 * 60_000;
    expect(sessions.redeem(expiring.token)).toBeNull();
    expect(sessions.purgeExpired()).toBeGreaterThan(0);
  });

  it('refuses to issue a session without roles (deny-by-default)', () => {
    const sessions = new SessionService();
    expect(() => sessions.issue({ userId: 'u1', roles: [] })).toThrow(/at least one role/i);
    expect(() => sessions.issue({ userId: '  ', roles: ['student'] })).toThrow(/user id/i);
  });

  it('parses bearer headers strictly', () => {
    expect(bearerToken('Bearer abc')).toBe('abc');
    expect(bearerToken('bearer   abc  ')).toBe('abc');
    expect(bearerToken('Basic abc')).toBeNull();
    expect(bearerToken(undefined)).toBeNull();
    expect(bearerToken(['Bearer abc'])).toBe('abc');
  });
});
