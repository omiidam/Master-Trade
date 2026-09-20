import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createServer, type ServerDeps, type ServerInstance } from '../src/server/index.js';
import { API_ROUTES, SOCKET_ROUTES } from '../src/api/contracts.js';
import { MemoryLogSink } from '../src/core/logging.js';
import { DEFAULT_CONFIG, resolveConfig, type ConfigOverrides } from '../src/core/config.js';
import { CLOSE_CODES, REALTIME_SUBPROTOCOL } from '../src/realtime/protocol.js';
import { REALTIME_ROUTE } from '../src/realtime/ws.js';
import { SHELL_TOKEN_HEADER } from '../src/server/access.js';

const FIXED_NOW = Date.parse('2026-09-20T09:00:00.000Z');

function build(options: { config?: ConfigOverrides; deps?: ServerDeps } = {}): ServerInstance {
  const sink = new MemoryLogSink();
  const config = resolveConfig(options.config ?? {});
  return createServer({ config, sink, now: () => FIXED_NOW, ...options.deps });
}

/**
 * An upgrade context that looks like a loopback client.
 *
 * `injectWS` builds a bare request object with no socket, so the access policy's
 * loopback check would refuse it — which is the correct behaviour ("an origin we
 * cannot prove is local is not local"), and the reason a real socket address has
 * to be supplied here.
 */
const loopback = { socket: { remoteAddress: '127.0.0.1' } } as unknown as Parameters<
  FastifyInstance['injectWS']
>[1];

const ready = async (server: ServerInstance): Promise<FastifyInstance> => {
  await server.app.ready();
  return server.app;
};

/** Collect frames, resolving on the frame asked for or on close — never hanging. */
function collector(socket: { on: (event: string, cb: (...args: never[]) => void) => void }) {
  const frames: Record<string, unknown>[] = [];
  const closes: { code: number; reason: string }[] = [];
  const waiters: { match: (frame: Record<string, unknown>) => boolean; resolve: () => void }[] = [];

  const settle = (frame: Record<string, unknown>): void => {
    for (const waiter of [...waiters]) {
      if (waiter.match(frame)) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve();
      }
    }
  };

  socket.on('message', (data: unknown) => {
    const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
    const frame = JSON.parse(text) as Record<string, unknown>;
    frames.push(frame);
    settle(frame);
  });
  socket.on('close', (code: number, reason: unknown) => {
    closes.push({
      code,
      reason: Buffer.isBuffer(reason) ? reason.toString('utf8') : String(reason),
    });
    // Every waiter resolves on close, so a refused connection fails fast.
    for (const waiter of [...waiters]) {
      waiters.splice(waiters.indexOf(waiter), 1);
      waiter.resolve();
    }
  });

  return {
    frames,
    closes,
    ofType: (t: string) => frames.filter((frame) => frame.t === t),
    waitForType: (t: string) =>
      new Promise<void>((resolve) => {
        if (frames.some((frame) => frame.t === t)) return resolve();
        waiters.push({ match: (frame) => frame.t === t, resolve });
      }),
    /**
     * Wait for a condition, or for the connection to close, or for `ms` to pass.
     * Used where the assertion is "this does *not* arrive".
     */
    settle: async (ms = 40): Promise<void> => {
      await new Promise((resolve) => setTimeout(resolve, ms));
    },
    /** Wait for the close event, bounded: a shutdown is asynchronous by nature. */
    waitForClose: async (ms = 250): Promise<void> => {
      const deadline = Date.now() + ms;
      while (closes.length === 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    },
  };
}

describe('websocket transport', () => {
  it('is mounted, pipeline-marked and described in the socket catalogue', async () => {
    const server = build();
    expect(SOCKET_ROUTES.map((route) => route.path)).toContain('/ws');
    expect(REALTIME_ROUTE.operation).toBe('realtime.connect');
    await ready(server);
    expect(server.app.hasRoute({ method: 'GET', url: '/ws' })).toBe(true);
    await server.close();
  });

  it('requires the shell token when one is configured', async () => {
    const server = build({
      // `api` is replaced wholesale by an override, so start from the defaults
      // rather than dropping the host and port the safety check needs.
      config: { api: { ...DEFAULT_CONFIG.api, shellToken: 'env:MT_TEST_SHELL_TOKEN' as never } },
      deps: { resolveSecret: () => 'shell-secret' },
    });
    const app = await ready(server);

    const refused = await app.injectWS('/ws', loopback);
    const refusedFrames = collector(refused as never);
    await refusedFrames.settle();
    expect(refusedFrames.ofType('welcome')).toHaveLength(0);
    expect(refusedFrames.closes.at(-1)?.code).toBe(CLOSE_CODES.UNAUTHORIZED);
    refused.close();

    const accepted = await app.injectWS('/ws', {
      ...loopback,
      headers: { [SHELL_TOKEN_HEADER]: 'shell-secret' },
    });
    const frames = collector(accepted as never);
    accepted.send(
      JSON.stringify({
        t: 'auth',
        token: server.sessions.issue({ userId: 'u_owner', roles: ['owner'] }).token,
      }),
    );
    await frames.waitForType('welcome');
    expect(frames.ofType('welcome')).toHaveLength(1);
    accepted.close();
    await server.close();
  });

  it('authenticates in the first frame, subscribes and receives typed events', async () => {
    const server = build();
    const token = server.sessions.issue({ userId: 'u_owner', roles: ['owner'] }).token;
    const app = await ready(server);

    const socket = await app.injectWS('/ws', loopback);
    const frames = collector(socket as never);

    socket.send(JSON.stringify({ t: 'auth', token }));
    await frames.waitForType('welcome');

    const welcome = frames.ofType('welcome')[0] as {
      principalId: string;
      roles: string[];
      availableTypes: string[];
      protocolVersion: number;
    };
    expect(welcome.principalId).toBe('u_owner');
    expect(welcome.roles).toEqual(['owner']);
    expect(welcome.availableTypes).toContain('job.status');
    // Internal events are not offered to any client.
    expect(welcome.availableTypes).not.toContain('audit.record');

    socket.send(JSON.stringify({ t: 'subscribe', types: ['job.status'] }));
    await frames.waitForType('subscribed');

    // A real publish on the server's own bus reaches the client.
    server.eventBus.publish({
      type: 'job.status',
      source: { kind: 'job', id: 'job_1' },
      payload: {
        jobId: 'job_1',
        kind: 'embedding.generate',
        status: 'running',
        attempts: 1,
        maxAttempts: 3,
        progress: { current: 5, total: 10, label: 'records' },
      },
    });
    await frames.waitForType('event');
    const event = frames.ofType('event')[0]?.event as { type: string; source: unknown };
    expect(event.type).toBe('job.status');
    expect(event.source).toEqual({ kind: 'job', id: 'job_1' });

    // An unsubscribed type is not delivered.
    server.eventBus.publish({
      type: 'notification',
      source: { kind: 'system' },
      payload: { level: 'info', title: 't', body: 'b' },
    });
    await frames.settle();
    expect(frames.ofType('event')).toHaveLength(1);

    socket.close();
    await server.close();
  });

  it('closes an unauthenticated socket after the authentication deadline', async () => {
    const server = build({ deps: { realtimeLimits: { authTimeoutMs: 30 } } });
    const app = await ready(server);
    const socket = await app.injectWS('/ws', loopback);
    const frames = collector(socket as never);

    await frames.settle(120);
    expect(frames.closes.at(-1)?.code).toBe(CLOSE_CODES.AUTH_TIMEOUT);
    expect(frames.ofType('welcome')).toHaveLength(0);
    await server.close();
  });

  it('refuses a role without realtime.connect and an unknown protocol version', async () => {
    const server = build();
    const app = await ready(server);
    const unprivileged = server.sessions.issue({ userId: 'u_sys', roles: ['system'] }).token;
    const token = server.sessions.issue({ userId: 'u_owner', roles: ['owner'] }).token;

    const socket = await app.injectWS('/ws', loopback);
    const frames = collector(socket as never);
    socket.send(JSON.stringify({ t: 'auth', token: unprivileged }));
    await frames.settle(60);
    expect(frames.closes.at(-1)?.code).toBe(CLOSE_CODES.UNAUTHORIZED);

    const wrongVersion = await app.injectWS('/ws', loopback);
    const versionFrames = collector(wrongVersion as never);
    wrongVersion.send(JSON.stringify({ t: 'auth', token, protocolVersion: 7 }));
    await versionFrames.settle(60);
    expect(versionFrames.closes.at(-1)?.code).toBe(CLOSE_CODES.PROTOCOL_VIOLATION);
    await server.close();
  });

  it('negotiates the subprotocol and answers ping with pong', async () => {
    const server = build();
    const app = await ready(server);
    const token = server.sessions.issue({ userId: 'u_owner', roles: ['owner'] }).token;
    const socket = await app.injectWS('/ws', {
      ...loopback,
      headers: { 'sec-websocket-protocol': REALTIME_SUBPROTOCOL },
    });
    const frames = collector(socket as never);
    socket.send(JSON.stringify({ t: 'auth', token }));
    await frames.waitForType('welcome');
    socket.send(JSON.stringify({ t: 'ping', id: 'p1' }));
    await frames.waitForType('pong');
    expect(frames.ofType('pong')[0]?.id).toBe('p1');
    socket.close();
    await server.close();
  });

  it('resumes from a sequence number when the client reconnects', async () => {
    const server = build();
    const app = await ready(server);
    const token = server.sessions.issue({ userId: 'u_owner', roles: ['owner'] }).token;

    for (let i = 0; i < 3; i++) {
      server.eventBus.publish({
        type: 'notification',
        source: { kind: 'system' },
        payload: { level: 'info', title: `n${i}`, body: 'b' },
      });
    }

    const socket = await app.injectWS('/ws', loopback);
    const frames = collector(socket as never);
    socket.send(JSON.stringify({ t: 'auth', token, fromSeq: 1, types: ['notification'] }));
    await frames.waitForType('event');
    const replayed = frames.ofType('event').map((frame) => (frame.event as { seq: number }).seq);
    expect(replayed).toEqual([2, 3]);
    socket.close();
    await server.close();
  });

  it('tells connected clients the server is going away on close', async () => {
    const server = build();
    const app = await ready(server);
    const token = server.sessions.issue({ userId: 'u_owner', roles: ['owner'] }).token;
    const socket = await app.injectWS('/ws', loopback);
    const frames = collector(socket as never);
    socket.send(JSON.stringify({ t: 'auth', token }));
    await frames.waitForType('welcome');

    await server.close();
    await frames.waitForClose();
    expect(frames.closes.at(-1)?.code).toBe(CLOSE_CODES.GOING_AWAY);
  });

  it('keeps the socket route out of the HTTP catalogue so it cannot bypass the gate', () => {
    // A WebSocket route in API_ROUTES would also be registered as an HTTP route,
    // which is how a route ends up served without the pipeline.
    expect(API_ROUTES.map((route) => route.path)).not.toContain(REALTIME_ROUTE.path);
    expect(SOCKET_ROUTES).toHaveLength(1);
  });
});
