/**
 * AI gateway composition root.
 *
 * Configuration becomes a live gateway here and nowhere else. Three rules keep
 * provider independence real:
 *
 *   1. **The scripted adapter is always registered.** Offline operation is the
 *      default, not a fallback: with no key, no network and no configuration the
 *      system still runs.
 *   2. **A provider that cannot be built is skipped, with a reason.** A missing
 *      credential degrades to the next endpoint instead of crashing the app — but
 *      the reason is reported, so "it silently used the offline model" cannot
 *      happen without a record.
 *   3. **An unpriced model is a warning at composition, a refusal at call time.**
 *      The gateway refuses to call a model it cannot price (the budget would be
 *      unenforceable); this function says so before the first request rather than
 *      letting the operator discover it in an error.
 *
 * Secrets never appear here: a `SecretRef` is resolved by the caller (environment
 * or OS keychain) and only the resolved value reaches an adapter.
 */

import type { SecretRef } from '../core/config.js';
import type { Logger } from '../core/logging.js';
import type { RetryPolicy } from '../core/retry.js';
import { findPrice } from './pricing.js';
import {
  LlmGateway,
  UsageTracker,
  type CircuitBreakerConfig,
  type LlmEndpoint,
  type LlmGatewayConfig,
  type LlmProvider,
  type LlmProviderId,
} from './provider.js';
import {
  anthropicProvider,
  openAiCompatibleProvider,
  scriptedLlmProvider,
  type FetchLike,
} from './providers/index.js';

/** Where each hosted provider lives, unless configuration says otherwise. */
export const DEFAULT_BASE_URLS: Record<Exclude<LlmProviderId, 'scripted'>, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  'local-openai-compatible': 'http://127.0.0.1:11434/v1',
};

/** The offline endpoint, used when nothing else can be built. */
export const SCRIPTED_ENDPOINT: LlmEndpoint = {
  provider: 'scripted',
  model: 'scripted-v1',
  maxTokensPerRequest: 2_048,
};

export type SecretResolver = (ref: SecretRef) => string | null;

export interface ProviderSettings {
  provider: LlmProviderId;
  model: string;
  maxTokensPerRequest: number;
  /** Override the provider's default endpoint (e.g. a proxy or a local port). */
  baseUrl?: string;
  /** A pointer to the credential, never the credential. */
  secret?: SecretRef | null;
}

export interface AiGatewaySettings {
  primary: ProviderSettings;
  fallbacks: ProviderSettings[];
  requestTimeoutMs: number;
  maxRetries: number;
  retry: RetryPolicy;
  monthlyBudgetUsd: number;
  requirePricedModels?: boolean;
  circuitBreaker?: CircuitBreakerConfig;
}

export interface AiGatewayDeps {
  resolveSecret?: SecretResolver;
  logger?: Logger;
  fetchImpl?: FetchLike;
  tracker?: UsageTracker;
  now?: () => number;
}

export interface AiGatewayRegistration {
  gateway: LlmGateway;
  /** Provider ids registered, always including `scripted`. */
  providers: LlmProviderId[];
  /** The endpoint chain the gateway will actually try, in order. */
  endpoints: LlmEndpoint[];
  /** Configured endpoints that could not be built, and why. */
  skipped: { provider: LlmProviderId; model: string; reason: string }[];
  /** Non-fatal conditions worth logging at start-up. */
  warnings: string[];
}

function buildProvider(
  settings: ProviderSettings,
  resolveSecret: SecretResolver,
  fetchImpl?: FetchLike,
): { provider: LlmProvider } | { reason: string } {
  if (settings.provider === 'scripted') {
    // Handled by the caller: the offline adapter is always registered.
    return { reason: 'the scripted adapter is registered internally' };
  }
  const baseUrl = settings.baseUrl ?? DEFAULT_BASE_URLS[settings.provider];
  const fetchOption = fetchImpl ? { fetchImpl } : {};

  if (settings.provider === 'openai' || settings.provider === 'anthropic') {
    const secretRef = settings.secret ?? null;
    if (!secretRef) {
      return { reason: `no secret reference is configured for ${settings.provider}` };
    }
    const key = resolveSecret(secretRef);
    if (!key) {
      return {
        reason: `credential "${secretRef.kind}:${secretRef.name}" did not resolve to a value`,
      };
    }
    return settings.provider === 'openai'
      ? {
          provider: openAiCompatibleProvider({
            baseUrl,
            apiKey: key,
            models: [settings.model],
            ...fetchOption,
          }),
        }
      : {
          provider: anthropicProvider({
            baseUrl,
            apiKey: key,
            models: [settings.model],
            ...fetchOption,
          }),
        };
  }

  // A local server needs no credential: it is reached on the loopback port the
  // operator configured. A secret is still resolved if one is supplied, because
  // some wrappers require a token without checking it.
  const localKey = settings.secret ? resolveSecret(settings.secret) : null;
  return {
    provider: openAiCompatibleProvider({
      id: 'local-openai-compatible',
      baseUrl,
      apiKey: localKey,
      models: [settings.model],
      requireApiKey: false,
      ...fetchOption,
    }),
  };
}

/**
 * Build the gateway from settings. Never throws for a misconfigured endpoint: the
 * endpoint is skipped and reported, because losing a hosted provider should
 * degrade the system, not stop it.
 */
export function createAiGateway(
  settings: AiGatewaySettings,
  deps: AiGatewayDeps = {},
): AiGatewayRegistration {
  const resolveSecret: SecretResolver = deps.resolveSecret ?? (() => null);
  const providers = new Map<LlmProviderId, LlmProvider>();
  const skipped: AiGatewayRegistration['skipped'] = [];
  const warnings: string[] = [];

  /** The offline stand-in is always available, whatever the configuration says. */
  providers.set('scripted', scriptedLlmProvider({ models: [SCRIPTED_ENDPOINT.model] }));

  for (const endpoint of [settings.primary, ...settings.fallbacks]) {
    if (endpoint.provider === 'scripted' || providers.has(endpoint.provider)) continue;
    const built = buildProvider(endpoint, resolveSecret, deps.fetchImpl);
    if ('reason' in built) {
      skipped.push({ provider: endpoint.provider, model: endpoint.model, reason: built.reason });
      continue;
    }
    providers.set(endpoint.provider, built.provider);
    if (!findPrice(endpoint.provider, endpoint.model)) {
      warnings.push(
        `model "${endpoint.model}" (${endpoint.provider}) has no price row; the gateway will refuse to call it while budget enforcement is on`,
      );
    }
  }

  const configured = [settings.primary, ...settings.fallbacks].filter((endpoint) =>
    providers.has(endpoint.provider),
  );
  const endpoints = configured.length > 0 ? configured.map(endpointOf) : [SCRIPTED_ENDPOINT];
  if (configured.length === 0) {
    warnings.push(
      'No configured provider could be built: answers will come from the offline scripted adapter, not from a hosted model.',
    );
  }
  for (const entry of skipped) {
    warnings.push(
      `provider "${entry.provider}" (${entry.model}) is not available: ${entry.reason}`,
    );
  }

  const config: LlmGatewayConfig = {
    primary: endpoints[0] ?? SCRIPTED_ENDPOINT,
    fallbacks: endpoints.slice(1),
    requestTimeoutMs: settings.requestTimeoutMs,
    maxRetries: settings.maxRetries,
    retry: settings.retry,
    monthlyBudgetUsd: settings.monthlyBudgetUsd,
    requirePricedModels: settings.requirePricedModels ?? true,
    ...(settings.circuitBreaker ? { circuitBreaker: settings.circuitBreaker } : {}),
  };

  return {
    gateway: new LlmGateway({
      providers: [...providers.values()],
      config,
      ...(deps.logger ? { logger: deps.logger } : {}),
      ...(deps.tracker ? { tracker: deps.tracker } : {}),
      ...(deps.now ? { now: deps.now } : {}),
    }),
    providers: [...providers.keys()],
    endpoints,
    skipped,
    warnings,
  };
}

function endpointOf(settings: ProviderSettings): LlmEndpoint {
  return {
    provider: settings.provider,
    model: settings.model,
    maxTokensPerRequest: settings.maxTokensPerRequest,
  };
}
