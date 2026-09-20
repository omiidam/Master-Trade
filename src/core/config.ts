/**
 * Application configuration.
 *
 * One typed configuration object describes every layer of the system. Secrets
 * are never stored in configuration: they are referenced by name (`SecretRef`)
 * and resolved from the OS keychain / environment at the point of use, so a
 * config object can be logged, exported and committed without leaking keys.
 */

import type { OperatingMode, SafetyProfile } from '../types.js';
import { DEFAULT_SAFETY_PROFILE } from '../types.js';
import { PolicyViolationError } from './errors.js';
import type { LogLevel } from './logging.js';
import type { LlmProviderId } from '../llm/provider.js';
import type { DataProvenance } from '../marketdata/provider.js';
import { DEFAULT_RETRY_POLICY, type RetryPolicy } from './retry.js';

/** A pointer to a secret, never the secret itself. */
export interface SecretRef {
  kind: 'env' | 'keychain';
  name: string;
}

export const secretFromEnv = (name: string): SecretRef => ({ kind: 'env', name });
export const secretFromKeychain = (name: string): SecretRef => ({ kind: 'keychain', name });

export interface ApiConfig {
  version: 'v1';
  host: string;
  port: number;
  requestTimeoutMs: number;
  maxBodyBytes: number;
  /**
   * Per-launch token the desktop shell injects into its own requests, so another
   * local process cannot talk to the API (DEC-DESKTOP-2-SECURITY).
   */
  shellToken: SecretRef | null;
  /** Requests from outside the loopback interface are refused. Not a setting. */
  enforceLoopback: true;
}

export interface LlmEndpointConfig {
  provider: LlmProviderId;
  model: string;
  secret: SecretRef | null;
  maxTokensPerRequest: number;
}

export interface AiConfig {
  primary: LlmEndpointConfig;
  fallbacks: LlmEndpointConfig[];
  requestTimeoutMs: number;
  maxRetries: number;
  retry: RetryPolicy;
  monthlyBudgetUsd: number;
  /** Tool execution is owned by the orchestrator; the LLM only requests it. */
  allowModelDirectToolExecution: false;
}

export interface DatabaseConfig {
  engine: 'sqlite';
  file: string;
  migrationsDir: string;
  /** Retention for transient data (job scratch, streaming buffers). */
  transientTtlHours: number;
}

export interface StorageConfig {
  root: string;
  /** Remote object storage is deferred; local-only in this phase. */
  remoteEnabled: false;
  maxTotalBytes: number;
  /** Sensitive files require an explicit policy decision. */
  allowSensitiveFiles: false;
}

export interface JobsConfig {
  concurrency: number;
  pollIntervalMs: number;
  retry: RetryPolicy;
}

export interface RealtimeConfig {
  path: string;
  heartbeatMs: number;
  replayBufferSize: number;
}

export interface MarketDataConfig {
  /** Only synthetic and historical data exist in this phase; never 'live'. */
  allowedProvenance: DataProvenance[];
  maxBarsPerRequest: number;
  requestTimeoutMs: number;
}

export interface VectorMemoryConfig {
  embeddingProvider: string;
  embeddingModel: string;
  dimensions: number;
  topK: number;
  minScore: number;
}

export interface ObservabilityConfig {
  level: LogLevel;
  /** Redaction is a hard invariant, not a preference. */
  redactSecrets: true;
  auditRetentionDays: number;
}

export interface AuthConfig {
  sessionTtlMinutes: number;
  /** Sensitive operations always require human approval. */
  requireApprovalForSensitiveOps: true;
  allowAnonymousLocalLogin: boolean;
}

export interface AppConfig {
  appName: string;
  version: string;
  mode: OperatingMode;
  api: ApiConfig;
  ai: AiConfig;
  database: DatabaseConfig;
  storage: StorageConfig;
  jobs: JobsConfig;
  realtime: RealtimeConfig;
  marketData: MarketDataConfig;
  vectorMemory: VectorMemoryConfig;
  observability: ObservabilityConfig;
  auth: AuthConfig;
  safety: SafetyProfile;
}

export const DEFAULT_CONFIG: AppConfig = {
  appName: 'master-trade',
  /** Keep in step with package.json: the health endpoint reports this. */
  version: '0.6.0',
  mode: 'training',
  api: {
    version: 'v1',
    host: '127.0.0.1',
    port: 4317,
    requestTimeoutMs: 30_000,
    maxBodyBytes: 2_000_000,
    shellToken: null,
    enforceLoopback: true,
  },
  ai: {
    primary: {
      provider: 'scripted',
      model: 'scripted-v1',
      secret: null,
      maxTokensPerRequest: 2048,
    },
    fallbacks: [],
    requestTimeoutMs: 30_000,
    maxRetries: 2,
    retry: DEFAULT_RETRY_POLICY,
    monthlyBudgetUsd: 25,
    allowModelDirectToolExecution: false,
  },
  database: {
    engine: 'sqlite',
    file: 'data/master-trade.db',
    migrationsDir: 'migrations',
    transientTtlHours: 48,
  },
  storage: {
    root: 'data/files',
    remoteEnabled: false,
    maxTotalBytes: 512 * 1024 * 1024,
    allowSensitiveFiles: false,
  },
  jobs: {
    concurrency: 2,
    pollIntervalMs: 500,
    retry: DEFAULT_RETRY_POLICY,
  },
  realtime: { path: '/ws', heartbeatMs: 15_000, replayBufferSize: 500 },
  marketData: {
    allowedProvenance: ['synthetic', 'historical'],
    maxBarsPerRequest: 5_000,
    requestTimeoutMs: 15_000,
  },
  vectorMemory: {
    embeddingProvider: 'local-hash',
    embeddingModel: 'hash-32',
    dimensions: 32,
    topK: 8,
    minScore: 0.1,
  },
  observability: { level: 'info', redactSecrets: true, auditRetentionDays: 365 },
  auth: {
    sessionTtlMinutes: 480,
    requireApprovalForSensitiveOps: true,
    allowAnonymousLocalLogin: false,
  },
  safety: DEFAULT_SAFETY_PROFILE,
};

export type ConfigOverrides = { [K in keyof AppConfig]?: AppConfig[K] };

/** Merge overrides over the defaults, one section at a time. */
export function resolveConfig(overrides: ConfigOverrides = {}): AppConfig {
  const config: AppConfig = { ...DEFAULT_CONFIG, ...overrides };
  assertSafeConfig(config);
  return config;
}

/**
 * Structural safety checks. These mirror the permission model: if any layer
 * could reach live trading, execution, sensitive storage or unredacted logs,
 * the process refuses to start.
 */
/** Hosts the API may bind. Loopback-only is a guarantee, not a preference. */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set([
  '127.0.0.1',
  '::1',
  'localhost',
  '::ffff:127.0.0.1',
]);

export function assertSafeConfig(config: AppConfig): void {
  const violations: string[] = [];
  if (!LOOPBACK_HOSTS.has(config.api.host.trim().toLowerCase())) {
    violations.push(`api.host must be a loopback address (received ${config.api.host})`);
  }
  if (config.api.enforceLoopback !== true) {
    violations.push('api.enforceLoopback must be true');
  }
  if (config.safety.liveTradingEnabled) violations.push('safety.liveTradingEnabled must be false');
  if (config.safety.brokerExecutionEnabled) {
    violations.push('safety.brokerExecutionEnabled must be false');
  }
  if (config.storage.remoteEnabled) violations.push('storage.remoteEnabled must be false');
  if (config.storage.allowSensitiveFiles)
    violations.push('storage.allowSensitiveFiles must be false');
  if (config.marketData.allowedProvenance.includes('live')) {
    violations.push('marketData.allowedProvenance must not include live data');
  }
  if (config.observability.redactSecrets !== true) {
    violations.push('observability.redactSecrets must be true');
  }
  if (config.auth.requireApprovalForSensitiveOps !== true) {
    violations.push('auth.requireApprovalForSensitiveOps must be true');
  }
  if (config.ai.allowModelDirectToolExecution !== false) {
    violations.push('ai.allowModelDirectToolExecution must be false');
  }
  if (config.auth.sessionTtlMinutes <= 0) violations.push('auth.sessionTtlMinutes must be > 0');
  if (violations.length > 0) {
    throw new PolicyViolationError(`Unsafe configuration: ${violations.join('; ')}`, {
      violations,
    });
  }
}
