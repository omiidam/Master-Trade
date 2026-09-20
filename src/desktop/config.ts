/**
 * Local desktop configuration.
 *
 * The shell needs a few preferences that are not server settings: window size,
 * update channel, cache lifetime. They live in a JSON file inside the OS app-data
 * directory, and this module is the only code that reads or writes it.
 *
 * Three rules, each of which has bitten a desktop app somewhere:
 *
 *   1. **The app-data directory, never the install directory.** An installer
 *      upgrade must not be able to erase six months of training history, and a
 *      sandboxed OS profile must be able to relocate it.
 *   2. **No credential may be written here.** A recursive key check refuses
 *      anything named like a secret, so the keychain rule cannot be eroded by a
 *      well-meaning "just cache the key" change. The value is refused, not
 *      filtered.
 *   3. **One validator, strict.** Zod, unknown keys rejected — the same policy as
 *      the API layer (ADR-0015). A typo in a hand-edited file is reported instead
 *      of silently ignored.
 */

import { z } from 'zod';
import { AppError } from '../core/errors.js';
import type { DesktopPlatform } from './host.js';

export const DESKTOP_CONFIG_VERSION = 1;
export const DESKTOP_CONFIG_FILE = 'config.json';
const APP_DIR_NAME = 'Master Trade';

export const windowConfigSchema = z.strictObject({
  width: z.number().int().min(640).max(7_680).default(1440),
  height: z.number().int().min(480).max(4_320).default(900),
  minWidth: z.number().int().min(320).max(4_000).default(1024),
  minHeight: z.number().int().min(240).max(4_000).default(640),
  /** Restore the last window position on start. */
  rememberBounds: z.boolean().default(true),
});

export const autoUpdateSchema = z.strictObject({
  enabled: z.boolean().default(true),
  channel: z.enum(['stable', 'beta']).default('stable'),
});

/** Fully-defaulted nested objects, so `.default()` has a complete value to use. */
export const DEFAULT_WINDOW_CONFIG = windowConfigSchema.parse({});
export const DEFAULT_AUTO_UPDATE = autoUpdateSchema.parse({});

export const desktopConfigSchema = z.strictObject({
  configVersion: z.literal(DESKTOP_CONFIG_VERSION).default(DESKTOP_CONFIG_VERSION),
  window: windowConfigSchema.default(DEFAULT_WINDOW_CONFIG),
  /** Offline cache lifetime; lesson content is long-lived, status is not. */
  offlineCacheTtlMs: z
    .number()
    .int()
    .min(60_000)
    .max(30 * 24 * 60 * 60 * 1_000)
    .default(7 * 24 * 60 * 60 * 1_000),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  startMinimized: z.boolean().default(false),
  autoUpdate: autoUpdateSchema.default(DEFAULT_AUTO_UPDATE),
  /** Local analytics are off and are not a setting. */
  telemetry: z.literal(false).default(false),
  /**
   * Last window position, persisted by the shell when `window.rememberBounds` is on.
   * `null` (or absent) means the window is centred.
   */
  windowPosition: z.tuple([z.number().int(), z.number().int()]).nullable().default(null),
});

export type DesktopConfig = z.infer<typeof desktopConfigSchema>;

export const DEFAULT_DESKTOP_CONFIG: DesktopConfig = desktopConfigSchema.parse({});

/**
 * Any key whose name suggests a credential, anywhere in the tree.
 *
 * The `key$` clause is deliberately broad: `apiKey`, `openaiKey`, `publicKey`
 * and `keys` all end in "key", and every real-world spelling of a credential we
 * have seen does too. Erring toward refusal is the right direction for a file
 * that holds no credential by design — a false positive is a loud start-up
 * failure, a false negative is a key sitting in plaintext on disk.
 */
export const SECRET_KEY_PATTERN =
  /(secret|token|password|passphrase|api[-_]?key|credential|private[-_]?key)|key(s)?$/i;

/** Walk a parsed config and refuse credential-looking keys at any depth. */
export function assertNoSecrets(value: unknown, path = 'config'): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoSecrets(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const here = `${path}.${key}`;
    if (SECRET_KEY_PATTERN.test(key)) {
      throw new AppError(
        'POLICY_VIOLATION',
        `refusing "${here}": credentials belong in the OS keychain, never in the desktop config file`,
        { details: { field: here } },
      );
    }
    assertNoSecrets(entry, here);
  }
}

/**
 * Per-OS application data directory.
 *
 * Windows: `%APPDATA%\Master Trade`
 * macOS:   `~/Library/Application Support/Master Trade`
 * Linux:   `$XDG_CONFIG_HOME/master-trade` (or `~/.config/master-trade`)
 */
export function appDataDir(
  platform: DesktopPlatform,
  env: Record<string, string | undefined> = process.env,
): string {
  switch (platform) {
    case 'windows': {
      const base = env.APPDATA ?? env.LOCALAPPDATA;
      if (!base) {
        throw new AppError('INTERNAL', 'APPDATA is not set; cannot locate the app-data directory');
      }
      return `${base}\\${APP_DIR_NAME}`;
    }
    case 'macos': {
      const home = env.HOME;
      if (!home)
        throw new AppError('INTERNAL', 'HOME is not set; cannot locate the app-data directory');
      return `${home}/Library/Application Support/${APP_DIR_NAME}`;
    }
    case 'linux': {
      const home = env.HOME;
      const base = env.XDG_CONFIG_HOME ?? (home ? `${home}/.config` : undefined);
      if (!base) {
        throw new AppError(
          'INTERNAL',
          'HOME/XDG_CONFIG_HOME are not set; cannot locate the app-data directory',
        );
      }
      return `${base}/master-trade`;
    }
  }
}

export function desktopConfigPath(
  platform: DesktopPlatform,
  env: Record<string, string | undefined> = process.env,
): string {
  return `${appDataDir(platform, env)}/${DESKTOP_CONFIG_FILE}`;
}

/** Parse a raw config object (already JSON-parsed) strictly. */
export function parseDesktopConfig(raw: unknown): DesktopConfig {
  assertNoSecrets(raw);
  const result = desktopConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new AppError('VALIDATION_FAILED', `desktop config is invalid — ${issues}`, {
      details: { issues: result.error.issues.map((issue) => issue.path.join('.')) },
    });
  }
  return result.data;
}

export interface DesktopConfigSource {
  config: DesktopConfig;
  source: 'defaults' | 'file' | 'file+overrides';
  /** Non-fatal notes, e.g. a missing file on first run. */
  warnings: string[];
}

export interface LoadDesktopConfigOptions {
  platform: DesktopPlatform;
  env?: Record<string, string | undefined>;
  /** File reader, injected so this is testable without touching the disk. */
  readFile?: (path: string) => Promise<string>;
  /** Applied last; still validated, so an override cannot inject a bad value. */
  overrides?: Record<string, unknown>;
}

/**
 * Load the config with precedence defaults < file < explicit overrides.
 *
 * A missing file is normal on first run (defaults are written on first save). A
 * malformed file is a hard failure: silently falling back to defaults would hide
 * a corrupted profile and then overwrite it.
 */
export async function loadDesktopConfig(
  options: LoadDesktopConfigOptions,
): Promise<DesktopConfigSource> {
  const path = desktopConfigPath(options.platform, options.env ?? process.env);
  const warnings: string[] = [];
  let fromFile: Record<string, unknown> | null = null;

  if (options.readFile) {
    let text: string | null = null;
    try {
      text = await options.readFile(path);
    } catch {
      text = null;
    }
    if (text === null || text.trim().length === 0) {
      warnings.push(`no config file at ${path}; using defaults`);
    } else {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new AppError('VALIDATION_FAILED', `desktop config at ${path} is not valid JSON`, {
          details: { path },
        });
      }
      fromFile = parsed as Record<string, unknown>;
    }
  }

  const merged = { ...(fromFile ?? {}), ...(options.overrides ?? {}) };
  // Nested overrides merge one level deep, which is what window/autoUpdate need.
  for (const key of ['window', 'autoUpdate'] as const) {
    const base = (fromFile?.[key] ?? {}) as Record<string, unknown>;
    const over = (options.overrides?.[key] ?? {}) as Record<string, unknown>;
    if (Object.keys(base).length > 0 || Object.keys(over).length > 0) {
      merged[key] = { ...base, ...over };
    }
  }

  const config = parseDesktopConfig(merged);
  const source: DesktopConfigSource['source'] =
    fromFile && options.overrides ? 'file+overrides' : fromFile ? 'file' : 'defaults';
  return { config, source, warnings };
}

/** Serialize for writing. Validated first, so an invalid profile cannot be saved. */
export function serializeDesktopConfig(config: unknown): string {
  return `${JSON.stringify(parseDesktopConfig(config), null, 2)}\n`;
}
