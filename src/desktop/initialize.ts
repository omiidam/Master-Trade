/**
 * Desktop storage initialization.
 *
 * One function opens the local database at the shell's own path, applies pending
 * migrations and returns a handle — or a **failure value** the shell can render. It
 * returns a result rather than throwing on the expected failures on purpose: a corrupted
 * migration ledger is not an exception to be caught and logged, it is a state the shell
 * must show. `tryInitialize` therefore never rejects, and the caller cannot accidentally
 * treat "the database is unusable" as "nothing happened".
 *
 * The failure stages are distinct because they need different words on screen and
 * different remedies:
 *
 *   - `paths`      — the OS would not tell us where the app-data directory is. Nothing
 *                    was opened; a profile or environment problem.
 *   - `database`   — the file could not be opened (driver missing, permissions, a
 *                    directory in place of the file). Retrying will not help by itself.
 *   - `migrations` — the database opened and was then *refused*: an applied migration was
 *                    edited after it ran, or the file was written by a newer build. This
 *                    is the one a user can be told to act on, and the one a silent reset
 *                    would destroy history to avoid.
 *
 * Migration policy is the one already implemented in `db/runner.ts`, unchanged: forward
 * only, checksummed, and a refusal rather than a guess. This module adds no second policy;
 * it classifies the refusal so the shell can report it.
 *
 * Error text is curated, never forwarded. A driver error can contain an absolute path and
 * the shell prints these into a window, so the reason strings here name the *condition*
 * and the paths live on the success value, where a caller that needs them can see them.
 */

import type { AppConfig } from '../core/config.js';
import type { ErrorCode } from '../../packages/shared/src/core/errors.js';
import type { DesktopPlatform } from '../../packages/shared/src/desktop/host.js';
import { AppError } from '../../packages/shared/src/core/errors.js';
import { openDatabase, type DatabaseHandle } from '../db/index.js';
import { resolveDesktopStoragePaths, type DesktopStoragePaths } from './data-paths.js';
import {
  resolveDesktopEnvironment,
  type DesktopEnvironment,
  type DesktopEnvironmentResolution,
} from './environment.js';

/** Map a Node platform string onto the shell's platform names. */
export function detectDesktopPlatform(platform: string = process.platform): DesktopPlatform {
  switch (platform) {
    case 'win32':
      return 'windows';
    case 'darwin':
      return 'macos';
    case 'linux':
      return 'linux';
    default:
      throw new AppError('NOT_IMPLEMENTED', `No desktop data location is defined for ${platform}`, {
        details: { platform },
      });
  }
}

export type DesktopStorageFailureStage = 'paths' | 'database' | 'migrations';

export interface DesktopStorageFailure {
  stage: DesktopStorageFailureStage;
  code: ErrorCode;
  /** Curated, user-presentable, and free of filesystem paths. */
  reason: string;
}

export interface DesktopStorageOptions {
  /** Defaults to the current platform; injected in tests. */
  platform?: DesktopPlatform;
  /** Defaults to the resolved `MASTER_TRADE_ENVIRONMENT`; injected in tests. */
  environment?: DesktopEnvironment;
  env?: Record<string, string | undefined>;
  config: AppConfig;
  /** Override the resolved database file (tests, or an explicit shell choice). */
  databaseFile?: string;
  /** In-memory database: tests only. */
  memory?: boolean;
  /** Apply pending migrations on open. Default true. */
  autoMigrate?: boolean;
}

export type DesktopStorageResult =
  | {
      ok: true;
      environment: DesktopEnvironment;
      environmentDeclared: boolean;
      paths: DesktopStoragePaths;
      database: DatabaseHandle;
    }
  | {
      ok: false;
      environment: DesktopEnvironment;
      environmentDeclared: boolean;
      /** Present when path resolution itself succeeded. */
      paths: DesktopStoragePaths | null;
      failure: DesktopStorageFailure;
    };

function classify(error: unknown): DesktopStorageFailure {
  if (error instanceof AppError) {
    if (error.code === 'CONFLICT') {
      // The runner's message names migration ids, never paths: safe to show verbatim.
      return { stage: 'migrations', code: 'CONFLICT', reason: error.message };
    }
    if (error.code === 'PROVIDER_UNAVAILABLE') {
      return {
        stage: 'database',
        code: 'PROVIDER_UNAVAILABLE',
        reason: 'the local database driver is unavailable in this runtime',
      };
    }
    return {
      stage: 'database',
      code: error.code,
      reason: 'the local database could not be opened',
    };
  }
  return { stage: 'database', code: 'INTERNAL', reason: 'the local database could not be opened' };
}

/**
 * Resolve paths and open the database. Never rejects: an expected failure is a value.
 */
export async function tryInitializeDesktopStorage(
  options: DesktopStorageOptions,
): Promise<DesktopStorageResult> {
  const env = options.env ?? process.env;
  const resolution: DesktopEnvironmentResolution =
    options.environment === undefined
      ? resolveDesktopEnvironment(env)
      : { environment: options.environment, declared: true, violations: [] };
  const environment = resolution.environment;

  let paths: DesktopStoragePaths;
  try {
    paths = resolveDesktopStoragePaths(
      options.platform ?? detectDesktopPlatform(),
      environment,
      env,
    );
  } catch (error) {
    const code = error instanceof AppError ? error.code : 'INTERNAL';
    return {
      ok: false,
      environment,
      environmentDeclared: resolution.declared,
      paths: null,
      failure: {
        stage: 'paths',
        code,
        reason: 'the application data directory could not be located on this system',
      },
    };
  }

  try {
    const database = await openDatabase({
      config: options.config,
      file: options.databaseFile ?? paths.databaseFile,
      ...(options.memory === undefined ? {} : { memory: options.memory }),
      ...(options.autoMigrate === undefined ? {} : { autoMigrate: options.autoMigrate }),
    });
    return {
      ok: true,
      environment,
      environmentDeclared: resolution.declared,
      paths,
      database,
    };
  } catch (error) {
    return {
      ok: false,
      environment,
      environmentDeclared: resolution.declared,
      paths,
      failure: classify(error),
    };
  }
}

/** `tryInitializeDesktopStorage`, but a failure throws the typed error. */
export async function initializeDesktopStorage(
  options: DesktopStorageOptions,
): Promise<Extract<DesktopStorageResult, { ok: true }>> {
  const result = await tryInitializeDesktopStorage(options);
  if (!result.ok) throw new AppError(result.failure.code, result.failure.reason);
  return result;
}
