/**
 * Async model adapter — the reasoning component when a real provider answers.
 *
 * The Phase 1 `ModelAdapter` is synchronous and scripted; this one awaits an LLM,
 * which is why it is a separate interface rather than a change to the old one.
 * A turn goes: assembled context → prompt → gateway → **structured summary**.
 * The raw provider text never leaves this module: what comes out is the summary
 * contract, so nothing downstream can accidentally surface free-form model prose.
 *
 * What this module deliberately does *not* do: run tools. It returns
 * `toolRequests`; the orchestrator decides whether anything may run.
 */

import type { ContextSection } from './context.js';
import type { LlmGateway, LlmProviderId, LlmUsage } from '../llm/provider.js';
import { buildTurnMessages } from '../llm/prompt.js';
import { scriptedSummaryFor } from '../llm/providers/scripted.js';
import { summarizeModelOutput, type StructuredSummary } from '../llm/summary.js';
import type { ModelStatement } from '../../packages/shared/src/types.js';

/** A tool the model asked for. A request, with arguments, and nothing more. */
export interface ToolRequest {
  toolName: string;
  arguments: Record<string, unknown>;
  /** Why the model wants it; null when the provider sent a bare tool call. */
  purpose: string | null;
}

export interface ModelTurnRequest {
  correlationId: string;
  userInput: string;
  /** Rendered, version-stamped instruction modules. */
  instructions: string;
  /** Context already assembled under a token budget. */
  context: readonly ContextSection[];
}

export interface ModelTurn {
  provider: LlmProviderId;
  model: string;
  latencyMs: number;
  /** Tokens and the cost the gateway derived from our own price table. */
  usage: LlmUsage;
  summary: StructuredSummary;
  statements: ModelStatement[];
  toolRequests: ToolRequest[];
}

export interface AsyncModelAdapter {
  /** Human-readable label, surfaced in the interface and in audit records. */
  readonly label: string;
  completeTurn(request: ModelTurnRequest): Promise<ModelTurn>;
}

export interface LlmModelAdapterDeps {
  gateway: LlmGateway;
  /** Answer length cap; a summary is short by design. */
  maxAnswerTokens?: number;
  temperature?: number;
  /** Failure policy for a model output that violates the summary contract. */
  onContractViolation?: 'throw' | 'block';
}

/**
 * Statements come straight from the summary; the summary is the contract, not a
 * suggestion. Sources are carried through so the epistemic label survives into
 * the interface.
 */
export function statementsFromSummary(summary: StructuredSummary): ModelStatement[] {
  return summary.statements.map((statement) => ({
    kind: statement.kind,
    text: statement.text,
    sources: [...statement.sources],
  }));
}

export function toolRequestsFromSummary(summary: StructuredSummary): ToolRequest[] {
  return summary.toolRequests.map((request) => ({
    toolName: request.toolName,
    arguments: request.arguments,
    purpose: request.purpose,
  }));
}

export function createLlmModelAdapter(deps: LlmModelAdapterDeps): AsyncModelAdapter {
  return {
    label: `llm-gateway(${
      deps.gateway
        .endpoints()
        .map((e) => e.provider)
        .join('→') || 'none'
    })`,
    async completeTurn(request: ModelTurnRequest): Promise<ModelTurn> {
      const messages = buildTurnMessages({
        instructions: request.instructions,
        sections: request.context,
        userInput: request.userInput,
      });

      const response = await deps.gateway.complete({
        correlationId: request.correlationId,
        messages,
        maxTokens: deps.maxAnswerTokens ?? 1_200,
        temperature: deps.temperature ?? 0.2,
      });

      // Contract enforcement happens before anything is returned, so a violating
      // provider surfaces as a failed turn rather than as partial output.
      const summary = summarizeModelOutput(response);

      return {
        provider: response.provider,
        model: response.model,
        latencyMs: response.latencyMs,
        usage: response.usage,
        summary,
        statements: statementsFromSummary(summary),
        toolRequests: toolRequestsFromSummary(summary),
      };
    },
  };
}

export interface ScriptedAsyncModelOptions {
  label?: string;
  provider?: LlmProviderId;
  model?: string;
  usage?: Partial<LlmUsage>;
  delayMs?: number;
  /** Replace the deterministic answer entirely. */
  summary?: StructuredSummary;
  /** Fail instead of answering, for lifecycle/blocked-turn tests. */
  failWith?: Error;
}

/**
 * Deterministic offline adapter for the async path — the counterpart of
 * `scriptedModelAdapter`. It exists so orchestrator and service behaviour can be
 * tested against the real async code path with no gateway, no key and no network.
 */
export function scriptedAsyncModelAdapter(
  options: ScriptedAsyncModelOptions = {},
): AsyncModelAdapter {
  const provider: LlmProviderId = options.provider ?? 'scripted';
  return {
    label: options.label ?? 'scripted-async (offline, deterministic)',
    async completeTurn(request: ModelTurnRequest): Promise<ModelTurn> {
      if (options.delayMs && options.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      }
      if (options.failWith) throw options.failWith;

      const summary = options.summary ?? scriptedSummaryFor(request.userInput);
      return {
        provider,
        model: options.model ?? 'scripted-v1',
        latencyMs: 0,
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          costUsd: 0,
          priced: true,
          estimated: false,
          ...options.usage,
        },
        summary,
        statements: statementsFromSummary(summary),
        toolRequests: toolRequestsFromSummary(summary),
      };
    },
  };
}

/**
 * The offline, deterministic answer used when no summary is supplied. The
 * generator lives with the offline adapter (`src/llm/providers/scripted.ts`) so
 * the provider and the adapter cannot drift apart, and so `src/llm` never has to
 * depend on `src/agent`.
 */
export { scriptedSummaryFor as defaultSummaryFor } from '../llm/providers/scripted.js';
