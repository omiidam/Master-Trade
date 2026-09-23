/**
 * Where the desktop shell keeps its own data.
 *
 * A desktop application has one storage rule that a server does not: **the data does not
 * live next to the code.** An installer upgrade replaces the program directory, and a
 * repository checkout is a working tree someone will `git clean`. Either would erase a
 * learner's history if the database were resolved against the current directory. So the
 * database file, the file-storage root and everything derived from them are resolved
 * against the OS application-data directory (the same base `config.ts` already uses for
 * the shell's own `config.json`), never against `process.cwd()`.
 *
 * Three properties follow from that, and each is load-bearing:
 *
 *   1. **Deterministic.** The path is a pure function of platform, environment and
 *      environment variables. No probing, no fallback to a temp directory, no "first
 *      writable location wins" — a path that depends on what happened to be on disk is a
 *      path that differs between two launches of the same build.
 *   2. **Environment-separated.** Development, test and production data live in sibling
 *      directories, so a development launch can never open — or migrate — the database a
 *      user's real history lives in. This is the desktop form of the same rule
 *      `environment.ts` enforces for release assurances.
 *   3. **Server-only.** This module lives under `src/`, which the frontend cannot reach:
 *      the `@shared/*` alias map is exact-match (ADR-0035), so no UI bundle can import it
 *      and no browser runtime can resolve a desktop filesystem path. Web keeps using its
 *      configured database file; only the shell calls these functions.
 *
 * What this module deliberately does not do
 * -----------------------------------------
 * It does not create directories, open the database or touch the filesystem. It answers
 * "where would it go" as a value, so the answer is testable without writing anything —
 * `storage.ts` is what acts on it.
 */

import { join } from 'node:path';
import type { DesktopPlatform } from '../../packages/shared/src/desktop/host.js';
import type { DesktopEnvironment } from './environment.js';
import { appDataDir } from './config.js';

/** Directory name under the app-data root that holds all shell-owned data. */
export const DESKTOP_DATA_DIR = 'data';
/** The SQLite file, as named in `DEFAULT_CONFIG.database.file`. */
export const DESKTOP_DATABASE_FILE = 'master-trade.db';
/** Directory holding stored file content, keyed by content hash. */
export const DESKTOP_FILE_DIR = 'files';

export interface DesktopStoragePaths {
  /** `<app-data>/data/<environment>` — the root every other path is under. */
  dataRoot: string;
  /** `<dataRoot>/master-trade.db` */
  databaseFile: string;
  /** `<dataRoot>/files` — the containment root for stored content. */
  fileRoot: string;
}

/**
 * Resolve the three paths for a platform and environment.
 *
 * The environment segment comes *before* the file names, so the three modes are disjoint
 * subtrees rather than three files in one directory: a cleanup of `data/development`
 * cannot touch `data/production`, and a mistaken `rm -rf` of one mode's directory is not a
 * directory that holds the others.
 */
export function resolveDesktopStoragePaths(
  platform: DesktopPlatform,
  environment: DesktopEnvironment,
  env: Record<string, string | undefined> = process.env,
): DesktopStoragePaths {
  const dataRoot = join(appDataDir(platform, env), DESKTOP_DATA_DIR, environment);
  return {
    dataRoot,
    databaseFile: join(dataRoot, DESKTOP_DATABASE_FILE),
    fileRoot: join(dataRoot, DESKTOP_FILE_DIR),
  };
}
