import { describe, expect, it } from 'vitest';
import {
  LlmGateway,
  UsageTracker,
  scriptedLlmProvider,
  type LlmGatewayConfig,
  type LlmProvider,
  type LlmUsage,
} from '../src/llm/provider.js';
import { findPrice, MODEL_PRICES, priceUsage } from '../src/llm/pricing.js';
import { AppError } from '../packages/shared/src/core/errors.js';
import { MemoryLogSink, Logger } from '../packages/shared/src/core/logging.js';
import { DEFAULT_RETRY_POLICY } from '../packages/shared/src/core/retry.js';

const usage = (overrides: Partial<LlmUsage> = {}): LlmUsage => ({
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  costUsd: 0,
  priced: true,
  estimated: false,
  ...overrides,
});

const config = (overrides: Partial<LlmGatewayConfig> = {}): LlmGatewayConfig => ({
  primary: { provider: 'scripted', model: 'scripted-v1', maxTokensPerRequest: 512 },
  fallbacks: [],
  requestTimeoutMs: 1_000,
  maxRetries: 0,
  retry: { ...DEFAULT_RETRY_POLICY, baseDelayMs: 1 },
  monthlyBudgetUsd: 10,
  ...overrides,
});

const failingProvider = (id: LlmProvider['id']): LlmProvider => ({
  id,
  models: ['x'],
  async complete() {
    throw new AppError('PROVIDER_UNAVAILABLE', `${id} down`);
  },
});

const messages = [{ role: 'user' as const, content: 'What is position sizing?' }];

describe('llm gateway', () => {
  it('returns the primary response and records usage', async () => {
    const tracker = new UsageTracker();
    const gateway = new LlmGateway({
      providers: [scriptedLlmProvider({ text: 'explanation' })],
      config: config(),
      tracker,
    });
    const response = await gateway.complete({ correlationId: 'c1', messages });
    expect(response.text).toBe('explanation');
    expect(response.finishReason).toBe('stop');
    // The scripted adapter has a price row of zero: nothing is called.
    expect(response.usage.costUsd).toBe(0);
    expect(response.usage.priced).toBe(true);
    expect(tracker.remainingBudgetUsd(10)).toBe(10);
    expect(tracker.count()).toBe(1);
  });

  it('prices a call from our table, not from anything the provider says', async () => {
    const gateway = new LlmGateway({
      providers: [
        scriptedLlmProvider({
          id: 'openai',
          models: ['gpt-4o'],
          usage: { promptTokens: 1_000, completionTokens: 1_000, totalTokens: 2_000 },
        }),
      ],
      config: config({
        primary: { provider: 'openai', model: 'gpt-4o', maxTokensPerRequest: 512 },
      }),
    });
    const response = await gateway.complete({ correlationId: 'c1', messages });
    const price = findPrice('openai', 'gpt-4o');
    expect(price).toBeDefined();
    // 1000 input @ $2.50/1M + 1000 output @ $10/1M = $0.0125
    expect(response.usage.costUsd).toBeCloseTo(0.0125, 6);
    expect(response.usage.estimated).toBe(false);
    expect(gateway.tracker.totals().costUsd).toBeCloseTo(0.0125, 6);
  });

  it('prices the model we asked for even when the provider claims another one', async () => {
    const gateway = new LlmGateway({
      providers: [
        scriptedLlmProvider({
          id: 'openai',
          models: ['gpt-4o', 'gpt-4o-mini'],
          text: 'answer',
          usage: { promptTokens: 1_000, completionTokens: 0, totalTokens: 1_000 },
        }),
      ],
      config: config({
        primary: { provider: 'openai', model: 'gpt-4o', maxTokensPerRequest: 512 },
      }),
    });
    const response = await gateway.complete({
      correlationId: 'c1',
      messages,
      // A caller may name a different model, but cost follows the model actually
      // requested, not the one echoed back in the response.
      model: 'gpt-4o',
    });
    expect(response.usage.costUsd).toBeCloseTo(0.0025, 6);
  });

  it('estimates tokens when a provider reports none, so the budget stays enforceable', async () => {
    const gateway = new LlmGateway({
      providers: [scriptedLlmProvider({ text: 'a'.repeat(400) })],
      config: config(),
    });
    const response = await gateway.complete({ correlationId: 'c1', messages });
    expect(response.usage.estimated).toBe(true);
    expect(response.usage.promptTokens).toBeGreaterThan(0);
    expect(response.usage.completionTokens).toBeGreaterThan(0);
    expect(response.usage.totalTokens).toBe(
      response.usage.promptTokens + response.usage.completionTokens,
    );
  });

  it('refuses to call a model with no price row while budget enforcement is on', async () => {
    const gateway = new LlmGateway({
      providers: [scriptedLlmProvider({ id: 'openai', models: ['mystery-model'] })],
      config: config({
        primary: { provider: 'openai', model: 'mystery-model', maxTokensPerRequest: 512 },
      }),
    });
    await expect(gateway.complete({ correlationId: 'c1', messages })).rejects.toMatchObject({
      code: 'POLICY_VIOLATION',
    });
  });

  it('prices every declared model, so no row is a guess', () => {
    for (const price of MODEL_PRICES) {
      expect(price.inputPer1M).toBeGreaterThanOrEqual(0);
      expect(price.outputPer1M).toBeGreaterThanOrEqual(0);
      expect(price.note.length).toBeGreaterThan(10);
      expect(findPrice(price.provider, price.model)).toBe(price);
    }
    expect(
      priceUsage('openai', 'not-a-model', { promptTokens: 1, completionTokens: 1, totalTokens: 2 }),
    ).toEqual({ costUsd: 0, priced: false });
  });

  it('falls back to the next provider when the primary fails', async () => {
    const gateway = new LlmGateway({
      providers: [
        failingProvider('openai'),
        scriptedLlmProvider({
          id: 'local-openai-compatible',
          models: ['local-model'],
          text: 'local answer',
        }),
      ],
      config: config({
        primary: { provider: 'openai', model: 'gpt-4o', maxTokensPerRequest: 512 },
        fallbacks: [
          { provider: 'local-openai-compatible', model: 'local-model', maxTokensPerRequest: 512 },
        ],
      }),
    });
    const response = await gateway.complete({ correlationId: 'c1', messages });
    expect(response.text).toBe('local answer');
    expect(response.provider).toBe('local-openai-compatible');
  });

  it('times out a slow provider and surfaces a typed error', async () => {
    const gateway = new LlmGateway({
      providers: [scriptedLlmProvider({ delayMs: 5_000 })],
      config: config({ requestTimeoutMs: 20 }),
    });
    await expect(gateway.complete({ correlationId: 'c1', messages })).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
  });

  it('retries a retryable failure and stops on a non-retryable one', async () => {
    let attempts = 0;
    const flaky: LlmProvider = {
      id: 'scripted',
      models: ['scripted-v1'],
      async complete(request) {
        attempts += 1;
        if (attempts < 2) throw new AppError('PROVIDER_UNAVAILABLE', 'flaky');
        return {
          provider: 'scripted',
          model: request.model,
          text: 'recovered',
          toolCalls: [],
          finishReason: 'stop',
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
          latencyMs: 0,
        };
      },
    };
    const gateway = new LlmGateway({
      providers: [flaky],
      config: config({
        maxRetries: 2,
        retry: { ...DEFAULT_RETRY_POLICY, attempts: 3, baseDelayMs: 1, jitter: false },
      }),
    });
    const response = await gateway.complete({ correlationId: 'c1', messages });
    expect(response.text).toBe('recovered');
    expect(attempts).toBe(2);

    let credentialAttempts = 0;
    const badCredential: LlmProvider = {
      id: 'scripted',
      models: ['scripted-v1'],
      async complete() {
        credentialAttempts += 1;
        throw new AppError('FORBIDDEN', 'credential rejected');
      },
    };
    const gateway2 = new LlmGateway({
      providers: [badCredential],
      config: config({ maxRetries: 3 }),
    });
    await expect(gateway2.complete({ correlationId: 'c1', messages })).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
    // Retrying a rejected credential cannot help: one attempt only.
    expect(credentialAttempts).toBe(1);
  });

  it('opens a circuit after repeated failures and skips that provider', async () => {
    let calls = 0;
    const breakerLog = new Logger({ component: 'test', sink: new MemoryLogSink() });
    const down: LlmProvider = {
      id: 'openai',
      models: ['gpt-4o'],
      async complete() {
        calls += 1;
        throw new AppError('PROVIDER_UNAVAILABLE', 'down');
      },
    };
    const gateway = new LlmGateway({
      providers: [
        down,
        scriptedLlmProvider({ id: 'local-openai-compatible', models: ['local-model'] }),
      ],
      config: config({
        primary: { provider: 'openai', model: 'gpt-4o', maxTokensPerRequest: 512 },
        fallbacks: [
          { provider: 'local-openai-compatible', model: 'local-model', maxTokensPerRequest: 512 },
        ],
        circuitBreaker: { failureThreshold: 2, resetAfterMs: 60_000 },
      }),
      logger: breakerLog,
    });

    await gateway.complete({ correlationId: 'c1', messages });
    expect(calls).toBe(1);
    await gateway.complete({ correlationId: 'c2', messages });
    expect(calls).toBe(2);
    await gateway.complete({ correlationId: 'c3', messages });
    // Open circuit: the broken provider is no longer attempted at all.
    expect(calls).toBe(2);
    expect(gateway.circuitState().openai?.open).toBe(true);

    // After the reset window a single request is allowed through to probe it.
    const later = new LlmGateway({
      providers: [down],
      config: config({
        primary: { provider: 'openai', model: 'gpt-4o', maxTokensPerRequest: 512 },
        circuitBreaker: { failureThreshold: 1, resetAfterMs: 0 },
      }),
    });
    await expect(later.complete({ correlationId: 'c4', messages })).rejects.toBeDefined();
    await expect(later.complete({ correlationId: 'c5', messages })).rejects.toBeDefined();
    expect(calls).toBe(4);
  });

  it('refuses to call out once the monthly budget is spent', async () => {
    const tracker = new UsageTracker();
    tracker.record(usage({ costUsd: 100 }));
    const gateway = new LlmGateway({
      providers: [scriptedLlmProvider()],
      config: config(),
      tracker,
    });
    await expect(gateway.complete({ correlationId: 'c1', messages })).rejects.toMatchObject({
      code: 'BUDGET_EXCEEDED',
    });
  });

  it('only requests tool calls: execution stays with the orchestrator', async () => {
    const sink = new MemoryLogSink();
    const gateway = new LlmGateway({
      providers: [
        scriptedLlmProvider({
          finishReason: 'tool_call',
          toolCalls: [
            { id: 't1', toolName: 'risk.positionSize', arguments: { accountEquity: 1000 } },
          ],
        }),
      ],
      config: config(),
      logger: new Logger({ component: 'test', sink }),
    });
    const response = await gateway.complete({ correlationId: 'c1', messages });
    expect(response.finishReason).toBe('tool_call');
    expect(response.toolCalls).toHaveLength(1);
    // The gateway holds no registry and exposes no execution path.
    expect(Object.keys(gateway)).not.toContain('tools');
    expect('runTool' in gateway).toBe(false);
    expect(sink.records.some((record) => record.event === 'llm.tool_calls.requested')).toBe(true);
  });

  it('reports every failed endpoint when no provider succeeds', async () => {
    const gateway = new LlmGateway({
      providers: [failingProvider('openai')],
      config: config({
        primary: { provider: 'openai', model: 'gpt-4o', maxTokensPerRequest: 512 },
      }),
    });
    await expect(gateway.complete({ correlationId: 'c1', messages })).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
  });
});
