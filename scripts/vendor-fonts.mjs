#!/usr/bin/env node
/**
 * Font vendoring — the Persian typeface, copied out of a declared dependency.
 *
 * Why a script instead of a hand-copy: the file that ships is a **third-party binary**, and the
 * only thing that makes it reviewable is the record of exactly which upstream release it came
 * from and what its bytes are. So this writes the artifact *and* the provenance beside it, and
 * `tests/persian-language.test.ts` re-hashes the shipped file against that record. A font that
 * silently changed — a different version, a corrupted download, a hand-edited subset — fails the
 * suite rather than shipping.
 *
 * Why a dependency at all (Phase 7.5.1): `vazirmatn` is the OFL release of the typeface, it
 * declares no dependencies, and it is the same upstream the design record cites
 * (`docs/persian-language.md`). The alternative — a committed binary with a version string in a
 * comment — is a claim nobody can check.
 *
 * Why the *variable* font rather than the nine static weights: one 111 KB woff2 covers weights
 * 100–900, so the Persian face costs one file and one `@font-face` rule instead of nine. The full
 * package is ~20 MB (TTF, static webfonts, other scripts); only these two files are vendored.
 *
 * Usage:
 *   npm run fonts:vendor           # copy the font and the license, write the provenance record
 *   node scripts/vendor-fonts.mjs --check   # re-hash what is already vendored, write nothing
 */

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE = 'vazirmatn';
const PACKAGE_DIR = join(root, 'node_modules', PACKAGE);
const DESTINATION = join(root, 'web', 'public', 'fonts');

/**
 * The upstream file names, and what the product calls them once vendored.
 *
 * The variable font is renamed because `[wght]` is an OpenType axis in a *filename*: it is legal
 * on disk and awkward in a URL, and a served path should not need percent-encoding to be written
 * down. The license keeps its own name, because a licence is quoted by name.
 */
const FILES = [
  { from: 'fonts/webfonts/Vazirmatn[wght].woff2', to: 'Vazirmatn-Variable.woff2' },
  { from: 'OFL.txt', to: 'Vazirmatn-OFL.txt' },
];

const PROVENANCE = join(DESTINATION, 'vazirmatn.json');
const check = process.argv.includes('--check');

if (!existsSync(PACKAGE_DIR)) {
  throw new Error(
    `${PACKAGE} is not installed. Run \`npm install\` first — the font is vendored from the declared dependency.`,
  );
}

const manifest = JSON.parse(readFileSync(join(PACKAGE_DIR, 'package.json'), 'utf8'));

/** The SHA-256 of a vendored file, as lowercase hex. */
function digest(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

if (!check) mkdirSync(DESTINATION, { recursive: true });

const files = [];
for (const entry of FILES) {
  const source = join(PACKAGE_DIR, entry.from);
  const target = join(DESTINATION, entry.to);
  if (!check) copyFileSync(source, target);
  if (!existsSync(target)) throw new Error(`${target} is not vendored; run without --check first`);
  files.push({ name: entry.to, bytes: readFileSync(target).byteLength, sha256: digest(target) });
}

/**
 * The record. Everything a reviewer needs to answer "which font is this, and may we ship it":
 * the upstream release, the licence, the file it was taken from, and the bytes on disk.
 */
const record = {
  family: 'Vazirmatn',
  version: manifest.version,
  upstream: 'https://github.com/rastikerdar/vazirmatn',
  license: 'OFL-1.1',
  licenseFile: 'Vazirmatn-OFL.txt',
  source: `npm:${PACKAGE}@${manifest.version}`,
  files,
};

if (check) {
  const declared = JSON.parse(readFileSync(PROVENANCE, 'utf8'));
  if (JSON.stringify(declared) !== JSON.stringify(record)) {
    throw new Error('the vendored font does not match its recorded provenance');
  }
  console.log(`fonts: vendor check passed (${files.map((file) => file.name).join(', ')})`);
} else {
  // Two-space JSON with a trailing newline: `prettier --check .` reads this file too, and a
  // generated artefact that fails the formatting gate is a generated artefact nobody committed.
  writeFileSync(PROVENANCE, `${JSON.stringify(record, null, 2)}\n`);
  for (const file of files) {
    console.log(`fonts: vendored ${file.name} (${(file.bytes / 1024).toFixed(1)} KB)`);
  }
  console.log(`fonts: recorded ${PROVENANCE}`);
}
