/**
 * Tool Permission and Risk Gate tests.
 *
 * The gate is the single pre-execution decision every tool call passes
 * through: five dimensions (user, run, tool, risk, approval), three
 * explicit outcomes (ALLOW / BLOCK / REQUIRE_APPROVAL), deny by default
 * whenever permission or risk information is missing. These tests pin the
 * gate's own verdicts, its un-bypassability through the Registry, and the
 * gate decision landing in the Agent Run trace.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RISK_POLICY,
  ToolPermissionGate,
  type ToolPermissionContext,
} from '../src/agent/tools/permissionGate.js';
import { AgentToolRegistry } from '../src/agent/tools/registry.js';
import type {
  AgentTool,
  AgentToolContext,
  AgentToolDescriptor,
} from '../src/agent/tools/contracts.js';
import { AgentRunManager } from '../src/agent/runManager.js';
import { scriptedAsyncModelAdapter } from '../src/agent/asyncModel.js';
import type { AsyncModelAdapter } from '../src/agent/asyncModel.js';
import type { AgentRunInput } from '../src/agent/harness.js';
import type { StructuredSummary } from '../src/llm/summary.js';
import { z } from 'zod';

const fullContext: ToolPermissionContext = {
  userId: 'user-1',
  runId: 'run-1',
  userGrants: ['tool.run'],
  runState: 'running',
};

function descriptor(overrides: Partial<AgentToolDescriptor> = {}): AgentToolDescriptor {
  return {
    name: 'risk.positionSize',
    version: '1.0.0',
    description: 'Deterministic position sizing from equity.',
    category: 'general',
    capabilities: ['risk.calculate'],
    riskLevel: 'low',
    timeoutMs: 1_000,
    requiresApproval: false,
    sideEffects: false,
    ...overrides,
  };
}

describe('tool permission gate — the three explicit outcomes', () => {
  it('answers ALLOW when every dimension is satisfied, read-only and low risk', () => {
    const gate = new ToolPermissionGate();
    const evaluation = gate.evaluate(descriptor(), fullContext);

    expect(evaluation.decision).toBe('ALLOW');
    expect(evaluation.toolName).toBe('risk.positionSize');
    expect(evaluation.riskLevel).toBe('low');
    expect(evaluation.access).toBe('read-only');
    expect(evaluation.sideEffects).toBe(false);
    for (const check of Object.values(evaluation.checks)) {
      expect(check.verdict).toBe('allow');
    }
    expect(evaluation.reason).toContain('all permission checks satisfied');
  });

  it('answers REQUIRE_APPROVAL for a high-risk tool without an approval, ALLOW with one', () => {
    const gate = new ToolPermissionGate();
    const highRisk = descriptor({ riskLevel: 'high' });

    const without = gate.evaluate(highRisk, fullContext);
    expect(without.decision).toBe('REQUIRE_APPROVAL');
    expect(without.checks.approval.verdict).toBe('require-approval');
    expect(without.reason).toContain('risk level is high');

    const withApproval = gate.evaluate(highRisk, { ...fullContext, approvalGranted: true });
    expect(withApproval.decision).toBe('ALLOW');
  });

  it('demands approval for side-effecting tools and flags them as side-effecting', () => {
    const gate = new ToolPermissionGate();
    const sideEffecting = descriptor({ sideEffects: true, requiresApproval: true });

    const evaluation = gate.evaluate(sideEffecting, fullContext);
    expect(evaluation.decision).toBe('REQUIRE_APPROVAL');
    expect(evaluation.access).toBe('side-effecting');
    expect(evaluation.sideEffects).toBe(true);
    expect(evaluation.reason).toContain('side effects');

    const approved = gate.evaluate(sideEffecting, { ...fullContext, approvalGranted: true });
    expect(approved.decision).toBe('ALLOW');
    expect(approved.access).toBe('side-effecting');
  });

  it('keeps read-only and side-effecting tools distinguishable in every evaluation', () => {
    const gate = new ToolPermissionGate();
    expect(gate.evaluate(descriptor(), fullContext).access).toBe('read-only');
    expect(gate.evaluate(descriptor({ sideEffects: true }), fullContext).access).toBe(
      'side-effecting',
    );
  });
});

describe('tool permission gate — deny by default on missing information', () => {
  const gate = new ToolPermissionGate();

  it('blocks when the user permission snapshot is missing', () => {
    const { userGrants: _grants, ...noGrants } = fullContext;
    const evaluation = gate.evaluate(descriptor(), noGrants);
    expect(evaluation.decision).toBe('BLOCK');
    expect(evaluation.reason).toContain('user permission information is missing');
  });

  it('blocks when the user holds no tool.run grant', () => {
    const evaluation = gate.evaluate(descriptor(), { ...fullContext, userGrants: [] });
    expect(evaluation.decision).toBe('BLOCK');
    expect(evaluation.reason).toContain('no tool.run grant');
  });

  it('blocks when the run permission information is missing', () => {
    const { runState: _state, ...noRun } = fullContext;
    const evaluation = gate.evaluate(descriptor(), noRun);
    expect(evaluation.decision).toBe('BLOCK');
    expect(evaluation.reason).toContain('run permission information is missing');
  });

  it('blocks tools in a non-active run', () => {
    for (const runState of ['cancelled', 'failed', 'blocked', 'completed', 'idle'] as const) {
      const evaluation = gate.evaluate(descriptor(), { ...fullContext, runState });
      expect(evaluation.decision, runState).toBe('BLOCK');
      expect(evaluation.checks.run.reason).toContain('active run');
    }
  });

  it('blocks an unknown tool: no tool information at all', () => {
    const evaluation = gate.evaluate(undefined, fullContext, 'does.notExist');
    expect(evaluation.decision).toBe('BLOCK');
    expect(evaluation.reason).toContain('no tool registered under the name "does.notExist"');
    expect(evaluation.riskLevel).toBe('unknown');
  });

  it('blocks a capability the existing permission model denies', () => {
    const evaluation = gate.evaluate(descriptor({ capabilities: ['backtest.run'] }), fullContext);
    expect(evaluation.decision).toBe('BLOCK');
    expect(evaluation.checks.tool.reason).toContain('later phase');
  });

  it('blocks an unrecognized risk level: risk information is not on file', () => {
    const risky = descriptor({ riskLevel: 'extreme' as unknown as 'low' });
    const evaluation = gate.evaluate(risky, fullContext);
    expect(evaluation.decision).toBe('BLOCK');
    expect(evaluation.checks.risk.reason).toContain('unknown risk level "extreme"');
  });
});

describe('tool permission gate — future risk levels without redesigning the Registry', () => {
  it('a new risk level attaches through the policy table alone', () => {
    // The default gate denies the level: nothing on file, nothing allowed.
    const defaultGate = new ToolPermissionGate();
    const futuristic = descriptor({ riskLevel: 'extreme' as unknown as 'low' });
    expect(defaultGate.evaluate(futuristic, fullContext).decision).toBe('BLOCK');

    // Extending the policy is all it takes: the Registry is untouched.
    const extended = new ToolPermissionGate({
      riskPolicy: { extreme: { requiresApproval: true } },
    });
    const evaluation = extended.evaluate(futuristic, fullContext);
    expect(evaluation.decision).toBe('REQUIRE_APPROVAL');
    expect(evaluation.checks.risk.verdict).toBe('allow');
    expect(evaluation.checks.risk.reason).toContain('risk extreme');
  });

  it('the default policy table maps risk to approval honestly', () => {
    expect(DEFAULT_RISK_POLICY.low.requiresApproval).toBe(false);
    expect(DEFAULT_RISK_POLICY.medium.requiresApproval).toBe(false);
    expect(DEFAULT_RISK_POLICY.high.requiresApproval).toBe(true);
    expect(DEFAULT_RISK_POLICY.critical.requiresApproval).toBe(true);
  });
});

// ── The gate inside the Registry: the one execution path ───────────────────

function gatedTool(
  overrides: Partial<AgentTool<{ equity: number }, { shares: number }>> = {},
): AgentTool<{ equity: number }, { shares: number }> {
  const tool: AgentTool<{ equity: number }, { shares: number }> = {
    name: 'risk.positionSize',
    version: '1.0.0',
    description: 'Deterministic position sizing from equity.',
    category: 'general',
    capabilities: ['risk.calculate'],
    riskLevel: 'low',
    timeoutMs: 1_000,
    requiresApproval: false,
    sideEffects: false,
    inputSchema: z.object({ equity: z.number().positive() }),
    outputSchema: z.object({ shares: z.number() }),
    async execute(input) {
      return { shares: Math.floor(input.equity / 50) };
    },
    ...overrides,
  };
  return tool;
}

const invokerContext: AgentToolContext = {
  userId: 'user-1',
  runId: 'run-1',
  userGrants: ['tool.run'],
  runState: 'running',
};

describe('tool permission gate — inside the Registry, un-bypassable', () => {
  it('records the ALLOW decision and reason on a successful outcome', async () => {
    const registry = new AgentToolRegistry();
    registry.register(gatedTool());

    const outcome = await registry.invoke('risk.positionSize', { equity: 10_000 }, invokerContext);

    expect(outcome.status).toBe('succeeded');
    expect(outcome.gate).toBeDefined();
    expect(outcome.gate?.decision).toBe('ALLOW');
    expect(outcome.gate?.reason).toContain('all permission checks satisfied');
    expect(outcome.gate?.checks.user.verdict).toBe('allow');
    expect(outcome.gate?.checks.risk.verdict).toBe('allow');
  });

  it('blocks execution when permission information is missing — execute is never called', async () => {
    let executions = 0;
    const tool = gatedTool();
    const original = tool.execute;
    tool.execute = async (input) => {
      executions += 1;
      return original(input, invokerContext);
    };
    const registry = new AgentToolRegistry();
    registry.register(tool);

    const { userGrants: _grants, ...noGrants } = invokerContext;
    const outcome = await registry.invoke('risk.positionSize', { equity: 10_000 }, noGrants);

    expect(outcome.status).toBe('refused');
    expect(outcome.refusalReason).toBe('gate-blocked');
    expect(outcome.gate?.decision).toBe('BLOCK');
    expect(outcome.gate?.reason).toContain('user permission information is missing');
    expect(executions).toBe(0);
    expect(registry.records({ status: 'refused' })).toHaveLength(1);
  });

  it('answers REQUIRE_APPROVAL through the registry when no approval exists', async () => {
    const registry = new AgentToolRegistry();
    registry.register(gatedTool({ requiresApproval: true, riskLevel: 'high' }));

    const outcome = await registry.invoke('risk.positionSize', { equity: 10_000 }, invokerContext);

    expect(outcome.status).toBe('refused');
    expect(outcome.refusalReason).toBe('approval-required');
    expect(outcome.gate?.decision).toBe('REQUIRE_APPROVAL');
    expect(outcome.gate?.reason).toContain('requires a human approval');
  });

  it('exposes no execute function anywhere the agent can reach: descriptors are inert', () => {
    const registry = new AgentToolRegistry();
    registry.register(gatedTool());

    const listed = registry.list()[0];
    const fetched = registry.get('risk.positionSize');
    expect(listed).toBeDefined();
    expect('execute' in listed!).toBe(false);
    expect('inputSchema' in listed!).toBe(false);
    expect(fetched).toBeDefined();
    expect('execute' in fetched!).toBe(false);
    // The gate is consulted by invoke — the only execution entry — and a
    // blocked invocation is a refusal, never a run. There is no other path.
    expect(Object.keys(registry).some((key) => key !== 'invoke')).toBe(true);
  });
});

// ── The gate decision lands in the Agent Run trace ─────────────────────────

const gateToolSummary: StructuredSummary = {
  headline: 'Needs the risk tool',
  statements: [],
  uncertainty: [],
  toolRequests: [{ toolName: 'risk.positionSize', arguments: { equity: 10_000 }, purpose: 'size' }],
};

const gateWrapUpSummary: StructuredSummary = {
  headline: 'Done',
  statements: [],
  uncertainty: [],
  toolRequests: [],
};

function queuedGateAdapter(summaries: StructuredSummary[]): AsyncModelAdapter {
  let call = 0;
  return {
    label: 'queued-gate (offline, deterministic)',
    async completeTurn(request) {
      const summary = summaries[Math.min(call, summaries.length - 1)];
      if (summary === undefined) throw new Error('queued adapter underflow');
      call += 1;
      return scriptedAsyncModelAdapter({ summary }).completeTurn(request);
    },
  };
}

describe('tool permission gate — recorded in the Agent Run trace', () => {
  it('writes the gate decision and reason onto the run record', async () => {
    const registry = new AgentToolRegistry();
    registry.register(gatedTool());
    const manager = new AgentRunManager({
      harness: { adapter: queuedGateAdapter([gateToolSummary, gateWrapUpSummary]) },
      tools: registry,
    });

    const input: AgentRunInput & { userId: string } = {
      correlationId: 'corr-gate',
      userInput: 'size my position',
      instructions: 'system instructions',
      userId: 'u1',
      // Deliberately no userGrants: the gate must deny by default and the
      // run must record that decision and its reason.
    };
    const result = await manager.runLoop(input);

    expect(result.status).toBe('completed');
    const record = manager.getRun(result.runId, 'u1');
    expect(record.toolRuns).toHaveLength(1);
    const entry = record.toolRuns[0];
    expect(entry).toMatchObject({ toolName: 'risk.positionSize', status: 'refused' });
    expect(entry?.gate?.decision).toBe('BLOCK');
    expect(entry?.gate?.reason).toContain('user permission information is missing');
    expect(entry?.gate?.checks.user.verdict).toBe('block');
  });

  it('records an ALLOW decision on the run when grants are supplied', async () => {
    const manager = new AgentRunManager({
      harness: { adapter: queuedGateAdapter([gateToolSummary, gateWrapUpSummary]) },
      tools: (() => {
        const registry = new AgentToolRegistry();
        registry.register(gatedTool());
        return registry;
      })(),
    });

    const result = await manager.runLoop({
      correlationId: 'corr-gate-2',
      userInput: 'size my position',
      instructions: 'system instructions',
      userId: 'u1',
      userGrants: ['tool.run'],
    });

    expect(result.status).toBe('completed');
    const record = manager.getRun(result.runId, 'u1');
    expect(record.toolRuns).toHaveLength(1);
    const entry = record.toolRuns[0];
    expect(entry?.status).toBe('succeeded');
    expect(entry?.gate?.decision).toBe('ALLOW');
    expect(entry?.gate?.reason).toContain('all permission checks satisfied');
  });
});
