/**
 * Phase 6.1 — the desktop foundation, tested as behaviour.
 *
 * Everything here is a real call into a real module. Nothing asserts that a file contains a
 * string, because none of these properties are about text: they are about which runtime a
 * page believes it is in, which state a screen is told to render, and whether a mode makes
 * an assurance stricter.
 *
 * The first suite is the one that would have caught a genuine defect. The shell contract
 * accepts the legacy `__TAURI__` global; the frontend bridge used to test only
 * `__TAURI_INTERNALS__`. A WebView exposing only the legacy global was therefore the shell to
 * one module and a browser to another. The fix was to give detection exactly one home
 * (`@shared/desktop/runtime`), and the test below asserts the two agree on every shape of
 * target — including by installing fake globals and asking the production code path directly.
 */

import { describe, expect, it } from 'vitest';
import {
  SHELL_COMMANDS,
  assertShellCommand,
  browserShellBridge,
  createShellBridge,
  isDesktopShell,
  type InvokeFn,
} from '../packages/shared/src/desktop/ipc.js';
import {
  RUNTIME_DESCRIPTION,
  currentRuntime,
  detectRuntime,
  isDesktopRuntime,
  type RuntimeTarget,
} from '../packages/shared/src/desktop/runtime.js';
import {
  desktopStartupState,
  isStartupPending,
  isStartupSettled,
} from '../packages/shared/src/desktop/startup.js';
import { inDesktopShell, shellBridge } from '../web/src/desktop/bridge.js';
import { DESKTOP_ENVIRONMENT_VAR, resolveDesktopEnvironment } from '../src/desktop/environment.js';
import { verifyDesktopShell } from '../src/desktop/verify.js';
import type { ShellStatus } from '../packages/shared/src/desktop/ipc.js';

/**
 * Run `body` with these globals installed, then put the scope back exactly as it was.
 *
 * Restoring matters: a leaked `window` would make every later test in the process believe it
 * is a browser page, which is the same class of bug this suite exists to catch.
 */
function withGlobals<T>(globals: Record<string, unknown>, body: () => T): T {
  const scope = globalThis as unknown as Record<string, unknown>;
  const saved = new Map<string, unknown>();
  for (const [key, value] of Object.entries(globals)) {
    saved.set(key, scope[key]);
    scope[key] = value;
  }
  try {
    return body();
  } finally {
    for (const [key, previous] of saved) {
      if (previous === undefined) delete scope[key];
      else scope[key] = previous;
    }
  }
}

/** A shell report that satisfies every required capability, unless overridden. */
function shellStatus(overrides: Partial<ShellStatus> = {}): ShellStatus {
  return {
    protocolVersion: 1,
    platform: 'windows',
    appVersion: '0.6.0-test',
    apiBaseUrl: 'http://127.0.0.1:4317',
    sidecarState: 'ready',
    capabilities: ['secure-store', 'file-dialog', 'offline-cache', 'single-instance'],
    unavailable: [],
    ...overrides,
  };
}

describe('the desktop runtime is detected in exactly one place', () => {
  const targets: Record<string, RuntimeTarget> = {
    nothing: {},
    internals: { __TAURI_INTERNALS__: {} },
    legacy: { __TAURI__: {} },
    both: { __TAURI_INTERNALS__: {}, __TAURI__: {} },
  };

  it('classifies every shape of target, and defaults to the web', () => {
    expect(detectRuntime(undefined)).toBe('web');
    expect(detectRuntime(null)).toBe('web');
    expect(detectRuntime({})).toBe('web');
    // The legacy global is a genuine shell: `withGlobalTauri` builds and older Tauri expose
    // it, and treating it as a browser would degrade a working app.
    expect(detectRuntime({ __TAURI__: {} })).toBe('desktop-tauri');
    expect(detectRuntime({ __TAURI_INTERNALS__: {} })).toBe('desktop-tauri');
    expect(detectRuntime({ __TAURI_INTERNALS__: {}, __TAURI__: {} })).toBe('desktop-tauri');
  });

  it('agrees with the shell contract on every target, which is the anti-drift assertion', () => {
    // Two modules used to answer this question with different predicates. If they ever
    // disagree again, this fails rather than a feature silently doing nothing.
    for (const [name, target] of Object.entries(targets)) {
      expect(isDesktopRuntime(target), name).toBe(isDesktopShell(target));
    }
  });

  it('reaches the same verdict through the frontend bridge, legacy global included', () => {
    // The bridge reads the ambient scope, so the only honest test installs one. This is the
    // case that was broken: legacy-only used to be `false` here and `true` in the contract.
    withGlobals({ window: globalThis, document: {}, __TAURI__: {} }, () => {
      expect(currentRuntime()).toBe('desktop-tauri');
      expect(inDesktopShell()).toBe(true);
      expect(isDesktopShell(globalThis as RuntimeTarget)).toBe(true);
    });

    withGlobals({ window: globalThis, document: {}, __TAURI_INTERNALS__: {} }, () => {
      expect(currentRuntime()).toBe('desktop-tauri');
      expect(inDesktopShell()).toBe(true);
    });

    // A page with neither global is a browser, and the bridge must say so.
    withGlobals({ window: globalThis, document: {} }, () => {
      expect(currentRuntime()).toBe('web');
      expect(inDesktopShell()).toBe(false);
    });
  });

  it('is the web on a server or in a test, because there is no document', () => {
    expect(currentRuntime()).toBe('web');
    expect(inDesktopShell()).toBe(false);
  });

  it('says what each runtime can do, so detection is not a bare boolean', () => {
    expect(RUNTIME_DESCRIPTION.web).toMatch(/browser/i);
    expect(RUNTIME_DESCRIPTION['desktop-tauri']).toMatch(/shell/i);
  });
});

describe('the shell command contract is deny-by-default', () => {
  it('is an exact allow-list, so a new command must be a deliberate edit', () => {
    // Pinned exactly rather than loosely: the point of a deny-by-default surface is that
    // widening it is visible in a diff, and this is the diff.
    expect([...SHELL_COMMANDS]).toEqual([
      'shell_status',
      'shell_handshake',
      'secure_store_set',
      'secure_store_get',
      'secure_store_delete',
      'cache_get',
      'cache_set',
      'cache_clear',
      'export_report',
      'export_report_as',
      'open_external',
      'window_hide',
      'app_quit',
    ]);
  });

  it('exposes no generic execution, filesystem or proxy command', () => {
    // The dangerous shape is not one command, it is a *family*: anything that runs what it
    // is given, reads a path it is given, or forwards a request it is given.
    const generic = /(exec|spawn|eval|bash|powershell|arbitrary|proxy|download|\bfs\b)/i;
    for (const command of SHELL_COMMANDS) {
      expect(generic.test(command), `${command} looks like a general-purpose capability`).toBe(
        false,
      );
    }
  });

  it('refuses an unknown command before it can reach the shell', () => {
    expect(() => assertShellCommand('shell_status')).not.toThrow();
    for (const name of ['exec', 'shell_run', 'read_file', 'http_get', 'secure_store_list']) {
      expect(() => assertShellCommand(name), name).toThrow(/deny-by-default|allow-list/i);
    }
  });

  it('validates arguments in the frontend, so a bug in a page cannot widen a command', async () => {
    const invoked: string[] = [];
    const invoke: InvokeFn = async <T>(command: string): Promise<T> => {
      invoked.push(command);
      return (command === 'shell_status' ? shellStatus() : null) as T;
    };
    const bridge = createShellBridge(invoke);

    // Every one of these is a malformed call that must be refused *before* the IPC boundary.
    await expect(bridge.secureStore.set('../../etc/passwd', 'x')).rejects.toThrow();
    await expect(bridge.secureStore.get('has spaces')).rejects.toThrow();
    await expect(bridge.cache.set('a/b', 'value', 60_000)).rejects.toThrow();
    await expect(bridge.cache.set('ok', 'x'.repeat(600 * 1024), 60_000)).rejects.toThrow();
    await expect(bridge.exportReport('../../escape.md', 'x')).rejects.toThrow();
    await expect(bridge.exportReport('report.exe', 'x')).rejects.toThrow();
    await expect(bridge.openExternal('http://example.com')).rejects.toThrow(/https/i);
    await expect(bridge.openExternal('file:///etc/passwd')).rejects.toThrow(/https/i);

    // Nothing crossed the boundary: validation happens in front of it, not behind it.
    expect(invoked).toEqual([]);
  });
});

describe('the startup state a screen renders', () => {
  it('never leaves a spinner up in a browser, because there is no shell to start', () => {
    const view = desktopStartupState({ runtime: 'web', status: null });
    expect(view.state).toBe('STOPPED');
    expect(view.reason).toMatch(/browser|desktop shell/i);
  });

  it('reports STARTING while the shell has not answered yet', () => {
    const view = desktopStartupState({ runtime: 'desktop-tauri', status: null });
    expect(view.state).toBe('STARTING');
    expect(isStartupPending(view.state)).toBe(true);
  });

  it('reports STARTING while the local API is coming up', () => {
    const view = desktopStartupState({
      runtime: 'desktop-tauri',
      status: shellStatus({ sidecarState: 'starting', apiBaseUrl: null }),
    });
    expect(view.state).toBe('STARTING');
  });

  it('reports READY with the API base URL once the shell is up', () => {
    const view = desktopStartupState({ runtime: 'desktop-tauri', status: shellStatus() });
    expect(view.state).toBe('READY');
    expect(view.reason).toBeNull();
    expect(view.apiBaseUrl).toBe('http://127.0.0.1:4317');
    expect(isStartupSettled(view.state)).toBe(true);
  });

  it('refuses to report READY when a required capability is missing', () => {
    // The rule from Phase 6.1 §12: readiness is not a claim an application may make on top
    // of a failed initialisation step.
    const view = desktopStartupState({
      runtime: 'desktop-tauri',
      status: shellStatus({
        capabilities: ['file-dialog', 'single-instance'],
        unavailable: [
          { capability: 'secure-store', reason: 'no OS keychain available' },
          { capability: 'offline-cache', reason: 'the cache directory is not writable' },
        ],
      }),
    });
    expect(view.state).toBe('ERROR');
    expect(view.missingCapabilities).toEqual(['secure-store', 'offline-cache']);
    expect(view.reason).toMatch(/secure-store/);
  });

  it('keeps an optional capability optional', () => {
    // `auto-update` is absent on a development build and that is not a failure.
    const view = desktopStartupState({
      runtime: 'desktop-tauri',
      status: shellStatus({
        unavailable: [{ capability: 'auto-update', reason: 'no update channel configured' }],
      }),
    });
    expect(view.state).toBe('READY');
    expect(view.missingCapabilities).toEqual([]);
  });

  it('reports ERROR with the shell’s own reason when the API failed', () => {
    const view = desktopStartupState({
      runtime: 'desktop-tauri',
      status: shellStatus({
        sidecarState: 'failed',
        apiBaseUrl: null,
        unavailable: [{ capability: 'offline-cache', reason: 'port 4317 was already in use' }],
      }),
    });
    expect(view.state).toBe('ERROR');
    expect(view.reason).toContain('port 4317 was already in use');
  });

  it('reports STOPPING when a quit has been requested', () => {
    const view = desktopStartupState({
      runtime: 'desktop-tauri',
      status: shellStatus(),
      stopping: true,
    });
    expect(view.state).toBe('STOPPING');
    expect(isStartupPending(view.state)).toBe(true);
  });

  it('does not let a shutdown hide a failure', () => {
    // A user asking to quit is not evidence that the app started.
    const view = desktopStartupState({
      runtime: 'desktop-tauri',
      status: shellStatus({ sidecarState: 'failed', apiBaseUrl: null }),
      stopping: true,
    });
    expect(view.state).toBe('ERROR');
  });

  it('reports STOPPED when the local API is not running', () => {
    const view = desktopStartupState({
      runtime: 'desktop-tauri',
      status: shellStatus({ sidecarState: 'stopped', apiBaseUrl: null }),
    });
    expect(view.state).toBe('STOPPED');
    expect(isStartupSettled(view.state)).toBe(true);
  });
});

describe('the desktop environment mode', () => {
  it('treats an undeclared environment as development, and says it was not declared', () => {
    const resolved = resolveDesktopEnvironment({});
    expect(resolved.environment).toBe('development');
    expect(resolved.declared).toBe(false);
    expect(resolved.violations).toEqual([]);
    expect(resolveDesktopEnvironment({ [DESKTOP_ENVIRONMENT_VAR]: '' }).declared).toBe(false);
  });

  it('accepts the three modes, case- and whitespace-insensitively', () => {
    for (const value of ['development', 'test', 'production']) {
      expect(resolveDesktopEnvironment({ [DESKTOP_ENVIRONMENT_VAR]: value }).environment).toBe(
        value,
      );
      expect(
        resolveDesktopEnvironment({ [DESKTOP_ENVIRONMENT_VAR]: `  ${value.toUpperCase()}  ` })
          .environment,
      ).toBe(value);
    }
  });

  it('refuses to guess an unrecognised value instead of coercing it', () => {
    // Guessing is how a development build ships as a release.
    for (const value of ['staging', 'prod', 'production ', '1']) {
      const resolved = resolveDesktopEnvironment({ [DESKTOP_ENVIRONMENT_VAR]: value });
      if (value.trim().toLowerCase() === 'production') continue;
      expect(resolved.environment).toBe('development');
      expect(resolved.declared).toBe(false);
      expect(resolved.violations.length).toBe(1);
      expect(resolved.violations[0]).toMatch(/not one of/i);
    }
  });
});

describe('the environment mode is load-bearing, not a label', () => {
  const root = process.cwd();

  it('treats a placeholder update key as a release blocker only in production', async () => {
    const development = await verifyDesktopShell({ root, env: {} });
    const devKey = development.checks.find((check) => check.id === 'updater.pubkey');
    expect(development.environment.environment).toBe('development');
    expect(devKey?.ok).toBe(false);
    expect(devKey?.severity).toBe('warning');
    expect(development.errors).toBe(0);

    const production = await verifyDesktopShell({
      root,
      env: { [DESKTOP_ENVIRONMENT_VAR]: 'production' },
    });
    const prodKey = production.checks.find((check) => check.id === 'updater.pubkey');
    expect(production.environment.environment).toBe('production');
    // The same fact, a different severity: a development build must not ship and a release
    // cannot exist. This is what makes the mode do something.
    expect(prodKey?.severity).toBe('error');
    expect(production.errors).toBeGreaterThan(0);
  });

  it('refuses a debug update endpoint in production', async () => {
    const production = await verifyDesktopShell({
      root,
      env: { [DESKTOP_ENVIRONMENT_VAR]: 'production' },
    });
    const endpoint = production.checks.find((check) => check.id === 'environment.update-endpoint');
    // The committed endpoint uses the reserved `.invalid` TLD, which can never resolve.
    expect(endpoint?.ok).toBe(false);
    expect(endpoint?.severity).toBe('error');
    expect(endpoint?.detail).toMatch(/\.invalid/);

    const development = await verifyDesktopShell({ root, env: {} });
    expect(development.checks.find((check) => check.id === 'environment.update-endpoint')?.ok).toBe(
      true,
    );
  });

  it('requires a production run to declare itself', async () => {
    // Verified end to end: production is reached *by declaring it*, so an undeclared run is
    // development by definition and never silently production.
    const undeclared = await verifyDesktopShell({ root, env: {} });
    expect(undeclared.environment.declared).toBe(false);
    expect(undeclared.environment.environment).toBe('development');
    expect(
      undeclared.checks.find((check) => check.id === 'environment.declared-in-production')?.ok,
    ).toBe(true);

    const declared = await verifyDesktopShell({
      root,
      env: { [DESKTOP_ENVIRONMENT_VAR]: 'production' },
    });
    expect(declared.environment.declared).toBe(true);
  });

  it('reports an unrecognised environment as a failed check', async () => {
    const report = await verifyDesktopShell({
      root,
      env: { [DESKTOP_ENVIRONMENT_VAR]: 'staging' },
    });
    const check = report.checks.find((entry) => entry.id === 'environment.recognised');
    expect(check?.ok).toBe(false);
    expect(check?.severity).toBe('error');
    expect(check?.detail).toMatch(/not one of/i);
  });
});

describe('the browser build keeps working without any Tauri API', () => {
  it('answers the shell status honestly rather than pretending to be a shell', async () => {
    const bridge = browserShellBridge();
    const status = await bridge.status();

    expect(status.apiBaseUrl).toBeNull();
    expect(status.sidecarState).toBe('stopped');
    // Both missing capabilities are named with a reason, which is what the Settings screen
    // renders. A browser that claimed a keychain would be the R18 failure in miniature.
    expect(status.unavailable.map((entry) => entry.capability)).toEqual([
      'secure-store',
      'offline-cache',
    ]);
    expect(status.unavailable.every((entry) => entry.reason.length > 0)).toBe(true);
  });

  it('derives STOPPED in a browser, so no screen waits for a shell that is not there', async () => {
    const status = await browserShellBridge().status();
    const view = desktopStartupState({ runtime: 'web', status });
    expect(view.state).toBe('STOPPED');
    expect(isStartupPending(view.state)).toBe(false);
  });

  it('refuses a shell-only operation with a message safe to show, and no path in it', async () => {
    const bridge = browserShellBridge();
    await expect(bridge.secureStore.set('llm-key', 'secret')).rejects.toThrow(/browser/i);
    await expect(bridge.handshake()).rejects.toThrow(/browser/i);
    await expect(bridge.exportReport('report.md', 'x')).rejects.toThrow(/browser/i);

    // A refusal must not describe the machine it is refusing on.
    const error = await bridge.handshake().catch((caught: Error) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(String((error as Error).message)).not.toMatch(/[A-Za-z]:\\|\/home\/|\/Users\//);
  });

  it('resolves the browser bridge when there is no shell, without importing one', () => {
    // `shellBridge()` resolves `invoke` lazily, so a browser bundle never needs the Tauri
    // package to exist. Getting a working bridge here is the proof.
    const bridge = shellBridge();
    expect(typeof bridge.status).toBe('function');
    expect(typeof bridge.secureStore.get).toBe('function');
    expect(bridge.platform).toBe('windows');
  });

  it('reads a credential as absent in a browser rather than throwing on a render path', async () => {
    // A settings screen asks this on mount; throwing would blank the page.
    await expect(browserShellBridge().secureStore.get('llm-key')).resolves.toBeNull();
    await expect(browserShellBridge().cache.get('dashboard')).resolves.toBeNull();
  });
});
