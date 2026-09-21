/**
 * Frontend HTTP client for the local API.
 *
 * Small on purpose, and typed against the backend's own contracts rather than a
 * hand-written copy: the envelope, the error codes and the version header all come
 * from `src/api/contracts.ts` and `src/core/errors.ts`. When the server changes a
 * code, this file stops compiling — which is the point.
 *
 * Three rules it keeps:
 *
 *   1. **Credentials travel in headers, never in a URL.** The session token goes in
 *      `Authorization: Bearer`, the per-launch shell token in the header the access
 *      policy names. A token in a query string ends up in logs (ADR-0022).
 *   2. **A failure is typed.** Every non-2xx answer — and every transport failure —
 *      becomes an `ApiError` carrying the server's own error code, so the UI can say
 *      *why* ("your session is not authorized for this") instead of "request failed".
 *   3. **Nothing here executes trading.** Every route this client knows is about
 *      reading state, declaring context or asking a question: jobs, profile, input
 *      quality, readiness. There is no order route to call, and `POST /v1/jobs` does
 *      not exist — enqueueing background work stays server-side.
 */

import {
  API_PATH_PREFIX,
  API_VERSION,
  CORRELATION_ID_HEADER,
  type ApiErrorBody,
  type ApiResponse,
} from '@shared/api/contracts';
import { ERROR_STATUS, type ErrorCode } from '@shared/core/errors';
import { IdFactory } from '@shared/core/ids';
import { SHELL_TOKEN_HEADER } from '@shared/core/headers';
import type { JobView } from '@shared/jobs/service';
import type {
  PortfolioViewData,
  ProfileData,
  ProfileWriteData,
  QualityAssessData,
  UsageHistoryData,
  UsageStatusData,
} from '@shared/api/contracts';
import type { PortfolioDocumentBody } from '@shared/portfolio/model';
import type { AnalysisType } from '@shared/quality/readiness';
import type { FieldKey } from '@shared/profile/model';
import type { TradingContext } from '@shared/profile/model';

/** Where the API is, and what may talk to it. */
export interface ApiConnection {
  baseUrl: string;
  token: string;
  /** Present only inside the desktop shell, where the sidecar is token-gated. */
  shellToken?: string | null;
}

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'dead-letter' | 'cancelled';

export interface JobListFilter {
  kind?: string;
  status?: JobStatus;
  limit?: number;
}

/** What `GET /v1/jobs` returns: the client may watch and cancel, never enqueue. */
export interface JobListData {
  jobs: JobView[];
  summary?: Record<string, number>;
  note?: string;
}

export interface JobCancelData extends JobView {
  reason?: string | null;
}

/** `GET /v1/usage/history` filters. Both are bounded by the server's own schema. */
export interface UsageHistoryFilter {
  feature?: string;
  limit?: number;
}

/** Raised for any failed request. `code` is the server's code, or a local one. */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly correlationId: string;
  readonly details: Record<string, unknown> | undefined;

  constructor(input: {
    code: ErrorCode;
    message: string;
    status: number;
    correlationId: string;
    details?: Record<string, unknown>;
  }) {
    super(input.message);
    this.name = 'ApiError';
    this.code = input.code;
    this.status = input.status;
    this.correlationId = input.correlationId;
    this.details = input.details;
  }

  /** Retrying may help: timeouts, throttling and unavailability do; a 401 does not. */
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }

  /** A message safe to render: the server's text, plus what the client can add. */
  describe(): string {
    switch (this.code) {
      case 'UNAUTHENTICATED':
        return 'The local API did not accept this session. Sign in again to read job status.';
      case 'FORBIDDEN':
        return 'This session is not authorized for that action, so it was not performed.';
      case 'NOT_FOUND':
        return 'That job is no longer in the queue.';
      case 'PROVIDER_UNAVAILABLE':
        return 'The local API is not answering. It may still be starting.';
      case 'NOT_IMPLEMENTED':
        return 'The backend reports this capability as not implemented yet.';
      case 'VALIDATION_FAILED':
        return this.message;
      case 'CONFLICT':
        return 'Something changed while this was being saved, so the change was not applied. Reload and try again.';
      default:
        return this.message;
    }
  }
}

interface ApiClientDeps {
  fetch?: typeof fetch;
  idFactory?: IdFactory;
  /** Set when the caller already knows the shell token for this launch. */
  shellToken?: string | null;
}

export class ApiClient {
  private readonly connection: ApiConnection;
  private readonly fetchImpl: typeof fetch;
  private readonly ids: IdFactory;

  constructor(connection: ApiConnection, deps: ApiClientDeps = {}) {
    this.connection = connection;
    this.fetchImpl = deps.fetch ?? globalThis.fetch.bind(globalThis);
    this.ids = deps.idFactory ?? new IdFactory({ prefix: 'ui' });
  }

  /** Readiness, unauthenticated by design. Used to tell "down" from "not allowed". */
  async readiness(): Promise<{ status: string } & Record<string, unknown>> {
    return this.request<{ status: string } & Record<string, unknown>>('GET', '/v1/health');
  }

  async listJobs(filter: JobListFilter = {}): Promise<JobListData> {
    const query = new URLSearchParams();
    if (filter.kind !== undefined) query.set('kind', filter.kind);
    if (filter.status !== undefined) query.set('status', filter.status);
    if (filter.limit !== undefined) query.set('limit', String(filter.limit));
    const suffix = query.size > 0 ? `?${query.toString()}` : '';
    return this.request<JobListData>('GET', `/v1/jobs${suffix}`);
  }

  async getJob(jobId: string): Promise<JobView> {
    return this.request<JobView>('GET', `/v1/jobs/${encodeURIComponent(jobId)}`);
  }

  /**
   * Cancel a job. The server checks `job.cancel` on the principal and writes an
   * audit record; the client's only job is to send the request and report what
   * came back — including a refusal, which is a normal outcome, not an error to
   * hide.
   */
  async cancelJob(jobId: string, reason?: string): Promise<JobCancelData> {
    return this.request<JobCancelData>('POST', `/v1/jobs/${encodeURIComponent(jobId)}/cancel`, {
      body: reason === undefined ? {} : { reason },
    });
  }

  /**
   * The authenticated user's profile and current trading context.
   *
   * No subject is passed: the route reports the caller's own profile, so there is no
   * parameter that could name another account.
   */
  async getProfile(): Promise<ProfileData> {
    return this.request<ProfileData>('GET', '/v1/profile');
  }

  /**
   * Replace the trading context, appending a new version.
   *
   * The whole document is sent rather than a patch: a merge would make "unchanged"
   * and "forgotten" indistinguishable, and the profile rules forbid silently keeping
   * a value the user did not restate.
   */
  async saveProfileContext(
    context: Omit<TradingContext, 'version' | 'createdAt'>,
  ): Promise<ProfileWriteData> {
    return this.request<ProfileWriteData>('PUT', '/v1/profile', { body: { context } });
  }

  /**
   * Assess the caller's declared inputs and ask whether an analysis may run.
   *
   * No subject is passed, for the same reason as the profile routes: the inputs are
   * the authenticated principal's own. The server evaluates the gate — a client
   * cannot assert its own readiness, which is the point of the route existing.
   */
  async assessQuality(
    body: { analysisType?: AnalysisType; premises?: readonly FieldKey[] } = {},
  ): Promise<QualityAssessData> {
    return this.request<QualityAssessData>('POST', '/v1/quality/assess', { body });
  }

  /**
   * The caller's own plan, balance, allowance and feature entitlements.
   *
   * No subject is passed, for the same reason as the profile routes: the balance is the
   * authenticated principal's own, so there is no parameter that could name another
   * account. The server computes every number here — the client never sends one, and a
   * client-computed balance would not be believed if it did.
   */
  async getUsage(): Promise<UsageStatusData> {
    return this.request<UsageStatusData>('GET', '/v1/usage');
  }

  /**
   * The movements and metered attempts behind the balance.
   *
   * Refusals are included, which is the useful part: "why did nothing happen" is
   * answered by the attempt that was refused, and by the reservation that was returned.
   */
  async getUsageHistory(filter: UsageHistoryFilter = {}): Promise<UsageHistoryData> {
    const query = new URLSearchParams();
    if (filter.feature !== undefined) query.set('feature', filter.feature);
    if (filter.limit !== undefined) query.set('limit', String(filter.limit));
    const suffix = query.size > 0 ? `?${query.toString()}` : '';
    return this.request<UsageHistoryData>('GET', `/v1/usage/history${suffix}`);
  }

  /**
   * The caller's own declared portfolio, with the metrics computed from it.
   *
   * No subject is passed, for the same reason as the profile and usage routes: a
   * portfolio belongs to the authenticated principal, so there is no parameter that
   * could name another account. **Every figure arrives computed.** The client does not
   * value a position, sum a total or derive a concentration — a number calculated here
   * would be a second opinion about money, and there is exactly one place arithmetic
   * about a portfolio is allowed to happen.
   */
  async getPortfolio(): Promise<PortfolioViewData> {
    return this.request<PortfolioViewData>('GET', '/v1/portfolio');
  }

  /**
   * Declare the composition, replacing the previous one and appending a version.
   *
   * The document is sent whole rather than as a patch: a merge would make "unchanged"
   * and "not restated" indistinguishable, and a half-applied redeclaration would leave
   * a composition that is partly what the user described and partly what they meant. No
   * row ids are sent — the server mints them, so a client cannot name a row it does not
   * own.
   */
  async savePortfolio(document: PortfolioDocumentBody): Promise<PortfolioViewData> {
    return this.request<PortfolioViewData>('PUT', '/v1/portfolio', { body: document });
  }

  /** One request, one typed outcome. */
  private async request<T>(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    options: { body?: unknown } = {},
  ): Promise<T> {
    const correlationId = this.ids.correlationId();
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.connection.token}`,
      [CORRELATION_ID_HEADER]: correlationId,
      'x-api-version': API_VERSION,
      accept: 'application/json',
    };
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    if (this.connection.shellToken) headers[SHELL_TOKEN_HEADER] = this.connection.shellToken;

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.connection.baseUrl}${path}`, {
        method,
        headers,
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
    } catch (error) {
      // The API may simply not be running yet; that is unavailability, not a bug in
      // the request, and says so.
      throw new ApiError({
        code: 'PROVIDER_UNAVAILABLE',
        message: error instanceof Error ? error.message : 'The local API could not be reached.',
        status: ERROR_STATUS.PROVIDER_UNAVAILABLE,
        correlationId,
      });
    }

    let envelope: ApiResponse<T> | null = null;
    try {
      envelope = (await response.json()) as ApiResponse<T>;
    } catch {
      envelope = null;
    }

    if (envelope && envelope.ok) return envelope.data;

    const body: ApiErrorBody | undefined = envelope?.error;
    const code: ErrorCode =
      body?.code ?? (response.status === 401 ? 'UNAUTHENTICATED' : 'INTERNAL');
    throw new ApiError({
      code,
      message: body?.message ?? `The API answered ${response.status} without a typed error.`,
      status: response.status,
      correlationId: envelope?.correlationId ?? correlationId,
      ...(body?.details === undefined ? {} : { details: body.details }),
    });
  }
}

export { API_PATH_PREFIX, API_VERSION };
