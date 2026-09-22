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
 *   4. plan catalogue invariants (nothing purchasable; no tier reaches an approval),
 *   5. instruction policy (no authorization language),
 *   6. route coverage (no route can bypass the pipeline).
 *
 * Nothing here executes a trade, connects a broker or registers a hosted model
 * provider: those capabilities do not exist in the codebase.
 */

import Fastify, { LogController, type FastifyInstance } from 'fastify';
import type { DestinationStream } from 'pino';
import { AgentService } from '../agent/service.js';
import { ApprovalWorkflow } from '../agent/approval.js';
import { SessionService } from '../auth/sessions.js';
import { assertNoHardlineOperations } from '../../packages/shared/src/auth/model.js';
import { API_ROUTES, assertApiCatalogue } from '../../packages/shared/src/api/contracts.js';
import type { AppConfig, SecretRef } from '../core/config.js';
import { assertSafeConfig } from '../core/config.js';
import { ids, IdFactory } from '../../packages/shared/src/core/ids.js';
import { loadInstructions } from '../instructions/loader.js';
import { JobQueue, type JobStatusEvent } from '../../packages/shared/src/jobs/queue.js';
import { JobService } from '../../packages/shared/src/jobs/service.js';
import { SqliteJobStore } from '../jobs/sqliteStore.js';
import { InMemoryJobStore, type JobStore } from '../../packages/shared/src/jobs/store.js';
import { JobWorkerPool } from '../jobs/worker.js';
import { FEATURES_BY_ID } from '../../packages/shared/src/usage/features.js';
import { assertPlanCatalogue } from '../../packages/shared/src/usage/plans.js';
import { SqliteUsageStore } from '../usage/sqliteStore.js';
import { InMemoryUsageStore, type UsageStore } from '../usage/store.js';
import { UsageService } from '../usage/service.js';
import type { Repositories } from '../db/repositories/index.js';
import { EventBus } from '../../packages/shared/src/realtime/events.js';
import { RealtimeHub, type RealtimeLimits } from '../realtime/hub.js';
import { registerRealtimeTransport, REALTIME_ROUTE } from '../realtime/ws.js';
import { loadConfigFromEnv, resolveSecretFromEnv } from '../config/loader.js';
import type { LogSink, Logger } from '../../packages/shared/src/core/logging.js';
import { createAccessPolicy } from './access.js';
import { workflowApprovalGate, type ApprovalGate } from './approval.js';
import { defaultHealthChecks } from './checks.js';
import { HealthRegistry } from './health.js';
import { installErrorHandlers } from './errors.js';
import { installSecurity, type InstalledSecurity } from './security.js';
import { logRequestCompleted, createLogging, type ServerLogging } from './logging.js';
import { agentChatHandler } from './handlers/agent.js';
import { healthHandler, readinessHandler } from './handlers/health.js';
import { jobCancelHandler, jobGetHandler, jobListHandler } from './handlers/jobs.js';
import {
  decisionEvaluateHandler,
  decisionGetHandler,
  decisionListHandler,
  decisionRecordHandler,
  decisionWriteHandler,
} from './handlers/decision.js';
import { capabilityReadHandler } from './handlers/capability.js';
import { portfolioReadHandler, portfolioWriteHandler } from './handlers/portfolio.js';
import { profileReadHandler, profileWriteHandler } from './handlers/profile.js';
import { decideReadiness, loadContext, qualityAssessHandler } from './handlers/quality.js';
import {
  usageCreditsAdjustHandler,
  usageHistoryHandler,
  usageStatusHandler,
  usageSubscriptionHandler,
} from './handlers/usage.js';
import { NO_MARKET_DATA, type MarketDataInput } from '../../packages/shared/src/quality/model.js';
import type { AnalysisReadinessDecision } from '../../packages/shared/src/quality/readiness.js';
import {
  assertRouteCoverage,
  assertSocketCoverage,
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
  /** Job store. Defaults to in-memory; pass a durable store for restart safety. */
  jobStore?: JobStore;
  /**
   * Repositories, when a database handle is open. Supplying them is what makes
   * jobs durable and job actions auditable; without them the server says so.
   */
  repositories?: Repositories;
  /**
   * What the server can offer in the way of bars.
   *
   * A fact about the deployment, not a request: the readiness gate weighs the series
   * before an analysis runs, so this is reported by the server and never accepted from
   * a client. Defaults to "nothing", which is the honest state until a provider is
   * registered.
   */
  marketData?: MarketDataInput;
  /** Start the background worker loop with the server. Off in tests by default. */
  startWorkers?: boolean;
  /** Realtime limits, so a test can shorten the authentication deadline. */
  realtimeLimits?: Partial<RealtimeLimits>;
  /**
   * Replace the transport rate limiter, so a test can drive the refusal path without
   * issuing six hundred requests or waiting a minute.
   */
  rateLimiter?: InstalledSecurity['rateLimiter'];
  /**
   * The usage store. Defaults to durable when a database handle is open and in-process
   * otherwise, and the difference is reported by the readiness check rather than hidden:
   * "credits survive a restart" is either true for this deployment or it is not.
   */
  usageStore?: UsageStore;
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
  jobService: JobService;
  workers: JobWorkerPool;
  eventBus: EventBus;
  realtime: RealtimeHub;
  agent: AgentService;
  /** The metering service, exposed so a test can assert on the ledger it holds. */
  usage: UsageService;
  usageStore: UsageStore;
  /** Transport security, exposed so a test can assert on the limiter it holds. */
  security: InstalledSecurity;
  routes: readonly RouteEntry[];
  bootWarnings: readonly string[];
  close(): Promise<void>;
}

/** Preconditions checked before a socket is opened. */
export function assertServerPreconditions(config: AppConfig): void {
  assertSafeConfig(config);
  assertNoHardlineOperations();
  assertApiCatalogue();
  // The plan catalogue is part of the authorization boundary — an entitlement composed
  // with the role table decides what a request may consume — so its invariants are checked
  // at boot rather than left to a review. An invariant nothing calls is documentation.
  assertPlanCatalogue();
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
      `ai.primary.provider is "${config.ai.primary.provider}" but this server registers no provider: the adapters exist (src/llm/providers, wired by createAiGateway) and none is configured here, so the offline scripted adapter answers.`,
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
  const eventBus =
    deps.eventBus ??
    new EventBus({
      bufferSize: config.realtime.replayBufferSize,
      now:
        deps.now === undefined
          ? undefined
          : () => new Date((deps.now as () => number)()).toISOString(),
    });

  // Durable when a database handle exists, in-process otherwise. The distinction
  // is reported by the health check rather than hidden: "jobs survive a restart"
  // is either true for this deployment or it is not.
  const jobStore: JobStore =
    deps.jobStore ??
    (deps.repositories === undefined
      ? new InMemoryJobStore(deps.now)
      : new SqliteJobStore(deps.repositories.platform, deps.now));
  const jobs = deps.jobs ?? new JobQueue({ store: jobStore, now: deps.now });

  // Metering is never silently skipped: a server with no database handle still meters, it
  // simply cannot promise the balance survives a restart, and says so.
  const usageStore: UsageStore =
    deps.usageStore ??
    (deps.repositories === undefined
      ? new InMemoryUsageStore(deps.now === undefined ? {} : { now: deps.now })
      : new SqliteUsageStore(deps.repositories.usage));
  const usage = new UsageService({
    store: usageStore,
    logger,
    ...(deps.now === undefined ? {} : { now: deps.now }),
    ...(deps.repositories === undefined
      ? {}
      : {
          audit: {
            append: async (record) => {
              await (deps.repositories as Repositories).audit.append({
                correlationId: record.correlationId,
                actor: record.actor,
                event: record.event,
                severity: record.severity,
                payload: record.payload,
              });
            },
          },
        }),
  });

  const jobService = new JobService({
    queue: jobs,
    logger,
    events: {
      publish: (event: JobStatusEvent) => publishJobStatus(eventBus, event, logger),
    },
    ...(deps.repositories === undefined
      ? {}
      : {
          audit: {
            append: async (record) => {
              await (deps.repositories as Repositories).audit.append({
                correlationId: record.correlationId,
                actor: record.actor,
                event: record.event,
                severity: record.severity,
                payload: record.payload,
              });
            },
          },
        }),
  });

  const workers = new JobWorkerPool({
    queue: jobs,
    logger,
    ...(deps.now === undefined ? {} : { sleep: () => Promise.resolve() }),
  });

  const realtime = new RealtimeHub({
    bus: eventBus,
    sessions,
    logger,
    ...(deps.now === undefined ? {} : { now: deps.now }),
    ...(deps.realtimeLimits === undefined ? {} : { limits: deps.realtimeLimits }),
  });

  const agent = deps.agent ?? new AgentService();
  const llmProviders = deps.llmProviders ?? ['scripted'];

  /**
   * What this server can offer in the way of bars.
   *
   * Reported as a fact and defaulted to "nothing", because until a provider is
   * registered there is genuinely nothing to read — and the readiness gate treats an
   * absent series as a reason to refuse rather than a gap to fill.
   */
  const marketData: MarketDataInput = deps.marketData ?? NO_MARKET_DATA;

  /**
   * Evaluate the gate for one requested analysis, against the stored context.
   *
   * The gate is a function of stored state, so it is evaluated here where the store is
   * reachable and passed into the agent as a verdict. The agent then refuses on a
   * refusal *before* consulting any model, which is the ordering the rule needs.
   */
  const readinessFor = async (
    userId: string,
    analysisType: string,
  ): Promise<AnalysisReadinessDecision | null> => {
    if (deps.repositories === undefined) return null;
    const now = (deps.now ?? (() => Date.now()))();
    const loaded = await loadContext(deps.repositories, userId, now);
    return (
      decideReadiness({ context: loaded.context, marketData, now }, { analysisType })[0] ?? null
    );
  };

  const health = new HealthRegistry(
    defaultHealthChecks({
      config,
      sessions,
      jobs,
      eventBus,
      agent,
      llmProviders,
      workers,
      realtime,
      jobStoreKind: jobStore.kind,
      durableJobs: jobStore.durable,
      usageStoreKind: usageStore.kind,
      durableUsage: usageStore.durable,
      profileStore: deps.repositories !== undefined,
      marketDataAvailable: marketData.available,
    }),
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

  // Transport security comes first: the headers, the origin check and the rate limit are
  // all in front of authentication, so an unauthenticated flood is refused before it can
  // make the process do any work.
  const security = installSecurity(app, {
    config,
    logger,
    ...(deps.now === undefined ? {} : { now: deps.now }),
    ...(deps.rateLimiter === undefined ? {} : { rateLimiter: deps.rateLimiter }),
  });

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
    'agent.chat': agentChatHandler(agent, eventBus, readinessFor, {
      service: usage,
      featureId: 'agent.chat',
      credits: FEATURES_BY_ID['agent.chat'].creditCost,
    }) as AnyHandler,
    'job.list': jobListHandler(jobService) as AnyHandler,
    'job.get': jobGetHandler(jobService) as AnyHandler,
    'job.cancel': jobCancelHandler(jobService) as AnyHandler,
    'profile.read': profileReadHandler({
      repositories: deps.repositories,
      now: deps.now,
    }) as AnyHandler,
    'profile.write': profileWriteHandler({
      repositories: deps.repositories,
      now: deps.now,
    }) as AnyHandler,
    'quality.assess': qualityAssessHandler({
      repositories: deps.repositories,
      marketData,
      now: deps.now,
    }) as AnyHandler,
    // Composition is metered through `portfolio.composition`, which costs nothing and is
    // therefore never refused for affordability — but the entitlement is still resolved and
    // the attempt is still recorded, so the usage history is a record of what the platform
    // did rather than only of what it charged. The feature's declared operation is
    // `portfolio.read`, which is exactly the route that runs the arithmetic, so the two
    // cannot drift: a declaration is not a consumption and is not metered here.
    'portfolio.read': portfolioReadHandler({
      repositories: deps.repositories,
      marketData,
      usage,
      featureId: FEATURES_BY_ID['portfolio.composition'].id,
      now: deps.now,
    }) as AnyHandler,
    'portfolio.write': portfolioWriteHandler({
      repositories: deps.repositories,
      marketData,
      now: deps.now,
    }) as AnyHandler,
    // The decision surface. Writing a declaration is not metered and evaluating one is, which is
    // the same split the portfolio routes use and for the same reason: the feature the catalogue
    // prices names the operation that runs the arithmetic (`decision.evaluate`), and an attempt
    // is recorded even when it costs nothing, so the usage history is a record of what the
    // platform did rather than only of what it charged.
    'decision.list': decisionListHandler({
      repositories: deps.repositories,
      now: deps.now,
    }) as AnyHandler,
    'decision.get': decisionGetHandler({
      repositories: deps.repositories,
      marketData,
      now: deps.now,
    }) as AnyHandler,
    'decision.record': decisionRecordHandler({
      repositories: deps.repositories,
      marketData,
      now: deps.now,
    }) as AnyHandler,
    'decision.write': decisionWriteHandler({
      repositories: deps.repositories,
      marketData,
      now: deps.now,
    }) as AnyHandler,
    'decision.evaluate': decisionEvaluateHandler({
      repositories: deps.repositories,
      marketData,
      usage,
      featureId: FEATURES_BY_ID['decision.evaluation'].id,
      now: deps.now,
    }) as AnyHandler,
    // The capability catalogue. Read-only, and it resolves no permission of its own: `state`
    // describes the caller's declared inputs and whether the capability exists, while whether a
    // role may run it is decided per request by the pipeline.
    'capability.read': capabilityReadHandler({
      repositories: deps.repositories,
      marketData,
      now: deps.now,
    }) as AnyHandler,
    'usage.read': usageStatusHandler({ usage, now: deps.now }) as AnyHandler,
    'usage.history': usageHistoryHandler({ usage, now: deps.now }) as AnyHandler,
    'usage.credits.adjust': usageCreditsAdjustHandler({ usage, now: deps.now }) as AnyHandler,
    'usage.subscription.set': usageSubscriptionHandler({ usage, now: deps.now }) as AnyHandler,
  };

  registerRoutes(app, { handlers, pipeline });

  assertRouteCoverage(tracked);

  // The socket route is mounted by its own transport (a WebSocket is not an HTTP
  // route) inside a plugin that must load the WebSocket plugin first, so its
  // coverage is proven when the instance is ready — the first moment the route is
  // guaranteed to exist.
  registerRealtimeTransport({
    app,
    hub: realtime,
    access,
    ...(deps.logger === undefined ? {} : { logger: deps.logger }),
  });
  app.addHook('onReady', async () => {
    assertSocketCoverage(tracked);
  });

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

  if (deps.startWorkers === true) workers.start();

  return {
    app,
    config,
    logger,
    logging,
    health,
    sessions,
    approvals,
    jobs,
    jobService,
    workers,
    eventBus,
    realtime,
    agent,
    usage,
    usageStore,
    security,
    routes: routeEntries(handlers),
    bootWarnings: warnings,
    close: async () => {
      // Order matters: stop taking work, let in-flight handlers finish, close the
      // sockets with "going away", then let Fastify close the server.
      const stillRunning = await workers.stop();
      if (stillRunning > 0) {
        logger.warn(
          'job handlers were still running at shutdown',
          { stillRunning },
          'jobs.shutdown.drain.timeout',
        );
      }
      realtime.closeAll('the server is shutting down');
      await app.close();
    },
  };
}

/**
 * Map a job status change onto the event bus.
 *
 * The source is `job` with the job's own id, so a client can tell a job event from
 * an agent event and trace it back. `job.status` is system-published only: the
 * contract refuses a role publisher, so nothing in the request path can forge one.
 */
function publishJobStatus(bus: EventBus, event: JobStatusEvent, logger: Logger): void {
  try {
    bus.publish({
      type: 'job.status',
      source: { kind: 'job', id: event.jobId },
      ...(event.correlationId === null ? {} : { correlationId: event.correlationId }),
      payload: {
        jobId: event.jobId,
        kind: event.kind,
        status: event.status,
        attempts: event.attempts,
        maxAttempts: event.maxAttempts,
        ...(event.progress === undefined ? {} : { progress: event.progress }),
        ...(event.error === undefined ? {} : { error: event.error.slice(0, 1_000) }),
      },
    });
  } catch (error) {
    // A rejected event must be visible, never silent: it means the contract and
    // the producer have drifted apart.
    logger.error(
      'refused to publish a job status event',
      { jobId: event.jobId, status: event.status, message: (error as Error).message },
      'realtime.publish.refused',
    );
  }
}
