/**
 * Extension points — the seams later phases grow into.
 *
 * Contracts only, deliberately: there is no implementation, no
 * default behavior and no wiring here. Until a phase consumes a
 * seam, `LlmGateway` stays the single entry point for every LLM
 * request, exactly as it is today.
 *
 * Three invariants every seam keeps:
 *
 *   1. **Nothing executes.** A tool call is a request until an
 *      authorized executor runs it; an agent loop drives turns, it
 *      does not run tools.
 *   2. **Nothing is trusted.** A seam sees a `LlmRequestScope` —
 *      an opaque `userId` and a correlation id — never a
 *      `Principal`, never a credential, never a permission.
 *   3. **Nothing bypasses a contract.** Prompts composed here feed
 *      the same `LlmMessage` path, and outputs remain subject to
 *      the structured-summary contract in `summary.ts`.
 */

import type { LlmMessage, LlmProviderResponse, LlmRequestScope, LlmToolCall } from './provider.js';

/**
 * One block of assembled context. Structurally compatible with the
 * orchestrator's `ContextSection`, so a future context builder can
 * produce what the prompt path already consumes — defined locally
 * because `src/llm` must not depend on `src/agent`.
 */
export interface PromptContextSection {
  id: string;
  /** Where the content came from; instructions are never dropped. */
  source: 'instructions' | 'memory' | 'conversation' | 'market-data' | 'tools';
  content: string;
  /** The token budget this section occupies. */
  tokens: number;
}

// ── Prompt Engine ──────────────────────────────────────────────────────────

export interface PromptEngineInput extends LlmRequestScope {
  /** Rendered, version-stamped instruction modules. */
  instructions: string;
  /** Context already assembled under a token budget. */
  sections: readonly PromptContextSection[];
  userInput: string;
}

export interface PromptEngineOutput {
  messages: LlmMessage[];
  /** Estimate of the composed prompt, for budget checks upstream. */
  estimatedTokens: number;
}

/**
 * Future capability: composes turn prompts. Today `buildTurnMessages`
 * does this inline; the seam exists so a richer engine (templates,
 * instruction registry) can replace it without touching callers.
 */
export interface PromptEngine {
  compose(input: PromptEngineInput): Promise<PromptEngineOutput>;
}

// ── Context Builder ────────────────────────────────────────────────────────

export interface ContextBuilderInput extends LlmRequestScope {
  query: string;
  /** Hard ceiling on the assembled context, in tokens. */
  tokenBudget: number;
}

export interface ContextBuilderOutput {
  sections: readonly PromptContextSection[];
  estimatedTokens: number;
  /** Sections dropped to fit the budget, and why. */
  dropped: readonly { sectionId: string; reason: string }[];
}

/**
 * Future capability: assembles context under a token budget with
 * provenance. Retrieval quality (embedding, reranking) is a later
 * concern; the seam fixes the boundary, not the algorithm.
 */
export interface ContextBuilder {
  assemble(input: ContextBuilderInput): Promise<ContextBuilderOutput>;
}

// ── Tool Calling ───────────────────────────────────────────────────────────

/** A tool call exactly as the model requested it — still a request. */
export type ToolCallRequest = LlmToolCall;

export type ToolAuthorization =
  { allowed: true; tool: string } | { allowed: false; reason: string };

export interface ToolExecutionResult {
  ok: boolean;
  value?: unknown;
  error?: string;
}

/**
 * Future capability: the only place a tool may ever run.
 *
 * The two steps are the security boundary. `authorize` decides
 * whether the scoped user may run this call; `execute` obeys, and
 * must only be reached for a call `authorize` allowed. The
 * orchestrator owns this seam; providers never see it.
 */
export interface ToolCalling {
  authorize(request: ToolCallRequest, scope: LlmRequestScope): Promise<ToolAuthorization>;
  execute(request: ToolCallRequest, authorization: ToolAuthorization): Promise<ToolExecutionResult>;
}

// ── Agent Loops ────────────────────────────────────────────────────────────

export interface AgentLoopInput extends LlmRequestScope {
  userInput: string;
  /** Hard stop: a loop may never run more model turns than this. */
  maxTurns: number;
}

export type AgentLoopStep =
  | { kind: 'model'; response: LlmProviderResponse }
  | { kind: 'tool'; request: ToolCallRequest; result: ToolExecutionResult };

export interface AgentLoopResult {
  steps: readonly AgentLoopStep[];
  /** The final model response, after the last tool result was fed back. */
  final: LlmProviderResponse;
}

/**
 * Future capability: multi-turn reasoning. The loop owns turn order
 * only — every tool step routes through the `ToolCalling` seam, so a
 * loop cannot execute a tool itself, and `maxTurns` bounds it.
 */
export interface AgentLoop {
  run(input: AgentLoopInput, tools: ToolCalling): Promise<AgentLoopResult>;
}

// ── Evaluation ─────────────────────────────────────────────────────────────

export interface EvaluationCase extends LlmRequestScope {
  userInput: string;
  /** What a correct answer looks like, when we know. */
  expected?: string;
}

export interface EvaluationResult {
  caseId: string;
  score: number;
  passed: boolean;
  notes: string[];
}

/**
 * Future capability: offline quality measurement against recorded
 * cases. Evaluation is not part of the request path and holds no
 * budget authority — it observes the core, it never serves traffic.
 */
export interface Evaluator {
  evaluate(cases: readonly EvaluationCase[]): Promise<readonly EvaluationResult[]>;
}

// ── Training ───────────────────────────────────────────────────────────────

export interface TrainingExample {
  messages: LlmMessage[];
  /** The output the model should have produced. */
  expected: LlmMessage[];
}

export interface TrainingDataset {
  id: string;
  examples: readonly TrainingExample[];
}

export interface TrainingJobResult {
  jobId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  /** Operator-facing detail only: never credentials, prompts or user content. */
  details: string;
}

/**
 * Future capability: model fine-tuning. Training is an operator
 * action, not a request path: it has no access to the gateway, no
 * budget authority and no secrets, and its datasets are curated
 * exports — never live conversation captures.
 */
export interface Trainer {
  submit(dataset: TrainingDataset): Promise<TrainingJobResult>;
  status(jobId: string): Promise<TrainingJobResult>;
}

// ── The seam registry ──────────────────────────────────────────────────────

/**
 * Every seam the LLM core exposes, all optional: a phase installs one
 * seam at a time, and nothing changes for callers until it does.
 */
export interface LlmExtensionPoints {
  promptEngine?: PromptEngine;
  contextBuilder?: ContextBuilder;
  agentLoop?: AgentLoop;
  toolCalling?: ToolCalling;
  evaluation?: Evaluator;
  training?: Trainer;
}
