/**
 * What a Windows release bundle is allowed to contain.
 *
 * `tauri build` will happily produce an installer from a tree that is missing its sidecar, is
 * carrying a stale version, ships a source map of the entire frontend, or has a private signing
 * key sitting next to it. The bundler is not the place those questions get answered — it is the
 * place they get *packaged* — so they are answered here, before the bundle exists.
 *
 * Two callers, one rule set (which is the point):
 *
 *   - `npm run desktop:verify` reports every check, with release-only ones as warnings, so the
 *     state of the tree is visible on a machine that cannot build anything;
 *   - `npm run release:preflight` runs the same checks in `release` mode and fails closed, which
 *     is what `npm run desktop:package` gates on.
 *
 * A rule that lived in both places would eventually differ in one of them, so there is one copy.
 *
 * What "release mode" changes
 * ---------------------------
 * Only severities — never the rule. A missing sidecar binary is *normal* in a development tree
 * (nobody has run `npm run build:sidecar`) and *fatal* in a release, so the same check reports a
 * warning in one mode and an error in the other. Nothing is skipped, and no check is quiet about
 * being relaxed: the detail line says which mode allowed it.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { AppError } from '../../packages/shared/src/core/errors.js';
import { readVersionSurfaces } from './version.js';

/** The two ways this module is asked to look at a tree. */
export type PackagingMode = 'development' | 'release';

export type CheckSeverity = 'error' | 'warning';

export interface PackagingCheck {
  id: string;
  ok: boolean;
  severity: CheckSeverity;
  detail: string;
  /** True when the check would be an error in `release` mode and is not one here. */
  releaseOnly: boolean;
}

/**
 * Identity a Tauri bundle carries.
 *
 * Read from `tauri.conf.json` rather than duplicated, because these values also decide where the
 * app writes its data (`app.mastertrade.desktop` is the keychain service name from Phase 6.4) and
 * which OS uninstall entry appears. A second copy would be a second answer.
 */
export interface PackagingIdentity {
  productName: string;
  identifier: string;
  version: string;
  category: string;
  shortDescription: string;
  longDescription: string;
  /** Bundle targets as declared: `['all']`, or an explicit list such as `['msi','nsis']`. */
  targets: string[];
}

/**
 * Tauri's own identifier rule: a reverse-DNS name built from `[a-z0-9-]` segments, with no
 * uppercase (some filesystem and bundle code paths are case-sensitive and some are not).
 */
export const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$/;

/** Bundle targets that count as a Windows package. */
export const WINDOWS_BUNDLE_TARGETS = ['msi', 'nsis'] as const;

/** Text patterns that must never appear inside the shipped frontend. */
export const FORBIDDEN_BUNDLE_PATTERNS: readonly { pattern: RegExp; what: string }[] = [
  { pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, what: 'a PEM private key' },
  { pattern: /minisign encrypted secret key/, what: 'a minisign secret key' },
  {
    pattern:
      /(?:TAURI|MASTER_TRADE)_[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)\s*[=:]\s*["'][^"']{8,}["']/,
    what: 'a hard-coded credential read from an environment name',
  },
];

/** Paths inside the frontend distribution that are development-only. */
export const DEV_ARTIFACT_PATTERNS: readonly { pattern: RegExp; what: string }[] = [
  { pattern: /(^|\/)\.env($|\.)/i, what: 'an environment file' },
  { pattern: /(^|\/)\.git($|\/)/, what: 'a git directory' },
  { pattern: /(^|\/)node_modules($|\/)/, what: 'a dependency tree' },
  { pattern: /\.(log|tmp|bak|orig|rej)$/i, what: 'an editor or log artefact' },
  { pattern: /(^|\/)data($|\/)/, what: 'the local runtime data directory' },
  { pattern: /(^|\/)\.DS_Store$/, what: 'an OS metadata file' },
];

/** Extensions that mean signing material, wherever they appear. `.sig` is an update signature. */
export const SIGNING_MATERIAL_EXTENSIONS = ['.pem', '.key', '.p12', '.pfx', '.sig', '.p8'] as const;

/** Directories a repository walk never enters: build output and dependencies, not source. */
const WALK_IGNORES = new Set([
  'node_modules',
  '.git',
  'dist',
  'target',
  'coverage',
  '.vite',
  'binaries',
]);

export interface PackagingFs {
  exists(path: string): boolean;
  readFile(path: string): string;
  /** Entry names directly inside `dir`; `[]` when it does not exist. */
  listDir(dir: string): string[];
  /** Files beneath `dir`, absolute, skipping build output and dependencies. */
  listFiles(dir: string): string[];
}

export function nodePackagingFs(): PackagingFs {
  const listFiles = (dir: string): string[] => {
    const found: string[] = [];
    const walk = (current: string): void => {
      let entries: string[];
      try {
        entries = readdirSync(current);
      } catch {
        return;
      }
      for (const entry of entries) {
        if (WALK_IGNORES.has(entry)) continue;
        const path = join(current, entry);
        let isDirectory = false;
        try {
          isDirectory = statSync(path).isDirectory();
        } catch {
          continue;
        }
        if (isDirectory) walk(path);
        else found.push(path);
      }
    };
    walk(dir);
    return found;
  };

  return {
    exists: (path) => existsSync(path),
    readFile: (path) => readFileSync(path, 'utf8'),
    listDir: (dir) => {
      try {
        return readdirSync(dir);
      } catch {
        return [];
      }
    },
    listFiles,
  };
}

/** The bundle identity declared in `tauri.conf.json`, or `null` when it is not usable. */
export function resolvePackagingIdentity(conf: unknown): PackagingIdentity | null {
  if (!conf || typeof conf !== 'object' || Array.isArray(conf)) return null;
  const record = conf as Record<string, unknown>;
  const bundle = (record.bundle ?? {}) as Record<string, unknown>;
  const single = (value: unknown): string => (typeof value === 'string' ? value : '');
  // `bundle.targets` may be a string ('all') or a list; both mean the same thing to Tauri.
  const targets = bundle.targets;
  const targetList = Array.isArray(targets)
    ? targets.filter((entry): entry is string => typeof entry === 'string')
    : typeof targets === 'string'
      ? [targets]
      : [];
  return {
    productName: single(record.productName),
    identifier: single(record.identifier),
    version: single(record.version),
    category: single(bundle.category),
    shortDescription: single(bundle.shortDescription),
    longDescription: single(bundle.longDescription),
    targets: targetList,
  };
}

/** `all` counts as a Windows target, because Tauri expands it to everything the host can build. */
export function declaresWindowsTarget(targets: readonly string[]): boolean {
  return targets.some(
    (target) => target === 'all' || (WINDOWS_BUNDLE_TARGETS as readonly string[]).includes(target),
  );
}

/** The declared icon list, kept as declared so a missing path is reported by its declared name. */
function declaredIcons(conf: unknown): string[] {
  if (!conf || typeof conf !== 'object') return [];
  const bundle = ((conf as Record<string, unknown>).bundle ?? {}) as Record<string, unknown>;
  return Array.isArray(bundle.icon)
    ? bundle.icon.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function relativeTo(root: string, path: string): string {
  return relative(root, path).split(sep).join('/');
}

export interface PreflightOptions {
  root: string;
  mode: PackagingMode;
  /** The `tauri.conf.json` contents, already parsed. */
  conf: unknown;
  /** Where the built frontend lives, repository-relative. Defaults to `web/dist`. */
  frontendDist?: string;
  fs?: PackagingFs;
}

export interface PackagingReport {
  mode: PackagingMode;
  identity: PackagingIdentity | null;
  checks: PackagingCheck[];
  errors: number;
  warnings: number;
}

/**
 * Run every packaging rule.
 *
 * `releaseOnly` marks the checks whose severity depends on the mode, so a caller can say
 * "these are the things a release would refuse" without re-deriving it from the mode itself.
 */
export function preflightPackaging(options: PreflightOptions): PackagingReport {
  const fs = options.fs ?? nodePackagingFs();
  const root = options.root;
  const release = options.mode === 'release';
  const checks: PackagingCheck[] = [];

  const add = (check: Omit<PackagingCheck, 'releaseOnly'>, releaseOnly = false): void => {
    checks.push({ ...check, releaseOnly });
  };
  /** A check that blocks a release and only warns in a development tree. */
  const releaseGate = (check: Omit<PackagingCheck, 'severity' | 'releaseOnly'>): void => {
    add({ ...check, severity: release ? 'error' : 'warning' }, true);
  };
  const identity = resolvePackagingIdentity(options.conf);

  // ── identity ──────────────────────────────────────────────────────────────
  //
  // The identifier is load-bearing beyond the bundle: it is the keychain service name
  // (Phase 6.4), so an identifier that drifts between the bundle and the keychain would leave
  // stored credentials unreadable. Checked here so a release cannot change it by accident.
  if (identity === null) {
    add({
      id: 'package.identity',
      ok: false,
      severity: 'error',
      detail: 'tauri.conf.json could not be parsed, so the bundle identity is unknown',
    });
  } else {
    const missing = (['productName', 'identifier', 'version'] as const).filter(
      (key) => identity[key].length === 0,
    );
    add({
      id: 'package.identity',
      ok: missing.length === 0,
      severity: 'error',
      detail:
        missing.length === 0
          ? `bundle identity "${identity.productName}" (${identity.identifier}) at ${identity.version}`
          : `tauri.conf.json is missing: ${missing.join(', ')}`,
    });
    add({
      id: 'package.identifier-shape',
      ok: IDENTIFIER_PATTERN.test(identity.identifier),
      severity: 'error',
      detail: IDENTIFIER_PATTERN.test(identity.identifier)
        ? `"${identity.identifier}" is a lowercase reverse-DNS identifier, as the bundle and the keychain namespace both require`
        : `"${identity.identifier}" is not a lowercase reverse-DNS identifier (expected e.g. app.mastertrade.desktop)`,
    });
    add({
      id: 'package.windows-targets',
      ok: declaresWindowsTarget(identity.targets),
      severity: 'error',
      detail: declaresWindowsTarget(identity.targets)
        ? `bundle targets [${identity.targets.join(', ')}] include a Windows package`
        : `bundle targets [${identity.targets.join(', ') || 'none'}] declare no Windows package (expected msi or nsis)`,
    });
  }

  // ── one version number, four places ───────────────────────────────────────
  //
  // The id is the verifier's original `version.agreement`, deliberately: this is the same rule it
  // has always enforced, widened from three files to four. Two ids for one fact is how a report
  // starts disagreeing with itself.
  const versions = readVersionSurfaces({ root, readFile: (path) => fs.readFile(path) });
  add({
    id: 'version.agreement',
    ok: versions.ok,
    severity: 'error',
    detail: versions.ok
      ? `${versions.readings.length} surfaces agree on ${versions.source} (${versions.readings
          .map((entry) => entry.id)
          .join(', ')})`
      : `drift from ${versions.source ?? '(no source)'}: ${[
          ...versions.problems,
          ...versions.drift.map((entry) => `${entry.id} says ${entry.version ?? entry.problem}`),
        ].join('; ')}`,
  });

  // ── icons ─────────────────────────────────────────────────────────────────
  //
  // `tauri build` fails outright on a missing icon, so a path that does not resolve is an error
  // here rather than a surprise during packaging. The macOS `.icns` is reported separately: it
  // cannot be produced without a macOS toolchain, so it never blocks a Windows report.
  const icons = declaredIcons(options.conf);
  const iconPath = (icon: string): string => join(root, 'src-tauri', icon);
  const missingIcons = icons.filter(
    (icon) => !fs.exists(iconPath(icon)) && !icon.endsWith('.icns'),
  );
  add({
    id: 'bundle.icons-present',
    ok: icons.length > 0 && missingIcons.length === 0,
    severity: 'error',
    detail:
      icons.length === 0
        ? 'bundle.icon is empty; a packaged application needs at least one icon'
        : missingIcons.length === 0
          ? `${icons.length} icon(s) referenced, all present (generated by \`npm run brand:assets\`)`
          : `referenced but missing: ${missingIcons.join(', ')} — run \`npm run brand:assets\``,
  });
  const windowsIcons = icons.filter((icon) => icon.endsWith('.ico'));
  add({
    id: 'package.icon-windows',
    ok: windowsIcons.length === 1,
    severity: 'error',
    detail:
      windowsIcons.length === 1
        ? `the Windows icon is declared (${windowsIcons[0]})`
        : `a Windows bundle needs exactly one .ico in bundle.icon; found ${windowsIcons.length}`,
  });
  const missingMacIcons = icons.filter(
    (icon) => icon.endsWith('.icns') && !fs.exists(iconPath(icon)),
  );
  add(
    {
      id: 'bundle.icons-macos',
      ok: missingMacIcons.length === 0,
      severity: 'warning',
      detail:
        missingMacIcons.length === 0
          ? 'the macOS icon bundle is present'
          : `${missingMacIcons.join(', ')} is generated by \`npm run desktop:icons\` (needs @tauri-apps/cli); a macOS bundle cannot be built without it`,
    },
    false,
  );

  // ── the sidecar the shell launches ────────────────────────────────────────
  const bundle = ((options.conf as Record<string, unknown> | null)?.bundle ?? {}) as Record<
    string,
    unknown
  >;
  const externalBin = Array.isArray(bundle.externalBin)
    ? bundle.externalBin.filter((entry): entry is string => typeof entry === 'string')
    : [];
  add({
    id: 'bundle.externalBin',
    ok: externalBin.length === 1 && externalBin[0] === 'binaries/master-trade-api',
    severity: 'error',
    detail: `externalBin is [${externalBin.join(', ')}]; exactly one bundled binary is expected`,
  });
  // The declaration is static; the artifact is not. `npm run build:sidecar` produces it on a
  // machine with a Rust toolchain, so its absence is a statement about *this* tree.
  const sidecarBinaries = fs
    .listDir(join(root, 'src-tauri', 'binaries'))
    .filter((name) => /^master-trade-api/.test(name));
  releaseGate({
    id: 'package.sidecar-built',
    ok: sidecarBinaries.length > 0,
    detail:
      sidecarBinaries.length > 0
        ? `the sidecar binary is present: ${sidecarBinaries.join(', ')}`
        : 'no sidecar binary in src-tauri/binaries — run `npm run build:sidecar` on the build machine',
  });

  // ── the frontend that ships inside it ─────────────────────────────────────
  const distPath = join(root, options.frontendDist ?? 'web/dist');
  const distFiles = fs.listFiles(distPath);
  releaseGate({
    id: 'package.frontend-dist',
    ok: fs.exists(join(distPath, 'index.html')),
    detail: fs.exists(join(distPath, 'index.html'))
      ? `the built frontend is present (${distFiles.length} file(s))`
      : 'web/dist/index.html is missing — run `npm run build:web` before packaging',
  });

  // Source maps are development artefacts: a release that ships one ships the frontend's whole
  // source, and this repository did exactly that (`vite.config.ts` had `sourcemap: true`) until
  // this check existed. Errors always — a map is never part of a release, built or not.
  const maps = distFiles.filter((file) => file.endsWith('.map'));
  add({
    id: 'package.no-source-maps',
    ok: maps.length === 0,
    severity: 'error',
    detail:
      maps.length === 0
        ? 'no source map ships in the bundle'
        : `${maps.length} source map(s) in the bundle: ${maps
            .slice(0, 3)
            .map((file) => relativeTo(distPath, file))
            .join(
              ', ',
            )}${maps.length > 3 ? ', …' : ''} — set MASTER_TRADE_SOURCEMAPS=1 only for local debugging`,
  });

  const devArtifacts = distFiles.filter((file) =>
    DEV_ARTIFACT_PATTERNS.some((rule) => rule.pattern.test(relativeTo(distPath, file))),
  );
  add({
    id: 'package.no-dev-artifacts',
    ok: devArtifacts.length === 0,
    severity: 'error',
    detail:
      devArtifacts.length === 0
        ? 'the bundle carries no environment file, git directory, dependency tree or log artefact'
        : `${devArtifacts.length} development file(s) would ship: ${devArtifacts
            .slice(0, 5)
            .map((file) => relativeTo(distPath, file))
            .join(', ')}`,
  });

  // A bundle is a public artifact, so this scans the *built* frontend rather than the source.
  // Source scanning would be noise; bundling is the step that turns a mistake into a leak.
  const leaks: string[] = [];
  for (const file of distFiles) {
    if (/\.(png|jpe?g|ico|woff2?|ttf|icns|gif|webp|wasm|map)$/i.test(file)) continue;
    let text: string;
    try {
      text = fs.readFile(file);
    } catch {
      continue;
    }
    for (const rule of FORBIDDEN_BUNDLE_PATTERNS) {
      if (rule.pattern.test(text))
        leaks.push(`${relativeTo(distPath, file)} contains ${rule.what}`);
    }
  }
  add({
    id: 'package.no-secret-material',
    ok: leaks.length === 0,
    severity: 'error',
    detail:
      leaks.length === 0
        ? 'no private key, secret key or hard-coded credential appears in the built frontend'
        : leaks.slice(0, 3).join('; '),
  });

  // ── nothing that could sign anything, anywhere in the tree ────────────────
  //
  // The strongest version of "no private signing key in the repository" is not a review step: it
  // is a check that walks the tree. A key that exists is a key that can be committed, and the
  // release material belongs in a CI secret or on the release machine, never here.
  const keyMaterial: string[] = [];
  for (const file of fs.listFiles(root)) {
    const lower = file.toLowerCase();
    if (SIGNING_MATERIAL_EXTENSIONS.some((extension) => lower.endsWith(extension))) {
      keyMaterial.push(relativeTo(root, file));
    }
  }
  add({
    id: 'package.no-signing-material',
    ok: keyMaterial.length === 0,
    severity: 'error',
    detail:
      keyMaterial.length === 0
        ? `no ${SIGNING_MATERIAL_EXTENSIONS.join('/')} file exists anywhere in the tree`
        : `signing material is present in the repository: ${keyMaterial.slice(0, 5).join(', ')} — a release key belongs in a CI secret, never in a commit`,
  });

  return {
    mode: options.mode,
    identity,
    checks,
    errors: checks.filter((check) => !check.ok && check.severity === 'error').length,
    warnings: checks.filter((check) => !check.ok && check.severity === 'warning').length,
  };
}

/**
 * Refuse to package a tree that is not releasable.
 *
 * Separate from `preflightPackaging` because the caller's choice matters: `desktop:verify` wants
 * the report, and the packaging command wants a refusal with every problem listed at once —
 * fixing a release one error per run is how a build machine gets a reputation.
 */
export function assertPackagingReady(
  root: string,
  conf: unknown,
  /** Injected so the refusal path is testable without a fixture checkout. */
  fs: PackagingFs = nodePackagingFs(),
): PackagingReport {
  const report = preflightPackaging({ root, mode: 'release', conf, fs });
  if (report.errors > 0) {
    const failures = report.checks.filter((check) => !check.ok && check.severity === 'error');
    throw new AppError(
      'POLICY_VIOLATION',
      `refusing to package: ${failures.length} release check(s) failed — ${failures
        .map((check) => `${check.id}: ${check.detail}`)
        .join(' | ')}`,
      { details: { failed: failures.map((check) => check.id) } },
    );
  }
  return report;
}
