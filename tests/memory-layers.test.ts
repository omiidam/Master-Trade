import { describe, expect, it } from 'vitest';
import {
  assertRecordAdmissible,
  compareVersions,
  createEpisodicStore,
  createProceduralStore,
  createSemanticStore,
  type EpisodicRecord,
  type ProceduralRecord,
  type SemanticRecord,
} from '../src/memory/layers.js';
import { LayeredMemoryRetriever, memoryContextSource } from '../src/memory/retrieval.js';

const system = { scope: 'system' } as const;
const user = (id: string) => ({ scope: 'user', userId: id }) as const;

function procedural(overrides: Partial<ProceduralRecord> = {}): ProceduralRecord {
  return {
    layer: 'procedural',
    id: 'proc-1',
    owner: system,
    sensitivity: 'internal',
    createdAt: '2026-10-05T00:00:00Z',
    version: '1.0.0',
    kind: 'how-to',
    name: 'position-sizing.walkthrough',
    content: 'Steps to size a position with the deterministic tool.',
    ...overrides,
  };
}

function semantic(overrides: Partial<SemanticRecord> = {}): SemanticRecord {
  return {
    layer: 'semantic',
    id: 'sem-1',
    owner: user('u-1'),
    sensitivity: 'private',
    createdAt: '2026-10-05T00:00:00Z',
    version: '1.0.0',
    kind: 'user-profile',
    subject: 'user.risk-tolerance',
    content: 'Prefers conservative sizing; max 1% risk per trade.',
    ...overrides,
  };
}

function episodic(overrides: Partial<EpisodicRecord> = {}): EpisodicRecord {
  return {
    layer: 'episodic',
    id: 'ep-1',
    owner: user('u-1'),
    sensitivity: 'private',
    createdAt: '2026-10-05T00:00:00Z',
    version: '1.0.0',
    kind: 'conversation',
    occurredAt: '2026-10-04T12:00:00Z',
    title: 'asked about R-multiples',
    content: 'The user asked how R-multiples work and the agent explained.',
    ...overrides,
  };
}

describe('memory layers', () => {
  it('refuses records in the wrong layer store', () => {
    const proc = createProceduralStore();
    expect(() => proc.write(episodic() as unknown as ProceduralRecord)).toThrow(
      /refused by the procedural store/,
    );
  });

  it('refuses private content in procedural memory and in system-scoped records', () => {
    const proc = createProceduralStore();
    expect(() => proc.write(procedural({ sensitivity: 'private' }))).toThrow(
      /private content is refused in procedural memory/,
    );
    expect(() => proc.write(procedural({ owner: system, sensitivity: 'private' }))).toThrow(
      /private content is refused in procedural memory/,
    );

    const sem = createSemanticStore();
    expect(() => sem.write(semantic({ owner: system }))).toThrow(
      /private content requires a user-scoped record/,
    );

    // Public system records are fine.
    const ok = proc.write(procedural({ sensitivity: 'public' }));
    expect(ok.id).toBe('proc-1');
  });

  it('enforces scoping at read: cross-user reads throw instead of filtering', () => {
    const sem = createSemanticStore();
    sem.write(semantic());
    expect(() => sem.read('sem-1', user('u-2'))).toThrow(/not found within scope/);
    expect(sem.read('sem-1', user('u-1')).subject).toBe('user.risk-tolerance');
    // System records are visible to every scope.
    const proc = createProceduralStore();
    proc.write(procedural());
    expect(proc.read('proc-1', user('u-9')).name).toBe('position-sizing.walkthrough');
  });

  it('never leaks another user\u2019s records through a query', () => {
    const ep = createEpisodicStore();
    ep.write(episodic({ id: 'ep-1', owner: user('u-1'), title: 'u1 event' }));
    ep.write(episodic({ id: 'ep-2', owner: user('u-2'), title: 'u2 event' }));
    const forU1 = ep.query({ text: 'event' }, user('u-1'));
    expect(forU1.map((r) => r.id)).toEqual(['ep-1']);
  });

  it('versions immutably: a change appends, ownership cannot change, versions must increase', () => {
    const sem = createSemanticStore();
    sem.write(semantic());
    const v2 = sem.writeVersion(semantic({ version: '1.1.0', content: 'Updated: 0.5% risk.' }));
    expect(v2.supersedes).toBe('sem-1@1.0.0');
    expect(sem.history('sem-1', user('u-1')).map((r) => r.version)).toEqual(['1.0.0', '1.1.0']);
    expect(sem.read('sem-1', user('u-1')).content).toBe('Updated: 0.5% risk.');

    // Refusals: same version, lower version, different owner, duplicate write.
    expect(() => sem.writeVersion(semantic({ version: '1.1.0' }))).toThrow(/must be greater/);
    expect(() => sem.writeVersion(semantic({ version: '1.0.0' }))).toThrow(/must be greater/);
    expect(() => sem.writeVersion(semantic({ version: '2.0.0', owner: user('u-2') }))).toThrow(
      /cannot change the owner/,
    );
    expect(() => sem.write(semantic())).toThrow(/already exists/);

    // Non-semver refuses.
    expect(() => compareVersions('abc', '1.0.0')).toThrow(/not semver/);
  });

  it('keeps conversational content episodic-only', () => {
    const sem = createSemanticStore();
    expect(() =>
      sem.write({ ...semantic(), kind: 'conversation' } as unknown as SemanticRecord),
    ).toThrow(/episodic-only/);
    // The episodic store accepts it, as the one layer that may.
    const ep = createEpisodicStore();
    expect(ep.write(episodic()).kind).toBe('conversation');
  });

  it('retrieves each layer separately with its own cap and order', () => {
    const proc = createProceduralStore();
    const sem = createSemanticStore();
    const ep = createEpisodicStore();
    proc.write(procedural({ id: 'proc-sizing', name: 'sizing.steps' }));
    proc.write(procedural({ id: 'proc-journal', name: 'journal.steps' }));
    sem.write(semantic());
    sem.write(semantic({ id: 'sem-2', subject: 'user.timezone', content: 'UTC+3:30.' }));
    ep.write(episodic());
    ep.write(
      episodic({ id: 'ep-2', occurredAt: '2026-10-05T09:00:00Z', title: 'reviewed a trade' }),
    );

    const retriever = new LayeredMemoryRetriever({
      procedural: proc,
      semantic: sem,
      episodic: ep,
      now: () => '2026-10-05T12:00:00Z',
    });
    const result = retriever.retrieve({ scope: user('u-1'), query: 'sizing' });

    // Query 'sizing' hits the procedural skill and the semantic subject, not the off-topic records.
    expect(result.procedural.map((s) => s.id)).toEqual(['procedural:sizing.steps@1.0.0']);
    expect(result.semantic.map((s) => s.id)).toEqual(['semantic:user.risk-tolerance@1.0.0']);
    // The same query filters episodic by relevance too: neither event mentions sizing.
    expect(result.episodic).toHaveLength(0);

    // A query that matches the events retrieves them, newest first, still inside the window.
    const episodicHit = retriever.retrieve({ scope: user('u-1'), query: 'user' });
    expect(episodicHit.episodic.map((s) => s.id)).toEqual([
      'episodic:ep-2@1.0.0',
      'episodic:ep-1@1.0.0',
    ]);
    // Presentation order: procedural, semantic, episodic.
    expect(result.sections.map((s) => s.id)).toEqual([
      'procedural:sizing.steps@1.0.0',
      'semantic:user.risk-tolerance@1.0.0',
      ...result.episodic.map((s) => s.id),
    ]);
    // Layers are labelled by source and never merged into one blob.
    expect(result.procedural.every((s) => s.source === 'instructions')).toBe(true);
    expect(result.semantic.every((s) => s.source === 'memory')).toBe(true);
    expect(result.layerTokens.procedural).toBeGreaterThan(0);
  });

  it('caps each layer by tokens, dropping from the end', () => {
    const proc = createProceduralStore();
    for (const i of [1, 2, 3]) {
      proc.write(procedural({ id: `proc-${i}`, name: `rule.${i}`, content: 'x'.repeat(200 * i) }));
    }
    const retriever = new LayeredMemoryRetriever({
      procedural: proc,
      semantic: createSemanticStore(),
      episodic: createEpisodicStore(),
      now: () => '2026-10-05T12:00:00Z',
    });
    const result = retriever.retrieve({
      scope: system,
      query: 'rule',
      layerTokenCaps: { procedural: 60 },
    });
    // The 200-char and 400-char entries are ~50 and ~100 tokens; only the small ones fit 60.
    expect(result.procedural.length).toBeLessThan(3);
    expect(result.layerTokens.procedural).toBeLessThanOrEqual(60);
  });

  it('excludes episodic records outside the recency window', () => {
    const ep = createEpisodicStore();
    ep.write(episodic());
    ep.write(
      episodic({ id: 'ep-old', occurredAt: '2025-01-01T00:00:00Z', title: 'ancient history' }),
    );
    const retriever = new LayeredMemoryRetriever({
      procedural: createProceduralStore(),
      semantic: createSemanticStore(),
      episodic: ep,
      now: () => '2026-10-05T12:00:00Z',
    });
    const result = retriever.retrieve({ scope: user('u-1'), query: 'history' });
    expect(result.episodic.map((s) => s.id)).not.toContain('episodic:ep-old@1.0.0');
  });

  it('bridges retrieval into the agent context builder as runtime context', () => {
    const proc = createProceduralStore();
    const sem = createSemanticStore();
    const ep = createEpisodicStore();
    proc.write(procedural());
    sem.write(semantic());
    ep.write(episodic());
    const retriever = new LayeredMemoryRetriever({
      procedural: proc,
      semantic: sem,
      episodic: ep,
      now: () => '2026-10-05T12:00:00Z',
    });
    const source = memoryContextSource(retriever);
    const sections = source.sectionsFor({ scope: user('u-1'), query: 'sizing' });

    // The sections are ContextSection[] — the exact type AgentRunInput.runtimeContext takes.
    expect(sections.length).toBeGreaterThan(0);
    for (const s of sections) {
      expect(typeof s.id).toBe('string');
      expect(s.tokens).toBeGreaterThan(0);
      expect(['instructions', 'memory']).toContain(s.source);
    }
    // Semantic sections carry provenance, as the context rules require of memory.
    expect(
      sections.filter((s) => s.source === 'memory').every((s) => s.provenance !== undefined),
    ).toBe(true);
  });

  it('refuses an empty user scope', () => {
    const retriever = new LayeredMemoryRetriever({
      procedural: createProceduralStore(),
      semantic: createSemanticStore(),
      episodic: createEpisodicStore(),
    });
    expect(() =>
      retriever.retrieve({ scope: { scope: 'user', userId: '  ' }, query: 'x' }),
    ).toThrow(/non-empty userId/);
  });
});
