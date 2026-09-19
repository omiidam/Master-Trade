/**
 * Local access policy.
 *
 * Two boundaries in front of authentication (DEC-DESKTOP-2-SECURITY):
 *   1. **Loopback only.** A request that did not arrive over the loopback
 *      interface is refused before anything else happens. This is a guarantee,
 *      not a setting: `assertSafeConfig` refuses to start with another host.
 *   2. **Shell token.** When one is configured, the request must carry the
 *      per-launch token the desktop shell injected, so an unrelated local process
 *      cannot talk to the API even though it can reach the port.
 *
 * Both checks fail closed: a missing or unresolvable secret refuses the request.
 */

import type { AppConfig, SecretRef } from '../core/config.js';
import { AppError, PolicyViolationError } from '../core/errors.js';
import { constantTimeEquals } from '../auth/sessions.js';

export const SHELL_TOKEN_HEADER = 'x-master-trade-shell-token';

export type HeaderBag = Record<string, string | string[] | undefined>;

/** Case-insensitive header lookup that tolerates `string[]` values. */
export function headerValue(headers: HeaderBag, name: string): string | null {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== wanted) continue;
    const single = Array.isArray(value) ? value[0] : value;
    if (single === undefined || single === null || single.length === 0) return null;
    return single;
  }
  return null;
}

const LOOPBACK_NAMES = new Set(['::1', 'localhost', '::ffff:127.0.0.1']);

export function isLoopbackAddress(address: string | null | undefined): boolean {
  if (!address) return false;
  const normalized = address.trim().toLowerCase();
  if (LOOPBACK_NAMES.has(normalized)) return true;
  return normalized.startsWith('127.') || normalized.startsWith('::ffff:127.');
}

export interface AccessRequest {
  ip: string | null;
  headers: HeaderBag;
}

export interface AccessPolicy {
  assertAllowed(request: AccessRequest): void;
}

export interface AccessPolicyOptions {
  config: AppConfig;
  /** How a `SecretRef` becomes a value. Defaults to "unresolvable". */
  resolveSecret?: (ref: SecretRef) => string | null;
}

export function createAccessPolicy(options: AccessPolicyOptions): AccessPolicy {
  const { config } = options;
  const resolve = options.resolveSecret ?? (() => null);

  return {
    assertAllowed(request: AccessRequest): void {
      if (config.api.enforceLoopback && !isLoopbackAddress(request.ip)) {
        throw new PolicyViolationError(
          'This API accepts loopback requests only. Remote access is disabled by design.',
          { ip: request.ip ?? 'unknown' },
        );
      }

      const ref = config.api.shellToken;
      if (ref === null) return;

      const expected = resolve(ref);
      if (expected === null) {
        // Configured but unresolvable: refuse rather than silently downgrade.
        throw new AppError(
          'INTERNAL',
          'The shell token is configured but could not be resolved; refusing the request.',
        );
      }
      const presented = headerValue(request.headers, SHELL_TOKEN_HEADER);
      if (presented === null || !constantTimeEquals(presented, expected)) {
        throw new AppError('UNAUTHENTICATED', 'Missing or invalid shell token.');
      }
    },
  };
}
