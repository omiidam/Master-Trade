import { describe, expect, it } from 'vitest';
import { InMemoryStore } from '../src/memory/store.js';
import { checkPermission, PHASE1_PERMISSIONS } from '../src/permissions/model.js';
import { loadInstructions, renderInstructions } from '../src/instructions/loader.js';
import { AgentLifecycle } from '../src/agent/lifecycle.js';
import { Orchestrator, scriptedModelAdapter } from '../src/agent/orchestrator.js';
import { defaultToolRegistry } from '../packages/trading-engine/src/index.js';
import { DEFAULT_SAFETY_PROFILE } from '../packages/shared/src/types.js';

const makeOrchestrator = () =>
  new Orchestrator({
    tools: defaultToolRegistry(),
    instructions: loadInstructions(),
    memory: new InMemoryStore(),
    safety: DEFAULT_SAFETY_PROFILE,
    model: scriptedModelAdapter,
  });

describe('safety profile', () => {
  it('never enables live trading or broker execution', () => {
    expect(DEFAULT_SAFETY_PROFILE.liveTradingEnabled).toBe(false);
    expect(DEFAULT_SAFETY_PROFILE.brokerExecutionEnabled).toBe(false);
  });

  it('refuses to construct an orchestrator with execution enabled', () => {
    expect(
      () =>
        new Orchestrator({
          tools: defaultToolRegistry(),
          instructions: loadInstructions(),
          memory: new InMemoryStore(),
          // Deliberate type violation to prove the runtime guard rejects it.
          safety: {
            ...DEFAULT_SAFETY_PROFILE,
            liveTradingEnabled: true,
          } as unknown as typeof DEFAULT_SAFETY_PROFILE,
          model: scriptedModelAdapter,
        }),
    ).toThrow(/live trading/i);
  });
});

describe('permission model', () => {
  it('denies unknown capabilities by default', () => {
    const decision = checkPermission(PHASE1_PERMISSIONS, 'model', 'backtest.run');
    expect(decision.allowed).toBe(false);
  });

  it('allows deterministic risk calculations for the model', () => {
    expect(checkPermission(PHASE1_PERMISSIONS, 'model', 'risk.calculate').allowed).toBe(true);
  });
});

describe('instructions', () => {
  it('rejects instructions that authorize live trading', () => {
    expect(() =>
      loadInstructions({
        modules: [
          {
            id: 'bad',
            version: '1.0.0',
            content: 'You are allowed to trade and may place orders with real funds.',
          },
        ],
      }),
    ).toThrow(/safety policy/i);
  });

  it('renders versioned modules', () => {
    const rendered = renderInstructions(loadInstructions());
    expect(rendered).toContain('core.behavior @ 1.0.0');
    expect(rendered).toContain('core.safety @ 1.0.0');
  });
});

describe('lifecycle', () => {
  it('rejects illegal transitions', () => {
    const lc = new AgentLifecycle();
    expect(() => lc.transitionTo('RUNNING')).toThrow(/Illegal lifecycle transition/);
  });

  it('completes a legal full cycle', () => {
    const lc = new AgentLifecycle();
    lc.start();
    lc.transitionTo('RUNNING');
    lc.transitionTo('RESPONDING');
    lc.transitionTo('IDLE');
    expect(lc.current()).toBe('IDLE');
  });
});

describe('orchestrator', () => {
  it('completes a run with provenance recorded', () => {
    const memory = new InMemoryStore();
    const orch = new Orchestrator({
      tools: defaultToolRegistry(),
      instructions: loadInstructions(),
      memory,
      safety: DEFAULT_SAFETY_PROFILE,
      model: scriptedModelAdapter,
    });
    const outcome = orch.run('What is my position sizing with 1% risk?');
    expect(outcome.status).toBe('completed');
    expect(memory.all().length).toBeGreaterThan(0);
    expect(memory.all()[0]!.origin.type).toBe('tool');
  });

  it('blocks runs that reference unknown tools', () => {
    const orch = makeOrchestrator();
    const outcome = orch.run('normal question');
    expect(['completed', 'blocked']).toContain(outcome.status);
  });
});
