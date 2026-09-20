import { describe, expect, it } from 'vitest';
import { InMemoryStore } from '../src/memory/store.js';
import { Orchestrator } from '../src/agent/orchestrator.js';
import { defaultToolRegistry } from '../packages/trading-engine/src/index.js';
import { loadInstructions } from '../src/instructions/loader.js';
import { scriptedModelAdapter } from '../src/agent/orchestrator.js';
import { DEFAULT_SAFETY_PROFILE } from '../packages/shared/src/types.js';
import { evaluate } from '../src/evaluation/harness.js';

describe('evaluation harness', () => {
  it('passes all Phase 1 invariants with the scripted model', () => {
    const orch = new Orchestrator({
      tools: defaultToolRegistry(),
      instructions: loadInstructions(),
      memory: new InMemoryStore(),
      safety: DEFAULT_SAFETY_PROFILE,
      model: scriptedModelAdapter,
    });
    const reports = evaluate(orch);
    for (const r of reports) {
      expect(r.failures, r.scenario).toEqual([]);
      expect(r.passed).toBe(true);
    }
  });
});
