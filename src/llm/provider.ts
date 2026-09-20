/**
 * LLM abstraction layer.
 *
 * Core rule: business logic never contains provider-specific code. It talks to
 * `LlmProvider`, and only `LlmGateway` knows about configuration, fallbacks,
 * retries, timeouts, cost accounting and circuit breaking.
 *
 * Second core rule: the LLM can never bypass system permissions.
 * `LlmRequest` has **no** field that can execute anything. A provider may only
 * *return* `LlmToolCall` requests; executing them (after a permission check and
 * provenance recording) is the exclusive job of the agent orchestrator.
 *
 * Third core rule: a provider reports **tokens**, never money. Cost is derived
 * from our own price table in `pricing.ts`, so a provider cannot under-report
 * what it spent against the budget.
 */

import { AppError, toAppError } from '../../packages/shared/src/core/errors.js';
import type { Logger } from '../../packages/shared/src/core/logging.js';
import {
  DEFAULT_RETRY_POLICY,
  withRetry,
  withTimeout,
  type RetryPolicy,
} from '../../packages/shared/src/core/retry.js';
import { priceUsage } from './pricing.js';

export type LlmProviderId = 'scripted' | 'openai' | 'anthropic' | 'local-openai-compatible';

export type LlmRole = 'system' | 'user' | 'assistant' | 'tool';

export interface LlmMessage {
  role: LlmRole;
  content: string;
}

/** A request from the model to run a tool. Never an execution itself. */
export interface LlmToolCall {
  id: string;
  toolName: string;
  /** Raw arguments. Validated by the tool, after the permission check. */
  arguments: Record<string, unknown>;
}

export type LlmFinishReason = 'stop' | 'length' | 'tool_call' | 'error';

export interface LlmRequest {
  correlationId: string;
  model: string;
  messages: LlmMessage[];
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
}

/** What a provider is allowed to report: token counts, nothing else. */
export interface LlmTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Token counts plus the cost **we** computed. `priced: false` means the model has
 * no row in the price table, so the cost is unknown rather than zero.
 * `estimated: true` means the provider reported no counts and we derived them.
 */
export interface LlmUsage extends LlmTokenUsage {
  costUsd: number;
  priced: boolean;
  estimated: boolean;
}

/** What a provider returns. Usage is tokens only — the gateway costs it. */
export interface LlmProviderResponse {
  provider: LlmProviderId;
  model: string;
  text: string;
  toolCalls: LlmToolCall[];
  finishReason: LlmFinishReason;
  usage: LlmTokenUsage;
  latencyMs: number;
}

/** What the gateway returns to callers: the same, with cost attached. */
export interface LlmResponse extends Omit<LlmProviderResponse, 'usage'> {
  usage: LlmUsage;
}

/** Everything a provider implementation must expose. */
export interface LlmProvider {
  readonly id: LlmProviderId;
  readonly models: readonly string[];
  complete(request: LlmRequest, signal?: AbortSignal): Promise<LlmProviderResponse>;
}

export interface LlmEndpoint {
  provider: LlmProviderId;
  model: string;
  maxTokensPerRequest: number;
}

/**
 * Consecutive-failure circuit breaker. A provider that is down should stop being
 * called on every request, but it must not be written off for good either: after
 * `resetAfterMs` one request is allowed through to test the recovery.
 */
export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetAfterMs: number;
}

export const DEFAULT_CIRCUIT_BREAKER: CircuitBreakerConfig = {
  failureThreshold: 3,
  resetAfterMs: 60_000,
};

export interface LlmGatewayConfig {
  primary: LlmEndpoint;
  fallbacks: LlmEndpoint[];
  requestTimeoutMs: number;
  maxRetries: number;
  retry: RetryPolicy;
  monthlyBudgetUsd: number;
  /** Refuse to call a model with no price row (default true). */
  requirePricedModels?: boolean;
  circuitBreaker?: CircuitBreakerConfig;
}

export const EMPTY_USAGE: LlmUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  costUsd: 0,
  priced: true,
  estimated: false,
};

export const EMPTY_TOKEN_USAGE: LlmTokenUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
};

/** Token and cost accounting, used for budget enforcement and UI display. */
export class UsageTracker {
  private readonly records: LlmUsage[] = [];

  record(usage: LlmUsage): void {
    this.records.push(usage);
  }

  totals(): LlmUsage {
    return this.records.reduce<LlmUsage>(
      (acc, item) => ({
        promptTokens: acc.promptTokens + item.promptTokens,
        completionTokens: acc.completionTokens + item.completionTokens,
        totalTokens: acc.totalTokens + item.totalTokens,
        costUsd: Math.round((acc.costUsd + item.costUsd) * 1e6) / 1e6,
        priced: acc.priced && item.priced,
        estimated: acc.estimated || item.estimated,
      }),
      { ...EMPTY_USAGE },
    );
  }

  count(): number {
    return this.records.length;
  }

  /** True when at least one recorded call had no price row. */
  hasUnpricedUsage(): boolean {
    return this.records.some((record) => !record.priced);
  }

  remainingBudgetUsd(monthlyBudgetUsd: number): number {
    return Math.max(0, monthlyBudgetUsd - this.totals().costUsd);
  }
}

export interface LlmCompletionInput {
  correlationId: string;
  messages: LlmMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Override the configured model (still restricted to provider models). */
  model?: string;
}

export interface LlmGatewayDeps {
  providers: LlmProvider[];
  config: LlmGatewayConfig;
  tracker?: UsageTracker;
  logger?: Logger;
  now?: () => number;
}

interface CircuitState {
  consecutiveFailures: number;
  openedAt: number | null;
}

/**
 * Rough token estimate used only when a provider reports no usage at all
 * (~4 characters per token, the same rule as context assembly). This is the one
 * number we cannot get from a provider, and reporting 0 would silently make a
 * budget unenforceable.
 */
export function estimateTokensFromText(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export class LlmGateway {
  private readonly providers = new Map<LlmProviderId, LlmProvider>();
  private readonly config: LlmGatewayConfig;
  private readonly logger: Logger | undefined;
  private readonly now: () => number;
  private readonly breaker: CircuitBreakerConfig;
  private readonly circuits = new Map<LlmProviderId, CircuitState>();
  readonly tracker: UsageTracker;

  constructor(deps: LlmGatewayDeps) {
    this.config = deps.config;
    this.logger = deps.logger;
    this.tracker = deps.tracker ?? new UsageTracker();
    this.now = deps.now ?? (() => Date.now());
    this.breaker = deps.config.circuitBreaker ?? DEFAULT_CIRCUIT_BREAKER;
    for (const provider of deps.providers) {
      this.providers.set(provider.id, provider);
    }
  }

  /** Ordered attempt list: primary first, then fallbacks with a live provider. */
  endpoints(): LlmEndpoint[] {
    return [this.config.primary, ...this.config.fallbacks].filter((endpoint) =>
      this.providers.has(endpoint.provider),
    );
  }

  /**
   * Endpoints that are not currently circuit-broken. An open circuit is skipped
   * (not failed), so one broken provider cannot consume the whole attempt budget.
   */
  availableEndpoints(): LlmEndpoint[] {
    return this.endpoints().filter((endpoint) => !this.isCircuitOpen(endpoint.provider));
  }

  /** Visible for diagnostics and tests. */
  circuitState(): Record<string, { consecutiveFailures: number; open: boolean }> {
    const state: Record<string, { consecutiveFailures: number; open: boolean }> = {};
    for (const [provider, entry] of this.circuits) {
      state[provider] = {
        consecutiveFailures: entry.consecutiveFailures,
        open: this.isCircuitOpen(provider),
      };
    }
    return state;
  }

  async complete(input: LlmCompletionInput): Promise<LlmResponse> {
    const endpoints = this.endpoints();
    if (endpoints.length === 0) {
      throw new AppError('PROVIDER_UNAVAILABLE', 'No LLM provider is registered');
    }
    const available = this.availableEndpoints();
    if (available.length === 0) {
      throw new AppError('PROVIDER_UNAVAILABLE', 'Every LLM provider is circuit-broken', {
        details: { circuits: this.circuitState() },
      });
    }

    const spent = this.tracker.totals().costUsd;
    if (spent >= this.config.monthlyBudgetUsd) {
      throw new AppError('BUDGET_EXCEEDED', 'LLM monthly budget exhausted', {
        details: { budgetUsd: this.config.monthlyBudgetUsd, spentUsd: spent },
      });
    }

    const failures: { provider: LlmProviderId; model: string; error: string }[] = [];
    for (const endpoint of available) {
      this.assertModelIsPriced(endpoint);
      const provider = this.providers.get(endpoint.provider);
      if (!provider) continue;
      try {
        const response = await this.attempt(provider, endpoint, input);
        this.recordSuccess(endpoint.provider, response.usage);
        if (response.toolCalls.length > 0) {
          // Requests only. The orchestrator decides whether anything may run.
          this.logger?.info(
            'model requested tool calls (execution requires orchestrator permission check)',
            { tools: response.toolCalls.map((call) => call.toolName) },
            'llm.tool_calls.requested',
          );
        }
        return response;
      } catch (error) {
        const appError = toAppError(error);
        this.recordFailure(endpoint.provider);
        failures.push({
          provider: endpoint.provider,
          model: endpoint.model,
          error: appError.message,
        });
        this.logger?.warn(
          'llm endpoint failed',
          { provider: endpoint.provider, model: endpoint.model, code: appError.code },
          'llm.endpoint.failed',
        );
      }
    }

    throw new AppError('PROVIDER_UNAVAILABLE', 'All LLM endpoints failed', {
      details: { failures },
    });
  }

  /**
   * Cost tracking is a control, not a display: an unpriced model cannot be
   * budgeted, so it is refused while `requirePricedModels` holds.
   */
  private assertModelIsPriced(endpoint: LlmEndpoint): void {
    if (this.config.requirePricedModels === false) return;
    const price = priceUsage(endpoint.provider, endpoint.model, EMPTY_TOKEN_USAGE);
    if (price.priced) return;
    throw new AppError(
      'POLICY_VIOLATION',
      `Refusing to call unpriced model "${endpoint.model}" (${endpoint.provider}): cost tracking cannot enforce the budget without a price row`,
      { details: { provider: endpoint.provider, model: endpoint.model } },
    );
  }

  private isCircuitOpen(provider: LlmProviderId): boolean {
    const state = this.circuits.get(provider);
    if (!state || state.openedAt === null) return false;
    if (this.now() - state.openedAt >= this.breaker.resetAfterMs) return false;
    return true;
  }

  private recordFailure(provider: LlmProviderId): void {
    const state = this.circuits.get(provider) ?? { consecutiveFailures: 0, openedAt: null };
    state.consecutiveFailures += 1;
    if (state.consecutiveFailures >= this.breaker.failureThreshold) {
      state.openedAt = this.now();
      this.logger?.warn(
        'llm provider circuit opened',
        { provider, consecutiveFailures: state.consecutiveFailures },
        'llm.circuit.opened',
      );
    }
    this.circuits.set(provider, state);
  }

  private recordSuccess(provider: LlmProviderId, usage: LlmUsage): void {
    this.circuits.set(provider, { consecutiveFailures: 0, openedAt: null });
    this.tracker.record(usage);
  }

  private async attempt(
    provider: LlmProvider,
    endpoint: LlmEndpoint,
    input: LlmCompletionInput,
  ): Promise<LlmResponse> {
    const request: LlmRequest = {
      correlationId: input.correlationId,
      model: input.model ?? endpoint.model,
      messages: input.messages,
      maxTokens: Math.min(
        input.maxTokens ?? endpoint.maxTokensPerRequest,
        endpoint.maxTokensPerRequest,
      ),
      temperature: input.temperature ?? 0.2,
      timeoutMs: this.config.requestTimeoutMs,
    };

    const raw = await withRetry(
      () =>
        withTimeout((signal) => provider.complete(request, signal), this.config.requestTimeoutMs, {
          what: `llm:${provider.id}`,
          correlationId: request.correlationId,
        }),
      { ...this.config.retry, attempts: Math.max(1, this.config.maxRetries + 1) },
      { shouldRetry: (error) => (error instanceof AppError ? error.retryable : false) },
    );

    return { ...raw, usage: this.price(raw, request) };
  }

  /**
   * Attach cost. Provider-reported money is not consulted at all, and the price is
   * looked up by the model **we configured**, not the model the provider says it
   * used: a response is not a trustworthy source for what the call cost.
   */
  private price(response: LlmProviderResponse, request: LlmRequest): LlmUsage {
    const reported = response.usage;
    const hasCounts =
      reported.promptTokens > 0 || reported.completionTokens > 0 || reported.totalTokens > 0;
    const tokens: LlmTokenUsage = hasCounts
      ? {
          promptTokens: reported.promptTokens,
          completionTokens: reported.completionTokens,
          totalTokens:
            reported.totalTokens > 0
              ? reported.totalTokens
              : reported.promptTokens + reported.completionTokens,
        }
      : {
          promptTokens: estimateTokensFromText(
            request.messages.map((message) => message.content).join('\n'),
          ),
          completionTokens: estimateTokensFromText(response.text),
          totalTokens: 0,
        };
    if (!hasCounts) tokens.totalTokens = tokens.promptTokens + tokens.completionTokens;

    const priced = priceUsage(response.provider, request.model, tokens);
    return { ...tokens, costUsd: priced.costUsd, priced: priced.priced, estimated: !hasCounts };
  }
}

export * from './providers/scripted.js';

/** Default retry policy exported for config wiring. */
export const LLM_DEFAULT_RETRY: RetryPolicy = DEFAULT_RETRY_POLICY;
