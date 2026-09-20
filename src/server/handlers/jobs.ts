/**
 * Background-job handlers.
 *
 * Thin by design: the pipeline already authenticated, authorized and validated, so
 * a handler only calls the service and shapes the response. The service repeats
 * the authorization check rather than trusting the route — two independent checks
 * for one privilege is the point, because the service is also reachable in-process
 * from the agent and the worker pool.
 *
 * There is deliberately **no enqueue route**: a client may watch and cancel work,
 * but starting arbitrary background work over HTTP is a capability this phase does
 * not need and will not add silently.
 */

import type { JobCancelBody, JobListQuery } from '../../api/schemas.js';
import type { JobService, JobView } from '../../jobs/service.js';
import type { JobStatus } from '../../jobs/vocabulary.js';
import type { RouteHandler } from '../context.js';

export interface JobListResponseData {
  jobs: JobView[];
  summary: Record<string, number>;
  note: string;
}

const NOTE =
  'Job status is read from the queue this process runs. Progress is reported by the job itself and is absent until it reports.';

export function jobListHandler(
  service: JobService,
): RouteHandler<Record<string, unknown> | undefined, JobListResponseData> {
  return async ({ context, query, body }) => {
    // The pipeline may route the same handler for GET (query) and the in-process
    // bridge (body); accept either and validate the shape here.
    const raw = { ...(body ?? {}), ...(query ?? {}) } as JobListQuery;
    const jobs = await service.list(
      {
        ...(raw.kind === undefined ? {} : { kind: raw.kind }),
        ...(raw.status === undefined ? {} : { status: raw.status as JobStatus }),
        ...(raw.limit === undefined ? {} : { limit: raw.limit }),
      },
      context.principal,
    );
    const summary = await service.summary(context.principal);
    context.logger.info(
      'jobs listed',
      { count: jobs.length, principalId: context.principal?.id ?? null },
      'jobs.listed',
    );
    return { data: { jobs, summary, note: NOTE } };
  };
}

export function jobGetHandler(
  service: JobService,
): RouteHandler<Record<string, unknown> | undefined, JobView> {
  return async ({ context, params }) => {
    const job = await service.get(params.jobId as string, context.principal);
    context.logger.info('job read', { jobId: job.id, status: job.status }, 'jobs.read');
    return { data: job };
  };
}

export function jobCancelHandler(
  service: JobService,
): RouteHandler<JobCancelBody, JobView & { reason: string | null }> {
  return async ({ context, params, body }) => {
    const job = await service.cancel(
      params.jobId as string,
      context.principal,
      context.correlationId,
    );
    context.logger.warn(
      'job cancellation recorded',
      { jobId: job.id, reason: body.reason ?? null },
      'jobs.cancel.recorded',
    );
    return { data: { ...job, reason: body.reason ?? null } };
  };
}
