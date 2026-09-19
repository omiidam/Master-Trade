/**
 * Governance repository — owner: `governance`.
 *
 * Trading rules, their evidence, and the human approvals that gate activation.
 * This is the most safety-critical table group in the system, so the rules are
 * enforced twice: once as CHECK constraints in the schema (so the *database*
 * cannot hold an illegal state) and once here (so the failure is a typed error
 * with a readable reason before the statement is even sent).
 *
 *   1. A rule cannot become `active` without citing an approval row that is
 *      approved, covers `rule.activate`, and names this rule as its subject.
 *   2. A requester cannot approve their own request — rejected in SQL, not only
 *      in the workflow object, so a future call path cannot bypass it.
 *   3. An approval with no decider cannot be `approved`; expiry is computed, not
 *      mutated by a client.
 *   4. Evaluations are append-only: a re-run adds evidence, it never rewrites it.
 */

import { AppError, PolicyViolationError } from '../../core/errors.js';
import { ids } from '../../core/ids.js';
import { OPERATIONS, type OperationId } from '../../auth/model.js';
import type { SqlExecutor } from '../executor.js';
import { Table } from '../table.js';
import type { Owner } from '../ownership.js';
import type { TableName } from '../schema.js';

export const OWNER: Owner = 'governance';
export const OWNED_TABLES: readonly TableName[] = [
  'trading_rules',
  'rule_evaluations',
  'approvals',
];

export type RuleStatus =
  'proposed' | 'evaluating' | 'approved' | 'rejected' | 'active' | 'archived';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';
export type EvaluationVerdict = 'supports' | 'rejects' | 'inconclusive' | 'insufficient-data';

/** Operations that may not proceed without a recorded human approval. */
export const APPROVAL_GATED_OPERATIONS: readonly OperationId[] = (
  Object.values(OPERATIONS) as { id: string; requiresApproval: boolean }[]
)
  .filter((operation) => operation.requiresApproval)
  .map((operation) => operation.id as OperationId);

export interface TradingRuleRow {
  id: string;
  proposed_by: string;
  rule_text: string;
  hypothesis: string;
  status: RuleStatus;
  activation_approval_id: string | null;
  activated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RuleEvaluationRow {
  id: string;
  rule_id: string;
  method: string;
  metrics: unknown;
  verdict: EvaluationVerdict;
  sample_size: number;
  job_id: string | null;
  created_at: string;
}

export interface ApprovalRow {
  id: string;
  operation: string;
  subject_ref: string;
  requested_by: string;
  decided_by: string | null;
  status: ApprovalStatus;
  rationale: string;
  evidence: unknown;
  decision_note: string | null;
  decided_at: string | null;
  expires_at: string;
  created_at: string;
}

export interface GovernanceRepositoryOptions {
  now?: () => number;
  newId?: (kind: string) => string;
  defaultApprovalTtlMs?: number;
}

const DEFAULT_APPROVAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class GovernanceRepository {
  private readonly db: SqlExecutor;
  private readonly rules: Table<TradingRuleRow>;
  private readonly evaluations: Table<RuleEvaluationRow>;
  private readonly approvals: Table<ApprovalRow>;
  private readonly now: () => number;
  private readonly newId: (kind: string) => string;
  private readonly approvalTtlMs: number;

  constructor(db: SqlExecutor, options: GovernanceRepositoryOptions = {}) {
    this.db = db;
    this.rules = new Table<TradingRuleRow>(db, 'trading_rules');
    this.evaluations = new Table<RuleEvaluationRow>(db, 'rule_evaluations');
    this.approvals = new Table<ApprovalRow>(db, 'approvals');
    this.now = options.now ?? Date.now;
    this.newId = options.newId ?? ((kind) => ids.id(kind));
    this.approvalTtlMs = options.defaultApprovalTtlMs ?? DEFAULT_APPROVAL_TTL_MS;
  }

  private iso(at: number = this.now()): string {
    return new Date(at).toISOString();
  }

  /* ---------------------------------------------------------------- rules */

  async propose(input: {
    proposedBy: string;
    ruleText: string;
    hypothesis: string;
  }): Promise<TradingRuleRow> {
    if (input.ruleText.trim().length === 0 || input.hypothesis.trim().length === 0) {
      throw new AppError('VALIDATION_FAILED', 'A proposal needs both a rule and a hypothesis');
    }
    const at = this.iso();
    return this.rules.insert({
      id: this.newId('rule'),
      proposed_by: input.proposedBy,
      rule_text: input.ruleText,
      hypothesis: input.hypothesis,
      status: 'proposed',
      activation_approval_id: null,
      activated_at: null,
      created_at: at,
      updated_at: at,
    });
  }

  rule(id: string): Promise<TradingRuleRow | null> {
    return this.rules.findById(id);
  }

  rulesByStatus(status?: RuleStatus): Promise<TradingRuleRow[]> {
    return this.rules.findMany(status === undefined ? {} : { status }, {
      orderBy: 'created_at',
      direction: 'desc',
    });
  }

  async setStatus(id: string, status: RuleStatus): Promise<TradingRuleRow> {
    if (status === 'active') {
      throw new PolicyViolationError(
        'Use activateRule(): activation requires a recorded human approval',
        { id },
      );
    }
    const updated = await this.rules.update(id, { status, updated_at: this.iso() });
    if (!updated) throw new AppError('NOT_FOUND', `Rule ${id} was not found`);
    return updated;
  }

  /** Append evidence. Never edits an existing evaluation. */
  async attachEvaluation(input: {
    ruleId: string;
    method: string;
    metrics: Record<string, unknown>;
    verdict: EvaluationVerdict;
    sampleSize: number;
    jobId?: string;
  }): Promise<RuleEvaluationRow> {
    const rule = await this.rules.findById(input.ruleId);
    if (!rule) throw new AppError('NOT_FOUND', `Rule ${input.ruleId} was not found`);
    const at = this.iso();
    const evaluation = await this.evaluations.insert({
      id: this.newId('eval'),
      rule_id: input.ruleId,
      method: input.method,
      metrics: input.metrics,
      verdict: input.verdict,
      sample_size: input.sampleSize,
      job_id: input.jobId ?? null,
      created_at: at,
    });
    if (rule.status === 'proposed') {
      await this.rules.update(rule.id, { status: 'evaluating', updated_at: at });
    }
    return evaluation;
  }

  evaluationsFor(ruleId: string): Promise<RuleEvaluationRow[]> {
    return this.evaluations.findMany(
      { rule_id: ruleId },
      { orderBy: 'created_at', direction: 'asc', limit: 1_000 },
    );
  }

  /* ------------------------------------------------------------ approvals */

  async submitApproval(input: {
    operation: OperationId;
    subjectRef: string;
    requestedBy: string;
    rationale: string;
    evidence?: Record<string, unknown>;
    ttlMs?: number;
  }): Promise<ApprovalRow> {
    const operation = OPERATIONS[input.operation];
    if (!operation) throw new AppError('NOT_FOUND', `Unknown operation ${input.operation}`);
    if (!operation.requiresApproval) {
      throw new PolicyViolationError(
        `Operation ${input.operation} is not approval-gated and must not be wrapped in an approval request`,
        { operation: input.operation },
      );
    }
    if (input.rationale.trim().length === 0) {
      throw new AppError('VALIDATION_FAILED', 'An approval request needs a rationale');
    }
    const at = this.now();
    return this.approvals.insert({
      id: this.newId('appr'),
      operation: input.operation,
      subject_ref: input.subjectRef,
      requested_by: input.requestedBy,
      decided_by: null,
      status: 'pending',
      rationale: input.rationale,
      evidence: input.evidence ?? [],
      decision_note: null,
      decided_at: null,
      expires_at: this.iso(at + (input.ttlMs ?? this.approvalTtlMs)),
      created_at: this.iso(at),
    });
  }

  /** Read an approval, computing expiry rather than mutating the row. */
  async approval(id: string, at: number = this.now()): Promise<ApprovalRow | null> {
    const row = await this.approvals.findById(id);
    if (!row) return null;
    if (row.status === 'pending' && Date.parse(row.expires_at) <= at) {
      return { ...row, status: 'expired' };
    }
    return row;
  }

  async approvalsFor(operation: OperationId, subjectRef: string): Promise<ApprovalRow[]> {
    return this.approvals.findMany(
      { operation, subject_ref: subjectRef },
      { orderBy: 'created_at', direction: 'desc' },
    );
  }

  pendingApprovals(): Promise<ApprovalRow[]> {
    return this.approvals.findMany(
      { status: 'pending' },
      { orderBy: 'created_at', direction: 'asc' },
    );
  }

  /**
   * Record a human decision. A requester cannot decide their own request and an
   * already-decided or expired request cannot be decided again — the same rules
   * as the Phase 2 workflow object, now also enforced by the schema.
   */
  async decideApproval(
    id: string,
    input: { decidedBy: string; approved: boolean; note?: string },
  ): Promise<ApprovalRow> {
    const current = await this.approval(id);
    if (!current) throw new AppError('NOT_FOUND', `Approval ${id} was not found`);
    if (current.status === 'expired') {
      throw new PolicyViolationError('This approval request has expired', { id });
    }
    if (current.status !== 'pending') {
      throw new PolicyViolationError(`This approval request is already ${current.status}`, { id });
    }
    if (current.requested_by === input.decidedBy) {
      throw new PolicyViolationError('A requester may not approve their own request', { id });
    }
    const updated = await this.approvals.update(id, {
      status: input.approved ? 'approved' : 'rejected',
      decided_by: input.decidedBy,
      decided_at: this.iso(),
      decision_note: input.note ?? null,
    });
    if (!updated) throw new AppError('INTERNAL', 'Approval decision did not persist');
    return updated;
  }

  /* ----------------------------------------------------------- activation */

  /**
   * Activate a rule. The only path to `status = 'active'`, and the point where
   * "a rule needs a human" stops being a policy statement and becomes a database
   * precondition: the approval must exist, be approved, cover `rule.activate`,
   * and name this rule.
   */
  async activateRule(ruleId: string, input: { approvalId: string }): Promise<TradingRuleRow> {
    const rule = await this.rules.findById(ruleId);
    if (!rule) throw new AppError('NOT_FOUND', `Rule ${ruleId} was not found`);
    if (rule.status === 'active') return rule;
    if (rule.status === 'archived') {
      throw new PolicyViolationError('An archived rule cannot be reactivated', { ruleId });
    }

    const approval = await this.approval(input.approvalId);
    if (!approval) {
      throw new PolicyViolationError(`Approval ${input.approvalId} was not found`, { ruleId });
    }
    if (approval.status !== 'approved') {
      throw new PolicyViolationError(`Cannot activate a rule with a ${approval.status} approval`, {
        ruleId,
        approvalId: approval.id,
        status: approval.status,
      });
    }
    if (approval.operation !== 'rule.activate') {
      throw new PolicyViolationError(
        `Approval ${approval.id} covers ${approval.operation}, not rule.activate`,
        { ruleId, approvalId: approval.id },
      );
    }
    if (approval.subject_ref !== ruleId) {
      throw new PolicyViolationError(
        `Approval ${approval.id} covers ${approval.subject_ref}, not rule ${ruleId}`,
        { ruleId, approvalId: approval.id },
      );
    }
    if (approval.decided_by === null || approval.decided_by === rule.proposed_by) {
      throw new PolicyViolationError(
        'Activation requires an approval decided by someone other than the proposer',
        { ruleId, approvalId: approval.id },
      );
    }

    const updated = await this.rules.update(ruleId, {
      status: 'active',
      activation_approval_id: approval.id,
      activated_at: this.iso(),
      updated_at: this.iso(),
    });
    if (!updated) throw new AppError('INTERNAL', 'Rule activation did not persist');
    return updated;
  }

  /** Archived rules keep their evidence and their approval citation. */
  async archiveRule(ruleId: string): Promise<TradingRuleRow> {
    const updated = await this.rules.update(ruleId, { status: 'archived', updated_at: this.iso() });
    if (!updated) throw new AppError('NOT_FOUND', `Rule ${ruleId} was not found`);
    return updated;
  }
}

export function createGovernanceRepository(
  db: SqlExecutor,
  options: GovernanceRepositoryOptions = {},
): GovernanceRepository {
  return new GovernanceRepository(db, options);
}
