import { describe, expect, it } from 'vitest';
import {
  AgentContextBuilder,
  CONTEXT_LAYERS,
  DEFAULT_CONTEXT_BUILDER_BUDGET,
  contentDigest,
  type ContextAssemblyRequest,
} from '../src/agent/contextBuilder.js';
import { section, type ContextSection } from '../src/agent/context.js';
import { buildTurnMessages } from '../src/llm/prompt.js';
import { AgentRunHarness } from '../src/agent/harness.js';
import { scriptedAsyncModelAdapter, type ModelTurnRequest } from '../src/agent/asyncModel.js';
import { toolProvenance } from '../packages/shared/src/core/provenance.js';

const INSTRUCTIONS = 'system instructions for the run';

function request(overrides: Partial<ContextAssemblyRequest> = {}): ContextAssemblyRequest {
  return {
    correlationId: 'corr-ctx',
    instructions: INSTRUCTIONS,
    userInput: 'what is position sizing?',
    ...overrides,
  };
}

function memorySection(id: string, content: string, priority = 60): ContextSection {
  return {
    ...section({
      id,
      source: 'memory',
      priority,
      content,
      trust: 'verified',
      provenance: toolProvenance('academy.test'),
    }),
    label: 'fact',
  };
}

describe('context builder layers', () => {
  it('separates the five layers and accounts each one', () => {
    const assembly = new AgentContextBuilder().assemble(
      request({
        agentPolicies: 'no trading, ever.',
        conversationHistory: [
          { role: 'user', content: 'earlier question' },
          { role: 'assistant', content: 'earlier answer' },
        ],
        runtimeContext: [
          memorySection('market:spot', 'BTC 60k'),
          section({ id: 'market:news', source: 'market-data', priority: 65, content: 'flat day' }),
        ],
      }),
    );

    // The five layers, closed and in priority order.
    expect(CONTEXT_LAYERS).toEqual([
      'system-instructions',
      'agent-policies',
      'runtime',
      'conversation',
      'user-input',
    ]);

    // Layer 1 and 2 are carried as their own fields, not as context blocks.
    expect(assembly.agentPolicies).toBe('no trading, ever.');
    expect(assembly.userInput).toBe('what is position sizing?');
    // Layer 3 + 4 + the instructions marker are the prompt-path sections.
    expect(assembly.sections.map((s) => s.id)).toEqual([
      'instructions',
      'chat-history',
      'market:news',
      'market:spot',
    ]);
    // Every layer is accounted, in tokens.
    expect(Object.keys(assembly.layerTokens).sort()).toEqual([...CONTEXT_LAYERS].sort());
    expect(assembly.layerTokens['system-instructions']).toBeGreaterThan(0);
    expect(assembly.layerTokens['agent-policies']).toBeGreaterThan(0);
    expect(assembly.layerTokens.runtime).toBeGreaterThan(0);
    expect(assembly.layerTokens.conversation).toBeGreaterThan(0);
    expect(assembly.layerTokens['user-input']).toBeGreaterThan(0);
    expect(assembly.totalTokens).toBe(
      Object.values(assembly.layerTokens).reduce((sum, n) => sum + n, 0),
    );
  });

  it('sends the instruction set once: in the system layer, never as context', () => {
    const assembly = new AgentContextBuilder().assemble(
      request({
        conversationHistory: [{ role: 'user', content: 'earlier question' }],
        runtimeContext: [memorySection('memory:1', 'some retrieved fact')],
      }),
    );
    const messages = buildTurnMessages({
      instructions: INSTRUCTIONS,
      sections: assembly.sections,
      userInput: assembly.userInput,
    });

    const system = messages[0]?.content ?? '';
    const user = messages[1]?.content ?? '';
    expect(system).toContain(INSTRUCTIONS);
    // The duplication this builder exists to end: the safety text used to be
    // rendered a second time as a context block in the user message.
    expect(user).not.toContain(INSTRUCTIONS);
    expect(user).toContain('some retrieved fact');
    expect(user).toContain('earlier question');
  });

  it('keeps the current question out of the conversation layer', () => {
    const assembly = new AgentContextBuilder().assemble(
      request({
        conversationHistory: [
          { role: 'user', content: 'earlier question' },
          { role: 'assistant', content: 'earlier answer' },
        ],
      }),
    );
    const history = assembly.sections.find((s) => s.id === 'chat-history');
    expect(history).toBeDefined();
    expect(history?.content).toContain('earlier question');
    expect(history?.content).toContain('earlier answer');
    // The question travels once, in the user-input layer — not again at the
    // end of the chat history it was also recorded in.
    expect(history?.content).not.toContain('what is position sizing?');
  });
});

describe('context builder deduplication', () => {
  it('drops a repeated runtime section as a duplicate of the first', () => {
    const assembly = new AgentContextBuilder().assemble(
      request({
        runtimeContext: [
          memorySection('memory:first', 'identical material', 70),
          memorySection('memory:second', 'identical material', 50),
          memorySection('memory:other', 'different material', 40),
        ],
      }),
    );
    const ids = assembly.sections.map((s) => s.id);
    expect(ids).toContain('memory:first');
    expect(ids).toContain('memory:other');
    expect(ids).not.toContain('memory:second');
    expect(assembly.dropped).toEqual([
      { id: 'memory:second', layer: 'runtime', reason: 'duplicate of memory:first' },
    ]);
  });

  it('drops a context block that copies the system layer', () => {
    const assembly = new AgentContextBuilder().assemble(
      request({
        runtimeContext: [
          memorySection('memory:echo', INSTRUCTIONS, 90),
          memorySection('memory:real', 'real material', 10),
        ],
      }),
    );
    expect(assembly.sections.map((s) => s.id)).not.toContain('memory:echo');
    expect(assembly.dropped).toEqual([
      { id: 'memory:echo', layer: 'runtime', reason: 'duplicate of the system layer' },
    ]);
  });

  it('drops sections a running loop already delivered, by digest', () => {
    const builder = new AgentContextBuilder();
    const first = builder.assemble(
      request({ runtimeContext: [memorySection('memory:tool', 'tool output block')] }),
    );
    expect(first.dropped).toEqual([]);

    const digest = contentDigest('tool output block');
    const second = builder.assemble(
      request({
        runtimeContext: [
          memorySection('memory:tool', 'tool output block'),
          memorySection('memory:new', 'fresh material'),
        ],
        alreadyDeliveredDigests: [digest],
      }),
    );
    expect(second.sections.map((s) => s.id)).not.toContain('memory:tool');
    expect(second.sections.map((s) => s.id)).toContain('memory:new');
    expect(second.dropped).toEqual([
      { id: 'memory:tool', layer: 'runtime', reason: 'already delivered earlier in this loop' },
    ]);
  });

  it('produces a stable digest for reformatted but identical text', () => {
    expect(contentDigest('same  text\nhere')).toBe(contentDigest('same text here'));
    expect(contentDigest('same text here')).not.toBe(contentDigest('different text'));
  });
});

describe('context builder budgets', () => {
  it('drops conversation before runtime, and the oldest turns first', () => {
    const builder = new AgentContextBuilder({
      maxContextTokens: 900,
      reserveForResponse: 100,
      maxConversationTokens: 12,
    });
    const assembly = builder.assemble(
      request({
        conversationHistory: [
          { role: 'user', content: 'turn one, the oldest' },
          { role: 'assistant', content: 'turn two' },
          { role: 'user', content: 'turn three, the newest before the question' },
        ],
        runtimeContext: [memorySection('memory:now', 'the relevant runtime material', 70)],
      }),
    );

    // The runtime layer outranks the conversation layer, so it is intact.
    expect(assembly.sections.map((s) => s.id)).toContain('memory:now');
    // The conversation layer fit what it could, dropping the oldest turns as a
    // contiguous prefix — the exchange the user is still inside of survives.
    const history = assembly.sections.find((s) => s.id === 'chat-history');
    expect(history?.content).toContain('turn three');
    expect(history?.content).not.toContain('turn one');
    expect(history?.content).not.toContain('turn two');
    expect(assembly.dropped).toEqual([
      {
        id: 'conversation:turn-1',
        layer: 'conversation',
        reason: 'conversation budget exhausted; oldest turns dropped first',
      },
      {
        id: 'conversation:turn-2',
        layer: 'conversation',
        reason: 'conversation budget exhausted; oldest turns dropped first',
      },
    ]);
    expect(assembly.truncated).toBe(true);
    // Safety text and the question were never dropped.
    expect(assembly.sections.map((s) => s.id)).toContain('instructions');
    expect(assembly.userInput).toBe('what is position sizing?');
  });

  it('drops the lowest-priority runtime sections first under a tight runtime cap', () => {
    const builder = new AgentContextBuilder({
      maxContextTokens: 1_200,
      reserveForResponse: 100,
      maxRuntimeTokens: 12,
    });
    const assembly = builder.assemble(
      request({
        runtimeContext: [
          memorySection('memory:low', 'l'.repeat(120), 10),
          memorySection('memory:high', 'h'.repeat(30), 90),
        ],
      }),
    );
    expect(assembly.sections.map((s) => s.id)).toContain('memory:high');
    expect(assembly.sections.map((s) => s.id)).not.toContain('memory:low');
    expect(assembly.dropped).toEqual([
      { id: 'memory:low', layer: 'runtime', reason: 'runtime budget exhausted' },
    ]);
  });

  it('honors the configured budgets exactly', () => {
    const builder = new AgentContextBuilder({
      maxContextTokens: 2_000,
      reserveForResponse: 500,
      maxRuntimeTokens: 30,
    });
    const assembly = builder.assemble(
      request({
        runtimeContext: [memorySection('memory:big', 'x'.repeat(400), 80)],
      }),
    );
    const usable = 2_000 - 500;
    expect(assembly.totalTokens).toBeLessThanOrEqual(usable);
    expect(assembly.layerTokens.runtime).toBeLessThanOrEqual(30);
  });

  it('uses the documented defaults when no budget is supplied', () => {
    const builder = new AgentContextBuilder();
    const assembly = builder.assemble(request());
    expect(assembly.totalTokens).toBeLessThanOrEqual(
      DEFAULT_CONTEXT_BUILDER_BUDGET.maxContextTokens -
        DEFAULT_CONTEXT_BUILDER_BUDGET.reserveForResponse,
    );
  });
});

describe('context builder validation before the request', () => {
  it('refuses an empty instruction set and an empty or oversized question', () => {
    const builder = new AgentContextBuilder();
    expect(() => builder.assemble(request({ instructions: '   ' }))).toThrow(/no instruction set/);
    expect(() => builder.assemble(request({ userInput: '   ' }))).toThrow(/must not be empty/);
    expect(() => builder.assemble(request({ userInput: 'x'.repeat(8_001) }))).toThrow(
      /exceeds 8000 characters/,
    );
  });

  it('refuses memory sections without provenance', () => {
    const builder = new AgentContextBuilder();
    const unlabelled = section({
      id: 'memory:bare',
      source: 'memory',
      priority: 50,
      content: 'no provenance',
      trust: 'verified',
    });
    // `section()` only attaches provenance when given one.
    const bare = { ...unlabelled, provenance: undefined };
    expect(() => builder.assemble(request({ runtimeContext: [bare] }))).toThrow(
      /must carry provenance/,
    );
  });

  it('refuses an unusable budget and a budget too small for the safety text', () => {
    const builder = new AgentContextBuilder({ maxContextTokens: 100, reserveForResponse: 100 });
    expect(() => builder.assemble(request())).toThrow(/unusable/);

    const tiny = new AgentContextBuilder({ maxContextTokens: 120, reserveForResponse: 20 });
    expect(() => tiny.assemble(request())).toThrow(/never-dropped layers/);
  });

  it('always returns an assembly that fits the usable budget', () => {
    const builder = new AgentContextBuilder({
      maxContextTokens: 1_500,
      reserveForResponse: 300,
    });
    const assembly = builder.assemble(
      request({
        conversationHistory: Array.from({ length: 40 }, (_, i) => ({
          role: 'user' as const,
          content: `history turn ${i} ${'y'.repeat(80)}`,
        })),
        runtimeContext: Array.from({ length: 20 }, (_, i) =>
          memorySection(`memory:${i}`, 'z'.repeat(120), 50 + i),
        ),
      }),
    );
    expect(assembly.totalTokens).toBeLessThanOrEqual(1_500 - 300);
    expect(assembly.truncated).toBe(true);
  });

  it('is deterministic: the same request assembles the same context', () => {
    const builder = new AgentContextBuilder();
    const input = request({
      conversationHistory: [{ role: 'assistant', content: 'prior answer' }],
      runtimeContext: [memorySection('memory:1', 'material')],
    });
    const first = builder.assemble(input);
    const second = builder.assemble(input);
    expect(first.sections.map((s) => s.id)).toEqual(second.sections.map((s) => s.id));
    expect(first.totalTokens).toBe(second.totalTokens);
    expect(first.dropped).toEqual(second.dropped);
  });
});

describe('harness integration with the context builder', () => {
  it('runs every turn through the builder and hands the adapter its sections', async () => {
    const seen: ModelTurnRequest[] = [];
    const adapter = {
      label: 'capture',
      async completeTurn(req: ModelTurnRequest) {
        seen.push(req);
        return scriptedAsyncModelAdapter().completeTurn(req);
      },
    };
    const harness = new AgentRunHarness({ adapter });
    const result = await harness.run({
      correlationId: 'corr-harness',
      userInput: 'current question',
      instructions: INSTRUCTIONS,
      history: [
        { role: 'user', content: 'prior question' },
        { role: 'assistant', content: 'prior answer' },
      ],
      runtimeContext: [
        section({ id: 'market:spot', source: 'market-data', priority: 60, content: 'BTC 60k' }),
      ],
    });

    expect(result.status).toBe('completed');
    const assembly = result.assembly!;
    expect(assembly.systemInstructions).toBe(INSTRUCTIONS);
    expect(assembly.userPrompt).toBe('current question');
    expect(assembly.contextSections.map((s) => s.id)).toEqual([
      'instructions',
      'chat-history',
      'market:spot',
    ]);
    // The adapter receives exactly what the builder assembled.
    expect(seen[0]?.context.map((s) => s.id)).toEqual(assembly.contextSections.map((s) => s.id));
    // The conversation section carries the prior turns only; the current
    // question lives once, in the QUESTION block the prompt path renders.
    const history = assembly.contextSections.find((s) => s.id === 'chat-history');
    expect(history?.content).toContain('prior question');
    expect(history?.content).not.toContain('current question');
  });

  it('surfaces the builder drops in the run assembly under a tight budget', async () => {
    const adapter = {
      label: 'capture',
      async completeTurn(req: ModelTurnRequest) {
        return scriptedAsyncModelAdapter().completeTurn(req);
      },
    };
    const harness = new AgentRunHarness({ adapter });
    const result = await harness.run({
      correlationId: 'corr-tight',
      userInput: 'question',
      instructions: INSTRUCTIONS,
      budget: { maxTokens: 900, reserveForResponse: 100, maxConversationTokens: 20 },
      history: [
        { role: 'user', content: 'old turn '.repeat(12) },
        { role: 'assistant', content: 'kept answer' },
      ],
    });

    expect(result.status).toBe('completed');
    expect(result.assembly?.dropped).toContain('conversation:turn-1');
    const history = result.assembly?.contextSections.find((s) => s.id === 'chat-history');
    expect(history?.content).toContain('kept answer');
    expect(history?.content).not.toContain('old turn');
  });

  it('fails the run when the budget cannot fit the safety text', async () => {
    const harness = new AgentRunHarness({ adapter: scriptedAsyncModelAdapter() });
    const result = await harness.run({
      correlationId: 'corr-impossible',
      userInput: 'question',
      instructions: INSTRUCTIONS,
      budget: { maxTokens: 120, reserveForResponse: 20 },
    });
    expect(result.status).toBe('failed');
    expect(result.failure?.phase).toBe('assembling');
    expect(result.failure?.message).toMatch(/never-dropped layers/);
    // The failure path still terminates and disposes the ephemeral memory.
    expect(result.timeline.at(-1)?.state).toBe('failed');
  });
});
