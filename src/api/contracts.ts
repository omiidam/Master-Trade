/**
 * Typed API contracts.
 *
 * The API layer is the only place where untrusted input becomes typed input.
 * Every route declares its version, the operation it needs, whether
 * authentication is required and a body validator. Nothing reaches the backend
 * without passing through `validateEnvelope` and `guardRoute`.
 */

import { authorize, type OperationId, type Principal } from '../auth/model.js';
import { ERROR_STATUS, toAppError, type ErrorCode } from '../core/errors.js';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';
export type ApiVersion = 'v1';
export const API_VERSION: ApiVersion = 'v1';

export interface ApiEnvelope<TBody = unknown> {
  version: ApiVersion;
  correlationId: string;
  routeId: string;
  body: TBody;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; issues: string[] };

export interface ApiRoute<TBody, TData> {
  id: string;
  method: HttpMethod;
  path: string;
  version: ApiVersion;
  operation: OperationId;
  auth: 'required' | 'anonymous';
  summary: string;
  validateBody(raw: unknown): ValidationResult<TBody>;
  /** Response shape marker; never executed, only typed. */
  readonly responseType?: TData;
}

export type AnyApiRoute = ApiRoute<unknown, unknown>;

/* ------------------------------------------------------------------ */
/* Validation helpers                                                  */
/* ------------------------------------------------------------------ */

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function readString(
  record: Record<string, unknown>,
  field: string,
  options: { required?: boolean; maxLength?: number } = {},
): { value: string | undefined; issue: string | null } {
  const raw = record[field];
  if (raw === undefined || raw === null) {
    return options.required
      ? { value: undefined, issue: `${field} is required` }
      : { value: undefined, issue: null };
  }
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { value: undefined, issue: `${field} must be a non-empty string` };
  }
  if (options.maxLength !== undefined && raw.length > options.maxLength) {
    return { value: undefined, issue: `${field} exceeds ${options.maxLength} characters` };
  }
  return { value: raw, issue: null };
}

export function validateEnvelope(raw: unknown): ValidationResult<ApiEnvelope> {
  const record = asRecord(raw);
  if (!record) return { ok: false, issues: ['payload must be a JSON object'] };
  const issues: string[] = [];
  if (record.version !== API_VERSION) {
    issues.push(`unsupported api version: ${String(record.version)} (expected ${API_VERSION})`);
  }
  const correlationId = readString(record, 'correlationId', { required: true });
  if (correlationId.issue) issues.push(correlationId.issue);
  const routeId = readString(record, 'routeId', { required: true });
  if (routeId.issue) issues.push(routeId.issue);
  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    value: {
      version: API_VERSION,
      correlationId: correlationId.value as string,
      routeId: routeId.value as string,
      body: record.body,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Route catalogue (v1)                                                */
/* ------------------------------------------------------------------ */

export interface AgentChatBody {
  message: string;
  conversationId?: string;
}

export interface AgentChatData {
  reply: string;
  epistemicKind: string;
  correlationId: string;
}

export interface LessonCompleteBody {
  lessonId: string;
  score?: number;
}

export interface RuleProposeBody {
  ruleText: string;
  hypothesis: string;
}

const agentChatRoute: ApiRoute<AgentChatBody, AgentChatData> = {
  id: 'agent.chat',
  method: 'POST',
  path: '/v1/agent/messages',
  version: API_VERSION,
  operation: 'agent.chat',
  auth: 'required',
  summary: 'Send a message to the training agent.',
  validateBody(raw) {
    const record = asRecord(raw);
    if (!record) return { ok: false, issues: ['body must be a JSON object'] };
    const issues: string[] = [];
    const message = readString(record, 'message', { required: true, maxLength: 8_000 });
    if (message.issue) issues.push(message.issue);
    const conversationId = readString(record, 'conversationId', { maxLength: 128 });
    if (conversationId.issue) issues.push(conversationId.issue);
    if (issues.length > 0) return { ok: false, issues };
    const value: AgentChatBody = { message: message.value as string };
    if (conversationId.value !== undefined) value.conversationId = conversationId.value;
    return { ok: true, value };
  },
};

const lessonCompleteRoute: ApiRoute<LessonCompleteBody, { lessonId: string }> = {
  id: 'lesson.complete',
  method: 'POST',
  path: '/v1/academy/lessons/:lessonId/complete',
  version: API_VERSION,
  operation: 'lesson.complete',
  auth: 'required',
  summary: 'Record lesson completion for the authenticated learner.',
  validateBody(raw) {
    const record = asRecord(raw);
    if (!record) return { ok: false, issues: ['body must be a JSON object'] };
    const lessonId = readString(record, 'lessonId', { required: true, maxLength: 128 });
    if (lessonId.issue) return { ok: false, issues: [lessonId.issue] };
    const value: LessonCompleteBody = { lessonId: lessonId.value as string };
    const score = record.score;
    if (score !== undefined) {
      if (typeof score !== 'number' || score < 0 || score > 100) {
        return { ok: false, issues: ['score must be a number between 0 and 100'] };
      }
      value.score = score;
    }
    return { ok: true, value };
  },
};

const ruleProposeRoute: ApiRoute<RuleProposeBody, { proposalId: string }> = {
  id: 'rule.propose',
  method: 'POST',
  path: '/v1/rules/proposals',
  version: API_VERSION,
  operation: 'rule.propose',
  auth: 'required',
  summary: 'Propose a new trading rule (never activated automatically).',
  validateBody(raw) {
    const record = asRecord(raw);
    if (!record) return { ok: false, issues: ['body must be a JSON object'] };
    const issues: string[] = [];
    const ruleText = readString(record, 'ruleText', { required: true, maxLength: 4_000 });
    if (ruleText.issue) issues.push(ruleText.issue);
    const hypothesis = readString(record, 'hypothesis', { required: true, maxLength: 4_000 });
    if (hypothesis.issue) issues.push(hypothesis.issue);
    if (issues.length > 0) return { ok: false, issues };
    return {
      ok: true,
      value: { ruleText: ruleText.value as string, hypothesis: hypothesis.value as string },
    };
  },
};

const ruleActivateRoute: ApiRoute<{ proposalId: string }, { status: string }> = {
  id: 'rule.activate',
  method: 'POST',
  path: '/v1/rules/proposals/:proposalId/activate',
  version: API_VERSION,
  operation: 'rule.activate',
  auth: 'required',
  summary: 'Activate a rule. Requires a recorded human approval.',
  validateBody(raw) {
    const record = asRecord(raw);
    if (!record) return { ok: false, issues: ['body must be a JSON object'] };
    const proposalId = readString(record, 'proposalId', { required: true, maxLength: 128 });
    if (proposalId.issue) return { ok: false, issues: [proposalId.issue] };
    return { ok: true, value: { proposalId: proposalId.value as string } };
  },
};

const healthRoute: ApiRoute<undefined, { status: string }> = {
  id: 'system.health',
  method: 'GET',
  path: '/v1/health',
  version: API_VERSION,
  operation: 'settings.read',
  auth: 'anonymous',
  summary: 'Liveness probe (no protected data).',
  validateBody(raw) {
    return raw === undefined || raw === null || asRecord(raw) !== null
      ? { ok: true, value: undefined }
      : { ok: false, issues: ['body must be an object or empty'] };
  },
};

export const API_ROUTES: readonly AnyApiRoute[] = [
  healthRoute,
  agentChatRoute,
  lessonCompleteRoute,
  ruleProposeRoute,
  ruleActivateRoute,
] as const;

export function findRoute(id: string): AnyApiRoute | undefined {
  return API_ROUTES.find((route) => route.id === id);
}

/* ------------------------------------------------------------------ */
/* Authorization + responses                                           */
/* ------------------------------------------------------------------ */

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export type ApiResponse<T> =
  | { ok: true; data: T; correlationId: string }
  | { ok: false; error: ApiErrorBody; correlationId: string };

export const okResponse = <T>(data: T, correlationId: string): ApiResponse<T> => ({
  ok: true,
  data,
  correlationId,
});

export function errorResponse(error: unknown, correlationId: string): ApiResponse<never> {
  const appError = toAppError(error);
  return { ok: false, error: appError.toJSON(), correlationId };
}

export type RouteGuardDecision =
  | { allowed: true; approvalRequired: boolean }
  | { allowed: false; status: number; error: ApiErrorBody };

/** Reject a request before any backend work happens. */
export function guardRoute(
  route: AnyApiRoute,
  principal: Principal | null,
  now: number = Date.now(),
): RouteGuardDecision {
  if (route.auth === 'anonymous') {
    return { allowed: true, approvalRequired: false };
  }
  const decision = authorize(principal, route.operation, now);
  if (decision.allowed) {
    return { allowed: true, approvalRequired: decision.approvalRequired };
  }
  const status = principal === null ? ERROR_STATUS.UNAUTHENTICATED : ERROR_STATUS.FORBIDDEN;
  const code: ErrorCode = principal === null ? 'UNAUTHENTICATED' : 'FORBIDDEN';
  return { allowed: false, status, error: { code, message: decision.reason } };
}
