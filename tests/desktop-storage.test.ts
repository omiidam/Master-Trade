/**
 * Phase 6.3 — desktop-local storage.
 *
 * Three concerns, tested where each one can actually be wrong:
 *
 *   - **Paths and initialization** are pure-ish: the interesting property is that the
 *     answer does not depend on the current directory, and that a corrupted database is a
 *     reported state rather than a thrown exception the shell would have to guess about.
 *   - **The blob store** is about containment: content addresses path construction, so the
 *     tests try to make it name a file outside its root and require it not to.
 *   - **The managed store** is about the seam between metadata and content: every failure
 *     mode is a partial write, so each test breaks one side and asserts the other did not
 *     silently survive it.
 *
 * Everything runs against real files under a temporary directory and a real SQLite file —
 * the properties being checked (atomic rename, restart persistence, a ledger that refuses
 * tampering) do not exist in a fake.
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { resolveConfig } from '../src/core/config.js';
import { openDatabase, sqliteDriverInfo, type DatabaseHandle } from '../src/db/index.js';
import { detectDesktopPlatform, tryInitializeDesktopStorage } from '../src/desktop/initialize.js';
import { resolveDesktopStoragePaths } from '../src/desktop/data-paths.js';
import { ManagedFileStore } from '../src/desktop/file-store.js';
import {
  assertContainedPath,
  DiskBlobStore,
  isContentKey,
  type BlobStore,
} from '../src/storage/disk.js';
import { sha256Hex, type FileCandidate } from '../src/storage/files.js';
import { PolicyViolationError } from '../packages/shared/src/core/errors.js';
import type { FileRow } from '../src/db/repositories/platform.js';

const driver = sqliteDriverInfo();
const withDatabase = driver.available ? it : it.skip;

const platform = detectDesktopPlatform();
const encoder = new TextEncoder();

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) {
    // A handle left open by a failing test can hold the WAL file on Windows; cleanup is
    // best-effort, and a leftover temp directory is not a test result.
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignored
    }
  }
});

function tempDir(prefix = 'mt-desktop-storage-'): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

/** The environment variables that locate app-data on this platform, rooted in a temp dir. */
function appEnv(root: string): Record<string, string> {
  if (platform === 'windows') return { APPDATA: root };
  if (platform === 'macos') return { HOME: root };
  return { HOME: root, XDG_CONFIG_HOME: join(root, '.config') };
}

interface TestStore {
  handle: DatabaseHandle;
  files: ManagedFileStore;
  blobs: DiskBlobStore;
  ownerOne: string;
  ownerTwo: string;
}

/**
 * A real database, a real store, and two real owners — `files.owner_id` is a foreign key to
 * `users`, so a file cannot be attributed to an owner that does not exist, and the tests
 * must not pretend otherwise.
 */
let storeCounter = 0;
async function openStore(dir: string): Promise<TestStore> {
  const handle = await openDatabase({
    config: resolveConfig(),
    file: join(dir, 'master-trade.db'),
  });
  // `users.display_name` is unique, so two stores over the same file (a restart) must not
  // try to create the same two users again.
  const suffix = ++storeCounter;
  const one = await handle.repositories.identity.createUser({
    displayName: `Owner One ${suffix}`,
    timezone: 'UTC',
  });
  const two = await handle.repositories.identity.createUser({
    displayName: `Owner Two ${suffix}`,
    timezone: 'UTC',
  });
  const blobs = new DiskBlobStore({ root: join(dir, 'files') });
  const files = new ManagedFileStore({ repository: handle.repositories.platform, blobs });
  return { handle, files, blobs, ownerOne: one.id, ownerTwo: two.id };
}

function candidate(ownerId: string, overrides: Partial<FileCandidate> = {}): FileCandidate {
  return {
    ownerId,
    category: 'document',
    filename: 'notes.txt',
    mimeType: 'text/plain',
    bytes: encoder.encode('master trade'),
    ...overrides,
  };
}

describe('desktop data paths', () => {
  it('resolve under the OS application-data directory, never the repository', () => {
    const root = tempDir();
    const paths = resolveDesktopStoragePaths(platform, 'production', appEnv(root));

    expect(paths.dataRoot.startsWith(root)).toBe(true);
    expect(paths.databaseFile.endsWith('master-trade.db')).toBe(true);
    expect(paths.fileRoot.startsWith(paths.dataRoot)).toBe(true);
    // The whole point: it is not the configured, repository-relative default.
    expect(paths.databaseFile).not.toBe(resolve('data/master-trade.db'));
    expect(paths.dataRoot.startsWith(process.cwd())).toBe(false);
  });

  it('separate environments into disjoint subtrees', () => {
    const root = tempDir();
    const env = appEnv(root);
    const dev = resolveDesktopStoragePaths(platform, 'development', env);
    const test = resolveDesktopStoragePaths(platform, 'test', env);
    const prod = resolveDesktopStoragePaths(platform, 'production', env);

    const all = [dev, test, prod];
    expect(new Set(all.map((entry) => entry.databaseFile)).size).toBe(3);
    expect(new Set(all.map((entry) => entry.fileRoot)).size).toBe(3);
    // Disjoint subtrees: neither mode's root contains the other's database.
    expect(prod.databaseFile.startsWith(dev.dataRoot)).toBe(false);
    expect(dev.databaseFile.startsWith(prod.dataRoot)).toBe(false);
  });

  it('are deterministic and independent of the working directory', () => {
    const root = tempDir();
    const first = resolveDesktopStoragePaths(platform, 'development', appEnv(root));
    const second = resolveDesktopStoragePaths(platform, 'development', appEnv(root));
    expect(second).toEqual(first);
  });

  it('use the platform-specific variable for the app-data base', () => {
    const root = tempDir();
    const windows = resolveDesktopStoragePaths('windows', 'production', { APPDATA: root });
    const macos = resolveDesktopStoragePaths('macos', 'production', { HOME: root });
    const linux = resolveDesktopStoragePaths('linux', 'production', {
      HOME: '/unused',
      XDG_CONFIG_HOME: root,
    });
    expect(windows.dataRoot).toContain('Master Trade');
    expect(macos.dataRoot).toContain('Application Support');
    expect(linux.dataRoot).toContain(root);
    expect(windows.dataRoot).not.toBe(macos.dataRoot);
  });

  it('refuse a platform with no defined data location', () => {
    expect(() => detectDesktopPlatform('aix')).toThrow(/No desktop data location/);
  });
});

describe('desktop database initialization', () => {
  it('opens, migrates and reports the applied version', async () => {
    const root = tempDir();
    const result = await tryInitializeDesktopStorage({
      platform,
      environment: 'development',
      env: appEnv(root),
      config: resolveConfig(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(existsSync(result.paths.databaseFile)).toBe(true);
    expect(result.database.report.upToDate).toBe(true);
    expect(result.database.report.databaseVersion).toBe(result.database.report.codeVersion);
    await result.database.close();
  });

  it('persists across a restart', async () => {
    const root = tempDir();
    const env = appEnv(root);
    const config = resolveConfig();

    const first = await tryInitializeDesktopStorage({
      platform,
      environment: 'development',
      env,
      config,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const user = await first.database.repositories.identity.createUser({
      displayName: 'Restart Reader',
      timezone: 'UTC',
    });
    await first.database.close();

    const second = await tryInitializeDesktopStorage({
      platform,
      environment: 'development',
      env,
      config,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    // Reopening applies nothing and finds what the previous launch wrote.
    expect(second.database.report.appliedNow).toEqual([]);
    expect(await second.database.repositories.identity.findUser(user.id)).not.toBeNull();
    await second.database.close();
  });

  withDatabase('refuses a tampered migration ledger instead of resetting', async () => {
    const root = tempDir();
    const env = appEnv(root);
    const config = resolveConfig();

    const first = await tryInitializeDesktopStorage({
      platform,
      environment: 'development',
      env,
      config,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    await first.database.db.execute('UPDATE schema_migrations SET checksum = ? WHERE version = 1', [
      'tampered',
    ]);
    await first.database.close();

    const second = await tryInitializeDesktopStorage({
      platform,
      environment: 'development',
      env,
      config,
    });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.failure.stage).toBe('migrations');
    expect(second.failure.code).toBe('CONFLICT');
    // The refusal names the migration, and never the path it lives at.
    expect(second.failure.reason).toContain('0001');
    expect(second.failure.reason).not.toContain(root);
  });

  withDatabase('refuses a database written by a newer build', async () => {
    const root = tempDir();
    const env = appEnv(root);
    const config = resolveConfig();

    const first = await tryInitializeDesktopStorage({
      platform,
      environment: 'development',
      env,
      config,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    await first.database.db.execute(
      'INSERT INTO schema_migrations (version, id, checksum, applied_at, execution_ms) VALUES (?, ?, ?, ?, ?)',
      [9999, '9999_from_the_future', 'x', new Date().toISOString(), 0],
    );
    await first.database.close();

    const second = await tryInitializeDesktopStorage({
      platform,
      environment: 'development',
      env,
      config,
    });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.failure.stage).toBe('migrations');
  });

  it('reports a database that cannot be opened without leaking the path', async () => {
    const root = tempDir();
    // A directory where the file should be: the driver cannot open it.
    const occupied = join(root, 'occupied.db');
    mkdirSync(occupied, { recursive: true });

    const result = await tryInitializeDesktopStorage({
      platform,
      environment: 'development',
      env: appEnv(root),
      config: resolveConfig(),
      databaseFile: occupied,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.stage).toBe('database');
    expect(result.failure.reason).not.toContain(root);
  });

  it('reports unresolvable paths as their own stage', async () => {
    const result = await tryInitializeDesktopStorage({
      platform: 'windows',
      environment: 'production',
      env: {},
      config: resolveConfig(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.stage).toBe('paths');
    expect(result.paths).toBeNull();
  });

  it('treats an unrecognised environment as development, in its own directory', async () => {
    const root = tempDir();
    const result = await tryInitializeDesktopStorage({
      platform,
      env: { ...appEnv(root), MASTER_TRADE_ENVIRONMENT: 'staging' },
      config: resolveConfig(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.environment).toBe('development');
    expect(result.environmentDeclared).toBe(false);
    expect(result.paths.dataRoot).toContain('development');
    await result.database.close();
  });
});

describe('assertContainedPath', () => {
  const root = resolve('/tmp/mt-root');

  it('accepts a relative path inside the root', () => {
    expect(assertContainedPath(root, 'ab/abc')).toBe(resolve(root, 'ab/abc'));
  });

  it('rejects traversal, absolute paths and NUL bytes', () => {
    expect(() => assertContainedPath(root, '../escape')).toThrow(PolicyViolationError);
    expect(() => assertContainedPath(root, 'ab/../../escape')).toThrow(PolicyViolationError);
    expect(() => assertContainedPath(root, '..')).toThrow(PolicyViolationError);
    expect(() => assertContainedPath(root, '/etc/passwd')).toThrow(PolicyViolationError);
    expect(() => assertContainedPath(root, 'ab\0/abc')).toThrow(PolicyViolationError);
  });
});

describe('disk blob store', () => {
  it('stores content under its hash and reads it back', async () => {
    const dir = tempDir();
    const store = new DiskBlobStore({ root: join(dir, 'files') });
    const bytes = encoder.encode('hello');

    const key = await store.write(bytes);
    expect(key).toBe(sha256Hex(bytes));
    expect(isContentKey(key)).toBe(true);
    expect(await store.has(key)).toBe(true);
    expect(new TextDecoder().decode(await store.read(key))).toBe('hello');
    expect(await store.totalBytes()).toBe(5);
  });

  it('deduplicates identical content and lists only real keys', async () => {
    const dir = tempDir();
    const store = new DiskBlobStore({ root: join(dir, 'files') });
    const bytes = encoder.encode('same');

    await store.write(bytes);
    await store.write(bytes);
    expect(await store.list()).toHaveLength(1);

    // A stray file that is not a content key is not content: a temporary from an
    // interrupted write, and a shard directory name that is not hex at all.
    mkdirSync(join(store.root(), 'zz'), { recursive: true });
    const shard = join(store.root(), 'aa');
    mkdirSync(shard, { recursive: true });
    await writeFile(join(shard, '.tmp-leftover'), 'partial');
    expect(await store.list()).toHaveLength(1);
  });

  it('removes content, and reports a miss for content that is gone', async () => {
    const dir = tempDir();
    const store = new DiskBlobStore({ root: join(dir, 'files') });
    const key = await store.write(encoder.encode('bye'));
    expect(await store.remove(key)).toBe(true);
    expect(await store.remove(key)).toBe(false);
    expect(await store.read(key)).toBeNull();
    expect(await store.has(key)).toBe(false);
  });

  it('refuses a key that is not a content hash', async () => {
    const dir = tempDir();
    const store = new DiskBlobStore({ root: join(dir, 'files') });
    // A caller cannot make the store name a file outside its root: there is no path API,
    // and a non-hash key is refused before a path is built.
    await expect(store.read('../../etc/passwd')).rejects.toThrow(PolicyViolationError);
    await expect(store.has('ab/cd')).rejects.toThrow(PolicyViolationError);
    await expect(store.remove('not-hex')).rejects.toThrow(PolicyViolationError);
  });

  it('returns an empty listing for a root that does not exist yet', async () => {
    const store = new DiskBlobStore({ root: join(tempDir(), 'never-created') });
    expect(await store.list()).toEqual([]);
    expect(await store.totalBytes()).toBe(0);
  });
});

describe('managed file store', () => {
  withDatabase('saves metadata with content and reads it back', async () => {
    const { handle, files, ownerOne } = await openStore(tempDir());
    const row = await files.save(candidate(ownerOne));

    expect(row.owner_id).toBe(ownerOne);
    expect(row.category).toBe('document');
    expect(row.filename).toBe('notes.txt');
    expect(row.size_bytes).toBe(12);
    expect(row.sha256).toBe(sha256Hex(encoder.encode('master trade')));
    expect(row.sensitivity).toBe('normal');

    const stored = await files.read(row.id, ownerOne);
    expect(stored).not.toBeNull();
    expect(new TextDecoder().decode(stored!.bytes)).toBe('master trade');
    await handle.close();
  });

  withDatabase('sanitizes the recorded filename', async () => {
    const { handle, files, ownerOne } = await openStore(tempDir());
    const row = await files.save(candidate(ownerOne, { filename: '../../evil/path.txt' }));
    expect(row.filename).toBe('path.txt');
    expect(row.filename).not.toContain('..');
    expect(row.filename).not.toContain('/');
    await handle.close();
  });

  withDatabase('does not let one owner read another owner’s file', async () => {
    const { handle, files, ownerOne, ownerTwo } = await openStore(tempDir());
    const row = await files.save(candidate(ownerOne));

    expect(await files.meta(row.id, ownerTwo)).toBeNull();
    expect(await files.read(row.id, ownerTwo)).toBeNull();
    expect(await files.exists(row.id, ownerTwo)).toBe(false);
    // And deleting as the wrong owner does nothing.
    expect(await files.delete(row.id, ownerTwo)).toBe(false);
    expect(await files.exists(row.id, ownerOne)).toBe(true);
    await handle.close();
  });

  withDatabase('shares content between owners and keeps it until the last reference', async () => {
    const { handle, files, blobs, ownerOne, ownerTwo } = await openStore(tempDir());
    const bytes = encoder.encode('shared content');
    const a = await files.save(candidate(ownerOne, { bytes }));
    const b = await files.save(candidate(ownerTwo, { bytes }));

    expect(a.sha256).toBe(b.sha256);
    expect(await blobs.list()).toHaveLength(1);

    expect(await files.delete(a.id, ownerOne)).toBe(true);
    // Content is still referenced by the second owner's row.
    expect(await blobs.has(a.sha256)).toBe(true);
    expect((await files.read(b.id, ownerTwo))!.bytes.byteLength).toBe(bytes.byteLength);

    expect(await files.delete(b.id, ownerTwo)).toBe(true);
    expect(await blobs.has(a.sha256)).toBe(false);
    await handle.close();
  });

  withDatabase('detects metadata whose content is missing', async () => {
    const { handle, files, blobs, ownerOne } = await openStore(tempDir());
    const row = await files.save(candidate(ownerOne));

    // Simulate an interrupted operation: the row survived, the content did not.
    await blobs.remove(row.sha256);

    await expect(files.read(row.id, ownerOne)).rejects.toThrow(/stored content/);
    const integrity = await files.verifyIntegrity();
    expect(integrity.missingContent.map((entry) => entry.id)).toEqual([row.id]);
    expect(await files.meta(row.id, ownerOne)).not.toBeNull();
    await handle.close();
  });

  withDatabase('reports orphaned content without removing it unless asked', async () => {
    const { handle, files, blobs, ownerOne } = await openStore(tempDir());
    await files.save(candidate(ownerOne));

    const orphan = await blobs.write(encoder.encode('nobody references me'));
    const scan = await files.verifyIntegrity();
    expect(scan.orphanContent).toEqual([orphan]);

    const conservative = await files.reconcile();
    expect(conservative.removed).toEqual([]);
    expect(await blobs.has(orphan)).toBe(true);

    const reclaiming = await files.reconcile({ removeOrphans: true });
    expect(reclaiming.removed).toEqual([orphan]);
    expect(await blobs.has(orphan)).toBe(false);
    await handle.close();
  });

  withDatabase('leaves no metadata when the content write fails', async () => {
    const { handle } = await openStore(tempDir());
    const failing: BlobStore = {
      write: () => Promise.reject(new Error('disk full')),
      read: () => Promise.resolve(null),
      has: () => Promise.resolve(false),
      remove: () => Promise.resolve(false),
      list: () => Promise.resolve([]),
      totalBytes: () => Promise.resolve(0),
      root: () => '/nowhere',
    };
    const store = new ManagedFileStore({
      repository: handle.repositories.platform,
      blobs: failing,
    });

    await expect(store.save(candidate('usr-one'))).rejects.toThrow('disk full');
    expect(await handle.repositories.platform.allFiles()).toEqual([]);
    await handle.close();
  });

  withDatabase('leaves no orphan when the metadata write fails', async () => {
    const { handle, files, blobs, ownerOne } = await openStore(tempDir());

    // An owner with no `users` row violates the foreign key, so the row cannot be written
    // after the content already is. The store must undo its own write — and to be sure the
    // failure is the foreign key rather than validation, the same save succeeds for a real
    // owner that shares the bytes.
    await expect(files.save(candidate('usr-does-not-exist'))).rejects.toThrow();
    expect(await handle.repositories.platform.allFiles()).toEqual([]);
    expect(await blobs.list()).toEqual([]);

    await files.save(candidate(ownerOne));
    expect(await blobs.list()).toHaveLength(1);
    await handle.close();
  });

  withDatabase('rebuilds cleanly after an interrupted operation, across a restart', async () => {
    const dir = tempDir();
    const first = await openStore(dir);
    const owner = first.ownerOne;
    const row = await first.files.save(candidate(owner));
    await first.handle.close();

    // A crash between "row written" and "content flushed" is the case a restart must see.
    rmSync(join(dir, 'files', row.sha256.slice(0, 2), row.sha256), { force: true });

    const second = await openStore(dir);
    const integrity = await second.files.verifyIntegrity();
    expect(integrity.missingContent.map((entry) => entry.id)).toEqual([row.id]);
    // The metadata is still there and still owned — the scan reports, it does not hide.
    expect((await second.files.meta(row.id, owner))?.sha256).toBe(row.sha256);
    await second.handle.close();
  });

  withDatabase('rejects a file the policy refuses, writing nothing', async () => {
    const { handle, files, blobs, ownerOne } = await openStore(tempDir());
    await expect(
      files.save(candidate(ownerOne, { mimeType: 'application/x-msdownload' })),
    ).rejects.toThrow(PolicyViolationError);
    await expect(files.save(candidate(ownerOne, { bytes: new Uint8Array() }))).rejects.toThrow(
      PolicyViolationError,
    );
    expect(await blobs.list()).toEqual([]);
    expect(await handle.repositories.platform.allFiles()).toEqual([]);
    await handle.close();
  });

  withDatabase(
    'scopes missing content to an owner without calling their live content orphaned',
    async () => {
      const { handle, files, ownerOne, ownerTwo } = await openStore(tempDir());
      const mine = await files.save(candidate(ownerOne));
      const theirs = await files.save(candidate(ownerTwo, { bytes: encoder.encode('theirs') }));

      const scoped = await files.verifyIntegrity(ownerOne);
      expect(scoped.missingContent).toEqual([]);
      // Another owner's content is referenced, so it is not offered up as orphaned.
      expect(scoped.orphanContent).toEqual([]);
      expect((await files.list(ownerOne)).map((entry: FileRow) => entry.id)).toEqual([mine.id]);
      expect(await files.exists(theirs.id, ownerTwo)).toBe(true);
      await handle.close();
    },
  );
});
