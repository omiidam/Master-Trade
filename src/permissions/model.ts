/**
 * Permission model.
 *
 * Capabilities are explicit and deny-by-default. The Model never grants
 * itself permissions; the orchestrator checks them before every tool run.
 */

import type { ToolCapability } from '../../packages/trading-engine/src/framework.js';

export type Subject = 'model' | 'tool' | 'human';

export interface PermissionRule {
  subject: Subject;
  capability: ToolCapability;
  allowed: boolean;
  /** Free-text rationale, kept for auditability. */
  rationale: string;
}

/** Deny-by-default capability table. */
export const PHASE1_PERMISSIONS: PermissionRule[] = [
  {
    subject: 'model',
    capability: 'marketData.read',
    allowed: true,
    rationale: 'Model may request reads; orchestrator executes the tool.',
  },
  {
    subject: 'model',
    capability: 'marketData.synthetic',
    allowed: true,
    rationale: 'Synthetic training data is safe and clearly labeled.',
  },
  {
    subject: 'model',
    capability: 'risk.calculate',
    allowed: true,
    rationale: 'Model may request deterministic risk calculations.',
  },
  {
    subject: 'model',
    capability: 'portfolio.calculate',
    allowed: true,
    rationale:
      'The model may ask for a composition to be valued, and the arithmetic is done by deterministic code over the document the user declared. The result describes what was measured; it is not a recommendation, and the model may not produce a portfolio figure itself.',
  },
  {
    subject: 'model',
    capability: 'education.explain',
    allowed: true,
    rationale: 'Core teaching purpose of the agent.',
  },
  {
    subject: 'model',
    capability: 'memory.write',
    allowed: false,
    rationale:
      'Phase 1: memory writes go through the orchestrator with provenance, not the model directly.',
  },
  {
    subject: 'model',
    capability: 'backtest.run',
    allowed: false,
    rationale: 'Backtesting arrives in a later phase after human review of the harness.',
  },
  {
    subject: 'tool',
    capability: 'backtest.run',
    allowed: false,
    rationale: 'Not implemented in Phase 1.',
  },
  {
    subject: 'human',
    capability: 'backtest.run',
    allowed: true,
    rationale: 'Humans may trigger backtests in later phases.',
  },
];

export type PermissionDecision = { allowed: true } | { allowed: false; reason: string };

/** Check whether a subject may use a capability. Deny-by-default. */
export function checkPermission(
  rules: PermissionRule[],
  subject: Subject,
  capability: ToolCapability,
): PermissionDecision {
  const rule = rules.find((r) => r.subject === subject && r.capability === capability);
  if (!rule) {
    return {
      allowed: false,
      reason: `No explicit rule for ${subject}:${capability} (deny-by-default)`,
    };
  }
  return rule.allowed ? { allowed: true } : { allowed: false, reason: rule.rationale };
}
