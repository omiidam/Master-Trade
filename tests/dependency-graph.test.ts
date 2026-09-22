/**
 * Dependency-graph invariants for the dev toolchain.
 *
 * Why this file exists
 * --------------------
 * `npm audit` once reported five advisories (3 moderate, 1 high, 1 critical) in this
 * repository. None was in production scope, and all five lived inside a **second,
 * nested major of Vite**: `vitest@2` requires `vite ^5`, the project pins `vite ^6`,
 * so npm kept a duplicate — and the nested `vite@5.4.21`, `vite-node` and
 * `esbuild@0.21.5` carried every finding. `5.4.21` is the final `5.4.x` release ever
 * published, so there was no patched Vite 5 to upgrade into; the duplicate could only
 * be **deleted**.
 *
 * The fix was a single line — moving `vitest` to a version that accepts `vite ^6` —
 * which let the graph dedupe onto the already-patched `vite@6.4.3`. That is a fragile
 * property to hold by memory: any future devDependency that wants an older Vite
 * quietly re-creates the duplicate, and with it the advisories, and the only thing
 * that would notice is someone remembering to re-audit.
 *
 * This file makes that regression a failing test instead.
 *
 * It is deliberately **offline and deterministic** — it reads the committed lockfile
 * and manifest, so it belongs in `npm run validate`. `npm audit` needs the registry;
 * `npm run audit:prod` covers that side in CI. This covers the shape of the graph,
 * which is what actually went wrong.
 *
 * The floors below are the *patched* versions recorded in `docs/dependency-audit.md`.
 * They are minimums, not pins: a future upgrade passes, a silent downgrade does not.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')) as {
  lockfileVersion?: number;
  packages?: Record<string, { version?: string } | undefined>;
};

const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  devDependencies?: Record<string, string>;
  overrides?: Record<string, string>;
  resolutions?: Record<string, string>;
};

const packages = lock.packages ?? {};
const NODE_MODULES = 'node_modules/';
const topLevel = (name: string): string => `${NODE_MODULES}${name}`;

/**
 * Every install path whose *final* package name is exactly `name`.
 *
 * A nested copy is the whole subject of this file, so the match is on the last
 * `node_modules/` segment: `@tailwindcss/vite` is not `vite`, and a second
 * `node_modules/vitest/node_modules/vite` is.
 */
function installPaths(name: string): string[] {
  return Object.keys(packages).filter((path) => {
    const at = path.lastIndexOf(NODE_MODULES);
    return at !== -1 && path.slice(at + NODE_MODULES.length) === name;
  });
}

const versionOf = (path: string): string => packages[path]?.version ?? '0.0.0';

/** Compare dotted versions, ignoring any prerelease or build suffix. */
function atLeast(version: string, floor: string): boolean {
  const parts = (value: string): number[] =>
    value
      .split(/[-+]/)[0]!
      .split('.')
      .map((segment) => Number.parseInt(segment, 10) || 0);
  const subject = parts(version);
  const reference = parts(floor);
  for (let i = 0; i < Math.max(subject.length, reference.length); i++) {
    const left = subject[i] ?? 0;
    const right = reference[i] ?? 0;
    if (left !== right) return left > right;
  }
  return true;
}

/** The lowest version a semver range can resolve to, for common range forms. */
const rangeFloor = (range: string): string => range.replace(/^[\s^~>=<]+/, '').trim();

describe('dependency graph — the dev toolchain stays deduped and patched', () => {
  it('installs exactly one Vite, with no second copy nested under another package', () => {
    // The single assertion this file exists for. A nested `vite` under `vitest` or
    // `vite-node` is how all five advisories existed, and it appears whenever a
    // dependency wants an older major than the one we declare.
    expect(installPaths('vite')).toEqual([topLevel('vite')]);
  });

  it('carries no vite-node, the module the advisory chain ran through', () => {
    // Absent by construction in vitest 4 rather than upgraded: its nested Vite had
    // no patched release to move to.
    expect(installPaths('vite-node')).toEqual([]);
  });

  it('installs one esbuild, at or above the patched floor', () => {
    expect(installPaths('esbuild')).toEqual([topLevel('esbuild')]);
    // GHSA-67mh-4wv8-2f99 — the dev-server response-read advisory, patched in 0.25.0.
    expect(atLeast(versionOf(topLevel('esbuild')), '0.25.0')).toBe(true);
  });

  it('keeps Vite at or above the release that closed the dev-server advisories', () => {
    // GHSA-4w7w-66w2-5vf9 / GHSA-v6wh-96g9-6wx3 / GHSA-fx2h-pf6j-xcff, patched in 6.4.3.
    expect(atLeast(versionOf(topLevel('vite')), '6.4.3')).toBe(true);
  });

  it('keeps vitest and its mocker at or above the minimum fully patched release', () => {
    // 4.1.11 is the minimum that clears @vitest/mocker (GHSA-82fw-gwwq-j7x9), which
    // is why a one-major bump to 3.x was rejected — it would have left a finding open.
    expect(atLeast(versionOf(topLevel('vitest')), '4.1.11')).toBe(true);
    for (const path of installPaths('@vitest/mocker')) {
      expect(atLeast(versionOf(path), '4.1.11'), `${path} is below the patched floor`).toBe(true);
    }
  });

  it('resolves the toolchain from declared ranges, not from forced overrides', () => {
    // An `overrides` pin was one of the rejected options: it can force a version into
    // the tree while leaving the vulnerable package installed and still audited.
    // Deleting the duplicate is the fix; pinning it only hides it.
    const forced = { ...(manifest.overrides ?? {}), ...(manifest.resolutions ?? {}) };
    for (const name of ['vite', 'esbuild', 'vitest', 'vite-node', '@vitest/mocker']) {
      expect(Object.keys(forced), `${name} must not be forced by an override`).not.toContain(name);
    }
  });

  it('declares the patched floor in the manifest, not only in the lockfile', () => {
    // The lockfile is what installs today; the manifest is what the next install
    // re-resolves from. A declared range whose minimum sits below the floor would let
    // the duplicate back in on a fresh resolution.
    const declared = manifest.devDependencies?.vitest ?? '';
    expect(declared, 'vitest is not declared as a devDependency').not.toBe('');
    expect(atLeast(rangeFloor(declared), '4.1.11')).toBe(true);
  });

  it('is a lockfile this check can actually read', () => {
    // If this ever fails, every assertion above is vacuous — so it is asserted rather
    // than assumed.
    expect(lock.lockfileVersion).toBe(3);
    expect(Object.keys(packages).length).toBeGreaterThan(100);
  });
});
