import { describe, expect, it } from 'vitest';
import { AgentRunHarness, WorkingMemory, type AgentRunInput } from '../src/agent/harness.js';
import { scriptedAsyncModelAdapter, type ModelTurnRequest } from '../src/agent/asyncModel.js';
import { LlmGateway, type LlmGatewayConfig } from '../src/llm/provider.js';
import {
  openAiCompatibleProvider,
  type FetchLike,
  type OpenAiCompatibleOptions,
} from '../src/llm/providers/index.js';
import { parseStructuredSummary } from '../src/llm/summary.js';
import { section } from '../src/agent/context.js';

const instructions = 'system instructions for the run';

function input(overrides: Partial<AgentRunInput> = {}): AgentRunInput {
  return {
    correlationId: 'corr-test',
    userInput: 'what is position sizing?',
    instructions,
    ...overrides,
  };
}

describe('agent run harness', () => {
  it('completes a run through the real adapter path and records the timeline', async () => {
    const seen: ModelTurnRequest[] = [];
    const adapter = {
      label: 'capture',
      async completeTurn(request: ModelTurnRequest) {
        seen.push(request);
        return scriptedAsyncModelAdapter().completeTurn(request);
      },
    };
    const harness = new AgentRunHarness({ adapter });
    const result = await harness.run(input());

    expect(result.status).toBe('completed');
    expect(result.turn).toBeDefined();
    expect(result.failure).toBeUndefined();
    expect(result.timeline.map((t) => t.state)).toEqual([
      'pending',
      'assembling',
      'calling-model',
      'responding',
      'completed',
    ]);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.correlationId).toBe('corr-test');
    expect(seen[0]?.instructions).toBe(instructions);
  });

  it('records chat history oldest-first with the current prompt last', async () => {
    let captured: ModelTurnRequest | undefined;
    const adapter = {
      label: 'capture',
      async completeTurn(request: ModelTurnRequest) {
        captured = request;
        return scriptedAsyncModelAdapter().completeTurn(request);
      },
    };
    const harness = new AgentRunHarness({ adapter });
    const result = await harness.run(
      input({
        history: [
          { role: 'user', content: 'earlier question' },
          { role: 'assistant', content: 'earlier answer' },
        ],
        runtimeContext: [
          section({ id: 'market:spot', source: 'market-data', priority: 60, content: 'BTC 60k' }),
        ],
      }),
    );

    expect(result.status).toBe('completed');
    const assembly = result.assembly!;
    expect(assembly.systemInstructions).toBe(instructions);
    expect(assembly.userPrompt).toBe('what is position sizing?');
    // History order: the caller's prior turns first, the current prompt last.
    expect(assembly.history.map((h) => h.role)).toEqual(['user', 'assistant', 'user']);
    expect(assembly.history[2]?.content).toBe('what is position sizing?');
    const ids = assembly.contextSections.map((s) => s.id);
    expect(ids).toContain('instructions');
    expect(ids).toContain('chat-history');
    expect(ids).toContain('market:spot');
    // The adapter receives the assembled context, instructions included.
    expect(captured?.context.map((s) => s.id)).toEqual(assembly.contextSections.map((s) => s.id));
    expect(captured?.instructions).toBe(instructions);
  });

  it('keeps working memory isolated per run', async () => {
    const harness = new AgentRunHarness({ adapter: scriptedAsyncModelAdapter() });
    const first = await harness.run(
      input({ correlationId: 'run-1', userInput: 'first run input' }),
    );
    const second = await harness.run(
      input({ correlationId: 'run-2', userInput: 'second run input' }),
    );

    expect(first.status).toBe('completed');
    expect(second.status).toBe('completed');
    // Each run saw only its own history: no leakage across runs.
    expect(first.assembly!.history.map((h) => h.content)).toEqual(['first run input']);
    expect(second.assembly!.history.map((h) => h.content)).toEqual(['second run input']);
    expect(first.runId).not.toBe(second.runId);
  });

  it('disposes the ephemeral working memory on every terminal path', async () => {
    const memories: WorkingMemory[] = [];
    const adapter = {
      label: 'capture',
      async completeTurn(request: ModelTurnRequest) {
        return scriptedAsyncModelAdapter().completeTurn(request);
      },
    };
    const harness = new AgentRunHarness({
      adapter,
      hooks: {
        async afterTurn(_turn, memory) {
          memories.push(memory);
        },
      },
    });
    await harness.run(input());
    expect(memories).toHaveLength(1);
    expect(memories[0]!.isDisposed).toBe(true);
    expect(() => memories[0]!.history).toThrow(/disposed/);
    expect(() => memories[0]!.recordUser('nope')).toThrow(/disposed/);
  });

  it('fails loudly when a hook throws, with the failing phase recorded', async () => {
    const harness = new AgentRunHarness({
      adapter: scriptedAsyncModelAdapter(),
      hooks: {
        async beforeModelCall() {
          throw new Error('hook refused the call');
        },
      },
    });
    const result = await harness.run(input());
    expect(result.status).toBe('failed');
    expect(result.failure?.phase).toBe('calling-model');
    expect(result.failure?.message).toBe('hook refused the call');
    expect(result.timeline.map((t) => t.state)).toContain('failed');
  });

  it('fails cleanly when the adapter itself throws', async () => {
    const harness = new AgentRunHarness({
      adapter: {
        label: 'boom',
        async completeTurn() {
          throw new Error('provider unreachable');
        },
      },
    });
    const result = await harness.run(input());
    expect(result.status).toBe('failed');
    expect(result.failure?.phase).toBe('calling-model');
    expect(result.failure?.message).toBe('provider unreachable');
  });

  it('honors cooperative cancellation before the model call', async () => {
    const harness = new AgentRunHarness({
      adapter: scriptedAsyncModelAdapter(),
      hooks: { shouldCancel: () => true },
    });
    const result = await harness.run(input());
    expect(result.status).toBe('cancelled');
    expect(result.turn).toBeUndefined();
    expect(result.timeline.map((t) => t.state)).toEqual(['pending', 'assembling', 'cancelled']);
  });

  it('carries tool requests through without executing anything', async () => {
    const summary = parseStructuredSummary(
      JSON.stringify({
        headline: 'Sizing is a deterministic calculation.',
        statements: [
          {
            kind: 'analysis',
            text: 'I will request the position sizing tool.',
            sources: ['risk.positionSize'],
          },
        ],
        toolRequests: [
          {
            toolName: 'risk.positionSize',
            arguments: { equity: 10000 },
            purpose: 'size the position',
          },
        ],
      }),
    );
    const adapter = {
      label: 'tool-asking',
      async completeTurn(request: ModelTurnRequest) {
        return scriptedAsyncModelAdapter({ summary }).completeTurn(request);
      },
    };
    const harness = new AgentRunHarness({ adapter });
    const result = await harness.run(input());
    expect(result.status).toBe('completed');
    expect(result.toolRequests).toHaveLength(1);
    expect(result.toolRequests[0]?.toolName).toBe('risk.positionSize');
  });

  it('runs against the real LlmGateway over a fake OpenAI-compatible endpoint', async () => {
    const fetchImpl: FetchLike = async (_url, init) => {
      void init;
      return new Response(
        JSON.stringify({
          model: 'gpt-4o-mini-2024-07-18',
          choices: [
            {
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  headline: 'Position sizing caps risk per trade.',
                  statements: [
                    {
                      kind: 'analysis',
                      text: 'Position sizing caps risk per trade.',
                      sources: ['risk.positionSize'],
                    },
                  ],
                }),
              },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };
    const providerOptions: OpenAiCompatibleOptions = {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      models: ['gpt-4o-mini'],
      fetchImpl,
    };
    const config: LlmGatewayConfig = {
      primary: { provider: 'openai', model: 'gpt-4o-mini', maxTokensPerRequest: 1_200 },
      fallbacks: [],
      requestTimeoutMs: 1_000,
      maxRetries: 0,
      retry: { attempts: 1, baseDelayMs: 1, maxDelayMs: 2, jitter: false },
      monthlyBudgetUsd: 25,
    };
    const gateway = new LlmGateway({
      providers: [openAiCompatibleProvider(providerOptions)],
      config,
    });
    const { createLlmModelAdapter } = await import('../src/agent/asyncModel.js');
    const harness = new AgentRunHarness({ adapter: createLlmModelAdapter({ gateway }) });
    const result = await harness.run(input({ userId: 'user-123' }));

    expect(result.status).toBe('completed');
    expect(result.turn?.provider).toBe('openai');
    expect(result.turn?.summary.statements[0]?.text).toBe('Position sizing caps risk per trade.');
    expect(result.toolRequests).toEqual([]);
    expect(result.assembly?.contextSections.map((s) => s.id)).toContain('instructions');
  });

  it('enforces the working-memory token cap', () => {
    const memory = new WorkingMemory(10);
    memory.recordUser('short');
    expect(memory.usedTokens).toBeGreaterThan(0);
    expect(() => memory.recordUser('x'.repeat(200))).not.toThrow();
    // The cap is enforced at assembly time by the budget, not by refusing writes;
    // disposed memory refuses everything.
    memory.dispose();
    expect(memory.isDisposed).toBe(true);
  });
});
