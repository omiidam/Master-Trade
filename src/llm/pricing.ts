/**
 * Model pricing table.
 *
 * Cost is computed **here**, from our own table, never taken from the provider's
 * response. A provider that reports its own spend is a provider that can
 * under-report it, and the monthly budget is a safety control — so the number the
 * budget is enforced against must be one we can derive ourselves.
 *
 * Consequence: a model that is not in this table is *unpriced*. An unpriced model
 * cannot be budgeted, and `LlmGateway` refuses to call it while budget
 * enforcement is on (`requirePricedModels`). Adding a model is therefore a
 * deliberate act: look up the price, add a row, and the change is visible in
 * review.
 *
 * Prices are **indicative list prices in USD per 1M tokens** for the hosted
 * providers and must be reviewed when a provider changes its pricing. Locally
 * hosted models are genuinely free at the margin, so they are priced at 0 on
 * purpose — that is a fact about self-hosting, not a placeholder.
 */

import type { LlmProviderId } from './provider.js';
import type { LlmTokenUsage } from './provider.js';

export interface ModelPrice {
  provider: LlmProviderId;
  /** Model id exactly as it appears in configuration and provider responses. */
  model: string;
  /** USD per 1,000,000 input (prompt) tokens. */
  inputPer1M: number;
  /** USD per 1,000,000 output (completion) tokens. */
  outputPer1M: number;
  note: string;
}

export const MODEL_PRICES: readonly ModelPrice[] = [
  {
    provider: 'scripted',
    model: 'scripted-v1',
    inputPer1M: 0,
    outputPer1M: 0,
    note: 'In-process deterministic adapter: no network, no provider, no spend.',
  },
  {
    provider: 'openai',
    model: 'gpt-4o-mini',
    inputPer1M: 0.15,
    outputPer1M: 0.6,
    note: 'Indicative list price; review on provider pricing changes.',
  },
  {
    provider: 'openai',
    model: 'gpt-4o',
    inputPer1M: 2.5,
    outputPer1M: 10,
    note: 'Indicative list price; review on provider pricing changes.',
  },
  {
    provider: 'anthropic',
    model: 'claude-3-5-haiku-latest',
    inputPer1M: 0.8,
    outputPer1M: 4,
    note: 'Indicative list price; review on provider pricing changes.',
  },
  {
    provider: 'anthropic',
    model: 'claude-sonnet-4-latest',
    inputPer1M: 3,
    outputPer1M: 15,
    note: 'Indicative list price; review on provider pricing changes.',
  },
  {
    provider: 'local-openai-compatible',
    model: 'local-model',
    inputPer1M: 0,
    outputPer1M: 0,
    note: 'Self-hosted (llama.cpp, Ollama, LM Studio, vLLM): no per-token spend.',
  },
];

/** Look up the price row for a provider/model pair. */
export function findPrice(provider: LlmProviderId, model: string): ModelPrice | undefined {
  return MODEL_PRICES.find((price) => price.provider === provider && price.model === model);
}

export interface PricedUsage {
  costUsd: number;
  /** False when the model has no price row: the cost is unknown, not zero. */
  priced: boolean;
}

/**
 * Cost of one call, from token counts and the price table.
 *
 * Rounded to 6 decimal places: a single cheap call costs fractions of a cent and
 * we do not want floating-point dust to accumulate into the budget total.
 */
export function priceUsage(
  provider: LlmProviderId,
  model: string,
  tokens: LlmTokenUsage,
): PricedUsage {
  const price = findPrice(provider, model);
  if (!price) return { costUsd: 0, priced: false };
  const costUsd =
    (tokens.promptTokens * price.inputPer1M + tokens.completionTokens * price.outputPer1M) /
    1_000_000;
  return { costUsd: Math.round(costUsd * 1e6) / 1e6, priced: true };
}

/** A one-line description of the table, for diagnostics endpoints. */
export function pricingSummary(): { models: number; providers: LlmProviderId[] } {
  return {
    models: MODEL_PRICES.length,
    providers: [...new Set(MODEL_PRICES.map((price) => price.provider))],
  };
}
