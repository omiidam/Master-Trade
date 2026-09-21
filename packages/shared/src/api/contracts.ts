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
  qualityAssessBodySchema,
  readinessQuerySchema,
  ruleActivateBodySchema,
  portfolioWriteBodySchema,
  profileContextBodySchema,
  ruleProposeBodySchema,
  zodValidator,
  type AgentChatBody,
  type PortfolioWriteBody,
  type ProfileContextBody,
  type QualityAssessBody,
  type LessonCompleteBody,
  type ReadinessQuery,
  jobCancelBodySchema,
  jobListQuerySchema,
  jobParamsSchema,
  usageAdjustBodySchema,
  usageHistoryQuerySchema,
  usageSubscriptionBodySchema,
  type JobCancelBody,
  type RuleActivateBody,
  type RuleProposeBody,
  type UsageAdjustBody,
  type UsageSubscriptionBody,
} from './schemas.js';
import type { AnalysisReadinessDecision } from '../quality/readiness.js';
import type { QualityReport } from '../quality/model.js';
import type {
  Portfolio,
  PortfolioDocumentAssessment,
  PortfolioInsight,
  PortfolioMetrics,
} from '../portfolio/model.js';
import type { PortfolioReadinessDecision } from '../portfolio/readiness.js';

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
  /**
   * Present only when the request named an analysis type.
   *
   * When it is present and not permitted, the reply is the gate's own refusal and no
   * model was consulted — which is the whole point of carrying it here rather than
   * leaving the client to infer why it got a refusal.
   */
  readiness?: AnalysisReadinessDecision | null;
  /**
   * What this turn cost, and why.
   *
   * Present only when the server meters turns, which it does whenever a usage store is
   * configured. `charged` is the honest part for a client with a retry to think about: a
   * turn that ran but produced a refusal costs nothing, and a surface that did not know
   * that would report a spend that never happened.
   */
  usage?: {
    /** The key this attempt was metered under, echoed so a retry can reuse it. */
    operationKey: string;
    /** The feature's declared cost per invocation. */
    credits: number;
    charged: boolean;
    /** The balance after the turn, read from the ledger rather than computed. */
    balance: number;
    /** True when this response resolved to an earlier attempt with the same key. */
    replay: boolean;
    note: string;
  } | null;
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

export interface QualityAssessData {
  /** False until the user has declared anything at all. */
  contextSet: boolean;
  /** The context version the assessment was computed from, so it is reproducible. */
  contextVersion: number;
  /** What the server can offer, reported as a fact rather than assumed by a caller. */
  marketData: {
    available: boolean;
    provenance: string | null;
    source: string | null;
    barCount: number;
    lastBarAt: string | null;
    detail: string;
  };
  /** The whole declared context, assessed with no capability in mind. */
  report: QualityReport;
  /** One entry per requested type, or one per declared type when none was named. */
  decisions: AnalysisReadinessDecision[];
  asOf: string;
  note: string;
}

/**
 * `POST /v1/quality/assess`
 *
 * One route for both questions the phase asks. It takes no subject: the inputs are the
 * authenticated principal's own, as on the profile routes, so there is no parameter a
 * client could point at another account.
 */
const qualityAssessRoute: ApiRoute<QualityAssessBody, QualityAssessData> = {
  id: 'quality.assess',
  method: 'POST',
  path: '/v1/quality/assess',
  version: API_VERSION,
  operation: 'quality.assess',
  auth: 'required',
  summary:
    'Assess the quality of the declared inputs and report whether each declared analysis may run.',
  validateBody: zodValidator(qualityAssessBodySchema),
};

/* ------------------------------------------------------------------ */
/* Portfolio composition and its readiness                             */
/* ------------------------------------------------------------------ */

/**
 * One version of a composition, as a reviewer reads it.
 *
 * `changedBy` is present because a version with no attribution is not reviewable. The
 * document itself is deliberately **absent** here: the timeline needs to say what
 * changed and when, and shipping every historical composition to a list view would send
 * a user's entire holdings history to render a set of dates. The current document is in
 * `portfolio`, and a future by-version route is the honest way to serve an old one.
 */
export interface PortfolioSnapshotView {
  version: number;
  reason: string;
  reasonLabel: string;
  changedBy: string;
  createdAt: string;
}

/**
 * `GET /v1/portfolio` and the answer to `PUT /v1/portfolio`.
 *
 * The whole reading in one response, because the parts are only meaningful together: a
 * metric without the assessment that produced it is a number with no caveats, and a
 * readiness verdict without the findings behind it is a refusal nobody can act on. The
 * client computes nothing — every figure here was produced by deterministic code on the
 * server.
 *
 * `declared` distinguishes "this account has not told us what it holds" from "it told us
 * it holds nothing". Those are different facts and the honest answer to each is
 * different, so the two are never collapsed into an empty portfolio.
 */
export interface PortfolioViewData {
  declared: boolean;
  /** The version of the current composition, or 0 when nothing is declared. */
  version: number;
  portfolio: Portfolio;
  assessment: PortfolioDocumentAssessment;
  metrics: PortfolioMetrics;
  insights: PortfolioInsight[];
  /** One entry per scope, so the surface never derives a verdict of its own. */
  readiness: PortfolioReadinessDecision[];
  snapshots: PortfolioSnapshotView[];
  asOf: string;
  note: string;
}

/**
 * `GET /v1/portfolio`
 *
 * A read of the caller's own declaration. It takes no identifier of any kind — not in
 * the path, not in the query — so reading another account's composition is not
 * expressible, and the isolation holds by construction rather than by a check somebody
 * could forget.
 */
const portfolioReadRoute: ApiRoute<Record<string, unknown> | undefined, PortfolioViewData> = {
  id: 'portfolio.read',
  method: 'GET',
  path: '/v1/portfolio',
  version: API_VERSION,
  operation: 'portfolio.read',
  auth: 'required',
  summary:
    'Read the declared portfolio with the metrics, insights and readiness verdict computed from it.',
  validateBody: zodValidator(emptyBodySchema),
  validateQuery: zodValidator(readinessQuerySchema) as (
    raw: unknown,
  ) => ValidationResult<Record<string, unknown>>,
};

/**
 * `PUT /v1/portfolio`
 *
 * Declaration is a write, and the operation says so (`portfolio.write`). The body is the
 * document; there is no subject field, and the server mints every row id, so a client
 * cannot name a position it does not own.
 */
const portfolioWriteRoute: ApiRoute<PortfolioWriteBody, PortfolioViewData> = {
  id: 'portfolio.write',
  method: 'PUT',
  path: '/v1/portfolio',
  version: API_VERSION,
  operation: 'portfolio.write',
  auth: 'required',
  summary: 'Declare or replace the portfolio composition. The previous version is kept as history.',
  validateBody: zodValidator(portfolioWriteBodySchema),
};

/* ------------------------------------------------------------------ */
/* Usage, credits and subscription                                     */
/* ------------------------------------------------------------------ */

/**
 * A plan as the API reports it.
 *
 * The catalogue is public configuration, so it is served as data rather than restated by
 * a client: a surface that hard-codes an allowance will be wrong the first time the
 * catalogue changes, and the wrong number would be the one a person budgets against.
 */
export interface UsagePlanView {
  id: string;
  displayName: string;
  tagline: string;
  active: boolean;
  billingPeriod: string;
  periodCredits: number;
  resetCadence: string;
  carryOver: string;
  /**
   * Always `false`, and `price` always `null`, in this build: there is no payment
   * integration, so no price can be charged and none is displayed as if it could be.
   */
  purchasable: false;
  price: null;
  entitlements: {
    feature: string;
    included: boolean;
    periodLimit: number | null;
  }[];
  mayNot: string[];
  notes: string[];
}

export interface UsageFeatureViewData {
  id: string;
  label: string;
  description: string;
  category: string;
  creditCost: number;
  /** What the cost means. Served with the number so the number can be reviewed. */
  costBasis: string;
  state: string;
  stateReason: string | null;
  operation: string | null;
  allowed: boolean;
  /** The refusal, when there is one. Never `null` on an allowed feature. */
  denial: string | null;
  /** The refusal's meaning in words, shipped with the decision. */
  reason: string;
  /** True only when an upgrade would actually resolve this refusal. */
  upgradeOffered: boolean;
  upgradePlanId: string | null;
  usedThisPeriod: number;
  periodLimit: number | null;
}

/**
 * `GET /v1/usage` — the caller's own allowance, consumption and entitlements.
 *
 * No subject parameter exists, in the path or the body: the account is always the
 * authenticated principal, so reading somebody else's balance is not expressible.
 */
export interface UsageStatusData {
  plan: UsagePlanView;
  /** The whole catalogue, so a comparison view needs no second request. */
  plans: UsagePlanView[];
  subscriptionStatus: string;
  subscriptionLabel: string;
  /** False when the free default is being reported as a default rather than a record. */
  subscriptionRecorded: boolean;
  balance: number;
  lifetime: { granted: number; consumed: number };
  period: {
    key: string;
    startAt: string;
    endAt: string;
    /** When the allowance is next renewed. Derived from the clock, never stored. */
    resetsAt: string;
  };
  totals: {
    granted: number;
    consumed: number;
    refunded: number;
    expired: number;
    adjusted: number;
    net: number;
  };
  features: UsageFeatureViewData[];
  /** False when a restart would lose the balance. Reported, never implied. */
  durable: boolean;
  storeKind: string;
  purchasable: false;
  note: string;
}

/**
 * One movement, as a user reads it.
 *
 * `balanceAfter` is stored on the row rather than recomputed, so the history reconciles
 * without replaying it — and a displayed balance cannot drift from the one that was seen.
 */
export interface UsageMovementView {
  id: string;
  kind: string;
  status: string;
  reason: string;
  reasonLabel: string;
  delta: number;
  balanceAfter: number;
  feature: string | null;
  correlationId: string | null;
  actor: string;
  createdAt: string;
}

/** One metered attempt, including the ones that were refused or cost nothing. */
export interface UsageAttemptView {
  id: string;
  feature: string;
  category: string;
  status: string;
  credits: number;
  denial: string | null;
  correlationId: string | null;
  occurredAt: string;
  settledAt: string | null;
  note: string | null;
}

/** `GET /v1/usage/history` — the movements and the attempts behind the balance. */
export interface UsageHistoryData {
  movements: UsageMovementView[];
  attempts: UsageAttemptView[];
  totals: UsageStatusData['totals'];
  note: string;
}

/** The result of an administrative adjustment or subscription change. */
export interface UsageAdminData {
  userId: string;
  /** The balance the change produced, read back from the ledger. */
  balance: number;
  change: {
    kind: 'credits' | 'subscription';
    credits?: number;
    planId?: string;
    status?: string;
    reference: string;
    /** Stated so a record cannot be mistaken for a receipt. */
    purchase: null;
  };
  note: string;
}

const usageStatusRoute: ApiRoute<Record<string, unknown> | undefined, UsageStatusData> = {
  id: 'usage.read',
  method: 'GET',
  path: '/v1/usage',
  version: API_VERSION,
  operation: 'usage.read',
  auth: 'required',
  summary:
    "Read the authenticated user's plan, credit balance, allowance and feature entitlements.",
  validateBody: zodValidator(emptyBodySchema),
};

const usageHistoryRoute: ApiRoute<Record<string, unknown> | undefined, UsageHistoryData> = {
  id: 'usage.history',
  method: 'GET',
  path: '/v1/usage/history',
  version: API_VERSION,
  operation: 'usage.read',
  auth: 'required',
  summary: 'Read the credit movements and metered attempts behind the current balance.',
  validateBody: zodValidator(emptyBodySchema),
  validateQuery: zodValidator(usageHistoryQuerySchema) as (
    raw: unknown,
  ) => ValidationResult<Record<string, unknown>>,
};

/**
 * `POST /v1/usage/credits/adjust`
 *
 * Administrative, and therefore two gates rather than one: the `usage.adjust` operation,
 * which is approval-gated, and the service's own refusal to let an operator act on their
 * own account. The reference is stored in the audit record rather than on the ledger, so
 * the accounting rows stay machine-readable.
 */
const usageAdjustRoute: ApiRoute<UsageAdjustBody, UsageAdminData> = {
  id: 'usage.credits.adjust',
  method: 'POST',
  path: '/v1/usage/credits/adjust',
  version: API_VERSION,
  operation: 'usage.adjust',
  auth: 'required',
  summary: "Adjust another account's credit balance. Requires a recorded human approval.",
  validateBody: zodValidator(usageAdjustBodySchema),
};

const usageSubscriptionRoute: ApiRoute<UsageSubscriptionBody, UsageAdminData> = {
  id: 'usage.subscription.set',
  method: 'POST',
  path: '/v1/usage/subscription',
  version: API_VERSION,
  operation: 'usage.adjust',
  auth: 'required',
  summary:
    "Record another account's plan and subscription status as an administrative grant. Requires a recorded human approval.",
  validateBody: zodValidator(usageSubscriptionBodySchema),
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
  qualityAssessRoute,
  portfolioReadRoute,
  portfolioWriteRoute,
  usageStatusRoute,
  usageHistoryRoute,
  usageAdjustRoute,
  usageSubscriptionRoute,
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
