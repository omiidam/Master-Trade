/**
 * Phase 2.14.C — chat stability and the Needle 3 fail-safe (regression suite).
 *
 * The phase's whole claim is that the decision router can never take a chat
 * turn down with it. This file pins that claim at the two seams a user can
 * actually feel:
 *
 *   - **`agent.chat`, through the real server.** A router that is fine, a
 *     router that throws, a classifier that answers garbage, a classifier that
 *     never answers, and a hosted gateway that is down — each one is a real
 *     HTTP request against the real pipeline, and each one must come back with
 *     a response whose shape the AI Workplace already renders.
 *   - **the trace.** Every turn emits the structured events the phase asks for
 *     (`chat.request.received`, `decision.router.*`, `fallback.triggered`,
 *     `agent.runtime.started`, `gateway.called`, `response.generated`), and
 *     none of them carries the message, a model path or a provider detail.
 *
 * The classifier is stubbed at the `Needle3Classifier` boundary (the same seam
 * `tests/decision-router.test.ts` uses) or the router is injected whole — a
 * *router* that throws is exactly the failure this phase exists for, so it is
 * injected as a router rather than simulated inside one. Every assertion is on
 * the server's own response, its own log records and its own run record.
 */

import { describe, expect, it } from 'vitest';

import { resolveConfig, DEFAULT_CONFIG } from '../src/core/config.js';
import { createAiGateway, type FetchLike } from '../src/llm/index.js';
import { DEFAULT_RETRY_POLICY } from '../packages/shared/src/core/retry.js';
import {
  createChatDecisionRouter,
  fallbackRouteDecision,
  NEEDLE3_FAILURE_CODES,
  routeChatTurn,
  type ChatDecisionRouter,
  type Needle3Classifier,
} from '../src/agent/decisionRouter/index.js';
import type { AppConfig } from '../src/core/config.js';
import { createServer, type ServerDeps } from '../src/server/app.js';
import { decisionOf } from './decision-router-helpers.js';

/* ── Fixtures ────────────────────────────────────────────────────────────── */

const arvanSettings = {
  primary: {
    provider: 'arvancloud' as const,
    model: 'DeepSeek-V4-Flash',
    maxTokensPerRequest: 512,
    secret: { provider: 'arvancloud' as const, envVar: 'ARVANCLOUD_API_KEY' } as never,
  },
  fallbacks: [],
  requestTimeoutMs: 30_000,
  maxRetries: 2,
  retry: DEFAULT_RETRY_POLICY,
  monthlyBudgetUsd: 25,
};

const AUTH = (token: string) => ({ authorization: `Bearer ${token}` });

const baseRouterConfig = {
  ...DEFAULT_CONFIG.decisionRouter,
  checkpointPath: '/models/needle3.safetensors',
};

const classifierStub = (impl: (message: string) => Promise<unknown>): Needle3Classifier =>
  ({ classify: ({ message }) => impl(message) }) as Needle3Classifier;

const providerAnswer = (headline: string, text: string): string =>
  JSON.stringify({
    headline,
    statements: [{ kind: 'analysis', text, sources: [] }],
    uncertainty: [],
    toolRequests: [],
  });

/** A gateway whose provider answers normally. */
function workingFetch() {
  const calls: string[] = [];
  const fetchImpl: FetchLike = async () => {
    calls.push('call');
    return new Response(
      JSON.stringify({
        model: 'DeepSeek-V4-Flash',
        choices: [
          {
            message: {
              role: 'assistant',
              content: providerAnswer(
                'Liquidity is market depth',
                'Liquidity is the ease of buying or selling an asset without moving its price.',
              ),
            },
          },
        ],
        usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  return { calls, fetchImpl };
}

function build(deps: ServerDeps, configOverrides?: Partial<AppConfig>) {
  const config = resolveConfig({});
  return createServer({
    config: { ...config, ...configOverrides },
    startWorkers: false,
    captureLogs: true,
    ...deps,
  });
}

/** The captured event names, in order. */
function events(server: {
  logging: { captured: { records: { event?: string }[] } | null };
}): string[] {
  return (server.logging.captured?.records ?? []).flatMap((record) =>
    record.event === undefined ? [] : [record.event],
  );
}

/** Every captured record, JSON-serialized — for leak assertions. */
function capturedText(server: { logging: { captured: { records: unknown[] } | null } }): string {
  return JSON.stringify(server.logging.captured?.records ?? []);
}

/* ── Case 1 — a normal Needle 3 decision produces a response ─────────────── */

describe('Phase 2.14.C — a normal decision still produces a response', () => {
  it('Case 1: a classified cloud turn runs the runtime, calls the gateway, and answers', async () => {
    const { calls, fetchImpl } = workingFetch();
    const registration = createAiGateway(arvanSettings, {
      resolveSecret: () => 'arv-resolved',
      fetchImpl,
    });
    const router = createChatDecisionRouter(baseRouterConfig, {
      classifier: classifierStub(async () => decisionOf('MARKET_ANALYSIS', 'LLM_GATEWAY', 88)),
    });
    const server = build({ aiGateway: registration, decisionRouter: router });
    const student = server.sessions.issue({ userId: 'u_case1', roles: ['student'] });

    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/agent/messages',
      headers: AUTH(student.token),
      payload: { message: 'Analyze EURUSD market structure' },
    });

    expect(response.statusCode).toBe(200);
    const data = response.json().data;
    expect(data.status).toBe('completed');
    expect(data.route).toBe('LLM_GATEWAY');
    expect(data.responsePipeline.kind).toBe('completed');
    expect(data.decision.source).toBe('needle3');
    expect(calls.length).toBeGreaterThanOrEqual(1);

    // Every event the phase asks for, and no failure event on a clean turn.
    const seen = events(server);
    for (const event of [
      'chat.request.received',
      'decision.router.started',
      'decision.router.completed',
      'agent.runtime.started',
      'gateway.called',
      'response.generated',
    ]) {
      expect(seen, `missing ${event}`).toContain(event);
    }
    expect(seen).not.toContain('decision.router.failed');
    expect(seen).not.toContain('fallback.triggered');

    // The trace does not carry the message, the model's path or a credential.
    const logged = capturedText(server);
    expect(logged).not.toContain('Analyze EURUSD market structure');
    expect(logged).not.toContain('safetensors');
    expect(logged).not.toContain('arv-resolved');

    await server.close();
  });
});

/* ── Case 2 — Needle 3 fails, the chat still answers ─────────────────────── */

describe('Phase 2.14.C — Needle 3 failure never fails the chat', () => {
  it('Case 2: a router that throws fails closed to the Agent Runtime and still answers', async () => {
    const { calls, fetchImpl } = workingFetch();
    const registration = createAiGateway(arvanSettings, {
      resolveSecret: () => 'arv-resolved',
      fetchImpl,
    });
    // The failure this whole phase exists for: the injected router itself throws
    // (not a typed classifier error the policy already understands).
    const exploding: ChatDecisionRouter = {
      route: async () => {
        throw new Error('needle3 crashed: /models/needle3.safetensors missing');
      },
    };
    const server = build({ aiGateway: registration, decisionRouter: exploding });
    const student = server.sessions.issue({ userId: 'u_case2', roles: ['student'] });

    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/agent/messages',
      headers: AUTH(student.token),
      payload: { message: 'What is liquidity in trading?' },
    });

    // The chat did not fail: 200, a completed answer, through the fallback path.
    expect(response.statusCode).toBe(200);
    const data = response.json().data;
    expect(data.status).toBe('completed');
    expect(data.route).toBe('LLM_GATEWAY');
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(data.decision).toBeDefined();
    expect(data.decision.source).toBe('fallback');
    expect(data.decision.code).toBe('NEEDLE3_UNAVAILABLE');
    expect(data.decision.executionPath).toBe('LLM_GATEWAY');

    const seen = events(server);
    expect(seen).toContain('decision.router.started');
    expect(seen).toContain('decision.router.failed');
    expect(seen).toContain('fallback.triggered');
    expect(seen).toContain('response.generated');

    // The router's own failure detail (a path) reaches neither the wire nor the log.
    expect(response.body).not.toContain('safetensors');
    expect(capturedText(server)).not.toContain('safetensors');

    await server.close();
  });

  it('a classifier that answers garbage is caught inside the router, not by the chat', async () => {
    const router = createChatDecisionRouter(baseRouterConfig, {
      classifier: classifierStub(async () => ({
        intent: 'NOT_AN_INTENT',
        route: 'LLM_GATEWAY',
        confidence: 90,
        reason: 'invented',
        requires_llm: true,
        requires_tool: false,
      })),
    });

    const decision = await routeChatTurn(router, 'anything');
    expect(decision.source).toBe('fallback');
    expect(decision.code).toBe('NEEDLE3_INVALID_OUTPUT');
    expect(decision.executionPath).toBe('LLM_GATEWAY');
  });

  it('a classifier that resolves null is a malformed decision, not a crash', async () => {
    const router = createChatDecisionRouter(baseRouterConfig, {
      classifier: classifierStub(async () => null),
    });
    const decision = await router.route('anything');
    expect(decision.source).toBe('fallback');
    expect(decision.code).toBe('NEEDLE3_INVALID_OUTPUT');
  });

  it('a classifier that never answers is cut off by the policy deadline', async () => {
    const router = createChatDecisionRouter(
      { ...baseRouterConfig, timeoutMs: 50 },
      {
        classifier: { classify: () => new Promise<never>(() => undefined) },
      },
    );
    const decision = await router.route('anything');
    expect(decision.source).toBe('fallback');
    expect(decision.code).toBe('NEEDLE3_TIMEOUT');
  }, 15_000);

  it('a typed classifier failure routes conservatively, as before', async () => {
    const router = createChatDecisionRouter(baseRouterConfig, {
      classifier: classifierStub(async () => {
        throw new Error('runner died: spawn needle');
      }),
    });
    const decision = await router.route('anything');
    expect(decision.source).toBe('fallback');
    expect(decision.code).toBe('NEEDLE3_UNAVAILABLE');
    expect(NEEDLE3_FAILURE_CODES).toContain(decision.code);
  });

  it('the fallback decision is the full pipeline, never a local bypass', () => {
    const decision = fallbackRouteDecision('NEEDLE3_UNAVAILABLE', 'reason');
    expect(decision.executionPath).toBe('LLM_GATEWAY');
    expect(decision.requires_cloud_llm).toBe(true);
    expect(decision.intent).toBe('UNCLASSIFIED');
    expect(decision.confidence).toBe(0);
  });
});

/* ── Case 3 — the gateway is unavailable ─────────────────────────────────── */

describe('Phase 2.14.C — an unavailable LLM gateway is an honest failure', () => {
  it('Case 3: a dead provider yields the failed turn, a failed run and no crash', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new TypeError('fetch failed: connect ECONNREFUSED 127.0.0.1:9');
    };
    const registration = createAiGateway(arvanSettings, {
      resolveSecret: () => 'arv-resolved',
      fetchImpl,
    });
    const router = createChatDecisionRouter(baseRouterConfig, {
      classifier: classifierStub(async () => decisionOf('MARKET_ANALYSIS', 'LLM_GATEWAY', 90)),
    });
    const server = build({ aiGateway: registration, decisionRouter: router });
    const student = server.sessions.issue({ userId: 'u_case3', roles: ['student'] });

    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/agent/messages',
      headers: AUTH(student.token),
      payload: { message: 'Analyze the current market structure on BTC/USDT' },
    });

    // A gateway that is down is a *handled* outcome: same shape, honest status.
    expect(response.statusCode).toBe(200);
    const data = response.json().data;
    expect(data.status).toBe('blocked');
    expect(data.responsePipeline.kind).toBe('failed');
    expect(data.statements).toEqual([]);
    expect(data.reply).toContain('This run failed before an answer was produced');
    expect(data.route).toBe('LLM_GATEWAY');
    // The turn is still tracked, and the record says what actually happened.
    expect(data.run?.state).toBe('failed');
    expect(server.runs.getRun(data.run.runId, 'u_case3').state).toBe('failed');

    const seen = events(server);
    expect(seen).toContain('gateway.called');
    expect(seen).toContain('response.generated');

    // The provider's detail stays server-side.
    expect(response.body).not.toContain('ECONNREFUSED');

    await server.close();
  });
});

/* ── The trace seam on its own ───────────────────────────────────────────── */

describe('Phase 2.14.C — the router trace seam', () => {
  it('records the four router events with safe fields only', async () => {
    const records: { event?: string; data?: Record<string, unknown> }[] = [];
    const logger = {
      info: (_m: string, data?: Record<string, unknown>, event?: string) =>
        records.push({ event, data }),
      warn: (_m: string, data?: Record<string, unknown>, event?: string) =>
        records.push({ event, data }),
      error: (_m: string, data?: Record<string, unknown>, event?: string) =>
        records.push({ event, data }),
    };

    const router = createChatDecisionRouter(baseRouterConfig, {
      classifier: classifierStub(async () => decisionOf('NON_TRADING', 'LOCAL_RESPONSE', 77)),
    });
    await routeChatTurn(router, 'Hello there', logger);
    await routeChatTurn(router, 'Hello there', logger); // idempotent: no state kept

    const named = records.map((record) => record.event);
    expect(named[0]).toBe('decision.router.started');
    expect(named).toContain('decision.router.completed');
    expect(named).not.toContain('decision.router.failed');
    const completed = records.find((record) => record.event === 'decision.router.completed');
    expect(completed?.data).toMatchObject({
      source: 'needle3',
      code: 'NEEDLE3_CLASSIFIED',
      executionPath: 'LOCAL_RESPONSE',
      confidence: 77,
    });
    // Nothing in the trace names a path or a file.
    expect(JSON.stringify(records)).not.toContain('safetensors');
  });

  it('records a fallback turn as a router failure plus a triggered fallback', async () => {
    const records: { event?: string }[] = [];
    const logger = {
      info: (_m: string, _d?: Record<string, unknown>, event?: string) => records.push({ event }),
      warn: (_m: string, _d?: Record<string, unknown>, event?: string) => records.push({ event }),
      error: (_m: string, _d?: Record<string, unknown>, event?: string) => records.push({ event }),
    };

    const router = createChatDecisionRouter(baseRouterConfig, {
      classifier: classifierStub(async () => {
        throw new Error('boom');
      }),
    });
    const decision = await routeChatTurn(router, 'Analyze something', logger);

    expect(decision.source).toBe('fallback');
    const named = records.map((record) => record.event);
    expect(named).toContain('decision.router.completed');
    expect(named).toContain('decision.router.failed');
    expect(named).toContain('fallback.triggered');
  });
});
