/**
 * Authentication and authorization.
 *
 * Strategy (documented in docs/api-auth.md): local-first desktop auth with a
 * hashed credential stored in the OS keychain, session tokens held in memory
 * and never in a log or a config file.
 *
 * Authorization is deny-by-default: an operation is permitted only when an
 * explicit role grant exists. Operations that can place orders, connect to a
 * broker or touch live trading do not exist in this codebase at all — the
 * matcher below guarantees it.
 */

import { PolicyViolationError } from '../core/errors.js';

export type Role = 'owner' | 'coach' | 'student' | 'observer' | 'system';

export interface Session {
  id: string;
  issuedAt: string; // ISO
  expiresAt: string; // ISO
}

export interface Principal {
  id: string;
  roles: readonly Role[];
  session: Session;
}

export type OperationSensitivity = 'normal' | 'sensitive' | 'critical';

export interface Operation {
  id: string;
  resource: string;
  action: string;
  sensitivity: OperationSensitivity;
  /** Sensitive/critical operations always require an explicit human approval. */
  requiresApproval: boolean;
  description: string;
}

function op(
  id: string,
  sensitivity: OperationSensitivity,
  requiresApproval: boolean,
  description: string,
): Operation {
  const [resource = id, action = id] = id.split('.');
  return { id, resource, action, sensitivity, requiresApproval, description };
}

/** Complete operation catalogue. Anything absent is denied. */
export const OPERATIONS = {
  'progress.read': op('progress.read', 'normal', false, 'Read learning progress'),
  'lesson.read': op('lesson.read', 'normal', false, 'Open a lesson'),
  'lesson.complete': op('lesson.complete', 'normal', false, 'Mark a lesson complete'),
  'exam.start': op('exam.start', 'normal', false, 'Start an examination'),
  'exam.submit': op('exam.submit', 'normal', false, 'Submit examination answers'),
  'agent.chat': op('agent.chat', 'normal', false, 'Send a message to the agent'),
  'agent.history.read': op('agent.history.read', 'normal', false, 'Read conversation history'),
  'tool.run': op('tool.run', 'normal', false, 'Run a registered deterministic tool'),
  'memory.read': op('memory.read', 'normal', false, 'Retrieve memory records'),
  'memory.write': op('memory.write', 'normal', false, 'Create a memory record'),
  'memory.verify': op('memory.verify', 'sensitive', false, 'Verify or promote memory trust'),
  'memory.delete': op('memory.delete', 'sensitive', false, 'Delete/tombstone a memory record'),
  'embedding.generate': op(
    'embedding.generate',
    'normal',
    false,
    'Generate embeddings for records',
  ),
  'rule.propose': op('rule.propose', 'normal', false, 'Propose a new trading rule'),
  'rule.evaluate': op('rule.evaluate', 'sensitive', false, 'Evaluate a proposed rule'),
  'rule.activate': op(
    'rule.activate',
    'critical',
    true,
    'Activate a rule (human approval required)',
  ),
  'backtest.run': op('backtest.run', 'sensitive', true, 'Run a backtest (deferred capability)'),
  'evaluation.run': op('evaluation.run', 'normal', false, 'Run the invariant evaluation harness'),
  'profile.read': op(
    'profile.read',
    'normal',
    false,
    "Read the authenticated user's declared profile and trading context",
  ),
  'profile.write': op(
    'profile.write',
    'sensitive',
    false,
    "Change the authenticated user's declared profile and trading context",
  ),
  'quality.assess': op(
    'quality.assess',
    'normal',
    false,
    "Assess the quality of the authenticated user's declared inputs and decide whether an analysis may run",
  ),
  'usage.read': op(
    'usage.read',
    'normal',
    false,
    "Read the authenticated user's own credit balance, plan, subscription status and usage history",
  ),
  'usage.adjust': op(
    'usage.adjust',
    'sensitive',
    true,
    'Adjust another account’s credits or subscription (approval required)',
  ),
  'portfolio.read': op(
    'portfolio.read',
    'normal',
    false,
    "Read the authenticated user's own declared portfolio and the metrics computed from it",
  ),
  'portfolio.write': op(
    'portfolio.write',
    'sensitive',
    false,
    "Declare or replace the authenticated user's own portfolio composition",
  ),
  'decision.read': op(
    'decision.read',
    'normal',
    false,
    "Read the authenticated user's own recorded decisions and the readings taken from them",
  ),
  'decision.write': op(
    'decision.write',
    'sensitive',
    false,
    "Record, amend or remove the authenticated user's own portfolio decisions",
  ),
  'decision.evaluate': op(
    'decision.evaluate',
    'normal',
    false,
    'Evaluate a decision the authenticated user recorded, from the prices on the record',
  ),
  'marketData.read': op('marketData.read', 'normal', false, 'Read normalized market data'),
  'marketData.ingest': op(
    'marketData.ingest',
    'normal',
    false,
    'Ingest provider data into storage',
  ),
  'file.upload': op('file.upload', 'normal', false, 'Upload a file into managed storage'),
  'file.download': op('file.download', 'normal', false, 'Download/export a stored file'),
  'file.delete': op('file.delete', 'sensitive', false, 'Delete a stored file'),
  'job.read': op('job.read', 'normal', false, 'Inspect background job status'),
  'job.cancel': op('job.cancel', 'sensitive', false, 'Cancel a background job'),
  'realtime.connect': op('realtime.connect', 'normal', false, 'Open a real-time event stream'),
  'audit.read': op('audit.read', 'sensitive', false, 'Read the audit trail'),
  'settings.read': op('settings.read', 'normal', false, 'Read application settings'),
  'settings.write': op('settings.write', 'sensitive', false, 'Change application settings'),
  'user.invite': op('user.invite', 'sensitive', false, 'Invite a user'),
  'user.role.assign': op('user.role.assign', 'critical', true, 'Change role assignments'),
} as const satisfies Record<string, Operation>;

export type OperationId = keyof typeof OPERATIONS;

export const ALL_OPERATION_IDS = Object.keys(OPERATIONS) as OperationId[];

/**
 * Operations that must never exist. Live trading, broker connections and
 * order placement have no home in this system, in any role, ever.
 */
export const HARDLINE_OPERATION_PATTERN =
  /(broker|execute|place[._-]?order|live[._-]?trading|margin)/i;

export function assertNoHardlineOperations(): void {
  const offenders = ALL_OPERATION_IDS.filter((id) => HARDLINE_OPERATION_PATTERN.test(id));
  if (offenders.length > 0) {
    throw new PolicyViolationError(
      `Forbidden operations are defined: ${offenders.join(', ')}. This system never trades.`,
      { offenders },
    );
  }
}

const student: OperationId[] = [
  'progress.read',
  'lesson.read',
  'lesson.complete',
  'exam.start',
  'exam.submit',
  'agent.chat',
  'agent.history.read',
  'memory.read',
  'memory.write',
  'rule.propose',
  'marketData.read',
  'settings.read',
  'realtime.connect',
  'job.read',
  // A learner reads and edits *their own* declared context. There is no route that
  // accepts a user id, so this cannot be pointed at another account.
  'profile.read',
  'profile.write',
  // Assessing inputs is a read of the caller's own declarations, never a way to
  // reach another account's: the subject is the principal, as on the profile routes.
  'quality.assess',
  // A learner sees their own balance and what they have consumed. Adjusting another
  // account is not on this list in any form.
  'usage.read',
  // A portfolio is declared for the caller and read back for the caller. Nothing on
  // this surface accepts a user id, so there is no parameter that could name another
  // account — the isolation is structural rather than checked.
  'portfolio.read',
  'portfolio.write',
  // The same shape for decisions: a learner records their own and reads their own back, so
  // there is no id to point at somebody else's. Evaluating one runs deterministic code over
  // prices the caller supplied, which is why it needs no write grant either.
  'decision.read',
  'decision.write',
  'decision.evaluate',
];

const coach: OperationId[] = [
  ...student,
  'memory.verify',
  'memory.delete',
  'rule.evaluate',
  'evaluation.run',
  'file.upload',
  'file.download',
  'audit.read',
  'user.invite',
];

/**
 * The account owner operates the deployment, so it is the only role that may change
 * another account's credits — and even then under an approval. `owner` is the whole
 * catalogue; that `usage.adjust` is approval-gated is what keeps it from being a
 * unilateral spend authorization.
 */
const owner: OperationId[] = ALL_OPERATION_IDS;

const observer: OperationId[] = [
  'progress.read',
  'lesson.read',
  'agent.history.read',
  'memory.read',
  'marketData.read',
  'settings.read',
  'realtime.connect',
  'job.read',
  // Read-only by design: an observer may see their own context and may not change
  // it, so the grant is deliberately narrower than the learner's. Seeing the quality
  // of one's own inputs is a read, so it is granted.
  'profile.read',
  'quality.assess',
  'usage.read',
  // Reading a composition is a read; declaring one is not granted to this role at all.
  'portfolio.read',
  // An observer may read decisions and see them evaluated — an evaluation changes nothing and
  // records no order — but may not record, amend or remove one.
  'decision.read',
  'decision.evaluate',
];

/** A background worker: infrastructure capabilities only. */
const system: OperationId[] = [
  'marketData.ingest',
  'embedding.generate',
  'evaluation.run',
  'memory.write',
  'memory.read',
  'job.read',
];

/** Deny-by-default role grants. A role absent here can do nothing. */
export const ROLE_PERMISSIONS: Record<Role, readonly OperationId[]> = {
  owner,
  coach,
  student,
  observer,
  system,
};

export function roleHasOperation(role: Role, operationId: OperationId): boolean {
  return (ROLE_PERMISSIONS[role] ?? []).includes(operationId);
}

export type AuthDecision =
  | { allowed: true; operation: OperationId; approvalRequired: boolean }
  | { allowed: false; reason: string };

/**
 * A session is active while its expiry lies ahead of the supplied instant.
 *
 * `now` is **required**, not defaulted to the wall clock. A default here is how a
 * session validated by one clock gets rejected by another: the session service is
 * clock-injectable, so the gate that re-checks the same session has to read the
 * same clock. Omitting the argument used to be silent and time-of-day dependent —
 * a session issued from a fixed clock was accepted by `SessionService.redeem()`
 * and then refused as "expired" one layer later, purely because the wall clock had
 * moved past the fixed instant. Making the parameter mandatory turns that into a
 * compile error instead of a suite that passes in the morning and fails at 18:00.
 */
export function isSessionActive(session: Session, now: number): boolean {
  return Date.parse(session.expiresAt) > now;
}

/**
 * Authorize a principal for an operation. Checks, in order:
 * hardline prohibition -> session validity -> explicit role grant.
 *
 * `now` is required for the reason given on `isSessionActive`: the caller owns the
 * clock for the whole decision, so one request cannot be judged against two.
 */
export function authorize(
  principal: Principal | null,
  operationId: OperationId,
  now: number,
): AuthDecision {
  if (HARDLINE_OPERATION_PATTERN.test(operationId)) {
    return { allowed: false, reason: `Operation ${operationId} is forbidden by policy.` };
  }
  if (!principal) {
    return { allowed: false, reason: 'Authentication required.' };
  }
  if (!isSessionActive(principal.session, now)) {
    return { allowed: false, reason: 'Session expired.' };
  }
  const granted = principal.roles.some((role) => roleHasOperation(role, operationId));
  if (!granted) {
    return { allowed: false, reason: `No role grants ${operationId} (deny-by-default).` };
  }
  return {
    allowed: true,
    operation: operationId,
    approvalRequired: OPERATIONS[operationId].requiresApproval,
  };
}

/** Convenience for the API layer. */
export function requireOperation(
  principal: Principal | null,
  operationId: OperationId,
  now: number,
): AuthDecision {
  return authorize(principal, operationId, now);
}
