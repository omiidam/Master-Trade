/**
 * Error taxonomy.
 *
 * Every layer (API, backend, LLM gateway, market data, jobs) raises the same
 * typed errors so the API layer can map them to stable status codes and the
 * frontend can render them consistently. Untyped throws become INTERNAL.
 */

export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'PROVIDER_UNAVAILABLE'
  | 'TIMEOUT'
  | 'BUDGET_EXCEEDED'
  | 'POLICY_VIOLATION'
  | 'NOT_IMPLEMENTED'
  | 'INTERNAL';

/** Stable mapping: one code -> one status, defined once. */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  BUDGET_EXCEEDED: 402,
  POLICY_VIOLATION: 451,
  TIMEOUT: 504,
  PROVIDER_UNAVAILABLE: 503,
  NOT_IMPLEMENTED: 501,
  INTERNAL: 500,
};

/** Error codes that callers may safely retry. Consumed by jobs + gateways. */
export const RETRYABLE_CODES: readonly ErrorCode[] = [
  'TIMEOUT',
  'RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'INTERNAL',
];

export interface AppErrorOptions {
  /** Structured, non-sensitive context. Never put credentials here. */
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.details = options.details;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }

  get retryable(): boolean {
    return RETRYABLE_CODES.includes(this.code);
  }

  /** Serializable, secret-free shape used by the API layer and logs. */
  toJSON(): { code: ErrorCode; message: string; details?: Record<string, unknown> } {
    return this.details === undefined
      ? { code: this.code, message: this.message }
      : { code: this.code, message: this.message, details: this.details };
  }
}

/** Raised whenever a safety/permission rule forbids an operation. */
export class PolicyViolationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('POLICY_VIOLATION', message, details === undefined ? {} : { details });
    this.name = 'PolicyViolationError';
  }
}

/** Normalize any thrown value into an AppError. */
export function toAppError(value: unknown): AppError {
  if (value instanceof AppError) return value;
  if (value instanceof Error) {
    return new AppError('INTERNAL', value.message, { cause: value });
  }
  return new AppError('INTERNAL', String(value));
}

/** True when a failure may be retried under the shared retry policy. */
export function isRetryable(value: unknown): boolean {
  if (value instanceof AppError) return value.retryable;
  return false;
}
