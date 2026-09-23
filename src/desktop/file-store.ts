/**
 * Managed file storage: metadata and content, kept in step.
 *
 * A stored file is two facts in two places — a row in the `files` table saying *whose* it
 * is and what it is, and a blob on disk saying *what it is made of*. This module is the
 * only code that writes both, which is the point: an operation that touches one and not the
 * other is a bug a test can find afterwards, but a single writer can prevent.
 *
 * The failure modes it exists to close
 * ------------------------------------
 *
 *   - **Failed write leaves no metadata.** Bytes are stored first; only a successful write
 *     is recorded. If the write fails, there is nothing to record.
 *   - **Failed metadata leaves no new orphan.** If the row cannot be written, content that
 *     this call *introduced* is removed — content that was already there is left alone,
 *     because another owner's row may share it (content is deduplicated by hash).
 *   - **A missing file is detected, not silent.** `read` refuses rather than returning an
 *     empty buffer, and `verifyIntegrity` names every row whose content is gone.
 *   - **A file cannot belong to another owner.** Ownership is metadata, and the check is
 *     here — bytes are ownerless by construction (`disk.ts`). A row belonging to someone
 *     else is indistinguishable from a row that does not exist, so the check cannot be used
 *     to probe for other owners' file ids.
 *
 * Deletion order is deliberate. Metadata goes first and content second, because the two
 * crash outcomes are not equal: losing the row first leaves an orphan blob, which is
 * invisible to every reader and reclaimable by `reconcile`; deleting the blob first leaves
 * a row that points at nothing, which is a visible failure every time it is read.
 */

import { AppError, PolicyViolationError } from '../../packages/shared/src/core/errors.js';
import {
  DEFAULT_FILE_POLICY,
  sanitizeFilename,
  sha256Hex,
  validateFileCandidate,
  type FileCandidate,
  type FileCategory,
  type FilePolicy,
} from '../storage/files.js';
import type { BlobStore } from '../storage/disk.js';
import type { FileRow, PlatformRepository } from '../db/repositories/platform.js';

export interface ManagedFileStoreOptions {
  repository: PlatformRepository;
  blobs: BlobStore;
  policy?: FilePolicy;
}

export interface StoredFile {
  meta: FileRow;
  bytes: Uint8Array;
}

export interface IntegrityReport {
  /** Rows whose content is absent from the store. */
  missingContent: FileRow[];
  /** Stored content no row references. */
  orphanContent: string[];
}

export interface ReconcileOptions {
  /** Delete orphaned content. Off by default: a scan should not be a destructive act. */
  removeOrphans?: boolean;
}

export interface ReconcileReport extends IntegrityReport {
  removed: string[];
}

/**
 * Metadata categories and sensitivities are declared twice — once for storage
 * (`storage/files.ts`) and once for the schema (`files.sensitivity` is `normal | sensitive`).
 * The mapping lives here rather than in either, because it is a translation between two
 * vocabularies, and a translation belongs at the point they meet.
 */
function schemaSensitivity(sensitivity: FileCandidate['sensitivity']): 'normal' | 'sensitive' {
  return sensitivity === 'sensitive' ? 'sensitive' : 'normal';
}

export class ManagedFileStore {
  private readonly repository: PlatformRepository;
  private readonly blobs: BlobStore;
  private readonly policy: FilePolicy;

  constructor(options: ManagedFileStoreOptions) {
    this.repository = options.repository;
    this.blobs = options.blobs;
    this.policy = options.policy ?? DEFAULT_FILE_POLICY;
  }

  /**
   * Store content and record it. Returns the metadata row.
   *
   * Validation happens before anything is written, so a refused category or an oversized
   * file costs no I/O and leaves no trace.
   */
  async save(candidate: FileCandidate): Promise<FileRow> {
    const validation = validateFileCandidate(candidate, this.policy);
    if (!validation.ok) {
      throw new PolicyViolationError(validation.reason, { category: candidate.category });
    }

    const key = sha256Hex(candidate.bytes);
    const existed = await this.blobs.has(key);
    await this.blobs.write(candidate.bytes);

    try {
      return await this.repository.recordFile({
        ownerId: candidate.ownerId,
        category: candidate.category,
        filename: sanitizeFilename(candidate.filename),
        mimeType: candidate.mimeType,
        sizeBytes: candidate.bytes.byteLength,
        sha256: key,
        sensitivity: schemaSensitivity(candidate.sensitivity),
      });
    } catch (error) {
      // Only content this call introduced is compensated for. Content that was already
      // present may back another row, and removing it would break that row instead.
      if (!existed) await this.blobs.remove(key).catch(() => undefined);
      throw error;
    }
  }

  /**
   * The metadata row, if it exists **and** belongs to `ownerId`. `null` otherwise, so a
   * caller cannot distinguish another owner's file from a missing one.
   */
  async meta(id: string, ownerId: string): Promise<FileRow | null> {
    const row = await this.repository.fileById(id);
    if (!row || row.owner_id !== ownerId) return null;
    return row;
  }

  /**
   * Content for a file this owner holds. `null` when the file is unknown to this owner;
   * throws when the row exists but its content does not, because that is a defect rather
   * than a lookup miss and must not read as "empty file".
   */
  async read(id: string, ownerId: string): Promise<StoredFile | null> {
    const meta = await this.meta(id, ownerId);
    if (!meta) return null;
    const bytes = await this.blobs.read(meta.sha256);
    if (bytes === null) {
      throw new AppError('NOT_FOUND', 'the stored content for this file is missing', {
        details: { fileId: meta.id },
      });
    }
    return { meta, bytes };
  }

  async exists(id: string, ownerId: string): Promise<boolean> {
    return (await this.meta(id, ownerId)) !== null;
  }

  list(ownerId: string): Promise<FileRow[]> {
    return this.repository.filesForOwner(ownerId);
  }

  /**
   * Remove a file this owner holds: metadata first, then content **only when no other row
   * references the same hash** (content is shared between owners by deduplication).
   */
  async delete(id: string, ownerId: string): Promise<boolean> {
    const meta = await this.meta(id, ownerId);
    if (!meta) return false;
    const removed = await this.repository.deleteFile(id);
    if (!removed) return false;
    const stillReferenced = await this.repository.countFilesWithHash(meta.sha256);
    if (stillReferenced === 0) await this.blobs.remove(meta.sha256);
    return true;
  }

  /**
   * Compare metadata against content without changing anything.
   *
   * `missingContent` is scoped to `ownerId` when given. `orphanContent` is never scoped: a
   * blob is referenced if *any* row names it, so a per-owner view would report other
   * owners' content as orphaned and invite a scan to delete live data.
   */
  async verifyIntegrity(ownerId?: string): Promise<IntegrityReport> {
    const scope =
      ownerId === undefined
        ? await this.repository.allFiles()
        : await this.repository.filesForOwner(ownerId);

    const missingContent: FileRow[] = [];
    for (const row of scope) {
      if (!(await this.blobs.has(row.sha256))) missingContent.push(row);
    }

    const allRows = ownerId === undefined ? scope : await this.repository.allFiles();
    const referenced = new Set(allRows.map((row) => row.sha256));
    const orphanContent = (await this.blobs.list()).filter((key) => !referenced.has(key));
    return { missingContent, orphanContent };
  }

  /** `verifyIntegrity`, optionally reclaiming orphaned content. */
  async reconcile(options: ReconcileOptions = {}): Promise<ReconcileReport> {
    const report = await this.verifyIntegrity();
    const removed: string[] = [];
    if (options.removeOrphans === true) {
      for (const key of report.orphanContent) {
        if (await this.blobs.remove(key)) removed.push(key);
      }
    }
    return { ...report, removed };
  }
}

export type { FileCandidate, FileCategory, FileRow };
