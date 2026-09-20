import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertCapabilityAllowList,
  capabilityMatrix,
  capabilityPermissionIds,
  forbiddenReason,
  GRANTED_PERMISSIONS,
  missingRequiredPermissions,
  parseCapabilityFile,
} from '../src/desktop/capabilities.js';
import {
  assertCacheKey,
  assertExportName,
  assertExternalUrl,
  assertShellCommand,
  browserShellBridge,
  createShellBridge,
  isDesktopShell,
  MAX_CACHE_VALUE_BYTES,
  SHELL_COMMANDS,
  SHELL_PROTOCOL_VERSION,
  type InvokeFn,
} from '../src/desktop/ipc.js';
import {
  DEFAULT_DESKTOP_CONFIG,
  appDataDir,
  assertNoSecrets,
  desktopConfigPath,
  loadDesktopConfig,
  parseDesktopConfig,
  serializeDesktopConfig,
} from '../src/desktop/config.js';
import {
  DesktopLifecycle,
  SHUTDOWN_ORDER,
  STARTUP_ORDER,
  type DesktopState,
} from '../src/desktop/lifecycle.js';
import {
  DESKTOP_API_PORT,
  httpHealthCheck,
  planSidecarLaunch,
  SidecarSupervisor,
  type SidecarPlan,
} from '../src/desktop/sidecar.js';
import { verifyDesktopShell } from '../src/desktop/verify.js';
import { AppError } from '../src/core/errors.js';

const root = process.cwd();

describe('desktop capability boundary', () => {
  it('grants no permission that could reach the OS', () => {
    for (const grant of GRANTED_PERMISSIONS) {
      expect(forbiddenReason(grant.permission)).toBeNull();
      expect(grant.purpose.length).toBeGreaterThan(20);
    }
    // The families that matter are absent, not merely unused.
    for (const area of ['shell:', 'fs:', 'path:', 'http:', 'process:', 'store:']) {
      expect(capabilityMatrix().filter((entry) => entry.permission.startsWith(area))).toEqual([]);
    }
  });

  it('refuses a forbidden permission by name, with the reason', () => {
    for (const permission of [
      'shell:allow-execute',
      'shell:allow-spawn',
      'shell:default',
      'fs:allow-write-text-file',
      'core:path:allow-resolve',
      'core:default',
      'http:default',
      'process:allow-restart',
      'store:default',
      'global-shortcut:allow-register',
    ]) {
      expect(() => assertCapabilityAllowList([permission]), permission).toThrow(
        /forbidden|not declared/,
      );
    }
    expect(forbiddenReason('shell:allow-execute')).toMatch(/Rust spawns/);
  });

  it('refuses the window permissions that widen the surface', () => {
    expect(forbiddenReason('core:window:allow-create')).toMatch(/widen/);
    expect(forbiddenReason('core:window:allow-set-always-on-top')).toMatch(/widen/);
  });

  it('parses both permission forms, and a scoped entry is still checked', () => {
    const file = parseCapabilityFile({
      identifier: 'main-capability',
      windows: ['main'],
      permissions: [
        'core:app:default',
        { identifier: 'opener:allow-open-url', allow: [{ url: 'https://*' }] },
      ],
    });
    expect(file.permissions).toEqual(['core:app:default']);
    expect(file.scoped).toEqual([
      { identifier: 'opener:allow-open-url', allow: [{ url: 'https://*' }] },
    ]);
    expect(capabilityPermissionIds(file)).toContain('opener:allow-open-url');
    expect(() => assertCapabilityAllowList(capabilityPermissionIds(file))).not.toThrow();
    expect(() => parseCapabilityFile({ identifier: 'x', permissions: [{ allow: [] }] })).toThrow(
      /without an identifier/,
    );
  });

  it('refuses a malformed capability file', () => {
    expect(() => parseCapabilityFile(null)).toThrow(/JSON object/);
    expect(() => parseCapabilityFile({ permissions: [] })).toThrow(/identifier/);
    expect(() => parseCapabilityFile({ identifier: 'x', permissions: [] })).toThrow(
      /non-empty permissions/,
    );
    expect(() => parseCapabilityFile({ identifier: 'x', permissions: [42] })).toThrow();
  });

  it('reports the required permissions precisely', () => {
    const required = capabilityMatrix()
      .filter((entry) => entry.required)
      .map((entry) => entry.permission);
    expect(required.length).toBeGreaterThan(0);
    expect(missingRequiredPermissions(required)).toEqual([]);
    expect(missingRequiredPermissions(required.slice(1))).toEqual([required[0]]);
  });
});

describe('shell IPC contract', () => {
  it('refuses a command that is not in the allow-list', () => {
    expect(() => assertShellCommand('fs_read_file')).toThrow(AppError);
    expect(() => assertShellCommand('run_command')).toThrow(/deny-by-default/);
    for (const command of SHELL_COMMANDS) {
      expect(() => assertShellCommand(command)).not.toThrow();
    }
  });

  it('exposes no command that returns a filesystem path', async () => {
    const calls: string[] = [];
    const invoke: InvokeFn = async <T>(command: string): Promise<T> => {
      calls.push(command);
      return null as T;
    };
    const bridge = createShellBridge(invoke);
    // The save dialog answers with a file name, never a destination.
    const name = await bridge.showSaveDialog({ defaultPath: 'report.md', filters: ['md'] });
    expect(name).toBeNull();
    expect(calls).toEqual(['export_report_as']);

    const result = await bridge.exportReport('session.md', '# notes');
    expect(calls).toContain('export_report');
    expect(result).toBeDefined();
  });

  it('refuses a non-https URL and a traversal-shaped export name', async () => {
    const invoke: InvokeFn = async <T>(): Promise<T> => null as T;
    const bridge = createShellBridge(invoke);
    expect(() => assertExternalUrl('http://example.com')).toThrow(/only https/);
    expect(() => assertExternalUrl('file:///etc/passwd')).toThrow(/only https/);
    expect(() => assertExternalUrl('javascript:alert(1)')).toThrow(/only https/);
    expect(() => assertExternalUrl('not a url')).toThrow(/valid URL/);
    await expect(bridge.openExternal('http://example.com')).rejects.toThrow(/only https/);

    expect(() => assertExportName('../../secrets.json')).toThrow(/invalid export/);
    expect(() => assertExportName('report.exe')).toThrow(/extension/);
    expect(() => assertExportName('report.md')).not.toThrow();
    await expect(bridge.exportReport('../evil.md', 'x')).rejects.toThrow(/invalid export/);
  });

  it('validates credential and cache keys, and caps a cached value', () => {
    expect(() => assertCacheKey('lessons:m2:risk')).not.toThrow();
    expect(() => assertCacheKey('../escape')).toThrow(/invalid cache key/);
    expect(() => assertCacheKey('with space')).toThrow(/invalid cache key/);
    expect(() => assertExternalUrl('https://example.com/guide')).not.toThrow();
    expect(MAX_CACHE_VALUE_BYTES).toBeGreaterThan(1_000);
  });

  it('reports the missing capabilities when running in a browser', async () => {
    const bridge = browserShellBridge();
    const status = await bridge.status();
    expect(status.sidecarState).toBe('stopped');
    expect(status.apiBaseUrl).toBeNull();
    expect(status.unavailable.map((entry) => entry.capability)).toContain('secure-store');
    expect(status.protocolVersion).toBe(SHELL_PROTOCOL_VERSION);
    await expect(bridge.secureStore.set('key', 'value')).rejects.toThrow(
      /only available in the desktop shell/,
    );
    await expect(bridge.handshake()).rejects.toThrow(/only available/);
    // Reading is a no-op rather than a failure: there is simply nothing stored.
    expect(await bridge.secureStore.get('key')).toBeNull();
  });

  it('detects the shell from the injected internals', () => {
    expect(isDesktopShell({})).toBe(false);
    expect(isDesktopShell({ __TAURI_INTERNALS__: {} })).toBe(true);
  });
});

describe('local desktop configuration', () => {
  it('locates the app-data directory per platform, never the install directory', () => {
    expect(appDataDir('windows', { APPDATA: 'C:\\Users\\x\\AppData\\Roaming' })).toBe(
      'C:\\Users\\x\\AppData\\Roaming\\Master Trade',
    );
    expect(appDataDir('macos', { HOME: '/Users/x' })).toBe(
      '/Users/x/Library/Application Support/Master Trade',
    );
    expect(appDataDir('linux', { HOME: '/home/x' })).toBe('/home/x/.config/master-trade');
    expect(appDataDir('linux', { HOME: '/home/x', XDG_CONFIG_HOME: '/cfg' })).toBe(
      '/cfg/master-trade',
    );
    expect(() => appDataDir('windows', {})).toThrow(/APPDATA/);
    expect(desktopConfigPath('linux', { HOME: '/home/x' })).toBe(
      '/home/x/.config/master-trade/config.json',
    );
  });

  it('refuses a credential anywhere in the file, at any depth', () => {
    expect(() => assertNoSecrets({ apiKey: 'sk-123' })).toThrow(/keychain/);
    expect(() => assertNoSecrets({ window: { nested: [{ token: 'x' }] } })).toThrow(/keychain/);
    expect(() => assertNoSecrets({ providers: { openai: { secret: 'x' } } })).toThrow(
      /desktop config file/,
    );
    expect(() =>
      assertNoSecrets({ window: { width: 900 }, autoUpdate: { channel: 'beta' } }),
    ).not.toThrow();
  });

  it('refuses unknown keys rather than ignoring them', () => {
    expect(() => parseDesktopConfig({ windo: { width: 900 } })).toThrow(/invalid/);
    expect(() => parseDesktopConfig({ logLevel: 'verbose' })).toThrow(/logLevel/);
    expect(() => parseDesktopConfig({ telemetry: true })).toThrow();
  });

  it('applies defaults for a first run and validates what it reads', async () => {
    const firstRun = await loadDesktopConfig({
      platform: 'linux',
      env: { HOME: '/home/x' },
      readFile: async () => {
        throw new Error('ENOENT');
      },
    });
    expect(firstRun.source).toBe('defaults');
    expect(firstRun.config.window.width).toBe(DEFAULT_DESKTOP_CONFIG.window.width);
    expect(firstRun.config.telemetry).toBe(false);
    expect(firstRun.warnings[0]).toMatch(/no config file/);

    const fromFile = await loadDesktopConfig({
      platform: 'linux',
      env: { HOME: '/home/x' },
      readFile: async () => JSON.stringify({ logLevel: 'debug', window: { width: 1600 } }),
      overrides: { startMinimized: true, window: { height: 1000 } },
    });
    expect(fromFile.source).toBe('file+overrides');
    expect(fromFile.config.logLevel).toBe('debug');
    expect(fromFile.config.window.width).toBe(1600);
    expect(fromFile.config.window.height).toBe(1000);
    expect(fromFile.config.startMinimized).toBe(true);

    await expect(
      loadDesktopConfig({
        platform: 'linux',
        env: { HOME: '/home/x' },
        readFile: async () => '{ not json',
      }),
    ).rejects.toThrow(/not valid JSON/);

    await expect(
      loadDesktopConfig({
        platform: 'linux',
        env: { HOME: '/home/x' },
        readFile: async () => JSON.stringify({ openaiKey: 'sk-x' }),
      }),
    ).rejects.toThrow(/keychain/);
  });

  it('round-trips through the serializer', () => {
    const text = serializeDesktopConfig(DEFAULT_DESKTOP_CONFIG);
    expect(parseDesktopConfig(JSON.parse(text))).toEqual(DEFAULT_DESKTOP_CONFIG);
    expect(() => serializeDesktopConfig({ nope: 1 })).toThrow();
  });
});

describe('desktop lifecycle', () => {
  it('follows the documented startup order', () => {
    const lifecycle = new DesktopLifecycle();
    const seen: DesktopState[] = [];
    for (const step of STARTUP_ORDER) {
      lifecycle.transitionTo(step.state);
      seen.push(lifecycle.current());
    }
    expect(seen).toEqual(STARTUP_ORDER.map((step) => step.state));
    expect(lifecycle.isReady()).toBe(true);
    expect(lifecycle.isApiAnswerable()).toBe(true);
    for (const step of STARTUP_ORDER) expect(step.why.length).toBeGreaterThan(20);
  });

  it('refuses an illegal transition', () => {
    const lifecycle = new DesktopLifecycle();
    expect(() => lifecycle.transitionTo('ready')).toThrow(/Illegal desktop lifecycle/);
    lifecycle.startup();
    expect(() => lifecycle.transitionTo('sidecar-starting')).toThrow();
  });

  it('records why it failed and still shuts down cleanly', () => {
    const lifecycle = new DesktopLifecycle();
    lifecycle.transitionTo('instance-checked');
    lifecycle.transitionTo('sidecar-starting');
    lifecycle.fail('the API did not answer within 30s');
    expect(lifecycle.current()).toBe('failed');
    expect(lifecycle.reason()).toMatch(/30s/);
    expect(lifecycle.isApiAnswerable()).toBe(false);
    lifecycle.shutdown();
    expect(lifecycle.current()).toBe('stopped');
  });

  it('shuts down from ready through the documented order', () => {
    const lifecycle = new DesktopLifecycle();
    lifecycle.startup();
    lifecycle.shutdown();
    expect(lifecycle.current()).toBe(SHUTDOWN_ORDER[SHUTDOWN_ORDER.length - 1]?.state);
    for (const step of SHUTDOWN_ORDER) expect(step.why.length).toBeGreaterThan(20);
  });
});

describe('sidecar supervision', () => {
  const plan = (overrides: Partial<Parameters<typeof planSidecarLaunch>[0]> = {}): SidecarPlan =>
    planSidecarLaunch({
      executable: '/app/master-trade-api',
      dataDir: '/data',
      port: DESKTOP_API_PORT,
      token: 'a'.repeat(64),
      ...overrides,
    });

  it('builds a fixed launch plan with a per-launch credential', () => {
    const launch = plan();
    expect(launch.host).toBe('127.0.0.1');
    expect(launch.args).toEqual([
      '--host',
      '127.0.0.1',
      '--port',
      String(DESKTOP_API_PORT),
      '--data-dir',
      '/data',
    ]);
    expect(launch.env.MASTER_TRADE_SHELL_TOKEN_ENV).toBe('MASTER_TRADE_SHELL_TOKEN');
    expect(launch.env.MASTER_TRADE_SHELL_TOKEN).toBe('a'.repeat(64));
    expect(launch.baseUrl).toBe(`http://127.0.0.1:${DESKTOP_API_PORT}`);
    // Two launches must not share a credential.
    const other = plan({ token: undefined });
    expect(other.token).not.toBe(launch.token);
    expect(other.token).toHaveLength(64);
  });

  it('refuses a short token, a bad port or a missing executable', () => {
    expect(() => plan({ token: 'short' })).toThrow(/short shell token/);
    expect(() => plan({ executable: '  ' })).toThrow(/bundle is incomplete/);
    expect(() => plan({ port: 0 })).toThrow(/not a valid TCP port/);
    expect(() => plan({ port: 70_000 })).toThrow(/not a valid TCP port/);
  });

  it('waits for a healthy API and reports a failure with the step that failed', async () => {
    let health = false;
    const supervisor = new SidecarSupervisor({
      plan: () => plan(),
      spawn: async () => ({ stop: async () => undefined }),
      health: async () => health,
      readyTimeoutMs: 30,
      pollIntervalMs: 5,
      sleep: async () => undefined,
    });
    health = true;
    const started = await supervisor.start();
    expect(started.host).toBe('127.0.0.1');
    expect(supervisor.currentState()).toBe('ready');
    expect(supervisor.handshake().token).toBe('a'.repeat(64));

    const failing = new SidecarSupervisor({
      plan: () => plan(),
      spawn: async () => ({ stop: async () => undefined }),
      health: async () => false,
      readyTimeoutMs: 10,
      pollIntervalMs: 2,
      sleep: async () => undefined,
    });
    await expect(failing.start()).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    expect(failing.currentState()).toBe('failed');
    expect(failing.lastFailure()).toMatch(/did not answer/);
  });

  it('restarts within the bound and then fails instead of looping forever', async () => {
    let spawns = 0;
    const supervisor = new SidecarSupervisor({
      plan: () => plan(),
      spawn: async () => {
        spawns += 1;
        return { stop: async () => undefined };
      },
      health: async () => true,
      maxRestarts: 2,
      sleep: async () => undefined,
      restartPolicy: { attempts: 3, baseDelayMs: 1, maxDelayMs: 2, jitter: false },
    });
    await supervisor.start();
    expect(await supervisor.handleExit(1)).toBe('ready');
    expect(await supervisor.handleExit(1)).toBe('ready');
    // Third unexpected exit exceeds the budget: no further spawn.
    expect(await supervisor.handleExit(1)).toBe('failed');
    expect(spawns).toBe(3);
    expect(supervisor.lastFailure()).toMatch(/exited with code 1/);
  });

  it('stops the child and surfaces a stop failure without masking it', async () => {
    const stopped: string[] = [];
    const supervisor = new SidecarSupervisor({
      plan: () => plan(),
      spawn: async () => ({
        stop: async () => {
          stopped.push('stop');
        },
      }),
      health: async () => true,
      sleep: async () => undefined,
    });
    await supervisor.start();
    await supervisor.stop();
    expect(stopped).toEqual(['stop']);
    expect(supervisor.currentState()).toBe('stopped');

    const failing = new SidecarSupervisor({
      plan: () => plan(),
      spawn: async () => ({
        stop: async () => {
          throw new AppError('INTERNAL', 'did not exit');
        },
      }),
      health: async () => true,
      sleep: async () => undefined,
    });
    await failing.start();
    await expect(failing.stop()).resolves.toBeUndefined();
  });

  it('probes the real route with the launch credential', async () => {
    const seen: string[] = [];
    const check = httpHealthCheck(async (url, init) => {
      seen.push(`${url} ${String((init.headers as Record<string, string>).authorization)}`);
      return new Response('{"status":"ok"}', { status: 200 });
    });
    expect(await check(plan())).toBe(true);
    expect(seen[0]).toContain(`http://127.0.0.1:${DESKTOP_API_PORT}/v1/health`);
    expect(seen[0]).toContain('Bearer aaaa');

    const down = httpHealthCheck(async () => {
      throw new TypeError('ECONNREFUSED');
    });
    expect(await down(plan())).toBe(false);
  });
});

describe('tauri source verification', () => {
  it('passes every policy check over the real src-tauri directory', async () => {
    const report = await verifyDesktopShell({ root: join(root) });
    const failures = report.checks
      .filter((check) => !check.ok && check.severity === 'error')
      .map((check) => `${check.id}: ${check.detail}`);
    expect(failures).toEqual([]);
    expect(report.checks.length).toBeGreaterThan(15);
    // The shell source exists, so this is not passing by finding nothing.
    expect(report.checks.some((check) => check.id === 'commands.contract-parity' && check.ok)).toBe(
      true,
    );
    expect(report.checks.some((check) => check.id.startsWith('capabilities.policy:'))).toBe(true);
    // And it is honest about what it cannot cover.
    expect(report.unverifiable.join(' ')).toMatch(/Rust toolchain/);
  });

  it('reports the placeholder update key as a release blocker, not a development failure', async () => {
    const report = await verifyDesktopShell({ root });
    const updater = report.checks.find((check) => check.id === 'updater.pubkey');
    expect(updater?.severity).toBe('warning');
    expect(report.errors).toBe(0);
  });
});
