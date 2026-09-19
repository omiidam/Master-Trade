/**
 * File storage.
 *
 * Local, content-addressed storage under the app data directory, with a
 * provider interface so remote object storage can be added later without
 * touching callers. Phase 2 deliberately refuses sensitive categories and
 * never writes raw bytes to disk from library code — the in-memory adapter is
 * the only implementation.
 */

import { createHash } from 'node:crypto';
import { PolicyViolationError } from '../core/errors.js';

export type FileCategory = 'document' | 'dataset' | 'chart-image' | 'report-export' | 'attachment';

export type FileSensitivity = 'public' | 'internal' | 'sensitive';

export interface StoredFileMeta {
  id: string;
  ownerId: string;
  category: FileCategory;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  sensitivity: FileSensitivity;
  storage: 'local' | 'remote';
  createdAt: string;
  provenanceRef: string;
}

export interface FileCandidate {
  ownerId: string;
  category: FileCategory;
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
  sensitivity?: FileSensitivity;
}

export interface FilePolicy {
  maxSizeBytes: Record<FileCategory, number>;
  allowedMimeTypes: Record<FileCategory, readonly string[]>;
  /** Sensitive files require an explicit, human-made policy change. */
  allowSensitiveFiles: boolean;
  maxTotalBytes: number;
}

export const DEFAULT_FILE_POLICY: FilePolicy = {
  maxSizeBytes: {
    document: 10 * 1024 * 1024,
    dataset: 64 * 1024 * 1024,
    'chart-image': 8 * 1024 * 1024,
    'report-export': 16 * 1024 * 1024,
    attachment: 10 * 1024 * 1024,
  },
  allowedMimeTypes: {
    document: ['application/pdf', 'text/markdown', 'text/plain'],
    dataset: ['text/csv', 'application/json'],
    'chart-image': ['image/png', 'image/svg+xml'],
    'report-export': ['application/pdf', 'text/markdown'],
    attachment: ['image/png', 'text/plain'],
  },
  allowSensitiveFiles: false,
  maxTotalBytes: 512 * 1024 * 1024,
};

/** Strip directories and traversal attempts; keep a readable basename. */
export function sanitizeFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? '';
  const cleaned = base
    .replace(/[^\w.\- ]+/g, '_')
    .replace(/^\.+/, '')
    .trim();
  return cleaned.length > 0 ? cleaned.slice(0, 180) : 'unnamed';
}

export type FileValidation = { ok: true } | { ok: false; reason: string };

export function validateFileCandidate(
  candidate: FileCandidate,
  policy: FilePolicy,
): FileValidation {
  if (candidate.bytes.byteLength === 0) return { ok: false, reason: 'file is empty' };
  const limit = policy.maxSizeBytes[candidate.category];
  if (candidate.bytes.byteLength > limit) {
    return { ok: false, reason: `file exceeds ${limit} bytes for category ${candidate.category}` };
  }
  const allowed = policy.allowedMimeTypes[candidate.category];
  if (!allowed.includes(candidate.mimeType)) {
    return {
      ok: false,
      reason: `mime type ${candidate.mimeType} not allowed for ${candidate.category}`,
    };
  }
  const sensitivity = candidate.sensitivity ?? 'internal';
  if (sensitivity === 'sensitive' && !policy.allowSensitiveFiles) {
    return {
      ok: false,
      reason: 'sensitive files are not permitted without an explicit storage policy change',
    };
  }
  return { ok: true };
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Storage backend contract. Implementations must never expose raw paths. */
export interface FileStorage {
  put(candidate: FileCandidate): Promise<StoredFileMeta>;
  get(id: string): Promise<StoredFileMeta | undefined>;
  read(id: string): Promise<Uint8Array | undefined>;
  delete(id: string): Promise<boolean>;
  list(ownerId: string): Promise<StoredFileMeta[]>;
  totalBytes(): number;
}

export interface InMemoryFileStorageOptions {
  policy?: FilePolicy;
  /** Injectable id factory keeps tests deterministic. */
  nextId?: () => string;
  now?: () => string;
}

/** In-memory adapter: exercises the full contract without touching disk. */
export class InMemoryFileStorage implements FileStorage {
  private readonly policy: FilePolicy;
  private readonly nextId: () => string;
  private readonly now: () => string;
  private readonly files = new Map<string, StoredFileMeta>();
  private readonly blobs = new Map<string, Uint8Array>();
  private usedBytes = 0;

  constructor(options: InMemoryFileStorageOptions = {}) {
    this.policy = options.policy ?? DEFAULT_FILE_POLICY;
    let counter = 0;
    this.nextId = options.nextId ?? (() => `file_${++counter}`);
    this.now = options.now ?? (() => new Date().toISOString());
  }

  policyRef(): FilePolicy {
    return this.policy;
  }

  async put(candidate: FileCandidate): Promise<StoredFileMeta> {
    const validation = validateFileCandidate(candidate, this.policy);
    if (!validation.ok)
      throw new PolicyViolationError(validation.reason, { category: candidate.category });
    if (this.usedBytes + candidate.bytes.byteLength > this.policy.maxTotalBytes) {
      throw new PolicyViolationError('storage quota exceeded');
    }
    const id = this.nextId();
    const filename = sanitizeFilename(candidate.filename);
    const meta: StoredFileMeta = {
      id,
      ownerId: candidate.ownerId,
      category: candidate.category,
      filename,
      mimeType: candidate.mimeType,
      sizeBytes: candidate.bytes.byteLength,
      sha256: sha256Hex(candidate.bytes),
      sensitivity: candidate.sensitivity ?? 'internal',
      storage: 'local',
      createdAt: this.now(),
      provenanceRef: `file:${id}`,
    };
    this.files.set(id, meta);
    this.blobs.set(id, candidate.bytes);
    this.usedBytes += candidate.bytes.byteLength;
    return meta;
  }

  async get(id: string): Promise<StoredFileMeta | undefined> {
    return this.files.get(id);
  }

  async read(id: string): Promise<Uint8Array | undefined> {
    return this.blobs.get(id);
  }

  async delete(id: string): Promise<boolean> {
    const meta = this.files.get(id);
    if (!meta) return false;
    this.files.delete(id);
    this.blobs.delete(id);
    this.usedBytes -= meta.sizeBytes;
    return true;
  }

  async list(ownerId: string): Promise<StoredFileMeta[]> {
    return [...this.files.values()].filter((meta) => meta.ownerId === ownerId);
  }

  totalBytes(): number {
    return this.usedBytes;
  }
}
