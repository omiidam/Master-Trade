import { describe, expect, it } from 'vitest';
import { smaTool, syntheticSeriesTool } from '../src/tools/marketData.js';
import { sma } from '../src/tools/marketData.js';

describe('marketData.syntheticSeries', () => {
  it('is deterministic for the same seed', () => {
    const a = syntheticSeriesTool.run({ symbol: 'TEST', bars: 30, seed: 42, startPrice: 100 });
    const b = syntheticSeriesTool.run({ symbol: 'TEST', bars: 30, seed: 42, startPrice: 100 });
    expect(a).toEqual(b);
  });

  it('labels output as synthetic', () => {
    const result = syntheticSeriesTool.run({ symbol: 'TEST', bars: 10, seed: 1, startPrice: 50 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.provenance).toMatch(/NOT real market data/);
  });

  it('rejects invalid input', () => {
    expect(syntheticSeriesTool.run({ symbol: '', bars: 10, seed: 1, startPrice: 50 }).ok).toBe(
      false,
    );
    expect(syntheticSeriesTool.run({ symbol: 'T', bars: 1, seed: 1, startPrice: 50 }).ok).toBe(
      false,
    );
  });
});

describe('sma', () => {
  it('computes SMA over closes', () => {
    expect(sma([1, 2, 3, 4, 5], 5)).toBe(3);
    expect(sma([1, 2, 3], 5)).toBeNull();
  });

  it('sma tool reports insufficient data', () => {
    const result = smaTool.run({ closes: [1, 2], period: 5 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.value).toBeNull();
  });
});
