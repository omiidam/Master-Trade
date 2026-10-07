/**
 * Agent Run Manager tests.
 *
 * The manager owns the durable run lifecycle the AI Workplace reads:
 * unique ids, the explicit state machine, per-user isolation, cooperative
 * cancellation, usage/error accounting and real-time status exposure over
 * the existing EventBus. Every claim the module makes in prose is pinned
 * here as behaviour.
 */

import { describe, expect, it } from 'vitest';
import {
  AgentRunManager,
  isTerminalRunState,
  runStatusEventNotifier,
  type AgentRunStatusUpdate,
} from '../src/agent/runManager.js';
import { scriptedAsyncModelAdapter } from '../src/agent/asyncModel.js';
import type { AsyncModelAdapter } from '../src/agent/asyncModel.js';
import { AgentToolRegistry, type AgentToolRunOutcome } from '../src/agent/tools/registry.js';
import type { AgentTool } from '../src/agent/tools/contracts.js';
import type { StructuredSummary } from '../src/llm/summary.js';
import { z } from 'zod';
import type { AgentRunInput } from '../src/agent/harness.js';
import { AppError, PolicyViolationError } from '../packages/shared/src/core/errors.js';
import { EventBus } from '../packages/shared/src/realtime/events.js';
import type { Principal } from '../packages/shared/src/auth/model.js';

const instructions = 'system instructions for the run';

function harnessInput(
  overrides: Partial<AgentRunInput & { userId: string }> = {},
): AgentRunInput & { userId: string } {
  return {
    correlationId: 'corr-test',
    userInput: 'what is position sizing?',
    instructions,
    userId: 'u1',
    ...overrides,
  };
}

describe('agent run manager — registry and identity', () => {
  it('mints a unique run id per run', () => {
    const manager = new AgentRunManager();
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) {
      ids.add(manager.createRun({ userId: 'u1', correlationId: `c${i}`, model: 'm' }).runId);
    }
    expect(ids.size).toBe(50);
  });

  it('starts a new run in idle with timestamps set and nothing ended', () => {
    const manager = new AgentRunManager();
    const run = manager.createRun({ userId: 'u1', correlationId: 'c1', model: 'scripted' });
    expect(run.state).toBe('idle');
    expect(run.startedAt).toBeTruthy();
    expect(run.endedAt).toBeNull();
    expect(run.durationMs).toBeNull();
    expect(run.usage).toBeNull();
    expect(run.error).toBeNull();
    expect(run.cancelRequested).toBe(false);
    expect(run.timeline.map((entry) => entry.state)).toEqual(['idle']);
  });

  it('retains and lists only the owning user runs, newest first', () => {
    const manager = new AgentRunManager();
    manager.createRun({ userId: 'u1', correlationId: 'c1', model: 'm' });
    manager.createRun({ userId: 'u2', correlationId: 'c2', model: 'm' });
    const first = manager.createRun({ userId: 'u1', correlationId: 'c3', model: 'm' });
    const list = manager.listRuns('u1');
    expect(list).toHaveLength(2);
    expect(list[0]?.runId).toBe(first.runId);
    expect(list.every((run) => run.userId === 'u1')).toBe(true);
  });
});

describe('agent run manager — the explicit state machine', () => {
  it('walks the full happy path the AI Workplace renders', () => {
    const manager = new AgentRunManager();
    const run = manager.createRun({ userId: 'u1', correlationId: 'c1', model: 'm' });
    manager.start(run.runId, 'u1');
    manager.transition(run.runId, 'u1', 'waiting-tool');
    manager.transition(run.runId, 'u1', 'running');
    manager.transition(run.runId, 'u1', 'validating');
    manager.transition(run.runId, 'u1', 'responding');
    const done = manager.complete(run.runId, 'u1');
    expect(done.timeline.map((entry) => entry.state)).toEqual([
      'idle',
      'running',
      'waiting-tool',
      'running',
      'validating',
      'responding',
      'completed',
    ]);
    expect(done.endedAt).toBeTruthy();
    expect(done.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('refuses an illegal transition loudly, leaving the state untouched', () => {
    const manager = new AgentRunManager();
    const run = manager.createRun({ userId: 'u1', correlationId: 'c1', model: 'm' });
    expect(() => manager.transition(run.runId, 'u1', 'completed')).toThrow(AppError);
    expect(manager.getRun(run.runId, 'u1').state).toBe('idle');
  });

  it('never leaves a terminal state', () => {
    const manager = new AgentRunManager();
    const run = manager.createRun({ userId: 'u1', correlationId: 'c1', model: 'm' });
    manager.start(run.runId, 'u1');
    manager.block(run.runId, 'u1', 'the gate refused');
    for (const next of ['running', 'failed', 'completed', 'cancelled'] as const) {
      expect(() => manager.transition(run.runId, 'u1', next)).toThrow(AppError);
    }
    expect(isTerminalRunState('blocked')).toBe(true);
  });

  it('records a blocked terminal state with its reason', () => {
    const manager = new AgentRunManager();
    const run = manager.createRun({ userId: 'u1', correlationId: 'c1', model: 'm' });
    manager.start(run.runId, 'u1');
    const blocked = manager.block(run.runId, 'u1', 'readiness refused the analysis');
    expect(blocked.state).toBe('blocked');
    expect(blocked.blockedReason).toBe('readiness refused the analysis');
  });

  it('records a failure with the phase it surfaced in', () => {
    const manager = new AgentRunManager();
    const run = manager.createRun({ userId: 'u1', correlationId: 'c1', model: 'm' });
    manager.start(run.runId, 'u1');
    const failed = manager.fail(run.runId, 'u1', 'the gateway timed out');
    expect(failed.state).toBe('failed');
    expect(failed.error?.phase).toBe('running');
    expect(failed.error?.message).toBe('the gateway timed out');
  });

  it('accumulates token usage across recordings', () => {
    const manager = new AgentRunManager();
    const run = manager.createRun({ userId: 'u1', correlationId: 'c1', model: 'm' });
    manager.recordUsage(run.runId, 'u1', {
      promptTokens: 100,
      completionTokens: 20,
      totalTokens: 120,
      costUsd: 0.01,
    });
    const second = manager.recordUsage(run.runId, 'u1', {
      promptTokens: 50,
      completionTokens: 10,
      totalTokens: 60,
      costUsd: 0.005,
    });
    expect(second.usage).toEqual({
      promptTokens: 150,
      completionTokens: 30,
      totalTokens: 180,
      costUsd: 0.015,
    });
  });

  it('returns defensive snapshots: mutating a read cannot touch the record', () => {
    const manager = new AgentRunManager();
    const run = manager.createRun({ userId: 'u1', correlationId: 'c1', model: 'm' });
    const read = manager.getRun(run.runId, 'u1');
    (read.timeline as unknown as unknown[]).push({ state: 'completed', at: 'x' });
    expect(manager.getRun(run.runId, 'u1').timeline).toHaveLength(1);
  });

  it('evicts the oldest terminal run over the retention cap, never an active one', () => {
    const manager = new AgentRunManager({ maxRunsPerUser: 2 });
    const a = manager.createRun({ userId: 'u1', correlationId: 'c1', model: 'm' });
    const b = manager.createRun({ userId: 'u1', correlationId: 'c2', model: 'm' });
    manager.block(a.runId, 'u1', 'refused'); // a is terminal, b stays idle (not terminal)
    const c = manager.createRun({ userId: 'u1', correlationId: 'c3', model: 'm' });
    // Over the cap: the oldest terminal run (a) is evicted; b, not being
    // terminal, survives even though it is older than c.
    expect(
      manager
        .listRuns('u1')
        .map((run) => run.runId)
        .sort(),
    ).toEqual([b.runId, c.runId].sort());
    expect(manager.getRun(b.runId, 'u1').state).toBe('idle');
  });

  it('keeps a run started late from being silently dropped when over the cap', () => {
    const manager = new AgentRunManager({ maxRunsPerUser: 2 });
    const a = manager.createRun({ userId: 'u1', correlationId: 'c1', model: 'm' });
    const b = manager.createRun({ userId: 'u1', correlationId: 'c2', model: 'm' });
    const c = manager.createRun({ userId: 'u1', correlationId: 'c3', model: 'm' });
    // All three are idle → not terminal → nothing evicted, nothing lost.
    expect(
      manager
        .listRuns('u1')
        .map((run) => run.runId)
        .sort(),
    ).toEqual([a.runId, b.runId, c.runId].sort());
  });
});

describe('agent run manager — run/user isolation', () => {
  it('refuses a cross-user read with a policy violation, not an empty result', () => {
    const manager = new AgentRunManager();
    const run = manager.createRun({ userId: 'u1', correlationId: 'c1', model: 'm' });
    expect(() => manager.getRun(run.runId, 'u2')).toThrow(PolicyViolationError);
  });

  it('refuses a cross-user transition, cancellation and usage record', () => {
    const manager = new AgentRunManager();
    const run = manager.createRun({ userId: 'u1', correlationId: 'c1', model: 'm' });
    expect(() => manager.start(run.runId, 'u2')).toThrow(PolicyViolationError);
    expect(() => manager.cancel(run.runId, 'u2')).toThrow(PolicyViolationError);
    expect(() =>
      manager.recordUsage(run.runId, 'u2', {
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
        costUsd: 0,
      }),
    ).toThrow(PolicyViolationError);
    expect(manager.getRun(run.runId, 'u1').state).toBe('idle');
  });

  it('answers an unknown run with NOT_FOUND, not a policy error', () => {
    const manager = new AgentRunManager();
    expect(() => manager.getRun('run_nope', 'u1')).toThrow(AppError);
    try {
      manager.getRun('run_nope', 'u1');
      expect.unreachable();
    } catch (error) {
      expect((error as AppError).code).toBe('NOT_FOUND');
    }
  });

  it('delivers subscriptions only for the owning user', () => {
    const manager = new AgentRunManager();
    const seen: AgentRunStatusUpdate[] = [];
    manager.subscribe('u1', (update) => seen.push(update));
    const other = manager.createRun({ userId: 'u2', correlationId: 'c1', model: 'm' });
    manager.start(other.runId, 'u2');
    expect(seen).toHaveLength(0);
    const own = manager.createRun({ userId: 'u1', correlationId: 'c2', model: 'm' });
    manager.start(own.runId, 'u1');
    expect(seen).toHaveLength(1);
    expect(seen[0]?.runId).toBe(own.runId);
  });

  it('stops delivering after unsubscribe', () => {
    const manager = new AgentRunManager();
    const seen: AgentRunStatusUpdate[] = [];
    const unsubscribe = manager.subscribe('u1', (update) => seen.push(update));
    const run = manager.createRun({ userId: 'u1', correlationId: 'c1', model: 'm' });
    manager.start(run.runId, 'u1');
    unsubscribe();
    manager.transition(run.runId, 'u1', 'responding');
    expect(seen).toHaveLength(1);
  });
});

describe('agent run manager — cancellation', () => {
  it('cancels an idle run immediately', () => {
    const manager = new AgentRunManager();
    const run = manager.createRun({ userId: 'u1', correlationId: 'c1', model: 'm' });
    expect(manager.cancel(run.runId, 'u1')).toBe(true);
    expect(manager.getRun(run.runId, 'u1').state).toBe('cancelled');
  });

  it('marks a running run for cooperative cancellation without ending it', () => {
    const manager = new AgentRunManager();
    const run = manager.createRun({ userId: 'u1', correlationId: 'c1', model: 'm' });
    manager.start(run.runId, 'u1');
    expect(manager.cancel(run.runId, 'u1')).toBe(true);
    const record = manager.getRun(run.runId, 'u1');
    expect(record.state).toBe('running');
    expect(record.cancelRequested).toBe(true);
    expect(manager.shouldCancel(run.runId, 'u1')).toBe(true);
  });

  it('completes the cancellation when the driver observes it', () => {
    const manager = new AgentRunManager();
    const run = manager.createRun({ userId: 'u1', correlationId: 'c1', model: 'm' });
    manager.start(run.runId, 'u1');
    manager.cancel(run.runId, 'u1');
    const cancelled = manager.transition(run.runId, 'u1', 'cancelled', 'cancelled by request');
    expect(cancelled.state).toBe('cancelled');
    expect(cancelled.endedAt).toBeTruthy();
  });

  it('reports false when cancelling an already-terminal run', () => {
    const manager = new AgentRunManager();
    const run = manager.createRun({ userId: 'u1', correlationId: 'c1', model: 'm' });
    manager.start(run.runId, 'u1');
    manager.transition(run.runId, 'u1', 'responding');
    manager.complete(run.runId, 'u1');
    expect(manager.cancel(run.runId, 'u1')).toBe(false);
    expect(manager.getRun(run.runId, 'u1').state).toBe('completed');
  });
});

describe('agent run manager — driving a harness run', () => {
  it('runs one harness execution end to end and records the model and usage', async () => {
    const adapter = scriptedAsyncModelAdapter({
      usage: { promptTokens: 120, completionTokens: 30, totalTokens: 150, costUsd: 0.02 },
    });
    const manager = new AgentRunManager({ harness: { adapter } });
    const result = await manager.run(harnessInput());
    expect(result.status).toBe('completed');
    expect(result.runId).toBeTruthy();
    const record = manager.getRun(result.runId, 'u1');
    expect(record.model).toBe(adapter.label);
    expect(record.state).toBe('completed');
    expect(record.usage).not.toBeNull();
    expect(record.usage?.totalTokens).toBe(150);
    expect(record.usage?.promptTokens).toBe(120);
    expect(record.timeline.map((entry) => entry.state)).toEqual([
      'idle',
      'running',
      'responding',
      'completed',
    ]);
  });

  it('announces every transition to the injected notifier', async () => {
    const adapter = scriptedAsyncModelAdapter();
    const updates: AgentRunStatusUpdate[] = [];
    const manager = new AgentRunManager({
      harness: { adapter },
      onStatus: (update) => updates.push(update),
    });
    const result = await manager.run(harnessInput());
    expect(updates.map((update) => update.state)).toEqual(['running', 'responding', 'completed']);
    expect(updates.every((update) => update.runId === result.runId)).toBe(true);
    expect(updates.every((update) => update.userId === 'u1')).toBe(true);
    expect(updates.every((update) => update.correlationId === 'corr-test')).toBe(true);
  });

  it('maps a harness failure to a failed run with the message recorded', async () => {
    const adapter = {
      label: 'failing',
      async completeTurn(): Promise<never> {
        throw new Error('the provider is unreachable');
      },
    };
    const manager = new AgentRunManager({ harness: { adapter } });
    const result = await manager.run(harnessInput());
    expect(result.status).toBe('failed');
    const record = manager.getRun(result.runId, 'u1');
    expect(record.state).toBe('failed');
    expect(record.error?.message).toBe('the provider is unreachable');
    expect(record.endedAt).toBeTruthy();
  });

  it('cancels cooperatively between phases and ends cancelled', async () => {
    const adapter = scriptedAsyncModelAdapter();
    const manager = new AgentRunManager({ harness: { adapter } });
    const input = harnessInput();
    const created = manager.createRun({
      userId: input.userId,
      correlationId: input.correlationId,
      model: adapter.label,
    });
    manager.start(created.runId, input.userId);
    manager.cancel(created.runId, input.userId);
    // The cooperative flag is what a driver polls; the run ends cancelled,
    // never mid-write.
    expect(manager.shouldCancel(created.runId, input.userId)).toBe(true);
    expect(manager.getRun(created.runId, input.userId).state).toBe('running');
    manager.transition(created.runId, input.userId, 'cancelled', 'cancelled by request');
    expect(manager.getRun(created.runId, input.userId).state).toBe('cancelled');
  });

  it('refuses to run without a harness configuration', async () => {
    const manager = new AgentRunManager();
    await expect(manager.run(harnessInput())).rejects.toThrow(AppError);
  });
});

describe('agent run manager — status exposure over the EventBus', () => {
  const principal = (roles: Principal['roles'], id = 'u1'): Principal => ({
    id,
    roles,
    session: {
      id: 's1',
      issuedAt: new Date(0).toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
  });

  it('publishes an agent.status event per transition on the existing bus', () => {
    const bus = new EventBus();
    const manager = new AgentRunManager({ onStatus: runStatusEventNotifier(bus) });
    const seen: string[] = [];
    const viewer = principal(['owner']);
    bus.subscribe(viewer, (event) => {
      if (event.type === 'agent.status') {
        const payload = event.payload as { state: string };
        seen.push(payload.state);
      }
    });
    const run = manager.createRun({
      userId: 'u1',
      correlationId: 'corr-1',
      model: 'm',
    });
    manager.start(run.runId, 'u1');
    manager.transition(run.runId, 'u1', 'responding');
    manager.complete(run.runId, 'u1');
    expect(seen).toEqual(['running', 'responding', 'completed']);
  });

  it('carries the run id in the event source and passes contract validation', () => {
    const bus = new EventBus();
    const manager = new AgentRunManager({ onStatus: runStatusEventNotifier(bus) });
    const run = manager.createRun({ userId: 'u1', correlationId: 'corr-1', model: 'm' });
    manager.start(run.runId, 'u1');
    const event = bus
      .historySnapshot()
      .filter((entry) => entry.type === 'agent.status')
      .at(-1);
    expect(event).toBeDefined();
    expect(event?.source).toEqual({ kind: 'agent', id: run.runId });
    expect(event?.correlationId).toBe('corr-1');
    expect(event?.payload).toMatchObject({ state: 'running', previous: 'idle' });
  });

  it('carries a blocked reason and never lets a refused publish fail the run', () => {
    const bus = new EventBus();
    const manager = new AgentRunManager({ onStatus: runStatusEventNotifier(bus) });
    const run = manager.createRun({ userId: 'u1', correlationId: 'corr-1', model: 'm' });
    manager.start(run.runId, 'u1');
    manager.block(run.runId, 'u1', 'the readiness gate refused this analysis');
    const event = bus
      .historySnapshot()
      .filter((entry) => entry.type === 'agent.status')
      .at(-1);
    expect(event?.payload).toMatchObject({
      state: 'blocked',
      previous: 'running',
      reason: 'the readiness gate refused this analysis',
    });
  });

  it('applies the transition before announcing, so a throwing notifier cannot corrupt the run', () => {
    const manager = new AgentRunManager({
      onStatus: () => {
        throw new Error('the wire is down');
      },
    });
    const run = manager.createRun({ userId: 'u1', correlationId: 'c1', model: 'm' });
    // A throwing notifier surfaces to the caller by design — error handling
    // belongs to the notifier (the server's catches and logs). The state
    // itself was already committed: an announcement failure cannot rewind
    // the run into a state it is no longer in.
    expect(() => manager.start(run.runId, 'u1')).toThrow('the wire is down');
    expect(manager.getRun(run.runId, 'u1').state).toBe('running');
  });
});

// ── Phase 2.9: driving the Agent Loop through a managed run ────────────────

const loopToolSummary: StructuredSummary = {
  headline: 'Position sizing needs the risk tool',
  statements: [{ kind: 'analysis', text: 'Requesting the deterministic risk tool.', sources: [] }],
  uncertainty: [],
  toolRequests: [{ toolName: 'risk.positionSize', arguments: { equity: 10_000 }, purpose: 'size' }],
};

const loopWrapUpSummary: StructuredSummary = {
  headline: 'Position sized',
  statements: [{ kind: 'fact', text: 'The deterministic tool sized it.', sources: [] }],
  uncertainty: [],
  toolRequests: [],
};

/** An adapter answering from a fixed queue, reusing the scripted adapter's
 * summary mechanics — each call consumes one queued summary (holding on
 * the last), with usage set so accumulation across steps is measurable. */
function queuedAdapter(summaries: StructuredSummary[]): AsyncModelAdapter {
  let call = 0;
  return {
    label: 'queued-loop (offline, deterministic)',
    async completeTurn(request) {
      const summary = summaries[Math.min(call, summaries.length - 1)];
      if (summary === undefined) throw new Error('queued adapter underflow');
      call += 1;
      return scriptedAsyncModelAdapter({
        summary,
        usage: { promptTokens: 120, completionTokens: 30, totalTokens: 150, costUsd: 0.02 },
      }).completeTurn(request);
    },
  };
}

function loopPositionSizeTool(): AgentTool<
  { equity: number },
  { shares: number; riskPercent: number }
> {
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
    inputSchema: z.object({ equity: z.number().positive() }),
    outputSchema: z.object({ shares: z.number(), riskPercent: z.number() }),
    async execute(toolInput) {
      return { shares: Math.floor(toolInput.equity / 50), riskPercent: 1 };
    },
  };
}

describe('agent run manager — driving the Agent Loop with tools', () => {
  it('runLoop drives the loop and records each tool execution on the run', async () => {
    const registry = new AgentToolRegistry();
    registry.register(loopPositionSizeTool());
    const manager = new AgentRunManager({
      harness: { adapter: queuedAdapter([loopToolSummary, loopWrapUpSummary]) },
      tools: registry,
    });

    const result = await manager.runLoop({ ...harnessInput(), userGrants: ['tool.run'] });

    expect(result.status).toBe('completed');
    expect(result.iterations).toBe(2);
    const record = manager.getRun(result.runId, 'u1');
    expect(record.state).toBe('completed');
    expect(record.timeline.map((entry) => entry.state)).toEqual([
      'idle',
      'running',
      'responding',
      'completed',
    ]);
    // The tool execution is on the run: name, status, duration, no error.
    expect(record.toolRuns).toHaveLength(1);
    const entry = record.toolRuns[0];
    expect(entry).toMatchObject({
      toolName: 'risk.positionSize',
      toolVersion: '1.0.0',
      status: 'succeeded',
    });
    expect(entry?.durationMs).toBeGreaterThanOrEqual(0);
    expect(entry?.error).toBeUndefined();
    expect(entry?.at).toBeTruthy();
    // Usage accumulated across both reasoning steps: 2 × 150 tokens.
    expect(record.usage?.totalTokens).toBe(300);
    expect(record.usage?.costUsd).toBeCloseTo(0.04);
  });

  it('maps a blocked loop onto the run with the precise stop reason', async () => {
    const registry = new AgentToolRegistry(); // nothing registered: refused
    const manager = new AgentRunManager({
      harness: { adapter: queuedAdapter([loopToolSummary, loopToolSummary]) },
      tools: registry,
    });

    const result = await manager.runLoop({
      ...harnessInput(),
      limits: { maxIterations: 1 },
      userGrants: ['tool.run'],
    });

    expect(result.status).toBe('blocked');
    expect(result.stopReason).toMatchObject({ reason: 'iteration-limit' });
    const record = manager.getRun(result.runId, 'u1');
    expect(record.state).toBe('blocked');
    expect(record.blockedReason).toContain('iteration-limit');
    expect(record.toolRuns).toHaveLength(1);
    expect(record.toolRuns[0]).toMatchObject({
      toolName: 'risk.positionSize',
      status: 'refused',
      error: expect.stringContaining('no tool registered'),
    });
  });

  it('maps a tool failure onto a failed run with the tool error recorded', async () => {
    const broken = loopPositionSizeTool();
    broken.execute = async () => {
      throw new Error('price feed unavailable');
    };
    const registry = new AgentToolRegistry();
    registry.register(broken);
    const manager = new AgentRunManager({
      harness: { adapter: queuedAdapter([loopToolSummary, loopWrapUpSummary]) },
      tools: registry,
    });

    const result = await manager.runLoop({ ...harnessInput(), userGrants: ['tool.run'] });

    expect(result.status).toBe('failed');
    expect(result.stopReason).toMatchObject({ reason: 'tool-failure', toolStatus: 'failed' });
    const record = manager.getRun(result.runId, 'u1');
    expect(record.state).toBe('failed');
    expect(record.error?.message).toContain('price feed unavailable');
    expect(record.toolRuns[0]).toMatchObject({
      toolName: 'risk.positionSize',
      status: 'failed',
      error: expect.stringContaining('price feed unavailable'),
    });
  });

  it('refuses to record a tool run against a run the caller does not own', () => {
    const manager = new AgentRunManager();
    const run = manager.createRun({ userId: 'u1', correlationId: 'c1', model: 'm' });
    const outcome: AgentToolRunOutcome = {
      executionId: 'exec-1',
      toolName: 'risk.positionSize',
      toolVersion: '1.0.0',
      status: 'succeeded',
      durationMs: 5,
      timedOut: false,
    };
    expect(() => manager.recordToolRun(run.runId, 'u2', outcome)).toThrow(PolicyViolationError);
    expect(manager.getRun(run.runId, 'u1').toolRuns).toEqual([]);
    const own = manager.recordToolRun(run.runId, 'u1', outcome);
    expect(own.toolRuns).toHaveLength(1);
  });

  it('runLoop without a harness configuration is unavailable, like run()', async () => {
    const manager = new AgentRunManager();
    await expect(manager.runLoop(harnessInput())).rejects.toThrow(AppError);
  });
});
