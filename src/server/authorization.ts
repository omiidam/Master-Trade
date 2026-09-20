/**
 * The request pipeline — validation, authentication, authorization, approval.
 *
 * Registered as a `preHandler` hook for **every** route, so no handler can be
 * reached without passing through it. The steps, in order:
 *
 *   1. version gate          (path prefix + `x-api-version`, unknown versions rejected)
 *   2. access policy         (loopback only, shell token when configured)
 *   3. envelope unwrap       (in-process bridge sends an envelope; HTTP may too)
 *   4. authentication        (bearer session token -> principal)
 *   5. authorization         (deny-by-default operation grant)
 *   6. approval gate         (approval-gated operations need a recorded decision)
 *   7. params/query/body      validation (Zod, one schema per payload)
 *   8. path/body agreement   (a redundant identifier must not disagree)
 *
 * Authorization runs *before* body validation on purpose: an unauthenticated
 * caller learns nothing about which fields the server would have accepted.
 */

import type { AppConfig } from '../core/config.js';
import {
  AppError,
  PolicyViolationError,
  toAppError,
} from '../../packages/shared/src/core/errors.js';
import { IdFactory, type CorrelationId } from '../../packages/shared/src/core/ids.js';
import type { Logger } from '../../packages/shared/src/core/logging.js';
import {
  API_VERSION,
  API_VERSION_HEADER,
  CORRELATION_ID_HEADER,
  guardRoute,
  isEnvelopeShaped,
  validateEnvelope,
  type AnyApiRoute,
} from '../../packages/shared/src/api/contracts.js';
import { bearerToken, type SessionService } from '../auth/sessions.js';
import { headerValue, SHELL_TOKEN_HEADER, type AccessPolicy, type HeaderBag } from './access.js';
import { denyAllApprovals, type ApprovalGate } from './approval.js';
import type { PipelineContext } from './context.js';

export const APPROVAL_ID_HEADER = 'x-approval-id';
export const APPROVAL_SUBJECT_HEADER = 'x-approval-subject';

/** Header the desktop shell uses to prove it launched this process. */
export { SHELL_TOKEN_HEADER };

export interface PipelineDeps {
  config: AppConfig;
  sessions: SessionService;
  access: AccessPolicy;
  approvals?: ApprovalGate;
  logger: Logger;
  idFactory?: IdFactory;
  now?: () => number;
  /**
   * Whether `auth.allowAnonymousLocalLogin` is honoured. The HTTP server never
   * honours it (a socket-only client has no way to prove "local user"), and says
   * so instead of silently ignoring the setting.
   */
  honourAnonymousLogin?: boolean;
}

export interface PipelineRequest {
  method: string;
  url: string;
  ip: string | null;
  headers: HeaderBag;
  body: unknown;
  params: unknown;
  query: unknown;
}

export type PipelineOutcome =
  | { ok: true; context: PipelineContext }
  | { ok: false; error: AppError; correlationId: CorrelationId };

/** Accept a caller-supplied id only when it is safe to echo into logs. */
export function safeCorrelationId(value: string | null): CorrelationId | null {
  if (value === null) return null;
  return /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : null;
}

export function correlationIdFrom(headers: HeaderBag, idFactory: IdFactory): CorrelationId {
  return (
    safeCorrelationId(headerValue(headers, CORRELATION_ID_HEADER)) ?? idFactory.correlationId()
  );
}

function stringRecord(value: unknown): Record<string, string> {
  if (value === null || typeof value !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === 'string') out[key] = item;
    else if (typeof item === 'number' || typeof item === 'boolean') out[key] = String(item);
  }
  return out;
}

/** The subject an approval must be about, if the request names one. */
function readSubjectRef(
  headers: HeaderBag,
  body: Record<string, unknown>,
  params: Record<string, string>,
): string | null {
  const fromHeader = headerValue(headers, APPROVAL_SUBJECT_HEADER);
  if (fromHeader !== null) return fromHeader;
  const fromParams = params.proposalId ?? params.id;
  if (fromParams !== undefined) return fromParams;
  const fromBody = body.proposalId ?? body.id;
  return typeof fromBody === 'string' ? fromBody : null;
}

export function runRequestPipeline(
  route: AnyApiRoute,
  request: PipelineRequest,
  deps: PipelineDeps,
): PipelineOutcome {
  const idFactory = deps.idFactory ?? new IdFactory();
  const headerCorrelationId = safeCorrelationId(
    headerValue(request.headers, CORRELATION_ID_HEADER),
  );
  let correlationId: CorrelationId = headerCorrelationId ?? idFactory.correlationId();
  let logger = deps.logger.child(route.id, correlationId);
  const now = (deps.now ?? Date.now)();
  const approvals = deps.approvals ?? denyAllApprovals;

  try {
    // 1. Version gate.
    const headerVersion = headerValue(request.headers, API_VERSION_HEADER);
    if (headerVersion !== null && headerVersion !== API_VERSION) {
      throw new AppError(
        'VALIDATION_FAILED',
        `Unsupported api version "${headerVersion}"; this server speaks ${API_VERSION}.`,
        { details: { supported: API_VERSION } },
      );
    }

    // 2. Local access policy (loopback + optional shell token).
    deps.access.assertAllowed({ ip: request.ip, headers: request.headers });

    // 3. Envelope unwrap (the in-process bridge and HTTP share one contract).
    let rawBody = request.body;
    if (isEnvelopeShaped(rawBody)) {
      const envelope = validateEnvelope(rawBody);
      if (!envelope.ok) {
        throw new AppError('VALIDATION_FAILED', 'Invalid request envelope.', {
          details: { issues: envelope.issues },
        });
      }
      if (envelope.value.routeId !== route.id) {
        throw new AppError(
          'VALIDATION_FAILED',
          `Envelope names route ${envelope.value.routeId} but was delivered to ${route.id}.`,
        );
      }
      // The in-process bridge sends its correlation id in the envelope, so both
      // sides of the call log the same id. A header, when present, still wins.
      if (headerCorrelationId === null) {
        const fromEnvelope = safeCorrelationId(envelope.value.correlationId);
        if (fromEnvelope !== null) {
          correlationId = fromEnvelope;
          logger = deps.logger.child(route.id, correlationId);
        }
      }
      rawBody = envelope.value.body;
    }
    const bodyRecord =
      rawBody === null || rawBody === undefined
        ? {}
        : typeof rawBody === 'object' && !Array.isArray(rawBody)
          ? (rawBody as Record<string, unknown>)
          : { _invalidBody: rawBody };

    // 4. Authentication. A presented-but-invalid token is always an error:
    //    silently downgrading to anonymous would hide an expired session.
    const token = bearerToken(headerValue(request.headers, 'authorization'));
    const principal = token === null ? null : deps.sessions.require(token);

    // 5. Authorization (deny-by-default).
    const decision = guardRoute(route, principal, now);
    if (!decision.allowed) {
      throw new AppError(decision.error.code, decision.error.message);
    }

    // 6. Approval gate for operations that require a human decision.
    let approvalId: string | null = null;
    if (decision.approvalRequired) {
      approvalId = headerValue(request.headers, APPROVAL_ID_HEADER);
      const params = stringRecord(request.params);
      const subjectRef = readSubjectRef(request.headers, bodyRecord, params);
      const verdict = approvals.verify({
        operation: route.operation,
        approvalId,
        subjectRef,
      });
      if (!verdict.approved) {
        throw new PolicyViolationError(
          `${route.operation} requires a recorded human approval: ${verdict.reason}`,
          { operation: route.operation, subjectRef, approvalIdProvided: approvalId !== null },
        );
      }
    }

    // 7. Validation: params, then query, then body. No handler sees unknown input.
    const params = route.validateParams
      ? assertValid(route.validateParams(request.params), 'path parameters')
      : stringRecord(request.params);

    let query: Record<string, unknown> = {};
    if (route.validateQuery) {
      query = assertValid(route.validateQuery(request.query), 'query parameters');
    }

    const validated = assertValid(route.validateBody(rawBody), 'request body');
    const validatedBody: Record<string, unknown> =
      validated === undefined || validated === null ? {} : (validated as Record<string, unknown>);

    // 8. A redundant identifier in the path and the body must agree.
    for (const [key, value] of Object.entries(params)) {
      const inBody = validatedBody[key];
      if (inBody !== undefined && inBody !== value) {
        throw new AppError(
          'VALIDATION_FAILED',
          `${key} in the path (${value}) does not match the body (${String(inBody)}).`,
        );
      }
    }

    return {
      ok: true,
      context: {
        correlationId,
        route,
        principal,
        approvalVerified: decision.approvalRequired,
        approvalId,
        startedAt: now,
        logger,
        input: { body: validatedBody, params, query },
      },
    };
  } catch (error) {
    const appError = toAppError(error);
    logger.warn(
      'request rejected',
      { code: appError.code, status: appError.status, routeId: route.id },
      'http.request.rejected',
    );
    return { ok: false, error: appError, correlationId };
  }
}

function assertValid<T>(
  result: { ok: true; value: T } | { ok: false; issues: string[] },
  what: string,
): T {
  if (result.ok) return result.value;
  throw new AppError('VALIDATION_FAILED', `Invalid ${what}.`, {
    details: { issues: result.issues },
  });
}
