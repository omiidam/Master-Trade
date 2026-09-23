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
import {
  KNOWN_CREDENTIALS,
  SECRET_NAMESPACE,
  SECRET_NAMESPACE_PREFIX,
} from '../../packages/shared/src/desktop/secrets.js';
import { HANDSHAKE_STATES } from './handshake.js';
import { preflightPackaging } from './packaging.js';
import { reviewSigning } from './signing.js';
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
  return rustStringList(source, 'STATES');
}

/**
 * A `pub const <NAME>: [&str; n] = [...]` string list from Rust, in declaration order.
 *
 * One reader for both mirrored lists, so the process states and the handshake states are compared
 * by the same code and a third list costs a constant rather than a copy of this function.
 */
function rustStringList(source: string, name: string): string[] {
  const match = new RegExp(`pub const ${name}: \\[&str; \\d+\\] = \\[([\\s\\S]*?)\\];`).exec(
    source,
  );
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

    const main = windows.find((window) => window.label === 'main');
    add(
      'window.hidden-until-ready',
      main?.visible === false,
      main?.visible === false
        ? 'the main window starts hidden and is shown after the API answers'
        : 'the main window must start hidden so it never renders against a dead API',
    );
  }

  // ── packaging: what a release bundle is allowed to contain ────────────────
  //
  // Phase 6.5 moved every rule about the bundle into `packaging.ts`, so the verifier and
  // `npm run release:preflight` cannot disagree about what a releasable tree is. The checks are
  // reported here with release-only ones as warnings — a missing sidecar binary is normal in a
  // development tree and fatal in a release, and the detail line says which mode allowed it.
  const packaging = preflightPackaging({ root, mode: 'development', conf });
  for (const check of packaging.checks) {
    add(check.id, check.ok, check.detail, check.severity);
  }

  // ── update signing material ───────────────────────────────────────────────
  //
  // One rule, in `signing.ts`: in production, absent, placeholder or malformed signing material is
  // an error rather than a warning — there is no third state in which a build is "probably fine to
  // ship". This report is a development one, so a placeholder is a warning here and the release
  // gate is what refuses.
  const signing = reviewSigning(conf, environment.environment);
  for (const aspect of signing.aspects) {
    add(
      aspect.id,
      aspect.state === 'valid',
      aspect.detail,
      aspect.blocksRelease && production ? 'error' : 'warning',
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

  // ── credential boundary (Phase 6.4) ──────────────────────────────────────
  //
  // The keychain is the one place a secret exists in the clear, so the assertions about it are
  // machine-checked rather than described. None of these executes the Rust (see `unverifiable`);
  // all of them refuse a build whose keychain access is wider than the contract allows.
  const secretsSource = (await readTextOrNull(join(tauriDir, 'src', 'secrets.rs'))) ?? '';
  const rustNamespace = /pub const NAMESPACE: &str = "([^"]+)";/.exec(secretsSource)?.[1] ?? '';
  add(
    'secrets.namespace-agreement',
    rustNamespace.length > 0 && rustNamespace === SECRET_NAMESPACE_PREFIX,
    rustNamespace === SECRET_NAMESPACE_PREFIX
      ? `the keychain namespace "${rustNamespace}" matches the shared contract`
      : `rust="${rustNamespace || 'missing'}" shared="${SECRET_NAMESPACE_PREFIX}"`,
  );

  // One file may touch the keychain crate. A second one is how two wrappers with different
  // validation rules appear, and the weaker one is always the one a later change reaches for.
  const keyringFiles: string[] = [];
  for (const file of await readdir(join(tauriDir, 'src'))) {
    if (!file.endsWith('.rs')) continue;
    const source = (await readTextOrNull(join(tauriDir, 'src', file))) ?? '';
    if (/keyring/.test(source)) keyringFiles.push(file);
  }
  add(
    'secrets.single-keyring-file',
    keyringFiles.length === 1 && keyringFiles[0] === 'secrets.rs',
    keyringFiles.length === 1 && keyringFiles[0] === 'secrets.rs'
      ? 'only secrets.rs reaches the OS keychain'
      : `the keychain crate is also referenced in: ${keyringFiles.filter((f) => f !== 'secrets.rs').join(', ') || 'nothing'}`,
  );

  // Naming: a command that can touch a credential is a `secure_store_*` command, so the surface
  // that reaches the keychain is one prefix long and visible in a diff.
  const credentialedCommands = commandsSource
    .split('#[tauri::command]')
    .slice(1)
    .map((block) => ({
      name: /fn\s+([a-z0-9_]+)/.exec(block)?.[1] ?? '',
      touches: /secrets::/.test(block),
    }))
    .filter((entry) => entry.touches && entry.name.length > 0)
    .map((entry) => entry.name);
  const misnamedCommands = credentialedCommands.filter((name) => !name.startsWith('secure_store_'));
  add(
    'secrets.commands-narrow',
    misnamedCommands.length === 0 && credentialedCommands.length > 0,
    misnamedCommands.length === 0
      ? `${credentialedCommands.length} credential command(s), all under the secure_store_ prefix`
      : `commands reaching the keychain outside that prefix: ${misnamedCommands.join(', ')}`,
  );

  // No enumeration: nothing may list, dump or export what is stored. `secure_store_has` answers
  // about one named credential and is the only existence question the surface can ask.
  const enumerating = [...SHELL_COMMANDS, ...rustSurface].filter((name) =>
    /(list|dump|export|all)[-_]?secrets?|secrets?[-_]?(list|dump|export)/i.test(name),
  );
  add(
    'secrets.no-enumeration',
    enumerating.length === 0 && !/pub fn\s+(list|all)_/.test(secretsSource),
    enumerating.length === 0
      ? `no command enumerates credentials; ${KNOWN_CREDENTIALS.length} credential(s) are declared in the contract`
      : `enumerating command(s): ${enumerating.join(', ')}`,
  );

  const declaredNamespaced = KNOWN_CREDENTIALS.every((credential, index) =>
    index === KNOWN_CREDENTIALS.findIndex((other) => other.id === credential.id)
      ? credential.id.startsWith(SECRET_NAMESPACE_PREFIX)
      : true,
  );
  add(
    'secrets.credentials-namespaced',
    declaredNamespaced && SECRET_NAMESPACE.length > 0,
    declaredNamespaced
      ? `every declared credential lives under "${SECRET_NAMESPACE_PREFIX}"`
      : 'a declared credential is outside the namespace',
  );

  // A secret is not Brain memory (ADR-0054, docs/desktop-secure-storage.md §9). The reasoning
  // path and the memory store take values from a caller; a credential reaches them only if one
  // of them *asks for it*, and the way that starts is an import. Refusing the import is what
  // makes the isolation structural rather than a property of today's call sites, and it is the
  // half of the invariant a test cannot hold on its own: tests/desktop-secure-storage.test.ts
  // asserts the same absence by driving a real turn, and this one refuses the build.
  const reasoningRoots = ['src/agent', 'src/memory'];
  const credentialReference = /(?:secure-store|credential-vault|desktop\/secrets)[.'"/]/;
  const reasoningLeaks: string[] = [];
  for (const dir of reasoningRoots) {
    for (const file of await listTypeScriptFiles(root, dir)) {
      const source = (await readTextOrNull(join(root, file))) ?? '';
      if (credentialReference.test(source)) reasoningLeaks.push(file);
    }
  }
  add(
    'secrets.isolated-from-reasoning',
    reasoningLeaks.length === 0,
    reasoningLeaks.length === 0
      ? 'no file under src/agent or src/memory reaches the credential layer'
      : `the credential layer is imported by the reasoning path: ${reasoningLeaks.join(', ')}`,
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

  const typescriptSidecar =
    (await readTextOrNull(join(root, 'src', 'desktop', 'sidecar.ts'))) ?? '';

  // ── the build-version handshake, held together across the two implementations ──
  //
  // Phase 6.6 added a third clause to readiness: the API must be the build the shell shipped.
  // These three checks are what make "mirrored" true for it. They prove the two halves describe
  // one rule and that each half *applies* it — none of them compiles or runs the Rust code (see
  // `unverifiable`), so a green here means "the same rule is written in both places", not "the
  // packaged app refuses a mismatched API".
  const rustHandshakeStates = rustStringList(rustSidecar, 'HANDSHAKE_STATES');
  const handshakeStatesAgree =
    rustHandshakeStates.length > 0 &&
    rustHandshakeStates.join(',') === [...HANDSHAKE_STATES].join(',');
  add(
    'handshake.state-agreement',
    handshakeStatesAgree,
    handshakeStatesAgree
      ? `${rustHandshakeStates.length} handshake states agree with src/desktop/handshake.ts`
      : `rust=[${rustHandshakeStates.join(', ') || 'missing'}] typescript=[${[...HANDSHAKE_STATES].join(', ')}]`,
  );

  const healthHandler =
    (await readTextOrNull(join(root, 'src', 'server', 'handlers', 'health.ts'))) ?? '';
  add(
    'handshake.api-reports-version',
    /version:\s*config\.version/.test(healthHandler),
    /version:\s*config\.version/.test(healthHandler)
      ? 'GET /v1/health reports the compiled config version, which is what the handshake reads'
      : 'GET /v1/health no longer reports the config version: the handshake has nothing to compare',
  );

  const typescriptGate =
    /awaitMatchingBuild\(plan\)/.test(typescriptSidecar) &&
    /isHandshakeCompatible\(result\)/.test(typescriptSidecar);
  add(
    'handshake.readiness-gate.typescript',
    typescriptGate,
    typescriptGate
      ? 'the supervisor checks the handshake before reporting `ready`'
      : 'src/desktop/sidecar.ts no longer gates `ready` on the handshake: a mismatched API would be reported as ready',
  );

  // The Rust half must do more than define the rule: it has to apply it between the health poll
  // and `mark_ready`, or a packaged app would reach `ready` on an API from another build.
  const rustGate = /let \(handshake_state, refusal\) = handshake\(/.test(rustSidecar);
  const rustMarkReady = /mark_ready\(pid\)/.test(rustSidecar);
  add(
    'handshake.readiness-gate.rust',
    rustGate && rustMarkReady,
    rustGate && rustMarkReady
      ? 'sidecar.rs applies the handshake after health and before mark_ready'
      : 'sidecar.rs does not apply the handshake before mark_ready: the packaged app would report ready on a mismatched API',
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

  // `version.agreement` is reported by the packaging block above, which owns the rule: four
  // surfaces rather than three, because `src/core/config.ts` is what the health endpoint reports
  // and it had already drifted out of this check's sight once.

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
      'the Rust build-version handshake actually running: `handshake.state-agreement`, `handshake.readiness-gate.rust` and `handshake.api-reports-version` prove the rule is written in both halves and that the health route still reports a version, and nothing here compiles or executes the Rust side — the decision itself is tested in TypeScript by tests/desktop-hardening.test.ts, against the same four states',
      'the bundled sidecar binary: `npm run build:sidecar` produces it, and its presence is checked at launch, not here',
      'the updater endpoint and signing key: a placeholder key is a warning in development and an error in production, but neither check proves a real key can verify a real signature — signing.ts reviews whether material is *usable*, and Tauri verifies a real signature at install time',
      'the packaging rules in release mode: `packaging.ts` is also what `npm run release:preflight` refuses on, so a check that passes here in development has not been tested at release severity',
      'the desktop environment of the built binary: this report verifies the environment it was asked to verify as, not the one a packaged app will set',
      'code signing and notarisation for distribution',
      'the rasterisation of the brand source: `npm run brand:assets` produces the icons, and this report only checks that the paths resolve',
    ],
  };
}
