/**
 * Retry, backoff and timeout primitives.
 *
 * Shared by the LLM gateway, market-data providers and the job queue so that
 * failure policy is defined once (see docs/jobs-and-realtime.md). Time and
 * randomness are injectable for deterministic tests.
 */

import { AppError, isRetryable } from './errors.js';

export interface RetryPolicy {
  /** Total attempts, including the first one. */
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: boolean;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  attempts: 3,
  baseDelayMs: 200,
  maxDelayMs: 5_000,
  jitter: true,
};

/** Exponential backoff for a 1-based attempt number. */
export function backoffDelay(
  policy: RetryPolicy,
  attempt: number,
  random: () => number = Math.random,
): number {
  const exponent = Math.max(0, attempt - 1);
  const raw = Math.min(policy.baseDelayMs * 2 ** exponent, policy.maxDelayMs);
  if (!policy.jitter) return raw;
  // Full jitter keeps retries of many jobs from synchronising.
  return Math.floor(random() * raw) + 1;
}

export interface RetryOptions {
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Run `fn` with retries. Non-retryable errors fail immediately. */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  options: RetryOptions = {},
): Promise<T> {
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  const shouldRetry = options.shouldRetry ?? isRetryable;

  let lastError: unknown;
  for (let attempt = 1; attempt <= policy.attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= policy.attempts || !shouldRetry(error, attempt)) throw error;
      const delay = backoffDelay(policy, attempt, random);
      options.onRetry?.(error, attempt, delay);
      await sleep(delay);
    }
  }
  throw lastError instanceof Error ? lastError : new AppError('INTERNAL', String(lastError));
}

/** Abort after `timeoutMs`, raising a typed TIMEOUT error. */
export async function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  context: { what: string; correlationId?: string } = { what: 'operation' },
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(
        new AppError('TIMEOUT', `${context.what} timed out after ${timeoutMs}ms`, {
          details: { timeoutMs, correlationId: context.correlationId },
        }),
      );
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation(controller.signal), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
