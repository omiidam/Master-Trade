# ADR-0053 — bytes have no owner, and metadata has no path

- **Status:** Accepted
- **Decision id:** `DEC-DESKTOP-8-STORAGE`
- **Phase:** 6.3 (Local Database & File System)
- **Depends on:** ADR-0001 (Tauri over Electron), ADR-0025 (SQLite through `node:sqlite`), ADR-0029
  (WebView capability boundary), ADR-0035 (the shared frontend/backend surface), ADR-0051 (the shell
  hosts and the domain decides), ADR-0052 (one process machine, two implementations).

## Context

Phases 1–5 built a database layer that is unusually complete for a product at this stage: a schema
declared as data, dialect-generated DDL, a migration ledger with checksums that refuses drift,
tampering and downgrades, and a repository per table with ownership asserted against the schema. What
they did not build is a place for any of it to live **on a desktop**, or a way to store a file's
bytes at all — `FileStorage` had exactly one implementation, and it was in memory.

Phase 6.3 had to add the missing layer without weakening the existing one, and met four facts that
pulled in different directions:

1. **A desktop database path is not a server database path.** The configured default,
   `database.file = 'data/master-trade.db'`, is resolved against the working directory. That is right
   for a self-hosted server run from its checkout and wrong for an installed application, where an
   upgrade replaces the program directory.
2. **The schema already said what file storage is.** The `files` table's description reads _"bytes
   live in managed storage keyed by content hash"_ — content-addressed, and with no path column.
3. **`files.owner_id` is a foreign key to `users`.** Attribution is a database fact, not a filesystem
   fact, and the database is where it is enforced.
4. **A stored file is two writes.** Bytes on disk and a row in the table. Any two writes can be
   interrupted between them, and the interesting question is which interruption is survivable.

## Decision

**Split the two halves by what each one can answer — and make one module own the seam.**

1. **Paths are resolved, never discovered.** `src/desktop/data-paths.ts` derives
   `<app-data>/data/<environment>/{master-trade.db,files}` as a pure function of platform,
   environment and environment variables. Nothing probes for a writable location, nothing reads
   `process.cwd()`, and the three environments are disjoint subtrees rather than three files in one
   directory. The desktop never opens the repository-relative default.
2. **Initialization returns a state, not an exception.** `tryInitializeDesktopStorage()` classifies an
   expected failure into `paths` / `database` / `migrations` and returns it, because a corrupted
   migration ledger is something the shell must _render_, not something it should catch and log. The
   migration policy itself is unchanged: forward-only, checksummed, and a **refusal** rather than a
   silent reset.
3. **Bytes are content-addressed and ownerless.** `DiskBlobStore` (`src/storage/disk.ts`) stores
   content at `files/<aa>/<sha256>`, deduplicates identical content, and takes **no path from any
   caller** — its only accepted key is 64 hex characters. `assertContainedPath` is the second line for
   any future caller that passes a relative name.
4. **Metadata carries attribution, and no path.** Ownership, category, MIME type, size, hash,
   sensitivity and `created_at` live in the `files` table. The table stores no filesystem location, so
   moving the storage root is not a migration.
5. **One module owns the seam.** `ManagedFileStore` (`src/desktop/file-store.ts`) is the only code
   that writes both halves, which is what makes the partial-write rules enforceable rather than
   documented: content first, row second; compensate for content **this call introduced** only;
   metadata deleted before content; integrity scans that report and do not delete.

## Alternatives rejected and why

**Store a path in the `files` table.** Then the row and the blob can disagree about where the blob is,
every move is a data migration, and a path from the database becomes a path a reader will eventually
join onto a root. Rejected: the hash is already the addressing scheme the schema describes.

**Keep the existing `FileStorage` interface and give it the owner-scoped `list()`.** `FileStorage.list(ownerId)`
asks the byte layer a question it cannot answer without keeping its own owner index — a second copy of
`files.owner_id` that can drift from the first. Rejected: a narrow `BlobStore` port is a smaller
abstraction than a duplicated ownership index, and the metadata question is answered where the data is.

**Write metadata first, then content.** Then a crash between them leaves a row pointing at nothing — a
failure every reader hits. The other order leaves an orphan blob, which no reader can see and a scan
can reclaim. Rejected as the strictly worse ordering.

**Compensate for every failed write by deleting the content.** Content is shared between owners by
deduplication, so deleting unconditionally removes another owner's file. The compensation is
conditional: only content this call introduced is removed, and it checks `has()` before writing.
Rejected as a silent data-loss bug.

**Resolve the desktop file through a new `AppConfig` section.** The config object is the server's, is
logged and exported, and would then carry an OS-specific absolute path in a place documented as
safe to commit. Rejected: the shell's own paths belong to the shell, resolved where they are used.

**Give the frontend a file API.** Phase 6.1's boundary already refuses it: `@shared/*` is exact-match,
so no UI module can reach `src/`. Rejected as a boundary violation, and unnecessary — a browser has no
desktop filesystem to address.

## Consequences

- **The desktop data location is testable without a shell.** Paths are pure; initialization is
  exercised against real files under a temporary directory; the tampered-ledger refusal is a real
  ledger, tampered.
- **A corrupted database is a screen, not a crash.** `paths` / `database` / `migrations` are distinct
  because the remedy differs, and `failure.reason` is curated so a driver message carrying an absolute
  path cannot reach a window.
- **Two questions have one answer each.** "What is this file made of" is a hash; "whose is it" is a row.
  Neither layer can answer the other's question, so neither can be tempted to.
- **Cross-owner probing is not possible.** A row belonging to another owner returns the same `null` as
  a row that does not exist.
- **Encryption at rest is still absent**, and sensitive-file storage is still refused by policy. This
  is a real gap for real user data and is recorded in `desktop-storage.md` §10 and left for Phase 6.4.
- **Quota enforcement, backup/restore and a migration of an existing `data/` database are partial or
  deferred**, listed explicitly rather than implied complete.
- **The `files` table gained no column**, so no migration was added and `SCHEMA` still declares 32
  tables; two read-only repository methods (`countFilesWithHash`, `allFiles`) reuse the declared
  `files_sha256_idx` rather than introducing a second query path.
