/**
 * Desktop shell verification.
 *
 * The shell cannot be built on a machine without the Rust toolchain, and "we could
 * not check it" is not an acceptable state for a boundary this large. So the parts
 * that can be checked are checked mechanically, here, from the source of truth:
 *
 *   * the capability files grant only what `capabilities.ts` declares, and nothing
 *     that its forbidden list names;
 *   * the Rust command surface matches the TypeScript command contract exactly —
 *     in both directions, so neither half can drift;
 *   * the CSP is loopback-only, and the API port agrees across the CSP, the
 *     TypeScript constant, the Rust constant and the backend default;
 *   * versions agree across `package.json`, `tauri.conf.json` and `Cargo.toml`;
 *   * only `sidecar.rs` may spawn a process.
 *
 * What it cannot check is listed explicitly in `unverifiable`, so a green report
 * is never read as "the app was built and launched".
 */

import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  assertCapabilityAllowList,
  capabilityPermissionIds,
  missingRequiredPermissions,
  parseCapabilityFile,
} from './capabilities.js';
import { SHELL_COMMANDS } from '../../packages/shared/src/desktop/ipc.js';
import { DESKTOP_API_PORT } from './sidecar.js';
import { DEFAULT_DESKTOP_CONFIG } from './config.js';
import { DEFAULT_CONFIG } from '../core/config.js';

export type CheckSeverity = 'error' | 'warning';

export interface VerificationCheck {
  id: string;
  ok: boolean;
  severity: CheckSeverity;
  detail: string;
}

export interface VerificationReport {
  checks: VerificationCheck[];
  /** Statements this report does not cover, stated so nobody assumes otherwise. */
  unverifiable: string[];
  errors: number;
  warnings: number;
}

export interface VerifyOptions {
  /** Repository root (the directory containing `src-tauri/`). */
  root: string;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

async function readTextOrNull(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

function cspDirectives(csp: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const part of csp.split(';')) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) map.set(name, values);
  }
  return map;
}

/** Commands registered with `#[tauri::command]` in the Rust source. */
export function rustCommands(source: string): string[] {
  const names: string[] = [];
  const pattern = /#\[tauri::command\][\s\S]{0,120}?\bfn\s+([a-z0-9_]+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    if (match[1]) names.push(match[1]);
  }
  const handlerList = /generate_handler!\[([\s\S]*?)\]/.exec(source);
  if (handlerList?.[1]) {
    for (const entry of handlerList[1].split(',')) {
      const name = entry.trim();
      if (name.length > 0 && !names.includes(name)) names.push(name);
    }
  }
  return [...new Set(names)].sort();
}

/** Field names of the Rust `DesktopConfig` struct, camelCased. */
export function rustConfigKeys(source: string): string[] {
  const struct = /pub struct DesktopConfig \{([\s\S]*?)\n\}/.exec(source);
  if (!struct?.[1]) return [];
  const keys: string[] = [];
  for (const line of struct[1].split('\n')) {
    const match = /^\s*pub\s+([a-z0-9_]+)\s*:/.exec(line);
    if (!match?.[1]) continue;
    keys.push(match[1].replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase()));
  }
  return keys.sort();
}

export async function verifyDesktopShell(options: VerifyOptions): Promise<VerificationReport> {
  const root = options.root;
  const tauriDir = join(root, 'src-tauri');
  const checks: VerificationCheck[] = [];
  const add = (
    id: string,
    ok: boolean,
    detail: string,
    severity: CheckSeverity = 'error',
  ): void => {
    checks.push({ id, ok, severity, detail });
  };

  // ── capability files ──────────────────────────────────────────────────────
  const capabilityDir = join(tauriDir, 'capabilities');
  let capabilityFiles: string[] = [];
  try {
    capabilityFiles = (await readdir(capabilityDir)).filter((name) => name.endsWith('.json'));
  } catch {
    add('capabilities.present', false, `no capability directory at ${capabilityDir}`);
  }

  const declaredPermissions = new Set<string>();
  const capabilityIdentifiers: string[] = [];
  for (const file of capabilityFiles) {
    try {
      const parsed = parseCapabilityFile(await readJson(join(capabilityDir, file)));
      capabilityIdentifiers.push(parsed.identifier);
      const identifiers = capabilityPermissionIds(parsed);
      for (const permission of identifiers) declaredPermissions.add(permission);
      try {
        assertCapabilityAllowList(identifiers);
        const scoped = parsed.scoped.length;
        add(
          `capabilities.policy:${file}`,
          true,
          `${identifiers.length} permission(s) declared in the allow-list${scoped > 0 ? `, ${scoped} with an explicit scope` : ''}`,
        );
      } catch (error) {
        add(
          `capabilities.policy:${file}`,
          false,
          error instanceof Error ? error.message : String(error),
        );
      }
    } catch (error) {
      add(
        `capabilities.parse:${file}`,
        false,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  const missing = missingRequiredPermissions([...declaredPermissions]);
  add(
    'capabilities.required',
    missing.length === 0,
    missing.length === 0
      ? 'every required permission is granted'
      : `missing: ${missing.join(', ')}`,
  );

  const forbiddenAreas = ['shell:', 'fs:', 'path:', 'http:', 'process:', 'store:'];
  const presentAreas = [...declaredPermissions].filter((permission) =>
    forbiddenAreas.some((area) => permission.startsWith(area) || permission.includes(`:${area}`)),
  );
  add(
    'capabilities.forbidden-areas',
    presentAreas.length === 0,
    presentAreas.length === 0
      ? `no shell/fs/path/http/process/store permission is granted`
      : `granted: ${presentAreas.join(', ')}`,
  );

  // ── tauri.conf.json ───────────────────────────────────────────────────────
  const confPath = join(tauriDir, 'tauri.conf.json');
  let conf: Record<string, unknown> | null = null;
  try {
    conf = (await readJson(confPath)) as Record<string, unknown>;
  } catch (error) {
    add('tauri.conf.parse', false, error instanceof Error ? error.message : String(error));
  }

  if (conf) {
    const app = (conf.app ?? {}) as Record<string, unknown>;
    const security = (app.security ?? {}) as Record<string, unknown>;
    const build = (conf.build ?? {}) as Record<string, unknown>;
    const bundle = (conf.bundle ?? {}) as Record<string, unknown>;
    const windows = Array.isArray(app.windows) ? (app.windows as Record<string, unknown>[]) : [];

    add(
      'tauri.conf.withGlobalTauri',
      app.withGlobalTauri === false,
      app.withGlobalTauri === false
        ? 'withGlobalTauri is false: the frontend uses the module API, not globals'
        : 'withGlobalTauri must be false so the shell API is not a global',
    );

    const declaredCapabilities = Array.isArray(security.capabilities)
      ? (security.capabilities as string[])
      : [];
    add(
      'tauri.conf.capabilities',
      declaredCapabilities.length === capabilityIdentifiers.length &&
        capabilityIdentifiers.every((id) => declaredCapabilities.includes(id)),
      `config enables [${declaredCapabilities.join(', ')}]; files present: [${capabilityIdentifiers.join(', ')}]`,
    );

    const csp = typeof security.csp === 'string' ? security.csp : '';
    const directives = cspDirectives(csp);
    const connect = directives.get('connect-src') ?? [];
    const remote = connect.filter((source) =>
      /https?:\/\/(?!127\.0\.0\.1|localhost|ipc\.localhost)/.test(source),
    );
    add(
      'csp.connect-src-loopback-only',
      remote.length === 0,
      remote.length === 0
        ? `connect-src is ${connect.join(' ')}`
        : `non-loopback origins allowed: ${remote.join(', ')}`,
    );
    add(
      'csp.api-origin',
      connect.includes(`http://127.0.0.1:${DESKTOP_API_PORT}`) &&
        connect.includes(`ws://127.0.0.1:${DESKTOP_API_PORT}`),
      `connect-src must name the API origin exactly (http and ws on port ${DESKTOP_API_PORT})`,
    );
    add(
      'csp.object-src-none',
      (directives.get('object-src') ?? []).includes("'none'"),
      "object-src 'none' is required",
    );
    add(
      'csp.no-wildcard',
      !csp.includes('*'),
      csp.includes('*') ? 'the CSP contains a wildcard' : 'no wildcard source in the CSP',
    );
    add(
      'csp.style-inline',
      (directives.get('style-src') ?? []).includes("'unsafe-inline'"),
      "style-src needs 'unsafe-inline' for React/Framer inline styles; script-src must not",
    );
    add(
      'csp.script-no-inline',
      !(directives.get('script-src') ?? []).includes("'unsafe-inline'"),
      'script-src must not allow inline scripts',
    );

    const devUrl = typeof build.devUrl === 'string' ? build.devUrl : '';
    add(
      'tauri.conf.devUrl',
      devUrl === 'http://127.0.0.1:5173',
      `devUrl is "${devUrl}" (Vite binds 127.0.0.1:5173 with strictPort)`,
    );
    add(
      'tauri.conf.frontendDist',
      build.frontendDist === '../web/dist',
      `frontendDist is "${String(build.frontendDist)}"`,
    );

    const externalBin = Array.isArray(bundle.externalBin) ? (bundle.externalBin as string[]) : [];
    add(
      'bundle.externalBin',
      externalBin.length === 1 && externalBin[0] === 'binaries/master-trade-api',
      `externalBin is [${externalBin.join(', ')}]; exactly one bundled binary is expected`,
    );

    // Brand assets: `tauri build` fails outright on a missing icon, so a path that does not
    // resolve is an error here rather than a surprise during packaging. The macOS icon
    // bundle cannot be produced without a macOS toolchain, so it is reported separately and
    // never blocks a Windows or Linux build's report.
    const iconList = Array.isArray(bundle.icon) ? (bundle.icon as string[]) : [];
    const missingIcons = iconList.filter(
      (icon) => !icon.endsWith('.icns') && !existsSync(join(tauriDir, icon)),
    );
    add(
      'bundle.icons-present',
      iconList.length > 0 && missingIcons.length === 0,
      iconList.length === 0
        ? 'bundle.icon is empty; a packaged application needs at least one icon'
        : missingIcons.length === 0
          ? `${iconList.length} icon(s) referenced, all present (generated by \`npm run brand:assets\`)`
          : `referenced but missing: ${missingIcons.join(', ')} — run \`npm run brand:assets\``,
    );
    const missingMacIcons = iconList.filter(
      (icon) => icon.endsWith('.icns') && !existsSync(join(tauriDir, icon)),
    );
    add(
      'bundle.icons-macos',
      missingMacIcons.length === 0,
      missingMacIcons.length === 0
        ? 'the macOS icon bundle is present'
        : `${missingMacIcons.join(', ')} is generated by \`npm run desktop:icons\` (needs @tauri-apps/cli); a macOS bundle cannot be built without it`,
      'warning',
    );

    const main = windows.find((window) => window.label === 'main');
    add(
      'window.hidden-until-ready',
      main?.visible === false,
      main?.visible === false
        ? 'the main window starts hidden and is shown after the API answers'
        : 'the main window must start hidden so it never renders against a dead API',
    );

    const updater = ((conf.plugins ?? {}) as Record<string, unknown>).updater as
      Record<string, unknown> | undefined;
    const pubkey = typeof updater?.pubkey === 'string' ? updater.pubkey : '';
    add(
      'updater.pubkey',
      pubkey.length > 0 && !pubkey.startsWith('REPLACE_WITH'),
      pubkey.startsWith('REPLACE_WITH')
        ? 'the updater public key is still the placeholder; replace it before the first release'
        : 'an updater public key is configured',
      'warning',
    );
    const endpoints = Array.isArray(updater?.endpoints) ? (updater.endpoints as string[]) : [];
    add(
      'updater.https-only',
      endpoints.length > 0 && endpoints.every((endpoint) => endpoint.startsWith('https://')),
      `update endpoints: ${endpoints.join(', ') || 'none'}`,
    );
  }

  // ── Rust command surface ─────────────────────────────────────────────────
  const commandsSource = (await readTextOrNull(join(tauriDir, 'src', 'commands.rs'))) ?? '';
  const rustSurface = rustCommands(commandsSource);
  const tsSurface = [...SHELL_COMMANDS].sort();
  const onlyRust = rustSurface.filter((command) => !tsSurface.includes(command as never));
  const onlyTs = tsSurface.filter((command) => !rustSurface.includes(command));
  add(
    'commands.contract-parity',
    onlyRust.length === 0 && onlyTs.length === 0,
    onlyRust.length === 0 && onlyTs.length === 0
      ? `${rustSurface.length} commands registered, matching src/desktop/ipc.ts`
      : `Rust-only: [${onlyRust.join(', ')}]; TypeScript-only: [${onlyTs.join(', ')}]`,
  );

  // ── process spawning stays in one file ───────────────────────────────────
  const rustFiles = (await readdir(join(tauriDir, 'src'))).filter((name) => name.endsWith('.rs'));
  const spawners: string[] = [];
  for (const file of rustFiles) {
    if (file === 'sidecar.rs') continue;
    const source = (await readTextOrNull(join(tauriDir, 'src', file))) ?? '';
    if (source.includes('std::process::Command') || /Command::new\(/.test(source)) {
      spawners.push(file);
    }
  }
  add(
    'process.single-spawner',
    spawners.length === 0,
    spawners.length === 0
      ? 'only sidecar.rs may spawn a process'
      : `process spawning also appears in: ${spawners.join(', ')}`,
  );

  // ── API port agreement ───────────────────────────────────────────────────
  const rustSidecar = (await readTextOrNull(join(tauriDir, 'src', 'sidecar.rs'))) ?? '';
  const rustPort = Number(/pub const API_PORT: u16 = (\d+);/.exec(rustSidecar)?.[1] ?? '0');
  add(
    'port.agreement',
    rustPort === DESKTOP_API_PORT && DEFAULT_CONFIG.api.port === DESKTOP_API_PORT,
    `rust=${rustPort || 'missing'} typescript=${DESKTOP_API_PORT} backend-default=${DEFAULT_CONFIG.api.port}`,
  );

  // ── config schema parity ─────────────────────────────────────────────────
  const rustConfig = (await readTextOrNull(join(tauriDir, 'src', 'config.rs'))) ?? '';
  const rustKeys = rustConfigKeys(rustConfig);
  const tsKeys = Object.keys(DEFAULT_DESKTOP_CONFIG).sort();
  const keyDiff = rustKeys.filter((key) => !tsKeys.includes(key));
  add(
    'config.schema-parity',
    rustKeys.length > 0 && keyDiff.length === 0,
    rustKeys.length === 0
      ? 'could not read the Rust DesktopConfig struct'
      : keyDiff.length === 0
        ? `${rustKeys.length} config keys agree between Rust and TypeScript`
        : `Rust-only keys: ${keyDiff.join(', ')}`,
  );

  // ── version agreement ────────────────────────────────────────────────────
  const packageJson = (await readJson(join(root, 'package.json'))) as { version?: string };
  const cargoToml = (await readTextOrNull(join(tauriDir, 'Cargo.toml'))) ?? '';
  const cargoVersion = /^version\s*=\s*"([^"]+)"/m.exec(cargoToml)?.[1] ?? '';
  const confVersion = typeof conf?.version === 'string' ? conf.version : '';
  add(
    'version.agreement',
    Boolean(packageJson.version) &&
      packageJson.version === confVersion &&
      packageJson.version === cargoVersion,
    `package.json=${packageJson.version ?? 'missing'} tauri.conf.json=${confVersion || 'missing'} Cargo.toml=${cargoVersion || 'missing'}`,
  );

  const errors = checks.filter((check) => !check.ok && check.severity === 'error').length;
  const warnings = checks.filter((check) => !check.ok && check.severity === 'warning').length;

  return {
    checks,
    errors,
    warnings,
    unverifiable: [
      'the native build: no Rust toolchain is required for this report, so `cargo build` and the bundle are not exercised here',
      'runtime behaviour of the shell: window show timing, keychain access and single-instance focus need a built app',
      'the bundled sidecar binary: `npm run build:sidecar` produces it, and its presence is checked at launch, not here',
      'the updater endpoint and signing key: a placeholder key is reported as a warning until a real one is configured',
      'code signing and notarisation for distribution',
      'the rasterisation of the brand source: `npm run brand:assets` produces the icons, and this report only checks that the paths resolve',
    ],
  };
}
