/**
 * Server barrel.
 *
 * Kept separate from `src/index.ts` so backend-only entry points (the agent demo,
 * tools, evaluation) do not pull Fastify into their process.
 */

export { createServer, assertServerPreconditions, bootWarnings } from './app.js';
export type { ServerDeps, ServerInstance } from './app.js';
export { startServer, reportBootRefusal } from './start.js';
export type { RefusalSink } from './start.js';
export { installErrorHandlers, toHttpFailure, correlationIdFor } from './errors.js';
export { createLogging, logRequestCompleted, PinoLogSink, PINO_REDACT_PATHS } from './logging.js';
export type { LoggingOptions, ServerLogging } from './logging.js';
export {
  createAccessPolicy,
  headerValue,
  isLoopbackAddress,
  SHELL_TOKEN_HEADER,
} from './access.js';
export type { AccessPolicy, AccessPolicyOptions, AccessRequest } from './access.js';
export { denyAllApprovals, workflowApprovalGate } from './approval.js';
export type { ApprovalDecision, ApprovalGate, ApprovalVerificationInput } from './approval.js';
export {
  runRequestPipeline,
  correlationIdFrom,
  safeCorrelationId,
  APPROVAL_ID_HEADER,
  APPROVAL_SUBJECT_HEADER,
} from './authorization.js';
export type { PipelineDeps, PipelineOutcome, PipelineRequest } from './authorization.js';
export { requireRequestContext } from './context.js';
export type {
  HandlerInput,
  HandlerResult,
  PipelineContext,
  RequestContext,
  RequestInput,
  RouteHandler,
} from './context.js';
export { HealthRegistry, aggregate, check } from './health.js';
export type {
  HealthCheck,
  HealthCheckResult,
  HealthRegistryOptions,
  HealthResult,
  HealthStatus,
  ReadinessReport,
} from './health.js';
export { defaultHealthChecks } from './checks.js';
export type { HealthCheckDeps } from './checks.js';
export {
  PENDING_ROUTES,
  assertRouteCoverage,
  registerRoutes,
  routeEntries,
  trackRegisteredRoutes,
} from './routes.js';
export type { AnyHandler, RegisterRoutesDeps, RouteEntry } from './routes.js';
export { agentChatHandler } from './handlers/agent.js';
export type { AgentChatResponseData } from './handlers/agent.js';
export { healthHandler, readinessHandler } from './handlers/health.js';
export type { LivenessResponse, ReadinessResponse } from './handlers/health.js';
