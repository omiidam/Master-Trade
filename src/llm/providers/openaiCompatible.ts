/**
 * OpenAI-compatible adapter (Chat Completions).
 *
 * One adapter covers two very different endpoints — the hosted OpenAI API and a
 * local server (llama.cpp, Ollama, LM Studio, vLLM) — because they speak the same
 * wire protocol. Which one is in use is configuration (`baseUrl`, `apiKey`), not
 * code, which is the whole point of having an adapter at all.
 *
 * Two rules are enforced here rather than requested of the model:
 *   1. **Reasoning traces are dropped.** Some OpenAI-compatible servers return a
 *      visible thinking field (`reasoning`, `reasoning_content`,
 *      `reasoning_details`). It is never read, so it cannot reach a prompt, a log
 *      or the interface. Only counted tokens prove it existed, and only as a
 *      number.
 *   2. **Tool arguments are never guessed.** A tool call whose arguments are not
 *      valid JSON is refused: the arguments feed deterministic calculators, and
 *      a plausible-looking guess is exactly the failure this system must not
 *      have.
 */

import { AppError } from '../../../packages/shared/src/core/errors.js';
import {
  EMPTY_TOKEN_USAGE,
  type LlmProvider,
  type LlmProviderId,
  type LlmProviderResponse,
  type LlmRequest,
  type LlmToolCall,
} from '../provider.js';
import { asProviderError, postJson, type FetchLike } from './http.js';

/** Fields that carry hidden reasoning. Read by nothing. */
export const DROPPED_REASONING_FIELDS = [
  'reasoning',
  'reasoning_content',
  'reasoning_details',
  'thinking',
  'analysis',
] as const;

export interface OpenAiCompatibleOptions {
  id?: Extract<LlmProviderId, 'openai' | 'local-openai-compatible'>;
  /** e.g. `https://api.openai.com/v1` or `http://127.0.0.1:11434/v1`. */
  baseUrl: string;
  apiKey?: string | null;
  models: readonly string[];
  /** Require a credential before any request (hosted endpoints: yes). */
  requireApiKey?: boolean;
  headers?: Record<string, string>;
  fetchImpl?: FetchLike;
  /** Path appended to `baseUrl`. */
  path?: string;
}

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError('PROVIDER_UNAVAILABLE', `openai-compatible response is missing ${what}`);
  }
  return value as Record<string, unknown>;
}

function mapFinishReason(reason: unknown): LlmProviderResponse['finishReason'] {
  switch (reason) {
    case 'stop':
      return 'stop';
    case 'length':
      return 'length';
    case 'tool_calls':
    case 'function_call':
      return 'tool_call';
    default:
      return 'error';
  }
}

/** Map one `tool_calls` entry, refusing unparseable arguments. */
function mapToolCall(entry: unknown, index: number): LlmToolCall {
  const call = asRecord(entry, `tool_calls[${index}]`);
  const fn = asRecord(call.function, `tool_calls[${index}].function`);
  const name = fn.name;
  if (typeof name !== 'string' || name.length === 0) {
    throw new AppError('PROVIDER_UNAVAILABLE', 'model returned a tool call with no name');
  }
  const rawArguments = fn.arguments;
  let args: unknown = {};
  if (typeof rawArguments === 'string' && rawArguments.trim().length > 0) {
    try {
      args = JSON.parse(rawArguments);
    } catch {
      throw new AppError(
        'VALIDATION_FAILED',
        `model returned malformed arguments for tool "${name}"; refusing to guess them`,
        { details: { tool: name } },
      );
    }
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    throw new AppError('VALIDATION_FAILED', `model returned non-object arguments for "${name}"`, {
      details: { tool: name },
    });
  }
  const id = typeof call.id === 'string' && call.id.length > 0 ? call.id : `call_${index}`;
  return { id, toolName: name, arguments: args as Record<string, unknown> };
}

export function openAiCompatibleProvider(options: OpenAiCompatibleOptions): LlmProvider {
  const id: LlmProviderId = options.id ?? 'openai';
  const requireApiKey = options.requireApiKey ?? id === 'openai';
  if (requireApiKey && !options.apiKey) {
    // Fail at startup, not on the first user question.
    throw new AppError(
      'FORBIDDEN',
      `Provider "${id}" requires a credential; configuration holds a SecretRef that must resolve to a key`,
      { details: { provider: id } },
    );
  }

  const deps = {
    label: id,
    baseUrl: options.baseUrl.replace(/\/$/, ''),
    apiKey: options.apiKey ?? null,
    ...(options.headers ? { headers: options.headers } : {}),
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  };

  return {
    id,
    models: options.models,
    async complete(request: LlmRequest, signal?: AbortSignal): Promise<LlmProviderResponse> {
      const started = Date.now();
      const path = options.path ?? '/chat/completions';
      try {
        const payload = await postJson(deps, {
          path,
          timeoutMs: request.timeoutMs,
          correlationId: request.correlationId,
          signal,
          body: {
            model: request.model,
            messages: request.messages.map((message) => ({
              role: message.role,
              content: message.content,
            })),
            max_tokens: request.maxTokens,
            temperature: request.temperature,
            stream: false,
          },
        });

        const root = asRecord(payload, 'a JSON object');
        const choices = root.choices;
        if (!Array.isArray(choices) || choices.length === 0) {
          throw new AppError('PROVIDER_UNAVAILABLE', `${id} returned no completion choices`, {
            details: { correlationId: request.correlationId },
          });
        }
        const choice = asRecord(choices[0], 'choices[0]');
        const message = asRecord(choice.message ?? choice.delta, 'choices[0].message');

        // Reasoning fields are deliberately not read — see the header comment.
        const content = typeof message.content === 'string' ? message.content : '';
        const rawToolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
        const toolCalls = rawToolCalls.map((entry, index) => mapToolCall(entry, index));
        const finishReason = mapFinishReason(choice.finish_reason);

        if (content.trim().length === 0 && toolCalls.length === 0) {
          throw new AppError('PROVIDER_UNAVAILABLE', `${id} returned an empty completion`, {
            details: { correlationId: request.correlationId, finishReason },
          });
        }

        const usageRaw = root.usage;
        const usage =
          usageRaw && typeof usageRaw === 'object'
            ? {
                promptTokens: numberOrZero((usageRaw as Record<string, unknown>).prompt_tokens),
                completionTokens: numberOrZero(
                  (usageRaw as Record<string, unknown>).completion_tokens,
                ),
                totalTokens: numberOrZero((usageRaw as Record<string, unknown>).total_tokens),
              }
            : { ...EMPTY_TOKEN_USAGE };

        const model = typeof root.model === 'string' ? root.model : request.model;
        return {
          provider: id,
          model,
          text: content,
          toolCalls,
          finishReason,
          usage,
          latencyMs: Date.now() - started,
        };
      } catch (error) {
        throw asProviderError(error, id);
      }
    },
  };
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}
