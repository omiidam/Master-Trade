/**
 * HTTP plumbing shared by the real provider adapters.
 *
 * One place owns the things that must not differ between providers:
 *   - the request goes out with a timeout and an abort signal;
 *   - an HTTP status becomes a **typed, retry-aware** error (`AppError`), so the
 *     gateway's retry policy can decide instead of guessing;
 *   - the provider's error text is trimmed to a single safe line — a raw payload
 *     can echo a prompt, and prompts can contain user data;
 *   - the credential never appears in an error, a detail object or a log field.
 */

import { AppError, toAppError } from '../../core/errors.js';

/** Minimal shape of `fetch`, so tests can inject a fake without a network. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface HttpProviderDeps {
  /** Provider label used in errors and logs. */
  label: string;
  baseUrl: string;
  apiKey?: string | null;
  /** Extra headers a provider needs (e.g. Anthropic's version header). */
  headers?: Record<string, string>;
  /**
   * How the credential travels. Defaults to `Authorization: Bearer <key>`, which
   * is what OpenAI and OpenAI-compatible servers expect; Anthropic uses
   * `x-api-key`, and that difference belongs in configuration, not in this file.
   */
  authHeader?: { name: string; value: string };
  fetchImpl?: FetchLike;
  defaultTimeoutMs?: number;
}

export function resolveFetch(deps: HttpProviderDeps): FetchLike {
  if (deps.fetchImpl) return deps.fetchImpl;
  const globalFetch = globalThis.fetch;
  if (typeof globalFetch !== 'function') {
    throw new AppError(
      'PROVIDER_UNAVAILABLE',
      `No fetch implementation available for provider "${deps.label}"`,
    );
  }
  return (url, init) => globalFetch(url, init);
}

export interface PostJsonInput {
  path: string;
  body: unknown;
  timeoutMs: number;
  correlationId: string;
  signal?: AbortSignal | undefined;
}

/**
 * POST JSON and return the parsed body. Throws a typed error on any failure —
 * the caller never sees a `Response`, so no adapter can accidentally leak one.
 */
export async function postJson(deps: HttpProviderDeps, input: PostJsonInput): Promise<unknown> {
  const fetchImpl = resolveFetch(deps);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  const onOuterAbort = (): void => controller.abort();
  input.signal?.addEventListener('abort', onOuterAbort);

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...deps.headers,
  };
  if (deps.authHeader) {
    headers[deps.authHeader.name] = deps.authHeader.value;
  } else if (deps.apiKey) {
    headers.authorization = `Bearer ${deps.apiKey}`;
  }

  let response: Response;
  try {
    response = await fetchImpl(`${deps.baseUrl}${input.path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input.body),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new AppError('TIMEOUT', `${deps.label} request timed out after ${input.timeoutMs}ms`, {
        details: { correlationId: input.correlationId, provider: deps.label },
      });
    }
    // Network-level failure: retryable, and never carries the credential.
    throw new AppError('PROVIDER_UNAVAILABLE', `${deps.label} request failed`, {
      details: { correlationId: input.correlationId, provider: deps.label },
      cause: error,
    });
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener('abort', onOuterAbort);
  }

  if (!response.ok) {
    throw httpError(deps, response, input.correlationId, await readProviderMessage(response));
  }

  try {
    return await response.json();
  } catch (error) {
    throw new AppError('PROVIDER_UNAVAILABLE', `${deps.label} returned a non-JSON body`, {
      details: { correlationId: input.correlationId, provider: deps.label },
      cause: error,
    });
  }
}

/** Map an HTTP status onto the shared error taxonomy. */
export function httpError(
  deps: Pick<HttpProviderDeps, 'label'>,
  response: Response,
  correlationId: string,
  providerMessage?: string | null,
): AppError {
  const status = response.status;
  const details: Record<string, unknown> = {
    provider: deps.label,
    status,
    correlationId,
  };
  if (providerMessage) details.providerMessage = providerMessage;

  if (status === 429) {
    return new AppError('RATE_LIMITED', `${deps.label} rate limited the request`, { details });
  }
  if (status === 408) {
    return new AppError('TIMEOUT', `${deps.label} reported a timeout`, { details });
  }
  if (status === 401 || status === 403) {
    // A bad credential is a configuration fault: retrying cannot fix it.
    return new AppError('FORBIDDEN', `${deps.label} rejected the credential`, { details });
  }
  if (status >= 400 && status < 500) {
    return new AppError('VALIDATION_FAILED', `${deps.label} rejected the request (${status})`, {
      details,
    });
  }
  return new AppError('PROVIDER_UNAVAILABLE', `${deps.label} returned HTTP ${status}`, {
    details,
  });
}

/**
 * Best-effort, single-line, length-capped message from an error body.
 *
 * Two deliberate restrictions: only the conventional `error.message` / `message`
 * field of a **JSON** body is used (an HTML error page or a raw dump is not),
 * and the result is collapsed to one line and capped. Error payloads can echo
 * part of the request, and requests carry the user's own data.
 */
export async function readProviderMessage(response: Response): Promise<string | null> {
  const cap = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const collapsed = value.replace(/\s+/g, ' ').trim();
    if (collapsed.length === 0) return null;
    return collapsed.length > 200 ? `${collapsed.slice(0, 200)}…` : collapsed;
  };

  let text: string;
  try {
    text = await response.text();
  } catch {
    return null;
  }
  if (text.length === 0) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const record = parsed as Record<string, unknown>;
  const error = record.error;
  if (error && typeof error === 'object') {
    const message = cap((error as Record<string, unknown>).message);
    if (message) return message;
  }
  return cap(record.message);
}

/** Normalize anything thrown inside an adapter into an AppError. */
export function asProviderError(error: unknown, label: string): AppError {
  if (error instanceof AppError) return error;
  const appError = toAppError(error);
  return new AppError(appError.code, `${label}: ${appError.message}`, {
    details: appError.details,
    cause: error,
  });
}
