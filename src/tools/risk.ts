/**
 * Deterministic risk-management tools.
 *
 * HARD RULE: risk numbers used for decision support MUST come from these
 * deterministic functions, never from model-generated reasoning alone.
 * The Model may *explain* these outputs; it may never *produce* them.
 */

import type { Tool } from './framework.js';
import { err, ok, requirePositiveNumber, type ToolResult } from './framework.js';

export interface PositionSizeInput {
  accountEquity: number;
  /** Decimal fraction, e.g. 0.01 = 1% account risk per trade. */
  riskPerTrade: number;
  /** Entry price. */
  entry: number;
  /** Stop-loss price. */
  stop: number;
}

export interface PositionSizeOutput {
  riskAmount: number;
  stopDistance: number;
  stopDistancePercent: number;
  /** Units/contracts to trade (fractional allowed; broker rounding is out of scope). */
  positionSize: number;
  notional: number;
}

/** Fixed-fractional position sizing. Deterministic. */
export const positionSizeTool: Tool<PositionSizeInput, ToolResult<PositionSizeOutput>> = {
  descriptor: {
    name: 'risk.positionSize',
    category: 'risk-management',
    capabilities: ['risk.calculate'],
    semantics: { epistemicKind: 'fact', hasSideEffects: false },
    description: 'Fixed-fractional position size from equity, risk %, entry and stop.',
    version: '1.0.0',
  },
  run(input): ToolResult<PositionSizeOutput> {
    const checks: (string | null)[] = [
      requirePositiveNumber(input.accountEquity, 'accountEquity'),
      requirePositiveNumber(input.entry, 'entry'),
      requirePositiveNumber(input.stop, 'stop'),
    ];
    const failed = checks.find((c) => c !== null);
    if (failed) return err(failed);
    if (
      typeof input.riskPerTrade !== 'number' ||
      !Number.isFinite(input.riskPerTrade) ||
      input.riskPerTrade <= 0 ||
      input.riskPerTrade > 0.1
    ) {
      return err('riskPerTrade must be a finite number in (0, 0.1] (max 10% per trade)');
    }

    const riskAmount = input.accountEquity * input.riskPerTrade;
    const stopDistance = Math.abs(input.entry - input.stop);
    if (stopDistance === 0) return err('entry and stop must differ');

    const positionSize = riskAmount / stopDistance;
    const notional = positionSize * input.entry;

    return ok({
      riskAmount,
      stopDistance,
      stopDistancePercent: stopDistance / input.entry,
      positionSize,
      notional,
    });
  },
};

export interface RMultipleInput {
  entry: number;
  stop: number;
  target: number;
}

export interface RMultipleOutput {
  riskPerUnit: number;
  rewardPerUnit: number;
  /** Reward/risk ratio in R multiples. */
  rMultiple: number;
}

/** Reward:risk in R multiples. Deterministic. */
export const rMultipleTool: Tool<RMultipleInput, ToolResult<RMultipleOutput>> = {
  descriptor: {
    name: 'risk.rMultiple',
    category: 'risk-management',
    capabilities: ['risk.calculate'],
    semantics: { epistemicKind: 'fact', hasSideEffects: false },
    description: 'Compute reward:risk ratio (R multiple) from entry, stop and target.',
    version: '1.0.0',
  },
  run(input): ToolResult<RMultipleOutput> {
    const checks: (string | null)[] = [
      requirePositiveNumber(input.entry, 'entry'),
      requirePositiveNumber(input.stop, 'stop'),
      requirePositiveNumber(input.target, 'target'),
    ];
    const failed = checks.find((c) => c !== null);
    if (failed) return err(failed);

    const riskPerUnit = Math.abs(input.entry - input.stop);
    const rewardPerUnit = Math.abs(input.target - input.entry);
    if (riskPerUnit === 0) return err('entry and stop must differ');
    if (rewardPerUnit === 0) return err('entry and target must differ');

    return ok({
      riskPerUnit,
      rewardPerUnit,
      rMultiple: rewardPerUnit / riskPerUnit,
    });
  },
};
