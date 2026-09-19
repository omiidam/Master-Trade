/**
 * Core shared types for Master Trade.
 *
 * Design rules (Phase 1):
 * - Facts, analysis, hypotheses and uncertainty are always distinguishable.
 * - Risk-relevant results must come from deterministic tools, never from LLM reasoning alone.
 * - No tool in this codebase may place orders or touch a broker.
 */

/** Epistemic label attached to every piece of agent output. */
export type EpistemicKind = 'fact' | 'analysis' | 'hypothesis' | 'uncertainty';

/** Content produced by the Model (LLM reasoning). Never trusted for risk math. */
export interface ModelStatement {
  kind: EpistemicKind;
  text: string;
  /** Deterministic sources backing this statement, if any. */
  sources: string[];
}

/** A training-only market "asset" the agent can reason about. */
export interface SymbolInfo {
  symbol: string;
  name: string;
  /** Asset class, e.g. 'equity' | 'fx' | 'crypto' | 'commodity'. */
  assetClass: string;
}

/** A single OHLCV bar (deterministic data, not model output). */
export interface Bar {
  symbol: string;
  date: string; // ISO date
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** The single, non-negotiable operating mode of the system in Phase 1. */
export type OperatingMode = 'training' | 'sandbox' | 'shadow';

/**
 * Runtime safety profile. There is deliberately no 'live' mode and no
 * capability anywhere in the codebase that could execute trades.
 */
export interface SafetyProfile {
  mode: OperatingMode;
  /** Must always be false in Phase 1; enforced by tests. */
  liveTradingEnabled: false;
  /** Must always be false in Phase 1; enforced by tests. */
  brokerExecutionEnabled: false;
}

export const DEFAULT_SAFETY_PROFILE: SafetyProfile = {
  mode: 'training',
  liveTradingEnabled: false,
  brokerExecutionEnabled: false,
};
