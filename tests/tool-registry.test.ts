/**
 * Tool Registry tests.
 *
 * The registry is the one server-side execution path for agent tools. Every
 * gate the module claims — identity, existence, approval, permissions
 * (reused from `src/permissions/model.ts`, never re-implemented), input
 * validation, execution under a timeout, output validation — is pinned here
 * as behaviour, along with the status/error records and the contract
 * invariants enforced at registration.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AgentToolRegistry, type AgentToolRunOutcome } from '../src/agent/tools/registry.js';
import type { AgentTool, AgentToolContext } from '../src/agent/tools/contracts.js';
import { AppError } from '../packages/shared/src/core/errors.js';

const context: AgentToolContext = {
  userId: 'user-1',
  runId: 'run-1',
  correlationId: 'corr-1',
  userGrants: ['tool.run'],
  runState: 'running',
};

type RiskInput = { equity: number; riskPercent: number };
type RiskOutput = { shares: number; riskPercent: number };
type RiskTool = AgentTool<RiskInput, RiskOutput> & {
  calls: { input: RiskInput; context: AgentToolContext }[];
};

/** A deterministic, allowed (risk.calculate) tool that records its calls. */
function riskTool(overrides: Partial<AgentTool<RiskInput, RiskOutput>> = {}): RiskTool {
  const calls: { input: RiskInput; context: AgentToolContext }[] = [];
  const tool: AgentTool<RiskInput, RiskOutput> = {
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
    async execute(input, toolContext) {
      calls.push({ input, context: toolContext });
      return {
        shares: Math.floor((input.equity * (input.riskPercent / 100)) / 50),
        riskPercent: input.riskPercent,
      };
    },
    ...overrides,
  };
  return Object.assign(tool, { calls });
}

function registryWith(
  tool: RiskTool,
  options: ConstructorParameters<typeof AgentToolRegistry>[0] = {},
) {
  const registry = new AgentToolRegistry(options);
  registry.register(tool);
  return { registry, tool };
}

describe('tool registry — registration and discovery', () => {
  it('registers a valid tool and exposes its contract for discovery', () => {
    const { registry } = registryWith(riskTool());

    const listed = registry.list();
    expect(listed).toHaveLength(1);
    const descriptor = listed[0];
    expect(descriptor).toMatchObject({
      name: 'risk.positionSize',
      version: '1.0.0',
      category: 'general',
      capabilities: ['risk.calculate'],
      riskLevel: 'low',
      timeoutMs: 1_000,
      requiresApproval: false,
      sideEffects: false,
    });
    expect(registry.get('risk.positionSize')).toEqual(descriptor);
    expect(registry.get('nope')).toBeUndefined();
  });

  it('rejects a duplicate name', () => {
    const { registry } = registryWith(riskTool());
    expect(() => registry.register(riskTool())).toThrow(AppError);
  });

  it('enforces the contract invariants at registration', () => {
    const base = riskTool();
    const cases: Partial<AgentTool<RiskInput, RiskOutput>>[] = [
      { name: 'Bad Name' },
      { version: 'not-semver' },
      { description: '   ' },
      { capabilities: [] },
      { timeoutMs: 0 },
      { riskLevel: 'critical', requiresApproval: false },
      { sideEffects: true, requiresApproval: false },
      { category: 'trading', requiresApproval: false },
    ];
    for (const overrides of cases) {
      const broken = riskTool({ ...overrides });
      expect(() => new AgentToolRegistry().register(broken), JSON.stringify(overrides)).toThrow(
        AppError,
      );
    }
    expect(base.name).toBe('risk.positionSize');
  });
});

describe('tool registry — the invoke gates', () => {
  it('executes a valid call: input parsed, context passed, output validated, record kept', async () => {
    const { registry, tool } = registryWith(riskTool());

    const outcome = await registry.invoke('risk.positionSize', { equity: 10_000 }, context);

    expect(outcome.status).toBe('succeeded');
    expect(outcome.output).toEqual({ shares: 2, riskPercent: 1 });
    expect(outcome.timedOut).toBe(false);
    expect(outcome.durationMs).toBeGreaterThanOrEqual(0);
    // The tool received the *parsed* input (default applied) and the exact isolation scope.
    expect(tool.calls).toHaveLength(1);
    const call = tool.calls[0];
    expect(call?.input).toEqual({ equity: 10_000, riskPercent: 1 });
    expect(call?.context).toEqual(context);

    const records = registry.records();
    expect(records).toHaveLength(1);
    const record = records[0];
    expect(record).toMatchObject({
      toolName: 'risk.positionSize',
      toolVersion: '1.0.0',
      userId: 'user-1',
      runId: 'run-1',
      correlationId: 'corr-1',
      status: 'succeeded',
    });
  });

  it('refuses invalid input before execute is ever called', async () => {
    const { registry, tool } = registryWith(riskTool());

    const outcome = await registry.invoke('risk.positionSize', { equity: -5 }, context);

    expect(outcome.status).toBe('refused');
    expect(outcome.refusalReason).toBe('invalid-input');
    expect(outcome.detail).toContain('equity');
    expect(tool.calls).toHaveLength(0);
    expect(registry.records()[0]?.status).toBe('refused');
  });

  it('fails a tool whose output violates its own schema — nothing unvalidated returns', async () => {
    const broken = riskTool({
      async execute() {
        return { shares: 'many' } as unknown as { shares: number; riskPercent: number };
      },
    });
    const registry = new AgentToolRegistry();
    registry.register(broken);

    const outcome = await registry.invoke('risk.positionSize', { equity: 10_000 }, context);

    expect(outcome.status).toBe('failed');
    expect(outcome.detail).toContain('shares');
    expect(outcome.output).toBeUndefined();
    expect(registry.records()[0]?.status).toBe('failed');
  });

  it('refuses an unknown tool, a denied capability, and an unapproved tool', async () => {
    const { registry } = registryWith(riskTool());

    const unknown = await registry.invoke('does.notExist', {}, context);
    expect(unknown.status).toBe('refused');
    expect(unknown.refusalReason).toBe('unknown-tool');

    // `backtest.run` has no model rule that allows it — deny-by-default.
    const denied = registryWith(
      riskTool({ name: 'backtest.run', capabilities: ['backtest.run'] }),
    ).registry;
    const deniedOutcome = await denied.invoke('backtest.run', {}, context);
    expect(deniedOutcome.status).toBe('refused');
    expect(deniedOutcome.refusalReason).toBe('permission-denied');
    // `backtest.run` has an explicit model rule set to false; its rationale is the reason.
    expect(deniedOutcome.detail).toContain('later phase');

    // requiresApproval with no approval seam: refused, never run.
    const gated = new AgentToolRegistry();
    gated.register(riskTool({ name: 'trade.manual', requiresApproval: true }));
    const unapproved = await gated.invoke('trade.manual', {}, context);
    expect(unapproved.status).toBe('refused');
    expect(unapproved.refusalReason).toBe('approval-required');
  });

  it('runs an approval-required tool only when the approval seam says an approval exists', async () => {
    let approved = false;
    const gated = new AgentToolRegistry({
      isApproved: (toolName) => toolName === 'trade.manual' && approved,
    });
    gated.register(riskTool({ name: 'trade.manual', requiresApproval: true, riskLevel: 'high' }));

    const before = await gated.invoke('trade.manual', { equity: 10_000 }, context);
    expect(before.status).toBe('refused');
    expect(before.refusalReason).toBe('approval-required');

    approved = true;
    const after = await gated.invoke('trade.manual', { equity: 10_000 }, context);
    expect(after.status).toBe('succeeded');
    expect(after.output).toEqual({ shares: 2, riskPercent: 1 });
  });

  it('enforces the tool timeout and records a clean, timed-out outcome', async () => {
    const slow = riskTool({
      timeoutMs: 30,
      async execute() {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        return { shares: 1, riskPercent: 1 };
      },
    });
    const registry = new AgentToolRegistry();
    registry.register(slow);

    const outcome = await registry.invoke('risk.positionSize', { equity: 10_000 }, context);
    expect(outcome.status).toBe('timeout');
    expect(outcome.timedOut).toBe(true);
    expect(registry.records()[0]?.status).toBe('timeout');
  });

  it('turns a throwing tool into a failed outcome, not a thrown run', async () => {
    const broken = riskTool({
      async execute() {
        throw new Error('price feed unavailable');
      },
    });
    const registry = new AgentToolRegistry();
    registry.register(broken);

    const outcome = await registry.invoke('risk.positionSize', { equity: 10_000 }, context);
    expect(outcome.status).toBe('failed');
    expect(outcome.detail).toBe('price feed unavailable');
  });
});

describe('tool registry — isolation and records', () => {
  it('throws on a malformed isolation scope: no invocation without a user and run', async () => {
    const { registry } = registryWith(riskTool());
    const bad: AgentToolContext = { userId: '', runId: 'run-1' };
    await expect(registry.invoke('risk.positionSize', {}, bad)).rejects.toThrow(AppError);
    await expect(
      registry.invoke('risk.positionSize', {}, { userId: 'u' } as AgentToolContext),
    ).rejects.toThrow(AppError);
    expect(registry.records()).toHaveLength(0);
  });

  it('scopes records to the user and run that invoked them', async () => {
    const { registry } = registryWith(riskTool());
    await registry.invoke('risk.positionSize', { equity: 1_000 }, context);
    await registry.invoke(
      'risk.positionSize',
      { equity: 2_000 },
      { userId: 'user-2', runId: 'run-2', userGrants: ['tool.run'], runState: 'running' },
    );

    expect(registry.records({ userId: 'user-1' })).toHaveLength(1);
    expect(registry.records({ userId: 'user-2' })).toHaveLength(1);
    expect(registry.records({ runId: 'run-1' })[0]?.userId).toBe('user-1');
    expect(registry.records({ status: 'succeeded' })).toHaveLength(2);
  });

  it('keeps the record log bounded, evicting the oldest', async () => {
    const { registry } = registryWith(riskTool(), { maxRecords: 2 });
    const run = (n: number): Promise<AgentToolRunOutcome> =>
      registry.invoke('risk.positionSize', { equity: n }, context);
    await run(1);
    await run(2);
    await run(3);

    const records = registry.records();
    expect(records).toHaveLength(2);
    expect(records.map((record) => record.userId)).toEqual(['user-1', 'user-1']);
  });
});
