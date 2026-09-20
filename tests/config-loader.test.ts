import { describe, expect, it } from 'vitest';
import {
  KNOWN_ENV_KEYS,
  UNSAFE_ENV_KEYS,
  assertLoopbackHost,
  describeConfig,
  isLoopbackHost,
  loadConfigFromEnv,
  resolveSecretFromEnv,
  unsafeEnvFlags,
} from '../src/config/loader.js';
import { DEFAULT_CONFIG, resolveConfig } from '../src/core/config.js';
import { AppError, PolicyViolationError } from '../packages/shared/src/core/errors.js';

describe('configuration management', () => {
  it('resolves the documented defaults with an empty environment', () => {
    const config = loadConfigFromEnv({});
    expect(config.api.host).toBe('127.0.0.1');
    expect(config.api.port).toBe(4317);
    expect(config.api.shellToken).toBeNull();
    expect(config.ai.primary.provider).toBe('scripted');
    expect(config.observability.level).toBe('info');
    expect(config.database.engine).toBe('sqlite');
    // The safety guarantees survive configuration entirely.
    expect(config.safety.liveTradingEnabled).toBe(false);
    expect(config.safety.brokerExecutionEnabled).toBe(false);
    expect(config.observability.redactSecrets).toBe(true);
    expect(config.storage.remoteEnabled).toBe(false);
    expect(config.storage.allowSensitiveFiles).toBe(false);
    expect(config.ai.allowModelDirectToolExecution).toBe(false);
    expect(config.marketData.allowedProvenance).not.toContain('live');
  });

  it('applies environment overrides without reading any secret value', () => {
    const config = loadConfigFromEnv({
      MASTER_TRADE_API_HOST: 'localhost',
      MASTER_TRADE_API_PORT: '4321',
      MASTER_TRADE_LOG_LEVEL: 'debug',
      MASTER_TRADE_SESSION_TTL_MINUTES: '60',
      MASTER_TRADE_AI_PROVIDER: 'openai',
      MASTER_TRADE_AI_MODEL: 'gpt-test',
      MASTER_TRADE_AI_KEY_ENV: 'OPENAI_API_KEY',
      MASTER_TRADE_SHELL_TOKEN_ENV: 'MT_SHELL_TOKEN',
      OPENAI_API_KEY: 'sk-not-read-by-the-loader',
    });
    expect(config.api.host).toBe('localhost');
    expect(config.api.port).toBe(4321);
    expect(config.observability.level).toBe('debug');
    expect(config.auth.sessionTtlMinutes).toBe(60);
    expect(config.ai.primary.provider).toBe('openai');
    expect(config.ai.primary.model).toBe('gpt-test');
    expect(config.ai.primary.secret).toEqual({ kind: 'env', name: 'OPENAI_API_KEY' });
    expect(config.api.shellToken).toEqual({ kind: 'env', name: 'MT_SHELL_TOKEN' });
    // The value is never in the config object, only a reference to its name.
    expect(JSON.stringify(config)).not.toContain('sk-not-read-by-the-loader');
  });

  it('refuses safety flags no matter how they are spelled', () => {
    for (const key of UNSAFE_ENV_KEYS) {
      expect(() => loadConfigFromEnv({ [key]: '1' })).toThrow(PolicyViolationError);
      expect(() => loadConfigFromEnv({ [key]: 'true' })).toThrow(PolicyViolationError);
    }
    expect(unsafeEnvFlags({ MASTER_TRADE_LIVE_TRADING: '0' })).toEqual([]);
    expect(unsafeEnvFlags({ MASTER_TRADE_BROKER_EXECUTION: 'false' })).toEqual([]);
    expect(unsafeEnvFlags({ MASTER_TRADE_BROKER_EXECUTION: 'yes' })).toEqual([
      'MASTER_TRADE_BROKER_EXECUTION',
    ]);
    // A recognised-but-falsy unsafe flag is a no-op, not an "unknown variable"
    // error: the refusal path and the schema must agree about these names.
    for (const key of UNSAFE_ENV_KEYS) {
      const config = loadConfigFromEnv({ [key]: 'off' });
      expect(config.safety.liveTradingEnabled).toBe(false);
      expect(config.storage.allowSensitiveFiles).toBe(false);
      expect(config.observability.redactSecrets).toBe(true);
    }
  });

  it('rejects an unknown MASTER_TRADE_ variable instead of ignoring it', () => {
    try {
      loadConfigFromEnv({ MASTER_TRADE_NOPE: 'x' });
      throw new Error('expected a validation failure');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('VALIDATION_FAILED');
      expect((error as AppError).details?.knownKeys).toEqual([...KNOWN_ENV_KEYS]);
    }
  });

  it('rejects an out-of-range port and a non-loopback host', () => {
    expect(() => loadConfigFromEnv({ MASTER_TRADE_API_PORT: '70000' })).toThrow(/port/i);
    expect(() => loadConfigFromEnv({ MASTER_TRADE_API_HOST: '0.0.0.0' })).toThrow(
      PolicyViolationError,
    );
    expect(() => assertLoopbackHost('10.0.0.1')).toThrow(/loopback-only/i);
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('example.com')).toBe(false);
  });

  it('describes the configuration without ever describing a secret', () => {
    const config = loadConfigFromEnv({
      MASTER_TRADE_AI_KEY_ENV: 'OPENAI_API_KEY',
      MASTER_TRADE_SHELL_TOKEN_ENV: 'MT_SHELL_TOKEN',
      OPENAI_API_KEY: 'sk-live-value-that-must-not-appear',
    });
    const summary = describeConfig(config);
    expect(summary.shellToken).toEqual({ configured: true, ref: 'env:MT_SHELL_TOKEN' });
    expect(summary.ai.keyRef).toBe('env:OPENAI_API_KEY');
    expect(summary.safety.liveTradingEnabled).toBe(false);
    expect(summary.safety.brokerExecutionEnabled).toBe(false);
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain('sk-live-value-that-must-not-appear');
    expect(serialized).not.toMatch(/sk-/);
  });

  it('resolves environment references only, and fails closed otherwise', () => {
    expect(resolveSecretFromEnv({ kind: 'env', name: 'MT_KEY' }, { MT_KEY: 'value' })).toBe(
      'value',
    );
    expect(resolveSecretFromEnv({ kind: 'env', name: 'MT_MISSING' }, {})).toBeNull();
    expect(resolveSecretFromEnv({ kind: 'env', name: 'MT_EMPTY' }, { MT_EMPTY: '' })).toBeNull();
    // A keychain reference is only resolvable by the desktop shell.
    expect(resolveSecretFromEnv({ kind: 'keychain', name: 'MASTER_TRADE_AI_KEY' }, {})).toBeNull();
    expect(resolveSecretFromEnv(null)).toBeNull();
  });

  it('still refuses to construct an unsafe config object programmatically', () => {
    expect(() => resolveConfig({ api: { ...DEFAULT_CONFIG.api, host: '0.0.0.0' } })).toThrow(
      PolicyViolationError,
    );
    // The type system refuses `true` for these literals, which is the first
    // guard; the cast exists only to reach the runtime guard underneath it.
    expect(() =>
      resolveConfig({ safety: { ...DEFAULT_CONFIG.safety, liveTradingEnabled: true } as never }),
    ).toThrow(/liveTradingEnabled/);
    expect(() =>
      resolveConfig({
        marketData: { ...DEFAULT_CONFIG.marketData, allowedProvenance: ['live'] },
      }),
    ).toThrow(/live data/);
    expect(() =>
      resolveConfig({
        auth: { ...DEFAULT_CONFIG.auth, requireApprovalForSensitiveOps: false } as never,
      }),
    ).toThrow(/requireApprovalForSensitiveOps/);
  });
});
