/**
 * Per-request context.
 *
 * One object carries everything the rest of the request needs: the correlation id
 * minted at the boundary, the matched route, the authenticated principal (or
 * null), whether the operation needs a recorded approval, and a logger already
 * bound to the correlation id. Handlers receive validated input only.
 */

import type { AnyApiRoute } from '../api/contracts.js';
import type { Principal } from '../auth/model.js';
import type { Logger } from '../core/logging.js';

export interface RequestInput {
  /** Validated body — never raw, never unknown. */
  body: Record<string, unknown>;
  /** Validated path parameters. */
  params: Record<string, string>;
  /** Validated query parameters. */
  query: Record<string, unknown>;
}

export interface RequestContext {
  correlationId: string;
  route: AnyApiRoute;
  principal: Principal | null;
  /** True when the operation is approval-gated and an approval was verified. */
  approvalVerified: boolean;
  approvalId: string | null;
  startedAt: number;
  logger: Logger;
}

export type PipelineContext = RequestContext & { input: RequestInput };

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the validation/authorization middleware; absent means "not vetted". */
    mt?: PipelineContext;
    /**
     * Route id, set before the pipeline runs so a *rejected* request is still
     * logged against the route it was matched to instead of "unmatched".
     */
    mtRouteId?: string;
    /** Wall clock at the start of the request, for duration logging. */
    mtStartedAt?: number;
  }
}

export interface HandlerInput<
  TBody,
  TParams = Record<string, string>,
  TQuery = Record<string, unknown>,
> {
  context: RequestContext;
  body: TBody;
  params: TParams;
  query: TQuery;
}

export interface HandlerResult<TData> {
  data: TData;
  /** Defaults to 200. A handler may not set 5xx; errors go through AppError. */
  status?: number;
}

export type RouteHandler<TBody = never, TData = unknown> = (
  input: HandlerInput<TBody>,
) => HandlerResult<TData> | Promise<HandlerResult<TData>>;

/** Typed accessor for the middleware output; throws if the pipeline did not run. */
export function requireRequestContext(request: { mt?: PipelineContext }): PipelineContext {
  if (!request.mt) {
    throw new Error('Request pipeline did not run: refusing to handle an unvetted request');
  }
  return request.mt;
}
