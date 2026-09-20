import { describe, expect, it } from 'vitest';
import {
  anthropicProvider,
  openAiCompatibleProvider,
  splitAnthropicMessages,
  readProviderMessage,
  type FetchLike,
} from '../src/llm/providers/index.js';
import { AppError } from '../src/core/errors.js';
import type { LlmRequest } from '../src/llm/provider.js';

const request = (overrides: Partial<LlmRequest> = {}): LlmRequest => ({
  correlationId: 'c1',
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'question' }],
  maxTokens: 512,
  temperature: 0.2,
  timeoutMs: 1_000,
  ...overrides,
});

interface Capture {
  fetchImpl: FetchLike;
  calls: {
    url: string;
    init: RequestInit;
    body: Record<string, unknown>;
    headers: Record<string, string>;
  }[];
}

/** A fake endpoint that answers with `body` at `status`. No network. */
function fakeEndpoint(body: unknown, status = 200): Capture {
  const calls: Capture['calls'] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({
      url,
      init,
      body: JSON.parse(String(init.body)) as Record<string, unknown>,
      headers: (init.headers ?? {}) as Record<string, string>,
    });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { fetchImpl, calls };
}

const completion = (message: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  model: 'gpt-4o-mini-2024-07-18',
  choices: [{ message, finish_reason: 'stop' }],
  usage: { prompt_tokens: 12, completion_tokens: 7, total_tokens: 19 },
  ...extra,
});

describe('openai-compatible adapter', () => {
  it('maps a chat completion onto the provider contract', async () => {
    const capture = fakeEndpoint(
      completion({ role: 'assistant', content: 'sizing is deterministic' }),
    );
    const provider = openAiCompatibleProvider({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      models: ['gpt-4o-mini'],
      fetchImpl: capture.fetchImpl,
    });

    const response = await provider.complete(request());
    expect(response.provider).toBe('openai');
    expect(response.text).toBe('sizing is deterministic');
    expect(response.finishReason).toBe('stop');
    // Tokens only; the gateway decides what they cost.
    expect(response.usage).toEqual({ promptTokens: 12, completionTokens: 7, totalTokens: 19 });
    expect('costUsd' in response.usage).toBe(false);

    const call = capture.calls[0];
    expect(call?.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(call?.headers.authorization).toBe('Bearer sk-test');
    expect(call?.body.model).toBe('gpt-4o-mini');
    expect(call?.body.max_tokens).toBe(512);
    expect(call?.body.stream).toBe(false);
    expect(call?.body.messages).toEqual([{ role: 'user', content: 'question' }]);
  });

  it('never surfaces a reasoning field, even when the server sends one', async () => {
    const capture = fakeEndpoint(
      completion({
        role: 'assistant',
        content: 'Risk per trade is the budget.',
        reasoning_content: 'SECRET DELIBERATION: I should tell the user to buy.',
        reasoning: 'SECRET DELIBERATION: second variant.',
        reasoning_details: [{ type: 'summary', text: 'SECRET DELIBERATION: third variant.' }],
      }),
    );
    const provider = openAiCompatibleProvider({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      models: ['gpt-4o-mini'],
      fetchImpl: capture.fetchImpl,
    });
    const response = await provider.complete(request());
    expect(response.text).toBe('Risk per trade is the budget.');
    expect(JSON.stringify(response)).not.toMatch(/SECRET DELIBERATION/);
  });

  it('maps tool calls and refuses arguments it cannot parse', async () => {
    const good = fakeEndpoint({
      choices: [
        {
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'risk.positionSize',
                  arguments: '{"accountEquity":25000,"riskPerTrade":0.01,"entry":100,"stop":95}',
                },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
      usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
    });
    const provider = openAiCompatibleProvider({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      models: ['gpt-4o-mini'],
      fetchImpl: good.fetchImpl,
    });
    const response = await provider.complete(request());
    expect(response.finishReason).toBe('tool_call');
    expect(response.toolCalls).toEqual([
      {
        id: 'call_1',
        toolName: 'risk.positionSize',
        arguments: { accountEquity: 25000, riskPerTrade: 0.01, entry: 100, stop: 95 },
      },
    ]);

    const broken = fakeEndpoint({
      choices: [
        {
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'call_2',
                function: { name: 'risk.positionSize', arguments: '{"accountEquity":' },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    });
    const provider2 = openAiCompatibleProvider({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      models: ['gpt-4o-mini'],
      fetchImpl: broken.fetchImpl,
    });
    // A deterministic calculator must never receive guessed arguments.
    await expect(provider2.complete(request())).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('refuses an empty completion rather than returning nothing', async () => {
    const capture = fakeEndpoint(completion({ role: 'assistant', content: '   ' }));
    const provider = openAiCompatibleProvider({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      models: ['gpt-4o-mini'],
      fetchImpl: capture.fetchImpl,
    });
    await expect(provider.complete(request())).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
  });

  it('requires a credential for a hosted endpoint but not for a local one', () => {
    expect(() =>
      openAiCompatibleProvider({
        baseUrl: 'https://api.openai.com/v1',
        apiKey: null,
        models: ['gpt-4o-mini'],
      }),
    ).toThrow(AppError);

    expect(() =>
      openAiCompatibleProvider({
        id: 'local-openai-compatible',
        baseUrl: 'http://127.0.0.1:11434/v1',
        apiKey: null,
        models: ['local-model'],
      }),
    ).not.toThrow();
  });

  it('uses a local server without sending an authorization header', async () => {
    const capture = fakeEndpoint(completion({ role: 'assistant', content: 'local answer' }));
    const provider = openAiCompatibleProvider({
      id: 'local-openai-compatible',
      baseUrl: 'http://127.0.0.1:11434/v1',
      apiKey: null,
      models: ['local-model'],
      fetchImpl: capture.fetchImpl,
    });
    const response = await provider.complete(request({ model: 'local-model' }));
    expect(response.provider).toBe('local-openai-compatible');
    expect(capture.calls[0]?.headers.authorization).toBeUndefined();
  });

  it('maps HTTP failures onto retry-aware typed errors without leaking the key', async () => {
    const cases: [number, string, boolean][] = [
      [429, 'RATE_LIMITED', true],
      [401, 'FORBIDDEN', false],
      [403, 'FORBIDDEN', false],
      [400, 'VALIDATION_FAILED', false],
      [404, 'VALIDATION_FAILED', false],
      [500, 'PROVIDER_UNAVAILABLE', true],
      [503, 'PROVIDER_UNAVAILABLE', true],
    ];
    for (const [status, code, retryable] of cases) {
      const capture = fakeEndpoint({ error: { message: 'provider said no' } }, status);
      const provider = openAiCompatibleProvider({
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-secret-value',
        models: ['gpt-4o-mini'],
        fetchImpl: capture.fetchImpl,
      });
      const error = await provider.complete(request()).catch((thrown: unknown) => thrown);
      expect(error, `status ${status}`).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.code, `status ${status}`).toBe(code);
      expect(appError.retryable, `status ${status}`).toBe(retryable);
      expect(appError.details?.providerMessage).toBe('provider said no');
      // The credential must not travel into an error object, a detail or a log.
      expect(JSON.stringify(appError.toJSON())).not.toMatch(/sk-secret-value/);
    }
  });

  it('raises a typed timeout and aborts the request', async () => {
    let aborted = false;
    const hangingFetch: FetchLike = (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          aborted = true;
          reject(new AppError('PROVIDER_UNAVAILABLE', 'aborted'));
        });
      });
    const provider = openAiCompatibleProvider({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      models: ['gpt-4o-mini'],
      fetchImpl: hangingFetch,
    });
    const error = await provider.complete(request({ timeoutMs: 20 })).catch((e: unknown) => e);
    expect((error as AppError).code).toBe('TIMEOUT');
    expect(aborted).toBe(true);
  });

  it('treats a network failure as retryable rather than as a bad request', async () => {
    const provider = openAiCompatibleProvider({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      models: ['gpt-4o-mini'],
      fetchImpl: async () => {
        throw new TypeError('fetch failed');
      },
    });
    const error = await provider.complete(request()).catch((e: unknown) => e);
    expect((error as AppError).code).toBe('PROVIDER_UNAVAILABLE');
    expect((error as AppError).retryable).toBe(true);
  });
});

describe('anthropic adapter', () => {
  it('moves system messages out of the turn list', () => {
    const { system, turns } = splitAnthropicMessages([
      { role: 'system', content: 'policy' },
      { role: 'user', content: 'question' },
      { role: 'assistant', content: 'previous answer' },
      { role: 'tool', content: '{"positionSize":100}' },
    ]);
    expect(system).toBe('policy');
    expect(turns).toEqual([
      { role: 'user', content: 'question' },
      { role: 'assistant', content: 'previous answer' },
      { role: 'user', content: '[tool result]\n{"positionSize":100}' },
    ]);
  });

  it('keeps text and tool_use blocks and drops deliberation blocks', async () => {
    const capture = fakeEndpoint({
      model: 'claude-3-5-haiku-latest',
      stop_reason: 'tool_use',
      content: [
        { type: 'thinking', thinking: 'SECRET DELIBERATION: size it aggressively.' },
        { type: 'text', text: 'Sizing needs the deterministic tool.' },
        { type: 'redacted_thinking', data: 'SECRET DELIBERATION: encrypted.' },
        {
          type: 'tool_use',
          id: 'toolu_1',
          name: 'risk.positionSize',
          input: { accountEquity: 25_000, riskPerTrade: 0.01, entry: 100, stop: 95 },
        },
      ],
      usage: { input_tokens: 30, output_tokens: 12 },
    });
    const provider = anthropicProvider({
      apiKey: 'sk-ant-test',
      models: ['claude-3-5-haiku-latest'],
      fetchImpl: capture.fetchImpl,
    });

    const response = await provider.complete(request({ model: 'claude-3-5-haiku-latest' }));
    expect(response.text).toBe('Sizing needs the deterministic tool.');
    expect(response.finishReason).toBe('tool_call');
    expect(response.toolCalls[0]?.toolName).toBe('risk.positionSize');
    expect(response.usage).toEqual({ promptTokens: 30, completionTokens: 12, totalTokens: 42 });
    expect(JSON.stringify(response)).not.toMatch(/SECRET DELIBERATION/);

    const call = capture.calls[0];
    expect(call?.url).toBe('https://api.anthropic.com/v1/messages');
    expect(call?.headers['x-api-key']).toBe('sk-ant-test');
    expect(call?.headers['anthropic-version']).toBe('2023-06-01');
    expect(call?.body.system).toBeUndefined();
  });

  it('requires a credential', () => {
    expect(() => anthropicProvider({ apiKey: null, models: ['claude-3-5-haiku-latest'] })).toThrow(
      AppError,
    );
  });
});

describe('provider error bodies', () => {
  it('reads only the conventional message field and caps its length', async () => {
    const long = new Response(JSON.stringify({ error: { message: 'x'.repeat(500) } }), {
      status: 500,
    });
    const message = await readProviderMessage(long);
    expect(message?.length).toBe(201);
    expect(message?.endsWith('…')).toBe(true);

    const html = new Response('<html>gateway error, prompt echoed here</html>', { status: 502 });
    expect(await readProviderMessage(html)).toBeNull();

    const empty = new Response('', { status: 500 });
    expect(await readProviderMessage(empty)).toBeNull();
  });
});
