/**
 * Tool contracts — the typed shape every server-side agent tool declares.
 *
 * The Tool Registry (ADR-0067) executes exactly these: a tool is a named,
 * versioned, described unit of deterministic server-side work with a zod
 * input schema and a zod output schema, an explicit capability list checked
 * against the *existing* permission system (`src/permissions/model.ts` —
 * there is no second permission system), a risk level, a per-call timeout,
 * and an explicit approval requirement.
 *
 * The contracts are shaped so the tool families the roadmap names fit
 * without redesign — market data, portfolio, trading, research, and
 * retrieval/RAG — while this phase registers none of them and implements no
 * trading action, no RAG, no persistent tool history. Anything a tool
 * touches is scoped to the `AgentToolContext` it is handed: one user, one
 * run. There is no ambient identity and no path that runs a tool in the
 * client.
 */

import { z } from 'zod';
import type { ToolCapability } from '../../../packages/trading-engine/src/framework.js';
import { AppError } from '../../../packages/shared/src/core/errors.js';

// ── Risk, category, and identity ───────────────────────────────────────────

/** What happens if the tool misbehaves, in ascending order of harm. */
export type ToolRiskLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * The tool families the architecture is shaped for. Only tools whose
 * contracts fit one of these may register; the registry's category list is
 * the audit trail of what the agent can touch.
 */
export type AgentToolCategory =
  'market-data' | 'portfolio' | 'trading' | 'research' | 'retrieval' | 'general';

/**
 * The isolation scope of one invocation: the authenticated user the run is
 * for and the run itself. Tools receive this explicitly — never ambient —
 * and are contractually barred from reaching outside it. The id fields are
 * opaque: attribution and scoping only, never a `Principal` or credential.
 */
export interface AgentToolContext {
  userId: string;
  runId: string;
  correlationId?: string;
}

export const agentToolContextSchema = z.object({
  userId: z.string().min(1),
  runId: z.string().min(1),
  correlationId: z.string().min(1).optional(),
});

// ── The tool contract ──────────────────────────────────────────────────────

/** What discovery returns: everything about a tool except how to run it. */
export interface AgentToolDescriptor {
  /** Registry-unique identity, e.g. `marketData.quote`. */
  name: string;
  /** Semver; bumped whenever behavior changes. */
  version: string;
  description: string;
  category: AgentToolCategory;
  /**
   * Capability classes checked against the existing permission system
   * (`checkPermission` over `PHASE1_PERMISSIONS`) before every invocation.
   * Deny-by-default: a capability with no explicit model rule is refused.
   */
  capabilities: readonly ToolCapability[];
  riskLevel: ToolRiskLevel;
  /** Hard per-invocation wall-clock ceiling in milliseconds. */
  timeoutMs: number;
  /** True when a human approval must exist before the tool may run. */
  requiresApproval: boolean;
  /** True when the tool writes anything outside its own return value. */
  sideEffects: boolean;
}

/**
 * A server-side agent tool. `execute` runs in the server process only; its
 * input has already been validated against `inputSchema` and its return
 * value is validated against `outputSchema` before anything sees it.
 */
export interface AgentTool<I = unknown, O = unknown> extends AgentToolDescriptor {
  inputSchema: z.ZodType<I>;
  outputSchema: z.ZodType<O>;
  execute(input: I, context: AgentToolContext): Promise<O>;
}

/** Tool names are stable, lowercase, dot-namespaced identifiers. */
export const TOOL_NAME_PATTERN = /^[a-z][a-zA-Z0-9._-]{2,63}$/;

/** Versions are semver so a record can name exactly what ran. */
export const TOOL_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

/**
 * Registration-time validation of the contract's invariants. Enforced once,
 * at `register`, so `invoke` can trust everything it reads:
 *
 *   - identity: name and version patterns; a non-empty description;
 *   - at least one declared capability (deny-by-default still applies at
 *     invocation, but a tool that declares nothing cannot be reasoned about);
 *   - a positive, finite timeout;
 *   - the risk ladders upward honestly: `critical` risk, side effects, and
 *     the `trading` category all *require* human approval — a tool cannot
 *     declare itself dangerous and un-gated at the same time.
 */
export function assertAgentToolContract(tool: AgentTool): void {
  if (!TOOL_NAME_PATTERN.test(tool.name)) {
    throw new AppError('VALIDATION_FAILED', `tool name must match ${TOOL_NAME_PATTERN.source}`, {
      details: { name: tool.name },
    });
  }
  if (!TOOL_VERSION_PATTERN.test(tool.version)) {
    throw new AppError('VALIDATION_FAILED', 'tool version must be semver', {
      details: { name: tool.name, version: tool.version },
    });
  }
  if (tool.description.trim().length === 0) {
    throw new AppError('VALIDATION_FAILED', 'tool description must not be empty', {
      details: { name: tool.name },
    });
  }
  if (tool.capabilities.length === 0) {
    throw new AppError('VALIDATION_FAILED', 'tool must declare at least one capability', {
      details: { name: tool.name },
    });
  }
  if (!Number.isFinite(tool.timeoutMs) || tool.timeoutMs <= 0) {
    throw new AppError('VALIDATION_FAILED', 'tool timeoutMs must be a positive number', {
      details: { name: tool.name, timeoutMs: tool.timeoutMs },
    });
  }
  if (!tool.inputSchema || !tool.outputSchema || typeof tool.execute !== 'function') {
    throw new AppError('VALIDATION_FAILED', 'tool must declare schemas and an execute function', {
      details: { name: tool.name },
    });
  }
  if ((tool.riskLevel === 'critical' || tool.sideEffects) && !tool.requiresApproval) {
    throw new AppError(
      'VALIDATION_FAILED',
      'a critical-risk or side-effecting tool must require human approval',
      { details: { name: tool.name, riskLevel: tool.riskLevel, sideEffects: tool.sideEffects } },
    );
  }
  if (tool.category === 'trading' && !tool.requiresApproval) {
    throw new AppError('VALIDATION_FAILED', 'a trading-category tool must require human approval', {
      details: { name: tool.name },
    });
  }
}
