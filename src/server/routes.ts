/**
 * Route registration.
 *
 * Every route in the catalogue is registered here and every one of them carries
 * the same `preHandler` pipeline, so a handler cannot be reached without
 * authentication, authorization and validation. Two properties are asserted at
 * start-up (see `assertRouteCoverage`):
 *
 *   - no registered route lacks the pipeline;
 *   - no catalogue route is missing from the server.
 *
 * Routes whose backend capability does not exist yet are still registered and
 * still guarded: they answer `501 NOT_IMPLEMENTED` with a reason. Serving an
 * honest "not implemented" behind the full auth pipeline is better than silently
 * omitting the route, because it keeps one code path for every request.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  API_ROUTES,
  API_VERSION,
  CORRELATION_ID_HEADER,
  SOCKET_ROUTES,
  errorResponse,
  okResponse,
  type AnyApiRoute,
  type ApiSocketRoute,
} from '../../packages/shared/src/api/contracts.js';
import { AppError, PolicyViolationError } from '../../packages/shared/src/core/errors.js';
import { runRequestPipeline, type PipelineDeps } from './authorization.js';
import { requireRequestContext, type HandlerResult, type RouteHandler } from './context.js';

declare module 'fastify' {
  interface FastifyContextConfig {
    /** Set when a route is wired through the request pipeline. */
    mtRouteId?: string;
  }
}

export type AnyHandler = RouteHandler<never, unknown>;

/** Handlers that intentionally do not exist yet, with the reason they do not. */
export const PENDING_ROUTES: Readonly<Record<string, string>> = {
  'lesson.complete': 'Requires the persistence slice: no repository can record progress yet.',
  'rule.propose': 'Requires the persistence slice and the rule registry wiring.',
  'rule.activate':
    'Approval-gated. Requires a recorded human approval plus persistence; denied by default.',
};

export interface RouteEntry {
  id: string;
  method: string;
  path: string;
  operation: string;
  auth: 'required' | 'anonymous';
  implemented: boolean;
  pendingReason?: string;
}

export interface RegisterRoutesDeps {
  handlers: Readonly<Record<string, AnyHandler>>;
  pipeline: PipelineDeps;
}

export function routeEntries(
  handlers: Readonly<Record<string, AnyHandler>> = {},
): readonly RouteEntry[] {
  return API_ROUTES.map((route) => {
    const implemented = route.id in handlers;
    const pendingReason = PENDING_ROUTES[route.id];
    return {
      id: route.id,
      method: route.method,
      path: route.path,
      operation: route.operation,
      auth: route.auth,
      implemented,
      ...(implemented || pendingReason === undefined ? {} : { pendingReason }),
    };
  });
}

interface TrackedRoute {
  url: string;
  method: string | string[];
  pipelined: boolean;
}

/** Record every route Fastify registers, so coverage can be proven afterwards. */
export function trackRegisteredRoutes(app: FastifyInstance): TrackedRoute[] {
  const tracked: TrackedRoute[] = [];
  app.addHook('onRoute', (options) => {
    tracked.push({
      url: options.url,
      method: options.method,
      pipelined: options.config?.mtRouteId !== undefined,
    });
  });
  return tracked;
}

export function assertRouteCoverage(
  tracked: readonly TrackedRoute[],
  routes: readonly AnyApiRoute[] = API_ROUTES,
): void {
  const bypassed = tracked.filter((entry) => !entry.pipelined);
  if (bypassed.length > 0) {
    throw new PolicyViolationError(
      `Routes registered without the request pipeline: ${bypassed
        .map((entry) => `${entry.method} ${entry.url}`)
        .join(', ')}`,
      { bypassed: bypassed.map((entry) => entry.url) },
    );
  }
  const registered = new Set(tracked.map((entry) => entry.url));
  const missing = routes.filter((route) => !registered.has(route.path));
  if (missing.length > 0) {
    throw new PolicyViolationError(
      `Catalogue routes are missing from the server: ${missing.map((route) => route.id).join(', ')}`,
      { missing: missing.map((route) => route.id) },
    );
  }
}

/**
 * Coverage for socket routes, asserted when the instance is **ready**.
 *
 * A WebSocket route is mounted inside a plugin that must load the WebSocket
 * plugin first, so it cannot be checked synchronously the way an HTTP route can.
 * The two properties are the same ones that matter: the route exists, and it
 * carries the pipeline marker — a socket that skipped the access gate would be an
 * unauthenticated way into the API.
 */
export function assertSocketCoverage(
  tracked: readonly TrackedRoute[],
  socketRoutes: readonly ApiSocketRoute[] = SOCKET_ROUTES,
): void {
  for (const route of socketRoutes) {
    const entry = tracked.find((trackedRoute) => trackedRoute.url === route.path);
    if (!entry) {
      throw new PolicyViolationError(
        `Socket route ${route.id} is missing from the server: nothing is listening at ${route.path}`,
        { missing: route.id, path: route.path },
      );
    }
    if (!entry.pipelined) {
      throw new PolicyViolationError(
        `Socket route ${route.id} is registered without the pipeline marker: it would bypass the access gate`,
        { routeId: route.id, path: route.path },
      );
    }
  }
}

function pipelineRequestOf(request: FastifyRequest) {
  return {
    method: request.method,
    url: request.url,
    ip: request.ip ?? null,
    headers: request.headers,
    body: request.body,
    params: request.params,
    query: request.query,
  };
}

export function registerRoutes(app: FastifyInstance, deps: RegisterRoutesDeps): void {
  for (const route of API_ROUTES) {
    app.route({
      method: route.method,
      url: route.path,
      config: { mtRouteId: route.id },
      // The pipeline is a middleware, not a call the handler could forget.
      preHandler: async (request, reply) => {
        // Recorded before the pipeline runs: a refusal is still a request to
        // *this* route, and the log line should say which one.
        request.mtRouteId = route.id;
        const outcome = runRequestPipeline(route, pipelineRequestOf(request), deps.pipeline);
        if (!outcome.ok) {
          return reply
            .code(outcome.error.status)
            .header(CORRELATION_ID_HEADER, outcome.correlationId)
            .header('x-api-version', API_VERSION)
            .send(errorResponse(outcome.error, outcome.correlationId));
        }
        request.mt = outcome.context;
        return undefined;
      },
      handler: async (request, reply) => {
        const context = requireRequestContext(request);
        const handler = deps.handlers[route.id];
        reply
          .header(CORRELATION_ID_HEADER, context.correlationId)
          .header('x-api-version', API_VERSION);

        if (!handler) {
          const reason = PENDING_ROUTES[route.id] ?? 'No handler is wired for this route yet.';
          throw new AppError('NOT_IMPLEMENTED', `${route.id} is not implemented: ${reason}`, {
            details: { routeId: route.id, operation: route.operation, summary: route.summary },
          });
        }

        const result: HandlerResult<unknown> = await handler({
          context,
          // The pipeline validated this body against the route's own schema.
          body: context.input.body as never,
          params: context.input.params,
          query: context.input.query,
        });

        if (context.approvalVerified) reply.header('x-approval-verified', 'true');
        return reply
          .code(result.status ?? 200)
          .send(okResponse(result.data, context.correlationId));
      },
    });
  }
}
