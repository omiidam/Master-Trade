/**
 * Anthropic adapter (Messages API).
 *
 * The provider difference that matters is structural: Anthropic keeps the system
 * prompt in its own top-level field rather than in the message list, and returns
 * an array of content **blocks** instead of a single string. Both are translated
 * here, so nothing above this file knows which provider answered.
 *
 * Reasoning rule: when extended thinking is enabled, the API returns `thinking`
 * (and `redacted_thinking`) blocks containing the model's private deliberation.
 * They are counted as output tokens and then **discarded**. They are never
 * concatenated into the answer, never logged, and never stored — the summary
 * contract in `../summary.js` is what surfaces, and it carries no deliberation.
 */

import { AppError } from '../../../packages/shared/src/core/errors.js';
import {
  EMPTY_TOKEN_USAGE,
  type LlmMessage,
  type LlmProvider,
  type LlmProviderResponse,
  type LlmRequest,
  type LlmToolCall,
} from '../provider.js';
import { asProviderError, postJson, type FetchLike } from './http.js';

/** Content block types that are dropped instead of surfaced. */
export const DROPPED_BLOCK_TYPES = ['thinking', 'redacted_thinking', 'analysis'] as const;

export const ANTHROPIC_VERSION = '2023-06-01';

export interface AnthropicOptions {
  apiKey: string | null;
  models: readonly string[];
  baseUrl?: string;
  version?: string;
  fetchImpl?: FetchLike;
  /** Extra headers, e.g. beta feature flags. */
  headers?: Record<string, string>;
}

/** Anthropic takes `system` at the top level; the rest are chat turns. */
export function splitAnthropicMessages(messages: readonly LlmMessage[]): {
  system: string;
  turns: { role: 'user' | 'assistant'; content: string }[];
} {
  const systemParts: string[] = [];
  const turns: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const message of messages) {
    if (message.role === 'system') {
      systemParts.push(message.content);
      continue;
    }
    if (message.role === 'tool') {
      // Tool results are deterministic facts produced by our own code; they enter
      // as user-role context, labelled as such, never as model output.
      turns.push({ role: 'user', content: `[tool result]\n${message.content}` });
      continue;
    }
    turns.push({ role: message.role, content: message.content });
  }
  return { system: systemParts.join('\n\n'), turns };
}

function mapStopReason(reason: unknown): LlmProviderResponse['finishReason'] {
  switch (reason) {
    case 'end_turn':
    case 'stop_sequence':
      return 'stop';
    case 'max_tokens':
      return 'length';
    case 'tool_use':
      return 'tool_call';
    default:
      return 'error';
  }
}

/** Read the blocks we keep, ignore the ones we must not surface. */
export function mapAnthropicContent(content: unknown): {
  text: string;
  toolCalls: LlmToolCall[];
} {
  if (!Array.isArray(content)) {
    throw new AppError('PROVIDER_UNAVAILABLE', 'anthropic response is missing content blocks');
  }
  const texts: string[] = [];
  const toolCalls: LlmToolCall[] = [];

  content.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    const block = entry as Record<string, unknown>;
    const type = block.type;
    if (typeof type === 'string' && (DROPPED_BLOCK_TYPES as readonly string[]).includes(type)) {
      return; // deliberation: counted in usage, never surfaced
    }
    if (type === 'text') {
      if (typeof block.text === 'string') texts.push(block.text);
      return;
    }
    if (type === 'tool_use') {
      const name = block.name;
      if (typeof name !== 'string' || name.length === 0) {
        throw new AppError(
          'PROVIDER_UNAVAILABLE',
          'anthropic returned a tool_use block with no name',
        );
      }
      const input = block.input ?? {};
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new AppError(
          'VALIDATION_FAILED',
          `anthropic returned non-object input for "${name}"`,
          {
            details: { tool: name },
          },
        );
      }
      const id = typeof block.id === 'string' && block.id.length > 0 ? block.id : `tool_${index}`;
      toolCalls.push({ id, toolName: name, arguments: input as Record<string, unknown> });
    }
  });

  return { text: texts.join('\n').trim(), toolCalls };
}

export function anthropicProvider(options: AnthropicOptions): LlmProvider {
  const id = 'anthropic' as const;
  if (!options.apiKey) {
    throw new AppError(
      'FORBIDDEN',
      'Provider "anthropic" requires a credential; configuration holds a SecretRef that must resolve to a key',
      { details: { provider: id } },
    );
  }
  const deps = {
    label: id,
    baseUrl: (options.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, ''),
    apiKey: options.apiKey,
    // Anthropic takes the credential in `x-api-key`, not as a bearer token.
    authHeader: { name: 'x-api-key', value: options.apiKey },
    headers: {
      'anthropic-version': options.version ?? ANTHROPIC_VERSION,
      ...options.headers,
    },
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  };

  return {
    id,
    models: options.models,
    async complete(request: LlmRequest, signal?: AbortSignal): Promise<LlmProviderResponse> {
      const started = Date.now();
      const { system, turns } = splitAnthropicMessages(request.messages);
      try {
        const payload = await postJson(deps, {
          path: '/v1/messages',
          timeoutMs: request.timeoutMs,
          correlationId: request.correlationId,
          signal,
          body: {
            model: request.model,
            max_tokens: request.maxTokens,
            temperature: request.temperature,
            ...(system.length > 0 ? { system } : {}),
            messages: turns,
          },
        });

        if (!payload || typeof payload !== 'object') {
          throw new AppError('PROVIDER_UNAVAILABLE', 'anthropic returned a non-object body');
        }
        const root = payload as Record<string, unknown>;
        const { text, toolCalls } = mapAnthropicContent(root.content);
        const finishReason = mapStopReason(root.stop_reason);

        if (text.length === 0 && toolCalls.length === 0) {
          throw new AppError('PROVIDER_UNAVAILABLE', 'anthropic returned an empty completion', {
            details: { correlationId: request.correlationId, finishReason },
          });
        }

        const usageRaw = root.usage;
        const usage =
          usageRaw && typeof usageRaw === 'object'
            ? {
                promptTokens: numberOrZero((usageRaw as Record<string, unknown>).input_tokens),
                completionTokens: numberOrZero((usageRaw as Record<string, unknown>).output_tokens),
                totalTokens: 0,
              }
            : { ...EMPTY_TOKEN_USAGE };
        usage.totalTokens = usage.promptTokens + usage.completionTokens;

        const model = typeof root.model === 'string' ? root.model : request.model;
        return {
          provider: id,
          model,
          text,
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
