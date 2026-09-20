import { describe, expect, it, vi } from 'vitest';
import {
  openAiCompatibleProvider,
  type FetchLike,
  type OpenAiCompatibleOptions,
} from '../src/llm/providers/index.js';
import { LlmGateway, UsageTracker, type LlmGatewayConfig } from '../src/llm/provider.js';
import { assembleContext, section, type ContextSection } from '../src/agent/context.js';
import { buildTurnMessages, MAX_USER_INPUT_CHARS } from '../src/llm/prompt.js';
import {
  parseStructuredSummary,
  isToolOnlyTurn,
  OUTPUT_CONTRACT,
  type StructuredSummary,
} from '../src/llm/summary.js';
import { contextKindForTrust, toolProvenance } from '../packages/shared/src/core/provenance.js';
import { Orchestrator } from '../src/agent/orchestrator.js';
import { scriptedAsyncModelAdapter, createLlmModelAdapter } from '../src/agent/asyncModel.js';
import { AgentService } from '../src/agent/service.js';
import { InMemoryStore } from '../src/memory/store.js';
import { defaultToolRegistry } from '../packages/trading-engine/src/index.js';
import { loadInstructions, renderInstructions } from '../src/instructions/loader.js';
import { createAiGateway } from '../src/llm/registry.js';
import { DEFAULT_SAFETY_PROFILE } from '../packages/shared/src/types.js';
import { ToolRegistry, type Tool } from '../packages/trading-engine/src/framework.js';
import { AppError } from '../packages/shared/src/core/errors.js';

const instructions = renderInstructions(loadInstructions());

/** A fake OpenAI endpoint whose answer is `content`. */
function endpoint(content: string, options: { status?: number; body?: unknown } = {}) {
  const calls: { body: Record<string, unknown> }[] = [];
  const fetchImpl: FetchLike = async (_url, init) => {
    calls.push({ body: JSON.parse(String(init.body)) as Record<string, unknown> });
    if (options.body !== undefined) {
      return new Response(JSON.stringify(options.body), { status: options.status ?? 200 });
    }
    return new Response(
      JSON.stringify({
        model: 'gpt-4o-mini-2024-07-18',
        choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1_000, completion_tokens: 100, total_tokens: 1_100 },
      }),
      { status: options.status ?? 200, headers: { 'content-type': 'application/json' } },
    );
  };
  return { fetchImpl, calls };
}

/** A fake OpenAI endpoint using native provider tool calls rather than JSON. */
function toolCallEndpoint(name: string, args: Record<string, unknown>) {
  const fetchImpl: FetchLike = async () =>
    new Response(
      JSON.stringify({
        model: 'gpt-4o-mini-2024-07-18',
        choices: [
          {
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: { name, arguments: JSON.stringify(args) },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 800, completion_tokens: 40, total_tokens: 840 },
      }),
      { status: 200 },
    );
  return fetchImpl;
}

const gatewayConfig = (overrides: Partial<LlmGatewayConfig> = {}): LlmGatewayConfig => ({
  primary: { provider: 'openai', model: 'gpt-4o-mini', maxTokensPerRequest: 1_200 },
  fallbacks: [],
  requestTimeoutMs: 1_000,
  maxRetries: 0,
  retry: { attempts: 1, baseDelayMs: 1, maxDelayMs: 2, jitter: false },
  monthlyBudgetUsd: 25,
  ...overrides,
});

function gatewayWith(fetchImpl: FetchLike, config = gatewayConfig(), tracker?: UsageTracker) {
  const providerOptions: OpenAiCompatibleOptions = {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-test',
    models: ['gpt-4o-mini'],
    fetchImpl,
  };
  return new LlmGateway({
    providers: [openAiCompatibleProvider(providerOptions)],
    config,
    ...(tracker ? { tracker } : {}),
  });
}

const sizingSummary: StructuredSummary = {
  headline: 'Sizing is a deterministic calculation.',
  statements: [
    {
      kind: 'analysis',
      text: 'I am requesting the deterministic sizing tool rather than doing the arithmetic myself.',
      sources: ['risk.positionSize'],
    },
  ],
  uncertainty: ['The answer depends on the entry and stop you supplied.'],
  toolRequests: [
    {
      toolName: 'risk.positionSize',
      arguments: { accountEquity: 25_000, riskPerTrade: 0.01, entry: 100, stop: 95 },
      purpose: 'Compute the position size for a 1% risk budget.',
    },
  ],
};

function orchestratorFor(
  fetchImpl: FetchLike,
  options: { tracker?: UsageTracker; registry?: ToolRegistry } = {},
): Orchestrator {
  const gateway = gatewayWith(fetchImpl, gatewayConfig(), options.tracker);
  return new Orchestrator({
    tools: options.registry ?? defaultToolRegistry(),
    instructions: loadInstructions(),
    memory: new InMemoryStore(),
    safety: DEFAULT_SAFETY_PROFILE,
    // Sync path unused in these tests; the async adapter is what answers.
    model: { respond: () => [] },
    asyncModel: createLlmModelAdapter({ gateway }),
  });
}

function backtestTool(spy: () => void): Tool<unknown, unknown> {
  return {
    descriptor: {
      name: 'backtest.runner',
      category: 'backtesting',
      capabilities: ['backtest.run'],
      semantics: { epistemicKind: 'analysis', hasSideEffects: false },
      description: 'Runs a backtest (not permitted for the model).',
      version: '0.0.0',
    },
    run: () => {
      spy();
      return 'ran';
    },
  };
}

describe('one agent turn end to end', () => {
  it('runs the deterministic tool the model asked for, and records provenance', async () => {
    const endpointStub = endpoint(JSON.stringify(sizingSummary));
    const memory = new InMemoryStore();
    const gateway = gatewayWith(endpointStub.fetchImpl);
    const orchestrator = new Orchestrator({
      tools: defaultToolRegistry(),
      instructions: loadInstructions(),
      memory,
      safety: DEFAULT_SAFETY_PROFILE,
      model: { respond: () => [] },
      asyncModel: createLlmModelAdapter({ gateway }),
    });

    const outcome = await orchestrator.runAsync('How many units for a 1% risk budget?', {
      correlationId: 'turn-1',
    });
    expect(outcome.status).toBe('completed');
    if (outcome.status !== 'completed') return;

    expect(outcome.provider).toBe('openai');
    expect(outcome.statements).toHaveLength(1);
    expect(outcome.summary.uncertainty).toHaveLength(1);

    // The tool really ran, with the arguments the model supplied.
    expect(outcome.toolExecutions).toHaveLength(1);
    const execution = outcome.toolExecutions[0];
    expect(execution?.tool).toBe('risk.positionSize');
    expect(execution?.ok).toBe(true);
    if (execution?.ok) {
      expect(execution.value).toMatchObject({ riskAmount: 250, stopDistance: 5, positionSize: 50 });
    }

    // Provenance is recorded for the tool, in the audit store.
    expect(memory.all().some((entry) => entry.origin.type === 'tool')).toBe(true);

    // Cost is ours: 1000 input @ $0.15/1M + 100 output @ $0.60/1M.
    expect(outcome.usage.costUsd).toBeCloseTo(0.00021, 8);
    expect(gateway.tracker.totals().costUsd).toBeCloseTo(0.00021, 8);

    // The prompt carried the instructions, the operating rules and the contract.
    const body = endpointStub.calls[0]?.body;
    const messages = body?.messages as { role: string; content: string }[];
    expect(messages[0]?.role).toBe('system');
    expect(messages[0]?.content).toContain('Master Trade');
    expect(messages[0]?.content).toContain(OUTPUT_CONTRACT);
    expect(messages[1]?.content).toContain('QUESTION:');
    // No tool handle is ever handed to the provider.
    expect(JSON.stringify(body)).not.toMatch(/"tools"|"tool_choice"/);
  });

  it('answers a tool-only turn without inventing a result', async () => {
    const orchestrator = orchestratorFor(
      toolCallEndpoint('risk.positionSize', {
        accountEquity: 25_000,
        riskPerTrade: 0.01,
        entry: 100,
        stop: 95,
      }),
    );
    const outcome = await orchestrator.runAsync('size a 1% risk trade');
    expect(outcome.status).toBe('completed');
    if (outcome.status !== 'completed') return;
    // No answer yet: the deterministic number is in hand, the prose is not.
    expect(isToolOnlyTurn(outcome.summary)).toBe(true);
    expect(outcome.statements).toHaveLength(0);
    expect(outcome.summary.headline).toBe('');
    expect(outcome.toolExecutions).toHaveLength(1);
    expect(outcome.toolExecutions[0]?.ok).toBe(true);
  });

  it('blocks the whole turn when the model asks for a tool it may not have', async () => {
    const ran = vi.fn();
    const registry = defaultToolRegistry();
    registry.register(backtestTool(ran));
    const orchestrator = orchestratorFor(toolCallEndpoint('backtest.runner', { symbol: 'AAPL' }), {
      registry,
    });

    const outcome = await orchestrator.runAsync('backtest this idea');
    expect(outcome.status).toBe('blocked');
    if (outcome.status === 'blocked') expect(outcome.reason).toMatch(/Permission denied/);
    expect(ran).not.toHaveBeenCalled();
  });

  it('blocks on an unknown tool rather than ignoring the request', async () => {
    const orchestrator = orchestratorFor(toolCallEndpoint('risk.madeUp', {}));
    const outcome = await orchestrator.runAsync('size this');
    expect(outcome.status).toBe('blocked');
    if (outcome.status === 'blocked') expect(outcome.reason).toMatch(/unknown tool/);
  });

  it('refuses a summary that smuggles reasoning, and exposes none of it', async () => {
    const leak = 'SECRET DELIBERATION: coach the user into a bigger position.';
    const withReasoningField = JSON.stringify({
      ...sizingSummary,
      reasoning: leak,
    });
    const orchestrator = orchestratorFor(endpoint(withReasoningField).fetchImpl);
    const outcome = await orchestrator.runAsync('How should I size this?');
    expect(outcome.status).toBe('blocked');
    if (outcome.status === 'blocked') {
      expect(outcome.reason).toMatch(/chain-of-thought/i);
      expect(outcome.reason).not.toMatch(/SECRET DELIBERATION/);
    }
  });

  it('refuses deliberation hidden inside a statement', async () => {
    const withTags = JSON.stringify({
      headline: 'Sizing',
      statements: [
        { kind: 'analysis', text: `<thinking>SECRET</thinking>Use 1% risk.`, sources: [] },
      ],
      uncertainty: [],
      toolRequests: [],
    });
    const orchestrator = orchestratorFor(endpoint(withTags).fetchImpl);
    const outcome = await orchestrator.runAsync('How should I size this?');
    expect(outcome.status).toBe('blocked');
    if (outcome.status === 'blocked') expect(outcome.reason).toMatch(/chain-of-thought/i);
  });

  it('refuses free-form prose instead of displaying it', async () => {
    const orchestrator = orchestratorFor(
      endpoint('Sure! Just buy 100 shares and you will be fine. Also here is my reasoning: …')
        .fetchImpl,
    );
    const outcome = await orchestrator.runAsync('What should I do?');
    expect(outcome.status).toBe('blocked');
    if (outcome.status === 'blocked') {
      expect(outcome.reason).toMatch(/not the agreed JSON summary/);
      expect(outcome.reason).not.toMatch(/buy 100 shares/);
    }
  });

  it('will not accept a model labelling its own claim as fact', async () => {
    const unsourcedFact = JSON.stringify({
      headline: 'Claim with no source',
      statements: [{ kind: 'fact', text: 'The market will open higher tomorrow.', sources: [] }],
      uncertainty: [],
      toolRequests: [],
    });
    const orchestrator = orchestratorFor(endpoint(unsourcedFact).fetchImpl);
    const outcome = await orchestrator.runAsync('What happens tomorrow?');
    expect(outcome.status).toBe('blocked');
    if (outcome.status === 'blocked') expect(outcome.reason).toMatch(/without a source/);
  });

  it('surfaces a spent budget as a blocked turn, with no tool run', async () => {
    const tracker = new UsageTracker();
    tracker.record({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costUsd: 500,
      priced: true,
      estimated: false,
    });
    const orchestrator = orchestratorFor(
      toolCallEndpoint('risk.positionSize', {
        accountEquity: 1,
        riskPerTrade: 0.01,
        entry: 1,
        stop: 1,
      }),
      { tracker },
    );
    const outcome = await orchestrator.runAsync('size this');
    expect(outcome.status).toBe('blocked');
    if (outcome.status === 'blocked') expect(outcome.reason).toMatch(/budget exhausted/i);
  });

  it('falls back to a second provider inside a real turn', async () => {
    const broken: FetchLike = async () =>
      new Response('{"error":{"message":"boom"}}', { status: 500 });
    const healthy = endpoint(JSON.stringify(sizingSummary));
    let calls = 0;
    const split: FetchLike = async (url, init) => {
      calls += 1;
      return calls === 1 ? broken(url, init) : healthy.fetchImpl(url, init);
    };

    const gateway = new LlmGateway({
      providers: [
        openAiCompatibleProvider({
          baseUrl: 'https://api.openai.com/v1',
          apiKey: 'sk-test',
          models: ['gpt-4o-mini'],
          fetchImpl: split,
        }),
        openAiCompatibleProvider({
          id: 'local-openai-compatible',
          baseUrl: 'http://127.0.0.1:11434/v1',
          apiKey: null,
          models: ['local-model'],
          fetchImpl: split,
        }),
      ],
      config: gatewayConfig({
        fallbacks: [
          { provider: 'local-openai-compatible', model: 'local-model', maxTokensPerRequest: 1_200 },
        ],
      }),
    });

    const orchestrator = new Orchestrator({
      tools: defaultToolRegistry(),
      instructions: loadInstructions(),
      memory: new InMemoryStore(),
      safety: DEFAULT_SAFETY_PROFILE,
      model: { respond: () => [] },
      asyncModel: createLlmModelAdapter({ gateway }),
    });
    const outcome = await orchestrator.runAsync('size this');
    expect(outcome.status).toBe('completed');
    if (outcome.status !== 'completed') return;
    expect(outcome.provider).toBe('local-openai-compatible');
    expect(outcome.usage.costUsd).toBe(0); // self-hosted: priced, at zero
    expect(calls).toBe(2);
  });

  it('answers offline through the gateway, in the summary contract', async () => {
    // The offline default is a real path: same parser, same permission check, same
    // cost accounting. Running with no key may cost answer quality, never a
    // guarantee — so a keyless turn must not be a blocked turn.
    const registration = createAiGateway({
      primary: { provider: 'scripted', model: 'scripted-v1', maxTokensPerRequest: 2_048 },
      fallbacks: [],
      requestTimeoutMs: 1_000,
      maxRetries: 0,
      retry: { attempts: 1, baseDelayMs: 1, maxDelayMs: 2, jitter: false },
      monthlyBudgetUsd: 25,
    });
    const memory = new InMemoryStore();
    const orchestrator = new Orchestrator({
      tools: defaultToolRegistry(),
      instructions: loadInstructions(),
      memory,
      safety: DEFAULT_SAFETY_PROFILE,
      model: { respond: () => [] },
      asyncModel: createLlmModelAdapter({ gateway: registration.gateway }),
    });

    const outcome = await orchestrator.runAsync('What is my position size at 1% risk?');
    expect(outcome.status).toBe('completed');
    if (outcome.status !== 'completed') return;
    expect(outcome.provider).toBe('scripted');
    expect(outcome.summary.uncertainty.length).toBeGreaterThan(0);
    expect(outcome.usage.costUsd).toBe(0);
    expect(outcome.toolExecutions[0]?.tool).toBe('risk.positionSize');
    expect(memory.all().some((entry) => entry.origin.type === 'tool')).toBe(true);

    const executionQuestion = await orchestrator.runAsync('Buy 100 shares of AAPL.');
    expect(executionQuestion.status).toBe('completed');
    if (executionQuestion.status !== 'completed') return;
    expect(executionQuestion.statements[0]?.text).toMatch(/disabled by design/);
    expect(executionQuestion.toolExecutions).toEqual([]);
  });

  it('blocks a turn honestly when no async model is registered', async () => {
    const orchestrator = new Orchestrator({
      tools: defaultToolRegistry(),
      instructions: loadInstructions(),
      memory: new InMemoryStore(),
      safety: DEFAULT_SAFETY_PROFILE,
      model: { respond: () => [] },
    });
    const outcome = await orchestrator.runAsync('hello');
    expect(outcome.status).toBe('blocked');
  });
});

describe('context assembly into a prompt', () => {
  const memorySection = (): ContextSection =>
    section({
      id: 'memory:1',
      source: 'memory',
      priority: 50,
      content: 'A ten-trade sample cannot distinguish skill from noise.',
      trust: 'unverified',
      provenance: toolProvenance('academy.rubric.sample-size'),
    });

  it('labels every section with its trust level and provenance', () => {
    const assembled = assembleContext([
      section({ id: 'instructions', source: 'instructions', priority: 100, content: instructions }),
      memorySection(),
      section({
        id: 'conversation',
        source: 'conversation',
        priority: 10,
        content: 'Earlier: you asked about stops.',
      }),
    ]);
    const messages = buildTurnMessages({
      instructions,
      sections: assembled.sections,
      userInput: 'Is my sample big enough?',
    });
    const user = messages[1]?.content ?? '';
    expect(user).toContain('[UNCERTAINTY]');
    expect(user).toContain('trust=unverified');
    expect(user).toContain('provenance=tool:academy.rubric.sample-size');
    expect(user).toContain('QUESTION:');
    expect(contextKindForTrust('unverified')).toBe('uncertainty');
  });

  it('refuses a prompt whose context dropped the instruction set', () => {
    expect(() =>
      buildTurnMessages({
        instructions,
        sections: [memorySection()],
        userInput: 'question',
      }),
    ).toThrow(/omits the instruction section/);
  });

  it('refuses an empty instruction set and an oversized user message', () => {
    const sections = [
      section({ id: 'instructions', source: 'instructions', priority: 100, content: instructions }),
    ];
    expect(() =>
      buildTurnMessages({ instructions: '   ', sections, userInput: 'question' }),
    ).toThrow(/no instruction set/);
    expect(() =>
      buildTurnMessages({
        instructions,
        sections,
        userInput: 'x'.repeat(MAX_USER_INPUT_CHARS + 1),
      }),
    ).toThrow(/exceeds/);
  });

  it('keeps the safety instructions when the budget is tight', () => {
    const assembled = assembleContext([
      section({ id: 'instructions', source: 'instructions', priority: 100, content: instructions }),
      section({
        id: 'memory:huge',
        source: 'memory',
        priority: 1,
        content: 'x'.repeat(100_000),
        trust: 'unverified',
        provenance: toolProvenance('bulk'),
      }),
    ]);
    expect(assembled.dropped).toContain('memory:huge');
    expect(assembled.sections.some((item) => item.source === 'instructions')).toBe(true);
    expect(() =>
      buildTurnMessages({ instructions, sections: assembled.sections, userInput: 'ok' }),
    ).not.toThrow();
  });
});

describe('agent service async path', () => {
  it('returns a view the API can serve, with cost and tool outcomes', async () => {
    const service = new AgentService({
      asyncModel: createLlmModelAdapter({
        gateway: gatewayWith(endpoint(JSON.stringify(sizingSummary)).fetchImpl),
      }),
    });
    const turn = await service.runAsync('How many units for a 1% risk budget?', {
      correlationId: 'turn-9',
    });
    expect(turn.status).toBe('completed');
    expect(turn.provider).toBe('openai');
    expect(turn.model).toBe('gpt-4o-mini-2024-07-18');
    expect(turn.epistemicKind).toBe('analysis');
    expect(turn.reply).toContain('deterministic sizing tool');
    expect(turn.toolExecutions).toHaveLength(1);
    expect(turn.usage?.costUsd).toBeCloseTo(0.00021, 8);
    expect(turn.agentState).toBe('IDLE');
    expect(turn.summary?.uncertainty).toHaveLength(1);
  });

  it('reports a blocked turn without a summary or a cost', async () => {
    const service = new AgentService({
      asyncModel: scriptedAsyncModelAdapter({
        failWith: new AppError('PROVIDER_UNAVAILABLE', 'down'),
      }),
    });
    const turn = await service.runAsync('anything');
    expect(turn.status).toBe('blocked');
    expect(turn.summary).toBeNull();
    expect(turn.usage).toBeNull();
    expect(turn.toolExecutions).toEqual([]);
    expect(turn.reason).toMatch(/down/);
  });

  it('refuses an execution request offline, with no tool run', async () => {
    const service = new AgentService({ asyncModel: scriptedAsyncModelAdapter() });
    const turn = await service.runAsync('Buy 100 shares of AAPL and place an order');
    expect(turn.status).toBe('completed');
    expect(turn.reply).toMatch(/disabled by design/);
    expect(turn.toolExecutions).toEqual([]);
  });

  it('runs the deterministic sizing tool offline through the scripted adapter', async () => {
    const service = new AgentService({ asyncModel: scriptedAsyncModelAdapter() });
    const turn = await service.runAsync('What is my position size at 1% risk?');
    expect(turn.status).toBe('completed');
    expect(turn.toolExecutions).toHaveLength(1);
    expect(turn.toolExecutions[0]?.ok).toBe(true);
    expect(turn.usage?.costUsd).toBe(0);
  });
});

describe('summary contract', () => {
  it('accepts a well-formed answer and keeps every field', () => {
    const summary = parseStructuredSummary(JSON.stringify(sizingSummary));
    expect(summary.headline).toBe(sizingSummary.headline);
    expect(summary.toolRequests[0]?.purpose).toContain('position size');
  });

  it('tolerates a fenced JSON answer but not extra fields', () => {
    const fenced = `\`\`\`json\n${JSON.stringify(sizingSummary)}\n\`\`\``;
    expect(parseStructuredSummary(fenced).headline).toBe(sizingSummary.headline);
    expect(() =>
      parseStructuredSummary(JSON.stringify({ ...sizingSummary, notes: 'extra' })),
    ).toThrow(/unknown field/);
  });

  it('names the reasoning fields it rejects', () => {
    for (const key of ['reasoning', 'chain_of_thought', 'scratchpad', 'thinking']) {
      const bad = JSON.stringify({ ...sizingSummary, [key]: 'private' });
      expect(() => parseStructuredSummary(bad), key).toThrow(/chain-of-thought/);
    }
  });
});
