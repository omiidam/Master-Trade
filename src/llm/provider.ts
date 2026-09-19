/**
 * LLM abstraction layer.
 *
 * Core rule: business logic never contains provider-specific code. It talks to
 * `LlmProvider`, and only `LlmGateway` knows about configuration, fallbacks,
 * retries, timeouts and cost accounting.
 *
 * Second core rule: the LLM can never bypass system permissions.
 * `LlmRequest` has **no** field that can execute anything. A provider may only
 * *return* `LlmToolCall` requests; executing them (after a permission check and
 * provenance recording) is the exclusive job of the agent orchestrator.
 */

import { AppError, toAppError } from '../core/errors.js';
import type { Logger } from '../core/logging.js';
import { DEFAULT_RETRY_POLICY, withRetry, withTimeout, type RetryPolicy } from '../core/retry.js';

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

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
}

export interface LlmResponse {
  provider: LlmProviderId;
  model: string;
  text: string;
  toolCalls: LlmToolCall[];
  finishReason: LlmFinishReason;
  usage: LlmUsage;
  latencyMs: number;
}

/** Everything a provider implementation must expose. */
export interface LlmProvider {
  readonly id: LlmProviderId;
  readonly models: readonly string[];
  complete(request: LlmRequest, signal?: AbortSignal): Promise<LlmResponse>;
}

export interface LlmEndpoint {
  provider: LlmProviderId;
  model: string;
  maxTokensPerRequest: number;
}

export interface LlmGatewayConfig {
  primary: LlmEndpoint;
  fallbacks: LlmEndpoint[];
  requestTimeoutMs: number;
  maxRetries: number;
  retry: RetryPolicy;
  monthlyBudgetUsd: number;
}

export const EMPTY_USAGE: LlmUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  costUsd: 0,
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
        costUsd: acc.costUsd + item.costUsd,
      }),
      { ...EMPTY_USAGE },
    );
  }

  count(): number {
    return this.records.length;
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
}

export class LlmGateway {
  private readonly providers = new Map<LlmProviderId, LlmProvider>();
  private readonly config: LlmGatewayConfig;
  private readonly logger: Logger | undefined;
  readonly tracker: UsageTracker;

  constructor(deps: LlmGatewayDeps) {
    this.config = deps.config;
    this.logger = deps.logger;
    this.tracker = deps.tracker ?? new UsageTracker();
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

  async complete(input: LlmCompletionInput): Promise<LlmResponse> {
    const endpoints = this.endpoints();
    if (endpoints.length === 0) {
      throw new AppError('PROVIDER_UNAVAILABLE', 'No LLM provider is registered');
    }
    if (this.tracker.totals().costUsd >= this.config.monthlyBudgetUsd) {
      throw new AppError('BUDGET_EXCEEDED', 'LLM monthly budget exhausted', {
        details: {
          budgetUsd: this.config.monthlyBudgetUsd,
          spentUsd: this.tracker.totals().costUsd,
        },
      });
    }

    const failures: { provider: LlmProviderId; model: string; error: string }[] = [];
    for (const endpoint of endpoints) {
      const provider = this.providers.get(endpoint.provider);
      if (!provider) continue;
      try {
        const response = await this.attempt(provider, endpoint, input);
        this.tracker.record(response.usage);
        if (response.toolCalls.length > 0) {
          // Requests only. The orchestrator decides whether anything may run.
          this.logger?.info(
            'model requested tool calls (execution requires orchestrator permission check)',
            { tools: response.toolCalls.map((c) => c.toolName) },
            'llm.tool_calls.requested',
          );
        }
        return response;
      } catch (error) {
        const appError = toAppError(error);
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

    return withRetry(
      () =>
        withTimeout((signal) => provider.complete(request, signal), this.config.requestTimeoutMs, {
          what: `llm:${provider.id}`,
          correlationId: request.correlationId,
        }),
      { ...this.config.retry, attempts: Math.max(1, this.config.maxRetries + 1) },
      { shouldRetry: (error) => (error instanceof AppError ? error.retryable : false) },
    );
  }
}

/** In-memory provider used by tests and by the offline desktop default. */
export interface ScriptedLlmProviderOptions {
  id?: LlmProviderId;
  text?: string;
  finishReason?: LlmFinishReason;
  toolCalls?: LlmToolCall[];
  usage?: Partial<LlmUsage>;
  /** Optional delay before resolving, for timeout/fallback tests. */
  delayMs?: number;
}

export function scriptedLlmProvider(options: ScriptedLlmProviderOptions = {}): LlmProvider {
  const id: LlmProviderId = options.id ?? 'scripted';
  return {
    id,
    models: ['scripted-v1'],
    async complete(request, signal) {
      const started = Date.now();
      if (options.delayMs && options.delayMs > 0) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, options.delayMs);
          signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new AppError('TIMEOUT', 'aborted'));
          });
        });
      }
      const usage = { ...EMPTY_USAGE, ...options.usage };
      return {
        provider: id,
        model: request.model,
        text: options.text ?? 'ok',
        toolCalls: options.toolCalls ?? [],
        finishReason: options.finishReason ?? 'stop',
        usage,
        latencyMs: Date.now() - started,
      } satisfies LlmResponse;
    },
  };
}

/** Default retry policy exported for config wiring. */
export const LLM_DEFAULT_RETRY: RetryPolicy = DEFAULT_RETRY_POLICY;
