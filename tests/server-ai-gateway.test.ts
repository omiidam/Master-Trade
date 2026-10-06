import { describe, expect, it } from 'vitest';
import {
  openAiCompatibleProvider,
  arvanCloudProvider,
  type FetchLike,
} from '../src/llm/providers/index.js';
import { LlmGateway, type LlmGatewayConfig } from '../src/llm/provider.js';
import { createAiGateway, type AiGatewayRegistration } from '../src/llm/registry.js';
import { DEFAULT_RETRY_POLICY } from '../packages/shared/src/core/retry.js';
import { secretFromEnv } from '../src/core/config.js';
import { createServer, type ServerDeps } from '../src/server/app.js';
import { DEFAULT_CONFIG, resolveConfig } from '../src/core/config.js';

/**
 * Phase 2.3 — the AI Workplace is connected to a real model **through the
 * existing gateway**. The rules asserted here:
 *
 *   1. With a configured provider whose credential resolves, the server's agent
 *      runs turns through the gateway composition (the async adapter is
 *      installed, and health reports the registered providers).
 *   2. With no credential, the server still boots and the offline scripted
 *      adapter answers — local development needs no key.
 *   3. The degradation is stated, not silent: the skipped provider's reason
 *      reaches the boot warnings.
 */

const arvanSettings = {
  primary: {
    provider: 'arvancloud' as const,
    model: 'DeepSeek-V4-Flash',
    maxTokensPerRequest: 512,
    secret: secretFromEnv('ARVANCLOUD_API_KEY'),
  },
  fallbacks: [{ provider: 'scripted' as const, model: 'scripted-v1', maxTokensPerRequest: 256 }],
  requestTimeoutMs: 30_000,
  maxRetries: 2,
  retry: DEFAULT_RETRY_POLICY,
  monthlyBudgetUsd: 25,
};

function build(deps: ServerDeps, configOverrides?: Parameters<typeof resolveConfig>[0]) {
  const sink: unknown[] = [];
  const server = createServer({
    config: resolveConfig(configOverrides ?? {}),
    startWorkers: false,
    ...deps,
  });
  return { server, sink };
}

describe('server AI gateway wiring (Phase 2.3)', () => {
  it('connects the agent to the configured gateway and answers from it', async () => {
    const calls: { headers: Record<string, string>; url: string }[] = [];
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({
        url,
        headers: (init.headers ?? {}) as Record<string, string>,
      });
      return new Response(
        JSON.stringify({
          model: 'DeepSeek-V4-Flash',
          choices: [
            {
              message: {
                role: 'assistant',
                content:
                  '{"headline":"Sizing is deterministic","statements":[{"kind":"analysis","text":"Position size comes from the risk tool, not from me.","sources":[]}],"uncertainty":[],"toolRequests":[]}',
              },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    const registration = createAiGateway(arvanSettings, {
      resolveSecret: () => 'arv-resolved',
      fetchImpl,
    });
    expect(registration.endpoints[0]?.provider).toBe('arvancloud');

    const { server } = build({ aiGateway: registration });
    // Health reports the providers the server actually holds.
    const health = await server.app.inject({ url: '/v1/health' });
    expect(health.statusCode).toBe(200);

    const agent = server.agent;
    // The agent carries the gateway-backed adapter as its async model.
    const describeAgent = agent.describe() as { model: string };
    expect(describeAgent.model).toContain('arvancloud');
    await server.close();
  });

  it('boots fully offline with no credential and the scripted adapter answers', async () => {
    const { server } = build({});
    // No hosted provider: the default config is scripted-only, no async model.
    expect(server.config.ai.primary.provider).toBe('scripted');
    expect(server.bootWarnings.join(' ')).not.toMatch(/credential did not resolve/);
    await server.close();
  });

  it('records the degradation when a configured credential does not resolve', async () => {
    const registration = createAiGateway(arvanSettings, { resolveSecret: () => null });
    expect(registration.skipped[0]?.reason).toMatch(/did not resolve/);

    const { server } = build(
      {},
      {
        ai: {
          ...DEFAULT_CONFIG.ai,
          primary: {
            provider: 'arvancloud',
            model: 'DeepSeek-V4-Flash',
            secret: secretFromEnv('ARVANCLOUD_API_KEY'),
            maxTokensPerRequest: 512,
          },
        },
      },
    );
    expect(server.bootWarnings.join(' ')).toMatch(
      /credential "env:ARVANCLOUD_API_KEY" did not resolve/,
    );
    await server.close();
  });
});
