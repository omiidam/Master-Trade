/**
 * Disk content storage.
 *
 * The byte layer behind `FileStorage` (Phase 2), now with a real implementation. Two
 * decisions shape it, and both come from the schema rather than from convenience: the
 * `files` table comment says *"bytes live in managed storage keyed by content hash"*, so
 * the store is **content-addressed** and holds no ownership at all.
 *
 *   - **The key is the SHA-256 of the content.** Writing the same bytes twice writes one
 *     file, and a key that was never written cannot be read by guessing a name — there is
 *     no name, only a hash of the thing itself. Authorisation is therefore not attempted
 *     here: a blob has no owner, and answering "whose file is this" is metadata, which
 *     lives in the database and is enforced by `ManagedFileStore`. Splitting the two is
 *     what keeps "bytes" and "who may see them" from being one confused question.
 *   - **Paths are derived, never accepted.** The only key this store will accept is 64
 *     lowercase hex characters, and the path is built from two of them. There is no API
 *     that takes a path from a caller, so there is nothing to traverse *from*; the
 *     `assertContainedPath` check below is the second line, for any future caller that
 *     does pass a relative name.
 *
 * Writes are atomic: content is written to a temporary file in the target directory and
 * then renamed over the final name. A crash mid-write therefore leaves a stray temporary
 * file — which `list()` ignores and the shell can sweep — rather than a truncated blob
 * that hashes to something it is not.
 */

import { mkdir, readdir, rename, rm, stat, unlink, writeFile, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import { PolicyViolationError } from '../../packages/shared/src/core/errors.js';
import { sha256Hex } from './files.js';

const KEY_PATTERN = /^[0-9a-f]{64}$/;
const TEMP_PREFIX = '.tmp-';

export function isContentKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

/**
 * Resolve `relative` under `root`, refusing anything that escapes it.
 *
 * This is the containment rule stated once. It refuses, in order: a NUL byte (which can
 * truncate a path in a lower layer), an absolute path (a caller naming a location rather
 * than a key), a normalized path that still begins at `..`, and — the check that makes the
 * others belt-and-braces — a resolved path that is not the root itself nor under it. The
 * final check is what catches platform spellings (a drive-relative `C:foo` on Windows, a
 * symlink-flavoured `..` sequence) that the earlier ones can miss.
 */
export function assertContainedPath(root: string, relativePath: string): string {
  if (relativePath.includes('\0')) {
    throw new PolicyViolationError('storage path contains a NUL byte');
  }
  if (isAbsolute(relativePath)) {
    throw new PolicyViolationError('storage path must be relative to the storage root');
  }
  const normalized = normalize(relativePath);
  if (normalized === '..' || normalized.startsWith(`..${sep}`)) {
    throw new PolicyViolationError('storage path escapes the storage root');
  }
  const rootResolved = resolve(root);
  const target = resolve(rootResolved, normalized);
  if (target !== rootResolved && !target.startsWith(rootResolved + sep)) {
    throw new PolicyViolationError('storage path escapes the storage root');
  }
  return target;
}

/**
 * Byte storage. Ownership is deliberately absent: this is the layer below it.
 */
export interface BlobStore {
  /** Store content, returning its content key. Idempotent for identical bytes. */
  write(bytes: Uint8Array): Promise<string>;
  read(key: string): Promise<Uint8Array | null>;
  has(key: string): Promise<boolean>;
  remove(key: string): Promise<boolean>;
  /** Every stored key, ignoring temporary files. */
  list(): Promise<string[]>;
  totalBytes(): Promise<number>;
  root(): string;
}

export interface DiskBlobStoreOptions {
  root: string;
}

export class DiskBlobStore implements BlobStore {
  private readonly storageRoot: string;

  constructor(options: DiskBlobStoreOptions) {
    this.storageRoot = resolve(options.root);
  }

  root(): string {
    return this.storageRoot;
  }

  /** `<root>/<first two hex>/<key>` — a two-level fan-out, so one directory holds a
   * manageable number of entries as the store grows. */
  private pathFor(key: string): string {
    if (!isContentKey(key)) {
      throw new PolicyViolationError('not a content key', { details: { keyLength: key.length } });
    }
    return assertContainedPath(this.storageRoot, join(key.slice(0, 2), key));
  }

  async write(bytes: Uint8Array): Promise<string> {
    const key = sha256Hex(bytes);
    const target = this.pathFor(key);
    await mkdir(dirname(target), { recursive: true });

    // Content-addressed: identical bytes are already stored. Rewriting would be wasted
    // work, and skipping it keeps a concurrent reader from seeing a torn file.
    if (await this.exists(target)) return key;

    const temporary = join(dirname(target), `${TEMP_PREFIX}${key}-${process.pid}-${Date.now()}`);
    try {
      await writeFile(temporary, bytes);
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
    return key;
  }

  private async exists(path: string): Promise<boolean> {
    try {
      const info = await stat(path);
      return info.isFile();
    } catch {
      return false;
    }
  }

  async read(key: string): Promise<Uint8Array | null> {
    const target = this.pathFor(key);
    try {
      const bytes = await readFile(target);
      return new Uint8Array(bytes);
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') return null;
      throw error;
    }
  }

  async has(key: string): Promise<boolean> {
    return this.exists(this.pathFor(key));
  }

  async remove(key: string): Promise<boolean> {
    const target = this.pathFor(key);
    try {
      await unlink(target);
      return true;
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') return false;
      throw error;
    }
  }

  /**
   * Every valid key under the root. Walks the two-level layout directly rather than
   * recursing blindly, so a directory that is not part of the scheme is not mistaken for
   * content, and temporary files are excluded by the key pattern.
   */
  async list(): Promise<string[]> {
    let shards: string[];
    try {
      shards = await readdir(this.storageRoot);
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') return [];
      throw error;
    }

    const keys: string[] = [];
    for (const shard of shards) {
      if (!/^[0-9a-f]{2}$/.test(shard)) continue;
      const shardPath = assertContainedPath(this.storageRoot, shard);
      let entries: string[];
      try {
        entries = await readdir(shardPath);
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!isContentKey(entry)) continue;
        // A key whose bytes sit under the wrong shard is not a readable blob. Keep the
        // invariant that shard(entry) === entry, so `list()` cannot report a key `read()`
        // would fail to find.
        if (relative(this.storageRoot, shardPath) !== entry.slice(0, 2)) continue;
        if (await this.exists(join(shardPath, entry))) keys.push(entry);
      }
    }
    return keys;
  }

  async totalBytes(): Promise<number> {
    const keys = await this.list();
    let total = 0;
    for (const key of keys) {
      try {
        const info = await stat(this.pathFor(key));
        total += info.size;
      } catch {
        // Vanished between listing and stat: not counted, not an error.
      }
    }
    return total;
  }
}
