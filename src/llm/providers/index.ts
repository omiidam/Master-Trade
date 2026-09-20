/**
 * Provider adapters.
 *
 * This is the **only** directory where a provider SDK or provider-shaped payload
 * may appear (`PROVIDER_SDK_SCOPE` in `src/core/architectureLock.ts`); a test
 * fails the build if such an import leaks anywhere else. Everything above this
 * directory talks to the `LlmProvider` interface.
 *
 * Adding a provider means: implement `LlmProvider`, add a price row for each
 * model in `../pricing.ts`, register it with the gateway. No orchestration,
 * permission or storage code changes.
 */

export { scriptedLlmProvider, type ScriptedLlmProviderOptions } from './scripted.js';

export {
  openAiCompatibleProvider,
  DROPPED_REASONING_FIELDS,
  type OpenAiCompatibleOptions,
} from './openaiCompatible.js';

export {
  anthropicProvider,
  splitAnthropicMessages,
  mapAnthropicContent,
  ANTHROPIC_VERSION,
  DROPPED_BLOCK_TYPES,
  type AnthropicOptions,
} from './anthropic.js';

export {
  postJson,
  httpError,
  readProviderMessage,
  resolveFetch,
  asProviderError,
  type FetchLike,
  type HttpProviderDeps,
} from './http.js';
