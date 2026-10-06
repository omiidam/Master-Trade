/**
 * The Context Builder — one centralized, layered, budgeted assembler for
 * everything an LLM call sees.
 *
 * Task: the architecture layer between the Agent Harness and the LLM
 * Gateway. Before this module, assembly was ad-hoc at each call site: the
 * run harness inlined its own section list, the current user's question
 * travelled twice (once as the question, once inside the chat history), and
 * the instruction set travelled twice (once in the system message, once as
 * a rendered context block). Nothing validated the total size against a
 * budget before the request went out.
 *
 * Five strictly separated layers, in priority order — the same layering the
 * prompt engine composes, stated here as the assembly contract:
 *
 *   1. **system-instructions** — who the agent is. Never dropped, never
 *      duplicated into the context blocks. Priority 100.
 *   2. **agent-policies** — the operating rules that outrank every other
 *      layer. Never dropped. Owned by the system message; accounted here so
 *      the budget sees what the prompt path will actually send. Priority 95.
 *   3. **runtime** — the material relevant to *this* call (market data, tool
 *      output; later: memory retrieval, RAG). Droppable, highest-priority
 *      sections first. Priority from each section.
 *   4. **conversation** — prior turns. Droppable, oldest turns first: what
 *      the user just said matters more than what they said first. Priority 60.
 *   5. **user-input** — the question. Never dropped and never truncated
 *      (oversized input is a refusal, not a silent cut); budget-accounted.
 *
 * Three guarantees, enforced here rather than requested of callers:
 *
 *   1. **Size validation before every request.** The assembled total is
 *      validated against the budget; safety text that cannot fit is an
 *      `INTERNAL` refusal, never a silent truncation of the policy.
 *   2. **No duplication.** Identical content is carried once: within the
 *      assembly (a repeat section is dropped as a duplicate), against the
 *      system layer (a context block that copies the instructions or the
 *      policies is dropped), and across the steps of a running loop (a
 *      section already delivered earlier is dropped, by digest).
 *   3. **The gateway stays real.** The builder produces plain
 *      `ContextSection[]` for the existing prompt path — it never touches a
 *      provider, a payload or a credential, and `LlmGateway` is unchanged.
 *
 * Readiness, deliberately not implementation: persistent memory arrives as
 * provenance-carrying sections (`sectionsFromMemory`), RAG as ranked
 * sections, tools as sections produced by the orchestrator's permission
 * check, and a multi-step loop passes `alreadyDeliveredDigests` so earlier
 * steps' material is not re-sent. No persistence, retrieval, execution or
 * evaluation lives here.
 */

import { createHash } from 'node:crypto';
import { AppError } from '../../packages/shared/src/core/errors.js';
import { estimateTokens, type ContextSection } from './context.js';
import {
  DECISION_POLICY,
  OUTPUT_CONTRACT_REEXPORT as OUTPUT_CONTRACT,
  MAX_USER_INPUT_CHARS,
} from '../llm/promptParts.js';

// ── Layers ─────────────────────────────────────────────────────────────────

/**
 * The five context layers, closed. The order is the priority: under budget
 * pressure the list is dropped from the bottom up, and `system-instructions`
 * and `agent-policies` are never dropped at all.
 */
export const CONTEXT_LAYERS = [
  'system-instructions',
  'agent-policies',
  'runtime',
  'conversation',
  'user-input',
] as const;

export type ContextLayer = (typeof CONTEXT_LAYERS)[number];

/** Fixed priority per layer; runtime sections refine it per section. */
export const LAYER_PRIORITY: Readonly<Record<ContextLayer, number>> = {
  'system-instructions': 100,
  'agent-policies': 95,
  runtime: 70,
  conversation: 60,
  'user-input': 50,
};

// ── Budgets ────────────────────────────────────────────────────────────────

/**
 * Configurable budgets for one assembled call. `maxContextTokens` is the
 * ceiling for everything the model sees; `reserveForResponse` is held back
 * so the answer itself can fit; the layer caps bound a single greedy layer.
 */
export interface ContextBuilderBudget {
  /** Hard ceiling on the assembled call, in approximate tokens. */
  maxContextTokens: number;
  /** Tokens held back so the response can fit. */
  reserveForResponse: number;
  /** Cap for the runtime layer. Default: whatever the total allows. */
  maxRuntimeTokens?: number;
  /** Cap for the conversation layer. Default: whatever the total allows. */
  maxConversationTokens?: number;
}

export const DEFAULT_CONTEXT_BUILDER_BUDGET: ContextBuilderBudget = {
  maxContextTokens: 8_000,
  reserveForResponse: 1_500,
};

// ── Input / output contracts ───────────────────────────────────────────────

/** One prior conversation turn, oldest first. */
export interface ContextHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ContextAssemblyRequest {
  correlationId: string;
  /**
   * Opaque authenticated-user identifier, threaded for audit only. The
   * builder attributes, it never authorizes (ADR-0058 discipline).
   */
  userId?: string;
  /** Layer 1 — system instructions. Never dropped, never duplicated. */
  instructions: string;
  /** Layer 2 — agent policies. Defaults to the product's operating rules. */
  agentPolicies?: string;
  /** Layer 5 — the question. Never dropped; oversized input is a refusal. */
  userInput: string;
  /** Layer 4 — prior turns, oldest first. The current question is *not* one. */
  conversationHistory?: readonly ContextHistoryTurn[];
  /** Layer 3 — material relevant to this call, as labelled sections. */
  runtimeContext?: readonly ContextSection[];
  /** Budget overrides; unset fields take the defaults. */
  budget?: Partial<ContextBuilderBudget>;
  /**
   * Digests of content earlier steps of a running loop already carry.
   * Runtime sections matching one are dropped as already-delivered, so a
   * multi-step loop never pays for the same block twice.
   */
  alreadyDeliveredDigests?: readonly string[];
}

/** Why a section did not make the call. */
export interface ContextDrop {
  id: string;
  layer: ContextLayer;
  reason: string;
}

export interface ContextAssembly {
  correlationId: string;
  /**
   * Sections for the gateway prompt path: the instructions marker (required
   * by the prompt contract, rendered only in the system layer), then the
   * kept runtime sections, then the conversation section.
   */
  sections: readonly ContextSection[];
  /** The validated question, as the model is asked it. */
  userInput: string;
  /** The policies the system layer carries (default when not supplied). */
  agentPolicies: string;
  /** Per-layer token accounting, for budget enforcement and diagnostics. */
  layerTokens: Readonly<Record<ContextLayer, number>>;
  /** Everything the model will see this call: fixed layers + kept sections. */
  totalTokens: number;
  dropped: readonly ContextDrop[];
  /** True when anything was dropped to fit. */
  truncated: boolean;
}

// ── Deduplication ──────────────────────────────────────────────────────────

/**
 * A content digest: whitespace-normalized SHA-256, so "the same text"
 * survives caller-side reformatting. Hex, stable across processes — the
 * digest a future agent loop records for step *n* is comparable at step *n+1*.
 */
export function contentDigest(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

// ── The builder ────────────────────────────────────────────────────────────

export class AgentContextBuilder {
  private readonly budget: ContextBuilderBudget;

  constructor(budget: Partial<ContextBuilderBudget> = {}) {
    this.budget = { ...DEFAULT_CONTEXT_BUILDER_BUDGET, ...budget };
  }

  /**
   * Assemble one call's context. Deterministic and pure: the same request
   * yields the same assembly, so a run's prompt is reproducible from its
   * inputs alone.
   *
   * Refusals, in order: an empty instruction set or question, an oversized
   * question, a memory section without provenance, an unusable budget, and
   * a budget that cannot fit the never-dropped layers. Under budget
   * pressure everything else is dropped, conversation before runtime,
   * lowest-priority first — never the safety text.
   */
  assemble(request: ContextAssemblyRequest): ContextAssembly {
    // Per-call overrides win over the constructor budget, so one shared
    // instance can serve callers with different ceilings.
    const budget: ContextBuilderBudget = { ...this.budget, ...(request.budget ?? {}) };
    if (request.instructions.trim().length === 0) {
      throw new AppError(
        'POLICY_VIOLATION',
        'refusing to assemble context with no instruction set',
      );
    }
    const userInput = request.userInput.trim();
    if (userInput.length === 0) {
      throw new AppError('VALIDATION_FAILED', 'user input must not be empty');
    }
    if (userInput.length > MAX_USER_INPUT_CHARS) {
      throw new AppError(
        'VALIDATION_FAILED',
        `user input exceeds ${MAX_USER_INPUT_CHARS} characters; refusing to forward it`,
        { details: { length: userInput.length } },
      );
    }

    const usable = budget.maxContextTokens - budget.reserveForResponse;
    if (usable <= 0) {
      throw new AppError(
        'VALIDATION_FAILED',
        'context budget is unusable: reserveForResponse consumes maxContextTokens',
        { details: { ...budget } },
      );
    }

    // Layer 1 + 2: the never-dropped system text. Policies are accounted for
    // together with the output contract, because the prompt path appends both
    // to the system message and the budget must see what will actually be sent.
    const instructionsTokens = estimateTokens(request.instructions);
    const agentPolicies = request.agentPolicies?.trim() || DECISION_POLICY;
    const policiesTokens = estimateTokens(agentPolicies) + estimateTokens(OUTPUT_CONTRACT);
    const userInputTokens = estimateTokens(userInput);

    // Layer 3 candidates, pre-validated: a memory section without provenance
    // is a caller bug, refused before any budget arithmetic can hide it.
    const runtime = request.runtimeContext ?? [];
    const missingProvenance = runtime
      .filter((item) => item.source === 'memory' && item.provenance === undefined)
      .map((item) => item.id);
    if (missingProvenance.length > 0) {
      throw new AppError('VALIDATION_FAILED', 'memory sections must carry provenance', {
        details: { sections: missingProvenance },
      });
    }

    const fixedTokens = instructionsTokens + policiesTokens + userInputTokens;
    if (fixedTokens > usable) {
      throw new AppError(
        'INTERNAL',
        'context budget cannot fit the never-dropped layers (instructions, policies, user input); refusing to truncate safety text',
        { details: { fixedTokens, usable, instructionsTokens, policiesTokens, userInputTokens } },
      );
    }

    let remaining = usable - fixedTokens;
    const dropped: ContextDrop[] = [];

    // System-layer digests: a context block that repeats the instructions or
    // the policies is the same text paid for twice.
    const systemDigests = new Set([
      contentDigest(request.instructions),
      contentDigest(agentPolicies),
      contentDigest(OUTPUT_CONTRACT),
    ]);
    const delivered = new Set(request.alreadyDeliveredDigests ?? []);

    // Layer 3: runtime, highest priority first, each section once.
    const runtimeCap = Math.min(budget.maxRuntimeTokens ?? remaining, remaining);
    const ranked = [...runtime].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
    const seenDigests = new Map<string, string>();
    const keptRuntime: ContextSection[] = [];
    let runtimeTokens = 0;
    for (const item of ranked) {
      const digest = contentDigest(item.content);
      if (systemDigests.has(digest)) {
        dropped.push({ id: item.id, layer: 'runtime', reason: 'duplicate of the system layer' });
        continue;
      }
      if (delivered.has(digest)) {
        dropped.push({
          id: item.id,
          layer: 'runtime',
          reason: 'already delivered earlier in this loop',
        });
        continue;
      }
      const original = seenDigests.get(digest);
      if (original !== undefined) {
        dropped.push({ id: item.id, layer: 'runtime', reason: `duplicate of ${original}` });
        continue;
      }
      if (runtimeTokens + item.tokens > runtimeCap) {
        dropped.push({ id: item.id, layer: 'runtime', reason: 'runtime budget exhausted' });
        continue;
      }
      seenDigests.set(digest, item.id);
      keptRuntime.push(item);
      runtimeTokens += item.tokens;
    }
    remaining -= runtimeTokens;

    // Layer 4: conversation — budgeted per turn so the cap drops a contiguous
    // oldest prefix and keeps the exchange the user is still inside of, never
    // a history with holes in it.
    const conversationCap = Math.min(budget.maxConversationTokens ?? remaining, remaining);
    const turns = request.conversationHistory ?? [];
    const keptTurns: ContextHistoryTurn[] = [];
    let conversationTokens = 0;
    // Newest first: the turns nearest the question survive the tightest budgets.
    // The first turn that does not fit ends the layer: everything older goes.
    let cutoff = -1;
    for (let index = turns.length - 1; index >= 0; index -= 1) {
      const turn = turns[index];
      if (turn === undefined) continue;
      const cost = estimateTokens(turn.content);
      if (conversationTokens + cost > conversationCap) {
        cutoff = index;
        break;
      }
      keptTurns.unshift(turn);
      conversationTokens += cost;
    }
    for (let index = 0; index <= cutoff; index += 1) {
      dropped.push({
        id: `conversation:turn-${index + 1}`,
        layer: 'conversation',
        reason: 'conversation budget exhausted; oldest turns dropped first',
      });
    }
    const historyText = keptTurns.map((entry) => `${entry.role}: ${entry.content}`).join('\n');
    const keptSections: ContextSection[] = [];
    if (historyText.trim() !== '') {
      keptSections.push({
        id: 'chat-history',
        source: 'conversation',
        priority: LAYER_PRIORITY.conversation,
        content: historyText,
        tokens: conversationTokens,
        label: 'fact',
      });
    }

    // Layer 1 travels as a structural marker for the prompt contract; the
    // prompt path renders the system layer from it and does not repeat it as
    // context (that duplication is what this builder exists to end).
    const instructionSection: ContextSection = {
      id: 'instructions',
      source: 'instructions',
      priority: LAYER_PRIORITY['system-instructions'],
      content: request.instructions,
      tokens: instructionsTokens,
      label: 'fact',
    };

    const sections = [
      instructionSection,
      ...keptSections,
      ...[...keptRuntime].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id)),
    ];

    const layerTokens: Record<ContextLayer, number> = {
      'system-instructions': instructionsTokens,
      'agent-policies': policiesTokens,
      runtime: runtimeTokens,
      conversation: conversationTokens,
      'user-input': userInputTokens,
    };
    const totalTokens = Object.values(layerTokens).reduce((sum, n) => sum + n, 0);

    // The pre-request validation, stated as an invariant rather than trusted
    // to the arithmetic above: the assembled call fits the budget, always.
    if (totalTokens > usable) {
      throw new AppError(
        'INTERNAL',
        'assembled context exceeds the budget after assembly; refusing to send an oversized request',
        { details: { totalTokens, usable, layerTokens } },
      );
    }

    return {
      correlationId: request.correlationId,
      sections,
      userInput,
      agentPolicies,
      layerTokens,
      totalTokens,
      dropped,
      truncated: dropped.length > 0,
    };
  }
}

/** Shared builder instance; assembly is pure so one is enough. */
export const contextBuilder = new AgentContextBuilder();
