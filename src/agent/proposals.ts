/**
 * Trading-rule proposals.
 *
 * Flow: proposal -> evaluation (deterministic) -> human approval -> activation.
 *
 * The critical invariant: `activate` cannot succeed without a recorded,
 * non-expired human approval for that exact proposal. Neither the model nor a
 * background job can activate a rule on its own.
 */

import { AppError, PolicyViolationError } from '../../packages/shared/src/core/errors.js';
import type { Provenance } from '../../packages/shared/src/core/provenance.js';
import type { ApprovalWorkflow } from './approval.js';

export type RuleStatus =
  'draft' | 'evaluating' | 'awaiting-approval' | 'approved' | 'rejected' | 'active';

export interface RuleProposal {
  id: string;
  /** Who authored the proposal: the model may propose, never activate. */
  origin: 'model' | 'human';
  proposedBy: string;
  ruleText: string;
  hypothesis: string;
  evidence: Provenance[];
  status: RuleStatus;
  createdAt: string;
  updatedAt: string;
  activationApprovalId?: string;
  rejectionReason?: string;
}

export type EvaluationMethod = 'deterministic-metrics' | 'backtest';
export type EvaluationVerdict = 'promising' | 'inconclusive' | 'rejected';

export interface RuleEvaluation {
  proposalId: string;
  method: EvaluationMethod;
  /** Deterministic metrics only; never model-generated numbers. */
  metrics: Record<string, number>;
  verdict: EvaluationVerdict;
  jobId?: string;
  evaluatedAt: string;
}

export interface RuleRegistryOptions {
  now?: () => number;
  idFactory?: () => string;
}

export class RuleRegistry {
  private readonly proposals = new Map<string, RuleProposal>();
  private readonly evaluations = new Map<string, RuleEvaluation[]>();
  private readonly now: () => number;
  private readonly idFactory: () => string;
  private counter = 0;

  constructor(options: RuleRegistryOptions = {}) {
    this.now = options.now ?? Date.now;
    this.idFactory = options.idFactory ?? (() => `rule_${++this.counter}`);
  }

  propose(input: {
    origin: 'model' | 'human';
    proposedBy: string;
    ruleText: string;
    hypothesis: string;
    evidence?: Provenance[];
  }): RuleProposal {
    if (input.ruleText.trim().length === 0) {
      throw new AppError('VALIDATION_FAILED', 'rule text is required');
    }
    if (input.hypothesis.trim().length === 0) {
      throw new AppError('VALIDATION_FAILED', 'a testable hypothesis is required');
    }
    const timestamp = new Date(this.now()).toISOString();
    const proposal: RuleProposal = {
      id: this.idFactory(),
      origin: input.origin,
      proposedBy: input.proposedBy,
      ruleText: input.ruleText,
      hypothesis: input.hypothesis,
      evidence: input.evidence ?? [],
      status: 'draft',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.proposals.set(proposal.id, proposal);
    return proposal;
  }

  get(id: string): RuleProposal | undefined {
    return this.proposals.get(id);
  }

  list(): RuleProposal[] {
    return [...this.proposals.values()];
  }

  evaluationsFor(id: string): RuleEvaluation[] {
    return [...(this.evaluations.get(id) ?? [])];
  }

  /** Attach evaluation evidence; moves the proposal to awaiting-approval. */
  attachEvaluation(evaluation: RuleEvaluation): RuleProposal {
    const proposal = this.proposals.get(evaluation.proposalId);
    if (!proposal) throw new AppError('NOT_FOUND', `proposal ${evaluation.proposalId} not found`);
    if (proposal.status === 'active') {
      throw new PolicyViolationError('an active rule cannot be re-evaluated in place');
    }
    if (evaluation.verdict === 'rejected') {
      const rejected: RuleProposal = {
        ...proposal,
        status: 'rejected',
        updatedAt: new Date(this.now()).toISOString(),
        rejectionReason: 'evaluation verdict: rejected',
      };
      this.evaluations.set(proposal.id, [...(this.evaluations.get(proposal.id) ?? []), evaluation]);
      this.proposals.set(proposal.id, rejected);
      return rejected;
    }
    const updated: RuleProposal = {
      ...proposal,
      status: 'awaiting-approval',
      updatedAt: new Date(this.now()).toISOString(),
    };
    this.evaluations.set(proposal.id, [...(this.evaluations.get(proposal.id) ?? []), evaluation]);
    this.proposals.set(proposal.id, updated);
    return updated;
  }

  /**
   * Activate a rule. Requires: at least one non-rejected evaluation and an
   * approved, non-expired human approval covering this proposal.
   */
  activate(proposalId: string, approvals: ApprovalWorkflow): RuleProposal {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) throw new AppError('NOT_FOUND', `proposal ${proposalId} not found`);
    if (proposal.status === 'active') return proposal;
    if (proposal.status === 'rejected') {
      throw new PolicyViolationError('a rejected proposal cannot be activated');
    }

    const evaluation = (this.evaluations.get(proposalId) ?? []).find(
      (item) => item.verdict !== 'rejected',
    );
    if (!evaluation) {
      throw new PolicyViolationError('a rule cannot be activated without a completed evaluation', {
        proposalId,
      });
    }

    const approval = approvals.approvalFor('rule.activate', proposalId);
    if (!approval || approval.status !== 'approved' || !approvals.isApproved(approval.id)) {
      throw new PolicyViolationError(
        'a rule cannot be activated without a recorded human approval',
        { proposalId, approvalStatus: approval?.status ?? 'missing' },
      );
    }

    const activated: RuleProposal = {
      ...proposal,
      status: 'active',
      activationApprovalId: approval.id,
      updatedAt: new Date(this.now()).toISOString(),
    };
    this.proposals.set(proposalId, activated);
    return activated;
  }

  reject(proposalId: string, reason: string): RuleProposal {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) throw new AppError('NOT_FOUND', `proposal ${proposalId} not found`);
    const rejected: RuleProposal = {
      ...proposal,
      status: 'rejected',
      rejectionReason: reason,
      updatedAt: new Date(this.now()).toISOString(),
    };
    this.proposals.set(proposalId, rejected);
    return rejected;
  }
}
