/**
 * Typed API contracts.
 *
 * The API layer is the only place where untrusted input becomes typed input.
 * Every route declares its version, the operation it needs, whether
 * authentication is required, and validators for body, path parameters and query.
 * Nothing reaches the backend without passing through `validateEnvelope` and
 * `guardRoute`.
 *
 * Body validation is Zod (`./schemas.ts`, ADR-0015): one schema per payload, with
 * the static type inferred from it. Fastify's own schema validation is disabled
 * in the server so exactly one validator decides.
 */

import { authorize, type OperationId, type Principal } from '../auth/model.js';
import { ERROR_STATUS, toAppError, type ErrorCode } from '../core/errors.js';
import type {
  ContextAssessment,
  ContextIssue,
  ClarifyingPrompt,
  TradingContext,
} from '../profile/model.js';
import {
  agentChatBodySchema,
  emptyBodySchema,
  lessonCompleteBodySchema,
  lessonParamsSchema,
  proposalParamsSchema,
  readinessQuerySchema,
  ruleActivateBodySchema,
  profileContextBodySchema,
  ruleProposeBodySchema,
  zodValidator,
  type AgentChatBody,
  type ProfileContextBody,
  type LessonCompleteBody,
  type ReadinessQuery,
  jobCancelBodySchema,
  jobListQuerySchema,
  jobParamsSchema,
  type JobCancelBody,
  type RuleActivateBody,
  type RuleProposeBody,
} from './schemas.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type ApiVersion = 'v1';
export const API_VERSION: ApiVersion = 'v1';
export const API_PATH_PREFIX = `/${API_VERSION}`;

/** Header a client may use instead of the path prefix to name its version. */
export const API_VERSION_HEADER = 'x-api-version';
export const CORRELATION_ID_HEADER = 'x-correlation-id';

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
  /** Path parameters, when the route has any. */
  validateParams?(raw: unknown): ValidationResult<Record<string, string>>;
  /** Query string, when the route accepts one. */
  validateQuery?(raw: unknown): ValidationResult<Record<string, unknown>>;
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

/**
 * Envelope validation stays an explicit function rather than a schema: it is a
 * *version gate* (unknown versions are rejected, never best-effort interpreted)
 * and it must run before any body schema is chosen.
 */
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

/** True when a payload looks like an API envelope rather than a bare body. */
export function isEnvelopeShaped(raw: unknown): boolean {
  const record = asRecord(raw);
  return record !== null && 'routeId' in record && 'version' in record;
}

/* ------------------------------------------------------------------ */
/* Route catalogue (v1)                                                */
/* ------------------------------------------------------------------ */

export interface AgentChatData {
  reply: string;
  epistemicKind: string;
  correlationId: string;
}

/** One entry of the context history, for review. */
export interface ProfileHistoryEntry {
  version: number;
  createdAt: string;
  changedBy: string;
}

/**
 * The profile as the API reports it: the account, the current context, and the
 * assessment derived from it. `assessment` is computed on read rather than stored, so
 * it can never disagree with the fields it describes.
 */
export interface ProfileData {
  userId: string;
  displayName: string;
  timezone: string;
  /** False until the user has saved a context at least once. */
  contextSet: boolean;
  version: number;
  context: TradingContext;
  assessment: ContextAssessment;
  prompts: ClarifyingPrompt[];
  history: ProfileHistoryEntry[];
  note: string;
}

/** The result of appending a version: what changed, and what still needs asking. */
export interface ProfileWriteData {
  version: number;
  context: TradingContext;
  assessment: ContextAssessment;
  /** Non-critical findings the surface must show rather than resolve. */
  questions: ContextIssue[];
  note: string;
}

const agentChatRoute: ApiRoute<AgentChatBody, AgentChatData> = {
  id: 'agent.chat',
  method: 'POST',
  path: '/v1/agent/messages',
  version: API_VERSION,
  operation: 'agent.chat',
  auth: 'required',
  summary: 'Send a message to the training agent.',
  validateBody: zodValidator(agentChatBodySchema),
};

const lessonCompleteRoute: ApiRoute<LessonCompleteBody, { lessonId: string }> = {
  id: 'lesson.complete',
  method: 'POST',
  path: '/v1/academy/lessons/:lessonId/complete',
  version: API_VERSION,
  operation: 'lesson.complete',
  auth: 'required',
  summary: 'Record lesson completion for the authenticated learner.',
  validateBody: zodValidator(lessonCompleteBodySchema),
  validateParams: zodValidator(lessonParamsSchema),
};

const ruleProposeRoute: ApiRoute<RuleProposeBody, { proposalId: string }> = {
  id: 'rule.propose',
  method: 'POST',
  path: '/v1/rules/proposals',
  version: API_VERSION,
  operation: 'rule.propose',
  auth: 'required',
  summary: 'Propose a new trading rule (never activated automatically).',
  validateBody: zodValidator(ruleProposeBodySchema),
};

const ruleActivateRoute: ApiRoute<RuleActivateBody, { status: string }> = {
  id: 'rule.activate',
  method: 'POST',
  path: '/v1/rules/proposals/:proposalId/activate',
  version: API_VERSION,
  operation: 'rule.activate',
  auth: 'required',
  summary: 'Activate a rule. Requires a recorded human approval.',
  validateBody: zodValidator(ruleActivateBodySchema),
  validateParams: zodValidator(proposalParamsSchema),
};

export interface JobViewData {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  progress: { current: number; total: number; label?: string } | null;
  progressPercent: number | null;
  progressUnit: string;
  correlationId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  cancellable: boolean;
}

/**
 * Job routes. They expose *status*, never the ability to start arbitrary work: a
 * client can watch and cancel, and enqueueing stays a server-side act with its own
 * operation and approval gate (there is no `POST /v1/jobs`).
 */
const jobListRoute: ApiRoute<Record<string, unknown> | undefined, { jobs: JobViewData[] }> = {
  id: 'job.list',
  method: 'GET',
  path: '/v1/jobs',
  version: API_VERSION,
  operation: 'job.read',
  auth: 'required',
  summary: 'List background jobs visible to the authenticated principal.',
  validateBody: zodValidator(emptyBodySchema),
  validateQuery: zodValidator(jobListQuerySchema) as (
    raw: unknown,
  ) => ValidationResult<Record<string, unknown>>,
};

const jobGetRoute: ApiRoute<Record<string, unknown> | undefined, JobViewData> = {
  id: 'job.get',
  method: 'GET',
  path: '/v1/jobs/:jobId',
  version: API_VERSION,
  operation: 'job.read',
  auth: 'required',
  summary: 'Read one background job, including its progress and last error.',
  validateBody: zodValidator(emptyBodySchema),
  validateParams: zodValidator(jobParamsSchema),
};

const jobCancelRoute: ApiRoute<JobCancelBody, JobViewData> = {
  id: 'job.cancel',
  method: 'POST',
  path: '/v1/jobs/:jobId/cancel',
  version: API_VERSION,
  operation: 'job.cancel',
  auth: 'required',
  summary: 'Cancel a queued or running job. Audit-recorded.',
  validateBody: zodValidator(jobCancelBodySchema),
  validateParams: zodValidator(jobParamsSchema),
};

/**
 * Profile routes.
 *
 * Neither route takes a user id, in the path or the body. The subject is always the
 * authenticated principal, so reading or editing another account is not something a
 * client can express — no parameter exists to point somewhere else. Signed-out
 * access is a `401` before the handler runs, and the repository enforces the
 * per-user scoping a second time.
 */
const profileReadRoute: ApiRoute<Record<string, unknown> | undefined, ProfileData> = {
  id: 'profile.read',
  method: 'GET',
  path: '/v1/profile',
  version: API_VERSION,
  operation: 'profile.read',
  auth: 'required',
  summary: "Read the authenticated user's profile and current trading context.",
  validateBody: zodValidator(emptyBodySchema),
};

const profileWriteRoute: ApiRoute<ProfileContextBody, ProfileWriteData> = {
  id: 'profile.write',
  method: 'PUT',
  path: '/v1/profile',
  version: API_VERSION,
  operation: 'profile.write',
  auth: 'required',
  summary: 'Append a new version of the trading context. Previous versions are never rewritten.',
  validateBody: zodValidator(profileContextBodySchema),
};

const healthRoute: ApiRoute<Record<string, unknown> | undefined, { status: string }> = {
  id: 'system.health',
  method: 'GET',
  path: '/v1/health',
  version: API_VERSION,
  operation: 'settings.read',
  auth: 'anonymous',
  summary: 'Liveness probe (no protected data).',
  validateBody: zodValidator(emptyBodySchema),
};

const readinessRoute: ApiRoute<
  Record<string, unknown> | undefined,
  { overall: string; checks: { name: string; status: string }[] }
> = {
  id: 'system.readiness',
  method: 'GET',
  path: '/v1/health/ready',
  version: API_VERSION,
  operation: 'settings.read',
  auth: 'anonymous',
  summary: 'Readiness probe. Details require an authenticated principal.',
  validateBody: zodValidator(emptyBodySchema),
  validateQuery: zodValidator(readinessQuerySchema) as (
    raw: unknown,
  ) => ValidationResult<Record<string, unknown>>,
};

export type ReadinessRouteQuery = ReadinessQuery;

export const API_ROUTES: readonly AnyApiRoute[] = [
  healthRoute,
  readinessRoute,
  profileReadRoute,
  profileWriteRoute,
  agentChatRoute,
  lessonCompleteRoute,
  ruleProposeRoute,
  ruleActivateRoute,
  jobListRoute,
  jobGetRoute,
  jobCancelRoute,
] as const;

/**
 * The WebSocket route, described here so route coverage and the API catalogue
 * agree about what is mounted even though its transport is not HTTP.
 */
export interface ApiSocketRoute {
  id: string;
  path: string;
  operation: OperationId;
  summary: string;
}

export const SOCKET_ROUTES: readonly ApiSocketRoute[] = [
  {
    id: 'system.realtime',
    path: '/ws',
    operation: 'realtime.connect',
    summary: 'Authenticated real-time event stream (WebSocket).',
  },
] as const;

export function findRoute(id: string): AnyApiRoute | undefined {
  return API_ROUTES.find((route) => route.id === id);
}

export function findRouteByPath(method: HttpMethod, url: string): AnyApiRoute | undefined {
  const path = url.split('?')[0] ?? url;
  return API_ROUTES.find((route) => {
    if (route.method !== method) return false;
    const routeParts = route.path.split('/').filter(Boolean);
    const urlParts = path.split('/').filter(Boolean);
    if (routeParts.length !== urlParts.length) return false;
    return routeParts.every(
      (part, index) => part.startsWith(':') || part === (urlParts[index] ?? ''),
    );
  });
}

/**
 * Structural checks on the catalogue. Called at server start-up so a mistake in
 * routing or versioning is a boot failure, not an incident.
 */
export function assertApiCatalogue(): void {
  const ids = new Set<string>();
  for (const route of API_ROUTES) {
    if (ids.has(route.id)) throw new Error(`Duplicate route id: ${route.id}`);
    ids.add(route.id);
    if (route.version !== API_VERSION) {
      throw new Error(`Route ${route.id} declares version ${route.version}`);
    }
    if (!route.path.startsWith(`${API_PATH_PREFIX}/`)) {
      throw new Error(`Route ${route.id} must be versioned under ${API_PATH_PREFIX}`);
    }
    if (route.auth === 'anonymous' && route.method !== 'GET') {
      throw new Error(`Route ${route.id} is anonymous but not read-only`);
    }
  }
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

/**
 * Reject a request before any backend work happens.
 *
 * `now` is required rather than defaulted, for the same reason the gate requires
 * it: the HTTP layer already resolves the principal against its own clock, and a
 * default here would let that clock and this one disagree about one request.
 */
export function guardRoute(
  route: AnyApiRoute,
  principal: Principal | null,
  now: number,
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
