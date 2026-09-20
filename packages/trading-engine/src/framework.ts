/**
 * Tool framework: explicit, typed, testable tools.
 *
 * Every tool:
 * - declares a typed input and output at compile time,
 * - is deterministic (same input -> same output) unless explicitly a
 *   `dataSource` tool whose provenance is recorded,
 * - never performs side effects (orders, network writes, file writes).
 */

import type { EpistemicKind } from '../../shared/src/types.js';

/** Capability classes used by the permission model. */
export type ToolCapability =
  | 'marketData.read'
  | 'marketData.synthetic'
  | 'risk.calculate'
  | 'education.explain'
  | 'memory.write'
  | 'backtest.run';

/** Categories a tool belongs to (mirrors docs/architecture.md). */
export type ToolCategory =
  'market-data' | 'deterministic-calc' | 'risk-management' | 'education' | 'backtesting';

/** How the tool's output should be treated epistemically. */
export interface ToolOutputSemantics {
  /** Label applied to results coming from this tool. */
  epistemicKind: EpistemicKind;
  /** True if the tool performs any side effect. Must be false in Phase 1. */
  hasSideEffects: boolean;
}

/** Declarative descriptor for a tool. */
export interface ToolDescriptor {
  name: string;
  category: ToolCategory;
  capabilities: ToolCapability[];
  semantics: ToolOutputSemantics;
  description: string;
  version: string;
}

/** A registered tool: descriptor + typed run function. */
export interface Tool<TInput, TOutput> {
  descriptor: ToolDescriptor;
  run(input: TInput): TOutput;
}

/** Type-erased tool as stored in the registry. */
export type AnyTool = Tool<unknown, unknown>;

/**
 * Result envelope for tool runs. Deterministic tools may still fail on
 * invalid input; failures are values, not exceptions, for easy testing.
 */
export type ToolResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Registry of tools keyed by name. */
export class ToolRegistry {
  private readonly tools = new Map<string, AnyTool>();

  register<TInput, TOutput>(tool: Tool<TInput, TOutput>): void {
    if (this.tools.has(tool.descriptor.name)) {
      throw new Error(`Tool already registered: ${tool.descriptor.name}`);
    }
    if (tool.descriptor.semantics.hasSideEffects) {
      // Phase 1 hard rule: no side-effecting tools, ever.
      throw new Error(`Refusing to register side-effecting tool: ${tool.descriptor.name}`);
    }
    this.tools.set(tool.descriptor.name, tool as unknown as AnyTool);
  }

  get(name: string): AnyTool | undefined {
    return this.tools.get(name);
  }

  list(): AnyTool[] {
    return [...this.tools.values()];
  }
}

/** Helper to build a result envelope. */
export const ok = <T>(value: T): ToolResult<T> => ({ ok: true, value });
export const err = <T = never>(error: string): ToolResult<T> => ({ ok: false, error });

/** Assert a numeric input is finite and positive; returns error string if not. */
export function requirePositiveNumber(value: unknown, field: string): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return `${field} must be a finite positive number`;
  }
  return null;
}
