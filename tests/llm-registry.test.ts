import { describe, expect, it } from 'vitest';
import { createAiGateway, DEFAULT_BASE_URLS, SCRIPTED_ENDPOINT } from '../src/llm/registry.js';
import { scriptedLlmProvider, type FetchLike } from '../src/llm/providers/index.js';
import { DEFAULT_RETRY_POLICY } from '../packages/shared/src/core/retry.js';
import { secretFromEnv, secretFromKeychain } from '../src/core/config.js';
import { AppError } from '../packages/shared/src/core/errors.js';

const settings = (
  overrides: Partial<Parameters<typeof createAiGateway>[0]> = {},
): Parameters<typeof createAiGateway>[0] => ({
  primary: { provider: 'scripted', model: 'scripted-v1', maxTokensPerRequest: 2_048 },
  fallbacks: [],
  requestTimeoutMs: 1_000,
  maxRetries: 0,
  retry: { ...DEFAULT_RETRY_POLICY, attempts: 1, baseDelayMs: 1, jitter: false },
  monthlyBudgetUsd: 25,
  ...overrides,
});

const okEndpoint =
  (content: string): FetchLike =>
  async () =>
    new Response(
      JSON.stringify({
        model: 'gpt-4o-mini',
        choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
      { status: 200 },
    );

describe('ai gateway composition', () => {
  it('runs offline with no configuration at all', async () => {
    const registration = createAiGateway(settings());
    expect(registration.providers).toEqual(['scripted']);
    expect(registration.endpoints).toEqual([SCRIPTED_ENDPOINT]);
    expect(registration.skipped).toEqual([]);
    expect(registration.warnings).toEqual([]);
    const response = await registration.gateway.complete({
      correlationId: 'c1',
      messages: [{ role: 'user', content: 'hello' }],
    });
    expect(response.provider).toBe('scripted');
    expect(response.usage.costUsd).toBe(0);
  });

  it('builds a hosted provider when the credential resolves', async () => {
    const registration = createAiGateway(
      settings({
        primary: {
          provider: 'openai',
          model: 'gpt-4o-mini',
          maxTokensPerRequest: 512,
          secret: secretFromEnv('OPENAI_API_KEY'),
        },
      }),
      {
        resolveSecret: (ref) => (ref.name === 'OPENAI_API_KEY' ? 'sk-resolved' : null),
        fetchImpl: okEndpoint('hosted answer'),
      },
    );
    expect(registration.providers).toEqual(['scripted', 'openai']);
    expect(registration.endpoints[0]?.provider).toBe('openai');
    const response = await registration.gateway.complete({
      correlationId: 'c1',
      messages: [{ role: 'user', content: 'hello' }],
    });
    expect(response.text).toBe('hosted answer');
    expect(response.usage.costUsd).toBeGreaterThan(0);
  });

  it('skips a provider whose credential does not resolve, and says why', async () => {
    const registration = createAiGateway(
      settings({
        primary: {
          provider: 'anthropic',
          model: 'claude-3-5-haiku-latest',
          maxTokensPerRequest: 512,
          secret: secretFromKeychain('master-trade/anthropic'),
        },
      }),
      { resolveSecret: () => null },
    );
    expect(registration.providers).toEqual(['scripted']);
    expect(registration.skipped).toEqual([
      {
        provider: 'anthropic',
        model: 'claude-3-5-haiku-latest',
        reason: 'credential "keychain:master-trade/anthropic" did not resolve to a value',
      },
    ]);
    // The offline endpoint answers, and the degradation is recorded.
    expect(registration.endpoints).toEqual([SCRIPTED_ENDPOINT]);
    expect(registration.warnings.join(' ')).toMatch(/offline scripted adapter/);
  });

  it('skips a hosted provider with no secret reference configured', () => {
    const registration = createAiGateway(
      settings({
        primary: { provider: 'openai', model: 'gpt-4o-mini', maxTokensPerRequest: 512 },
      }),
    );
    expect(registration.skipped[0]?.reason).toBe('no secret reference is configured for openai');
  });

  it('warns about an unpriced model before the first request', () => {
    const registration = createAiGateway(
      settings({
        primary: {
          provider: 'openai',
          model: 'brand-new-model',
          maxTokensPerRequest: 512,
          secret: secretFromEnv('OPENAI_API_KEY'),
        },
      }),
      { resolveSecret: () => 'sk-resolved' },
    );
    expect(registration.warnings.join(' ')).toMatch(/no price row/);
  });

  it('needs no credential for a local server and defaults its base URL', () => {
    const registration = createAiGateway(
      settings({
        primary: {
          provider: 'local-openai-compatible',
          model: 'local-model',
          maxTokensPerRequest: 512,
        },
      }),
      { fetchImpl: okEndpoint('local answer') },
    );
    expect(registration.providers).toEqual(['scripted', 'local-openai-compatible']);
    expect(registration.endpoints[0]?.provider).toBe('local-openai-compatible');
    expect(DEFAULT_BASE_URLS['local-openai-compatible']).toContain('127.0.0.1');
  });

  it('keeps the offline adapter registered so a configured chain can fall back to it', async () => {
    const registration = createAiGateway(
      settings({
        primary: {
          provider: 'openai',
          model: 'gpt-4o-mini',
          maxTokensPerRequest: 512,
          secret: secretFromEnv('OPENAI_API_KEY'),
        },
        fallbacks: [{ provider: 'scripted', model: 'scripted-v1', maxTokensPerRequest: 2_048 }],
      }),
      {
        resolveSecret: () => 'sk-resolved',
        fetchImpl: async () => {
          throw new AppError('PROVIDER_UNAVAILABLE', 'hosted down');
        },
      },
    );
    expect(registration.endpoints.map((endpoint) => endpoint.provider)).toEqual([
      'openai',
      'scripted',
    ]);
    const response = await registration.gateway.complete({
      correlationId: 'c1',
      messages: [{ role: 'user', content: 'hello' }],
    });
    expect(response.provider).toBe('scripted');
  });

  it('exposes the same adapter through the providers barrel', () => {
    expect(scriptedLlmProvider().id).toBe('scripted');
  });
});
