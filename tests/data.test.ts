import { describe, expect, it } from 'vitest';
import {
  MarketDataSource,
  normalizeSymbol,
  validateBars,
  syntheticProvider,
  type MarketDataRequest,
} from '../packages/shared/src/marketdata/provider.js';
import type { Bar } from '../packages/shared/src/types.js';
import { PolicyViolationError } from '../packages/shared/src/core/errors.js';
import {
  InMemoryVectorMemory,
  hashEmbeddingProvider,
  cosineSimilarity,
  embedText,
} from '../src/vector/memory.js';
import {
  contextKindForTrust,
  modelProvenance,
  toolProvenance,
} from '../packages/shared/src/core/provenance.js';

const request = (provenance: MarketDataRequest['provenance'] = 'synthetic'): MarketDataRequest => ({
  symbol: normalizeSymbol(' aapl '),
  timeframe: { unit: 'day', amount: 1 },
  fromIso: '2024-01-01T00:00:00.000Z',
  toIso: '2024-01-10T00:00:00.000Z',
  provenance,
});

const bar = (date: string, close = 100): Bar => ({
  symbol: 'AAPL',
  date,
  open: close,
  high: close * 1.01,
  low: close * 0.99,
  close: close * 1.005,
  volume: 1_000,
});

describe('market data layer', () => {
  it('normalizes symbols deterministically', () => {
    const symbol = normalizeSymbol(' eurusd ', {
      assetClass: 'fx',
      exchange: 'FX',
      timezone: 'UTC',
    });
    expect(symbol.symbol).toBe('EURUSD');
    expect(symbol.assetClass).toBe('fx');
  });

  it('refuses live data in this phase', async () => {
    const source = new MarketDataSource([syntheticProvider()], {
      allowedProvenance: ['synthetic', 'historical'],
      maxBarsPerRequest: 100,
      requestTimeoutMs: 1_000,
    });
    await expect(source.getBars(request('live'))).rejects.toBeInstanceOf(PolicyViolationError);
  });

  it('returns normalized bars tagged with provenance and source', async () => {
    const source = new MarketDataSource([syntheticProvider()], {
      allowedProvenance: ['synthetic', 'historical'],
      maxBarsPerRequest: 100,
      requestTimeoutMs: 1_000,
    });
    const result = await source.getBars(request());
    expect(result.quality.passed).toBe(true);
    expect(result.bars.length).toBeGreaterThan(0);
    const first = result.bars[0];
    expect(first?.provenance).toBe('synthetic');
    expect(first?.timeframe).toBe('1d');
    expect(first?.source).toBe('local-synthetic');
    expect(result.provenanceRecord.note).toMatch(/synthetic/i);
  });

  it('reports data-quality problems instead of hiding them', () => {
    const unsorted = [bar('2024-01-03T00:00:00.000Z'), bar('2024-01-02T00:00:00.000Z')];
    const report = validateBars(unsorted, request());
    expect(report.passed).toBe(false);
    expect(report.issues.join(' ')).toMatch(/ascending/);

    const duplicate = [bar('2024-01-02T00:00:00.000Z'), bar('2024-01-02T00:00:00.000Z')];
    expect(validateBars(duplicate, request()).issues.join(' ')).toMatch(
      /not strictly ascending|duplicate/,
    );

    const inconsistent: Bar[] = [{ ...bar('2024-01-02T00:00:00.000Z'), high: 1, low: 2 }];
    expect(validateBars(inconsistent, request()).issues.join(' ')).toMatch(/OHLC/);

    const outside = [bar('2025-06-01T00:00:00.000Z')];
    expect(validateBars(outside, request()).issues.join(' ')).toMatch(/outside requested range/);
  });

  it('surfaces provider failures and rate limits', async () => {
    const limited = new MarketDataSource(
      [
        syntheticProvider({
          limits: { requestsPerMinute: 1, maxBarsPerRequest: 100 },
        }),
      ],
      { allowedProvenance: ['synthetic'], maxBarsPerRequest: 100, requestTimeoutMs: 1_000 },
    );
    await limited.getBars(request());
    await expect(limited.getBars(request())).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });

    const slow = new MarketDataSource([syntheticProvider({ delayMs: 5_000 })], {
      allowedProvenance: ['synthetic'],
      maxBarsPerRequest: 100,
      requestTimeoutMs: 15,
    });
    await expect(slow.getBars(request())).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });
});

describe('vector memory', () => {
  it('computes deterministic embeddings and similarity', () => {
    const a = embedText('position sizing risk', 32);
    const b = embedText('position sizing risk', 32);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1);
    const embedder = hashEmbeddingProvider({ dimensions: 16 });
    expect(embedder.dimensions).toBe(16);
  });

  it('ranks by semantic similarity and reports trust labels', async () => {
    const memory = new InMemoryVectorMemory();
    await memory.upsert({
      type: 'lesson-note',
      text: 'Fixed fractional position sizing risks a constant fraction of equity per trade.',
      metadata: { subject: 'risk', tags: ['risk'], createdBy: 'coach', epistemicKind: 'fact' },
      provenance: toolProvenance('risk.positionSize'),
      actorId: 'coach',
    });
    await memory.upsert({
      type: 'lesson-note',
      text: 'Candlestick chart patterns include doji and engulfing formations.',
      metadata: {
        subject: 'charting',
        tags: ['charting'],
        createdBy: 'coach',
        epistemicKind: 'fact',
      },
      provenance: toolProvenance('marketData.sma'),
      actorId: 'coach',
    });

    const ranked = await memory.query({ text: 'position sizing risk fraction', minScore: 0 });
    expect(ranked[0]?.record.metadata.subject).toBe('risk');
    expect(ranked[0]?.contextKind).toBe('fact');
  });

  it('never lets model output become trusted knowledge', async () => {
    const memory = new InMemoryVectorMemory();
    const record = await memory.upsert({
      type: 'agent-insight',
      text: 'Maybe a 2% risk per trade performs better in trending markets.',
      metadata: {
        subject: 'risk',
        tags: [],
        createdBy: 'scripted-model',
        epistemicKind: 'hypothesis',
      },
      provenance: modelProvenance('scripted-model'),
      actorId: 'scripted-model',
    });

    expect(record.trust).toBe('unverified');
    expect(contextKindForTrust(record.trust)).toBe('uncertainty');

    // A tool (automation) may never grant authoritative trust.
    await expect(
      memory.promote(record.id, 'authoritative', { kind: 'tool', id: 'grader' }, 'grader'),
    ).rejects.toBeInstanceOf(PolicyViolationError);

    // A human verifier may.
    const verified = await memory.promote(
      record.id,
      'authoritative',
      { kind: 'human', id: 'coach-1' },
      'coach-1',
    );
    expect(verified.trust).toBe('authoritative');
    expect(verified.version).toBeGreaterThan(record.version);
    expect(memory.versions(record.id).length).toBeGreaterThan(1);
  });

  it('filters by trust and excludes tombstoned records', async () => {
    const memory = new InMemoryVectorMemory();
    const provisional = await memory.upsert({
      type: 'user-note',
      text: 'I think breakouts fail in low volume.',
      metadata: { subject: 'volume', tags: [], createdBy: 'student', epistemicKind: 'hypothesis' },
      provenance: modelProvenance('scripted-model'),
      actorId: 'student',
    });

    expect(
      await memory.query({ text: 'breakouts low volume', minScore: 0, minTrust: 'verified' }),
    ).toHaveLength(0);
    expect(await memory.query({ text: 'breakouts low volume', minScore: 0 })).toHaveLength(1);

    expect(memory.tombstone(provisional.id, 'student')).toBe(true);
    expect(await memory.query({ text: 'breakouts low volume', minScore: 0 })).toHaveLength(0);
    expect(
      await memory.query({ text: 'breakouts low volume', minScore: 0, includeDeleted: true }),
    ).toHaveLength(1);
  });

  it('rejects writes without provenance or text', async () => {
    const memory = new InMemoryVectorMemory();
    await expect(
      memory.upsert({
        type: 'user-note',
        text: '   ',
        metadata: { subject: 'x', tags: [], createdBy: 'u', epistemicKind: 'note' as never },
        provenance: modelProvenance('x'),
        actorId: 'u',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});
