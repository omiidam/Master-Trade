/**
 * LLM layer barrel.
 *
 * `provider.ts` holds the interfaces and the gateway (the only component that
 * knows about configuration, fallback, retry, timeout, pricing and budgets).
 * `providers/**` holds the adapters. `summary.ts`, `prompt.ts` and `pricing.ts`
 * hold the three contracts that make the layer auditable: what the model may
 * return, what it may see, and what a call is allowed to cost.
 */

export * from './provider.js';
export * from './pricing.js';
export * from './summary.js';
export * from './prompt.js';
export * from './registry.js';
export * from './providers/index.js';
