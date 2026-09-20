/**
 * AI-layer demo: the async turn, end to end, with no key and no network.
 *
 * It shows what Phase 3.5 actually guarantees, on a fresh checkout:
 *   - the gateway is built from configuration (`createAiGateway`) and degrades to
 *     the offline scripted provider, saying so rather than failing;
 *   - the answer arrives in the structured-summary contract, so there is no
 *     free-form text and no chain-of-thought, and uncertainty is a real field;
 *   - the tool the model asks for is executed by the **orchestrator**, after a
 *     permission check — the model never runs anything;
 *   - tokens and cost are reported from our own price table.
 *
 * Run with: npm run build && npm run ai:demo
 * With a hosted provider configured (endpoint + SecretRef) the same code path
 * answers from that provider instead; nothing below changes.
 */

import {
  AgentService,
  InMemoryStore,
  createAiGateway,
  createLlmModelAdapter,
  defaultToolRegistry,
  loadInstructions,
  safetyProfile,
} from '../index.js';

const registration = createAiGateway({
  primary: { provider: 'scripted', model: 'scripted-v1', maxTokensPerRequest: 2_048 },
  fallbacks: [],
  requestTimeoutMs: 30_000,
  maxRetries: 2,
  retry: { attempts: 3, baseDelayMs: 200, maxDelayMs: 5_000, jitter: true },
  monthlyBudgetUsd: 25,
});

console.log('registered providers:', registration.providers.join(', '));
console.log(
  'endpoint chain:',
  registration.endpoints.map((endpoint) => `${endpoint.provider}:${endpoint.model}`).join(' → '),
);
for (const warning of registration.warnings) console.log('warning:', warning);

const memory = new InMemoryStore();
const service = new AgentService({
  memory,
  tools: defaultToolRegistry(),
  instructions: loadInstructions(),
  safety: safetyProfile(),
  asyncModel: createLlmModelAdapter({ gateway: registration.gateway }),
});
const show = async (question: string): Promise<void> => {
  console.log(`\n── question: ${question}`);
  const turn = await service.runAsync(question, { correlationId: 'ai-demo' });
  if (turn.status === 'blocked') {
    console.log('blocked:', turn.reason);
    return;
  }
  console.log('provider:', turn.provider, '·', turn.model);
  for (const statement of turn.summary?.statements ?? []) {
    console.log(
      `  [${statement.kind}] ${statement.text} (sources: ${statement.sources.join(', ') || 'none'})`,
    );
  }
  for (const note of turn.summary?.uncertainty ?? []) console.log(`  [uncertainty] ${note}`);
  for (const execution of turn.toolExecutions) {
    console.log(
      execution.ok
        ? `  [tool] ${execution.tool} v${execution.version} → ${JSON.stringify(execution.value)}`
        : `  [tool] ${execution.tool} failed: ${execution.error}`,
    );
  }
  console.log(
    `tokens: ${turn.usage?.promptTokens ?? 0} in / ${turn.usage?.completionTokens ?? 0} out · cost: $${turn.usage?.costUsd ?? 0}`,
  );
};

await show('What is my position size with 1% risk per trade?');
await show('Buy 100 shares of AAPL and place an order.');

console.log(
  '\ntool runs recorded in memory:',
  memory.all().filter((e) => e.origin.type === 'tool').length,
);
console.log('final agent state:', service.state());
console.log(
  '\nNote: the offline adapter answered. With a hosted provider configured, the same turn would come from that provider — the parser, permission check and cost accounting are unchanged.',
);
