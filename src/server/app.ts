/**
 * Server assembly.
 *
 * `createServer()` is the single entry point: it resolves configuration, asserts
 * the preconditions that must hold for the process to be safe at all, wires the
 * components (sessions, approvals, jobs, event bus, agent, health) and returns a
 * Fastify instance whose routes are all pipeline-guarded.
 *
 * Start-up refuses rather than degrades. In order:
 *   1. configuration safety (loopback host, no live trading, redaction on),
 *   2. no hardline operation in the catalogue,
 *   3. API catalogue structural rules (versioning, no anonymous writes),
 *   4. instruction policy (no authorization language),
 *   5. route coverage (no route can bypass the pipeline).
 *
 * Nothing here executes a trade, connects a broker or registers a hosted model
 * provider: those capabilities do not exist in the codebase.
 */

import Fastify, { LogController, type FastifyInstance } from 'fastify';
import type { DestinationStream } from 'pino';
import { AgentService } from '../agent/service.js';
import { ApprovalWorkflow } from '../agent/approval.js';
import { SessionService } from '../auth/sessions.js';
import { assertNoHardlineOperations } from '../auth/model.js';
import { API_ROUTES, assertApiCatalogue } from '../api/contracts.js';
import type { AppConfig, SecretRef } from '../core/config.js';
import { assertSafeConfig } from '../core/config.js';
import { ids, IdFactory } from '../core/ids.js';
import { loadInstructions } from '../instructions/loader.js';
import { JobQueue } from '../jobs/queue.js';
import { EventBus } from '../realtime/events.js';
import { loadConfigFromEnv, resolveSecretFromEnv } from '../config/loader.js';
import type { LogSink, Logger } from '../core/logging.js';
import { createAccessPolicy } from './access.js';
import { workflowApprovalGate, type ApprovalGate } from './approval.js';
import { defaultHealthChecks } from './checks.js';
import { HealthRegistry } from './health.js';
import { installErrorHandlers } from './errors.js';
import { logRequestCompleted, createLogging, type ServerLogging } from './logging.js';
import { agentChatHandler } from './handlers/agent.js';
import { healthHandler, readinessHandler } from './handlers/health.js';
import {
  assertRouteCoverage,
  registerRoutes,
  routeEntries,
  trackRegisteredRoutes,
  type AnyHandler,
  type RouteEntry,
} from './routes.js';
import type { PipelineDeps } from './authorization.js';

export interface ServerDeps {
  config?: AppConfig;
  logger?: Logger;
  sink?: LogSink;
  captureLogs?: boolean;
  stream?: DestinationStream;
  sessions?: SessionService;
  approvals?: ApprovalWorkflow;
  approvalGate?: ApprovalGate;
  jobs?: JobQueue;
  eventBus?: EventBus;
  agent?: AgentService;
  idFactory?: IdFactory;
  now?: () => number;
  resolveSecret?: (ref: SecretRef) => string | null;
  llmProviders?: readonly string[];
}

export interface ServerInstance {
  app: FastifyInstance;
  config: AppConfig;
  logger: Logger;
  logging: ServerLogging;
  health: HealthRegistry;
  sessions: SessionService;
  approvals: ApprovalWorkflow;
  jobs: JobQueue;
  eventBus: EventBus;
  agent: AgentService;
  routes: readonly RouteEntry[];
  bootWarnings: readonly string[];
  close(): Promise<void>;
}

/** Preconditions checked before a socket is opened. */
export function assertServerPreconditions(config: AppConfig): void {
  assertSafeConfig(config);
  assertNoHardlineOperations();
  assertApiCatalogue();
  loadInstructions();
}

/** Conditions that do not block start-up but must be visible in the log. */
export function bootWarnings(config: AppConfig): string[] {
  const warnings: string[] = [];
  if (config.auth.allowAnonymousLocalLogin) {
    warnings.push(
      'auth.allowAnonymousLocalLogin is true but the HTTP server does not honour it: every protected route requires a session token.',
    );
  }
  if (config.ai.primary.provider !== 'scripted') {
    warnings.push(
      `ai.primary.provider is "${config.ai.primary.provider}" but no adapter is registered in this phase; requests will fail over to the offline scripted adapter.`,
    );
  }
  if (config.api.shellToken === null) {
    warnings.push(
      'No shell token is configured: any local process that can reach the loopback port may call the API. The desktop shell sets one at launch.',
    );
  }
  if (config.storage.remoteEnabled === false && config.storage.root.startsWith('data/')) {
    warnings.push(
      `File storage root "${config.storage.root}" is relative; the desktop build will point it at the OS app-data directory.`,
    );
  }
  return warnings;
}

export function createServer(deps: ServerDeps = {}): ServerInstance {
  const config = deps.config ?? loadConfigFromEnv();
  assertServerPreconditions(config);

  const logging = createLogging(config, {
    sink: deps.sink,
    capture: deps.captureLogs,
    stream: deps.stream,
  });
  const logger = deps.logger ?? logging.logger;

  const sessions =
    deps.sessions ??
    new SessionService({ ttlMinutes: config.auth.sessionTtlMinutes, now: deps.now });
  const approvals = deps.approvals ?? new ApprovalWorkflow({ now: deps.now });
  const jobs = deps.jobs ?? new JobQueue({ now: deps.now });
  const eventBus =
    deps.eventBus ??
    new EventBus({
      bufferSize: config.realtime.replayBufferSize,
      now:
        deps.now === undefined
          ? undefined
          : () => new Date((deps.now as () => number)()).toISOString(),
    });
  const agent = deps.agent ?? new AgentService();
  const llmProviders = deps.llmProviders ?? ['scripted'];

  const health = new HealthRegistry(
    defaultHealthChecks({ config, sessions, jobs, eventBus, agent, llmProviders }),
    { now: deps.now, startedAt: deps.now === undefined ? undefined : deps.now() },
  );

  const access = createAccessPolicy({
    config,
    resolveSecret: deps.resolveSecret ?? ((ref: SecretRef) => resolveSecretFromEnv(ref)),
  });

  const pipeline: PipelineDeps = {
    config,
    sessions,
    access,
    approvals: deps.approvalGate ?? workflowApprovalGate(approvals),
    logger,
    idFactory: deps.idFactory,
    now: deps.now,
  };

  const app = Fastify({
    // Logging is ours: structured records with a route id and correlation id,
    // never Fastify's own request lines. `LogController` is the supported way to
    // turn Fastify's own request logging off (the top-level option is deprecated
    // and removed in v6).
    logger: false,
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: config.api.maxBodyBytes,
    requestTimeout: config.api.requestTimeoutMs,
    trustProxy: false,
    genReqId: () => ids.id('req'),
  });

  const tracked = trackRegisteredRoutes(app);

  app.addHook('onRequest', async (request) => {
    request.mtStartedAt = Date.now();
  });

  app.addHook('onResponse', async (request, reply) => {
    const context = request.mt;
    logRequestCompleted(context?.logger ?? logger, {
      method: request.method,
      routeId: context?.route.id ?? request.mtRouteId ?? 'unmatched',
      status: reply.statusCode,
      durationMs: Date.now() - (request.mtStartedAt ?? Date.now()),
      correlationId: context?.correlationId ?? ids.correlationId(),
      principalId: context?.principal?.id ?? null,
    });
  });

  installErrorHandlers(app, { logger });

  const handlers: Record<string, AnyHandler> = {
    'system.health': healthHandler(health, config),
    'system.readiness': readinessHandler(health, config),
    'agent.chat': agentChatHandler(agent),
  };

  registerRoutes(app, { handlers, pipeline });
  assertRouteCoverage(tracked);

  const warnings = bootWarnings(config);
  logger.info(
    'server constructed',
    {
      routes: API_ROUTES.length,
      implemented: Object.keys(handlers).length,
      pending: routeEntries(handlers)
        .filter((entry) => !entry.implemented)
        .map((entry) => entry.id),
      host: config.api.host,
      port: config.api.port,
      mode: config.mode,
    },
    'server.constructed',
  );
  for (const warning of warnings) logger.warn(warning, {}, 'server.boot.warning');

  return {
    app,
    config,
    logger,
    logging,
    health,
    sessions,
    approvals,
    jobs,
    eventBus,
    agent,
    routes: routeEntries(handlers),
    bootWarnings: warnings,
    close: async () => {
      await app.close();
    },
  };
}
