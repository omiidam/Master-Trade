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
import { join, sep } from 'node:path';
import {
  assertCapabilityAllowList,
  capabilityPermissionIds,
  missingRequiredPermissions,
  parseCapabilityFile,
} from './capabilities.js';
import { SHELL_COMMANDS, SHELL_PROTOCOL_VERSION } from '../../packages/shared/src/desktop/ipc.js';
import { PROCESS_POLICY, PROCESS_STATES } from '../../packages/shared/src/desktop/process.js';
import { DESKTOP_API_PORT } from './sidecar.js';
import { DEFAULT_DESKTOP_CONFIG } from './config.js';
import { DEFAULT_CONFIG } from '../core/config.js';
import {
  DESKTOP_ENVIRONMENT_VAR,
  isProduction,
  resolveDesktopEnvironment,
  type DesktopEnvironmentResolution,
} from './environment.js';

/** Every `.ts` file beneath `dir`, repository-relative, with forward slashes. */
async function listTypeScriptFiles(root: string, dir: string): Promise<string[]> {
  const found: string[] = [];
  const walk = async (absolute: string): Promise<void> => {
    for (const entry of await readdir(absolute, { withFileTypes: true })) {
      const next = join(absolute, entry.name);
      if (entry.isDirectory()) await walk(next);
      else if (entry.name.endsWith('.ts')) {
        found.push(
          next
            .slice(root.length + 1)
            .split(sep)
            .join('/'),
        );
      }
    }
  };
  await walk(join(root, dir));
  return found;
}

/** The `STATES` list mirrored in `sidecar.rs`, in declaration order. */
function rustProcessStates(source: string): string[] {
  const match = /pub const STATES: \[&str; \d+\] = \[([\s\S]*?)\];/.exec(source);
  if (!match) return [];
  return [...(match[1] ?? '').matchAll(/"([^"]+)"/g)].map((entry) => entry[1] ?? '');
}

/** A `Duration::from_millis(30_000)` constant, as a number. */
function rustMillis(source: string, name: string): number {
  const raw = new RegExp(
    `pub const ${name}: Duration = Duration::from_millis\\(([\\d_]+)\\);`,
  ).exec(source)?.[1];
  return Number((raw ?? '0').split('_').join(''));
}

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
  /** Which environment this report describes, and whether it was declared. */
  environment: DesktopEnvironmentResolution;
}

export interface VerifyOptions {
  /** Repository root (the directory containing `src-tauri/`). */
  root: string;
  /**
   * The environment to verify *as*, injected so this is deterministic.
   *
   * Defaults to `process.env`. Injection is what makes the production rules testable: a
   * test can ask "would a production launch pass?" without setting one in the runner and
   * carefully unsetting it again.
   */
  env?: Record<string, string | undefined>;
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

  // ── environment mode ─────────────────────────────────────────────────────
  //
  // The mode decides which assurances are required, so it is verified before anything it
  // constrains. Two rules, and neither is a formality:
  //
  //   1. an unrecognised value is refused rather than coerced, because guessing the mode is
  //      how a development build becomes a release;
  //   2. a production run must *declare* itself, so this process's mode never depends on
  //      whether someone remembered to export a variable.
  const environment = resolveDesktopEnvironment(options.env ?? process.env);
  const production = isProduction(environment.environment);

  add(
    'environment.recognised',
    environment.violations.length === 0,
    environment.violations[0] ??
      `${DESKTOP_ENVIRONMENT_VAR}=${
        environment.declared ? environment.environment : `unset (treating this run as development)`
      }`,
  );
  add(
    'environment.declared-in-production',
    !production || environment.declared,
    production
      ? 'a production run must declare its environment explicitly'
      : 'not a production run, so an undeclared environment is expected',
  );

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
    // A placeholder signing key stops a development build from shipping and stops a release
    // from existing. That is one fact with two severities, and the environment is what
    // decides which — this is the check that makes the mode load-bearing rather than a label.
    add(
      'updater.pubkey',
      pubkey.length > 0 && !pubkey.startsWith('REPLACE_WITH'),
      pubkey.startsWith('REPLACE_WITH')
        ? production
          ? 'the updater public key is still the placeholder; a production build cannot verify an update signature with it'
          : 'the updater public key is still the placeholder; replace it before the first release'
        : 'an updater public key is configured',
      production ? 'error' : 'warning',
    );
    const endpoints = Array.isArray(updater?.endpoints) ? (updater.endpoints as string[]) : [];
    add(
      'updater.https-only',
      endpoints.length > 0 && endpoints.every((endpoint) => endpoint.startsWith('https://')),
      `update endpoints: ${endpoints.join(', ') || 'none'}`,
    );
    //
    // The endpoint is checked for a reserved placeholder host in production only. `.invalid`
    // is guaranteed never to resolve (RFC 2606), so an update endpoint there is a debug
    // artefact: harmless while developing, and a shipped build that can never be updated.
    const placeholderEndpoints = endpoints.filter((endpoint) => /\.invalid(\/|:|$)/.test(endpoint));
    add(
      'environment.update-endpoint',
      !production || placeholderEndpoints.length === 0,
      placeholderEndpoints.length === 0
        ? 'every update endpoint resolves to a real host'
        : `refused in production: ${placeholderEndpoints.join(', ')} uses the reserved .invalid TLD`,
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

  // ── the process contract, held together across the two implementations ──
  //
  // Phase 6.2 added a supervisor to both halves. These four checks are why "mirrored" means
  // something: a state the shell can report and the interface cannot name, or a deadline that
  // differs between them, would be a status card that lies. None of them proves the Rust code
  // runs (see `unverifiable`); all of them prove the two descriptions are one description.
  const rustProtocol = Number(
    /pub const PROTOCOL_VERSION: u32 = (\d+);/.exec(commandsSource)?.[1] ?? '0',
  );
  add(
    'protocol.agreement',
    rustProtocol === SHELL_PROTOCOL_VERSION,
    `rust=${rustProtocol || 'missing'} typescript=${SHELL_PROTOCOL_VERSION}`,
  );

  const rustStates = rustProcessStates(rustSidecar);
  const statesAgree =
    rustStates.length > 0 && rustStates.join(',') === [...PROCESS_STATES].join(',');
  add(
    'process-state.agreement',
    statesAgree,
    statesAgree
      ? `${rustStates.length} process states agree with @shared/desktop/process`
      : `rust=[${rustStates.join(', ') || 'missing'}] typescript=[${[...PROCESS_STATES].join(', ')}]`,
  );

  const rustPolicy = {
    readyTimeoutMs: rustMillis(rustSidecar, 'READY_TIMEOUT'),
    pollIntervalMs: rustMillis(rustSidecar, 'POLL_INTERVAL'),
    stopTimeoutMs: rustMillis(rustSidecar, 'STOP_TIMEOUT'),
    stableUptimeMs: rustMillis(rustSidecar, 'STABLE_UPTIME'),
    maxRestarts: Number(/pub const MAX_RESTARTS: u32 = (\d+);/.exec(rustSidecar)?.[1] ?? '0'),
  };
  const policyAgrees = (Object.keys(rustPolicy) as (keyof typeof rustPolicy)[]).every(
    (key) => rustPolicy[key] === PROCESS_POLICY[key],
  );
  add(
    'process.policy-agreement',
    policyAgrees,
    policyAgrees
      ? 'every deadline and bound agrees between Rust and PROCESS_POLICY'
      : `rust=${JSON.stringify(rustPolicy)} typescript=${JSON.stringify({
          readyTimeoutMs: PROCESS_POLICY.readyTimeoutMs,
          pollIntervalMs: PROCESS_POLICY.pollIntervalMs,
          stopTimeoutMs: PROCESS_POLICY.stopTimeoutMs,
          stableUptimeMs: PROCESS_POLICY.stableUptimeMs,
          maxRestarts: PROCESS_POLICY.maxRestarts,
        })}`,
  );

  // The one-spawner rule, extended to the Node side. `process.single-spawner` above holds the
  // Rust half; this holds the half Phase 6.2 added, so a second place that can start a process
  // cannot appear quietly in the TypeScript layer either.
  const tsSpawners: string[] = [];
  for (const file of await listTypeScriptFiles(root, 'src')) {
    if (file === 'src/desktop/child-process.ts') continue;
    const source = (await readTextOrNull(join(root, file))) ?? '';
    // An *import* of the module, not the bare name: this file names it in the pattern below,
    // and a check that flagged itself would be switched off rather than fixed.
    if (/(?:from|import)\s*\(?\s*['"]node:child_process['"]/.test(source)) tsSpawners.push(file);
  }
  add(
    'process.single-spawner.typescript',
    tsSpawners.length === 0,
    tsSpawners.length === 0
      ? 'only src/desktop/child-process.ts may spawn a process'
      : `process spawning also appears in: ${tsSpawners.join(', ')}`,
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
    environment,
    unverifiable: [
      'the native build: no Rust toolchain is required for this report, so `cargo build` and the bundle are not exercised here',
      'runtime behaviour of the shell: window show timing, keychain access and single-instance focus need a built app',
      'the Rust supervisor actually running: `process-state.agreement` and `process.policy-agreement` prove the Rust source describes the same machine with the same deadlines, and nothing here compiles or executes it — the Node supervisor in `src/desktop/sidecar.ts`, exercised by tests/desktop-runtime.test.ts against a real child process, is what those claims are tested against',
      'graceful termination on Windows: `sidecar::terminate` sends a real SIGTERM on Unix and falls back to TerminateProcess elsewhere, which is all `std` offers (TDR-12)',
      'the bundled sidecar binary: `npm run build:sidecar` produces it, and its presence is checked at launch, not here',
      'the updater endpoint and signing key: a placeholder key is a warning in development and an error in production, but neither check proves a real key can verify a real signature',
      'the desktop environment of the built binary: this report verifies the environment it was asked to verify as, not the one a packaged app will set',
      'code signing and notarisation for distribution',
      'the rasterisation of the brand source: `npm run brand:assets` produces the icons, and this report only checks that the paths resolve',
    ],
  };
}
