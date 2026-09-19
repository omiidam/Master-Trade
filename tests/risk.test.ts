import { describe, expect, it } from 'vitest';
import { positionSizeTool, rMultipleTool } from '../src/tools/risk.js';

describe('risk.positionSize', () => {
  it('computes fixed-fractional sizing deterministically', () => {
    const result = positionSizeTool.run({
      accountEquity: 10_000,
      riskPerTrade: 0.01,
      entry: 100,
      stop: 95,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.riskAmount).toBe(100);
    expect(result.value.stopDistance).toBe(5);
    expect(result.value.positionSize).toBe(20);
    expect(result.value.notional).toBe(2_000);
  });

  it('rejects invalid inputs', () => {
    expect(
      positionSizeTool.run({ accountEquity: -1, riskPerTrade: 0.01, entry: 100, stop: 95 }).ok,
    ).toBe(false);
    expect(
      positionSizeTool.run({ accountEquity: 10_000, riskPerTrade: 0.5, entry: 100, stop: 95 }).ok,
    ).toBe(false);
    expect(
      positionSizeTool.run({ accountEquity: 10_000, riskPerTrade: 0.01, entry: 100, stop: 100 }).ok,
    ).toBe(false);
  });
});

describe('risk.rMultiple', () => {
  it('computes reward:risk', () => {
    const result = rMultipleTool.run({ entry: 100, stop: 95, target: 115 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rMultiple).toBeCloseTo(3);
  });
});
