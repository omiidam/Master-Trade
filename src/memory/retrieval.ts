/**
 * Memory retrieval — the boundaries between layers, and the bridge to
 * the agent context builder.
 *
 * The three layers are retrieved **separately and labelled** — never
 * merged into one undifferentiated blob — because what a record is
 * decides how the model may treat it:
 *
 *   - procedural sections are instructions-adjacent: they arrive from
 *     the system's own layer and carry the highest priority;
 *   - semantic sections are durable facts about the scoped user, and
 *     only about the scoped user — the retrieval scope *is* the user
 *     scope, so cross-user knowledge cannot be assembled even by a
 *     caller that asks for it;
 *   - episodic sections are dated history, capped to a recency window,
 *     presented as what happened — never as what to do.
 *
 * Each layer also gets its own token cap, so a chatty episodic layer
 * cannot crowd out procedural rules or the user's prompt.
 *
 * The output is `ContextSection[]` — the exact type the run harness's
 * assembly (`AgentRunHarness.run` → `assembleContext`) consumes as
 * runtime context. The bridge changes no context rules; it only
 * produces labelled, priority-ranked, budget-respecting sections.
 *
 * No summarization or distillation happens here: sections are the
 * records themselves, headlined and clipped to the layer cap. Working
 * memory in the harness stays ephemeral and untouched — this module
 * writes nothing and holds nothing between calls.
 */

import type { ContextSection } from '../agent/context.js';
import { section as makeSection } from '../agent/context.js';
import { AppError } from '../../packages/shared/src/core/errors.js';
import { provenance } from '../../packages/shared/src/core/provenance.js';
import type { EpisodicQuery, MemoryOwner, ProceduralQuery, SemanticQuery } from './layers.js';
import type {
  MemoryLayerStore,
  ProceduralRecord,
  SemanticRecord,
  EpisodicRecord,
} from './layers.js';

// ── The retrieval request ──────────────────────────────────────────────────

export interface MemoryRetrievalRequest {
  /**
   * The user the retrieval runs for. Every user-scoped record in the
   * result belongs to this user; system records are visible to all.
   * There is no unscoped retrieval.
   */
  scope: MemoryOwner;
  /** The user's question or the run's purpose, matched per layer. */
  query: string;
  /** Maximum sections per layer. */
  perLayerLimit?: number;
  /** Token cap per layer. Default: procedural 1_000, semantic 1_500, episodic 1_500. */
  layerTokenCaps?: Partial<Record<'procedural' | 'semantic' | 'episodic', number>>;
  /** Recency window for episodic records, in days. Default 30. */
  episodicWindowDays?: number;
}

export interface MemoryRetrievalResult {
  procedural: readonly ContextSection[];
  semantic: readonly ContextSection[];
  episodic: readonly ContextSection[];
  /** All three layers flattened, in presentation order (procedural first). */
  sections: readonly ContextSection[];
  /** What each layer spent, for diagnostics. */
  layerTokens: Readonly<Record<'procedural' | 'semantic' | 'episodic', number>>;
}

/** Per-layer defaults: procedural outranks, episodic is capped hardest. */
export const DEFAULT_LAYER_CAPS = {
  procedural: { limit: 5, tokens: 1_000 },
  semantic: { limit: 5, tokens: 1_500 },
  episodic: { limit: 8, tokens: 1_500 },
} as const;

const DAY_MS = 24 * 60 * 60 * 1_000;

// ── The contract ───────────────────────────────────────────────────────────

export interface MemoryRetriever {
  retrieve(request: MemoryRetrievalRequest): MemoryRetrievalResult;
}

// ── The implementation over the three stores ───────────────────────────────

export interface LayeredMemoryDeps {
  procedural: MemoryLayerStore<ProceduralRecord, ProceduralQuery>;
  semantic: MemoryLayerStore<SemanticRecord, SemanticQuery>;
  episodic: MemoryLayerStore<EpisodicRecord, EpisodicQuery>;
  /** ISO timestamp source, injectable for tests. */
  now?: () => string;
}

export class LayeredMemoryRetriever implements MemoryRetriever {
  private readonly deps: LayeredMemoryDeps;

  constructor(deps: LayeredMemoryDeps) {
    this.deps = deps;
  }

  retrieve(request: MemoryRetrievalRequest): MemoryRetrievalResult {
    assertScoped(request.scope);
    const now = this.deps.now?.() ?? new Date().toISOString();

    // Procedural: how to do things. System-owned rules and skills.
    const proceduralRaw = this.deps.procedural
      .query({ text: request.query }, request.scope)
      .slice(0, request.perLayerLimit ?? DEFAULT_LAYER_CAPS.procedural.limit);
    const procedural = this.clip(
      proceduralRaw.map((record) =>
        makeSection({
          id: `procedural:${record.name}@${record.version}`,
          source: 'instructions',
          priority: 95,
          content: `[${record.kind.toUpperCase()}] ${record.name} (v${record.version})\n${record.content}`,
        }),
      ),
      request.layerTokenCaps?.procedural ?? DEFAULT_LAYER_CAPS.procedural.tokens,
    );

    // Semantic: durable facts and profile knowledge, owner-scoped by the store.
    const semanticRaw = this.deps.semantic
      .query({ text: request.query }, request.scope)
      .slice(0, request.perLayerLimit ?? DEFAULT_LAYER_CAPS.semantic.limit);
    const semantic = this.clip(
      semanticRaw.map((record) =>
        makeSection({
          id: `semantic:${record.subject}@${record.version}`,
          source: 'memory',
          priority: 70,
          content: `${record.subject}: ${record.content}`,
          trust: 'verified',
          provenance: provenance({
            source: 'human',
            ref: `${record.id}@${record.version}`,
            trust: 'verified',
            note: `semantic memory (${record.kind})`,
          }),
        }),
      ),
      request.layerTokenCaps?.semantic ?? DEFAULT_LAYER_CAPS.semantic.tokens,
    );

    // Episodic: dated events inside the recency window, newest first.
    const windowStart = new Date(
      Date.parse(now) - (request.episodicWindowDays ?? 30) * DAY_MS,
    ).toISOString();
    const episodicQuery: EpisodicQuery = {
      text: request.query,
      from: windowStart,
      newestFirst: true,
    };
    const episodicRaw = [...this.deps.episodic.query(episodicQuery, request.scope)]
      // Newest first, as episodic history is read.
      .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0))
      .slice(0, request.perLayerLimit ?? DEFAULT_LAYER_CAPS.episodic.limit);
    const episodic = this.clip(
      episodicRaw.map((record) =>
        makeSection({
          id: `episodic:${record.id}@${record.version}`,
          source: 'memory',
          priority: 50,
          content: `${record.occurredAt} — ${record.title}: ${record.content}`,
          trust: 'unverified',
          provenance: provenance({
            source: 'human',
            ref: `${record.id}@${record.version}`,
            trust: 'unverified',
            note: `episodic memory (${record.kind})`,
          }),
        }),
      ),
      request.layerTokenCaps?.episodic ?? DEFAULT_LAYER_CAPS.episodic.tokens,
    );

    const layerTokens = {
      procedural: sumTokens(procedural),
      semantic: sumTokens(semantic),
      episodic: sumTokens(episodic),
    };

    return {
      procedural,
      semantic,
      episodic,
      // Presentation order: how-to first, then what is true, then what happened.
      sections: [...procedural, ...semantic, ...episodic],
      layerTokens,
    };
  }

  /** Clip sections to a layer's token cap, dropping from the end. */
  private clip(sections: readonly ContextSection[], cap: number): ContextSection[] {
    const kept: ContextSection[] = [];
    let used = 0;
    for (const item of sections) {
      if (used + item.tokens > cap) continue;
      kept.push(item);
      used += item.tokens;
    }
    return kept;
  }
}

function sumTokens(sections: readonly ContextSection[]): number {
  return sections.reduce((sum, s) => sum + s.tokens, 0);
}

// ── The context-builder connection ─────────────────────────────────────────

/**
 * The contract between memory retrieval and the agent's context
 * assembly. `AgentRunInput.runtimeContext` is `ContextSection[]`; a
 * caller wires memory in by passing `retrieve(request).sections` —
 * and `MemoryContextSource` is the typed helper that makes the
 * connection explicit and testable rather than a convention.
 */
export interface MemoryContextSource {
  /** Retrieve for a run and return the sections the harness should see. */
  sectionsFor(request: MemoryRetrievalRequest): readonly ContextSection[];
}

export function memoryContextSource(retriever: MemoryRetriever): MemoryContextSource {
  return {
    sectionsFor(request: MemoryRetrievalRequest): readonly ContextSection[] {
      const result = retriever.retrieve(request);
      return result.sections;
    },
  };
}

/** Guard against a caller trying to retrieve without a user scope. */
export function assertScoped(scope: MemoryOwner): void {
  if (scope.scope === 'user' && scope.userId.trim() === '') {
    throw new AppError('VALIDATION_FAILED', 'user scope requires a non-empty userId');
  }
}
