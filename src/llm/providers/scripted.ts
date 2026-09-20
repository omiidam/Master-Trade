/**
 * Scripted provider — the offline, deterministic adapter.
 *
 * It exists for three reasons, all of them structural rather than convenient:
 *   1. tests need provider behaviour that is exact, instant and offline;
 *   2. the desktop app must run with no key and no network;
 *   3. the gateway's failure paths (timeout, failure, fallback) need a provider
 *      that can be made to fail on demand without a network.
 *
 * It answers **inside the summary contract**, not with a free-form string. That
 * matters: the offline default is a real path through the same parser, the same
 * permission check and the same cost accounting as a hosted provider, so running
 * without a key degrades the *quality* of the answer, never the guarantees around
 * it.
 *
 * It reports token counts only, like every other provider — the gateway prices
 * them (at zero, because nothing is called).
 */

import { AppError } from '../../../packages/shared/src/core/errors.js';
import type { EpistemicKind } from '../../../packages/shared/src/types.js';
import {
  EMPTY_TOKEN_USAGE,
  type LlmFinishReason,
  type LlmMessage,
  type LlmProvider,
  type LlmProviderId,
  type LlmProviderResponse,
  type LlmTokenUsage,
  type LlmToolCall,
} from '../provider.js';
import type { StructuredSummary } from '../summary.js';

export interface ScriptedLlmProviderOptions {
  id?: LlmProviderId;
  /** Model ids this provider claims; must match a price row. */
  models?: readonly string[];
  /** Fixed answer text. Defaults to a summary for the question it was asked. */
  text?: string;
  finishReason?: LlmFinishReason;
  toolCalls?: LlmToolCall[];
  usage?: Partial<LlmTokenUsage>;
  /** Delay before resolving, for timeout and fallback tests. */
  delayMs?: number;
  /** Fail every call with this code, for failure and circuit-breaker tests. */
  failWith?: {
    code: 'PROVIDER_UNAVAILABLE' | 'RATE_LIMITED' | 'TIMEOUT' | 'INTERNAL';
    message?: string;
  };
  /** Inspect what the provider was asked, without a network. */
  onRequest?: (request: {
    model: string;
    messages: readonly { role: string; content: string }[];
    correlationId: string;
  }) => void;
}

/** The question as it arrived, with the prompt's own framing removed. */
export function extractUserQuestion(messages: readonly LlmMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== 'user') continue;
    const marker = message.content.lastIndexOf('QUESTION:');
    return (
      marker >= 0 ? message.content.slice(marker + 'QUESTION:'.length) : message.content
    ).trim();
  }
  return '';
}

/**
 * The deterministic offline answer for a question, in the summary contract.
 *
 * It is deliberately plain: it labels what it is doing, requests the
 * deterministic tools it needs instead of doing arithmetic, and states its own
 * uncertainty. It is not an attempt to imitate a language model.
 */
export function scriptedSummaryFor(userInput: string): StructuredSummary {
  const wantsExecution = /\b(buy|sell|place an order|execute)\b/i.test(userInput);
  const wantsRisk = /position siz|position sizing|risk per trade|how many (shares|units)/i.test(
    userInput,
  );

  if (wantsExecution) {
    return {
      headline: 'Execution is not available in this system.',
      statements: [
        {
          kind: 'fact',
          text: 'Trade execution is disabled by design in Master Trade. This system is for training only.',
          sources: ['instruction:safety-policy'],
        },
      ],
      uncertainty: [],
      toolRequests: [],
    };
  }

  if (wantsRisk) {
    return {
      headline: 'Sizing needs the deterministic risk tool.',
      statements: [
        {
          kind: 'analysis',
          text: 'Sizing is a deterministic calculation, so I am requesting the risk.positionSize tool rather than computing it myself.',
          sources: ['risk.positionSize'],
        },
      ],
      uncertainty: ['The result is only as good as the entry and stop it is given.'],
      toolRequests: [
        {
          toolName: 'risk.positionSize',
          arguments: { accountEquity: 25_000, riskPerTrade: 0.01, entry: 100, stop: 95 },
          purpose: 'Compute the fixed-fractional position size for the stated risk budget.',
        },
      ],
    };
  }

  return {
    headline: 'Study question acknowledged.',
    statements: [
      {
        kind: 'analysis',
        text: 'An answer to this question rests on deterministic tool output and retrieved records, with facts, analysis, hypotheses and uncertainty labelled separately.',
        sources: [],
      },
    ],
    uncertainty: [
      'The offline scripted adapter answered: no hosted model is connected, so this is a stand-in reply.',
    ],
    toolRequests: [],
  };
}

/** The epistemic label of the scripted statement kinds, for callers that need it. */
export const SCRIPTED_KINDS: readonly EpistemicKind[] = ['fact', 'analysis', 'uncertainty'];

export function scriptedLlmProvider(options: ScriptedLlmProviderOptions = {}): LlmProvider {
  const id: LlmProviderId = options.id ?? 'scripted';
  return {
    id,
    models: options.models ?? ['scripted-v1'],
    async complete(request, signal): Promise<LlmProviderResponse> {
      const started = Date.now();
      options.onRequest?.({
        model: request.model,
        messages: request.messages,
        correlationId: request.correlationId,
      });
      if (options.delayMs && options.delayMs > 0) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, options.delayMs);
          signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new AppError('TIMEOUT', 'aborted'));
          });
        });
      }
      if (options.failWith) {
        throw new AppError(
          options.failWith.code,
          options.failWith.message ?? `${id} unavailable (scripted)`,
        );
      }
      return {
        provider: id,
        model: request.model,
        text:
          options.text ?? JSON.stringify(scriptedSummaryFor(extractUserQuestion(request.messages))),
        toolCalls: options.toolCalls ?? [],
        finishReason: options.finishReason ?? 'stop',
        // Providers never report money; only tokens.
        usage: { ...EMPTY_TOKEN_USAGE, ...options.usage },
        latencyMs: Date.now() - started,
      };
    },
  };
}
