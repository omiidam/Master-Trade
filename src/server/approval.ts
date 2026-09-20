/**
 * Approval gate.
 *
 * Operations marked `requiresApproval` (`rule.activate`, `backtest.run`,
 * `user.role.assign`) cannot proceed on a permission check alone: they need a
 * recorded human approval. The gate is what the HTTP pipeline consults, and it
 * defaults to denying everything — a server built without an approval workflow
 * cannot activate a rule, which is the safe failure mode.
 */

import type { ApprovalWorkflow } from '../agent/approval.js';
import type { OperationId } from '../../packages/shared/src/auth/model.js';

export interface ApprovalVerificationInput {
  operation: OperationId;
  /** Approval id claimed by the client (header `x-approval-id`). */
  approvalId: string | null;
  /** What the approval must be about (usually a proposal id). */
  subjectRef: string | null;
}

export interface ApprovalDecision {
  approved: boolean;
  reason: string;
}

export interface ApprovalGate {
  verify(input: ApprovalVerificationInput): ApprovalDecision;
}

/** Safe default: no approval workflow is wired, so nothing gated may run. */
export const denyAllApprovals: ApprovalGate = {
  verify: ({ operation }) => ({
    approved: false,
    reason: `No approval workflow is available for ${operation}.`,
  }),
};

/** Adapt the Phase 2 human approval workflow to the request pipeline. */
export function workflowApprovalGate(workflow: ApprovalWorkflow): ApprovalGate {
  return {
    verify({ operation, approvalId, subjectRef }: ApprovalVerificationInput): ApprovalDecision {
      if (approvalId !== null) {
        const request = workflow.get(approvalId);
        if (!request) return { approved: false, reason: `Approval ${approvalId} was not found.` };
        if (request.operation !== operation) {
          return {
            approved: false,
            reason: `Approval ${approvalId} covers ${request.operation}, not ${operation}.`,
          };
        }
        if (subjectRef !== null && request.subjectRef !== subjectRef) {
          return {
            approved: false,
            reason: `Approval ${approvalId} covers ${request.subjectRef}, not ${subjectRef}.`,
          };
        }
        if (request.status !== 'approved') {
          return { approved: false, reason: `Approval ${approvalId} is ${request.status}.` };
        }
        return { approved: true, reason: `Approval ${approvalId} was decided by a human.` };
      }

      if (subjectRef !== null) {
        const latest = workflow.approvalFor(operation, subjectRef);
        if (latest && latest.status === 'approved') {
          return { approved: true, reason: `Approval ${latest.id} covers this request.` };
        }
      }
      return { approved: false, reason: 'No recorded human approval covers this operation.' };
    },
  };
}
