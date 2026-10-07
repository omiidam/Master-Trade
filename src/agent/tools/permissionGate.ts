/**
 * The Tool Permission and Risk Gate — the single pre-execution decision
 * every tool call passes through, before anything is executed.
 *
 * The gate answers exactly three ways: **ALLOW**, **BLOCK** or
 * **REQUIRE_APPROVAL**, from five evaluated dimensions:
 *
 *   1. **user permissions** — the invocation carries the server-resolved
 *      operation grants of the acting user (`userGrants`, resolved at the
 *      route level by the existing `authorize()` over the role table).
 *      No snapshot, or no `tool.run` grant in it, is a BLOCK: the gate
 *      consumes the existing auth system's semantics and never re-implements
 *      them. There is no second permission system here.
 *   2. **run permissions** — tools execute only inside an active run, and
 *      only when the run state is known. A missing or terminal run state
 *      is a BLOCK.
 *   3. **tool permissions** — every declared capability is checked against
 *      the existing deny-by-default rule table (`checkPermission` over
 *      `PHASE1_PERMISSIONS`, subject `model`). An unknown tool, or one
 *      declaring no capability, is a BLOCK.
 *   4. **risk level** — evaluated against the risk policy table. A risk
 *      level with no policy entry is a BLOCK (deny by default), and a new
 *      future risk level is supported by extending the table — the
 *      Registry never changes.
 *   5. **approval requirement** — when the tool, its side effects or its
 *      risk policy demand a human approval and no current approval exists,
 *      the answer is REQUIRE_APPROVAL (never ALLOW, never a silent run).
 *
 * Deny by default runs through all of it: missing permission or risk
 * information blocks the call; the gate never infers a grant from absent
 * data. Read-only and side-effecting tools stay distinguishable in every
 * evaluation (`access`), and the full check-by-check record rides along so
 * the caller can write the decision and its reason into the Agent Run
 * trace.
 */

import type { OperationId } from '../../../packages/shared/src/auth/model.js';
import {
  checkPermission,
  PHASE1_PERMISSIONS,
  type PermissionRule,
} from '../../permissions/model.js';
import type {
  AgentToolContext,
  AgentToolDescriptor,
  ToolRiskLevel,
  ToolRunState,
} from './contracts.js';

// ── Outcomes ───────────────────────────────────────────────────────────────

/** The gate's only three answers. */
export type ToolGateDecision = 'ALLOW' | 'BLOCK' | 'REQUIRE_APPROVAL';

/** The five dimensions, in evaluation order. */
export type ToolGateCheckName = 'user' | 'run' | 'tool' | 'risk' | 'approval';

export interface ToolGateCheck {
  verdict: 'allow' | 'block' | 'require-approval';
  reason: string;
}

/** One gate decision: the answer, its reason, and every check behind it. */
export interface ToolGateEvaluation {
  decision: ToolGateDecision;
  /** The decision's reason: the first blocking check, else the approval
   * requirement, else the all-clear rationale. */
  reason: string;
  toolName: string;
  riskLevel: ToolRiskLevel | 'unknown';
  /** Read-only and side-effecting tools are distinguishable at a glance. */
  access: 'read-only' | 'side-effecting';
  sideEffects: boolean;
  checks: Record<ToolGateCheckName, ToolGateCheck>;
}

// Run states in which a tool may execute: everything else — including an
// unknown state — blocks.
const ACTIVE_RUN_STATES: ReadonlySet<ToolRunState> = new Set<ToolRunState>([
  'running',
  'responding',
  'waiting-tool',
  'validating',
]);

// ── Risk policy ────────────────────────────────────────────────────────────

export interface RiskPolicy {
  /** A current human approval is required before this risk may run. */
  requiresApproval: boolean;
}

/**
 * The risk policy table: which risk levels demand a human approval. A
 * future risk level is added here (or via the gate's `riskPolicy` option)
 * — the Registry and the loop are untouched by a new level. A level with
 * no entry is denied by default.
 */
export const DEFAULT_RISK_POLICY: Readonly<Record<ToolRiskLevel, RiskPolicy>> = {
  low: { requiresApproval: false },
  medium: { requiresApproval: false },
  high: { requiresApproval: true },
  critical: { requiresApproval: true },
};

// ── The gate ───────────────────────────────────────────────────────────────

/** What the gate is given: the run-scoped invocation context plus the
 * approval seam's answer for this tool. */
export interface ToolPermissionContext extends AgentToolContext {
  /** Whether a current human approval exists for this tool in this scope. */
  approvalGranted?: boolean;
}

export interface ToolPermissionGateOptions {
  /** Extra or overriding risk entries: how future risk levels attach
   * without redesigning the Registry. Merged over `DEFAULT_RISK_POLICY`. */
  riskPolicy?: Readonly<Record<string, RiskPolicy | undefined>>;
  /** The operation the acting user must hold. Default `tool.run`. */
  requiredOperation?: OperationId;
  /** The capability rule table consulted. Default the existing
   * deny-by-default `PHASE1_PERMISSIONS`. */
  permissionRules?: PermissionRule[];
}

export class ToolPermissionGate {
  private readonly riskPolicy: Readonly<Record<string, RiskPolicy | undefined>>;
  private readonly requiredOperation: OperationId;
  private readonly rules: PermissionRule[];

  constructor(options: ToolPermissionGateOptions = {}) {
    this.riskPolicy = { ...DEFAULT_RISK_POLICY, ...(options.riskPolicy ?? {}) };
    this.requiredOperation = options.requiredOperation ?? 'tool.run';
    this.rules = options.permissionRules ?? PHASE1_PERMISSIONS;
  }

  /** Evaluate every dimension and settle on one decision. Never throws:
   * unknown information is a BLOCK, not a crash. */
  evaluate(
    tool: AgentToolDescriptor | undefined,
    context: ToolPermissionContext,
    requestedName?: string,
  ): ToolGateEvaluation {
    const checks: Record<ToolGateCheckName, ToolGateCheck> = {
      user: this.userCheck(context),
      run: this.runCheck(context),
      tool: this.toolCheck(tool, requestedName ?? tool?.name ?? '(unknown)'),
      risk: this.riskCheck(tool),
      approval: this.approvalCheck(tool, context),
    };
    const order: ToolGateCheckName[] = ['user', 'run', 'tool', 'risk', 'approval'];
    for (const name of order) {
      const check = checks[name];
      if (check.verdict === 'block') {
        return this.result('BLOCK', check.reason, tool, checks);
      }
    }
    if (checks.approval.verdict === 'require-approval') {
      return this.result('REQUIRE_APPROVAL', checks.approval.reason, tool, checks);
    }
    return this.result(
      'ALLOW',
      'all permission checks satisfied: user, run, tool, risk and approval',
      tool,
      checks,
    );
  }

  private result(
    decision: ToolGateDecision,
    reason: string,
    tool: AgentToolDescriptor | undefined,
    checks: Record<ToolGateCheckName, ToolGateCheck>,
  ): ToolGateEvaluation {
    return {
      decision,
      reason,
      toolName: tool?.name ?? '(unknown)',
      riskLevel: tool?.riskLevel ?? 'unknown',
      access: tool?.sideEffects === true ? 'side-effecting' : 'read-only',
      sideEffects: tool?.sideEffects === true,
      checks,
    };
  }

  private userCheck(context: ToolPermissionContext): ToolGateCheck {
    if (!context.userId) {
      return { verdict: 'block', reason: 'the invocation carries no user identity' };
    }
    if (context.userGrants === undefined) {
      return {
        verdict: 'block',
        reason: 'user permission information is missing for this invocation (deny by default)',
      };
    }
    if (!context.userGrants.includes(this.requiredOperation)) {
      return {
        verdict: 'block',
        reason: `the user holds no ${this.requiredOperation} grant (deny by default)`,
      };
    }
    return { verdict: 'allow', reason: `the user holds ${this.requiredOperation}` };
  }

  private runCheck(context: ToolPermissionContext): ToolGateCheck {
    if (!context.runId) {
      return { verdict: 'block', reason: 'the invocation carries no run identity' };
    }
    if (context.runState === undefined) {
      return {
        verdict: 'block',
        reason: 'run permission information is missing for this invocation (deny by default)',
      };
    }
    if (!ACTIVE_RUN_STATES.has(context.runState)) {
      return {
        verdict: 'block',
        reason: `the run is ${context.runState}; a tool may execute only in an active run`,
      };
    }
    return { verdict: 'allow', reason: `the run is ${context.runState}` };
  }

  private toolCheck(tool: AgentToolDescriptor | undefined, requestedName: string): ToolGateCheck {
    if (tool === undefined) {
      return { verdict: 'block', reason: `no tool registered under the name "${requestedName}"` };
    }
    if (tool.capabilities.length === 0) {
      return {
        verdict: 'block',
        reason: `tool ${tool.name} declares no capability (deny by default)`,
      };
    }
    for (const capability of tool.capabilities) {
      const decision = checkPermission(this.rules, 'model', capability);
      if (!decision.allowed) {
        return {
          verdict: 'block',
          reason: `permission denied for ${tool.name} (${capability}): ${decision.reason}`,
        };
      }
    }
    return {
      verdict: 'allow',
      reason: `all ${tool.capabilities.length} declared capability/capabilities allowed for model`,
    };
  }

  private riskCheck(tool: AgentToolDescriptor | undefined): ToolGateCheck {
    if (tool === undefined) {
      return { verdict: 'block', reason: 'tool risk information is missing (deny by default)' };
    }
    const policy = this.riskPolicy[tool.riskLevel];
    if (policy === undefined) {
      return {
        verdict: 'block',
        reason: `unknown risk level "${String(tool.riskLevel)}" (deny by default)`,
      };
    }
    return {
      verdict: 'allow',
      reason: `risk ${tool.riskLevel}: approval ${
        policy.requiresApproval ? 'required' : 'not required'
      }`,
    };
  }

  private approvalCheck(
    tool: AgentToolDescriptor | undefined,
    context: ToolPermissionContext,
  ): ToolGateCheck {
    if (tool === undefined) {
      return { verdict: 'block', reason: 'tool approval requirement is unknown (deny by default)' };
    }
    const policy = this.riskPolicy[tool.riskLevel];
    const needsApproval =
      tool.requiresApproval || tool.sideEffects === true || policy?.requiresApproval === true;
    if (!needsApproval) {
      return { verdict: 'allow', reason: `no approval required for ${tool.name}` };
    }
    if (context.approvalGranted === true) {
      return { verdict: 'allow', reason: `a current human approval exists for ${tool.name}` };
    }
    const because = tool.sideEffects
      ? 'it has side effects'
      : tool.requiresApproval
        ? 'it requires approval'
        : `its risk level is ${String(tool.riskLevel)}`;
    return {
      verdict: 'require-approval',
      reason: `${tool.name} requires a human approval (${because}); none exists for this run`,
    };
  }
}
