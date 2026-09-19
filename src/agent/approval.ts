/**
 * Human approval workflow.
 *
 * Required for every operation marked `requiresApproval` (rule activation,
 * role changes, backtests). Rules enforced structurally:
 *   - only approval-gated operations may be submitted;
 *   - the requester can never approve their own request;
 *   - only roles in APPROVER_ROLES may decide;
 *   - expired requests cannot be approved.
 *
 * The workflow is the *only* thing that can move a proposal to `active`.
 */

import { AppError, PolicyViolationError } from '../core/errors.js';
import { OPERATIONS, type OperationId, type Principal, type Role } from '../auth/model.js';
import type { Provenance } from '../core/provenance.js';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface ApprovalRequest {
  id: string;
  operation: OperationId;
  /** What the approval is about (usually a proposal id). */
  subjectRef: string;
  requestedBy: string;
  rationale: string;
  /** Evidence attached for review; provenance is mandatory. */
  evidence: Provenance[];
  status: ApprovalStatus;
  createdAt: string;
  expiresAt: string;
}

export interface ApprovalDecisionRecord {
  requestId: string;
  decidedBy: string;
  decidedAt: string;
  approved: boolean;
  note?: string;
}

export const APPROVER_ROLES: readonly Role[] = ['owner'];

export interface ApprovalWorkflowOptions {
  now?: () => number;
  ttlMs?: number;
  idFactory?: () => string;
}

export class ApprovalWorkflow {
  private readonly requests = new Map<string, ApprovalRequest>();
  private readonly decisions = new Map<string, ApprovalDecisionRecord>();
  private readonly now: () => number;
  private readonly ttlMs: number;
  private readonly idFactory: () => string;
  private counter = 0;

  constructor(options: ApprovalWorkflowOptions = {}) {
    this.now = options.now ?? Date.now;
    this.ttlMs = options.ttlMs ?? 7 * 24 * 60 * 60 * 1000;
    this.idFactory = options.idFactory ?? (() => `appr_${++this.counter}`);
  }

  submit(input: {
    operation: OperationId;
    subjectRef: string;
    requestedBy: string;
    rationale: string;
    evidence?: Provenance[];
  }): ApprovalRequest {
    const operation = OPERATIONS[input.operation];
    if (!operation) throw new AppError('NOT_FOUND', `unknown operation ${input.operation}`);
    if (!operation.requiresApproval) {
      throw new PolicyViolationError(
        `Operation ${input.operation} is not approval-gated and must not be wrapped in an approval request.`,
        { operation: input.operation },
      );
    }
    if (input.rationale.trim().length === 0) {
      throw new AppError('VALIDATION_FAILED', 'approval requests require a rationale');
    }
    const evidence = input.evidence ?? [];
    if (evidence.some((item) => item.ref.trim().length === 0)) {
      throw new AppError('VALIDATION_FAILED', 'approval evidence must carry provenance references');
    }

    const now = this.now();
    const request: ApprovalRequest = {
      id: this.idFactory(),
      operation: input.operation,
      subjectRef: input.subjectRef,
      requestedBy: input.requestedBy,
      rationale: input.rationale,
      evidence,
      status: 'pending',
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + this.ttlMs).toISOString(),
    };
    this.requests.set(request.id, request);
    return request;
  }

  get(id: string): ApprovalRequest | undefined {
    return this.refresh(id, this.now());
  }

  decision(id: string): ApprovalDecisionRecord | undefined {
    return this.decisions.get(id);
  }

  list(filter: { status?: ApprovalStatus; subjectRef?: string } = {}): ApprovalRequest[] {
    for (const id of this.requests.keys()) this.refresh(id, this.now());
    return [...this.requests.values()].filter(
      (request) =>
        (filter.status === undefined || request.status === filter.status) &&
        (filter.subjectRef === undefined || request.subjectRef === filter.subjectRef),
    );
  }

  /** Record a human decision. Rejects self-approval and unauthorized deciders. */
  decide(requestId: string, decider: Principal, approved: boolean, note?: string): ApprovalRequest {
    const request = this.refresh(requestId, this.now());
    if (!request) throw new AppError('NOT_FOUND', `approval request ${requestId} not found`);
    if (request.status === 'expired') {
      throw new PolicyViolationError('approval request has expired');
    }
    if (request.status !== 'pending') {
      throw new PolicyViolationError(`approval request is already ${request.status}`);
    }
    if (request.requestedBy === decider.id) {
      throw new PolicyViolationError('a requester may not approve their own request');
    }
    if (!decider.roles.some((role) => APPROVER_ROLES.includes(role))) {
      throw new PolicyViolationError('decider lacks an approver role', { roles: decider.roles });
    }

    const decidedAt = new Date(this.now()).toISOString();
    const updated: ApprovalRequest = { ...request, status: approved ? 'approved' : 'rejected' };
    this.requests.set(request.id, updated);
    const decision: ApprovalDecisionRecord = {
      requestId: request.id,
      decidedBy: decider.id,
      decidedAt,
      approved,
    };
    if (note !== undefined) decision.note = note;
    this.decisions.set(request.id, decision);
    return updated;
  }

  /** True only for a non-expired, approved request. */
  isApproved(requestId: string): boolean {
    return this.refresh(requestId, this.now())?.status === 'approved';
  }

  /** The most recent approval for a subject, if any. */
  approvalFor(operation: OperationId, subjectRef: string): ApprovalRequest | undefined {
    return this.list({ subjectRef })
      .filter((request) => request.operation === operation)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .pop();
  }

  private refresh(id: string, now: number): ApprovalRequest | undefined {
    const request = this.requests.get(id);
    if (!request) return undefined;
    if (request.status === 'pending' && Date.parse(request.expiresAt) <= now) {
      const expired: ApprovalRequest = { ...request, status: 'expired' };
      this.requests.set(id, expired);
      return expired;
    }
    return request;
  }
}
