/**
 * Context assembly.
 *
 * Deterministic, budgeted assembly of everything the model sees on a turn:
 * instructions, retrieved memory, conversation history and market data.
 *
 * Rules:
 *   - instructions are never dropped (they carry the safety policy);
 *   - memory sections must carry provenance;
 *   - unverified memory is labelled as uncertainty, never as fact.
 */

import { AppError } from '../core/errors.js';
import { contextKindForTrust, type Provenance, type TrustLevel } from '../core/provenance.js';
import type { EpistemicKind } from '../types.js';
import type { RankedMemory } from '../vector/memory.js';

export type ContextSource = 'instructions' | 'memory' | 'conversation' | 'market-data' | 'tools';

export interface ContextSection {
  id: string;
  source: ContextSource;
  /** Higher wins when the budget is tight. */
  priority: number;
  content: string;
  tokens: number;
  /** Trust level, when the section came from memory or data. */
  trust?: TrustLevel;
  provenance?: Provenance;
  /** Epistemic label this section must be presented with. */
  label: EpistemicKind;
}

export interface ContextBudget {
  maxTokens: number;
  /** Tokens held back so the response itself can fit. */
  reserveForResponse: number;
}

export const DEFAULT_CONTEXT_BUDGET: ContextBudget = {
  maxTokens: 8_000,
  reserveForResponse: 1_500,
};

/** Cheap, deterministic token estimate: ~4 characters per token. */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export interface AssembledContext {
  sections: ContextSection[];
  dropped: string[];
  totalTokens: number;
  truncated: boolean;
}

/** Wrap retrieved memory as labelled, provenance-carrying sections. */
export function sectionsFromMemory(ranked: readonly RankedMemory[]): ContextSection[] {
  return ranked.map(({ record, contextKind, score }) => ({
    id: `memory:${record.id}`,
    source: 'memory' as const,
    priority: 50 + Math.round(score * 10),
    content: record.text,
    tokens: estimateTokens(record.text),
    trust: record.trust,
    provenance: record.provenance,
    label: contextKind,
  }));
}

export function section(input: {
  id: string;
  source: ContextSource;
  priority: number;
  content: string;
  trust?: TrustLevel;
  provenance?: Provenance;
}): ContextSection {
  const base: ContextSection = {
    id: input.id,
    source: input.source,
    priority: input.priority,
    content: input.content,
    tokens: estimateTokens(input.content),
    label: input.trust ? contextKindForTrust(input.trust) : 'fact',
  };
  if (input.trust !== undefined) base.trust = input.trust;
  if (input.provenance !== undefined) base.provenance = input.provenance;
  return base;
}

/**
 * Assemble sections under a token budget. Instructions always make it in;
 * if they alone cannot fit, assembly fails loudly rather than truncating the
 * safety policy.
 */
export function assembleContext(
  sections: readonly ContextSection[],
  budget: ContextBudget = DEFAULT_CONTEXT_BUDGET,
): AssembledContext {
  const memorySections = sections.filter((item) => item.source === 'memory');
  const missingProvenance = memorySections.filter((item) => item.provenance === undefined);
  if (missingProvenance.length > 0) {
    throw new AppError('VALIDATION_FAILED', 'memory sections must carry provenance', {
      details: { sections: missingProvenance.map((item) => item.id) },
    });
  }

  const instructions = sections.filter((item) => item.source === 'instructions');
  const instructionsTokens = instructions.reduce((sum, item) => sum + item.tokens, 0);
  const available = budget.maxTokens - budget.reserveForResponse;
  if (instructionsTokens > available) {
    throw new AppError(
      'INTERNAL',
      'context budget is too small for the instruction set; refusing to drop safety instructions',
      { details: { instructionsTokens, available } },
    );
  }

  const ordered = [...sections].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  const kept: ContextSection[] = [];
  const dropped: string[] = [];
  let used = 0;

  for (const item of ordered) {
    if (item.source === 'instructions') {
      kept.push(item);
      used += item.tokens;
      continue;
    }
    if (used + item.tokens > available) {
      dropped.push(item.id);
      continue;
    }
    kept.push(item);
    used += item.tokens;
  }

  kept.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  return {
    sections: kept,
    dropped,
    totalTokens: used,
    truncated: dropped.length > 0,
  };
}
