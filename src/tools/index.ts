import { ToolRegistry } from './framework.js';
import { positionSizeTool, rMultipleTool } from './risk.js';
import { smaTool, syntheticSeriesTool } from './marketData.js';

/** Build the default Phase 1 registry (all deterministic, side-effect free). */
export function defaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(positionSizeTool);
  registry.register(rMultipleTool);
  registry.register(syntheticSeriesTool);
  registry.register(smaTool);
  return registry;
}
