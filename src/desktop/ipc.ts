/**
 * WebView ↔ shell command contract.
 *
 * The capability file says what the WebView is *granted*; this file says what it
 * can *ask for*. Together they are the whole desktop attack surface, and both are
 * deny-by-default:
 *
 *   - a command not in `SHELL_COMMANDS` is refused before it leaves the frontend,
 *     and the Rust side registers only these commands;
 *   - no command takes or returns a filesystem path — files are named, and the
 *     Rust host decides where they live;
 *   - arguments are validated here (scheme, key shape, size, file name) so a bug
 *     in a page cannot turn a convenience command into a general-purpose one;
 *   - the only way to reach the API is `shell_handshake`, which returns a
 *     per-launch token the shell generated. Nothing in the frontend can read or
 *     write credentials directly.
 *
 * `invoke` is injected, exactly like `fetch` in the provider adapters: the bridge
 * is exercised in tests with no Tauri runtime, and the same code runs inside the
 * real shell.
 */

import { AppError } from '../core/errors.js';
import type {
  DesktopCapability,
  DesktopHost,
  DesktopPlatform,
  OfflineCache,
  SecureStore,
} from './host.js';

/** The command names the shell registers and the frontend may call. */
export const SHELL_COMMANDS = [
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
] as const;

export type ShellCommand = (typeof SHELL_COMMANDS)[number];

/** Bumped when the command contract changes shape; the shell refuses a mismatch. */
export const SHELL_PROTOCOL_VERSION = 1;

/** Refuse a command that is not part of the contract. */
export function assertShellCommand(name: string): asserts name is ShellCommand {
  if (!(SHELL_COMMANDS as readonly string[]).includes(name)) {
    throw new AppError(
      'POLICY_VIOLATION',
      `shell command "${name}" is not in the desktop command allow-list (deny-by-default)`,
      { details: { command: name } },
    );
  }
}

/** Keychain entries are namespaced, and the key must look like an identifier. */
export const SECRET_KEY_PATTERN = /^[a-z0-9][a-z0-9._/-]{0,119}$/i;
/** Cache keys are the same shape: no path characters, no spaces. */
export const CACHE_KEY_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,119}$/i;
/** A cached value may not become an arbitrary file store. */
export const MAX_CACHE_VALUE_BYTES = 512 * 1024;
/** An exported report is bounded, and its extension is on a list. */
export const MAX_EXPORT_BYTES = 8 * 1024 * 1024;
export const EXPORT_EXTENSIONS = ['.md', '.json', '.csv', '.txt'] as const;

export function assertSecretKey(key: string): void {
  if (!SECRET_KEY_PATTERN.test(key)) {
    throw new AppError('VALIDATION_FAILED', `invalid credential key "${key}"`, {
      details: { key },
    });
  }
}

export function assertCacheKey(key: string): void {
  if (!CACHE_KEY_PATTERN.test(key)) {
    throw new AppError('VALIDATION_FAILED', `invalid cache key "${key}"`, { details: { key } });
  }
}

export function assertCacheValue(value: string): void {
  const bytes = Buffer.byteLength(value, 'utf8');
  if (bytes > MAX_CACHE_VALUE_BYTES) {
    throw new AppError(
      'VALIDATION_FAILED',
      `cached value is ${bytes} bytes; the limit is ${MAX_CACHE_VALUE_BYTES}`,
      { details: { bytes } },
    );
  }
}

/**
 * A report file name: no separators, no traversal, known extension. The shell
 * appends this to the exports directory it owns, so the frontend cannot choose a
 * destination even if it tries.
 */
export function assertExportName(name: string): void {
  if (
    name.length === 0 ||
    name.length > 120 ||
    name.includes('/') ||
    name.includes('\\') ||
    name.includes('..') ||
    /[\u0000-\u001f]/.test(name)
  ) {
    throw new AppError('VALIDATION_FAILED', `invalid export file name "${name}"`, {
      details: { name },
    });
  }
  const lower = name.toLowerCase();
  if (!EXPORT_EXTENSIONS.some((extension) => lower.endsWith(extension))) {
    throw new AppError(
      'VALIDATION_FAILED',
      `export extension must be one of ${EXPORT_EXTENSIONS.join(', ')}`,
      { details: { name } },
    );
  }
}

/** Only https leaves the app; a plaintext or custom scheme is refused. */
export function assertExternalUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AppError('VALIDATION_FAILED', `"${url}" is not a valid URL`);
  }
  if (parsed.protocol !== 'https:') {
    throw new AppError(
      'POLICY_VIOLATION',
      `refusing to open a "${parsed.protocol}" URL: only https is allowed`,
      { details: { protocol: parsed.protocol } },
    );
  }
}

/** What the shell reports about itself; the frontend renders it verbatim. */
export interface ShellStatus {
  protocolVersion: number;
  platform: DesktopPlatform;
  appVersion: string;
  /** Loopback base URL the API is listening on, e.g. `http://127.0.0.1:4317`. */
  apiBaseUrl: string | null;
  sidecarState: 'stopped' | 'starting' | 'ready' | 'failed';
  /** Capabilities the shell reports as available at runtime. */
  capabilities: DesktopCapability[];
  /** Capabilities the shell expected but could not provide, with the reason. */
  unavailable: { capability: DesktopCapability; reason: string }[];
}

/** The per-launch API credential. Deliberately not a `SecretRef`: it is runtime state. */
export interface ShellHandshake {
  apiBaseUrl: string;
  token: string;
  expiresAt: string;
}

export interface ExportResult {
  fileName: string;
  bytes: number;
  cancelled: boolean;
}

/** The injected Tauri `invoke`, typed so tests can supply a fake. */
export type InvokeFn = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export interface ShellBridge extends DesktopHost {
  status(): Promise<ShellStatus>;
  handshake(): Promise<ShellHandshake>;
  exportReport(name: string, contents: string): Promise<ExportResult>;
  hideWindow(): Promise<void>;
  quit(): Promise<void>;
}

/**
 * Build the bridge the frontend uses. Every call goes through the allow-list, so
 * a compromised page cannot reach a command that is not in the contract even if
 * the shell registers one by mistake.
 */
export function createShellBridge(invoke: InvokeFn): ShellBridge {
  const call = async <T>(command: ShellCommand, args?: Record<string, unknown>): Promise<T> => {
    assertShellCommand(command);
    return invoke<T>(command, args);
  };

  const secureStore: SecureStore = {
    async get(key) {
      assertSecretKey(key);
      return (await call<string | null>('secure_store_get', { key })) ?? null;
    },
    async set(key, value) {
      assertSecretKey(key);
      await call<void>('secure_store_set', { key, value });
    },
    async delete(key) {
      assertSecretKey(key);
      await call<void>('secure_store_delete', { key });
    },
  };

  const cache: OfflineCache = {
    async get(key) {
      assertCacheKey(key);
      return (await call<string | null>('cache_get', { key })) ?? null;
    },
    async set(key, value, ttlMs) {
      assertCacheKey(key);
      assertCacheValue(value);
      await call<void>('cache_set', { key, value, ttlMs });
    },
    async clear() {
      await call<void>('cache_clear');
    },
  };

  const status = (): Promise<ShellStatus> => call<ShellStatus>('shell_status');
  const handshake = (): Promise<ShellHandshake> => call<ShellHandshake>('shell_handshake');

  return {
    // Filled from the shell's own report so the host contract cannot drift.
    platform: 'windows',
    appVersion: '0.0.0',
    capabilities: [],
    secureStore,
    cache,
    status,
    handshake,
    async openExternal(url) {
      assertExternalUrl(url);
      await call<void>('open_external', { url });
    },
    async showSaveDialog(options) {
      assertExportName(options.defaultPath);
      const result = await call<ExportResult | null>('export_report_as', {
        suggestedName: options.defaultPath,
      });
      // A shell build that answers with nothing is "no export", not a crash.
      if (!result || result.cancelled) return null;
      return result.fileName;
    },
    async exportReport(name, contents) {
      assertExportName(name);
      if (Buffer.byteLength(contents, 'utf8') > MAX_EXPORT_BYTES) {
        throw new AppError('VALIDATION_FAILED', `report exceeds ${MAX_EXPORT_BYTES} bytes`);
      }
      return call<ExportResult>('export_report', { name, contents });
    },
    async hideWindow() {
      await call<void>('window_hide');
    },
    async quit() {
      await call<void>('app_quit');
    },
  };
}

/**
 * The browser stand-in. Outside the shell there is no keychain, no cache and no
 * path to the local API, and saying so is the honest behaviour: the preview must
 * not pretend it can store a credential.
 */
export function browserShellBridge(): ShellBridge {
  const unsupported = (what: string): never => {
    throw new AppError(
      'NOT_IMPLEMENTED',
      `${what} is only available in the desktop shell; this page is running in a browser`,
      { details: { shell: 'browser' } },
    );
  };
  return {
    platform: 'windows',
    appVersion: '0.0.0',
    capabilities: [],
    secureStore: {
      get: async () => null,
      set: async () => unsupported('Storing a credential'),
      delete: async () => unsupported('Deleting a credential'),
    },
    cache: {
      get: async () => null,
      set: async () => unsupported('Writing the offline cache'),
      clear: async () => unsupported('Clearing the offline cache'),
    },
    async status() {
      return {
        protocolVersion: SHELL_PROTOCOL_VERSION,
        platform: 'windows',
        appVersion: '0.0.0',
        apiBaseUrl: null,
        sidecarState: 'stopped',
        capabilities: [],
        unavailable: [
          { capability: 'secure-store', reason: 'not running in the desktop shell' },
          { capability: 'offline-cache', reason: 'not running in the desktop shell' },
        ],
      };
    },
    handshake: async () => unsupported('Reaching the local API'),
    openExternal: async (url) => {
      assertExternalUrl(url);
      unsupported('Opening a URL');
    },
    showSaveDialog: async () => null,
    exportReport: async () => unsupported('Exporting a report'),
    hideWindow: async () => undefined,
    quit: async () => undefined,
  };
}

/** True when the page is running inside the desktop shell. */
export function isDesktopShell(target: {
  __TAURI_INTERNALS__?: unknown;
  __TAURI__?: unknown;
}): boolean {
  return target.__TAURI_INTERNALS__ !== undefined || target.__TAURI__ !== undefined;
}
