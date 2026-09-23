/**
 * One version number, written down in four places.
 *
 * `0.6.0` appears in `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and
 * `src/core/config.ts`. Three of those are read by different build systems — npm, Tauri and
 * Cargo — and the fourth is what the health endpoint reports, so a drift between them is not
 * cosmetic:
 *
 *   - a packaged installer whose `Cargo.toml` version is stale produces a binary that reports
 *     the *old* version through `shell_status`, while its updater metadata says the new one.
 *     The updater then either re-installs what is already there or, worse, decides a newer
 *     build is already present and skips it;
 *   - a `tauri.conf.json` version that lags `package.json` names the bundle differently from
 *     the release notes, so "which build is this?" has two answers.
 *
 * So the version has exactly **one source** — `package.json`, because it is the file every
 * release tool already reads and the only one a human edits — and three **mirrors** that must
 * agree with it. This module is the only place that knows which files those are, what shape the
 * number has in each, and how to rewrite a mirror. `npm run desktop:verify` reports the
 * agreement, and `npm run release:sync-version` makes it true again.
 *
 * What this deliberately is not
 * -----------------------------
 * It is not a build step that generates the version at compile time. Generation would put a
 * derived value in a file people also edit by hand, and the two would then disagree silently.
 * A check that names the drifted file is the more useful failure.
 *
 * The Rust half is not checked by this module — `Cargo.toml` is read as text, so a *Rust*
 * artifact built from a mismatched lockfile is outside what this can see. That is the same
 * boundary `docs/desktop-architecture.md` §7 states for the verifier (TDR-13).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppError } from '../../packages/shared/src/core/errors.js';
import { DEFAULT_CONFIG } from '../core/config.js';

/** The file a human edits. Every mirror has to agree with this one. */
export const VERSION_SOURCE_PATH = 'package.json';

/** A released version: `1.2.3`, optionally with pre-release and build metadata. */
export const APP_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export type VersionSurfaceId =
  'package.json' | 'src-tauri/tauri.conf.json' | 'src-tauri/Cargo.toml' | 'src/core/config.ts';

export interface VersionSurface {
  /** The repository-relative path, which is also how a drift is reported. */
  id: VersionSurfaceId;
  /** `source` is edited by hand; a `mirror` is rewritten from it. */
  role: 'source' | 'mirror';
  /** Why this surface has to agree, in one sentence — the reason, not a restatement. */
  reason: string;
  /** The version as it appears in the file text, or `null` when it cannot be located. */
  read: (text: string) => string | null;
  /** Replace the version inside the file text; `null` for the source, which is not generated. */
  rewrite: ((text: string, version: string) => string) | null;
}

/** Replace `"version": "..."` in a JSON document, preserving key order and indentation. */
function rewriteJsonVersion(text: string, version: string): string {
  const parsed = JSON.parse(text) as Record<string, unknown>;
  parsed.version = version;
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

/**
 * The `version` key inside `DEFAULT_CONFIG`, located structurally rather than by a comment.
 *
 * `src/core/config.ts` also contains `api.version = 'v1'` and `schemaVersion`-shaped fields, so
 * a bare `/version:\s*'([^']+)'/` would find the wrong one. The block anchor plus a bounded scan
 * keeps this reading the app version and nothing else — and returns `null` (a loud failure)
 * rather than a plausible wrong answer if the block is ever restructured.
 */
const CONFIG_BLOCK = /export const DEFAULT_CONFIG: AppConfig = \{([\s\S]{0,800})/;

function configVersionLocator(text: string): { start: number; end: number; value: string } | null {
  const block = CONFIG_BLOCK.exec(text);
  if (!block?.[1]) return null;
  const relative = /^\s*version:\s*'([^']+)'/m.exec(block[1]);
  if (!relative?.[1] || relative.index === undefined) return null;
  const valueStart = block.index + block[0].length - block[1].length + relative.index;
  const valueOffset = relative[0].lastIndexOf("'") + 1;
  const start = valueStart + relative[0].indexOf("'") + 1;
  const end = start + relative[1].length;
  return { start, end, value: relative[1] };
}

/**
 * Every surface, in the order they are reported. Exported because three other things need it:
 * the verifier's `version.agreement` check, the release preflight, and the sync command.
 */
export const VERSION_SURFACES: readonly VersionSurface[] = [
  {
    id: 'package.json',
    role: 'source',
    reason: 'the source of truth: the number a release tool and a human both read',
    read: (text) => (JSON.parse(text) as { version?: string }).version ?? null,
    rewrite: null,
  },
  {
    id: 'src-tauri/tauri.conf.json',
    role: 'mirror',
    reason: 'names the bundle and is what `shell_status` reports as `appVersion`',
    read: (text) => (JSON.parse(text) as { version?: string }).version ?? null,
    rewrite: rewriteJsonVersion,
  },
  {
    id: 'src-tauri/Cargo.toml',
    role: 'mirror',
    reason: 'is the version the compiled binary and the OS uninstall entry carry',
    read: (text) => /^version\s*=\s*"([^"]+)"/m.exec(text)?.[1] ?? null,
    rewrite: (text, version) => text.replace(/^version\s*=\s*"([^"]+)"/m, `version = "${version}"`),
  },
  {
    id: 'src/core/config.ts',
    role: 'mirror',
    reason: 'is what the health endpoint and the API boot report to the shell',
    read: (text) => configVersionLocator(text)?.value ?? null,
    rewrite: (text, version) => {
      const located = configVersionLocator(text);
      if (!located) {
        throw new AppError(
          'VALIDATION_FAILED',
          'could not locate `version` inside DEFAULT_CONFIG in src/core/config.ts, so it cannot be rewritten',
        );
      }
      return `${text.slice(0, located.start)}${version}${text.slice(located.end)}`;
    },
  },
];

export interface VersionSurfaceReading {
  id: VersionSurfaceId;
  role: VersionSurface['role'];
  version: string | null;
  /** Populated when the file could not be read or parsed. */
  problem?: string;
}

export interface VersionAgreementReport {
  /** The declared version, or `null` when the source itself is unreadable or malformed. */
  source: string | null;
  readings: VersionSurfaceReading[];
  /** Mirrors that disagree with the source, or could not be read at all. */
  drift: VersionSurfaceReading[];
  problems: string[];
  ok: boolean;
}

export interface ReadVersionOptions {
  root: string;
  /** Injected so a test can describe a drifted tree without writing one. */
  readFile?: (path: string) => string;
}

function defaultReadFile(path: string): string {
  return readFileSync(path, 'utf8');
}

/**
 * Read every surface and compare it with the source.
 *
 * A surface that cannot be read is drift, not a skip: the alternative is a check that passes
 * because the file it was supposed to inspect was missing.
 */
export function readVersionSurfaces(options: ReadVersionOptions): VersionAgreementReport {
  const readFile = options.readFile ?? defaultReadFile;
  const problems: string[] = [];
  const readings: VersionSurfaceReading[] = [];

  for (const surface of VERSION_SURFACES) {
    let text: string;
    try {
      text = readFile(join(options.root, surface.id));
    } catch (error) {
      readings.push({
        id: surface.id,
        role: surface.role,
        version: null,
        problem: `unreadable: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }

    let version: string | null = null;
    try {
      version = surface.read(text);
    } catch (error) {
      readings.push({
        id: surface.id,
        role: surface.role,
        version: null,
        problem: `unparseable: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }

    if (version === null) {
      readings.push({
        id: surface.id,
        role: surface.role,
        version: null,
        problem: 'no version could be located in this file',
      });
      continue;
    }
    readings.push({ id: surface.id, role: surface.role, version });
  }

  const source = readings.find((entry) => entry.role === 'source')?.version ?? null;
  if (source === null) {
    problems.push(
      `${VERSION_SOURCE_PATH} does not declare a version, so there is no source to agree with`,
    );
  } else if (!APP_VERSION_PATTERN.test(source)) {
    problems.push(
      `${VERSION_SOURCE_PATH} declares "${source}", which is not a semantic version (expected e.g. 1.2.3)`,
    );
  }

  const drift = readings.filter((entry) => entry.role !== 'source' && entry.version !== source);
  return { source, readings, drift, problems, ok: problems.length === 0 && drift.length === 0 };
}

/** Throw with every drifted surface named at once, so one run fixes the whole set. */
export function assertVersionAgreement(options: ReadVersionOptions): VersionAgreementReport {
  const report = readVersionSurfaces(options);
  if (report.ok) return report;
  const lines = [...report.problems];
  for (const entry of report.drift) {
    lines.push(`${entry.id} says ${entry.version ?? `(${entry.problem ?? 'unreadable'})`}`);
  }
  throw new AppError(
    'VALIDATION_FAILED',
    `application version drift — ${VERSION_SOURCE_PATH} says ${report.source ?? '(none)'}, but ${lines.join('; ')}`,
    { details: { source: report.source, drift: report.drift.map((entry) => entry.id) } },
  );
}

/**
 * The mirror rewrites a sync should perform, decided but not yet written.
 *
 * The split between deciding and writing is the whole design: `npm run release:sync-version`
 * writes exactly these, and a test asserts them against a drifted in-memory tree. The rewrite
 * also re-reads its own output, so a rewrite that silently fails to match — a reformatted TOML
 * line, a restructured config block — throws instead of reporting success it cannot evidence.
 */
export function pendingVersionWrites(options: ReadVersionOptions): {
  version: string;
  writes: { id: VersionSurfaceId; path: string; text: string }[];
} {
  const readFile = options.readFile ?? defaultReadFile;
  const report = readVersionSurfaces(options);
  if (report.source === null || !APP_VERSION_PATTERN.test(report.source)) {
    throw new AppError(
      'VALIDATION_FAILED',
      `cannot sync: ${VERSION_SOURCE_PATH} does not declare a valid semantic version`,
    );
  }

  const writes: { id: VersionSurfaceId; path: string; text: string }[] = [];
  for (const surface of VERSION_SURFACES) {
    if (surface.rewrite === null) continue;
    const current = report.readings.find((entry) => entry.id === surface.id);
    if (current?.version === report.source) continue;
    const text = readFile(join(options.root, surface.id));
    const rewritten = surface.rewrite(text, report.source);
    if (rewritten === text) {
      throw new AppError(
        'VALIDATION_FAILED',
        `${surface.id} was rewritten but its text did not change; the version is not where this module thinks it is`,
      );
    }
    writes.push({ id: surface.id, path: join(options.root, surface.id), text: rewritten });
  }

  return { version: report.source, writes };
}

/**
 * The loaded runtime value, which is a *different* fact from the file text.
 *
 * `src/core/config.ts` is read as text by the surface above; this is the value TypeScript
 * actually compiled into `DEFAULT_CONFIG`. They agree unless someone has changed the file since
 * the build, which is exactly the case a release should refuse.
 */
export function runtimeConfigVersion(): string {
  return DEFAULT_CONFIG.version;
}
