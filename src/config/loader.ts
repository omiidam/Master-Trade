/**
 * Configuration management.
 *
 * Precedence: code defaults (`DEFAULT_CONFIG`) < environment variables. There is
 * no config file yet — a TOML file can layer on later without changing callers,
 * because everything downstream receives a fully resolved `AppConfig`.
 *
 * Three rules make this a security boundary rather than a convenience:
 *   1. Unknown `MASTER_TRADE_*` variables are rejected, so a typo cannot silently
 *      leave an intention unapplied.
 *   2. Variables that could weaken safety (live trading, broker execution,
 *      sensitive files, non-loopback binding) are refused outright.
 *   3. Secrets are never read here. The loader stores a `SecretRef` naming the
 *      environment variable that holds the key; resolution happens at the point
 *      of use, so a config object can be logged or exported safely.
 */

import { z } from 'zod';
import { PolicyViolationError, AppError } from '../core/errors.js';
import {
  DEFAULT_CONFIG,
  resolveConfig,
  secretFromEnv,
  type AppConfig,
  type ConfigOverrides,
} from '../core/config.js';

export const ENV_PREFIX = 'MASTER_TRADE_';

/** Names recognised by the loader. Anything else with the prefix is an error. */
export const KNOWN_ENV_KEYS = [
  'MASTER_TRADE_API_HOST',
  'MASTER_TRADE_API_PORT',
  'MASTER_TRADE_LOG_LEVEL',
  'MASTER_TRADE_DB_FILE',
  'MASTER_TRADE_SESSION_TTL_MINUTES',
  'MASTER_TRADE_AUDIT_RETENTION_DAYS',
  'MASTER_TRADE_AI_PROVIDER',
  'MASTER_TRADE_AI_MODEL',
  'MASTER_TRADE_AI_MONTHLY_BUDGET_USD',
  'MASTER_TRADE_AI_KEY_ENV',
  'MASTER_TRADE_SHELL_TOKEN_ENV',
] as const;

/**
 * Environment variables that must never be able to switch a safety guarantee on.
 * Their presence with a truthy value aborts start-up: safety is not configurable.
 */
export const UNSAFE_ENV_KEYS = [
  'MASTER_TRADE_LIVE_TRADING',
  'MASTER_TRADE_BROKER_EXECUTION',
  'MASTER_TRADE_ALLOW_SENSITIVE_FILES',
  'MASTER_TRADE_ALLOW_ANONYMOUS_LOGIN',
  'MASTER_TRADE_ALLOW_MODEL_TOOL_EXECUTION',
  'MASTER_TRADE_REDACT_SECRETS',
] as const;

const FALSY = new Set(['', '0', 'false', 'no', 'off', 'null', 'undefined']);

/**
 * Unsafe keys are *recognised* so that a falsy value is a no-op rather than an
 * "unknown variable" error, and so the schema cannot drift from the refusal
 * list: `satisfies` fails to compile if a key is added to one without the other.
 * A truthy value never reaches this schema — `unsafeEnvFlags` aborts first.
 */
function disabledOnlyFlag(key: string) {
  return z
    .string()
    .optional()
    .refine((value) => value === undefined || FALSY.has(value.trim().toLowerCase()), {
      message: `${key} must be disabled; safety guarantees are code, not settings.`,
    });
}

const unsafeFlagKeys = {
  MASTER_TRADE_LIVE_TRADING: disabledOnlyFlag('MASTER_TRADE_LIVE_TRADING'),
  MASTER_TRADE_BROKER_EXECUTION: disabledOnlyFlag('MASTER_TRADE_BROKER_EXECUTION'),
  MASTER_TRADE_ALLOW_SENSITIVE_FILES: disabledOnlyFlag('MASTER_TRADE_ALLOW_SENSITIVE_FILES'),
  MASTER_TRADE_ALLOW_ANONYMOUS_LOGIN: disabledOnlyFlag('MASTER_TRADE_ALLOW_ANONYMOUS_LOGIN'),
  MASTER_TRADE_ALLOW_MODEL_TOOL_EXECUTION: disabledOnlyFlag(
    'MASTER_TRADE_ALLOW_MODEL_TOOL_EXECUTION',
  ),
  MASTER_TRADE_REDACT_SECRETS: disabledOnlyFlag('MASTER_TRADE_REDACT_SECRETS'),
} satisfies Record<(typeof UNSAFE_ENV_KEYS)[number], z.ZodTypeAny>;

/** Names in `UNSAFE_ENV_KEYS` that are set to something truthy. */
export function unsafeEnvFlags(env: NodeJS.ProcessEnv = process.env): string[] {
  return UNSAFE_ENV_KEYS.filter((key) => {
    const value = env[key];
    return value !== undefined && !FALSY.has(value.trim().toLowerCase());
  });
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost', '::ffff:127.0.0.1']);

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host.trim().toLowerCase());
}

/** Programmatic env overrides are also refused when they try to bind publicly. */
export function assertLoopbackHost(host: string): void {
  if (!isLoopbackHost(host)) {
    throw new PolicyViolationError(
      `Refusing to bind ${host}: the API is loopback-only by design (see ADR-0001 / DEC-DESKTOP-2-SECURITY).`,
      { host },
    );
  }
}

const envSchema = z.strictObject({
  MASTER_TRADE_API_HOST: z.string().min(1).max(255).optional(),
  MASTER_TRADE_API_PORT: z.coerce.number().int().min(1).max(65_535).optional(),
  MASTER_TRADE_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),
  MASTER_TRADE_DB_FILE: z.string().min(1).max(1_024).optional(),
  MASTER_TRADE_SESSION_TTL_MINUTES: z.coerce.number().int().min(1).max(43_200).optional(),
  MASTER_TRADE_AUDIT_RETENTION_DAYS: z.coerce.number().int().min(1).max(3_650).optional(),
  MASTER_TRADE_AI_PROVIDER: z
    .enum(['scripted', 'openai', 'anthropic', 'local-openai-compatible'])
    .optional(),
  MASTER_TRADE_AI_MODEL: z.string().min(1).max(128).optional(),
  MASTER_TRADE_AI_MONTHLY_BUDGET_USD: z.coerce.number().min(0).max(100_000).optional(),
  MASTER_TRADE_AI_KEY_ENV: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]{2,63}$/, 'must be an environment variable name')
    .optional(),
  MASTER_TRADE_SHELL_TOKEN_ENV: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]{2,63}$/, 'must be an environment variable name')
    .optional(),
  ...unsafeFlagKeys,
});

export interface ConfigSummary {
  appName: string;
  version: string;
  mode: string;
  api: { version: string; host: string; port: number; maxBodyBytes: number };
  ai: {
    provider: string;
    model: string;
    fallbacks: number;
    monthlyBudgetUsd: number;
    keyRef: string | null;
    allowModelDirectToolExecution: false;
  };
  database: { engine: string; file: string };
  storage: { root: string; remoteEnabled: false };
  observability: { level: string; redactSecrets: true; auditRetentionDays: number };
  auth: { sessionTtlMinutes: number; requireApprovalForSensitiveOps: true };
  realtime: { path: string };
  jobs: { concurrency: number };
  marketData: { allowedProvenance: readonly string[] };
  safety: { mode: string; liveTradingEnabled: false; brokerExecutionEnabled: false };
  shellToken: { configured: boolean; ref: string | null };
}

/**
 * Resolve configuration from environment variables, then run the structural
 * safety checks. Throws rather than degrading: a boot with a half-applied
 * configuration is worse than a boot that refuses.
 */
export function loadConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const unsafe = unsafeEnvFlags(env);
  if (unsafe.length > 0) {
    throw new PolicyViolationError(
      `Refusing to start: ${unsafe.join(', ')} cannot be enabled by configuration. ` +
        'Safety guarantees are code, not settings.',
      { variables: unsafe },
    );
  }

  const prefixed: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith(ENV_PREFIX) && value !== undefined) prefixed[key] = value;
  }

  const parsed = envSchema.safeParse(prefixed);
  if (!parsed.success) {
    throw new AppError(
      'VALIDATION_FAILED',
      `Invalid configuration: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'config'}: ${issue.message}`)
        .join('; ')}`,
      { details: { knownKeys: KNOWN_ENV_KEYS } },
    );
  }
  const values = parsed.data;

  const api = { ...DEFAULT_CONFIG.api };
  if (values.MASTER_TRADE_API_HOST !== undefined) api.host = values.MASTER_TRADE_API_HOST;
  if (values.MASTER_TRADE_API_PORT !== undefined) api.port = values.MASTER_TRADE_API_PORT;
  if (values.MASTER_TRADE_SHELL_TOKEN_ENV !== undefined) {
    api.shellToken = secretFromEnv(values.MASTER_TRADE_SHELL_TOKEN_ENV);
  }
  assertLoopbackHost(api.host);

  const ai = { ...DEFAULT_CONFIG.ai };
  if (values.MASTER_TRADE_AI_PROVIDER !== undefined) {
    ai.primary = { ...ai.primary, provider: values.MASTER_TRADE_AI_PROVIDER };
  }
  if (values.MASTER_TRADE_AI_MODEL !== undefined) {
    ai.primary = { ...ai.primary, model: values.MASTER_TRADE_AI_MODEL };
  }
  if (values.MASTER_TRADE_AI_KEY_ENV !== undefined) {
    ai.primary = { ...ai.primary, secret: secretFromEnv(values.MASTER_TRADE_AI_KEY_ENV) };
  }
  if (values.MASTER_TRADE_AI_MONTHLY_BUDGET_USD !== undefined) {
    ai.monthlyBudgetUsd = values.MASTER_TRADE_AI_MONTHLY_BUDGET_USD;
  }

  const database = { ...DEFAULT_CONFIG.database };
  if (values.MASTER_TRADE_DB_FILE !== undefined) database.file = values.MASTER_TRADE_DB_FILE;

  const observability = { ...DEFAULT_CONFIG.observability };
  if (values.MASTER_TRADE_LOG_LEVEL !== undefined) {
    observability.level = values.MASTER_TRADE_LOG_LEVEL;
  }
  if (values.MASTER_TRADE_AUDIT_RETENTION_DAYS !== undefined) {
    observability.auditRetentionDays = values.MASTER_TRADE_AUDIT_RETENTION_DAYS;
  }

  const auth = { ...DEFAULT_CONFIG.auth };
  if (values.MASTER_TRADE_SESSION_TTL_MINUTES !== undefined) {
    auth.sessionTtlMinutes = values.MASTER_TRADE_SESSION_TTL_MINUTES;
  }

  const overrides: ConfigOverrides = { api, ai, database, observability, auth };
  return resolveConfig(overrides);
}

/** Environment overrides applied on top of an existing configuration. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return loadConfigFromEnv(env);
}

/** Redacted description of the effective configuration, safe for logs and health. */
export function describeConfig(config: AppConfig): ConfigSummary {
  return {
    appName: config.appName,
    version: config.version,
    mode: config.mode,
    api: {
      version: config.api.version,
      host: config.api.host,
      port: config.api.port,
      maxBodyBytes: config.api.maxBodyBytes,
    },
    ai: {
      provider: config.ai.primary.provider,
      model: config.ai.primary.model,
      fallbacks: config.ai.fallbacks.length,
      monthlyBudgetUsd: config.ai.monthlyBudgetUsd,
      keyRef:
        config.ai.primary.secret === null
          ? null
          : `${config.ai.primary.secret.kind}:${config.ai.primary.secret.name}`,
      allowModelDirectToolExecution: false,
    },
    database: { engine: config.database.engine, file: config.database.file },
    storage: { root: config.storage.root, remoteEnabled: false },
    observability: {
      level: config.observability.level,
      redactSecrets: true,
      auditRetentionDays: config.observability.auditRetentionDays,
    },
    auth: {
      sessionTtlMinutes: config.auth.sessionTtlMinutes,
      requireApprovalForSensitiveOps: true,
    },
    realtime: { path: config.realtime.path },
    jobs: { concurrency: config.jobs.concurrency },
    marketData: { allowedProvenance: config.marketData.allowedProvenance },
    safety: {
      mode: config.safety.mode,
      liveTradingEnabled: false,
      brokerExecutionEnabled: false,
    },
    shellToken: {
      configured: config.api.shellToken !== null,
      ref:
        config.api.shellToken === null
          ? null
          : `${config.api.shellToken.kind}:${config.api.shellToken.name}`,
    },
  };
}

/**
 * Resolve a `SecretRef` at the point of use. The desktop shell substitutes a
 * keychain lookup here; the server uses the environment.
 */
export function resolveSecretFromEnv(
  ref: { kind: 'env' | 'keychain'; name: string } | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (!ref) return null;
  if (ref.kind === 'keychain') return null; // only the desktop shell can do this
  const value = env[ref.name];
  return value === undefined || value.length === 0 ? null : value;
}
