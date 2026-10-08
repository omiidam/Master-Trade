import { describe, expect, it } from 'vitest';
import {
  arvanCloudProvider,
  scriptedLlmProvider,
  ARVANCLOUD_DEFAULT_BASE_URL,
  type FetchLike,
} from '../src/llm/providers/index.js';
import { LlmGateway, type LlmGatewayConfig } from '../src/llm/provider.js';
import { findPrice } from '../src/llm/pricing.js';
import { createAiGateway, DEFAULT_BASE_URLS } from '../src/llm/registry.js';
import { DEFAULT_RETRY_POLICY } from '../packages/shared/src/core/retry.js';
import { secretFromEnv } from '../src/core/config.js';
import { AppError } from '../packages/shared/src/core/errors.js';

const MODEL = 'DeepSeek-V4-Flash';

interface Capture {
  fetchImpl: FetchLike;
  calls: {
    url: string;
    init: RequestInit;
    body: Record<string, unknown>;
    headers: Record<string, string>;
  }[];
}

/** A fake ArvanCloud endpoint that answers with `body` at `status`. No network. */
function fakeEndpoint(body: unknown, status = 200, options: { rawBody?: string } = {}): Capture {
  const calls: Capture['calls'] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({
      url,
      init,
      body: JSON.parse(String(init.body)) as Record<string, unknown>,
      headers: (init.headers ?? {}) as Record<string, string>,
    });
    return new Response(options.rawBody ?? JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { fetchImpl, calls };
}

const completion = (content: string) => ({
  model: MODEL,
  choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
});

const gatewayConfig = (overrides: Partial<LlmGatewayConfig> = {}): LlmGatewayConfig => ({
  primary: { provider: 'arvancloud', model: MODEL, maxTokensPerRequest: 512 },
  fallbacks: [],
  requestTimeoutMs: 1_000,
  maxRetries: 0,
  retry: { ...DEFAULT_RETRY_POLICY, attempts: 1, baseDelayMs: 1, jitter: false },
  monthlyBudgetUsd: 25,
  ...overrides,
});

const complete = (gateway: LlmGateway, correlationId = 'c-arvan-1') =>
  gateway.complete({
    correlationId,
    userId: 'u1',
    messages: [{ role: 'user', content: 'hello' }],
  });

describe('arvancloud adapter', () => {
  it('sends Authorization: apikey <key> — not Bearer — and the OpenAI wire payload', async () => {
    const capture = fakeEndpoint(completion('answered by arvan'));
    const provider = arvanCloudProvider({
      apiKey: 'arv-test-key',
      models: [MODEL],
      fetchImpl: capture.fetchImpl,
    });
    const response = await provider.complete({
      correlationId: 'c1',
      model: MODEL,
      messages: [{ role: 'user', content: 'hello' }],
      maxTokens: 100,
      temperature: 0.2,
      timeoutMs: 1_000,
    });
    expect(response.text).toBe('answered by arvan');
    expect(response.provider).toBe('arvancloud');

    const call = capture.calls[0];
    expect(call).toBeDefined();
    expect(call?.url).toBe(`${ARVANCLOUD_DEFAULT_BASE_URL}/chat/completions`);
    expect(call?.headers.authorization).toBe('apikey arv-test-key');
    expect(call?.headers.authorization).not.toMatch(/^Bearer/);
    expect(call?.body).toMatchObject({
      model: MODEL,
      max_tokens: 100,
      stream: false,
    });
    // The request scope is attribution, never transport: no userId on the wire.
    expect(JSON.stringify(call?.body)).not.toContain('userId');
    expect(JSON.stringify(call?.body)).not.toContain('u1');
  });

  it('defaults its base URL and honours a configured override', async () => {
    expect(ARVANCLOUD_DEFAULT_BASE_URL).toBe('https://api.arvancloudai.ir/v1');
    expect(DEFAULT_BASE_URLS.arvancloud).toBe('https://api.arvancloudai.ir/v1');

    const capture = fakeEndpoint(completion('ok'));
    const provider = arvanCloudProvider({
      baseUrl: 'https://arvan.example.internal',
      apiKey: 'k',
      models: [MODEL],
      fetchImpl: capture.fetchImpl,
    });
    await provider.complete({
      correlationId: 'c1',
      model: MODEL,
      messages: [{ role: 'user', content: 'hello' }],
      maxTokens: 10,
      temperature: 0.2,
      timeoutMs: 1_000,
    });
    expect(capture.calls[0]?.url).toBe('https://arvan.example.internal/chat/completions');
  });

  it('refuses to be built without a credential', () => {
    expect(() => arvanCloudProvider({ apiKey: null, models: [MODEL] })).toThrowError(AppError);
    try {
      arvanCloudProvider({ apiKey: null, models: [MODEL] });
    } catch (error) {
      expect((error as AppError).code).toBe('FORBIDDEN');
    }
  });

  it('maps API errors onto the typed taxonomy without echoing the credential', async () => {
    for (const [status, code, retryable] of [
      [401, 'FORBIDDEN', false],
      [403, 'FORBIDDEN', false],
      [429, 'RATE_LIMITED', true],
      [500, 'PROVIDER_UNAVAILABLE', true],
      [400, 'VALIDATION_FAILED', false],
    ] as const) {
      const capture = fakeEndpoint({ error: { message: 'quota exhausted' } }, status);
      const provider = arvanCloudProvider({
        apiKey: 'arv-secret-key',
        models: [MODEL],
        fetchImpl: capture.fetchImpl,
      });
      try {
        await provider.complete({
          correlationId: 'c1',
          model: MODEL,
          messages: [{ role: 'user', content: 'hello' }],
          maxTokens: 10,
          temperature: 0.2,
          timeoutMs: 1_000,
        });
        expect.unreachable(`status ${status} should have thrown`);
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.code).toBe(code);
        expect(appError.retryable).toBe(retryable);
        const detailJson = JSON.stringify(appError.details ?? {});
        expect(detailJson).not.toContain('arv-secret-key');
        if (appError.details) {
          expect(appError.details.provider).toBe('arvancloud');
          expect(appError.details.status).toBe(status);
        }
      }
    }
  });

  it('refuses malformed responses explicitly', async () => {
    const malformed: { name: string; body: unknown; raw?: string }[] = [
      { name: 'not an object', body: 'a json string, not an object' },
      { name: 'no choices', body: { model: MODEL } },
      { name: 'empty choices', body: { choices: [] } },
      { name: 'no message', body: { choices: [{}] } },
      { name: 'empty completion', body: completion('   ') },
      { name: 'non-JSON body', body: {}, raw: '<html>gateway error</html>' },
    ];
    for (const entry of malformed) {
      const capture = fakeEndpoint(entry.body, 200, { rawBody: entry.raw });
      const provider = arvanCloudProvider({
        apiKey: 'k',
        models: [MODEL],
        fetchImpl: capture.fetchImpl,
      });
      await expect(
        provider.complete({
          correlationId: 'c1',
          model: MODEL,
          messages: [{ role: 'user', content: 'hello' }],
          maxTokens: 10,
          temperature: 0.2,
          timeoutMs: 1_000,
        }),
      ).rejects.toThrowError(AppError);
    }
  });

  it('falls back to the offline scripted adapter when the API fails mid-call', async () => {
    const capture = fakeEndpoint(completion('ignored'), 503);
    const gateway = new LlmGateway({
      providers: [
        arvanCloudProvider({ apiKey: 'k', models: [MODEL], fetchImpl: capture.fetchImpl }),
        scriptedLlmProvider({ models: ['scripted-v1'] }),
      ],
      config: gatewayConfig({
        fallbacks: [{ provider: 'scripted', model: 'scripted-v1', maxTokensPerRequest: 256 }],
      }),
    });
    const response = await complete(gateway);
    expect(response.provider).toBe('scripted');
  });
});

describe('arvancloud registry wiring', () => {
  it('builds the provider when the credential resolves', () => {
    const registration = createAiGateway(
      {
        primary: {
          provider: 'arvancloud',
          model: MODEL,
          maxTokensPerRequest: 512,
          secret: secretFromEnv('ARVANCLOUD_API_KEY'),
        },
        fallbacks: [],
        requestTimeoutMs: 30_000,
        maxRetries: 2,
        retry: DEFAULT_RETRY_POLICY,
        monthlyBudgetUsd: 25,
      },
      {
        resolveSecret: (ref) => (ref.name === 'ARVANCLOUD_API_KEY' ? 'arv-resolved' : null),
        fetchImpl: fakeEndpoint(completion('ok')).fetchImpl,
      },
    );
    expect(registration.providers).toEqual(['scripted', 'arvancloud']);
    expect(registration.endpoints[0]?.provider).toBe('arvancloud');
    expect(registration.skipped).toEqual([]);
    expect(registration.warnings).toEqual([]);
  });

  it('skips the provider with a reason when the credential does not resolve', () => {
    const registration = createAiGateway(
      {
        primary: {
          provider: 'arvancloud',
          model: MODEL,
          maxTokensPerRequest: 512,
          secret: secretFromEnv('ARVANCLOUD_API_KEY'),
        },
        fallbacks: [],
        requestTimeoutMs: 30_000,
        maxRetries: 2,
        retry: DEFAULT_RETRY_POLICY,
        monthlyBudgetUsd: 25,
      },
      { resolveSecret: () => null },
    );
    expect(registration.providers).toEqual(['scripted']);
    expect(registration.skipped).toEqual([
      {
        provider: 'arvancloud',
        model: MODEL,
        reason: 'credential "env:ARVANCLOUD_API_KEY" did not resolve to a value',
      },
    ]);
    expect(registration.endpoints).toEqual([
      { provider: 'scripted', model: 'scripted-v1', maxTokensPerRequest: 2_048 },
    ]);
  });

  it('prices the model from our own table', async () => {
    const price = findPrice('arvancloud', MODEL);
    expect(price).toBeDefined();
    expect(price?.inputPer1M).toBeGreaterThan(0);
    expect(price?.outputPer1M).toBeGreaterThan(0);

    const capture = fakeEndpoint(completion('priced'));
    const registration = createAiGateway(
      {
        primary: {
          provider: 'arvancloud',
          model: MODEL,
          maxTokensPerRequest: 512,
          secret: secretFromEnv('ARVANCLOUD_API_KEY'),
        },
        fallbacks: [{ provider: 'scripted', model: 'scripted-v1', maxTokensPerRequest: 256 }],
        requestTimeoutMs: 30_000,
        maxRetries: 0,
        retry: { ...DEFAULT_RETRY_POLICY, attempts: 1, baseDelayMs: 1, jitter: false },
        monthlyBudgetUsd: 25,
      },
      {
        resolveSecret: () => 'arv-resolved',
        fetchImpl: capture.fetchImpl,
      },
    );
    const response = await complete(registration.gateway);
    expect(response.provider).toBe('arvancloud');
    expect(response.usage.priced).toBe(true);
    expect(response.usage.costUsd).toBeGreaterThan(0);
  });
});
