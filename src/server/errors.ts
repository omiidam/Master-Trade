/**
 * Error handling for the HTTP surface.
 *
 * Every failure leaves the process through this one path, so the invariants are
 * enforced once:
 *   - the response is always the typed envelope (`{ok:false,error,correlationId}`);
 *   - the body carries a stable code and a safe message — never a stack trace,
 *     never a raw provider payload, never the original thrown value;
 *   - the status comes from `ERROR_STATUS` (src/core/errors.ts), defined once;
 *   - the failure is logged with the correlation id, and the log redacts secrets.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  CORRELATION_ID_HEADER,
  errorResponse,
  type ApiResponse,
} from '../../packages/shared/src/api/contracts.js';
import { AppError, toAppError, type ErrorCode } from '../../packages/shared/src/core/errors.js';
import { ids } from '../../packages/shared/src/core/ids.js';
import type { Logger } from '../../packages/shared/src/core/logging.js';

export interface HttpFailure {
  status: number;
  code: ErrorCode;
  response: ApiResponse<never>;
  /** Safe, non-sensitive message for logs. */
  logMessage: string;
}

/** Transport-level failures Fastify raises before any handler runs. */
function mapTransportError(statusCode: number, message: string): AppError | null {
  switch (statusCode) {
    case 413:
      return new AppError('VALIDATION_FAILED', 'Request body exceeds the configured limit.');
    case 415:
      return new AppError('VALIDATION_FAILED', 'Unsupported content type; send application/json.');
    case 400:
      return new AppError('VALIDATION_FAILED', `Malformed request: ${message}`);
    default:
      return null;
  }
}

/**
 * What an unexpected failure says to the caller.
 *
 * A message we did not write is not a message we can vouch for: `toAppError` copies an
 * arbitrary thrown value's text, which for a driver error is a file path, for a provider
 * error is a payload, and for a leaky library is a connection string. So the *body* is
 * replaced while the log keeps the real text, and the correlation id in both is what joins
 * them. Errors this codebase raises deliberately keep their own message, because those are
 * written to be shown.
 */
export const INTERNAL_MESSAGE =
  'An internal error occurred. Quote the correlation id when reporting it.';

export function toHttpFailure(error: unknown, correlationId: string): HttpFailure {
  const statusCode = (error as { statusCode?: unknown } | null)?.statusCode;
  const mapped =
    typeof statusCode === 'number'
      ? mapTransportError(statusCode, (error as Error).message ?? '')
      : null;
  const appError = mapped ?? toAppError(error);
  // `mapped` and an `AppError` both carry a message this codebase chose; anything else
  // arrived from a library, a driver or a socket, and is redacted.
  const authored = mapped !== null || error instanceof AppError;
  return {
    status: appError.status,
    code: appError.code,
    response: authored
      ? errorResponse(appError, correlationId)
      : {
          ok: false,
          error: { code: 'INTERNAL', message: INTERNAL_MESSAGE },
          correlationId,
        },
    logMessage: appError.message,
  };
}

export function correlationIdFor(request: FastifyRequest): string {
  const header = request.headers[CORRELATION_ID_HEADER];
  const raw = Array.isArray(header) ? header[0] : header;
  if (raw && /^[A-Za-z0-9._:-]{1,128}$/.test(raw)) return raw;
  return request.mt?.correlationId ?? ids.correlationId();
}

/**
 * Install the process-wide error and 404 handlers. Called once, at server
 * construction, so no route can opt out of it.
 */
export function installErrorHandlers(app: FastifyInstance, deps: { logger: Logger }): void {
  app.setErrorHandler((error, request, reply: FastifyReply) => {
    const correlationId = request.mt?.correlationId ?? correlationIdFor(request);
    const failure = toHttpFailure(error, correlationId);

    deps.logger.error(
      'request failed',
      {
        code: failure.code,
        status: failure.status,
        routeId: request.mt?.route.id ?? 'unmatched',
        principalId: request.mt?.principal?.id ?? null,
        detail: failure.logMessage,
      },
      'http.request.failed',
    );

    // The reply body is built from the typed error, never from the thrown value.
    return reply
      .code(failure.status)
      .header(CORRELATION_ID_HEADER, correlationId)
      .send(failure.response);
  });

  app.setNotFoundHandler((request, reply: FastifyReply) => {
    const correlationId = correlationIdFor(request);
    const failure = toHttpFailure(
      new AppError(
        'NOT_FOUND',
        `No route for ${request.method} ${request.url.split('?')[0] ?? ''}`,
      ),
      correlationId,
    );
    return reply
      .code(failure.status)
      .header(CORRELATION_ID_HEADER, correlationId)
      .send(failure.response);
  });
}
