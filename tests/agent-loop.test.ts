/**
 * Agent Loop Engine tests.
 *
 * The loop composes the existing harness per iteration and owns the control:
 * the four phases (reasoning → context update → next-step decision →
 * completion), the three configurable limits, cooperative cancellation and
 * identical-step protection. Every claim the module makes in prose is pinned
 * here as behaviour.
 */

import { describe, expect, it } from 'vitest';
import {
  AgentLoopEngine,
  AgentLoopLifecycle,
  DEFAULT_AGENT_LOOP_LIMITS,
  defaultLoopDecider,
  type AgentLoopDecider,
} from '../src/agent/agentLoop.js';
import { scriptedAsyncModelAdapter, type ModelTurnRequest } from '../src/agent/asyncModel.js';
import type { ScriptedAsyncModelOptions } from '../src/agent/asyncModel.js';
import type { AgentRunInput } from '../src/agent/harness.js';
import { section, type ContextSection } from '../src/agent/context.js';
import { AppError } from '../packages/shared/src/core/errors.js';
import type { StructuredSummary } from '../src/llm/summary.js';

const instructions = 'system instructions for the loop';

function input(overrides: Partial<AgentRunInput> = {}): AgentRunInput {
  return {
    correlationId: 'corr-loop',
    userInput: 'what is a stop order?',
    instructions,
    ...overrides,
  };
}

/** A capture wrapper over the scripted adapter: same answers, counted calls. */
function countingAdapter(options: ScriptedAsyncModelOptions = {}) {
  const scripted = scriptedAsyncModelAdapter(options);
  const requests: ModelTurnRequest[] = [];
  return {
    requests,
    adapter: {
      label: 'counting (offline, deterministic)',
      async completeTurn(request: ModelTurnRequest) {
        requests.push(request);
        return scripted.completeTurn(request);
      },
    },
  };
}

/** A decider that keeps the loop open and supplies fresh runtime material
 * per step — exactly the seam a future tool-calling or retrieval phase will
 * use to continue the loop with new context. */
function continuingDecider(runtime: ContextSection[]): AgentLoopDecider {
  return ({ iteration }) => {
    runtime.push(
      section({
        id: `fresh:${iteration}`,
        source: 'market-data',
        priority: 50,
        content: `fresh material ${iteration}`,
      }),
    );
    return { complete: false, rationale: 'not yet' };
  };
}

describe('agent loop engine — the four phases', () => {
  it('completes in a single step when the summary requests no further work', async () => {
    const { adapter } = countingAdapter();
    const engine = new AgentLoopEngine({ adapter });
    const result = await engine.run(input());

    expect(result.status).toBe('completed');
    expect(result.stopReason).toEqual({ reason: 'completed' });
    expect(result.iterations).toBe(1);
    expect(result.decision).toEqual({
      complete: true,
      rationale: 'the summary requested no further work',
    });
    expect(result.statements.length).toBeGreaterThan(0);
    expect(result.summary).not.toBeNull();
    expect(result.toolRequests).toEqual([]);
    expect(result.runs[0]?.status).toBe('completed');
    expect(result.timeline.map((entry) => entry.state)).toEqual([
      'idle',
      'reasoning',
      'context-update',
      'deciding',
      'completed',
    ]);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('delivers the caller input and instructions through the harness unchanged, and records delivered digests', async () => {
    const { adapter, requests } = countingAdapter();
    const runtime = [
      section({ id: 'market:spot', source: 'market-data', priority: 60, content: 'BTC 60k' }),
    ];
    const engine = new AgentLoopEngine({ adapter });
    const result = await engine.run(input({ runtimeContext: runtime }));

    expect(requests).toHaveLength(1);
    expect(requests[0]?.userInput).toBe('what is a stop order?');
    expect(requests[0]?.instructions).toBe(instructions);
    // The instructions layer and the kept runtime section were both delivered.
    expect(result.deliveredDigests).toHaveLength(2);
    const sectionIds = result.runs[0]?.assembly?.contextSections.map((item) => item.id) ?? [];
    expect(sectionIds).toContain('instructions');
    expect(sectionIds).toContain('market:spot');
  });

  it('runs multiple steps until the decider completes, accumulating statements and usage', async () => {
    const runtime: ContextSection[] = [];
    const { adapter } = countingAdapter({ usage: { completionTokens: 10, totalTokens: 10 } });
    const decider: AgentLoopDecider = (decision) => {
      if (decision.iteration >= 3) return { complete: true, rationale: 'done at the third step' };
      return continuingDecider(runtime)(decision);
    };
    const engine = new AgentLoopEngine({ adapter, decide: decider });
    const result = await engine.run(input({ runtimeContext: runtime }));

    expect(result.status).toBe('completed');
    expect(result.iterations).toBe(3);
    expect(result.decision).toEqual({ complete: true, rationale: 'done at the third step' });
    expect(result.usage.completionTokens).toBe(30);
    expect(result.usage.totalTokens).toBe(30);
    // One statement set per step, accumulated oldest first.
    const perStep = result.summary?.statements.length ?? 0;
    expect(perStep).toBeGreaterThan(0);
    expect(result.statements.length).toBe(3 * perStep);
  });

  it('stops at the iteration limit with a blocked status and the counts', async () => {
    const runtime: ContextSection[] = [];
    const { adapter, requests } = countingAdapter();
    const engine = new AgentLoopEngine({
      adapter,
      limits: { maxIterations: 3 },
      decide: continuingDecider(runtime),
    });
    const result = await engine.run(input({ runtimeContext: runtime }));

    expect(result.status).toBe('blocked');
    expect(result.stopReason).toEqual({
      reason: 'iteration-limit',
      iterationsRun: 3,
      maxIterations: 3,
    });
    expect(result.iterations).toBe(3);
    expect(requests).toHaveLength(3);
    expect(result.timeline.map((entry) => entry.state)).toEqual([
      'idle',
      'reasoning',
      'context-update',
      'deciding',
      'reasoning',
      'context-update',
      'deciding',
      'reasoning',
      'context-update',
      'deciding',
      'blocked',
    ]);
  });
});

describe('agent loop engine — guards and limits', () => {
  it('refuses an identical step instead of re-asking the same question', async () => {
    const { adapter, requests } = countingAdapter();
    const engine = new AgentLoopEngine({
      adapter,
      limits: { maxIterations: 5 },
      decide: () => ({ complete: false, rationale: 'not yet' }),
    });
    const result = await engine.run(input());

    // The second iteration would show the model exactly what the first
    // already saw, so the loop refuses it after two steps, not five.
    expect(result.status).toBe('blocked');
    expect(result.stopReason).toEqual({ reason: 'repeated-step', iteration: 2 });
    expect(result.iterations).toBe(1);
    expect(requests).toHaveLength(1);
    expect(result.timeline.map((entry) => entry.state)).toEqual([
      'idle',
      'reasoning',
      'context-update',
      'deciding',
      'blocked',
    ]);
  });

  it('stops when accumulated output tokens exhaust the budget', async () => {
    const runtime: ContextSection[] = [];
    const { adapter } = countingAdapter({ usage: { completionTokens: 100 } });
    const engine = new AgentLoopEngine({
      adapter,
      limits: { maxOutputTokens: 150 },
      decide: continuingDecider(runtime),
    });
    const result = await engine.run(input({ runtimeContext: runtime }));

    expect(result.status).toBe('blocked');
    expect(result.stopReason).toEqual({
      reason: 'output-token-limit',
      completionTokens: 200,
      maxOutputTokens: 150,
    });
    expect(result.iterations).toBe(2);
  });

  it('stops when the wall-clock ceiling is exceeded before the next paid step', async () => {
    const runtime: ContextSection[] = [];
    const { adapter } = countingAdapter({ delayMs: 30 });
    const engine = new AgentLoopEngine({
      adapter,
      limits: { maxExecutionTimeMs: 10 },
      decide: continuingDecider(runtime),
    });
    const result = await engine.run(input({ runtimeContext: runtime }));

    expect(result.status).toBe('blocked');
    expect(result.stopReason).toMatchObject({ reason: 'time-limit' });
    if (result.stopReason.reason === 'time-limit') {
      expect(result.stopReason.elapsedMs).toBeGreaterThanOrEqual(10);
      expect(result.stopReason.maxExecutionTimeMs).toBe(10);
    }
    expect(result.iterations).toBe(1);
  });

  it('ends cancelled when cancellation is observed before the first step', async () => {
    const { adapter } = countingAdapter();
    const engine = new AgentLoopEngine({ adapter, shouldCancel: () => true });
    const result = await engine.run(input());

    expect(result.status).toBe('cancelled');
    expect(result.stopReason).toEqual({ reason: 'cancelled' });
    expect(result.iterations).toBe(0);
    expect(result.timeline.map((entry) => entry.state)).toEqual(['idle', 'cancelled']);
  });

  it('ends cancelled between steps when cancellation is requested mid-loop', async () => {
    let cancelled = false;
    const { adapter } = countingAdapter();
    const engine = new AgentLoopEngine({
      adapter,
      shouldCancel: () => cancelled,
      decide: () => {
        cancelled = true;
        return { complete: false, rationale: 'one more' };
      },
      limits: { maxIterations: 5 },
    });
    const result = await engine.run(input());

    expect(result.status).toBe('cancelled');
    expect(result.stopReason).toEqual({ reason: 'cancelled' });
    expect(result.iterations).toBe(1);
    expect(result.timeline.map((entry) => entry.state)).toEqual([
      'idle',
      'reasoning',
      'context-update',
      'deciding',
      'cancelled',
    ]);
  });

  it('fails immediately when the reasoning step fails, with the failure message', async () => {
    const { adapter } = countingAdapter({ failWith: new Error('gateway down') });
    const engine = new AgentLoopEngine({ adapter });
    const result = await engine.run(input());

    expect(result.status).toBe('failed');
    expect(result.stopReason).toEqual({ reason: 'failed', message: 'gateway down' });
    expect(result.iterations).toBe(1);
    expect(result.runs[0]?.status).toBe('failed');
    expect(result.statements).toEqual([]);
    expect(result.summary).toBeNull();
  });

  it('records tool requests without executing them, and the guard refuses re-asking the identical question', async () => {
    const summary: StructuredSummary = {
      headline: 'Position sizing needs the risk tool',
      statements: [
        {
          kind: 'analysis',
          text: 'I will request the deterministic risk tool.',
          sources: ['risk.positionSize'],
        },
      ],
      uncertainty: [],
      toolRequests: [
        {
          toolName: 'risk.positionSize',
          arguments: { equity: 10_000 },
          purpose: 'size the position',
        },
      ],
    };
    const { adapter } = countingAdapter({ summary });
    const engine = new AgentLoopEngine({ adapter, limits: { maxIterations: 5 } });
    const result = await engine.run(input());

    // The default decider keeps the loop open on tool work; the
    // identical-step guard then stops it, because no tool phase exists to
    // supply new material. The request is recorded, never executed.
    expect(result.status).toBe('blocked');
    expect(result.stopReason).toEqual({ reason: 'repeated-step', iteration: 2 });
    expect(result.iterations).toBe(1);
    expect(result.toolRequests).toHaveLength(1);
    expect(result.toolRequests[0]?.toolName).toBe('risk.positionSize');
    expect(result.decision).toEqual({
      complete: false,
      rationale: 'the summary requested tool work that is still outstanding',
    });
    expect(
      defaultLoopDecider({
        summary,
        statements: [],
        toolRequests: summary.toolRequests,
        iteration: 1,
      }),
    ).toEqual({
      complete: false,
      rationale: 'the summary requested tool work that is still outstanding',
    });
  });

  it('validates its limits at construction and defaults the rest', () => {
    const { adapter } = countingAdapter();
    expect(() => new AgentLoopEngine({ adapter, limits: { maxIterations: 0 } })).toThrow(AppError);
    expect(() => new AgentLoopEngine({ adapter, limits: { maxIterations: 1.5 } })).toThrow(
      AppError,
    );
    expect(() => new AgentLoopEngine({ adapter, limits: { maxExecutionTimeMs: 0 } })).toThrow(
      AppError,
    );
    expect(() => new AgentLoopEngine({ adapter, limits: { maxOutputTokens: 0 } })).toThrow(
      AppError,
    );
    expect(() => new AgentLoopEngine({ adapter })).not.toThrow();
    expect(DEFAULT_AGENT_LOOP_LIMITS).toEqual({
      maxIterations: 5,
      maxExecutionTimeMs: 120_000,
      maxOutputTokens: 4_000,
    });
  });
});

describe('agent loop lifecycle', () => {
  it('walks the full happy path and ends terminal', () => {
    const lifecycle = new AgentLoopLifecycle();
    lifecycle.transitionTo('reasoning');
    lifecycle.transitionTo('context-update');
    lifecycle.transitionTo('deciding');
    lifecycle.transitionTo('completed');
    expect(lifecycle.transitions().map((entry) => entry.state)).toEqual([
      'idle',
      'reasoning',
      'context-update',
      'deciding',
      'completed',
    ]);
    expect(lifecycle.isTerminal()).toBe(true);
  });

  it('refuses an illegal transition loudly, leaving the state untouched', () => {
    const lifecycle = new AgentLoopLifecycle();
    expect(() => lifecycle.transitionTo('completed')).toThrow(
      /Illegal agent loop lifecycle transition/,
    );
    expect(lifecycle.current()).toBe('idle');
    expect(lifecycle.isTerminal()).toBe(false);
  });
});

// ── Tool calling through the centralized registry ──────────────────────────

import { z } from 'zod';
import { AgentToolRegistry } from '../src/agent/tools/registry.js';
import type { AgentTool } from '../src/agent/tools/contracts.js';
import { statementsFromSummary, toolRequestsFromSummary } from '../src/agent/asyncModel.js';

type RiskInput = { equity: number; riskPercent: number };
type RiskOutput = { shares: number; riskPercent: number };

function positionSizeTool(): AgentTool<RiskInput, RiskOutput> {
  return {
    name: 'risk.positionSize',
    version: '1.0.0',
    description: 'Deterministic position sizing from equity and a risk percent.',
    category: 'general',
    capabilities: ['risk.calculate'],
    riskLevel: 'low',
    timeoutMs: 1_000,
    requiresApproval: false,
    sideEffects: false,
    inputSchema: z.object({
      equity: z.number().positive(),
      riskPercent: z.number().min(0).max(100).default(1),
    }),
    outputSchema: z.object({ shares: z.number(), riskPercent: z.number() }),
    async execute(toolInput) {
      return {
        shares: Math.floor((toolInput.equity * (toolInput.riskPercent / 100)) / 50),
        riskPercent: toolInput.riskPercent,
      };
    },
  };
}

/** An adapter that answers from a fixed queue: the first summary per call,
 * holding on the last one — how a tool-requesting step is followed by a
 * wrap-up step. Requests are captured so the test can see what the model
 * was shown each iteration. */
function queuedAdapter(summaries: StructuredSummary[]) {
  const requests: ModelTurnRequest[] = [];
  let call = 0;
  return {
    requests,
    adapter: {
      label: 'queued (offline, deterministic)',
      async completeTurn(request: ModelTurnRequest) {
        requests.push(request);
        const summary = summaries[Math.min(call, summaries.length - 1)];
        if (summary === undefined) throw new Error('queued adapter underflow');
        call += 1;
        return {
          provider: 'scripted' as const,
          model: 'scripted-v1',
          latencyMs: 0,
          usage: {
            promptTokens: 10,
            completionTokens: 20,
            totalTokens: 30,
            costUsd: 0.01,
            priced: true,
            estimated: false,
          },
          summary,
          statements: statementsFromSummary(summary),
          toolRequests: toolRequestsFromSummary(summary),
        };
      },
    },
  };
}

const toolRequestSummary: StructuredSummary = {
  headline: 'Position sizing needs the risk tool',
  statements: [
    { kind: 'analysis', text: 'I will request the deterministic risk tool.', sources: [] },
  ],
  uncertainty: [],
  toolRequests: [
    { toolName: 'risk.positionSize', arguments: { equity: 10_000 }, purpose: 'size the position' },
  ],
};

const wrapUpSummary: StructuredSummary = {
  headline: 'Position sized',
  statements: [{ kind: 'fact', text: 'The deterministic tool sized the position.', sources: [] }],
  uncertainty: [],
  toolRequests: [],
};

describe('agent loop engine — tool calling through the registry', () => {
  it('executes a requested tool through the registry and feeds the validated output back to the next step', async () => {
    const queued = queuedAdapter([toolRequestSummary, wrapUpSummary]);
    const registry = new AgentToolRegistry();
    registry.register(positionSizeTool());
    const engine = new AgentLoopEngine({
      adapter: queued.adapter,
      toolRegistry: registry,
      userGrants: ['tool.run'],
      limits: { maxIterations: 4 },
    });

    const result = await engine.run(input({ userId: 'user-1' }));

    expect(result.status).toBe('completed');
    expect(result.iterations).toBe(2);
    expect(result.toolRuns).toHaveLength(1);
    expect(result.toolRuns[0]?.status).toBe('succeeded');
    expect(result.toolRuns[0]?.output).toEqual({ shares: 2, riskPercent: 1 });
    // The second reasoning step saw the tool results as a fresh runtime section.
    const secondRequest = queued.requests[1];
    const toolSection = secondRequest?.context.find((entry) => entry.id === 'tool-results');
    expect(toolSection).toBeDefined();
    expect(toolSection?.content).toContain('risk.positionSize');
    expect(toolSection?.content).toContain('"shares": 2');
    // Exactly one execution record, scoped to the user and run that invoked it.
    expect(registry.records({ userId: 'user-1', runId: 'corr-loop' })).toHaveLength(1);
    expect(registry.records()[0]?.status).toBe('succeeded');
  });

  it('feeds a refusal back as fresh material, and the guard then refuses the futile re-ask before the gateway is paid again', async () => {
    const queued = queuedAdapter([toolRequestSummary, toolRequestSummary, toolRequestSummary]);
    const registry = new AgentToolRegistry(); // nothing registered: every ask is refused
    const engine = new AgentLoopEngine({
      adapter: queued.adapter,
      toolRegistry: registry,
      userGrants: ['tool.run'],
      limits: { maxIterations: 5 },
    });

    const result = await engine.run(input({ userId: 'user-1' }));

    expect(result.status).toBe('blocked');
    expect(result.stopReason).toEqual({ reason: 'repeated-step', iteration: 3 });
    expect(result.iterations).toBe(2);
    expect(result.toolRuns).toHaveLength(2);
    expect(
      result.toolRuns.every(
        (run) => run.status === 'refused' && run.refusalReason === 'unknown-tool',
      ),
    ).toBe(true);
    // Two steps ran, and the third identical one was refused before any
    // further gateway call — a futile tool loop cannot burn iterations.
    expect(queued.requests).toHaveLength(2);
    expect(registry.records()).toHaveLength(2);
  });

  it('never executes a tool for a run without a user identity — isolation is structural', async () => {
    const queued = queuedAdapter([toolRequestSummary, toolRequestSummary, toolRequestSummary]);
    const registry = new AgentToolRegistry();
    registry.register(positionSizeTool());
    const engine = new AgentLoopEngine({
      adapter: queued.adapter,
      toolRegistry: registry,
      userGrants: ['tool.run'],
      limits: { maxIterations: 5 },
    });

    const result = await engine.run(input()); // no userId

    expect(result.status).toBe('blocked');
    expect(result.stopReason).toEqual({ reason: 'repeated-step', iteration: 3 });
    expect(result.toolRuns).toHaveLength(2);
    expect(
      result.toolRuns.every(
        (run) => run.status === 'refused' && run.refusalReason === 'missing-identity',
      ),
    ).toBe(true);
    // The registry was never reached, so nothing executed and nothing recorded.
    expect(registry.records()).toHaveLength(0);
  });

  it('keeps the record-only behavior when no registry is installed', async () => {
    const { adapter } = countingAdapter({ summary: toolRequestSummary });
    const engine = new AgentLoopEngine({ adapter, limits: { maxIterations: 5 } });

    const result = await engine.run(input({ userId: 'user-1' }));

    expect(result.status).toBe('blocked');
    expect(result.stopReason).toEqual({ reason: 'repeated-step', iteration: 2 });
    expect(result.iterations).toBe(1);
    expect(result.toolRequests).toHaveLength(1);
    expect(result.toolRuns).toEqual([]);
  });
});

// ── Phase 2.9: tool execution hardening inside the loop ────────────────────

describe('agent loop engine — tool execution stops, limits, and duplicates', () => {
  const twoToolSummary: StructuredSummary = {
    headline: 'Two tool asks',
    statements: [{ kind: 'analysis', text: 'Two deterministic calculations.', sources: [] }],
    uncertainty: [],
    toolRequests: [
      { toolName: 'risk.positionSize', arguments: { equity: 10_000 }, purpose: 'size' },
      { toolName: 'risk.positionSize', arguments: { equity: 20_000 }, purpose: 'size again' },
    ],
  };

  const duplicateToolSummary: StructuredSummary = {
    headline: 'The same ask twice',
    statements: [],
    uncertainty: [],
    toolRequests: [
      { toolName: 'risk.positionSize', arguments: { equity: 10_000 }, purpose: 'size' },
      { toolName: 'risk.positionSize', arguments: { equity: 10_000 }, purpose: 'size again' },
    ],
  };

  it('executes an identical tool call only once per step; the duplicate is refused, not run', async () => {
    let executions = 0;
    const tool = positionSizeTool();
    const original = tool.execute;
    tool.execute = async (toolInput, toolContext) => {
      executions += 1;
      return original(toolInput, toolContext);
    };
    const registry = new AgentToolRegistry();
    registry.register(tool);
    const queued = queuedAdapter([duplicateToolSummary, wrapUpSummary]);
    const engine = new AgentLoopEngine({
      adapter: queued.adapter,
      toolRegistry: registry,
      userGrants: ['tool.run'],
      limits: { maxIterations: 4 },
    });

    const result = await engine.run(input({ userId: 'user-1' }));

    expect(result.status).toBe('completed');
    expect(executions).toBe(1);
    expect(result.toolRuns).toHaveLength(2);
    expect(result.toolRuns[0]?.status).toBe('succeeded');
    expect(result.toolRuns[1]?.status).toBe('refused');
    expect(result.toolRuns[1]?.refusalReason).toBe('duplicate-request');
  });

  it('stops the loop immediately when a tool fails, with the tool named in the stop reason', async () => {
    const broken = positionSizeTool();
    broken.execute = async () => {
      throw new Error('price feed unavailable');
    };
    const registry = new AgentToolRegistry();
    registry.register(broken);
    const queued = queuedAdapter([toolRequestSummary, wrapUpSummary]);
    const engine = new AgentLoopEngine({
      adapter: queued.adapter,
      toolRegistry: registry,
      userGrants: ['tool.run'],
      limits: { maxIterations: 4 },
    });

    const result = await engine.run(input({ userId: 'user-1' }));

    expect(result.status).toBe('failed');
    expect(result.stopReason).toEqual({
      reason: 'tool-failure',
      toolName: 'risk.positionSize',
      toolStatus: 'failed',
      message: 'price feed unavailable',
    });
    expect(result.iterations).toBe(1);
    expect(result.toolRuns).toHaveLength(1);
    // No second reasoning step: the failure settled the loop in the phase.
    expect(queued.requests).toHaveLength(1);
    expect(result.timeline.at(-1)?.state).toBe('failed');
  });

  it('stops the loop when a tool returns output its own schema rejects', async () => {
    const invalid = positionSizeTool();
    invalid.execute = async () =>
      ({ shares: 'many', riskPercent: 1 }) as unknown as { shares: number; riskPercent: number };
    const registry = new AgentToolRegistry();
    registry.register(invalid);
    const queued = queuedAdapter([toolRequestSummary, wrapUpSummary]);
    const engine = new AgentLoopEngine({
      adapter: queued.adapter,
      toolRegistry: registry,
      userGrants: ['tool.run'],
    });

    const result = await engine.run(input({ userId: 'user-1' }));

    expect(result.status).toBe('failed');
    expect(result.stopReason).toMatchObject({
      reason: 'tool-failure',
      toolStatus: 'failed',
      message: expect.stringContaining('schema'),
    });
    expect(result.toolRuns[0]?.output).toBeUndefined();
  });

  it('stops the loop when a tool times out, with the timeout named', async () => {
    const slow = positionSizeTool();
    slow.timeoutMs = 30;
    slow.execute = async () => {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      return { shares: 1, riskPercent: 1 };
    };
    const registry = new AgentToolRegistry();
    registry.register(slow);
    const queued = queuedAdapter([toolRequestSummary, wrapUpSummary]);
    const engine = new AgentLoopEngine({
      adapter: queued.adapter,
      toolRegistry: registry,
      userGrants: ['tool.run'],
    });

    const result = await engine.run(input({ userId: 'user-1' }));

    expect(result.status).toBe('failed');
    expect(result.stopReason).toMatchObject({
      reason: 'tool-failure',
      toolStatus: 'timeout',
    });
    expect(result.toolRuns[0]?.timedOut).toBe(true);
    expect(queued.requests).toHaveLength(1);
  });

  it('observes cancellation between tool invocations and stops before the next one runs', async () => {
    let firstDone = false;
    const tool = positionSizeTool();
    const original = tool.execute;
    tool.execute = async (toolInput, toolContext) => {
      const out = await original(toolInput, toolContext);
      firstDone = true;
      return out;
    };
    const registry = new AgentToolRegistry();
    registry.register(tool);
    const queued = queuedAdapter([twoToolSummary, wrapUpSummary]);
    const engine = new AgentLoopEngine({
      adapter: queued.adapter,
      toolRegistry: registry,
      userGrants: ['tool.run'],
      shouldCancel: () => firstDone, // flips once the first tool settles
    });

    const result = await engine.run(input({ userId: 'user-1' }));

    expect(result.status).toBe('cancelled');
    expect(result.stopReason).toEqual({ reason: 'cancelled' });
    expect(result.toolRuns).toHaveLength(1); // the second ask never executed
    expect(result.toolRuns[0]?.status).toBe('succeeded');
    expect(queued.requests).toHaveLength(1);
  });

  it('counts tool time against maxExecutionTimeMs: the ceiling is checked between invocations', async () => {
    let clock = 0;
    const tool = positionSizeTool();
    const original = tool.execute;
    tool.execute = async (toolInput, toolContext) => {
      const out = await original(toolInput, toolContext);
      clock += 10_000; // this one tool call burns far past the ceiling
      return out;
    };
    const registry = new AgentToolRegistry();
    registry.register(tool);
    const queued = queuedAdapter([twoToolSummary, wrapUpSummary]);
    const engine = new AgentLoopEngine({
      adapter: queued.adapter,
      toolRegistry: registry,
      userGrants: ['tool.run'],
      limits: { maxExecutionTimeMs: 50 },
      now: () => clock,
    });

    const result = await engine.run(input({ userId: 'user-1' }));

    expect(result.status).toBe('blocked');
    expect(result.stopReason).toEqual({
      reason: 'time-limit',
      elapsedMs: 10_000,
      maxExecutionTimeMs: 50,
    });
    expect(result.toolRuns).toHaveLength(1); // stopped before the second
    expect(result.toolRuns[0]?.status).toBe('succeeded');
  });

  it('reports every settled outcome to the onToolRun observer, in order', async () => {
    const seen: { toolName: string; status: string; durationMs: number; detail?: string }[] = [];
    const registry = new AgentToolRegistry();
    registry.register(positionSizeTool());
    const queued = queuedAdapter([twoToolSummary, wrapUpSummary]);
    const engine = new AgentLoopEngine({
      adapter: queued.adapter,
      toolRegistry: registry,
      userGrants: ['tool.run'],
      onToolRun: (outcome) => {
        seen.push({
          toolName: outcome.toolName,
          status: outcome.status,
          durationMs: outcome.durationMs,
          ...(outcome.detail === undefined ? {} : { detail: outcome.detail }),
        });
      },
    });

    const result = await engine.run(input({ userId: 'user-1' }));

    expect(result.status).toBe('completed');
    expect(seen).toHaveLength(result.toolRuns.length);
    expect(seen.map((entry) => entry.status)).toEqual(result.toolRuns.map((run) => run.status));
    for (const entry of seen) {
      expect(entry.toolName).toBe('risk.positionSize');
      expect(entry.durationMs).toBeGreaterThanOrEqual(0);
    }
  });
});
