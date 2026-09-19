/**
 * Minimal end-to-end demo: user asks about position sizing; the model
 * requests the deterministic tool; the orchestrator checks permissions and
 * records provenance. Run with: npm run build && npm run agent:demo
 */

import {
  InMemoryStore,
  Orchestrator,
  defaultToolRegistry,
  loadInstructions,
  scriptedModelAdapter,
  safetyProfile,
} from '../index.js';

const orchestrator = new Orchestrator({
  tools: defaultToolRegistry(),
  instructions: loadInstructions(),
  memory: new InMemoryStore(),
  safety: safetyProfile(),
  model: scriptedModelAdapter,
});

const result = orchestrator.run('How do I calculate my position size with 1% risk per trade?');

console.log('status:', result.status);
if (result.status === 'completed') {
  for (const s of result.statements) {
    console.log(`[${s.kind}] ${s.text} (sources: ${s.sources.join(', ') || 'none'})`);
  }
}
console.log('final state:', orchestrator.state());
