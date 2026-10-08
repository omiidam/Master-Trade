/**
 * ArvanCloud AI adapter (`https://api.arvancloudai.ir`).
 *
 * ArvanCloud speaks the OpenAI Chat Completions wire protocol, so the payload
 * mapping is the existing OpenAI-compatible adapter's; what differs is only the
 * credential scheme — ArvanCloud expects `Authorization: apikey <key>`, not the
 * `Bearer` scheme. That difference is expressed once, here, through the
 * transport's `authHeader` override: no second payload builder, no second
 * error taxonomy, no second reasoning-dropping rule.
 *
 * ADR-0063. Adding a provider still means: implement `LlmProvider` (here, by
 * composing one), add a price row per model in `../pricing.ts`, register it in
 * `../registry.ts`. Nothing above `src/llm/providers/` changes.
 */

import { AppError } from '../../../packages/shared/src/core/errors.js';
import type { LlmProvider } from '../provider.js';
import { openAiCompatibleProvider } from './openaiCompatible.js';
import type { FetchLike } from './http.js';

/**
 * ArvanCloud AI's hosted endpoint, unless configuration says otherwise.
 *
 * The `/v1` prefix is the OpenAI-compatible mount the live service answers on:
 * `/chat/completions` without it returns 404 ("route not found"), verified
 * against the real API in Phase 2.13 when the alpha chat first drove it end to
 * end — the adapter's sibling defaults (`openai`, `local-openai-compatible`)
 * already carry their `/v1`.
 */
export const ARVANCLOUD_DEFAULT_BASE_URL = 'https://api.arvancloudai.ir/v1';

export interface ArvanCloudOptions {
  baseUrl?: string;
  apiKey: string | null;
  models: readonly string[];
  fetchImpl?: FetchLike;
}

/**
 * Build the ArvanCloud provider. The credential is required: a hosted endpoint
 * without a key would only produce a confusing 401 on the first user question,
 * so the fault is a start-up configuration error instead.
 */
export function arvanCloudProvider(options: ArvanCloudOptions): LlmProvider {
  const apiKey = options.apiKey;
  if (!apiKey) {
    throw new AppError(
      'FORBIDDEN',
      'Provider "arvancloud" requires a credential; configuration holds a SecretRef that must resolve to a key',
      { details: { provider: 'arvancloud' } },
    );
  }
  return openAiCompatibleProvider({
    id: 'arvancloud',
    baseUrl: options.baseUrl ?? ARVANCLOUD_DEFAULT_BASE_URL,
    apiKey,
    models: options.models,
    requireApiKey: true,
    // ArvanCloud's scheme: `apikey <key>`, deliberately not `Bearer`. The value
    // is built here and travels in the Authorization header only — it cannot
    // reach an error message, a detail object or a log field (providers/http.ts).
    authHeader: { name: 'authorization', value: `apikey ${apiKey}` },
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });
}
