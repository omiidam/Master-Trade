/**
 * Health checks.
 *
 * Liveness answers "is the process serving?" and must never do work that can
 * fail for an unrelated reason. Readiness answers "can this process do its job?"
 * and reports per-dependency state.
 *
 * Two rules shape the design:
 *   - a **critical** check failing makes the process not-ready (503), because
 *     serving without the safety catalogue or a valid configuration is worse than
 *     not serving;
 *   - a non-critical check failing is reported as `degraded` (200): the honest
 *     state of a phase where persistence and providers are not wired yet.
 */

import { redactString } from '../core/logging.js';

export type HealthStatus = 'ok' | 'degraded' | 'fail';

export interface HealthResult {
  status: HealthStatus;
  detail?: string;
}

export interface HealthCheckResult extends HealthResult {
  name: string;
  critical: boolean;
  observedAt: string;
}

export interface HealthCheck {
  name: string;
  critical: boolean;
  run(): HealthResult | Promise<HealthResult>;
}

export interface ReadinessReport {
  overall: HealthStatus;
  checkedAt: string;
  durationMs: number;
  checks: HealthCheckResult[];
}

/** Helper so check definitions stay one-liners. */
export function check(
  name: string,
  critical: boolean,
  run: () => HealthResult | Promise<HealthResult>,
): HealthCheck {
  return { name, critical, run };
}

export function aggregate(checks: readonly HealthCheckResult[]): HealthStatus {
  if (checks.some((item) => item.critical && item.status === 'fail')) return 'fail';
  if (checks.some((item) => item.status !== 'ok')) return 'degraded';
  return 'ok';
}

export interface HealthRegistryOptions {
  now?: () => number;
  startedAt?: number;
}

export class HealthRegistry {
  private readonly checks: HealthCheck[] = [];
  private readonly now: () => number;
  private readonly startedAt: number;
  /** Last observed result per check, so liveness can be O(1). */
  private last: HealthCheckResult[] = [];

  constructor(checks: readonly HealthCheck[] = [], options: HealthRegistryOptions = {}) {
    this.checks.push(...checks);
    this.now = options.now ?? Date.now;
    this.startedAt = options.startedAt ?? this.now();
  }

  add(entry: HealthCheck): void {
    this.checks.push(entry);
  }

  list(): readonly string[] {
    return this.checks.map((entry) => entry.name);
  }

  /** Cheap: uptime and process identity only. */
  liveness(): { status: 'ok'; uptimeMs: number; checks: number } {
    return { status: 'ok', uptimeMs: this.now() - this.startedAt, checks: this.checks.length };
  }

  lastResults(): readonly HealthCheckResult[] {
    return this.last;
  }

  async readiness(): Promise<ReadinessReport> {
    const startedAt = this.now();
    const results: HealthCheckResult[] = [];
    for (const entry of this.checks) {
      const observedAt = new Date(this.now()).toISOString();
      try {
        const outcome = await entry.run();
        results.push({
          name: entry.name,
          critical: entry.critical,
          status: outcome.status,
          observedAt,
          ...(outcome.detail === undefined ? {} : { detail: redactString(outcome.detail) }),
        });
      } catch (error) {
        results.push({
          name: entry.name,
          critical: entry.critical,
          status: 'fail',
          observedAt,
          detail: `check threw: ${redactString((error as Error).message ?? 'unknown error')}`,
        });
      }
    }
    this.last = results;
    return {
      overall: aggregate(results),
      checkedAt: new Date(this.now()).toISOString(),
      durationMs: this.now() - startedAt,
      checks: results,
    };
  }
}
