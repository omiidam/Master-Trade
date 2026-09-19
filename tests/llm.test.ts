import { describe, expect, it } from 'vitest';
import {
  LlmGateway,
  UsageTracker,
  scriptedLlmProvider,
  type LlmGatewayConfig,
  type LlmProvider,
} from '../src/llm/provider.js';
import { AppError } from '../src/core/errors.js';
import { MemoryLogSink, Logger } from '../src/core/logging.js';
import { DEFAULT_RETRY_POLICY } from '../src/core/retry.js';

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
      providers: [
        scriptedLlmProvider({
          text: 'explanation',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, costUsd: 0.01 },
        }),
      ],
      config: config(),
      tracker,
    });
    const response = await gateway.complete({ correlationId: 'c1', messages });
    expect(response.text).toBe('explanation');
    expect(response.finishReason).toBe('stop');
    expect(tracker.totals().costUsd).toBeCloseTo(0.01);
    expect(tracker.remainingBudgetUsd(10)).toBeGreaterThan(9);
  });

  it('falls back to the next provider when the primary fails', async () => {
    const gateway = new LlmGateway({
      providers: [
        failingProvider('openai'),
        scriptedLlmProvider({ id: 'local-openai-compatible', text: 'local answer' }),
      ],
      config: config({
        primary: { provider: 'openai', model: 'gpt', maxTokensPerRequest: 512 },
        fallbacks: [
          { provider: 'local-openai-compatible', model: 'local', maxTokensPerRequest: 512 },
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

  it('refuses to call out once the monthly budget is spent', async () => {
    const tracker = new UsageTracker();
    tracker.record({ promptTokens: 1, completionTokens: 1, totalTokens: 2, costUsd: 100 });
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
      config: config({ primary: { provider: 'openai', model: 'gpt', maxTokensPerRequest: 512 } }),
    });
    await expect(gateway.complete({ correlationId: 'c1', messages })).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
  });
});
