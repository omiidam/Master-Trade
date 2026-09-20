/**
 * Desktop shell contract.
 *
 * Decision (ADR-0001): Tauri over Electron. The shell owns only host concerns
 * — windows, dialogs, OS keychain, offline cache, updates — and talks to the
 * frontend through the same typed API contracts used over HTTP. It never holds
 * business logic and never holds provider credentials in plain text.
 */

export type DesktopPlatform = 'windows' | 'macos' | 'linux';

export type DesktopCapability =
  | 'secure-store'
  | 'file-dialog'
  | 'offline-cache'
  | 'notifications'
  | 'single-instance'
  | 'auto-update';

/** Capabilities the app cannot ship without. */
export const REQUIRED_DESKTOP_CAPABILITIES: readonly DesktopCapability[] = [
  'secure-store',
  'file-dialog',
  'offline-cache',
  'single-instance',
];

/** Secrets (LLM keys, credentials) live here, never in config or the database. */
export interface SecureStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface OfflineCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
  clear(): Promise<void>;
}

export interface DesktopHost {
  readonly platform: DesktopPlatform;
  readonly appVersion: string;
  readonly capabilities: readonly DesktopCapability[];
  readonly secureStore: SecureStore;
  readonly cache: OfflineCache;
  openExternal(url: string): Promise<void>;
  showSaveDialog(options: { defaultPath: string; filters: string[] }): Promise<string | null>;
}

export interface DesktopEvaluation {
  shell: 'tauri' | 'electron';
  runtime: string;
  bundleSizeMb: number;
  reasons: string[];
  tradeOffs: string[];
}

/** Documented recommendation; see docs/desktop-and-frontend.md. */
export const RECOMMENDED_DESKTOP: DesktopEvaluation = {
  shell: 'tauri',
  runtime: 'Rust host + system WebView (WebView2 / WKWebView / WebKitGTK)',
  bundleSizeMb: 12,
  reasons: [
    'small bundle and low memory use on a long-running training app',
    'first-class OS keychain and filesystem APIs without a Node runtime in the renderer',
    'strong capability allow-list model aligned with this project’s permission thinking',
    'the Rust host can later run deterministic compute (Menai concepts) outside the LLM',
  ],
  tradeOffs: [
    'smaller ecosystem than Electron',
    'WebView differences across platforms require UI testing on all three OSes',
  ],
};

export function listMissingCapabilities(host: DesktopHost): DesktopCapability[] {
  return REQUIRED_DESKTOP_CAPABILITIES.filter(
    (capability) => !host.capabilities.includes(capability),
  );
}

/** Refuse to start with a shell that cannot protect secrets or work offline. */
export function assertDesktopHost(host: DesktopHost): void {
  const missing = listMissingCapabilities(host);
  if (missing.length > 0) {
    throw new Error(`Desktop host is missing required capabilities: ${missing.join(', ')}`);
  }
}

/** In-memory host used by tests; never persists anything. */
export function memoryDesktopHost(
  options: {
    platform?: DesktopPlatform;
    appVersion?: string;
    capabilities?: DesktopCapability[];
  } = {},
): DesktopHost {
  const secrets = new Map<string, string>();
  const cache = new Map<string, string>();
  return {
    platform: options.platform ?? 'windows',
    appVersion: options.appVersion ?? '0.0.0-test',
    capabilities: options.capabilities ?? [
      'secure-store',
      'file-dialog',
      'offline-cache',
      'notifications',
      'single-instance',
    ],
    secureStore: {
      async get(key) {
        return secrets.get(key) ?? null;
      },
      async set(key, value) {
        secrets.set(key, value);
      },
      async delete(key) {
        secrets.delete(key);
      },
    },
    cache: {
      async get(key) {
        return cache.get(key) ?? null;
      },
      async set(key, value) {
        cache.set(key, value);
      },
      async clear() {
        cache.clear();
      },
    },
    async openExternal() {
      /* no-op in tests */
    },
    async showSaveDialog() {
      return null;
    },
  };
}
