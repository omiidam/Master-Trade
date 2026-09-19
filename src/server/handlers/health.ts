/**
 * Health endpoints.
 *
 * Liveness: process-level only, no dependency calls, no protected data.
 * Readiness: per-dependency state, aggregated. What a caller may *see* depends on
 * who they are — the anonymous response is a coarse summary, an authenticated
 * caller gets per-check detail, and only an owner sees the effective
 * configuration (which is redacted, but still describes the deployment).
 *
 * A critical failure returns 503 with `PROVIDER_UNAVAILABLE` naming the failed
 * checks: a not-ready process must not look healthy to a supervisor.
 */

import type { AppConfig } from '../../core/config.js';
import { AppError } from '../../core/errors.js';
import { describeConfig, type ConfigSummary } from '../../config/loader.js';
import type { RouteHandler } from '../context.js';
import type { HealthRegistry, HealthStatus } from '../health.js';

export interface LivenessResponse {
  status: 'ok';
  version: string;
  uptimeMs: number;
  checks: number;
}

export interface ReadinessCheckView {
  name: string;
  status: HealthStatus;
  critical?: boolean;
  detail?: string;
}

export interface ReadinessResponse {
  overall: HealthStatus;
  checkedAt: string;
  durationMs: number;
  checks: ReadinessCheckView[];
  config?: ConfigSummary;
}

export function healthHandler(
  health: HealthRegistry,
  config: AppConfig,
): RouteHandler<undefined, LivenessResponse> {
  return () => {
    const liveness = health.liveness();
    return {
      data: {
        status: liveness.status,
        version: config.version,
        uptimeMs: liveness.uptimeMs,
        checks: liveness.checks,
      },
    };
  };
}

export function readinessHandler(
  health: HealthRegistry,
  config: AppConfig,
): RouteHandler<undefined, ReadinessResponse> {
  return async ({ context }) => {
    const report = await health.readiness();
    const principal = context.principal;
    const isOwner = principal?.roles.includes('owner') ?? false;

    if (report.overall === 'fail') {
      const failed = report.checks.filter((item) => item.critical && item.status === 'fail');
      throw new AppError('PROVIDER_UNAVAILABLE', 'Not ready: a critical check failed.', {
        details: { failed: failed.map((item) => item.name) },
      });
    }

    const checks: ReadinessCheckView[] = report.checks.map((item) =>
      principal === null
        ? { name: item.name, status: item.status }
        : {
            name: item.name,
            status: item.status,
            critical: item.critical,
            ...(item.detail === undefined ? {} : { detail: item.detail }),
          },
    );

    const data: ReadinessResponse = {
      overall: report.overall,
      checkedAt: report.checkedAt,
      durationMs: report.durationMs,
      checks,
    };
    if (isOwner) data.config = describeConfig(config);
    return { data };
  };
}
